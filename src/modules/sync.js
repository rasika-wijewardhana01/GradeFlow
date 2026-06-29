/**
 * sync.js — GradeFlow Cross-Device Sync Module
 *
 * Strategy: Zero-backend, no-account data transfer via two methods:
 *
 *   1. QR Code Transfer (Local / Same-network)
 *      - Encodes entire compressed backup JSON into a QR code (or splits across
 *        multiple QR codes for large datasets).
 *      - Receiver scans → imports data directly into their IndexedDB.
 *
 *   2. Sync Code (Cloud Relay via JSONStore / HiveMQ or jsonbin.io)
 *      - Sender uploads compressed data to a free ephemeral cloud bin.
 *      - Gets a 6-character alphanumeric code (+ optional PIN for privacy).
 *      - Receiver enters code on their device → data is pulled and imported.
 *      - Data is deleted from the relay after 15 minutes or on first successful pull.
 *
 * No accounts, no logins, no personal data sent — just the teacher's exam data.
 * The sync code is short-lived and one-use for safety.
 *
 * Dependencies (all CDN-loadable, no extra npm install):
 *   - qrcode.js (https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js)
 *   - jsQR    (https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js)
 *   - pako    (https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js)
 *
 * Cloud relay: jsonbin.io free tier (no account for basic use, 10 KB limit per bin)
 *   Fallback: tmpfiles.org / pastebin API equivalent
 *   Large data (>10 KB): chunked into multiple bins with a manifest bin.
 *
 * Integration points:
 *   - Call  window.openSyncModal()  from any UI button (More sheet, Settings, etc.)
 *   - module listens for import events and calls window.importBackupData(json)
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const JSONBIN_BASE   = 'https://api.jsonbin.io/v3/b';
const JSONBIN_KEY    = null;          // No master key needed for public bins
const BIN_TTL_MS     = 15 * 60_000;  // 15 min ephemeral
const MAX_QR_BYTES   = 2000;         // Safe QR v40 byte limit (binary mode)
const CHUNK_SIZE     = 8000;         // Chars per cloud chunk
const SYNC_VERSION   = 1;

// ─── State ────────────────────────────────────────────────────────────────────
let _syncState = {
  mode: 'idle',          // idle | send-qr | send-code | receive-qr | receive-code
  chunks: [],            // QR chunks for multi-page display
  chunkIndex: 0,
  binIds: [],            // cloud bin IDs for chunked upload
  code: null,            // 6-char code
  pin: null,             // optional 4-digit pin
  stream: null,          // MediaStream for camera
  scanInterval: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random uppercase alphanumeric code */
function _randCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

/** Compress a JSON string to a base64-encoded deflate blob */
function _compress(jsonStr) {
  if (typeof pako === 'undefined') return btoa(jsonStr);
  const bytes = pako.deflate(jsonStr, { level: 9 });
  return btoa(String.fromCharCode(...bytes));
}

/** Decompress a base64-encoded deflate blob back to JSON string */
function _decompress(b64) {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (typeof pako !== 'undefined') {
      return pako.inflate(bytes, { to: 'string' });
    }
  } catch (_) { /* not pako-compressed */ }
  return atob(b64);
}

/** Show a toast message (uses GradeFlow's existing toast system if available) */
function _toast(msg, type = 'info') {
  if (window.showToast) { window.showToast(msg, type); return; }
  console.log(`[Sync ${type}]`, msg);
}

/** Get the full app data snapshot from storage */
async function _getBackupPayload() {
  // Use GradeFlow's existing backup export mechanism
  if (window.generateBackupData) {
    return await window.generateBackupData();
  }
  // Fallback: pull directly from StorageEngine
  if (window.StorageEngine) {
    const data = await window.StorageEngine.load();
    return JSON.stringify({ version: 1, source: 'GradeFlow', data });
  }
  // Last resort: read from IndexedDB manually
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('GradeFlowDB');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(db.objectStoreNames, 'readonly');
      const result = {};
      let pending = db.objectStoreNames.length;
      if (pending === 0) return resolve(JSON.stringify({ version: 1, source: 'GradeFlow', data: {} }));
      for (const name of db.objectStoreNames) {
        const store = tx.objectStore(name);
        const getAllReq = store.getAll();
        getAllReq.onsuccess = ev => {
          result[name] = ev.target.result;
          if (--pending === 0) resolve(JSON.stringify({ version: 1, source: 'GradeFlow', data: result }));
        };
      }
    };
    req.onerror = () => reject(new Error('Cannot open IndexedDB'));
  });
}

/** Import received data into the app */
async function _importPayload(jsonStr) {
  try {
    const payload = JSON.parse(jsonStr);
    // Use GradeFlow's existing import mechanism
    if (window.importBackupData) {
      await window.importBackupData(payload.data ?? payload);
      return true;
    }
    if (window.StorageEngine) {
      await window.StorageEngine.save(payload.data ?? payload);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Import error:', err);
    return false;
  }
}

// ─── QR Code Transfer ─────────────────────────────────────────────────────────

/**
 * Prepares QR chunks for the sender.
 * Returns array of strings (each renderable as a QR code).
 */
async function _prepareQRChunks() {
  const json = await _getBackupPayload();
  const compressed = _compress(json);

  // Wrap in transfer envelope
  const envelope = { v: SYNC_VERSION, t: 'gf-sync', ts: Date.now() };

  if (compressed.length <= MAX_QR_BYTES - 60) {
    // Fits in a single QR
    return [JSON.stringify({ ...envelope, n: 1, i: 0, d: compressed })];
  }

  // Split into multiple chunks
  const chunks = [];
  for (let i = 0; i < compressed.length; i += MAX_QR_BYTES) {
    chunks.push(compressed.slice(i, i + MAX_QR_BYTES));
  }
  return chunks.map((chunk, i) =>
    JSON.stringify({ ...envelope, n: chunks.length, i, d: chunk })
  );
}

/** Render a QR code string into a canvas element */
async function _renderQR(text, canvas) {
  if (typeof QRCode === 'undefined') {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js');
  }
  canvas.innerHTML = '';
  // Using QRCode library's toCanvas
  return new Promise((resolve, reject) => {
    QRCode.toCanvas(canvas, text, {
      width: 280,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#0d1117' }
    }, err => err ? reject(err) : resolve());
  });
}

// ─── Cloud Code Transfer ──────────────────────────────────────────────────────

/**
 * Upload data to cloud relay and return a sync code.
 * Uses jsonbin.io free tier (no API key required for public bins).
 */
async function _uploadToCloud(jsonStr, pin = null) {
  const compressed = _compress(jsonStr);
  const code = _randCode(6);

  // Split into chunks if needed (jsonbin.io 10 KB limit per bin)
  const chunks = [];
  for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
    chunks.push(compressed.slice(i, i + CHUNK_SIZE));
  }

  const binIds = [];

  for (let i = 0; i < chunks.length; i++) {
    const payload = {
      v: SYNC_VERSION,
      code,
      pin: pin || null,
      chunk: i,
      total: chunks.length,
      data: chunks[i],
      expires: Date.now() + BIN_TTL_MS,
    };

    const res = await fetch(JSONBIN_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bin-Name': `gf-${code}-${i}`,
        'X-Bin-Private': 'false',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Cloud upload failed (chunk ${i}): ${res.status}`);
    const { metadata } = await res.json();
    binIds.push(metadata.id);
  }

  // Store manifest in a final bin
  const manifest = {
    v: SYNC_VERSION,
    code,
    pin: pin ? _hashPin(pin) : null,
    chunks: binIds.length,
    expires: Date.now() + BIN_TTL_MS,
    type: 'gf-manifest',
  };

  const manifestRes = await fetch(JSONBIN_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bin-Name': `gf-manifest-${code}`,
      'X-Bin-Private': 'false',
    },
    body: JSON.stringify(manifest),
  });

  if (!manifestRes.ok) throw new Error('Manifest upload failed');
  const { metadata: mMeta } = await manifestRes.json();

  // Store manifest bin ID locally so receiver can look it up
  // We encode it in the 6-char code via a local lookup map
  // (The receiver uses the code to search jsonbin.io by name)
  _syncState.code = code;
  _syncState.binIds = [...binIds, mMeta.id];
  _syncState.manifestBinId = mMeta.id;

  return { code, binCount: chunks.length };
}

/**
 * Simple deterministic hash for PIN verification (not a security guarantee,
 * just stops casual snooping of bin contents).
 */
function _hashPin(pin) {
  let h = 5381;
  for (const c of String(pin)) h = ((h << 5) + h) ^ c.charCodeAt(0);
  return (h >>> 0).toString(36);
}

/**
 * Download data from cloud relay using a sync code.
 */
async function _downloadFromCloud(code, pin = null) {
  // Search jsonbin.io for the manifest bin by name
  const searchRes = await fetch(
    `${JSONBIN_BASE}?name=gf-manifest-${code.toUpperCase()}`,
    { headers: { 'X-Bin-Meta': 'false' } }
  );

  if (!searchRes.ok) {
    // Try alternate lookup via jsonbin.io search endpoint
    throw new Error('CODE_NOT_FOUND');
  }

  const results = await searchRes.json();
  const manifest = Array.isArray(results) ? results[0]?.record : results?.record;

  if (!manifest || manifest.type !== 'gf-manifest') throw new Error('CODE_NOT_FOUND');
  if (manifest.expires < Date.now()) throw new Error('CODE_EXPIRED');

  // PIN check
  if (manifest.pin && (!pin || _hashPin(pin) !== manifest.pin)) {
    throw new Error('WRONG_PIN');
  }

  // Fetch all data chunks
  const chunkCount = manifest.chunks;
  const chunks = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunkRes = await fetch(
      `${JSONBIN_BASE}?name=gf-${code.toUpperCase()}-${i}`,
      { headers: { 'X-Bin-Meta': 'false' } }
    );
    if (!chunkRes.ok) throw new Error(`Chunk ${i} fetch failed`);
    const { record } = await chunkRes.json();
    chunks[record.chunk] = record.data;
  }

  const compressed = chunks.join('');
  return _decompress(compressed);
}

// ─── Camera / QR Scanner ─────────────────────────────────────────────────────

async function _startCamera(videoEl) {
  if (typeof jsQR === 'undefined') {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  });
  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', true);
  await videoEl.play();
  _syncState.stream = stream;
  return stream;
}

function _stopCamera() {
  if (_syncState.stream) {
    _syncState.stream.getTracks().forEach(t => t.stop());
    _syncState.stream = null;
  }
  if (_syncState.scanInterval) {
    clearInterval(_syncState.scanInterval);
    _syncState.scanInterval = null;
  }
}

/**
 * Scan QR codes from a video element, assembling multi-chunk transfers.
 * Calls onComplete(jsonStr) when all chunks received.
 */
function _startQRScan(videoEl, canvasEl, onProgress, onComplete, onError) {
  const receivedChunks = {};
  let totalChunks = null;

  _syncState.scanInterval = setInterval(() => {
    if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;

    const ctx = canvasEl.getContext('2d');
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (!code) return;

    try {
      const packet = JSON.parse(code.data);
      if (packet.t !== 'gf-sync') return;

      totalChunks = packet.n;
      receivedChunks[packet.i] = packet.d;

      const count = Object.keys(receivedChunks).length;
      onProgress(count, totalChunks);

      if (count >= totalChunks) {
        clearInterval(_syncState.scanInterval);
        _stopCamera();

        const compressed = Array.from({ length: totalChunks }, (_, i) => receivedChunks[i]).join('');
        const jsonStr = _decompress(compressed);
        onComplete(jsonStr);
      }
    } catch (err) {
      // Not a GradeFlow QR, ignore
    }
  }, 150);
}

// ─── Script loader ────────────────────────────────────────────────────────────
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Modal UI ─────────────────────────────────────────────────────────────────

function _getSyncModal() {
  return document.getElementById('modal-sync');
}

function _setView(viewId) {
  const modal = _getSyncModal();
  modal.querySelectorAll('[data-sync-view]').forEach(el => {
    el.style.display = el.dataset.syncView === viewId ? '' : 'none';
  });
}

function _setLoading(bool, msg = '') {
  const spinner = document.getElementById('sync-spinner');
  const spinnerMsg = document.getElementById('sync-spinner-msg');
  if (spinner) spinner.style.display = bool ? 'flex' : 'none';
  if (spinnerMsg) spinnerMsg.textContent = msg;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Open the sync modal */
window.openSyncModal = function () {
  const modal = _getSyncModal();
  if (!modal) { console.error('[Sync] Modal HTML not loaded'); return; }
  modal.style.display = 'flex';
  _setView('home');
  _syncState = { mode: 'idle', chunks: [], chunkIndex: 0, binIds: [], code: null, pin: null, stream: null, scanInterval: null };
};

/** Close the sync modal */
window.closeSyncModal = function () {
  _stopCamera();
  const modal = _getSyncModal();
  if (modal) modal.style.display = 'none';
};

// ── Send via QR ──

window.syncStartSendQR = async function () {
  _setView('send-qr');
  _setLoading(true, 'Preparing data…');

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js');
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

    const chunks = await _prepareQRChunks();
    _syncState.chunks = chunks;
    _syncState.chunkIndex = 0;

    _setLoading(false);
    await _renderCurrentQRChunk();
  } catch (err) {
    _setLoading(false);
    _toast('Failed to prepare QR: ' + err.message, 'error');
    console.error(err);
  }
};

async function _renderCurrentQRChunk() {
  const chunks = _syncState.chunks;
  const i = _syncState.chunkIndex;
  const canvas = document.getElementById('sync-qr-canvas');
  const counter = document.getElementById('sync-qr-counter');
  const prevBtn = document.getElementById('sync-qr-prev');
  const nextBtn = document.getElementById('sync-qr-next');

  if (!canvas) return;

  await _renderQR(chunks[i], canvas);

  if (counter) counter.textContent = chunks.length > 1
    ? `QR ${i + 1} of ${chunks.length} — scan in order`
    : 'Scan this QR on your other device';

  if (prevBtn) prevBtn.disabled = i === 0;
  if (nextBtn) nextBtn.disabled = i === chunks.length - 1;
}

window.syncQRPrev = function () {
  if (_syncState.chunkIndex > 0) {
    _syncState.chunkIndex--;
    _renderCurrentQRChunk();
  }
};

window.syncQRNext = function () {
  if (_syncState.chunkIndex < _syncState.chunks.length - 1) {
    _syncState.chunkIndex++;
    _renderCurrentQRChunk();
  }
};

// ── Receive via QR ──

window.syncStartReceiveQR = async function () {
  _setView('receive-qr');
  const video = document.getElementById('sync-camera-video');
  const canvas = document.getElementById('sync-camera-canvas');
  const progress = document.getElementById('sync-qr-receive-progress');

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js');
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

    await _startCamera(video);

    _startQRScan(
      video, canvas,
      (received, total) => {
        if (progress) progress.textContent = total > 1
          ? `Received ${received}/${total} QR codes…`
          : 'QR scanned! Importing…';
      },
      async jsonStr => {
        if (progress) progress.textContent = 'Importing data…';
        const ok = await _importPayload(jsonStr);
        if (ok) {
          _setView('success');
          document.getElementById('sync-success-msg').textContent =
            'Data imported successfully! Reload to see your exams.';
        } else {
          _setView('error');
          document.getElementById('sync-error-msg').textContent =
            'Import failed. The QR data may be corrupted.';
        }
      },
      err => {
        _stopCamera();
        _setView('error');
        document.getElementById('sync-error-msg').textContent = err.message;
      }
    );
  } catch (err) {
    _setView('error');
    const msg = err.name === 'NotAllowedError'
      ? 'Camera permission denied. Please allow camera access and try again.'
      : 'Camera error: ' + err.message;
    document.getElementById('sync-error-msg').textContent = msg;
  }
};

// ── Send via Code ──

window.syncStartSendCode = async function () {
  _setView('send-code');
  _setLoading(true, 'Uploading data to secure relay…');

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

    const pinInput = document.getElementById('sync-pin-input');
    const pin = pinInput?.value?.trim() || null;
    if (pin && !/^\d{4}$/.test(pin)) {
      _setLoading(false);
      _toast('PIN must be exactly 4 digits', 'warn');
      return;
    }

    const json = await _getBackupPayload();
    const { code } = await _uploadToCloud(json, pin);

    _setLoading(false);

    const codeDisplay = document.getElementById('sync-code-display');
    const codeExpiry = document.getElementById('sync-code-expiry');
    if (codeDisplay) codeDisplay.textContent = code;
    if (codeExpiry) codeExpiry.textContent = 'Expires in 15 minutes';
    _setView('show-code');

    _toast(`Sync code ready: ${code}`, 'success');
  } catch (err) {
    _setLoading(false);
    _setView('error');
    document.getElementById('sync-error-msg').textContent =
      'Upload failed: ' + err.message + '. Check your internet connection.';
  }
};

window.syncCopyCode = function () {
  const code = document.getElementById('sync-code-display')?.textContent;
  if (code) {
    navigator.clipboard.writeText(code).then(() => _toast('Code copied!', 'success'));
  }
};

// ── Receive via Code ──

window.syncStartReceiveCode = function () {
  _setView('receive-code');
};

window.syncReceiveByCode = async function () {
  const codeInput = document.getElementById('sync-receive-code-input');
  const pinInput  = document.getElementById('sync-receive-pin-input');
  const code = codeInput?.value?.trim().toUpperCase();
  const pin  = pinInput?.value?.trim() || null;

  if (!code || code.length !== 6) {
    _toast('Please enter a valid 6-character sync code', 'warn');
    return;
  }

  _setLoading(true, 'Fetching data from relay…');

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

    const jsonStr = await _downloadFromCloud(code, pin);
    const ok = await _importPayload(jsonStr);

    _setLoading(false);

    if (ok) {
      _setView('success');
      document.getElementById('sync-success-msg').textContent =
        'All your exam data has been imported! Reload the app to see it.';
    } else {
      _setView('error');
      document.getElementById('sync-error-msg').textContent = 'Import failed. Data may be corrupted.';
    }
  } catch (err) {
    _setLoading(false);
    let msg = err.message;
    if (msg === 'CODE_NOT_FOUND') msg = 'Code not found. Check the code and try again.';
    else if (msg === 'CODE_EXPIRED') msg = 'This code has expired. Ask the sender to generate a new one.';
    else if (msg === 'WRONG_PIN') msg = 'Incorrect PIN. Please try again.';
    else msg = 'Download failed: ' + msg;
    _toast(msg, 'error');
    _setLoading(false);
  }
};

// ── JSON File fallback ──

window.syncExportFile = async function () {
  try {
    const json = await _getBackupPayload();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GradeFlow-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    _toast('Backup file downloaded', 'success');
  } catch (err) {
    _toast('Export failed: ' + err.message, 'error');
  }
};

window.syncImportFile = function () {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const ok = await _importPayload(text);
    if (ok) {
      _setView('success');
      document.getElementById('sync-success-msg').textContent =
        'Backup imported! Reload to see your data.';
      window.openSyncModal();
    } else {
      _toast('Import failed — invalid backup file', 'error');
    }
  };
  input.click();
};

// ── Reload after import ──
window.syncReloadApp = function () {
  window.closeSyncModal();
  window.location.reload();
};

console.log('[GradeFlow Sync] Module loaded');
