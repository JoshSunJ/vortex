const { contextBridge, ipcRenderer } = require('electron');

// Each method has a fixed channel. No raw ipcRenderer, token, filesystem or Node access is exposed.
contextBridge.exposeInMainWorld('vortex', Object.freeze({
  snapshot: () => ipcRenderer.invoke('vortex:snapshot'),
  status: () => ipcRenderer.invoke('vortex:status'),
  listWorkspaces: () => ipcRenderer.invoke('vortex:listWorkspaces'),
  createWorkspace: value => ipcRenderer.invoke('vortex:createWorkspace', value),
  previewResource: id => ipcRenderer.invoke('vortex:previewResource', id),
  previewWorkspace: (id, mode) => ipcRenderer.invoke('vortex:previewWorkspace', id, mode),
  executeApproved: (id, hash, revision) => ipcRenderer.invoke('vortex:executeApproved', id, hash, revision),
  saveCheckpoint: value => ipcRenderer.invoke('vortex:saveCheckpoint', value),
  listOperations: () => ipcRenderer.invoke('vortex:listOperations'),
  setExtensionId: id => ipcRenderer.invoke('vortex:setExtensionId', id),
  copyBridgeToken: () => ipcRenderer.invoke('vortex:copyBridgeToken'),
  openExtensionFolder: () => ipcRenderer.invoke('vortex:openExtensionFolder'),
}));
