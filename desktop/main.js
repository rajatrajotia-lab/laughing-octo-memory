const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { createHub, versionOf, cmpVer, looksComplete } = require("./server");

const APP_DIR = path.join(__dirname, "app");
let hubPort = null;
let hub = null;
let startFile = path.join(APP_DIR, "index.html");

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
    /* Security software on office machines sometimes blocks even local
       servers — if the page cannot load, fall back to the bundled file
       so the app always opens. */
    win.webContents.once("did-fail-load", () => {
      win.loadFile(startFile);
    });
  } else {
    win.loadFile(startFile);
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
    /* The app used to be called "Fuel Register"; adopt its data folder
       so existing installs keep their records under the new name. */
    const dataFile = path.join(app.getPath("userData"), "shared-data.json");
    const oldFile = path.join(path.dirname(app.getPath("userData")), "Fuel Register", "shared-data.json");
    try {
      if (!fs.existsSync(dataFile) && fs.existsSync(oldFile)) {
        fs.mkdirSync(path.dirname(dataFile), { recursive: true });
        fs.copyFileSync(oldFile, dataFile);
      }
    } catch (e) { /* fresh install */ }
    const updateFile = path.join(app.getPath("userData"), "app-update.html");
    /* Without a hub the window opens straight from a file; use a
       previously downloaded update when it is intact and newer. */
    try {
      const u = fs.readFileSync(updateFile, "utf8");
      const b = fs.readFileSync(startFile, "utf8");
      if (looksComplete(u) && cmpVer(versionOf(u), versionOf(b)) > 0) startFile = updateFile;
    } catch (e) { /* no update downloaded yet */ }
    hub = createHub(APP_DIR, dataFile, updateFile);
    hubPort = await hub.listen([8785, 8786, 8787, 8788, 8789]);
    await migrateOldEntries(hub);
  } catch (e) {
    hubPort = null; // no free port: run standalone from the local file
  }
  createWindow();
  /* Fetch the latest app from the website shortly after launch; when a
     newer version arrives, reload so this window picks it up. */
  if (hub && hubPort) {
    setTimeout(async () => {
      try {
        const r = await hub.checkUpdate();
        if (r.status === "updated") {
          const w = BrowserWindow.getAllWindows()[0];
          if (w) w.webContents.reload();
        }
      } catch (e) { /* offline; the in-app button can retry */ }
    }, 3000);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
