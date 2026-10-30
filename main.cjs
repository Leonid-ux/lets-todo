const { app, BrowserWindow, globalShortcut, ipcMain, shell, Notification, screen, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { SyncService } = require('./sync-service.cjs');
let quickAddWindow = null;
let mainWindow = null;
let syncService = null;
const syncReplies = new Map();
const appIcon = path.join(__dirname, 'assets', 'app-icon.png');

const updateState = { status: 'idle', info: null, error: null, progress: 0 };
const releaseNotesText = notes => Array.isArray(notes)
  ? notes.map(note => typeof note === 'string' ? note : note.note || '').filter(Boolean).join('\n\n')
  : String(notes || 'Описание изменений не добавлено.');
const publicUpdateState = () => ({
  ...updateState,
  info: updateState.info && { version: updateState.info.version, releaseNotes: releaseNotesText(updateState.info.releaseNotes), releaseName: updateState.info.releaseName || '' },
});
const broadcastUpdateState = () => mainWindow?.webContents.send('update-state-changed', publicUpdateState());

function configureUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => { updateState.status = 'checking'; updateState.error = null; broadcastUpdateState(); });
  autoUpdater.on('update-available', info => { updateState.status = 'available'; updateState.info = info; updateState.error = null; broadcastUpdateState(); });
  autoUpdater.on('update-not-available', () => { updateState.status = 'up-to-date'; updateState.info = null; updateState.error = null; broadcastUpdateState(); });
  autoUpdater.on('download-progress', progress => { updateState.status = 'downloading'; updateState.progress = Math.round(progress.percent || 0); broadcastUpdateState(); });
  autoUpdater.on('update-downloaded', info => { updateState.status = 'downloaded'; updateState.info = info; updateState.progress = 100; broadcastUpdateState(); });
  autoUpdater.on('error', error => { updateState.status = 'error'; updateState.error = error.message || 'Не удалось проверить обновления'; broadcastUpdateState(); });
}

async function checkForUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') {
    return { status: 'unavailable', reason: 'Проверка обновлений доступна в установленной Windows-версии приложения.' };
  }
  updateState.status = 'checking'; updateState.error = null; broadcastUpdateState();
  try {
    const result = await autoUpdater.checkForUpdates();
    return result?.updateInfo ? publicUpdateState() : { status: 'up-to-date' };
  } catch (error) {
    updateState.status = 'error'; updateState.error = error.message || 'Не удалось проверить обновления'; broadcastUpdateState();
    return publicUpdateState();
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#111315',
    title: 'Lets Todo',
    icon: appIcon,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.loadFile(path.join(__dirname, 'src', 'index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showQuickAddWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const quickWidth = Math.min(820, workArea.width - 32);
  const quickHeight = Math.min(480, workArea.height - 40);
  const quickX = Math.round(workArea.x + (workArea.width - quickWidth) / 2);
  const quickY = Math.max(workArea.y + 20, workArea.y + workArea.height - quickHeight - 260);
  if (!quickAddWindow || quickAddWindow.isDestroyed()) {
    quickAddWindow = new BrowserWindow({
      x: quickX,
      y: quickY,
      width: quickWidth,
      height: quickHeight,
      minWidth: 620,
      minHeight: 420,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      transparent: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      icon: appIcon,
      show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
    });
    quickAddWindow.loadFile(path.join(__dirname, 'src', 'index.html'), { hash: 'quick-add' });
    quickAddWindow.once('ready-to-show', () => { quickAddWindow.show(); quickAddWindow.focus(); });
    quickAddWindow.on('closed', () => { quickAddWindow = null; });
    quickAddWindow.on('blur', () => { if (quickAddWindow && !quickAddWindow.isDestroyed()) quickAddWindow.hide(); });
    return;
  }
  quickAddWindow.setBounds({ x: quickX, y: quickY, width: quickWidth, height: quickHeight });
  quickAddWindow.show();
  quickAddWindow.focus();
  quickAddWindow.webContents.send('quick-add-open');
}

app.whenReady().then(() => {
  configureUpdater();
  createWindow();
  syncService = new SyncService({
    userDataPath: app.getPath('userData'),
    deviceName: os.hostname(),
    protectSecret: value => safeStorage.encryptString(String(value)).toString('base64'),
    unprotectSecret: value => safeStorage.decryptString(Buffer.from(String(value), 'base64')),
    onStateChanged: state => mainWindow?.webContents.send('sync-state-changed', state),
    onPairingRequest: request => mainWindow?.webContents.send('sync-pairing-request', request),
    onSyncMessage: (deviceId, message, reply) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => { syncReplies.delete(requestId); reply({ type: 'sync.result', ok: false, error: 'Приложение не ответило на запрос синхронизации' }); }, 15000);
      syncReplies.set(requestId, response => { clearTimeout(timeout); reply(response); });
      mainWindow?.webContents.send('sync-message', { requestId, deviceId, message });
    },
  });
  syncService.start().catch(error => {
    console.error('Device sync is unavailable:', error);
    mainWindow?.webContents.send('sync-state-changed', { available: false, error: 'Не удалось запустить локальную синхронизацию', devices: [], pending: [] });
  });
  globalShortcut.register('Control+Alt+Space', () => {
    showQuickAddWindow();
  });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
ipcMain.handle('window-minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window-toggle-maximize', event => { const window = BrowserWindow.fromWebContents(event.sender); if (!window) return false; if (window.isMaximized()) window.unmaximize(); else window.maximize(); return window.isMaximized(); });
ipcMain.handle('window-close', event => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.on('quick-add-close', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window === quickAddWindow) { quickAddWindow.hide(); return; }
});
ipcMain.handle('open-external', (_event, url) => /^https?:\/\//i.test(String(url)) ? shell.openExternal(url) : false);
ipcMain.handle('show-notification', (_event, payload) => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: String(payload?.title || 'Lets Todo'), body: String(payload?.body || ''), icon: appIcon }).show();
  return true;
});
ipcMain.handle('get-app-info', () => ({ version: app.getVersion(), isPackaged: app.isPackaged, platform: process.platform }));
ipcMain.handle('update-get-state', () => publicUpdateState());
ipcMain.handle('update-check', () => checkForUpdates());
ipcMain.handle('update-download', async () => {
  if (!app.isPackaged || process.platform !== 'win32') return { status: 'unavailable' };
  try { await autoUpdater.downloadUpdate(); return publicUpdateState(); }
  catch (error) { updateState.status = 'error'; updateState.error = error.message || 'Не удалось скачать обновление'; broadcastUpdateState(); return publicUpdateState(); }
});
ipcMain.handle('update-install', () => {
  if (updateState.status !== 'downloaded') return false;
  setImmediate(() => autoUpdater.quitAndInstall());
  return true;
});
ipcMain.handle('sync-get-state', () => syncService?.publicState() || { available: false, devices: [], pending: [] });
ipcMain.handle('sync-create-offer', () => syncService?.createOffer());
ipcMain.handle('sync-cancel-offer', () => syncService?.cancelOffer());
ipcMain.handle('sync-confirm-pairing', (_event, requestId, accepted) => syncService?.confirmPairing(String(requestId), Boolean(accepted)) || false);
ipcMain.handle('sync-unpair-device', (_event, deviceId) => syncService?.unpair(String(deviceId)) || false);
ipcMain.handle('sync-message-response', (_event, requestId, response) => {
  const complete = syncReplies.get(String(requestId)); if (!complete) return false;
  syncReplies.delete(String(requestId)); complete(response); return true;
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); syncService?.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
