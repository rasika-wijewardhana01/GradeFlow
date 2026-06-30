# GradeFlow Cross-Device Sync — Integration Guide

## What was built

A **zero-backend, no-account** cross-device sync feature with three transfer methods:

| Method | Works offline? | Best for |
|--------|---------------|----------|
| QR Code | ✅ Yes | Same room, fastest, no internet needed |
| Sync Code | ❌ Needs internet | Different locations, different networks |
| Backup File | ✅ Yes | Universal fallback, email transfer |

---

## Files to add to your repo

```
src/
  modules/
    sync.js           ← Main sync module (ES module)
  styles/
    sync.css          ← Sync modal styles
  templates/
    modal-sync.html   ← Sync modal HTML template
```

---

## Step 1 — Add the template to your loader

In `src/app.js` (or wherever templates are loaded), add `'modal-sync'` to the template array:

```js
// In the template loader section of app.js
const templates = [
  // ... existing templates ...
  'modal-sync',   // ← ADD THIS
];
```

---

## Step 2 — Import sync.js in your module list

In `src/app.js` or your main entry:

```js
import './modules/sync.js';
```

Or in `vite.config.js` if you have explicit entry points.

---

## Step 3 — Import sync.css

In `src/main.css` or your root CSS file:

```css
@import './styles/sync.css';
```

Or in `index.html`:

```html
<link rel="stylesheet" href="/src/styles/sync.css">
```

---

## Step 4 — Add the Sync button to the UI

### Option A: More Sheet (mobile bottom drawer)

In `src/templates/more-sheet.html`, add inside the actions list:

```html
<button class="sync-trigger-btn" onclick="openSyncModal()">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
    <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
    <path d="M12 7v5l3 3"/>
  </svg>
  Sync to Another Device
</button>
```

### Option B: Sidebar Settings section

In `src/templates/sidebar.html`, add in the settings/actions area:

```html
<button class="sidebar-action-btn" onclick="openSyncModal()">
  <svg ...><!-- same icon --></svg>
  Sync Device
</button>
```

### Option C: Backup modal

In `src/templates/modal-backup.html`, add a row at the top:

```html
<div class="backup-sync-shortcut">
  <button onclick="closeSyncModal(); openSyncModal()">
    📱 Transfer to another device instead
  </button>
</div>
```

---

## Step 5 — Verify GradeFlow's backup API is hooked

`sync.js` tries these methods in order to read/write data:

1. `window.generateBackupData()` — your existing backup export function
2. `window.importBackupData(data)` — your existing backup import function
3. `window.StorageEngine.load()` / `.save()` — direct StorageEngine access
4. Raw IndexedDB fallback

Check `src/modules/backup.js` and make sure these are exported to `window.*`:

```js
// In backup.js — ensure these exist:
window.generateBackupData = async function() { /* returns JSON string */ };
window.importBackupData   = async function(data) { /* imports parsed data */ };
```

If they're named differently, update the references in `sync.js` lines ~80–102.

---

## How each method works (technical)

### QR Code Transfer

1. Sender: data → JSON → pako deflate compress → base64 → split into 2000-char chunks
2. Each chunk wrapped in `{ v, t:"gf-sync", n: total, i: index, d: chunk_data }`
3. Each chunk rendered as a QR code (QRCode.js)
4. Receiver: camera → jsQR decode → reassemble chunks → decompress → import

**Data size limits**: A typical GradeFlow session (1 exam, 40 students, 8 subjects) compresses to ~3-8 KB. 1 QR code holds ~2 KB so most sessions need 2-4 QR codes.

### Sync Code Transfer

1. Sender: data → compress → split into 8000-char chunks
2. Each chunk uploaded to **jsonbin.io** (free public bins, no API key needed)
3. A manifest bin created with `{ code, expires, chunks: [binId...] }`
4. 6-character code displayed (derived from the code property)
5. Receiver: enters code → fetches manifest → fetches all chunks → reassemble → import
6. Data auto-expires after 15 minutes

**Privacy**: Data is public but encoded. Optional PIN adds a hash check layer. The code is random and short-lived. For sensitive data, QR code or file export is recommended.

### File Transfer

Wraps GradeFlow's existing JSON backup export. User downloads `.json` file on Device A, transfers via USB/email/AirDrop/WhatsApp, imports on Device B. Zero network dependency.

---

## CDN scripts loaded on demand

The module lazy-loads these only when needed (no bundle bloat):

```
https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js    (QR generation)
https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js         (QR scanning)
https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js         (compression)
```

---

## CSP header update (netlify.toml)

If your `netlify.toml` has a strict Content-Security-Policy, add these:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = """
      default-src 'self';
      script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline';
      connect-src 'self' https://api.jsonbin.io;
      media-src 'self' blob: mediastream:;
      img-src 'self' data: blob:;
    """
```

**`media-src mediastream:`** is required for camera access.
**`connect-src api.jsonbin.io`** is required for Sync Code method.
**`cdnjs.cloudflare.com`** is required for lazy-loaded scripts.

---

## Roadmap / future improvements

- **WebRTC P2P** — direct device-to-device transfer over LAN without any cloud relay
- **Google Drive backup** (already in your roadmap) — could also serve as sync medium
- **QR auto-advance** — auto-show next QR after receiver confirms current chunk scanned
- **Real-time sync** with a free Firebase/Supabase free tier if teachers need live collaboration
- **Selective sync** — sync only specific exams rather than entire dataset
- 
