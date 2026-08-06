const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { createHub } = require("./server");

const APP_DIR = path.join(__dirname, "app");
let hubPort = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 360,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: "#E7ECF1",
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  if (hubPort) {
    win.loadURL("http://127.0.0.1:" + hubPort + "/");
  } else {
    win.loadFile(path.join(APP_DIR, "index.html"));
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

/* Entries from versions before the hub existed live in this window's own
   local storage; copy them into the shared store once. */
async function migrateOldEntries(hub) {
  if (hub.hasData()) return;
  const w = new BrowserWindow({ show: false });
  try {
    await w.loadFile(path.join(__dirname, "blank.html"));
    const dump = await w.webContents.executeJavaScript(
      '(function(){var o={};for(var i=0;i<localStorage.length;i++){' +
      'var k=localStorage.key(i);if(k&&k.indexOf("fuelreg:")===0)' +
      "o[k.slice(8)]=localStorage.getItem(k);}return o;})()"
    );
    if (dump && Object.keys(dump).length) hub.importData(dump);
  } catch (e) { /* nothing to migrate */ }
  w.destroy();
}

app.whenReady().then(async () => {
  try {
    const hub = createHub(APP_DIR, path.join(app.getPath("userData"), "shared-data.json"));
    hubPort = await hub.listen([8785, 8786, 8787, 8788, 8789]);
    await migrateOldEntries(hub);
  } catch (e) {
    hubPort = null; // no free port: run standalone from the local file
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
