/* LAN hub: serves the app to other devices on the WiFi and keeps one
   shared data store on this computer. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATIC = {
  "/manifest.webmanifest": "application/manifest+json",
  "/icon-192.png": "image/png",
  "/icon-512.png": "image/png",
  "/icon-512-maskable.png": "image/png",
  "/apple-touch-icon.png": "image/png"
};

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

const UPDATE_URL = "https://rajatrajotia-lab.github.io/laughing-octo-memory/index.html";

function versionOf(raw) {
  const m = /name="app-version" content="([0-9.]+)"/.exec(raw || "");
  return m ? m[1] : null;
}

function cmpVer(a, b) {
  const x = String(a || "").split(".").map(Number);
  const y = String(b || "").split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function looksComplete(raw) {
  return typeof raw === "string" && raw.includes('name="app-version"') && raw.trim().endsWith("</html>");
}

function fetchLatest() {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const req = https.get(UPDATE_URL, { timeout: 20000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("http " + res.statusCode)); }
      let b = "";
      res.setEncoding("utf8");
      res.on("data", c => {
        b += c;
        if (b.length > 40 * 1024 * 1024) { req.destroy(); reject(new Error("too large")); }
      });
      res.on("end", () => resolve(b));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

function createHub(appDir, dataFile, updateFile) {
  let store = { rev: 0, data: {} };
  try {
    const loaded = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (loaded && typeof loaded === "object" && loaded.data) store = loaded;
  } catch (e) { /* first run */ }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(dataFile + ".tmp", JSON.stringify(store));
        fs.renameSync(dataFile + ".tmp", dataFile);
      } catch (e) { /* disk hiccup; next save retries */ }
    }, 300);
  }

  const shim = fs.readFileSync(path.join(__dirname, "netstorage.js"), "utf8");
  const prepare = raw => raw
    .replace("window.storage = {", "window.storageLocalUnused = {")
    .replace("<!-- React -->", "<script>\n" + shim + "\n</script>\n<!-- React -->");
  const bundledRaw = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  let currentRaw = bundledRaw;
  /* A previously downloaded update lives in the data folder; serve it when
     it is intact and newer than the bundled copy. */
  try {
    if (updateFile && fs.existsSync(updateFile)) {
      const u = fs.readFileSync(updateFile, "utf8");
      if (looksComplete(u) && cmpVer(versionOf(u), versionOf(bundledRaw)) > 0) currentRaw = u;
    }
  } catch (e) { /* fall back to the bundled copy */ }
  let indexRaw = prepare(currentRaw);

  async function checkUpdate() {
    const fresh = await fetchLatest();
    if (!looksComplete(fresh)) throw new Error("incomplete download");
    const nv = versionOf(fresh);
    const cv = versionOf(currentRaw);
    if (!nv || cmpVer(nv, cv) <= 0) return { status: "current", version: cv };
    if (updateFile) {
      fs.writeFileSync(updateFile + ".tmp", fresh);
      fs.renameSync(updateFile + ".tmp", updateFile);
    }
    currentRaw = fresh;
    indexRaw = prepare(fresh);
    return { status: "updated", version: nv };
  }

  function page(isLocal, port) {
    if (!isLocal) return indexRaw;
    const ips = lanAddresses();
    if (!ips.length) return indexRaw;
    const urls = ips.map(ip => "http://" + ip + ":" + port).join("  or  ");
    const banner =
      '<div id="lanshare" style="position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      "background:#0F1D2E;color:#fff;font:12px/1.5 system-ui,sans-serif;padding:7px 34px 7px 12px;" +
      'text-align:center;">Other devices on this WiFi can open: <b>' + urls + "</b>" +
      '<span onclick="document.getElementById(\'lanshare\').remove()" ' +
      'style="position:absolute;right:10px;top:5px;cursor:pointer;font-size:15px;">&times;</span></div>';
    /* Insert at the LAST </body>: the bundled spreadsheet library contains
       the same text inside a script string, and replacing the first match
       corrupts it. */
    const at = indexRaw.lastIndexOf("</body>");
    if (at < 0) return indexRaw;
    return indexRaw.slice(0, at) + banner + indexRaw.slice(at);
  }

  function json(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let b = "";
      req.on("data", c => {
        b += c;
        if (b.length > 20 * 1024 * 1024) { reject(new Error("too large")); req.destroy(); }
      });
      req.on("end", () => resolve(b));
      req.on("error", reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    try {
      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(page(isLocal, server.address().port));
      } else if (req.method === "GET" && url === "/api/all") {
        json(res, 200, store);
      } else if (req.method === "GET" && url === "/api/rev") {
        json(res, 200, { rev: store.rev });
      } else if (req.method === "GET" && url === "/api/version") {
        json(res, 200, { version: versionOf(currentRaw) });
      } else if (req.method === "POST" && url === "/api/update") {
        try {
          json(res, 200, await checkUpdate());
        } catch (e) {
          json(res, 200, { status: "offline" });
        }
      } else if (req.method === "POST" && url === "/api/set") {
        const b = JSON.parse(await readBody(req));
        if (typeof b.key !== "string" || typeof b.value !== "string") return json(res, 400, { error: "bad request" });
        /* An identical save must not look like a change, or idle clients
           reload each other for ever. */
        if (store.data[b.key] === b.value) return json(res, 200, { rev: store.rev });
        store.data[b.key] = b.value;
        store.rev++;
        save();
        json(res, 200, { rev: store.rev });
      } else if (req.method === "POST" && url === "/api/delete") {
        const b = JSON.parse(await readBody(req));
        if (typeof b.key !== "string") return json(res, 400, { error: "bad request" });
        delete store.data[b.key];
        store.rev++;
        save();
        json(res, 200, { rev: store.rev });
      } else if (req.method === "GET" && STATIC[url]) {
        try {
          const buf = fs.readFileSync(path.join(appDir, url.slice(1)));
          res.writeHead(200, { "Content-Type": STATIC[url] });
          res.end(buf);
        } catch (e) {
          res.writeHead(404); res.end();
        }
      } else {
        res.writeHead(404); res.end();
      }
    } catch (e) {
      json(res, 500, { error: "server error" });
    }
  });

  return {
    server,
    checkUpdate,
    version: () => versionOf(currentRaw),
    hasData: () => Object.keys(store.data).length > 0,
    importData: (obj) => {
      for (const k of Object.keys(obj)) store.data[k] = obj[k];
      store.rev++;
      save();
    },
    listen: (ports) => new Promise((resolve, reject) => {
      /* Try LAN-visible first (WiFi sharing), then local-only for machines
         whose security policy blocks listening on the network. */
      const attempts = ports.map(p => ({ p, h: "0.0.0.0" }))
        .concat(ports.map(p => ({ p, h: "127.0.0.1" })));
      let i = 0;
      const tryNext = () => {
        if (i >= attempts.length) return reject(new Error("no free port"));
        const a = attempts[i++];
        server.once("error", tryNext);
        server.listen(a.p, a.h, () => {
          server.removeListener("error", tryNext);
          resolve(a.p);
        });
      };
      tryNext();
    })
  };
}

module.exports = { createHub, lanAddresses, versionOf, cmpVer, looksComplete };
