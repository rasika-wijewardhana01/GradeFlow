// ═══════════════════════════════════════════════════════════════
//  src/modules/reset.js
//  Reset confirmation modal and clearAll().
// ═══════════════════════════════════════════════════════════════
// ── Reset Confirmation Modal ──
function openResetConfirm() {
  const overlay = document.getElementById('resetConfirmOverlay');
  overlay.classList.add('open');
  // Focus trap: focus the Cancel button by default (safer choice)
  setTimeout(() => {
    const cancelBtn = document.getElementById('rcCancelBtn');
    if (cancelBtn) cancelBtn.focus();
  }, 50);
}

function closeResetConfirm() {
  document.getElementById('resetConfirmOverlay').classList.remove('open');
  // Restore focus to the trigger that opened the dialog
  const trigger = document.getElementById('resetBtn');
  if (trigger) trigger.focus();
}

// Focus trap for reset confirm dialog
document.addEventListener('keydown', function(e) {
  const overlay = document.getElementById('resetConfirmOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (e.key !== 'Tab') return;
  const dialog = overlay.querySelector('[role="alertdialog"]');
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
});

function confirmResetAll() {
  closeResetConfirm();
  clearAll();
}

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('resetConfirmOverlay');
    if (overlay && overlay.classList.contains('open')) closeResetConfirm();
  }
});
function clearAll() {

  // Reset all data
  students = []; subjects = []; marks = {}; results = []; autoIndexCounter = 1;
  window.subjectPassMarks = {};

  // ── FIX: categories must be reset as objects (not plain strings) ──
  // Using plain strings caused categories.map(c => c.name) to return
  // undefined values, silently breaking renderResultsTable() and leaving
  // stale data visible in the Results tab after Reset All.
  categories = [
    { name: 'Academic',  mandatory: true  },
    { name: 'Aesthetic', mandatory: false },
    { name: 'Sports',    mandatory: false },
    { name: 'Languages', mandatory: false },
  ];

  // Clear Setup tab fields and fire input events so dirty-tracker sees it
  ['className','academicYear','teacherName','schoolName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.dispatchEvent(new Event('input')); }
  });

  // Re-render all tabs so no stale DOM remains
  window.updateBadge('students', 0);
  window.updateBadge('subjects', 0);
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();
  window.renderMarksTable();
  window.renderResultsTable();     // results=[] → shows empty state
  window.renderSubjectAnalytics(); // clears Analytics tab

  // Clear undo stack (must happen before goToStep so undo-UI resets cleanly)
  if (typeof clearUndoStack === 'function') window.clearUndoStack();

  // Navigate to Setup tab last, after all renders are complete
  window.goToStep(0);
  // Re-lock steps 4–6 since all data is cleared
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast('All data cleared');
}


// ── Window exports ──
Object.assign(window, {
  clearAll,
  closeResetConfirm,
  confirmResetAll,
  openResetConfirm
});
