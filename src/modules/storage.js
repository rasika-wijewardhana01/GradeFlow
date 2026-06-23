// ═══════════════════════════════════════════════════════════════
//  src/modules/storage.js
//  StorageEngine: File System API (Tier 1) + IndexedDB (Tier 2).
//  Self-contained IIFE — zero dependencies on app state.
//  Lifted verbatim from app.js lines 2852–3274.
// ═══════════════════════════════════════════════════════════════
const StorageEngine = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  //  LAYER 1 — IndexedDB  (primary store for all app data)
  //
  //  Database : 'gradeflow_db'   version 3
  //  Stores   :
  //    'data'    — key/value for app data (session, exams, branding)
  //    'handles' — FileSystemDirectoryHandle persistence (unchanged)
  //
  //  Version history:
  //    v1 — original: 'handles' store only
  //    v2 — added 'data' store (but some deployments created v2 without it)
  //    v3 — repairs v2 databases that are missing the 'data' store
  //
  //  Why IndexedDB instead of localStorage?
  //    • localStorage is limited to ~5 MB per origin.  A school with many
  //      classes, exams, and branding assets can exceed this easily.
  //    • IndexedDB can hold 50 MB–1 GB+ depending on the browser/OS.
  //    • Reads/writes are async so they never block the UI thread.
  //    • Structured objects are stored natively — no JSON.stringify overhead
  //      for the engine itself (we still stringify at the call-site for
  //      backwards compatibility with the rest of the app).
  // ════════════════════════════════════════════════════════════════════════

  const _IDB_NAME    = 'gradeflow_db';
  const _IDB_VERSION = 3;           // bumped to 3 → repairs missing 'data' store in broken v2 DBs
  const _DATA_STORE  = 'data';      // app data (session / exams / branding)
  const _HDL_STORE   = 'handles';   // dir handle (pre-existing)

  // Singleton DB connection — opened once, reused for every operation
  let _dbPromise = null;

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);

      req.onupgradeneeded = function (e) {
        const db      = e.target.result;
        const oldVer  = e.oldVersion;

        // 'handles' store — existed from version 1
        if (!db.objectStoreNames.contains(_HDL_STORE)) {
          db.createObjectStore(_HDL_STORE);
        }
        // 'data' store — new in version 2
        if (!db.objectStoreNames.contains(_DATA_STORE)) {
          db.createObjectStore(_DATA_STORE);
          console.log('[StorageEngine] IndexedDB upgraded to v3 — data store created.');
        }
      };

      req.onsuccess = function (e) {
        const db = e.target.result;

        // ── Post-open validation ─────────────────────────────────────────────
        // Guard against a specific corruption: the DB is already at the target
        // version (so onupgradeneeded never fired) but a *previous* deployment
        // created it without the 'data' store.  Every subsequent transaction on
        // that store throws NotFoundError, silently destroying all reads/writes.
        // Fix: close this handle, open one version higher (forcing onupgradeneeded),
        //      and create any missing stores there.
        if (!db.objectStoreNames.contains(_DATA_STORE)) {
          console.warn(
            '[StorageEngine] DB is at v' + db.version +
            ' but missing "data" store — repairing at v' + (db.version + 1) + '…'
          );
          const repairVer = db.version + 1;
          db.close();

          const repairPromise = new Promise((res2, rej2) => {
            const rr = indexedDB.open(_IDB_NAME, repairVer);
            rr.onupgradeneeded = function (re) {
              const rdb = re.target.result;
              if (!rdb.objectStoreNames.contains(_HDL_STORE)) {
                rdb.createObjectStore(_HDL_STORE);
              }
              if (!rdb.objectStoreNames.contains(_DATA_STORE)) {
                rdb.createObjectStore(_DATA_STORE);
                console.log('[StorageEngine] Repair complete: data store created at v' + repairVer + '.');
              }
            };
            rr.onsuccess = re => res2(re.target.result);
            rr.onerror   = re => rej2(re.target.error);
          });

          // Replace cached promise so future _openDB() calls reuse the repair result
          _dbPromise = repairPromise;
          repairPromise.then(resolve).catch(reject);
          return;
        }

        resolve(db);
      };
      req.onerror   = e => {
        console.warn('[StorageEngine] IndexedDB open failed:', e.target.error);
        // Clear the cached promise so future calls can retry rather than
        // returning the permanently-rejected promise.
        _dbPromise = null;
        reject(e.target.error);
      };
    });
    return _dbPromise;
  }

  // ── Low-level IDB helpers ────────────────────────────────────────────────

  async function _idbGet(store, key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  }

  async function _idbSet(store, key, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  async function _idbDelete(store, key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MIGRATION  — runs once, silently moves localStorage data → IndexedDB
  //
  //  The flag 'gf_idb_migrated_v2' is a tiny string stored in localStorage
  //  (acceptable — it is metadata, not app data).  Once set it never runs
  //  again.  After migration completes, localStorage is never read for app
  //  data; IDB is the sole browser-side store going forward.
  // ════════════════════════════════════════════════════════════════════════

  const _MIGRATED_FLAG = 'gf_idb_migrated_v2';

  // Keys that should be migrated from localStorage → IndexedDB
  const _MIGRATE_KEYS = [
    'schoolResultManager_session_v1',
    'schoolResultManager_exams_v1',
    'rsm_school_branding_v1',
  ];

  async function _migrateFromLocalStorage() {
    // Already done
    if (localStorage.getItem(_MIGRATED_FLAG)) return;

    let anyMigrated = false;
    for (const key of _MIGRATE_KEYS) {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch (_) {}
      if (raw === null) continue;

      try {
        // Store as raw string in IDB — call-sites already stringify/parse
        await _idbSet(_DATA_STORE, key, raw);
        anyMigrated = true;
        console.log('[StorageEngine] Migrated key to IndexedDB:', key);
      } catch (e) {
        // If IDB write fails, abort whole migration so we retry next time
        console.warn('[StorageEngine] Migration write failed for key:', key, e);
        return;
      }
    }

    // Mark complete.  Legacy LS keys are left in place and swept out lazily
    // by removeItem() calls; they are never read again by this engine.
    try { localStorage.setItem(_MIGRATED_FLAG, '1'); } catch (_) {}

    if (anyMigrated) {
      console.log('[StorageEngine] Migration to IndexedDB complete.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LAYER 2 — File System Access API  (optional, user-chosen folder)
  //
  //  Unchanged from the original implementation — the only difference is
  //  that the directory handle is now stored in the same IDB database
  //  (version-2 'handles' store) rather than a separate DB.
  // ════════════════════════════════════════════════════════════════════════

  let _dirHandle   = null;
  let _needsReauth = false;  // true when handle is loaded but permission is 'prompt'

  function _detectFSASupport() {
    if (!('showDirectoryPicker' in window)) return false;
    if (!window.isSecureContext) return false;
    try {
      if (window.self !== window.top) {
        try { void window.top.location.origin; }
        catch (_) { return false; }
      }
    } catch (_) { return false; }
    return true;
  }
  let _supported = _detectFSASupport();

  function _fname(key) {
    return key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
  }

  async function _fileSet(key, value) {
    try {
      const fh = await _dirHandle.getFileHandle(_fname(key), { create: true });
      const w  = await fh.createWritable();
      await w.write(value);
      await w.close();
    } catch (e) {
      console.warn('[StorageEngine] fileSet failed, falling back:', e);
      await _idbSet(_DATA_STORE, key, value);
    }
  }

  async function _fileGet(key) {
    try {
      const fh   = await _dirHandle.getFileHandle(_fname(key));
      const file = await fh.getFile();
      return await file.text();
    } catch (_) { return null; }
  }

  async function _fileRemove(key) {
    try { await _dirHandle.removeEntry(_fname(key)); } catch (_) {}
  }

  async function _persistHandle(handle) {
    try { await _idbSet(_HDL_STORE, 'dir', handle); }
    catch (e) { console.warn('[StorageEngine] Could not persist handle:', e); }
  }

  async function _loadHandle() {
    try { return await _idbGet(_HDL_STORE, 'dir') || null; }
    catch (_) { return null; }
  }

  async function _clearHandle() {
    try { await _idbDelete(_HDL_STORE, 'dir'); } catch (_) {}
  }

  async function _tryRestoreHandle() {
    if (!_supported) return false;
    const saved = await _loadHandle();
    if (!saved) return false;
    try {
      const perm = await saved.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _dirHandle   = saved;
        _needsReauth = false;
        _updateSaveLocationUI(true);
        return true;
      }
      _dirHandle   = saved;
      _needsReauth = true;   // permission is 'prompt' — user must re-authorize
      _updateSaveLocationUI(false, true);
      return false;
    } catch (_) { return false; }
  }

  let _pickerOpen = false;
  async function requestDirectory() {
    if (!_supported) { _showUnsupportedNotice(); return false; }
    if (_pickerOpen) return false;
    _pickerOpen = true;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      _dirHandle = handle;
      await _persistHandle(handle);
      _updateSaveLocationUI(true);
      _showFileSaveToast();
      return true;
    } catch (e) {
      if (e.name === 'SecurityError') {
        _supported = false;
        console.warn('[StorageEngine] showDirectoryPicker blocked. Falling back to IndexedDB.', e);
        _showUnsupportedNotice();
      } else if (e.name === 'NotAllowedError') {
        console.warn('[StorageEngine] showDirectoryPicker NotAllowedError.', e);
      } else if (e.name !== 'AbortError') {
        console.warn('[StorageEngine] Picker error:', e);
      }
      return false;
    } finally { _pickerOpen = false; }
  }

  async function _reauthorize() {
    if (!_dirHandle) return false;
    try {
      const perm = await _dirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _needsReauth = false;
        _updateSaveLocationUI(true);
        _showFileSaveToast();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function releaseDirectory() {
    _dirHandle = null;
    _clearHandle();
    _updateSaveLocationUI(false);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  //
  //  Priority chain for reads/writes:
  //    1. File System folder  (if user chose one and permission is active)
  //    2. IndexedDB           (sole browser-side store — always available
  //                            thanks to the v3 repair logic above)
  //
  //  localStorage is NOT used as a data store.  The one-time migration in
  //  _migrateFromLocalStorage() pulled any legacy LS data into IDB on first
  //  load and that is the only time localStorage is touched for app data.
  // ════════════════════════════════════════════════════════════════════════

  async function setItem(key, value) {
    // ── Tier 1: file system ──
    if (_dirHandle) {
      try {
        const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await _fileSet(key, value);
          // Mirror to IDB so a reload without folder permission still works.
          // This is a best-effort mirror; the file is the authoritative copy.
          try { await _idbSet(_DATA_STORE, key, value); } catch (_) {}
          return;
        }
        _updateSaveLocationUI(false, true);
      } catch (_) {}
    }
    // ── Tier 2: IndexedDB (sole browser-side store) ──
    try {
      await _idbSet(_DATA_STORE, key, value);
    } catch (e) {
      console.error('[StorageEngine] IDB setItem failed — data NOT saved:', e);
      // Fire a custom event so the app can surface a visible warning to the user
      window.dispatchEvent(new CustomEvent('gf:storage-error', {
        detail: { op: 'setItem', key, error: e }
      }));
    }
  }

  async function getItem(key) {
    // ── Tier 1: file system ──
    if (_dirHandle) {
      try {
        const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const v = await _fileGet(key);
          if (v !== null) return v;
          // File missing → fall through to IDB (handles first-launch migration)
        }
      } catch (_) {}
    }
    // ── Tier 2: IndexedDB (sole browser-side store) ──
    try {
      return await _idbGet(_DATA_STORE, key);
    } catch (e) {
      console.error('[StorageEngine] IDB getItem failed:', e);
      window.dispatchEvent(new CustomEvent('gf:storage-error', {
        detail: { op: 'getItem', key, error: e }
      }));
      return null;
    }
  }

  async function removeItem(key) {
    if (_dirHandle) {
      try {
        const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') await _fileRemove(key);
      } catch (_) {}
    }
    try { await _idbDelete(_DATA_STORE, key); } catch (_) {}
    // Sweep any stale copy left over from pre-migration localStorage usage
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function isFileBased() { return !!_dirHandle; }
  function isSupported()  { return _supported;  }

  // ── UI helpers (unchanged) ──────────────────────────────────────────────

  function _updateSaveLocationUI(active, needsAuth) {
    const btn   = document.getElementById('saveLocationBtn');
    const label = document.getElementById('saveLocationLabel');
    const dot   = document.getElementById('saveLocationDot');
    const msDot  = document.getElementById('msSaveDeviceDot');
    const msSub  = document.getElementById('msSaveDeviceSub');
    const msIcon = document.getElementById('msSaveDeviceIcon');
    // Overflow menu mirrors
    const omiDot   = document.getElementById('overflowSaveLocationDot');
    const omiLabel = document.getElementById('overflowSaveLocationLabel');

    if (active) {
      const folderName = _dirHandle ? _dirHandle.name : 'Device folder';
      if (btn)   { btn.title = 'Saving to: ' + folderName + '\nClick to change'; btn.classList.add('file-active'); btn.classList.remove('needs-auth'); }
      if (label) label.textContent = folderName;
      if (dot)   dot.style.background = '#22c55e';
      if (msDot)  msDot.style.background  = '#22c55e';
      if (msSub)  msSub.textContent = '📁 ' + folderName;
      if (msIcon) { msIcon.style.background = 'rgba(34,197,94,0.15)'; msIcon.style.color = '#16a34a'; }
      if (omiDot)   { omiDot.classList.add('file-active'); omiDot.classList.remove('needs-auth'); }
      if (omiLabel) omiLabel.textContent = folderName;
      if (typeof window.gfHideSaveLocationBanner === 'function') window.gfHideSaveLocationBanner();
    } else if (needsAuth) {
      if (btn)   { btn.classList.remove('file-active'); btn.classList.add('needs-auth'); btn.title = 'Click to re-authorize folder access'; }
      if (label) label.textContent = 'Re-authorize';
      if (dot)   dot.style.background = '#f59e0b';
      if (msDot)  msDot.style.background  = '#f59e0b';
      if (msSub)  msSub.textContent = '⚠️ Re-authorize folder access';
      if (msIcon) { msIcon.style.background = 'rgba(245,158,11,0.12)'; msIcon.style.color = '#d97706'; }
      if (omiDot)   { omiDot.classList.remove('file-active'); omiDot.classList.add('needs-auth'); }
      if (omiLabel) omiLabel.textContent = 'Re-authorize access';
    } else {
      if (btn)   { btn.classList.remove('file-active','needs-auth'); btn.title = 'Click to choose a save folder on your device'; }
      if (label) label.textContent = 'Browser only';
      if (dot)   dot.style.background = '#6b7280';
      if (msDot)  msDot.style.background  = '#6b7280';
      if (msSub)  msSub.textContent = 'Choose folder or download backup';
      if (msIcon) { msIcon.style.background = 'rgba(34,197,94,0.12)'; msIcon.style.color = '#16a34a'; }
      if (omiDot)   { omiDot.classList.remove('file-active','needs-auth'); }
      if (omiLabel) omiLabel.textContent = 'Browser only';
    }
  }

  function _showFileSaveToast() {
    if (typeof toast === 'function') {
      const name = _dirHandle ? _dirHandle.name : 'your device';
      window.toast('💾 Saving to folder: ' + name, 'success');
    }
  }

  function _showUnsupportedNotice() {
    if (typeof openBackupModal === 'function') window.openBackupModal();
  }

  // ── Initialise on page load ──────────────────────────────────────────────
  //  1. Run IDB migration (localStorage → IndexedDB) — once, silently
  //  2. Restore previously granted folder handle
  async function _init() {
    try { await _migrateFromLocalStorage(); } catch (_) {}
    try { await _tryRestoreHandle(); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

  // ── Surface IDB failures as a visible user warning ───────────────────────
  // Since localStorage is no longer a fallback, a genuine IDB failure means
  // data was NOT saved.  We fire 'gf:storage-error' from setItem/getItem and
  // catch it here once so the user is never silently left with lost data.
  let _storageErrorShown = false;
  window.addEventListener('gf:storage-error', function (e) {
    if (_storageErrorShown) return; // show once per session
    _storageErrorShown = true;
    const msg = '⚠️ Storage error — your data could not be saved. ' +
                'Try refreshing, or use the Export button to back up your work.';
    if (typeof window.toast === 'function') {
      window.toast(msg, 'error', 10000);
    } else {
      console.error('[StorageEngine]', msg, e.detail);
    }
  });

  return {
    setItem,
    getItem,
    removeItem,
    isFileBased,
    isSupported,
    requestDirectory,
    releaseDirectory,
    reauthorize:   _reauthorize,
    updateUI:      _updateSaveLocationUI,
    needsReauth:   function () { return _needsReauth; },
    _getDirHandle: function () { return _dirHandle; },
  };
})();

// ── Expose on window so all modules can access StorageEngine ──
window.StorageEngine = StorageEngine;
