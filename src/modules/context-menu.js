// ═══════════════════════════════════════════════════════════════
//  src/modules/context-menu.js
//  Right-click / long-press context menu on marks table cells.
//  Bulk fill column, clear column, copy-down, fill toast.
// ═══════════════════════════════════════════════════════════════
/* ══════════════════════════════════════════════════════════════════
   FILL-DOWN / BULK MARK CONTEXT MENU
   ══════════════════════════════════════════════════════════════════ */
(function () {

  var _ctxSj     = -1;
  var _ctxSrcSi  = -1;
  var _ctxSrcVal = null;
  var _longPressTimer = null;
  var LONG_PRESS_MS   = 480;

  function showContextMenu(x, y, sj, srcSi, srcVal) {
    _ctxSj     = sj;
    _ctxSrcSi  = srcSi;
    _ctxSrcVal = srcVal;

    var menu = document.getElementById('fillContextMenu');
    var subj = (typeof subjects !== 'undefined') ? subjects[sj] : null;
    var name = subj ? subj.name : 'Column';
    var max  = subj ? subj.max  : '?';

    document.getElementById('fcmHeader').textContent = name + '  ·  max ' + max;

    /* ── Mobile-friendly labels ── */
    var isMobileView = window.innerWidth <= 768 ||
      /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent);

    var fillValueBtn      = document.getElementById('fcmFillValue');
    var fillAbsentBtn     = document.getElementById('fcmFillAbsent');
    var clearColBtn       = document.getElementById('fcmClearColumn');
    var cellAbsentBtn     = document.getElementById('fcmCellAbsent');

    // Per-cell absent toggle: only show when right-clicking a specific row cell
    var hasCellContext = srcSi >= 0 && srcSi < (typeof students !== 'undefined' ? students.length : 0);
    if (cellAbsentBtn) {
      if (hasCellContext) {
        var student = (typeof students !== 'undefined') ? students[srcSi] : null;
        var currentMark = (student && typeof marks !== 'undefined') ? marks[student.name + '||' + name] : null;
        var isCurrentlyAbsent = currentMark === 'AB';
        cellAbsentBtn.style.display = '';
        var lastNode = cellAbsentBtn.childNodes[cellAbsentBtn.childNodes.length - 1];
        if (lastNode) lastNode.textContent = isCurrentlyAbsent
          ? ' Clear absent (restore cell)'
          : ' Mark this student absent';
        cellAbsentBtn.style.color = isCurrentlyAbsent ? '' : '#dc2626';
        cellAbsentBtn.style.fontWeight = '600';
      } else {
        cellAbsentBtn.style.display = 'none';
      }
    }

    if (isMobileView) {
      fillValueBtn.childNodes[fillValueBtn.childNodes.length - 1].textContent  = ' Fill all students with value\u2026';
      fillAbsentBtn.childNodes[fillAbsentBtn.childNodes.length - 1].textContent = ' Mark ALL students absent';
      clearColBtn.childNodes[clearColBtn.childNodes.length - 1].textContent    = ' Clear all marks for this subject';
    } else {
      fillValueBtn.childNodes[fillValueBtn.childNodes.length - 1].textContent  = ' Fill column with value\u2026';
      fillAbsentBtn.childNodes[fillAbsentBtn.childNodes.length - 1].textContent = ' Mark all absent in column';
      clearColBtn.childNodes[clearColBtn.childNodes.length - 1].textContent    = ' Clear entire column';
    }

    var copyBtn = document.getElementById('fcmCopyDown');
    if (srcVal !== null && srcVal !== '' && srcVal !== 'AB' && !isNaN(parseFloat(srcVal))) {
      copyBtn.style.display = '';
      var copyLabel = isMobileView
        ? 'Copy mark to all students below (' + parseFloat(srcVal) + ')'
        : 'Copy mark down (' + parseFloat(srcVal) + ')';
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg> ' + copyLabel;
    } else {
      copyBtn.style.display = 'none';
    }

    menu.classList.add('visible');

    requestAnimationFrame(function () {
      var mw = menu.offsetWidth  || 235;
      var mh = menu.offsetHeight || 190;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      menu.style.left = Math.min(x + 2, vw - mw - 8) + 'px';
      menu.style.top  = Math.min(y + 2, vh - mh - 8) + 'px';
    });
  }

  function hideContextMenu() {
    document.getElementById('fillContextMenu').classList.remove('visible');
  }

  document.addEventListener('click', function (e) {
    if (!document.getElementById('fillContextMenu').contains(e.target)) hideContextMenu();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideContextMenu();
  });

  function sjFromEl(el) {
    if (!el) return -1;
    if (el.dataset && el.dataset.sj !== undefined) return parseInt(el.dataset.sj);
    var a = el.closest ? el.closest('[data-sj]') : null;
    return a ? parseInt(a.dataset.sj) : -1;
  }
  function siFromEl(el) {
    if (!el) return -1;
    if (el.dataset && el.dataset.si !== undefined) return parseInt(el.dataset.si);
    var a = el.closest ? el.closest('[data-si]') : null;
    return a ? parseInt(a.dataset.si) : -1;
  }
  function valFromEl(el, si, sj) {
    if (si < 0 || sj < 0) return null;
    if (typeof students === 'undefined' || typeof marks === 'undefined' || typeof subjects === 'undefined') return null;
    var student = students[si]; var subj = subjects[sj];
    if (!student || !subj) return null;
    var v = marks[student.name + '||' + subj.name];
    return (v === undefined) ? '' : String(v);
  }

  /* ── Desktop: right-click ── */
  document.addEventListener('contextmenu', function (e) {
    var inDesk = e.target.closest && e.target.closest('#marksTable');
    var inMob  = e.target.closest && e.target.closest('#marksCardView');
    if (!inDesk && !inMob) return;

    var sj = sjFromEl(e.target);

    /* Try to get sj from <th> column index */
    if (sj < 0 && inDesk) {
      var th = e.target.closest ? e.target.closest('th') : null;
      if (th) {
        var allThs = Array.from(th.closest('tr').querySelectorAll('th'));
        var ci = allThs.indexOf(th) - 2; // offset: Index + Name
        if (ci >= 0) sj = ci;
      }
    }
    if (sj < 0) return;

    e.preventDefault();
    var si  = siFromEl(e.target);
    var val = valFromEl(e.target, si, sj);
    showContextMenu(e.clientX, e.clientY, sj, si, val);
  });

  /* ── Mobile: long-press ── */
  document.addEventListener('touchstart', function (e) {
    var inDesk = e.target.closest && e.target.closest('#marksTable');
    var inMob  = e.target.closest && e.target.closest('#marksCardView');
    if (!inDesk && !inMob) return;
    var sj = sjFromEl(e.target);
    if (sj < 0) return;

    var t0 = e.touches[0];
    var x0 = t0.clientX, y0 = t0.clientY;
    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(function () {
      var si  = siFromEl(e.target);
      var val = valFromEl(e.target, si, sj);
      if (navigator.vibrate) navigator.vibrate(25);
      showContextMenu(x0, y0, sj, si, val);
    }, LONG_PRESS_MS);
  }, { passive: true });

  ['touchend','touchmove','touchcancel'].forEach(function (ev) {
    document.addEventListener(ev, function () { clearTimeout(_longPressTimer); }, { passive: true });
  });

  /* ═══ Actions ═══ */

  window.ctxFillValue = function () {
    hideContextMenu();
    var subj = (typeof subjects !== 'undefined') ? subjects[_ctxSj] : null;
    if (!subj) return;
    document.getElementById('fvSubjectLabel').textContent = subj.name + '  (max ' + subj.max + ')';
    document.getElementById('fvHint').textContent = '';
    document.getElementById('fvInput').value = '';
    document.getElementById('fvInput').max = subj.max;
    document.getElementById('fillValueOverlay').classList.add('open');
    setTimeout(function () { document.getElementById('fvInput').focus(); }, 80);
  };

  window.closeFillValuePrompt = function () {
    document.getElementById('fillValueOverlay').classList.remove('open');
  };

  window.confirmFillValue = function () {
    var raw = document.getElementById('fvInput').value.trim();
    if (raw === '') { document.getElementById('fvHint').textContent = 'Enter a mark value first.'; return; }
    var val = parseFloat(raw);
    var subj = subjects[_ctxSj];
    if (isNaN(val)) { document.getElementById('fvHint').textContent = 'Please enter a valid number.'; return; }
    if (val < 0)    { document.getElementById('fvHint').textContent = 'Value must be 0 or above.'; return; }
    if (val > subj.max) { document.getElementById('fvHint').textContent = 'Exceeds max mark (' + subj.max + ').'; return; }
    _bulkSetColumn(_ctxSj, val);
    closeFillValuePrompt();
    _showFillToast('✓ Filled ' + students.length + ' cells with ' + val + ' in ' + subj.name);
  };

  window.ctxFillAbsent = function () {
    hideContextMenu();
    if (_ctxSj < 0) return;
    var subj = subjects[_ctxSj];
    // Use bulkMarkAbsent to set the "AB" sentinel for all students
    if (typeof window.bulkMarkAbsent === 'function') {
      window.bulkMarkAbsent(_ctxSj);
      _showFillToast('🚫 Marked all students absent for ' + subj.name);
    } else {
      _bulkSetColumn(_ctxSj, '');
      _showFillToast('✓ Marked all absent in ' + subj.name);
    }
  };

  // Per-cell absent toggle — called from context menu when right-clicking a specific cell
  window.ctxToggleCellAbsent = function () {
    hideContextMenu();
    if (_ctxSj < 0 || _ctxSrcSi < 0) return;
    if (typeof window.toggleAbsent === 'function') {
      window.toggleAbsent(_ctxSrcSi, _ctxSj);
    }
  };

  window.ctxClearColumn = function () {
    hideContextMenu();
    if (_ctxSj < 0) return;
    var subj = subjects[_ctxSj];
    _bulkSetColumn(_ctxSj, '');
    _showFillToast('✓ Cleared column: ' + subj.name);
  };

  window.ctxCopyDown = function () {
    hideContextMenu();
    if (_ctxSj < 0 || _ctxSrcSi < 0 || _ctxSrcVal === null || _ctxSrcVal === '') return;
    var val  = parseFloat(_ctxSrcVal);
    var subj = subjects[_ctxSj];
    // Snapshot for undo before modifying
    if (typeof _takeSnapshot === 'function') {
      window._takeSnapshot('Marks filled down: ' + subj.name, '📋');
    }
    var count = 0;
    students.forEach(function (student, si) {
      if (si < _ctxSrcSi) return;
      marks[student.name + '||' + subj.name] = val;
      count++;
    });
    // Full re-render to keep elective locks consistent
    if (typeof renderMarksTable === 'function') {
      window.renderMarksTable();
    }
    if (typeof _refreshUndoUI === 'function') window._refreshUndoUI();
    _showFillToast('✓ Copied ' + val + ' to ' + count + ' rows in ' + subj.name);
  };

  function _bulkSetColumn(sj, val) {
    var subj = subjects[sj];
    // ── Take undo snapshot BEFORE modifying marks ──
    // Use the proper undo system so Ctrl+Z restores correctly.
    if (typeof _takeSnapshot === 'function') {
      var label = val === '' ? 'Clear column: ' + subj.name : 'Fill column: ' + subj.name + ' = ' + val;
      window._takeSnapshot(label, '📋');
    }
    students.forEach(function (student) {
      // BUG FIX: guard against NaN — parseFloat('') = NaN which JSON-serializes
      // as null, corrupting the marks snapshot and causing wrong lock states after undo.
      var numVal = val === '' ? '' : parseFloat(val);
      marks[student.name + '||' + subj.name] = (typeof numVal === 'number' && isNaN(numVal)) ? '' : numVal;
    });
    // Full re-render so elective lock state is always consistent after bulk changes.
    // Partial DOM refresh (_refreshColumnDOM) skips refreshAllElectiveLocks which
    // can leave some inputs disabled/locked after a Ctrl+Z undo.
    if (typeof renderMarksTable === 'function') {
      window.renderMarksTable();
    }
    if (typeof _refreshUndoUI === 'function') window._refreshUndoUI();
  }

  // _refreshColumnDOM kept for copy-down partial updates only
  function _refreshColumnDOM(sj) {
    var subj = subjects[sj];
    students.forEach(function (student, si) {
      var key = student.name + '||' + subj.name;
      var v   = marks[key];
      var display = (v === '' || v === undefined) ? '' : v;
      var over    = typeof v === 'number' && v > subj.max;

      var di = document.querySelector('#marksTable input[data-si="'+si+'"][data-sj="'+sj+'"]');
      if (di) { di.value = display; di.classList.toggle('over-max', over); }

      var mi = document.querySelector('#marksCardView input[data-si="'+si+'"][data-sj="'+sj+'"]');
      if (mi) { mi.value = display; mi.classList.toggle('over-max', over); }

      if (typeof updateRowTotal  === 'function') window.updateRowTotal(si);
      if (typeof updateCardTotal === 'function') updateCardTotal(si);
    });
  }

  function _showFillToast(msg) {
    var old = document.getElementById('fillToast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'fillToast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.setAttribute('aria-atomic', 'true');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#0f172a;color:#fff;padding:10px 20px;border-radius:10px;' +
      'font-size:13px;font-weight:600;z-index:99999;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.35);white-space:nowrap;max-width:90vw;' +
      'text-align:center;animation:ftIn 0.2s ease;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) {
        t.style.opacity = '0'; t.style.transition = 'opacity 0.3s';
        setTimeout(function () { if (t.parentNode) t.remove(); }, 320);
      }
    }, 2600);
  }

})();


