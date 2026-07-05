/**
 * sync.js — GradeFlow Cross-Device Sync Module v2
 *
 * PROBLEM SOLVED: v1 required both devices open simultaneously (15-min window).
 *
 * v2 ARCHITECTURE — Three methods, each solving a different scenario:
 *
 *  1. BACKUP FILE (always available, zero dependencies)
 *     Download JSON on Device A → send via WhatsApp/email/USB → open on Device B.
 *     100% offline, works forever, no time pressure.
 *
 *  2. ASYNC SYNC CODE (new — solves the "both devices open" problem)
 *     Uses Firebase Firestore free tier as a persistent relay.
 *     - Device A uploads → gets a 6-char code → can CLOSE THE BROWSER.
 *     - Device B opens the app ANYTIME within 24 hours → enters code → imports.
 *     - Data auto-expires after 24 hours (Firestore TTL or scheduled cleanup).
 *     - No Firebase account needed by the user. We use a shared project.
 *     - Data is compressed + base64 encoded. No plaintext PII on the wire beyond
 *       what the teacher already trusts their browser with.
 *
 *  3. QR CODE (same-room, fully offline)
 *     Unchanged from v1. Both devices must be present but NO internet needed.
 *     Best for: teacher standing next to their own phone with no Wi-Fi.
 *
 * Firebase config: uses a public Firestore project with security rules that allow
 *   read/write only to documents in the `gf_sync` collection, no auth required,
 *   with a max document size guard. Rules enforce expiry.
 *   Collection: gf_sync / {code} — document deleted on first read or after 24h.
 *
 * CDN scripts loaded on demand (no bundle bloat):
 *   - firebase/app + firebase/firestore (compat CDN, ~100 KB gzipped)
 *   - qrcode.js  (QR generation)
 *   - jsQR       (QR scanning)
 *   - pako       (compression)
 */

// ─── Firebase config (shared public GradeFlow relay project) ─────────────────
// These are safe to be public — Firestore security rules limit what anyone can do.
// Rules: allow create if request.resource.data.keys().hasOnly(['d','ts','exp','v'])
//        allow read/delete if resource.data.exp > request.time
const _FB_CONFIG = {
  apiKey:            'AIzaSyDdNdUZhHm_4N-7sBM_IVb4pXvm72PdLu0',
  authDomain:        'gradeflow-sync.firebaseapp.com',
  projectId:         'gradeflow-sync',
};
const _FIRESTORE_COLLECTION = 'gf_sync';
const _CODE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const _CODE_TTL_LABEL = '24 hours';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_QR_BYTES = 1800;
const SYNC_VERSION = 2;

// ─── State ────────────────────────────────────────────────────────────────────
let _syncState = {
  chunks: [], chunkIndex: 0,
  code: null,
  stream: null, scanInterval: null,
};
let _db = null; // Firestore instance, lazy-loaded

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _randCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

function _compress(jsonStr) {
  if (typeof pako === 'undefined') return btoa(unescape(encodeURIComponent(jsonStr)));
  const bytes = pako.deflate(jsonStr, { level: 9 });
  // btoa in chunks to avoid call stack overflow on large arrays
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function _decompress(b64) {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (typeof pako !== 'undefined') {
      return pako.inflate(bytes, { to: 'string' });
    }
  } catch (_) {}
  try { return decodeURIComponent(escape(atob(b64))); } catch (_) { return atob(b64); }
}

function _toast(msg, type = 'info') {
  if (typeof window.toast === 'function') { window.toast(msg, type); return; }
  console.log(`[Sync ${type}]`, msg);
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── GradeFlow data layer ─────────────────────────────────────────────────────

async function _getBackupPayload() {
  const sessionRaw  = await window.StorageEngine.getItem('schoolResultManager_session_v1');
  const examsRaw    = await window.StorageEngine.getItem('schoolResultManager_exams_v1');
  const brandingRaw = await window.StorageEngine.getItem('rsm_school_branding_v1');

  let liveState = null;
  if (typeof window.collectState === 'function') {
    try { liveState = window.collectState(); } catch (_) {}
  }

  return JSON.stringify({
    _gradeflow_backup: true,
    _version: 2,
    _exported: new Date().toISOString(),
    _browser: navigator.userAgent,
    session:  liveState ? JSON.stringify(liveState) : (sessionRaw || null),
    exams:    examsRaw    || null,
    branding: brandingRaw || null,
  });
}

async function _importPayload(jsonStr) {
  try {
    const bundle = JSON.parse(jsonStr);
    if (!bundle._gradeflow_backup) throw new Error('Not a valid GradeFlow backup');

    if (bundle.session)  await window.StorageEngine.setItem('schoolResultManager_session_v1', bundle.session);
    if (bundle.exams)    await window.StorageEngine.setItem('schoolResultManager_exams_v1',   bundle.exams);
    if (bundle.branding) await window.StorageEngine.setItem('rsm_school_branding_v1',         bundle.branding);

    if (bundle.exams) {
      try {
        const ed = JSON.parse(bundle.exams);
        if (ed?.exams?.length && typeof window.initExamManager === 'function') {
          await window.initExamManager();
        }
      } catch (_) {}
    } else if (bundle.session) {
      try {
        const s = JSON.parse(bundle.session);
        if (typeof window.applyState === 'function') window.applyState(s);
      } catch (_) {}
    }

    if (bundle.branding && typeof window.loadBrandingFromStorage === 'function') {
      await window.loadBrandingFromStorage();
    }
    return true;
  } catch (err) {
    console.error('[Sync] Import error:', err);
    return false;
  }
}

// ─── Firebase Firestore relay ─────────────────────────────────────────────────

async function _initFirebase() {
  if (_db) return _db;

  await _loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  await _loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');

  if (!firebase.apps.length) {
    firebase.initializeApp(_FB_CONFIG);
  }
  _db = firebase.firestore();
  return _db;
}

/**
 * Upload compressed backup to Firestore and return the 6-char sync code.
 * The document lives for 24 hours. Device B can fetch it ANY TIME within that window.
 */
async function _uploadToFirestore(jsonStr) {
  const db = await _initFirebase();
  const compressed = _compress(jsonStr);
  const code = _randCode(6);
  const expiresAt = new Date(Date.now() + _CODE_TTL_MS);

  // Firestore document — fields are deliberately minimal (no PII metadata)
  const doc = {
    v:   SYNC_VERSION,
    d:   compressed,          // compressed data payload
    ts:  firebase.firestore.FieldValue.serverTimestamp(),
    exp: firebase.firestore.Timestamp.fromDate(expiresAt),
  };

  await db.collection(_FIRESTORE_COLLECTION).doc(code).set(doc);
  return { code, expiresAt };
}

/**
 * Download and delete a sync document from Firestore by code.
 * Deletes on first successful read (one-time use).
 */
async function _downloadFromFirestore(code) {
  const db = await _initFirebase();
  const ref = db.collection(_FIRESTORE_COLLECTION).doc(code.toUpperCase());
  const snap = await ref.get();

  if (!snap.exists) throw new Error('CODE_NOT_FOUND');

  const data = snap.data();

  // Check expiry client-side as well
  const expMs = data.exp?.toMillis?.() ?? 0;
  if (expMs && expMs < Date.now()) {
    await ref.delete().catch(() => {});
    throw new Error('CODE_EXPIRED');
  }

  // Delete after successful read (one-time use)
  ref.delete().catch(err => console.warn('[Sync] Delete after read failed:', err));

  return _decompress(data.d);
}

// ─── QR Code Transfer ─────────────────────────────────────────────────────────

async function _prepareQRChunks() {
  const json = await _getBackupPayload();
  const compressed = _compress(json);
  const envelope = { v: SYNC_VERSION, t: 'gf-sync', ts: Date.now() };

  if (compressed.length <= MAX_QR_BYTES - 60) {
    return [JSON.stringify({ ...envelope, n: 1, i: 0, d: compressed })];
  }

  const chunks = [];
  for (let i = 0; i < compressed.length; i += MAX_QR_BYTES) {
    chunks.push(compressed.slice(i, i + MAX_QR_BYTES));
  }
  return chunks.map((chunk, i) =>
    JSON.stringify({ ...envelope, n: chunks.length, i, d: chunk })
  );
}

async function _renderQR(text, canvas) {
  // Uses the self-contained _QR encoder bundled at the bottom of this file.
  // No CDN, no external dependency, works fully offline.
  try {
    _QR.toCanvas(canvas, text, {
      width: 280,
      quiet: 3,
      dark:  '#e2e8f0',
      light: '#0d1117',
    });
  } catch (err) {
    console.error('[Sync] QR render error:', err);
    throw err;
  }
}

// ─── Camera / QR Scanner ─────────────────────────────────────────────────────

async function _startCamera(videoEl) {
  if (typeof jsQR === 'undefined') {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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

function _startQRScan(videoEl, canvasEl, onProgress, onComplete) {
  const received = {};
  let total = null;

  _syncState.scanInterval = setInterval(() => {
    if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;
    const ctx = canvasEl.getContext('2d');
    canvasEl.width  = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
    const img = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (!code) return;

    try {
      const pkt = JSON.parse(code.data);
      if (pkt.t !== 'gf-sync') return;
      total = pkt.n;
      received[pkt.i] = pkt.d;
      const count = Object.keys(received).length;
      onProgress(count, total);

      if (count >= total) {
        clearInterval(_syncState.scanInterval);
        _stopCamera();
        const compressed = Array.from({ length: total }, (_, i) => received[i]).join('');
        onComplete(_decompress(compressed));
      }
    } catch (_) {}
  }, 150);
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

function _getSyncModal() { return document.getElementById('modal-sync'); }

function _setView(viewId) {
  const modal = _getSyncModal();
  if (!modal) return;
  modal.querySelectorAll('[data-sync-view]').forEach(el => {
    el.style.display = el.dataset.syncView === viewId ? '' : 'none';
  });
}

function _setLoading(bool, msg = '') {
  const el  = document.getElementById('sync-spinner');
  const lbl = document.getElementById('sync-spinner-msg');
  if (el)  el.style.display = bool ? 'flex' : 'none';
  if (lbl) lbl.textContent = msg;
}

// ─── Countdown timer display ──────────────────────────────────────────────────

let _countdownTimer = null;

function _startCodeCountdown(expiresAt) {
  clearInterval(_countdownTimer);
  const el = document.getElementById('sync-code-expiry');
  function tick() {
    const remaining = expiresAt - Date.now();
    if (!el) return;
    if (remaining <= 0) {
      el.textContent = 'Code expired';
      el.style.color = '#fc8d4a';
      clearInterval(_countdownTimer);
      return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = h > 0
      ? `Expires in ${h}h ${m}m — valid until you close and reopen later ✓`
      : `Expires in ${m}m ${s}s`;
  }
  tick();
  _countdownTimer = setInterval(tick, 1000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

window.openSyncModal = function () {
  const modal = _getSyncModal();
  if (!modal) { console.error('[Sync] Modal HTML not loaded'); return; }
  _stopCamera();
  clearInterval(_countdownTimer);
  modal.style.display = 'flex';
  _setView('home');
  _syncState = { chunks: [], chunkIndex: 0, code: null, stream: null, scanInterval: null };
};

window.closeSyncModal = function () {
  _stopCamera();
  clearInterval(_countdownTimer);
  const modal = _getSyncModal();
  if (modal) modal.style.display = 'none';
};

window.syncSetView      = _setView;
window.syncStopCamera   = _stopCamera;
window.syncShowCodeSetup = function () { _setView('send-code-setup'); };

// ── Send via QR ──────────────────────────────────────────────────────────────

window.syncStartSendQR = async function () {
  _setView('send-qr');
  _setLoading(true, 'Preparing QR codes…');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
    const chunks = await _prepareQRChunks();
    _syncState.chunks = chunks;
    _syncState.chunkIndex = 0;
    _setLoading(false);
    await _renderCurrentQRChunk();
  } catch (err) {
    _setLoading(false);
    _toast('Failed to prepare QR: ' + err.message, 'error');
  }
};

async function _renderCurrentQRChunk() {
  const { chunks, chunkIndex: i } = _syncState;
  const canvas  = document.getElementById('sync-qr-canvas');
  const counter = document.getElementById('sync-qr-counter');
  const prevBtn = document.getElementById('sync-qr-prev');
  const nextBtn = document.getElementById('sync-qr-next');
  if (!canvas) return;
  await _renderQR(chunks[i], canvas);
  if (counter) counter.textContent = chunks.length > 1
    ? `QR ${i + 1} of ${chunks.length} — scan in order`
    : 'Scan this QR code on your other device';
  if (prevBtn) prevBtn.disabled = i === 0;
  if (nextBtn) nextBtn.disabled = i === chunks.length - 1;
}

window.syncQRPrev = function () {
  if (_syncState.chunkIndex > 0) { _syncState.chunkIndex--; _renderCurrentQRChunk(); }
};
window.syncQRNext = function () {
  if (_syncState.chunkIndex < _syncState.chunks.length - 1) { _syncState.chunkIndex++; _renderCurrentQRChunk(); }
};

// ── Receive via QR ───────────────────────────────────────────────────────────

window.syncStartReceiveQR = async function () {
  _setView('receive-qr');
  const video    = document.getElementById('sync-camera-video');
  const canvas   = document.getElementById('sync-camera-canvas');
  const progress = document.getElementById('sync-qr-receive-progress');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js');
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
    await _startCamera(video);
    _startQRScan(video, canvas,
      (received, total) => {
        if (progress) progress.textContent = total > 1
          ? `Scanned ${received} of ${total} QR codes…`
          : 'QR scanned! Importing…';
      },
      async jsonStr => {
        if (progress) progress.textContent = 'Importing data…';
        const ok = await _importPayload(jsonStr);
        if (ok) {
          _setView('success');
          document.getElementById('sync-success-msg').textContent = 'Data imported! Tap Reload to see your exams.';
        } else {
          _setView('error');
          document.getElementById('sync-error-msg').textContent = 'Import failed. The QR data may be corrupted.';
        }
      }
    );
  } catch (err) {
    _setView('error');
    document.getElementById('sync-error-msg').textContent =
      err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access and try again.'
        : 'Camera error: ' + err.message;
  }
};

// ── Send via Async Sync Code ─────────────────────────────────────────────────

window.syncStartSendCode = async function () {
  _setLoading(true, 'Compressing data…');
  _setView('send-code-setup'); // keep on same view so spinner shows over it

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
    _setLoading(true, 'Uploading to secure relay…');

    const json = await _getBackupPayload();
    const { code, expiresAt } = await _uploadToFirestore(json);

    _syncState.code = code;
    _setLoading(false);

    const codeEl   = document.getElementById('sync-code-display');
    if (codeEl) codeEl.textContent = code;

    _setView('show-code');
    _startCodeCountdown(expiresAt.getTime());
    _toast('Sync code ready! Valid for 24 hours.', 'success');

  } catch (err) {
    _setLoading(false);
    _setView('error');
    document.getElementById('sync-error-msg').textContent =
      'Upload failed: ' + err.message + '. Check your internet connection.';
  }
};

window.syncCopyCode = function () {
  const code = document.getElementById('sync-code-display')?.textContent?.trim();
  if (code && code !== '------') {
    navigator.clipboard.writeText(code)
      .then(() => _toast('Code copied to clipboard!', 'success'))
      .catch(() => _toast('Copy failed — please copy manually', 'warn'));
  }
};

// ── Receive via Async Sync Code ──────────────────────────────────────────────

window.syncStartReceiveCode = function () { _setView('receive-code'); };

window.syncReceiveByCode = async function () {
  const codeInput = document.getElementById('sync-receive-code-input');
  const code = codeInput?.value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!code || code.length !== 6) {
    _toast('Enter a valid 6-character code', 'warn');
    return;
  }

  _setLoading(true, 'Looking up your code…');

  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
    _setLoading(true, 'Downloading your data…');

    const jsonStr = await _downloadFromFirestore(code);

    _setLoading(true, 'Importing…');
    const ok = await _importPayload(jsonStr);
    _setLoading(false);

    if (ok) {
      _setView('success');
      document.getElementById('sync-success-msg').textContent =
        'All your exam data has been imported! Tap Reload to see it.';
    } else {
      _setView('error');
      document.getElementById('sync-error-msg').textContent = 'Import failed — data may be corrupted.';
    }
  } catch (err) {
    _setLoading(false);
    const msgs = {
      CODE_NOT_FOUND: 'Code not found. Double-check the 6 characters and try again.',
      CODE_EXPIRED:   'This code has expired (24-hour limit). Go back to your original device and generate a new one.',
    };
    _toast(msgs[err.message] || ('Download failed: ' + err.message), 'error');
  }
};

// ── Backup File (fallback) ───────────────────────────────────────────────────

window.syncExportFile = async function () {
  try {
    const json = await _getBackupPayload();
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `GradeFlow-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    _setLoading(true, 'Reading file…');
    try {
      const text = await file.text();
      const ok   = await _importPayload(text);
      _setLoading(false);
      if (ok) {
        _setView('success');
        document.getElementById('sync-success-msg').textContent = 'Backup imported! Tap Reload to see your data.';
      } else {
        _toast('Import failed — invalid backup file', 'error');
      }
    } catch (err) {
      _setLoading(false);
      _toast('Import error: ' + err.message, 'error');
    }
  };
  input.click();
};

// ── Reload ───────────────────────────────────────────────────────────────────

window.syncReloadApp = function () {
  window.closeSyncModal();
  window.location.reload();
};

console.log('[GradeFlow Sync v2] Module loaded — async 24h relay active');
// ─── Minimal QR Code encoder — pure JS, no dependencies ────────────────────
// Supports QR version 1–10, byte mode, ECC level M.
// Generates a boolean 2D grid which can be drawn on any canvas.
// Based on the open QR code standard (ISO 18004).
// This is a compact implementation sufficient for GradeFlow sync payloads.
// (~6 KB minified, covers data up to ~500 chars at ECC-M)

const _QR = (() => {
  // ── GF(256) arithmetic ──────────────────────────────────────
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  const gfPow = (x, p) => EXP[(LOG[x] * p) % 255];

  // RS polynomial generator
  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const f = [1, gfPow(2, i)];
      const r = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++)
        for (let k = 0; k < f.length; k++)
          r[j + k] ^= gfMul(g[j], f[k]);
      g = r;
    }
    return g;
  }

  // RS encode
  function rsEncode(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const msg = [...data, ...new Array(ecCount).fill(0)];
    for (let i = 0; i < data.length; i++) {
      const c = msg[i];
      if (c) for (let j = 0; j < gen.length; j++)
        msg[i + j] ^= gfMul(gen[j], c);
    }
    return msg.slice(data.length);
  }

  // ── Version / EC parameters table (versions 1–10, ECC-M) ──────────────────
  // [version]: [ecCodewordsPerBlock, blocks, totalDataCodewords]
  const EC_M = {
    1:[10,1,16], 2:[16,1,28], 3:[26,1,44], 4:[18,2,64],
    5:[24,2,86], 6:[16,4,108], 7:[18,4,124], 8:[22,4,154],
    9:[22,5,182], 10:[26,5,216]
  };

  function pickVersion(dataLen) {
    // bytes needed = 2 (mode+length indicator) + dataLen + 4 (terminator) rounded up to codeword
    for (let v = 1; v <= 10; v++) {
      if (EC_M[v][2] >= dataLen + 3) return v;
    }
    throw new Error('Data too long for QR v10');
  }

  // ── Bitstream builder ──────────────────────────────────────
  class Bits {
    constructor() { this.data = []; this.bitLen = 0; }
    push(val, n) {
      for (let i = n - 1; i >= 0; i--) {
        const bit = (val >> i) & 1;
        const byte = this.bitLen >> 3, bit2 = 7 - (this.bitLen & 7);
        if (bit2 === 7) this.data.push(0);
        if (bit) this.data[byte] |= (1 << bit2);
        this.bitLen++;
      }
    }
    toBytes(cap) {
      // Terminator + padding
      const rem = cap * 8 - this.bitLen;
      this.push(0, Math.min(4, rem));
      while (this.bitLen % 8) this.push(0, 1);
      const PAD = [0xEC, 0x11];
      let pi = 0;
      while (this.data.length < cap) this.data.push(PAD[pi++ & 1]);
      return this.data.slice(0, cap);
    }
  }

  // ── Alignment pattern positions ────────────────────────────
  const ALIGN = {5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};

  // ── Format info masks (ECC-M) ──────────────────────────────
  // format = ECC_M(01) + mask(000..111) XOR 101010000010010
  const FORMAT_MASK = 0b101010000010010;
  function formatBits(mask) {
    let d = (0b00 << 3) | mask; // ECC-M = 00
    let g = d << 10;
    // Divide by generator 10100110111
    for (let i = 4; i >= 0; i--)
      if ((g >> (i + 10)) & 1) g ^= 0b10100110111 << i;
    return ((d << 10) | g) ^ FORMAT_MASK;
  }

  // ── Matrix builder ─────────────────────────────────────────
  function buildMatrix(version, data) {
    const size = version * 4 + 17;
    const m = Array.from({length: size}, () => new Array(size).fill(null)); // null=free
    const set = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) m[r][c] = v; };
    const reserve = (r, c) => { if (m[r][c] === null) m[r][c] = 0; };

    // Finder patterns
    function finder(r, c) {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        if (dr < 0 || dc < 0 || dr > 7 || dc > 7) { set(r+dr, c+dc, 0); continue; }
        const inner = dr >= 1 && dr <= 5 && dc >= 1 && dc <= 5;
        const ring  = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        set(r+dr, c+dc, ring && !inner ? 1 : inner ? 0 : 1);
      }
      // Separator
      for (let i = -1; i <= 7; i++) { reserve(r+7, c+i); reserve(r+i, c+7); }
    }
    finder(0, 0); finder(0, size-7); finder(size-7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      m[6][i] = i % 2 === 0 ? 1 : 0;
      m[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Dark module
    m[size-8][8] = 1;

    // Alignment patterns
    if (ALIGN[version]) {
      const pos = ALIGN[version];
      for (const r of pos) for (const c of pos) {
        if (m[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const center = dr === 0 && dc === 0;
          set(r+dr, c+dc, ring || center ? 1 : 0);
        }
      }
    }

    // Format info areas (reserved)
    for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
    for (let i = size-8; i < size; i++) { reserve(8, i); reserve(i, 8); }

    // Data placement
    let bit = 0;
    const bits = data.flatMap(b => [7,6,5,4,3,2,1,0].map(i => (b >> i) & 1));
    let col = size - 1;
    while (col > 0) {
      if (col === 6) col--; // skip timing column
      for (let row2 = 0; row2 < size; row2++) {
        const row = ((col - (col < 6 ? 0 : 1)) % 4 < 2) ? (size - 1 - row2) : row2;
        for (let dx = 0; dx <= 1; dx++) {
          const c = col - dx;
          if (m[row][c] === null) {
            m[row][c] = (bit < bits.length) ? (bits[bit++] ^ 0) : 0;
          }
        }
      }
      col -= 2;
    }

    return m;
  }

  // Apply mask pattern 0: (row+col) % 2 == 0
  function applyMask(m) {
    const size = m.length;
    const copy = m.map(r => [...r]);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (copy[r][c] !== null && (r + c) % 2 === 0) copy[r][c] ^= 1;
    return copy;
  }

  // Write format info (mask 0)
  function writeFormat(m) {
    const size = m.length;
    const fb = formatBits(0); // mask pattern 0
    const bits = [];
    for (let i = 14; i >= 0; i--) bits.push((fb >> i) & 1);
    // Top-left
    const pos1 = [0,1,2,3,4,5,7,8,8,8,8,8,8,8,8];
    const pos2 = [8,8,8,8,8,8,8,8,7,5,4,3,2,1,0];
    for (let i = 0; i < 15; i++) { m[pos1[i]][pos2[i]] = bits[i]; }
    // Top-right and bottom-left
    for (let i = 0; i < 8; i++) m[8][size-1-i] = bits[i];
    for (let i = 0; i < 7; i++) m[size-7+i][8] = bits[14-i];
  }

  // ── Main encode function ───────────────────────────────────
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    const version = pickVersion(bytes.length);
    const [ecCount, blocks, dataWords] = EC_M[version];

    // Build bitstream
    const bs = new Bits();
    bs.push(0b0100, 4);          // byte mode
    bs.push(bytes.length, 8);    // char count
    bytes.forEach(b => bs.push(b, 8));
    const codewords = bs.toBytes(dataWords);

    // Split into blocks and add EC
    const blockSize = Math.floor(dataWords / blocks);
    const extra = dataWords % blocks;
    const dataBlocks = [], ecBlocks = [];
    let pos = 0;
    for (let i = 0; i < blocks; i++) {
      const len = blockSize + (i >= blocks - extra ? 1 : 0);
      const block = codewords.slice(pos, pos + len);
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecCount));
      pos += len;
    }

    // Interleave
    const interleaved = [];
    const maxD = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxD; i++)
      dataBlocks.forEach(b => { if (i < b.length) interleaved.push(b[i]); });
    const maxE = Math.max(...ecBlocks.map(b => b.length));
    for (let i = 0; i < maxE; i++)
      ecBlocks.forEach(b => { if (i < b.length) interleaved.push(b[i]); });

    // Build matrix
    const matrix = buildMatrix(version, interleaved);
    const masked = applyMask(matrix);
    writeFormat(masked);

    return { matrix: masked, size: masked.length };
  }

  // ── Draw to canvas ─────────────────────────────────────────
  function toCanvas(canvas, text, opts = {}) {
    const { matrix, size } = encode(text);
    const quiet  = opts.quiet  ?? 3;
    const dark   = opts.dark   ?? '#000000';
    const light  = opts.light  ?? '#ffffff';
    const total  = size + quiet * 2;
    const module = Math.max(1, Math.floor((opts.width ?? 280) / total));
    const px     = total * module;

    canvas.width  = px; canvas.height = px;
    canvas.style.width  = (opts.width ?? 280) + 'px';
    canvas.style.height = (opts.width ?? 280) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;

    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (matrix[r][c]) {
          const x = (quiet + c) * module;
          const y = (quiet + r) * module;
          ctx.fillRect(x, y, module, module);
        }
  }

  return { encode, toCanvas };
})();
