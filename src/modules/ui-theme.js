// ═══════════════════════════════════════════════════════════════
//  src/modules/ui-theme.js
//  Dark mode engine, sidebar collapse engine, and mobile more-sheet.
//  Extracted from monolithic app.js during modularisation.
//  All functions exposed via window.* for HTML onclick= attributes.
// ═══════════════════════════════════════════════════════════════

// ════════════════════════════════════════════
//  DARK MODE ENGINE
// ════════════════════════════════════════════
(function() {
  const STORAGE_KEY = 'rsm_dark_mode';
  const ICON_MOON = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  const ICON_SUN  = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

  function getPreferred() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    const csMeta = document.querySelector('meta[name="color-scheme"]');
    if (csMeta) csMeta.setAttribute('content', dark ? 'dark' : 'light');
    const sw = document.getElementById('dmSwitch');
    const lbl = document.getElementById('dmLabel');
    const ico = document.getElementById('dmIcon');
    const icoC = document.getElementById('dmIconCollapsed');
    if (sw) sw.className = 'dm-switch' + (dark ? ' on' : '');
    if (lbl) lbl.textContent = dark ? 'Light mode' : 'Dark mode';
    if (ico) ico.innerHTML = dark ? ICON_SUN : ICON_MOON;
    if (icoC) icoC.innerHTML = dark ? ICON_SUN : ICON_MOON;
    const iconBtn = document.getElementById('dmIconBtn');
    if (iconBtn) iconBtn.setAttribute('data-label', dark ? 'Switch to Light mode' : 'Switch to Dark mode');
    const omSw  = document.getElementById('overflowThemeSwitch');
    const omLbl = document.getElementById('overflowThemeLabel');
    const omSub = document.getElementById('overflowThemeSub');
    const omIco = document.getElementById('overflowThemeIcon');
    if (omSw)  omSw.className  = 'omi-theme-switch' + (dark ? ' on' : '');
    if (omLbl) omLbl.textContent = dark ? 'Light mode' : 'Dark mode';
    if (omSub) omSub.textContent = dark ? 'Switch to light theme' : 'Switch to dark theme';
    if (omIco) omIco.innerHTML  = dark ? ICON_SUN : ICON_MOON;
    const tttTrack = document.getElementById('topbarThemeTrack');
    if (tttTrack) {
      if (dark) tttTrack.classList.add('dark-on');
      else      tttTrack.classList.remove('dark-on');
    }
  }

  // ── Click-origin-aware reveal helpers ──────────────────────────
  // Works out *where* the toggle was pressed (mouse/touch coordinates,
  // falling back to the control's own centre for keyboard activation),
  // then stores it as CSS vars so the radial-reveal keyframe in
  // motion.css can expand the new theme outward from that exact point.
  function getToggleOrigin(e) {
    if (e && typeof e.clientX === 'number' && (e.clientX !== 0 || e.clientY !== 0)) {
      return { x: e.clientX, y: e.clientY };
    }
    if (e && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function setFlipVars(origin) {
    const root = document.documentElement;
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y)
    );
    root.style.setProperty('--theme-flip-x', origin.x + 'px');
    root.style.setProperty('--theme-flip-y', origin.y + 'px');
    root.style.setProperty('--theme-flip-radius', (radius + 12) + 'px');
  }

  // Brief, one-shot ring bloom on the topbar thumb — only fires when
  // that's the control actually pressed; silently skipped otherwise
  // (sidebar switch, overflow item, mobile sheet row have no thumb).
  function pulseTopbarThumb() {
    const thumb = document.getElementById('topbarThemeThumb');
    if (!thumb) return;
    thumb.classList.remove('ttt-pulse');
    void thumb.offsetWidth; // force reflow so the animation can restart
    thumb.classList.add('ttt-pulse');
  }

  window.toggleDarkMode = function(e) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = !isDark;
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');

    function applyAndRerender() {
      applyTheme(next);
      // Re-render JS-painted elements that use inline colour palettes
      if (window.renderCategoryButtons) window.renderCategoryButtons();
      if (window.renderSubjectTags) window.renderSubjectTags();
      if (window.renderSubjectCategoryPicker) window.renderSubjectCategoryPicker();
      if (window.renderMarksTable) window.renderMarksTable();
      if (window.renderResultsTable && window.results && window.results.length) window.renderResultsTable();
      if (window.renderSubjectAnalytics && window.renderSubjectAnalytics._pendingData) {
        window.renderSubjectAnalytics();
      }
    }

    pulseTopbarThumb();

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsViewTransition = typeof document.startViewTransition === 'function';

    if (!supportsViewTransition || reduceMotion) {
      applyAndRerender();
      return;
    }

    setFlipVars(getToggleOrigin(e));
    document.startViewTransition(applyAndRerender);
  };

  // Initialise immediately (before paint)
  applyTheme(getPreferred());

  // Re-apply after DOM ready (ensures toggle UI elements are present)
  document.addEventListener('DOMContentLoaded', function() {
    applyTheme(getPreferred());
  });

  // Listen to OS-level changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        applyTheme(e.matches);
      }
    });
  }
})();

// ════════════════════════════════════════════
//  SIDEBAR COLLAPSE ENGINE
// ════════════════════════════════════════════
(function() {
  const SK = 'rsm_sidebar_collapsed';

  function applyCollapsed(collapsed) {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebarCollapseBtn');
    const chipCollapsed = document.getElementById('sidebarExamChipCollapsed');
    const chip = document.getElementById('sidebarExamChip');
    if (!sidebar) return;

    if (collapsed) {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      if (btn) btn.title = 'Expand sidebar';
      if (chip) chip.style.display = 'none';
      if (chipCollapsed) chipCollapsed.style.display = 'flex';
    } else {
      sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      if (btn) btn.title = 'Collapse sidebar';
      if (chip) chip.style.display = '';
      if (chipCollapsed) chipCollapsed.style.display = 'none';
    }
  }

  window.toggleSidebarCollapse = function() {
    if (window.innerWidth <= 900) return;
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar && sidebar.classList.contains('collapsed');
    const next = !isCollapsed;
    localStorage.setItem(SK, next ? '1' : '0');
    applyCollapsed(next);
  };

  function syncCollapseToViewport() {
    const w = window.innerWidth;
    if (w > 900) {
      const saved = localStorage.getItem(SK);
      applyCollapsed(saved === '1');
    } else {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
    }
  }

  document.addEventListener('DOMContentLoaded', syncCollapseToViewport);

  var _resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(syncCollapseToViewport, 80);
  });
})();

// ════════════════════════════════════════════
//  MORE SHEET (mobile bottom nav overflow)
// ════════════════════════════════════════════
window.openMoreSheet = function() {
  const overlay = document.getElementById('moreSheetOverlay');
  if (!overlay) return;
  window.updateMoreSheetDmSwitch();
  window.updateMoreSheetUndoState();
  window.updateMoreSheetSaveTimestamp();
  window.updateMoreSheetDeviceSave();
  const examSub = document.getElementById('msExamSub');
  if (examSub) {
    const examName = (document.getElementById('examSelectorName') || {}).textContent || '';
    examSub.textContent = examName ? 'Current: ' + examName : 'Manage terms & exams';
  }
  overlay.classList.add('open');
  const bnavMore = document.getElementById('bnav-more');
  if (bnavMore) bnavMore.classList.add('active');
};

window.closeMoreSheet = function() {
  const overlay = document.getElementById('moreSheetOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  const bnavMore = document.getElementById('bnav-more');
  if (bnavMore) bnavMore.classList.remove('active');
};

window.updateMoreSheetDmSwitch = function() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const sw = document.getElementById('msDmSwitch');
  const lbl = document.getElementById('msDmLabel');
  const sub = document.getElementById('msDmSub');
  const icon = document.getElementById('msDmIcon');
  if (sw)  { sw.classList.toggle('on', isDark); }
  if (lbl) { lbl.textContent = isDark ? 'Light Mode' : 'Dark Mode'; }
  if (sub) { sub.textContent = isDark ? 'Switch to light theme' : 'Switch to dark theme'; }
  if (icon) {
    icon.innerHTML = isDark
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
};

window.updateMoreSheetUndoState = function() {
  const sub  = document.getElementById('msUndoSub');
  const icon = document.getElementById('msUndoIcon');
  const row  = document.getElementById('msUndoRow');
  const count = (window.undoStack && window.undoStack.length) ? window.undoStack.length : 0;
  if (sub)  sub.textContent  = count > 0 ? count + ' action' + (count > 1 ? 's' : '') + ' available' : 'No actions to undo';
  if (icon) icon.style.opacity = count > 0 ? '1' : '0.4';
  if (row)  row.style.opacity  = count > 0 ? '1' : '0.55';
};

window.updateMoreSheetSaveTimestamp = function() {
  const el = document.getElementById('autosaveTimestamp');
  const ms = document.getElementById('msSaveTimestamp');
  const pillLabel = document.getElementById('mobileSavePillLabel');
  if (ms) {
    const txt = (pillLabel && pillLabel.textContent && !pillLabel.textContent.includes('Unsaved') && !pillLabel.textContent.includes('Saving'))
      ? pillLabel.textContent
      : (el ? (el.textContent || el.innerText || '').trim() : '');
    ms.textContent = txt || 'Saves data to browser storage';
  }
};

window.updateMoreSheetDeviceSave = function() {
  const msDot  = document.getElementById('msSaveDeviceDot');
  const msSub  = document.getElementById('msSaveDeviceSub');
  const msIcon = document.getElementById('msSaveDeviceIcon');
  if (!msSub) return;

  if (window.StorageEngine && !window.StorageEngine.isSupported()) {
    if (msDot)  msDot.style.background  = '#f59e0b';
    if (msSub)  msSub.textContent = 'Export / import backup file';
    if (msIcon) { msIcon.style.background = 'rgba(245,158,11,0.12)'; msIcon.style.color = '#d97706'; }
  } else if (window.StorageEngine && window.StorageEngine.isFileBased()) {
    const btn = document.getElementById('saveLocationBtn');
    const folderName = btn && btn.classList.contains('needs-auth')
      ? 'Re-authorize folder'
      : (document.getElementById('saveLocationLabel') || {}).textContent || 'Device folder';
    if (msDot)  msDot.style.background  = btn && btn.classList.contains('needs-auth') ? '#f59e0b' : '#22c55e';
    if (msSub)  msSub.textContent = '📁 ' + folderName;
    if (msIcon) { msIcon.style.background = 'rgba(34,197,94,0.15)'; msIcon.style.color = '#16a34a'; }
  } else {
    if (msDot)  msDot.style.background  = '#6b7280';
    if (msSub)  msSub.textContent = 'Choose folder or download backup';
    if (msIcon) { msIcon.style.background = 'rgba(34,197,94,0.12)'; msIcon.style.color = '#16a34a'; }
  }
};

// Close on swipe-down
(function() {
  let startY = 0;
  document.addEventListener('touchstart', function(e) {
    const sheet = document.getElementById('moreSheet');
    if (sheet && sheet.contains(e.target)) startY = e.touches[0].clientY;
  }, {passive: true});
  document.addEventListener('touchend', function(e) {
    const sheet = document.getElementById('moreSheet');
    const overlay = document.getElementById('moreSheetOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    if (sheet && sheet.contains(e.target)) {
      const dy = e.changedTouches[0].clientY - startY;
      if (dy > 60) window.closeMoreSheet();
    }
  }, {passive: true});
})();
