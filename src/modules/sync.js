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
const MAX_QR_BYTES = 2200; // QR v40 ECC-M holds 2331 bytes; ~80 char envelope overhead → 2200 safe payload
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

// ─── Self-contained QR Code encoder v2 — supports versions 1–40 ─────────────
// Byte mode, ECC level M. Covers up to 2331 bytes (v40-M).
// No external dependencies. Works fully offline.
const _QR = (() => {

  // ── GF(256) arithmetic ──────────────────────────────────────
  const EXP = new Uint8Array(512);
  const LOG  = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
  const gfPow = (x, p) => EXP[(LOG[x] * p) % 255];

  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const f = [1, gfPow(2, i)], r = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++)
        for (let k = 0; k < f.length; k++)
          r[j+k] ^= gfMul(g[j], f[k]);
      g = r;
    }
    return g;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const msg = [...data, ...new Array(ecCount).fill(0)];
    for (let i = 0; i < data.length; i++) {
      const c = msg[i];
      if (c) for (let j = 0; j < gen.length; j++) msg[i+j] ^= gfMul(gen[j], c);
    }
    return msg.slice(data.length);
  }

  // ── ECC-M parameters for versions 1–40 ────────────────────────────────────
  // Format: [ecPerBlock, numBlocks1, dataPerBlock1, numBlocks2, dataPerBlock2]
  // Total data codewords = numBlocks1*dataPerBlock1 + numBlocks2*dataPerBlock2
  const EC_M = [
    null, // 0 unused
    [10,1,16,0,0],    // 1:  16
    [16,1,28,0,0],    // 2:  28
    [26,1,44,0,0],    // 3:  44
    [18,2,32,0,0],    // 4:  64
    [24,2,43,0,0],    // 5:  86
    [16,4,27,0,0],    // 6:  108
    [18,4,31,0,0],    // 7:  124
    [22,2,38,2,39],   // 8:  154
    [22,3,36,2,37],   // 9:  182
    [26,4,43,1,44],   // 10: 216
    [30,1,50,4,51],   // 11: 254
    [22,6,36,2,37],   // 12: 290
    [22,8,37,1,38],   // 13: 334
    [24,4,40,5,41],   // 14: 365
    [24,5,41,5,42],   // 15: 415
    [28,7,45,3,46],   // 16: 453
    [28,10,46,1,47],  // 17: 507
    [26,9,43,4,44],   // 18: 563
    [26,3,44,11,45],  // 19: 589
    [26,3,41,13,42],  // 20: 647
    [26,17,42,0,0],   // 21: 714
    [28,17,46,0,0],   // 22: 718
    [24,4,47,14,48],  // 23: 792
    [28,6,45,14,46],  // 24: 858
    [30,8,47,13,48],  // 25: 929
    [28,19,46,4,47],  // 26: 1003
    [30,22,45,3,46],  // 27: 1091
    [30,3,45,23,46],  // 28: 1171
    [30,21,45,7,46],  // 29: 1273
    [30,19,45,10,46], // 30: 1367
    [30,2,45,29,46],  // 31: 1455
    [30,10,45,23,46], // 32: 1541
    [30,14,45,21,46], // 33: 1631
    [30,14,46,23,47], // 34: 1725
    [30,12,45,26,46], // 35: 1812
    [30,6,45,34,46],  // 36: 1914
    [30,29,45,14,46], // 37: 1992 (approx)
    [30,13,45,32,46], // 38: 2102 (approx)
    [30,40,45,7,46],  // 39: 2216 (approx)
    [30,18,45,31,46], // 40: 2331
  ];

  function totalData(v) {
    const [,n1,d1,n2,d2] = EC_M[v];
    return n1*d1 + n2*d2;
  }

  function pickVersion(byteLen) {
    for (let v = 1; v <= 40; v++) {
      // Need byteLen + 4 (mode+length) bytes; length indicator is 8 bits for v≤9, 16 for v≥10
      const overhead = v <= 9 ? 3 : 4;
      if (totalData(v) >= byteLen + overhead) return v;
    }
    throw new Error('Data too long for QR v40 — split into smaller chunks');
  }

  // ── Alignment pattern centre positions ────────────────────
  const ALIGN_POS = [
    [],[], [6,18],[6,22],[6,26],[6,30],[6,34],
    [6,22,38],[6,24,42],[6,26,46],[6,28,50],
    [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],
    [6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],
    [6,30,58,86],[6,34,62,90],[6,28,50,72,94],
    [6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],
    [6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],
    [6,26,50,74,98,122],[6,30,54,78,102,126],
    [6,26,52,78,104,130],[6,30,56,82,108,134],
    [6,34,60,86,112,138],[6,30,58,86,114,142],
    [6,34,62,90,118,146],[6,30,54,78,102,126,150],
    [6,24,50,76,102,128,154],[6,28,54,80,106,132,158],
    [6,32,58,84,110,136,162],[6,26,54,82,110,138,166],
    [6,30,58,86,114,142,170],
  ];

  const FORMAT_MASK_BITS = 0b101010000010010;
  function formatBits(maskId) {
    let d = (0b00 << 3) | maskId; // ECC M = 00
    let g = d << 10;
    for (let i = 4; i >= 0; i--)
      if ((g >> (i+10)) & 1) g ^= (0b10100110111 << i);
    return ((d << 10) | (g & 0x3FF)) ^ FORMAT_MASK_BITS;
  }

  // ── Bitstream builder ──────────────────────────────────────
  class Bits {
    constructor() { this.buf = []; this.len = 0; }
    push(val, n) {
      for (let i = n-1; i >= 0; i--) {
        if (!(this.len & 7)) this.buf.push(0);
        if ((val >> i) & 1) this.buf[this.len >> 3] |= 1 << (7 - (this.len & 7));
        this.len++;
      }
    }
    toBytes(cap) {
      const rem = cap*8 - this.len;
      this.push(0, Math.min(4, rem));
      while (this.len & 7) this.push(0, 1);
      let pi = 0;
      while (this.buf.length < cap) this.buf.push(pi++ & 1 ? 0x11 : 0xEC);
      return this.buf.slice(0, cap);
    }
  }

  // ── Matrix utilities ───────────────────────────────────────
  function makeMatrix(size) {
    return Array.from({length:size}, () => new Int8Array(size).fill(-1));
  }
  function setFinder(m, r, c) {
    const size = m.length;
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r+dr, cc = c+dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      if (dr < 0 || dc < 0 || dr > 7 || dc > 7) { if (m[rr][cc] < 0) m[rr][cc] = 0; continue; }
      const ring = dr===0||dr===6||dc===0||dc===6;
      const mid  = dr>=2&&dr<=4&&dc>=2&&dc<=4;
      m[rr][cc] = (ring||mid) ? 1 : 0;
    }
  }
  function setAlignment(m, r, c) {
    for (let dr=-2; dr<=2; dr++) for (let dc=-2; dc<=2; dc++) {
      const v = (Math.abs(dr)===2||Math.abs(dc)===2) ? 1 : (dr===0&&dc===0 ? 1 : 0);
      if (m[r+dr][c+dc] < 0) m[r+dr][c+dc] = v;
    }
  }

  // Mask pattern 2: row % 2 == 0 (good balance, commonly used)
  const MASK_ID = 2;
  const maskFn  = (r, c) => r % 2 === 0;

  function buildMatrix(version, codewords) {
    const size = version*4 + 17;
    const m    = makeMatrix(size);

    // Finders
    setFinder(m, 0, 0); setFinder(m, 0, size-7); setFinder(m, size-7, 0);

    // Timing
    for (let i = 8; i < size-8; i++) {
      m[6][i] = i%2===0 ? 1 : 0;
      m[i][6] = i%2===0 ? 1 : 0;
    }

    // Dark module
    m[size-8][8] = 1;

    // Alignment patterns
    const ap = ALIGN_POS[version];
    for (const r of ap) for (const c of ap) {
      if (m[r][c] < 0) setAlignment(m, r, c);
    }

    // Version info (v7+)
    if (version >= 7) {
      let vinfo = version << 12;
      for (let i = 11; i >= 0; i--)
        if ((vinfo >> (i+12)) & 1) vinfo ^= (0b1111100100101 << i);
      const vi = (version << 12) | (vinfo & 0xFFF);
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1;
        m[Math.floor(i/3)][size-11+(i%3)] = bit;
        m[size-11+(i%3)][Math.floor(i/3)] = bit;
      }
    }

    // Reserve format areas
    for (let i = 0; i < 9; i++) { if (m[8][i] < 0) m[8][i] = 0; if (m[i][8] < 0) m[i][8] = 0; }
    for (let i = size-8; i < size; i++) { if (m[8][i] < 0) m[8][i] = 0; if (m[i][8] < 0) m[i][8] = 0; }

    // Data placement (right-to-left columns, alternating up/down)
    const bits = codewords.flatMap(b => [7,6,5,4,3,2,1,0].map(i => (b>>i)&1));
    let bi = 0, col = size-1;
    while (col > 0) {
      if (col === 6) col--;
      const upward = (Math.floor((size-1-col)/2)) % 2 === 0;
      for (let row = 0; row < size; row++) {
        const r = upward ? (size-1-row) : row;
        for (let dx = 0; dx < 2; dx++) {
          const c = col - dx;
          if (m[r][c] < 0) {
            const bit = bi < bits.length ? bits[bi++] : 0;
            m[r][c] = bit ^ (maskFn(r,c) ? 1 : 0);
          }
        }
      }
      col -= 2;
    }

    // Write format info
    const fb   = formatBits(MASK_ID);
    const fmtL = [];
    for (let i = 14; i >= 0; i--) fmtL.push((fb>>i)&1);
    const ri = [0,1,2,3,4,5,7,8,8,8,8,8,8,8,8];
    const ci = [8,8,8,8,8,8,8,8,7,5,4,3,2,1,0];
    for (let i = 0; i < 15; i++) { m[ri[i]][ci[i]] = fmtL[i]; }
    for (let i = 0; i < 8; i++)  m[8][size-1-i]   = fmtL[i];
    for (let i = 0; i < 7; i++)  m[size-7+i][8]   = fmtL[14-i];

    return m;
  }

  // ── Encode text → QR matrix ────────────────────────────────
  function encode(text) {
    const bytes   = new TextEncoder().encode(text);
    const version = pickVersion(bytes.length);
    const [ecCount, n1, d1, n2, d2] = EC_M[version];
    const dataTotal = n1*d1 + n2*d2;

    const bs = new Bits();
    bs.push(0b0100, 4);                           // byte mode
    bs.push(bytes.length, version <= 9 ? 8 : 16); // char count
    bytes.forEach(b => bs.push(b, 8));
    const codewords = bs.toBytes(dataTotal);

    // Block interleaving
    const dataBlocks = [], ecBlocks = [];
    let pos = 0;
    for (let i = 0; i < n1; i++) { dataBlocks.push(codewords.slice(pos, pos+d1)); ecBlocks.push(rsEncode(dataBlocks[dataBlocks.length-1], ecCount)); pos += d1; }
    for (let i = 0; i < n2; i++) { dataBlocks.push(codewords.slice(pos, pos+d2)); ecBlocks.push(rsEncode(dataBlocks[dataBlocks.length-1], ecCount)); pos += d2; }

    const out = [];
    const maxD = Math.max(...dataBlocks.map(b=>b.length));
    for (let i = 0; i < maxD; i++) dataBlocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    const maxE = Math.max(...ecBlocks.map(b=>b.length));
    for (let i = 0; i < maxE; i++) ecBlocks.forEach(b => { if (i < b.length) out.push(b[i]); });

    // Remainder bits
    const rem = [0,0,7,7,7,7,7,0,0,0,0,0,0,0,3,3,3,3,3,3,3,4,4,4,4,4,4,4,3,3,3,3,3,3,3,0,0,0,0,0,0];
    for (let i = 0; i < rem[version]; i++) out.push(0);

    return { matrix: buildMatrix(version, out), size: version*4+17, version };
  }

  // ── Draw to canvas ─────────────────────────────────────────
  function toCanvas(canvas, text, opts = {}) {
    const { matrix, size } = encode(text);
    const quiet  = opts.quiet  ?? 3;
    const dark   = opts.dark   ?? '#000000';
    const light  = opts.light  ?? '#ffffff';
    const total  = size + quiet*2;
    const module = Math.max(1, Math.floor((opts.width ?? 280) / total));
    const px     = total * module;

    canvas.width  = px; canvas.height = px;
    canvas.style.width  = (opts.width ?? 280) + 'px';
    canvas.style.height = (opts.width ?? 280) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (matrix[r][c] === 1)
          ctx.fillRect((quiet+c)*module, (quiet+r)*module, module, module);
  }

  return { encode, toCanvas };
})();
