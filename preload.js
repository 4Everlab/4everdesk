/**
 * 4EverDesk - Preload
 * Renderer (web sayfasi) ile ana surec arasinda guvenli koprü.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desk", {
  // Host tarafi: paylasilacak ekran kaynagini al
  getScreenSource: () => ipcRenderer.invoke("get-screen-source"),
  // Host tarafi: uzaktan gelen girdiyi sisteme uygula
  injectInput: (ev) => ipcRenderer.send("inject-input", ev),

  // Uygulama surumu
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Otomatik guncelleme olaylari
  onUpdate: (cb) => ipcRenderer.on("update-status", (_e, data) => cb(data)),
  installUpdate: () => ipcRenderer.send("install-update"),
});
