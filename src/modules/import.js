// ═══════════════════════════════════════════════════════════════
//  src/modules/import.js
//  CSV / Excel import modal: file parse, fuzzy column mapping,
//  preview, confirm import, download template.
// ═══════════════════════════════════════════════════════════════
// ── Internal import state ──
let _imp = {
  rawRows: [],       // array of objects: {colHeader: cellValue, ...}
  headers: [],       // original column headers from file
  mapping: {},       // colHeader → subject name (or 'name', 'index', '__skip__')
  previewData: [],   // [{student, studentIdx, cells:[{subj,val,status}]}]
  fileName: '',
};

// ── Open / close ──
function openImportModal() {
  if (!students.length || !subjects.length) {
    window.toast('Add students and subjects first before importing marks', 'error'); return;
  }
  resetImport();
  document.getElementById('importModalOverlay').classList.add('open');
}
function closeImportModal() {
  document.getElementById('importModalOverlay').classList.remove('open');
}
function showImportStep(step) {
  ['upload','mapping','preview'].forEach(s => {
    document.getElementById('imp-step-' + s).style.display = s === step ? '' : 'none';
  });
}
function resetImport() {
  _imp = { rawRows:[], headers:[], mapping:{}, previewData:[], fileName:'' };
  document.getElementById('imp-file-input').value = '';
  showImportStep('upload');
}

// ── File handling ──
function handleImportFileDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) parseImportFile(file);
}
function handleImportFileSelect(event) {
  const file = event.target.files[0];
  if (file) parseImportFile(file);
}

function parseImportFile(file) {
  _imp.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();
  if (ext === 'csv') {
    reader.onload = e => processCSV(e.target.result);
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    reader.onload = e => processExcel(e.target.result);
    reader.readAsArrayBuffer(file);
  } else {
    window.toast('Unsupported file type. Use .csv, .xlsx or .xls', 'error');
  }
}

function processCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { window.toast('CSV file appears to be empty', 'error'); return; }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  }).filter(r => Object.values(r).some(v => v));
  finishParsing(headers, rows);
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function processExcel(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) { window.toast('Excel sheet appears to be empty', 'error'); return; }
    const headers = data[0].map(h => String(h || '').trim());
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(row[i] || '').trim());
      return obj;
    }).filter(r => Object.values(r).some(v => v));
    finishParsing(headers, rows);
  } catch(e) {
    window.toast('Could not read Excel file: ' + e.message, 'error');
  }
}

function finishParsing(headers, rows) {
  _imp.headers = headers;
  _imp.rawRows = rows;
  autoMapColumns();
  renderMappingUI();
  document.getElementById('imp-file-name-label').textContent = _imp.fileName + ' (' + rows.length + ' rows)';
  showImportStep('mapping');
}

// ── Auto-mapping with fuzzy matching ──
function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function similarity(a, b) {
  a = normalise(a); b = normalise(b);
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  // character overlap heuristic
  let common = 0;
  const shorter = a.length < b.length ? a : b;
  const longer  = a.length < b.length ? b : a;
  for (let c of shorter) { if (longer.includes(c)) common++; }
  return common / Math.max(a.length, b.length, 1);
}

function autoMapColumns() {
  const nameKeywords = ['student','name','studentname','fullname','pupil'];
  const idxKeywords  = ['index','idx','id','no','roll','admissionno','regno'];
  _imp.mapping = {};
  _imp.headers.forEach(h => {
    const hn = normalise(h);
    // Check name column
    if (nameKeywords.some(k => hn.includes(k))) { _imp.mapping[h] = '__name__'; return; }
    // Check index column
    if (idxKeywords.some(k => hn === k || hn === 'indexno' || hn.startsWith('index'))) {
      if (!Object.values(_imp.mapping).includes('__index__')) { _imp.mapping[h] = '__index__'; return; }
    }
    // Match against subjects
    let best = { subj: null, score: 0 };
    subjects.forEach(s => {
      const sc = similarity(h, s.name);
      if (sc > best.score) best = { subj: s.name, score: sc };
    });
    if (best.score >= 0.75)      _imp.mapping[h] = best.subj;
    else if (best.score >= 0.45) _imp.mapping[h] = best.subj; // lower confidence, still maps
    else                         _imp.mapping[h] = '__skip__';
  });
  // If no __name__ found, try the first column
  if (!Object.values(_imp.mapping).includes('__name__') && _imp.headers.length) {
    _imp.mapping[_imp.headers[0]] = '__name__';
  }
}

function getConfidence(colHeader) {
  const mapped = _imp.mapping[colHeader];
  if (!mapped || mapped === '__skip__') return 'none';
  if (mapped === '__name__' || mapped === '__index__') return 'high';
  const hn = normalise(colHeader);
  const sn = normalise(mapped);
  if (hn === sn) return 'high';
  const sc = similarity(colHeader, mapped);
  if (sc >= 0.85) return 'high';
  if (sc >= 0.65) return 'medium';
  return 'low';
}

// ── Render mapping UI ──
function renderMappingUI() {
  const container = document.getElementById('imp-mapping-table');
  const opts = ['<option value="__skip__">— skip column —</option>',
                '<option value="__name__">Student Name</option>',
                '<option value="__index__">Index Number</option>',
                ...subjects.map(s => `<option value="${escHtml(s.name)}">${escHtml(s.name)} (max ${s.max})</option>`)
               ].join('');

  let html = `<div class="imp-map-header">
    <span>File column</span><span></span><span>Map to</span><span style="text-align:center;">Confidence</span>
  </div>`;
  _imp.headers.forEach(h => {
    const mapped = _imp.mapping[h] || '__skip__';
    const conf   = getConfidence(h);
    const confLabels = { high:'✓ High', medium:'~ Medium', low:'⚠ Low', none:'— None' };
    const confClass  = { high:'imp-conf-high', medium:'imp-conf-medium', low:'imp-conf-low', none:'imp-conf-none' };
    const selClass   = (mapped && mapped !== '__skip__') ? 'mapped-ok' : 'mapped-none';
    html += `<div class="imp-map-row">
      <span class="imp-map-col" title="${escHtml(h)}">${escHtml(h)}</span>
      <span class="imp-map-arrow">→</span>
      <select class="imp-map-select ${selClass}" data-col="${escHtml(h)}" onchange="updateMapping(this)">
        ${opts.replace(`value="${escHtml(mapped)}"`, `value="${escHtml(mapped)}" selected`)}
      </select>
      <span class="imp-confidence ${confClass[conf]}" style="text-align:center;">${confLabels[conf]}</span>
    </div>`;
  });
  container.innerHTML = html;
}

function updateMapping(sel) {
  const col = sel.dataset.col;
  _imp.mapping[col] = sel.value;
  sel.className = 'imp-map-select ' + ((sel.value && sel.value !== '__skip__') ? 'mapped-ok' : 'mapped-none');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Build preview ──
function runImportPreview() {
  // Identify name and index columns
  const nameCol  = Object.entries(_imp.mapping).find(([,v]) => v === '__name__')?.[0];
  const indexCol = Object.entries(_imp.mapping).find(([,v]) => v === '__index__')?.[0];
  if (!nameCol) { window.toast('Please map a column to "Student Name"', 'error'); return; }

  // Build subject column map: subjectName → column header
  const subjColMap = {};
  Object.entries(_imp.mapping).forEach(([col, target]) => {
    if (target && target !== '__skip__' && target !== '__name__' && target !== '__index__') {
      subjColMap[target] = col;
    }
  });

  _imp.previewData = _imp.rawRows.map(row => {
    const rawName = (row[nameCol] || '').trim();
    const rawIdx  = indexCol ? (row[indexCol] || '').trim() : '';
    // Try to match to existing student by name (fuzzy)
    const matchedStudent = findStudentMatch(rawName);
    const cells = subjects.map(s => {
      const col = subjColMap[s.name];
      if (!col) return { subj: s.name, val: '', status: 'nomap' };
      const raw = (row[col] || '').trim();
      if (raw === '' || raw === '-' || raw.toLowerCase() === 'ab') return { subj: s.name, val: '', status: 'blank' };
      const num = parseFloat(raw);
      if (isNaN(num)) return { subj: s.name, val: raw, status: 'invalid' };
      const status = num > s.max ? 'over' : 'ok';
      return { subj: s.name, val: num, status };
    });
    return { rawName, rawIdx, matchedStudent, cells };
  });

  renderPreviewUI();
  showImportStep('preview');
}

function findStudentMatch(name) {
  if (!name) return null;
  const exact = students.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  // Fuzzy
  let best = { student: null, score: 0 };
  students.forEach(s => {
    const sc = similarity(s.name, name);
    if (sc > best.score) best = { student: s, score: sc };
  });
  return best.score >= 0.7 ? best.student : null;
}

function renderPreviewUI() {
  // Stats
  const totalCells  = _imp.previewData.reduce((a,r) => a + r.cells.filter(c => c.status === 'ok' || c.status === 'over').length, 0);
  const overCells   = _imp.previewData.reduce((a,r) => a + r.cells.filter(c => c.status === 'over').length, 0);
  const matchedRows = _imp.previewData.filter(r => r.matchedStudent).length;
  const unmatchedRows = _imp.previewData.length - matchedRows;
  const mappedSubjs = subjects.filter(s => _imp.previewData[0]?.cells.find(c => c.subj === s.name && c.status !== 'nomap')).length;

  document.getElementById('imp-preview-stats').innerHTML = [
    `<span class="imp-stat-pill" style="background:#d1fae5;color:#065f46;">✓ ${totalCells} marks ready</span>`,
    overCells > 0 ? `<span class="imp-stat-pill" style="background:#fee2e2;color:#991b1b;">⚠ ${overCells} over max</span>` : '',
    `<span class="imp-stat-pill" style="background:#dbeafe;color:#1e40af;">↔ ${matchedRows} students matched</span>`,
    unmatchedRows > 0 ? `<span class="imp-stat-pill" style="background:#fef3c7;color:#92400e;">? ${unmatchedRows} unmatched rows</span>` : '',
    `<span class="imp-stat-pill" style="background:#f3f4f6;color:#374151;">📚 ${mappedSubjs}/${subjects.length} subjects in file</span>`,
  ].join('');

  // Table
  const mappedSubjNames = subjects.filter(s => _imp.previewData[0]?.cells.find(c => c.subj === s.name && c.status !== 'nomap'));
  let html = `<table><thead><tr>
    <th>Row student name</th>
    <th>Matched to</th>
    ${mappedSubjNames.map(s => `<th title="max ${s.max}">${escHtml(s.name)}<br><span style="font-weight:400;font-size:10px;">/${s.max}</span></th>`).join('')}
  </tr></thead><tbody>`;

  _imp.previewData.forEach(row => {
    const matchLabel = row.matchedStudent
      ? `<span style="color:var(--success);font-weight:700;">${escHtml(row.matchedStudent.name)}</span>`
      : `<span style="color:#dc2626;font-weight:600;" title="No matching student found — row will be skipped">✗ No match</span>`;
    html += `<tr>
      <td style="white-space:nowrap;">${escHtml(row.rawName)}</td>
      <td>${matchLabel}</td>
      ${mappedSubjNames.map(s => {
        const cell = row.cells.find(c => c.subj === s.name);
        if (!cell || cell.status === 'nomap') return `<td class="imp-cell-nomap">—</td>`;
        if (cell.status === 'blank') return `<td class="imp-cell-blank">blank</td>`;
        if (cell.status === 'over')  return `<td class="imp-cell-over">⚠ ${cell.val}</td>`;
        if (cell.status === 'invalid') return `<td class="imp-cell-over">${escHtml(cell.val)}</td>`;
        return `<td class="imp-cell-ok">${cell.val}</td>`;
      }).join('')}
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('imp-preview-table-wrap').innerHTML = html;

  // Warnings
  const warnings = [];
  if (overCells > 0) warnings.push(`${overCells} mark(s) exceed the subject maximum — they will be imported as-is and highlighted in red in the marks table.`);
  if (unmatchedRows > 0) warnings.push(`${unmatchedRows} row(s) could not be matched to any student and will be skipped.`);
  const partialSubjs = subjects.filter(s => _imp.previewData[0]?.cells.find(c => c.subj === s.name && c.status === 'nomap')).map(s => s.name);
  if (partialSubjs.length > 0) warnings.push(`Partial import: ${partialSubjs.length} subject(s) not in the file (${partialSubjs.slice(0,3).join(', ')}${partialSubjs.length>3?'…':''}). You can fill those manually.`);

  const warnBox = document.getElementById('imp-warnings');
  if (warnings.length) {
    warnBox.style.display = '';
    warnBox.innerHTML = `<div class="imp-warning-box"><strong>⚠ Heads up before importing:</strong><ul>${warnings.map(w=>`<li>${w}</li>`).join('')}</ul></div>`;
  } else {
    warnBox.style.display = 'none';
  }
}

// ── Confirm & apply import ──
function confirmImport() {
  const overwrite = document.getElementById('imp-overwrite-chk').checked;
  let imported = 0, skipped = 0;

  _imp.previewData.forEach(row => {
    if (!row.matchedStudent) { skipped++; return; }
    const studentName = row.matchedStudent.name;
    row.cells.forEach(cell => {
      if (cell.status === 'nomap' || cell.status === 'blank') return;
      if (cell.status === 'invalid') return;
      const key = `${studentName}||${cell.subj}`;
      if (!overwrite && marks[key] !== undefined && marks[key] !== '') return;
      marks[key] = cell.val;
      imported++;
    });
  });

  closeImportModal();
  window.markDirty();
  window.renderMarksTable();
  window.toast(`✓ Import complete — ${imported} marks applied, ${skipped} rows skipped`, 'success');
  // Navigate to marks tab to show result
  window.goToStep(3);
}

// ── Download template ──
function downloadImportTemplate() {
  if (!students.length || !subjects.length) {
    window.toast('Add students and subjects first', 'error'); return;
  }
  const header = ['Index No.', 'Student Name', ...subjects.map(s => s.name)];
  const rows   = students.map(s => [s.idx, s.name, ...subjects.map(() => '')]);
  const ws     = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Style header row width hints
  ws['!cols'] = [{ wch: 10 }, { wch: 24 }, ...subjects.map(() => ({ wch: 12 }))];
  const wb     = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, 'marks_template.xlsx');
  window.toast('Template downloaded!', 'success');
}


// ════════════════════════════════════════════
//  CLASS TEMPLATE IMPORT / EXPORT
// ════════════════════════════════════════════


// ── Window exports ──
Object.assign(window, {
  autoMapColumns,
  closeImportModal,
  confirmImport,
  downloadImportTemplate,
  escHtml,
  findStudentMatch,
  finishParsing,
  getConfidence,
  handleImportFileDrop,
  handleImportFileSelect,
  normalise,
  openImportModal,
  parseCSVLine,
  parseImportFile,
  processCSV,
  processExcel,
  renderMappingUI,
  renderPreviewUI,
  resetImport,
  runImportPreview,
  showImportStep,
  similarity,
  updateMapping
});
