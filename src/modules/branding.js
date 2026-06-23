// ═══════════════════════════════════════════════════════════════
//  src/modules/branding.js
//  School branding settings (logo, colour, name, address),
//  branding UI (open/save/reset/populate), logo upload, colour
//  picker, live preview. Also: subjectPassMarks object and
//  the Pass Mark Panel (per-subject pass % overrides).
// ═══════════════════════════════════════════════════════════════
const BRANDING_KEY = 'rsm_school_branding_v1';

let brandingSettings = {
  logoDataUrl:     null,
  primaryColor:    '#1a56db',
  schoolFullName:  '',
  address:         '',
  termLabel:       '',
  principal:       '',
  showSig:         false,
  showAddress:     false,
};

// ── Open / Close ──
function openBrandingPanel() {
  // Branding is now inline in Setup tab — navigate there and expand
  window.goToStep(0);
  setTimeout(function() { openBrandingSetupCard(); }, 80);
}

function closeBrandingPanel() {
  // No-op — branding panel is now inline (stub for backward compat)
}

// ── Inline branding card (in Setup tab) ──
function _brandingExpandBody(body) {
  // Smooth accordion open using max-height transition
  body.style.display = 'block';
  body.style.overflow = 'hidden';
  // Measure real height AFTER display:block
  var target = body.scrollHeight;
  body.style.maxHeight = '0px';
  body.style.transition = 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)';
  // Double rAF: browser must register maxHeight:0 before animating to target
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      body.style.maxHeight = target + 'px';
      body.addEventListener('transitionend', function onEnd() {
        body.removeEventListener('transitionend', onEnd);
        body.style.maxHeight = 'none';
        body.style.overflow  = '';
        body.style.transition = '';
      }, { once: true });
    });
  });
}

function _brandingCollapseBody(body) {
  body.style.overflow   = 'hidden';
  body.style.maxHeight  = body.scrollHeight + 'px';
  body.style.transition = 'max-height 0.28s cubic-bezier(0.4,0,0.2,1)';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      body.style.maxHeight = '0px';
      body.addEventListener('transitionend', function onEnd() {
        body.removeEventListener('transitionend', onEnd);
        body.style.display    = 'none';
        body.style.maxHeight  = '';
        body.style.overflow   = '';
        body.style.transition = '';
      }, { once: true });
    });
  });
}

function openBrandingSetupCard() {
  const body    = document.getElementById('brandingSetupBody');
  const chevron = document.getElementById('brandingSetupChevron');
  const header  = document.getElementById('brandingSetupCardHeader');
  if (!body) return;
  loadBrandingFromStorage();
  populateBrandingForm();
  updateBrandingPreview();
  const d = document.getElementById('brandingPreviewDate');
  if (d) d.textContent = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  if (body.style.display === 'none' || body.style.display === '') {
    _brandingExpandBody(body);
    if (header) header.classList.add('branding-open');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
  // Scroll to card after expand
  const card = document.getElementById('brandingSetupCard');
  if (card) { setTimeout(function(){ card.scrollIntoView({ behavior:'smooth', block:'start' }); }, 120); }
}

async function toggleBrandingSetupCard() {
  const body    = document.getElementById('brandingSetupBody');
  const chevron = document.getElementById('brandingSetupChevron');
  const label   = document.getElementById('brandingSetupToggleLabel');
  const header  = document.getElementById('brandingSetupCardHeader');
  if (!body) return;
  const isOpen = body.style.display !== 'none' && body.style.display !== '';
  if (isOpen) {
    _brandingCollapseBody(body);
    if (chevron) chevron.style.transform = '';
    if (label) label.textContent = 'Optional';
    if (header) header.classList.remove('branding-open');
  } else {
    // ── BUG FIX: capture the user's current examLabel value BEFORE the async
    //    storage load overwrites brandingSettings.termLabel.  Without this,
    //    loadBrandingFromStorage() (async) would resolve *after*
    //    populateBrandingForm() already ran, clobbering termLabel with the old
    //    empty value from storage and clearing the examLabel field on the next
    //    open of the branding card.
    const examLabelEl = document.getElementById('examLabel');
    const userExamLabel = examLabelEl ? examLabelEl.value.trim() : '';

    // Await storage so brandingSettings is fully populated before we render
    await loadBrandingFromStorage();

    // If the user has already typed an exam label, preserve it — it takes
    // priority over whatever termLabel was last persisted to storage.
    if (userExamLabel) {
      brandingSettings.termLabel = userExamLabel;
    }

    populateBrandingForm();
    updateBrandingPreview();
    const d = document.getElementById('brandingPreviewDate');
    if (d) d.textContent = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
    _brandingExpandBody(body);
    if (header) header.classList.add('branding-open');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    if (label) {
      const hasBranding = !!(brandingSettings.schoolFullName || brandingSettings.logoDataUrl || brandingSettings.address);
      label.textContent = hasBranding ? 'Configured ✓' : 'Optional';
    }
  }
}

function saveBrandingFromSetup() {
  // Same as saveBrandingSettings but doesn't close a panel
  brandingSettings.schoolFullName = (document.getElementById('brandingSchoolFullName') || {}).value || '';
  brandingSettings.address        = (document.getElementById('brandingAddress')        || {}).value || '';
  brandingSettings.termLabel      = (document.getElementById('brandingTermLabel')      || {}).value || '';
  brandingSettings.principal      = (document.getElementById('brandingPrincipal')      || {}).value || '';
  window.StorageEngine.setItem(BRANDING_KEY, JSON.stringify(brandingSettings))
    .catch(e => console.warn('Branding save failed:', e));
  updateBrandingActiveDot();
  // Update the "Active" badge on the card header
  const badge = document.getElementById('brandingSetupActiveBadge');
  const isBrandingSet = brandingSettings.schoolFullName || brandingSettings.logoDataUrl || brandingSettings.address;
  if (badge) badge.style.display = isBrandingSet ? 'inline-flex' : 'none';
  const toggleLabel = document.getElementById('brandingSetupToggleLabel');
  if (toggleLabel) toggleLabel.textContent = isBrandingSet ? 'Configured ✓' : 'Optional';
  window.toast('School branding saved', 'success');
}

// (Branding panel Escape handler removed — panel is now inline in Setup)

// ── Load / Save via StorageEngine ──
async function loadBrandingFromStorage() {
  try {
    const raw = await window.StorageEngine.getItem(BRANDING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      brandingSettings = Object.assign({}, brandingSettings, parsed);
    }
  } catch(e) { console.warn('Branding load failed:', e); }
}

// ── Sync live DOM form fields → brandingSettings (no save, no toast) ──────
// Called before any render that reads brandingSettings so unsaved edits are
// always reflected (e.g. student cards, live preview).
function _syncBrandingFromDOM() {
  const gv = id => (document.getElementById(id) || {}).value || '';
  const bsf = gv('brandingSchoolFullName');
  if (bsf) brandingSettings.schoolFullName = bsf;
  const addr = gv('brandingAddress');
  if (addr) brandingSettings.address = addr;
  const term = gv('brandingTermLabel');
  if (term) brandingSettings.termLabel = term;
  const prin = gv('brandingPrincipal');
  if (prin) brandingSettings.principal = prin;
  // primaryColor and logoDataUrl are updated live via their own handlers — no DOM read needed
}

function saveBrandingSettings() {
  // Read form values into brandingSettings
  brandingSettings.schoolFullName = (document.getElementById('brandingSchoolFullName') || {}).value || '';
  brandingSettings.address        = (document.getElementById('brandingAddress')        || {}).value || '';
  brandingSettings.termLabel      = (document.getElementById('brandingTermLabel')      || {}).value || '';
  brandingSettings.principal      = (document.getElementById('brandingPrincipal')      || {}).value || '';
  // showSig, showAddress, primaryColor and logoDataUrl updated live already
  window.StorageEngine.setItem(BRANDING_KEY, JSON.stringify(brandingSettings))
    .catch(e => console.warn('Branding save failed:', e));
  updateBrandingActiveDot();
  // closeBrandingPanel is now a no-op; branding is inline
  window.toast('School branding saved', 'success');
}

function resetBranding() {
  if (!confirm('Reset all branding settings to defaults?')) return;
  brandingSettings = {
    logoDataUrl:    null,
    primaryColor:   '#1a56db',
    schoolFullName: '',
    address:        '',
    termLabel:      '',
    principal:      '',
    showSig:        false,
    showAddress:    false,
  };
  window.StorageEngine.removeItem(BRANDING_KEY).catch(() => {});
  populateBrandingForm();
  updateBrandingPreview();
  updateBrandingActiveDot();
  window.toast('Branding reset to defaults');
}

// ── Populate form from brandingSettings ──
function populateBrandingForm() {
  // Logo
  const logoPreview = document.getElementById('brandingLogoPreview');
  const logoPlaceholder = document.getElementById('brandingLogoPlaceholder');
  const logoZone = document.getElementById('brandingLogoZone');
  const logoActions = document.getElementById('brandingLogoActions');
  const logoLabel = document.getElementById('brandingLogoLabel');
  const logoSub = document.getElementById('brandingLogoSub');
  if (brandingSettings.logoDataUrl) {
    logoPreview.src = brandingSettings.logoDataUrl;
    logoPreview.style.display = 'block';
    logoPlaceholder.style.display = 'none';
    logoZone.classList.add('has-logo');
    logoActions.style.display = 'flex';
    logoLabel.textContent = 'Logo uploaded';
    logoSub.textContent = 'Click to replace';
  } else {
    logoPreview.style.display = 'none';
    logoPlaceholder.style.display = 'flex';
    logoZone.classList.remove('has-logo');
    logoActions.style.display = 'none';
    logoLabel.textContent = 'Click to upload logo';
    logoSub.textContent = 'PNG, JPG, SVG — shown in exported PDF & JPEG reports';
  }
  // Color
  setBrandingColor(brandingSettings.primaryColor || '#1a56db', false);
  // Text fields
  const fv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  fv('brandingSchoolFullName', brandingSettings.schoolFullName);
  fv('brandingAddress',        brandingSettings.address);
  fv('brandingTermLabel',      brandingSettings.termLabel);
  fv('brandingPrincipal',      brandingSettings.principal);
  // Mirror termLabel back into the examLabel field in Class Information
  // Only overwrite examLabel if the user hasn't already typed something in it —
  // otherwise populateBrandingForm() would clobber unsaved user input every time
  // the branding card is expanded.
  var examLabelEl = document.getElementById('examLabel');
  if (examLabelEl) {
    if (examLabelEl.value.trim() === '') {
      // Field is empty — safe to fill from saved branding
      examLabelEl.value = brandingSettings.termLabel || '';
    } else {
      // Field already has content the user typed — push it INTO brandingSettings
      // so the branding preview stays in sync without erasing the user's value
      brandingSettings.termLabel = examLabelEl.value;
      var btl = document.getElementById('brandingTermLabel');
      if (btl) btl.value = examLabelEl.value;
    }
  }
  // Keep hidden #schoolName in sync so existing export code using it still works
  syncSchoolName();
  // Toggles
  const sigT = document.getElementById('brandingSigToggle');
  const addrT = document.getElementById('brandingAddressToggle');
  if (sigT)  sigT.classList.toggle('on', !!brandingSettings.showSig);
  if (addrT) addrT.classList.toggle('on', !!brandingSettings.showAddress);
}

// ── Logo upload ──
function handleBrandingLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { window.toast('Logo must be under 2 MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    brandingSettings.logoDataUrl = e.target.result;
    populateBrandingForm();
    updateBrandingPreview();
  };
  reader.readAsDataURL(file);
  // Reset input so same file can be re-selected
  event.target.value = '';
}

function clearBrandingLogo() {
  brandingSettings.logoDataUrl = null;
  populateBrandingForm();
  updateBrandingPreview();
}

// ── Color picker ──
function setBrandingColor(hex, updatePreview = true) {
  brandingSettings.primaryColor = hex;
  const swatch = document.getElementById('brandingColorSwatch');
  const picker = document.getElementById('brandingColorPicker');
  const hexInput = document.getElementById('brandingColorHex');
  if (swatch)   swatch.style.background = hex;
  if (picker)   picker.value = hex;
  if (hexInput) hexInput.value = hex;
  // Update preset selection highlight
  document.querySelectorAll('.branding-color-preset').forEach(el => {
    el.classList.toggle('selected', el.style.background === hex || rgbToHex(el.style.background) === hex.toLowerCase());
  });
  if (updatePreview) updateBrandingPreview();
}

function onBrandingColorChange(hex) {
  setBrandingColor(hex);
}

function onBrandingColorHexInput(val) {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    setBrandingColor(val);
  }
}

function rgbToHex(rgb) {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}

// ── Sync hidden #schoolName with brandingSchoolFullName to eliminate duplicate field ──
function syncSchoolName() {
  var bsf = document.getElementById('brandingSchoolFullName');
  var sn  = document.getElementById('schoolName');
  if (bsf && sn) sn.value = bsf.value;
}

// ── Sync Term Label: mirrors examLabel → brandingTermLabel (hidden) & updates preview ──
function syncTermLabel() {
  var el  = document.getElementById('examLabel');
  var btl = document.getElementById('brandingTermLabel');
  if (el && btl) btl.value = el.value;
  updateBrandingPreview();
  // Live-sync: mirror the typed exam label directly into the sidebar chip
  // and workflow dropdown while the user is still typing — no save, no toast.
  // The actual exam.name rename + _emSave() commits on blur via _emAutoRenameFromLabel().
  var typedLabel = el ? el.value.trim() : '';
  var el1 = document.getElementById('examSelectorName');
  var el2 = document.getElementById('sidebarExamName');
  if (typedLabel) {
    // Show what the user is typing in real time
    if (el1) el1.textContent = typedLabel;
    if (el2) el2.textContent = typedLabel;
  } else {
    // Field is empty — restore the committed exam name so the chip never goes blank
    var exam = (typeof _emActive === 'function') ? window._emActive() : null;
    var committedName = exam ? (exam.name || '') : '';
    if (el1) el1.textContent = committedName;
    if (el2) el2.textContent = committedName;
  }
}

// ── Toggle switches ──
function toggleBrandingSig() {
  brandingSettings.showSig = !brandingSettings.showSig;
  document.getElementById('brandingSigToggle').classList.toggle('on', brandingSettings.showSig);
  updateBrandingPreview();
}

function toggleBrandingAddress() {
  brandingSettings.showAddress = !brandingSettings.showAddress;
  document.getElementById('brandingAddressToggle').classList.toggle('on', brandingSettings.showAddress);
  updateBrandingPreview();
}

// ── Live preview ──
function updateBrandingPreview() {
  const color = brandingSettings.primaryColor || '#1a56db';
  const schoolName = (document.getElementById('brandingSchoolFullName') || {}).value
    || brandingSettings.schoolFullName || 'Your School Name';
  const termLabel = (document.getElementById('brandingTermLabel') || {}).value
    || brandingSettings.termLabel || '';
  const address = (document.getElementById('brandingAddress') || {}).value
    || brandingSettings.address || '';

  const prevSchool = document.getElementById('brandingPreviewSchool');
  const prevBar    = document.getElementById('brandingPreviewBar');
  const prevMeta   = document.getElementById('brandingPreviewMeta');
  const prevSig    = document.getElementById('brandingPreviewSig');
  const prevAddr   = document.getElementById('brandingPreviewAddr');
  const prevLogo   = document.getElementById('brandingPreviewLogo');
  const prevLogoPl = document.getElementById('brandingPreviewLogoPlaceholder');

  if (prevSchool) { prevSchool.style.color = color; prevSchool.textContent = schoolName.toUpperCase(); }
  if (prevBar)    prevBar.style.background = color;

  // Meta line: teacher + term
  const cn = (document.getElementById('className') || {}).value || 'Class';
  const tn = (document.getElementById('teacherName') || {}).value || '';
  let metaParts = [];
  if (tn) metaParts.push('Teacher: ' + tn);
  if (termLabel) metaParts.push(termLabel);
  if (prevMeta) prevMeta.textContent = metaParts.join(' • ');

  // Signature
  if (prevSig) prevSig.style.display = brandingSettings.showSig ? '' : 'none';
  // Address
  if (prevAddr) {
    prevAddr.style.display = (brandingSettings.showAddress && address) ? '' : 'none';
    prevAddr.textContent = address;
  }
  // Logo
  if (brandingSettings.logoDataUrl) {
    if (prevLogo)   { prevLogo.src = brandingSettings.logoDataUrl; prevLogo.style.display = 'block'; }
    if (prevLogoPl) prevLogoPl.style.display = 'none';
  } else {
    if (prevLogo)   prevLogo.style.display = 'none';
    if (prevLogoPl) prevLogoPl.style.display = 'flex';
  }
}

// ── Active dot in sidebar ──
function updateBrandingActiveDot() {
  const hasBranding = !!(
    brandingSettings.logoDataUrl ||
    brandingSettings.schoolFullName ||
    brandingSettings.address ||
    brandingSettings.termLabel
  );
  const dot = document.getElementById('brandingActiveDot');
  if (dot) dot.style.display = hasBranding ? 'block' : 'none';
  // Also update inline Setup card badge
  const badge = document.getElementById('brandingSetupActiveBadge');
  if (badge) badge.style.display = hasBranding ? 'inline-flex' : 'none';
  const toggleLabel = document.getElementById('brandingSetupToggleLabel');
  if (toggleLabel) toggleLabel.textContent = hasBranding ? 'Configured ✓' : 'Optional';
}

// ── Helper: get branding for exports ──
function getBrandingForExport() {
  loadBrandingFromStorage();
  return brandingSettings;
}

// ── Initialise on load ──
document.addEventListener('DOMContentLoaded', function() {
  loadBrandingFromStorage();
  updateBrandingActiveDot();
  // NOTE: Do NOT call populateBrandingForm() or updateBrandingPreview() here.
  // The branding body is collapsed (display:none) on load — those functions will
  // be called lazily when the user expands the card (openBrandingSetupCard /
  // toggleBrandingSetupCard). Calling them on a hidden element causes mobile
  // browsers to force-render the hidden content, making it visible.
});

// ════════════════════════════════════════════
//  PASS MARK PER SUBJECT
// ════════════════════════════════════════════

// subjectPassMarks: { [subjectName]: number (0-100) }
// If undefined for a subject → use global pass mark
let subjectPassMarks = {};

function getSubjectPassPct(subjName) {
  if (subjectPassMarks[subjName] !== undefined) return subjectPassMarks[subjName];
  // Global pass mark = minPct of the second-highest grade
  const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  return sorted.length > 1 ? sorted[sorted.length - 2].minPct : 50;
}

function openPassMarkPanel() {
  renderPassMarkPanel();
  document.getElementById('passmarkPanelOverlay').classList.add('open');
}

function closePassMarkPanel() {
  // ── Collect every input value at save time ──
  // Uses data-subject attribute — safe for any subject name (commas, quotes, etc).
  const inputs = document.querySelectorAll('#passmarkPanelBody .passmark-subject-input');
  inputs.forEach(el => {
    const subjName = el.dataset.subject;
    if (!subjName) return;
    const val = el.value.trim();
    const num = parseFloat(val);
    if (val === '' || isNaN(num)) {
      delete subjectPassMarks[subjName];
    } else {
      subjectPassMarks[subjName] = Math.max(0, Math.min(100, num));
    }
  });

  document.getElementById('passmarkPanelOverlay').classList.remove('open');

  // Show feedback toast
  const customCount = Object.keys(subjectPassMarks).length;
  if (customCount > 0) {
    window.toast(`Pass marks saved — ${customCount} custom, ${(window.subjects||[]).length - customCount} using global`, 'success');
  } else {
    window.toast('Pass marks saved — all subjects using global pass mark', 'success');
  }

  // Re-render marks table so pass coloring updates
  window.renderMarksTable();
  // Also refresh Results and Analytics if calculated
  if (window.results && window.results.length) {
    window.renderResultsTable();
    if (typeof window.renderSubjectAnalytics === 'function') window.renderSubjectAnalytics();
  }
}

function resetAllPassMarks() {
  if (!confirm('Reset all subject pass marks to the global pass mark?')) return;
  subjectPassMarks = {};
  renderPassMarkPanel();
  window.renderMarksTable();
  if (window.results && window.results.length) {
    window.renderResultsTable();
    if (typeof window.renderSubjectAnalytics === 'function') window.renderSubjectAnalytics();
  }
  window.toast('All subject pass marks reset to global');
}

function renderPassMarkPanel() {
  const globalPct = (() => {
    const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
    return sorted.length > 1 ? sorted[sorted.length - 2].minPct : 35;
  })();

  if (!subjects.length) {
    document.getElementById('passmarkPanelBody').innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px;">
        No subjects added yet. Add subjects first in the Subjects tab.
      </div>`;
    return;
  }

  let html = `
    <div class="passmark-global-row">
      <label>🌐 Global pass mark (from grading scale)</label>
      <strong style="font-size:15px;color:var(--primary);">${globalPct}%</strong>
    </div>

    <div class="passmark-bulk-bar">
      <span class="passmark-bulk-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14" style="flex-shrink:0;margin-top:1px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Set all to
      </span>
      <div class="passmark-bulk-input-wrap">
        <input type="number" id="bulkPassMarkInput" class="passmark-bulk-input"
          min="0" max="100" step="1" placeholder="${globalPct}"
          onkeydown="if(event.key===\'Enter\'){event.preventDefault();applyBulkPassMark();}" />
        <span class="passmark-bulk-pct">%</span>
      </div>
      <button class="btn btn-primary btn-sm passmark-bulk-btn" onclick="applyBulkPassMark()">
        Apply to all
      </button>
    </div>

    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6;">
      Set a <strong>custom pass mark</strong> for individual subjects below. Leave blank to use the global pass mark (${globalPct}%). 
      This affects pass/fail coloring in the marks table and results exports.
    </div>`;

  subjects.forEach(s => {
    const custom = subjectPassMarks[s.name];
    const displayVal = custom !== undefined ? custom : '';
    const isCustom = custom !== undefined;
    html += `
      <div class="passmark-subject-row">
        <div class="passmark-subject-name">
          ${s.name}
          ${isCustom ? `<span style="font-size:10px;background:var(--custom-badge-bg);color:var(--custom-badge-fg);border-radius:4px;padding:1px 6px;margin-left:6px;font-weight:700;">Custom</span>` : ''}
        </div>
        <span class="passmark-subject-max">max ${s.max}</span>
        <input type="number" class="passmark-subject-input" min="0" max="100" step="1"
          data-subject="${s.name.replace(/"/g, '&quot;')}"
          placeholder="${globalPct}"
          value="${displayVal}"
          oninput="updateSubjectPassMark(this)"
          title="Pass mark % for ${s.name} (blank = use global ${globalPct}%)" />
        <span class="passmark-pct-label">%</span>
        ${isCustom ? `<button class="btn btn-xs btn-danger-ghost" onclick="clearSubjectPassMark(this)" title="Clear custom">×</button>` : ''}
      </div>`;
  });

  document.getElementById('passmarkPanelBody').innerHTML = html;
}

function applyBulkPassMark() {
  const inp = document.getElementById('bulkPassMarkInput');
  if (!inp) return;
  const val = inp.value.trim();
  const num = parseFloat(val);
  if (val === '' || isNaN(num) || num < 0 || num > 100) {
    window.toast('Enter a valid percentage (0–100)', 'error');
    inp.focus();
    return;
  }
  const clamped = Math.max(0, Math.min(100, num));
  subjects.forEach(s => { subjectPassMarks[s.name] = clamped; });
  renderPassMarkPanel();
  // Restore bulk input value so user can see what they applied
  const freshInp = document.getElementById('bulkPassMarkInput');
  if (freshInp) freshInp.value = clamped;
  window.renderMarksTable();
  if (window.results && window.results.length) {
    window.renderResultsTable();
    if (typeof window.renderSubjectAnalytics === 'function') window.renderSubjectAnalytics();
  }
  window.toast(`Pass mark set to ${clamped}% for all ${subjects.length} subjects`, 'success');
}

function updateSubjectPassMark(el) {
  const subjName = el.dataset.subject;
  if (!subjName) return;
  const val = el.value.trim();
  const num = parseFloat(val);
  if (val === '' || isNaN(num)) {
    delete subjectPassMarks[subjName];
  } else {
    subjectPassMarks[subjName] = Math.max(0, Math.min(100, num));
  }
  // Live border feedback
  el.style.borderColor = val !== '' ? 'var(--pass-border-fg)' : '';
}

function clearSubjectPassMark(el) {
  const subjName = el.closest('[data-subject]')
    ? el.closest('[data-subject]').dataset.subject
    : el.dataset.subject;
  if (!subjName) return;
  delete subjectPassMarks[subjName];
  renderPassMarkPanel();
  window.renderMarksTable();
  if (window.results && window.results.length) {
    window.renderResultsTable();
    if (typeof window.renderSubjectAnalytics === 'function') window.renderSubjectAnalytics();
  }
  window.toast(`Pass mark for "${subjName}" reset to global`);
}

// ════════════════════════════════════════════
//  SUBJECT-WISE GRADES MODAL
// ════════════════════════════════════════════

function openSubjectGradesModal() {
  if (!results.length) { window.toast('Calculate results first', 'error'); return; }
  renderSubjectGradesModal();
  document.getElementById('subjGradeModalOverlay').classList.add('open');
}

function closeSubjectGradesModal() {
  document.getElementById('subjGradeModalOverlay').classList.remove('open');
}

function getSubjectGradeForStudent(result, subj) {
  const v = result.subjMarks[subj.name];
  if (v === null || v === undefined) return { grade: '—', color: '#9ca3af', pct: null, pass: null };
  if (v === 'AB') return { grade: 'AB', color: '#dc2626', pct: null, pass: false, absent: true };
  const pct = subj.max > 0 ? (v / subj.max) * 100 : 0;
  const passPct = getSubjectPassPct(subj.name);
  const grade = window.getGrade(pct);
  const color = window.getGradeColor(grade);
  return { grade, color, pct: parseFloat(pct.toFixed(1)), pass: pct >= passPct };
}

function renderSubjectGradesModal() {
  const sortedGrades = [...gradingScale].sort((a, b) => b.minPct - a.minPct);

  // Scale legend
  let scalePills = sortedGrades.map(g =>
    `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}55;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;">${g.label} ≥${g.minPct}%</span>`
  ).join('');

  // Pass marks legend
  let passInfo = subjects.map(s => {
    const pm = getSubjectPassPct(s.name);
    const isCustom = subjectPassMarks[s.name] !== undefined;
    return `<span style="font-size:11px;color:var(--text-muted);">${s.name}: <strong style="color:${isCustom?'#d97706':'var(--primary)'};">${pm}%</strong>${isCustom?' ★':''}</span>`;
  }).join(' &nbsp;·&nbsp; ');

  // Build table
  let theadCols = `<th style="text-align:left;min-width:130px;">Student</th>`;
  subjects.forEach(s => {
    theadCols += `<th>${s.name}<br><span style="font-weight:400;font-size:9px;text-transform:none;letter-spacing:0;">/${s.max}</span></th>`;
  });
  theadCols += `<th>Overall</th>`;

  let rows = '';
  results.forEach((r, ri) => {
    const rowBg = ri % 2 === 1 ? 'var(--row-alt-bg)' : 'var(--surface)';
    const rowBorder = 'var(--row-border)';
    let tds = `<td style="font-weight:600;font-size:13px;padding:7px 10px;border-bottom:1px solid ${rowBorder};white-space:nowrap;background:${rowBg};">
      <span style="font-size:10px;background:var(--idx-chip-bg);color:var(--idx-chip-fg);border-radius:3px;padding:1px 5px;margin-right:5px;font-weight:700;">${r.idx}</span>${r.student}
    </td>`;
    subjects.forEach(s => {
      const { grade, color, pct, pass, absent } = getSubjectGradeForStudent(r, s);
      if (absent) {
        tds += `<td style="text-align:center;padding:7px 8px;border-bottom:1px solid ${rowBorder};background:${rowBg};">
          <span class="result-ab-badge" title="Student was absent">AB</span>
        </td>`;
      } else if (pct === null) {
        tds += `<td style="text-align:center;padding:7px 8px;border-bottom:1px solid ${rowBorder};background:${rowBg};color:var(--mark-absent-fg);font-size:11px;">—</td>`;
      } else {
        const passIcon = pass ? '✓' : '✗';
        const passColor = pass ? 'var(--success)' : 'var(--danger)';
        tds += `<td style="text-align:center;padding:7px 8px;border-bottom:1px solid ${rowBorder};background:${rowBg};">
          <div><span style="background:${color}22;color:${color};border:1px solid ${color}44;padding:2px 7px;border-radius:99px;font-size:12px;font-weight:800;">${grade}</span></div>
          <div style="font-size:10px;color:${passColor};font-weight:700;margin-top:2px;">${passIcon} ${pct}%</div>
        </td>`;
      }
    });
    // Overall
    const oc = window.getGradeColor(r.grade);
    tds += `<td style="text-align:center;padding:7px 8px;border-bottom:1px solid ${rowBorder};background:${rowBg};">
      <span style="background:${oc}22;color:${oc};border:1px solid ${oc}44;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:800;">${r.grade}</span>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${r.pct}%</div>
    </td>`;
    rows += `<tr>${tds}</tr>`;
  });

  document.getElementById('subjGradeModalBody').innerHTML = `
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:5px;">Grading Scale</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">${scalePills}</div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.8;"><strong>Pass marks per subject:</strong> &nbsp;${passInfo}&nbsp; <em>(★ = custom)</em></div>
    </div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;">
      <table class="subjgrade-table">
        <thead><tr>${theadCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}


// ── Window exports ──
Object.assign(window, {
  _syncBrandingFromDOM,
  clearBrandingLogo,
  clearSubjectPassMark,
  closeBrandingPanel,
  closePassMarkPanel,
  closeSubjectGradesModal,
  getBrandingForExport,
  getSubjectGradeForStudent,
  getSubjectPassPct,
  handleBrandingLogoUpload,
  loadBrandingFromStorage,
  onBrandingColorChange,
  onBrandingColorHexInput,
  openBrandingPanel,
  openBrandingSetupCard,
  openPassMarkPanel,
  openSubjectGradesModal,
  populateBrandingForm,
  renderPassMarkPanel,
  renderSubjectGradesModal,
  applyBulkPassMark,
  resetAllPassMarks,
  resetBranding,
  rgbToHex,
  saveBrandingFromSetup,
  saveBrandingSettings,
  setBrandingColor,
  syncSchoolName,
  syncTermLabel,
  toggleBrandingAddress,
  toggleBrandingSetupCard,
  toggleBrandingSig,
  updateBrandingActiveDot,
  updateBrandingPreview,
  updateSubjectPassMark
});

// Expose subjectPassMarks with getter/setter so autosave.js and exam-manager.js can access it
Object.defineProperty(window, 'subjectPassMarks', {
  get() { return subjectPassMarks; },
  set(v) { subjectPassMarks = v; },
  configurable: true,
});

// Expose brandingSettings with getter/setter so student-card.js and backup.js can access it
Object.defineProperty(window, 'brandingSettings', {
  get() { return brandingSettings; },
  set(v) { brandingSettings = v; },
  configurable: true,
});

// Expose BRANDING_KEY so backup.js can use the same storage key
window.BRANDING_KEY = BRANDING_KEY;
