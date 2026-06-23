// ═══════════════════════════════════════════════════════════════
//  src/modules/grading.js
//  Grading Scale Panel (keyboard nav + mobile steppers),
//  Pass Mark Panel (keyboard nav + mobile steppers),
//  Mobile Floating Row-Nav for both panels.
//  addGradeEntry, removeGradeEntry, resetGradeDefaults, etc.
// ═══════════════════════════════════════════════════════════════
/* ══════════════════════════════════════════════════════════════════
   PASS MARK PANEL — Keyboard navigation + Mobile steppers
   ══════════════════════════════════════════════════════════════════

   PC / keyboard:
     ↑ / ↓       — move focus to prev / next subject input
     ← / →       — decrement / increment value by 1 (with clamping)
     Tab / Enter — move to next input (browser default + our helper)

   Mobile (touch):
     − / + stepper buttons injected beside each input via patchPassMarkPanelForMobile()
   ══════════════════════════════════════════════════════════════════ */

(function () {

  // ── Helper: get all focusable passmark subject inputs in order ──
  function getPassmarkInputs() {
    return Array.from(
      document.querySelectorAll('#passmarkPanelBody .passmark-subject-input')
    );
  }

  // ── Helper: clamp value and fire the existing updateSubjectPassMark ──
  function nudgePassmarkInput(input, delta) {
    const raw = input.value;
    const cur = raw === '' ? parseFloat(input.placeholder) || 50 : parseFloat(raw);
    const next = Math.max(0, Math.min(100, (isNaN(cur) ? 50 : cur) + delta));
    input.value = next;
    // Pass the element directly — updateSubjectPassMark reads dataset.subject
    window.updateSubjectPassMark(input);
    // Flash visual feedback
    input.style.transition = 'border-color 0.1s';
    input.style.borderColor = delta > 0 ? 'var(--success)' : 'var(--danger)';
    setTimeout(() => { input.style.borderColor = ''; }, 400);
  }

  // ── Keyboard handler for the passmark panel ──
  document.addEventListener('keydown', function (e) {
    const overlay = document.getElementById('passmarkPanelOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    const active = document.activeElement;
    if (!active || !active.classList.contains('passmark-subject-input')) return;

    const inputs = getPassmarkInputs();
    const idx = inputs.indexOf(active);

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        const prev = inputs[idx - 1];
        if (prev) prev.focus();
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) next.focus();
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        nudgePassmarkInput(active, -1);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        nudgePassmarkInput(active, +1);
        break;
      }
      case 'Enter': {
        // Enter moves focus to next input (like Tab)
        const next = inputs[idx + 1];
        if (next) { e.preventDefault(); next.focus(); }
        break;
      }
    }
  }, true);

  // ── Observe passmarkPanelBody for DOM changes and re-inject on every render ──
  // MutationObserver instead of wrapping renderPassMarkPanel (function declaration,
  // not on window at IIFE run time, so window.renderPassMarkPanel is undefined here).
  document.addEventListener('DOMContentLoaded', function () {
    var pmBody = document.getElementById('passmarkPanelBody');
    if (!pmBody) return;
    var pmObserver = new MutationObserver(function (mutations) {
      var added = mutations.some(function (m) { return m.addedNodes.length > 0; });
      if (added) _patchPassMarkPanelForMobile();
    });
    pmObserver.observe(pmBody, { childList: true });
  });

  function _patchPassMarkPanelForMobile() {
    const body = document.getElementById('passmarkPanelBody');
    if (!body) return;

    // ── Inject keyboard hint at the top (desktop only via CSS display) ──
    if (!body.querySelector('.panel-kb-hint')) {
      const hint = document.createElement('div');
      hint.className = 'panel-kb-hint';
      hint.innerHTML =
        '<strong style="margin-right:2px;">⌨ Keyboard:</strong>' +
        '<span class="panel-kb-hint-key">↑</span><span class="panel-kb-hint-key">↓</span>' +
        '<span style="margin:0 2px;">navigate subjects &nbsp;·&nbsp;</span>' +
        '<span class="panel-kb-hint-key">←</span><span class="panel-kb-hint-key">→</span>' +
        '<span style="margin-left:2px;">adjust value</span>';
      body.insertBefore(hint, body.firstChild);
    }

    // ── Inject − / + steppers beside each subject input ──
    body.querySelectorAll('.passmark-subject-row').forEach(function (row) {
      if (row.querySelector('.pm-stepper-wrap')) return; // already patched
      const input = row.querySelector('.passmark-subject-input');
      if (!input) return;

      const wrap = document.createElement('div');
      wrap.className = 'pm-stepper-wrap';
      wrap.setAttribute('aria-hidden', 'true');

      const minusBtn = document.createElement('button');
      minusBtn.className = 'pm-stepper-btn minus';
      minusBtn.type = 'button';
      minusBtn.setAttribute('tabindex', '-1');
      minusBtn.setAttribute('aria-label', 'Decrease pass mark');
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', function (e) {
        e.preventDefault();
        input.focus();
        nudgePassmarkInput(input, -1);
      });

      const plusBtn = document.createElement('button');
      plusBtn.className = 'pm-stepper-btn plus';
      plusBtn.type = 'button';
      plusBtn.setAttribute('tabindex', '-1');
      plusBtn.setAttribute('aria-label', 'Increase pass mark');
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', function (e) {
        e.preventDefault();
        input.focus();
        nudgePassmarkInput(input, +1);
      });

      wrap.appendChild(minusBtn);
      wrap.appendChild(plusBtn);

      // Insert the stepper wrap just after the input's % label
      const pctLabel = row.querySelector('.passmark-pct-label');
      if (pctLabel && pctLabel.nextSibling) {
        row.insertBefore(wrap, pctLabel.nextSibling);
      } else {
        row.appendChild(wrap);
      }
    });
  }

})();


/* ══════════════════════════════════════════════════════════════════
   GRADING SCALE PANEL — Keyboard navigation + Mobile steppers
   ══════════════════════════════════════════════════════════════════ */

(function () {

  /* ── Build a matrix of {label, pct} input pairs, one per grade row ── */
  function getGradeInputMatrix() {
    var container = document.getElementById('gradeRowsContainer');
    if (!container) return [];
    return Array.prototype.slice.call(container.querySelectorAll('.grade-row')).map(function (row) {
      return {
        row:   row,
        label: row.querySelector('input[type=text]'),
        pct:   row.querySelector('input[type=number]')
      };
    });
  }

  /* ── Increment/decrement a percent input and fire updateGradePct ── */
  function nudgeGradePct(pctInput, delta) {
    var cur  = parseFloat(pctInput.value) || 0;
    var next = Math.max(0, Math.min(100, cur + delta));
    pctInput.value = next;
    var m = (pctInput.getAttribute('oninput') || '').match(/updateGradePct\((\d+),/);
    if (m) window.updateGradePct(parseInt(m[1], 10), String(next));
    pctInput.style.transition = 'border-color 0.15s';
    pctInput.style.borderColor = delta > 0 ? 'var(--success)' : 'var(--danger)';
    setTimeout(function () { pctInput.style.borderColor = ''; }, 400);
  }

  /* ── Keyboard handler ──────────────────────────────────────────────
     FIX 1: element.matches('.grade-row input[type=text]') checks whether
     the element itself matches the full selector — an <input> never IS
     a .grade-row, so that always returned false.
     Correct test: is the element an input AND does it have a .grade-row ancestor?
  ────────────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    // Gate: only when grading panel is open
    var overlay = document.getElementById('gradePanelOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    // Only act on arrow / +/- keys — bail early for anything else
    var key = e.key;
    var isArrow = (key === 'ArrowUp' || key === 'ArrowDown' ||
                   key === 'ArrowLeft' || key === 'ArrowRight');
    var isNudge = (key === '+' || key === '=' || key === '-' || key === '_');
    var isEnter = (key === 'Enter');
    if (!isArrow && !isNudge && !isEnter) return;

    // Focused element must be an INPUT inside a .grade-row
    var active = document.activeElement;
    if (!active || active.tagName !== 'INPUT') return;
    if (!active.closest('.grade-row')) return;

    // type="color" inputs are also inside .grade-row — ignore them
    var inputType = active.type;
    var isOnLabel = (inputType === 'text');
    var isOnPct   = (inputType === 'number');
    if (!isOnLabel && !isOnPct) return;

    var matrix = getGradeInputMatrix();
    if (!matrix.length) return;

    var rowIdx = -1;
    for (var i = 0; i < matrix.length; i++) {
      if (matrix[i].label === active || matrix[i].pct === active) { rowIdx = i; break; }
    }
    if (rowIdx < 0) return;

    if (key === 'ArrowRight') {
      e.preventDefault();
      if (isOnLabel) {
        // Label field: jump to pct field of same row
        if (matrix[rowIdx].pct) matrix[rowIdx].pct.focus();
      } else {
        // Pct field: nudge value up by 1
        nudgeGradePct(active, +1);
      }
    } else if (key === 'ArrowLeft') {
      if (isOnPct) {
        // Pct field: nudge value down by 1
        e.preventDefault();
        nudgeGradePct(active, -1);
      }
      // Label field: let ArrowLeft move cursor naturally (no preventDefault)
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault();
      var direction = (key === 'ArrowUp') ? -1 : 1;
      var targetIdx = rowIdx + direction;
      if (targetIdx >= 0 && targetIdx < matrix.length) {
        var colKey = isOnLabel ? 'label' : 'pct';

        // commitGradePct (fired on blur of a pct input) re-sorts gradingScale
        // and calls renderGradePanel(), destroying all inputs and recreating them.
        // We must identify the target grade by its CURRENT pct value (unique key),
        // then re-find it in the freshly rendered DOM after the re-render settles.
        var targetPctValue = matrix[targetIdx].pct
                             ? matrix[targetIdx].pct.value
                             : null;

        setTimeout(function () {
          var m2 = getGradeInputMatrix();
          // Find the row whose pct value matches what we recorded
          var found = null;
          if (targetPctValue !== null) {
            for (var j = 0; j < m2.length; j++) {
              if (m2[j].pct && m2[j].pct.value === targetPctValue) {
                found = m2[j];
                break;
              }
            }
          }
          // Fallback: use positional index if value-based lookup failed
          if (!found) found = m2[targetIdx] || null;
          if (found && found[colKey]) found[colKey].focus();
        }, 0);

        // Blur current input — if it's a pct field this triggers commitGradePct
        // which re-renders; the setTimeout above runs after that completes.
        active.blur();
      }
    } else if (isNudge && isOnPct) {
      e.preventDefault();
      nudgeGradePct(active, (key === '+' || key === '=') ? +1 : -1);
    } else if (isEnter) {
      // Enter on label field → jump to pct field of the same row
      // Enter on pct field  → jump to label field of the NEXT row
      e.preventDefault();
      if (isOnLabel) {
        // Move to the pct input of the same row
        if (matrix[rowIdx].pct) matrix[rowIdx].pct.focus();
      } else {
        // Move to the label input of the next row (wraps to first row if on last)
        var nextRowIdx = rowIdx + 1 < matrix.length ? rowIdx + 1 : 0;
        var targetPctValue = matrix[nextRowIdx].pct ? matrix[nextRowIdx].pct.value : null;
        // Blur current pct input — may trigger commitGradePct + re-render
        active.blur();
        setTimeout(function () {
          var m2 = getGradeInputMatrix();
          var found = null;
          // Try to find the target row by its pct value (stable after re-render)
          if (targetPctValue !== null) {
            for (var j = 0; j < m2.length; j++) {
              if (m2[j].pct && m2[j].pct.value === targetPctValue) { found = m2[j]; break; }
            }
          }
          if (!found) found = m2[nextRowIdx] || null;
          if (found && found.pct) found.pct.focus();
        }, 0);
      }
    }
  }, true);

  /* ── MutationObserver: re-inject steppers + hint after every render ──
     FIX 2: DOMContentLoaded already fired by the time this script runs
     (it is at the bottom of <body>), so that listener never executed.
     Instead, attach the MutationObserver immediately and directly.
  ── */
  (function attachObserver() {
    var body = document.getElementById('gradePanelBody');
    if (!body) {
      // DOM not ready yet — rare, but safe fallback
      document.addEventListener('DOMContentLoaded', attachObserver);
      return;
    }
    var observer = new MutationObserver(function (mutations) {
      var added = mutations.some(function (m) { return m.addedNodes.length > 0; });
      if (added) _patchGradePanelForMobile();
    });
    observer.observe(body, { childList: true });
  })();

  /* ── Inject KB hint + mobile stepper buttons after each render ── */
  function _patchGradePanelForMobile() {
    var container = document.getElementById('gradeRowsContainer');
    if (!container) return;

    // KB hint (desktop-only via CSS pointer:fine media query)
    var body = document.getElementById('gradePanelBody');
    if (body && !body.querySelector('.panel-kb-hint')) {
      var hint = document.createElement('div');
      hint.className = 'panel-kb-hint';
      hint.style.marginTop = '6px';
      hint.innerHTML =
        '<strong style="margin-right:2px;">&#9000; Keyboard:</strong>' +
        '<span class="panel-kb-hint-key">&#8593;</span>' +
        '<span class="panel-kb-hint-key">&#8595;</span>' +
        '<span style="margin:0 2px;">rows &nbsp;&middot;&nbsp;</span>' +
        '<span class="panel-kb-hint-key">&#8594;</span>' +
        '<span style="margin:0 2px;">nudge % &nbsp;&middot;&nbsp;</span>' +
        '<span class="panel-kb-hint-key">+</span>' +
        '<span class="panel-kb-hint-key">&#8722;</span>' +
        '<span style="margin-left:2px;">adjust %</span>';
      var addBtn = body.querySelector('button[onclick="window.addGradeEntry()"]');
      if (addBtn) {
        addBtn.insertAdjacentElement('afterend', hint);
      } else {
        body.appendChild(hint);
      }
    }

    // Mobile +/- steppers on each percent input
    Array.prototype.slice.call(container.querySelectorAll('.grade-row')).forEach(function (row) {
      if (row.querySelector('.gr-stepper-wrap')) return;
      var pctInput = row.querySelector('input[type=number]');
      if (!pctInput) return;

      var wrap = document.createElement('div');
      wrap.className = 'gr-stepper-wrap';
      wrap.setAttribute('aria-hidden', 'true');

      var minusBtn = document.createElement('button');
      minusBtn.className = 'gr-stepper-btn minus';
      minusBtn.type = 'button';
      minusBtn.setAttribute('tabindex', '-1');
      minusBtn.setAttribute('aria-label', 'Decrease minimum %');
      minusBtn.textContent = '\u2212';
      (function (inp) {
        minusBtn.addEventListener('click', function (ev) {
          ev.preventDefault(); inp.focus(); nudgeGradePct(inp, -1);
        });
      })(pctInput);

      var plusBtn = document.createElement('button');
      plusBtn.className = 'gr-stepper-btn plus';
      plusBtn.type = 'button';
      plusBtn.setAttribute('tabindex', '-1');
      plusBtn.setAttribute('aria-label', 'Increase minimum %');
      plusBtn.textContent = '+';
      (function (inp) {
        plusBtn.addEventListener('click', function (ev) {
          ev.preventDefault(); inp.focus(); nudgeGradePct(inp, +1);
        });
      })(pctInput);

      wrap.appendChild(minusBtn);
      wrap.appendChild(plusBtn);

      var pctSign = row.querySelector('.pct-sign');
      if (pctSign) {
        pctSign.insertAdjacentElement('afterend', wrap);
      } else {
        var swatch = row.querySelector('.grade-color-swatch');
        if (swatch) swatch.insertAdjacentElement('beforebegin', wrap);
        else row.appendChild(wrap);
      }
    });
  }

})();



/* ══════════════════════════════════════════════════════════════════
   MOBILE FLOATING ROW-NAV — Grade Panel & Pass Mark Panel
   Replaces the hidden +/- stepper buttons on touch/mobile screens.

   ▲ / ▼  → navigate rows
   ✏️ Edit → open bottom-sheet (large number input + slider)
   Single-tap row → select it in the nav bar
   Double-tap row → open bottom-sheet immediately
   Swipe up/down inside a panel → move to next/prev row
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var sheetCtx      = null;
  var lastDoubleTap = 0;

  /* ── Grade Panel ─────────────────────────── */

  function gradeRows() {
    return Array.from(document.querySelectorAll('#gradeRowsContainer .grade-row'));
  }

  /* Grade rows: double-tap still opens the bottom-sheet editor */
  document.addEventListener('click', function (e) {
    if (!e.target) return;
    var row = e.target.closest('#gradeRowsContainer .grade-row');
    if (row) {
      var rows = gradeRows();
      var idx  = rows.indexOf(row);
      if (idx < 0) return;
      var now  = Date.now();
      if (now - lastDoubleTap < 380) { openSheet('grade', idx); }
      lastDoubleTap = now;
    }
  });

  /* ── Pass Mark Panel ──────────────────────── */

  function passRows() {
    return Array.from(document.querySelectorAll('#passmarkPanelBody .passmark-subject-row'));
  }

  /* Pass mark rows: double-tap still opens the bottom-sheet editor */
  document.addEventListener('click', function (e) {
    if (!e.target) return;
    var row = e.target.closest('#passmarkPanelBody .passmark-subject-row');
    if (row) {
      var rows = passRows();
      var idx  = rows.indexOf(row);
      if (idx < 0) return;
      var now  = Date.now();
      if (now - lastDoubleTap < 380) { openSheet('pass', idx); }
      lastDoubleTap = now;
    }
  });

  /* ── Bottom-sheet editor ─────────────────── */

  function openSheet(panel, idx) {
    sheetCtx = { panel: panel, idx: idx };
    var titleEl  = document.getElementById('pmnSheetTitle');
    var labelEl  = document.getElementById('pmnSheetLabel');
    var inputEl  = document.getElementById('pmnSheetInput');
    var sliderEl = document.getElementById('pmnSheetSlider');
    var val, title, label;

    if (panel === 'grade') {
      var rows   = gradeRows();
      var row    = rows[idx];
      if (!row) return;
      var pctInp = row.querySelector('input[type=number]');
      var lblInp = row.querySelector('input[type=text]');
      val   = pctInp ? parseFloat(pctInp.value) || 0 : 0;
      var gl = lblInp ? lblInp.value : '?';
      title = 'Edit Grade: ' + gl;
      label = 'Minimum threshold for "' + gl + '" (%)';
    } else {
      var pRows  = passRows();
      var pRow   = pRows[idx];
      if (!pRow) return;
      var pInp   = pRow.querySelector('.passmark-subject-input');
      var nameEl = pRow.querySelector('.passmark-subject-name');
      val   = pInp ? parseFloat(pInp.value || pInp.placeholder) || 50 : 50;
      var sn = nameEl ? nameEl.textContent.trim() : 'Subject';
      title = 'Pass Mark: ' + sn;
      label = 'Pass mark for "' + sn + '" (%)';
    }

    if (titleEl)  titleEl.textContent = title;
    if (labelEl)  labelEl.textContent = label;
    if (inputEl)  inputEl.value       = val;
    if (sliderEl) sliderEl.value      = val;

    if (inputEl && sliderEl) {
      inputEl.oninput  = function () { sliderEl.value = inputEl.value; };
      sliderEl.oninput = function () { inputEl.value  = sliderEl.value; };
    }

    var overlay = document.getElementById('pmnEditOverlay');
    if (overlay) {
      overlay.classList.add('open');
      overlay.onclick = function (e) { if (e.target === overlay) pmnCloseSheet(); };
    }
    setTimeout(function () { if (inputEl) { inputEl.focus(); inputEl.select(); } }, 290);
  }

  window.pmnApplySheet = function () {
    if (!sheetCtx) return;
    var inputEl = document.getElementById('pmnSheetInput');
    var val = Math.max(0, Math.min(100, parseFloat(inputEl ? inputEl.value : 0) || 0));

    if (sheetCtx.panel === 'grade') {
      var rows   = gradeRows();
      var row    = rows[sheetCtx.idx];
      if (row) {
        var pctInp = row.querySelector('input[type=number]');
        if (pctInp) {
          pctInp.value = val;
          if (typeof commitGradePct === 'function') window.commitGradePct(sheetCtx.idx, String(val));
        }
      }
      setTimeout(function () { /* nav bar removed */ }, 70);
    } else {
      var pRows  = passRows();
      var pRow   = pRows[sheetCtx.idx];
      if (pRow) {
        var pInp = pRow.querySelector('.passmark-subject-input');
        if (pInp) {
          pInp.value = val;
          // Pass the element directly — updateSubjectPassMark reads dataset.subject
          if (typeof window.updateSubjectPassMark === 'function')
            window.updateSubjectPassMark(pInp);
        }
      }
      setTimeout(function () { /* nav bar removed */ }, 70);
    }
    pmnCloseSheet();
  };

  window.pmnCloseSheet = function () {
    var overlay = document.getElementById('pmnEditOverlay');
    if (overlay) overlay.classList.remove('open');
    sheetCtx = null;
  };

})();
