const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const { PROTOCOL_VERSION, isSyncMessage } = require('./sync-protocol.cjs');

const DISCOVERY_PORT = 45454;
const DEFAULT_PORT = 45455;
const OFFER_TTL_MS = 5 * 60 * 1000;
const REQUEST_TTL_MS = 2 * 60 * 1000;
const MAX_FRAME_BYTES = 1024 * 1024;

const base64url = value => Buffer.from(value).toString('base64url');
const fromBase64url = value => Buffer.from(String(value), 'base64url');
const sha256 = value => crypto.createHash('sha256').update(value).digest();
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function localAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
}

function encryptedFrame(key, payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { type: 'secure', iv: base64url(iv), data: base64url(ciphertext), tag: base64url(cipher.getAuthTag()) };
}

function decryptFrame(key, frame) {
  const iv = fromBase64url(frame.iv); const tag = fromBase64url(frame.tag); const data = fromBase64url(frame.data);
  if (iv.length !== 12 || tag.length !== 16 || data.length > MAX_FRAME_BYTES) throw new Error('Некорректный защищённый пакет');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

class SyncService {
  constructor({ userDataPath, deviceName, protectSecret, unprotectSecret, onStateChanged, onPairingRequest, onSyncMessage }) {
    this.deviceName = deviceName;
    this.onStateChanged = onStateChanged;
    this.onPairingRequest = onPairingRequest;
    this.onSyncMessage = onSyncMessage;
    this.protectSecret = protectSecret;
    this.unprotectSecret = unprotectSecret;
    this.statePath = path.join(userDataPath, 'device-sync.json');
    this.state = this.readState();
    this.ensureIdentity();
    this.offer = null;
    this.pending = new Map();
    this.connections = new Map();
    this.server = null;
    this.discovery = null;
    this.port = DEFAULT_PORT;
    this.available = false;
  }

  readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const serverPrivateKey = parsed.serverPrivateKeyProtected ? this.unprotectSecret?.(parsed.serverPrivateKeyProtected) : parsed.serverPrivateKey;
      return { deviceId: parsed.deviceId || crypto.randomUUID(), serverPrivateKey, serverPublicKey: parsed.serverPublicKey, devices: Array.isArray(parsed.devices) ? parsed.devices : [] };
    } catch (_) { return { deviceId: crypto.randomUUID(), devices: [] }; }
  }

  ensureIdentity() {
    if (this.state.serverPrivateKey && this.state.serverPublicKey) return;
    const keys = crypto.generateKeyPairSync('x25519');
    this.state.serverPrivateKey = base64url(keys.privateKey.export({ type: 'pkcs8', format: 'der' }));
    this.state.serverPublicKey = base64url(keys.publicKey.export({ type: 'spki', format: 'der' }));
  }

  writeState() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const devices = this.state.devices.map(({ sessionKey, socket, ...device }) => ({ ...device, status: 'offline' }));
    fs.writeFileSync(this.statePath, JSON.stringify({ deviceId: this.state.deviceId, serverPrivateKeyProtected: this.protectSecret?.(this.state.serverPrivateKey), serverPublicKey: this.state.serverPublicKey, devices }, null, 2), { mode: 0o600 });
  }

  async start() {
    await this.startTcp();
    this.startDiscovery();
    this.writeState();
    this.available = true;
    this.emitState();
  }

  startTcp() {
    return new Promise((resolve, reject) => {
      const listen = port => {
        this.server = net.createServer(socket => this.acceptSocket(socket));
        const onError = error => {
          if (error.code === 'EADDRINUSE' && port === DEFAULT_PORT) {
            this.server.removeAllListeners();
            listen(0);
            return;
          }
          reject(error);
        };
        this.server.once('error', onError);
        this.server.listen(port, '0.0.0.0', () => {
          this.server.off('error', onError);
          this.server.on('error', () => this.emitState());
          this.port = this.server.address().port;
          resolve();
        });
      };
      listen(DEFAULT_PORT);
    });
  }

  startDiscovery() {
    this.discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.discovery.on('message', (message, remote) => {
      let request; try { request = JSON.parse(message.toString('utf8')); } catch (_) { return; }
      if (request?.type !== 'lets-todo.discover' || request?.version !== PROTOCOL_VERSION) return;
      const activeOffer = this.offer && this.offer.expiresAt > Date.now() ? this.offer : null;
      const response = Buffer.from(JSON.stringify({ type: 'lets-todo.service', version: PROTOCOL_VERSION, deviceId: this.state.deviceId, name: this.deviceName, port: this.port, pairingAvailable: Boolean(activeOffer), offerId: activeOffer?.id, publicKey: activeOffer?.publicKey, expiresAt: activeOffer?.expiresAt }));
      this.discovery.send(response, remote.port, remote.address);
    });
    this.discovery.on('error', () => {});
    this.discovery.bind(DISCOVERY_PORT);
  }

  async createOffer() {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const offer = { id: crypto.randomUUID(), code, expiresAt: Date.now() + OFFER_TTL_MS, attempts: 0, privateKey: crypto.createPrivateKey({ key: fromBase64url(this.state.serverPrivateKey), type: 'pkcs8', format: 'der' }), publicKey: this.state.serverPublicKey };
    const payload = { v: PROTOCOL_VERSION, offerId: offer.id, code, addresses: localAddresses(), port: this.port, publicKey: offer.publicKey, expiresAt: offer.expiresAt, deviceId: this.state.deviceId, name: this.deviceName };
    offer.qrPayload = `lets-todo://pair?data=${base64url(JSON.stringify(payload))}`;
    offer.qrDataUrl = await QRCode.toDataURL(offer.qrPayload, { width: 260, margin: 2, color: { dark: '#111315', light: '#ffffff' }, errorCorrectionLevel: 'M' });
    this.offer = offer;
    setTimeout(() => { if (this.offer?.id === offer.id && this.offer.expiresAt <= Date.now()) { this.offer = null; this.emitState(); } }, OFFER_TTL_MS + 100);
    this.emitState();
    return this.publicState();
  }

  cancelOffer() { this.offer = null; this.emitState(); }

  publicState() {
    const offer = this.offer && this.offer.expiresAt > Date.now() ? { id: this.offer.id, code: this.offer.code, expiresAt: this.offer.expiresAt, qrDataUrl: this.offer.qrDataUrl, addresses: localAddresses(), port: this.port } : null;
    return { available: this.available, deviceId: this.state.deviceId, deviceName: this.deviceName, addresses: localAddresses(), port: this.port, discoveryPort: DISCOVERY_PORT, offer, devices: this.state.devices.map(device => ({ id: device.id, name: device.name, platform: device.platform, pairedAt: device.pairedAt, lastSeen: device.lastSeen, status: this.connections.has(device.id) ? 'online' : 'offline' })), pending: [...this.pending.values()].map(item => ({ requestId: item.requestId, device: item.device, verificationCode: item.verificationCode, expiresAt: item.expiresAt })) };
  }

  emitState() { this.onStateChanged?.(this.publicState()); }

  acceptSocket(socket) {
    socket.setTimeout(REQUEST_TTL_MS);
    socket.setNoDelay(true);
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) return socket.destroy();
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message; try { message = JSON.parse(line); } catch (_) { return socket.destroy(); }
        this.handleMessage(socket, message);
      }
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => {});
    socket.on('close', () => this.handleClose(socket));
  }

  send(socket, message) { if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`); }

  handleMessage(socket, message) {
    if (!socket.syncSession) return this.handlePairRequest(socket, message);
    if (message?.type !== 'secure') return socket.destroy();
    if (socket.syncSession.seenIvs.has(message.iv)) return socket.destroy();
    socket.syncSession.seenIvs.add(message.iv);
    if (socket.syncSession.seenIvs.size > 1000) socket.syncSession.seenIvs.delete(socket.syncSession.seenIvs.values().next().value);
    let payload; try { payload = decryptFrame(socket.syncSession.key, message); } catch (_) { return socket.destroy(); }
    if (!isSyncMessage(payload)) return;
    this.onSyncMessage?.(socket.syncSession.deviceId, payload, response => this.send(socket, encryptedFrame(socket.syncSession.key, response)));
  }

  handlePairRequest(socket, message) {
    if (message?.type === 'session.hello') return this.handleSessionHello(socket, message);
    if (message?.type === 'session.authenticate') return this.handleSessionAuthentication(socket, message);
    const offer = this.offer;
    if (message?.type !== 'pair.request' || message?.version !== PROTOCOL_VERSION || !offer || offer.expiresAt <= Date.now() || message.offerId !== offer.id) return this.rejectSocket(socket, 'Предложение подключения недействительно');
    offer.attempts += 1;
    if (offer.attempts > 8 || !safeEqual(message.code, offer.code)) return this.rejectSocket(socket, 'Неверный или истёкший код');
    const device = { id: String(message.device?.id || ''), name: String(message.device?.name || 'Android-устройство').slice(0, 80), platform: String(message.device?.platform || 'Android').slice(0, 40) };
    if (!device.id || device.id.length > 128) return this.rejectSocket(socket, 'Некорректные данные устройства');
    let clientKey; try { clientKey = crypto.createPublicKey({ key: fromBase64url(message.publicKey), type: 'spki', format: 'der' }); } catch (_) { return this.rejectSocket(socket, 'Некорректный ключ устройства'); }
    let secret; try { secret = crypto.diffieHellman({ privateKey: offer.privateKey, publicKey: clientKey }); } catch (_) { return this.rejectSocket(socket, 'Не удалось согласовать ключ'); }
    const transcript = JSON.stringify({ version: PROTOCOL_VERSION, offerId: offer.id, server: this.state.deviceId, client: device.id, serverPublicKey: offer.publicKey, clientPublicKey: message.publicKey });
    const salt = sha256(`lets-todo/pair/${offer.id}/${offer.code}`);
    const key = Buffer.from(crypto.hkdfSync('sha256', secret, salt, Buffer.from('lets-todo/session/v1'), 32));
    const verificationCode = String(hmac(key, `verify:${transcript}`).readUInt32BE(0) % 1000000).padStart(6, '0');
    const requestId = crypto.randomUUID();
    const pending = { requestId, socket, device, key, clientPublicKey: message.publicKey, verificationCode, expiresAt: Date.now() + REQUEST_TTL_MS };
    this.pending.set(requestId, pending);
    this.send(socket, { type: 'pair.challenge', version: PROTOCOL_VERSION, serverPublicKey: offer.publicKey, proof: base64url(hmac(key, `server:${transcript}`)) });
    this.onPairingRequest?.({ requestId, device, verificationCode, expiresAt: pending.expiresAt });
    this.emitState();
  }

  handleSessionHello(socket, message) {
    const device = this.state.devices.find(item => item.id === String(message.deviceId));
    let clientNonce;
    try { clientNonce = fromBase64url(message.clientNonce); } catch (_) { return this.rejectSocket(socket, 'Некорректный запрос сессии'); }
    if (!device || clientNonce.length !== 32) return this.rejectSocket(socket, 'Устройство не сопряжено');
    const serverNonce = crypto.randomBytes(32);
    socket.syncHandshake = { device, clientNonce, serverNonce, expiresAt: Date.now() + 30000 };
    this.send(socket, { type: 'session.challenge', version: PROTOCOL_VERSION, serverNonce: base64url(serverNonce), serverPublicKey: this.state.serverPublicKey });
  }

  handleSessionAuthentication(socket, message) {
    const handshake = socket.syncHandshake;
    if (!handshake || handshake.expiresAt <= Date.now() || message.deviceId !== handshake.device.id || message.clientNonce !== base64url(handshake.clientNonce) || message.serverNonce !== base64url(handshake.serverNonce)) return this.rejectSocket(socket, 'Проверка сессии не пройдена');
    let clientKey; let privateKey;
    try {
      clientKey = crypto.createPublicKey({ key: fromBase64url(handshake.device.publicKey), type: 'spki', format: 'der' });
      privateKey = crypto.createPrivateKey({ key: fromBase64url(this.state.serverPrivateKey), type: 'pkcs8', format: 'der' });
    } catch (_) { return this.rejectSocket(socket, 'Ключ устройства повреждён'); }
    const secret = crypto.diffieHellman({ privateKey, publicKey: clientKey });
    const salt = sha256(Buffer.concat([handshake.clientNonce, handshake.serverNonce]));
    const key = Buffer.from(crypto.hkdfSync('sha256', secret, salt, Buffer.from('lets-todo/session/v1'), 32));
    const transcript = `session:${handshake.device.id}:${message.clientNonce}:${message.serverNonce}`;
    const expected = base64url(hmac(key, transcript));
    if (!safeEqual(message.proof, expected)) return this.rejectSocket(socket, 'Проверка подлинности устройства не пройдена');
    delete socket.syncHandshake;
    socket.syncSession = { deviceId: handshake.device.id, key, seenIvs: new Set() };
    socket.setTimeout(0);
    this.connections.get(handshake.device.id)?.destroy();
    this.connections.set(handshake.device.id, socket);
    handshake.device.lastSeen = Date.now();
    this.writeState();
    this.send(socket, encryptedFrame(key, { type: 'session.accepted', version: PROTOCOL_VERSION, deviceId: this.state.deviceId }));
    this.emitState();
  }

  confirmPairing(requestId, accepted) {
    const pending = this.pending.get(requestId);
    if (!pending || pending.expiresAt <= Date.now() || pending.socket.destroyed) return false;
    this.pending.delete(requestId);
    if (!accepted) { this.rejectSocket(pending.socket, 'Подключение отклонено'); this.emitState(); return true; }
    const now = Date.now();
    const existing = this.state.devices.find(item => item.id === pending.device.id);
    const record = { ...pending.device, publicKey: pending.clientPublicKey, pairedAt: existing?.pairedAt || now, lastSeen: now, status: 'offline' };
    this.state.devices = [...this.state.devices.filter(item => item.id !== record.id), record];
    pending.socket.syncSession = { deviceId: record.id, key: pending.key, seenIvs: new Set() };
    pending.socket.setTimeout(0);
    this.connections.get(record.id)?.destroy();
    this.connections.set(record.id, pending.socket);
    this.offer = null;
    this.writeState();
    this.send(pending.socket, encryptedFrame(pending.key, { type: 'pair.accepted', version: PROTOCOL_VERSION, deviceId: this.state.deviceId }));
    this.emitState();
    return true;
  }

  rejectSocket(socket, reason) { this.send(socket, { type: 'error', message: reason }); socket.end(); }

  handleClose(socket) {
    for (const [requestId, pending] of this.pending) if (pending.socket === socket) this.pending.delete(requestId);
    const deviceId = socket.syncSession?.deviceId;
    if (deviceId && this.connections.get(deviceId) === socket) {
      this.connections.delete(deviceId);
      const device = this.state.devices.find(item => item.id === deviceId); if (device) device.lastSeen = Date.now();
      this.writeState();
    }
    this.emitState();
  }

  unpair(deviceId) {
    const socket = this.connections.get(deviceId); if (socket) socket.destroy();
    const before = this.state.devices.length;
    this.state.devices = this.state.devices.filter(item => item.id !== deviceId);
    if (this.state.devices.length !== before) { this.writeState(); this.emitState(); return true; }
    return false;
  }

  stop() {
    this.available = false;
    for (const socket of this.connections.values()) socket.destroy();
    for (const pending of this.pending.values()) pending.socket.destroy();
    this.discovery?.close(); this.server?.close();
  }
}

module.exports = { SyncService };
