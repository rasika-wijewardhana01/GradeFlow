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

// ── Colour palette for subject lines ─────────────────────────
const _PT_COLORS = [
  '#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7',
  '#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16',
];

// Subjects hidden by toggle — persists within a session
let _ptHiddenSubjects = new Set();

// ── Draw the line chart ───────────────────────────────────────
function _ptDrawLineChart(studentExams, allSubjects) {
  const canvas = document.getElementById('ptLineChart');
  const toggleWrap = document.getElementById('ptChartToggles');
  const legendWrap = document.getElementById('ptChartLegend');
  if (!canvas || !studentExams.length || !allSubjects.length) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const isMobile = window.innerWidth <= 600;
  const examLabels = studentExams.map(x => x.exam.name);

  // ── Colour map ────────────────────────────────────────────
  const colorMap = {};
  allSubjects.forEach((s, i) => { colorMap[s] = _PT_COLORS[i % _PT_COLORS.length]; });

  // ── Build toggle buttons ──────────────────────────────────
  if (toggleWrap) {
    toggleWrap.innerHTML = allSubjects.map(sub => {
      const color = colorMap[sub];
      const hidden = _ptHiddenSubjects.has(sub);
      return `<button class="pt-toggle-btn${hidden ? ' pt-toggle-hidden' : ''}"
        data-subject="${_ptEsc(sub)}"
        style="--pt-color:${color};"
        onclick="ptToggleSubject(this, '${_ptEsc(sub).replace(/'/g,"\\'")}')">
        <span class="pt-toggle-dot"></span>${_ptEsc(sub)}
      </button>`;
    }).join('');
  }

  // ── Canvas dimensions ─────────────────────────────────────
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 600;
  const H = isMobile ? 220 : 280;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const PAD_L = 46, PAD_R = isMobile ? 12 : 20;
  const PAD_T = 20, PAD_B = isMobile ? 56 : 64;

  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // ── Theme colours ─────────────────────────────────────────
  const gridColor  = isDark ? '#374151' : '#e5e7eb';
  const labelColor = isDark ? '#9ca3af' : '#6b7280';
  const bgColor    = isDark ? '#1e2736' : '#fafbfc';
  const baseColor  = isDark ? '#4a5568' : '#d1d5db';

  // ── Background ────────────────────────────────────────────
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // ── Y-axis grid lines (0, 25, 50, 75, 100) ───────────────
  const gridVals = [0, 25, 50, 75, 100];
  ctx.textAlign = 'right';
  ctx.font = `${isMobile ? 9 : 10}px Plus Jakarta Sans, system-ui, sans-serif`;
  ctx.fillStyle = labelColor;
  gridVals.forEach(v => {
    const y = PAD_T + chartH - (v / 100) * chartH;
    ctx.strokeStyle = v === 0 ? baseColor : gridColor;
    ctx.lineWidth   = v === 0 ? 1.5 : 1;
    ctx.setLineDash(v === 0 ? [] : [4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = labelColor;
    ctx.fillText(v + '%', PAD_L - 5, y + 3.5);
  });

  // ── X-axis labels (exam names) ────────────────────────────
  if (examLabels.length === 1) {
    // Single exam — centre label only
    const x = PAD_L + chartW / 2;
    ctx.textAlign = 'center';
    ctx.font = `${isMobile ? 9 : 10}px Plus Jakarta Sans, system-ui, sans-serif`;
    ctx.fillStyle = labelColor;
    const label = examLabels[0].length > 16 ? examLabels[0].slice(0, 14) + '…' : examLabels[0];
    ctx.fillText(label, x, PAD_T + chartH + 18);
  } else {
    examLabels.forEach((label, i) => {
      const x = PAD_L + (i / (examLabels.length - 1)) * chartW;
      ctx.save();
      ctx.translate(x, PAD_T + chartH + 10);
      ctx.rotate(-Math.PI / 5);
      ctx.textAlign = 'right';
      ctx.font = `${isMobile ? 9 : 10}px Plus Jakarta Sans, system-ui, sans-serif`;
      ctx.fillStyle = labelColor;
      const short = label.length > 18 ? label.slice(0, 16) + '…' : label;
      ctx.fillText(short, 0, 0);
      ctx.restore();
    });
  }

  // ── Lines + dots per subject ──────────────────────────────
  const visibleSubjects = allSubjects.filter(s => !_ptHiddenSubjects.has(s));

  visibleSubjects.forEach(sub => {
    const color = colorMap[sub];
    const points = studentExams.map((x, i) => {
      const s = x.result.subjectScores[sub];
      if (!s || s.mark === 'AB' || s.pct === null) return null;
      const px = PAD_L + (examLabels.length === 1 ? chartW / 2 : (i / (examLabels.length - 1)) * chartW);
      const py = PAD_T + chartH - (s.pct / 100) * chartH;
      return { x: px, y: py, pct: s.pct, mark: s.mark, max: s.max };
    });

    // Draw the line (skip nulls)
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);

    let drawing = false;
    points.forEach(pt => {
      if (!pt) { drawing = false; return; }
      if (!drawing) { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); drawing = true; }
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Shaded area under the line
    const validPts = points.filter(Boolean);
    if (validPts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, PAD_T + chartH);
      validPts.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(validPts[validPts.length - 1].x, PAD_T + chartH);
      ctx.closePath();
      ctx.fillStyle = color + '18'; // 10% opacity fill
      ctx.fill();
    }

    // Draw dots + value labels
    points.forEach(pt => {
      if (!pt) return;
      // Dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isMobile ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Value label above dot
      ctx.textAlign = 'center';
      ctx.font = `bold ${isMobile ? 8.5 : 10}px Plus Jakarta Sans, system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(pt.pct + '%', pt.x, pt.y - (isMobile ? 9 : 11));
    });
  });

  // Draw "Overall %" as a dashed line on top
  const overallPts = studentExams.map((x, i) => {
    if (x.result.pct === null) return null;
    const px = PAD_L + (examLabels.length === 1 ? chartW / 2 : (i / (examLabels.length - 1)) * chartW);
    const py = PAD_T + chartH - (x.result.pct / 100) * chartH;
    return { x: px, y: py, pct: x.result.pct };
  });

  if (!_ptHiddenSubjects.has('__overall__')) {
    ctx.strokeStyle = isDark ? '#e2e8f0' : '#1f2937';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 4]);
    let drawing = false;
    overallPts.forEach(pt => {
      if (!pt) { drawing = false; return; }
      if (!drawing) { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); drawing = true; }
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    overallPts.filter(Boolean).forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isMobile ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#1e2736' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#e2e8f0' : '#1f2937';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // ── Legend ────────────────────────────────────────────────
  if (legendWrap) {
    const overallHidden = _ptHiddenSubjects.has('__overall__');
    const overallColor  = isDark ? '#e2e8f0' : '#1f2937';
    legendWrap.innerHTML =
      `<button class="pt-legend-item${overallHidden ? ' pt-toggle-hidden' : ''}" onclick="ptToggleSubject(this,'__overall__')" style="--pt-color:${overallColor};">
        <svg width="18" height="8" style="vertical-align:middle;margin-right:4px;"><line x1="0" y1="4" x2="18" y2="4" stroke="${overallColor}" stroke-width="2" stroke-dasharray="5,3"/></svg>
        Overall %
      </button>` +
      allSubjects.map(sub => {
        const c = colorMap[sub];
        const h = _ptHiddenSubjects.has(sub);
        return `<button class="pt-legend-item${h ? ' pt-toggle-hidden' : ''}" onclick="ptToggleSubject(this,'${_ptEsc(sub).replace(/'/g,"\\'")}');" style="--pt-color:${c};">
          <svg width="18" height="8" style="vertical-align:middle;margin-right:4px;"><line x1="0" y1="4" x2="18" y2="4" stroke="${c}" stroke-width="2.5"/></svg>
          ${_ptEsc(sub)}
        </button>`;
      }).join('');
  }
}

// ── Toggle a subject line on/off ─────────────────────────────
window.ptToggleSubject = function (btn, subject) {
  if (_ptHiddenSubjects.has(subject)) _ptHiddenSubjects.delete(subject);
  else _ptHiddenSubjects.add(subject);
  // Re-render the full tracker to refresh both toggles + chart
  _ptRender();
};

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
