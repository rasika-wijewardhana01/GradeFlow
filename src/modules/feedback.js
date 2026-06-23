// ═══════════════════════════════════════════════════════════════
//  src/modules/feedback.js
//  Anonymous feedback box.
//
//  Privacy model:
//   • No name, email, school, device ID, or any identifying field
//     is collected, requested, or stored.
//   • Nothing is written to localStorage — the modal resets fully
//     on close, so no feedback text persists on the device.
//   • Two delivery paths, user's choice:
//       1) "Send by Email"  → opens the user's own mail client via
//          a mailto: link, pre-filled. The user controls which
//          mail account (if any) is used — GradeFlow never reads it.
//       2) "Copy Text"      → copies the feedback to the clipboard
//          so it can be pasted into a form, chat, or issue tracker
//          of the user's choosing.
//   • If FEEDBACK_ENDPOINT below is set to a real URL (e.g. a
//     Formspree / Google Apps Script endpoint configured by the
//     developer), a third "Submit" button appears that posts the
//     feedback directly with no auth, cookies, or extra metadata.
// ═══════════════════════════════════════════════════════════════
(function () {

  /* ── Developer configuration ──────────────────────────────────
     Leave FEEDBACK_ENDPOINT empty ('') to use Email + Copy only.
     To enable direct (still-anonymous) submission, set this to a
     Formspree endpoint, e.g.:
       'https://formspree.io/f/your-form-id'
  ───────────────────────────────────────────────────────────── */
  var FEEDBACK_ENDPOINT = '';
  var FEEDBACK_EMAIL    = 'onetwosthree4s@gmail.com'; // ← developer's inbox

  var TYPES = [
    { id: 'bug',      label: 'Bug / Problem',     icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2zm0-4h-2V7h2z' },
    { id: 'idea',     label: 'Feature idea',      icon: 'M9 21h6v-1H9v1zm3-19a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z' },
    { id: 'praise',   label: 'Something I like',  icon: 'M12 21s-7-4.35-9.33-8.5C1.2 9.5 2.9 6 6.1 6 8 6 9.7 7.1 12 9.4 14.3 7.1 16 6 17.9 6c3.2 0 4.9 3.5 3.43 6.5C19 16.65 12 21 12 21z' },
    { id: 'other',    label: 'Something else',    icon: 'M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z' }
  ];

  var selectedType = null;
  var selectedRating = 0;

  function el(id) { return document.getElementById(id); }

  // ── Open / close ──────────────────────────────────────────────
  window.openFeedbackModal = function () {
    resetFeedbackForm();
    var ov = el('feedbackModalOverlay');
    if (!ov) return;
    ov.classList.add('open');
    setTimeout(function () {
      var ta = el('feedbackText');
      if (ta) ta.focus();
    }, 150);
  };

  window.closeFeedbackModal = function () {
    var ov = el('feedbackModalOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    // Wipe the form shortly after the close animation so nothing
    // typed lingers in the DOM/memory.
    setTimeout(resetFeedbackForm, 250);
  };

  function resetFeedbackForm() {
    selectedType = null;
    selectedRating = 0;
    var ta = el('feedbackText');
    if (ta) ta.value = '';
    var counter = el('feedbackCharCount');
    if (counter) counter.textContent = '0';
    document.querySelectorAll('.fb-type-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    document.querySelectorAll('.fb-star').forEach(function (s) {
      s.classList.remove('active');
    });
    var status = el('feedbackStatus');
    if (status) { status.textContent = ''; status.className = 'fb-status'; }
    var sendBtn = el('feedbackSendBtn');
    if (sendBtn) sendBtn.disabled = false;
    updateSendButtonState();
  }

  // ── Category selection ──────────────────────────────────────
  window.fbSelectType = function (typeId) {
    selectedType = typeId;
    document.querySelectorAll('.fb-type-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === typeId);
    });
    updateSendButtonState();
  };

  // ── Star rating (optional, only relevant for general feedback) ─
  window.fbSetRating = function (n) {
    selectedRating = (selectedRating === n) ? 0 : n; // toggle off if same star clicked again
    document.querySelectorAll('.fb-star').forEach(function (s) {
      var v = parseInt(s.getAttribute('data-star'), 10);
      s.classList.toggle('active', v <= selectedRating);
    });
  };

  function updateSendButtonState() {
    var ta = el('feedbackText');
    var sendBtn = el('feedbackSendBtn');
    var copyBtn = el('feedbackCopyBtn');
    var hasText = ta && ta.value.trim().length >= 4;
    if (sendBtn) sendBtn.disabled = !hasText;
    if (copyBtn) copyBtn.disabled = !hasText;
  }

  // ── Character counter ─────────────────────────────────────────
  window.fbOnTextInput = function () {
    var ta = el('feedbackText');
    var counter = el('feedbackCharCount');
    if (!ta || !counter) return;
    var len = ta.value.length;
    var max = 1000;
    if (len > max) {
      ta.value = ta.value.slice(0, max);
      len = max;
    }
    counter.textContent = String(len);
    updateSendButtonState();
  };

  // ── Build the anonymized message body ───────────────────────────
  function buildFeedbackMessage() {
    var ta = el('feedbackText');
    var text = ta ? ta.value.trim() : '';
    var typeLabel = 'General feedback';
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].id === selectedType) { typeLabel = TYPES[i].label; break; }
    }
    var lines = [];
    lines.push('Category: ' + typeLabel);
    if (selectedRating > 0) lines.push('Rating: ' + selectedRating + '/5');
    lines.push('');
    lines.push(text);
    lines.push('');
    lines.push('— Sent anonymously from GradeFlow');
    return lines.join('\n');
  }

  function setStatus(msg, type) {
    var status = el('feedbackStatus');
    if (!status) return;
    status.textContent = msg;
    status.className = 'fb-status' + (type ? (' fb-status--' + type) : '');
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      setStatus(msg, type);
    }
  }

  // ── Submit handlers ──────────────────────────────────────────

  // 1) Email — opens the user's own mail client. Nothing about the
  //    user (name, address, device) is sent to GradeFlow itself;
  //    the developer only sees whatever the user's mail client sends.
  window.fbSendByEmail = function () {
    var ta = el('feedbackText');
    if (!ta || ta.value.trim().length < 4) return;
    var body = buildFeedbackMessage();
    var subject = 'GradeFlow Feedback';
    var url = 'mailto:' + encodeURIComponent(FEEDBACK_EMAIL) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    window.location.href = url;
    setStatus('Opening your email app…', 'info');
  };

  // 2) Copy to clipboard — for users who'd rather paste into a form,
  //    issue tracker, or chat of their own choosing.
  window.fbCopyFeedback = function () {
    var ta = el('feedbackText');
    if (!ta || ta.value.trim().length < 4) return;
    var text = buildFeedbackMessage();
    var done = function () {
      toast('Feedback copied — paste it wherever you like', 'success');
      setStatus('Copied to clipboard ✓', 'success');
    };
    var fail = function () {
      setStatus('Could not copy automatically — please select and copy the text manually.', 'error');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      try {
        var tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
        done();
      } catch (e) {
        fail();
      }
    }
  };

  // 3) Optional direct submission to a developer-configured endpoint.
  //    Sends ONLY the category, rating, and message text — no name,
  //    email, cookies, or device identifiers.
  window.fbSubmitDirect = function () {
    if (!FEEDBACK_ENDPOINT) return;
    var ta = el('feedbackText');
    if (!ta || ta.value.trim().length < 4) return;
    var sendBtn = el('feedbackSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    setStatus('Sending…', 'info');

    var payload = {
      category: selectedType || 'general',
      rating: selectedRating || null,
      message: ta.value.trim()
    };

    fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('Request failed');
      setStatus('Thanks — your feedback was sent anonymously ✓', 'success');
      toast('Feedback sent — thank you!', 'success');
      setTimeout(closeFeedbackModal, 1400);
    }).catch(function () {
      setStatus('Could not send directly. Try "Copy Text" or "Send by Email" instead.', 'error');
      if (sendBtn) sendBtn.disabled = false;
    });
  };

  // Wire up: pick whichever primary action is available.
  window.fbPrimaryAction = function () {
    if (FEEDBACK_ENDPOINT) {
      fbSubmitDirect();
    } else {
      fbSendByEmail();
    }
  };

  // Show/hide the direct-submit button based on configuration once DOM is ready.
  document.addEventListener('DOMContentLoaded', function () {
    var directBtn = el('feedbackSendBtn');
    if (directBtn && !FEEDBACK_ENDPOINT) {
      directBtn.querySelector('.fb-btn-label').textContent = 'Send by Email';
    }
  });

  // Escape key closes the modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var ov = el('feedbackModalOverlay');
      if (ov && ov.classList.contains('open')) {
        e.stopPropagation();
        closeFeedbackModal();
      }
    }
  });

})();
