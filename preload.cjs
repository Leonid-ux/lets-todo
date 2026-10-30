const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('letsTodo', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onQuickAddOpen: callback => ipcRenderer.on('quick-add-open', callback),
  closeQuickAdd: () => ipcRenderer.send('quick-add-close'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  showNotification: payload => ipcRenderer.invoke('show-notification', payload),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  updater: {
    getState: () => ipcRenderer.invoke('update-get-state'),
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    install: () => ipcRenderer.invoke('update-install'),
    onStateChanged: callback => ipcRenderer.on('update-state-changed', (_event, state) => callback(state)),
  },
  sync: {
    getState: () => ipcRenderer.invoke('sync-get-state'),
    createOffer: () => ipcRenderer.invoke('sync-create-offer'),
    cancelOffer: () => ipcRenderer.invoke('sync-cancel-offer'),
    confirmPairing: (requestId, accepted) => ipcRenderer.invoke('sync-confirm-pairing', requestId, accepted),
    unpairDevice: deviceId => ipcRenderer.invoke('sync-unpair-device', deviceId),
    respond: (requestId, response) => ipcRenderer.invoke('sync-message-response', requestId, response),
    onStateChanged: callback => ipcRenderer.on('sync-state-changed', (_event, state) => callback(state)),
    onPairingRequest: callback => ipcRenderer.on('sync-pairing-request', (_event, request) => callback(request)),
    onMessage: callback => ipcRenderer.on('sync-message', (_event, request) => callback(request)),
  },
});
