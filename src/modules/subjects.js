// ═══════════════════════════════════════════════════════════════
//  src/modules/subjects.js
//  Subjects & Categories: CRUD, mandatory/elective toggles,
//  category filter, renderCategoryButtons, renderSubjectTags,
//  calcStudentTotalAndMax, getGlobalMax, sample data loader.
// ═══════════════════════════════════════════════════════════════
// ── Subjects & Categories ──
// Each category: { name, mandatory }
// mandatory=true → all students sit every subject in this category (e.g. Academic)
// mandatory=false → each student picks ONE subject from this category (e.g. Aesthetic)
// NOTE: The authoritative `categories` array lives in state.js and is always
// accessed via `window.categories`. Do NOT declare a local `let categories` here —
// that would shadow the live state and cause isCatMandatory / calcStudentTotalAndMax
// to read a stale copy that never reflects user-created categories.

// ── Category helpers ──
function getCatNames() { return window.categories.map(c => c.name); }
function isCatMandatory(name) {
  if (!name || name === '' || name === '__uncategorised__') return true; // uncategorised → mandatory
  const c = window.categories.find(x => x.name === name);
  // If the category name is not in the list at all, default to elective (false)
  // rather than mandatory — unknown categories come from user-defined groups that
  // haven't been synced, and we should never silently treat them as mandatory.
  return c ? c.mandatory : false;
}
function toggleCatMandatory(name) {
  const c = window.categories.find(x => x.name === name);
  if (c) { c.mandatory = !c.mandatory; renderCategoryButtons(); renderSubjectTags(); window.renderMarksTable(); }
}

// ── Per-student total & max calculation (respects elective rule) ──
// For mandatory categories: all subjects count.
// For elective categories: only the ONE subject the student has a mark for counts
// (if multiple have marks, we sum them all — teacher should only enter one).
function calcStudentTotalAndMax(studentName) {
  // Group subjects by category
  const groups = {};
  subjects.forEach(s => {
    const cat = s.category || '__none__';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });

  let total = 0, max = 0;
  Object.entries(groups).forEach(([cat, subjs]) => {
    const catName = cat === '__none__' ? '' : cat;
    const mandatory = window.isCatMandatory(catName);

    if (mandatory) {
      // All subjects in this category count.
      // "AB" (absent) = student did not sit this exam.
      // Absent subjects are excluded from BOTH total AND max so the
      // percentage remains fair (only assessed subjects count).
      subjs.forEach(s => {
        const v = marks[`${studentName}||${s.name}`];
        const isAbsent = v === 'AB';
        if (isAbsent) return; // exclude absent from total & max
        const num = (v !== undefined && v !== '') ? parseFloat(v) || 0 : 0;
        total += num;
        max += s.max;
      });
    } else {
      // Elective: only subjects that have a real mark entered count (student chose one).
      // "AB" on an elective means student was absent for that elective slot.
      const chosen = subjs.filter(s => {
        const v = marks[`${studentName}||${s.name}`];
        return v !== undefined && v !== '' && v !== 'AB' && !isNaN(parseFloat(v));
      });
      if (chosen.length > 0) {
        chosen.forEach(s => {
          const v = marks[`${studentName}||${s.name}`];
          total += parseFloat(v) || 0;
          max += s.max;
        });
      } else {
        // No mark entered (or all marked absent) — take the first non-absent
        // subject's max as the expected max, unless all are AB (then skip).
        const allAbsent = subjs.every(s => marks[`${studentName}||${s.name}`] === 'AB');
        if (!allAbsent && subjs.length > 0) max += subjs[0].max;
      }
    }
  });
  return { total: parseFloat(total.toFixed(1)), max };
}

// Global maximum possible marks (Academic subjects + one subject per elective category)
function getGlobalMax() {
  const groups = {};
  subjects.forEach(s => {
    const cat = s.category || '__none__';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });
  let max = 0;
  Object.entries(groups).forEach(([cat, subjs]) => {
    const catName = cat === '__none__' ? '' : cat;
    const mandatory = window.isCatMandatory(catName === '' ? '__uncategorised__' : catName);
    if (mandatory || catName === '') {
      subjs.forEach(s => { max += s.max; });
    } else {
      // One subject per elective category — use the max of the highest-max subject
      max += Math.max(...subjs.map(s => s.max));
    }
  });
  return max;
}

function addSubject() {
  const sIn  = document.getElementById('subjectInput');
  const cIn  = document.getElementById('subjectCategoryInput');
  const mIn  = document.getElementById('maxMarkInput');
  const name = sIn.value.trim();
  const cat  = cIn.value.trim() || '';
  const max  = parseInt(mIn.value);
  if (!name) { window.toast('Enter a subject name', 'error'); return; }
  if (isNaN(max) || max < 1) { window.toast('Enter valid max marks', 'error'); return; }
  if (subjects.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    window.toast('Subject already added', 'error'); sIn.value = ''; mIn.value = ''; return;
  }
  // Auto-add new category if typed (not used now but kept for safety)
  if (cat && !window.categories.find(c => c.name === cat)) { window.categories.push({ name: cat, mandatory: false }); }
  subjects.push({ name, max, category: cat });
  sIn.value = ''; mIn.value = '';
  // Reset category selection to "No group"
  cIn.value = '';
  sIn.focus();
  updateBadge('subjects', subjects.length);
  renderSubjectTags();
  renderCategoryButtons();
  updateCategoryDatalist();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast(`${name} added${cat ? ' (' + cat + ')' : ''}`);
}

function removeSubject(i) {
  const name = subjects[i].name;
  subjects.splice(i, 1);
  updateBadge('subjects', subjects.length);
  renderSubjectTags();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast(`${name} removed`);
}

function addCategory() {
  const inp  = document.getElementById('newCategoryInput');
  const name = inp.value.trim();
  if (!name) return;
  if (window.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    window.toast('Category already exists', 'error'); inp.value = ''; return;
  }
  window.categories.push({ name, mandatory: false });
  inp.value = '';
  renderCategoryButtons();
  renderSubjectCategoryPicker();
  updateCategoryDatalist();
  window.toast(`Group "${name}" added — set to "Choose 1" by default`);
}

function removeCategory(name) {
  const used = subjects.filter(s => s.category === name).length;
  if (used > 0) {
    if (!confirm(`"${name}" has ${used} subject(s). Remove group label from them and delete?`)) return;
    subjects.forEach(s => { if (s.category === name) s.category = ''; });
  }
  window.categories = window.categories.filter(c => c.name !== name);
  // If current picker selection was this category, reset it
  const cIn = document.getElementById('subjectCategoryInput');
  if (cIn && cIn.value === name) cIn.value = '';
  renderCategoryButtons();
  renderSubjectCategoryPicker();
  renderSubjectTags();
  updateCategoryDatalist();
  window.toast(`Group "${name}" removed`);
}

function setCategoryFilter(cat) {
  selectSubjectCategory(cat);
}

function renderCategoryButtons() {
  const el = document.getElementById('categoryQuickBtns');
  if (!el) return;
  const counts = {};
  subjects.forEach(s => { const c = s.category || ''; counts[c] = (counts[c] || 0) + 1; });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Light palette: [cardBg, accentFg, border]
  const lightColors = [
    ['#EFF6FF','#1A56DB','#BFDBFE'],
    ['#ECFDF5','#059669','#A7F3D0'],
    ['#FFF7ED','#D97706','#FDE68A'],
    ['#F5F3FF','#7C3AED','#DDD6FE'],
    ['#FEF2F2','#DC2626','#FECACA'],
    ['#F0FDFA','#0D9488','#99F6E4'],
  ];
  // Dark palette: [cardBg, accentFg, border] — deep tinted, readable
  const darkColors = [
    ['#1e3a5f','#60a5fa','#2d4f7a'],
    ['#064e3b','#34d399','#0a6650'],
    ['#3d2c00','#fbbf24','#5a4200'],
    ['#2e1c6e','#a78bfa','#4a3090'],
    ['#450a0a','#f87171','#6b1212'],
    ['#0c3a38','#2dd4bf','#145550'],
  ];
  const colors = isDark ? darkColors : lightColors;
  // Inactive toggle bg: light=white, dark=surface
  const inactiveBg = isDark ? '#374151' : 'white';
  // Subject count badge bg
  const badgeBg = isDark ? 'rgba(255,255,255,0.1)' : 'white';

  if (!window.categories.length) {
    el.innerHTML = `<div style="font-size:13px;color:var(--text-light);padding:6px 2px;">No groups yet — type a name below and click "Add group"</div>`;
    renderSubjectCategoryPicker();
    return;
  }

  el.innerHTML = window.categories.map((cat, idx) => {
    const n = counts[cat.name] || 0;
    const ci = idx % colors.length;
    const [bg, fg, border] = colors[ci];
    const isMandatory = cat.mandatory;
    const safeName = cat.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    return `<div data-cat-name="${cat.name.replace(/"/g,'&quot;')}" data-cat-idx="${idx}" class="cat-reorder-card" style="background:${bg};border:1.5px solid ${border};border-radius:10px;padding:9px 14px;transition:box-shadow 0.15s;">
      <div class="cat-card-row">
        <span class="cat-drag-handle" data-cat-idx="${idx}" title="Drag to reorder groups — order affects column layout in Marks and Results" style="color:${fg};opacity:0.35;cursor:grab;display:inline-flex;align-items:center;flex-shrink:0;padding:0 4px 0 0;transition:opacity 0.12s;touch-action:none;user-select:none;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='0.35'"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/><circle cx="2.5" cy="6" r="1.5"/><circle cx="7.5" cy="6" r="1.5"/><circle cx="2.5" cy="10" r="1.5"/><circle cx="7.5" cy="10" r="1.5"/><circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/></svg></span>
        <span style="width:10px;height:10px;border-radius:50%;background:${fg};flex-shrink:0;display:inline-block;"></span>
        <span class="cat-card-name" style="color:${fg};">${cat.name}</span>
        ${n > 0 ? `<span style="font-size:11px;font-weight:700;color:${fg};background:${badgeBg};border:1.5px solid ${border};border-radius:99px;padding:1px 8px;flex-shrink:0;">${n} subject${n!==1?'s':''}</span>` : `<span style="font-size:11px;color:${fg};opacity:0.5;flex-shrink:0;">empty</span>`}
        <div class="cat-card-controls">
          <div style="display:flex;align-items:center;gap:0;border:1.5px solid ${border};border-radius:8px;overflow:hidden;">
            <button onclick="if(!${isMandatory}) toggleCatMandatory('${safeName}'); return false;"
              title="All students take every subject in this group"
              style="padding:4px 10px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;border:none;transition:all 0.15s;white-space:nowrap;
                background:${isMandatory ? fg : inactiveBg};color:${isMandatory ? 'white' : fg};">
              ✓ Required
            </button>
            <button onclick="if(${isMandatory}) toggleCatMandatory('${safeName}'); return false;"
              title="Each student picks ONE subject from this group"
              style="padding:4px 10px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;border:none;border-left:1.5px solid ${border};transition:all 0.15s;white-space:nowrap;
                background:${!isMandatory ? fg : inactiveBg};color:${!isMandatory ? 'white' : fg};">
              Choose 1
            </button>
          </div>
          <button onclick="startEditCategory('${safeName}'); return false;"
            title="Rename this group"
            class="cat-edit-btn"
            style="background:none;border:1.5px solid ${border};border-radius:6px;cursor:pointer;color:${fg};opacity:0.55;font-size:13px;line-height:1;padding:3px 6px;font-family:inherit;flex-shrink:0;transition:opacity 0.12s;display:inline-flex;align-items:center;gap:3px;"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.55'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="removeCategory('${safeName}'); return false;"
            title="Remove this group"
            style="background:none;border:none;cursor:pointer;color:${fg};opacity:0.45;font-size:16px;line-height:1;padding:0 2px;font-family:inherit;flex-shrink:0;transition:opacity 0.12s;"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.45'">×</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Inject drag-to-reorder styles once
  _injectCatDragStyles();
  // Wire up drag handles
  initCategoryDragDrop();
  // Also refresh the subject group picker
  renderSubjectCategoryPicker();
}

// ── Category Drag-to-Reorder ──
// Pointer-event based drag that reorders window.categories[].
// Column order in Marks and Results tables is driven by window.categories order.

let _catDrag = null;
let _catDragStylesInjected = false;

function _injectCatDragStyles() {
  if (_catDragStylesInjected) return;
  _catDragStylesInjected = true;
  const style = document.createElement('style');
  style.id = 'cat-dnd-styles';
  style.textContent = `
    /* Category reorder card */
    .cat-reorder-card { position: relative; }
    .cat-reorder-card.cat-is-dragging { opacity: 0.28 !important; }

    /* Insert line indicator: top = insert above, bottom = insert below */
    .cat-reorder-card.cat-insert-before::before {
      content: '';
      position: absolute;
      top: -5px; left: 6px; right: 6px;
      height: 3px;
      border-radius: 3px;
      background: rgba(99,102,241,0.85);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
      pointer-events: none;
    }
    .cat-reorder-card.cat-insert-after::after {
      content: '';
      position: absolute;
      bottom: -5px; left: 6px; right: 6px;
      height: 3px;
      border-radius: 3px;
      background: rgba(99,102,241,0.85);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
      pointer-events: none;
    }
    [data-theme="dark"] .cat-reorder-card.cat-insert-before::before,
    [data-theme="dark"] .cat-reorder-card.cat-insert-after::after {
      background: rgba(129,140,248,0.9);
      box-shadow: 0 0 0 3px rgba(129,140,248,0.22);
    }

    /* Cursor & selection lock during drag */
    body.cat-dragging-active { cursor: grabbing !important; }
    body.cat-dragging-active * { user-select: none !important; }
    body.cat-dragging-active .cat-drag-handle { cursor: grabbing !important; }

    /* Drag ghost card */
    .cat-drag-ghost {
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      opacity: 0.92;
      transform: rotate(1.5deg) scale(1.04);
      box-shadow: 0 12px 36px rgba(0,0,0,0.22);
      border-radius: 10px;
    }

    /* Subtle order hint label inside category section */
    #cat-order-hint {
      font-size: 11px;
      color: var(--text-light);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 5px;
      opacity: 0.75;
    }
  `;
  if (!document.getElementById('cat-dnd-styles')) {
    document.head.appendChild(style);
  }
}

function initCategoryDragDrop() {
  document.querySelectorAll('.cat-drag-handle').forEach(handle => {
    handle.removeEventListener('pointerdown', _onCatHandleDown);
    handle.addEventListener('pointerdown', _onCatHandleDown, { passive: false });
  });
}

function _onCatHandleDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const card = e.currentTarget.closest('.cat-reorder-card');
  if (!card) return;

  e.preventDefault();
  e.stopPropagation();

  const idx = parseInt(e.currentTarget.dataset.catIdx);
  const rect = card.getBoundingClientRect();

  // Ghost clone
  const ghost = card.cloneNode(true);
  ghost.querySelectorAll('input').forEach(n => n.remove());
  ghost.classList.add('cat-drag-ghost');
  Object.assign(ghost.style, {
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    margin: '0',
  });
  document.body.appendChild(ghost);

  card.classList.add('cat-is-dragging');
  document.body.classList.add('cat-dragging-active');

  _catDrag = {
    idx,
    card,
    ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    insertTargetIdx: null,
    insertBefore: true,
  };

  try { e.currentTarget.setPointerCapture(e.pointerId); } catch(_) {}

  document.addEventListener('pointermove', _onCatDragMove, { passive: false });
  document.addEventListener('pointerup',   _onCatDragEnd);
  document.addEventListener('pointercancel', _onCatDragCancel);
}

function _clearCatInsertIndicators() {
  document.querySelectorAll('.cat-reorder-card').forEach(c => {
    c.classList.remove('cat-insert-before', 'cat-insert-after');
  });
}

function _onCatDragMove(e) {
  if (!_catDrag) return;
  e.preventDefault();
  const { ghost, offsetX, offsetY } = _catDrag;

  ghost.style.left = (e.clientX - offsetX) + 'px';
  ghost.style.top  = (e.clientY - offsetY) + 'px';

  // Hit test
  ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.visibility = '';

  _clearCatInsertIndicators();

  const targetCard = under && under.closest('.cat-reorder-card:not(.cat-is-dragging)');
  if (targetCard) {
    const tRect = targetCard.getBoundingClientRect();
    const insertBefore = e.clientY < tRect.top + tRect.height / 2;
    const targetIdx = parseInt(targetCard.dataset.catIdx);
    _catDrag.insertTargetIdx = targetIdx;
    _catDrag.insertBefore = insertBefore;
    targetCard.classList.add(insertBefore ? 'cat-insert-before' : 'cat-insert-after');
  } else {
    _catDrag.insertTargetIdx = null;
  }
}

function _onCatDragEnd(e) {
  if (!_catDrag) return;
  const { idx, card, ghost, insertTargetIdx, insertBefore } = _catDrag;

  ghost.remove();
  card.classList.remove('cat-is-dragging');
  document.body.classList.remove('cat-dragging-active');
  _clearCatInsertIndicators();
  _catDrag = null;
  document.removeEventListener('pointermove', _onCatDragMove);
  document.removeEventListener('pointerup',   _onCatDragEnd);
  document.removeEventListener('pointercancel', _onCatDragCancel);

  // No valid drop target, or same position — no-op
  if (insertTargetIdx === null || insertTargetIdx === idx) return;

  // Reorder window.categories[]
  const cats = window.categories;
  const [moved] = cats.splice(idx, 1);
  // Re-calculate insertion index after removal
  let insertAt = insertTargetIdx > idx ? insertTargetIdx - 1 : insertTargetIdx;
  if (!insertBefore) insertAt += 1;
  cats.splice(insertAt, 0, moved);

  // Re-render everything that depends on category order
  renderCategoryButtons();
  renderSubjectTags();
  if (typeof window.renderMarksTable === 'function') window.renderMarksTable();
  if (typeof window.renderResults === 'function') window.renderResults();

  window.toast(`"${moved.name}" moved ${insertBefore ? 'up' : 'down'} — column order updated`);
}

function _onCatDragCancel() {
  if (!_catDrag) return;
  const { card, ghost } = _catDrag;
  ghost.remove();
  card.classList.remove('cat-is-dragging');
  document.body.classList.remove('cat-dragging-active');
  _clearCatInsertIndicators();
  _catDrag = null;
  document.removeEventListener('pointermove', _onCatDragMove);
  document.removeEventListener('pointerup',   _onCatDragEnd);
  document.removeEventListener('pointercancel', _onCatDragCancel);
}

// Renders the pill-picker in the "Add a Subject" section
function renderSubjectCategoryPicker() {
  const el = document.getElementById('subjectCategoryPicker');
  if (!el) return;
  const selected = document.getElementById('subjectCategoryInput').value;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const lightColors = [
    ['#EFF6FF','#1A56DB','#BFDBFE'],
    ['#ECFDF5','#059669','#A7F3D0'],
    ['#FFF7ED','#D97706','#FDE68A'],
    ['#F5F3FF','#7C3AED','#DDD6FE'],
    ['#FEF2F2','#DC2626','#FECACA'],
    ['#F0FDFA','#0D9488','#99F6E4'],
  ];
  const darkColors = [
    ['#1e3a5f','#60a5fa','#2d4f7a'],
    ['#064e3b','#34d399','#0a6650'],
    ['#3d2c00','#fbbf24','#5a4200'],
    ['#2e1c6e','#a78bfa','#4a3090'],
    ['#450a0a','#f87171','#6b1212'],
    ['#0c3a38','#2dd4bf','#145550'],
  ];
  const colors = isDark ? darkColors : lightColors;
  // "No group" button colours
  const noneActiveBg   = isDark ? '#e2e8f0' : '#111827';
  const noneInactiveBg = isDark ? '#374151' : 'white';
  const noneInactiveFg = isDark ? '#a0aec0' : 'var(--text-muted)';
  const noneInactiveBorder = isDark ? '#4a5568' : 'var(--border)';

  const noneActive = selected === '';
  let html = `<button onclick="selectSubjectCategory('')" style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;
    background:${noneActive ? noneActiveBg : noneInactiveBg};color:${noneActive ? (isDark ? '#111827' : 'white') : noneInactiveFg};border:1.5px solid ${noneActive ? noneActiveBg : noneInactiveBorder};">
    No group
  </button>`;

  html += window.categories.map((cat, idx) => {
    const ci = idx % colors.length;
    const [bg, fg, border] = colors[ci];
    const active = selected === cat.name;
    return `<button onclick="selectSubjectCategory('${cat.name.replace(/'/g,"\\'")}'); return false;"
      style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;
        background:${active ? fg : bg};color:${active ? 'white' : fg};border:1.5px solid ${active ? fg : border};">
      ${cat.name}
    </button>`;
  }).join('');

  el.innerHTML = html;
}

function selectSubjectCategory(name) {
  document.getElementById('subjectCategoryInput').value = name;
  renderSubjectCategoryPicker();
  document.getElementById('subjectInput').focus();
}

function updateCategoryDatalist() {
  const dl = document.getElementById('categoryDatalist');
  if (!dl) return;
  dl.innerHTML = window.categories.map(c => `<option value="${c.name}">`).join('');
}

function renderSubjectTags() {
  const el = document.getElementById('subjectList');
  if (!subjects.length) {
    el.innerHTML = '<span style="font-size:13px;color:var(--text-light);padding:4px 0;">No subjects yet — add subjects above</span>';
    return;
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Group by category
  const groups = {};
  const ORDER_KEY = '__order__';
  subjects.forEach((s, i) => {
    const cat = s.category || '';
    if (!groups[cat]) groups[cat] = { label: cat, items: [] };
    groups[cat].items.push({ s, i });
  });

  // Sort groups: named categories first (in order), then uncategorised
  const catOrder = [...window.categories.map(c => c.name), ''];
  const sorted = catOrder.filter(c => groups[c]).map(c => groups[c]);

  // Accent foreground colors only (used for text/border on dark tinted bg)
  const lightFgColors = ['#1A56DB','#059669','#D97706','#7C3AED','#DC2626','#0D9488'];
  const darkFgColors  = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#2dd4bf'];
  // Light mode card bg  / dark mode card bg
  const lightBgColors = ['#EFF6FF','#ECFDF5','#FFF7ED','#F5F3FF','#FEF2F2','#F0FDFA'];
  const darkBgColors  = ['#1e3a5f','#064e3b','#3d2c00','#2e1c6e','#450a0a','#0c3a38'];

  // Mandatory/elective badge colors
  const mandatoryBadgeBg     = isDark ? '#064e3b' : '#ecfdf5';
  const mandatoryBadgeFg     = isDark ? '#34d399' : '#059669';
  const mandatoryBadgeBorder = isDark ? '#0a6650' : '#a7f3d0';
  const electiveBadgeBg      = isDark ? '#1e3a5f' : '#eff6ff';
  const electiveBadgeFg      = isDark ? '#60a5fa' : '#1a56db';
  const electiveBadgeBorder  = isDark ? '#2d4f7a' : '#bfdbfe';

  let html = '';
  sorted.forEach(group => {
    const hasLabel = group.label !== '';
    if (hasLabel) {
      const ci = window.categories.findIndex(c => c.name === group.label) % 6;
      const fg = isDark ? darkFgColors[ci] : lightFgColors[ci];
      const bg = isDark ? darkBgColors[ci] : lightBgColors[ci];
      const mandatory = isCatMandatory(group.label);
      const bBg     = mandatory ? mandatoryBadgeBg     : electiveBadgeBg;
      const bFg     = mandatory ? mandatoryBadgeFg     : electiveBadgeFg;
      const bBorder = mandatory ? mandatoryBadgeBorder : electiveBadgeBorder;
      html += `<div style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:${fg};background:${bg};padding:3px 10px;border-radius:99px;">${group.label}</span>
          <span style="font-size:11px;color:var(--text-light);">${group.items.length} subject${group.items.length !== 1 ? 's' : ''}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${bBg};color:${bFg};border:1px solid ${bBorder};display:inline-flex;align-items:center;">${mandatory ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>Mandatory (all sit)' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>Elective (choose 1)'}</span>
        </div>
        <div class="subj-drop-zone" data-drop-cat="${group.label}" style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 4px 4px 8px;border-radius:8px;min-height:36px;transition:background 0.18s,box-shadow 0.18s;">
          ${group.items.map(({s,i}) => `
            <div class="tag subject-tag" data-subj-idx="${i}" data-fg="${fg}" data-border="${fg}55" style="border-color:${fg}55;background:${bg};">
              <span class="subj-drag-handle" data-subj-idx="${i}" title="Drag to move to another group" style="color:${fg};opacity:0.35;cursor:grab;font-size:11px;padding:0 3px 0 0;display:inline-flex;align-items:center;user-select:none;touch-action:none;flex-shrink:0;transition:opacity 0.12s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='0.35'"><svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor"><circle cx="2.5" cy="2" r="1.5"/><circle cx="6.5" cy="2" r="1.5"/><circle cx="2.5" cy="6.5" r="1.5"/><circle cx="6.5" cy="6.5" r="1.5"/><circle cx="2.5" cy="11" r="1.5"/><circle cx="6.5" cy="11" r="1.5"/></svg></span>
              <span style="color:${fg};font-weight:700;">${s.name}</span>
              <span style="opacity:0.6;font-weight:400;font-size:11px;">(/${s.max})</span>
              <button onclick="startEditSubject(${i})" title="Edit subject" class="subj-pencil-btn" style="color:${fg};opacity:0.5;background:none;border:none;cursor:pointer;font-size:12px;line-height:1;padding:0;display:inline-flex;align-items:center;transition:opacity 0.12s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button onclick="removeSubject(${i})" title="Remove" style="color:${fg};">×</button>
            </div>`).join('')}
        </div>
      </div>`;
    } else {
      html += `<div style="margin-bottom:12px;">
        ${group.items.length > 0 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Uncategorised</span>
        </div>` : ''}
        <div class="subj-drop-zone" data-drop-cat="" style="display:flex;flex-wrap:wrap;gap:6px;border-radius:8px;padding:4px;min-height:36px;transition:background 0.18s,box-shadow 0.18s;">
          ${group.items.map(({s,i}) => `
            <div class="tag subject-tag" data-subj-idx="${i}">
              <span class="subj-drag-handle" data-subj-idx="${i}" title="Drag to move to another group" style="opacity:0.35;cursor:grab;font-size:11px;padding:0 3px 0 0;display:inline-flex;align-items:center;user-select:none;touch-action:none;flex-shrink:0;transition:opacity 0.12s;color:var(--text-muted);" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='0.35'"><svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor"><circle cx="2.5" cy="2" r="1.5"/><circle cx="6.5" cy="2" r="1.5"/><circle cx="2.5" cy="6.5" r="1.5"/><circle cx="6.5" cy="6.5" r="1.5"/><circle cx="2.5" cy="11" r="1.5"/><circle cx="6.5" cy="11" r="1.5"/></svg></span>
              ${s.name} <span style="opacity:0.6;font-weight:400;">(/${s.max})</span>
              <button onclick="startEditSubject(${i})" title="Edit subject" class="subj-pencil-btn" style="opacity:0.5;background:none;border:none;cursor:pointer;font-size:12px;line-height:1;padding:0;display:inline-flex;align-items:center;transition:opacity 0.12s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button onclick="removeSubject(${i})" title="Remove">×</button>
            </div>`).join('')}
        </div>
      </div>`;
    }
  });

  el.innerHTML = html;
  _injectSubjDragStyles();
  initSubjectDragDrop();
}

// ── Subject Drag & Drop (pointer-events — works on mouse, touch & stylus) ──
// Supports: cross-category moves + within-category reordering.
let _subjDrag = null;
let _subjDragStylesInjected = false;

function _injectSubjDragStyles() {
  if (_subjDragStylesInjected) return;
  _subjDragStylesInjected = true;
  const style = document.createElement('style');
  style.id = 'subj-dnd-styles';
  style.textContent = `
    /* Drop zone active highlight */
    .subj-drop-zone { position: relative; }
    .subj-drop-zone.drop-active {
      background: rgba(99,102,241,0.06) !important;
      box-shadow: inset 0 0 0 2px rgba(99,102,241,0.45);
      border-radius: 8px;
    }
    [data-theme="dark"] .subj-drop-zone.drop-active {
      background: rgba(99,102,241,0.12) !important;
      box-shadow: inset 0 0 0 2px rgba(129,140,248,0.5);
    }
    /* "Drop here" placeholder shown when hovering an empty zone */
    .subj-drop-zone.drop-active.drop-empty::after {
      content: "Drop here";
      display: inline-flex;
      align-items: center;
      padding: 5px 12px;
      color: rgba(99,102,241,0.7);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      pointer-events: none;
    }
    /* Dragging source tag */
    .subject-tag.subj-is-dragging {
      opacity: 0.28 !important;
      pointer-events: none;
    }
    /* Insertion caret: left border = insert BEFORE, right border = insert AFTER */
    .subject-tag.insert-before {
      border-left-color: rgba(99,102,241,0.9) !important;
      border-left-width: 3px !important;
      box-shadow: -3px 0 0 0 rgba(99,102,241,0.25);
    }
    .subject-tag.insert-after {
      border-right-color: rgba(99,102,241,0.9) !important;
      border-right-width: 3px !important;
      box-shadow: 3px 0 0 0 rgba(99,102,241,0.25);
    }
    /* Cursor & selection lock during drag */
    body.subj-dragging-active { cursor: grabbing !important; }
    body.subj-dragging-active * { user-select: none !important; }
    body.subj-dragging-active .subj-drag-handle { cursor: grabbing !important; }
  `;
  if (!document.getElementById('subj-dnd-styles')) {
    document.head.appendChild(style);
  }
}

function _clearDragIndicators() {
  document.querySelectorAll('.subj-drop-zone').forEach(z => {
    z.classList.remove('drop-active', 'drop-empty');
  });
  document.querySelectorAll('.subject-tag.insert-before, .subject-tag.insert-after').forEach(t => {
    t.classList.remove('insert-before', 'insert-after');
  });
}

function initSubjectDragDrop() {
  document.querySelectorAll('.subj-drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', _onSubjHandleDown, { passive: false });
  });
}

function _onSubjHandleDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const tag = e.currentTarget.closest('.subject-tag');
  if (!tag || tag.classList.contains('editing')) return;

  e.preventDefault();
  e.stopPropagation();

  const idx = parseInt(tag.dataset.subjIdx);
  const rect = tag.getBoundingClientRect();

  // Ghost clone — strip interactive elements
  const ghost = tag.cloneNode(true);
  ghost.querySelectorAll('button, input').forEach(n => n.remove());
  Object.assign(ghost.style, {
    position: 'fixed',
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    margin: '0',
    zIndex: '99999',
    opacity: '0.93',
    pointerEvents: 'none',
    transform: 'rotate(2deg) scale(1.06)',
    boxShadow: '0 10px 36px rgba(0,0,0,0.24)',
    transition: 'none',
    cursor: 'grabbing',
  });
  document.body.appendChild(ghost);

  tag.classList.add('subj-is-dragging');
  document.body.classList.add('subj-dragging-active');

  _subjDrag = {
    idx,
    tag,
    ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    // insertion tracking (set during move)
    insertTargetIdx: null,   // subjects[] index of the tag we're hovering
    insertBefore: true,      // true = before target, false = after
  };

  try { e.currentTarget.setPointerCapture(e.pointerId); } catch(_) {}

  document.addEventListener('pointermove', _onSubjDragMove, { passive: false });
  document.addEventListener('pointerup',   _onSubjDragEnd);
  document.addEventListener('pointercancel', _onSubjDragCancel);
}

function _onSubjDragMove(e) {
  if (!_subjDrag) return;
  e.preventDefault();
  const { ghost, offsetX, offsetY } = _subjDrag;

  // Move ghost
  ghost.style.left = (e.clientX - offsetX) + 'px';
  ghost.style.top  = (e.clientY - offsetY) + 'px';

  // Hit-test under cursor (hide ghost so it doesn't intercept)
  ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.visibility = '';

  _clearDragIndicators();

  const zone = under && under.closest('.subj-drop-zone');
  if (!zone) {
    _subjDrag.insertTargetIdx = null;
    return;
  }

  zone.classList.add('drop-active');

  // Check if hovering directly over another (non-dragging) subject tag
  const targetTag = under && !under.classList.contains('subj-drag-handle')
    ? under.closest('.subject-tag:not(.subj-is-dragging)')
    : null;

  if (targetTag) {
    const tRect = targetTag.getBoundingClientRect();
    const insertBefore = e.clientX < tRect.left + tRect.width / 2;
    const targetIdx = parseInt(targetTag.dataset.subjIdx);
    _subjDrag.insertTargetIdx = targetIdx;
    _subjDrag.insertBefore = insertBefore;
    targetTag.classList.add(insertBefore ? 'insert-before' : 'insert-after');
  } else {
    // Hovering empty zone background
    _subjDrag.insertTargetIdx = null;
    const hasVisibleTags = zone.querySelector('.subject-tag:not(.subj-is-dragging)');
    if (!hasVisibleTags) zone.classList.add('drop-empty');
  }
}

function _onSubjDragEnd(e) {
  if (!_subjDrag) return;
  const { idx, tag, ghost, insertTargetIdx, insertBefore } = _subjDrag;

  ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.visibility = '';

  const zone   = under && under.closest('.subj-drop-zone');
  const newCat = zone ? zone.dataset.dropCat : null;  // null = dropped outside

  // Clean up
  ghost.remove();
  tag.classList.remove('subj-is-dragging');
  document.body.classList.remove('subj-dragging-active');
  _clearDragIndicators();
  _subjDrag = null;
  document.removeEventListener('pointermove', _onSubjDragMove);
  document.removeEventListener('pointerup',   _onSubjDragEnd);
  document.removeEventListener('pointercancel', _onSubjDragCancel);

  if (newCat === null || !subjects[idx]) return; // dropped outside — no-op

  const subj = subjects[idx];
  const oldCat = subj.category;
  const catChanged = newCat !== oldCat;

  // ── Determine new position ──
  let newPos; // index in subjects[] after removing the dragged item

  if (insertTargetIdx !== null && insertTargetIdx !== idx) {
    // Dropped onto a specific tag — insert before/after it
    // Remove dragged subject first, then find adjusted insert position
    const tempArr = subjects.filter((_, i) => i !== idx);
    const tempTarget = subjects[insertTargetIdx];
    const adjustedTarget = tempArr.indexOf(tempTarget);
    newPos = insertBefore ? adjustedTarget : adjustedTarget + 1;
  } else if (catChanged) {
    // Dropped on a category background (no specific tag) — append after last subject in that cat
    const tempArr = subjects.filter((_, i) => i !== idx);
    const lastInCat = tempArr.reduce((last, s, i) => s.category === newCat ? i : last, -1);
    newPos = lastInCat === -1 ? tempArr.length : lastInCat + 1;
  } else {
    return; // same zone, no target tag — no-op
  }

  // ── Apply changes to subjects[] ──
  const [moved] = subjects.splice(idx, 1);
  moved.category = newCat;

  // Auto-register new category if somehow missing
  if (newCat && !window.categories.find(c => c.name === newCat)) {
    window.categories.push({ name: newCat, mandatory: false });
  }

  subjects.splice(newPos, 0, moved);

  renderSubjectTags();
  renderCategoryButtons();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();

  if (catChanged) {
    window.toast('"' + moved.name + '" moved to ' + (newCat ? '"' + newCat + '"' : 'Uncategorised'));
  } else {
    window.toast('"' + moved.name + '" reordered');
  }
}

function _onSubjDragCancel() {
  if (!_subjDrag) return;
  const { tag, ghost } = _subjDrag;
  ghost.remove();
  tag.classList.remove('subj-is-dragging');
  document.body.classList.remove('subj-dragging-active');
  _clearDragIndicators();
  _subjDrag = null;
  document.removeEventListener('pointermove', _onSubjDragMove);
  document.removeEventListener('pointerup',   _onSubjDragEnd);
  document.removeEventListener('pointercancel', _onSubjDragCancel);
}

// ── Inline editing: category rename ──
function startEditCategory(oldName) {
  // Find the .cat-card-name span and replace with an input
  const cards = document.querySelectorAll('#categoryQuickBtns [data-cat-name]');
  let targetCard = null;
  cards.forEach(el => { if (el.dataset.catName === oldName) targetCard = el; });
  if (!targetCard) return;

  const nameSpan = targetCard.querySelector('.cat-card-name');
  if (!nameSpan || nameSpan.querySelector('input')) return; // already editing

  const originalText = nameSpan.textContent;
  const fg = nameSpan.style.color;

  nameSpan.innerHTML = `
    <input class="cat-edit-input" value="${originalText.replace(/"/g,'&quot;')}"
      style="color:${fg};border-color:${fg};"
      maxlength="40"
      onclick="event.stopPropagation()"
      onkeydown="handleCatEditKey(event,'${oldName.replace(/'/g,"\\'")}',this)"
      onblur="commitCatEdit('${oldName.replace(/'/g,"\\'")}',this)" />`;

  const input = nameSpan.querySelector('input');
  input.focus();
  input.select();
}

function handleCatEditKey(e, oldName, input) {
  if (e.key === 'Enter') { e.preventDefault(); commitCatEdit(oldName, input); }
  if (e.key === 'Escape') { renderCategoryButtons(); }
}

function commitCatEdit(oldName, input) {
  const newName = input.value.trim();
  if (!newName || newName === oldName) { renderCategoryButtons(); return; }
  if (window.categories.find(c => c.name.toLowerCase() === newName.toLowerCase() && c.name !== oldName)) {
    window.toast('A group with that name already exists', 'error');
    renderCategoryButtons(); return;
  }
  // Rename in categories array
  const cat = window.categories.find(c => c.name === oldName);
  if (cat) cat.name = newName;
  // Rename in all subjects
  subjects.forEach(s => { if (s.category === oldName) s.category = newName; });
  // Fix picker selection
  const cIn = document.getElementById('subjectCategoryInput');
  if (cIn && cIn.value === oldName) cIn.value = newName;
  renderCategoryButtons();
  renderSubjectCategoryPicker();
  renderSubjectTags();
  updateCategoryDatalist();
  window.toast(`Group renamed to "${newName}"`);
}

// ── Inline editing: subject rename & max edit ──
function startEditSubject(idx) {
  const tag = document.querySelector(`.subject-tag[data-subj-idx="${idx}"]`);
  if (!tag || tag.classList.contains('editing')) return;
  tag.classList.add('editing');

  const s = subjects[idx];
  const fg = tag.dataset.fg || 'var(--primary-dark)';
  const border = tag.dataset.border || '#bfdbfe';

  tag.innerHTML = `
    <input class="subj-edit-name" value="${s.name.replace(/"/g,'&quot;')}"
      maxlength="60" placeholder="Subject name"
      style="color:${fg};border-color:${border}55;"
      onkeydown="handleSubjEditKey(event,${idx},this)"
      onblur="scheduleSubjCommit(event,${idx})" />
    <span style="opacity:0.5;font-size:11px;">/</span>
    <input class="subj-edit-max" value="${s.max}" type="number" min="1" max="9999"
      style="color:${fg};border-color:${border}55;"
      onkeydown="handleSubjEditKey(event,${idx},this)"
      onblur="scheduleSubjCommit(event,${idx})" />
    <button class="subj-edit-ok" title="Save" onclick="commitSubjEdit(${idx})"
      style="color:${fg};">✓</button>
    <button class="subj-edit-cancel" title="Cancel" onclick="cancelSubjEdit(${idx})"
      style="color:${fg};">✕</button>`;

  tag.querySelector('.subj-edit-name').focus();
}

let _subjCommitTimer = null;
function scheduleSubjCommit(e, idx) {
  // If focus is moving to another element INSIDE the same editing tag
  // (e.g. name input → max input, or input → ✓/✕ button), do NOT commit.
  // Only schedule a commit when focus is truly leaving the editing tag.
  const tag = document.querySelector(`.subject-tag[data-subj-idx="${idx}"]`);
  const related = e && e.relatedTarget;
  if (tag && related && tag.contains(related)) {
    // Focus stayed inside the tag — no action needed
    clearTimeout(_subjCommitTimer);
    return;
  }
  // Focus left the tag entirely — commit after a short delay
  // (delay still needed so a pointer-down on ✓/✕ can fire before this)
  clearTimeout(_subjCommitTimer);
  _subjCommitTimer = setTimeout(() => commitSubjEdit(idx), 120);
}

function handleSubjEditKey(e, idx, input) {
  if (e.key === 'Enter') { e.preventDefault(); commitSubjEdit(idx); }
  if (e.key === 'Escape') { e.preventDefault(); cancelSubjEdit(idx); }
  if (e.key === 'Tab') { /* let default tab move between inputs */ }
}

function commitSubjEdit(idx) {
  clearTimeout(_subjCommitTimer);
  const tag = document.querySelector(`.subject-tag[data-subj-idx="${idx}"]`);
  if (!tag || !tag.classList.contains('editing')) return;

  const nameIn = tag.querySelector('.subj-edit-name');
  const maxIn  = tag.querySelector('.subj-edit-max');
  if (!nameIn || !maxIn) return;

  const newName = nameIn.value.trim();
  const newMax  = parseInt(maxIn.value);
  const oldName = subjects[idx].name;

  if (!newName) { window.toast('Subject name cannot be empty', 'error'); cancelSubjEdit(idx); return; }
  if (isNaN(newMax) || newMax < 1) { window.toast('Max marks must be ≥ 1', 'error'); cancelSubjEdit(idx); return; }

  const conflict = subjects.find((s, i) => i !== idx && s.name.toLowerCase() === newName.toLowerCase());
  if (conflict) { window.toast('Another subject already has that name', 'error'); cancelSubjEdit(idx); return; }

  // Rename marks keys if name changed
  if (newName !== oldName) {
    Object.keys(marks).forEach(k => {
      if (k.endsWith(`||${oldName}`)) {
        const student = k.slice(0, k.lastIndexOf(`||${oldName}`));
        marks[`${student}||${newName}`] = marks[k];
        delete marks[k];
      }
    });
  }

  subjects[idx].name = newName;
  subjects[idx].max  = newMax;

  renderSubjectTags();
  if (typeof window.renderMarksTable === 'function') window.renderMarksTable();
  window.toast(newName !== oldName ? `Renamed to "${newName}"` : 'Subject updated');
}

function cancelSubjEdit(idx) {
  clearTimeout(_subjCommitTimer);
  renderSubjectTags();
}

function addSampleSubjects() {
  // Academic = mandatory (all students sit all subjects)
  // Aesthetic, Sports, Languages = elective (each student picks ONE subject from each)
  const subs = [
    { name: 'Mathematics',    max: 100, category: 'Academic'  },
    { name: 'Science',        max: 100, category: 'Academic'  },
    { name: 'English',        max: 100, category: 'Academic'  },
    { name: 'Social Studies', max: 75,  category: 'Academic'  },
    { name: 'Music',          max: 50,  category: 'Aesthetic' },
    { name: 'Art',            max: 50,  category: 'Aesthetic' },
    { name: 'Dancing',        max: 50,  category: 'Aesthetic' },
    { name: 'Cricket',        max: 50,  category: 'Sports'    },
    { name: 'Football',       max: 50,  category: 'Sports'    },
    { name: 'Badminton',      max: 50,  category: 'Sports'    },
    { name: 'Sinhala',        max: 100, category: 'Languages' },
    { name: 'Tamil',          max: 100, category: 'Languages' },
    { name: 'French',         max: 100, category: 'Languages' },
  ];
  // Ensure correct mandatory flag for each category
  const catMandatory = { 'Academic': true, 'Aesthetic': false, 'Sports': false, 'Languages': false };
  subs.forEach(s => {
    if (!subjects.find(x => x.name === s.name)) {
      if (s.category) {
        const existing = window.categories.find(c => c.name === s.category);
        if (!existing) {
          window.categories.push({ name: s.category, mandatory: catMandatory[s.category] ?? false });
        } else {
          // Ensure correct mandatory flag on existing category
          existing.mandatory = catMandatory[s.category] ?? existing.mandatory;
        }
      }
      subjects.push(s);
    }
  });
  updateBadge('subjects', subjects.length);
  renderSubjectTags();
  renderCategoryButtons();
  updateCategoryDatalist();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast('Sample subjects loaded');
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


// ── Window exports ──
Object.assign(window, {
  addCategory,
  addSampleSubjects,
  addSubject,
  calcStudentTotalAndMax,
  cancelSubjEdit,
  commitCatEdit,
  commitSubjEdit,
  getCatNames,
  getGlobalMax,
  handleCatEditKey,
  handleSubjEditKey,
  initCategoryDragDrop,
  initSubjectDragDrop,
  isCatMandatory,
  removeCategory,
  removeSubject,
  renderCategoryButtons,
  renderSubjectCategoryPicker,
  renderSubjectTags,
  scheduleSubjCommit,
  selectSubjectCategory,
  setCategoryFilter,
  startEditCategory,
  startEditSubject,
  toggleCatMandatory,
  updateBadge,
  updateCategoryDatalist
});
