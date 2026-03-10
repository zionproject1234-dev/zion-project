const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getVolume: () => ipcRenderer.invoke('get-volume'),
    setVolume: (level) => ipcRenderer.invoke('set-volume', level),
    setBrightness: (level) => ipcRenderer.invoke('set-brightness', level),
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    getMetrics: () => ipcRenderer.invoke('get-metrics'),
    launchApp: (name) => ipcRenderer.invoke('launch-app', name),
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    isElectron: true
});
