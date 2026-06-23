// ═══════════════════════════════════════════════════════════════
//  src/modules/exam-manager.js
//  Multi-exam (multi-term) CRUD: create, switch, delete,
//  duplicate, rename. Compare modal. Export all terms to Excel.
//  Export compare modal to Excel. initExamManagerBoostrap().
// ═══════════════════════════════════════════════════════════════
// ── Generate unique ID ──
function _emId() { return 'exam_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

// ── Save exams to StorageEngine ──
async function _emSave() {
  try {
    await window.StorageEngine.setItem(EM_STORAGE_KEY, JSON.stringify({ exams: _exams, activeId: _activeExamId }));
  } catch(e) { console.warn('Exam Manager save failed:', e); }
}

// ── Load exams from StorageEngine ──
async function _emLoad() {
  try {
    const raw = await window.StorageEngine.getItem(EM_STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.exams) || !d.exams.length) return false;
    window._exams = d.exams;
    window._activeExamId = d.activeId || _exams[0].id;
    return true;
  } catch(e) { return false; }
}

// ── Snapshot current app state into an exam object ──
function _emSnapshotActive() {
  const exam = _exams.find(e => e.id === _activeExamId);
  if (!exam) return;
  exam.students        = JSON.parse(JSON.stringify(students));
  exam.subjects        = JSON.parse(JSON.stringify(subjects));
  exam.categories      = JSON.parse(JSON.stringify(categories));
  exam.marks           = JSON.parse(JSON.stringify(marks));
  exam.gradingScale    = JSON.parse(JSON.stringify(window.gradingScale));
  exam.subjectPassMarks= JSON.parse(JSON.stringify(window.subjectPassMarks));
  exam.autoIndexCounter= autoIndexCounter;
  exam.meta = {
    className:    (document.getElementById('className')    || {}).value || '',
    academicYear: (document.getElementById('academicYear') || {}).value || '',
    teacherName:  (document.getElementById('teacherName')  || {}).value || '',
    schoolName:   (document.getElementById('schoolName')   || {}).value || '',
    examLabel:    (document.getElementById('examLabel')    || {}).value || '',
    examType:     exam.meta ? (exam.meta.examType || '') : '',
  };
  exam.savedAt = new Date().toISOString();
  // Auto-rename the exam in Exam Manager if label changed and name is still a default
  // Called here (not just on blur) so Save button also triggers the rename
  var _labelVal = exam.meta.examLabel.trim();
  if (_labelVal) _emAutoRenameFromLabel(_labelVal, true); // skipSave=true — _emSave() runs after snapshot
}

// ── Apply an exam's data to the app ──
function _emApplyExam(exam) {
  autoIndexCounter  = exam.autoIndexCounter || 1;
  students          = exam.students  ? JSON.parse(JSON.stringify(exam.students))  : [];
  subjects          = exam.subjects  ? JSON.parse(JSON.stringify(exam.subjects))  : [];
  categories        = exam.categories? JSON.parse(JSON.stringify(exam.categories)): [];
  marks             = exam.marks     ? JSON.parse(JSON.stringify(exam.marks))     : {};
  window.subjectPassMarks  = exam.subjectPassMarks ? JSON.parse(JSON.stringify(exam.subjectPassMarks)) : {};
  if (exam.gradingScale && exam.gradingScale.length) {
    window.gradingScale.length = 0;
    exam.gradingScale.forEach(g => window.gradingScale.push(g));
  }
  const m = exam.meta || {};
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
  window.updateBadge('students', students.length);
  window.updateBadge('subjects', subjects.length);
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();
  results = [];
  window.goToStep(0);
}

// ── Get active exam ──
function _emActive() { return _exams.find(e => e.id === _activeExamId); }

// ── Auto-rename active exam from Exam/Test Label field ──
// Called on blur of #examLabel. Only renames if:
//   (a) the label is non-empty
//   (b) the exam's current name is still a recognised default
// This way power users who manually named their exam are never overwritten.
var _EM_DEFAULT_NAMES = [
  'term 1','term 2','term 3','term 4',
  'new exam','exam 1','exam 2','exam 3',
  'mid-year exam','final exam','test 1','test 2'
];
function _emAutoRenameFromLabel(label, skipSave) {
  if (!label) {
    // Field was cleared — revert the sidebar display back to the committed exam name
    // so the chip doesn't stay blank while the user hasn't typed a new value yet.
    _emRefreshUI();
    return;
  }
  var exam = _emActive();
  if (!exam) return;
  if (label === exam.name) return;             // already matches — no change needed

  var currentName = (exam.name || '').trim().toLowerCase();
  var savedLabel  = ((exam.meta && exam.meta.examLabel) || '').trim().toLowerCase();

  // Rename is allowed if ANY of:
  //  (a) exam name is still a system default (Term 1, New Exam, etc.), OR
  //  (b) exam name matches the previously saved exam label — meaning it was
  //      already label-driven and the user is updating it, OR
  //  (c) exam.meta.examLabel is empty — the label field has never been saved
  //      yet so the exam hasn't been manually renamed via the Exam Manager;
  //      always allow the first-time sync from the Setup tab.
  var isDefault = _EM_DEFAULT_NAMES.indexOf(currentName) !== -1
    || /^term\s*\d+$/i.test(exam.name)
    || /^new exam$/i.test(exam.name)
    || /^exam\s*\d+$/i.test(exam.name);
  var labelDriven = savedLabel && (currentName === savedLabel);
  var neverLabelled = !savedLabel; // examLabel never saved → always allow sync

  if (!isDefault && !labelDriven && !neverLabelled) return; // user manually named this exam — respect it

  exam.name = label;
  if (!skipSave) _emSave();                    // skip when called from _emSnapshotActive to avoid save loop
  _emRefreshUI();
  // Also refresh the Exam Manager UI if it's open
  var emOverlay = document.getElementById('examManagerOverlay');
  if (emOverlay && emOverlay.style.display !== 'none') renderExamManager();
  window.toast('\u2713 Exam renamed to \u201c' + label + '\u201d', 'success');
}
// ── Update UI chips showing current exam name ──
function _emRefreshUI() {
  const exam = _emActive();
  const name = exam ? exam.name : 'No Exam';
  const el1 = document.getElementById('examSelectorName');
  const el2 = document.getElementById('sidebarExamName');
  if (el1) el1.textContent = name;
  if (el2) el2.textContent = name;
  _emUpdateSidebarRing();
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE 1 — COMPLETION RING
//  Thin coloured arc around the exam icon in the sidebar chip showing
//  overall marks fill % (cells entered ÷ total possible cells).
//  Purely passive — no interaction required.
// ─────────────────────────────────────────────────────────────────────────────
// Fill % must respect elective groups: a student only needs to fill ONE
// subject within an elective category (they pick one), not all of them.
// Mandatory categories (and uncategorised subjects) require a cell per
// subject per student, same as before.
//
//   expected cells per student = (count of mandatory/uncategorised subjects)
//                                + (count of distinct elective categories)
//
//   filled cells per student   = mandatory subjects with a mark/AB
//                                + (1 per elective category, if ANY subject
//                                   in that category has a mark/AB for that student)
//
//   fill % = total filled ÷ (students × expected-per-student) × 100
function _emFillPct(exam) {
  if (!exam) return 0;
  const stds = exam.students || [];
  const subs = exam.subjects || [];
  if (!stds.length || !subs.length) return 0;

  // Use live window.marks/categories for the active exam (more up to date than snapshot)
  const isActive = exam.id === window._activeExamId;
  const mks  = isActive ? (window.marks || exam.marks || {}) : (exam.marks || {});
  const cats = isActive ? (window.categories || exam.categories || []) : (exam.categories || []);

  const isMandatory = (catName) => {
    if (!catName || catName === '' || catName === '__uncategorised__') return true;
    const c = cats.find(x => x.name === catName);
    return c ? c.mandatory : false; // unknown category → treat as elective
  };

  // Group subjects by category
  const groups = {}; // catKey -> { mandatory, subjects: [...] }
  subs.forEach(sub => {
    const catName = sub.category || '';
    const key = catName === '' ? '__none__' : catName;
    if (!groups[key]) groups[key] = { mandatory: isMandatory(catName), subjects: [] };
    groups[key].subjects.push(sub);
  });

  // Expected cells per student: 1 per mandatory subject + 1 per elective category
  let expectedPerStudent = 0;
  Object.values(groups).forEach(g => {
    expectedPerStudent += g.mandatory ? g.subjects.length : 1;
  });
  if (!expectedPerStudent) return 0;

  const hasMark = (v) => v !== undefined && v !== '' && v !== null;

  let filled = 0;
  stds.forEach(s => {
    Object.values(groups).forEach(g => {
      if (g.mandatory) {
        g.subjects.forEach(sub => {
          if (hasMark(mks[`${s.name}||${sub.name}`])) filled++;
        });
      } else {
        // Elective: counts as 1 filled cell if ANY subject in the group has a mark
        const chosen = g.subjects.some(sub => hasMark(mks[`${s.name}||${sub.name}`]));
        if (chosen) filled++;
      }
    });
  });

  return Math.round((filled / (stds.length * expectedPerStudent)) * 100);
}

// Shared colour scale for completion rings: grey/hidden at 0%,
// blue while in progress, green once essentially complete (>=95%).
// Using 95% (not 100%) as the green threshold means a near-full class
// (e.g. 99% — one or two late entries away from done) reads as "done"
// at a glance, which matches how teachers actually judge completion.
function _emRingColour(pct) {
  if (pct >= 95) return '#22c55e';
  if (pct > 0)   return '#60a5fa';
  return 'transparent';
}

function _emUpdateSidebarRing() {
  const exam  = _emActive();
  const pct   = _emFillPct(exam);
  // Expanded chip ring  — circumference of r=10.5: 2π×10.5 ≈ 65.97
  const arcEl = document.getElementById('sidebarRingArc');
  if (arcEl) {
    const C = 65.97;
    arcEl.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2);
    arcEl.style.stroke = _emRingColour(pct);
  }
  // Collapsed chip ring — circumference of r=13.5: 2π×13.5 ≈ 84.82
  const arcC = document.getElementById('sidebarRingArcCollapsed');
  if (arcC) {
    const C2 = 84.82;
    arcC.style.strokeDashoffset = (C2 * (1 - pct / 100)).toFixed(2);
    arcC.style.stroke = _emRingColour(pct);
  }
  // Exam Manager hero ring (only present while the modal is open)
  // — circumference of r=21: 2π×21 ≈ 131.95
  const heroArc = document.getElementById('emHeroRingArc');
  if (heroArc) {
    const C3 = 131.95;
    heroArc.style.strokeDashoffset = (C3 * (1 - pct / 100)).toFixed(2);
    heroArc.style.stroke = _emRingColour(pct);
  }
  const heroPct = document.getElementById('emHeroFillPct');
  if (heroPct) {
    if (pct > 0) {
      heroPct.textContent = pct + '% filled';
      heroPct.style.display = '';
    } else {
      heroPct.style.display = 'none';
    }
  }
}

// Passive background poll — picks up live mark entries without needing an event hook
setInterval(_emUpdateSidebarRing, 4000);

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE 2 — BATCH CLASS / YEAR ASSIGNMENT
//  Checkbox on each card → sticky batch bar → bulk edit class / year.
// ─────────────────────────────────────────────────────────────────────────────
window._emSelectedIds = new Set();

function _emToggleSelect(id, checked, evt) {
  if (evt) evt.stopPropagation();
  if (checked) window._emSelectedIds.add(id);
  else         window._emSelectedIds.delete(id);
  _emSyncBatchBar();
}

function _emSyncBatchBar() {
  const bar = document.getElementById('emBatchBar');
  if (!bar) return;
  const n = window._emSelectedIds.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const lbl = document.getElementById('emBatchCount');
  if (lbl) lbl.textContent = `${n} exam${n !== 1 ? 's' : ''} selected`;
}

function _emClearBatchSelect() {
  window._emSelectedIds.clear();
  document.querySelectorAll('.em-sel-cb').forEach(cb => { cb.checked = false; });
  _emSyncBatchBar();
}

function _emApplyBatch() {
  const classVal = (document.getElementById('emBatchClass')?.value || '').trim();
  const yearVal  = (document.getElementById('emBatchYear')?.value  || '').trim();
  if (!classVal && !yearVal) {
    window.toast('Enter a class and/or year to apply', 'error'); return;
  }
  let updated = 0;
  window._emSelectedIds.forEach(id => {
    const exam = _exams.find(e => e.id === id);
    if (!exam) return;
    if (!exam.meta) exam.meta = {};
    if (classVal) exam.meta.className    = classVal;
    if (yearVal)  exam.meta.academicYear = yearVal;
    updated++;
  });
  if (!updated) return;
  window._emSelectedIds.clear();
  _emSave();
  renderExamManager();
  window.toast(`\u2713 Updated ${updated} exam${updated !== 1 ? 's' : ''}`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE 3 — "NEW EXAM FROM THIS ONE" SHORTCUT
//  Hero-banner button that pre-fills class/year and bumps the term number.
// ─────────────────────────────────────────────────────────────────────────────
function _emBumpTermName(name) {
  // Bump trailing number: "Term 1" → "Term 2",  "Final 3" → "Final 4"
  const m = name.match(/^([\s\S]*?)(\d+)(\s*)$/);
  if (m) return m[1] + (parseInt(m[2], 10) + 1) + m[3];
  // No trailing number → append " 2"
  return name.trim() + ' 2';
}

function _emNewFromActive() {
  const active = _emActive();
  if (!active) return;

  // Ensure the new-exam form is rendered and visible
  const form = document.getElementById('examNewForm');
  if (!form) { renderExamManager(); setTimeout(_emNewFromActive, 60); return; }
  form.style.display = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Pre-fill name (bump term number)
  const nameInp = document.getElementById('newExamNameInput');
  if (nameInp) nameInp.value = _emBumpTermName(active.name);

  // Pre-fill class + year from active exam
  const classInp = document.getElementById('newExamClassInput');
  if (classInp) classInp.value = (active.meta && active.meta.className)    || '';
  const yearInp  = document.getElementById('newExamYearInput');
  if (yearInp)  yearInp.value  = (active.meta && active.meta.academicYear) || '';

  // Default copy source → "copy from active" (students + subjects, clear marks)
  const fromSel = document.getElementById('newExamFromSel');
  if (fromSel) fromSel.value = 'copy_meta';

  // Pre-fill exam type
  const typeSel = document.getElementById('newExamTypeInput');
  if (typeSel) typeSel.value = (active.meta && active.meta.examType) || '';

  setTimeout(() => { if (nameInp) { nameInp.focus(); nameInp.select(); } }, 80);
}

// ── Init Exam Manager ──
async function initExamManager() {
  const loaded = await _emLoad();
  if (loaded) {
    // ── FIX: Do NOT apply saved exam data while the restore modal is open.
    //
    //  Race condition: initAutoSave() → checkForSavedSession() opens the
    //  restore modal. initExamManager() ran concurrently and called
    //  _emApplyExam() here, populating className/academicYear/teacherName
    //  BEFORE the user clicked Restore or Discard.
    //  Clicking Discard only closed the modal — fields stayed filled.
    //
    //  Fix: skip _emApplyExam() if the restore modal is currently showing.
    //  discardSession() now calls clearAll() + resets exam state itself.
    //  restoreSession() already calls applyState() which handles all fields.
    // ──────────────────────────────────────────────────────────────────────
    const restoreOverlay = document.getElementById('restoreModalOverlay');
    const restorePending = restoreOverlay && restoreOverlay.classList.contains('open');
    const active = _emActive();
    if (active) {
      if (!restorePending) {
        _emApplyExam(active);
      }
      _emRefreshUI();
      return;
    }
  }
  // First time — create a default exam from current state or blank
  const firstExam = {
    id: _emId(),
    name: 'Term 1',
    icon: '📋',
    color: EM_COLORS[0],
    createdAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    students: [], subjects: [], categories: [], marks: {},
    gradingScale: JSON.parse(JSON.stringify(window.gradingScale)),
    subjectPassMarks: {},
    autoIndexCounter: 1,
    meta: { className:'', academicYear:'', teacherName:'', schoolName:'', examType:'' }
  };
  // If there's already a session from the old system, grab it
  try {
    const raw = await window.StorageEngine.getItem(window.LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s) {
        firstExam.students        = s.students        || [];
        firstExam.subjects        = s.subjects        || [];
        firstExam.categories      = s.categories      || [];
        firstExam.marks           = s.marks           || {};
        firstExam.gradingScale    = s.gradingScale    || firstExam.gradingScale;
        firstExam.subjectPassMarks= s.subjectPassMarks|| {};
        firstExam.autoIndexCounter= s.autoIndexCounter|| 1;
        firstExam.meta            = s.meta            || firstExam.meta;
        firstExam.name = s.meta && s.meta.className ? s.meta.className + ' — Term 1' : 'Term 1';
      }
    }
  } catch(e) {}
  window._exams = [firstExam];
  window._activeExamId = firstExam.id;
  _emApplyExam(firstExam);
  await _emSave();
  _emRefreshUI();
}

// ── Open / Close ──
function openExamManager() {
  // Open the overlay immediately so the modal animation paints without delay,
  // and drop in a lightweight skeleton so there's no blank flash on slower
  // devices while the real content renders a frame later.
  // The snapshot (4x JSON deep-clones of students/subjects/categories/marks),
  // the storage save, and the full exam-list re-render are all relatively
  // expensive for larger classes — running them before toggling `.open`
  // blocks the browser from painting the click's feedback, which shows up
  // as a poor Interaction to Next Paint. Deferring to the next frame lets
  // the open animation start first, then the modal body fills in a beat later.
  const body = document.getElementById('examModalBody');
  if (body && !body.innerHTML.trim()) {
    body.innerHTML = '<div class="em-skeleton" aria-hidden="true">'
      + '<div class="em-skeleton-hero"></div>'
      + '<div class="em-skeleton-row"></div>'
      + '<div class="em-skeleton-row"></div>'
      + '<div class="em-skeleton-row"></div>'
      + '</div>';
  }
  document.getElementById('examModalOverlay').classList.add('open');
  requestAnimationFrame(function () {
    _emSnapshotActive();
    _emSave();
    renderExamManager();
  });
}
function closeExamManager() {
  document.getElementById('examModalOverlay').classList.remove('open');
}

// ── Render a single archived exam card (compact, muted, restore/delete only) ──
function _emArchivedCard(exam) {
  const color = exam.color || EM_COLORS[0];
  const svgClip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="vertical-align:middle;flex-shrink:0;"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>';
  const s = (exam.students||[]).length;
  const sub = (exam.subjects||[]).length;
  const d = exam.savedAt ? new Date(exam.savedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '';
  return `<div class="exam-item-wrapper" id="exam-wrapper-${exam.id}">
  <div class="exam-item exam-item--archived" id="exam-item-${exam.id}">
    <div class="exam-item-icon" style="background:${color}14;border:1.5px solid ${color}30;opacity:0.75;">
      <span>${exam.icon || svgClip}</span>
    </div>
    <div class="exam-item-body" id="exam-body-${exam.id}" style="opacity:0.8;">
      <div class="exam-item-name" style="color:var(--text-muted);">${_escHtml(exam.name)}</div>
      <div class="exam-item-meta">${s} stu · ${sub} sub${d?' · '+d:''}</div>
    </div>
    <div class="exam-item-actions">
      <button class="exam-item-btn em-restore-btn" onclick="unarchiveExam('${exam.id}')" title="Restore this exam to the active list">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
        Restore
      </button>
      <button class="exam-item-btn danger" id="exam-del-btn-${exam.id}" onclick="requestDeleteExam('${exam.id}')" title="Delete permanently">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>
  </div>
  <div class="exam-delete-confirm" id="exam-del-confirm-${exam.id}">
    <div class="exam-delete-confirm-header">
      <div class="exam-delete-confirm-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      </div>
      <span class="exam-delete-confirm-title">Delete exam permanently?</span>
    </div>
    <div class="exam-delete-confirm-body">
      <strong>${_escHtml(exam.name)}</strong> and all its marks &amp; data will be erased. This cannot be undone.
    </div>
    <div class="exam-delete-confirm-actions">
      <button class="exam-del-btn-cancel" onclick="cancelDeleteExam('${exam.id}')">Keep it</button>
      <button class="exam-del-btn-destroy" onclick="deleteExam('${exam.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Yes, delete
      </button>
    </div>
  </div>
  </div>`;
}

// ── Render Exam Manager body (redesigned) ──
function renderExamManager() {
  const active = _emActive();
  const body = document.getElementById('examModalBody');
  if (!body) return;

  // Any open inline edit panel will be rebuilt closed — clear stale state
  window._emEditingId = null;

  // ── Active exam hero banner ──
  const activeIcon  = active ? (active.icon  || '📋')        : '📋';
  const activeColor = active ? (active.color || EM_COLORS[0]) : EM_COLORS[0];
  const activeStats = active ? _emStatsChips(active) : '';
  const activeFill  = active ? _emFillPct(active) : 0;

  // Progress arc for hero icon (circumference r=21: 2π×21 ≈ 131.95)
  const _heroC      = 131.95;
  const _heroOffset = (_heroC * (1 - activeFill / 100)).toFixed(2);
  const _heroStroke = _emRingColour(activeFill);

  let html = `<div class="em-active-hero">
    <div class="em-active-icon-wrap">
      <svg class="em-hero-ring-svg" viewBox="0 0 48 48" aria-hidden="true">
        <circle class="em-hero-ring-track" cx="24" cy="24" r="21" fill="none" stroke-width="3"/>
        <circle class="em-hero-ring-arc" cx="24" cy="24" r="21" fill="none" stroke-width="3"
          stroke-dasharray="${_heroC} ${_heroC}"
          stroke-dashoffset="${_heroOffset}"
          style="stroke:${_heroStroke};transform-origin:center;transform:rotate(-90deg);"
          id="emHeroRingArc"/>
      </svg>
      <div class="em-active-icon" style="background:${activeColor};">
        <span style="filter:brightness(5);">${activeIcon}</span>
      </div>
    </div>
    <div style="flex:1;min-width:0;">
      <div class="em-active-label">Currently active</div>
      <div class="em-active-name">${_escHtml(active ? active.name : '—')}</div>
      <div class="em-active-meta">${activeStats}</div>
      <div class="em-hero-actions">
        <button class="em-hero-new-btn" onclick="_emNewFromActive()" title="Create next exam for the same class — pre-fills class, year and bumps the term number">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M12 5v14M5 12h14"/></svg>
          New exam for same class
        </button>
        <span class="em-hero-fill-pct" id="emHeroFillPct" title="Marks entered" style="${activeFill > 0 ? '' : 'display:none;'}">${activeFill}% filled</span>
      </div>
    </div>
  </div>`;

  // ── Batch bar (shown when ≥1 exam is checked) ──
  html += `<div class="em-batch-bar" id="emBatchBar" style="display:none;">
    <span class="em-batch-count" id="emBatchCount">0 exams selected</span>
    <div class="em-batch-fields">
      <input type="text" id="emBatchClass" class="em-batch-input" placeholder="Class / Grade" maxlength="40"/>
      <input type="text" id="emBatchYear"  class="em-batch-input" placeholder="Academic Year"  maxlength="20"/>
    </div>
    <div class="em-batch-actions">
      <button class="btn btn-primary btn-sm" onclick="_emApplyBatch()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg>
        Apply to selected
      </button>
      <button class="btn btn-ghost btn-sm" onclick="_emClearBatchSelect()">Clear</button>
    </div>
  </div>`;

  // ── All exams section ──
  const _activeExams   = _exams.filter(e => !e.archived);
  const _archivedExams = _exams.filter(e => e.archived);

  html += `<div class="em-section-header">
    <div class="em-section-label">
      All Exams
      <span class="em-count-badge">${_activeExams.length}</span>
    </div>
  </div>`;

  // ── Filter bar (show when 4+ active exams AND multiple classes or years exist) ──
  const _fc_classes = [...new Set(_activeExams.map(e => (e.meta&&e.meta.className) ? e.meta.className.trim() : '').filter(Boolean))].sort();
  const _fc_years   = [...new Set(_activeExams.map(e => (e.meta&&e.meta.academicYear) ? e.meta.academicYear.trim() : '').filter(Boolean))].sort();
  const _fc_types   = [...new Set(_activeExams.map(e => (e.meta&&e.meta.examType) ? e.meta.examType.trim() : '').filter(Boolean))].sort();
  if (_activeExams.length >= 4 && (_fc_classes.length > 1 || _fc_years.length > 1 || _fc_types.length > 1)) {
    html += `<div class="em-filter-bar">
      <div class="em-filter-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="emFilterInput" placeholder="Filter exams…" oninput="filterExamList()" />
      </div>
      ${_fc_classes.length > 1 ? `<select id="emFilterClass" onchange="filterExamList()" title="Filter by class"><option value="">All classes</option>${_fc_classes.map(c=>`<option value="${_escHtml(c)}">${_escHtml(c)}</option>`).join('')}</select>` : ''}
      ${_fc_years.length > 1   ? `<select id="emFilterYear"  onchange="filterExamList()" title="Filter by year"><option value="">All years</option>${_fc_years.map(y=>`<option value="${_escHtml(y)}">${_escHtml(y)}</option>`).join('')}</select>`  : ''}
      ${_fc_types.length > 1   ? `<select id="emFilterType"  onchange="filterExamList()" title="Filter by type"><option value="">All types</option>${_fc_types.map(t=>`<option value="${_escHtml(t)}">${_escHtml(t)}</option>`).join('')}</select>`  : ''}
    </div>`;
  }

  html += `<div class="exam-list" id="examList">`;

  // ── Helper: render a single exam card ──
  function _emExamCard(exam) {
    const isActive = exam.id === _activeExamId;
    const color = exam.color || EM_COLORS[0];
    const svgClip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="vertical-align:middle;flex-shrink:0;"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>';
    const typeBadge = (exam.meta && exam.meta.examType) ? `<span class="em-type-badge em-type-${exam.meta.examType.toLowerCase().replace(/\s+/g,'-')}">${_escHtml(exam.meta.examType)}</span>` : '';
    const dragHandle = `<span class="em-drag-handle" title="Drag to reorder" data-exam-id="${exam.id}" style="color:var(--text-muted);opacity:0.35;cursor:grab;display:inline-flex;align-items:center;flex-shrink:0;padding:0 4px;touch-action:none;user-select:none;transition:opacity 0.12s;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="9" cy="5" r="1.5" fill="currentColor"/><circle cx="15" cy="5" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="19" r="1.5" fill="currentColor"/><circle cx="15" cy="19" r="1.5" fill="currentColor"/></svg></span>`;
    const isSelected = window._emSelectedIds && window._emSelectedIds.has(exam.id);
    const selCheckbox = `<label class="em-sel-label" onclick="event.stopPropagation()" title="Select for batch edit">
      <input type="checkbox" class="em-sel-cb" ${isSelected ? 'checked' : ''}
        onchange="_emToggleSelect('${exam.id}', this.checked, event)"/>
    </label>`;
    return `<div class="exam-item-wrapper" id="exam-wrapper-${exam.id}" data-exam-id="${exam.id}">
    <div class="exam-item${isActive ? ' exam-active' : ''}" id="exam-item-${exam.id}">
      ${dragHandle}
      ${selCheckbox}
      <div class="exam-item-icon" style="background:${color}20;border:1.5px solid ${color}45;">
        <span>${exam.icon || svgClip}</span>
      </div>
      <div class="exam-item-body" id="exam-body-${exam.id}">
        <div class="exam-item-name">${_escHtml(exam.name)}${typeBadge}</div>
        <div class="exam-item-meta">${_emStats(exam)}</div>
      </div>
      ${isActive
        ? `<div class="exam-item-actions">
            <span class="exam-active-badge">✓ Active</span>
            <button class="exam-item-btn" onclick="startEditExam('${exam.id}')" title="Edit exam — name, icon, colour, class, year &amp; type">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="exam-item-btn" onclick="duplicateExam('${exam.id}')" title="Duplicate — copies students &amp; subjects, clears marks">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>`
        : `<div class="exam-item-actions">
            <button class="exam-item-btn switch-btn" onclick="switchToExam('${exam.id}')" title="Switch to this exam">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Switch
            </button>
            <button class="exam-item-btn" onclick="startEditExam('${exam.id}')" title="Edit exam — name, icon, colour, class, year &amp; type">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="exam-item-btn" onclick="duplicateExam('${exam.id}')" title="Duplicate — copies students &amp; subjects, clears marks">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="exam-item-btn em-archive-btn" onclick="archiveExam('${exam.id}')" title="Archive this exam — hides it from the active list">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button class="exam-item-btn danger" id="exam-del-btn-${exam.id}" onclick="requestDeleteExam('${exam.id}')" title="Delete this exam permanently">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>`
      }
    </div>
    <div class="exam-delete-confirm" id="exam-del-confirm-${exam.id}">
      <div class="exam-delete-confirm-header">
        <div class="exam-delete-confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <span class="exam-delete-confirm-title">Delete exam permanently?</span>
      </div>
      <div class="exam-delete-confirm-body">
        <strong>${_escHtml(exam.name)}</strong> and all its marks &amp; data will be erased. This cannot be undone.
      </div>
      <div class="exam-delete-confirm-actions">
        <button class="exam-del-btn-cancel" onclick="cancelDeleteExam('${exam.id}')">Keep it</button>
        <button class="exam-del-btn-destroy" onclick="deleteExam('${exam.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          Yes, delete
        </button>
      </div>
    </div>
    <div class="exam-edit-panel" id="exam-edit-${exam.id}"></div>
    </div>`;
  }

  // ── Group by year → class if any active exam has that metadata ──
  const _hasGroups = _activeExams.some(e => e.meta && (e.meta.academicYear || e.meta.className));

  if (_hasGroups) {
    const _groups = {};
    _activeExams.forEach(exam => {
      const yr  = (exam.meta && exam.meta.academicYear) ? exam.meta.academicYear.trim() : '';
      const cls = (exam.meta && exam.meta.className)    ? exam.meta.className.trim()    : '';
      const key = `${yr}|||${cls}`;
      if (!_groups[key]) _groups[key] = { yr, cls, exams: [] };
      _groups[key].exams.push(exam);
    });
    // Sort: years desc (newest first), then class name asc, ungrouped last
    const sortedKeys = Object.keys(_groups).sort((a, b) => {
      const ga = _groups[a], gb = _groups[b];
      if (!ga.yr && !ga.cls) return 1;   // no metadata → last
      if (!gb.yr && !gb.cls) return -1;
      if (ga.yr !== gb.yr) return gb.yr.localeCompare(ga.yr, undefined, {numeric:true}); // year desc
      return ga.cls.localeCompare(gb.cls); // class asc
    });
    sortedKeys.forEach(key => {
      const g = _groups[key];
      if (g.yr || g.cls) {
        const yrBadge  = g.yr  ? `<span class="em-group-yr-badge">${_escHtml(g.yr)}</span>`   : '';
        const clsBadge = g.cls ? `<span class="em-group-cls-badge">${_escHtml(g.cls)}</span>` : '';
        html += `<div class="em-group-header">${yrBadge}${clsBadge}<span class="em-group-count">${g.exams.length} exam${g.exams.length!==1?'s':''}</span></div>`;
      }
      g.exams.forEach(exam => { html += _emExamCard(exam); });
    });
  } else {
    _activeExams.forEach(exam => { html += _emExamCard(exam); });
  }

  html += `</div>`; // close .exam-list

  // ── Archived section ──
  if (_archivedExams.length > 0) {
    const showArchived = window._emShowArchived || false;
    html += `<div class="em-archive-toggle-row" id="emArchiveToggleRow">
      <button class="em-archive-toggle-btn" onclick="toggleArchivedSection()" aria-expanded="${showArchived}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
        ${showArchived ? 'Hide' : 'Show'} archived
        <span class="em-count-badge" style="margin-left:4px;">${_archivedExams.length}</span>
        <span class="em-archive-chevron${showArchived ? ' em-archive-chevron--open' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </button>
    </div>`;

    if (showArchived) {
      html += `<div class="em-archived-section" id="emArchivedSection">
        <div class="em-archived-notice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          Archived exams are read-only. Restore an exam to make it active again.
        </div>
        <div class="exam-list">`;
      _archivedExams.forEach(exam => { html += _emArchivedCard(exam); });
      html += `</div></div>`;
    }
  }

  // ── New exam panel (hidden by default) ──
  html += `<div class="exam-new-panel" id="examNewForm" style="display:none;">
    <div class="exam-new-panel-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      Create a new exam
    </div>

    <div class="em-field">
      <label>Exam / Term name</label>
      <input type="text" id="newExamNameInput" placeholder="e.g. Term 2, Mid-Year, Final Exam" maxlength="60" />
    </div>

    <div class="em-field-row">
      <div class="em-field">
        <label>Class / Grade</label>
        <input type="text" id="newExamClassInput" placeholder="e.g. Grade 11, Class 9A" maxlength="40" />
      </div>
      <div class="em-field">
        <label>Academic Year</label>
        <input type="text" id="newExamYearInput" placeholder="e.g. 2024/25" maxlength="20" />
      </div>
    </div>

    <div class="em-field-row em-field-row--type-copy">
      <div class="em-field">
        <label>Exam Type</label>
        <select id="newExamTypeInput">
          <option value="">— None —</option>
          <option value="Class Test">Class Test</option>
          <option value="Midterm">Midterm</option>
          <option value="Final">Final</option>
          <option value="Mock">Mock</option>
          <option value="Assignment">Assignment</option>
        </select>
      </div>
      <div class="em-field">
        <label>Copy data from</label>
        <select id="newExamFromSel" onchange="_emPreFillFromSource(this.value)">
          <option value="blank">Start blank — empty students &amp; subjects</option>
          <option value="copy_meta">Copy from active exam (students &amp; subjects, clear marks)</option>
          ${_exams.map(e => `<option value="copy_${e.id}">Copy from: ${_escHtml(e.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="em-picker-row">
      <div class="em-picker-group">
        <div class="em-picker-group-label">Icon</div>
        <div class="exam-icon-row" id="newExamIconRow">
          ${EM_ICONS.map((ic, i) => `<button class="exam-icon-btn${i===0?' selected':''}" onclick="_emPickIcon(this,'${ic}')" data-icon="${ic}" type="button">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="em-picker-group">
        <div class="em-picker-group-label">Colour</div>
        <div class="exam-color-row" id="newExamColorRow">
          ${EM_COLORS.map((c, i) => `<div class="exam-color-swatch${i===0?' selected':''}" style="background:${c};" onclick="_emPickColor(this,'${c}')" data-color="${c}" title="${c}"></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="em-new-cta">
      <button class="btn btn-primary btn-sm" onclick="createNewExam()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M12 5v14M5 12h14"/></svg>
        Create Exam
      </button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('examNewForm').style.display='none'">Cancel</button>
    </div>
  </div>`;

  body.innerHTML = html;

  // Wire compare button visibility
  const compareBtn = document.getElementById('compareBtn');
  if (compareBtn) compareBtn.style.display = _exams.length >= 2 ? '' : 'none';

  // Init drag-to-reorder for exam list
  _initExamDragDrop();
}

function _emStatsChips(exam) {
  const s = (exam.students||[]).length;
  const sub = (exam.subjects||[]).length;
  const svgPeople = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="10" height="10"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;
  const svgBook = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="10" height="10"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
  const cls  = (exam.meta && exam.meta.className)    ? exam.meta.className.trim()    : '';
  const yr   = (exam.meta && exam.meta.academicYear) ? exam.meta.academicYear.trim() : '';
  const type = (exam.meta && exam.meta.examType)     ? exam.meta.examType.trim()     : '';
  const clsChip  = cls  ? `<span class="em-active-chip em-active-chip--info">🏫 ${_escHtml(cls)}</span>`  : '';
  const yrChip   = yr   ? `<span class="em-active-chip em-active-chip--info">📅 ${_escHtml(yr)}</span>`   : '';
  const typeChip = type ? `<span class="em-active-chip em-active-chip--type">📝 ${_escHtml(type)}</span>` : '';

  return `${clsChip}${yrChip}${typeChip}<span class="em-active-chip">${svgPeople} ${s} student${s!==1?'s':''}</span>
          <span class="em-active-chip">${svgBook} ${sub} subject${sub!==1?'s':''}</span>`;
}

function _emStats(exam) {
  const s = (exam.students||[]).length;
  const sub = (exam.subjects||[]).length;
  const d = exam.savedAt ? new Date(exam.savedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '';
  const cls  = (exam.meta && exam.meta.className)    ? exam.meta.className.trim()    : '';
  const yr   = (exam.meta && exam.meta.academicYear) ? exam.meta.academicYear.trim() : '';
  const type = (exam.meta && exam.meta.examType)     ? exam.meta.examType.trim()     : '';
  const tag = (cls || yr)
    ? `<span class="em-card-tag">${_escHtml([cls, yr].filter(Boolean).join(' · '))}</span>`
    : '';
  const typeTag = type ? `<span class="em-type-badge em-type-${type.toLowerCase().replace(/\s+/g,'-')}">${_escHtml(type)}</span>` : '';

  return `${tag}${typeTag}${s} stu · ${sub} sub${d?' · '+d:''}`;
}

function _escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }


function _emPickIcon(btn, icon) {
  const row = btn.closest('.exam-icon-row');
  if (row) row.querySelectorAll('.exam-icon-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}
function _emPickColor(el, color) {
  const row = el.closest('.exam-color-row');
  if (row) row.querySelectorAll('.exam-color-swatch').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
}

function addNewExam() {
  const form = document.getElementById('examNewForm');
  if (!form) { renderExamManager(); return; }
  form.style.display = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => { const inp = document.getElementById('newExamNameInput'); if (inp) { inp.focus(); inp.select(); } }, 80);
}

function createNewExam() {
  const nameInp = document.getElementById('newExamNameInput');
  const name = nameInp ? nameInp.value.trim() : '';
  if (!name) { window.toast('Enter a name for the exam', 'error'); return; }
  const iconEl = document.querySelector('#newExamIconRow .exam-icon-btn.selected');
  const colorEl = document.querySelector('#newExamColorRow .exam-color-swatch.selected');
  const fromSel = document.getElementById('newExamFromSel');
  const fromVal = fromSel ? fromSel.value : 'blank';
  const icon = iconEl ? iconEl.dataset.icon : '📋';
  const color = colorEl ? colorEl.dataset.color : EM_COLORS[0];

  let newStudents = [], newSubjects = [], newCategories = [], newGrading = JSON.parse(JSON.stringify(window.gradingScale));
  let newMeta = { className:'', academicYear:'', teacherName:'', schoolName:'' };
  let newAutoIdx = 1;

  if (fromVal === 'copy_meta') {
    // Copy from active exam (students + subjects, clear marks)
    const active = _emActive();
    if (active) {
      newStudents   = JSON.parse(JSON.stringify(active.students||[]));
      newSubjects   = JSON.parse(JSON.stringify(active.subjects||[]));
      newCategories = JSON.parse(JSON.stringify(active.categories||[]));
      newGrading    = JSON.parse(JSON.stringify(active.gradingScale||window.gradingScale));
      newMeta       = JSON.parse(JSON.stringify(active.meta||newMeta));
      newAutoIdx    = active.autoIndexCounter || 1;
    }
  } else if (fromVal.startsWith('copy_')) {
    const srcId = fromVal.slice(5);
    const src = _exams.find(e=>e.id===srcId);
    if (src) {
      newStudents   = JSON.parse(JSON.stringify(src.students||[]));
      newSubjects   = JSON.parse(JSON.stringify(src.subjects||[]));
      newCategories = JSON.parse(JSON.stringify(src.categories||[]));
      newGrading    = JSON.parse(JSON.stringify(src.gradingScale||window.gradingScale));
      newMeta       = JSON.parse(JSON.stringify(src.meta||newMeta));
      newAutoIdx    = src.autoIndexCounter || 1;
    }
  }

  // ── Override meta with user-entered class/year/type if provided ──
  const classInp = document.getElementById('newExamClassInput');
  const yearInp  = document.getElementById('newExamYearInput');
  const typeInp  = document.getElementById('newExamTypeInput');
  const userClass = classInp ? classInp.value.trim() : '';
  const userYear  = yearInp  ? yearInp.value.trim()  : '';
  const userType  = typeInp  ? typeInp.value.trim()  : '';
  if (userClass) newMeta.className    = userClass;
  if (userYear)  newMeta.academicYear = userYear;
  newMeta.examType = userType;

  const exam = {
    id: _emId(), name, icon, color,
    createdAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    students: newStudents, subjects: newSubjects, categories: newCategories,
    marks: {}, gradingScale: newGrading, subjectPassMarks: {},
    autoIndexCounter: newAutoIdx, meta: newMeta
  };
  // Save current active before switching
  _emSnapshotActive();
  _exams.push(exam);
  window._activeExamId = exam.id;
  _emApplyExam(exam);
  _emSave();
  _emRefreshUI();
  closeExamManager();
  window.toast(`✓ "${name}" created and activated`, 'success');
}

function switchToExam(id) {
  if (id === _activeExamId) { closeExamManager(); return; }
  // Snapshot current state
  _emSnapshotActive();
  // Save
  _emSave();
  // Activate new
  window._activeExamId = id;
  const exam = _emActive();
  if (!exam) return;
  _emApplyExam(exam);
  _emSave();
  _emRefreshUI();
  closeExamManager();
  window.clearUndoStack();
  window.toast(`✓ Switched to "${exam.name}"`, 'success');
}

function requestDeleteExam(id) {
  if (_exams.length <= 1) { window.toast('Cannot delete the last exam — create another first', 'error'); return; }
  // Close any other open confirm rows first
  document.querySelectorAll('.exam-delete-confirm.visible').forEach(el => {
    const otherId = el.id.replace('exam-del-confirm-', '');
    if (otherId !== id) {
      el.classList.remove('visible');
      const btn = document.getElementById('exam-del-btn-' + otherId);
      if (btn) btn.classList.remove('confirming');
    }
  });
  const row = document.getElementById('exam-del-confirm-' + id);
  const btn  = document.getElementById('exam-del-btn-' + id);
  if (!row) return;
  const isOpen = row.classList.contains('visible');
  if (isOpen) {
    row.classList.remove('visible');
    if (btn) btn.classList.remove('confirming');
  } else {
    row.classList.add('visible');
    if (btn) btn.classList.add('confirming');
    setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }
}

function cancelDeleteExam(id) {
  const row = document.getElementById('exam-del-confirm-' + id);
  const btn  = document.getElementById('exam-del-btn-' + id);
  if (row) row.classList.remove('visible');
  if (btn) btn.classList.remove('confirming');
}

function deleteExam(id) {
  if (_exams.length <= 1) { window.toast('Cannot delete the last exam', 'error'); return; }
  const exam = _exams.find(e=>e.id===id);
  if (!exam) return;
  window._exams = _exams.filter(e=>e.id!==id);
  if (_activeExamId === id) {
    window._activeExamId = _exams[0].id;
    _emApplyExam(_exams[0]);
  }
  _emSave();
  _emRefreshUI();
  renderExamManager();
  window.toast(`"${exam.name}" deleted`, 'info');
}

// ── Archive / unarchive ──
function archiveExam(id) {
  const exam = _exams.find(e => e.id === id);
  if (!exam) return;
  if (exam.id === _activeExamId) {
    window.toast('Switch to another exam before archiving the active one', 'error');
    return;
  }
  exam.archived = true;
  _emSave();
  renderExamManager();
  window.toast(`"${exam.name}" archived`, 'info');
}
function unarchiveExam(id) {
  const exam = _exams.find(e => e.id === id);
  if (!exam) return;
  exam.archived = false;
  _emSave();
  renderExamManager();
  window.toast(`"${exam.name}" restored`, 'success');
}
// ── Toggle "show archived" state (stored on window so it survives re-render) ──
function toggleArchivedSection() {
  window._emShowArchived = !window._emShowArchived;
  renderExamManager();
  // Scroll to archived section after toggle
  if (window._emShowArchived) {
    setTimeout(() => {
      const sec = document.getElementById('emArchivedSection');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
}

function duplicateExam(id) {
  const src = _exams.find(e=>e.id===id);
  if (!src) return;
  // Snapshot current first
  _emSnapshotActive();
  const newExam = JSON.parse(JSON.stringify(src));
  newExam.id = _emId();
  newExam.name = src.name + ' (copy)';
  newExam.marks = {}; // clear marks on duplicate
  newExam.createdAt = new Date().toISOString();
  newExam.savedAt = new Date().toISOString();
  _exams.push(newExam);
  window._activeExamId = newExam.id;
  _emApplyExam(newExam);
  _emSave();
  _emRefreshUI();
  closeExamManager();
  window.toast(`"${newExam.name}" created — marks cleared`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
//  FULL EXAM EDIT PANEL
//  Opens an inline form (name, class, year, exam type, icon, colour) for an
//  existing exam. Closes any other open edit panel first.
// ─────────────────────────────────────────────────────────────────────────────
function startEditExam(id) {
  // Close any other open edit panel first
  if (window._emEditingId && window._emEditingId !== id) cancelEditExam(window._emEditingId);

  const panel = document.getElementById('exam-edit-' + id);
  const exam  = _exams.find(e => e.id === id);
  if (!panel || !exam) return;

  window._emEditingId = id;

  const meta  = exam.meta || {};
  const icon  = exam.icon  || '📋';
  const color = exam.color || EM_COLORS[0];

  panel.innerHTML = `
    <div class="exam-edit-panel-inner">
      <div class="em-field">
        <label>Exam / Term name</label>
        <input type="text" id="editExamName-${id}" value="${_escHtml(exam.name)}" maxlength="60"
          onkeydown="if(event.key==='Enter')commitEditExam('${id}');if(event.key==='Escape')cancelEditExam('${id}')" />
      </div>

      <div class="em-field-row">
        <div class="em-field">
          <label>Class / Grade</label>
          <input type="text" id="editExamClass-${id}" value="${_escHtml(meta.className || '')}" placeholder="e.g. Grade 11, Class 9A" maxlength="40"
            onkeydown="if(event.key==='Enter')commitEditExam('${id}');if(event.key==='Escape')cancelEditExam('${id}')" />
        </div>
        <div class="em-field">
          <label>Academic Year</label>
          <input type="text" id="editExamYear-${id}" value="${_escHtml(meta.academicYear || '')}" placeholder="e.g. 2024/25" maxlength="20"
            onkeydown="if(event.key==='Enter')commitEditExam('${id}');if(event.key==='Escape')cancelEditExam('${id}')" />
        </div>
      </div>

      <div class="em-field">
        <label>Exam Type</label>
        <select id="editExamType-${id}">
          <option value="" ${!meta.examType ? 'selected' : ''}>— None —</option>
          ${['Class Test','Midterm','Final','Mock','Assignment'].map(t =>
            `<option value="${t}" ${meta.examType===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>

      <div class="em-picker-row">
        <div class="em-picker-group">
          <div class="em-picker-group-label">Icon</div>
          <div class="exam-icon-row" id="editExamIconRow-${id}">
            ${EM_ICONS.map(ic => `<button class="exam-icon-btn${ic===icon?' selected':''}" onclick="_emPickIcon(this,'${ic}')" data-icon="${ic}" type="button">${ic}</button>`).join('')}
          </div>
        </div>
        <div class="em-picker-group">
          <div class="em-picker-group-label">Colour</div>
          <div class="exam-color-row" id="editExamColorRow-${id}">
            ${EM_COLORS.map(c => `<div class="exam-color-swatch${c===color?' selected':''}" style="background:${c};" onclick="_emPickColor(this,'${c}')" data-color="${c}" title="${c}"></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="em-new-cta">
        <button class="btn btn-primary btn-sm" onclick="commitEditExam('${id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
          Save Changes
        </button>
        <button class="btn btn-ghost btn-sm" onclick="cancelEditExam('${id}')">Cancel</button>
      </div>
    </div>`;

  panel.classList.add('open');

  const nameInp = document.getElementById('editExamName-' + id);
  if (nameInp) { nameInp.focus(); nameInp.select(); }
}

function cancelEditExam(id) {
  const panel = document.getElementById('exam-edit-' + id);
  if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
  if (window._emEditingId === id) window._emEditingId = null;
}

function commitEditExam(id) {
  const exam = _exams.find(e => e.id === id);
  if (!exam) return;

  const nameInp  = document.getElementById('editExamName-'  + id);
  const classInp = document.getElementById('editExamClass-' + id);
  const yearInp  = document.getElementById('editExamYear-'  + id);
  const typeSel  = document.getElementById('editExamType-'  + id);
  const iconEl   = document.querySelector('#editExamIconRow-'  + id + ' .exam-icon-btn.selected');
  const colorEl  = document.querySelector('#editExamColorRow-' + id + ' .exam-color-swatch.selected');

  const name = nameInp ? nameInp.value.trim() : exam.name;
  if (!name) { window.toast('Exam name cannot be empty', 'error'); return; }

  exam.name  = name;
  exam.icon  = iconEl  ? iconEl.dataset.icon   : (exam.icon  || '📋');
  exam.color = colorEl ? colorEl.dataset.color : (exam.color || EM_COLORS[0]);

  if (!exam.meta) exam.meta = {};
  exam.meta.className    = classInp ? classInp.value.trim() : (exam.meta.className    || '');
  exam.meta.academicYear = yearInp  ? yearInp.value.trim()  : (exam.meta.academicYear || '');
  exam.meta.examType     = typeSel  ? typeSel.value          : (exam.meta.examType     || '');

  // ── FORCE-SYNC: Exam/Test Label ← Exam Manager rename ──────────────────
  //  exam.name and exam.meta.examLabel are supposed to mirror each other
  //  (see _emAutoRenameFromLabel and the restore force-sync in autosave.js),
  //  but this edit panel only ever wrote exam.name, leaving meta.examLabel
  //  stale. That caused two bugs: (1) the Setup tab's "Exam/Test Label"
  //  field shows the old name next time this exam is loaded, and (2) if the
  //  stale examLabel happens to match a recognised default name pattern
  //  ("Term 1", "New Exam", etc.), _emAutoRenameFromLabel's guard silently
  //  reverts this rename the next time _emSnapshotActive() runs (on any
  //  exam switch, creation, or duplication). Writing directly here — the
  //  same ground-truth bypass already used for the restore path — keeps
  //  both fields permanently in sync and avoids re-triggering the guard.
  exam.meta.examLabel = name;
  if (id === _activeExamId) {
    const labelInp = document.getElementById('examLabel');
    if (labelInp) labelInp.value = name;
    if (typeof window.syncTermLabel === 'function') window.syncTermLabel();
  }

  _emSave();
  _emRefreshUI();
  window._emEditingId = null;
  renderExamManager();
  window.toast(`"${exam.name}" updated`, 'success');
}

// ── Pre-fill class/year inputs when user picks a copy source ──
function _emPreFillFromSource(val) {
  let src = null;
  if (val === 'copy_meta') src = _emActive();
  else if (val.startsWith('copy_')) src = _exams.find(e => e.id === val.slice(5));
  if (!src || !src.meta) return;
  const ci = document.getElementById('newExamClassInput');
  const yi = document.getElementById('newExamYearInput');
  // Only pre-fill if the field is currently empty (don't stomp user edits)
  if (ci && !ci.value.trim()) ci.value = src.meta.className    || '';
  if (yi && !yi.value.trim()) yi.value = src.meta.academicYear || '';
}

// ── Filter exam list (called from filter bar inputs) ──
function filterExamList() {
  const q    = (document.getElementById('emFilterInput')?.value  || '').toLowerCase();
  const fCls = (document.getElementById('emFilterClass')?.value  || '');
  const fYr  = (document.getElementById('emFilterYear')?.value   || '');
  const fTyp = (document.getElementById('emFilterType')?.value   || '');
  let anyVisible = false;
  _exams.forEach(exam => {
    const wrapper = document.getElementById('exam-wrapper-' + exam.id);
    if (!wrapper) return;
    const nameMatch = !q    || exam.name.toLowerCase().includes(q);
    const clsMatch  = !fCls || ((exam.meta && exam.meta.className)    || '') === fCls;
    const yrMatch   = !fYr  || ((exam.meta && exam.meta.academicYear) || '') === fYr;
    const typMatch  = !fTyp || ((exam.meta && exam.meta.examType)     || '') === fTyp;
    const visible   = nameMatch && clsMatch && yrMatch && typMatch;
    wrapper.style.display = visible ? '' : 'none';
    if (visible) anyVisible = true;
  });
  // Show group headers for visible groups, hide empty ones
  document.querySelectorAll('.em-group-header').forEach(hdr => {
    // Show header if any following exam-item-wrapper sibling is visible
    let next = hdr.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('em-group-header')) {
      if (next.classList.contains('exam-item-wrapper') && next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    hdr.style.display = hasVisible ? '' : 'none';
  });
}

// ── Filter compare modal by class ──
function filterCompare() {
  _compareClassFilter = document.getElementById('compareClassFilter')?.value || '';
  renderCompare();
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXAM DRAG-TO-REORDER
//  Pointer-event based drag that reorders window._exams[].
//  Mirrors the student/subject-category drag pattern exactly.
// ─────────────────────────────────────────────────────────────────────────────
let _examDrag                = null;
let _examDragStylesInjected  = false;

function _injectExamDragStyles() {
  if (_examDragStylesInjected) return;
  _examDragStylesInjected = true;
  const style = document.createElement('style');
  style.id = 'exam-dnd-styles';
  style.textContent = `
    .exam-item-wrapper.em-is-dragging { opacity: 0.25 !important; }

    .exam-item-wrapper.em-insert-before::before {
      content: '';
      position: absolute;
      top: -4px; left: 8px; right: 8px;
      height: 3px; border-radius: 3px;
      background: rgba(26,86,219,0.85);
      box-shadow: 0 0 0 3px rgba(26,86,219,0.18);
      pointer-events: none;
    }
    .exam-item-wrapper.em-insert-after::after {
      content: '';
      position: absolute;
      bottom: -4px; left: 8px; right: 8px;
      height: 3px; border-radius: 3px;
      background: rgba(26,86,219,0.85);
      box-shadow: 0 0 0 3px rgba(26,86,219,0.18);
      pointer-events: none;
    }
    [data-theme="dark"] .exam-item-wrapper.em-insert-before::before,
    [data-theme="dark"] .exam-item-wrapper.em-insert-after::after {
      background: rgba(129,140,248,0.90);
      box-shadow: 0 0 0 3px rgba(129,140,248,0.22);
    }

    .exam-item-wrapper { position: relative; }

    body.em-dragging-active { cursor: grabbing !important; }
    body.em-dragging-active * { user-select: none !important; }
    body.em-dragging-active .em-drag-handle { cursor: grabbing !important; }

    .em-drag-ghost {
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      opacity: 0.92;
      transform: rotate(0.8deg) scale(1.02);
      box-shadow: 0 8px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10);
      border-radius: var(--radius, 8px);
      background: var(--bg);
      border: 1.5px solid var(--primary, #1a56db);
    }

    .em-drag-handle:hover { opacity: 0.8 !important; }

    /* Type badge styles */
    .em-type-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 99px;
      margin-left: 6px;
      vertical-align: middle;
      letter-spacing: 0.03em;
    }
    .em-type-class-test  { background: #dbeafe; color: #1e40af; }
    .em-type-midterm     { background: #fef9c3; color: #854d0e; }
    .em-type-final       { background: #fce7f3; color: #9d174d; }
    .em-type-mock        { background: #d1fae5; color: #065f46; }
    .em-type-assignment  { background: #ede9fe; color: #5b21b6; }
    [data-theme="dark"] .em-type-class-test  { background: #1e3a8a44; color: #93c5fd; }
    [data-theme="dark"] .em-type-midterm     { background: #78350f44; color: #fde68a; }
    [data-theme="dark"] .em-type-final       { background: #9d174d44; color: #fbcfe8; }
    [data-theme="dark"] .em-type-mock        { background: #065f4644; color: #6ee7b7; }
    [data-theme="dark"] .em-type-assignment  { background: #5b21b644; color: #c4b5fd; }

    .em-active-chip--type {
      background: var(--primary-light, #dbeafe);
      color: var(--primary, #1a56db);
    }
  `;
  if (!document.getElementById('exam-dnd-styles')) document.head.appendChild(style);
}

function _initExamDragDrop() {
  _injectExamDragStyles();
  document.querySelectorAll('.em-drag-handle').forEach(handle => {
    handle.removeEventListener('pointerdown', _onExamHandleDown);
    handle.addEventListener('pointerdown', _onExamHandleDown, { passive: false });
  });
}

function _onExamHandleDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const wrapper = e.currentTarget.closest('.exam-item-wrapper');
  if (!wrapper) return;
  e.preventDefault();
  e.stopPropagation();

  const examId = wrapper.dataset.examId;
  const rect   = wrapper.getBoundingClientRect();

  const ghost = wrapper.cloneNode(true);
  ghost.querySelectorAll('input, .exam-delete-confirm').forEach(n => n.remove());
  ghost.classList.add('em-drag-ghost');
  ghost.classList.remove('em-is-dragging', 'em-insert-before', 'em-insert-after');
  Object.assign(ghost.style, {
    left:   rect.left  + 'px',
    top:    rect.top   + 'px',
    width:  rect.width + 'px',
    margin: '0',
  });
  document.body.appendChild(ghost);

  wrapper.classList.add('em-is-dragging');
  document.body.classList.add('em-dragging-active');

  _examDrag = {
    examId, wrapper, ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    insertTargetId: null,
    insertBefore:   true,
  };

  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}

  document.addEventListener('pointermove',   _onExamDragMove,   { passive: false });
  document.addEventListener('pointerup',     _onExamDragEnd);
  document.addEventListener('pointercancel', _onExamDragCancel);
}

function _clearExamInsertIndicators() {
  document.querySelectorAll('.exam-item-wrapper').forEach(r => {
    r.classList.remove('em-insert-before', 'em-insert-after');
  });
}

function _onExamDragMove(e) {
  if (!_examDrag) return;
  e.preventDefault();
  const { ghost, offsetX, offsetY } = _examDrag;

  ghost.style.left = (e.clientX - offsetX) + 'px';
  ghost.style.top  = (e.clientY - offsetY) + 'px';

  ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.visibility = '';

  _clearExamInsertIndicators();

  const targetWrapper = under && under.closest('.exam-item-wrapper:not(.em-is-dragging)');
  if (targetWrapper) {
    const tRect      = targetWrapper.getBoundingClientRect();
    const insertBefore = e.clientY < tRect.top + tRect.height / 2;
    _examDrag.insertTargetId = targetWrapper.dataset.examId;
    _examDrag.insertBefore   = insertBefore;
    targetWrapper.classList.add(insertBefore ? 'em-insert-before' : 'em-insert-after');
  } else {
    _examDrag.insertTargetId = null;
  }
}

function _onExamDragEnd(e) {
  if (!_examDrag) return;
  const { examId, wrapper, ghost, insertTargetId, insertBefore } = _examDrag;

  ghost.remove();
  wrapper.classList.remove('em-is-dragging');
  document.body.classList.remove('em-dragging-active');
  _clearExamInsertIndicators();
  _examDrag = null;

  document.removeEventListener('pointermove',   _onExamDragMove);
  document.removeEventListener('pointerup',     _onExamDragEnd);
  document.removeEventListener('pointercancel', _onExamDragCancel);

  if (!insertTargetId || insertTargetId === examId) return;

  // Reorder _exams array
  const fromIdx = _exams.findIndex(ex => ex.id === examId);
  const toIdx   = _exams.findIndex(ex => ex.id === insertTargetId);
  if (fromIdx < 0 || toIdx < 0) return;

  const [moved] = _exams.splice(fromIdx, 1);
  let insertAt  = toIdx > fromIdx ? toIdx - 1 : toIdx;
  if (!insertBefore) insertAt += 1;
  _exams.splice(insertAt, 0, moved);

  _emSave();
  renderExamManager();
  window.toast(`"${moved.name}" reordered`, 'success');
}

function _onExamDragCancel() {
  if (!_examDrag) return;
  const { wrapper, ghost } = _examDrag;
  ghost.remove();
  wrapper.classList.remove('em-is-dragging');
  document.body.classList.remove('em-dragging-active');
  _clearExamInsertIndicators();
  _examDrag = null;
  document.removeEventListener('pointermove',   _onExamDragMove);
  document.removeEventListener('pointerup',     _onExamDragEnd);
  document.removeEventListener('pointercancel', _onExamDragCancel);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SET EXAM TYPE on existing exam (called from inline edit in card)
// ─────────────────────────────────────────────────────────────────────────────
function setExamType(examId, type) {
  const exam = _exams.find(e => e.id === examId);
  if (!exam) return;
  if (!exam.meta) exam.meta = {};
  exam.meta.examType = type;
  _emSave();
  renderExamManager();
  if (type) window.toast(`Type set to "${type}"`, 'success');
}

// ── Patch existing save functions to also save the exam ──
function _emPatchSaveToStorage() {
  const _orig = window.saveToStorage || saveToStorage;
  window.saveToStorage = function() {
    _emSnapshotActive();
    _emSave();
    _orig.apply(this, arguments);
  };
}

// ── Compare Modal ──
// Stores the currently active class filter ─ '' means all classes
let _compareClassFilter = '';

function openCompareModal() {
  closeExamManager();
  // Default to the active exam's class if there are multiple classes
  const active = _emActive();
  const activeCls = active && active.meta && active.meta.className ? active.meta.className.trim() : '';
  const allCls = [...new Set(_exams.map(e => (e.meta&&e.meta.className) ? e.meta.className.trim() : '').filter(Boolean))];
  _compareClassFilter = (allCls.length > 1 && activeCls) ? activeCls : '';
  renderCompare();
  document.getElementById('compareModalOverlay').classList.add('open');
}
function closeCompareModal() {
  document.getElementById('compareModalOverlay').classList.remove('open');
}

// Tracks which student rows have been expanded to show per-subject scores
let _compareExpandedStudents = new Set();

function toggleCompareStudentExpand(studentName) {
  // studentName may come from dataset (HTML-attribute decoded) or direct call
  if (_compareExpandedStudents.has(studentName)) {
    _compareExpandedStudents.delete(studentName);
  } else {
    _compareExpandedStudents.add(studentName);
  }
  renderCompare();
}

function renderCompare() {
  const body = document.getElementById('compareModalBody');
  if (!body) return;

  if (_exams.length < 2) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Create at least 2 exams to compare them.</div>';
    return;
  }

  // ── Class filter bar ──
  const allCompareClasses = [...new Set(_exams.map(e => (e.meta&&e.meta.className) ? e.meta.className.trim() : '').filter(Boolean))].sort();
  const ef = _compareClassFilter || '';
  const examsToCompare = (ef && allCompareClasses.length > 1)
    ? _exams.filter(e => (e.meta&&e.meta.className) ? e.meta.className.trim() === ef : false)
    : _exams;

  let filterBarHtml = '';
  if (allCompareClasses.length > 1) {
    filterBarHtml = `<div class="em-compare-filter-bar">
      <span class="em-compare-filter-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M22 3H2l8 9.46V19l4 2V12.46z"/></svg>
        Class:
      </span>
      <select id="compareClassFilter" onchange="filterCompare()" title="Scope comparison to one class">
        <option value="">All classes (${_exams.length} exams)</option>
        ${allCompareClasses.map(c => { const sel = ef===c ? ' selected' : ''; return `<option value="${_escHtml(c)}"${sel}>${_escHtml(c)} (${_exams.filter(e=>(e.meta&&e.meta.className&&e.meta.className.trim())===c).length} exams)</option>`; }).join('')}
      </select>
    </div>`;
  }

  if (examsToCompare.length < 2) {
    body.innerHTML = filterBarHtml + '<div style="text-align:center;padding:40px;color:var(--text-muted);">Need at least 2 exams in this class to compare. Switch to "All classes" or add more exams for this class.</div>';
    return;
  }

  // Collect all unique student names across filtered exams
  const allStudentNames = [...new Set(examsToCompare.flatMap(e=>(e.students||[]).map(s=>s.name)))].sort();

  if (!allStudentNames.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No students found in any exam yet.</div>';
    return;
  }

  // ── Compute per-exam, per-student overall + per-subject result ──
  function computeExamResults(exam) {
    const stds = exam.students || [];
    const subs = exam.subjects || [];
    const mks  = exam.marks   || {};
    const cats = exam.categories || [];
    const gs   = exam.gradingScale || window.gradingScale;
    const catMand = {};
    cats.forEach(c => catMand[c.name] = c.mandatory);
    const getGradeForExam = (pct) => {
      const sorted = [...gs].sort((a,b)=>b.minPct-a.minPct);
      for (const g of sorted) if (pct >= g.minPct) return g.label;
      return sorted.length ? sorted[sorted.length-1].label : 'F';
    };
    const results = {};
    stds.forEach(s => {
      const groups = {};
      subs.forEach(sub => {
        const cat = sub.category || '__none__';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(sub);
      });
      let total = 0, maxTotal = 0;
      Object.entries(groups).forEach(([cat, subjs]) => {
        const catName   = cat === '__none__' ? '' : cat;
        const mandatory = catName === '' ? true : (catMand[catName] !== undefined ? catMand[catName] : true);
        if (mandatory) {
          subjs.forEach(sub => {
            const v = mks[`${s.name}||${sub.name}`];
            total += (v !== undefined && v !== '') ? parseFloat(v)||0 : 0;
            maxTotal += sub.max;
          });
        } else {
          const chosen = subjs.filter(sub => { const v = mks[`${s.name}||${sub.name}`]; return v!==undefined&&v!==''&&!isNaN(parseFloat(v)); });
          if (chosen.length) { chosen.forEach(sub => { total += parseFloat(mks[`${s.name}||${sub.name}`])||0; maxTotal += sub.max; }); }
          else if (subjs.length) maxTotal += subjs[0].max;
        }
      });
      const pct = maxTotal > 0 ? parseFloat(((total/maxTotal)*100).toFixed(1)) : null;
      // Per-subject breakdown
      const subjectScores = {};
      subs.forEach(sub => {
        const v = mks[`${s.name}||${sub.name}`];
        if (v === 'AB') {
          subjectScores[sub.name] = { mark: 'AB', max: sub.max, pct: null };
        } else if (v !== undefined && v !== '') {
          const mark = parseFloat(v) || 0;
          subjectScores[sub.name] = { mark, max: sub.max, pct: sub.max > 0 ? parseFloat(((mark/sub.max)*100).toFixed(1)) : null };
        } else {
          subjectScores[sub.name] = { mark: null, max: sub.max, pct: null };
        }
      });
      results[s.name] = { total: parseFloat(total.toFixed(1)), max: maxTotal, pct, grade: pct !== null ? getGradeForExam(pct) : '—', subjectScores };
    });
    return results;
  }

  const examResults = examsToCompare.map(e => ({ exam: e, results: computeExamResults(e) }));

  // All subject names (union across compared exams)
  const allSubjectNames = [...new Set(examsToCompare.flatMap(e => (e.subjects||[]).map(s => s.name)))];

  // ── Subject-level toggle button ──
  const allExpanded = allStudentNames.length > 0 && allStudentNames.every(n => _compareExpandedStudents.has(n));
  // Store names in a hidden span so the onclick doesn't need to embed JSON in HTML
  const subjectToggleHtml = allSubjectNames.length > 0 ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <span id="_compareAllNames" style="display:none;">${_escHtml(JSON.stringify(allStudentNames))}</span>
      <button class="btn btn-ghost btn-sm" id="compareExpandAllBtn" onclick="
        (function(){
          var all = JSON.parse(document.getElementById('_compareAllNames').textContent);
          var allExp = all.every(function(n){ return window._compareExpandedStudents.has(n); });
          if(allExp){ window._compareExpandedStudents.clear(); }
          else { all.forEach(function(n){ window._compareExpandedStudents.add(n); }); }
          window.renderCompare();
        })()" style="font-size:11.5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="${allExpanded ? 'M19 9l-7 7-7-7' : 'M9 18l6-6-6-6'}"/></svg>
        ${allExpanded ? 'Collapse all subjects' : 'Expand all subjects'}
      </button>
      <span style="font-size:11px;color:var(--text-muted);">↕ Click a student row to toggle subject breakdown</span>
    </div>` : '';

  // Build table
  let html = `<div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border);box-shadow:var(--shadow);">
  <table class="compare-table">
    <thead>
      <tr>
        <th style="min-width:160px;text-align:left;">Student</th>
        ${examsToCompare.map(e=>`<th><span style="display:inline-flex;align-items:center;gap:4px;">${e.icon||'📋'} ${_escHtml(e.name)}</span></th>`).join('')}
        <th>Trend</th>
      </tr>
    </thead>
    <tbody>`;

  allStudentNames.forEach(name => {
    const pcts = examsToCompare.map(e => {
      const r = examResults.find(er=>er.exam.id===e.id);
      return r && r.results[name] ? r.results[name].pct : null;
    });
    const nonNull = pcts.filter(p=>p!==null);
    let trendHtml = '<span class="trend-flat">—</span>';
    if (nonNull.length >= 2) {
      const first = nonNull[0], last = nonNull[nonNull.length-1];
      const diff = parseFloat((last - first).toFixed(1));
      if (diff > 0.5) trendHtml = `<span class="trend-up">▲ +${diff}%</span>`;
      else if (diff < -0.5) trendHtml = `<span class="trend-down">▼ ${diff}%</span>`;
      else trendHtml = '<span class="trend-flat">—</span>';
    }

    const isExpanded = _compareExpandedStudents.has(name);
    const canExpand  = allSubjectNames.length > 0;
    const chevron    = canExpand
      ? `<span style="display:inline-flex;align-items:center;margin-right:5px;color:var(--text-muted);opacity:0.55;transition:transform 0.15s;transform:${isExpanded?'rotate(90deg)':'rotate(0deg)'};">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M9 18l6-6-6-6"/></svg>
         </span>`
      : '';

    html += `<tr style="cursor:${canExpand?'pointer':'default'};" data-compare-student="${_escHtml(name)}" onclick="${canExpand ? 'toggleCompareStudentExpand(this.dataset.compareStudent)' : ''}">
      <td style="font-weight:600;">${chevron}${_escHtml(name)}</td>
      ${pcts.map(p => {
        if (p === null) return '<td style="color:var(--mark-absent-fg);">—</td>';
        const col = p >= 80 ? 'var(--success)' : p >= 50 ? 'var(--primary)' : 'var(--danger)';
        return `<td style="color:${col};font-weight:700;">${p}%</td>`;
      }).join('')}
      <td>${trendHtml}</td>
    </tr>`;

    // ── Per-subject drill-down rows ──
    if (isExpanded && allSubjectNames.length > 0) {
      allSubjectNames.forEach(subName => {
        const subData = examsToCompare.map(e => {
          const r = examResults.find(er=>er.exam.id===e.id);
          if (!r || !r.results[name]) return null;
          const ss = r.results[name].subjectScores;
          return (ss && ss[subName]) ? ss[subName] : null;
        });
        const hasAny = subData.some(s => s && s.mark !== null);
        if (!hasAny) return;

        const subNonNull = subData.filter(s => s && s.pct !== null).map(s => s.pct);
        let subTrend = '<span style="color:var(--text-muted);font-size:11px;">—</span>';
        if (subNonNull.length >= 2) {
          const diff = parseFloat((subNonNull[subNonNull.length-1] - subNonNull[0]).toFixed(1));
          if (diff > 0.5) subTrend = `<span class="trend-up" style="font-size:11px;">▲ +${diff}%</span>`;
          else if (diff < -0.5) subTrend = `<span class="trend-down" style="font-size:11px;">▼ ${diff}%</span>`;
          else subTrend = '<span class="trend-flat" style="font-size:11px;">—</span>';
        }

        html += `<tr style="background:var(--bg-subtle,rgba(26,86,219,0.03));cursor:default;" onclick="event.stopPropagation()">
          <td style="padding-left:30px;font-size:11.5px;color:var(--text-muted);font-style:italic;border-left:2px solid var(--primary,#1a56db);margin-left:12px;">↳ ${_escHtml(subName)}</td>
          ${subData.map(s => {
            if (!s || s.mark === null) return '<td style="color:var(--text-muted);font-size:12px;opacity:0.45;">—</td>';
            if (s.mark === 'AB') return '<td style="color:var(--mark-absent-fg);font-size:12px;font-style:italic;">AB</td>';
            const col = s.pct >= 80 ? 'var(--success)' : s.pct >= 50 ? 'var(--primary)' : 'var(--danger)';
            return `<td style="color:${col};font-size:12px;">${s.mark}<span style="opacity:0.55;">/${s.max}</span> <span style="font-size:10.5px;opacity:0.7;">${s.pct}%</span></td>`;
          }).join('')}
          <td>${subTrend}</td>
        </tr>`;
      });
    }
  });

  // Class average row
  html += `<tr style="border-top:2px solid var(--border);">
    <td style="font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Class Avg</td>
    ${examsToCompare.map(e => {
      const r = examResults.find(er=>er.exam.id===e.id);
      const vals = allStudentNames.map(n=>r&&r.results[n]?r.results[n].pct:null).filter(p=>p!==null);
      if (!vals.length) return '<td style="color:var(--mark-absent-fg);">—</td>';
      const avg = parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1));
      const col = avg >= 80 ? 'var(--success)' : avg >= 50 ? 'var(--primary)' : 'var(--danger)';
      return `<td style="color:${col};font-weight:700;">${avg}%</td>`;
    }).join('')}
    <td></td>
  </tr>`;

  html += '</tbody></table></div>';

  // Summary cards
  html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
    ${examsToCompare.map(e => {
      const r = examResults.find(er=>er.exam.id===e.id);
      const vals = allStudentNames.map(n=>r&&r.results[n]?r.results[n].pct:null).filter(p=>p!==null);
      const avg = vals.length ? parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)) : null;
      const col = e.color || EM_COLORS[0];
      const typeLabel = (e.meta && e.meta.examType) ? `<div style="font-size:10px;color:${col};opacity:0.85;margin-top:2px;">${_escHtml(e.meta.examType)}</div>` : '';
      return `<div style="background:var(--compare-card-bg);border:1.5px solid ${col}44;border-top:3px solid ${col};border-radius:12px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">${e.icon||'📋'} ${_escHtml(e.name)}</div>
        <div style="font-size:22px;font-weight:800;color:${col};line-height:1;">${avg !== null ? avg+'%' : '—'}</div>
        ${typeLabel}
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Class avg · ${vals.length} students</div>
      </div>`;
    }).join('')}
  </div>` + subjectToggleHtml + html;

  body.innerHTML = filterBarHtml + html;
}

// Expose so inline onclick can reach it
window._compareExpandedStudents = _compareExpandedStudents;
window.toggleCompareStudentExpand = toggleCompareStudentExpand;

// ── Export all terms to Excel ──
function exportAllTermsExcel() {
  if (typeof XLSX === 'undefined') { window.toast('Excel library not loaded', 'error'); return; }
  if (_exams.length === 0) { window.toast('No exams to export', 'error'); return; }

  _emSnapshotActive();

  const wb = XLSX.utils.book_new();

  _exams.forEach(exam => {
    const stds = exam.students || [];
    const subs = exam.subjects || [];
    const mks  = exam.marks   || {};
    if (!stds.length || !subs.length) return;

    const rows = [
      ['Index', 'Student', ...subs.map(s=>s.name), 'Total', 'Max', 'Avg %']
    ];
    stds.forEach(s => {
      let total=0, maxT=0;
      const markVals = subs.map(sub => {
        const v = mks[`${s.name}||${sub.name}`];
        const n = (v!==undefined&&v!=='') ? parseFloat(v)||0 : '';
        if (n!=='') { total+=n; maxT+=sub.max; }
        return n;
      });
      const pct = maxT>0 ? parseFloat(((total/maxT)*100).toFixed(1)) : '';
      rows.push([s.idx, s.name, ...markVals, parseFloat(total.toFixed(1)), maxT, pct !== '' ? pct+'%' : '']);
    });

    const sheetName = exam.name.slice(0,31).replace(/[:\\\/\?\*\[\]]/g,'');
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (wb.SheetNames.length === 0) { window.toast('No data to export across exams', 'error'); return; }

  // ── Summary sheet — uses elective-aware percentage (matches Compare modal) ──
  // Helper: compute elective-aware pct for one student in one exam
  function _examStudentPct(exam, studentName) {
    const stds = exam.students || [], subs = exam.subjects || [],
          mks  = exam.marks   || {}, cats = exam.categories || [];
    if (!stds.find(s => s.name === studentName)) return '';
    const catMand = {};
    cats.forEach(c => catMand[c.name] = c.mandatory);
    const groups = {};
    subs.forEach(sub => {
      const cat = sub.category || '__none__';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(sub);
    });
    let total = 0, maxT = 0;
    Object.entries(groups).forEach(([cat, subjs]) => {
      const catName   = cat === '__none__' ? '' : cat;
      const mandatory = catName === '' ? true : (catMand[catName] !== undefined ? catMand[catName] : true);
      if (mandatory) {
        subjs.forEach(sub => {
          const v = mks[`${studentName}||${sub.name}`];
          total += (v !== undefined && v !== '') ? parseFloat(v) || 0 : 0;
          maxT  += sub.max;
        });
      } else {
        // Elective: only the one chosen subject counts
        const chosen = subjs.filter(sub => {
          const v = mks[`${studentName}||${sub.name}`];
          return v !== undefined && v !== '' && !isNaN(parseFloat(v));
        });
        if (chosen.length) {
          chosen.forEach(sub => { total += parseFloat(mks[`${studentName}||${sub.name}`]) || 0; maxT += sub.max; });
        } else if (subjs.length) {
          maxT += subjs[0].max; // reserve max even if no mark entered
        }
      }
    });
    return maxT > 0 ? parseFloat(((total / maxT) * 100).toFixed(1)) : '';
  }

  const allNames = [...new Set(_exams.flatMap(e => (e.students || []).map(s => s.name)))].sort();
  const summaryRows = [['Student', ..._exams.map(e => e.name + ' (%)'), 'Trend']];
  allNames.forEach(name => {
    const pcts = _exams.map(exam => _examStudentPct(exam, name));
    const nonNull = pcts.filter(p => p !== '');
    const trend = nonNull.length >= 2
      ? parseFloat((nonNull[nonNull.length - 1] - nonNull[0]).toFixed(1))
      : '';
    summaryRows.push([name, ...pcts, trend !== '' ? (trend >= 0 ? '+' : '') + trend + '%' : '']);
  });
  const sumWs = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, sumWs, 'Summary');

  const cn = (_emActive()?.meta?.className) || 'Class';
  XLSX.writeFile(wb, `${cn}_AllTerms.xlsx`);
  window.toast('All terms exported to Excel!', 'success');
  closeExamManager();
}

// ── Export comparison to Excel — dedicated sheet matching the Compare modal ──
function exportCompareExcel() {
  if (_exams.length < 2) { window.toast('Need at least 2 exams to compare', 'error'); return; }
  if (typeof JSZip === 'undefined') { window.toast('JSZip not loaded', 'error'); return; }

  /* ── Score calculator ── */
  function _pct(exam, name) {
    const stds=exam.students||[],subs=exam.subjects||[],mks=exam.marks||{},cats=exam.categories||[];
    if (!stds.find(s=>s.name===name)) return null;
    const catMand={};
    cats.forEach(c=>{ catMand[c.name]=c.mandatory; });
    const groups={};
    subs.forEach(sub=>{ const k=sub.category||'__'; if(!groups[k]) groups[k]=[]; groups[k].push(sub); });
    let total=0,maxT=0;
    Object.entries(groups).forEach(([cat,subjs])=>{
      const cn2=cat==='__'?'':cat;
      const mand=cn2===''?true:(catMand[cn2]!==undefined?catMand[cn2]:true);
      if (mand) { subjs.forEach(sub=>{ const v=mks[name+'||'+sub.name]; total+=(v!==undefined&&v!=='')?parseFloat(v)||0:0; maxT+=sub.max; }); }
      else {
        const chosen=subjs.filter(sub=>{ const v=mks[name+'||'+sub.name]; return v!==undefined&&v!==''&&!isNaN(parseFloat(v)); });
        if (chosen.length) { chosen.forEach(sub=>{ total+=parseFloat(mks[name+'||'+sub.name])||0; maxT+=sub.max; }); }
        else if (subjs.length) maxT+=subjs[0].max;
      }
    });
    return maxT>0?parseFloat(((total/maxT)*100).toFixed(1)):null;
  }

  /* ── Data ── */
  const allNames=[...new Set(_exams.flatMap(e=>(e.students||[]).map(s=>s.name)))].sort();
  const cn=(_emActive()&&_emActive().meta&&_emActive().meta.className)||'Class';
  const grade=(_emActive()&&_emActive().meta&&_emActive().meta.grade)||'';
  const dateStr=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const numExams=_exams.length;

  const studentData=allNames.map(name=>{
    const pcts=_exams.map(e=>_pct(e,name));
    const numeric=pcts.filter(p=>p!==null);
    let trendVal=null,dir='';
    if (numeric.length>=2) {
      const diff=parseFloat((numeric[numeric.length-1]-numeric[0]).toFixed(1));
      trendVal=diff; dir=diff>0.5?'Improved':diff<-0.5?'Declined':'No change';
    }
    return {name,pcts,trendVal,dir,latest:numeric.length?numeric[numeric.length-1]:null};
  });

  const ranked=[...studentData].filter(s=>s.latest!==null).sort((a,b)=>b.latest-a.latest);
  const rankMap={};
  ranked.forEach((s,i)=>{ rankMap[s.name]=i+1; });

  const classAvgs=_exams.map(e=>{
    const vals=allNames.map(n=>_pct(e,n)).filter(p=>p!==null);
    return vals.length?parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)):null;
  });

  /* ══════════════════════════════════════════════
     OpenXML .xlsx builder (JSZip-based)
     Real .xlsx = ZIP of XML files
  ══════════════════════════════════════════════ */

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ── Colour palette ── */
  const C={
    navyBg:'FF0F172A', navyFg:'FFFFFFFF',
    blueBg:'FF1A56DB', blueSub:'FFDBEAFE', blueFg:'FF1040B0',
    darkBg:'FF1E3A5F', subtleFg:'FFBFDBFE',
    white:'FFFFFFFF',  alt:'FFF1F5F9',
    greenBg:'FFD1FAE5',greenBgA:'FFA7F3D0',greenFg:'FF065F46',
    redBg:'FFFEE2E2',  redBgA:'FFFECACA', redFg:'FF991B1B',
    amberBg:'FFFEF9C3',amberBgA:'FFFDE68A',amberFg:'FF78350F',
    goldBg:'FFFEF3C7', goldFg:'FF92400E',
    slateBg:'FF334155',slateHdr:'FF475569',slateFg:'FFFFFFFF',
    mutedFg:'FF94A3B8', bodyFg:'FF334155',
    legLbl:'FF1E293B',
  };

  /* ── Style index registry ── */
  const _styles=[];
  function defStyle(obj){ _styles.push(obj); return _styles.length-1; }

  /* font helper */
  function F(sz,bold,color,italic){
    return {sz,bold:!!bold,color,italic:!!italic};
  }
  /* fill helper */
  function BG(fgColor){
    return {type:'solid',fgColor};
  }
  /* border helper */
  function BD(color){
    return {left:{style:'thin',color},right:{style:'thin',color},top:{style:'thin',color},bottom:{style:'thin',color}};
  }
  function BDheavy(color){
    return {left:{style:'thin',color},right:{style:'thin',color},top:{style:'medium',color},bottom:{style:'medium',color}};
  }
  const THINBD=BD('FFCBD5E1');
  const NONEBD={};

  /* ── IMPORTANT: index 0 must be a "normal" default style.
     Excel treats cellXfs[0] as the base/default and may ignore its fill.
     We reserve it as a plain style so all real styles start at index 1.
     NOTE: Must be registered AFTER F(), BG(), and NONEBD are defined. ── */
  defStyle({font:F(10,0,'FF000000'),fill:BG(C.white),border:NONEBD});

  /* Define all styles — returns style index */
  const SI={};
  SI.title    = defStyle({font:F(14,1,'FFFFFFFF'),fill:BG(C.navyBg),align:{h:'center',v:'center'},border:BD('FF0F172A')});
  SI.subtitle = defStyle({font:F(10,0,C.subtleFg,1),fill:BG(C.darkBg),align:{h:'center',v:'center'},border:BD('FF1E3A5F')});
  SI.spacer   = defStyle({fill:BG(C.alt),border:NONEBD});
  SI.colHdr   = defStyle({font:F(11,1,'FFFFFFFF'),fill:BG(C.blueBg),align:{h:'center',v:'center',wrap:1},border:BD('FF3B82F6')});
  SI.subHdr   = defStyle({font:F(9,0,C.blueFg,1),fill:BG(C.blueSub),align:{h:'center',v:'center'},border:THINBD});
  /* name */
  SI.nm       = defStyle({font:F(10,1,'FF0F172A'),fill:BG(C.white),align:{h:'left',v:'center',wrap:1},border:THINBD});
  SI.nmA      = defStyle({font:F(10,1,'FF0F172A'),fill:BG(C.alt),align:{h:'left',v:'center',wrap:1},border:THINBD});
  SI.nmTop    = defStyle({font:F(10,1,C.goldFg),fill:BG(C.goldBg),align:{h:'left',v:'center',wrap:1},border:THINBD});
  /* score normal */
  SI.sc       = defStyle({font:F(10,0,C.bodyFg),fill:BG(C.white),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  SI.scA      = defStyle({font:F(10,0,C.bodyFg),fill:BG(C.alt),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  /* score green */
  SI.scG      = defStyle({font:F(10,1,C.greenFg),fill:BG(C.greenBg),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  SI.scGA     = defStyle({font:F(10,1,C.greenFg),fill:BG(C.greenBgA),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  /* score red */
  SI.scR      = defStyle({font:F(10,1,C.redFg),fill:BG(C.redBg),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  SI.scRA     = defStyle({font:F(10,1,C.redFg),fill:BG(C.redBgA),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  /* score gold (top3) */
  SI.scTop    = defStyle({font:F(10,1,C.goldFg),fill:BG(C.goldBg),align:{h:'center',v:'center'},numFmt:'0.0',border:THINBD});
  /* absent */
  SI.abs      = defStyle({font:F(10,0,C.mutedFg,1),fill:BG(C.white),align:{h:'center',v:'center'},border:THINBD});
  SI.absA     = defStyle({font:F(10,0,C.mutedFg,1),fill:BG(C.alt),align:{h:'center',v:'center'},border:THINBD});
  /* trend up */
  SI.tU       = defStyle({font:F(10,1,C.greenFg),fill:BG(C.white),align:{h:'center',v:'center'},border:THINBD});
  SI.tUA      = defStyle({font:F(10,1,C.greenFg),fill:BG(C.alt),align:{h:'center',v:'center'},border:THINBD});
  /* trend down */
  SI.tD       = defStyle({font:F(10,1,C.redFg),fill:BG(C.white),align:{h:'center',v:'center'},border:THINBD});
  SI.tDA      = defStyle({font:F(10,1,C.redFg),fill:BG(C.alt),align:{h:'center',v:'center'},border:THINBD});
  /* trend neutral */
  SI.tN       = defStyle({font:F(10,0,C.amberFg),fill:BG(C.white),align:{h:'center',v:'center'},border:THINBD});
  SI.tNA      = defStyle({font:F(10,0,C.amberFg),fill:BG(C.alt),align:{h:'center',v:'center'},border:THINBD});
  /* direction improved */
  SI.dI       = defStyle({font:F(10,1,C.greenFg),fill:BG(C.greenBg),align:{h:'center',v:'center'},border:THINBD});
  SI.dIA      = defStyle({font:F(10,1,C.greenFg),fill:BG(C.greenBgA),align:{h:'center',v:'center'},border:THINBD});
  /* direction declined */
  SI.dD       = defStyle({font:F(10,1,C.redFg),fill:BG(C.redBg),align:{h:'center',v:'center'},border:THINBD});
  SI.dDA      = defStyle({font:F(10,1,C.redFg),fill:BG(C.redBgA),align:{h:'center',v:'center'},border:THINBD});
  /* direction no change */
  SI.dN       = defStyle({font:F(10,0,C.amberFg),fill:BG(C.amberBg),align:{h:'center',v:'center'},border:THINBD});
  SI.dNA      = defStyle({font:F(10,0,C.amberFg),fill:BG(C.amberBgA),align:{h:'center',v:'center'},border:THINBD});
  /* rank */
  SI.rk       = defStyle({font:F(10,0,'FF475569'),fill:BG(C.white),align:{h:'center',v:'center'},border:THINBD});
  SI.rkA      = defStyle({font:F(10,0,'FF475569'),fill:BG(C.alt),align:{h:'center',v:'center'},border:THINBD});
  SI.rkTop    = defStyle({font:F(10,1,C.goldFg),fill:BG(C.goldBg),align:{h:'center',v:'center'},border:THINBD});
  /* average */
  SI.avgL     = defStyle({font:F(10,1,C.slateFg),fill:BG(C.slateBg),align:{h:'left',v:'center'},border:BDheavy('FF334155')});
  SI.avgC     = defStyle({font:F(10,1,C.slateFg),fill:BG(C.slateHdr),align:{h:'center',v:'center'},numFmt:'0.0',border:BDheavy('FF334155')});
  SI.avgCblnk = defStyle({fill:BG(C.slateHdr),border:BDheavy('FF334155')});
  /* legend */
  SI.legLbl   = defStyle({font:F(9,1,'FFFFFFFF'),fill:BG(C.legLbl),align:{h:'center',v:'center'},border:THINBD});
  SI.legI     = defStyle({font:F(9,1,C.greenFg),fill:BG(C.greenBg),align:{h:'center',v:'center'},border:THINBD});
  SI.legD     = defStyle({font:F(9,1,C.redFg),fill:BG(C.redBg),align:{h:'center',v:'center'},border:THINBD});
  SI.legN     = defStyle({font:F(9,1,C.amberFg),fill:BG(C.amberBg),align:{h:'center',v:'center'},border:THINBD});
  SI.legG     = defStyle({font:F(9,1,C.greenFg),fill:BG(C.greenBgA),align:{h:'center',v:'center'},border:THINBD});
  SI.legR     = defStyle({font:F(9,1,C.redFg),fill:BG(C.redBgA),align:{h:'center',v:'center'},border:THINBD});

  /* ── OpenXML: styles.xml ── */
  function buildStylesXml(styles){
    /* collect unique fonts, fills, borders, numFmts */
    const fonts=[], fills=[], borders=[], numFmts=[], xfs=[];
    /* required defaults */
    fills.push('<fill><patternFill patternType="none"/></fill>');
    fills.push('<fill><patternFill patternType="gray125"/></fill>');
    fonts.push('<font><sz val="11"/><name val="Calibri"/></font>');
    borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');

    function addFont(f){
      const xml='<font>'+(f.bold?'<b/>':'')+(f.italic?'<i/>':'')+'<sz val="'+(f.sz||10)+'"/><color rgb="'+(f.color||'FF000000')+'"/><name val="Calibri"/></font>';
      let idx=fonts.indexOf(xml); if(idx<0){idx=fonts.length;fonts.push(xml);} return idx;
    }
    function addFill(fl){
      let xml='<fill><patternFill patternType="solid"><fgColor rgb="'+(fl.fgColor||'FFFFFFFF')+'"/><bgColor indexed="64"/></patternFill></fill>';
      let idx=fills.indexOf(xml); if(idx<0){idx=fills.length;fills.push(xml);} return idx;
    }
    function addBorder(b){
      function side(pos,obj){
        if(!obj||!obj.style) return '<'+pos+'/>';
        return '<'+pos+' style="'+obj.style+'"><color rgb="'+(obj.color||'FF000000')+'"/></'+pos+'>';
      }
      const xml='<border>'+side('left',b.left)+side('right',b.right)+side('top',b.top)+side('bottom',b.bottom)+'<diagonal/></border>';
      let idx=borders.indexOf(xml); if(idx<0){idx=borders.length;borders.push(xml);} return idx;
    }
    const NF_MAP={'0.0':1};
    const customNfs=[];
    function addNumFmt(fmt){
      if(!fmt) return 0;
      if(fmt==='0.0') return 2; /* built-in id=2 */
      if(NF_MAP[fmt]!==undefined) return NF_MAP[fmt];
      const id=164+customNfs.length;
      customNfs.push('<numFmt numFmtId="'+id+'" formatCode="'+esc(fmt)+'"/>');
      NF_MAP[fmt]=id; return id;
    }

    styles.forEach(function(s){
      const fontIdx = s.font ? addFont(s.font) : 0;
      const fillIdx = s.fill ? addFill(s.fill) : 0;
      const bdIdx   = s.border ? addBorder(s.border) : 0;
      const nfId    = addNumFmt(s.numFmt||'');
      let xf='<xf numFmtId="'+nfId+'" fontId="'+fontIdx+'" fillId="'+fillIdx+'" borderId="'+bdIdx+'" xfId="0"';
      if(s.font)  xf+=' applyFont="1"';
      if(s.fill)  xf+=' applyFill="1"';
      if(s.border && s.border.left) xf+=' applyBorder="1"';
      if(s.align) xf+=' applyAlignment="1"';
      xf+='>';
      if(s.align){
        xf+='<alignment horizontal="'+(s.align.h||'general')+'" vertical="'+(s.align.v||'center')+'"';
        if(s.align.wrap) xf+=' wrapText="1"';
        xf+='/>';
      }
      xf+='</xf>';
      xfs.push(xf);
    });

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      +(customNfs.length?'<numFmts count="'+customNfs.length+'">'+customNfs.join('')+'</numFmts>':'')
      +'<fonts count="'+fonts.length+'">'+fonts.join('')+'</fonts>'
      +'<fills count="'+fills.length+'">'+fills.join('')+'</fills>'
      +'<borders count="'+borders.length+'">'+borders.join('')+'</borders>'
      +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      +'<cellXfs count="'+xfs.length+'">'+xfs.join('')+'</cellXfs>'
      +'</styleSheet>';
  }

  /* ── OpenXML: shared strings ── */
  const _sst=[], _sstMap={};
  function ss(str){
    const k=String(str);
    if(_sstMap[k]===undefined){ _sstMap[k]=_sst.length; _sst.push(k); }
    return _sstMap[k];
  }
  function buildSstXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'+_sst.length+'" uniqueCount="'+_sst.length+'">'
      +_sst.map(function(s){ return '<si><t xml:space="preserve">'+esc(s)+'</t></si>'; }).join('')
      +'</sst>';
  }

  /* ── Cell helpers ── */
  const _COL_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function colLetter(c){ /* 0-based col index to A,B,...Z,AA... */
    let s='';
    c++;
    while(c>0){ c--; s=_COL_LETTERS[c%26]+s; c=Math.floor(c/26); }
    return s;
  }

  function cellAddr(r,c){ return colLetter(c)+(r+1); }

  /* string cell */
  function cs(r,c,styleIdx,text){
    return '<c r="'+cellAddr(r,c)+'" s="'+styleIdx+'" t="s"><v>'+ss(String(text))+'</v></c>';
  }
  /* number cell */
  function cn2(r,c,styleIdx,num){
    return '<c r="'+cellAddr(r,c)+'" s="'+styleIdx+'" t="n"><v>'+num+'</v></c>';
  }
  /* blank cell */
  function cb(r,c,styleIdx){
    return '<c r="'+cellAddr(r,c)+'" s="'+styleIdx+'"/>';
  }

  /* ── Auto-scale column widths (computed before row building) ── */
  const CHAR_WIDTH = 1.2; /* Excel col-width unit per char at 10pt Calibri */
  const allNameLengths = allNames.map(n=>n.length);
  allNameLengths.push('CLASS AVERAGE'.length, 'Student Name'.length);
  const maxNameLen = Math.max(...allNameLengths);
  /* min 18, max 40 Excel width units */
  const nameColW = Math.min(40, Math.max(18, Math.ceil(maxNameLen * CHAR_WIDTH) + 4));
  const maxExamLen = Math.max(..._exams.map(e=>(e.name||'Term').length), 'Score (%)'.length);
  const examColW = Math.min(22, Math.max(13, Math.ceil(maxExamLen * CHAR_WIDTH) + 3));

  /* ── Build sheet data ── */
  const totalCols=1+numExams+3;
  const merges=[];
  const rows=[];
  const rowHeights={};
  let R=0;

  function addMerge(r,c1,c2){ merges.push({r,c1,c2}); }
  function mXml(m){ return '<mergeCell ref="'+cellAddr(m.r,m.c1)+':'+cellAddr(m.r,m.c2)+'"/>'; }

  /* Row 0: Title */
  {
    let r='';
    r+=cs(R,0,SI.title,cn+(grade?' - Grade '+grade:'')+' | Term Comparison Report | '+dateStr);
    for(let c=1;c<totalCols;c++) r+=cb(R,c,SI.title);
    rows.push({h:36,xml:r}); addMerge(R,0,totalCols-1); R++;
  }
  /* Row 1: Subtitle */
  {
    let r='';
    r+=cs(R,0,SI.subtitle,allNames.length+' Students  |  '+numExams+' Terms Compared  |  Generated by GradeFlow');
    for(let c=1;c<totalCols;c++) r+=cb(R,c,SI.subtitle);
    rows.push({h:20,xml:r}); addMerge(R,0,totalCols-1); R++;
  }
  /* Row 2: Spacer */
  {
    let r='';
    for(let c=0;c<totalCols;c++) r+=cb(R,c,SI.spacer);
    rows.push({h:8,xml:r}); R++;
  }
  /* Row 3: Column headers */
  {
    let r=cs(R,0,SI.colHdr,'Student Name');
    _exams.forEach(function(e,i){ r+=cs(R,i+1,SI.colHdr,e.name); });
    r+=cs(R,numExams+1,SI.colHdr,'Trend');
    r+=cs(R,numExams+2,SI.colHdr,'Direction');
    r+=cs(R,numExams+3,SI.colHdr,'Rank');
    rows.push({h:30,xml:r}); R++;
  }
  /* Row 4: Sub-headers */
  {
    let r=cb(R,0,SI.subHdr);
    _exams.forEach(function(_,i){ r+=cs(R,i+1,SI.subHdr,'Score (%)'); });
    r+=cs(R,numExams+1,SI.subHdr,'1st to Last');
    r+=cs(R,numExams+2,SI.subHdr,'Performance');
    r+=cs(R,numExams+3,SI.subHdr,'by Score');
    rows.push({h:18,xml:r}); R++;
  }

  /* Student rows */
  studentData.forEach(function(sd,idx){
    const alt=idx%2===1;
    const rank=rankMap[sd.name]||0;
    const top3=rank>=1&&rank<=3;

    let r=cb(R,0,top3?SI.nmTop:alt?SI.nmA:SI.nm);
    /* name must be string cell */
    r=cs(R,0,top3?SI.nmTop:alt?SI.nmA:SI.nm,sd.name);

    sd.pcts.forEach(function(p,i){
      if(p===null){
        r+=cs(R,i+1,alt?SI.absA:SI.abs,'Absent');
      } else if(top3){
        r+=cn2(R,i+1,SI.scTop,p);
      } else if(p>=75){
        r+=cn2(R,i+1,alt?SI.scGA:SI.scG,p);
      } else if(p<50){
        r+=cn2(R,i+1,alt?SI.scRA:SI.scR,p);
      } else {
        r+=cn2(R,i+1,alt?SI.scA:SI.sc,p);
      }
    });

    /* Trend */
    if(sd.trendVal!==null){
      const sign=sd.trendVal>=0?'+':'';
      const tStr=sign+sd.trendVal.toFixed(1)+'%';
      let tSI;
      if(sd.trendVal>0.5) tSI=alt?SI.tUA:SI.tU;
      else if(sd.trendVal<-0.5) tSI=alt?SI.tDA:SI.tD;
      else tSI=alt?SI.tNA:SI.tN;
      r+=cs(R,numExams+1,tSI,tStr);
    } else {
      r+=cs(R,numExams+1,alt?SI.absA:SI.abs,'-');
    }

    /* Direction */
    let dSI,dLabel;
    if(sd.dir==='Improved'){dSI=alt?SI.dIA:SI.dI;dLabel='Improved';}
    else if(sd.dir==='Declined'){dSI=alt?SI.dDA:SI.dD;dLabel='Declined';}
    else if(sd.dir==='No change'){dSI=alt?SI.dNA:SI.dN;dLabel='No change';}
    else{dSI=alt?SI.absA:SI.abs;dLabel='-';}
    r+=cs(R,numExams+2,dSI,dLabel);

    /* Rank */
    const rkLabel=rank?(rank===1?'1st':rank===2?'2nd':rank===3?'3rd':'#'+rank):'-';
    r+=cs(R,numExams+3,top3?SI.rkTop:alt?SI.rkA:SI.rk,rkLabel);

    /* Auto row-height: if name is longer than fits in nameColW, add extra height for wrapping */
    const charsPerLine = Math.max(1, Math.floor((nameColW - 2) / CHAR_WIDTH));
    const nameLines = Math.max(1, Math.ceil(sd.name.length / charsPerLine));
    const rowH = nameLines > 1 ? Math.min(42, 14 + nameLines * 14) : 21;
    rows.push({h:rowH,xml:r}); R++;
  });

  /* Class average */
  {
    let r=cs(R,0,SI.avgL,'CLASS AVERAGE');
    classAvgs.forEach(function(avg,i){
      r+=avg!==null?cn2(R,i+1,SI.avgC,avg):cs(R,i+1,SI.avgC,'-');
    });
    r+=cb(R,numExams+1,SI.avgCblnk);
    r+=cb(R,numExams+2,SI.avgCblnk);
    r+=cb(R,numExams+3,SI.avgCblnk);
    rows.push({h:26,xml:r}); R++;
  }

  /* Spacer */
  {
    let r='';
    for(let c=0;c<totalCols;c++) r+=cb(R,c,SI.spacer);
    rows.push({h:8,xml:r}); R++;
  }

  /* Legend — header row + one full-width row per item.
     Each item spans the entire table width so text is never truncated
     regardless of how many exam columns exist. */
  {
    /* Header row */
    let rA=cs(R,0,SI.legLbl,'COLOUR LEGEND');
    for(let c=1;c<totalCols;c++) rA+=cb(R,c,SI.legLbl);
    rows.push({h:20,xml:rA}); addMerge(R,0,totalCols-1); R++;

    /* One full-width row per legend item */
    const legItems=[
      {si:SI.legI, txt:'  \u2714  Improved \u2014 score went up'},
      {si:SI.legD, txt:'  \u2718  Declined \u2014 score went down'},
      {si:SI.legN, txt:'  \u25cf  No change \u2014 score stable'},
      {si:SI.legG, txt:'  \u2605  Score 75%+ = Strong performance'},
      {si:SI.legR, txt:'  \u25b2  Score below 50% = Needs support'},
    ];
    legItems.forEach(function(li){
      let rRow=cs(R,0,li.si,li.txt);
      for(let c=1;c<totalCols;c++) rRow+=cb(R,c,li.si);
      rows.push({h:22,xml:rRow}); addMerge(R,0,totalCols-1); R++;
    });
  }

  /* ── sheet.xml ── */
  const sheetDim='A1:'+cellAddr(R-1,totalCols-1);
  let sheetXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    +' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheetViews><sheetView workbookViewId="0">'
    +'<pane xSplit="1" ySplit="5" topLeftCell="B6" activePane="bottomRight" state="frozen"/>'
    +'</sheetView></sheetViews>'
    +'<sheetFormatPr defaultRowHeight="15"/>'
    +'<cols>';

  /* ── Apply auto-scaled column widths ── */
  sheetXml += '<col min="1" max="1" width="'+nameColW+'" customWidth="1"/>';
  for(let i=0;i<numExams;i++) sheetXml+='<col min="'+(i+2)+'" max="'+(i+2)+'" width="'+examColW+'" customWidth="1"/>';
  sheetXml+='<col min="'+(numExams+2)+'" max="'+(numExams+2)+'" width="13" customWidth="1"/>';
  sheetXml+='<col min="'+(numExams+3)+'" max="'+(numExams+3)+'" width="15" customWidth="1"/>';
  sheetXml+='<col min="'+(numExams+4)+'" max="'+(numExams+4)+'" width="9" customWidth="1"/>';
  sheetXml+='</cols>'
    +'<sheetData>';
  rows.forEach(function(row,ri){
    sheetXml+='<row r="'+(ri+1)+'" ht="'+row.h+'" customHeight="1">'+row.xml+'</row>';
  });
  sheetXml+='</sheetData>';
  if(merges.length){
    sheetXml+='<mergeCells count="'+merges.length+'">'+merges.map(mXml).join('')+'</mergeCells>';
  }
  sheetXml+='<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    +'</worksheet>';

  /* ── workbook.xml ── */
  const wbXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    +' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets><sheet name="Term Comparison" sheetId="1" r:id="rId1"/></sheets>'
    +'</workbook>';

  /* ── [Content_Types].xml ── */
  const ctXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    +'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    +'</Types>';

  /* ── _rels/.rels ── */
  const relsXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    +'</Relationships>';

  /* ── xl/_rels/workbook.xml.rels ── */
  const wbRelsXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
    +'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    +'</Relationships>';

  /* ── Assemble ZIP with JSZip ── */
  const zip=new JSZip();
  zip.file('[Content_Types].xml', ctXml);
  zip.folder('_rels').file('.rels', relsXml);
  const xl=zip.folder('xl');
  xl.file('workbook.xml', wbXml);
  xl.file('styles.xml', buildStylesXml(_styles));
  xl.file('sharedStrings.xml', buildSstXml());
  xl.folder('_rels').file('workbook.xml.rels', wbRelsXml);
  xl.folder('worksheets').file('sheet1.xml', sheetXml);

  zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression:'DEFLATE'})
    .then(function(blob){
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=cn.replace(/[^\w\s-]/g,'')+'_Term_Comparison.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.toast('Term comparison exported!','success');
    })
    .catch(function(err){ window.toast('Export failed: '+err.message,'error'); });
}

// ── Patch clearAll to reset exam marks only ──
function _emPatchClearAll() {
  const _origClear = window.clearAll;
  window.clearAll = function() {
    _origClear.apply(this, arguments);
    // Clear current exam data too
    _emSnapshotActive();
    _emSave();
  };
}

// ── Bootstrap (called after initAutoSave) ──
function initExamManagerBoostrap() {
  initExamManager();
  _emPatchSaveToStorage();
  _emPatchClearAll();
}

// ════════════════════════════════════════════
//  END EXAM MANAGER ENGINE
// ════════════════════════════════════════════
// Exposed on window so results.js (loaded before exam-manager) can read it at runtime
window.showSubjectGradesInline = false;
let showSubjectGradesInline = window.showSubjectGradesInline;

function toggleSubjectGradesInline() {
  window.showSubjectGradesInline = !window.showSubjectGradesInline;
  showSubjectGradesInline = window.showSubjectGradesInline;
  updateToggleSubjGradesBtn();
  if (results.length) window.renderResultsTable();
}

function updateToggleSubjGradesBtn() {
  const btn = document.getElementById('toggleSubjGradesBtn');
  const label = document.getElementById('toggleSubjGradesBtnLabel');
  if (!btn) return;
  if (showSubjectGradesInline) {
    btn.classList.add('btn-show-grades--on');
    label.textContent = 'Hide Grades';
  } else {
    btn.classList.remove('btn-show-grades--on');
    label.textContent = 'Show Grades';
  }
}

// ── Init ──
// Deferred to DOMContentLoaded so all window.* functions registered by other
// modules (students.js, subjects.js, etc.) are available when this runs.
// In the Vite production build, exam-manager is extracted into its own chunk
// and that chunk is imported *before* the rest of main.js executes, so a
// synchronous IIFE here would fire before renderStudentTags / renderSubjectTags
// are placed on window — causing "window.renderStudentTags is not a function".
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function _emInit() {
    window.renderStudentTags();
    window.renderSubjectTags();
    window.renderCategoryButtons();
    window.renderSubjectCategoryPicker();
    window.updateCategoryDatalist();

    // ── Auto-save engine ──
    window.initAutoSave();
    // ── Exam Manager engine ──
    initExamManagerBoostrap();
  });
} else {
  // DOM already ready (e.g. script injected dynamically or dev-server HMR)
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();

  window.initAutoSave();
  initExamManagerBoostrap();
}

// ════════════════════════════════════════════
//  CSV / EXCEL IMPORT ENGINE
// ════════════════════════════════════════════


// ── Window exports ──
Object.assign(window, {
  _emApplyBatch,
  _emClearBatchSelect,
  _emNewFromActive,
  _emPickColor,
  _emPickIcon,
  _emPreFillFromSource,
  _emToggleSelect,
  addNewExam,
  archiveExam,
  cancelDeleteExam,
  cancelEditExam,
  closeCompareModal,
  closeExamManager,
  commitEditExam,
  createNewExam,
  deleteExam,
  duplicateExam,
  exportAllTermsExcel,
  exportCompareExcel,
  filterCompare,
  filterExamList,
  initExamManager,
  initExamManagerBoostrap,
  openCompareModal,
  openExamManager,
  renderCompare,
  renderExamManager,
  requestDeleteExam,
  setExamType,
  startEditExam,
  switchToExam,
  toggleArchivedSection,
  toggleCompareStudentExpand,
  toggleSubjectGradesInline,
  unarchiveExam,
  updateToggleSubjGradesBtn
});

// ── Expose internal helpers needed by autosave.js ──
window._emActive              = _emActive;
window._emId                  = _emId;
window._emApplyExam           = _emApplyExam;
window._emSave                = _emSave;
window._emRefreshUI           = _emRefreshUI;
window._emAutoRenameFromLabel = _emAutoRenameFromLabel;
window._emUpdateSidebarRing   = _emUpdateSidebarRing;
window._emFillPct             = _emFillPct;

// ════════════════════════════════════════════
//  DESKTOP SHORTCUT — Ctrl/Cmd+E toggles Exam Manager
// ════════════════════════════════════════════
// "E" for Exam — mirrors the Ctrl+Z (undo) / Shift+? (help) shortcuts
// already used elsewhere in the app. Ignored while the user is typing
// in any text field, and won't stack on top of another open modal.
document.addEventListener('keydown', function (e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (e.key !== 'e' && e.key !== 'E') return;

  // Don't hijack while typing in any input/textarea/contenteditable
  var a = document.activeElement;
  var isTyping = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  if (isTyping) return;

  var examOverlay = document.getElementById('examModalOverlay');
  if (!examOverlay) return;

  // If a different modal/panel is already open, leave it alone
  var otherOpen = document.querySelector('[id$="Overlay"].open');
  if (otherOpen && otherOpen !== examOverlay) return;

  e.preventDefault();
  if (examOverlay.classList.contains('open')) closeExamManager();
  else openExamManager();
});

// Escape closes the Exam Manager too (it had no key-based close before —
// only clicking the overlay backdrop). Keeps Ctrl+E fully toggle-able.
// Inline rename/edit fields inside the modal handle their own Escape
// (cancelEditExam), so we skip closing the whole modal in that case.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var examOverlay = document.getElementById('examModalOverlay');
  if (!examOverlay || !examOverlay.classList.contains('open')) return;
  var a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && examOverlay.contains(a)) return;
  closeExamManager();
});
