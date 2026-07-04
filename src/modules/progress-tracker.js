// ═══════════════════════════════════════════════════════════════
//  src/modules/progress-tracker.js
//  Per-student progress tracker across all terms/exams.
//  Shows rank, overall %, grade, and per-subject trend
//  for every exam the student appeared in — chronologically.
// ═══════════════════════════════════════════════════════════════

// ── Open / Close ──────────────────────────────────────────────
function openProgressTracker() {
  if (!window._exams || window._exams.length === 0) {
    window.toast('No exams found. Create at least one exam first.', 'error');
    return;
  }
  _ptRender();
  document.getElementById('progressTrackerOverlay').classList.add('open');
}

function closeProgressTracker() {
  document.getElementById('progressTrackerOverlay').classList.remove('open');
}

// ── Compute per-exam results for a student ────────────────────
function _ptStudentExamResult(exam, studentName) {
  const stds = exam.students  || [];
  const subs = exam.subjects  || [];
  const mks  = exam.marks     || {};
  const cats = exam.categories|| [];
  const gs   = exam.gradingScale || window.gradingScale;

  if (!stds.find(s => s.name === studentName)) return null;

  const catMand = {};
  cats.forEach(c => { catMand[c.name] = c.mandatory; });

  const getGrade = pct => {
    const sorted = [...gs].sort((a, b) => b.minPct - a.minPct);
    for (const g of sorted) if (pct >= g.minPct) return g.label;
    return sorted.length ? sorted[sorted.length - 1].label : 'F';
  };

  // Compute total / max (elective-aware)
  const groups = {};
  subs.forEach(sub => {
    const cat = sub.category || '__none__';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(sub);
  });

  let total = 0, maxTotal = 0;
  Object.entries(groups).forEach(([cat, subjs]) => {
    const catName   = cat === '__none__' ? '' : cat;
    const mandatory = catName === '' ? true : (catMand[catName] !== undefined ? catMand[catName] : true);
    if (mandatory) {
      subjs.forEach(sub => {
        const v = mks[`${studentName}||${sub.name}`];
        total    += (v !== undefined && v !== '' && v !== 'AB') ? parseFloat(v) || 0 : 0;
        maxTotal += sub.max;
      });
    } else {
      const chosen = subjs.filter(sub => {
        const v = mks[`${studentName}||${sub.name}`];
        return v !== undefined && v !== '' && v !== 'AB' && !isNaN(parseFloat(v));
      });
      if (chosen.length) {
        chosen.forEach(sub => { total += parseFloat(mks[`${studentName}||${sub.name}`]) || 0; maxTotal += sub.max; });
      } else if (subjs.length) {
        maxTotal += subjs[0].max;
      }
    }
  });

  const pct = maxTotal > 0 ? parseFloat(((total / maxTotal) * 100).toFixed(1)) : null;

  // Rank within this exam
  const allPcts = stds.map(s => {
    let t = 0, m = 0;
    Object.entries(groups).forEach(([cat, subjs]) => {
      const catName   = cat === '__none__' ? '' : cat;
      const mandatory = catName === '' ? true : (catMand[catName] !== undefined ? catMand[catName] : true);
      if (mandatory) {
        subjs.forEach(sub => {
          const v = mks[`${s.name}||${sub.name}`];
          t += (v !== undefined && v !== '' && v !== 'AB') ? parseFloat(v) || 0 : 0;
          m += sub.max;
        });
      } else {
        const ch = subjs.filter(sub => { const v = mks[`${s.name}||${sub.name}`]; return v !== undefined && v !== '' && v !== 'AB' && !isNaN(parseFloat(v)); });
        if (ch.length) { ch.forEach(sub => { t += parseFloat(mks[`${s.name}||${sub.name}`]) || 0; m += sub.max; }); }
        else if (subjs.length) m += subjs[0].max;
      }
    });
    return m > 0 ? parseFloat(((t / m) * 100).toFixed(1)) : 0;
  }).sort((a, b) => b - a);
  const rank = allPcts.indexOf(pct) + 1;

  // Per-subject scores
  const subjectScores = {};
  subs.forEach(sub => {
    const v = mks[`${studentName}||${sub.name}`];
    if (v === 'AB') {
      subjectScores[sub.name] = { mark: 'AB', max: sub.max, pct: null };
    } else if (v !== undefined && v !== '') {
      const mark = parseFloat(v) || 0;
      subjectScores[sub.name] = { mark, max: sub.max, pct: sub.max > 0 ? parseFloat(((mark / sub.max) * 100).toFixed(1)) : null };
    } else {
      subjectScores[sub.name] = { mark: null, max: sub.max, pct: null };
    }
  });

  return { pct, total: parseFloat(total.toFixed(1)), max: maxTotal, grade: pct !== null ? getGrade(pct) : '—', rank, totalStudents: stds.length, subjectScores };
}

// ── Render the tracker ────────────────────────────────────────
function _ptRender() {
  const sel = document.getElementById('ptStudentSelect');
  const body = document.getElementById('ptBody');
  if (!sel || !body) return;

  // Populate student dropdown (union of all students across all exams)
  const allStudents = [...new Set((window._exams || []).flatMap(e => (e.students || []).map(s => s.name)))].sort();
  const prev = sel.value;
  sel.innerHTML = '<option value="">Select a student…</option>' +
    allStudents.map(n => `<option value="${_ptEsc(n)}"${n === prev ? ' selected' : ''}>${_ptEsc(n)}</option>`).join('');

  const studentName = sel.value;
  if (!studentName) {
    body.innerHTML = `<div class="pt-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <p>Select a student above to see their progress across all terms</p>
    </div>`;
    return;
  }

  // Find all exams this student appeared in, sorted chronologically
  const studentExams = (window._exams || [])
    .filter(e => (e.students || []).some(s => s.name === studentName))
    .map(e => ({ exam: e, result: _ptStudentExamResult(e, studentName) }))
    .filter(x => x.result !== null);

  if (!studentExams.length) {
    body.innerHTML = `<div class="pt-empty"><p>No exam data found for <strong>${_ptEsc(studentName)}</strong>.</p></div>`;
    return;
  }

  // All subjects ever appeared in
  const allSubjects = [...new Set(studentExams.flatMap(x => Object.keys(x.result.subjectScores)))];

  // Overall trend
  const pcts = studentExams.map(x => x.result.pct).filter(p => p !== null);
  const overallTrend = pcts.length >= 2
    ? parseFloat((pcts[pcts.length - 1] - pcts[0]).toFixed(1))
    : null;

  const trendHtml = overallTrend === null ? '' :
    overallTrend > 0.5  ? `<span class="pt-trend-up">▲ +${overallTrend}% overall</span>` :
    overallTrend < -0.5 ? `<span class="pt-trend-down">▼ ${overallTrend}% overall</span>` :
    `<span class="pt-trend-flat">Consistent performance</span>`;

  // ── Summary stat cards ──
  const bestPct  = pcts.length ? Math.max(...pcts) : null;
  const worstPct = pcts.length ? Math.min(...pcts) : null;
  const avgPct   = pcts.length ? parseFloat((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)) : null;

  const statCards = `
    <div class="pt-stat-cards">
      <div class="pt-stat-card">
        <div class="pt-stat-label">Exams Taken</div>
        <div class="pt-stat-val">${studentExams.length}</div>
      </div>
      <div class="pt-stat-card">
        <div class="pt-stat-label">Best Result</div>
        <div class="pt-stat-val" style="color:var(--success)">${bestPct !== null ? bestPct + '%' : '—'}</div>
      </div>
      <div class="pt-stat-card">
        <div class="pt-stat-label">Average</div>
        <div class="pt-stat-val">${avgPct !== null ? avgPct + '%' : '—'}</div>
      </div>
      <div class="pt-stat-card">
        <div class="pt-stat-label">Lowest</div>
        <div class="pt-stat-val" style="color:${worstPct !== null && worstPct < 50 ? 'var(--danger)' : 'inherit'}">${worstPct !== null ? worstPct + '%' : '—'}</div>
      </div>
    </div>`;

  // ── Sparkline SVG for overall trend ──
  function _sparkline(vals) {
    if (vals.length < 2) return '';
    const W = 120, H = 36, pad = 4;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const range = mx - mn || 1;
    const points = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
      const y = H - pad - ((v - mn) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = points.split(' ').pop().split(',');
    const lastColor = overallTrend > 0.5 ? '#22c55e' : overallTrend < -0.5 ? '#ef4444' : '#94a3b8';
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="pt-sparkline">
      <polyline points="${points}" fill="none" stroke="${lastColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${lastColor}"/>
    </svg>`;
  }

  // ── Main progress table ──
  const tableRows = studentExams.map(({ exam, result }) => {
    const pctColor = result.pct === null ? 'inherit' :
      result.pct >= 75 ? 'var(--success)' : result.pct >= 50 ? 'var(--primary)' : 'var(--danger)';
    const subCells = allSubjects.map(subName => {
      const s = result.subjectScores[subName];
      if (!s || s.mark === null) return `<td class="pt-sub-cell" style="color:var(--text-muted);opacity:0.4;">—</td>`;
      if (s.mark === 'AB') return `<td class="pt-sub-cell"><span class="result-ab-badge">AB</span></td>`;
      const c = s.pct >= 75 ? 'var(--success)' : s.pct >= 50 ? 'var(--primary)' : 'var(--danger)';
      return `<td class="pt-sub-cell" style="color:${c};">${s.mark}<span style="opacity:0.5;font-size:10px;">/${s.max}</span></td>`;
    }).join('');
    return `<tr>
      <td class="pt-exam-name">${exam.icon || '📋'} ${_ptEsc(exam.name)}</td>
      <td style="font-weight:700;color:${pctColor};">${result.pct !== null ? result.pct + '%' : '—'}</td>
      <td style="font-weight:600;">${result.grade}</td>
      <td style="color:var(--text-muted);font-size:12px;">#${result.rank} of ${result.totalStudents}</td>
      ${subCells}
    </tr>`;
  }).join('');

  const subHeaders = allSubjects.map(s => `<th class="pt-sub-header">${_ptEsc(s)}</th>`).join('');

  body.innerHTML = `
    <div class="pt-student-header">
      <div class="pt-student-name">${_ptEsc(studentName)}</div>
      <div class="pt-trend-wrap">${trendHtml} ${_sparkline(pcts)}</div>
    </div>
    ${statCards}
    <div class="pt-table-wrap">
      <table class="pt-table">
        <thead>
          <tr>
            <th style="text-align:left;min-width:140px;">Exam / Term</th>
            <th>Overall %</th>
            <th>Grade</th>
            <th>Rank</th>
            ${subHeaders}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="pt-whatsapp-row">
      <button class="btn btn-ghost btn-sm" onclick="ptShareWhatsApp('${_ptEsc(studentName).replace(/'/g,"\\'")}')">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="color:#25d366;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.11 1.526 5.836L.057 23.453a.75.75 0 00.907.982l5.803-1.519A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.868 0-3.62-.487-5.14-1.34l-.367-.215-3.815.999 1.02-3.717-.235-.381A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        Share via WhatsApp
      </button>
      <button class="btn btn-ghost btn-sm" onclick="ptCopySummary('${_ptEsc(studentName).replace(/'/g,"\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy summary
      </button>
    </div>`;
}

// ── Build text summary for a student ──────────────────────────
function _ptBuildSummaryText(studentName) {
  const studentExams = (window._exams || [])
    .filter(e => (e.students || []).some(s => s.name === studentName))
    .map(e => ({ exam: e, result: _ptStudentExamResult(e, studentName) }))
    .filter(x => x.result !== null);

  if (!studentExams.length) return '';

  const lines = [`📊 Progress Report — ${studentName}`];
  const cls = studentExams[0]?.exam?.meta?.className;
  if (cls) lines.push(`Class: ${cls}`);
  lines.push('');
  studentExams.forEach(({ exam, result }) => {
    lines.push(`📋 ${exam.name}`);
    lines.push(`   Overall: ${result.pct !== null ? result.pct + '%' : '—'} (${result.grade}) — Rank #${result.rank}/${result.totalStudents}`);
  });

  const pcts = studentExams.map(x => x.result.pct).filter(p => p !== null);
  if (pcts.length >= 2) {
    const diff = parseFloat((pcts[pcts.length - 1] - pcts[0]).toFixed(1));
    lines.push('');
    lines.push(diff > 0.5 ? `📈 Improved by ${diff}% overall` : diff < -0.5 ? `📉 Declined by ${Math.abs(diff)}% overall` : `📊 Consistent performance`);
  }

  lines.push('');
  lines.push('Generated by GradeFlow');
  return lines.join('\n');
}

window.ptShareWhatsApp = function (studentName) {
  const text = _ptBuildSummaryText(studentName);
  if (!text) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
};

window.ptCopySummary = function (studentName) {
  const text = _ptBuildSummaryText(studentName);
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => window.toast('Summary copied!', 'success'));
};

// ── Helper ────────────────────────────────────────────────────
function _ptEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Window exports ────────────────────────────────────────────
Object.assign(window, {
  openProgressTracker,
  closeProgressTracker,
  ptRender: _ptRender,
});
