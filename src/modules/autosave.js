// ═══════════════════════════════════════════════════════════════
//  src/modules/autosave.js
//  Auto-save, session persistence, navigation guard, collectState,
//  restoreState, coreSave, manualSave, markDirty, dirty tracker.
// ═══════════════════════════════════════════════════════════════
// ── Reload / navigation guard ────────────────────────────────────────────────
//
//  Goal: always show OUR custom amber dialog instead of the browser's native
//        "Reload site?" popup — for every reload trigger:
//
//    (A) Keyboard shortcuts  F5, Ctrl+R, Cmd+R  → intercepted in keydown capture
//                            No native dialog ever shown.
//    (B) Toolbar reload btn  → beforeunload fires; we set a sessionStorage flag
//                              so after the page reloads we can detect it and
//                              show our dialog offering to undo the reload.
//    (C) Tab/window close    → native dialog only (browsers enforce this,
//                              no workaround exists).
//
//  Toolbar strategy (B) — why it's the best possible:
//    The browser's toolbar reload button triggers beforeunload but JavaScript
//    cannot prevent the reload AND show custom UI in the same page lifecycle.
//    We therefore:
//      1. Set a sessionStorage flag before the page unloads.
//      2. After the new page loads and auto-restores the session from
//         localStorage, detect the flag and immediately show our custom dialog
//         — giving the user a chance to "undo" the reload.
//      3. If they click "Clear & Reload" in our dialog, the session is wiped
//         and the page reloads clean. If they click "Cancel", they continue
//         working with the fully-recovered session.
//    Net result: no data is ever permanently lost from a toolbar reload.
// ─────────────────────────────────────────────────────────────────────────────

const _RL_FLAG_KEY = 'gradeflow_reload_intercepted';
let _reloadConfirmPending = false; // true → confirmed our dialog → let reload pass

// ── Auto-save private state ──
const LS_KEY           = 'schoolResultManager_session_v1';
const SAVE_INTERVAL_MS = 20000; // 20 seconds
window.LS_KEY = LS_KEY; // expose for exam-manager.js
let _autoSaveTimer  = null;
let _lastSavedAt    = null;
let _isDirty        = false;   // true when state changed since last save
let _isSaving       = false;


// ── (A) Keyboard — fully intercepted, zero native dialog ──
document.addEventListener('keydown', function(e) {
  const isF5      = e.key === 'F5';
  const isCtrlR   = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
  if ((isF5 || isCtrlR) && _shouldBlockUnload()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    openReloadConfirm(false);
  }
}, true); // capture phase — fires before the browser handles the shortcut

// ── (B) Toolbar / address-bar — set recovery flag, then yield to browser ──
window.addEventListener('beforeunload', function(e) {
  if (_reloadConfirmPending) {
    // User clicked "Reload Anyway" or "Clear & Reload" in our dialog — let through
    _reloadConfirmPending = false;
    try { sessionStorage.removeItem(_RL_FLAG_KEY); } catch(_) {}
    return;
  }
  if (_shouldBlockUnload()) {
    // Mark that the page is unloading while dirty so we can recover on reload
    try { sessionStorage.setItem(_RL_FLAG_KEY, '1'); } catch(_) {}
    // Trigger the browser's own confirmation — unavoidable for toolbar clicks
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// ── Post-reload recovery: runs on every page load ──
// If the sessionStorage flag is set, the user let the native dialog proceed
// (clicked native "Reload"). The auto-save engine will restore the session
// The reload-flag is now handled inside checkForSavedSession() directly.
function _shouldBlockUnload() {
  const enteredMarkCount = Object.values(marks || {}).filter(
    v => v !== '' && v !== null && v !== undefined
  ).length;
  return _isDirty && enteredMarkCount > 0;
}

// ── Open our custom dialog ──────────────────────────────────────────────────
// postReload=false (default): "You have unsaved changes — reload anyway?"
// postReload=true:            "Page reloaded but session was recovered — reload again?"
function openReloadConfirm(postReload) {
  const overlay    = document.getElementById('reloadConfirmOverlay');
  const titleEl    = document.getElementById('rlTitle');
  const descEl     = document.getElementById('rlDesc');
  const confirmBtn = document.getElementById('rlConfirmBtn');
  const saveBtn    = document.getElementById('rlSaveBtn');
  if (!overlay) return;

  if (postReload) {
    // Post-reload mode: session already recovered from localStorage
    if (titleEl) titleEl.textContent = 'Session Recovered';
    if (descEl) descEl.innerHTML =
      '<p>Your page reloaded, but your session was <strong>automatically recovered</strong> '
      + 'from auto-save. Your marks and data are intact.</p>'
      + '<ul class="reload-confirm-list">'
      + '<li>Click <strong>Cancel</strong> to continue working — nothing is lost</li>'
      + '<li>Click <strong>Clear &amp; Reload</strong> to wipe the session and start fresh</li>'
      + '</ul>';
    if (confirmBtn) confirmBtn.textContent = 'Clear & Reload';
    if (saveBtn) saveBtn.style.display = 'none';
  } else {
    // Standard mode: unsaved changes, about to reload
    if (titleEl) titleEl.textContent = 'Reload Page?';
    if (descEl) descEl.innerHTML =
      '<p>You have <strong>unsaved changes</strong> that will be lost if you reload now.</p>'
      + '<ul class="reload-confirm-list">'
      + '<li>Unsaved marks and student data</li>'
      + '<li>Changes made since your last save</li>'
      + '<li>Current session progress</li>'
      + '</ul>';
    if (confirmBtn) confirmBtn.textContent = 'Reload Anyway';
    if (saveBtn) saveBtn.style.display = '';
  }
  overlay.classList.add('open');
  setTimeout(function() {
    const btn = document.getElementById('rlCancelBtn');
    if (btn) btn.focus();
  }, 80);
}

function closeReloadConfirm() {
  const overlay = document.getElementById('reloadConfirmOverlay');
  if (overlay) overlay.classList.remove('open');
}

function confirmReload() {
  _reloadConfirmPending = true;
  closeReloadConfirm();
  location.reload();
}

// Close on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('reloadConfirmOverlay');
    if (overlay && overlay.classList.contains('open')) closeReloadConfirm();
  }
});

// ── Collect all state into a plain object ──
function collectState() {
  return {
    savedAt:        new Date().toISOString(),
    currentStep,
    autoIndexCounter,
    students:       JSON.parse(JSON.stringify(students)),
    subjects:       JSON.parse(JSON.stringify(subjects)),
    categories:     JSON.parse(JSON.stringify(categories)),
    marks:          JSON.parse(JSON.stringify(marks)),
    gradingScale:   JSON.parse(JSON.stringify(window.gradingScale)),
    subjectPassMarks: JSON.parse(JSON.stringify(window.subjectPassMarks)),
    meta: {
      className:    (document.getElementById('className')    || {}).value || '',
      academicYear: (document.getElementById('academicYear') || {}).value || '',
      teacherName:  (document.getElementById('teacherName')  || {}).value || '',
      schoolName:   (document.getElementById('schoolName')   || {}).value || '',
      examLabel:    (document.getElementById('examLabel')    || {}).value || '',
    }
  };
}

// ── Restore state from plain object ──
function applyState(s) {
  autoIndexCounter = s.autoIndexCounter || 1;
  students         = s.students         || [];
  subjects         = s.subjects         || [];
  categories       = s.categories       || [];

  // BUG FIX: Sanitize marks on restore — JSON storage converts NaN→null and
  // undefined→missing. Restore null/undefined values to '' (absent) so that
  // elective lock evaluation (which checks `v !== undefined && v !== ''`) works
  // correctly and doesn't mistakenly lock inputs after restore.
  // NOTE: The string "AB" (absent sentinel) must be preserved as-is.
  const rawMarks = s.marks || {};
  marks = {};
  Object.keys(rawMarks).forEach(function (k) {
    const v = rawMarks[k];
    if (v === 'AB') {
      marks[k] = 'AB'; // preserve absent sentinel
    } else {
      marks[k] = (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? '' : v;
    }
  });

  if (s.gradingScale && s.gradingScale.length) window.gradingScale = s.gradingScale;
  window.subjectPassMarks = s.subjectPassMarks || {};

  // Restore meta fields
  const m = s.meta || {};
  ['className','academicYear','teacherName','schoolName','examLabel'].forEach(id => {
    const el = document.getElementById(id);
    if (el && m[id] !== undefined) {
      el.value = m[id];
      // Keep brandingTermLabel mirror in sync when examLabel is restored
      if (id === 'examLabel') {
        const btl = document.getElementById('brandingTermLabel');
        if (btl) btl.value = m[id];
      }
    }
  });

  // Refresh all UI
  window.updateBadge('students', students.length);
  window.updateBadge('subjects', subjects.length);
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();

  // Go to the step they were on
  window.goToStep(s.currentStep || 0);
}

// ── Core save (async — uses StorageEngine) ──
async function saveToStorage() {
  if (_isSaving) return;
  _isSaving = true;
  setAutosaveBtnState('saving');
  try {
    const state = collectState();
    await window.StorageEngine.setItem(LS_KEY, JSON.stringify(state));
    _lastSavedAt = new Date();
    _isDirty     = false;
    setAutosaveBtnState('saved');
    updateTimestampDisplay();
  } catch(e) {
    console.warn('Auto-save failed:', e);
    setAutosaveBtnState('unsaved');
  } finally {
    _isSaving = false;
  }
}

// ── Manual save (topbar button) ──
function manualSave() {
  saveToStorage();
  window.toast('Session saved', 'success');
}

// ── Mark state as dirty (unsaved) ──
function markDirty() {
  _isDirty = true;
  setAutosaveBtnState('unsaved');
  // Update pill text immediately when changes are made
  const el = document.getElementById('autosaveTimestamp');
  if (el && _lastSavedAt) {
    // Keep the last-saved text but the pill style switches to amber via setAutosaveBtnState
    // Leave text as-is — it still shows when it was last saved, which is informative
  } else if (el && !_lastSavedAt) {
    el.textContent = 'Not saved yet';
  }
  updateMobileSavePill('unsaved', el ? el.textContent : 'Unsaved');
}

// ── Update save-button visual state ──
function setAutosaveBtnState(state) {
  const btn = document.getElementById('autosaveBtn');
  const dot = document.getElementById('saveDot');
  if (btn && dot) {
    btn.classList.remove('saving','saved','unsaved');
    if (state) btn.classList.add(state);
  }
  // ── Also update desktop timestamp pill state class ──
  const pill = document.getElementById('autosaveTimestampPill');
  if (pill) {
    pill.classList.remove('saving','saved','unsaved');
    if (state) pill.classList.add(state);
  }
  // ── Also update mobile pill ──
  updateMobileSavePill(state);
}

// ── Update the mobile topbar save-status pill ──
function updateMobileSavePill(state, timestampText) {
  const pill  = document.getElementById('mobileSavePill');
  const label = document.getElementById('mobileSavePillLabel');
  if (!pill || !label) return;
  pill.classList.remove('saving','saved','unsaved');
  if (state === 'saving') {
    pill.classList.add('saving');
    label.textContent = 'Saving…';
  } else if (state === 'saved') {
    pill.classList.add('saved');
    label.textContent = timestampText || 'Saved';
  } else {
    pill.classList.add('unsaved');
    label.textContent = timestampText || 'Unsaved';
  }
}

// ── Update "last saved X ago" text ──
function updateTimestampDisplay() {
  const el = document.getElementById('autosaveTimestamp'); // text node inside pill
  if (!el) return;
  if (!_lastSavedAt) {
    // No save yet — show "Not saved yet" in unsaved state
    el.textContent = 'Not saved yet';
    const pill = document.getElementById('autosaveTimestampPill');
    if (pill) { pill.classList.remove('saving','saved','unsaved'); pill.classList.add('unsaved'); }
    updateMobileSavePill('unsaved', 'Not saved yet');
    return;
  }
  const diff = Math.round((Date.now() - _lastSavedAt.getTime()) / 1000); // seconds elapsed
  let txt;
  if (diff < 10) {
    txt = 'Saved just now';
  } else if (diff < 60) {
    // Under 1 minute → show seconds
    txt = `Saved ${diff}s ago`;
  } else if (diff < 3600) {
    // Under 1 hour → show minutes
    const mins = Math.floor(diff / 60);
    txt = mins === 1 ? 'Saved 1 min ago' : `Saved ${mins} mins ago`;
  } else if (diff < 86400) {
    // Under 24 hours → show hours (and optionally remaining minutes)
    const hrs  = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (mins === 0) {
      txt = hrs === 1 ? 'Saved 1 hr ago' : `Saved ${hrs} hrs ago`;
    } else {
      txt = hrs === 1
        ? `Saved 1 hr ${mins}m ago`
        : `Saved ${hrs} hrs ${mins}m ago`;
    }
  } else {
    // 24 h+ → show days
    const days = Math.floor(diff / 86400);
    txt = days === 1 ? 'Saved yesterday' : `Saved ${days} days ago`;
  }
  el.textContent = txt;
  // Sync mobile pill label when in saved state
  updateMobileSavePill('saved', txt);
}

// ── Interval: auto-save when dirty ──
let _timestampTimer = null;
function startAutoSaveLoop() {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer);
  _autoSaveTimer = setInterval(() => {
    if (_isDirty) saveToStorage();
    // updateTimestampDisplay() is called inside saveToStorage() when it runs;
    // call it here too so the "X ago" label keeps ticking even when nothing
    // is dirty and no save is triggered this tick.
    updateTimestampDisplay();
  }, SAVE_INTERVAL_MS);

  // ── Adaptive timestamp refresh ──
  // Tick every 5 s while showing seconds (< 60 s elapsed), slow to 30 s
  // once it switches to minutes, and 60 s for hours+.
  if (_timestampTimer) clearTimeout(_timestampTimer);
  function _scheduleTimestampTick() {
    if (_timestampTimer) clearTimeout(_timestampTimer);
    updateTimestampDisplay();
    const nextElapsed = _lastSavedAt ? (Date.now() - _lastSavedAt.getTime()) / 1000 : 0;
    // Use the *next* elapsed value so the interval shrinks to hit the 60 s and
    // 3600 s phase boundaries precisely rather than overshooting by one full tick.
    const secsUntilNextBoundary =
      nextElapsed < 60   ? (60   - nextElapsed) * 1000 :
      nextElapsed < 3600 ? (3600 - nextElapsed) * 1000 : Infinity;
    const interval =
      nextElapsed < 60   ? Math.min(5000,  secsUntilNextBoundary + 100)
    : nextElapsed < 3600 ? Math.min(30000, secsUntilNextBoundary + 100)
    : 60000;
    _timestampTimer = setTimeout(_scheduleTimestampTick, interval);
  }
  _scheduleTimestampTick();

}

// ── Instant refresh on tab focus / visibility restore ──
// Registered once, outside startAutoSaveLoop(), so repeated calls to
// startAutoSaveLoop() (e.g. after a reset or re-init) do not stack up
// duplicate listeners. When a teacher navigates away and comes back the
// Page Visibility API fires `visibilitychange` and we immediately show the
// correct elapsed time regardless of where the ticker is in its cycle.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateTimestampDisplay();
  }
});

// ── Recovery banner: data is in device folder but permission has lapsed ──────
// Shown when checkForSavedSession() finds no session data but StorageEngine
// has a restored directory handle that still needs user re-authorization.
// The user's data is physically on their device — they just need to unlock it.
function _showFileReauthBanner() {
  if (document.getElementById('gf-reauth-recovery')) return; // already shown

  const div = document.createElement('div');
  div.id = 'gf-reauth-recovery';
  div.style.cssText = [
    'position:fixed',
    'bottom:76px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%)',
    'color:#fff',
    'padding:14px 18px',
    'border-radius:14px',
    'font-size:13.5px',
    'z-index:9100',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'box-shadow:0 6px 28px rgba(0,0,0,.45)',
    'max-width:480px',
    'width:calc(100vw - 40px)',
    'box-sizing:border-box',
  ].join(';');

  div.innerHTML =
    '<span style="font-size:22px;flex-shrink:0">📁</span>' +
    '<span style="flex:1;line-height:1.45">' +
      'Your saved session is on your device.<br>' +
      '<strong>Unlock folder access</strong> to restore it.' +
    '</span>' +
    '<button id="gf-reauth-btn" style="' +
      'background:#fff;color:#1d4ed8;border:none;border-radius:9px;' +
      'padding:7px 15px;font-weight:700;font-size:13px;cursor:pointer;' +
      'white-space:nowrap;flex-shrink:0;' +
    '">Unlock</button>' +
    '<button id="gf-reauth-close" style="' +
      'background:transparent;border:none;color:rgba(255,255,255,.55);' +
      'font-size:18px;line-height:1;cursor:pointer;padding:4px 2px;flex-shrink:0;' +
    '" aria-label="Dismiss">✕</button>';

  document.body.appendChild(div);

  document.getElementById('gf-reauth-btn').addEventListener('click', async function () {
    const ok = await window.StorageEngine.reauthorize();
    if (ok) {
      const el = document.getElementById('gf-reauth-recovery');
      if (el) el.remove();
      await checkForSavedSession(); // retry now that permission is granted
    }
  });

  document.getElementById('gf-reauth-close').addEventListener('click', function () {
    const el = document.getElementById('gf-reauth-recovery');
    if (el) el.remove();
  });
}

// ── Check for saved session on page load ──
async function checkForSavedSession() {
  try {
    const raw = await window.StorageEngine.getItem(LS_KEY);
    if (!raw) {
      // ── File-based session recovery ──────────────────────────────────────
      // Session data returned null, but if the user previously chose a device
      // folder and the folder permission has since lapsed (browser requires a
      // user gesture to re-grant it), the data still exists in the file on
      // their device — we just can't read it yet.  Show a recovery banner so
      // they know to click "Unlock" rather than thinking their work is lost.
      if (typeof window.StorageEngine.needsReauth === 'function' &&
          window.StorageEngine.needsReauth()) {
        _showFileReauthBanner();
      }
      return;
    }
    const s = JSON.parse(raw);
    if (!s || !s.savedAt) return;

    // If nothing meaningful was saved, skip
    if ((!s.students || !s.students.length) && (!s.subjects || !s.subjects.length)) {
      await window.StorageEngine.removeItem(LS_KEY); return;
    }

    // ── Reload-interception path ──────────────────────────────────────────────
    // If the user clicked the browser toolbar reload button while dirty,
    // beforeunload set this flag. In that case: silently restore the session
    // (skip the "Restore previous session?" modal entirely) then show our
    // custom reload-warning dialog so they can cancel or confirm a clean reload.
    let reloadFlag = false;
    try { reloadFlag = !!sessionStorage.getItem(_RL_FLAG_KEY); } catch(_) {}

    if (reloadFlag) {
      try { sessionStorage.removeItem(_RL_FLAG_KEY); } catch(_) {}
      // Silently restore — no modal, no toast
      applyState(s);
      _lastSavedAt = new Date(s.savedAt);
      _isDirty     = false;
      setAutosaveBtnState('saved');
      updateTimestampDisplay();
      if (typeof window.clearUndoStack === 'function') window.clearUndoStack();
      if (typeof window.renderMarksTable === 'function') {
        try {
          window.renderMarksTable();
          document.querySelectorAll('#marksTable .mark-input, #marksCardView .mark-subject-input').forEach(function(inp) {
            inp.disabled = false;
            inp.classList.remove('elective-locked', 'elective-chosen');
          });
          requestAnimationFrame(function() {
            if (typeof window.refreshAllElectiveLocks === 'function') {
              (students || []).forEach(function(_, i) { window.refreshAllElectiveLocks(i); });
            }
          });
        } catch(renderErr) {
          console.warn('[GradeFlow] renderMarksTable after reload-restore threw:', renderErr);
        }
      }
      // Show our custom reload dialog in "Session Recovered" mode
      setTimeout(function() { openReloadConfirm(true); }, 300);

      // ── FORCE-SYNC: Exam Manager chip ← restored examLabel ─────────────────
      //  applyState() correctly sets the #examLabel DOM input from LS_KEY, but
      //  does NOT touch exam.name in the _exams[] array loaded from EM_STORAGE_KEY.
      //  The sidebar chip reads exam.name, so without a sync the chip stays on
      //  whatever stale name was stored in EM_STORAGE_KEY (e.g. "3rd Term Test")
      //  while Setup shows the restored label (e.g. "1st Term Test").
      //
      //  Previous attempt used _emAutoRenameFromLabel() here, but that function's
      //  rename guards block the sync whenever exam.name ≠ exam.meta.examLabel
      //  (i.e. whenever the user had ever used the Exam Manager rename dialog on
      //  top of a label-driven name). After a restore the saved examLabel IS the
      //  ground truth, so we bypass the guards and write directly to exam.name.
      requestAnimationFrame(function () {
        try {
          const restoredLabel = (document.getElementById('examLabel') || {}).value || '';
          if (restoredLabel && typeof window._emActive === 'function') {
            const activeExam = window._emActive();
            if (activeExam && activeExam.name !== restoredLabel) {
              activeExam.name = restoredLabel;
              if (activeExam.meta) activeExam.meta.examLabel = restoredLabel;
              if (typeof window._emSave === 'function') window._emSave();
            }
          }
          if (typeof window._emRefreshUI === 'function') window._emRefreshUI();
        } catch (syncErr) {
          console.warn('[GradeFlow] exam name sync after reload-restore failed:', syncErr);
          if (typeof window._emRefreshUI === 'function') window._emRefreshUI();
        }
      });

      return;
    }

    // ── Normal path: show "Restore previous session?" modal ──────────────────
    const at = new Date(s.savedAt);
    document.getElementById('restoreSavedAt').textContent =
      at.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      + ' ' + at.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    document.getElementById('restoreClassName').textContent   = (s.meta && s.meta.className)  || '—';
    document.getElementById('restoreStudentCount').textContent = (s.students && s.students.length) || 0;
    document.getElementById('restoreSubjectCount').textContent = (s.subjects && s.subjects.length) || 0;

    document.getElementById('restoreModalOverlay').classList.add('open');
  } catch(e) { /* silently ignore malformed data */ }
}

async function restoreSession() {
  try {
    const raw = await window.StorageEngine.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    applyState(s);
    _lastSavedAt = new Date(s.savedAt);
    _isDirty     = false;
    setAutosaveBtnState('saved');
    updateTimestampDisplay();
    document.getElementById('restoreModalOverlay').classList.remove('open');
    // BUG FIX: Clear undo stack after restore so Ctrl+Z can't undo back across
    // session boundaries into stale pre-restore state (which corrupts marks).
    if (typeof window.clearUndoStack === 'function') window.clearUndoStack();
    // BUG FIX: Force a fresh marks table render after restore regardless of which
    // step is active. The session may have been saved on step 3; applyState calls
    // goToStep which triggers renderMarksTable only if n===3. But if the restored
    // currentStep IS 3, goToStep already rendered it — we do a second render here
    // to guarantee all elective locks are computed from the freshly restored marks.
    if (typeof window.renderMarksTable === 'function') {
      try {
        window.renderMarksTable();
        // Ensure all inputs are unlocked to start, then re-apply elective locks
        document.querySelectorAll('#marksTable .mark-input, #marksCardView .mark-subject-input').forEach(function (inp) {
          inp.disabled = false;
          inp.classList.remove('elective-locked', 'elective-chosen');
        });
        requestAnimationFrame(function () {
          if (typeof window.refreshAllElectiveLocks === 'function') {
            (students || []).forEach(function (_, i) { window.refreshAllElectiveLocks(i); });
          }
        });
      } catch(renderErr) {
        console.warn('[GradeFlow] renderMarksTable after restore threw:', renderErr);
        // Non-fatal — data is restored, table will render when user navigates to step 3
      }
    }
    window.toast('Session restored!', 'success');
    if (typeof window.updateStepLocks === 'function') window.updateStepLocks();

    // ── FORCE-SYNC: Exam Manager chip ← restored examLabel ────────────────────
    //
    //  Problem: applyState() restores the #examLabel DOM input correctly, but
    //  it does NOT update exam.name in the exam manager's _exams[] array.
    //  The sidebar chip (_emRefreshUI) reads exam.name — so after a restore
    //  the sidebar shows the old stale exam.name (e.g. "3rd Term Test") while
    //  the Setup tab correctly shows the real label (e.g. "1st Term Test").
    //
    //  Previous approach called _emAutoRenameFromLabel() here, but that
    //  function has rename guards that block the sync whenever exam.name is
    //  not a recognised default AND exam.name !== exam.meta.examLabel — which
    //  is exactly the desync state we are trying to fix (e.g. user typed
    //  "1st Term Test" in Setup, then renamed to "3rd Term Test" in the Exam
    //  Manager). In that scenario the guard returns early and the chip stays
    //  stuck on the stale name after every restore.
    //
    //  Fix: bypass the guards entirely. A restore is an explicit user action;
    //  the examLabel from the saved session IS the ground truth.  Write
    //  directly to activeExam.name so the sidebar chip always matches what
    //  is shown in the Setup tab.
    // ─────────────────────────────────────────────────────────────────────────
    requestAnimationFrame(function () {
      try {
        const restoredLabel = (document.getElementById('examLabel') || {}).value || '';
        if (restoredLabel && typeof window._emActive === 'function') {
          const activeExam = window._emActive();
          if (activeExam && activeExam.name !== restoredLabel) {
            activeExam.name = restoredLabel;
            if (activeExam.meta) activeExam.meta.examLabel = restoredLabel;
            if (typeof window._emSave === 'function') window._emSave();
          }
        }
        // Always refresh the chip — covers the empty-label case too
        if (typeof window._emRefreshUI === 'function') window._emRefreshUI();
      } catch (syncErr) {
        // Non-fatal — UI chip may be slightly stale but data is intact
        console.warn('[GradeFlow] exam name sync after restore failed:', syncErr);
        if (typeof window._emRefreshUI === 'function') window._emRefreshUI();
      }
    });
  } catch(e) {
    window.toast('Could not restore session: ' + e.message, 'error');
    document.getElementById('restoreModalOverlay').classList.remove('open');
  }
}

async function discardSession() {
  // ── What "Discard" means ───────────────────────────────────────────────────
  //
  //  LS_KEY holds an AUTO-SAVED snapshot of an interrupted session.
  //  Clicking "Discard" means:
  //    "Ignore that snapshot. Open a fresh blank exam.
  //     Leave every previously saved exam exactly as stored."
  //
  //  The critical bug that was here before:
  //    initExamManager() correctly skips _emApplyExam() while the restore
  //    modal is open (our race-condition guard). This means the in-memory
  //    variables (students, subjects, marks, …) are ALL EMPTY at the moment
  //    discardSession() runs. Calling _emSnapshotActive() here read those
  //    empty variables and wrote them back into the active exam slot,
  //    DESTROYING all saved data before _emSave() persisted the damage.
  //
  //  Correct approach:
  //    • _exams[] was fully loaded from EM_STORAGE_KEY by _emLoad() — every
  //      exam's data is already correctly stored in that array as plain objects.
  //    • We must NEVER call _emSnapshotActive() here, because in-memory state
  //      is empty and snapshotting it would overwrite the saved data.
  //    • Simply: delete LS_KEY, push a new blank exam, make it active,
  //      apply it to the UI, and save. _exams[] stays intact.
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Remove only the unsaved mid-session snapshot key
  try { await window.StorageEngine.removeItem(LS_KEY); } catch(_) {}

  // 2. _exams[] is fully intact from _emLoad() — DO NOT touch it or snapshot
  //    in-memory state into it. In-memory variables are empty (the guard in
  //    initExamManager skipped _emApplyExam while the modal was open).

  // 3. Create a brand-new blank exam
  const blankExam = {
    id:               window._emId(),
    name:             'New Exam',
    icon:             '📋',
    color:            (typeof EM_COLORS !== 'undefined' ? EM_COLORS[0] : '#1a56db'),
    createdAt:        new Date().toISOString(),
    savedAt:          new Date().toISOString(),
    students:         [],
    subjects:         [],
    categories:       [],
    marks:            {},
    gradingScale:     (typeof window.gradingScale !== 'undefined' ? JSON.parse(JSON.stringify(window.gradingScale)) : []),
    subjectPassMarks: {},
    autoIndexCounter: 1,
    meta:             { className: '', academicYear: '', teacherName: '', schoolName: '' }
  };

  // 4. Push the blank exam and make it active
  //    (_exams[] already has all the user's saved exams from _emLoad — untouched)
  _exams.push(blankExam);
  window._activeExamId = blankExam.id;

  // 5. Apply the blank exam to the UI (empty fields, zero students/subjects)
  window._emApplyExam(blankExam);

  // 6. Persist — _exams[] contains all old exams (unchanged) + the new blank one
  if (typeof window._emSave === 'function') { try { await window._emSave();   } catch(_) {} }
  if (typeof window._emRefreshUI === 'function') window._emRefreshUI();

  // Reset autosave state indicators
  if (typeof _lastSavedAt !== 'undefined') _lastSavedAt = null;
  if (typeof _isDirty     !== 'undefined') _isDirty     = false;
  if (typeof setAutosaveBtnState    === 'function') setAutosaveBtnState(null);
  if (typeof updateTimestampDisplay === 'function') updateTimestampDisplay();

  document.getElementById('restoreModalOverlay').classList.remove('open');
  window.toast('Started a new exam — your saved exams are safe in the Exam Manager');
}


// ════════════════════════════════════════════
//  LEGAL MODAL (Privacy Policy & Terms of Service)
//  Opens inline — prevents the new-tab session-restore modal bug.
// ════════════════════════════════════════════

const _legalContent = {
  privacy: {
    title: 'Privacy Policy',
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    html: `
      <h4>Overview</h4>
      <p>GradeFlow is a fully <strong>offline, client-side</strong> application. All data you enter — student names, marks, class information — is stored exclusively on your own device using browser local storage or a folder you choose on your computer. <strong>No data is ever transmitted to any server.</strong></p>

      <h4>Data We Collect</h4>
      <p>We collect <strong>nothing</strong>. GradeFlow has no backend, no database, no analytics, no tracking pixels, and no third-party integrations. The app works entirely within your browser.</p>

      <h4>Local Storage</h4>
      <p>GradeFlow uses your browser's <strong>localStorage</strong> and optionally the <strong>File System Access API</strong> (Chrome/Edge) to save your session automatically so you can continue where you left off. This data never leaves your device.</p>
      <ul>
        <li>Session data: class name, student list, subject list, marks, exam history</li>
        <li>Preferences: dark/light mode, sidebar state, consent acknowledgement</li>
      </ul>
      <p>You can clear this data at any time through your browser settings or by using the "Discard" option in the app.</p>

      <h4>Cookies</h4>
      <p>GradeFlow uses <strong>no cookies</strong> of any kind — no session cookies, no tracking cookies, no third-party cookies.</p>

      <h4>Sharing &amp; Disclosure</h4>
      <p>Because we store nothing, there is nothing to share or disclose to any third party.</p>

      <h4>Children's Privacy</h4>
      <p>GradeFlow is a tool for teachers and educators. We do not knowingly process personal data of children. Student names entered by teachers remain solely on the teacher's device.</p>

      <h4>Changes to This Policy</h4>
      <p>Any updates to this policy will be reflected in the app. Continued use after changes constitutes acceptance.</p>

      <h4>Contact</h4>
      <p>If you have questions about privacy, please contact us through the GradeFlow support channel.</p>
    `
  },
  terms: {
    title: 'Terms of Service',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    html: `
      <h4>Acceptance of Terms</h4>
      <p>By using GradeFlow, you agree to these Terms of Service. If you do not agree, please discontinue use of the application.</p>

      <h4>Description of Service</h4>
      <p>GradeFlow is a free, browser-based grade management tool for teachers and educators. It operates entirely client-side with no server-side component.</p>

      <h4>Permitted Use</h4>
      <ul>
        <li>GradeFlow is intended for <strong>educational record-keeping</strong> by teachers and school staff.</li>
        <li>You may use GradeFlow for personal, educational, or institutional non-commercial purposes.</li>
        <li>You are responsible for ensuring that any student data you enter complies with your institution's data policies and applicable privacy laws.</li>
      </ul>

      <h4>User Responsibilities</h4>
      <p>You are solely responsible for:</p>
      <ul>
        <li>The accuracy of data you enter</li>
        <li>Backing up your data regularly using the Export features</li>
        <li>Complying with your school or institution's data handling policies</li>
        <li>Ensuring your device and browser are secure</li>
      </ul>

      <h4>Data &amp; Backups</h4>
      <p>All data is stored locally on your device. <strong>We strongly recommend exporting your data regularly</strong> using the built-in export features (Excel, PDF, CSV). GradeFlow is not responsible for data loss due to browser cache clearing, device failure, or accidental deletion.</p>

      <h4>Disclaimer of Warranties</h4>
      <p>GradeFlow is provided <strong>"as is"</strong> without warranty of any kind. We make no guarantees regarding availability, accuracy, or fitness for a particular purpose.</p>

      <h4>Limitation of Liability</h4>
      <p>To the fullest extent permitted by law, GradeFlow and its developers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the application.</p>

      <h4>Changes to Terms</h4>
      <p>We may update these terms from time to time. Continued use of the application constitutes acceptance of any revised terms.</p>
    `
  }
};

function openLegalModal(tab) {
  tab = tab || 'privacy';
  _renderLegalTab(tab);
  document.getElementById('legalModalOverlay').classList.add('open');
}

function closeLegalModal() {
  document.getElementById('legalModalOverlay').classList.remove('open');
}

function switchLegalTab(tab) {
  _renderLegalTab(tab);
}

function _renderLegalTab(tab) {
  const data = _legalContent[tab];
  if (!data) return;

  // Update tabs
  document.getElementById('legalTabPrivacy').classList.toggle('active', tab === 'privacy');
  document.getElementById('legalTabTerms').classList.toggle('active', tab === 'terms');

  // Update title & icon
  document.getElementById('legalModalTitle').textContent = data.title;
  document.getElementById('legalModalIcon').innerHTML = data.icon;

  // Update body content
  document.getElementById('legalModalBody').innerHTML = data.html;
  document.getElementById('legalModalBody').scrollTop = 0;
}

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('legalModalOverlay');
    if (overlay && overlay.classList.contains('open')) {
      closeLegalModal();
    }
  }
});

// ── Clear session after successful export ──
async function clearSessionAfterExport() {
  await window.StorageEngine.removeItem(LS_KEY);
  _lastSavedAt = null;
  _isDirty     = false;
  setAutosaveBtnState(null);
  updateTimestampDisplay();
}

// ── Bootstrap ──
function initAutoSave() {
  // Patch all state-mutating functions to call markDirty()
  const _origAddStudent    = window.addStudent;
  const _origRemoveStudent = window.removeStudent;
  const _origUpdateStudentIdx = window.updateStudentIdx;
  const _origSaveStudentRow = window.saveStudentRow;
  const _origAddSubject    = typeof window.addSubject    === 'function' ? window.addSubject    : null;
  const _origRemoveSubject = typeof window.removeSubject === 'function' ? window.removeSubject : null;
  const _origAddCategory   = window.addCategory;
  const _origRemoveCategory = window.removeCategory;
  const _origToggleCatMandatory = window.toggleCatMandatory;
  const _origSetMark       = typeof window.setMark === 'function' ? window.setMark : null;
  const _origSetMarkByIndex = window.setMarkByIndex;
  const _origSetMarkCardByIndex = window.setMarkCardByIndex;
  const _origClearAll      = window.clearAll;

  // Wrap setMarkByIndex / setMarkCardByIndex for dirty tracking
  window.setMarkByIndex = function(...a) {
    const r = _origSetMarkByIndex(...a); markDirty(); return r;
  };
  window.setMarkCardByIndex = function(...a) {
    const r = _origSetMarkCardByIndex(...a); markDirty(); return r;
  };

  // Patch meta fields to mark dirty on change
  ['className','academicYear','teacherName','schoolName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markDirty);
  });

  // Override clearAll to also wipe storage
  window.clearAll = function() {
    _origClearAll();
    // After clear, remove saved session
    window.StorageEngine.removeItem(LS_KEY);
    _lastSavedAt = null; _isDirty = false;
    setAutosaveBtnState(null);
    updateTimestampDisplay();
    // clearUndoStack() is now called directly inside clearAll() itself
  };

  // Patch addStudent / removeStudent
  window.addStudent = function(...a) {
    const r = _origAddStudent(...a); markDirty(); return r;
  };
  window.removeStudent = function(...a) {
    const r = _origRemoveStudent(...a); markDirty(); return r;
  };
  window.updateStudentIdx = function(...a) {
    const r = _origUpdateStudentIdx(...a); markDirty(); return r;
  };
  window.saveStudentRow = function(...a) {
    const r = _origSaveStudentRow(...a); markDirty(); return r;
  };
  if (_origAddCategory) window.addCategory = function(...a) {
    const r = _origAddCategory(...a); markDirty(); return r;
  };
  if (_origRemoveCategory) window.removeCategory = function(...a) {
    const r = _origRemoveCategory(...a); markDirty(); return r;
  };
  if (_origToggleCatMandatory) window.toggleCatMandatory = function(...a) {
    const r = _origToggleCatMandatory(...a); markDirty(); return r;
  };

  // Patch subject add/remove via MutationObserver on the subject list
  const subjectListEl = document.getElementById('subjectList');
  if (subjectListEl) {
    new MutationObserver(markDirty).observe(subjectListEl, { childList: true, subtree: true });
  }

  // Patch grading scale saves
  const _origCloseGradePanel = window.closeGradePanel;
  window.closeGradePanel = function(...a) {
    const r = _origCloseGradePanel(...a); markDirty(); return r;
  };
  const _origClosePassMarkPanel = window.closePassMarkPanel;
  window.closePassMarkPanel = function(...a) {
    const r = _origClosePassMarkPanel(...a); markDirty(); return r;
  };

  // Patch export to clear session after successful download
  const _origHandleJpeg = window.handleJpeg;
  window.handleJpeg = async function(...a) {
    const r = await _origHandleJpeg(...a);
    clearSessionAfterExport();
    return r;
  };
  const _origHandlePdf = window.handlePdf;
  window.handlePdf = async function(...a) {
    const r = await _origHandlePdf(...a);
    clearSessionAfterExport();
    return r;
  };

  // Start periodic save loop
  startAutoSaveLoop();

  // Seed pill to "Not saved yet" on first load (before any save happens)
  setAutosaveBtnState('unsaved');
  const _initEl = document.getElementById('autosaveTimestamp');
  if (_initEl) _initEl.textContent = 'Not saved yet';
  updateMobileSavePill('unsaved', 'Not saved yet');

  // Check for existing session
  checkForSavedSession();
}

// ════════════════════════════════════════════
//  END AUTO-SAVE ENGINE
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  EXAM MANAGER SHARED STATE
//  Declared here; exam-manager.js reads/writes via window.*
// ════════════════════════════════════════════
const EM_STORAGE_KEY = 'schoolResultManager_exams_v1';
const EM_ICONS = ['📋','📝','📚','📊','🎓','📌','🏆','📅'];
const EM_COLORS = ['#1a56db','#059669','#d97706','#7c3aed','#dc2626','#0d9488','#c026d3','#f59e0b'];

// Exams store: array of exam objects
let _exams = [];
let _activeExamId = null;

// Expose with getter/setter so exam-manager.js mutations are visible here
Object.defineProperty(window, '_exams', { get() { return _exams; }, set(v) { _exams = v; }, configurable: true });
Object.defineProperty(window, '_activeExamId', { get() { return _activeExamId; }, set(v) { _activeExamId = v; }, configurable: true });
window.EM_STORAGE_KEY = EM_STORAGE_KEY;
window.EM_ICONS       = EM_ICONS;
window.EM_COLORS      = EM_COLORS;


// ── Window exports ──
Object.assign(window, {
  applyState,
  checkForSavedSession,
  clearSessionAfterExport,
  closeLegalModal,
  closeReloadConfirm,
  collectState,
  confirmReload,
  discardSession,
  initAutoSave,
  manualSave,
  markDirty,
  openLegalModal,
  openReloadConfirm,
  restoreSession,
  saveToStorage,
  setAutosaveBtnState,
  startAutoSaveLoop,
  switchLegalTab,
  updateMobileSavePill,
  updateTimestampDisplay
});
