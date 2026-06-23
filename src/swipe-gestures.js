(function() {
  'use strict';

  var TOTAL_STEPS = 6;
  // Minimum horizontal distance (px) to trigger a swipe
  var SWIPE_THRESHOLD = 55;
  // Maximum vertical movement allowed before we bail (user is scrolling, not swiping)
  var VERTICAL_LOCK = 14;
  // If horizontal movement exceeds this ratio vs vertical, lock into swipe mode
  var H_DOMINANCE_RATIO = 1.5;

  var touchStartX = 0;
  var touchStartY = 0;
  var touchDeltaX = 0;
  var touchDeltaY = 0;
  var swiping     = false;   // true = we've locked into horizontal swipe mode
  var cancelled   = false;   // true = user is scrolling vertically, ignore

  var edgeLeft  = document.getElementById('swipeEdgeLeft');
  var edgeRight = document.getElementById('swipeEdgeRight');
  var swipeHint = document.getElementById('swipeHint');

  // Show one-time hint
  var hintShown = false;
  function maybeShowHint() {
    if (hintShown) return;
    try {
      var count = parseInt(localStorage.getItem('gf_swipe_hint') || '0', 10);
      if (count >= 2) return;
      localStorage.setItem('gf_swipe_hint', String(count + 1));
    } catch(e) {}
    hintShown = true;
    swipeHint.classList.add('visible');
    setTimeout(function() { swipeHint.classList.remove('visible'); }, 2400);
  }

  // Check if the touch target is inside a horizontally scrollable container
  function isInsideHScroll(el) {
    while (el && el !== document.body) {
      var style = window.getComputedStyle(el);
      var overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  // Check if the touch target is inside an input, textarea, select or contenteditable
  function isInsideInput(el) {
    while (el && el !== document.body) {
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  function getEdgeEl(direction) {
    return direction === 'left' ? edgeLeft : edgeRight;
  }

  function showEdge(direction, intensity) {
    var el = getEdgeEl(direction);
    if (!el) return;
    el.classList.add('visible');
    el.style.opacity = Math.min(intensity, 1).toFixed(2);
  }

  function hideEdges() {
    if (edgeLeft)  { edgeLeft.style.opacity  = '0'; edgeLeft.classList.remove('visible'); }
    if (edgeRight) { edgeRight.style.opacity = '0'; edgeRight.classList.remove('visible'); }
  }

  function applySwipeAnimation(direction) {
    // direction: 'left' means we're going to next step (swiped finger left → next)
    var section = document.querySelector('.section.active');
    if (!section) return;
    var cls = direction === 'left' ? 'swipe-enter-right' : 'swipe-enter-left';
    section.classList.remove('swipe-enter-left', 'swipe-enter-right');
    // Force reflow to restart animation
    void section.offsetWidth;
    section.classList.add(cls);
    setTimeout(function() { section.classList.remove('swipe-enter-left', 'swipe-enter-right'); }, 350);
  }

  function handleSwipeComplete(direction) {
    // direction: 'left' → next step; 'right' → previous step
    var step = (typeof currentStep !== 'undefined') ? currentStep : 0;
    var newStep;
    if (direction === 'left') {
      newStep = Math.min(step + 1, TOTAL_STEPS - 1);
    } else {
      newStep = Math.max(step - 1, 0);
    }
    if (newStep === step) return; // at boundary — nothing to do
    applySwipeAnimation(direction);
    // Small delay so animation starts before goToStep clears/re-applies active class
    setTimeout(function() {
      if (typeof goToStep === 'function') goToStep(newStep);
    }, 20);
  }

  // ── Touch event listeners on the document (not just .main, since modals etc sit above) ──
  document.addEventListener('touchstart', function(e) {
    // Only listen on mobile breakpoint — skip desktop
    if (window.innerWidth >= 768) return;

    var target = e.changedTouches[0].target;
    if (isInsideInput(target) || isInsideHScroll(target)) {
      cancelled = true;
      return;
    }

    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    touchDeltaX = 0;
    touchDeltaY = 0;
    swiping     = false;
    cancelled   = false;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (cancelled) return;
    if (window.innerWidth >= 768) return;

    touchDeltaX = e.changedTouches[0].clientX - touchStartX;
    touchDeltaY = e.changedTouches[0].clientY - touchStartY;

    var absX = Math.abs(touchDeltaX);
    var absY = Math.abs(touchDeltaY);

    // If vertical movement exceeds lock threshold before we've committed to swipe, cancel
    if (!swiping && absY > VERTICAL_LOCK && absX < absY * H_DOMINANCE_RATIO) {
      cancelled = true;
      hideEdges();
      return;
    }

    // Lock into swipe mode once horizontal is clearly dominant
    if (!swiping && absX > 12 && absX > absY * H_DOMINANCE_RATIO) {
      swiping = true;
    }

    if (!swiping) return;

    // Show edge glow as feedback while dragging
    var intensity = Math.min(absX / SWIPE_THRESHOLD, 1) * 0.9;
    var direction = touchDeltaX < 0 ? 'left' : 'right';
    showEdge(direction, intensity);

    // Check step boundaries — dim the glow if already at edge
    var step = (typeof currentStep !== 'undefined') ? currentStep : 0;
    if ((direction === 'left'  && step >= TOTAL_STEPS - 1) ||
        (direction === 'right' && step <= 0)) {
      // Rubber-band: fade out edge glow quickly
      getEdgeEl(direction).style.opacity = (intensity * 0.3).toFixed(2);
    }
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (cancelled || !swiping) {
      hideEdges();
      cancelled = false;
      swiping   = false;
      return;
    }
    if (window.innerWidth >= 768) return;

    var absX = Math.abs(touchDeltaX);
    hideEdges();

    if (absX >= SWIPE_THRESHOLD) {
      var direction = touchDeltaX < 0 ? 'left' : 'right';
      handleSwipeComplete(direction);
      maybeShowHint();
    }

    swiping   = false;
    cancelled = false;
    touchDeltaX = 0;
    touchDeltaY = 0;
  }, { passive: true });

  document.addEventListener('touchcancel', function() {
    hideEdges();
    swiping     = false;
    cancelled   = false;
    touchDeltaX = 0;
    touchDeltaY = 0;
  }, { passive: true });

  // Show hint on first page load after 1.5s (only if not already seen 2x)
  window.addEventListener('load', function() {
    setTimeout(maybeShowHint, 1500);
  });

})();
