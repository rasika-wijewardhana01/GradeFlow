// ═══════════════════════════════════════════════════════════════
//  src/modules/consent.js
//  GradeFlow cookie consent manager.
// ═══════════════════════════════════════════════════════════════
/* ── GradeFlow Consent Manager ── */
(function () {
  var CONSENT_KEY = 'gf_storage_consent';

  function gfShowBanner() {
    var banner = document.getElementById('gfConsentBanner');
    if (banner) banner.classList.add('visible');
  }

  function gfHideBanner() {
    var banner = document.getElementById('gfConsentBanner');
    if (banner) {
      banner.style.animation = 'none';
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(16px)';
      banner.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(function () { banner.classList.remove('visible'); }, 200);
    }
  }

  window.gfConsentAccept = function () {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    gfHideBanner();
  };

  window.gfConsentDecline = function () {
    localStorage.setItem(CONSENT_KEY, 'declined');
    gfHideBanner();
    // Note: we cannot clear existing localStorage after decline without disrupting
    // current session, but we inform the user via alert.
    setTimeout(function () {
      alert('You can clear stored data at any time via your browser Settings → Site Data, or using the Reset button inside GradeFlow.');
    }, 250);
  };

  // Show banner if consent not yet given
  var existing = null;
  try { existing = localStorage.getItem(CONSENT_KEY); } catch(e) {}

  if (!existing) {
    // Short delay so app paints first
    setTimeout(gfShowBanner, 1200);
  }
})();



