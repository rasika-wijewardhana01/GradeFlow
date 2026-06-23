// ═══════════════════════════════════════════════════════════════
//  src/modules/backup.js
//  Manual JSON backup engine: export / import / timestamp.
//  Folder confirm modal (save-location change flow).
// ═══════════════════════════════════════════════════════════════

// ════════════════════════════════════════════
//  MANUAL BACKUP ENGINE
//  Works on ALL browsers: Firefox, iOS Safari,
//  Android, and any browser without the
//  File System Access API.
//
//  Export: bundles ALL app data (session + exams
//    + branding) into a single timestamped .json
//    file and triggers a browser download.
//  Import: user picks the .json file via a
//    <input type="file"> picker, data is validated
//    and restored into the app.
// ════════════════════════════════════════════

// ── Collect a full portable backup object ──
async function _collectBackupBundle() {
  // Pull current live state for all three storage keys
  const sessionRaw  = await window.StorageEngine.getItem('schoolResultManager_session_v1');
  const examsRaw    = await window.StorageEngine.getItem('schoolResultManager_exams_v1');
  const brandingRaw = await window.StorageEngine.getItem('rsm_school_branding_v1');

  // Also snapshot the live in-memory state (may be dirty / unsaved)
  let liveState = null;
  if (typeof collectState === 'function') {
    try { liveState = window.collectState(); } catch(_) {}
  }

  return {
    _gradeflow_backup: true,
    _version: 2,
    _exported: new Date().toISOString(),
    _browser: navigator.userAgent,
    session:  liveState ? JSON.stringify(liveState) : (sessionRaw || null),
    exams:    examsRaw    || null,
    branding: brandingRaw || null,
  };
}

// ── Download backup as a .json file ──
async function exportBackupFile() {
  try {
    const bundle   = await _collectBackupBundle();
    const json     = JSON.stringify(bundle, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const date     = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const filename = 'GradeFlow_backup_' + date + '.json';

    const a = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    // Update last-backup timestamp display
    _updateBackupTimestamp();
    window.toast('Backup downloaded: ' + filename, 'success');
    return true;
  } catch(e) {
    console.error('[Backup] Export failed:', e);
    window.toast('Backup export failed: ' + e.message, 'error');
    return false;
  }
}

// ── Import backup from a .json file picked by the user ──
function importBackupFile() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async function() {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (!file) return;

    try {
      const text   = await file.text();
      const bundle = JSON.parse(text);

      // Validate
      if (!bundle._gradeflow_backup) {
        window.toast('Not a valid GradeFlow backup file.', 'error'); return;
      }

      // Confirm overwrite
      const exportedAt = bundle._exported
        ? new Date(bundle._exported).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : 'unknown date';
      const ok = confirm(
        'Restore backup from ' + exportedAt + '?\n\n' +
        'This will overwrite your current session, exams, and branding. ' +
        'Export a backup first if you want to keep your current data.'
      );
      if (!ok) return;

      // Write each key back into StorageEngine
      if (bundle.session)  await window.StorageEngine.setItem('schoolResultManager_session_v1', bundle.session);
      if (bundle.exams)    await window.StorageEngine.setItem('schoolResultManager_exams_v1',   bundle.exams);
      if (bundle.branding) await window.StorageEngine.setItem('rsm_school_branding_v1',         bundle.branding);

      // Re-apply session state to live UI without page reload
      if (bundle.exams) {
        try {
          const ed = JSON.parse(bundle.exams);
          if (ed && Array.isArray(ed.exams) && ed.exams.length) {
            // Reload through exam manager
            await window.initExamManager();
          }
        } catch(_) {}
      } else if (bundle.session) {
        try {
          const s = JSON.parse(bundle.session);
          if (typeof applyState === 'function') window.applyState(s);
        } catch(_) {}
      }

      // Reload branding
      if (bundle.branding && typeof loadBrandingFromStorage === 'function') {
        await window.loadBrandingFromStorage();
      }

      closeBackupModal();
      window.toast('Backup restored successfully!', 'success');
    } catch(e) {
      console.error('[Backup] Import failed:', e);
      window.toast('Could not read backup file: ' + e.message, 'error');
    }
  });

  input.click();
}

// ── Track last backup time in localStorage (tiny pref, fine here) ──
const _BACKUP_TS_KEY = 'gf_last_backup_ts';
function _updateBackupTimestamp() {
  const now = new Date().toISOString();
  try { localStorage.setItem(_BACKUP_TS_KEY, now); } catch(_) {}
  _renderBackupTimestamp();
}
function _renderBackupTimestamp() {
  const el = document.getElementById('backupLastExportLabel');
  if (!el) return;
  try {
    const raw = localStorage.getItem(_BACKUP_TS_KEY);
    if (!raw) { el.textContent = 'No backup yet'; return; }
    const d = new Date(raw);
    el.textContent = 'Last backup: ' + d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      + ' at ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  } catch(_) { el.textContent = ''; }
}

// ── Open/Close the Backup modal ──
function openBackupModal() {
  const overlay = document.getElementById('backupModalOverlay');
  if (overlay) {
    _renderBackupTimestamp();
    overlay.classList.add('open');
  }
}
function closeBackupModal() {
  const overlay = document.getElementById('backupModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ── Folder option inside backup modal ──
async function handleFolderSaveOption() {
  if (!window.StorageEngine.isSupported()) return; // button is disabled anyway
  const ok = await window.StorageEngine.requestDirectory();
  if (ok) {
    // Migrate all live data to the new folder
    await window.saveToStorage();
    try { await window.StorageEngine.setItem(window.BRANDING_KEY, JSON.stringify(window.brandingSettings)); } catch(_) {}
    try { await window.StorageEngine.setItem(EM_STORAGE_KEY, JSON.stringify({ exams: _exams, activeId: _activeExamId })); } catch(_) {}
    closeBackupModal();
  }
}

// ── Wire up backup modal on DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', function () {
  // Disable folder option on unsupported browsers
  if (!window.StorageEngine.isSupported()) {
    const folderOption = document.getElementById('backupOptionFolder');
    if (folderOption) {
      folderOption.classList.add('backup-option--disabled');
      const badge = folderOption.querySelector('.backup-option-badge--chrome');
      if (badge) badge.textContent = 'Not supported on this browser';
      const desc = folderOption.querySelector('.backup-option-desc');
      if (desc) desc.textContent = 'Automatic folder saving requires Chrome or Edge on desktop. Use the Download Backup option below instead.';
    }
    // Topbar button
    const btn   = document.getElementById('saveLocationBtn');
    const label = document.getElementById('saveLocationLabel');
    const dot   = document.getElementById('saveLocationDot');
    if (btn)   btn.title = 'Click to export/import backup file';
    if (label) label.textContent = 'Backup';
    if (dot)   dot.style.background = '#f59e0b';
    // More sheet row
    const msDot  = document.getElementById('msSaveDeviceDot');
    const msSub  = document.getElementById('msSaveDeviceSub');
    const msIcon = document.getElementById('msSaveDeviceIcon');
    if (msDot)  msDot.style.background  = '#f59e0b';
    if (msSub)  msSub.textContent = 'Export / import backup file';
    if (msIcon) { msIcon.style.background = 'rgba(245,158,11,0.12)'; msIcon.style.color = '#d97706'; }
  }
});

// ── Save Location button click handler ──
async function handleSaveLocationClick() {
  if (!window.StorageEngine.isSupported()) {
    // File System Access API not available (Firefox / iOS) — open backup modal
    openBackupModal();
    return;
  }
  const btn = document.getElementById('saveLocationBtn');
  if (btn && btn.classList.contains('needs-auth')) {
    await window.StorageEngine.reauthorize();
    return;
  }
  if (window.StorageEngine.isFileBased()) {
    // Show professional folder-change dialog instead of browser confirm()
    openFolderConfirm();
    return;
  }
  // Supported but not yet active: show choice modal
  openBackupModal();
}

// ── Folder Change Confirm Modal ──────────────────────────────────────
function openFolderConfirm() {
  const overlay    = document.getElementById('fcOverlay');
  const nameEl     = document.getElementById('fcFolderName');
  const changeBtn  = document.getElementById('fcChangeFolderBtn');
  if (!overlay) return;
  // Show current folder name in the description
  const handle = window.StorageEngine._getDirHandle ? window.StorageEngine._getDirHandle() : null;
  const folderName = (handle && handle.name) ? '\u201c' + handle.name + '\u201d' : 'your device folder';
  if (nameEl) nameEl.textContent = folderName;
  overlay.classList.add('open');
  // Focus the Change Folder button as default safe action
  setTimeout(function () { if (changeBtn) changeBtn.focus(); }, 60);
}

function closeFolderConfirm() {
  const overlay = document.getElementById('fcOverlay');
  if (overlay) overlay.classList.remove('open');
}

async function fcChooseChange() {
  closeFolderConfirm();
  // Small delay so the modal closes before the OS picker opens
  setTimeout(async function () {
    await window.StorageEngine.requestDirectory();
  }, 80);
}

function fcChooseRevert() {
  closeFolderConfirm();
  window.StorageEngine.releaseDirectory();
  if (typeof toast === 'function') window.toast('Reverted to browser storage', 'info');
}

// Close on Escape
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('fcOverlay');
    if (overlay && overlay.classList.contains('open')) closeFolderConfirm();
  }
});

// ════════════════════════════════════════════
//  SCHOOL BRANDING
// ════════════════════════════════════════════


// ── Window exports ──
Object.assign(window, {
  closeBackupModal,
  closeFolderConfirm,
  exportBackupFile,
  fcChooseChange,
  fcChooseRevert,
  handleFolderSaveOption,
  handleSaveLocationClick,
  importBackupFile,
  openBackupModal,
  openFolderConfirm
});
