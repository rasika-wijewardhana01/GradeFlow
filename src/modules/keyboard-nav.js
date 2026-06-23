// ═══════════════════════════════════════════════════════════════
//  src/modules/keyboard-nav.js
//  Visual-column-aware keyboard navigation for the marks table.
//  This is the module that contains the root-cause fix for the
//  column-navigation bug — keeping it isolated here means any
//  future nav regression is immediately locatable.
//
//  Also contains: mobile toolbar (MNT) digit-pad, mntNextSubject,
//  mntPrevStudent etc, markCardNavKey, markNavKey.
// ═══════════════════════════════════════════════════════════════
// ── Keyboard navigation state (shared via window.* for marks-table.js) ──
let _kbActive            = null;  // currently focused mark-input element
let _snapScrollOnNextFocus = false; // reset scrollLeft when row-wrapping
let _activeRowSi         = null;  // currently active student row index

// Expose with getter/setter so marks-table.js can reset _activeRowSi on re-render
Object.defineProperty(window, '_activeRowSi', {
  get() { return _activeRowSi; },
  set(v) { _activeRowSi = v; },
  configurable: true,
});

// ── Set a table row into quiet mode (hide indicators, keep lock) ──
function _setRowQuiet(si) {
  const tr = document.querySelector(`#marksTable tr[data-si="${si}"]`);
  if (tr) { tr.classList.add('elective-row-quiet'); tr.classList.remove('row-active'); }
}

// ── Restore a table row to active mode (show all indicators) ──
function _setRowActive(si) {
  const tr = document.querySelector(`#marksTable tr[data-si="${si}"]`);
  if (tr) { tr.classList.remove('elective-row-quiet'); tr.classList.add('row-active'); }
}

function markInputFocused(el) {
  // Don't allow focus on locked elective inputs
  if (el.classList.contains('elective-locked') || el.disabled) {
    el.blur();
    window.toast('⊘ This subject is locked — student already has a mark in another subject in this group', 'error');
    return;
  }

  const si = parseInt(el.dataset.si);

  // Row changed → quiet the previous row, activate the new one
  if (_activeRowSi !== null && _activeRowSi !== si) {
    _setRowQuiet(_activeRowSi);
  }
  if (_activeRowSi !== si) {
    _setRowActive(si);
    _activeRowSi = si;
  }

  // Remove highlight from previous
  if (_kbActive && _kbActive !== el) {
    _kbActive.classList.remove('kb-active');
  }
  _kbActive = el;
  el.classList.add('kb-active');
  // Auto-scroll the table wrapper to keep the cell visible.
  // _snapScrollOnNextFocus is set by _focusCell() when doing a row-wrap jump
  // (Enter on the last column) so we know to reset scrollLeft to 0.
  const snap = _snapScrollOnNextFocus;
  _snapScrollOnNextFocus = false;
  _scrollToActiveCell(el, snap);
  // On mobile, show the numeric toolbar
  if (window.innerWidth <= 600) {
    _showMobileToolbar(el);
  }
}

function _scrollToActiveCell(el, snapToStart) {
  const wrap = document.querySelector('.marks-table-wrap');
  if (!wrap) return;
  const td = el.closest('td');
  if (!td) return;

  // ── Horizontal scroll ──
  // When the user wraps from the last cell of a row to the first cell of the
  // next row (Enter on last column), we must snap the scroll position all the
  // way back to the left — a delta adjustment cannot work reliably here because
  // getBoundingClientRect() is still reporting positions BEFORE the repaint.
  if (snapToStart) {
    wrap.scrollLeft = 0;
  } else {
    const wrapLeft  = wrap.getBoundingClientRect().left;
    const tdLeft    = td.getBoundingClientRect().left;
    const tdRight   = td.getBoundingClientRect().right;
    const wrapRight = wrap.getBoundingClientRect().right;
    // Compute the actual frozen zone width (Index + Name columns) so we never
    // scroll a cell behind the sticky columns. Read from the CSS custom property
    // set by renderMarksTable; fall back to 60 if not yet measured.
    const frozenNameLeft = parseFloat(getComputedStyle(wrap).getPropertyValue('--frozen-name-left')) || 60;
    const nameCell = wrap.querySelector('thead .col-frozen-name');
    const frozenZone = nameCell ? (nameCell.getBoundingClientRect().right - wrapLeft) : frozenNameLeft;
    if (tdRight > wrapRight - 16) wrap.scrollLeft += tdRight - wrapRight + 16;
    else if (tdLeft < wrapLeft + frozenZone) wrap.scrollLeft -= wrapLeft + frozenZone - tdLeft;
  }

  // ── Vertical scroll ──
  // Re-read rects AFTER the horizontal scroll so vertical math is accurate.
  const wrapTop = wrap.getBoundingClientRect().top;
  const tdTop   = td.getBoundingClientRect().top;
  const tdBot   = td.getBoundingClientRect().bottom;
  const wrapBot = wrap.getBoundingClientRect().bottom;
  if (tdBot > wrapBot - 8) wrap.scrollTop += tdBot - wrapBot + 8;
  else if (tdTop < wrapTop + 44) wrap.scrollTop -= wrapTop + 44 - tdTop;
}

// ── Returns true if the cell at [si, sj] is locked/disabled ──
// Checks desktop table first, then mobile card view.
// ── ROOT CAUSE FIX: Visual-column-aware keyboard navigation ──
//
// The table renders subjects in category-grouped visual order (_navColOrder),
// but each <input data-sj="N"> stores the subjects[] array index.
// These two orderings can differ:
//   subjects[]  = [MATHS(0), BIO(1), CHEM(2), ART(3), DANCING(4), ELLE(5), ...]
//   visual cols = [ART(3),   DANCING(4), ELLE(5), ..., MATHS(0), BIO(1), CHEM(2)]
//
// ArrowRight/Left must step through VISUAL columns, not subjects[] indices.
// Without this, ArrowRight at the last category subject (e.g. TAMIL, sj=8, vcol=5)
// tried sj=9 which doesn't exist → boundary hit → navigation stopped.
// Similarly ArrowLeft from the first no-group subject (MATHS, sj=0, vcol=6)
// tried sj=-1 → clamped to 0 → no movement → stopped.
//
// Fix: convert sj→vcol, step in visual-col space, convert back to sj.

// ══════════════════════════════════════════════════════════════
//  TWO-TIER LOCKING MODEL
//
//  _isCellHardLocked  → truly impassable (disabled, elective-locked).
//                       Navigation SKIPS these entirely.
//
//  _isCellAbsent      → marked AB. Navigation LANDS on the badge so
//                       the user can press A/Enter to clear it, or use
//                       arrow keys to continue.  NOT hard-locked.
//
//  _isCellLocked      → kept for mobile/MNT callers that still want
//                       the old "skip everything non-enterable" behaviour.
// ══════════════════════════════════════════════════════════════

function _isCellHardLocked(si, sj) {
  const desktop = document.querySelector(`.mark-input[data-si="${si}"][data-sj="${sj}"]`);
  if (desktop) return desktop.disabled || desktop.classList.contains('elective-locked');
  const mobile  = document.querySelector(`.mark-subject-input[data-si="${si}"][data-sj="${sj}"]`);
  if (mobile)   return mobile.disabled  || mobile.classList.contains('elective-locked');
  return false;
}

function _isCellAbsent(si, sj) {
  const desktop = document.querySelector(`.mark-input[data-si="${si}"][data-sj="${sj}"]`);
  if (desktop) return desktop.classList.contains('absent-input');
  const mobile  = document.querySelector(`.mark-subject-input[data-si="${si}"][data-sj="${sj}"]`);
  if (mobile)   return mobile.classList.contains('absent-input-card');
  return false;
}

// Legacy combined check — used by mobile MNT and markCardNavKey.
function _isCellLocked(si, sj) {
  return _isCellHardLocked(si, sj) || _isCellAbsent(si, sj);
}

// ── Returns true if the cell at visual column [si, vcol] is hard-locked ──
// AB cells are NOT hard-locked — they are navigable stop-points.
function _isCellLockedByVcol(si, vcol) {
  const sj = _navColOrder[vcol];
  if (sj === undefined) return true;
  return _isCellHardLocked(si, sj);
}

// ── Focus a cell: normal input OR absent-badge for AB cells ──
// AB cells are now navigable — focus lands on the badge, not silently ignored.
function _focusCell(si, sj, snapToStart) {
  if (snapToStart) {
    _snapScrollOnNextFocus = true;
    const wrap = document.querySelector('.marks-table-wrap');
    if (wrap) wrap.scrollLeft = 0;
  }

  if (_isCellAbsent(si, sj)) {
    // Land on the absent badge — user can navigate away or clear with A/Enter
    const badge = document.querySelector(`.absent-badge[data-si="${si}"][data-sj="${sj}"]`);
    if (badge) {
      badge.focus();
      absentBadgeFocused(badge, si, sj);
    }
    return;
  }

  const el = document.querySelector(`.mark-input[data-si="${si}"][data-sj="${sj}"]`);
  if (el && !el.disabled && !el.classList.contains('elective-locked')) {
    el.focus();
    el.select();
  }
}

// ── Step one unit in a direction, operating in VISUAL COLUMN space ──
// vcol: current visual column index (0-based, matching _navColOrder).
// Returns { nsi, nvcol } — the next row/visual-col after one step.
function _stepCell(si, vcol, key, shiftKey, numRows, numCols) {
  let nsi = si, nvcol = vcol;
  switch (key) {
    case 'Tab':
      if (shiftKey) { nvcol--; if (nvcol < 0) { nvcol = numCols - 1; nsi = Math.max(0, si - 1); } }
      else          { nvcol++; if (nvcol >= numCols) { nvcol = 0; nsi = Math.min(numRows - 1, si + 1); } }
      break;
    case 'Enter':
      nsi++; if (nsi >= numRows) { nsi = 0; nvcol = Math.min(numCols - 1, vcol + 1); }
      break;
    case 'ArrowDown':  nsi = Math.min(numRows - 1, si + 1); break;
    case 'ArrowUp':    nsi = Math.max(0, si - 1); break;
    case 'ArrowRight': nvcol = Math.min(numCols - 1, vcol + 1); break;
    case 'ArrowLeft':  nvcol = Math.max(0, vcol - 1); break;
  }
  return { nsi, nvcol };
}

// ── Navigate, skipping only hard-locked cells; AB cells are reachable ──
// All horizontal movement works in visual-column space via _navColOrder/_navSjToVcol.
// For ArrowUp/ArrowDown: moves exactly ONE row, stays as close to current visual column.
// For ArrowLeft/ArrowRight/Tab/Enter: steps in one direction, skips hard-locked cells.
function _focusCellSkipLocked(fromSi, fromSj, key, shiftKey) {
  const numCols = _navColOrder.length || subjects.length;
  const numRows = students.length;

  // Convert current sj (subjects[] index) → vcol (visual column position)
  const fromVcol = (_navSjToVcol[fromSj] !== undefined) ? _navSjToVcol[fromSj] : fromSj;

  // ── Arrow Up / Down: move one row, stay as close as possible to current visual column ──
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const targetSi = key === 'ArrowDown'
      ? Math.min(numRows - 1, fromSi + 1)
      : Math.max(0, fromSi - 1);

    if (targetSi === fromSi) return; // already at boundary

    // Try the exact same visual column first (AB cells are acceptable targets)
    if (!_isCellLockedByVcol(targetSi, fromVcol)) {
      _focusCell(targetSi, _navColOrder[fromVcol]);
      return;
    }

    // Search outward in both directions for nearest non-hard-locked cell
    for (let delta = 1; delta < numCols; delta++) {
      const rv = fromVcol + delta;
      const lv = fromVcol - delta;
      if (rv < numCols && !_isCellLockedByVcol(targetSi, rv)) { _focusCell(targetSi, _navColOrder[rv]); return; }
      if (lv >= 0      && !_isCellLockedByVcol(targetSi, lv)) { _focusCell(targetSi, _navColOrder[lv]); return; }
    }
    return; // entire target row is hard-locked — don't move
  }

  // ── Tab / Enter / ArrowLeft / ArrowRight: step-and-skip in visual-column space ──
  // Only hard-locked cells are skipped; AB cells are a valid landing target.
  const maxSteps = numRows * numCols;
  let si = fromSi, vcol = fromVcol;

  for (let step = 0; step < maxSteps; step++) {
    const { nsi, nvcol } = _stepCell(si, vcol, key, shiftKey, numRows, numCols);

    // Boundary reached without moving (arrow at row/column edge) — stop
    if (nsi === si && nvcol === vcol) break;

    si = nsi; vcol = nvcol;
    const sj = _navColOrder[vcol];
    if (sj === undefined) break; // safety

    if (!_isCellHardLocked(si, sj)) {
      _focusCell(si, sj);
      return;
    }
    // Cell is hard-locked → keep stepping in the same direction
  }
  // No reachable cell found — stay put
}

// ── Returns true if the cell at [si, sj] is the LAST fillable (unlocked) cell in row si ──
// "Last" = no unlocked cell to its right in VISUAL column order.
function _isLastFillableInRow(si, sj) {
  const fromVcol = (_navSjToVcol[sj] !== undefined) ? _navSjToVcol[sj] : sj;
  const numCols  = _navColOrder.length || subjects.length;
  for (let v = fromVcol + 1; v < numCols; v++) {
    const j = _navColOrder[v];
    if (j !== undefined && !_isCellLocked(si, j)) return false;
  }
  return true;
}

// ── First unlocked cell in a row, scanning left→right in VISUAL column order ──
// Returns the subjects[] index (sj), or -1 if the entire row is locked.
function _firstUnlockedColInRow(si) {
  const numCols = _navColOrder.length || subjects.length;
  for (let v = 0; v < numCols; v++) {
    const sj = _navColOrder[v];
    if (sj !== undefined && !_isCellLocked(si, sj)) return sj;
  }
  return -1;
}

function markNavKey(e, el) {
  const si = parseInt(el.dataset.si);
  const sj = parseInt(el.dataset.sj);
  const numRows = students.length;

  // ── 'A' key: toggle absent for this cell ──
  if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (typeof window.toggleAbsent === 'function') window.toggleAbsent(si, sj);
    return;
  }

  const navKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'];
  if (navKeys.includes(e.key)) {
    e.preventDefault();
  } else {
    return;
  }

  // Commit current value before moving
  const max = subjects[sj] ? subjects[sj].max : Infinity;
  window.validateMark(el, max);

  // ── Smart Enter: if this is the last fillable cell in the row,
  //    jump to the first fillable cell of the NEXT row and snap scroll to left. ──
  if (e.key === 'Enter' && _isLastFillableInRow(si, sj)) {
    const nextSi = si + 1;
    if (nextSi < numRows) {
      const firstSj = _firstUnlockedColInRow(nextSi);
      if (firstSj >= 0) {
        _focusCell(nextSi, firstSj, /* snapToStart */ true);
        return;
      }
    }
    // Already on last row or next row fully locked — fall through
  }

  // Navigate, hopping over any locked elective cells
  _focusCellSkipLocked(si, sj, e.key, e.shiftKey);
}

// ════════════════════════════════════════════
//  MOBILE NUMERIC TOOLBAR ENGINE
// ════════════════════════════════════════════

let _mntEl   = null;  // current input element
let _mntVal  = '';    // pending string value (before commit)
let _mntActive = false;

function _showMobileToolbar(el) {
  _mntEl = el;
  _mntActive = true;
  const si = parseInt(el.dataset.si);
  const sj = parseInt(el.dataset.sj);
  const student = students[si];
  const subj    = subjects[sj];
  if (!student || !subj) return;

  // Set labels
  document.getElementById('mntStudentName').textContent = student.name;
  document.getElementById('mntSubjectName').textContent = subj.name;
  document.getElementById('mntSubjectMax').textContent  = `/ ${subj.max}`;

  // Pre-fill current value
  _mntVal = el.value !== '' ? String(parseFloat(el.value)) : '';
  _mntRefreshDisplay();
  _mntUpdateProgress();

  const toolbar = document.getElementById('mobileNumToolbar');
  toolbar.classList.add('visible');
}

function hideMobileToolbar() {
  _mntActive = false;
  _mntEl = null;
  document.getElementById('mobileNumToolbar').classList.remove('visible');
  if (_kbActive) _kbActive.classList.remove('kb-active');
  _kbActive = null;
}

function _mntRefreshDisplay() {
  const valEl = document.getElementById('mntDisplayVal');
  const hintEl = document.getElementById('mntDisplayHint');
  const display = _mntVal === '' ? '—' : _mntVal;
  valEl.textContent = display;

  if (!_mntEl) return;
  const max = subjects[parseInt(_mntEl.dataset.sj)]?.max ?? Infinity;
  const num = parseFloat(_mntVal);
  const isOver = !isNaN(num) && num > max;
  valEl.classList.toggle('mnt-over', isOver);
  hintEl.textContent = isOver ? `⚠ Max is ${max}` : (_mntVal === '' ? 'Enter mark' : `out of ${max}`);
}

function _mntUpdateProgress() {
  if (!_mntEl) return;
  const si = parseInt(_mntEl.dataset.si);
  const total = students.length * subjects.length;
  const entered = Object.values(marks).filter(v => v !== '' && v !== undefined && v !== null).length;
  const pct = total > 0 ? Math.round((entered / total) * 100) : 0;
  const label = `${entered}/${total} cells filled`;
  document.getElementById('mntProgressLabel').textContent = label;
  document.getElementById('mntProgressFill').style.width = pct + '%';
}

function mntDigit(d) {
  if (_mntVal.length >= 5) return; // max 5 digits
  _mntVal += d;
  _mntRefreshDisplay();
}

function mntClear() {
  if (_mntVal.length > 0) {
    _mntVal = _mntVal.slice(0, -1);
  }
  _mntRefreshDisplay();
}

function mntConfirm() {
  if (!_mntEl) return;
  const si = parseInt(_mntEl.dataset.si);
  const sj = parseInt(_mntEl.dataset.sj);
  const subj = subjects[sj];
  if (!subj) return;

  const num = _mntVal === '' ? '' : parseFloat(_mntVal);
  if (typeof num === 'number' && num > subj.max) {
    // Auto-cap to max
    _mntVal = String(subj.max);
    _mntRefreshDisplay();
    window.toast(`Capped to max ${subj.max}`, 'error');
    return;
  }

  _mntEl.value = _mntVal;
  // Use the correct setter depending on whether this is a desktop table input or a mobile card input
  if (_mntEl.classList.contains('mark-subject-input')) {
    window.setMarkCardByIndex(_mntEl);
  } else {
    window.setMarkByIndex(_mntEl);
  }
  window.validateMark(_mntEl, subj.max);

  // ── Haptic + visual save confirmation ──────────────────────────────
  // 1. Haptic vibration (30ms pulse, silently ignored where unsupported)
  if (navigator.vibrate) { try { navigator.vibrate(30); } catch(e) {} }

  // 2. Flash the confirm button green
  const confirmBtn = document.querySelector('.mnt-btn.mnt-confirm');
  if (confirmBtn) {
    confirmBtn.textContent = '✓';
    confirmBtn.classList.add('mnt-saved-flash');
    setTimeout(() => confirmBtn.classList.remove('mnt-saved-flash'), 420);
  }

  // 3. Show "Saved ✓" in the display area for 380ms, then advance
  const displayEl  = document.querySelector('.mnt-display');
  const valEl      = document.getElementById('mntDisplayVal');
  const hintEl     = document.getElementById('mntDisplayHint');
  const savedMark  = _mntVal === '' ? '—' : _mntVal;

  if (displayEl && valEl && hintEl) {
    valEl.textContent  = 'Saved ✓';
    valEl.classList.add('mnt-saved-text');
    hintEl.textContent = savedMark !== '—' ? `${savedMark} recorded` : 'Cleared';
    displayEl.classList.add('mnt-display-saved');

    setTimeout(() => {
      valEl.classList.remove('mnt-saved-text');
      displayEl.classList.remove('mnt-display-saved');
      // Now advance to next cell
      _mntDoAdvance(si, sj);
    }, 380);
  } else {
    _mntDoAdvance(si, sj);
  }
  // ────────────────────────────────────────────────────────────────────
}

// Separated advance logic so it can be deferred after the "Saved" flash
function _mntDoAdvance(si, sj) {
  // Smart advance: if this is the last fillable cell in the row,
  // jump to the first fillable cell of the next row.
  if (_isLastFillableInRow(si, sj)) {
    const nextSi = si + 1;
    if (nextSi < students.length) {
      const firstCol = _firstUnlockedColInRow(nextSi);
      if (firstCol >= 0) { _mntJumpTo(nextSi, firstCol); return; }
    }
    // Last row or next row fully locked — just stay / normal advance
  }
  mntNextSubject();
}

// ── Mobile toolbar: shared helper to jump to a target cell, updating toolbar state ──
// Works with both desktop (.mark-input) and mobile card (.mark-subject-input) elements.
function _mntJumpTo(nsi, nsj) {
  const el = document.querySelector(`.mark-input[data-si="${nsi}"][data-sj="${nsj}"]`)
          || document.querySelector(`.mark-subject-input[data-si="${nsi}"][data-sj="${nsj}"]`);
  if (!el) return;
  _mntEl = el;
  _mntVal = el.value !== '' ? String(parseFloat(el.value) || '') : '';
  const s = students[nsi]; const sub = subjects[nsj];
  if (s && sub) {
    document.getElementById('mntStudentName').textContent = s.name;
    document.getElementById('mntSubjectName').textContent = sub.name;
    document.getElementById('mntSubjectMax').textContent  = `/ ${sub.max}`;
  }
  _mntRefreshDisplay();
  _mntUpdateProgress();
}

function mntNextSubject() {
  if (!_mntEl) return;
  const numCols = _navColOrder.length || subjects.length;
  const numRows = students.length;
  const maxSteps = numRows * numCols;
  let si = parseInt(_mntEl.dataset.si);
  let sj = parseInt(_mntEl.dataset.sj);
  // Convert current sj to visual column, then step forward in visual order
  let vcol = (_navSjToVcol[sj] !== undefined) ? _navSjToVcol[sj] : sj;

  for (let step = 0; step < maxSteps; step++) {
    let nsi = si, nvcol = vcol + 1;
    if (nvcol >= numCols) { nvcol = 0; nsi = Math.min(numRows - 1, si + 1); }
    if (nsi === si && nvcol === vcol) break; // boundary
    si = nsi; vcol = nvcol;
    const nsj = _navColOrder[vcol];
    if (nsj !== undefined && !_isCellLocked(si, nsj)) { _mntJumpTo(si, nsj); return; }
  }
  _mntRefreshDisplay();
  _mntUpdateProgress();
}

function mntPrevSubject() {
  if (!_mntEl) return;
  const numCols = _navColOrder.length || subjects.length;
  const numRows = students.length;
  const maxSteps = numRows * numCols;
  let si = parseInt(_mntEl.dataset.si);
  let sj = parseInt(_mntEl.dataset.sj);
  let vcol = (_navSjToVcol[sj] !== undefined) ? _navSjToVcol[sj] : sj;

  for (let step = 0; step < maxSteps; step++) {
    let nsi = si, nvcol = vcol - 1;
    if (nvcol < 0) { nvcol = numCols - 1; nsi = Math.max(0, si - 1); }
    if (nsi === si && nvcol === vcol) break; // boundary
    si = nsi; vcol = nvcol;
    const nsj = _navColOrder[vcol];
    if (nsj !== undefined && !_isCellLocked(si, nsj)) { _mntJumpTo(si, nsj); return; }
  }
  _mntRefreshDisplay();
  _mntUpdateProgress();
}

function mntNextStudent() {
  if (!_mntEl) return;
  const numRows = students.length;
  const numCols = subjects.length;
  let si = parseInt(_mntEl.dataset.si);
  let sj = parseInt(_mntEl.dataset.sj);

  // Try moving down in the same column first; if locked, try next column, etc.
  for (let step = 0; step < numRows * numCols; step++) {
    const nsi = Math.min(numRows - 1, si + 1);
    if (nsi === si) break; // already at bottom
    si = nsi;
    if (!_isCellLocked(si, sj)) { _mntJumpTo(si, sj); return; }
  }
  _mntRefreshDisplay();
  _mntUpdateProgress();
}

function mntPrevStudent() {
  if (!_mntEl) return;
  const numRows = students.length;
  const numCols = subjects.length;
  let si = parseInt(_mntEl.dataset.si);
  let sj = parseInt(_mntEl.dataset.sj);

  for (let step = 0; step < numRows * numCols; step++) {
    const nsi = Math.max(0, si - 1);
    if (nsi === si) break; // already at top
    si = nsi;
    if (!_isCellLocked(si, sj)) { _mntJumpTo(si, sj); return; }
  }
  _mntRefreshDisplay();
  _mntUpdateProgress();
}

// ════════════════════════════════════════════
//  MOBILE CARD VIEW — KEYBOARD NAVIGATION
// ════════════════════════════════════════════
// type="text" + inputmode="numeric" is used for card inputs (instead of type="number")
// so Android Chrome reliably fires keydown for the > (Enter/Go) key.
//
// On Android, type="number" inputs suppress keydown for IME keys (including Enter/Go),
// so the > arrow button was silently ignored. type="text" + inputmode="numeric" gives
// the same numeric keyboard but with proper keydown events.

// Numeric-only input filter — prevents letters/symbols from being typed in card inputs.
// Called oninput; strips any non-numeric character (allows digits only).
function filterCardNumericInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  if (el.value !== raw) el.value = raw;
  window.setMarkCardByIndex(el);
}

// Navigation handler for the > key (and arrows) in mobile card inputs.
function markCardNavKey(e, el) {
  const handled = ['Enter', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Tab'];
  if (!handled.includes(e.key)) return;
  e.preventDefault();

  const si  = parseInt(el.dataset.si);
  const sj  = parseInt(el.dataset.sj);
  const numCols = subjects.length;
  const numRows = students.length;

  // Commit current value before moving
  const max = subjects[sj] ? subjects[sj].max : Infinity;
  window.validateMark(el, max);
  // Also ensure marks[] is up-to-date (so lock state reflects the just-typed value)
  window.setMarkCardByIndex(el);

  // After setMarkCardByIndex the elective lock states are refreshed for this row.
  // _isCellLocked now checks both .mark-input (desktop) and .mark-subject-input (mobile),
  // so locked siblings are correctly detected and skipped.

  const forward = (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight')
               || (e.key === 'Tab' && !e.shiftKey);

  const maxSteps = numRows * numCols;
  let csi = si, csj = sj;

  for (let step = 0; step < maxSteps; step++) {
    let nsi = csi;
    let nsj = forward ? csj + 1 : csj - 1;

    if (forward) {
      if (nsj >= numCols) { nsj = 0; nsi = Math.min(numRows - 1, csi + 1); }
    } else {
      if (nsj < 0) { nsj = numCols - 1; nsi = Math.max(0, csi - 1); }
    }

    // At boundary — no further movement
    if (nsi === csi && nsj === csj) break;
    csi = nsi; csj = nsj;

    if (!_isCellLocked(csi, csj)) {
      const target = document.querySelector(`.mark-subject-input[data-si="${csi}"][data-sj="${csj}"]`);
      if (target) {
        target.focus();
        target.select();
        window.markCardInputFocused(target);
        const card = document.querySelector(`#marksCardView .mark-student-card[data-si="${csi}"]`);
        if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }
  }
  // No unlocked cell found — dismiss keyboard
  el.blur();
}
// ════════════════════════════════════════════
//  END MOBILE CARD VIEW — KEYBOARD NAVIGATION
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  ABSENT BADGE — KEYBOARD NAVIGATION
// ════════════════════════════════════════════
// When an AB badge has focus (user navigated into it or just pressed A to mark
// absent), the badge must respond to navigation keys so the user never gets
// "stuck" — they can keep moving through the grid without touching the mouse.
//
// The badge is rendered with tabindex="0" and onkeydown="absentBadgeNavKey".
// The hidden absent-input underneath gets the same handler as a safety net.

// ── Called when an absent-badge receives focus — highlight its row ──
function absentBadgeFocused(el, si, sj) {
  // Remove kb-active from any previously active normal input
  if (_kbActive && _kbActive !== el) {
    _kbActive.classList.remove('kb-active');
  }
  _kbActive = el;
  el.classList.add('kb-active');

  // Activate this row (quiet all others)
  if (_activeRowSi !== null && _activeRowSi !== si) {
    window._setRowQuiet(_activeRowSi);
  }
  if (_activeRowSi !== si) {
    window._setRowActive(si);
    _activeRowSi = si;
  }

  // Scroll the badge into view
  const td = el.closest('td');
  if (td) _scrollToActiveCell(td.querySelector('.absent-input') || el, false);
}

// ── Navigation / action handler for absent badges ──
// Fired by onkeydown on both the .absent-badge div and the hidden .absent-input.
function absentBadgeNavKey(e, si, sj) {
  // 'A' key: un-absent (toggle back to blank)
  if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (typeof window.toggleAbsent === 'function') window.toggleAbsent(si, sj);
    return;
  }

  // Enter / Space: same as clicking the badge — toggle absent off
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (typeof window.toggleAbsent === 'function') window.toggleAbsent(si, sj);
    return;
  }

  const navKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'];
  if (!navKeys.includes(e.key)) return;
  e.preventDefault();

  // Delegate to the shared navigation engine.
  // _focusCellSkipLocked now only skips hard-locked cells (disabled / elective-locked).
  // AB cells are navigable, so adjacent AB badges will be visited in sequence.
  _focusCellSkipLocked(si, sj, e.key, e.shiftKey);
}

// ════════════════════════════════════════════
//  END ABSENT BADGE — KEYBOARD NAVIGATION
// ════════════════════════════════════════════


document.addEventListener('touchstart', function(e) {
  if (!_mntActive) return;
  const toolbar = document.getElementById('mobileNumToolbar');
  if (!toolbar.contains(e.target) && !e.target.classList.contains('mark-input')) {
    hideMobileToolbar();
  }
}, { passive: true });

// ════════════════════════════════════════════
//  END KEYBOARD + MOBILE TOOLBAR ENGINE
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  UNDO STACK ENGINE  (last 20 actions)
// ════════════════════════════════════════════


// ── Window exports ──
Object.assign(window, {
  absentBadgeFocused,
  absentBadgeNavKey,
  filterCardNumericInput,
  hideMobileToolbar,
  markCardNavKey,
  markInputFocused,
  markNavKey,
  mntClear,
  mntConfirm,
  mntDigit,
  mntNextStudent,
  mntNextSubject,
  mntPrevStudent,
  mntPrevSubject,
  _setRowQuiet,
  _setRowActive
});

// Expose _mntEl, _mntActive, _mntVal with getter/setter so marks-table.js
// (mobile card view) can sync them back into keyboard-nav's state.
Object.defineProperty(window, '_mntEl', {
  get() { return _mntEl; },
  set(v) { _mntEl = v; },
  configurable: true,
});
Object.defineProperty(window, '_mntActive', {
  get() { return _mntActive; },
  set(v) { _mntActive = v; },
  configurable: true,
});
Object.defineProperty(window, '_mntVal', {
  get() { return _mntVal; },
  set(v) { _mntVal = v; },
  configurable: true,
});
