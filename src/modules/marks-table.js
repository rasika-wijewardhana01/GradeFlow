// ═══════════════════════════════════════════════════════════════
//  src/modules/marks-table.js
//  Marks table and card renderers, elective lock logic,
//  setMark / setMarkCard, validateMark, updateRowTotal,
//  fillSampleData, refreshAllElectiveLocks.
//
//  CRITICAL: renderMarksTable() updates _navColOrder / _navSjToVcol
//  (window globals from state.js) so keyboard-nav.js stays in sync.
// ═══════════════════════════════════════════════════════════════
function renderMarksTable() {
  const empty = document.getElementById('marks-empty');
  const content = document.getElementById('marks-content');
  if (!students.length || !subjects.length) {
    empty.style.display = '';
    content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = '';
  // Desktop table
  const table = document.getElementById('marksTable');

  // ── Grouped category header (same palette as results table) ──
  const _mCatColorPalette = window._getTablePalette();
  const _mCatGroups = [];
  // Build a merged category key order: declared categories[] first, then any
  // category names found on subjects that aren't in the categories array.
  // This ensures groups are always visible even if a category was removed from
  // the list but subjects still carry its name, or if data was loaded from backup.
  const _mDeclaredCatNames = window.categories.map(c => c.name);
  const _mSubjectCatNames  = [...new Set(subjects.map(s => s.category).filter(c => c && c !== ''))];
  const _mAllCatKeys = [...new Set([..._mDeclaredCatNames, ..._mSubjectCatNames]), '__none__'];
  _mAllCatKeys.forEach((catKey, ci) => {
    const subjs = subjects.filter(s => (s.category || '__none__') === catKey);
    if (!subjs.length) return;
    const mandatory = catKey === '__none__' ? true : window.isCatMandatory(catKey);
    const label = catKey === '__none__' ? '' : catKey;
    const namedIdx = _mDeclaredCatNames.indexOf(catKey);
    const colorIdx = namedIdx >= 0 ? namedIdx % _mCatColorPalette.length : ci % _mCatColorPalette.length;
    _mCatGroups.push({ label, mandatory, subjects: subjs, color: _mCatColorPalette[colorIdx] });
  });
  const _mHasNamed = _mCatGroups.some(g => g.label !== '');

  let html = `<thead>`;
  if (_mHasNamed) {
    html += `<tr>
      <th rowspan="2" class="col-frozen-idx" style="width:58px;text-align:center;vertical-align:middle;white-space:nowrap;">Index</th>
      <th rowspan="2" class="col-frozen-name" style="min-width:150px;white-space:nowrap;vertical-align:middle;">Student name</th>`;
    _mCatGroups.forEach(g => {
      if (g.label === '') {
        g.subjects.forEach(() => { html += `<th style="text-align:center;background:${window._thBgFallback()};border-bottom:1px solid var(--border);"></th>`; });
      } else {
        const badge = g.mandatory
          ? `<span style="font-size:9px;font-weight:700;background:${g.color.fg}22;color:${g.color.fg};border-radius:3px;padding:1px 5px;letter-spacing:0;text-transform:none;margin-left:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>Mandatory</span>`
          : `<span style="font-size:9px;font-weight:700;background:${g.color.fg}22;color:${g.color.fg};border-radius:3px;padding:1px 5px;letter-spacing:0;text-transform:none;margin-left:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>Elective</span>`;
        html += `<th colspan="${g.subjects.length}" style="text-align:center;background:${g.color.bg};color:${g.color.fg};border:1.5px solid ${g.color.border};border-bottom:2.5px solid ${g.color.fg};font-size:11px;font-weight:800;letter-spacing:0.06em;padding:7px 6px 5px;">${g.label.toUpperCase()}${badge}</th>`;
      }
    });
    html += `<th rowspan="2" style="text-align:center;vertical-align:middle;">Total<br><span style="font-weight:400;font-size:10px;color:var(--text-light);">/${window.getGlobalMax()} max</span></th></tr>`;
    html += `<tr>`;
    _mCatGroups.forEach(g => {
      g.subjects.forEach(s => {
        const borderTop = g.label !== '' ? `border-top:2px solid ${g.color.fg};` : '';
        html += `<th style="text-align:center;background:${g.label !== '' ? g.color.bg : window._thBgSubFallback()};${borderTop}font-size:11px;padding:5px 4px;">${s.name}<br><span style="font-weight:400;font-size:10px;color:${g.label !== '' ? g.color.fg : 'var(--text-light)'};text-transform:none;letter-spacing:0;">max ${s.max}</span><br><span style="font-size:9px;font-weight:700;color:${window.subjectPassMarks[s.name]!==undefined?'var(--accent)':'var(--text-light)'};">pass ${window.getSubjectPassPct(s.name)}%${window.subjectPassMarks[s.name]!==undefined?' ★':''}</span></th>`;
      });
    });
    html += `</tr>`;
  } else {
    html += `<tr>
      <th class="col-frozen-idx" style="width:52px;text-align:center;">Index</th>
      <th class="col-frozen-name" style="min-width:150px;white-space:nowrap;">Student name</th>`;
    subjects.forEach(s => {
      const pm = window.getSubjectPassPct(s.name);
      const isCustomPm = window.subjectPassMarks[s.name] !== undefined;
      html += `<th style="text-align:center;">${s.name}<br><span style="font-weight:400;font-size:10px;color:var(--text-light);">max ${s.max}</span><br><span style="font-size:9px;font-weight:700;color:${isCustomPm?'var(--accent)':'var(--text-light)'};">pass ${pm}%${isCustomPm?' ★':''}</span></th>`;
    });
    html += `<th style="text-align:center;">Total<br><span style="font-weight:400;font-size:10px;color:var(--text-light);">/${window.getGlobalMax()} max</span></th></tr>`;
  }
  html += `</thead><tbody>`;
  // ── IMPORTANT: render tbody columns in the SAME grouped-category order as thead.
  // Previously subjects.forEach() used plain array order, which differed from the
  // category-grouped header order → header labels were misaligned with data cells,
  // and elective locking applied to the wrong visual columns.
  // Build an ordered subject list that mirrors _mCatGroups (category order, then uncategorised).
  const _orderedSubjs = _mHasNamed
    ? _mCatGroups.flatMap(g => g.subjects)
    : subjects;

  // ── Expose visual column order for keyboard navigation ──
  // _navColOrder[vcol] = sj  (subjects[] index for that visual column position)
  // _navSjToVcol[sj]  = vcol (reverse lookup)
  // Navigation code (ArrowLeft/Right/Tab) uses visual column indices so that
  // moving right from the last category subject reaches the first no-group subject,
  // and moving left from the first no-group subject reaches the last category subject.
  _navColOrder = _orderedSubjs.map(subj => subjects.indexOf(subj));
  _navSjToVcol = {};
  _navColOrder.forEach((sj, vcol) => { _navSjToVcol[sj] = vcol; });

  students.forEach((student, si) => {
    const rowBg = si % 2 === 1 ? window._rowAltBg() : '';
    html += `<tr data-si="${si}" style="${rowBg}">
      <td class="col-frozen-idx" style="text-align:center;font-size:12px;font-weight:700;color:var(--primary);background:var(--primary-light);">${student.idx}</td>
      <td class="col-frozen-name student-name" style="font-weight:600;white-space:nowrap;">${student.name}</td>`;
    _orderedSubjs.forEach(subj => {
      // data-sj MUST stay as the subjects[] array index so all lookup code
      // (setMarkByIndex, markNavKey, refreshElectiveLocks_desktop, etc.) stays correct.
      const sj = subjects.indexOf(subj);
      const key = `${student.name}||${subj.name}`;
      const rawVal = marks[key];
      const val = rawVal !== undefined && rawVal !== '' ? rawVal : '';
      const isAbsent = val === 'AB';
      // Find this subject's group color for subtle body cell tinting
      const _cellGrp = _mCatGroups.find(g => g.subjects.includes(subj));
      const _cellBg = (_cellGrp && _cellGrp.label !== '') ? `background:${_cellGrp.color.bg};` : '';

      if (isAbsent) {
        // Absent cell: show badge, hide input via CSS.
        // The badge is focusable (tabindex="0") so keyboard nav can land on it
        // and the onkeydown handler lets the user continue navigating away from it.
        html += `<td class="absent-cell" style="text-align:center;position:relative;padding:6px 4px;">
          <input class="mark-input absent-input" type="number" min="0" max="${subj.max}" step="1"
            value="" placeholder="AB"
            data-si="${si}" data-sj="${sj}"
            inputmode="numeric"
            tabindex="-1"
            aria-hidden="true"
            onkeydown="window.absentBadgeNavKey(event,${si},${sj})"
          />
          <div class="absent-badge" tabindex="0" role="button"
            title="Absent — press A to clear, or use arrow keys to navigate"
            onclick="window.toggleAbsent(${si},${sj})"
            onkeydown="window.absentBadgeNavKey(event,${si},${sj})"
            onfocus="window.absentBadgeFocused(this,${si},${sj})"
            data-si="${si}" data-sj="${sj}">
            <span class="ab-label">AB</span>
            <span class="ab-hint">absent</span>
          </div>
        </td>`;
      } else {
        html += `<td style="text-align:center;${_cellBg}">
          <input class="mark-input" type="number" min="0" max="${subj.max}" step="1"
            value="${val}" placeholder="—"
            data-si="${si}" data-sj="${sj}"
            inputmode="numeric"
            oninput="setMarkByIndex(this)"
            onblur="validateMark(this,${subj.max})"
            onkeydown="window.markNavKey(event,this)"
            onfocus="window.markInputFocused(this)"
          />
        </td>`;
      }
    });
    html += `<td style="text-align:center;font-weight:700;color:var(--primary);" id="row-total-${si}">—</td>`;
    html += `</tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;
  students.forEach((_, i) => updateRowTotal(i));
  // ── Fix frozen column alignment ──
  // The Student Name column's sticky `left` must exactly equal the rendered
  // width of the Index column. Hardcoded px values drift when padding/fonts
  // change; measure the real width after paint and apply via CSS custom property.
  // Double-rAF: first frame commits layout after display:none→block transition;
  // second frame reads accurate getBoundingClientRect() values.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const wrap = table.closest('.marks-table-wrap');

    // ── Fix 1: frozen name column left offset ──
    const idxCell = table.querySelector('.col-frozen-idx');
    if (idxCell && wrap) {
      const idxW = idxCell.getBoundingClientRect().width;
      if (idxW > 0) wrap.style.setProperty('--frozen-name-left', idxW + 'px');
    }

    // ── Fix 2: two-row sticky header — set correct top offset per row ──
    const theadRows = table.querySelectorAll('thead tr');
    if (theadRows.length === 2) {
      const row1H = theadRows[0].getBoundingClientRect().height;
      theadRows[0].querySelectorAll('th').forEach(th => { th.style.top = '0px'; });
      theadRows[1].querySelectorAll('th').forEach(th => { th.style.top = row1H + 'px'; });
    } else if (theadRows.length === 1) {
      theadRows[0].querySelectorAll('th').forEach(th => { th.style.top = '0px'; });
    }

    // ── Fix 3: deepen shadow on name column when scrolled right ──
    if (wrap) {
      const updateShadow = () => {
        const deep = wrap.scrollLeft > 4;
        table.querySelectorAll('.col-frozen-name').forEach(cell => {
          cell.style.boxShadow = deep
            ? '4px 0 14px rgba(0,0,0,0.18)'
            : '2px 0 6px rgba(0,0,0,0.07)';
        });
      };
      if (wrap._frozenShadowHandler) wrap.removeEventListener('scroll', wrap._frozenShadowHandler);
      wrap._frozenShadowHandler = updateShadow;
      wrap.addEventListener('scroll', updateShadow, { passive: true });
      updateShadow();
    }
  }));
  // Mobile cards
  renderMarksCards();
  window.updateGradeCurrentBadge();
  // Apply elective locks to all rows (reflects existing marks data)
  window._activeRowSi = null; // reset active row — all rows start quiet after re-render
  students.forEach((_, i) => {
    refreshAllElectiveLocks(i);
    window._setRowQuiet(i); // start quiet; indicators appear when user focuses the row
  });
}

// ── Mobile card quiet mode helpers ──
function _setCardQuiet(si) {
  const card = document.querySelector(`#marksCardView .mark-student-card[data-si="${si}"]`);
  if (card) card.classList.add('elective-card-quiet');
}
function _setCardActive(si) {
  const card = document.querySelector(`#marksCardView .mark-student-card[data-si="${si}"]`);
  if (card) card.classList.remove('elective-card-quiet');
}

let _activeCardSi = null;

function markCardInputFocused(el) {
  // Don't allow focus on locked elective inputs
  if (el.classList.contains('elective-locked') || el.disabled) {
    el.blur();
    return;
  }
  const si = parseInt(el.dataset.si);
  if (_activeCardSi !== null && _activeCardSi !== si) {
    _setCardQuiet(_activeCardSi);
  }
  if (_activeCardSi !== si) {
    _setCardActive(si);
    _activeCardSi = si;
  }
  // Keep _mntEl in sync so toolbar ▶ ◀ ▲ ▼ buttons work when card input is focused
  window._mntEl = el;
  window._mntActive = true;
  window._mntVal = el.value !== '' ? String(parseFloat(el.value) || '') : '';
}

function renderMarksCards() {
  const container = document.getElementById('marksCardView');
  if (!container) return;
  container.innerHTML = students.map((student, si) => {
    const subjectRows = subjects.map(subj => {
      const key = `${student.name}||${subj.name}`;
      const rawVal = marks[key];
      const val = rawVal !== undefined && rawVal !== '' ? rawVal : '';
      const isAbsent = val === 'AB';
      const elective = subj.category && !window.isCatMandatory(subj.category);
      const electiveNote = elective ? `<span style="font-size:10px;color:var(--primary);font-weight:600;margin-left:4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>elective</span><span class="elective-lock-icon" style="display:none;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="vertical-align:middle;opacity:0.7"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>` : '';

      if (isAbsent) {
        return `<div class="mark-subject-row absent-row">
          <span class="mark-subject-name">${subj.name}${electiveNote}</span>
          <span class="mark-subject-max">/ ${subj.max}</span>
          <input class="mark-subject-input absent-input-card" type="text" value="AB" readonly
            data-si="${si}" data-sj="${subjects.indexOf(subj)}"
            tabindex="-1" aria-hidden="true"
          />
          <button class="absent-toggle-btn-mobile" onclick="window.toggleAbsent(${si},${subjects.indexOf(subj)})">× clear absent</button>
        </div>`;
      }

      return `<div class="mark-subject-row">
        <span class="mark-subject-name">${subj.name}${electiveNote}</span>
        <span class="mark-subject-max">/ ${subj.max}</span>
        <input class="mark-subject-input" type="text" inputmode="numeric"
          enterkeyhint="next"
          data-max="${subj.max}" value="${val}" placeholder="${elective ? 'skip/0' : '0'}"
          data-si="${si}" data-sj="${subjects.indexOf(subj)}"
          oninput="window.filterCardNumericInput(this)"
          onfocus="markCardInputFocused(this)"
          onkeydown="window.markCardNavKey(event,this)"
        />
      </div>`;
    }).join('');
    const { total, max: studentMax } = window.calcStudentTotalAndMax(student.name);
    return `<div class="mark-student-card elective-card-quiet" data-si="${si}">
      <div class="mark-student-card-header">
        <span class="s-idx">#${student.idx}</span>
        <span class="s-name">${student.name}</span>
        <span class="s-total" id="card-total-${si}">${total > 0 ? `${total}/${studentMax}` : '—'}</span>
      </div>
      <div class="mark-subject-rows">${subjectRows}</div>
    </div>`;
  }).join('');
  // Apply locks; all cards start quiet
  _activeCardSi = null;
  students.forEach((_, i) => refreshAllElectiveLocks(i));
}

// ── Index-based wrappers (safe: avoids injecting names into HTML attributes) ──
function setMarkByIndex(el) {
  const si = parseInt(el.dataset.si);
  const sj = parseInt(el.dataset.sj);
  const student = students[si];
  const subj = subjects[sj];
  if (!student || !subj) return;
  setMark(student.name, subj.name, el.value, subj.max, el, si);
}

function setMarkCardByIndex(el) {
  const si = parseInt(el.dataset.si);
  const sj = parseInt(el.dataset.sj);
  const student = students[si];
  const subj = subjects[sj];
  if (!student || !subj) return;
  setMarkCard(student.name, subj.name, el.value, subj.max, el, si);
}

function setMarkCard(studentName, subj, val, max, el, si) {
  const key = `${studentName}||${subj}`;
  const num = val === '' ? '' : parseFloat(val);
  marks[key] = num;
  el.classList.toggle('over-max', num !== '' && num > max);
  // Update card total
  const { total, max: studentMax } = window.calcStudentTotalAndMax(studentName);
  const cell = document.getElementById(`card-total-${si}`);
  if (cell) cell.textContent = total > 0 ? `${total}/${studentMax}` : '—';
  // Sync desktop table cell too
  updateRowTotal(si);
  // Lock/unlock sibling elective inputs in the same category
  const subjObj = subjects.find(s => s.name === subj);
  if (subjObj && subjObj.category && !window.isCatMandatory(subjObj.category)) {
    refreshElectiveLocks_desktop(si, subjObj.category);
    refreshElectiveLocks_mobile(si, subjObj.category);
  }
}

function calcStudentTotal(name) {
  return window.calcStudentTotalAndMax(name).total;
}

function setMark(studentName, subj, val, max, el, si) {
  const key = `${studentName}||${subj}`;
  const num = val === '' ? '' : parseFloat(val);
  marks[key] = num;
  el.classList.toggle('over-max', num !== '' && num > max);
  updateRowTotal(si);
  // Lock/unlock sibling elective inputs in the same category (desktop table)
  const subjObj = subjects.find(s => s.name === subj);
  if (subjObj && subjObj.category && !window.isCatMandatory(subjObj.category)) {
    refreshElectiveLocks_desktop(si, subjObj.category);
    refreshElectiveLocks_mobile(si, subjObj.category);
  }
}

// ── Toggle Absent (AB sentinel) for a student/subject cell ──
// Works for both desktop table and mobile card.
// Absent = "AB" string sentinel in marks[].
// Calling again clears the absent state (returns to blank/not-entered).
function toggleAbsent(si, sj) {
  const student = students[si];
  const subj = subjects[sj];
  if (!student || !subj) return;
  const key = `${student.name}||${subj.name}`;
  const current = marks[key];
  const wasAbsent = current === 'AB';

  // Take undo snapshot before change
  if (typeof window._takeSnapshot === 'function') {
    window._takeSnapshot(
      wasAbsent ? `Clear absent: ${student.name} / ${subj.name}` : `Mark absent: ${student.name} / ${subj.name}`,
      '🚫'
    );
  }

  if (wasAbsent) {
    // Un-absent: clear the mark
    marks[key] = '';
  } else {
    // Mark absent: clear any existing mark and set sentinel
    marks[key] = 'AB';
  }

  // Re-render so elective locks and totals stay consistent
  window.renderMarksTable();
  if (typeof window._refreshUndoUI === 'function') window._refreshUndoUI();

  // ── Restore keyboard focus after re-render ──
  // renderMarksTable() destroys and recreates all DOM elements, so the
  // previously focused element is gone. Re-focus intelligently:
  //   • Un-absented → focus the now-restored normal input at [si, sj]
  //   • Just marked absent → focus the absent-badge at [si, sj] so the
  //     user can keep navigating with arrow keys without reaching for the mouse
  requestAnimationFrame(() => {
    if (wasAbsent) {
      // Cell was cleared — focus the restored normal input
      const inp = document.querySelector(`.mark-input[data-si="${si}"][data-sj="${sj}"]`);
      if (inp && !inp.disabled && !inp.classList.contains('elective-locked') && !inp.classList.contains('absent-input')) {
        inp.focus();
        inp.select();
        if (typeof window.markInputFocused === 'function') window.markInputFocused(inp);
      }
    } else {
      // Cell was just marked absent — focus the badge so arrow keys still work
      const badge = document.querySelector(`.absent-badge[data-si="${si}"][data-sj="${sj}"]`);
      if (badge) {
        badge.focus();
        if (typeof window.absentBadgeFocused === 'function') window.absentBadgeFocused(badge, si, sj);
      }
    }
  });
}

// ── Bulk-absent: mark all students absent for a subject column ──
function bulkMarkAbsent(sj) {
  const subj = subjects[sj];
  if (!subj) return;
  if (typeof window._takeSnapshot === 'function') {
    window._takeSnapshot(`Mark all absent: ${subj.name}`, '🚫');
  }
  students.forEach(student => {
    marks[`${student.name}||${subj.name}`] = 'AB';
  });
  window.renderMarksTable();
  if (typeof window._refreshUndoUI === 'function') window._refreshUndoUI();
}

// ── Elective locking: desktop table ──
// After any mark is entered in an elective category, lock the other subjects in
// that category for this student row.
function refreshElectiveLocks_desktop(si, catName) {
  const student = students[si];
  if (!student) return;
  // Guard: catName must be a non-empty string that belongs to an actual elective
  // category. An empty/falsy catName would match ALL uncategorised subjects
  // (s.category === '') which is wrong — uncategorised subjects are always mandatory.
  if (!catName || window.isCatMandatory(catName)) return;
  // Find all subjects in this elective category
  const catSubjs = subjects.filter(s => s.category === catName);
  // Find which subject(s) have a mark entered for this student.
  // 'AB' (absent) counts as a valid chosen value — the student is assigned to
  // this elective subject slot, so all other siblings must still be locked.
  const chosenSubjNames = catSubjs
    .filter(s => {
      const v = marks[`${student.name}||${s.name}`];
      if (v === undefined || v === '') return false;
      if (v === 'AB') return true;                    // ← FIX: AB counts as chosen
      return !isNaN(parseFloat(v));
    })
    .map(s => s.name);

  catSubjs.forEach(s => {
    const sj = subjects.indexOf(s);
    // Find the input in the table: data-si and data-sj attributes.
    // For AB cells this is the hidden absent-input; we still use it to reach
    // the td and to apply classes — the badge overlay handles visual state.
    const inp = document.querySelector(`#marksTable input[data-si="${si}"][data-sj="${sj}"]`);
    if (!inp) return;
    const td = inp.closest('td');
    const isAbsentChosen = marks[`${student.name}||${s.name}`] === 'AB';
    const isChosen = chosenSubjNames.includes(s.name);
    const isLocked = chosenSubjNames.length > 0 && !isChosen;
    inp.classList.toggle('elective-locked', isLocked);
    inp.classList.toggle('elective-chosen', isChosen);
    if (td) td.classList.toggle('elective-locked-cell', isLocked);
    // Only disable the real (non-absent) input — absent-input is already
    // aria-hidden and tabindex=-1; disabling it has no effect but is harmless.
    inp.disabled = isLocked;
    // Remove any existing unlock button / lock label
    const existingBtn = td ? td.querySelector('.elective-unlock-btn') : null;
    if (existingBtn) existingBtn.remove();
    const existingLbl = td ? td.querySelector('.elective-lock-lbl') : null;
    if (existingLbl) existingLbl.remove();

    if (isLocked) {
      inp.title = `Locked — student chose a different subject in the "${catName}" group`;
      inp.placeholder = '';
      if (td) {
        const lbl = document.createElement('div');
        lbl.className = 'elective-lock-lbl';
        lbl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="vertical-align:middle;opacity:0.7"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
        td.appendChild(lbl);
      }
    } else if (isChosen) {
      if (isAbsentChosen) {
        // The chosen cell is an AB cell — the badge already shows "AB / absent".
        // Wire a "× clear absent" button onto the td so the teacher can un-assign.
        if (td) {
          const btn = document.createElement('button');
          btn.className = 'elective-unlock-btn';
          btn.title = 'Clear absent mark and unlock other subjects in this group';
          btn.textContent = '× clear';
          btn.onclick = (e) => {
            e.stopPropagation();
            const sj2 = parseInt(inp.dataset.sj);
            window.toggleAbsent(si, sj2);   // toggleAbsent clears AB and re-renders
          };
          td.appendChild(btn);
        }
      } else {
        inp.title = `Chosen elective (${catName}) — clear to unlock others`;
        // Add a small "× clear" button so teacher can easily unlock
        if (td) {
          const btn = document.createElement('button');
          btn.className = 'elective-unlock-btn';
          btn.title = 'Clear this mark and unlock other subjects in this group';
          btn.textContent = '× clear';
          btn.onclick = (e) => {
            e.stopPropagation();
            inp.value = '';
            setMarkByIndex(inp);
          };
          td.appendChild(btn);
        }
      }
    } else {
      inp.title = '';
      inp.placeholder = '—';
    }
  });
}

// ── Elective locking: mobile card ──
function refreshElectiveLocks_mobile(si, catName) {
  const student = students[si];
  if (!student) return;
  // Same guard as desktop: must be a real, non-mandatory elective category name.
  if (!catName || window.isCatMandatory(catName)) return;
  const catSubjs = subjects.filter(s => s.category === catName);
  // 'AB' (absent) counts as a valid chosen value — same rule as desktop.
  const chosenSubjNames = catSubjs
    .filter(s => {
      const v = marks[`${student.name}||${s.name}`];
      if (v === undefined || v === '') return false;
      if (v === 'AB') return true;                    // ← FIX: AB counts as chosen
      return !isNaN(parseFloat(v));
    })
    .map(s => s.name);

  catSubjs.forEach(s => {
    const sj = subjects.indexOf(s);
    const inp = document.querySelector(`#marksCardView input[data-si="${si}"][data-sj="${sj}"]`);
    if (!inp) return;
    const row = inp.closest('.mark-subject-row');
    const isAbsentChosen = marks[`${student.name}||${s.name}`] === 'AB';
    const isChosen = chosenSubjNames.includes(s.name);
    const isLocked = chosenSubjNames.length > 0 && !isChosen;
    inp.classList.toggle('elective-locked', isLocked);
    inp.classList.toggle('elective-chosen', isChosen);
    if (row) row.classList.toggle('elective-locked-row', isLocked);
    inp.disabled = isLocked;
    // Update the lock icon in the row label
    const lockIcon = row ? row.querySelector('.elective-lock-icon') : null;
    if (lockIcon) lockIcon.style.display = isLocked ? 'inline' : 'none';
    // Remove existing clear button
    const existingClear = row ? row.querySelector('.elective-clear-btn-mobile') : null;
    if (existingClear) existingClear.remove();

    if (isLocked) {
      inp.placeholder = 'locked';
      inp.title = `Locked — student chose a different subject in the "${catName}" group`;
    } else if (isChosen) {
      inp.placeholder = '';
      inp.title = `Chosen elective — clear to unlock others`;
      // Add clear button; for AB rows call toggleAbsent to clear the sentinel
      if (row) {
        const btn = document.createElement('button');
        btn.className = 'elective-clear-btn-mobile';
        btn.textContent = '× clear';
        btn.onclick = (e) => {
          e.stopPropagation();
          if (isAbsentChosen) {
            window.toggleAbsent(si, parseInt(inp.dataset.sj));
          } else {
            inp.value = '';
            setMarkCardByIndex(inp);
          }
        };
        row.appendChild(btn);
      }
    } else {
      inp.placeholder = 'skip/0';
      inp.title = '';
    }
  });
}

// ── Re-apply all elective locks for a given student row ──
function refreshAllElectiveLocks(si) {
  const student = students[si];
  if (!student) return;
  // Find all elective categories that have subjects
  const elCats = [...new Set(
    subjects
      .filter(s => s.category && !window.isCatMandatory(s.category))
      .map(s => s.category)
  )];
  elCats.forEach(cat => {
    refreshElectiveLocks_desktop(si, cat);
    refreshElectiveLocks_mobile(si, cat);
  });
}

function validateMark(el, max) {
  if (!el || el.classList.contains('absent-input')) return; // skip hidden absent inputs
  const val = parseFloat(el.value);
  if (!isNaN(val) && val > max) {
    el.value = max;
    el.classList.remove('over-max');
    window.toast(`Capped to max ${max}`, 'error');
  }
}

function updateRowTotal(si) {
  const student = students[si];
  const { total, max } = window.calcStudentTotalAndMax(student.name);
  const cell = document.getElementById(`row-total-${si}`);
  if (cell) {
    cell.textContent = parseFloat(total.toFixed(1));
    cell.title = `Out of ${max}`;
  }
}

function fillSampleData() {
  // Group subjects by category
  const groups = {};
  subjects.forEach(s => {
    const cat = s.category || '__none__';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });

  students.forEach(student => {
    Object.entries(groups).forEach(([cat, subjs]) => {
      const catName = cat === '__none__' ? '' : cat;
      const mandatory = window.isCatMandatory(catName);

      if (mandatory) {
        // All subjects count — fill marks for all
        subjs.forEach(subj => {
          const key = `${student.name}||${subj.name}`;
          marks[key] = Math.round(subj.max * (0.42 + Math.random() * 0.58) * 2) / 2;
        });
      } else {
        // Elective — pick one random subject, leave the rest blank
        const chosen = subjs[Math.floor(Math.random() * subjs.length)];
        subjs.forEach(subj => {
          const key = `${student.name}||${subj.name}`;
          if (subj.name === chosen.name) {
            marks[key] = Math.round(subj.max * (0.42 + Math.random() * 0.58) * 2) / 2;
          } else {
            marks[key] = ''; // leave blank — student didn't choose this one
          }
        });
      }
    });
  });
  renderMarksTable();
  window.toast('Sample marks filled in (elective subjects: one chosen per student per category)');
}


// ── Window exports ──
Object.assign(window, {
  bulkMarkAbsent,
  calcStudentTotal,
  fillSampleData,
  markCardInputFocused,
  refreshAllElectiveLocks,
  refreshElectiveLocks_desktop,
  refreshElectiveLocks_mobile,
  renderMarksCards,
  renderMarksTable,
  setMark,
  setMarkByIndex,
  setMarkCard,
  setMarkCardByIndex,
  toggleAbsent,
  updateRowTotal,
  validateMark
});
