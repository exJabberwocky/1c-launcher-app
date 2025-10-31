const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfigInfo: () => ipcRenderer.invoke('get-config-info'),
                                selectConfig: () => ipcRenderer.invoke('select-config'),
                                loadConfig: (configFile) => ipcRenderer.invoke('load-config', configFile),
                                getPlatforms: () => ipcRenderer.invoke('get-platforms'),
                                addBase: (data) => ipcRenderer.invoke('add-base', data),
                                launchBases: (data) => ipcRenderer.invoke('launch-bases', data),
                                openUrl: (url) => ipcRenderer.invoke('open-url', url),
                                saveConfigPath: (configPath) => ipcRenderer.invoke('save-config-path', configPath),
                                getSavedConfigPath: () => ipcRenderer.invoke('get-saved-config-path'),
                                saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme),
                                checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
                                dismissUpdate: (version) => ipcRenderer.invoke('dismiss-update', version)
});
