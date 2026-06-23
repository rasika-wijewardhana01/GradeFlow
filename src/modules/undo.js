// ═══════════════════════════════════════════════════════════════
//  src/modules/undo.js
//  Snapshot-based undo stack: _takeSnapshot, undoCheckpoint,
//  performUndo, clearUndoStack, history panel, Ctrl+Z listener,
//  auto-checkpoint patches for all mutating functions,
//  FAB long-press history sheet (mobile).
// ═══════════════════════════════════════════════════════════════
const UNDO_MAX = 20;
let undoStack = [];   // array of snapshot objects, oldest first

// ── Snapshot helpers ──────────────────────────────────────────────────────

function _deepClone(obj) {
  // Deep clone that preserves NaN as '' and undefined values as ''
  // JSON.parse(JSON.stringify()) converts NaN→null and drops undefined keys,
  // which corrupts marks data and causes elective lock state bugs after undo.
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_deepClone);
  const out = {};
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (typeof v === 'number' && isNaN(v)) {
      out[k] = ''; // store NaN marks as empty string
    } else if (v === undefined) {
      out[k] = ''; // store undefined marks as empty string
    } else if (v !== null && typeof v === 'object') {
      out[k] = _deepClone(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function _takeSnapshot(actionLabel, actionIcon) {
  const snap = {
    label: actionLabel,
    icon:  actionIcon || '✏️',
    ts:    Date.now(),
    students:        _deepClone(students),
    subjects:        _deepClone(subjects),
    marks:           _deepClone(marks),
    categories:      _deepClone(categories),
    autoIdx:         autoIndexCounter,
    gradingScale:    _deepClone(window.gradingScale),
    subjectPassMarks: _deepClone(window.subjectPassMarks),
    // Capture Setup tab text fields for full undo restoration
    setupFields: {
      className:    (document.getElementById('className')    || {}).value || '',
      academicYear: (document.getElementById('academicYear') || {}).value || '',
      teacherName:  (document.getElementById('teacherName')  || {}).value || '',
      schoolName:   (document.getElementById('schoolName')   || {}).value || '',
      examLabel:    (document.getElementById('examLabel')    || {}).value || '',
    },
  };
  undoStack.push(snap);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  _refreshUndoUI();
}

// Call this BEFORE any mutating operation with a description of what's about to happen
function undoCheckpoint(label, icon) {
  _takeSnapshot(label, icon);
}

// ── Perform undo ──────────────────────────────────────────────────────────

function performUndo() {
  if (!undoStack.length) {
    // Guard: only show this toast once per second to prevent spam from
    // rapid Ctrl+Z presses or key-repeat leaking through
    if (!performUndo._emptyGuard) {
      window.toast('Nothing to undo', 'info');
      performUndo._emptyGuard = true;
      setTimeout(() => { performUndo._emptyGuard = false; }, 1000);
    }
    return;
  }
  const snap = undoStack.pop();

  // Restore state
  students.length = 0;
  snap.students.forEach(s => students.push(s));

  subjects.length = 0;
  snap.subjects.forEach(s => subjects.push(s));

  // Restore marks — sanitize null/NaN values that may result from JSON round-trips
  // (JSON.stringify converts NaN→null; we restore those as '' so lock logic is correct)
  Object.keys(marks).forEach(k => delete marks[k]);
  Object.keys(snap.marks).forEach(k => {
    const v = snap.marks[k];
    marks[k] = (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? '' : v;
  });

  categories = _deepClone(snap.categories);
  autoIndexCounter = snap.autoIdx;

  // Restore grading scale
  if (snap.gradingScale) {
    window.gradingScale.length = 0;
    snap.gradingScale.forEach(g => window.gradingScale.push(g));
  }

  // Restore subject pass marks
  if (snap.subjectPassMarks) {
    Object.keys(window.subjectPassMarks).forEach(k => delete window.subjectPassMarks[k]);
    Object.assign(window.subjectPassMarks, snap.subjectPassMarks);
  }

  // Restore Setup tab text fields (including examLabel / exam label)
  if (snap.setupFields) {
    ['className','academicYear','teacherName','schoolName','examLabel'].forEach(id => {
      const el = document.getElementById(id);
      if (el && snap.setupFields[id] !== undefined) {
        el.value = snap.setupFields[id];
        // Keep brandingTermLabel mirror in sync when examLabel is restored
        if (id === 'examLabel') {
          const btl = document.getElementById('brandingTermLabel');
          if (btl) btl.value = snap.setupFields[id];
        }
      }
    });
  }

  // Re-render everything affected
  window.updateBadge('students', students.length);
  window.updateBadge('subjects', subjects.length);
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();
  // Always re-render marks table (handles clearing when rows/cols removed)
  // This also re-runs refreshAllElectiveLocks on every row, which is critical:
  // if a bulk fill or undo left disabled=true on any input, the fresh render resets it.
  window.renderMarksTable();
  // BUG FIX: Two-pass unlock safety after undo.
  // Pass 1 (sync): force-enable every input that isn't in an elective-locked state
  //   so no stale disabled attr remains from before the re-render.
  // Pass 2 (RAF): after the browser has painted the new DOM, re-run ALL elective
  //   lock evaluations from scratch based purely on the restored marks data.
  //   This fixes the "table frozen after Ctrl+Z" bug where stale lock state
  //   from a previous fill-column operation survived the undo re-render.
  document.querySelectorAll('#marksTable .mark-input, #marksCardView .mark-subject-input').forEach(function (inp) {
    inp.disabled = false;
    inp.classList.remove('elective-locked', 'elective-chosen');
  });
  requestAnimationFrame(function () {
    // Re-evaluate all elective locks from the freshly restored marks data
    if (typeof students !== 'undefined' && typeof refreshAllElectiveLocks === 'function') {
      students.forEach(function (_, i) { window.refreshAllElectiveLocks(i); });
    }
    // Belt-and-suspenders: any input that is still not elective-locked must be enabled
    document.querySelectorAll('#marksTable .mark-input, #marksCardView .mark-subject-input').forEach(function (inp) {
      if (!inp.classList.contains('elective-locked')) {
        inp.disabled = false;
      }
    });
  });
  // If grade panel is open, re-render it
  if (document.getElementById('gradePanelOverlay')?.classList.contains('open')) {
    window.renderGradePanel();
  }
  // If pass mark panel is open, re-render it
  if (document.getElementById('passmarkPanelOverlay')?.classList.contains('open')) {
    window.renderPassMarkPanel();
  }
  window.updateGradeCurrentBadge();
  _refreshUndoUI();

  // Flash brief amber toast with action restored
  window.toast(`↩ Undone: ${snap.label}`, 'info');
}

// ── Clear stack (on export) ───────────────────────────────────────────────

function clearUndoStack() {
  undoStack = [];
  _refreshUndoUI();
}

// ── UI refresh ────────────────────────────────────────────────────────────

function _refreshUndoUI() {
  const n = undoStack.length;
  const disabled = n === 0;
  const topLabel = disabled ? 'Nothing to undo' : `Undo: ${undoStack[undoStack.length-1]?.label} (Ctrl+Z)`;

  // Topbar action button
  const btn = document.getElementById('undoBtnTopbar');
  const badge = document.getElementById('undoCountBadge');
  if (btn) { btn.disabled = disabled; btn.title = topLabel; }
  if (badge) badge.textContent = n;

  // Topbar chevron button (same disabled state)
  const chevron = document.getElementById('undoChevronBtn');
  if (chevron) { chevron.disabled = disabled; }

  // Dropdown footer undo button
  const panelUndoBtn = document.getElementById('undoPanelUndoBtn');
  if (panelUndoBtn) panelUndoBtn.disabled = disabled;

  // Mobile FAB
  const fab = document.getElementById('undoFab');
  const fabCount = document.getElementById('undoFabCount');
  if (fab) { fab.disabled = disabled; fab.style.opacity = disabled ? '0.35' : '1'; }
  if (fabCount) fabCount.textContent = n;

  // More-sheet sub text
  const msUndoSub = document.getElementById('msUndoSub');
  if (msUndoSub) {
    msUndoSub.textContent = disabled
      ? 'No actions to undo'
      : `${n} action${n !== 1 ? 's' : ''} — last: ${undoStack[undoStack.length-1]?.label}`;
  }
  // More-sheet History button — hide when nothing to show
  const msHistBtn = document.getElementById('msUndoHistoryBtn');
  if (msHistBtn) msHistBtn.style.display = disabled ? 'none' : '';

  // If desktop dropdown is open, refresh its list
  if (typeof _refreshUndoDropdownIfOpen === 'function') _refreshUndoDropdownIfOpen();
}

// ── History panel (desktop dropdown / mobile sheet) ───────────────────────

function _buildHistoryHTML() {
  if (!undoStack.length) {
    return '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">No actions to undo yet</div>';
  }
  // Show newest first
  return [...undoStack].reverse().map((snap, i) => {
    const isCurrent = i === 0;
    const ago = _timeAgo(snap.ts);
    return `<div class="undo-history-item${isCurrent ? ' current' : ''}" onclick="undoToIndex(${undoStack.length - 1 - i})">
      <span class="undo-history-idx">${undoStack.length - i}</span>
      <span class="undo-icon">${snap.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${snap.label}</div>
        <div style="font-size:11px;color:var(--text-light);">${ago}</div>
      </div>
      ${isCurrent ? '<span class="undo-next-badge">Next</span>' : ''}
    </div>`;
  }).join('');
}

function _timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 15)   return 'just now';
  if (s < 60)   return `${s} sec ago`;
  if (s < 120)  return '1 min ago';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (s < 7200) return '1 hour ago';
  return `${Math.floor(s/3600)} hours ago`;
}

function undoToIndex(targetIdx) {
  // Undo until the stack reaches targetIdx items
  while (undoStack.length > targetIdx + 1) undoStack.pop();
  performUndo(); // pops the targetIdx snap and restores it
}

// Mobile history sheet
function openUndoHistory() {
  const modal = document.getElementById('undoHistoryModal');
  const list  = document.getElementById('undoHistModalList');
  const cnt   = document.getElementById('undoHistModalCount');
  if (!modal || !list) return;
  list.innerHTML = _buildHistoryHTML();
  if (cnt) cnt.textContent = `(${undoStack.length} action${undoStack.length !== 1 ? 's' : ''})`;
  modal.style.display = 'flex';
  modal.classList.add('open');
  // Focus first interactive element for keyboard accessibility
  setTimeout(() => {
    const firstBtn = modal.querySelector('button:not(:disabled)');
    if (firstBtn) firstBtn.focus();
  }, 50);
}
function closeUndoHistory() {
  const modal = document.getElementById('undoHistoryModal');
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

// ── Desktop dropdown toggle ──────────────────────────────────────────────
let _undoDropdownOpen = false;

function toggleUndoDropdown() {
  if (_undoDropdownOpen) { closeUndoDropdown(); return; }
  openUndoDropdown();
}

function openUndoDropdown() {
  const panel = document.getElementById('undoHistoryPanel');
  const list  = document.getElementById('undoHistoryList');
  const btn   = document.getElementById('undoChevronBtn');
  const icon  = document.getElementById('undoChevronIcon');
  if (!panel || !list) return;
  list.innerHTML = _buildHistoryHTML();
  panel.classList.add('open');
  _undoDropdownOpen = true;
  if (btn)  btn.setAttribute('aria-expanded', 'true');
  if (icon) icon.style.transform = 'rotate(180deg)';
  // Close on outside click (next event loop tick so this click doesn't immediately close it)
  setTimeout(() => {
    document.addEventListener('click', _undoDropdownOutsideClick, { once: true });
  }, 0);
}

function closeUndoDropdown() {
  const panel = document.getElementById('undoHistoryPanel');
  const btn   = document.getElementById('undoChevronBtn');
  const icon  = document.getElementById('undoChevronIcon');
  if (panel) panel.classList.remove('open');
  _undoDropdownOpen = false;
  if (btn)  btn.setAttribute('aria-expanded', 'false');
  if (icon) icon.style.transform = '';
  document.removeEventListener('click', _undoDropdownOutsideClick);
}

function _undoDropdownOutsideClick(e) {
  const wrap = document.getElementById('undoPanelWrap');
  if (wrap && !wrap.contains(e.target)) {
    closeUndoDropdown();
  } else if (_undoDropdownOpen) {
    // Click was inside the panel but not a close trigger — re-attach listener
    setTimeout(() => {
      document.addEventListener('click', _undoDropdownOutsideClick, { once: true });
    }, 0);
  }
}

// Re-render dropdown list when it's open (called from _refreshUndoUI)
function _refreshUndoDropdownIfOpen() {
  if (!_undoDropdownOpen) return;
  const list = document.getElementById('undoHistoryList');
  if (list) list.innerHTML = _buildHistoryHTML();
}

// ── FAB: long-press opens history sheet (mobile) ─────────────────────────
(function() {
  let _fabTimer = null;
  document.addEventListener('DOMContentLoaded', () => {
    const fab = document.getElementById('undoFab');
    if (!fab) return;
    fab.addEventListener('touchstart', e => {
      _fabTimer = setTimeout(() => { _fabTimer = null; openUndoHistory(); }, 500);
    }, { passive: true });
    fab.addEventListener('touchend', () => { if (_fabTimer) { clearTimeout(_fabTimer); _fabTimer = null; } });
    fab.addEventListener('touchmove', () => { if (_fabTimer) { clearTimeout(_fabTimer); _fabTimer = null; } });
  });
})();

// ── Keyboard shortcut Ctrl+Z / Cmd+Z ─────────────────────────────────────
// Debounced: key-repeat fires keydown many times/sec — only act once per press.

let _undoKeyLock = false;
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    const tag = document.activeElement?.tagName;
    const isMark = document.activeElement?.classList?.contains('mark-input');
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !isMark) return;
    e.preventDefault();
    // Ignore browser key-repeat events (fires while key is held down)
    if (e.repeat) return;
    // Extra throttle guard (300ms) against rapid successive presses
    if (_undoKeyLock) return;
    _undoKeyLock = true;
    setTimeout(() => { _undoKeyLock = false; }, 300);
    performUndo();
  }
});

// ── Patch mutating functions to auto-checkpoint ───────────────────────────

// Wrap addStudent
const _origAddStudent = window.addStudent;
window.addStudent = function() {
  undoCheckpoint('Student added', '👤');
  _origAddStudent.apply(this, arguments);
};

// Wrap removeStudent
const _origRemoveStudent = window.removeStudent;
window.removeStudent = function(i) {
  const name = students[i]?.name || 'student';
  undoCheckpoint(`Removed student: ${name}`, '👤');
  _origRemoveStudent.apply(this, arguments);
};

// Wrap addSubject
const _origAddSubject = window.addSubject;
window.addSubject = function() {
  undoCheckpoint('Subject added', '📚');
  _origAddSubject.apply(this, arguments);
};

// Wrap removeSubject
const _origRemoveSubject = window.removeSubject;
window.removeSubject = function(i) {
  const name = subjects[i]?.name || 'subject';
  undoCheckpoint(`Removed subject: ${name}`, '📚');
  _origRemoveSubject.apply(this, arguments);
};

// Wrap setMark — debounced: only snapshot when value stabilises (500ms gap)
let _markUndoTimer = null;
let _markUndoPending = false;
const _origSetMark = window.setMark;
window.setMark = function(studentName, subj, val, max, el, si) {
  if (!_markUndoPending) {
    _takeSnapshot(`Mark updated — ${studentName} / ${subj}`, '📝');
    _markUndoPending = true;
  }
  clearTimeout(_markUndoTimer);
  _markUndoTimer = setTimeout(() => { _markUndoPending = false; }, 1200);
  _origSetMark.apply(this, arguments);
};

// Wrap setMarkCard likewise
const _origSetMarkCard = window.setMarkCard;
window.setMarkCard = function(studentName, subj, val, max, el, si) {
  if (!_markUndoPending) {
    _takeSnapshot(`Edit mark: ${studentName} / ${subj}`, '📝');
    _markUndoPending = true;
  }
  clearTimeout(_markUndoTimer);
  _markUndoTimer = setTimeout(() => { _markUndoPending = false; }, 1200);
  _origSetMarkCard.apply(this, arguments);
};

// Wrap fillSampleData
const _origFillSampleData = window.fillSampleData;
window.fillSampleData = function() {
  undoCheckpoint('Sample marks filled', '🎲');
  _origFillSampleData.apply(this, arguments);
};

// Wrap addSampleStudents
const _origAddSampleStudents = window.addSampleStudents;
window.addSampleStudents = function() {
  undoCheckpoint('Sample students loaded', '👥');
  _origAddSampleStudents.apply(this, arguments);
};

// Wrap addSampleSubjects
const _origAddSampleSubjects = window.addSampleSubjects;
window.addSampleSubjects = function() {
  undoCheckpoint('Sample subjects loaded', '📚');
  _origAddSampleSubjects.apply(this, arguments);
};

// Wrap addCategory
const _origAddCategory = window.addCategory;
window.addCategory = function() {
  undoCheckpoint('Group added', '🏷️');
  _origAddCategory.apply(this, arguments);
};

// Wrap removeCategory
const _origRemoveCategory = window.removeCategory;
window.removeCategory = function(name) {
  undoCheckpoint(`Removed group: ${name}`, '🏷️');
  _origRemoveCategory.apply(this, arguments);
};

// Hook to be called by export functions
function onExportComplete() {
  clearUndoStack();
  window.toast('Undo history cleared after export', 'info');
}


// ── Window exports ──
Object.assign(window, {
  _refreshUndoUI,
  _takeSnapshot,
  clearUndoStack,
  closeUndoDropdown,
  closeUndoHistory,
  onExportComplete,
  openUndoDropdown,
  openUndoHistory,
  performUndo,
  toggleUndoDropdown,
  undoCheckpoint,
  undoToIndex
});
