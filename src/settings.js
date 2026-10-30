(() => {
  const $ = id => document.getElementById(id);
  const api = window.letsTodo?.sync;
  let state = { available: false, devices: [], pending: [] };
  let countdown = null;
  let actionError = '';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const dateTime = value => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

  function render() {
    const available = Boolean(state.available);
    $('sync-service-status').textContent = actionError || (available ? `Доступен в локальной сети · порт ${state.port}` : (state.error || 'Локальный сервис недоступен'));
    $('sync-service-status').classList.toggle('is-error', !available || Boolean(actionError));
    $('sync-create-offer').disabled = !available || Boolean(state.offer);
    $('sync-offer').hidden = !state.offer;
    if (state.offer) {
      $('sync-qr').src = state.offer.qrDataUrl;
      $('sync-code').textContent = `${state.offer.code.slice(0, 3)} ${state.offer.code.slice(3)}`;
      $('sync-network-address').textContent = state.offer.addresses?.length ? `${state.offer.addresses.join(', ')}:${state.offer.port}` : `Порт ${state.offer.port}`;
      updateCountdown(); clearInterval(countdown); countdown = setInterval(updateCountdown, 1000);
    } else { clearInterval(countdown); countdown = null; $('sync-qr').removeAttribute('src'); }
    const devices = state.devices || [];
    $('sync-device-list').innerHTML = devices.length ? devices.map(device => `<article class="sync-device"><span class="sync-device-icon">▣</span><div><strong>${escape(device.name)}</strong><small>${escape(device.platform)} · ${device.status === 'online' ? 'В сети' : `Не в сети · ${escape(dateTime(device.lastSeen || device.pairedAt))}`}</small></div><span class="sync-status-dot ${device.status === 'online' ? 'online' : ''}" title="${device.status === 'online' ? 'В сети' : 'Не в сети'}"></span><button class="ui-button ui-button--secondary" type="button" data-unpair="${escape(device.id)}">Отвязать</button></article>`).join('') : '<div class="settings-empty">Подключённых устройств пока нет.</div>';
    const pending = state.pending?.[0];
    if (pending) showPairingRequest(pending);
  }

  function updateCountdown() {
    if (!state.offer) return;
    const seconds = Math.max(0, Math.ceil((state.offer.expiresAt - Date.now()) / 1000));
    $('sync-offer-expiry').textContent = seconds ? `Код действует ещё ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Срок действия кода истёк';
    if (!seconds) refresh();
  }

  function showPairingRequest(request) {
    $('pair-device-name').textContent = request.device.name;
    $('pair-verification-code').textContent = `${request.verificationCode.slice(0, 3)} ${request.verificationCode.slice(3)}`;
    const dialog = $('pair-request-dialog');
    if (!dialog.open) dialog.showModal();
    dialog.dataset.requestId = request.requestId;
  }

  async function refresh() { if (!api) return render(); try { state = await api.getState(); render(); } catch (_) { state = { available: false, devices: [], pending: [] }; render(); } }
  $('sync-create-offer').addEventListener('click', async () => {
    actionError = ''; $('sync-create-offer').disabled = true;
    try { state = await api.createOffer(); render(); }
    catch (error) { await refresh(); actionError = error?.message || 'Не удалось создать код подключения'; render(); }
  });
  $('sync-cancel-offer').addEventListener('click', async () => { await api.cancelOffer(); refresh(); });
  $('sync-device-list').addEventListener('click', async event => { const id = event.target.closest('[data-unpair]')?.dataset.unpair; if (!id || !confirm('Отвязать это устройство? Для повторной синхронизации потребуется новое сопряжение.')) return; await api.unpairDevice(id); refresh(); });
  $('pair-reject').addEventListener('click', async () => { const dialog = $('pair-request-dialog'); await api.confirmPairing(dialog.dataset.requestId, false); dialog.close(); refresh(); });
  $('pair-accept').addEventListener('click', async () => { const dialog = $('pair-request-dialog'); await api.confirmPairing(dialog.dataset.requestId, true); dialog.close(); refresh(); });
  api?.onStateChanged(next => { state = next; render(); });
  api?.onPairingRequest(showPairingRequest);
  const updater = window.letsTodo?.updater;
  const updateDialog = $('update-dialog');
  let updateState = { status: 'idle' };
  const updateMessages = {
    idle: '', checking: 'Ищем новую версию…', 'up-to-date': 'У вас установлена последняя версия.',
    downloading: 'Скачиваем обновление…', downloaded: 'Обновление готово к установке.',
    unavailable: 'Проверка обновлений доступна в установленной Windows-версии приложения.',
  };
  function readableReleaseNotes(value) {
    const source = String(value || '').trim();
    if (!source) return 'Описание изменений не добавлено.';
    if (!/<[a-z][\s\S]*>/i.test(source)) return source;
    const withBreaks = source.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<li[^>]*>/gi, '• ');
    const document = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (document.body.textContent || '').replace(/\n\s*\n\s*\n/g, '\n\n').trim() || 'Описание изменений не добавлено.';
  }
  function showUpdateDialog() {
    if (!updateState.info || updateDialog.open) return;
    $('update-dialog-title').textContent = `Версия ${updateState.info.version} готова`;
    $('update-dialog-summary').textContent = 'В этой версии появится:';
    $('update-release-notes').textContent = readableReleaseNotes(updateState.info.releaseNotes);
    if (updateState.status === 'downloaded') $('update-primary-action').textContent = 'Перезапустить и установить';
    else if (updateState.status === 'downloading') $('update-primary-action').textContent = `Скачивается: ${updateState.progress || 0}%`;
    else $('update-primary-action').textContent = 'Скачать обновление';
    $('update-primary-action').disabled = updateState.status === 'downloading';
    updateDialog.showModal();
  }
  function renderUpdate(next) {
    updateState = next || updateState;
    const status = $('update-status');
    const info = updateState.info;
    let message = updateState.error || updateState.reason || updateMessages[updateState.status] || '';
    if (updateState.status === 'available' && info) message = `Доступна версия ${info.version}. Посмотрите, что нового.`;
    if (updateState.status === 'downloading') message = `Скачиваем версию ${info?.version || ''}: ${updateState.progress || 0}%.`;
    status.textContent = message;
    status.classList.toggle('is-error', updateState.status === 'error');
    status.classList.toggle('is-available', ['available', 'downloaded'].includes(updateState.status));
    $('check-for-update').disabled = updateState.status === 'checking' || updateState.status === 'downloading';
    $('check-for-update').textContent = updateState.status === 'checking' ? 'Проверяем…' : 'Проверить обновления';
    if (['available', 'downloaded'].includes(updateState.status)) showUpdateDialog();
    if (updateDialog.open && ['downloading', 'downloaded'].includes(updateState.status)) {
      $('update-primary-action').textContent = updateState.status === 'downloaded' ? 'Перезапустить и установить' : `Скачивается: ${updateState.progress || 0}%`;
      $('update-primary-action').disabled = updateState.status === 'downloading';
    }
  }
  async function refreshUpdateInfo() {
    if (!window.letsTodo?.getAppInfo) return;
    const info = await window.letsTodo.getAppInfo();
    $('update-current-version').textContent = `Текущая версия: ${info.version}`;
    if (!info.isPackaged || info.platform !== 'win32') renderUpdate({ status: 'unavailable' });
    else if (updater) renderUpdate(await updater.getState());
  }
  $('check-for-update').addEventListener('click', async () => { if (updater) renderUpdate(await updater.check()); });
  $('update-primary-action').addEventListener('click', async () => {
    if (!updater) return;
    if (updateState.status === 'downloaded') await updater.install();
    else if (updateState.status === 'available') renderUpdate(await updater.download());
  });
  $('update-dialog-close').addEventListener('click', () => updateDialog.close());
  $('update-later').addEventListener('click', () => updateDialog.close());
  updater?.onStateChanged(renderUpdate);
  const preferencesApi = window.letsTodo?.preferences;
  async function refreshPreferences() { if (!preferencesApi) return; const values = await preferencesApi.get(); $('notifications-setting').checked = values.notificationsEnabled !== false; $('tray-setting').checked = Boolean(values.minimizeToTray); }
  async function savePreferences() { if (!preferencesApi) return; const values = await preferencesApi.set({ notificationsEnabled: $('notifications-setting').checked, minimizeToTray: $('tray-setting').checked }); $('notifications-setting').checked = values.notificationsEnabled; $('tray-setting').checked = values.minimizeToTray; }
  $('notifications-setting').addEventListener('change', savePreferences);
  $('tray-setting').addEventListener('change', savePreferences);
  const privacyApi = window.letsTodo?.privacy;
  async function refreshPrivacy() { if (!privacyApi) return; const status = await privacyApi.get(); const pinButton = $('privacy-pin-action'); const protectionButton = $('privacy-protection-action'); pinButton.textContent = status.hasPin ? 'Изменить PIN' : 'Установить PIN'; protectionButton.hidden = !status.hasPin; protectionButton.textContent = status.enabled ? 'Отключить защиту PIN' : 'Включить защиту PIN'; $('privacy-settings-status').textContent = status.hasPin ? (status.enabled ? 'Защита PIN включена.' : 'Личные записи открываются без PIN.') : 'PIN ещё не установлен.'; }
  $('privacy-open-action').addEventListener('click', () => window.dispatchEvent(new CustomEvent('lets-todo:privacy-configure', { detail: 'enter' })));
  $('privacy-pin-action').addEventListener('click', () => window.dispatchEvent(new CustomEvent('lets-todo:privacy-configure', { detail: $('privacy-pin-action').textContent.includes('Изменить') ? 'change' : 'setup' })));
  $('privacy-protection-action').addEventListener('click', async () => { const status = await privacyApi?.get?.(); if (!status) return; window.dispatchEvent(new CustomEvent('lets-todo:privacy-configure', { detail: status.enabled ? 'disable' : 'enable' })); });
  window.addEventListener('lets-todo:privacy-status-changed', refreshPrivacy);
  async function exportData(kind) {
    const source = window.letsTodoExports?.[kind]; if (!source || !window.letsTodo?.exportJson) return;
    $('export-status').textContent = 'Подготавливаем файл…';
    try { const result = await window.letsTodo.exportJson({ kind, data: source() }); $('export-status').textContent = result.saved ? 'Файл сохранён.' : ''; }
    catch (error) { $('export-status').textContent = `Не удалось сохранить файл: ${error.message || 'ошибка'}`; }
  }
  $('export-tasks').addEventListener('click', () => exportData('tasks'));
  $('export-statistics').addEventListener('click', () => exportData('statistics'));
  window.addEventListener('lets-todo:page-shown', event => { if (event.detail === 'settings') { refresh(); refreshPreferences(); refreshPrivacy(); } });
  refresh();
  refreshUpdateInfo();
  refreshPreferences();
  refreshPrivacy();
})();
