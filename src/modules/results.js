// ═══════════════════════════════════════════════════════════════
//  src/modules/results.js
//  computeResults, renderResultsTable, renderResultsCards,
//  filter/sort engine, downloadExcel, downloadExcelFiltered,
//  buildAndDownloadXlsx (full Excel builder).
// ═══════════════════════════════════════════════════════════════
// ── Compute results ──
function computeResults() {
  if (!students.length || !subjects.length) {
    window.toast('Add students and subjects first', 'error'); return;
  }
  results = students.map(student => {
    const subjMarks = {};
    subjects.forEach(subj => {
      const key = `${student.name}||${subj.name}`;
      const raw = marks[key];
      const elective = subj.category && !window.isCatMandatory(subj.category);
      if (raw === 'AB') {
        // Absent: store the sentinel so results table can display it distinctly
        subjMarks[subj.name] = 'AB';
      } else if (raw === undefined || raw === '') {
        // For elective subjects with no mark, store null (= not chosen)
        // For mandatory subjects with no mark, store 0 (= blank/not entered)
        subjMarks[subj.name] = elective ? null : 0;
      } else {
        subjMarks[subj.name] = parseFloat(raw) || 0;
      }
    });
    const { total, max: pctMax } = window.calcStudentTotalAndMax(student.name);
    const pct = pctMax > 0 ? (total / pctMax) * 100 : 0;
    return {
      student: student.name,
      idx: student.idx,
      subjMarks,
      total,
      totalMax: pctMax,
      pct: parseFloat(pct.toFixed(1)),
      grade: window.getGrade(pct)
    };
  });
  // Sort by raw total first (exact), then pct, then name.
  // Using raw total prevents false ties caused by rounding pct to 1 decimal place.
  results.sort((a, b) => b.total - a.total || b.pct - a.pct || a.student.localeCompare(b.student));
  let rank = 1;
  results.forEach((r, i) => {
    // Two students are truly tied only if BOTH their raw total AND pct match exactly.
    if (i > 0 && (results[i].total < results[i - 1].total || results[i].pct < results[i - 1].pct)) rank = i + 1;
    r.rank = rank;
  });
  window.toast('Results calculated!', 'success');
  window.goToStep(4);
}

// ── Render results ──
function renderResultsTable() {
  const empty = document.getElementById('results-empty');
  const content = document.getElementById('results-content');
  if (!results.length) { empty.style.display = ''; content.style.display = 'none'; return; }
  empty.style.display = 'none';
  content.style.display = '';

  const totalMax = window.getGlobalMax();
  const pcts = results.map(r => r.pct);
  const classAvg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const globalPassPct = (() => { const sg = [...gradingScale].sort((a,b)=>b.minPct-a.minPct); return sg.length > 1 ? sg[sg.length-2].minPct : 50; })();
  const passing = results.filter(r => r.pct >= globalPassPct).length;

  document.getElementById('summaryMetrics').innerHTML = `
    <div class="metric-card blue">
      <div class="metric-label">Total students</div>
      <div class="metric-value">${results.length}</div>
      <div class="metric-sub">in this class</div>
    </div>
    <div class="metric-card green">
      <div class="metric-label">Class average</div>
      <div class="metric-value">${classAvg.toFixed(1)}%</div>
      <div class="metric-sub">overall percentage</div>
    </div>
    <div class="metric-card amber">
      <div class="metric-label">Top score</div>
      <div class="metric-value">${Math.max(...pcts).toFixed(1)}%</div>
      <div class="metric-sub">${results[0].student}</div>
    </div>
    <div class="metric-card red">
      <div class="metric-label">Lowest score</div>
      <div class="metric-value">${Math.min(...pcts).toFixed(1)}%</div>
      <div class="metric-sub">of class</div>
    </div>
    <div class="metric-card teal">
      <div class="metric-label">Pass rate</div>
      <div class="metric-value">${Math.round((passing / results.length) * 100)}%</div>
      <div class="metric-sub">${passing} of ${results.length} passed</div>
    </div>
  `;

  const table = document.getElementById('resultsTable');

  // ── Build category groups for the two-row header ──
  // catGroups: ordered list of { catName, mandatory, subjects[], color }
  const catColorPalette = window._getTablePalette();
  // Gather subjects in declared category order, then any undeclared category names
  // found on subjects (handles missing categories array entries), then uncategorised.
  const catSubjGroups = [];
  const _rDeclaredCatNames = window.categories.map(c => c.name);
  const _rSubjectCatNames  = [...new Set(subjects.map(s => s.category).filter(c => c && c !== ''))];
  const catOrder = [...new Set([..._rDeclaredCatNames, ..._rSubjectCatNames]), '__none__'];
  catOrder.forEach((catKey, ci) => {
    const catSubjs = subjects.filter(s => (s.category || '__none__') === catKey);
    if (!catSubjs.length) return;
    const mandatory = catKey === '__none__' ? true : window.isCatMandatory(catKey);
    const label     = catKey === '__none__' ? '' : catKey;
    const namedCatIdx = _rDeclaredCatNames.indexOf(catKey);
    const colorIdx = namedCatIdx >= 0 ? namedCatIdx % catColorPalette.length : ci % catColorPalette.length;
    catSubjGroups.push({ catKey, label, mandatory, subjects: catSubjs, color: catColorPalette[colorIdx] });
  });

  // ── ROW 1: category group headers ──
  let html = `<thead>`;
  // Check if there is more than one distinct category (if all uncategorised, skip row 1)
  const hasNamedCats = catSubjGroups.some(g => g.label !== '');
  if (hasNamedCats) {
    html += `<tr>
      <th rowspan="2" class="col-res-rank" style="width:52px;text-align:center;vertical-align:middle;border-bottom:2px solid var(--border);">Rank</th>
      <th rowspan="2" class="col-res-idx" style="width:64px;text-align:center;vertical-align:middle;border-bottom:2px solid var(--border);white-space:nowrap;">Index No.</th>
      <th rowspan="2" class="col-res-name" style="min-width:150px;white-space:nowrap;vertical-align:middle;border-bottom:2px solid var(--border);">Student name</th>`;
    catSubjGroups.forEach(g => {
      const n = g.subjects.length;
      if (g.label === '') {
        // Uncategorised: spans its subjects, no group header styling
        g.subjects.forEach(() => {
          html += `<th style="text-align:center;background:${window._thBgFallback()};border-bottom:1px solid var(--border);"></th>`;
        });
      } else {
        const badge = g.mandatory
          ? `<span style="font-size:9px;font-weight:700;background:${g.color.fg}22;color:${g.color.fg};border-radius:3px;padding:1px 5px;letter-spacing:0;text-transform:none;margin-left:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>Mandatory</span>`
          : `<span style="font-size:9px;font-weight:700;background:${g.color.fg}22;color:${g.color.fg};border-radius:3px;padding:1px 5px;letter-spacing:0;text-transform:none;margin-left:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>Elective</span>`;
        html += `<th colspan="${n}" style="text-align:center;background:${g.color.bg};color:${g.color.fg};border:1.5px solid ${g.color.border};border-bottom:2.5px solid ${g.color.fg};font-size:11px;font-weight:800;letter-spacing:0.06em;padding:7px 6px 5px;">
          ${g.label.toUpperCase()}${badge}
        </th>`;
      }
    });
    html += `
      <th rowspan="2" style="text-align:center;vertical-align:middle;border-bottom:2px solid var(--border);">Total<br><span style="font-weight:400;font-size:10px;text-transform:none;letter-spacing:0;">/${totalMax} max</span></th>
      <th rowspan="2" class="col-average" style="min-width:160px;vertical-align:middle;border-bottom:2px solid var(--border);white-space:nowrap;">Average</th>
    </tr>`;
    // ── ROW 2: individual subject columns ──
    html += `<tr>`;
    catSubjGroups.forEach(g => {
      g.subjects.forEach(s => {
        const borderTop = g.label !== '' ? `border-top:2px solid ${g.color.fg};` : '';
        html += `<th style="text-align:center;background:${g.label !== '' ? g.color.bg : window._thBgSubFallback()};${borderTop}font-size:11px;padding:6px 4px;">
          ${s.name}<br><span style="font-weight:400;font-size:10px;color:${g.label !== '' ? g.color.fg : 'var(--text-light)'};text-transform:none;letter-spacing:0;">/${s.max}</span>
        </th>`;
      });
    });
    html += `</tr>`;
  } else {
    // No named categories — single row header (original style)
    html += `<tr>
      <th class="col-res-rank" style="width:52px;text-align:center;">Rank</th>
      <th class="col-res-idx" style="width:64px;text-align:center;white-space:nowrap;">Index No.</th>
      <th class="col-res-name" style="min-width:150px;white-space:nowrap;">Student name</th>`;
    subjects.forEach(s => {
      const rpm = window.getSubjectPassPct(s.name);
      const rIsCustomPm = window.subjectPassMarks[s.name] !== undefined;
      html += `<th style="text-align:center;">${s.name}<br><span style="font-weight:400;font-size:10px;text-transform:none;letter-spacing:0;">/${s.max}</span><br><span style="font-size:9px;font-weight:700;color:${rIsCustomPm?'var(--accent)':'var(--text-light)'};">pass ${rpm}%${rIsCustomPm?' ★':''}</span></th>`;
    });
    html += `<th style="text-align:center;">Total<br><span style="font-weight:400;font-size:10px;text-transform:none;letter-spacing:0;">/${totalMax} max</span></th>
      <th class="col-average" style="min-width:170px;">Average</th>
    </tr>`;
  }
  html += `</thead><tbody>`;

  // ── CRITICAL: body columns MUST iterate in the same category-grouped order as thead.
  // Using plain subjects.forEach() gives raw array order which differs from the
  // category-grouped header → marks appear under the wrong column headers.
  // Build an ordered subject list that mirrors catSubjGroups (same as header row 2).
  const _orderedSubjsForResults = hasNamedCats
    ? catSubjGroups.flatMap(g => g.subjects)
    : subjects;

  // Precompute the group-boundary border style for each subject ONCE, outside
  // the per-student row loop. Previously this ran `catSubjGroups.find(g =>
  // g.subjects.includes(s))` for every cell of every row — an O(groups ×
  // subjects) scan repeated `students.length` times (e.g. 40 × 24 × groups
  // extra array scans). The result is identical per subject regardless of
  // which student's row we're on, so it only needs to be computed once.
  const _cellBorderBySubject = new Map();
  _orderedSubjsForResults.forEach(s => {
    const grp = catSubjGroups.find(g => g.subjects.includes(s));
    const isGroupStart = grp && grp.label !== '' && grp.subjects[0] === s;
    _cellBorderBySubject.set(s, isGroupStart ? `border-left:2px solid ${grp.color.border};` : '');
  });

  const idxBadgeBorder = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d4f7a' : '#bfdbfe';
  results.forEach((r, i) => {
    const rankClass = r.rank === 1 ? 'rank-1' : r.rank === 2 ? 'rank-2' : r.rank === 3 ? 'rank-3' : r.rank <= 10 ? 'rank-top10' : 'rank-n';
    const rowBg = i % 2 === 1 ? window._rowAltBg() : '';
    html += `<tr style="${rowBg}">
      <td class="col-res-rank" style="text-align:center;"><div class="rank-cell"><div class="rank-badge ${rankClass}">${r.rank}</div></div></td>
      <td class="col-res-idx" style="text-align:center;"><span style="background:var(--primary-light);color:var(--primary-dark);border:1px solid ${idxBadgeBorder};border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;white-space:nowrap;">${r.idx}</span></td>
      <td class="col-res-name student-name" style="white-space:nowrap;">${r.student}</td>`;
    _orderedSubjsForResults.forEach(s => {
      const v = r.subjMarks[s.name];
      // Group-boundary border for this subject was precomputed once above —
      // it's the same for every student's row, so no per-cell lookup needed.
      const _rCellBorder = _cellBorderBySubject.get(s);
      if (v === null) {
        // Not chosen — show a dash in muted style
        html += `<td style="text-align:center;color:var(--mark-absent-fg);font-size:13px;${_rCellBorder}">—</td>`;
      } else if (v === 'AB') {
        // Absent — show distinctive AB badge
        html += `<td style="text-align:center;${_rCellBorder}padding:5px 3px;"><span class="result-ab-badge" title="Student was absent for this subject">AB</span></td>`;
      } else {
        const subPct = s.max > 0 ? (v / s.max) * 100 : 0;
        const subjResPm = window.getSubjectPassPct(s.name);
        const col = subPct >= 80 ? 'var(--success)' : subPct >= subjResPm ? 'var(--primary)' : 'var(--danger)';
        if (window.showSubjectGradesInline) {
          // A mark below the subject pass mark is always F, regardless of grading scale
          const subjGrade = subPct < subjResPm ? 'F' : window.getGrade(subPct);
          const subjGradeColor = window.getGradeColor(subjGrade);
          html += `<td style="text-align:center;padding:5px 3px;${_rCellBorder}">
            <div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
              <span style="font-weight:700;font-size:13px;color:${col};line-height:1;">${v}</span>
              <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${subjGradeColor}22;border:1.5px solid ${subjGradeColor}55;font-size:10px;font-weight:800;color:${subjGradeColor};line-height:1;">${subjGrade}</span>
            </div>
          </td>`;
        } else {
          html += `<td style="text-align:center;font-weight:600;color:${col};${_rCellBorder}">${v}</td>`;
        }
      }
    });
    html += `<td style="text-align:center;font-weight:700;color:var(--text);">${r.total}<span style="font-size:10px;font-weight:400;color:var(--text-muted);">/${r.totalMax}</span></td>
      <td class="col-average">
        <div class="pct-bar-wrap">
          <div class="pct-bar"><div class="pct-bar-fill" style="width:${r.pct}%;background:${window.pctColor(r.pct)};"></div></div>
          <span class="pct-text">${r.pct}%</span>
        </div>
      </td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;

  // ── Fix frozen column left offsets for results table ──
  // Rank is pinned at left:0. Index No. must sit immediately to the right of
  // Rank, and Student Name immediately to the right of Index No.
  // We measure the rendered widths after paint so it never drifts.
  requestAnimationFrame(() => {
    const wrap = table.closest('.results-table-wrap');
    if (!wrap) return;
    const rankCell = table.querySelector('.col-res-rank');
    const idxCell  = table.querySelector('.col-res-idx');
    if (rankCell) {
      const rankW = rankCell.getBoundingClientRect().width;
      wrap.style.setProperty('--res-frozen-idx-left', rankW + 'px');
      if (idxCell) {
        const idxW = idxCell.getBoundingClientRect().width;
        wrap.style.setProperty('--res-frozen-name-left', (rankW + idxW) + 'px');
      }
    }
    // Fix two-row sticky header — second row needs top = height of first row
    const theadRows = table.querySelectorAll('thead tr');
    if (theadRows.length === 2) {
      const row1H = theadRows[0].getBoundingClientRect().height;
      theadRows[0].querySelectorAll('th').forEach(th => { th.style.top = '0px'; });
      theadRows[1].querySelectorAll('th').forEach(th => { th.style.top = row1H + 'px'; });
    } else if (theadRows.length === 1) {
      theadRows[0].querySelectorAll('th').forEach(th => { th.style.top = '0px'; });
    }
  });

  // Apply sort arrow decorations to column headers
  _applyResultsSortHeaders();
  // Re-apply any active filter
  applyResultsFilter();
  // Render mobile card view too — but only when it's actually visible
  // (it's display:none above the 600px breakpoint). Building this full
  // 40-student × 24-subject card list on desktop did identical work to the
  // table render above for a view nobody sees, roughly doubling the cost
  // of every results render. Defer it so it never blocks presentation of
  // the (visible) desktop table.
  if (window.matchMedia('(max-width: 600px)').matches) {
    requestAnimationFrame(renderResultsCards);
  }
}

// ════════════════════════════════════════════
//  RESULTS FILTER / SORT ENGINE
// ════════════════════════════════════════════
let _resultsSortCol  = 'rank';   // rank | name | total | avg | grade
let _resultsSortDir  = 'asc';    // asc | desc
let _resultsFiltered = null;     // null = unfiltered

function _getPassPct() {
  const sg = [...gradingScale].sort((a,b)=>b.minPct-a.minPct);
  return sg.length > 1 ? sg[sg.length-2].minPct : 50;
}
function _getAGradeMinPct() {
  const sg = [...gradingScale].sort((a,b)=>b.minPct-a.minPct);
  // "A-grade" = top grade (or top 2 if A+/A exist)
  return sg.length ? sg[0].minPct : 80;
}

function applyResultsFilter() {
  if (!results.length) return;
  const searchRaw = (document.getElementById('resultsSearchInput')?.value || '').toLowerCase().trim();
  const filter    = document.getElementById('resultsFilterSelect')?.value || 'all';
  const passPct   = _getPassPct();
  const aGradePct = _getAGradeMinPct();

  let filtered = results.filter(r => {
    // name / index search
    if (searchRaw) {
      const nameMatch  = r.student.toLowerCase().includes(searchRaw);
      const idxMatch   = String(r.idx).toLowerCase().includes(searchRaw);
      if (!nameMatch && !idxMatch) return false;
    }
    // dropdown filter
    if (filter === 'pass' && r.pct < passPct)   return false;
    if (filter === 'fail' && r.pct >= passPct)  return false;
    if (filter === 'agrade' && r.pct < aGradePct) return false;
    return true;
  });

  // Sort
  filtered = _sortResultRows(filtered);
  _resultsFiltered = filtered;

  // Patch tbody rows visibility
  const table  = document.getElementById('resultsTable');
  const tbody  = table?.querySelector('tbody');
  if (!tbody) return;
  const rows   = Array.from(tbody.querySelectorAll('tr'));
  // Build map: name -> DOM row
  const nameToRow = {};
  rows.forEach(tr => {
    // student name is in 3rd td
    const nameTd = tr.querySelectorAll('td')[2];
    if (nameTd) nameToRow[nameTd.textContent.trim()] = tr;
  });
  // Reorder and show/hide
  const filteredNames = new Set(filtered.map(r => r.student));
  rows.forEach(tr => { tr.style.display = 'none'; });
  filtered.forEach((r, i) => {
    const tr = nameToRow[r.student];
    if (!tr) return;
    tr.style.display = '';
    // re-stripe
    tr.style.background = i % 2 === 1 ? 'var(--row-alt-bg)' : '';
  });
  // Re-order DOM rows in sorted order
  filtered.forEach(r => {
    const tr = nameToRow[r.student];
    if (tr) tbody.appendChild(tr);
  });

  // Mobile cards — hide non-matching
  const cards = document.getElementById('resultsCardView');
  if (cards) {
    const allCards = Array.from(cards.querySelectorAll('.result-card'));
    allCards.forEach(card => {
      const nm = card.querySelector('.result-card-name')?.textContent.trim();
      card.style.display = filteredNames.has(nm) ? '' : 'none';
    });
  }

  // Update UI affordances
  // FIX: Use visibility on the wrapper group instead of display:none/block on each child.
  // This keeps the toolbar at a fixed height so the page does not shift when searching.
  const isFiltered = searchRaw || filter !== 'all';
  const rightGroup = document.getElementById('resultsFilterRightGroup');
  const countText  = document.getElementById('resultsFilterCountText');

  if (isFiltered) {
    countText.textContent = `${filtered.length} of ${results.length} shown`;
    if (rightGroup) rightGroup.style.visibility = 'visible';
  } else {
    if (rightGroup) rightGroup.style.visibility = 'hidden';
  }
}

function clearResultsFilter() {
  const si = document.getElementById('resultsSearchInput');
  const sf = document.getElementById('resultsFilterSelect');
  if (si) si.value = '';
  if (sf) sf.value = 'all';
  applyResultsFilter();
}

function _sortResultRows(arr) {
  const col = _resultsSortCol;
  const dir = _resultsSortDir === 'asc' ? 1 : -1;
  return [...arr].sort((a, b) => {
    let va, vb;
    if      (col === 'rank')  { va = a.rank;  vb = b.rank; }
    else if (col === 'name')  { va = a.student.toLowerCase(); vb = b.student.toLowerCase(); return dir * va.localeCompare(vb); }
    else if (col === 'total') { va = a.total; vb = b.total; }
    else if (col === 'avg')   { va = a.pct;   vb = b.pct;  }
    else if (col === 'grade') { va = a.pct;   vb = b.pct;  }
    else                      { va = a.rank;  vb = b.rank; }
    return dir * (va - vb);
  });
}

function _setResultsSort(col) {
  if (_resultsSortCol === col) {
    _resultsSortDir = _resultsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _resultsSortCol = col;
    _resultsSortDir = col === 'rank' || col === 'avg' || col === 'total' ? 'asc' : 'asc';
  }
  applyResultsFilter();
  _applyResultsSortHeaders();
}

function _applyResultsSortHeaders() {
  // Inject click handlers and sort arrow indicators onto column headers
  const table = document.getElementById('resultsTable');
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  // Map th index to sortable column key based on content
  ths.forEach(th => {
    const txt = (th.textContent || '').trim().toLowerCase();
    let col = null;
    if (txt.startsWith('rank'))    col = 'rank';
    else if (txt.startsWith('student name') || txt.startsWith('student name')) col = 'name';
    else if (txt.startsWith('average'))     col = 'avg';
    else if (txt.startsWith('total'))       col = 'total';
    else if (txt.startsWith('grade'))       col = 'grade';
    if (!col) return;
    // Style as sortable
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.style.whiteSpace = 'nowrap';
    th.title = `Sort by ${col}`;
    // Remove old listener by cloning
    const newTh = th.cloneNode(true);
    th.parentNode.replaceChild(newTh, th);
    newTh.style.cursor = 'pointer';
    newTh.style.userSelect = 'none';
    newTh.title = `Sort by ${col}`;
    // Arrow indicator
    const arrow = _resultsSortCol === col
      ? (_resultsSortDir === 'asc' ? ' ↑' : ' ↓')
      : ' ⇅';
    const arrowEl = document.createElement('span');
    arrowEl.textContent = arrow;
    arrowEl.style.cssText = `font-size:10px;opacity:${_resultsSortCol===col?'0.9':'0.35'};margin-left:3px;`;
    arrowEl.className = '_sort-arrow';
    // Remove old arrow if any
    newTh.querySelectorAll('._sort-arrow').forEach(e=>e.remove());
    newTh.appendChild(arrowEl);
    // Hover highlight
    newTh.addEventListener('mouseenter', () => { newTh.style.background = 'var(--sort-hover-bg)'; });
    newTh.addEventListener('mouseleave', () => { newTh.style.background = ''; });
    newTh.addEventListener('click', () => _setResultsSort(col));
  });
}

// Filtered Excel export — wraps existing buildAndDownloadXlsx with temp result swap
function downloadExcelFiltered() {
  if (!_resultsFiltered || !_resultsFiltered.length) { window.toast('No filtered results to export', 'error'); return; }
  const backup = results;
  results = _resultsFiltered;
  buildAndDownloadXlsx().finally ? buildAndDownloadXlsx().finally(() => { results = backup; }) : (() => { buildAndDownloadXlsx(); results = backup; })();
}

// ════════════════════════════════════════════
//  END RESULTS FILTER / SORT ENGINE
// ════════════════════════════════════════════

function renderResultsCards() {
  const container = document.getElementById('resultsCardView');
  if (!container || !results.length) return;
  const sortedGrades = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  const passPct = sortedGrades.length > 1 ? sortedGrades[sortedGrades.length - 2].minPct : 50;
  container.innerHTML = results.map(r => {
    const rankClass = r.rank === 1 ? 'rank-1' : r.rank === 2 ? 'rank-2' : r.rank === 3 ? 'rank-3' : r.rank <= 10 ? 'rank-top10' : 'rank-n';
    const isPass = r.pct >= passPct;
    const gc = window.getGradeColor(r.grade);
    const subjectRows = subjects.map(s => {
      const v = r.subjMarks[s.name];
      if (v === null) {
        // Not chosen — show greyed out with dash
        return `<div class="result-subject-row" style="opacity:0.35;">
          <span class="result-subject-name" style="font-style:italic;">${s.name} <span style="color:var(--text-light);font-size:11px;">/${s.max}</span></span>
          <span class="result-subject-mark" style="color:var(--mark-absent-fg);">—</span>
        </div>`;
      }
      if (v === 'AB') {
        // Absent — show AB badge
        return `<div class="result-subject-row" style="opacity:0.7;">
          <span class="result-subject-name">${s.name} <span style="color:var(--text-light);font-size:11px;">/${s.max}</span></span>
          <span class="result-ab-badge" title="Student was absent">AB</span>
        </div>`;
      }
      const sp = s.max > 0 ? (v / s.max) * 100 : 0;
      const subjPm = window.getSubjectPassPct(s.name);
      const sc = sp >= 80 ? 'var(--success)' : sp >= subjPm ? 'var(--primary)' : 'var(--danger)';
      // A mark below the subject pass mark is always F, regardless of grading scale
      const subjGrade = sp < subjPm ? 'F' : window.getGrade(sp);
      const subjGradeColor = window.getGradeColor(subjGrade);
      const gradeChip = window.showSubjectGradesInline
        ? `<span style="margin-left:6px;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${subjGradeColor}22;border:1.5px solid ${subjGradeColor}55;font-size:9px;font-weight:800;color:${subjGradeColor};flex-shrink:0;">${subjGrade}</span>`
        : '';
      return `<div class="result-subject-row">
        <span class="result-subject-name">${s.name} <span style="color:var(--text-light);font-size:11px;">/${s.max}</span></span>
        <span class="result-subject-mark" style="color:${sc};display:inline-flex;align-items:center;gap:4px;">${v}${gradeChip}</span>
      </div>`;
    }).join('');
    return `<div class="result-card">
      <div class="result-card-header">
        <div class="result-card-rank"><span class="rank-badge ${rankClass}">${r.rank}</span></div>
        <div class="result-card-info">
          <div class="result-card-name">${r.student}</div>
          <div class="result-card-idx">Index #${r.idx} &nbsp;·&nbsp; <span class="${isPass ? 'result-status-pass' : 'result-status-fail'}">${isPass ? '✓ PASS' : '✗ FAIL'}</span></div>
        </div>
        <span class="result-card-grade" style="background:${gc}22;color:${gc};">${r.grade}</span>
      </div>
      <div class="result-card-body">
        <div class="result-card-stats">
          <div class="result-stat">
            <span class="result-stat-label">Total</span>
            <span class="result-stat-value">${r.total}<span style="font-size:12px;font-weight:400;color:var(--text-muted);">/${r.totalMax}</span></span>
          </div>
          <div class="result-stat">
            <span class="result-stat-label">Average</span>
            <div class="result-pct-bar-wrap" style="margin-top:4px;">
              <div class="result-pct-bar"><div class="result-pct-bar-fill" style="width:${r.pct}%;background:${gc};"></div></div>
              <span class="result-pct-text">${r.pct}%</span>
            </div>
          </div>
        </div>
        <div class="result-card-subjects">${subjectRows}</div>
      </div>
    </div>`;
  }).join('');
}
function downloadExcel() {
  if (!results.length) { window.toast('No results to export', 'error'); return; }
  if (typeof JSZip === 'undefined') { window.toast('JSZip not loaded yet, retrying…','info'); setTimeout(buildAndDownloadXlsx,600); return; }
  buildAndDownloadXlsx();
}

async function buildAndDownloadXlsx() {
  try {
    const cn  = document.getElementById('className').value  || 'Class';
    const ay  = document.getElementById('academicYear').value || '';
    const tn  = document.getElementById('teacherName').value  || '';
    const sn  = document.getElementById('schoolName').value   || '';
    const totalMax = window.getGlobalMax();
    const sortedG  = [...gradingScale].sort((a,b)=>b.minPct-a.minPct);
    const passPct  = sortedG.length>1 ? sortedG[sortedG.length-2].minPct : 50;
    const pcts     = results.map(r=>r.pct);
    const classAvg = pcts.reduce((a,b)=>a+b,0)/pcts.length;
    const passing  = results.filter(r=>r.pct>=passPct).length;
    const dateStr  = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});

    // ── STYLE REGISTRY ──────────────────────────
    const FONTS=[],FILLS=[],BORDERS=[],XFS=[];
    const FM={},LM={},BM={},XM={};

    // OOXML requires fill index 0=none, 1=gray125
    FILLS.push({type:'none'}); FM['none']=0;
    FILLS.push({type:'gray125'}); FM['gray125']=1;

    function regFont(bold,sz,rgb) {
      const k=`${+!!bold}|${sz}|${rgb}`;
      if(FM[k]!==undefined) return FM[k];
      const i=FONTS.length; FONTS.push({bold:!!bold,sz,rgb});
      return (FM[k]=i);
    }
    function regFill(rgb) {
      if(!rgb||rgb==='none') return 0;
      if(FM['f'+rgb]!==undefined) return FM['f'+rgb];
      const i=FILLS.length; FILLS.push({type:'solid',rgb});
      return (FM['f'+rgb]=i);
    }
    function regBorder(style) {
      const k=style||'none';
      if(BM[k]!==undefined) return BM[k];
      const i=BORDERS.length; BORDERS.push(k);
      return (BM[k]=i);
    }
    function regXf(fi,li,bi,h,v,wrap) {
      const k=`${fi}|${li}|${bi}|${h}|${v}|${+!!wrap}`;
      if(XM[k]!==undefined) return XM[k];
      const i=XFS.length; XFS.push({fi,li,bi,h:h||'general',v:v||'center',wrap:!!wrap});
      return (XM[k]=i);
    }

    // Pre-register common fonts
    const F={
      wh_xl: regFont(1,16,'FFFFFF'), wh_lg: regFont(1,14,'FFFFFF'),
      wh_md: regFont(1,11,'FFFFFF'), wh_sm: regFont(0,10,'FFFFFF'),
      wh_nm: regFont(0,11,'FFFFFF'),
      navy_hd: regFont(1,12,'1E3A5F'), navy_nm: regFont(0,11,'1E3A5F'),
      dk_xl: regFont(1,14,'111827'), dk_lg: regFont(1,13,'111827'),
      dk_md: regFont(1,11,'111827'), dk_nm: regFont(0,11,'111827'),
      dk_sm: regFont(0,10,'111827'),
      gray:  regFont(0,10,'64748B'), gray_md: regFont(0,11,'64748B'),
      blue:  regFont(1,11,'1A56DB'), blue_sm: regFont(0,10,'1A56DB'),
      green: regFont(1,11,'059669'), red: regFont(1,11,'DC2626'),
      amber: regFont(1,11,'D97706'), teal: regFont(1,11,'0D9488'),
      gold:  regFont(1,12,'B45309'),
    };

    // Pre-register common fills
    const L={
      none:  0,
      navy:  regFill('EFF4FF'), blue:  regFill('DBEAFE'),
      dark2: regFill('E8EDF5'),
      lgray: regFill('F8FAFC'), mgray: regFill('F1F5F9'),
      stripe:regFill('F8FAFC'), white: regFill('FFFFFF'),
      pass:  regFill('D1FAE5'), fail:  regFill('FEE2E2'),
      rank1: regFill('FEF3C7'), rank2: regFill('F1F5F9'), rank3:regFill('FFF7ED'),
      m1:regFill('EFF6FF'),m2:regFill('ECFDF5'),m3:regFill('FFFBEB'),
      m4:regFill('FEF2F2'),m5:regFill('F0FDFA'),
      m1a:regFill('BFDBFE'),m2a:regFill('A7F3D0'),m3a:regFill('FDE68A'),
      m4a:regFill('FECACA'),m5a:regFill('99F6E4'),
    };

    const B={none:regBorder('none'), thin:regBorder('thin'), med:regBorder('medium')};

    function xf(fi,li,bi,h,v,wrap){ return regXf(fi,li,bi,h,v,wrap); }

    // ── CELL BUILDER ────────────────────────────
    // Each sheet = {rows:[], merges:[], colW:[], rowH:[]}
    function newSheet(name) {
      return {name, rows:[], merges:[], colW:[], rowH:[]};
    }
    function sc(sh,col,row,val,xfIdx,isNum) {
      while(sh.rows.length<=row) sh.rows.push([]);
      if(!sh.rows[row]) sh.rows[row]=[];
      sh.rows[row][col]={v:val,n:!!isNum,xf:xfIdx||0};
    }
    function sm(sh,r1,c1,r2,c2){ sh.merges.push({r1,c1,r2,c2}); }
    function rh(sh,r,h){ sh.rowH[r]=h; }
    function cw(sh,c,w){ sh.colW[c]=w; }

    // Fill a row with empty styled cells
    function fillRow(sh,row,fromC,toC,xfIdx){
      for(let c=fromC;c<=toC;c++){
        if(!sh.rows[row]||sh.rows[row][c]===undefined) sc(sh,c,row,'',xfIdx);
      }
    }

    // Band: full-width merged coloured row
    function band(sh,row,text,fillIdx,fontIdx,height,totalCols){
      rh(sh,row,height||20);
      sc(sh,0,row,text,xf(fontIdx,fillIdx,B.none,'left','center'));
      fillRow(sh,row,1,totalCols-1,xf(fontIdx,fillIdx,B.none,'left','center'));
      sm(sh,row,0,row,totalCols-1);
    }

    // Section header — light blue bg, dark navy text
    function secHdr(sh,row,text,spanCols){
      rh(sh,row,22);
      sc(sh,0,row,text,xf(F.navy_hd,L.navy,B.thin,'left','center'));
      fillRow(sh,row,1,spanCols-1,xf(F.navy_hd,L.navy,B.thin,'left','center'));
      sm(sh,row,0,row,spanCols-1);
    }

    // Table header cell — medium blue bg, dark text
    function thdr(sh,col,row,text){ sc(sh,col,row,text,xf(F.navy_hd,L.blue,B.thin,'center','center',true)); }

    // ═══════════════════════════════════════════
    // SHEET 1 — Result Sheet
    // ═══════════════════════════════════════════
    const s1 = newSheet('Result Sheet');
    const TC = 3+subjects.length+4; // total columns
    let R=0;

    if(sn){ band(s1,R,sn,L.navy,F.navy_hd,26,TC); R++; }
    band(s1,R,`Result Sheet — ${cn}${ay?' ('+ay+')':''}`,L.blue,F.dk_xl,32,TC); R++;
    if(tn){ band(s1,R,`Class Teacher: ${tn}`,L.navy,F.navy_nm,20,TC); R++; }
    band(s1,R,`Generated: ${dateStr}`,L.dark2,F.gray,18,TC); R++;
    R++; // spacer

    // ── Metric boxes (3 rows: accent/label, big-value, sub-label) ──
    const metrics=[
      {lbl:'TOTAL STUDENTS', val:String(results.length),      sub:'students in class', mf:L.m1,  af:L.m1a, vf:F.blue},
      {lbl:'CLASS AVERAGE',  val:classAvg.toFixed(1)+'%',    sub:'overall percentage',mf:L.m2,  af:L.m2a, vf:F.green},
      {lbl:'TOP SCORE',      val:Math.max(...pcts).toFixed(1)+'%', sub:results[0].student, mf:L.m3, af:L.m3a, vf:F.amber},
      {lbl:'LOWEST SCORE',   val:Math.min(...pcts).toFixed(1)+'%', sub:'of class',     mf:L.m4,  af:L.m4a, vf:F.red},
      {lbl:'PASS RATE',      val:Math.round((passing/results.length)*100)+'%', sub:`${passing}/${results.length} passed`, mf:L.m5, af:L.m5a, vf:F.teal},
    ];
    const span=Math.max(2,Math.floor(TC/5));
    metrics.forEach((m,mi)=>{
      const sc2=mi*span, ec=mi===4?TC-1:sc2+span-1;
      // Accent top strip
      for(let c=sc2;c<=ec;c++) sc(s1,c,R,'',xf(F.dk_sm,m.af,B.none,'center','center'));
      if(ec>sc2) sm(s1,R,sc2,R,ec); rh(s1,R,6); 
      // Label
      sc(s1,sc2,R+1,m.lbl,xf(F.gray,m.mf,B.thin,'center','center'));
      fillRow(s1,R+1,sc2+1,ec,xf(F.gray,m.mf,B.thin,'center','center'));
      if(ec>sc2) sm(s1,R+1,sc2,R+1,ec); rh(s1,R+1,16);
      // Value
      sc(s1,sc2,R+2,m.val,xf(m.vf,m.mf,B.none,'center','center'));
      fillRow(s1,R+2,sc2+1,ec,xf(m.vf,m.mf,B.none,'center','center'));
      if(ec>sc2) sm(s1,R+2,sc2,R+2,ec); rh(s1,R+2,34);
      // Sub-label
      sc(s1,sc2,R+3,m.sub,xf(F.gray,m.mf,B.thin,'center','center'));
      fillRow(s1,R+3,sc2+1,ec,xf(F.gray,m.mf,B.thin,'center','center'));
      if(ec>sc2) sm(s1,R+3,sc2,R+3,ec); rh(s1,R+3,14);
    });
    R+=4; R++; // +spacer

    // ── Category colour palette (matches UI) ──
    const xlCatPalette = [
      { fg:'1A56DB', bg:'EFF6FF', hdr:'BFDBFE' },
      { fg:'059669', bg:'ECFDF5', hdr:'A7F3D0' },
      { fg:'D97706', bg:'FFFBEB', hdr:'FDE68A' },
      { fg:'7C3AED', bg:'F5F3FF', hdr:'DDD6FE' },
      { fg:'DC2626', bg:'FEF2F2', hdr:'FECACA' },
      { fg:'0D9488', bg:'F0FDFA', hdr:'99F6E4' },
    ];
    const xlCatGroups = [];
    const _xlDeclaredCatNames = window.categories.map(c => c.name);
    const _xlSubjectCatNames  = [...new Set(subjects.map(s => s.category).filter(c => c && c !== ''))];
    const _xlCatOrder = [...new Set([..._xlDeclaredCatNames, ..._xlSubjectCatNames]), '__none__'];
    _xlCatOrder.forEach((catKey, ci) => {
      const subjs = subjects.filter(s => (s.category||'__none__') === catKey);
      if (!subjs.length) return;
      const mandatory = catKey === '__none__' ? true : window.isCatMandatory(catKey);
      const label = catKey === '__none__' ? '' : catKey;
      const ni = _xlDeclaredCatNames.indexOf(catKey);
      const colorIdx = ni >= 0 ? ni % xlCatPalette.length : ci % xlCatPalette.length;
      xlCatGroups.push({ label, mandatory, subjects: subjs, pal: xlCatPalette[colorIdx] });
    });
    const xlHasNamed = xlCatGroups.some(g => g.label !== '');
    const FIX = 3;
    const TAIL = 4;

    if (xlHasNamed) {
      // Row A — category group headers
      rh(s1, R, 22);
      const fixStyle = xf(F.navy_hd, L.blue, B.thin, 'center', 'center');
      sc(s1, 0, R, 'Rank',         fixStyle);
      sc(s1, 1, R, 'Index No.',    fixStyle);
      sc(s1, 2, R, 'Student Name', fixStyle);
      const tailLabels = ['Total /'+totalMax, 'Avg %', 'Grade', 'Status'];
      const tailStart = FIX + subjects.length;
      tailLabels.forEach((lbl, ti) => sc(s1, tailStart+ti, R, lbl, fixStyle));
      let colCursor = FIX;
      xlCatGroups.forEach(g => {
        const n = g.subjects.length;
        if (g.label === '') {
          g.subjects.forEach(s => {
            sc(s1, colCursor, R, s.name+' /'+s.max, xf(F.navy_hd, L.mgray, B.thin, 'center', 'center', true));
            colCursor++;
          });
        } else {
          const fgFont  = regFont(1, 11, g.pal.fg);
          const hdrFill = regFill(g.pal.hdr);
          const badge   = g.mandatory ? ' [Mandatory]' : ' [Elective]';
          const catStyle = xf(fgFont, hdrFill, B.thin, 'center', 'center');
          sc(s1, colCursor, R, g.label.toUpperCase() + badge, catStyle);
          for (let i = 1; i < n; i++) sc(s1, colCursor+i, R, '', catStyle);
          if (n > 1) sm(s1, R, colCursor, R, colCursor+n-1);
          colCursor += n;
        }
      });
      R++;

      // Row B — individual subject names; merge fixed/tail across both rows
      rh(s1, R, 26);
      sm(s1, R-1, 0, R, 0); sm(s1, R-1, 1, R, 1); sm(s1, R-1, 2, R, 2);
      tailLabels.forEach((_, ti) => sm(s1, R-1, tailStart+ti, R, tailStart+ti));
      sc(s1, 0, R, '', fixStyle); sc(s1, 1, R, '', fixStyle); sc(s1, 2, R, '', fixStyle);
      tailLabels.forEach((_, ti) => sc(s1, tailStart+ti, R, '', fixStyle));
      colCursor = FIX;
      xlCatGroups.forEach(g => {
        const fgFont = g.label !== '' ? regFont(1, 10, g.pal.fg) : F.navy_hd;
        const bgFill = g.label !== '' ? regFill(g.pal.bg) : L.mgray;
        const subjStyle = xf(fgFont, bgFill, B.thin, 'center', 'center', true);
        g.subjects.forEach(s => {
          sc(s1, colCursor, R, s.name+' /'+s.max, subjStyle);
          colCursor++;
        });
      });
      R++;
    } else {
      // Single-row header
      rh(s1, R, 28);
      const hdrs = ['Rank','Index No.','Student Name',
        ...subjects.map(s=>s.name+' /'+s.max),
        'Total /'+totalMax,'Avg %','Grade','Status'];
      hdrs.forEach((h,c) => thdr(s1, c, R, h));
      R++;
    }

    // ── Ordered subject list for data rows (must mirror category-grouped header order) ──
    const _xlOrderedSubjs = xlHasNamed ? xlCatGroups.flatMap(g => g.subjects) : subjects;

    // ── Student data rows ──
    results.forEach((r,ri)=>{
      const isPass=r.pct>=passPct;
      const rowFill=ri%2===0?L.white:L.stripe;
      const rankFill=r.rank===1?L.rank1:r.rank===2?L.rank2:r.rank===3?L.rank3:rowFill;
      // Parse grade colour safely
      const rawGC=window.getGradeColor(r.grade)||'#1A56DB';
      const gc=rawGC.replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
      const gcFont=regFont(1,11,gc);
      const gcFill=regFill(gc);

      sc(s1,0,R,r.rank,          xf(F.gold,rankFill,B.thin,'center','center'),true);
      sc(s1,1,R,String(r.idx),   xf(F.blue,rowFill,B.thin,'center','center'));
      sc(s1,2,R,r.student,       xf(F.dk_md,rowFill,B.thin,'left','center'));
      _xlOrderedSubjs.forEach((s,si)=>{
        const v=r.subjMarks[s.name];
        if(v===null){
          sc(s1,3+si,R,'—',xf(F.gray,rowFill,B.thin,'center','center'));
        } else if(v==='AB'){
          sc(s1,3+si,R,'AB',xf(F.red,rowFill,B.thin,'center','center'));
        } else {
          const sp=s.max>0?(v/s.max)*100:0;
          const subjExcelPm = window.getSubjectPassPct(s.name);
          const sf=sp>=80?F.green:sp>=subjExcelPm?F.blue:F.red;
          sc(s1,3+si,R,v,xf(sf,rowFill,B.thin,'center','center'),true);
        }
      });
      const bc=3+subjects.length;
      sc(s1,bc,  R,r.total,     xf(F.dk_lg,rowFill,B.thin,'center','center'),true);
      sc(s1,bc+1,R,r.pct+'%',  xf(gcFont,rowFill,B.thin,'center','center'));
      sc(s1,bc+2,R,r.grade,     xf(gcFont,rowFill,B.thin,'center','center'));
      sc(s1,bc+3,R,isPass?'PASS':'FAIL',xf(isPass?F.green:F.red,isPass?L.pass:L.fail,B.thin,'center','center'));
      rh(s1,R,20); R++;
    });

    R++; // spacer

    // ── Class Summary section ──
    secHdr(s1,R,'Class Summary',5); R++;
    const sums=[
      ['Total Students',  String(results.length)],
      ['Class Average',   classAvg.toFixed(1)+'%'],
      ['Top Student',     results[0].student+' ('+Math.max(...pcts).toFixed(1)+'%)'],
      ['Pass Rate',       Math.round((passing/results.length)*100)+'%  ('+passing+'/'+results.length+')'],
    ];
    sums.forEach((row,i)=>{
      const bg=i%2===0?L.lgray:L.white;
      sc(s1,0,R,row[0],xf(F.gray_md,bg,B.thin,'left','center'));
      sc(s1,1,R,row[1],xf(F.dk_md,bg,B.thin,'left','center'));
      fillRow(s1,R,2,4,xf(F.dk_nm,bg,B.thin,'left','center'));
      sm(s1,R,1,R,4);
      rh(s1,R,20); R++;
    });

    R++; // spacer

    // ── Grading Scale section ──
    secHdr(s1,R,'Grading Scale',5); R++;
    ['Grade','Min %','Max %','Range','Status'].forEach((h,c)=>
      sc(s1,c,R,h,xf(F.navy_hd,L.dark2,B.thin,'center','center')));
    rh(s1,R,20); R++;
    sortedG.forEach((g,i)=>{
      const maxP=i===0?100:sortedG[i-1].minPct-1;
      const isP=g.minPct>=passPct;
      const gc2=(g.color||'#999999').replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
      const gf=regFont(1,12,gc2);
      sc(s1,0,R,g.label,    xf(gf,L.lgray,B.thin,'center','center'));
      sc(s1,1,R,g.minPct+'%',xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s1,2,R,maxP+'%',   xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s1,3,R,g.minPct+'% – '+maxP+'%',xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s1,4,R,isP?'PASS':'FAIL',xf(isP?F.green:F.red,isP?L.pass:L.fail,B.thin,'center','center'));
      rh(s1,R,20); R++;
    });

    // Col widths sheet 1
    cw(s1,0,7); cw(s1,1,11); cw(s1,2,24);
    _xlOrderedSubjs.forEach((s,i)=>cw(s1,3+i,Math.max(String(s.name).length+3,13)));
    const bc1=3+subjects.length;
    cw(s1,bc1,10); cw(s1,bc1+1,10); cw(s1,bc1+2,8); cw(s1,bc1+3,8);

    // ═══════════════════════════════════════════
    // SHEET 2 — Marks Detail
    // ═══════════════════════════════════════════
    const s2=newSheet('Marks Detail');
    const s2TailLabels = ['Total','Max','Avg %','Grade','Status'];
    const s2TailStart = 2 + subjects.length;
    if (xlHasNamed) {
      rh(s2, 0, 22);
      const s2FixStyle = xf(F.navy_hd, L.blue, B.thin, 'center', 'center');
      sc(s2, 0, 0, 'Index No.',    s2FixStyle);
      sc(s2, 1, 0, 'Student Name', s2FixStyle);
      s2TailLabels.forEach((lbl, ti) => sc(s2, s2TailStart+ti, 0, lbl, s2FixStyle));
      let s2Cur = 2;
      xlCatGroups.forEach(g => {
        const n = g.subjects.length;
        if (g.label === '') {
          g.subjects.forEach(s => { sc(s2, s2Cur, 0, s.name+' /'+s.max, xf(F.navy_hd, L.mgray, B.thin, 'center', 'center', true)); s2Cur++; });
        } else {
          const s2FgFont  = regFont(1, 11, g.pal.fg);
          const s2HdrFill = regFill(g.pal.hdr);
          const s2Badge   = g.mandatory ? ' [Mandatory]' : ' [Elective]';
          const s2CatStyle = xf(s2FgFont, s2HdrFill, B.thin, 'center', 'center');
          sc(s2, s2Cur, 0, g.label.toUpperCase() + s2Badge, s2CatStyle);
          for (let i = 1; i < n; i++) sc(s2, s2Cur+i, 0, '', s2CatStyle);
          if (n > 1) sm(s2, 0, s2Cur, 0, s2Cur+n-1);
          s2Cur += n;
        }
      });
      rh(s2, 1, 26);
      sm(s2, 0, 0, 1, 0); sm(s2, 0, 1, 1, 1);
      s2TailLabels.forEach((_, ti) => sm(s2, 0, s2TailStart+ti, 1, s2TailStart+ti));
      sc(s2, 0, 1, '', s2FixStyle); sc(s2, 1, 1, '', s2FixStyle);
      s2TailLabels.forEach((_, ti) => sc(s2, s2TailStart+ti, 1, '', s2FixStyle));
      s2Cur = 2;
      xlCatGroups.forEach(g => {
        const s2FgFont2 = g.label !== '' ? regFont(1, 10, g.pal.fg) : F.navy_hd;
        const s2BgFill2 = g.label !== '' ? regFill(g.pal.bg) : L.mgray;
        const s2SubjStyle = xf(s2FgFont2, s2BgFill2, B.thin, 'center', 'center', true);
        g.subjects.forEach(s => { sc(s2, s2Cur, 1, s.name+' /'+s.max, s2SubjStyle); s2Cur++; });
      });
    } else {
      const hdrs2=['Index No.','Student Name',
        ...subjects.map(s=>s.name+' /'+s.max),
        'Total','Max','Avg %','Grade','Status'];
      hdrs2.forEach((h,c)=>thdr(s2,c,0,h)); rh(s2,0,24);
    }
    // Ordered subject list for sheet 2 data rows (mirrors category-grouped header)
    const _xlOrderedSubjs2 = xlHasNamed ? xlCatGroups.flatMap(g => g.subjects) : subjects;
    results.forEach((r,ri)=>{
      const R2=(xlHasNamed ? 2 : 1)+ri; const isP=r.pct>=passPct;
      const bg=ri%2===0?L.white:L.stripe;
      const gc=(window.getGradeColor(r.grade)||'#1A56DB').replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
      const gcf=regFont(1,11,gc);
      sc(s2,0,R2,String(r.idx), xf(F.blue,bg,B.thin,'center','center'));
      sc(s2,1,R2,r.student,     xf(F.dk_md,bg,B.thin,'left','center'));
      _xlOrderedSubjs2.forEach((s,si)=>{
        const v=r.subjMarks[s.name];
        if(v===null){
          sc(s2,2+si,R2,'—',xf(F.gray,bg,B.thin,'center','center'));
        } else if(v==='AB'){
          sc(s2,2+si,R2,'AB',xf(F.red,bg,B.thin,'center','center'));
        } else {
          const sp=s.max>0?(v/s.max)*100:0;
          const s2Pm = window.getSubjectPassPct(s.name);
          sc(s2,2+si,R2,v,xf(sp>=80?F.green:sp>=s2Pm?F.blue:F.red,bg,B.thin,'center','center'),true);
        }
      });
      const bc2=2+_xlOrderedSubjs2.length;
      sc(s2,bc2,  R2,r.total,   xf(F.dk_md,bg,B.thin,'center','center'),true);
      sc(s2,bc2+1,R2,totalMax,  xf(F.gray_md,bg,B.thin,'center','center'),true);
      sc(s2,bc2+2,R2,r.pct+'%',xf(gcf,bg,B.thin,'center','center'));
      sc(s2,bc2+3,R2,r.grade,   xf(gcf,bg,B.thin,'center','center'));
      sc(s2,bc2+4,R2,isP?'PASS':'FAIL',xf(isP?F.green:F.red,isP?L.pass:L.fail,B.thin,'center','center'));
      rh(s2,R2,20);
    });
    cw(s2,0,11); cw(s2,1,24);
    _xlOrderedSubjs2.forEach((s,i)=>cw(s2,2+i,Math.max(String(s.name).length+2,13)));
    const bc2f=2+_xlOrderedSubjs2.length;
    cw(s2,bc2f,8);cw(s2,bc2f+1,8);cw(s2,bc2f+2,10);cw(s2,bc2f+3,8);cw(s2,bc2f+4,8);

    // ═══════════════════════════════════════════
    // SHEET 3 — Subject Analysis
    // ═══════════════════════════════════════════
    const s3=newSheet('Subject Analysis');
    ['Subject','Max Marks','Class Avg','Highest','Lowest','Pass Count','Pass %'].forEach((h,c)=>thdr(s3,c,0,h));
    rh(s3,0,24);
    subjects.forEach((subj,si)=>{
      const R3=si+1;
      const vals=results.map(r=>r.subjMarks[subj.name]).filter(v=>v!==null).map(v=>v??0);
      if(vals.length===0){ rh(s3,R3,20); return; }
      const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
      const passN=vals.filter(v=>subj.max>0&&(v/subj.max)*100>=window.getSubjectPassPct(subj.name)).length;
      const bg=si%2===0?L.white:L.stripe;
      const avgPct=subj.max>0?(avg/subj.max)*100:0;
      const s3Pm = window.getSubjectPassPct(subj.name);
      sc(s3,0,R3,subj.name, xf(F.dk_md,bg,B.thin,'left','center'));
      sc(s3,1,R3,subj.max,  xf(F.gray_md,bg,B.thin,'center','center'),true);
      sc(s3,2,R3,parseFloat(avg.toFixed(1)),xf(avgPct>=80?F.green:avgPct>=s3Pm?F.blue:F.red,bg,B.thin,'center','center'),true);
      sc(s3,3,R3,Math.max(...vals),xf(F.green,bg,B.thin,'center','center'),true);
      sc(s3,4,R3,Math.min(...vals),xf(F.red,bg,B.thin,'center','center'),true);
      sc(s3,5,R3,passN,            xf(F.dk_nm,bg,B.thin,'center','center'),true);
      const pp=Math.round((passN/vals.length)*100);
      sc(s3,6,R3,pp+'%',           xf(pp>=s3Pm?F.green:F.red,bg,B.thin,'center','center'));
      rh(s3,R3,20);
    });
    [22,12,12,10,10,12,10].forEach((w,c)=>cw(s3,c,w));

    // ═══════════════════════════════════════════
    // SHEET 4 — Grading Scale
    // ═══════════════════════════════════════════
    const s4=newSheet('Grading Scale');
    let R4=0;
    band(s4,R4,'Grading Scale',L.navy,F.dk_xl,28,5); R4++;
    if(cn){ band(s4,R4,'Class: '+cn,L.lgray,F.gray_md,18,5); R4++; }
    if(ay){ band(s4,R4,'Academic Year: '+ay,L.lgray,F.gray_md,18,5); R4++; }
    band(s4,R4,'Generated: '+dateStr,L.lgray,F.gray,16,5); R4++;
    R4++;
    ['Grade','Min %','Max %','Range','Pass/Fail'].forEach((h,c)=>
      sc(s4,c,R4,h,xf(F.navy_hd,L.dark2,B.thin,'center','center')));
    rh(s4,R4,22); R4++;
    sortedG.forEach((g,i)=>{
      const maxP=i===0?100:sortedG[i-1].minPct-1;
      const isP=g.minPct>=passPct;
      const gc=(g.color||'#999').replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
      const gf=regFont(1,13,gc);
      sc(s4,0,R4,g.label,     xf(gf,L.lgray,B.thin,'center','center'));
      sc(s4,1,R4,g.minPct+'%',xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s4,2,R4,maxP+'%',    xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s4,3,R4,g.minPct+'% – '+maxP+'%',xf(F.dk_nm,L.lgray,B.thin,'center','center'));
      sc(s4,4,R4,isP?'PASS':'FAIL',xf(isP?F.green:F.red,isP?L.pass:L.fail,B.thin,'center','center'));
      rh(s4,R4,20); R4++;
    });
    R4++;
    sc(s4,0,R4,'• Pass mark: '+passPct+'% and above',xf(F.gray_md,L.none,B.none,'left','center'));
    rh(s4,R4,18); R4++;
    sc(s4,0,R4,'• Grades apply from highest to lowest percentage',xf(F.gray_md,L.none,B.none,'left','center'));
    rh(s4,R4,18);
    [14,12,12,20,12].forEach((w,c)=>cw(s4,c,w));

    // ═══════════════════════════════════════════
    // SHEET 5 — Subject-wise Grades
    // ═══════════════════════════════════════════
    const s5=newSheet('Subject Grades');
    let R5=0;
    band(s5,R5,'Subject-wise Grades — '+cn+(ay?' ('+ay+')':''),L.navy,F.dk_xl,26,3+subjects.length*2+2); R5++;
    band(s5,R5,'Generated: '+dateStr,L.lgray,F.gray,16,3+subjects.length*2+2); R5++;
    R5++;
    // Ordered subject list for sheet 5 (mirrors category-grouped order)
    const _xlOrderedSubjs5 = xlHasNamed ? xlCatGroups.flatMap(g => g.subjects) : subjects;
    // Header row: Index, Student, [SubjName Grade, SubjName %, ...], Overall Grade, Overall %
    const s5Hdrs=['Index No.','Student Name',..._xlOrderedSubjs5.flatMap(s=>[s.name+' Grade',s.name+' %']),'Overall Grade','Overall %'];
    s5Hdrs.forEach((h,c)=>thdr(s5,c,R5,h));
    rh(s5,R5,24); R5++;
    results.forEach((r,ri)=>{
      const bg=ri%2===0?L.white:L.stripe;
      sc(s5,0,R5,String(r.idx),xf(F.blue,bg,B.thin,'center','center'));
      sc(s5,1,R5,r.student,xf(F.dk_md,bg,B.thin,'left','center'));
      _xlOrderedSubjs5.forEach((subj,si)=>{
        const {grade,color,pct}=window.getSubjectGradeForStudent(r,subj);
        const gc5=(color||'#999999').replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
        const gf5=regFont(1,11,gc5);
        if(pct===null){
          sc(s5,2+si*2,R5,'—',xf(F.gray,bg,B.thin,'center','center'));
          sc(s5,3+si*2,R5,'—',xf(F.gray,bg,B.thin,'center','center'));
        } else {
          sc(s5,2+si*2,R5,grade,xf(gf5,bg,B.thin,'center','center'));
          sc(s5,3+si*2,R5,pct+'%',xf(gf5,bg,B.thin,'center','center'));
        }
      });
      const tc=2+_xlOrderedSubjs5.length*2;
      const gc5o=(window.getGradeColor(r.grade)||'#999999').replace('#','').toUpperCase().slice(0,6).padEnd(6,'0');
      const gf5o=regFont(1,11,gc5o);
      sc(s5,tc,R5,r.grade,xf(gf5o,bg,B.thin,'center','center'));
      sc(s5,tc+1,R5,r.pct+'%',xf(gf5o,bg,B.thin,'center','center'));
      rh(s5,R5,20); R5++;
    });
    // Note row with pass marks
    R5++;
    _xlOrderedSubjs5.forEach((subj,si)=>{
      const pm=window.getSubjectPassPct(subj.name);
      const isC=window.subjectPassMarks[subj.name]!==undefined;
      sc(s5,0,R5,'Pass mark for '+subj.name+': '+pm+'%'+(isC?' (custom)':''),xf(F.gray_md,L.none,B.none,'left','center'));
      rh(s5,R5,16); R5++;
    });
    cw(s5,0,11); cw(s5,1,24);
    _xlOrderedSubjs5.forEach((_,i)=>{cw(s5,2+i*2,12);cw(s5,3+i*2,10);});
    cw(s5,2+_xlOrderedSubjs5.length*2,12);cw(s5,3+_xlOrderedSubjs5.length*2,10);

    // ═══════════════════════════════════════════
    // SERIALIZE TO OOXML
    // ═══════════════════════════════════════════
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Shared string table — collect ALL strings first
    const SST=[]; const SSTM={};
    function ss(str){ const k=String(str); if(SSTM[k]===undefined){SSTM[k]=SST.length;SST.push(k);} return SSTM[k]; }
    // Pre-scan all sheets to register strings in order
    [s1,s2,s3,s4,s5].forEach(sh=>sh.rows.forEach(row=>{if(row)row.forEach(cell=>{if(cell&&!cell.n)ss(String(cell.v===undefined?'':cell.v));});}));

    function xmlFonts(){
      return '<fonts count="'+FONTS.length+'">'+FONTS.map(f=>
        '<font>'+(f.bold?'<b/>':'')+
        '<sz val="'+f.sz+'"/>'+
        '<color rgb="FF'+f.rgb+'"/>'+
        '<name val="Calibri"/>'+
        '</font>').join('')+'</fonts>';
    }
    function xmlFills(){
      return '<fills count="'+FILLS.length+'">'+FILLS.map(f=>
        !f||f.type==='none'?'<fill><patternFill patternType="none"/></fill>':
        f.type==='gray125'?'<fill><patternFill patternType="gray125"/></fill>':
        '<fill><patternFill patternType="solid"><fgColor rgb="FF'+f.rgb+'"/><bgColor indexed="64"/></patternFill></fill>'
      ).join('')+'</fills>';
    }
    function xmlBorders(){
      return '<borders count="'+BORDERS.length+'">'+BORDERS.map(b=>{
        if(b==='none') return '<border><left/><right/><top/><bottom/><diagonal/></border>';
        const sid=' style="'+b+'"><color rgb="FFCBD5E1"/><'; 
        return '<border><left'+sid+'/left><right'+sid+'/right><top'+sid+'/top><bottom'+sid+'/bottom><diagonal/></border>';
      }).join('')+'</borders>';
    }
    function xmlXfs(){
      return '<cellXfs>'+XFS.map(x=>
        '<xf numFmtId="0" fontId="'+x.fi+'" fillId="'+x.li+'" borderId="'+x.bi+
        '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'+
        '<alignment horizontal="'+x.h+'" vertical="'+x.v+'"'+(x.wrap?' wrapText="1"':'')+'/>'+
        '</xf>').join('')+'</cellXfs>';
    }
    function xmlStyles(){
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
        xmlFonts()+xmlFills()+xmlBorders()+
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
        xmlXfs()+
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
        '</styleSheet>';
    }
    function xmlSST(){
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'+SST.length+'" uniqueCount="'+SST.length+'">'+
        SST.map(s=>'<si><t xml:space="preserve">'+esc(s)+'</t></si>').join('')+'</sst>';
    }
    function colLetter(n){ let s=''; n++; while(n>0){s=String.fromCharCode(64+(n%26||26))+s;n=Math.floor((n-1)/26);} return s; }
    function sheetXml(sh){
      let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if(sh.colW.some(Boolean)){
        xml+='<cols>';
        sh.colW.forEach((w,i)=>{ if(w) xml+=`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`; });
        xml+='</cols>';
      }
      xml+='<sheetData>';
      sh.rows.forEach((row,ri)=>{
        if(!row||!row.length) return;
        const ht=sh.rowH[ri]?` ht="${sh.rowH[ri]}" customHeight="1"`:'';
        xml+=`<row r="${ri+1}"${ht}>`;
        row.forEach((cell,ci)=>{
          if(!cell&&cell!==0) return;
          const addr=colLetter(ci)+(ri+1);
          const s=cell.xf||0;
          const v=cell.v===undefined||cell.v===null?'':cell.v;
          if(cell.n && v!=='' && !isNaN(Number(v))){
            xml+=`<c r="${addr}" s="${s}" t="n"><v>${v}</v></c>`;
          } else {
            const idx=SSTM[String(v)]!==undefined?SSTM[String(v)]:ss(String(v));
            xml+=`<c r="${addr}" s="${s}" t="s"><v>${idx}</v></c>`;
          }
        });
        xml+='</row>';
      });
      xml+='</sheetData>';
      if(sh.merges.length){
        xml+='<mergeCells count="'+sh.merges.length+'">'+
          sh.merges.map(m=>`<mergeCell ref="${colLetter(m.c1)}${m.r1+1}:${colLetter(m.c2)}${m.r2+1}"/>`).join('')+
          '</mergeCells>';
      }
      xml+='</worksheet>';
      return xml;
    }

    // ── PACK INTO ZIP ────────────────────────────
    const sheets=[s1,s2,s3,s4,s5];
    const zip=new JSZip();

    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'+
      '</Types>');

    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
      '</Relationships>');

    zip.file('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
      '<sheets>'+sheets.map((s,i)=>'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+2)+'"/>').join('')+'</sheets>'+
      '</workbook>');

    zip.file('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      sheets.map((_,i)=>'<Relationship Id="rId'+(i+2)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'+
      '</Relationships>');

    zip.file('xl/styles.xml', xmlStyles());
    zip.file('xl/sharedStrings.xml', xmlSST());
    sheets.forEach((sh,i)=>zip.file('xl/worksheets/sheet'+(i+1)+'.xml', sheetXml(sh)));

    // Generate with correct Excel MIME type — critical for Android to recognise as .xlsx not ZIP
    const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: XLSX_MIME,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Wrap in correctly-typed blob (some browsers ignore mimeType in generateAsync)
    const typedBlob = new Blob([blob], { type: XLSX_MIME });
    const fileName = cn.replace(/\s+/g,'_') + '_Results.xlsx';

    // Android Chrome: use native share if available (saves directly to Files as .xlsx)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([typedBlob], fileName, { type: XLSX_MIME })] })) {
      const file = new File([typedBlob], fileName, { type: XLSX_MIME });
      try {
        await navigator.share({ files: [file], title: cn + ' Results' });
        window.toast('Excel shared successfully!', 'success');
        return;
      } catch(shareErr) {
        // User cancelled share or it failed — fall through to direct download
        if (shareErr.name === 'AbortError') { window.toast('Share cancelled', 'info'); return; }
      }
    }

    // Standard download via anchor (works on PC and most Android browsers)
    const url = URL.createObjectURL(typedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    window.toast('Excel downloaded successfully!', 'success');
    if (typeof onExportComplete === 'function') window.onExportComplete();
  } catch(err) {
    console.error('Excel export error:', err);
    window.toast('Export error: '+err.message,'error');
  }
}

// ── Backfill the mobile card view on viewport resize ──
// renderResultsTable() only builds the card list when it's already visible
// (≤600px) to avoid duplicate work on desktop. If the viewport is resized
// down to mobile afterwards (e.g. rotating a tablet) and results exist but
// the card view is still empty, fill it in then.
(function () {
  let _resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      const container = document.getElementById('resultsCardView');
      if (!container || !results.length) return;
      if (window.matchMedia('(max-width: 600px)').matches && !container.innerHTML.trim()) {
        renderResultsCards();
      }
    }, 150);
  });
})();

// ── Window exports ──
Object.assign(window, {
  applyResultsFilter,
  buildAndDownloadXlsx,
  clearResultsFilter,
  computeResults,
  downloadExcel,
  downloadExcelFiltered,
  renderResultsCards,
  renderResultsTable
});
