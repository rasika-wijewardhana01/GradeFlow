// ═══════════════════════════════════════════════════════════════
//  src/modules/attendance.js
//  Attendance Summary panel — shows AB counts per student
//  across all exams, per subject breakdown, and exportable
//  summary text for WhatsApp/clipboard.
// ═══════════════════════════════════════════════════════════════

function openAttendanceModal() {
  _atRender();
  document.getElementById('attendanceModalOverlay').classList.add('open');
}

function closeAttendanceModal() {
  document.getElementById('attendanceModalOverlay').classList.remove('open');
}

function _atRender() {
  const body = document.getElementById('atBody');
  if (!body) return;

  const exams = window._exams || [];

  // Also include current live session if it has students
  const allExams = exams.length > 0 ? exams : [];
  const useCurrentSession = exams.length === 0 || (window.students && window.students.length > 0 && window.marks);

  // Build attendance data structure
  // Map: studentName → { examName → [absent subject names] }
  const attendanceMap = {};

  const processExam = (examName, students, subjects, marks) => {
    (students || []).forEach(s => {
      if (!attendanceMap[s.name]) attendanceMap[s.name] = {};
      const absentSubjects = (subjects || []).filter(sub => marks[`${s.name}||${sub.name}`] === 'AB').map(sub => sub.name);
      if (absentSubjects.length > 0) {
        attendanceMap[s.name][examName] = absentSubjects;
      }
    });
  };

  if (allExams.length > 0) {
    allExams.forEach(e => processExam(e.name, e.students, e.subjects, e.marks || {}));
  }
  if (useCurrentSession && window.students?.length && window.subjects?.length) {
    const examLabel = (document.getElementById('examLabel') || {}).value?.trim() || 'Current Exam';
    processExam(examLabel, window.students, window.subjects, window.marks || {});
  }

  const studentNames = Object.keys(attendanceMap).sort();

  if (!studentNames.length) {
    body.innerHTML = `<div class="at-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      <p>No absent (AB) records found across any exam.<br>All students were present!</p>
    </div>`;
    return;
  }

  // Summary stats
  const totalAbsences = studentNames.reduce((acc, name) => {
    return acc + Object.values(attendanceMap[name]).reduce((a, subs) => a + subs.length, 0);
  }, 0);
  const mostAbsent = studentNames.reduce((a, b) => {
    const countA = Object.values(attendanceMap[a]).reduce((s, sub) => s + sub.length, 0);
    const countB = Object.values(attendanceMap[b]).reduce((s, sub) => s + sub.length, 0);
    return countA >= countB ? a : b;
  });
  const mostAbsentCount = Object.values(attendanceMap[mostAbsent]).reduce((s, sub) => s + sub.length, 0);

  const summaryBar = `
    <div class="at-stat-cards">
      <div class="at-stat-card">
        <div class="at-stat-label">Students with Absences</div>
        <div class="at-stat-val" style="color:var(--danger)">${studentNames.length}</div>
      </div>
      <div class="at-stat-card">
        <div class="at-stat-label">Total AB Entries</div>
        <div class="at-stat-val">${totalAbsences}</div>
      </div>
      <div class="at-stat-card" style="max-width:200px;">
        <div class="at-stat-label">Most Absent</div>
        <div class="at-stat-val" style="font-size:1rem;">${_atEsc(mostAbsent)} <span style="font-size:0.8rem;color:var(--danger);">(${mostAbsentCount}×)</span></div>
      </div>
    </div>`;

  // Build rows
  const rows = studentNames.map(name => {
    const examsAbsent = attendanceMap[name];
    const examNames   = Object.keys(examsAbsent);
    const totalCount  = examNames.reduce((a, ex) => a + examsAbsent[ex].length, 0);

    const examBadges = examNames.map(ex =>
      `<div class="at-exam-entry">
        <span class="at-exam-name">${_atEsc(ex)}</span>
        <span class="at-subject-list">${examsAbsent[ex].map(s => `<span class="at-subject-badge">${_atEsc(s)}</span>`).join('')}</span>
      </div>`
    ).join('');

    return `<div class="at-student-row">
      <div class="at-student-info">
        <span class="at-student-name">${_atEsc(name)}</span>
        <span class="at-absent-count" style="color:var(--danger);">${totalCount} absence${totalCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="at-exam-list">${examBadges}</div>
    </div>`;
  }).join('');

  body.innerHTML = summaryBar + `
    <div class="at-actions">
      <button class="btn btn-ghost btn-sm" onclick="atShareWhatsApp()">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="color:#25d366;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.11 1.526 5.836L.057 23.453a.75.75 0 00.907.982l5.803-1.519A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.868 0-3.62-.487-5.14-1.34l-.367-.215-3.815.999 1.02-3.717-.235-.381A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        Share via WhatsApp
      </button>
      <button class="btn btn-ghost btn-sm" onclick="atCopyText()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy report
      </button>
    </div>
    <div class="at-list">${rows}</div>`;
}

function _atBuildText() {
  const exams = window._exams || [];
  const attendanceMap = {};
  const processExam = (examName, students, subjects, marks) => {
    (students || []).forEach(s => {
      if (!attendanceMap[s.name]) attendanceMap[s.name] = {};
      const absent = (subjects || []).filter(sub => marks[`${s.name}||${sub.name}`] === 'AB').map(sub => sub.name);
      if (absent.length) attendanceMap[s.name][examName] = absent;
    });
  };
  if (exams.length > 0) exams.forEach(e => processExam(e.name, e.students, e.subjects, e.marks || {}));
  if (window.students?.length && window.subjects?.length) {
    const label = (document.getElementById('examLabel') || {}).value?.trim() || 'Current Exam';
    processExam(label, window.students, window.subjects, window.marks || {});
  }

  const cls = (document.getElementById('className') || {}).value?.trim() || '';
  const lines = [`📋 Attendance Report${cls ? ' — ' + cls : ''}`,''];

  const names = Object.keys(attendanceMap).sort();
  if (!names.length) { lines.push('No absences recorded.'); }
  else {
    names.forEach(name => {
      const total = Object.values(attendanceMap[name]).reduce((a, s) => a + s.length, 0);
      lines.push(`❌ ${name} — ${total} absence${total !== 1 ? 's' : ''}`);
      Object.entries(attendanceMap[name]).forEach(([ex, subs]) => {
        lines.push(`   ${ex}: ${subs.join(', ')}`);
      });
    });
  }
  lines.push('', 'Generated by GradeFlow');
  return lines.join('\n');
}

window.atShareWhatsApp = function () {
  window.open('https://wa.me/?text=' + encodeURIComponent(_atBuildText()), '_blank');
};

window.atCopyText = function () {
  navigator.clipboard.writeText(_atBuildText()).then(() => window.toast('Attendance report copied!', 'success'));
};

function _atEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

Object.assign(window, { openAttendanceModal, closeAttendanceModal });
