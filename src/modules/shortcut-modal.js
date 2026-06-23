// ═══════════════════════════════════════════════════════════════
//  src/modules/shortcut-modal.js
//  Keyboard shortcut / help modal. Shift+? to open.
// ═══════════════════════════════════════════════════════════════
/* ══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT CHEAT SHEET MODAL
   ══════════════════════════════════════════════════════════════════ */
(function () {

  window.openShortcutModal = function () {
    document.getElementById('shortcutModalOverlay').classList.add('open');
    // Auto-detect device on each open so it always reflects actual device
    var isMobile = window.innerWidth <= 768 ||
      /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent);
    scShowTab(isMobile ? 'mobile' : 'pc');
  };
  window.closeShortcutModal = function () { document.getElementById('shortcutModalOverlay').classList.remove('open'); };

  /* Tab switcher — exposed globally so onclick= works */
  window.scShowTab = function (tab) {
    var isPc = (tab === 'pc');
    // Bodies
    document.getElementById('scBodyPc').style.display     = isPc ? '' : 'none';
    document.getElementById('scBodyMobile').style.display = isPc ? 'none' : '';
    // Footers
    document.getElementById('scFooterPc').style.display     = isPc ? '' : 'none';
    document.getElementById('scFooterMobile').style.display = isPc ? 'none' : '';
    // Header icons
    document.getElementById('scIconPc').style.display     = isPc ? '' : 'none';
    document.getElementById('scIconMobile').style.display = isPc ? 'none' : '';
    // Title
    document.getElementById('scTitle').textContent = isPc ? 'Keyboard Shortcuts' : 'Mobile Help & Tips';
    // Tab active state
    document.getElementById('scTabPc').classList.toggle('active', isPc);
    document.getElementById('scTabMobile').classList.toggle('active', !isPc);
  };

  /* Shift+? global shortcut */
  document.addEventListener('keydown', function (e) {
    if (e.key === '?' && e.shiftKey) {
      var a = document.activeElement;
      /* Don't hijack when typing in a plain text field (not a mark input) */
      var isTextInput = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') &&
                        !a.classList.contains('mark-input') &&
                        !a.classList.contains('mark-subject-input');
      if (isTextInput) return;
      e.preventDefault();
      openShortcutModal();
    }
    if (e.key === 'Escape') {
      var ov = document.getElementById('shortcutModalOverlay');
      if (ov && ov.classList.contains('open')) { e.stopPropagation(); closeShortcutModal(); }
    }
  });

})();

