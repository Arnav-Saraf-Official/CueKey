const { contextBridge } = require('electron')

// Expose any Electron APIs to the renderer process here if needed
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
})
