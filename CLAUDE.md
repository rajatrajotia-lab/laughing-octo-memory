# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HSD-REGISTER: a diesel (HSD) fuel tracking app for construction sites — machine logbook, purchases, stock register, and printable reports. The entire web app is a single self-contained `index.html` (~1.9 MB) with no build step, wrapped for distribution as a PWA (GitHub Pages), an Electron desktop app (`desktop/`), and an Android WebView app (`android/`).

The default branch is `claude/new-session-labzgm` (not `main`).

## Commands

There is no build, lint, or test tooling for the web app itself — open `index.html` in a browser (or serve the repo root with any static server) to run it. `localStorage` only works when served over http(s) or file-opened directly, not in sandboxed iframes.

Desktop (Electron):
```
cd desktop
npm install
mkdir -p app && cp ../index.html ../manifest.webmanifest ../*.png app/   # bundle web app (CI does this too)
npm start                    # run the app
npx electron-builder --win   # or --mac; output in desktop/dist/
```

Android (WebView wrapper):
```
mkdir -p android/app/src/main/assets && cp index.html android/app/src/main/assets/
cd android && gradle assembleRelease
```

Release: bump `version` in `desktop/package.json`, commit, then push a tag `vX.Y.Z`. The `release.yml` workflow builds Windows/macOS/Android installers and creates the GitHub release. `pages.yml` deploys the repo root to GitHub Pages on every push to the default branch.

## Architecture

### index.html layout — edit only the app region

The file has distinct regions; line numbers drift, so locate by marker:

1. Head + inline CSS + storage shim (`window.storage`, a promise-based key-value API over `localStorage` with an in-memory fallback; keys prefixed `fuelreg:`).
2. **Vendored minified libraries** — React 18.3.1, ReactDOM, PropTypes, Recharts, SheetJS — inlined so the app works fully offline. Never edit or replace these blocks.
3. **The application** (~6,000 lines): starts at the IIFE that checks `window.React/ReactDOM/Recharts/XLSX` are present, ends before the service-worker registration script. Plain JavaScript with `React.createElement` — **no JSX**, since there is no transpile step. Keep new code in that style.
4. Service-worker registration. `sw.js` and `manifest.webmanifest` exist but are intentionally empty files.

Two exact strings in index.html are load-bearing for the desktop LAN hub, which patches the page by string replacement (`desktop/server.js`): `window.storage = {` and `<!-- React -->`. Do not rename or reformat them.

The app must stay self-contained: no CDN scripts, fonts, or network fetches (the desktop hub's `netstorage.js` is the only exception, injected at serve time).

### Data model and persistence

All data lives under a single storage key, `diesel:register:v1`, as one JSON blob:

- `sites: []` — site list; each site has machines
- `logs: { [siteId]: [entries] }` — fuel-issue/logbook entries (shift, meter or clock readings, condition, usage)
- `stock: { [siteId]: [day-entries] }` — site tank register; each day has `receipts: []` (qty/rate/dcNo/supplier)
- `rate` / `rateP` — HSD / Petrol rates; plus optional `device` (binds a device to one site via `deviceScope`), passcode hash, and `imports` tags

The root component `DieselLogbook` owns all state, loads once on mount (running legacy-shape migrations inline, e.g. `received` → `receipts[]`), and autosaves with a 400 ms debounce plus a `beforeunload` guard. Stock rows are derived by `buildStock`, which chains each day's opening from the previous close — much of the recent git history is about enforcing this chain (edits/deletes are "chain-guarded").

**Bundled seed data**: `KSDP_DATA` is a large JSON string imported once per install by `importKSDP()`, guarded by the `KSDP_TAG` constant recorded in `data.imports`. To restate the bundled data, change both the data and the tag (see tags like `ksdp_rayagada_20260806_allfromtank`); an unchanged tag means existing installs will not pick up the change.

A management passcode (set in-app) gates the company dashboard, unlocking edits, and destructive actions via `requireAuth`.

### Distribution wrappers

- `desktop/main.js` starts a LAN hub (`server.js`) and loads the app from `http://127.0.0.1:<port>/`, falling back to the bundled file if blocked. The hub serves the app to other devices on the same WiFi and holds one shared store (`shared-data.json` in userData, `{rev, data}`); `netstorage.js` is injected into served pages to replace `window.storage` with the hub's REST API (`api/all`, `api/rev`, poll-and-reload when idle). `desktop/app/` is a gitignored staging dir populated at build time.
- `android/` is a minimal WebView activity loading `file:///android_asset/index.html`; the signing keystore (`android/signing.p12`, password `fuelregister`) is committed and used by CI.

### Conventions

- Commit messages describe the user-facing change and end with the version, e.g. `Chain-guard purchase edits/deletes and report deletes (v1.3.14)`; the version must match `desktop/package.json`.
- UI copy is written for non-technical site staff — plain sentences, no jargon; keep that tone in any user-facing strings.
