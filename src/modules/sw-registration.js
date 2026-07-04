// ═══════════════════════════════════════════════════════════════
//  src/modules/sw-registration.js
//  Service Worker registration and update banner.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ── Service Worker Registration ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) {
          console.log('[GradeFlow SW] Registered, scope:', reg.scope);
          reg.addEventListener('updatefound', function () {
            var newWorker = reg.installing;
            newWorker.addEventListener('statechange', function () {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch(function (err) {
          console.warn('[GradeFlow SW] Registration failed:', err);
        });

      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });
    });
  }

  /* ── PWA Install Prompt ── */
  var deferredPrompt = null;
  var DISMISS_KEY    = 'gf_install_dismissed';

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 86400000) return;
    setTimeout(showInstallBanner, 2200);
  });

  window.addEventListener('appinstalled', function () {
    hideInstallBanner();
    deferredPrompt = null;
    localStorage.removeItem(DISMISS_KEY);
    showToastPWA('✓ GradeFlow installed! Launch it from your home screen.', 'success');
  });

  function showInstallBanner() {
    if (document.getElementById('gf-install-banner')) return;
    var banner = document.createElement('div');
    banner.id  = 'gf-install-banner';
    banner.setAttribute('role', 'banner');
    banner.innerHTML = [
      '<div class="gf-ib-inner">',
        '<img src="data:image/png;base64,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" alt="GradeFlow icon" class="gf-ib-icon" />',
        '<div class="gf-ib-text">',
          '<strong>Install GradeFlow</strong>',
          '<span>Works offline · No browser chrome · Faster launch</span>',
        '</div>',
        '<button class="gf-ib-btn install" id="gf-install-btn">Install</button>',
        '<button class="gf-ib-btn dismiss" id="gf-dismiss-btn" aria-label="Dismiss">✕</button>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('visible'); });
    });
    document.getElementById('gf-install-btn').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') { showToastPWA('Installing GradeFlow…', 'info'); }
        deferredPrompt = null;
        hideInstallBanner();
      });
    });
    document.getElementById('gf-dismiss-btn').addEventListener('click', function () {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      hideInstallBanner();
    });
  }

  function hideInstallBanner() {
    var banner = document.getElementById('gf-install-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 400);
  }

  function showUpdateBanner() {
    if (document.getElementById('gf-update-banner')) return;
    var banner = document.createElement('div');
    banner.id  = 'gf-update-banner';
    banner.innerHTML = [
      '<div class="gf-ib-inner">',
        '<div class="gf-ib-update-icon">↑</div>',
        '<div class="gf-ib-text">',
          '<strong>Update available</strong>',
          '<span>A new version of GradeFlow is ready.</span>',
        '</div>',
        '<button class="gf-ib-btn install" id="gf-update-btn">Refresh</button>',
        '<button class="gf-ib-btn dismiss" id="gf-update-dismiss" aria-label="Dismiss">✕</button>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('visible'); });
    });
    document.getElementById('gf-update-btn').addEventListener('click', function () {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    document.getElementById('gf-update-dismiss').addEventListener('click', function () {
      banner.classList.remove('visible');
      setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 400);
    });
  }

  function showToastPWA(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:#1a56db;color:#fff;padding:12px 22px;border-radius:10px;' +
      'font-size:14px;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
  }
})();

// ── Offline / Online indicator ────────────────────────────────────────────────
(function () {
  function _updateOfflineIndicator(isOnline) {
    let dot = document.getElementById('gf-offline-dot');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'gf-offline-dot';
      dot.title = 'Network status';
      dot.style.cssText = [
        'position:fixed', 'bottom:16px', 'left:16px', 'z-index:8000',
        'display:flex', 'align-items:center', 'gap:6px',
        'padding:5px 10px', 'border-radius:99px',
        'font-size:11px', 'font-weight:600',
        'border:1px solid transparent',
        'transition:opacity 0.3s, transform 0.3s',
        'pointer-events:none',
        'backdrop-filter:blur(8px)',
        '-webkit-backdrop-filter:blur(8px)'
      ].join(';');
      document.body.appendChild(dot);
    }

    if (isOnline) {
      dot.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 0 2px rgba(34,197,94,0.25);"></span> Online';
      dot.style.background = 'rgba(20,83,45,0.85)';
      dot.style.borderColor = 'rgba(34,197,94,0.3)';
      dot.style.color = '#86efac';
      // Auto-hide after 3s when back online
      clearTimeout(dot._hideTimer);
      dot._hideTimer = setTimeout(() => { dot.style.opacity = '0'; dot.style.transform = 'translateY(4px)'; }, 3000);
    } else {
      clearTimeout(dot._hideTimer);
      dot.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;box-shadow:0 0 0 2px rgba(239,68,68,0.25);animation:gf-pulse 1.5s ease infinite;"></span> Offline — sync unavailable';
      dot.style.background = 'rgba(69,10,10,0.88)';
      dot.style.borderColor = 'rgba(239,68,68,0.35)';
      dot.style.color = '#fca5a5';
      dot.style.opacity = '1';
      dot.style.transform = 'translateY(0)';
    }
  }

  // Inject pulse keyframe once
  const style = document.createElement('style');
  style.textContent = '@keyframes gf-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }';
  document.head.appendChild(style);

  window.addEventListener('online',  () => { _updateOfflineIndicator(true);  if (typeof window.toast === 'function') window.toast('Back online', 'success'); });
  window.addEventListener('offline', () => { _updateOfflineIndicator(false); if (typeof window.toast === 'function') window.toast('You are offline — sync codes require internet', 'warn'); });

  // Show on load only if offline
  if (!navigator.onLine) _updateOfflineIndicator(false);
})();
