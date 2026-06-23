// ═══════════════════════════════════════════════════════════════
//  src/modules/students.js
//  Student CRUD: add, remove, edit, save, render tags,
//  sample data loader. autoIndexCounter lives here.
// ═══════════════════════════════════════════════════════════════
// ── Students ──
let autoIndexCounter = 1;

function studentInputKeydown(event) {
  if (event.key === 'Enter') {
    addStudent();
  } else if (event.key === 'Tab' && !event.shiftKey) {
    const nameInp = document.getElementById('studentInput');
    if (nameInp.value.trim() === '') {
      // Nothing typed — Tab should skip Add button and go straight to Next: Add subjects
      event.preventDefault();
      document.getElementById('btnNextSubjects').focus();
    }
    // If there IS text typed, let Tab naturally go to the Add button (tabindex order)
  }
}

function addStudent() {
  const nameInp  = document.getElementById('studentInput');
  const idxInp   = document.getElementById('studentIndexInput');
  const name = nameInp.value.trim();
  if (!name) return;
  if (students.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    window.toast('Student already added', 'error'); nameInp.value = ''; return;
  }
  const idxRaw = idxInp.value.trim();
  const idx = idxRaw !== '' ? idxRaw : String(autoIndexCounter);
  autoIndexCounter++;
  students.push({ name, idx });
  nameInp.value = ''; idxInp.value = '';
  idxInp.focus();
  window.updateBadge('students', students.length);
  renderStudentTags();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast(`${name} added (Index: ${idx})`);
}

function removeStudent(i) {
  const s = students[i];
  students.splice(i, 1);
  // clear their marks
  subjects.forEach(subj => { delete marks[`${s.name}||${subj.name}`]; });
  window.updateBadge('students', students.length);
  renderStudentTags();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast(`${s.name} removed`);
}

function updateStudentIdx(i, val) {
  students[i].idx = val.trim() || String(i + 1);
}

function editStudentRow(i) {
  const row = document.querySelector(`.student-row[data-idx="${i}"]`);
  if (!row) return;
  row.classList.add('editing');

  const nameInput = row.querySelector('.s-name-input');
  if (nameInput) { nameInput.disabled = false; nameInput.focus(); nameInput.select(); }

  const idxInput = row.querySelector('.s-idx-wrap input');
  if (idxInput) {
    idxInput.disabled = false;
    idxInput.tabIndex = 0;
    idxInput.title = 'Edit index number';
  }

  // Swap edit to save button
  row.querySelector('.s-edit').style.display = 'none';
  row.querySelector('.s-save').style.display = 'flex';

  // Save when focus leaves the ENTIRE row (not when moving between name and idx)
  function onRowFocusOut() {
    setTimeout(function() {
      if (!row.contains(document.activeElement)) {
        row.removeEventListener('focusout', onRowFocusOut);
        if (row.classList.contains('editing')) {
          saveStudentRow(i);
        }
      }
    }, 0);
  }
  row.addEventListener('focusout', onRowFocusOut);
}

function saveStudentRow(i) {
  const row = document.querySelector(`.student-row[data-idx="${i}"]`);
  if (!row) return;

  const nameInput = row.querySelector('.s-name-input');
  const idxInput  = row.querySelector('.s-idx-wrap input');
  const newName = nameInput ? nameInput.value.trim() : '';
  const newIdx  = idxInput  ? idxInput.value.trim()  : '';

  if (!newName) { window.toast('Name cannot be empty', 'error'); nameInput && nameInput.focus(); return; }

  const oldName = students[i].name;

  // Duplicate check (ignore self)
  if (newName.toLowerCase() !== oldName.toLowerCase() &&
      students.find((s, si) => si !== i && s.name.toLowerCase() === newName.toLowerCase())) {
    window.toast('Another student already has that name', 'error');
    nameInput && nameInput.focus(); return;
  }

  // Migrate marks keys if name changed
  if (newName !== oldName) {
    subjects.forEach(subj => {
      const oldKey = `${oldName}||${subj.name}`;
      const newKey = `${newName}||${subj.name}`;
      if (marks[oldKey] !== undefined) {
        marks[newKey] = marks[oldKey];
        delete marks[oldKey];
      }
    });
  }

  students[i].name = newName;
  students[i].idx  = newIdx || String(i + 1);

  renderStudentTags();
  window.toast(`Saved — ${newName}`);
}

function renderStudentTags() {
  const el  = document.getElementById('studentList');
  const cnt = document.getElementById('studentCount');
  cnt.textContent = `${students.length} student${students.length !== 1 ? 's' : ''} added`;
  if (!students.length) {
    el.innerHTML = '<span style="font-size:13px;color:var(--text-light);padding:4px 0;">No students yet — type a name above and click Add</span>';
    return;
  }
  _injectStudentDragStyles();
  el.innerHTML = students.map((s, i) => `
    <div class="student-row" data-idx="${i}">
      <span class="s-drag-handle" data-st-idx="${i}" title="Drag to reorder"
        style="color:var(--text-light);opacity:0.35;cursor:grab;display:inline-flex;align-items:center;flex-shrink:0;padding:0 3px 0 0;touch-action:none;user-select:none;transition:opacity 0.12s;"
        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='0.35'">
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2"  r="1.4"/><circle cx="7.5" cy="2"  r="1.4"/>
          <circle cx="2.5" cy="6"  r="1.4"/><circle cx="7.5" cy="6"  r="1.4"/>
          <circle cx="2.5" cy="10" r="1.4"/><circle cx="7.5" cy="10" r="1.4"/>
          <circle cx="2.5" cy="14" r="1.4"/><circle cx="7.5" cy="14" r="1.4"/>
        </svg>
      </span>
      <span class="s-num">${i + 1}</span>
      <div class="s-idx-wrap" title="Index number">
        <input type="text" value="${s.idx}" maxlength="10" tabindex="-1" disabled
          onchange="updateStudentIdx(${i}, this.value)"
          onblur="updateStudentIdx(${i}, this.value)"
          onclick="this.select()"
          onkeydown="if(event.key==='Enter'){saveStudentRow(${i})} if(event.key==='Escape'){renderStudentTags()}"
          title="Index number" />
      </div>
      <input type="text" class="s-name-input" value="${s.name.replace(/"/g, '&quot;')}" disabled
        onkeydown="if(event.key==='Enter'){saveStudentRow(${i})} if(event.key==='Escape'){renderStudentTags()}"
        title="Student name — click ✏ to edit" />
      <button class="s-edit" onclick="editStudentRow(${i})" title="Edit name and index" tabindex="-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="s-save" onclick="saveStudentRow(${i})" title="Save changes" tabindex="-1" style="display:none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <button class="s-remove" tabindex="-1" onclick="removeStudent(${i})" title="Remove student">×</button>
    </div>`).join('');

  initStudentDragDrop();
}

function addSampleStudents() {
  const samples = [
    'Ahmed Hassan', 'Sara Khan', 'Mohammed Ali', 'Fatima Noor', 'Omar Shaikh',
    'Ayesha Malik', 'Yusuf Ibrahim', 'Zainab Ahmed', 'Bilal Raza', 'Maryam Siddiqui'
  ];
  samples.forEach(n => {
    if (!students.find(s => s.name === n)) {
      students.push({ name: n, idx: String(autoIndexCounter++) });
    }
  });
  window.updateBadge('students', students.length);
  renderStudentTags();
  if (typeof window.updateStepLocks === 'function') window.updateStepLocks();
  window.toast('Sample students loaded');
}


// ═══════════════════════════════════════════════════════════════
//  Student Drag-to-Reorder
//  Pointer-event based drag that reorders window.students[].
//  Uses the same pattern as the subject-category drag in subjects.js.
// ═══════════════════════════════════════════════════════════════

let _studentDrag                = null;
let _studentDragStylesInjected  = false;

function _injectStudentDragStyles() {
  if (_studentDragStylesInjected) return;
  _studentDragStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'student-dnd-styles';
  style.textContent = `
    /* Student drag: source row fades while a ghost floats */
    .student-row.st-is-dragging { opacity: 0.25 !important; }

    /* Insert-line indicator — renders above or below the target row */
    .student-row.st-insert-before::before {
      content: '';
      position: absolute;
      top: -4px; left: 8px; right: 8px;
      height: 3px; border-radius: 3px;
      background: rgba(26,86,219,0.85);
      box-shadow: 0 0 0 3px rgba(26,86,219,0.18);
      pointer-events: none;
    }
    .student-row.st-insert-after::after {
      content: '';
      position: absolute;
      bottom: -4px; left: 8px; right: 8px;
      height: 3px; border-radius: 3px;
      background: rgba(26,86,219,0.85);
      box-shadow: 0 0 0 3px rgba(26,86,219,0.18);
      pointer-events: none;
    }
    [data-theme="dark"] .student-row.st-insert-before::before,
    [data-theme="dark"] .student-row.st-insert-after::after {
      background: rgba(129,140,248,0.90);
      box-shadow: 0 0 0 3px rgba(129,140,248,0.22);
    }

    /* The student-row must be position:relative for pseudo-elements to work */
    .student-row { position: relative; }

    /* Global cursor / selection lock while dragging */
    body.st-dragging-active { cursor: grabbing !important; }
    body.st-dragging-active * { user-select: none !important; }
    body.st-dragging-active .s-drag-handle { cursor: grabbing !important; }

    /* Floating ghost card */
    .st-drag-ghost {
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      opacity: 0.92;
      transform: rotate(1deg) scale(1.03);
      box-shadow: 0 10px 32px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.10);
      border-radius: var(--radius, 8px);
      background: var(--bg);
      border: 1px solid var(--primary, #1a56db);
    }

    /* Drag hint label beside the student count */
    #student-drag-hint {
      font-size: 11.5px;
      color: var(--text-light);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      opacity: 0.7;
      margin-left: 10px;
    }
  `;
  if (!document.getElementById('student-dnd-styles')) {
    document.head.appendChild(style);
  }
}

function initStudentDragDrop() {
  document.querySelectorAll('.s-drag-handle').forEach(handle => {
    handle.removeEventListener('pointerdown', _onStudentHandleDown);
    handle.addEventListener('pointerdown', _onStudentHandleDown, { passive: false });
  });
}

function _onStudentHandleDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const row = e.currentTarget.closest('.student-row');
  if (!row) return;

  e.preventDefault();
  e.stopPropagation();

  const idx  = parseInt(e.currentTarget.dataset.stIdx);
  const rect = row.getBoundingClientRect();

  // Build a ghost clone (strip inputs so they don't mis-fire)
  const ghost = row.cloneNode(true);
  ghost.querySelectorAll('input').forEach(n => n.remove());
  ghost.classList.add('st-drag-ghost');
  ghost.classList.remove('st-is-dragging', 'st-insert-before', 'st-insert-after');
  Object.assign(ghost.style, {
    left:   rect.left + 'px',
    top:    rect.top  + 'px',
    width:  rect.width + 'px',
    margin: '0',
  });
  document.body.appendChild(ghost);

  row.classList.add('st-is-dragging');
  document.body.classList.add('st-dragging-active');

  _studentDrag = {
    idx,
    row,
    ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    insertTargetIdx: null,
    insertBefore:    true,
  };

  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}

  document.addEventListener('pointermove',   _onStudentDragMove,   { passive: false });
  document.addEventListener('pointerup',     _onStudentDragEnd);
  document.addEventListener('pointercancel', _onStudentDragCancel);
}

function _clearStudentInsertIndicators() {
  document.querySelectorAll('.student-row').forEach(r => {
    r.classList.remove('st-insert-before', 'st-insert-after');
  });
}

function _onStudentDragMove(e) {
  if (!_studentDrag) return;
  e.preventDefault();
  const { ghost, offsetX, offsetY } = _studentDrag;

  // Move ghost
  ghost.style.left = (e.clientX - offsetX) + 'px';
  ghost.style.top  = (e.clientY - offsetY) + 'px';

  // Hide ghost briefly to allow elementFromPoint to see through it
  ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.visibility = '';

  _clearStudentInsertIndicators();

  const targetRow = under && under.closest('.student-row:not(.st-is-dragging)');
  if (targetRow) {
    const tRect      = targetRow.getBoundingClientRect();
    const insertBefore = e.clientY < tRect.top + tRect.height / 2;
    const targetIdx  = parseInt(targetRow.dataset.idx);
    _studentDrag.insertTargetIdx = targetIdx;
    _studentDrag.insertBefore    = insertBefore;
    targetRow.classList.add(insertBefore ? 'st-insert-before' : 'st-insert-after');
  } else {
    _studentDrag.insertTargetIdx = null;
  }
}

function _onStudentDragEnd(e) {
  if (!_studentDrag) return;
  const { idx, row, ghost, insertTargetIdx, insertBefore } = _studentDrag;

  // Cleanup visual state
  ghost.remove();
  row.classList.remove('st-is-dragging');
  document.body.classList.remove('st-dragging-active');
  _clearStudentInsertIndicators();
  _studentDrag = null;

  document.removeEventListener('pointermove',   _onStudentDragMove);
  document.removeEventListener('pointerup',     _onStudentDragEnd);
  document.removeEventListener('pointercancel', _onStudentDragCancel);

  // No valid drop or same position → no-op
  if (insertTargetIdx === null || insertTargetIdx === idx) return;

  // Reorder window.students[]
  const sts     = window.students;
  const [moved] = sts.splice(idx, 1);
  // Re-calculate insertion index after removal
  let insertAt  = insertTargetIdx > idx ? insertTargetIdx - 1 : insertTargetIdx;
  if (!insertBefore) insertAt += 1;
  sts.splice(insertAt, 0, moved);

  // Re-render list and persist
  renderStudentTags();
  if (typeof window.markDirty === 'function') window.markDirty();

  const dir = insertAt < idx ? 'up' : 'down';
  window.toast(`${moved.name} moved ${dir}`);
}

function _onStudentDragCancel() {
  if (!_studentDrag) return;
  const { row, ghost } = _studentDrag;
  ghost.remove();
  row.classList.remove('st-is-dragging');
  document.body.classList.remove('st-dragging-active');
  _clearStudentInsertIndicators();
  _studentDrag = null;
  document.removeEventListener('pointermove',   _onStudentDragMove);
  document.removeEventListener('pointerup',     _onStudentDragEnd);
  document.removeEventListener('pointercancel', _onStudentDragCancel);
}

// ── Window exports ──
Object.assign(window, {
  addSampleStudents,
  addStudent,
  editStudentRow,
  initStudentDragDrop,
  removeStudent,
  renderStudentTags,
  saveStudentRow,
  studentInputKeydown,
  updateStudentIdx
});
