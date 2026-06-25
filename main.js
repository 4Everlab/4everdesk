/**
 * 4EverDesk - Electron Ana Surec (main process)
 * ---------------------------------------------
 * - Pencereyi olusturur
 * - Ekran kaynagini saglar (desktopCapturer)
 * - Uzaktan gelen fare/klavye olaylarini gercek sisteme enjekte eder (nut.js)
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require("electron");
const path = require("path");

// Otomatik guncelleme (electron-updater). Paketlenmemis (dev) modda devre disi.
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.warn("[updater] yuklenemedi:", e.message);
}

// nut.js'i guvenli sekilde yukle. Build edilmemisse uygulama yine de calissin
// (sadece "kontrol edilme" ozelligi devre disi olur, ekran izleme calisir).
let nut = null;
try {
  nut = require("@nut-tree-fork/nut-js");
  nut.mouse.config.autoDelayMs = 0;
  nut.keyboard.config.autoDelayMs = 0;
  console.log("[nut.js] yuklendi - tam kontrol aktif");
} catch (e) {
  console.warn("[nut.js] yuklenemedi - kontrol edilme devre disi:", e.message);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f1a",
    icon: path.join(__dirname, "icon.png"),
    title: "4EverDesk",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

/* ----------------------- Otomatik guncelleme ----------------------- */
function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", { status, ...extra });
  }
}

function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return; // sadece paketli surumde
  autoUpdater.on("update-available", (info) => sendUpdateStatus("available", { version: info.version }));
  autoUpdater.on("update-not-available", () => sendUpdateStatus("none"));
  autoUpdater.on("download-progress", (p) => sendUpdateStatus("downloading", { percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("downloaded", { version: info.version }));
  autoUpdater.on("error", (err) => sendUpdateStatus("error", { message: String(err) }));

  autoUpdater.checkForUpdates().catch(() => {});
  // Her 6 saatte bir tekrar kontrol et
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("get-version", () => app.getVersion());
ipcMain.on("install-update", () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ----------------------- IPC: Ekran Kaynagi ----------------------- */

ipcMain.handle("get-screen-source", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  // Ilk (birincil) ekrani dondur
  const src = sources[0];
  return src ? { id: src.id, name: src.name } : null;
});

/* ----------------------- IPC: Girdi Enjeksiyonu ----------------------- */

// nut.js fare butonlari
function nutButton(b) {
  if (!nut) return null;
  const { Button } = nut;
  switch (b) {
    case 0:
      return Button.LEFT;
    case 1:
      return Button.MIDDLE;
    case 2:
      return Button.RIGHT;
    default:
      return Button.LEFT;
  }
}

let screenSizeCache = null;
async function getScreenSize() {
  if (!nut) {
    const s = screen.getPrimaryDisplay().size;
    return { width: s.width, height: s.height };
  }
  if (!screenSizeCache) {
    screenSizeCache = {
      width: await nut.screen.width(),
      height: await nut.screen.height(),
    };
  }
  return screenSizeCache;
}

const { codeToKey } = require("./keymap.js");

ipcMain.on("inject-input", async (_e, ev) => {
  if (!nut) return;
  try {
    const { mouse, keyboard, Point } = nut;

    switch (ev.t) {
      case "mm": {
        // normalize 0..1 -> ekran pikseli
        const s = await getScreenSize();
        await mouse.setPosition(
          new Point(Math.round(ev.x * s.width), Math.round(ev.y * s.height))
        );
        break;
      }
      case "md": {
        const btn = nutButton(ev.b);
        if (btn !== null) await mouse.pressButton(btn);
        break;
      }
      case "mu": {
        const btn = nutButton(ev.b);
        if (btn !== null) await mouse.releaseButton(btn);
        break;
      }
      case "sc": {
        // tekerlek kaydirma
        if (ev.dy > 0) await mouse.scrollDown(Math.max(1, Math.round(ev.dy / 40)));
        else if (ev.dy < 0) await mouse.scrollUp(Math.max(1, Math.round(-ev.dy / 40)));
        break;
      }
      case "kd": {
        const key = codeToKey(ev.code, nut.Key);
        if (key !== undefined && key !== null) await keyboard.pressKey(key);
        break;
      }
      case "ku": {
        const key = codeToKey(ev.code, nut.Key);
        if (key !== undefined && key !== null) await keyboard.releaseKey(key);
        break;
      }
    }
  } catch (err) {
    // Tek bir olay hatasi uygulamayi durdurmasin
    console.warn("inject hata:", err.message);
  }
});
