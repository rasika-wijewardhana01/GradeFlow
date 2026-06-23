// ═══════════════════════════════════════════════════════════════
//  src/modules/save-location-prompt.js
//  Encourages users to set up a persistent save location:
//   • Chrome/Edge desktop (File System Access API supported):
//     prompts to pick a folder so data auto-saves to disk.
//   • Other browsers (Firefox, iOS Safari, etc.):
//     prompts to take a one-time backup export, since browser
//     storage can be cleared without warning.
//
//  Respects user choice:
//   • "Choose Folder" / "Download Backup" → action + banner closes
//   • "Maybe Later"  → hidden for this session, asked again later
//   • "Don't ask again" → never shown again (localStorage flag)
// ═══════════════════════════════════════════════════════════════
(function () {

  var DISMISS_KEY   = 'gf_save_location_dismissed'; // 'forever' | timestamp
  var TOUR_KEY      = 'gf_tour_done_v1';
  var SNOOZE_MS     = 3 * 24 * 60 * 60 * 1000; // re-ask after 3 days if "Maybe later"
  var SHOW_DELAY_MS = 2500; // let the app settle / tour finish first

  function el(id) { return document.getElementById(id); }

  function shouldShow() {
    // Already saving to a folder? Nothing to do.
    if (window.StorageEngine && window.StorageEngine.isFileBased()) return false;

    var dismissed;
    try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (_) { dismissed = null; }
    if (dismissed === 'forever') return false;
    if (dismissed) {
      var ts = parseInt(dismissed, 10);
      if (!isNaN(ts) && (Date.now() - ts) < SNOOZE_MS) return false;
    }
    return true;
  }

  function buildBanner() {
    if (el('gf-save-location-banner')) return;

    var supported = window.StorageEngine && window.StorageEngine.isSupported();

    var banner = document.createElement('div');
    banner.id = 'gf-save-location-banner';
    banner.setAttribute('role', 'banner');

    var iconSvg = supported
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

    var title = supported ? 'Set up a save location' : 'Back up your data';
    var desc  = supported
      ? 'Pick a folder so GradeFlow saves automatically — your data survives browser resets.'
      : 'Browser storage can be cleared. Download a backup file to keep your data safe.';
    var primaryLabel = supported ? 'Choose Folder' : 'Download Backup';

    banner.innerHTML = [
      '<div class="gf-ib-inner">',
        '<div class="gf-sl-icon">', iconSvg, '</div>',
        '<div class="gf-ib-text">',
          '<strong>', title, '</strong>',
          '<span>', desc, '</span>',
        '</div>',
        '<button class="gf-ib-btn install" id="gf-sl-primary-btn">', primaryLabel, '</button>',
        '<button class="gf-ib-btn dismiss" id="gf-sl-later-btn" title="Ask me later">Later</button>',
        '<button class="gf-ib-btn dismiss" id="gf-sl-close-btn" aria-label="Dismiss">✕</button>',
      '</div>',
      '<div class="gf-sl-footer">',
        '<a href="#" id="gf-sl-never-btn">Don\u2019t ask again</a>',
      '</div>'
    ].join('');

    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('visible'); });
    });

    // Primary action
    el('gf-sl-primary-btn').addEventListener('click', async function () {
      if (supported) {
        await window.StorageEngine.requestDirectory();
        if (window.StorageEngine.isFileBased()) {
          hideBanner();
        }
        // If the user cancels the picker, leave the banner up so they can retry.
      } else {
        if (typeof window.exportBackupFile === 'function') {
          await window.exportBackupFile();
        } else if (typeof window.openBackupModal === 'function') {
          window.openBackupModal();
        }
        hideBanner();
      }
    });

    // Maybe later — snooze
    el('gf-sl-later-btn').addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) {}
      hideBanner();
    });

    // Close (X) — same as "Later"
    el('gf-sl-close-btn').addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) {}
      hideBanner();
    });

    // Don't ask again — permanent dismiss
    el('gf-sl-never-btn').addEventListener('click', function (e) {
      e.preventDefault();
      try { localStorage.setItem(DISMISS_KEY, 'forever'); } catch (_) {}
      hideBanner();
      if (typeof window.toast === 'function') {
        window.toast('You can still set this up anytime from the sidebar or topbar.', 'info');
      }
    });
  }

  function hideBanner() {
    var banner = el('gf-save-location-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 400);
  }

  function maybeShow() {
    if (!shouldShow()) return;
    buildBanner();
  }

  function init() {
    // Wait for storage engine + restored handle to settle, and for the
    // onboarding tour to finish (or be skipped) before nudging.
    var waited = 0;
    var interval = setInterval(function () {
      waited += 250;
      var tourDone;
      try { tourDone = localStorage.getItem(TOUR_KEY); } catch (_) { tourDone = '1'; }
      var ready = (window.StorageEngine) && (tourDone || waited >= SHOW_DELAY_MS);
      if (ready || waited >= 8000) {
        clearInterval(interval);
        setTimeout(maybeShow, tourDone ? 600 : SHOW_DELAY_MS);
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Allow other modules (e.g. after a successful folder pick elsewhere) to hide it
  window.gfHideSaveLocationBanner = hideBanner;

})();
