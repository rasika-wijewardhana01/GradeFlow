(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     TOUR STEP DEFINITIONS
     Each step targets an element by CSS selector,
     defines where the tooltip appears, and the copy.
  ───────────────────────────────────────────── */
  var STEPS = [
    {
      // Welcome — no target element, centred overlay card
      target: null,
      position: 'center',
      icon: '👋',
      title: 'Welcome to GradeFlow!',
      body: "Let's take a <strong>60-second tour</strong> so you know exactly what to do. GradeFlow is your all-in-one grade & report card manager — no spreadsheets needed.",
      welcomeCard: true
    },
    {
      target: '#nav-0, #bnav-0',
      position: 'right',
      icon: '🏠',
      title: 'Setup — your starting point',
      body: "Start here every time. Enter your <strong>exam name</strong>, date, and grading scale. You can also add your school's branding for professional PDF reports."
    },
    {
      target: '#nav-1, #bnav-1',
      position: 'right',
      icon: '👨‍🎓',
      title: 'Add your students',
      body: "Tap <strong>Students</strong> to build your class list. Type names manually or paste a list. You can reorder, edit, or remove students at any time."
    },
    {
      target: '#nav-2, #bnav-2',
      position: 'right',
      icon: '📚',
      title: 'Define your subjects',
      body: "Add the subjects for this exam. You can set <strong>max marks</strong> per subject and group them (e.g. Required vs. Elective) for flexible class structures."
    },
    {
      target: '#nav-3, #bnav-3',
      position: 'right',
      icon: '✏️',
      title: 'Enter marks',
      body: "The heart of GradeFlow. Click any cell to type a mark — <strong>grades calculate automatically</strong>. Use Tab to move across the row and ↓ to move down. Swipe left/right on mobile to switch sections."
    },
    {
      target: '#nav-4, #bnav-4',
      position: 'right',
      icon: '📄',
      title: 'Results & report cards',
      body: "See ranked results and <strong>download PDF report cards</strong> — one per student or all at once. The professional layout includes your school branding automatically."
    },
    {
      target: '#nav-5, #bnav-5',
      position: 'right',
      icon: '📊',
      title: 'Analytics & insights',
      body: "Explore <strong>class performance charts</strong>, subject-wise averages, grade distribution, and more. Great for staff meetings and parent communication."
    },
    {
      target: '#kbHelpBtn, .marks-help-btn-mobile',
      position: 'left',
      positionMobile: 'top',
      padSides: [6, 6, 6, 6],
      goToSection: 3,
      scrollToCenter: true,
      icon: '⌨️',
      title: 'Keyboard shortcuts & help',
      bodyFn: function() { return window.innerWidth <= 767 ? "Tap the <strong>Help</strong> button in the toolbar anytime to see all shortcuts &amp; tips. Quick access to everything you need." : "Click this button (or press <strong>Shift+?</strong>) anytime to see all keyboard shortcuts. Power users can navigate the entire app without touching their mouse."; }
    },
    {
      target: null,
      position: 'center',
      icon: '🚀',
      title: "You're all set!",
      body: "That's the full workflow: <strong>Setup → Students → Subjects → Marks → Results</strong>. Click the <em>Guide</em> button in the header anytime to replay this walkthrough.",
      isLast: true
    }
  ];

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  var currentStep = 0;
  var isRunning   = false;
  var raf         = null;
  var startTime   = 0; // used for time-based animations (no jitter)

  /* ─────────────────────────────────────────────
     DOM REFS
  ───────────────────────────────────────────── */
  var overlay     = document.getElementById('gft-overlay');
  var canvas      = document.getElementById('gft-canvas');
  var ctx         = canvas.getContext('2d');
  var tooltip     = document.getElementById('gft-tooltip');
  var dots        = document.getElementById('gft-dots');
  var stepLabel   = document.getElementById('gft-step-label');
  var titleEl     = document.getElementById('gft-title');
  var bodyEl      = document.getElementById('gft-body');
  var skipBtn     = document.getElementById('gft-skip');
  var prevBtn     = document.getElementById('gft-prev');
  var nextBtn     = document.getElementById('gft-next');
  var arrowEl     = document.getElementById('gft-arrow');
  var replayBtn     = document.getElementById('gft-replay-btn');
  var headerTourBtn = document.getElementById('topbarTourBtn');

  var STORAGE_KEY = 'gf_tour_done_v1';

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */
  function getTarget(step) {
    if (!step.target) return null;
    var selectors = step.target.split(',');
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i].trim());
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function getRect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }

  function pad(r, amount) {
    return {
      top:    r.top    - amount,
      left:   r.left   - amount,
      width:  r.width  + amount * 2,
      height: r.height + amount * 2,
      bottom: r.bottom + amount,
      right:  r.right  + amount
    };
  }

  // Asymmetric padding — each side independent (top, right, bottom, left)
  function padSides(r, t, ri, b, l) {
    return {
      top:    r.top    - t,
      left:   r.left   - l,
      width:  r.width  + l + ri,
      height: r.height + t + b,
      bottom: r.bottom + b,
      right:  r.right  + ri
    };
  }
  /* ─────────────────────────────────────────────
     CANVAS SCRIM + SPOTLIGHT
  ───────────────────────────────────────────── */
  var targetRect   = null;
  var currentRect  = null;

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function lerpRect(a, b, t) {
    if (!a) return b;
    return {
      top:    a.top    + (b.top    - a.top)    * t,
      left:   a.left   + (b.left   - a.left)   * t,
      width:  a.width  + (b.width  - a.width)  * t,
      height: a.height + (b.height - a.height) * t,
      bottom: a.bottom + (b.bottom - a.bottom) * t,
      right:  a.right  + (b.right  - a.right)  * t
    };
  }

  function drawFrame(ts) {
    if (!isRunning) return;
    raf = requestAnimationFrame(drawFrame);

    if (!startTime) startTime = ts;
    var elapsed = (ts - startTime) / 1000; // seconds

    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var step = STEPS[currentStep];

    if (!step || step.position === 'center') {
      ctx.fillStyle = 'rgba(7,15,35,0.72)';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // ── Smooth lerp toward target ──
    if (targetRect) {
      if (!currentRect) currentRect = {
        top: H/2-40, left: W/2-80, width: 160, height: 80,
        bottom: H/2+40, right: W/2+80
      };
      currentRect = lerpRect(currentRect, targetRect, 0.11);
    }

    if (!currentRect) {
      ctx.fillStyle = 'rgba(7,15,35,0.72)';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    var r = currentRect;
    var radius = 10;

    // ── 1. SCRIM ──────────────────────────────────────
    // Simple, dark, clean — like Figma/Linear
    ctx.fillStyle = 'rgba(7,12,30,0.76)';
    ctx.fillRect(0, 0, W, H);

    // ── 2. PUNCH THE HOLE ─────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    rrect(ctx, r.left, r.top, r.width, r.height, radius);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();

    // ── 3. ALL DECORATIVE LAYERS ON TOP ───────────────
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // ── 3a. Very subtle soft inner shadow (depth hint) ──
    // Thin semi-transparent white fill INSIDE the cutout edges
    // gives a "lifted glass" feel — same trick Figma uses
    var innerGlow = ctx.createLinearGradient(r.left, r.top, r.left, r.bottom);
    innerGlow.addColorStop(0,   'rgba(255,255,255,0.04)');
    innerGlow.addColorStop(0.5, 'rgba(255,255,255,0.01)');
    innerGlow.addColorStop(1,   'rgba(255,255,255,0.00)');
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    rrect(ctx, r.left, r.top, r.width, r.height, radius);
    ctx.fill();

    // ── 3b. Steady border — clean 1.5px, always-on ──
    // Elegant blue, never pulses opacity — stays rock-solid
    ctx.strokeStyle = 'rgba(99,155,255,0.85)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    rrect(ctx, r.left, r.top, r.width, r.height, radius);
    ctx.stroke();

    // ── 3c. Single smooth pulse ring ──────────────────
    // Period: 2.4s. Uses a smooth easing function so it
    // eases out (slow expansion) rather than linear scroll.
    // Inspired by how Intercom / Notion do it.
    var period  = 2.4;
    var phase   = (elapsed % period) / period;           // 0 → 1 continuously
    var eased   = 1 - Math.pow(1 - phase, 3);            // ease-out cubic
    var expand  = eased * 22;                             // max 22px outward
    var ringOpa = (1 - eased) * 0.55;                    // bright at birth, gone by end
    var ringW   = (1 - eased) * 2 + 0.5;                 // 2.5px → 0.5px as it expands

    if (ringOpa > 0.01) {
      ctx.strokeStyle = 'rgba(99,155,255,' + ringOpa.toFixed(3) + ')';
      ctx.lineWidth   = ringW;
      ctx.beginPath();
      rrect(
        ctx,
        r.left   - expand,
        r.top    - expand,
        r.width  + expand * 2,
        r.height + expand * 2,
        radius   + expand
      );
      ctx.stroke();
    }

    // ── 3d. Corner brackets — precision reticle ────────
    // Clean L-shapes at each corner. No glow, no shadow —
    // just a bright, crisp accent. Like Figma's selection handles.
    var armLen  = Math.min(14, r.width * 0.15, r.height * 0.25);
    var inset   = -2.5; // sits just outside the border
    var x1 = r.left   - inset;
    var y1 = r.top    - inset;
    var x2 = r.right  + inset;
    var y2 = r.bottom + inset;

    // Subtle breathe on the brackets: 0.85 → 1.0 opacity, 4s cycle, smooth sine
    var breathe = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(elapsed * (Math.PI * 2 / 4.0)));

    ctx.strokeStyle = 'rgba(147,197,253,' + breathe.toFixed(3) + ')';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x1 + armLen, y1);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 + armLen);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x2 - armLen, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x2, y1 + armLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x1, y2 - armLen);
    ctx.lineTo(x1, y2);
    ctx.lineTo(x1 + armLen, y2);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x2 - armLen, y2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 - armLen);
    ctx.stroke();

    ctx.lineCap  = 'butt';
    ctx.lineJoin = 'miter';
    ctx.restore();
  }

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* ─────────────────────────────────────────────
     TOOLTIP POSITIONING
  ───────────────────────────────────────────── */
  function positionTooltip(step, rect) {
    var W = window.innerWidth;
    var H = window.innerHeight;
    var TW = 320;  // tooltip width
    var GAP = 18;  // gap from element
    var PADDING = 16; // edge padding

    tooltip.style.width = Math.min(TW, W - PADDING * 2) + 'px';

    var tt = tooltip.getBoundingClientRect();
    var TH = tt.height;

    arrowEl.style.display = 'none';

    if (!rect || step.position === 'center') {
      // Centred
      tooltip.style.left = ((W - tt.width) / 2) + 'px';
      tooltip.style.top  = ((H - TH) / 2) + 'px';
      arrowEl.style.display = 'none';
      return;
    }

    // On mobile (≤767px), prefer positionMobile if defined
    var pos = (W <= 767 && step.positionMobile) ? step.positionMobile : step.position;
    var tl, tt2, arrowL, arrowT, arrowDir;

    if (pos === 'left') {
      // Tooltip to the LEFT of the target
      tl  = rect.left - TW - GAP;
      tt2 = rect.top + rect.height / 2 - TH / 2;
      tt2 = Math.max(PADDING, Math.min(tt2, H - TH - PADDING));
      // If it won't fit to the left, fall back to 'top'
      if (tl < PADDING) {
        pos = 'top';
        // tl and tt2 will be recalculated in the 'top' block below
        tl = undefined; tt2 = undefined;
      }
    }

    if (pos === 'right') {
      tl  = rect.right + GAP;
      tt2 = rect.top + rect.height / 2 - TH / 2;
      tt2 = Math.max(PADDING, Math.min(tt2, H - TH - PADDING));
      if (tl + TW > W - PADDING) pos = 'bottom';
    }

    if (pos === 'bottom') {
      tl  = rect.left + rect.width / 2 - TW / 2;
      tt2 = rect.bottom + GAP;
      tl  = Math.max(PADDING, Math.min(tl, W - TW - PADDING));
      if (tt2 + TH > H - PADDING) { tt2 = rect.top - TH - GAP; pos = 'top'; }
    }

    if (pos === 'top') {
      tl  = rect.left + rect.width / 2 - TW / 2;
      tt2 = rect.top - TH - GAP;
      tl  = Math.max(PADDING, Math.min(tl, W - TW - PADDING));
      // If it doesn't fit above the element, flip to bottom
      if (tt2 < PADDING) { tt2 = rect.bottom + GAP; pos = 'bottom-final'; }
    }

    // Arrow placement
    if (pos === 'left') {
      arrowL = tl + TW - 7;
      // Arrow vertical center tracks the element center, clamped within tooltip bounds
      var elemMidY = rect.top + rect.height / 2;
      arrowT = Math.max(tt2 + 14, Math.min(elemMidY - 7, tt2 + TH - 14));
      arrowEl.style.boxShadow = '1px -1px 2px rgba(0,0,0,0.08)';
      arrowDir = 'right';
    } else if (pos === 'right') {
      arrowL = tl - 7;
      arrowT = tt2 + TH / 2 - 7;
      arrowEl.style.boxShadow = '-1px 1px 2px rgba(0,0,0,0.08)';
      arrowDir = 'left';
    } else if (pos === 'bottom' || pos === 'bottom-final') {
      arrowL = Math.max(rect.left + rect.width / 2 - 7, tl + 20);
      arrowL = Math.min(arrowL, tl + TW - 27);
      arrowT = tt2 - 7;
      arrowEl.style.boxShadow = '-1px -1px 2px rgba(0,0,0,0.08)';
      arrowDir = 'top';
    } else if (pos === 'top') {
      arrowL = Math.max(rect.left + rect.width / 2 - 7, tl + 20);
      arrowL = Math.min(arrowL, tl + TW - 27);
      arrowT = tt2 + TH - 7;
      arrowEl.style.boxShadow = '1px 1px 2px rgba(0,0,0,0.08)';
      arrowDir = 'bottom';
    }

    tooltip.style.left = tl  + 'px';
    tooltip.style.top  = tt2 + 'px';

    if (arrowDir) {
      arrowEl.style.display = 'block';
      arrowEl.style.left = arrowL + 'px';
      arrowEl.style.top  = arrowT + 'px';
    }
  }

  /* ─────────────────────────────────────────────
     RENDER STEP
  ───────────────────────────────────────────── */
  function renderStep(idx, direction) {
    var step = STEPS[idx];
    if (!step) return;

    currentStep = idx;

    // Update dots
    dots.innerHTML = '';
    for (var i = 0; i < STEPS.length; i++) {
      var d = document.createElement('div');
      d.className = 'gft-dot' + (i === idx ? ' active' : i < idx ? ' done' : '');
      dots.appendChild(d);
    }

    // Step label
    stepLabel.textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;

    // Content
    titleEl.textContent = step.title;
    bodyEl.innerHTML = step.bodyFn ? step.bodyFn() : step.body;

    // Buttons
    prevBtn.disabled = idx === 0;
    if (step.isLast) {
      nextBtn.innerHTML = 'Finish 🎉';
      nextBtn.style.background = 'linear-gradient(135deg,#059669,#047857)';
    } else {
      nextBtn.innerHTML = 'Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="9 6 15 12 9 18"/></svg>';
      nextBtn.style.background = '';
    }

    // Reset animation clock so pulse ring restarts cleanly on each step
    startTime = 0;

    // Entry animation
    tooltip.classList.remove('gft-entering');
    void tooltip.offsetWidth; // reflow
    tooltip.classList.add('gft-entering');

    // If this step needs a specific app section to be active, navigate there first.
    // Then wait two frames for the section's DOM to render before resolving the target.
    function resolveTarget() {
      var targetEl = getTarget(step);
      if (targetEl) {
        // If this step requests the element to be scrolled to viewport vertical center,
        // do so now then re-measure after the scroll settles.
        if (step.scrollToCenter) {
          // scrollIntoView with block:'center' is the most reliable cross-browser way
          // to bring the element to the vertical mid-point of the viewport.
          targetEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

          // Re-measure after scroll settles (a single rAF isn't enough for layout flush)
          setTimeout(function () {
            var baseRect2 = getRect(targetEl);
            if (step.padSides) {
              var ps = step.padSides; // [top, right, bottom, left]
              targetRect = padSides(baseRect2, ps[0], ps[1], ps[2], ps[3]);
            } else {
              var padAmt2 = (step.pad !== undefined) ? step.pad : 8;
              targetRect = pad(baseRect2, padAmt2);
            }
            // Reset currentRect so the spotlight jumps directly to the button
            // instead of lerping from the previous (much larger) step's rect.
            currentRect = null;
            requestAnimationFrame(function () {
              positionTooltip(step, targetRect);
            });
          }, 60);
          return;
        }

        var baseRect = getRect(targetEl);
        var padAmt = (step.pad !== undefined) ? step.pad : 8;
        targetRect = pad(baseRect, padAmt);
      } else {
        targetRect = null;
        currentRect = null;
      }
      requestAnimationFrame(function () {
        positionTooltip(step, targetRect);
      });
    }

    if (step.goToSection !== undefined && typeof window.goToStep === 'function') {
      window.goToStep(step.goToSection);
      // Wait for section transition to complete before measuring
      setTimeout(resolveTarget, 120);
    } else {
      resolveTarget();
    }
  }

  /* ─────────────────────────────────────────────
     START / STOP
  ───────────────────────────────────────────── */
  function startTour() {
    if (isRunning) return;
    isRunning = true;
    currentStep = 0;
    currentRect = null;

    resizeCanvas();
    overlay.style.display = 'block';
    overlay.classList.add('active');
    replayBtn.style.display = 'none';
    if (headerTourBtn) headerTourBtn.style.opacity = '0.4';
    if (headerTourBtn) headerTourBtn.style.pointerEvents = 'none';

    // Small delay so the DOM has settled
    setTimeout(function () {
      startTime = 0; // reset so animations start fresh
      drawFrame(0);
      renderStep(0);
    }, 50);

    // Focus trap
    nextBtn.focus();
  }

  function endTour() {
    isRunning = false;
    cancelAnimationFrame(raf);
    overlay.style.display = 'none';
    overlay.classList.remove('active');
    currentRect = null;
    targetRect  = null;

    // Mark as done
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch(_) {}

    // Show replay button
    replayBtn.style.display = 'flex';
    if (headerTourBtn) { headerTourBtn.style.opacity = ''; headerTourBtn.style.pointerEvents = ''; }
  }

  function goNext() {
    if (currentStep >= STEPS.length - 1) { endTour(); return; }
    renderStep(currentStep + 1, 'next');
  }

  function goPrev() {
    if (currentStep <= 0) return;
    renderStep(currentStep - 1, 'prev');
  }

  /* ─────────────────────────────────────────────
     EVENT LISTENERS
  ───────────────────────────────────────────── */
  nextBtn.addEventListener('click', goNext);
  prevBtn.addEventListener('click', goPrev);
  skipBtn.addEventListener('click', endTour);
  replayBtn.addEventListener('click', startTour);
  if (headerTourBtn) headerTourBtn.addEventListener('click', startTour);

  // Canvas click: next step (click outside tooltip)
  canvas.addEventListener('click', function (e) {
    // Only advance if click is not near the tooltip
    var r = tooltip.getBoundingClientRect();
    if (e.clientX < r.left - 20 || e.clientX > r.right + 20 ||
        e.clientY < r.top  - 20 || e.clientY > r.bottom + 20) {
      goNext();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (!isRunning) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); goNext(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
    if (e.key === 'Escape')     { e.preventDefault(); endTour(); }
  });

  // Resize
  window.addEventListener('resize', function () {
    resizeCanvas();
    if (isRunning) {
      var step = STEPS[currentStep];
      var targetEl = getTarget(step);
      if (targetEl) {
        var baseRect = getRect(targetEl);
        targetRect = pad(baseRect, 8);
        currentRect = null;
      }
      requestAnimationFrame(function () {
        positionTooltip(step, targetRect);
      });
    }
  });

  /* ─────────────────────────────────────────────
     AUTO-LAUNCH on first visit
     (after splash screen disappears)
  ───────────────────────────────────────────── */
  function maybeAutoStart() {
    try {
      var done = localStorage.getItem(STORAGE_KEY);
      if (!done) {
        // First visit — wait for splash to clear (~2.8s) then start
        setTimeout(startTour, 2900);
      } else {
        // Already seen — show replay button
        replayBtn.style.display = 'flex';
      }
    } catch(_) {
      startTour();
    }
  }

  window.addEventListener('load', maybeAutoStart);

  /* Expose to console for dev testing */
  window.gftStartTour = startTour;

})();
