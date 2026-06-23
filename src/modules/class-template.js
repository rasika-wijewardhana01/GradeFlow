// ═══════════════════════════════════════════════════════════════
//  src/modules/class-template.js
//  Class template modal: export class template (no marks),
//  import JSON template, validate and apply.
// ═══════════════════════════════════════════════════════════════
// ── State for the template modal ──
let _ctplParsed = null;      // parsed JSON from loaded file
let _ctplOption = 'fresh';   // 'fresh' | 'marks'

function openTemplateModal() {
  _ctplParsed = null;
  _ctplOption = 'fresh';
  ctplClearFile();
  ctplRefreshExportPanel();
  document.getElementById('ctplOverlay').classList.add('open');
}

function closeTemplateModal() {
  document.getElementById('ctplOverlay').classList.remove('open');
}

// ── Refresh the export panel chips based on current app state ──
function ctplRefreshExportPanel() {
  const chips   = document.getElementById('ctplExportChips');
  const summary = document.getElementById('ctplExportSummary');
  if (!chips || !summary) return;
  const sc = students.length, sj = subjects.length;
  chips.innerHTML = [
    `<span class="ctpl-chip">${sc} student${sc !== 1 ? 's' : ''}</span>`,
    `<span class="ctpl-chip green">${sj} subject${sj !== 1 ? 's' : ''}</span>`,
    sc && sj ? '<span class="ctpl-chip amber">No marks included</span>' : ''
  ].join('');
  summary.textContent = sc + sj === 0
    ? '(nothing to export yet)'
    : `${sc} students · ${sj} subjects`;
}

// ── Export class template (no marks) ──
function exportClassTemplate() {
  if (!students.length && !subjects.length) {
    window.toast('Add some students or subjects first', 'error'); return;
  }
  const meta = {
    className:    (document.getElementById('className')    || {}).value || '',
    academicYear: (document.getElementById('academicYear') || {}).value || '',
    teacherName:  (document.getElementById('teacherName')  || {}).value || '',
    schoolName:   (document.getElementById('schoolName')   || {}).value || '',
  };
  const template = {
    _type: 'rsm_class_template',
    _version: 1,
    exportedAt: new Date().toISOString(),
    meta,
    students:         JSON.parse(JSON.stringify(students)),
    subjects:         JSON.parse(JSON.stringify(subjects)),
    categories:       JSON.parse(JSON.stringify(categories)),
    gradingScale:     JSON.parse(JSON.stringify(window.gradingScale)),
    subjectPassMarks: JSON.parse(JSON.stringify(window.subjectPassMarks)),
    // marks intentionally omitted — template only
  };
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safeName = (meta.className || 'class').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  a.download = `rsm_template_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  window.toast('✓ Class template exported!', 'success');
  closeTemplateModal();
}

// ── File drop / select ──
function ctplHandleDrop(e) {
  const file = e.dataTransfer.files[0];
  if (file) ctplProcessFile(file);
}
function ctplHandleFile(e) {
  const file = e.target.files[0];
  if (file) ctplProcessFile(file);
}

function ctplProcessFile(file) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    ctplShowValidation([{ type: 'err', msg: 'Only .json files are supported' }]);
    return;
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    let parsed;
    try { parsed = JSON.parse(ev.target.result); }
    catch(e) {
      ctplShowValidation([{ type: 'err', msg: 'Invalid JSON — file may be corrupted' }]);
      return;
    }
    const errs = ctplValidate(parsed);
    const hasError = errs.some(x => x.type === 'err');
    _ctplParsed = hasError ? null : parsed;

    // Show file name banner, hide drop zone
    const banner = document.getElementById('ctplFileBanner');
    banner.classList.add('show');
    document.getElementById('ctplFileNameLabel').textContent = file.name;
    document.getElementById('ctplDropzone').style.display = 'none';

    ctplShowValidation(errs);

    const hasMarks = !!(parsed.marks && Object.keys(parsed.marks).length > 0);
    const optMarks = document.getElementById('ctplOptMarks');
    if (optMarks) optMarks.style.display = hasMarks ? 'flex' : 'none';
    if (!hasMarks) ctplSelectOption('fresh');

    document.getElementById('ctplImportOptions').style.display = _ctplParsed ? 'block' : 'none';
    document.getElementById('ctplApplyBtn').disabled = !_ctplParsed;
  };
  reader.readAsText(file);
}

function ctplClearFile() {
  _ctplParsed = null;
  const banner = document.getElementById('ctplFileBanner');
  if (banner) banner.classList.remove('show');
  const dz = document.getElementById('ctplDropzone');
  if (dz) dz.style.display = '';
  const val = document.getElementById('ctplValidation');
  if (val) { val.innerHTML = ''; val.classList.remove('show'); }
  const opts = document.getElementById('ctplImportOptions');
  if (opts) opts.style.display = 'none';
  const applyBtn = document.getElementById('ctplApplyBtn');
  if (applyBtn) applyBtn.disabled = true;
  const fi = document.getElementById('ctplFileInput');
  if (fi) fi.value = '';
}

// ── Validate parsed JSON ──
function ctplValidate(data) {
  const items = [];
  if (!data || data._type !== 'rsm_class_template') {
    items.push({ type: 'err', msg: 'File does not appear to be a GradeFlow class template' });
    return items;
  }
  const sc = Array.isArray(data.students) ? data.students.length : 0;
  const sj = Array.isArray(data.subjects) ? data.subjects.length : 0;
  if (sc === 0) items.push({ type: 'warn', msg: 'No students found in template' });
  else          items.push({ type: 'ok',   msg: `${sc} student${sc !== 1 ? 's' : ''} found` });
  if (sj === 0) items.push({ type: 'warn', msg: 'No subjects found in template' });
  else          items.push({ type: 'ok',   msg: `${sj} subject${sj !== 1 ? 's' : ''} found` });
  if (data.meta && data.meta.className)
    items.push({ type: 'ok', msg: `Class: ${data.meta.className}` });
  const markCount = data.marks ? Object.keys(data.marks).length : 0;
  if (markCount > 0)
    items.push({ type: 'ok', msg: `Marks data present (${markCount} entries)` });
  if (data._version && data._version > 1)
    items.push({ type: 'warn', msg: `Template version ${data._version} — some fields may not be supported` });
  return items;
}

function ctplShowValidation(items) {
  const el = document.getElementById('ctplValidation');
  if (!el) return;
  if (!items.length) { el.classList.remove('show'); el.innerHTML = ''; return; }
  el.classList.add('show');
  const icons = { ok: '✓', warn: '⚠', err: '✕' };
  el.innerHTML = '<div class="ctpl-validation">'
    + items.map(i => `<div class="ctpl-val-item ${i.type}">${icons[i.type] || '•'} ${i.msg}</div>`).join('')
    + '</div>';
}

// ── Option selection ──
function ctplSelectOption(opt) {
  _ctplOption = opt;
  document.getElementById('ctplOptFresh').classList.toggle('selected', opt === 'fresh');
  document.getElementById('ctplOptMarks').classList.toggle('selected', opt === 'marks');
}

// ── Apply the import ──
function ctplApplyImport() {
  if (!_ctplParsed) return;
  const d = _ctplParsed;
  if (Array.isArray(d.students))             students         = JSON.parse(JSON.stringify(d.students));
  if (Array.isArray(d.subjects))             subjects         = JSON.parse(JSON.stringify(d.subjects));
  if (Array.isArray(d.categories))           categories       = JSON.parse(JSON.stringify(d.categories));
  if (Array.isArray(d.gradingScale) && d.gradingScale.length)
                                             window.gradingScale = JSON.parse(JSON.stringify(d.gradingScale));
  if (d.subjectPassMarks)                    window.subjectPassMarks = JSON.parse(JSON.stringify(d.subjectPassMarks));

  // Apply marks only if user chose to and file has them
  if (_ctplOption === 'marks' && d.marks) {
    marks = JSON.parse(JSON.stringify(d.marks));
  } else {
    marks = {};
  }

  // Restore meta fields
  if (d.meta) {
    ['className', 'academicYear', 'teacherName', 'schoolName'].forEach(id => {
      const el = document.getElementById(id);
      if (el && d.meta[id] !== undefined) el.value = d.meta[id];
    });
  }

  // Auto-index counter: pick up from the highest index in imported students
  autoIndexCounter = (students.reduce((max, s) => {
    const n = parseInt(s.idx, 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0)) + 1;

  // Refresh all UI components
  window.updateBadge('students', students.length);
  window.updateBadge('subjects', subjects.length);
  window.renderStudentTags();
  window.renderSubjectTags();
  window.renderCategoryButtons();
  window.renderSubjectCategoryPicker();
  window.updateCategoryDatalist();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.markDirty();

  closeTemplateModal();

  const msg = _ctplOption === 'marks'
    ? `✓ Template applied — ${students.length} students, ${subjects.length} subjects & marks loaded`
    : `✓ Template applied — ${students.length} students & ${subjects.length} subjects ready`;
  window.toast(msg, 'success');

  // Take user to step 1 to review imported students
  window.goToStep(1);
}

// Close template modal on Escape
document.addEventListener('keydown', function(ev) {
  if (ev.key === 'Escape') {
    const overlay = document.getElementById('ctplOverlay');
    if (overlay && overlay.classList.contains('open')) closeTemplateModal();
  }
});



// ════════════════════════════════════════════

// ── Window exports ──
Object.assign(window, {
  closeTemplateModal,
  ctplApplyImport,
  ctplClearFile,
  ctplHandleDrop,
  ctplHandleFile,
  ctplProcessFile,
  ctplRefreshExportPanel,
  ctplSelectOption,
  ctplShowValidation,
  ctplValidate,
  exportClassTemplate,
  openTemplateModal
});
