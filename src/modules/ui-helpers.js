// ═══════════════════════════════════════════════════════════════
//  src/modules/ui-helpers.js
//  Shared UI utilities: toast, badges, navigation, sidebar,
//  topbar overflow menu, and theme-aware colour palette helpers.
// ═══════════════════════════════════════════════════════════════
// ── Navigation ──
function goToStep(n) {
  // If the step is locked, show a gentle toast instead of navigating
  const targetEl = document.getElementById('step-' + n);
  if (targetEl && targetEl.classList.contains('locked')) {
    window.toast('Complete setup (students & subjects) first', 'warn');
    return;
  }

  const fromStep = currentStep;
  currentStep = n;
  document.querySelectorAll('.section').forEach((s, i) => {
    // Direction-aware "Glass Page-Turn" transition: entering step slides
    // in from the left when moving backward through the wizard, from the
    // right when moving forward.
    if (i === n) s.classList.toggle('gf-dir-back', n < fromStep);
    s.classList.toggle('active', i === n);
  });

  // ── Two-zone step bar ──
  const allSteps = document.querySelectorAll('.step-setup, .step-active');
  allSteps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i === n) s.classList.add('active');
    else if (i < n) s.classList.add('done');

    const num = s.querySelector('.step-num');
    if (!num) return;
    if (i < n) {
      num.innerHTML = `<svg viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;
    } else {
      num.textContent = i + 1;
    }
  });

  // ── Setup zone: auto-collapse when on an active step (3–5), expand when on setup (0–2) ──
  const setupZone = document.getElementById('stepsSetupZone');
  if (setupZone) {
    if (n >= 3) {
      // Entering active-use area — collapse setup zone to save space
      setupZone.classList.remove('expanded');
    } else {
      // Within setup — keep expanded
      setupZone.classList.add('expanded');
    }
  }

  // ── Summary pills state (always visible in header) ──
  for (let i = 0; i < 3; i++) {
    const pill = document.getElementById('ssp-' + i);
    if (!pill) continue;
    pill.classList.remove('active', 'done');
    if (i === n) pill.classList.add('active');
    else if (i < n) pill.classList.add('done');
  }

  // Sidebar nav items
  // Exclude the branding nav item (not a numbered step) from active toggle
  document.querySelectorAll('.nav-item:not(#nav-branding)').forEach((el, i) => el.classList.toggle('active', i === n));

  // ── Bottom nav (mobile) ──
  document.querySelectorAll('.bottom-nav-item').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });

  // Topbar title
  document.getElementById('topbarTitle').textContent = stepMeta[n].title;
  document.getElementById('topbarSub').textContent = stepMeta[n].sub;

  // ── Tab-specific renders ──
  // These rebuild large tables/charts (40 students × 24 subjects, etc.) via
  // innerHTML and can take 200-700ms — running them synchronously inside the
  // click handler blocks the browser from painting the tab-switch feedback
  // (active states, topbar title) until after the heavy work finishes, which
  // shows up as a poor Interaction to Next Paint (INP). Deferring to the next
  // animation frame lets the "instant" feedback paint first, then the table
  // renders in the following frame — same end result, much snappier feel.
  if (n === 3) {
    // Force-enable all inputs before re-applying elective locks. This prevents
    // stale disabled states that can persist if undo/fill operations ran while
    // the marks tab was not visible.
    document.querySelectorAll('#marksTable .mark-input, #marksCardView .mark-subject-input').forEach(function (inp) {
      inp.disabled = false;
      inp.classList.remove('elective-locked', 'elective-chosen');
    });
    requestAnimationFrame(function () {
      window.renderMarksTable();
      if (typeof students !== 'undefined' && typeof refreshAllElectiveLocks === 'function') {
        students.forEach(function (_, i) { window.refreshAllElectiveLocks(i); });
      }
    });
    setTimeout(updateGradeCurrentBadge, 0);
  }
  if (n === 4 && results.length) {
    requestAnimationFrame(function () { window.renderResultsTable(); });
  }
  if (n === 5 && typeof window.renderSubjectAnalytics === 'function') {
    requestAnimationFrame(function () { window.renderSubjectAnalytics(); });
  }

  // Close sidebar on mobile/tablet when navigating
  closeSidebar();

  // Scroll to top on mobile
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Step lock management ──
// Call whenever students or subjects change to update locked/unlocked visual state of steps 3–5.
function updateStepLocks() {
  const hasStudents = typeof students !== 'undefined' && students.length > 0;
  const hasSubjects = typeof subjects !== 'undefined' && subjects.length > 0;
  const setupDone   = hasStudents && hasSubjects;

  const activeStepEls = [
    document.getElementById('step-3'),
    document.getElementById('step-4'),
    document.getElementById('step-5'),
  ];

  activeStepEls.forEach(function(el) {
    if (!el) return;
    if (setupDone) {
      el.classList.remove('locked');
      el.removeAttribute('data-lock-tip');
    } else {
      // Only lock if not currently the active step
      if (!el.classList.contains('active')) {
        el.classList.add('locked');
        const tip = !hasStudents && !hasSubjects
          ? 'Add students & subjects first'
          : !hasStudents
          ? 'Add students first'
          : 'Add subjects first';
        el.setAttribute('data-lock-tip', tip);
      }
    }
  });

  // Also update bottom nav disabled look
  const bnavEls = [
    document.getElementById('bnav-3'),
    document.getElementById('bnav-4'),
    document.getElementById('bnav-5'),
  ];
  bnavEls.forEach(function(el) {
    if (!el) return;
    if (setupDone) {
      el.removeAttribute('title');
      el.style.opacity = '';
    } else {
      el.title = 'Complete setup first';
    }
  });
}

// ── Setup zone expand/collapse toggle ──
function toggleSetupZone() {
  const zone = document.getElementById('stepsSetupZone');
  if (zone) zone.classList.toggle('expanded');
}

// ── Sidebar toggle (tablet) ──
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ── Topbar overflow menu ──
function toggleTopbarOverflow() {
  const menu = document.getElementById('topbarOverflowMenu');
  const btn  = document.getElementById('topbarOverflowBtn');
  const isOpen = menu.classList.contains('open');
  if (isOpen) { closeTopbarOverflow(); }
  else {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', _topbarOverflowOutsideClick, { once: true });
    }, 0);
  }
}
function closeTopbarOverflow() {
  const menu = document.getElementById('topbarOverflowMenu');
  const btn  = document.getElementById('topbarOverflowBtn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
}
function _topbarOverflowOutsideClick(e) {
  const wrap = document.getElementById('topbarOverflowWrap');
  if (wrap && !wrap.contains(e.target)) { closeTopbarOverflow(); }
}

// ── Toast ──
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // ── Deduplication: if an identical toast is already visible, just bump its timer ──
  const existing = Array.from(container.children).find(
    t => t.dataset.type === type && (t.querySelector('span')?.textContent === msg || t.textContent.replace('×','').trim() === msg)
  );
  if (existing) {
    // Reset its auto-remove timer
    clearTimeout(parseInt(existing.dataset.timerId));
    const tid = setTimeout(() => existing.remove(), 3000);
    existing.dataset.timerId = tid;
    // Briefly pulse it so the user sees it reacted
    existing.style.transition = 'opacity 0.1s';
    existing.style.opacity = '0.6';
    setTimeout(() => { existing.style.opacity = ''; }, 150);
    return;
  }

  // ── Cap total toasts to 3 — remove oldest if exceeded ──
  while (container.children.length >= 3) {
    const oldest = container.firstChild;
    clearTimeout(parseInt(oldest?.dataset?.timerId));
    oldest?.remove();
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.dataset.type = type;
  // Screen-reader role: 'alert' for errors (assertive interrupt), 'status' for info/success (polite)
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  // Text node + close button
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.onclick = () => { clearTimeout(parseInt(el.dataset.timerId)); el.remove(); };
  el.appendChild(closeBtn);
  container.appendChild(el);
  const tid = setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
  el.dataset.timerId = String(tid);
}

// ── Download prompt tip ──────────────────────────────────────────
// Browsers like Edge/Chrome show a native "What do you want to do with
// this file?" bar after every download. GradeFlow can't suppress that —
// it's a browser security setting — so instead we show a one-time,
// dismissible tip that tells the user how to turn it off themselves.
function _gfDownloadBrowserHint() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) {
    return { name: 'Edge', loc: 'edge://settings/downloads', toggle: '"Ask what to do with each download before downloading"' };
  }
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
    return { name: 'Chrome', loc: 'chrome://settings/downloads', toggle: '"Ask where to save each file before downloading"' };
  }
  if (/Firefox\//.test(ua)) {
    return { name: 'Firefox', loc: 'Settings → General → Files and Applications', toggle: '"Always ask you where to save files"' };
  }
  return null; // Safari and others don't show this prompt
}

function showDownloadTip() {
  try {
    if (localStorage.getItem('gf-pdf-tip-dismissed') === '1') return;
  } catch(e) { /* ignore storage errors */ }
  if (document.getElementById('gfDownloadTip')) return; // already showing

  const hint = _gfDownloadBrowserHint();
  if (!hint) return;

  const card = document.createElement('div');
  card.id = 'gfDownloadTip';
  card.className = 'gf-download-tip';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML =
    '<div class="gf-dt-icon">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    + '</div>'
    + '<div class="gf-dt-body">'
      + '<div class="gf-dt-title">PDF downloaded</div>'
      + '<div class="gf-dt-text">Does ' + hint.name + ' ask <em>&ldquo;What do you want to do with this file?&rdquo;</em> every time? '
        + 'That\'s a browser setting — turn off ' + hint.toggle + ' in <strong>' + hint.loc + '</strong> and files will save straight to your Downloads folder.</div>'
      + '<div class="gf-dt-actions"><button class="gf-dt-btn" id="gfDtDismiss">Got it, don\'t show again</button></div>'
    + '</div>'
    + '<button class="gf-dt-close" id="gfDtClose" aria-label="Dismiss tip">&times;</button>';

  document.body.appendChild(card);
  requestAnimationFrame(() => card.classList.add('show'));

  const remove = () => {
    card.classList.remove('show');
    setTimeout(() => { if (card.parentNode) card.parentNode.removeChild(card); }, 200);
  };
  document.getElementById('gfDtDismiss').onclick = () => {
    try { localStorage.setItem('gf-pdf-tip-dismissed', '1'); } catch(e) {}
    remove();
  };
  document.getElementById('gfDtClose').onclick = remove;

  setTimeout(remove, 14000);
}


// ── Badge helper ──
function updateBadge(type, count) {
  // Sidebar expanded badge
  const el = document.getElementById(`badge-${type}`);
  if (el) el.textContent = count;
  // Sidebar collapsed dot badge
  const dot = document.getElementById(`badge-dot-${type}`);
  if (dot) {
    dot.textContent = count;
    dot.style.display = count > 0 ? '' : 'none';
  }
  // Bottom nav badge
  const bel = document.getElementById(`bnav-badge-${type}`);
  if (bel) {
    bel.textContent = count;
    bel.classList.toggle('has-count', count > 0);
  }
}

// ── Marks table ──
// ── Shared theme-aware colour palettes for JS-rendered tables ──
function _getTablePalette() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    return [
      { fg:'#60a5fa', bg:'#1e3a5f', border:'#2d4f7a' },
      { fg:'#34d399', bg:'#064e3b', border:'#0a6650' },
      { fg:'#fbbf24', bg:'#3d2c00', border:'#5a4200' },
      { fg:'#a78bfa', bg:'#2e1c6e', border:'#4a3090' },
      { fg:'#f87171', bg:'#450a0a', border:'#6b1212' },
      { fg:'#2dd4bf', bg:'#0c3a38', border:'#145550' },
    ];
  }
  return [
    { fg:'#1A56DB', bg:'#EFF6FF', border:'#BFDBFE' },
    { fg:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    { fg:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
    { fg:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
    { fg:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
    { fg:'#0D9488', bg:'#F0FDFA', border:'#99F6E4' },
  ];
}
// Fallback header bg for uncategorised / plain headers
function _thBgFallback() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? '#374151' : '#f8fafc';
}
function _thBgSubFallback() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d3748' : '#f1f5f9';
}
// Alternating row bg
function _rowAltBg() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'background:#323d4f;' : 'background:#fafbfc;';
}

// ── Window exports ──
Object.assign(window, {
  closeSidebar,
  closeTopbarOverflow,
  goToStep,
  updateStepLocks,
  openSidebar,
  toast,
  toggleSetupZone,
  toggleTopbarOverflow,
  updateBadge,
  showDownloadTip,
  _getTablePalette,
  _thBgFallback,
  _thBgSubFallback,
  _rowAltBg,
});
