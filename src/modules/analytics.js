// ═══════════════════════════════════════════════════════════════
//  src/modules/analytics.js
//  Subject Analytics tab: data computation, canvas bar chart,
//  score distribution, grade distribution, mobile view toggle.
// ═══════════════════════════════════════════════════════════════
// ── Per-subject analytics data ──
function getSubjectAnalyticsData() {
  return subjects.map(subj => {
    // Filter: exclude null (elective not chosen), undefined, and 'AB' (absent — not sat).
    // Absent students must not count in averages, fail rates, or totals.
    const raw = results
      .map(r => r.subjMarks[subj.name])
      .filter(v => v !== null && v !== undefined && v !== 'AB');
    if (!raw.length) return null;
    const pcts = raw.map(v => subj.max > 0 ? (parseFloat(v) / subj.max) * 100 : 0);
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const sorted = [...pcts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const highest = Math.max(...pcts);
    const lowest  = Math.min(...pcts);
    const subjPassPct = window.getSubjectPassPct(subj.name);
    const failCount = pcts.filter(p => p < subjPassPct).length;
    return {
      name: subj.name, max: subj.max, category: subj.category || '',
      avg: parseFloat(avg.toFixed(1)), median: parseFloat(median.toFixed(1)),
      highest: parseFloat(highest.toFixed(1)), lowest: parseFloat(lowest.toFixed(1)),
      failRate: parseFloat(((failCount / pcts.length) * 100).toFixed(1)),
      failCount, total: pcts.length, passPct: subjPassPct,
    };
  }).filter(Boolean);
}

// ── Mobile Subject Breakdown view toggle ──
function anlSetView(mode) {
  const cardsWrap = document.getElementById('anlMobileCards');
  const tableScroll = document.querySelector('.analytics-table-scroll');
  const btnCards = document.getElementById('anlBtnCards');
  const btnTable = document.getElementById('anlBtnTable');
  if (!cardsWrap || !tableScroll) return;
  if (mode === 'cards') {
    cardsWrap.style.display = 'block';
    tableScroll.style.display = 'none';
    if (btnCards) btnCards.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
  } else {
    cardsWrap.style.display = 'none';
    tableScroll.style.display = 'block';
    if (btnTable) btnTable.classList.add('active');
    if (btnCards) btnCards.classList.remove('active');
  }
}

function renderSubjectAnalytics() {
  const emptyEl   = document.getElementById('analytics-empty');
  const contentEl = document.getElementById('analytics-content');

  if (!results.length) {
    emptyEl.style.display = '';
    contentEl.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  contentEl.style.display = '';

  const data = getSubjectAnalyticsData();
  if (!data.length) return;

  // Use the representative pass mark across all subjects shown in the chart.
  // If all subjects share the same pass mark (common case), use that value.
  // If subjects have mixed pass marks, fall back to the most frequently used one.
  // This ensures the pass line always matches what getSubjectPassPct() returns,
  // including any custom per-subject or global overrides set via Pass Marks panel.
  const globalPassPct = (() => {
    if (data.length > 0) {
      const pctCounts = {};
      data.forEach(d => {
        const p = window.getSubjectPassPct ? window.getSubjectPassPct(d.name) : d.passPct;
        pctCounts[p] = (pctCounts[p] || 0) + 1;
      });
      // Return the most commonly used pass mark (modal value)
      return parseInt(Object.keys(pctCounts).reduce((a, b) => pctCounts[a] > pctCounts[b] ? a : b), 10);
    }
    const sg = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
    return sg.length > 1 ? sg[sg.length - 2].minPct : 50;
  })();

  // Store for deferred chart draw (see end of function)
  renderSubjectAnalytics._pendingData      = data;
  renderSubjectAnalytics._pendingPassPct   = globalPassPct;

  // ── Summary metrics ──
  const avgOfAvgs = data.reduce((a, d) => a + d.avg, 0) / data.length;
  const weakestSubj = data.reduce((a, d) => d.avg < a.avg ? d : a, data[0]);
  const strongestSubj = data.reduce((a, d) => d.avg > a.avg ? d : a, data[0]);
  const highFailSubjs = data.filter(d => d.failRate > 30);

  document.getElementById('analyticsMetricsGrid').innerHTML = `
    <div class="metric-card blue">
      <div class="metric-label">Subjects tracked</div>
      <div class="metric-value">${data.length}</div>
      <div class="metric-sub">with data entered</div>
    </div>
    <div class="metric-card green">
      <div class="metric-label">Strongest subject</div>
      <div class="metric-value" style="font-size:18px;">${strongestSubj.name}</div>
      <div class="metric-sub">${strongestSubj.avg}% avg</div>
    </div>
    <div class="metric-card amber">
      <div class="metric-label">Weakest subject</div>
      <div class="metric-value" style="font-size:18px;">${weakestSubj.name}</div>
      <div class="metric-sub">${weakestSubj.avg}% avg</div>
    </div>
    <div class="metric-card red">
      <div class="metric-label">Subjects &gt;30% failed</div>
      <div class="metric-value">${highFailSubjs.length}</div>
      <div class="metric-sub">need attention</div>
    </div>
    <div class="metric-card teal">
      <div class="metric-label">Cross-subject avg</div>
      <div class="metric-value">${avgOfAvgs.toFixed(1)}%</div>
      <div class="metric-sub">mean of all averages</div>
    </div>
  `;

  // ── Fail alert banner ──
  const alertEl = document.getElementById('analyticsFailAlert');
  if (highFailSubjs.length) {
    alertEl.style.display = '';
    alertEl.innerHTML = `<div class="analytics-fail-alert">
      <strong>⚠ ${highFailSubjs.length} subject${highFailSubjs.length > 1 ? 's' : ''} with &gt;30% failure rate — targeted remediation recommended:</strong>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px 4px;">
        ${highFailSubjs.map(d => `<span class="analytics-fail-pill">📉 ${d.name} — ${d.failRate}% failed (${d.failCount}/${d.total})</span>`).join('')}
      </div>
    </div>`;
  } else {
    alertEl.style.display = 'none';
  }

  // ── Draw bar chart on canvas ──
  // DEFERRED: container width must be measured AFTER display:none→'' reflow.
  // Two rAF frames guarantees the browser has fully laid out the section.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    drawAnalyticsChart(renderSubjectAnalytics._pendingData, renderSubjectAnalytics._pendingPassPct);
  }));

  // ── Subject detail table ──
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const catPalette = [
    { fg:'#1A56DB', bg:'#EFF6FF', border:'#BFDBFE', darkFg:'#60a5fa', darkBg:'#1e3a5f', darkBorder:'#2d4f7a' },
    { fg:'#059669', bg:'#ECFDF5', border:'#A7F3D0', darkFg:'#34d399', darkBg:'#064e3b', darkBorder:'#065f46' },
    { fg:'#D97706', bg:'#FFFBEB', border:'#FDE68A', darkFg:'#fcd34d', darkBg:'#3d2c00', darkBorder:'#78350f' },
    { fg:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE', darkFg:'#c4b5fd', darkBg:'#2e1065', darkBorder:'#4c1d95' },
    { fg:'#DC2626', bg:'#FEF2F2', border:'#FECACA', darkFg:'#f87171', darkBg:'#450a0a', darkBorder:'#7f1d1d' },
    { fg:'#0D9488', bg:'#F0FDFA', border:'#99F6E4', darkFg:'#2dd4bf', darkBg:'#042f2e', darkBorder:'#0f766e' },
  ];
  const getCatColor = (catName) => {
    const idx = window.categories.findIndex(c => c.name === catName);
    return idx >= 0 ? catPalette[idx % catPalette.length] : null;
  };

  let tableHtml = `<thead><tr>
    <th style="text-align:left;">Subject</th>
    <th>Avg %</th>
    <th>Median %</th>
    <th>Highest %</th>
    <th>Lowest %</th>
    <th>Fail rate</th>
    <th style="min-width:120px;">Pass/Fail</th>
  </tr></thead><tbody>`;

  data.forEach(d => {
    const catColor = getCatColor(d.category);
    const catBadgeBg     = catColor ? (isDarkMode ? catColor.darkBg     : catColor.bg)     : (isDarkMode ? '#374151' : '#f1f5f9');
    const catBadgeFg     = catColor ? (isDarkMode ? catColor.darkFg     : catColor.fg)     : (isDarkMode ? '#a0aec0' : '#6b7280');
    const catBadgeBorder = catColor ? (isDarkMode ? catColor.darkBorder : catColor.border) : (isDarkMode ? '#4a5568' : '#e5e7eb');
    const catBadge = d.category
      ? `<span style="display:inline-flex;align-items:center;background:${catBadgeBg};color:${catBadgeFg};border:1px solid ${catBadgeBorder};border-radius:99px;font-size:10px;font-weight:700;padding:1px 7px;margin-left:6px;">${d.category}</span>`
      : '';
    const failClass = d.failRate > 30 ? 'anl-fail-high' : d.failRate > 15 ? 'anl-fail-warn' : '';
    const passCount = d.total - d.failCount;
    const passWidth = Math.round((passCount / d.total) * 100);
    const barColor = d.failRate > 30
      ? (isDarkMode ? '#f87171' : '#dc2626')
      : d.failRate > 15
        ? (isDarkMode ? '#fcd34d' : '#d97706')
        : (isDarkMode ? '#34d399' : '#059669');
    tableHtml += `<tr>
      <td>${d.name}${catBadge}</td>
      <td><strong>${d.avg}%</strong></td>
      <td>${d.median}%</td>
      <td style="color:var(--success);font-weight:600;">▲ ${d.highest}%</td>
      <td style="color:var(--danger);font-weight:600;">▼ ${d.lowest}%</td>
      <td class="${failClass}">${d.failRate}%</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="anl-pass-bar"><div class="anl-pass-bar-fill" style="width:${passWidth}%;background:${barColor};"></div></div>
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${passCount}P / ${d.failCount}F</span>
        </div>
      </td>
    </tr>`;
  });
  tableHtml += '</tbody>';
  document.getElementById('analyticsTable').innerHTML = tableHtml;

  // ── Mobile card view ──
  const accentClasses = ['anl-card-accent-blue','anl-card-accent-green','anl-card-accent-amber','anl-card-accent-purple','anl-card-accent-red','anl-card-accent-teal'];
  const getCatAccent = (catName) => {
    const idx = window.categories.findIndex(c => c.name === catName);
    return idx >= 0 ? accentClasses[idx % accentClasses.length] : 'anl-card-accent-gray';
  };
  let cardsHtml = '';
  data.forEach(d => {
    const accentClass = getCatAccent(d.category);
    const catColor = getCatColor(d.category);
    let catBadgeStyle;
    if (catColor) {
      catBadgeStyle = isDarkMode
        ? `background:${catColor.darkBg || catColor.bg};color:${catColor.darkFg || catColor.fg};border:1px solid ${catColor.darkBorder || catColor.border};`
        : `background:${catColor.bg};color:${catColor.fg};border:1px solid ${catColor.border};`;
    } else {
      catBadgeStyle = isDarkMode
        ? 'background:#374151;color:#a0aec0;border:1px solid #4a5568;'
        : 'background:#f1f5f9;color:#6b7280;border:1px solid #e5e7eb;';
    }
    const catBadge = d.category
      ? `<span class="anl-subject-card-cat" style="${catBadgeStyle}">${d.category}</span>` : '';
    const passCount = d.total - d.failCount;
    const passWidth = Math.round((passCount / d.total) * 100);
    const barColor = d.failRate > 30
      ? (isDarkMode ? '#f87171' : '#dc2626')
      : d.failRate > 15
        ? (isDarkMode ? '#fcd34d' : '#d97706')
        : (isDarkMode ? '#34d399' : '#059669');
    const avgColor = d.avg >= 75
      ? (isDarkMode ? '#34d399' : '#059669')
      : d.avg >= 50
        ? (isDarkMode ? '#60a5fa' : '#1a56db')
        : (isDarkMode ? '#f87171' : '#dc2626');
    const highColor  = isDarkMode ? '#34d399' : '#059669';
    const lowColor   = isDarkMode ? '#f87171' : '#dc2626';
    // Fail stat box — theme-aware background/border
    let failBoxBg, failBoxBorder;
    if (d.failRate > 30) {
      failBoxBg     = isDarkMode ? '#450a0a' : '#fef2f2';
      failBoxBorder = isDarkMode ? '#7f1d1d' : '#fecaca';
    } else if (d.failRate > 15) {
      failBoxBg     = isDarkMode ? '#3d2c00' : '#fffbeb';
      failBoxBorder = isDarkMode ? '#78350f' : '#fde68a';
    } else {
      failBoxBg     = isDarkMode ? '#064e3b' : '#ecfdf5';
      failBoxBorder = isDarkMode ? '#065f46' : '#a7f3d0';
    }
    const failBadgeClass = d.failRate > 30 ? 'anl-fail-badge-high' : d.failRate > 15 ? 'anl-fail-badge-warn' : 'anl-fail-badge-ok';
    cardsHtml += `
    <div class="anl-subject-card ${accentClass}" style="padding-left:18px;">
      <div class="anl-subject-card-top">
        <div>
          <div class="anl-subject-card-name">${d.name}</div>
          ${catBadge}
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:10px;">
          <div class="anl-subject-card-avg" style="color:${avgColor};">${d.avg}%</div>
          <div class="anl-subject-card-avg-label">Avg</div>
        </div>
      </div>
      <div class="anl-subject-card-stats">
        <div class="anl-stat-box">
          <div class="anl-stat-box-val">${d.median}%</div>
          <div class="anl-stat-box-lbl">Median</div>
        </div>
        <div class="anl-stat-box">
          <div class="anl-stat-box-arrow" style="color:${highColor};">▲</div>
          <div class="anl-stat-box-val" style="color:${highColor};">${d.highest}%</div>
          <div class="anl-stat-box-lbl">Highest</div>
        </div>
        <div class="anl-stat-box">
          <div class="anl-stat-box-arrow" style="color:${lowColor};">▼</div>
          <div class="anl-stat-box-val" style="color:${lowColor};">${d.lowest}%</div>
          <div class="anl-stat-box-lbl">Lowest</div>
        </div>
        <div class="anl-stat-box" style="background:${failBoxBg};border-color:${failBoxBorder};">
          <div class="anl-stat-box-val" style="color:${barColor};">${d.failRate}%</div>
          <div class="anl-stat-box-lbl">Fail</div>
        </div>
      </div>
      <div class="anl-subject-card-bar-row">
        <div class="anl-subject-card-bar-track">
          <div class="anl-subject-card-bar-fill" style="width:${passWidth}%;background:${barColor};"></div>
        </div>
        <div class="anl-subject-card-bar-label">${passCount} Pass / ${d.failCount} Fail</div>
      </div>
    </div>`;
  });
  const cardsContainer = document.getElementById('anlSubjectCards');
  if (cardsContainer) cardsContainer.innerHTML = cardsHtml;
}

function drawAnalyticsChart(data, globalPassPct) {
  const canvas = document.getElementById('analyticsChartCanvas');
  if (!canvas) return;

  const showPassLine = document.getElementById('analyticsShowPassLine')?.checked !== false;
  const isMobile = window.innerWidth <= 600;
  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';

  // ── Theme palette ──
  const THEME = {
    bg:          isDark ? '#1e2736' : '#fafbfc',
    gridLine:    isDark ? '#374151' : '#e5e7eb',
    gridBase:    isDark ? '#4a5568' : '#d1d5db',
    gridLabel:   isDark ? '#a0aec0' : '#9ca3af',
    barTrack:    isDark ? '#2d3748' : '#e5e7eb',
    barLabel:    isDark ? '#e2e8f0' : '#111827',
    nameDefault: isDark ? '#a0aec0' : '#374151',
    nameFail:    isDark ? '#f87171' : '#dc2626',
    legendText:  isDark ? '#a0aec0' : '#6b7280',
    passLine:    '#f59e0b',
    barGood:     isDark ? '#3b82f6' : '#1a56db',
    barWarn:     '#f59e0b',
    barBad:      isDark ? '#f87171' : '#ef4444',
    barLightGood:isDark ? '#1e3a5f' : '#bfdbfe',
    barLightWarn:isDark ? '#3d2c00' : '#fde68a',
    barLightBad: isDark ? '#450a0a' : '#fecaca',
  };

  // ── Step 1: Measure the true available CSS width of the scroll container ──
  const container = canvas.parentElement; // .analytics-canvas-scroll
  // Walk up to find a reliably-sized ancestor in case the scroll div itself
  // has no intrinsic width yet (e.g. still being laid out).
  const cardBody = container.closest('.analytics-chart-body') ||
                   container.closest('.card-body') ||
                   container.parentElement;
  const fallbackW = isMobile
    ? Math.min(window.innerWidth, document.documentElement.clientWidth) - 28
    : 700;
  let containerCSSW = container.getBoundingClientRect().width ||
                      container.clientWidth ||
                      (cardBody ? cardBody.getBoundingClientRect().width : 0) ||
                      fallbackW;
  // Safety cap: never let the canvas exceed the visual viewport width
  if (isMobile) {
    const vpw = Math.min(window.innerWidth, document.documentElement.clientWidth);
    containerCSSW = Math.min(containerCSSW, vpw - 28);
  }
  if (containerCSSW < 100) containerCSSW = fallbackW; // final fallback

  // ── Step 2: Decide bar width & gap based on subject count + screen width ──
  const GAP        = isMobile ? 8  : 10;
  const PAD_L      = isMobile ? 40 : 46;
  const PAD_R      = isMobile ? 10 : 16;
  const PAD_T      = isMobile ? 18 : 20;
  const PAD_B      = isMobile ? 82 : 92;   // extra bottom room for rotated labels + legend (increased from 72)

  // On mobile: try to fit all bars into the visible container first.
  // If bars would be too narrow (< BAR_MIN), allow horizontal scroll.
  const BAR_MIN    = isMobile ? 26  : 28;
  const BAR_MAX    = isMobile ? 52  : 60;
  const BAR_IDEAL  = isMobile ? 36  : 44;   // target width when fitting

  // Available horizontal space for bars
  const availForBars = containerCSSW - PAD_L - PAD_R;
  const naturalBarW  = Math.floor((availForBars - (data.length - 1) * GAP) / data.length);

  let barW, W;
  if (naturalBarW >= BAR_MIN) {
    // All bars fit — clamp to BAR_MAX and centre
    barW = Math.min(BAR_MAX, Math.max(BAR_MIN, naturalBarW));
    W    = containerCSSW;          // canvas fills container exactly — no scroll needed
  } else {
    // Too many subjects — use ideal bar width and allow horizontal scroll
    barW = BAR_IDEAL;
    W    = PAD_L + data.length * (barW + GAP) - GAP + PAD_R + 8;
  }

  // Show/hide scroll hint
  const hint = document.getElementById('analyticsScrollHint');
  if (hint) hint.style.display = (W > containerCSSW && isMobile) ? 'flex' : 'none';

  // ── Step 3: Physical canvas size (DPR-aware for crisp text on retina) ──
  // Extra height added vs. original: +10px mobile / +20px desktop so that
  // the 45°-rotated subject labels no longer collide with the legend.
  const H   = isMobile ? 280 : 320;
  const DPR = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× to save memory

  canvas.width          = Math.round(W   * DPR);
  canvas.height         = Math.round(H   * DPR);
  canvas.style.width    = W + 'px';
  canvas.style.height   = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);  // scale all drawing by DPR
  ctx.clearRect(0, 0, W, H);

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // ── Background ──
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Grid lines ──
  const gridLines = [0, 25, 50, 75, 100];
  const gridFontSize = isMobile ? 9.5 : 10;
  ctx.setLineDash([4, 4]);
  gridLines.forEach(val => {
    const y = PAD_T + chartH - (val / 100) * chartH;
    ctx.strokeStyle = val === 0 ? THEME.gridBase : THEME.gridLine;
    ctx.lineWidth   = val === 0 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke();
    ctx.fillStyle  = THEME.gridLabel;
    ctx.font       = `${gridFontSize}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign  = 'right';
    ctx.fillText(val + '%', PAD_L - 4, y + 3.5);
  });
  ctx.setLineDash([]);


  // ── Bars ──
  const totalBarSpace = data.length * (barW + GAP) - GAP;
  const startX        = PAD_L + (chartW - totalBarSpace) / 2;
  const labelFontSize = isMobile ? 9.5 : 10.5;
  const nameFontSize  = isMobile ? 9.5 : 10.5;

  data.forEach((d, i) => {
    const x    = startX + i * (barW + GAP);
    const barH = Math.max(0, (d.avg / 100) * chartH); // guard: clamp to 0 if NaN/negative
    const y    = PAD_T + chartH - barH;

    const barColor      = d.failRate > 30 ? THEME.barBad  : d.failRate > 15 ? THEME.barWarn  : THEME.barGood;
    const barLightColor = d.failRate > 30 ? THEME.barLightBad : d.failRate > 15 ? THEME.barLightWarn : THEME.barLightGood;

    // Track (background behind bar)
    ctx.fillStyle = THEME.barTrack;
    roundRect(ctx, x, PAD_T, barW, chartH, 4);
    ctx.fill();

    // Light base fill
    ctx.fillStyle = barLightColor;
    roundRect(ctx, x, y, barW, barH, 4);
    ctx.fill();

    // Gradient colour overlay
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    grad.addColorStop(0, barColor + 'ee');
    grad.addColorStop(1, barColor + '99');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, barH, 4);
    ctx.fill();

    // Avg % label above bar
    ctx.fillStyle = THEME.barLabel;
    ctx.font      = `bold ${labelFontSize}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign = 'center';
    const labelY  = Math.max(PAD_T + 12, y - 4);
    ctx.fillText(d.avg + '%', x + barW / 2, labelY);

    // Subject name — rotated 45° below x-axis
    ctx.save();
    ctx.translate(x + barW / 2, PAD_T + chartH + 9);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = d.failRate > 30 ? THEME.nameFail : THEME.nameDefault;
    ctx.font      = (d.failRate > 30 ? 'bold ' : '') + `${nameFontSize}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign = 'right';
    // Truncate label to fit: shorter on mobile to avoid overlap
    const maxLen  = isMobile ? (barW < 30 ? 8 : 11) : 14;
    const label   = d.name.length > maxLen ? d.name.slice(0, maxLen - 1) + '…' : d.name;
    ctx.fillText(label, 0, 0);
    ctx.restore();

    // ⚠ warning icon — floats just ABOVE the avg-% label, inside the chart area.
    // (Previously placed below the x-axis labels where it collided with the legend.)
    if (d.failRate > 30) {
      ctx.save();
      ctx.fillStyle = THEME.nameFail;
      ctx.font      = `${isMobile ? 10 : 11}px sans-serif`;
      ctx.textAlign = 'center';
      // Keep the icon within the chart: at least PAD_T+11 from the top
      const warnIconY = Math.max(PAD_T + 11, labelY - 14);
      ctx.fillText('⚠', x + barW / 2, warnIconY);
      ctx.restore();
    }
  });

  // ── Pass line — drawn AFTER bars so it sits on top of them ──
  if (showPassLine) {
    const passY = PAD_T + chartH - (globalPassPct / 100) * chartH;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = THEME.passLine;
    ctx.lineWidth   = isMobile ? 1.5 : 2;
    ctx.beginPath(); ctx.moveTo(PAD_L, passY); ctx.lineTo(PAD_L + chartW, passY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle  = THEME.passLine;
    ctx.font       = `bold ${gridFontSize}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign  = 'left';
    ctx.fillText('Pass ' + globalPassPct + '%', PAD_L + 4, passY - 4);
    ctx.restore();
  }

  // ── Legend ──
  // On mobile, stack into 2 rows if needed to prevent overlap
  const legendFont = isMobile ? 9 : 10;
  const bSize      = isMobile ? 8 : 10;
  ctx.font         = `${legendFont}px Plus Jakarta Sans, sans-serif`;

  const legendItems = [
    { color: THEME.barGood, label: 'Good' },
    { color: THEME.barWarn, label: '>15% failed' },
    { color: THEME.barBad,  label: '>30% failed ⚠' },
  ];

  // Measure total legend width to decide single vs two-row layout
  const itemWidths = legendItems.map(item => bSize + 4 + ctx.measureText(item.label).width);
  const itemGap    = isMobile ? 10 : 14;
  const totalLegendW = itemWidths.reduce((a, w) => a + w, 0) + itemGap * (legendItems.length - 1);

  let legendRows;
  if (isMobile && totalLegendW > chartW + PAD_L) {
    // Two rows: first item on row 1, last two on row 2
    legendRows = [
      [legendItems[0]],
      [legendItems[1], legendItems[2]],
    ];
  } else {
    legendRows = [legendItems];
  }

  const rowH      = legendFont + 5;
  const baseY     = H - (isMobile ? 8 : 10);
  const totalRows = legendRows.length;

  legendRows.forEach((row, ri) => {
    const rowY = baseY - (totalRows - 1 - ri) * rowH;
    let lx = PAD_L;
    row.forEach((item, ii) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, rowY - bSize, bSize, bSize);
      ctx.fillStyle = THEME.legendText;
      ctx.textAlign = 'left';
      ctx.fillText(item.label, lx + bSize + 3, rowY - 1);
      lx += bSize + 3 + ctx.measureText(item.label).width + (ii < row.length - 1 ? itemGap : 0);
    });
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Redraw chart on orientation change / window resize ──
// Uses ResizeObserver on the scroll container so the chart always fits
(function() {
  let _analyticsResizeTimer = null;
  function _onAnalyticsResize() {
    clearTimeout(_analyticsResizeTimer);
    _analyticsResizeTimer = setTimeout(() => {
      if (results.length) renderSubjectAnalytics();
    }, 120);
  }
  // ResizeObserver: fires when the card/container changes size (orientation, etc.)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(_onAnalyticsResize);
    document.addEventListener('DOMContentLoaded', () => {
      const scrollEl = document.querySelector('.analytics-canvas-scroll');
      if (scrollEl) ro.observe(scrollEl);
    });
  }
  // Fallback for browsers without ResizeObserver
  window.addEventListener('resize', _onAnalyticsResize, { passive: true });
  window.addEventListener('orientationchange', () => {
    // orientationchange fires before the layout settles — wait a bit longer
    setTimeout(() => { if (results.length) renderSubjectAnalytics(); }, 350);
  }, { passive: true });
})();

async function exportAnalyticsImage() {
  if (!results.length) { window.toast('Calculate results first', 'error'); return; }
  // Use html2canvas equivalent — capture the analytics-content div
  const card = document.getElementById('analyticsChartCard');
  const table = card.closest('.section') || document.getElementById('analytics-content');
  // Render into a single canvas snapshot
  const canvas = document.getElementById('analyticsChartCanvas');
  if (!canvas) { window.toast('Chart not ready', 'error'); return; }

  // Build a composite image: chart + table as image
  const W = canvas.width;
  const H = canvas.height;
  // We'll just export the chart canvas for now
  const link = document.createElement('a');
  const className = document.getElementById('className')?.value?.trim() || 'class';
  link.download = `subject-analytics-${className.replace(/\s+/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  window.toast('Chart exported as PNG!', 'success');
}

async function exportAnalyticsPDF() {
  if (!results.length) { window.toast('Calculate results first', 'error'); return; }

  const className   = document.getElementById('className')?.value?.trim()    || 'Class';
  const examLabel   = document.getElementById('examLabel')?.value?.trim()    || '';
  const academicYear= document.getElementById('academicYear')?.value?.trim() || '';
  const teacherName = document.getElementById('teacherName')?.value?.trim()  || '';
  const data        = renderSubjectAnalytics._pendingData;
  if (!data || !data.length) { window.toast('Analytics data not ready - view the tab first', 'error'); return; }

  // ── Read Setup / Branding data ────────────────────────────────────────
  // Uses the same getBrandingForExport() path as the Results PDF so all
  // school identity fields (logo, colour, name, address, principal) are
  // automatically pulled from what the teacher filled in the Setup tab.
  const _br         = window.getBrandingForExport();
  const _bColorHex  = (_br && _br.primaryColor) ? _br.primaryColor : '#1a56db';
  const _bSchool    = (_br && _br.schoolFullName) ? _br.schoolFullName
                      : (document.getElementById('schoolName')?.value?.trim() || '');
  const _bAddr      = (_br && _br.showAddress && _br.address) ? _br.address : '';
  const _bPrincipal = (_br && _br.principal)   ? _br.principal   : '';
  const _bLogoUrl   = (_br && _br.logoDataUrl) ? _br.logoDataUrl : null;
  const _bShowSig   = _br && _br.showSig;
  const _dateStr    = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});

  window.toast('Generating PDF...', 'info');

  // ── helper: hex string → [r,g,b] ────────────────────────────────────
  const hex2rgb = h => { h = h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };

  // Resolve branding accent colour — used as the primary PDF colour so the
  // analytics report matches the school's visual identity.
  const _bColorRgb = hex2rgb(_bColorHex);

  // ── Palette ──────────────────────────────────────────────────────────
  const C = {
    primary:    _bColorRgb,            // ← comes from Setup branding colour
    primaryDk:  _bColorRgb.map(v=>Math.max(0, v-30)),
    accent:     [245, 158,  11],   // #f59e0b
    success:    [  5, 150, 105],   // #059669
    danger:     [220,  38,  38],   // #dc2626
    warn:       [217, 119,   6],   // #d97706
    text:       [ 17,  24,  39],   // #111827
    textMid:    [ 55,  65,  81],   // #374151
    textMuted:  [107, 114, 128],   // #6b7280
    border:     [229, 231, 235],   // #e5e7eb
    headerBg:   [248, 250, 252],   // #f8fafc
    rowAlt:     [250, 251, 252],   // #fafbfc
    white:      [255, 255, 255],
    // category badge colours  [fg, bg]
    catColors: [
      [[26, 86,219],  [239,246,255]],   // blue
      [[5, 150,105],  [236,253,245]],   // green
      [[217,119,  6], [255,251,235]],   // amber
      [[124, 58,237], [245,243,255]],   // purple
      [[220, 38, 38], [254,242,242]],   // red
      [[13, 148,136], [240,253,250]],   // teal
    ],
  };

  // ── jsPDF setup ──────────────────────────────────────────────────────
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = 210, PH = 297;
  const ML = 14, MR = 14, MT = 14;   // margins
  const CW = PW - ML - MR;           // content width = 182 mm
  let   Y  = MT;                      // current Y cursor

  // ── Utility drawing helpers ───────────────────────────────────────────
  const setFill   = ([r,g,b]) => pdf.setFillColor(r,g,b);
  const setStroke = ([r,g,b]) => pdf.setDrawColor(r,g,b);
  const setTxt    = ([r,g,b]) => pdf.setTextColor(r,g,b);
  const setFont   = (style='normal', size=9) => { pdf.setFont('helvetica', style); pdf.setFontSize(size); };

  const rect = (x,y,w,h,fill,stroke,lw=0.1) => {
    if (fill)   { setFill(fill);   pdf.rect(x,y,w,h,'F'); }
    if (stroke) { pdf.setLineWidth(lw); setStroke(stroke); pdf.rect(x,y,w,h,'S'); }
  };
  const roundRect = (x,y,w,h,r,fill,stroke,lw=0.2) => {
    if (fill)   { setFill(fill);   pdf.roundedRect(x,y,w,h,r,r,'F'); }
    if (stroke) { pdf.setLineWidth(lw); setStroke(stroke); pdf.roundedRect(x,y,w,h,r,r,'S'); }
  };
  const line = (x1,y1,x2,y2,color,lw=0.2) => {
    pdf.setLineWidth(lw); setStroke(color); pdf.line(x1,y1,x2,y2);
  };
  const txt = (s,x,y,opts={}) => {
    setFont(opts.bold?'bold':'normal', opts.size||9);
    setTxt(opts.color||C.text);
    pdf.text(String(s), x, y, { align: opts.align||'left', baseline: opts.baseline||'alphabetic' });
  };

  // ── Page header / footer helpers ──────────────────────────────────────
  // drawPageHeader — Rich branded header (PAGE 1 only gets the full version;
  // subsequent pages get a compact repeat header for context).
  // headerHeight: how many mm the header occupies (Y is set accordingly).
  const HEADER_H_FULL    = 36;   // page 1 full branding header height
  const HEADER_H_COMPACT = 12;   // continuation pages compact strip height

  // ── Resolve logo image promise once (async, loaded before draw) ──────
  // jsPDF.addImage accepts a data-URL directly; no extra loading needed.
  // We load it here so both page-1 and page-N headers can use it.

  const drawPageHeader = (pageNum, totalPages) => {
    if (pageNum === 1) {
      // ── Full branded header (page 1) ─────────────────────────────────
      // Background fill for header area
      rect(0, 0, PW, HEADER_H_FULL, C.primary, null);

      // ── Logo (top-left, if available) ──────────────────────────────
      const LOGO_SZ = 18;   // logo square size in mm
      const LOGO_X  = ML;
      const LOGO_Y  = (HEADER_H_FULL - LOGO_SZ) / 2;
      let   textX   = ML;   // where text block starts (shifts right if logo present)

      if (_bLogoUrl) {
        try {
          pdf.addImage(_bLogoUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_SZ, LOGO_SZ);
          textX = ML + LOGO_SZ + 4;
        } catch(e) { /* logo load failed — skip silently */ }
      }

      // ── Right-side meta: date + page ───────────────────────────────
      const rightX = PW - MR;
      setFont('normal', 7);
      setTxt(C.white);
      const metaOpacity = [255,255,255]; // white for dark header bg
      pdf.text(_dateStr, rightX, 10, { align: 'right' });
      pdf.text(`Page ${pageNum} of ${totalPages}`, rightX, 16, { align: 'right' });

      // ── Report title (white, bold) ──────────────────────────────────
      const titleY = _bSchool ? 11 : 14;
      if (_bSchool) {
        setFont('normal', 7.5);
        setTxt(C.white);
        // Semi-transparent look via normal weight + small size
        pdf.text(_bSchool.toUpperCase(), textX, 8);
      }
      setFont('bold', 14);
      setTxt(C.white);
      pdf.text('Subject Analytics Report', textX, titleY + (_bSchool ? 3 : 0));

      // Subtitle row: class · exam · year
      const subParts = [];
      if (className)   subParts.push(className);
      if (examLabel)   subParts.push(examLabel);
      if (academicYear) subParts.push(academicYear);
      if (subParts.length) {
        setFont('normal', 8);
        setTxt(C.white);
        pdf.text(subParts.join('  |  '), textX, titleY + (_bSchool ? 9 : 6));
      }

      // ── Info strip below coloured header ──────────────────────────
      // Light grey band with teacher / principal / address
      const stripY = HEADER_H_FULL;
      const STRIP_H = 9;
      rect(0, stripY, PW, STRIP_H, C.headerBg, null);
      line(0, stripY, PW, stripY, C.border, 0.15);
      line(0, stripY + STRIP_H, PW, stripY + STRIP_H, C.border, 0.3);

      const infoParts = [];
      if (teacherName) infoParts.push('Teacher: ' + teacherName);
      if (_bPrincipal) infoParts.push('Principal: ' + _bPrincipal);
      if (_bAddr)      infoParts.push(_bAddr.replace(/\n/g, ', '));

      setFont('normal', 7.5);
      setTxt(C.textMuted);
      if (infoParts.length) {
        // Left side: teacher + principal
        const leftInfo = infoParts.slice(0, 2).join('   ·   ');
        pdf.text(leftInfo, ML, stripY + 5.8);
        // Right side: address (if present and space allows)
        if (infoParts.length > 2) {
          const addrText = infoParts[2];
          const maxAddrW = 90;
          const addrTrunc = pdf.getStringUnitWidth(addrText) * 7.5 / pdf.internal.scaleFactor > maxAddrW
            ? addrText.substring(0, 55) + '…'
            : addrText;
          pdf.text(addrTrunc, PW - MR, stripY + 5.8, { align: 'right' });
        }
      } else {
        // No extra info — print generated date on left
        pdf.text('Generated: ' + _dateStr, ML, stripY + 5.8);
      }

      Y = HEADER_H_FULL + STRIP_H + 6;  // content starts below info strip
      // Decorative thin rule below info strip (already drawn via border above)
    } else {
      // ── Compact continuation header (pages 2+) ───────────────────────
      rect(0, 0, PW, HEADER_H_COMPACT, C.primary, null);
      setFont('bold', 8.5);
      setTxt(C.white);
      const compactLeft = 'Subject Analytics Report'
        + (_bSchool ? '  ·  ' + _bSchool : '')
        + (className ? '  ·  ' + className : '');
      pdf.text(compactLeft, ML, HEADER_H_COMPACT / 2 + 1.5);
      setFont('normal', 7.5);
      pdf.text(`Page ${pageNum} of ${totalPages}`, PW - MR, HEADER_H_COMPACT / 2 + 1.5, { align: 'right' });
      Y = HEADER_H_COMPACT + 6;
    }
  };

  const drawPageFooter = (pageNum, totalPages) => {
    const FY = PH - 8;
    line(ML, FY - 2, PW - MR, FY - 2, C.border, 0.2);
    setFont('normal', 7);
    setTxt(C.textMuted);
    // Left: school name (if set) or app name
    const footerLeft = _bSchool
      ? _bSchool + '  |  Subject Analytics'
      : 'GradeFlow  |  Subject Analytics';
    pdf.text(footerLeft, ML, FY + 1.5);
    // Right: page number
    pdf.text(`Page ${pageNum} of ${totalPages}`, PW - MR, FY + 1.5, { align: 'right' });
    // Signature line on last page if branding requests it
    if (_bShowSig && teacherName && pageNum === totalPages) {
      setFont('normal', 7);
      setTxt(C.textMuted);
      const sigY = FY - 6;
      pdf.text('Signature: ___________   ' + teacherName, PW - MR, sigY, { align: 'right' });
    }
  };

  const checkPageBreak = (needed, totalPages) => {
    if (Y + needed > PH - 16) {
      drawPageFooter(pdf.internal.getCurrentPageInfo().pageNumber, totalPages);
      pdf.addPage();
      drawPageHeader(pdf.internal.getCurrentPageInfo().pageNumber, totalPages);
      return true;
    }
    return false;
  };

  // ── Calculate total pages estimate (rough) ──
  // We'll do a two-pass: draw everything, then patch footer page counts
  // For simplicity, track as we go and patch at end.
  const totalPagesPlaceholder = '??';

  // ── PAGE 1 START ─────────────────────────────────────────────────────
  drawPageHeader(1, totalPagesPlaceholder);

  // ── Summary Metric Cards ──────────────────────────────────────────────
  const metricData = (() => {
    if (!data.length) return [];
    const sorted = [...data].sort((a,b) => b.avg - a.avg);
    const best   = sorted[0];
    const worst  = sorted[sorted.length - 1];
    const highFail = data.filter(d => d.failRate > 30);
    const avgAll = (data.reduce((s,d)=>s+d.avg,0)/data.length).toFixed(1);
    return [
      { label:'Best Subject',         value: best.name,          sub: best.avg+'% avg',    color: C.success },
      { label:'Weakest Subject',       value: worst.name,         sub: worst.avg+'% avg',   color: C.accent  },
      { label:'High Failure (>30%)',   value: highFail.length,    sub: 'subjects',          color: C.danger  },
      { label:'Cross-Subject Avg',     value: avgAll+'%',         sub: 'mean of all',       color: C.primary },
    ];
  })();

  if (metricData.length) {
    const cardW = (CW - 6) / 4;
    const cardH = 18;
    metricData.forEach((m, i) => {
      const cx = ML + i * (cardW + 2);
      roundRect(cx, Y, cardW, cardH, 2, C.white, C.border, 0.3);
      // left accent strip
      rect(cx, Y, 1.5, cardH, m.color, null);
      // label
      txt(m.label, cx+4, Y+4.5, { size:6.5, color:C.textMuted });
      // value
      const valStr = String(m.value);
      const valSize = valStr.length > 14 ? 7 : valStr.length > 9 ? 8 : 10;
      txt(valStr, cx+4, Y+10.5, { size:valSize, bold:true, color:m.color });
      // sub
      txt(m.sub, cx+4, Y+15.5, { size:6, color:C.textMuted });
    });
    Y += cardH + 6;
  }

  // ── Chart Section ─────────────────────────────────────────────────────
  const srcCanvas = document.getElementById('analyticsChartCanvas');
  if (srcCanvas && srcCanvas.width > 0) {
    // Save original canvas state so we can restore it exactly
    const origW        = srcCanvas.width;
    const origH        = srcCanvas.height;
    const origStyleW   = srcCanvas.style.width;
    const origStyleH   = srcCanvas.style.height;
    const wasDark      = document.documentElement.getAttribute('data-theme') === 'dark';

    // Switch to light theme before redrawing
    if (wasDark) document.documentElement.setAttribute('data-theme', 'light');

    // Force the canvas to a large fixed CSS width so drawAnalyticsChart
    // picks it up via getBoundingClientRect() / clientWidth.
    // PDF content width = 182mm @ 96dpi ≈ 688px; we render at 3× for crispness.
    const PDF_CHART_CSS_W = 688;
    const PDF_DPR         = 3;   // 3× oversampling → ~2064px physical width

    // Temporarily override the canvas parent's width measurement by
    // giving the canvas itself explicit dimensions before the draw call.
    // drawAnalyticsChart reads container.getBoundingClientRect().width —
    // the canvas is inside .analytics-canvas-scroll, so we set width on
    // the scroll container too to make getBoundingClientRect reliable.
    const scrollContainer = srcCanvas.parentElement;
    const origScrollW = scrollContainer ? scrollContainer.style.width : '';
    if (scrollContainer) scrollContainer.style.width = PDF_CHART_CSS_W + 'px';

    // Directly size the canvas to the PDF target before drawAnalyticsChart
    // so it uses our dimensions (drawAnalyticsChart will overwrite anyway,
    // but setting these ensures the container measurement is stable).
    srcCanvas.style.width  = PDF_CHART_CSS_W + 'px';
    srcCanvas.style.height = '300px';

    // Temporarily patch devicePixelRatio to force 3× inside drawAnalyticsChart
    const origDPR = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { value: PDF_DPR, configurable: true });

    drawAnalyticsChart(data, renderSubjectAnalytics._pendingPassPct);

    // Restore devicePixelRatio
    if (origDPR) {
      Object.defineProperty(window, 'devicePixelRatio', origDPR);
    } else {
      delete window.devicePixelRatio;
    }

    // Capture the high-res PNG
    const chartDataUrl = srcCanvas.toDataURL('image/png');

    // Restore original canvas & container dimensions, then redraw for screen
    if (scrollContainer) scrollContainer.style.width = origScrollW;
    srcCanvas.width       = origW;
    srcCanvas.height      = origH;
    srcCanvas.style.width  = origStyleW;
    srcCanvas.style.height = origStyleH;

    if (wasDark) document.documentElement.setAttribute('data-theme', 'dark');
    // Redraw the screen chart asynchronously so UI is not blocked
    setTimeout(() => drawAnalyticsChart(data, renderSubjectAnalytics._pendingPassPct), 0);

    // Section header
    setFont('bold', 8.5);
    setTxt(C.textMid);
    pdf.text('CLASS AVERAGE PER SUBJECT', ML, Y + 3.5);
    line(ML, Y + 5, PW - MR, Y + 5, C.border, 0.2);
    Y += 8;

    // Chart image with subtle border
    const chartH_mm = 58;
    roundRect(ML - 1, Y - 1, CW + 2, chartH_mm + 2, 2, C.white, C.border, 0.2);
    pdf.addImage(chartDataUrl, 'PNG', ML, Y, CW, chartH_mm);
    Y += chartH_mm + 7;
  }

  // ── Legend row ────────────────────────────────────────────────────────
  const legendItems = [
    { color: C.primary,  label: 'Good (pass rate >= 85%)' },
    { color: C.accent,   label: 'Warning (15-30% fail)' },
    { color: C.danger,   label: 'High fail rate (>30%)' },
  ];
  legendItems.forEach((li, i) => {
    const lx = ML + i * 62;
    rect(lx, Y, 3, 3, li.color, null);
    txt(li.label, lx + 4.5, Y + 2.5, { size:7, color:C.textMuted });
  });
  Y += 7;

  // ── Table Section ─────────────────────────────────────────────────────
  // Column definitions [label, width, align]
  const cols = [
    { label:'SUBJECT',      w: 54, align:'left'   },
    { label:'AVG %',        w: 18, align:'center'  },
    { label:'MEDIAN %',     w: 20, align:'center'  },
    { label:'HIGHEST %',    w: 22, align:'center'  },
    { label:'LOWEST %',     w: 21, align:'center'  },
    { label:'FAIL RATE',    w: 22, align:'center'  },
    { label:'PASS / FAIL',  w: 25, align:'center'  },
  ];
  // Verify widths sum to CW
  const colSum = cols.reduce((s,c)=>s+c.w,0);
  if (colSum !== CW) cols[0].w += (CW - colSum); // stretch Subject col

  const colX = [];
  let cx = ML;
  cols.forEach(c => { colX.push(cx); cx += c.w; });

  const ROW_H  = 8;
  const HEAD_H = 8;

  // ── Estimate total pages for footer ──
  const rowsPerFirstPage = Math.floor((PH - 16 - Y - HEAD_H - 2) / ROW_H);
  // Continuation pages use the compact header (HEADER_H_COMPACT + 6 mm gap)
  const rowsPerOtherPage = Math.floor((PH - 16 - (HEADER_H_COMPACT + 6) - HEAD_H - 2) / ROW_H);
  const rowCount = data.length;
  let estPages = 1;
  if (rowCount > rowsPerFirstPage) {
    estPages += Math.ceil((rowCount - rowsPerFirstPage) / rowsPerOtherPage);
  }

  // Section header
  setFont('bold', 8.5);
  setTxt(C.textMid);
  pdf.text('SUBJECT BREAKDOWN', ML, Y + 3.5);
  line(ML, Y + 5, PW - MR, Y + 5, C.border, 0.2);
  Y += 8;

  // Draw table header
  const drawTableHeader = () => {
    rect(ML, Y, CW, HEAD_H, C.primary, null);
    cols.forEach((c, i) => {
      setFont('bold', 7);
      setTxt(C.white);
      const tx = c.align === 'center' ? colX[i] + c.w/2 : colX[i] + 2;
      pdf.text(c.label, tx, Y + 5.2, { align: c.align === 'center' ? 'center' : 'left' });
    });
    Y += HEAD_H;
  };

  drawTableHeader();

  // Draw table rows
  const catPaletteIdx = (catName) => {
    const idx = window.categories.findIndex(c => c.name === catName);
    return idx >= 0 ? idx % C.catColors.length : -1;
  };

  data.forEach((d, rowIdx) => {
    // Page break check — need space for one row
    if (Y + ROW_H > PH - 16) {
      drawPageFooter(pdf.internal.getCurrentPageInfo().pageNumber, estPages);
      pdf.addPage();
      drawPageHeader(pdf.internal.getCurrentPageInfo().pageNumber, estPages);
      drawTableHeader();
    }

    const isAlt = rowIdx % 2 === 1;
    const rowBg = isAlt ? C.rowAlt : C.white;

    // Row background
    rect(ML, Y, CW, ROW_H, rowBg, null);
    // Bottom border
    line(ML, Y + ROW_H, ML + CW, Y + ROW_H, C.border, 0.1);

    const cy = Y + ROW_H/2 + 1.5; // vertical center baseline

    // Col 0: Subject name + category badge
    const subjMaxW = cols[0].w - 2;
    setFont('bold', 7.5);
    setTxt(C.text);
    const subjTrunc = pdf.getStringUnitWidth(d.name) * 7.5 / pdf.internal.scaleFactor > subjMaxW - 22
      ? d.name.substring(0, 18) + '...'
      : d.name;
    pdf.text(subjTrunc, colX[0] + 2, cy);

    // Category badge pill
    if (d.category) {
      const ci = catPaletteIdx(d.category);
      const [fg, bg] = ci >= 0 ? C.catColors[ci] : [[107,114,128],[241,245,249]];
      const badgeX = colX[0] + 2 + pdf.getStringUnitWidth(subjTrunc) * 7.5 / pdf.internal.scaleFactor + 1.5;
      const badgeW = Math.min(pdf.getStringUnitWidth(d.category) * 6 / pdf.internal.scaleFactor + 4, 24);
      const badgeY = Y + 1.8;
      const badgeH = ROW_H - 3.6;
      roundRect(badgeX, badgeY, badgeW, badgeH, 1.5, bg, null);
      setFont('normal', 5.5); setTxt(fg);
      pdf.text(d.category, badgeX + badgeW/2, badgeY + badgeH/2 + 1, { align:'center' });
    }

    // Col 1: Avg %
    const avgColor = d.avg >= 70 ? C.success : d.avg >= 55 ? C.warn : C.danger;
    txt(d.avg + '%', colX[1] + cols[1].w/2, cy, { bold:true, size:8, color:avgColor, align:'center' });

    // Col 2: Median %
    txt(d.median + '%', colX[2] + cols[2].w/2, cy, { size:7.5, color:C.textMid, align:'center' });

    // Col 3: Highest % — up triangle + value
    // Triangle: tip at top, base at bottom (up arrow ▲)
    const triSz = 1.3; // half-base width
    const triH  = 1.6; // triangle height
    const h3label = d.highest + '%';
    setFont('normal', 7.5);
    const h3textW = pdf.getStringUnitWidth(h3label) * 7.5 / pdf.internal.scaleFactor;
    const h3totalW = triSz * 2 + 1.5 + h3textW;
    const h3x = colX[3] + cols[3].w / 2 - h3totalW / 2;
    const h3ty = cy - 1.2; // vertical midpoint of triangle
    setFill(C.success);
    pdf.triangle(
      h3x + triSz, h3ty - triH,   // tip (top)
      h3x,         h3ty,           // bottom-left
      h3x + triSz * 2, h3ty,       // bottom-right
      'F'
    );
    txt(h3label, h3x + triSz * 2 + 1.5, cy, { size:7.5, color:C.success });

    // Col 4: Lowest % — down triangle + value (▼)
    const h4label = d.lowest + '%';
    setFont('normal', 7.5);
    const h4textW = pdf.getStringUnitWidth(h4label) * 7.5 / pdf.internal.scaleFactor;
    const h4totalW = triSz * 2 + 1.5 + h4textW;
    const h4x = colX[4] + cols[4].w / 2 - h4totalW / 2;
    const h4ty = cy - triH + 0.8; // vertical midpoint
    setFill(C.danger);
    pdf.triangle(
      h4x,             h4ty,          // top-left
      h4x + triSz * 2, h4ty,          // top-right
      h4x + triSz,     h4ty + triH,   // tip (bottom)
      'F'
    );
    txt(h4label, h4x + triSz * 2 + 1.5, cy, { size:7.5, color:C.danger });

    // Col 5: Fail rate — coloured chip
    const fr = d.failRate;
    const frColor = fr > 30 ? C.danger : fr > 15 ? C.warn : C.success;
    const frBg    = fr > 30 ? [254,242,242] : fr > 15 ? [255,251,235] : [236,253,245];
    const chipW = 13, chipH = 4.5, chipX = colX[5] + cols[5].w/2 - chipW/2, chipY = Y + ROW_H/2 - chipH/2;
    roundRect(chipX, chipY, chipW, chipH, 1.5, frBg, null);
    setFont('bold', 7); setTxt(frColor);
    pdf.text(fr + '%', colX[5] + cols[5].w/2, chipY + chipH/2 + 1.2, { align:'center' });

    // Col 6: Pass/Fail mini bar + count
    const passCount = d.total - d.failCount;
    const pct = d.total > 0 ? passCount / d.total : 0;
    const barX = colX[6] + 2, barY = Y + ROW_H/2 - 1.5;
    const barW = cols[6].w - 14, barH = 3;
    roundRect(barX, barY, barW, barH, 1.5, C.border, null); // track
    if (pct > 0) roundRect(barX, barY, barW * pct, barH, 1.5, frColor, null); // fill
    setFont('normal', 6); setTxt(C.textMuted);
    pdf.text(`${passCount}P / ${d.failCount}F`, barX + barW + 1.5, barY + barH/2 + 1, { align:'left' });

    Y += ROW_H;
  });

  // Outer table border
  // (skip — clean borderless look is more professional)

  Y += 6;

  // ── High-failure alert box (if any) ──────────────────────────────────
  const highFailSubjs = data.filter(d => d.failRate > 30);
  if (highFailSubjs.length) {
    if (Y + 18 > PH - 16) {
      drawPageFooter(pdf.internal.getCurrentPageInfo().pageNumber, estPages);
      pdf.addPage();
      drawPageHeader(pdf.internal.getCurrentPageInfo().pageNumber, estPages);
    }
    roundRect(ML, Y, CW, 4 + highFailSubjs.length * 5 + 4, 2, [254,242,242], C.danger, 0.3);
    txt('! Subjects requiring attention (>30% failure rate)', ML+3, Y+4, { bold:true, size:7.5, color:C.danger });
    highFailSubjs.forEach((d, i) => {
      txt(`- ${d.name}: ${d.failRate}% failed  (${d.failCount} / ${d.total} students)`,
          ML+5, Y+9+i*5, { size:7, color:[153,27,27] });
    });
  }

  // ── Stamp all pages with correct total page count ─────────────────────
  const totalPages = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawPageFooter(p, totalPages);
  }
  // Re-stamp page 1 header with correct total (the header already renders once above)
  // The header total is baked as a string — no whitespace issue, estPages ≈ totalPages

  const safeName = className.replace(/\s+/g, '_');
  pdf.save(`subject-analytics-${safeName}.pdf`);
  window.toast('Analytics PDF downloaded!', 'success');
  window.showDownloadTip && window.showDownloadTip();
}

// ════════════════════════════════════════════
//  END SUBJECT ANALYTICS ENGINE
// ════════════════════════════════════════════

// Refresh Score Distribution + Grade Distribution whenever analytics re-renders
var _origRenderSubjectAnalytics = renderSubjectAnalytics;
renderSubjectAnalytics = function() {
  _origRenderSubjectAnalytics.apply(this, arguments);
  renderScoreDist();
  renderGradeDist();
};

// ════════════════════════════════════════════
//  FEATURE 12 — SCORE DISTRIBUTION HISTOGRAM
// ════════════════════════════════════════════

function _initScoreDistSelect() {
  var sel = document.getElementById('scoreDistSubjectSelect');
  if (!sel) return;
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  sel.innerHTML = '<option value="__overall__">Overall (all subjects)</option>'
    + subjects.map(function(s) {
        return '<option value="' + s.name.replace(/"/g, '&quot;') + '">' + s.name + '</option>';
      }).join('');
}

function renderScoreDist() {
  if (!results.length) return;

  // BUG FIX: read the currently selected value BEFORE reinitialising the
  // <select> HTML, because _initScoreDistSelect() wipes innerHTML which
  // resets .value to the first option (Overall) on every call.
  var sel = document.getElementById('scoreDistSubjectSelect');
  var savedValue = sel ? sel.value : '__overall__';

  _initScoreDistSelect();

  // Restore the previously selected value after the options are rebuilt
  if (sel && savedValue) sel.value = savedValue;

  var target = (sel && sel.value) ? sel.value : '__overall__';
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Collect percentage scores
  var pcts = [];
  if (target === '__overall__') {
    results.forEach(function(r) { pcts.push(r.pct); });
  } else {
    var subj = subjects.find(function(s) { return s.name === target; });
    if (!subj) return;
    results.forEach(function(r) {
      var v = r.subjMarks[target];
      // Exclude null (elective not chosen), undefined, and 'AB' (absent — not sat)
      if (v !== null && v !== undefined && v !== 'AB') {
        pcts.push(subj.max > 0 ? parseFloat(((parseFloat(v) / subj.max) * 100).toFixed(1)) : 0);
      }
    });
  }

  if (!pcts.length) {
    document.getElementById('scoreDistContent').innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">No data for this subject.</div>';
    return;
  }

  // Build 5 bands: 0-20, 20-40, 40-60, 60-80, 80-100
  var bands = [
    { label: '0–20%',  min: 0,  max: 20  },
    { label: '20–40%', min: 20, max: 40  },
    { label: '40–60%', min: 40, max: 60  },
    { label: '60–80%', min: 60, max: 80  },
    { label: '80–100%',min: 80, max: 100 },
  ];
  bands.forEach(function(b) {
    b.count = pcts.filter(function(p) {
      return b.min === 0 ? p <= b.max : p > b.min && p <= b.max;
    }).length;
  });
  // Edge: exactly 100 goes in last band
  var hundredCount = pcts.filter(function(p) { return p === 100; }).length;
  if (hundredCount) {
    bands[4].count = pcts.filter(function(p) { return p > 80; }).length;
  }

  var maxCount = Math.max.apply(null, bands.map(function(b) { return b.count; }));
  var total = pcts.length;
  // Use the correct pass mark: per-subject if a specific subject is selected,
  // or the most common pass mark across all subjects for the overall view.
  var passPct = (function() {
    if (target !== '__overall__' && window.getSubjectPassPct) {
      return window.getSubjectPassPct(target);
    }
    if (window.getSubjectPassPct && subjects && subjects.length) {
      var pctCounts = {};
      subjects.forEach(function(s) {
        var p = window.getSubjectPassPct(s.name);
        pctCounts[p] = (pctCounts[p] || 0) + 1;
      });
      return parseInt(Object.keys(pctCounts).reduce(function(a, b) {
        return pctCounts[a] > pctCounts[b] ? a : b;
      }), 10);
    }
    var sg = [...gradingScale].sort(function(a,b) { return b.minPct - a.minPct; });
    return sg.length > 1 ? sg[sg.length - 2].minPct : 50;
  })();

  // Colour each band based on whether it's above/below/at pass mark
  var bandColors = bands.map(function(b) {
    var midpoint = (b.min + b.max) / 2;
    if (midpoint >= 80) return isDark ? '#3b82f6' : '#1a56db';       // strong — blue
    if (midpoint >= passPct) return isDark ? '#34d399' : '#059669';  // pass — green
    if (midpoint >= 40) return isDark ? '#fcd34d' : '#d97706';       // borderline — amber
    return isDark ? '#f87171' : '#dc2626';                           // fail — red
  });

  var trackBg = isDark ? '#374151' : '#e5e7eb';
  var labelColor = isDark ? '#a0aec0' : '#6b7280';
  var countColor = isDark ? '#e2e8f0' : '#111827';
  var pctTextColor = isDark ? '#718096' : '#9ca3af';

  var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  bands.forEach(function(b, i) {
    var barW = maxCount > 0 ? Math.round((b.count / maxCount) * 100) : 0;
    var pctOfClass = total > 0 ? Math.round((b.count / total) * 100) : 0;
    html += '<div style="display:grid;grid-template-columns:70px 1fr 50px 34px;align-items:center;gap:8px;">'
      + '<span style="font-size:11px;font-weight:600;color:' + labelColor + ';text-align:right;white-space:nowrap;">' + b.label + '</span>'
      + '<div style="height:20px;background:' + trackBg + ';border-radius:6px;overflow:hidden;position:relative;">'
      + '<div style="height:100%;width:' + barW + '%;background:' + bandColors[i] + ';border-radius:6px;transition:width 0.5s ease;"></div>'
      + '</div>'
      + '<span style="font-size:12px;font-weight:700;color:' + countColor + ';text-align:right;">' + b.count + ' <span style="font-weight:500;font-size:10px;color:' + pctTextColor + ';">student' + (b.count !== 1 ? 's' : '') + '</span></span>'
      + '<span style="font-size:11px;color:' + pctTextColor + ';text-align:right;">' + pctOfClass + '%</span>'
      + '</div>';
  });

  // Add a quick insight line
  var maxBand = bands.reduce(function(a, b) { return b.count > a.count ? b : a; }, bands[0]);
  var failBands = bands.filter(function(b) { return (b.min + b.max) / 2 < passPct; });
  var failCount = failBands.reduce(function(a, b) { return a + b.count; }, 0);
  var insight = '';
  if (maxCount > 0) {
    insight = 'Most students (' + maxBand.count + ') scored in the <strong>' + maxBand.label + '</strong> range. ';
    if (failCount > total / 2) {
      insight += '<span style="color:' + (isDark ? '#f87171' : '#dc2626') + ';font-weight:600;">Over half the class scored below pass mark — test may have been too hard.</span>';
    } else if (failCount === 0) {
      insight += '<span style="color:' + (isDark ? '#34d399' : '#059669') + ';font-weight:600;">All students scored above pass mark — excellent result!</span>';
    }
  }

  html += '</div>';
  if (insight) {
    html += '<div style="margin-top:10px;padding:8px 12px;background:' + (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc') + ';border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-muted);line-height:1.5;">' + insight + '</div>';
  }

  document.getElementById('scoreDistContent').innerHTML = html;

  // ── One-way sync: Score Dist → Grade Dist ──────────────────────────────
  // If the user picked a real subject (not Overall), mirror that selection
  // into the Grade Distribution dropdown and re-render it.
  // If Overall is selected, leave Grade Dist exactly as it is.
  var syncBadge = document.getElementById('gradeDistSyncBadge');
  if (target !== '__overall__') {
    var gradeSel = document.getElementById('gradeDistSubjectSelect');
    if (gradeSel) {
      var optionExists = Array.from(gradeSel.options).some(function(o) { return o.value === target; });
      if (optionExists) {
        gradeSel.value = target;
        renderGradeDist();
        // Show "synced" badge on grade dist card
        if (syncBadge) syncBadge.style.display = 'inline-flex';
      }
    }
  } else {
    // Overall selected — hide sync badge, grade dist stays independent
    if (syncBadge) syncBadge.style.display = 'none';
  }
}

// ════════════════════════════════════════════
//  FEATURE 13 — GRADE DISTRIBUTION BY SUBJECT (Analytics tab)
// ════════════════════════════════════════════

function _initGradeDistSelect() {
  var sel = document.getElementById('gradeDistSubjectSelect');
  if (!sel) return;
  sel.innerHTML = subjects.map(function(s) {
    return '<option value="' + s.name.replace(/"/g, '&quot;') + '">' + s.name + '</option>';
  }).join('');
}

function renderGradeDist() {
  var card = document.getElementById('gradeDistCard');
  if (!card) return;
  if (!results.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  // BUG-safe: save selection, rebuild options, restore
  var sel = document.getElementById('gradeDistSubjectSelect');
  var savedVal = sel ? sel.value : '';
  _initGradeDistSelect();
  if (sel && savedVal) sel.value = savedVal;

  var subjName = sel ? sel.value : '';
  if (!subjName && subjects.length) subjName = subjects[0].name;

  var subj = subjects.find(function(s) { return s.name === subjName; });
  if (!subj) { document.getElementById('gradeDistBars').innerHTML = ''; return; }

  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var sortedGrades = [...gradingScale].sort(function(a, b) { return b.minPct - a.minPct; });
  var subjPassPct  = window.getSubjectPassPct(subjName);
  var passPct      = sortedGrades.length > 1 ? sortedGrades[sortedGrades.length - 2].minPct : 50;

  // Calculate each student's grade FOR THIS SUBJECT
  var gradeCounts = {};
  window.gradingScale.forEach(function(g) { gradeCounts[g.label] = 0; });
  var totalWithData = 0;
  var passingCount  = 0;

  results.forEach(function(r) {
    var raw = r.subjMarks[subjName];
    if (raw === null || raw === undefined || raw === 'AB') return; // elective not chosen or absent — skip
    totalWithData++;
    var pct = subj.max > 0 ? (parseFloat(raw) / subj.max) * 100 : 0;
    // Assign grade using getGrade (global function that uses gradingScale)
    var grade = window.getGrade(pct);
    if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
    if (pct >= subjPassPct) passingCount++;
  });

  // Badge: pass rate for this subject
  var badgeEl = document.getElementById('gradeSummaryBadge');
  if (badgeEl) {
    if (totalWithData === 0) {
      badgeEl.innerHTML = '<span style="color:var(--text-muted);">No data</span>';
    } else {
      var pRate = Math.round((passingCount / totalWithData) * 100);
      var badgeColor = pRate >= 80
        ? (isDark ? '#34d399' : '#059669')
        : pRate >= 50
          ? (isDark ? '#fcd34d' : '#d97706')
          : (isDark ? '#f87171' : '#dc2626');
      badgeEl.innerHTML =
        '<span style="color:' + badgeColor + ';font-weight:700;">' + passingCount + '/' + totalWithData + '</span>'
        + ' <span style="color:var(--text-muted);">passed (' + pRate + '%)</span>';
    }
  }

  var barsEl = document.getElementById('gradeDistBars');
  if (!barsEl) return;

  if (totalWithData === 0) {
    barsEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">No marks entered for this subject yet.</div>';
    return;
  }

  // Students below the subject pass mark = "Failed", independent of grade label.
  // This works correctly even on custom scales (e.g. A+/A/B/C/S) where the
  // lowest label is not 'F' — we use the actual pass threshold to determine failure.
  var failedCount = totalWithData - passingCount;

  // Include failedCount so the Failed bar is proportional to the grade bars
  var maxCount = Math.max.apply(null, Object.values(gradeCounts).concat([failedCount]));
  var trackBg  = isDark ? '#374151' : '#f1f5f9';
  var countCol = isDark ? '#e2e8f0' : '#111827';
  var pctCol   = isDark ? '#718096' : '#9ca3af';

  var html = '';
  sortedGrades.forEach(function(g) {
    var count      = gradeCounts[g.label] || 0;
    var barW       = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    var pctOfTotal = totalWithData > 0 ? Math.round((count / totalWithData) * 100) : 0;
    var gradeColor = g.color || '#1a56db';
    // Dim grades that fall below the pass threshold (visual hint — not the same as the Failed row)
    var isPassGrade = g.minPct >= subjPassPct;
    var rowOpacity  = isPassGrade ? '1' : '0.80';

    html += '<div style="display:grid;grid-template-columns:36px 1fr 74px;align-items:center;gap:10px;opacity:' + rowOpacity + ';">'
      // Grade circle pill
      + '<div style="display:flex;justify-content:center;align-items:center;">'
      +   '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;'
      +     'background:' + gradeColor + '22;color:' + gradeColor + ';font-size:12px;font-weight:800;'
      +     'border:2px solid ' + gradeColor + '55;">' + g.label + '</span>'
      + '</div>'
      // Bar track
      + '<div style="position:relative;height:20px;background:' + trackBg + ';border-radius:6px;overflow:hidden;">'
      +   '<div style="height:100%;width:' + barW + '%;background:' + gradeColor + ';border-radius:6px;'
      +     'transition:width 0.5s ease;opacity:' + (count === 0 ? 0.18 : 0.85) + ';"></div>'
      + '</div>'
      // Count + %
      + '<div style="text-align:right;white-space:nowrap;">'
      +   '<span style="font-size:13px;font-weight:700;color:' + countCol + ';">' + count + '</span>'
      +   '<span style="font-size:10px;color:' + pctCol + ';margin-left:4px;">student' + (count !== 1 ? 's' : '') + '</span>'
      +   '<span style="font-size:10px;color:' + pctCol + ';margin-left:4px;">(' + pctOfTotal + '%)</span>'
      + '</div>'
      + '</div>';
  });

  // ── Failed row ── below the grade rows ────────────────────────────────────
  // Shows every student who scored below the subject pass mark, regardless of
  // what the lowest grade label is on the custom grading scale.
  var failColor      = isDark ? '#f87171' : '#dc2626';
  var failBarColor   = isDark ? '#f87171' : '#ef4444';
  var failBarW       = maxCount > 0 ? Math.round((failedCount / maxCount) * 100) : 0;
  var failPctOfTotal = totalWithData > 0 ? Math.round((failedCount / totalWithData) * 100) : 0;
  var dividerColor   = isDark ? 'rgba(248,113,113,0.22)' : 'rgba(220,38,38,0.18)';

  // Thin divider with "Below Pass Mark" label centred
  html += '<div style="margin:10px 0 6px;display:flex;align-items:center;gap:8px;">'
    + '<div style="flex:1;height:1px;background:' + dividerColor + ';"></div>'
    + '<span style="font-size:10px;font-weight:700;letter-spacing:0.05em;color:' + failColor
    +   ';text-transform:uppercase;white-space:nowrap;opacity:0.85;">Below Pass Mark (' + subjPassPct + '%)</span>'
    + '<div style="flex:1;height:1px;background:' + dividerColor + ';"></div>'
    + '</div>';

  // Failed row — identical layout to grade rows, just red and labelled "F"
  html += '<div style="display:grid;grid-template-columns:36px 1fr 74px;align-items:center;gap:10px;">'
    // F grade circle — same structure as every other grade pill
    + '<div style="display:flex;justify-content:center;align-items:center;">'
    +   '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;'
    +     'background:' + failColor + '22;color:' + failColor + ';font-size:12px;font-weight:800;'
    +     'border:2px solid ' + failColor + '55;">F</span>'
    + '</div>'
    // Bar track — same structure as every other grade bar
    + '<div style="position:relative;height:20px;background:' + trackBg + ';border-radius:6px;overflow:hidden;">'
    +   '<div style="height:100%;width:' + failBarW + '%;background:' + failBarColor + ';border-radius:6px;'
    +     'transition:width 0.5s ease;opacity:' + (failedCount === 0 ? 0.18 : 0.85) + ';"></div>'
    + '</div>'
    // Count + % — same structure as every other grade count
    + '<div style="text-align:right;white-space:nowrap;">'
    +   '<span style="font-size:13px;font-weight:700;color:' + countCol + ';">' + failedCount + '</span>'
    +   '<span style="font-size:10px;color:' + pctCol + ';margin-left:4px;">student' + (failedCount !== 1 ? 's' : '') + '</span>'
    +   '<span style="font-size:10px;color:' + pctCol + ';margin-left:4px;">(' + failPctOfTotal + '%)</span>'
    + '</div>'
    + '</div>';

  barsEl.innerHTML = html;
}

// goToStep patch — refresh analytics cards (score dist + grade dist) when entering analytics tab
var _origGoToStep = window.goToStep;
if (typeof _origGoToStep === 'function') {
  window.goToStep = function(step) {
    _origGoToStep.apply(this, arguments);
    if (step === 5) {
      setTimeout(renderScoreDist, 80);
      setTimeout(renderGradeDist, 80);
      setTimeout(renderSubjectAnalytics, 80);
    }
  };
}


// ════════════════════════════════════════════
//  KEYBOARD NAVIGATION ENGINE
// ════════════════════════════════════════════



// ── Window exports ──
Object.assign(window, {
  anlSetView,
  drawAnalyticsChart,
  exportAnalyticsImage,
  exportAnalyticsPDF,
  getSubjectAnalyticsData,
  renderGradeDist,
  renderScoreDist,
  renderSubjectAnalytics,
  roundRect
});
