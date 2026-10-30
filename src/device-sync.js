(() => {
  const api = window.letsTodo?.sync;
  const keys = {
    tasks: 'lets-todo.tasks.v1', habits: 'lets-todo.habits.v1', events: 'lets-todo.events.v1',
    timers: 'lets-todo.timers.v1', habitHistory: 'lets-todo.habit-history.v1', timerSessions: 'lets-todo.timer-sessions.v1', profile: 'lets-todo.profile.v1',
  };
  const metaKey = 'lets-todo.sync-meta.v1';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const stable = value => JSON.stringify(value);
  const hash = async value => {
    const bytes = new TextEncoder().encode(stable(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  let deviceId = 'local';
  let captureTimer = null;
  let applying = false;
  const privateEntryIds = () => new Set(['habits', 'events', 'timers'].flatMap(name => read(keys[name], [])).filter(item => item?.private).map(item => String(item.id)));

  function collectionItems(name) {
    const value = read(keys[name], name === 'habitHistory' ? {} : []);
    const privateIds = privateEntryIds();
    if (name !== 'habitHistory') return Array.isArray(value) ? value.filter(item => !(item?.private || ((name === 'timerSessions') && privateIds.has(String(item?.timerId))))).map(item => ({ id: String(item.id), value: item })).filter(item => item.id && item.id !== 'undefined') : [];
    return Object.entries(value).filter(([habitId]) => !privateIds.has(String(habitId))).flatMap(([habitId, dates]) => Object.entries(dates || {}).map(([date, count]) => ({ id: `${habitId}|${date}`, value: { habitId, date, count } })));
  }

  async function captureSnapshot() {
    const meta = read(metaKey, { clock: 0, collections: {} });
    for (const name of Object.keys(keys)) {
      const previous = meta.collections[name] || {};
      const current = collectionItems(name); const present = new Set();
      for (const item of current) {
        present.add(item.id); const itemHash = await hash(item.value); const old = previous[item.id];
        if (!old || old.hash !== itemHash || old.deleted) previous[item.id] = { hash: itemHash, deleted: false, revision: { counter: ++meta.clock, deviceId }, modifiedAt: Date.now() };
        previous[item.id].value = item.value;
      }
      for (const [id, old] of Object.entries(previous)) if (!present.has(id) && !old.deleted) previous[id] = { deleted: true, revision: { counter: ++meta.clock, deviceId }, modifiedAt: Date.now() };
      meta.collections[name] = previous;
    }
    localStorage.setItem(metaKey, JSON.stringify(meta));
    return { version: 1, deviceId, generatedAt: Date.now(), collections: meta.collections };
  }

  function remoteWins(local, remote) {
    if (!local) return true;
    const lc = Number(local.revision?.counter || 0); const rc = Number(remote.revision?.counter || 0);
    if (rc !== lc) return rc > lc;
    if (Number(remote.modifiedAt || 0) !== Number(local.modifiedAt || 0)) return Number(remote.modifiedAt || 0) > Number(local.modifiedAt || 0);
    return String(remote.revision?.deviceId || '') > String(local.revision?.deviceId || '');
  }

  function writeCollection(name, records) {
    if (name === 'habitHistory') {
      const result = {};
      Object.values(records).filter(item => !item.deleted && item.value).forEach(item => { const { habitId, date, count } = item.value; (result[habitId] ||= {})[date] = count; });
      const privateIds = privateEntryIds(); const existing = read(keys[name], {}); Object.entries(existing).filter(([id]) => privateIds.has(String(id))).forEach(([id, dates]) => { result[id] = dates; });
      localStorage.setItem(keys[name], JSON.stringify(result)); return;
    }
    const result = Object.values(records).filter(item => !item.deleted && item.value).map(item => item.value);
    const privateIds = privateEntryIds(); const existing = read(keys[name], []);
    if (['habits', 'events', 'timers'].includes(name)) result.push(...existing.filter(item => item?.private));
    if (name === 'timerSessions') result.push(...existing.filter(item => privateIds.has(String(item?.timerId))));
    localStorage.setItem(keys[name], JSON.stringify(result));
  }

  async function mergeSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.collections) throw new Error('Неподдерживаемый формат синхронизации');
    const meta = read(metaKey, { clock: 0, collections: {} });
    applying = true;
    try {
      for (const name of Object.keys(keys)) {
        const local = meta.collections[name] || {}; const remote = snapshot.collections[name] || {};
        for (const [id, record] of Object.entries(remote)) {
          if (!record?.revision?.deviceId || !Number.isFinite(Number(record.revision.counter))) continue;
          if (remoteWins(local[id], record)) local[id] = { ...record, hash: record.deleted ? undefined : await hash(record.value) };
          meta.clock = Math.max(meta.clock, Number(record.revision.counter || 0));
        }
        meta.collections[name] = local; writeCollection(name, local);
      }
      localStorage.setItem(metaKey, JSON.stringify(meta));
      for (const key of Object.values(keys)) window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }));
      window.dispatchEvent(new CustomEvent('lets-todo:data-changed'));
    } finally { applying = false; }
    return captureSnapshot();
  }

  function scheduleCapture() {
    if (applying) return; clearTimeout(captureTimer); captureTimer = setTimeout(() => captureSnapshot().catch(() => {}), 150);
  }

  window.addEventListener('lets-todo:data-changed', scheduleCapture);
  api?.onMessage(async ({ requestId, message }) => {
    try {
      if (message.type === 'sync.pull') return api.respond(requestId, { type: 'sync.result', ok: true, snapshot: await captureSnapshot() });
      if (message.type === 'sync.push') return api.respond(requestId, { type: 'sync.result', ok: true, snapshot: await mergeSnapshot(message.snapshot) });
      return api.respond(requestId, { type: 'sync.result', ok: false, error: 'Неизвестная команда синхронизации' });
    } catch (error) { api.respond(requestId, { type: 'sync.result', ok: false, error: error.message || 'Ошибка синхронизации' }); }
  });
  api?.getState().then(state => { deviceId = state?.deviceId || deviceId; scheduleCapture(); }).catch(() => {});
})();
