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
  const sel  = document.getElementById('ptStudentSelect');
  const body = document.getElementById('ptBody');
  if (!sel || !body) return;

  // ── Collect students from ALL sources ──────────────────────
  // Source 1: saved exam snapshots in window._exams
  const fromExams = (window._exams || [])
    .flatMap(e => (e.students || []).map(s => s.name));

  // Source 2: current live session (may not yet be snapshotted into _exams)
  // This covers the case where the teacher is mid-session and hasn't switched
  // exams yet — window.students holds the live roster.
  const fromLive = (window.students || []).map(s => s.name);

  // Source 3: check if active exam in _exams already has students — if the
  // live session differs, prefer live (it's always more current).
  const allStudents = [...new Set([...fromExams, ...fromLive])].sort();

  if (!allStudents.length) {
    body.innerHTML = `<div class="pt-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <p>No students found. Add students to an exam first, then open the Progress Tracker.</p>
    </div>`;
    // Still populate an empty select
    sel.innerHTML = '<option value="">No students found</option>';
    return;
  }
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

  // Also include the current live session if it has this student and isn't
  // already reflected in _exams (happens when teacher hasn't switched exams yet)
  const liveHasStudent = (window.students || []).some(s => s.name === studentName);
  const activeExamId   = window._activeExamId;
  const activeInExams  = studentExams.some(x => x.exam.id === activeExamId);

  if (liveHasStudent && !activeInExams && (window.subjects || []).length > 0) {
    // Build a synthetic exam object from the live session
    const examLabel = document.getElementById('examLabel')?.value?.trim() || 'Current Exam';
    const className = document.getElementById('className')?.value?.trim()  || '';
    const liveExam  = {
      id:       activeExamId || '__live__',
      name:     examLabel,
      icon:     '📋',
      meta:     { className },
      students: window.students || [],
      subjects: window.subjects || [],
      marks:    window.marks    || {},
      categories:   window.categories   || [],
      gradingScale: window.gradingScale || [],
    };
    const liveResult = _ptStudentExamResult(liveExam, studentName);
    if (liveResult) studentExams.push({ exam: liveExam, result: liveResult });
  }

  if (!studentExams.length) {
    body.innerHTML = `<div class="pt-empty"><p>No exam data found for <strong>${_ptEsc(studentName)}</strong>. Make sure you have entered marks.</p></div>`;
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

    <!-- ── Line Chart ── -->
    <div class="pt-chart-section">
      <div class="pt-chart-header">
        <span class="pt-chart-title">Subject Performance Across Exams</span>
        <div class="pt-chart-toggles" id="ptChartToggles"></div>
      </div>
      <div class="pt-chart-wrap">
        <canvas id="ptLineChart"></canvas>
      </div>
      <div class="pt-chart-legend" id="ptChartLegend"></div>
    </div>

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

  // Draw the line chart after DOM is ready
  requestAnimationFrame(() => _ptDrawLineChart(studentExams, allSubjects));
}

// ── Colour palette — one colour per EXAM (not per subject) ────
const _PT_COLORS = [
  '#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7',
  '#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16',
];

// Exams hidden by toggle
let _ptHiddenExams = new Set();

// ── Draw the line chart ───────────────────────────────────────
// X-axis = subjects, Y-axis = percentage (0–100%)
// One coloured connected line per exam/term.
// This design works perfectly with 1 exam (spread across subjects)
// and clearly shows subject-level trends when multiple exams exist.
function _ptDrawLineChart(studentExams, allSubjects) {
  const canvas     = document.getElementById('ptLineChart');
  const legendWrap = document.getElementById('ptChartLegend');
  const toggleWrap = document.getElementById('ptChartToggles');
  if (!canvas || !studentExams.length || !allSubjects.length) return;

  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const isMobile = window.innerWidth <= 600;

  // ── Colour map: one colour per exam ──────────────────────
  const examColorMap = {};
  studentExams.forEach((x, i) => {
    examColorMap[x.exam.id || x.exam.name] = _PT_COLORS[i % _PT_COLORS.length];
  });

  // ── Legend — one toggle per exam ─────────────────────────
  if (legendWrap) {
    legendWrap.innerHTML = studentExams.map(x => {
      const id    = x.exam.id || x.exam.name;
      const color = examColorMap[id];
      const hidden = _ptHiddenExams.has(id);
      return `<button class="pt-legend-item${hidden ? ' pt-toggle-hidden' : ''}"
        onclick="ptToggleExam('${_ptEsc(id).replace(/'/g,"\\'")}');"
        style="--pt-color:${color};">
        <svg width="22" height="8" style="vertical-align:middle;margin-right:4px;">
          <line x1="0" y1="4" x2="22" y2="4" stroke="${color}" stroke-width="2.5"
            stroke-linecap="round"/>
          <circle cx="11" cy="4" r="3" fill="${color}"/>
        </svg>
        ${_ptEsc(x.exam.name)}
      </button>`;
    }).join('');
  }

  // Clear toggles (not used in new design — legend IS the toggle)
  if (toggleWrap) toggleWrap.innerHTML = '';

  // ── Canvas setup ──────────────────────────────────────────
  const wrap = canvas.parentElement;
  // For many subjects allow horizontal scroll; min width ensures readability
  const subjectCount = allSubjects.length;
  const MIN_COL_W    = isMobile ? 44 : 56;
  const PAD_L        = isMobile ? 40 : 48;
  const PAD_R        = isMobile ? 16 : 24;
  const PAD_T        = 28;
  const PAD_B        = isMobile ? 52 : 60;

  const availW       = wrap.clientWidth || 600;
  const naturalW     = PAD_L + subjectCount * MIN_COL_W + PAD_R;
  const W            = Math.max(availW, naturalW);
  const H            = isMobile ? 220 : 280;
  const DPR          = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width        = Math.round(W   * DPR);
  canvas.height       = Math.round(H   * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx    = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // ── Theme palette ─────────────────────────────────────────
  const gridColor  = isDark ? '#374151' : '#e5e7eb';
  const labelColor = isDark ? '#9ca3af' : '#6b7280';
  const bgColor    = isDark ? '#1e2736' : '#fafbfc';
  const baseColor  = isDark ? '#4a5568' : '#d1d5db';
  const font       = `${isMobile ? 9 : 10}px Plus Jakarta Sans, system-ui, sans-serif`;

  // ── Background ────────────────────────────────────────────
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // ── Y-axis grid lines ─────────────────────────────────────
  [0, 25, 50, 75, 100].forEach(v => {
    const y = PAD_T + chartH - (v / 100) * chartH;
    ctx.strokeStyle = v === 0 ? baseColor : gridColor;
    ctx.lineWidth   = v === 0 ? 1.5 : 1;
    ctx.setLineDash(v === 0 ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign  = 'right';
    ctx.font       = font;
    ctx.fillStyle  = labelColor;
    ctx.fillText(v + '%', PAD_L - 6, y + 3.5);
  });

  // ── X-axis: subject labels ────────────────────────────────
  // Column positions — evenly spaced across chartW
  const colX = i => subjectCount === 1
    ? PAD_L + chartW / 2
    : PAD_L + (i / (subjectCount - 1)) * chartW;

  allSubjects.forEach((sub, i) => {
    const x = colX(i);
    // Vertical tick
    ctx.strokeStyle = gridColor;
    ctx.lineWidth   = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
    // Rotated label below x-axis
    ctx.save();
    ctx.translate(x, PAD_T + chartH + 10);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'right';
    ctx.font      = font;
    ctx.fillStyle = labelColor;
    const short   = sub.length > 14 ? sub.slice(0, 12) + '…' : sub;
    ctx.fillText(short, 0, 0);
    ctx.restore();
  });

  // ── One line per exam ─────────────────────────────────────
  studentExams.forEach(x => {
    const id     = x.exam.id || x.exam.name;
    if (_ptHiddenExams.has(id)) return;

    const color  = examColorMap[id];
    const points = allSubjects.map((sub, i) => {
      const s = x.result.subjectScores[sub];
      if (!s || s.mark === 'AB' || s.pct === null) return null;
      return { x: colX(i), y: PAD_T + chartH - (s.pct / 100) * chartH, pct: s.pct, sub };
    });

    // ── Shaded area ──────────────────────────────────────
    const valid = points.filter(Boolean);
    if (valid.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(valid[0].x, PAD_T + chartH);
      valid.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(valid[valid.length - 1].x, PAD_T + chartH);
      ctx.closePath();
      ctx.fillStyle = color + '1a';
      ctx.fill();
    }

    // ── Connected line (skip gaps where mark is AB/null) ──
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.setLineDash([]);
    let started = false;
    points.forEach(pt => {
      if (!pt) { started = false; return; }
      if (!started) { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); started = true; }
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // ── Dots + value labels ───────────────────────────────
    points.forEach(pt => {
      if (!pt) return;
      // Dot with background fill so labels don't overlap line
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isMobile ? 4.5 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle   = bgColor;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Value label — positioned above dot with a small background pill
      // to prevent overlap between multiple exam lines
      const label = pt.pct + '%';
      ctx.font      = `bold ${isMobile ? 8 : 9.5}px Plus Jakarta Sans, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const lw      = ctx.measureText(label).width;
      const lh      = isMobile ? 10 : 12;
      const lx      = pt.x - lw / 2 - 3;
      const ly      = pt.y - (isMobile ? 16 : 19);

      // Pill background
      ctx.fillStyle    = bgColor;
      ctx.globalAlpha  = 0.82;
      ctx.beginPath();
      ctx.roundRect?.(lx, ly, lw + 6, lh, 3);
      ctx.fill();
      ctx.globalAlpha  = 1;

      // Label text
      ctx.fillStyle = color;
      ctx.fillText(label, pt.x, ly + lh - 2);
    });
  });
}

// ── Toggle an exam line on/off ────────────────────────────────
window.ptToggleExam = function (examId) {
  if (_ptHiddenExams.has(examId)) _ptHiddenExams.delete(examId);
  else _ptHiddenExams.add(examId);
  _ptRender();
};

// Keep old name as alias for safety
window.ptToggleSubject = window.ptToggleExam;

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
  ptToggleSubject: window.ptToggleSubject,
});
