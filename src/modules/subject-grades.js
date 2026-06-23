// ═══════════════════════════════════════════════════════════════
//  src/modules/subject-grades.js
//  gradingScale definition, getGrade(), getGradeColor(),
//  pctColor(), updateGradeCurrentBadge(), toggleSubjectGradesInline(),
//  Subject Grades Excel export, Subject Grades PDF/JPEG export.
// ═══════════════════════════════════════════════════════════════
// ── Subject Grades Export: Excel ──
function downloadSubjectGradesExcel() {
  if (!results.length || !subjects.length) { window.toast('No data to export', 'error'); return; }
  try {
    const wb = XLSX.utils.book_new();
    const rows = [];
    // Header
    rows.push(['Index', 'Student', ...subjects.map(s => s.name + ' /' + s.max + ' (Grade)'), ...subjects.map(s => s.name + ' %'), 'Overall %', 'Overall Grade']);
    results.forEach(r => {
      const subjectGrades = subjects.map(s => {
        const { grade, pct, absent } = window.getSubjectGradeForStudent(r, s);
        if (absent) return 'AB';
        return pct !== null ? `${grade} (${pct}%)` : '—';
      });
      const subjectPcts = subjects.map(s => {
        const { pct, absent } = window.getSubjectGradeForStudent(r, s);
        if (absent) return 'AB';
        return pct !== null ? pct + '%' : '—';
      });
      rows.push([r.idx, r.student, ...subjectGrades, ...subjectPcts, r.pct + '%', r.grade]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Subject Grades');
    const cn = document.getElementById('className').value || 'Results';
    XLSX.writeFile(wb, cn.replace(/\s+/g, '_') + '_SubjectGrades.xlsx');
    window.toast('Subject Grades Excel downloaded!', 'success');
  } catch(e) { window.toast('Excel export failed: ' + e.message, 'error'); }
}

// ── Subject Grades Export: PDF / JPEG via html2canvas ──
async function exportSubjectGradesAs(format) {
  if (!results.length) { window.toast('No data to export', 'error'); return; }
  window.toast('Generating ' + format.toUpperCase() + '…');

  // Build a clean DOM snapshot
  window.renderSubjectGradesModal(); // ensure fresh
  const body = document.getElementById('subjGradeModalBody');
  const clone = body.cloneNode(true);
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:900px;background:#fff;padding:28px;font-family:Plus Jakarta Sans,sans-serif;font-size:13px;color:#111827;box-sizing:border-box;';
  // Force light-mode on the export container so dark-mode CSS vars never bleed in
  container.setAttribute('data-theme', 'light');

  // Add title header
  const cn = document.getElementById('className').value || '';
  const ay = document.getElementById('academicYear').value || '';
  const header = document.createElement('div');
  header.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:3px;">${document.getElementById('schoolName').value || ''}</div>
    <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:3px;">Subject-wise Grades${cn ? ' — ' + cn : ''}${ay ? ' (' + ay + ')' : ''}</div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1a56db;">Generated: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}</div>`;
  container.appendChild(header);
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 200));
    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
      width: 900, height: container.offsetHeight,
      windowWidth: 900, windowHeight: container.offsetHeight + 200,
      onclone: (doc) => {
        // Always render exports in light mode regardless of user's current theme
        doc.documentElement.setAttribute('data-theme', 'light');
      }
    });
    const fileName = (cn.replace(/\s+/g,'_') || 'Results') + '_SubjectGrades';
    if (format === 'jpeg') {
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName + '.jpg';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
        window.toast('JPEG downloaded!', 'success');
      }, 'image/jpeg', 0.95);
    } else {
      const { jsPDF } = window.jspdf;
      const cW = canvas.width, cH = canvas.height;
      const isLandscape = subjects.length > 6;
      const pW = isLandscape ? 297 : 210, pH = isLandscape ? 210 : 297;
      const margin = 8, printW = pW - margin*2, printH = pH - margin*2;
      const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      const pxPerMm = cW / printW;
      const totalPages = Math.ceil((cH / pxPerMm) / printH);
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const srcY = Math.round(page * printH * pxPerMm);
        const sliceH = Math.min(Math.round(printH * pxPerMm), cH - srcY);
        if (sliceH <= 0) break;
        const sc2 = document.createElement('canvas');
        sc2.width = cW; sc2.height = sliceH;
        const ctx = sc2.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cW,sliceH);
        ctx.drawImage(canvas, 0, srcY, cW, sliceH, 0, 0, cW, sliceH);
        pdf.addImage(sc2.toDataURL('image/jpeg', 0.97), 'JPEG', margin, margin, printW, sliceH/pxPerMm);
      }
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName + '.pdf';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      window.toast('PDF downloaded!', 'success');
    }
  } catch(e) {
    window.toast('Export failed: ' + e.message, 'error');
  } finally {
    if (document.body.contains(container)) document.body.removeChild(container);
  }
}

function exportSubjectGradesPDF()  { exportSubjectGradesAs('pdf');  }
function exportSubjectGradesJPEG() { exportSubjectGradesAs('jpeg'); }

// ════════════════════════════════════════════
//  GRADING SCALE (dynamic)
// ════════════════════════════════════════════
let gradingScale = [
  { label: 'A+', minPct: 90, color: '#059669' },
  { label: 'A',  minPct: 80, color: '#1a56db' },
  { label: 'B',  minPct: 70, color: '#0891b2' },
  { label: 'C',  minPct: 60, color: '#d97706' },
  { label: 'D',  minPct: 35, color: '#f59e0b' },
  { label: 'F',  minPct: 0,  color: '#dc2626' },
];

const GRADE_DEFAULTS = [
  { label: 'A+', minPct: 90, color: '#059669' },
  { label: 'A',  minPct: 80, color: '#1a56db' },
  { label: 'B',  minPct: 70, color: '#0891b2' },
  { label: 'C',  minPct: 60, color: '#d97706' },
  { label: 'D',  minPct: 35, color: '#f59e0b' },
  { label: 'F',  minPct: 0,  color: '#dc2626' },
];

function getGrade(pct) {
  const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  for (const g of sorted) { if (pct >= g.minPct) return g.label; }
  // pct is below every defined threshold — this is a failing mark
  return 'F';
}

function getGradeColor(label) {
  const g = gradingScale.find(x => x.label === label);
  // 'F' is used as a hard-coded fail label whenever a mark falls below the
  // subject pass mark — even on custom grading scales that don't include 'F'.
  // Always render it in red so it stands out clearly as a failing grade.
  if (!g) return label === 'F' ? '#dc2626' : '#6b7280';
  return g.color;
}

function gradeClass(g) {
  if (g === 'A+') return 'grade-aplus';
  if (g === 'A')  return 'grade-a';
  if (g === 'B')  return 'grade-b';
  if (g === 'C')  return 'grade-c';
  if (g === 'D')  return 'grade-d';
  return 'grade-f';
}

function pctColor(pct) {
  const grade = getGrade(pct);
  return getGradeColor(grade);
}

function openGradePanel() {
  renderGradePanel();
  document.getElementById('gradePanelOverlay').classList.add('open');
}

function closeGradePanel() {
  document.getElementById('gradePanelOverlay').classList.remove('open');
  updateGradeCurrentBadge();
}

function renderGradePanel() {
  const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  gradingScale = sorted;

  // Preview bar
  const previewBar = sorted.map((g, i) => {
    const span = i < sorted.length - 1 ? sorted[i].minPct - sorted[i + 1].minPct : sorted[i].minPct;
    const flex = Math.max(span, 4);
    return `<div class="grade-preview-seg" style="flex:${flex};background:${g.color};" title="${g.label}: ≥${g.minPct}%">${span >= 8 ? g.label : ''}</div>`;
  }).join('');

  const rows = sorted.map((g, i) => `
    <div class="grade-row" id="grow-${i}">
      <span class="drag-handle">⠿</span>
      <input type="text" value="${g.label}" maxlength="4"
        placeholder="A+"
        enterkeyhint="next"
        oninput="updateGradeLabel(${i}, this.value)"
        title="Grade label" />
      <span class="grade-min-label">≥</span>
      <input type="number" inputmode="decimal" value="${g.minPct}" min="0" max="100" step="1"
        enterkeyhint="next"
        oninput="updateGradePct(${i}, this.value)"
        onblur="commitGradePct(${i}, this.value)"
        title="Minimum percentage for this grade" />
      <span class="pct-sign">%</span>
      <div class="grade-color-swatch" style="background:${g.color};" title="Pick colour">
        <input type="color" value="${g.color}"
          oninput="updateGradeColor(${i}, this.value, this)" />
      </div>
      <span id="grade-label-preview-${i}" style="font-size:12px;font-weight:700;color:${g.color};min-width:28px;text-align:center;">${g.label}</span>
      ${gradingScale.length > 1 ? `<button class="remove-grade" onclick="removeGradeEntry(${i})" title="Remove grade">×</button>` : ''}
    </div>`).join('');

  document.getElementById('gradePanelBody').innerHTML = `
    <div style="margin-bottom:10px;">
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Grade distribution preview</div>
      <div class="grade-preview-bar" id="gradePreviewBar">${previewBar}</div>
      <div id="gradePillRow" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        ${sorted.map(g => `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}55;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;">${g.label} ≥ ${g.minPct}%</span>`).join('')}
      </div>
    </div>
    <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Grade entries</div>
    <div id="gradeRowsContainer">${rows}</div>
    <div style="margin-top:10px;">
      <button class="btn btn-ghost btn-sm" onclick="addGradeEntry()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
        Add grade
      </button>
    </div>
    <div style="margin-top:16px;padding:12px 14px;background:var(--primary-light);border:1px solid var(--grade-tip-border);border-radius:var(--radius);font-size:12px;color:var(--primary-dark);line-height:1.6;">
      <strong>💡 Tips:</strong> Grades are applied from highest % to lowest. Set the minimum percentage a student needs to earn each grade. The lowest grade applies to everyone below the next threshold. Colour changes are reflected immediately in the results.
    </div>
  `;
}

// Update label in memory and preview span only — NO re-render
function updateGradeLabel(i, val) {
  gradingScale[i].label = val;
  const preview = document.getElementById(`grade-label-preview-${i}`);
  if (preview) preview.textContent = val;
  refreshPreviewBarOnly();
}

// Update pct in memory only — NO re-render while typing
function updateGradePct(i, val) {
  const num = parseFloat(val);
  if (!isNaN(num)) gradingScale[i].minPct = num;
  refreshPreviewBarOnly();
}

// Only re-render after user finishes typing (blur)
function commitGradePct(i, val) {
  const num = parseFloat(val);
  if (!isNaN(num)) gradingScale[i].minPct = Math.max(0, Math.min(100, num));
  gradingScale.sort((a, b) => b.minPct - a.minPct);
  renderGradePanel();
}

// Update color swatch + preview bar only — NO re-render
function updateGradeColor(i, val, el) {
  gradingScale[i].color = val;
  const swatch = el.closest('.grade-color-swatch');
  if (swatch) swatch.style.background = val;
  const labelPreview = document.getElementById(`grade-label-preview-${i}`);
  if (labelPreview) labelPreview.style.color = val;
  refreshPreviewBarOnly();
}

// Lightweight preview bar + pill row update (no full re-render)
function refreshPreviewBarOnly() {
  const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  const bar = document.getElementById('gradePreviewBar');
  if (bar) {
    bar.innerHTML = sorted.map((g, i) => {
      const span = i < sorted.length - 1 ? sorted[i].minPct - sorted[i + 1].minPct : sorted[i].minPct;
      const flex = Math.max(span, 4);
      return `<div class="grade-preview-seg" style="flex:${flex};background:${g.color};" title="${g.label}: ≥${g.minPct}%">${span >= 8 ? g.label : ''}</div>`;
    }).join('');
  }
  const pills = document.getElementById('gradePillRow');
  if (pills) {
    pills.innerHTML = sorted.map(g =>
      `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}55;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;">${g.label} ≥ ${g.minPct}%</span>`
    ).join('');
  }
}

function sortAndRefresh() {
  gradingScale.sort((a, b) => b.minPct - a.minPct);
  renderGradePanel();
}

function refreshGradePreview() {
  refreshPreviewBarOnly();
}

function addGradeEntry() {
  const minPcts = gradingScale.map(g => g.minPct);
  const newMin  = Math.max(0, Math.min(...minPcts) - 10);
  gradingScale.push({ label: '?', minPct: newMin, color: '#6b7280' });
  sortAndRefresh();
  window.toast('New grade entry added');
}

function removeGradeEntry(i) {
  if (gradingScale.length <= 1) { window.toast('Must have at least one grade', 'error'); return; }
  gradingScale.splice(i, 1);
  sortAndRefresh();
  window.toast('Grade removed');
}

function resetGradeDefaults() {
  if (!confirm('Reset grading scale to defaults (A+ / A / B / C / D / F)?')) return;
  gradingScale = GRADE_DEFAULTS.map(g => ({ ...g }));
  renderGradePanel();
  window.toast('Grading scale reset to defaults');
}

function updateGradeCurrentBadge() {
  const el = document.getElementById('currentGradeBadges');
  if (!el) return;
  const sorted = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  el.innerHTML = sorted.map(g =>
    `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}44;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700;">${g.label}≥${g.minPct}%</span>`
  ).join('');
}


// ════════════════════════════════════════════
//  SHARE / EXPORT  (PDF & JPEG)
// ════════════════════════════════════════════
let shareSelectedFormat = null;
let shareBlob = null;   // holds generated image blob for native share

function openShareModal() {
  if (!results.length) { window.toast('Calculate results first', 'error'); return; }
  shareSelectedFormat = null;
  shareBlob = null;
  // reset UI
  document.querySelectorAll('.share-option').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.share-option-check').forEach(el => el.classList.remove('checked'));
  document.getElementById('shareProgress').style.display = 'none';
  document.getElementById('sharePreviewWrap').style.display = 'none';
  document.getElementById('shareGenerateBtn').disabled = true;
  document.getElementById('shareModalOverlay').classList.add('open');
}

function closeShareModal() {
  document.getElementById('shareModalOverlay').classList.remove('open');
}

function selectShareFormat(fmt) {
  shareSelectedFormat = fmt;
  document.querySelectorAll('.share-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`opt-${fmt}`).classList.add('selected');
  document.getElementById('shareGenerateBtn').disabled = false;
  document.getElementById('sharePreviewWrap').style.display = 'none';
  document.getElementById('shareProgress').style.display = 'none';
}

function setProgress(pct, text) {
  document.getElementById('shareProgress').style.display = '';
  document.getElementById('shareProgressBar').style.width = pct + '%';
  document.getElementById('shareProgressText').textContent = text;
}

async function generateExport() {
  if (!shareSelectedFormat) return;
  const incHeader  = document.getElementById('inc-header').checked;
  const incMetrics = document.getElementById('inc-metrics').checked;
  const incGrading = document.getElementById('inc-grading').checked;
  const incSubjGrades = document.getElementById('inc-subj-grades').checked;

  document.getElementById('sharePreviewWrap').style.display = 'none';
  setProgress(8, 'Calculating best layout…');

  const nSubj    = subjects.length;
  const nStudent = results.length;

  // ── True content-driven auto-fit layout ──────────────────────────
  // PDF output is always A3 landscape (420 × 297 mm) — this gives the most
  // usable width for wide result sheets and prevents row compression on
  // classes with many students.  JPEG output expands as wide as needed.
  //
  // A3 landscape at 96 dpi (CSS pixels):
  //   Usable width (16 mm total margins, 8 mm each side): ≈ 1528 px
  //   Usable height: ≈ 1062 px
  //
  // We always use A3 landscape for PDF — no orientation toggle needed.
  // If even A3 is too narrow for the minimum column width we scale down.

  const PADDING      = 48;  // 24 px each side of the wrap div
  const MARGIN_PX    = 60;  // 2 × 8 mm margins converted to ~96-dpi px

  // Fixed columns: rank(44)+index(52)+name(160)+total(62)+avg(58)
  const FIXED_W      = 376;
  // Minimum / maximum subject column width we're happy to render at
  const MIN_SUBJ_W   = 34;
  const MAX_SUBJ_W   = 90;
  const IDEAL_SUBJ_W = 70;  // aim for this when space allows

  // A3 landscape usable width in CSS px — 420 mm − 2×8 mm margins = 404 mm ≈ 1528 px
  const A3_LAND_W  = Math.round((420 - 16) * (96 / 25.4));  // ≈ 1528 px

  // PDF is always A3 landscape
  const pdfLandscape = true;
  const a4UsableW = A3_LAND_W;  // variable kept for compatibility with zoom logic below

  // Ideal subject column width
  function calcSubW(usableW) {
    const rem = usableW - FIXED_W - PADDING;
    return Math.max(MIN_SUBJ_W, Math.min(MAX_SUBJ_W, Math.floor(rem / Math.max(nSubj, 1))));
  }

  // Font size scales with column width
  function calcFont(sw) {
    if (sw >= 70) return 12;
    if (sw >= 56) return 11;
    if (sw >= 44) return 10;
    return 9;
  }

  const isJpeg = shareSelectedFormat === 'jpeg';

  let renderW, subW, fontSize, pdfZoom;

  if (isJpeg) {
    // JPEG: expand as wide as needed for ideal columns, capped at 1800 px
    const jpegUsable = Math.max(900, Math.min(1800, FIXED_W + nSubj * IDEAL_SUBJ_W + PADDING));
    subW     = calcSubW(jpegUsable);
    fontSize = calcFont(subW);
    renderW  = jpegUsable + PADDING;
    pdfZoom  = 1;
  } else {
    // PDF: fit everything into the A3 landscape page
    subW = calcSubW(A3_LAND_W);
    const naturalContentW = FIXED_W + nSubj * subW + PADDING;

    if (naturalContentW <= A3_LAND_W + PADDING) {
      // Fits comfortably — render at 1:1 with A3
      renderW  = A3_LAND_W + PADDING;
      pdfZoom  = 1;
    } else {
      // Still too wide even at MIN_SUBJ_W — zoom out the canvas so the full
      // table shrinks to exactly fit the A3 printable width.
      renderW  = naturalContentW;
      pdfZoom  = A3_LAND_W / (naturalContentW - PADDING);
      // Recompute font at MIN so text doesn't bleed outside cells
      subW     = MIN_SUBJ_W;
    }
    fontSize = calcFont(subW);
  }

  const zoomPct = isJpeg ? '' : (pdfZoom < 0.999 ? `, scaled ${Math.round(pdfZoom*100)}%` : '');
  setProgress(15, `Building (${nStudent} students × ${nSubj} subjects, ${isJpeg?'JPEG':'PDF A3 landscape'+zoomPct})…`);

  const wrap = buildExportDOM(incHeader, incMetrics, incGrading, renderW, subW, fontSize, incSubjGrades);

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:'+renderW+'px;overflow:visible;z-index:-1;';
  // Force light-mode on the export container so dark-mode CSS vars never bleed in
  container.setAttribute('data-theme', 'light');
  wrap.style.cssText = 'width:'+renderW+'px;background:#fff;font-family:Plus Jakarta Sans,sans-serif;padding:24px;color:#111827;font-size:'+fontSize+'px;line-height:1.5;box-sizing:border-box;display:block;';
  container.appendChild(wrap);
  document.body.appendChild(container);

  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 300));

    const fullW = wrap.offsetWidth  || renderW;
    const fullH = wrap.offsetHeight;

    setProgress(35, 'Rendering canvas…');

    const canvasScale = isJpeg ? 2 : 1.8;
    const canvas = await html2canvas(wrap, {
      scale: canvasScale,
      useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
      width: fullW, height: fullH,
      windowWidth: renderW, windowHeight: fullH + 200,
      scrollX: 0, scrollY: 0, x: 0, y: 0,
      onclone: (doc, el) => {
        // Always render exports in light mode regardless of user's current theme
        doc.documentElement.setAttribute('data-theme', 'light');
        el.style.position = 'static';
        el.style.height   = fullH + 'px';
        el.style.overflow = 'visible';
        el.style.width    = renderW + 'px';
      }
    });

    setProgress(75, 'Processing…');
    if (isJpeg) await handleJpeg(canvas);
    else {
      // ── offsetTopRelTo: stable position measurement for off-screen elements ──
      // getBoundingClientRect() is unreliable when the container is at left:-9999px.
      // This helper walks the offsetParent chain to get a viewport-independent
      // top position relative to a given ancestor element.
      function offsetTopRelTo(el, ancestor) {
        let top = 0;
        let cur = el;
        while (cur && cur !== ancestor) {
          top += cur.offsetTop;
          cur  = cur.offsetParent;
        }
        return top;
      }

      // ── Capture just the table header (<thead>) so it can be stamped on
      //    every continuation page — this fixes the "no column headers on
      //    page 2+" bug when many students span multiple PDF pages. ──
      let theadCanvas = null;
      try {
        const tableEl = wrap.querySelector('table');
        const theadEl = tableEl ? tableEl.querySelector('thead') : null;
        if (theadEl) {
          // ── Capture thead by cropping from the already-rendered main canvas ──
          // This guarantees perfect column-width alignment because the thead
          // pixels come directly from the same render, not a separate pass.
          // A separate re-render of just the <thead> causes column widths to
          // differ because table-layout:fixed resolves widths differently when
          // there are no tbody rows to constrain the layout.
          // Use offsetTop (not getBCR) — reliable for off-screen elements
          const theadTopCSS = offsetTopRelTo(theadEl, wrap);
          const theadTopPx  = Math.round(theadTopCSS * canvasScale);
          const theadBotPx  = Math.round((theadTopCSS + theadEl.offsetHeight) * canvasScale);
          const cropH       = Math.max(1, theadBotPx - theadTopPx);

          theadCanvas = document.createElement('canvas');
          theadCanvas.width  = canvas.width;
          theadCanvas.height = cropH;
          const tCtx = theadCanvas.getContext('2d');
          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, theadCanvas.width, cropH);
          tCtx.drawImage(canvas, 0, theadTopPx, canvas.width, cropH, 0, 0, canvas.width, cropH);
        }
      } catch(theadErr) {
        console.warn('Could not capture thead for repeat header:', theadErr);
        theadCanvas = null;
      }

      // ── Collect tbody row boundaries (canvas-px) for smart page-break snapping ──
      // Measure every <tr> in the tbody relative to wrap so handlePdf can snap
      // page breaks to row boundaries — prevents a student row being split
      // across two pages.
      //
      let rowBoundaries = null;
      try {
        const tableEl2 = wrap.querySelector('table');
        const tbodyEl  = tableEl2 ? tableEl2.querySelector('tbody') : null;
        if (tbodyEl) {
          rowBoundaries = Array.from(tbodyEl.querySelectorAll('tr')).map(tr => {
            const top    = offsetTopRelTo(tr, wrap);
            const bottom = top + tr.offsetHeight;
            return {
              top:    Math.round(top    * canvasScale),
              bottom: Math.round(bottom * canvasScale),
            };
          });
        }
      } catch(rbErr) {
        console.warn('Could not measure row boundaries:', rbErr);
        rowBoundaries = null;
      }

      // ── Measure grading scale position so handlePdf can keep it on the
      //    last data page instead of forcing a wasteful extra page. ──
      let gradingScaleTopPx = -1;
      try {
        const gsEl = wrap.querySelector('#export-grading-scale');
        if (gsEl) {
          gradingScaleTopPx = Math.round(offsetTopRelTo(gsEl, wrap) * canvasScale);
        }
      } catch(gsErr) { /* non-fatal */ }

      await handlePdf(canvas, renderW, pdfLandscape, theadCanvas, pdfZoom, rowBoundaries, gradingScaleTopPx);
    }

    setProgress(100, 'Done!');
    setTimeout(() => { document.getElementById('shareProgress').style.display = 'none'; }, 800);
  } catch(e) {
    console.error('Export error:', e);
    window.toast('Export failed: ' + e.message, 'error');
    document.getElementById('shareProgress').style.display = 'none';
  } finally {
    if (document.body.contains(container)) document.body.removeChild(container);
  }
}


async function handleJpeg(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      shareBlob = blob;
      const blobUrl = URL.createObjectURL(blob);
      document.getElementById('sharePreviewImg').src = blobUrl;
      document.getElementById('sharePreviewWrap').style.display = '';

      if (navigator.share && navigator.canShare) {
        document.getElementById('shareNativeBtn').style.display = '';
      } else {
        document.getElementById('shareNativeBtn').style.display = 'none';
      }
      const cn = document.getElementById('className').value || 'Results';
      document.getElementById('shareDownloadBtn').textContent = '⬇ Download JPEG';
      document.getElementById('shareDownloadBtn').onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = cn.replace(/\s+/g,'_') + '_Results.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      };
      setProgress(100, 'JPEG ready — all students included!');
      resolve();
    }, 'image/jpeg', 0.95);
  });
}

async function handlePdf(canvas, renderW, pdfLandscape, theadCanvas, pdfZoom, rowBoundaries, gradingScaleTopPx) {
  const { jsPDF } = window.jspdf;
  const canvasW_px = canvas.width;
  const canvasH_px = canvas.height;

  const isLandscape = !!pdfLandscape;
  // PDF is always A3 landscape — 420 × 297 mm.
  // The isLandscape flag is kept for future flexibility but will always be true
  // from generateExport(); the constants below are set accordingly.
  const pageW_mm = 420;   // A3 width
  const pageH_mm = 297;   // A3 height
  const margin_mm  = 8;
  const printW_mm  = pageW_mm - margin_mm * 2;
  const printH_mm  = pageH_mm - margin_mm * 2;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  // ── Scale canvas → PDF page ──────────────────────────────────────────────
  // canvasW_px covers renderW CSS-px of content (at html2canvas scale factor).
  // printW_mm is the A3 printable width in mm.
  // pdfZoom < 1 means the content was wider than A3 so we zoomed-out the
  // render; the canvas already contains the full width, we just map it
  // onto the printable area which effectively scales everything down.
  //
  // pxPerMm = how many canvas pixels correspond to 1 mm on the page.
  // When pdfZoom == 1 this equals canvasW_px / printW_mm (unchanged).
  // When pdfZoom < 1 the content is wider, so pxPerMm is proportionally
  // larger — meaning each mm of paper covers more canvas pixels, achieving
  // the zoom-out effect.
  const zoom      = (pdfZoom && pdfZoom > 0 && pdfZoom < 1) ? pdfZoom : 1;
  const pxPerMm   = canvasW_px / (printW_mm * zoom);
  const usableH_mm = printH_mm;

  // ── Repeated header support ──────────────────────────────────────────────
  // When the export spans multiple pages the thead must appear at the top of
  // every continuation page.  theadCanvas was rendered at the same scale as
  // the main canvas so we can composite it directly.
  // theadH_px  : height of the thead strip in canvas pixels
  // theadH_mm  : same, converted to PDF mm   (used for placement)
  // bodyOffsetH_mm: on pages 2+, body content starts this many mm below the top
  //                 margin so it doesn't overlap the repeated header.
  // A small separator gap (2 mm) is added between thead and body for clarity.
  const HEADER_GAP_MM = 2;
  const theadH_px    = (theadCanvas && theadCanvas.height > 0) ? theadCanvas.height : 0;
  const theadH_mm    = theadH_px / pxPerMm;
  const bodyOffsetH_mm = theadH_mm > 0 ? theadH_mm + HEADER_GAP_MM : 0;

  // Effective usable body height per continuation page (reduced by the header)
  const contBodyH_mm = usableH_mm - bodyOffsetH_mm;

  // ── Smart row-aware page-break helper ────────────────────────────────────
  // Given a canvas srcY (start of current page) and the max pixels we can fit
  // (budgetH_px), snap the cut point BACK to the bottom of the last row that
  // fully fits — so no student row is ever sliced across a page boundary.
  // Falls back to the raw budget if rowBoundaries is unavailable.
  function snapToRowBoundary(srcY_px, budgetH_px) {
    if (!rowBoundaries || rowBoundaries.length === 0) return budgetH_px;
    const cutAt = srcY_px + budgetH_px;  // naive cut point in canvas-px
    // Find the last row whose bottom edge is at or before cutAt
    let bestBottom = 0;
    for (const row of rowBoundaries) {
      if (row.top < cutAt && row.bottom <= cutAt) {
        bestBottom = row.bottom;           // this row fits completely
      } else if (row.top >= cutAt) {
        break;                             // all subsequent rows are beyond cut
      }
    }
    // If we found at least one row that fits, use its bottom as the cut point.
    // Otherwise fall back to the budget (edge case: single very-tall row).
    const snapped = bestBottom > srcY_px ? bestBottom - srcY_px : budgetH_px;
    return Math.min(snapped, canvasH_px - srcY_px);
  }

  // ── Grading-scale flow-back logic ───────────────────────────────────────
  // If the grading scale sits at a known canvas position, check whether it
  // would end up alone on the final page (preceded only by a repeated column
  // header).  If so we want to either:
  //   (a) pull it back onto the previous page if there is enough blank space, OR
  //   (b) render it on the final page WITHOUT the repeated column header
  //       (column headers make no sense without data rows).
  //
  // We detect "alone on a page" by checking whether gradingScaleTopPx falls
  // within the LAST page slice — and that slice contains no data rows.
  // We pre-calculate where each page naturally breaks so we can look ahead.
  //
  // Build the list of natural page-break srcY values first (dry-run):
  const _pageBreaks = []; // srcY_px at the start of each page
  {
    let _y = 0, _pi = 0;
    while (_y < canvasH_px) {
      _pageBreaks.push(_y);
      const _isFirst = _pi === 0;
      const _bH_mm   = _isFirst ? usableH_mm : contBodyH_mm;
      const _bH_px   = Math.round(_bH_mm * pxPerMm);
      const _slice   = snapToRowBoundary(_y, Math.min(_bH_px, canvasH_px - _y));
      if (_slice <= 0) break;
      _y  += _slice;
      _pi++;
    }
  }

  // Determine if the last page would ONLY contain the grading scale
  // (i.e. gradingScaleTopPx >= start of that last page).
  const _hasGrading = gradingScaleTopPx > 0;
  let _gradingOnlyLastPage = false;
  let _gradingFitsOnPrev   = false;
  if (_hasGrading && _pageBreaks.length >= 2) {
    const lastPageStart  = _pageBreaks[_pageBreaks.length - 1];
    const prevPageStart  = _pageBreaks[_pageBreaks.length - 2];
    // "grading alone on last page" means grading scale starts on last page
    // AND there are no student rows that also start on that page.
    const hasRowsOnLastPage = rowBoundaries
      ? rowBoundaries.some(r => r.top >= lastPageStart)
      : true; // if we can't tell, be conservative
    if (gradingScaleTopPx >= lastPageStart && !hasRowsOnLastPage) {
      _gradingOnlyLastPage = true;
      // Can we fit the grading scale onto the previous page?
      const prevPageH_mm   = prevPageStart === 0 ? usableH_mm : contBodyH_mm;
      const prevPageH_px   = Math.round(prevPageH_mm * pxPerMm);
      const prevPageEnd    = prevPageStart + prevPageH_px;
      const gradingH_px    = canvasH_px - gradingScaleTopPx;
      // Space remaining on prev page after its last row
      const lastRowBottom  = rowBoundaries && rowBoundaries.length > 0
        ? rowBoundaries[rowBoundaries.length - 1].bottom
        : prevPageEnd;
      const spaceLeft_px   = prevPageEnd - lastRowBottom;
      if (gradingH_px <= spaceLeft_px) {
        _gradingFitsOnPrev = true;
      }
    }
  }

  // Calculate cumulative "content rows" height consumed across all pages:
  // page 0 : full usableH_mm   (no repeated header on the first page)
  // page N : contBodyH_mm       (header stamped, less body room)
  // We iterate until we've consumed all canvasH_px.
  let srcY_px  = 0;
  let pageIndex = 0;

  while (srcY_px < canvasH_px) {
    if (pageIndex > 0) pdf.addPage();

    const isFirstPage    = pageIndex === 0;
    const isLastPage     = (pageIndex === _pageBreaks.length - 1);

    // If the grading scale fits on the previous page, skip the last page
    // entirely — it will be composited onto the previous page's slice below.
    if (isLastPage && _gradingOnlyLastPage && _gradingFitsOnPrev) break;

    const bodyH_mm    = isFirstPage ? usableH_mm : contBodyH_mm;
    const bodyH_px    = Math.round(bodyH_mm * pxPerMm);

    // If grading fits on prev page, extend previous page slice to include it
    const extendForGrading = (!isLastPage && (pageIndex === _pageBreaks.length - 2) && _gradingFitsOnPrev && _gradingOnlyLastPage);
    const rawBudget   = extendForGrading
      ? (canvasH_px - srcY_px)                        // include all remaining canvas
      : Math.min(bodyH_px, canvasH_px - srcY_px);

    // Snap to row boundary so no student row is split across pages
    // (don't snap when we're intentionally including the grading scale trailer)
    const sliceH_px   = extendForGrading
      ? rawBudget
      : snapToRowBoundary(srcY_px, rawBudget);
    if (sliceH_px <= 0) break;

    // On the final page: if grading scale is alone, suppress the repeated
    // column header (it makes no sense without data rows beneath it).
    const suppressHeader = isLastPage && _gradingOnlyLastPage && !_gradingFitsOnPrev;

    if (!isFirstPage && theadCanvas && theadH_px > 0 && !suppressHeader) {
      // ── Draw repeated column header at the top of this page ──
      // Scale theadCanvas width to match printW (it may differ slightly due
      // to the separate render pass); we draw it at the same printW_mm.
      const theadSlice = document.createElement('canvas');
      theadSlice.width  = theadCanvas.width;
      theadSlice.height = theadH_px;
      const tCtx = theadSlice.getContext('2d');
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, theadSlice.width, theadH_px);
      tCtx.drawImage(theadCanvas, 0, 0);
      const theadSliceH_mm = theadH_px / pxPerMm;
      pdf.addImage(theadSlice.toDataURL('image/jpeg', 0.98), 'JPEG', margin_mm, margin_mm, printW_mm, theadSliceH_mm);

      // Draw a subtle blue separator line beneath the repeated header
      pdf.setDrawColor(26, 86, 219); // --primary blue
      pdf.setLineWidth(0.4);
      pdf.line(margin_mm, margin_mm + theadSliceH_mm + 0.5, margin_mm + printW_mm, margin_mm + theadSliceH_mm + 0.5);
      pdf.setDrawColor(0, 0, 0); // reset

      // ── Draw the body slice below the header ──
      const bodySlice = document.createElement('canvas');
      bodySlice.width  = canvasW_px;
      bodySlice.height = sliceH_px;
      const bCtx = bodySlice.getContext('2d');
      bCtx.fillStyle = '#ffffff';
      bCtx.fillRect(0, 0, canvasW_px, sliceH_px);
      bCtx.drawImage(canvas, 0, srcY_px, canvasW_px, sliceH_px, 0, 0, canvasW_px, sliceH_px);
      const bodyTopY_mm = margin_mm + theadSliceH_mm + HEADER_GAP_MM;
      const bodySliceH_mm = sliceH_px / pxPerMm;
      pdf.addImage(bodySlice.toDataURL('image/jpeg', 0.97), 'JPEG', margin_mm, bodyTopY_mm, printW_mm, bodySliceH_mm);
    } else {
      // ── First page OR suppressed-header page (grading scale alone) ──
      // Render the slice directly at the top margin with no repeated header.
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width  = canvasW_px;
      sliceCanvas.height = sliceH_px;
      const ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW_px, sliceH_px);
      ctx.drawImage(canvas, 0, srcY_px, canvasW_px, sliceH_px, 0, 0, canvasW_px, sliceH_px);
      const sliceH_mm = sliceH_px / pxPerMm;
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', margin_mm, margin_mm, printW_mm, sliceH_mm);
    }

    srcY_px  += sliceH_px;
    pageIndex++;
  }

  const totalPages = pageIndex;

  // ── Add "Page X / Y" footer on every page for orientation ──
  if (totalPages > 1) {
    const cn_footer = document.getElementById('className').value || 'Results';
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      const footerY = pageH_mm - margin_mm + 4;
      pdf.text(cn_footer + ' — Page ' + p + ' of ' + totalPages, pageW_mm / 2, footerY, { align: 'center' });
    }
    pdf.setTextColor(0, 0, 0);
  }

  const cn      = document.getElementById('className').value || 'Results';
  const pdfBlob = pdf.output('blob');
  shareBlob     = pdfBlob;

  // Preview thumbnail (first ~2400px of canvas)
  const previewH = Math.min(canvasH_px, 2400);
  const prev = document.createElement('canvas');
  prev.width  = canvasW_px;
  prev.height = previewH;
  const pctx = prev.getContext('2d');
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, canvasW_px, previewH);
  pctx.drawImage(canvas, 0, 0, canvasW_px, previewH, 0, 0, canvasW_px, previewH);
  prev.toBlob(previewBlob => {
    const previewUrl = URL.createObjectURL(previewBlob);
    document.getElementById('sharePreviewImg').src = previewUrl;
  }, 'image/jpeg', 0.80);
  document.getElementById('sharePreviewWrap').style.display = '';

  const orient = isLandscape ? ' (landscape)' : '';
  if (navigator.share && navigator.canShare) {
    document.getElementById('shareNativeBtn').style.display = '';
  } else {
    document.getElementById('shareNativeBtn').style.display = 'none';
  }
  document.getElementById('shareDownloadBtn').textContent = '\u2b07 Download PDF (' + totalPages + ' page' + (totalPages>1?'s':'') + orient + ')';
  document.getElementById('shareDownloadBtn').onclick = () => {
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cn.replace(/\s+/g,'_') + '_Results.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    if (typeof onExportComplete === 'function') window.onExportComplete();
  };
  setProgress(100, 'PDF ready \u2014 ' + totalPages + ' page' + (totalPages>1?'s':'') + ', all ' + results.length + ' students, ' + subjects.length + ' subjects!');
}

async function triggerNativeShare() {
  if (!shareBlob) return;
  const cn   = document.getElementById('className').value || 'Results';
  const ext  = shareSelectedFormat === 'pdf' ? 'pdf' : 'jpg';
  const mime = shareSelectedFormat === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const file = new File([shareBlob], cn.replace(/\s+/g,'_') + '_Results.' + ext, { type: mime });
  try {
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: cn + ' Results' });
      window.toast('Shared successfully!', 'success');
    } else { document.getElementById('shareDownloadBtn').click(); }
  } catch(e) { if (e.name !== 'AbortError') window.toast('Share failed: ' + e.message, 'error'); }
}

// Triggers the share download button's assigned onclick handler.
// After generateExport() runs, handleJpeg/handlePdf assign a real download closure.
function triggerShareDownload() {
  const btn = document.getElementById('shareDownloadBtn');
  if (!btn) return;
  // After generateExport() runs, handleJpeg/handlePdf replace onclick with a real
  // download closure.  If onclick is still pointing here we haven't generated yet.
  if (typeof btn.onclick === 'function' && btn.onclick !== triggerShareDownload) {
    btn.onclick();
  } else {
    window.toast('Click "Generate" first to build the export', 'info');
  }
}


function buildExportDOM(incHeader, incMetrics, incGrading, renderW, subjectColW, baseFontSize, incSubjGrades) {
  renderW      = renderW      || 900;
  subjectColW  = subjectColW  || 75;
  baseFontSize = baseFontSize || 13;

  const fs     = baseFontSize;          // base font size
  const fsSm   = Math.max(fs - 3, 7);  // small text
  const fsMd   = fs;                    // medium
  const fsHd   = Math.min(fs + 1, 14); // header text
  // Comfortable floor: at high subject counts (≥20) subjectColW shrinks a lot,
  // and the old 4px/0.08 floor let cell padding collapse to near-nothing —
  // that's what reads as "compressed" rows. Raised floor + ratio keeps a
  // minimum breathing room no matter how many subjects are on the sheet.
  const pad    = Math.max(5, Math.round(subjectColW * 0.10));  // cell padding scales with col
  const cn = document.getElementById('className').value || '';
  const ay = document.getElementById('academicYear').value || '';
  const tn = document.getElementById('teacherName').value || '';
  const sn = document.getElementById('schoolName').value || '';
  const totalMax = window.getGlobalMax();
  const sortedGrades = [...gradingScale].sort((a, b) => b.minPct - a.minPct);
  // Use the actual configured pass mark — global default or any per-subject
  // overrides set via the Pass Marks panel — instead of guessing it from the
  // grading-scale tiers. Mirrors the same "modal pass mark across subjects"
  // logic Analytics already uses (analytics.js), so this PDF, the Pass Rate
  // stat below, and Analytics always agree, even after a custom pass mark
  // is applied to some or all subjects.
  const passPct = (() => {
    if (window.getSubjectPassPct && subjects && subjects.length) {
      const counts = {};
      subjects.forEach(s => {
        const p = window.getSubjectPassPct(s.name);
        counts[p] = (counts[p] || 0) + 1;
      });
      return parseInt(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b), 10);
    }
    return sortedGrades.length > 1 ? sortedGrades[sortedGrades.length - 2].minPct : 50;
  })();
  const pcts = results.map(r => r.pct);
  const classAvg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const passing = results.filter(r => r.pct >= passPct).length;

  const wrap = document.createElement('div');
  let html = '';

  if (incHeader) {
    // ── School Branding integration ──
    const _br = window.getBrandingForExport();
    const _bColor = (_br && _br.primaryColor) ? _br.primaryColor : '#1a56db';
    const _bSchool = (_br && _br.schoolFullName) ? _br.schoolFullName : (sn || '');
    const _bAddr   = (_br && _br.showAddress && _br.address) ? _br.address : '';
    const _bTerm   = (_br && _br.termLabel)   ? _br.termLabel   : '';
    const _bPrinc  = (_br && _br.principal)   ? _br.principal   : '';
    const _bSig    = _br && _br.showSig;
    const _bLogo   = (_br && _br.logoDataUrl) ? _br.logoDataUrl : null;
    const _dateStr = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});

    // Meta line components
    let _metaParts = [];
    if (tn)       _metaParts.push('Class Teacher: ' + tn);
    if (_bTerm)   _metaParts.push(_bTerm);
    if (_bPrinc)  _metaParts.push('Principal: ' + _bPrinc);

    // Header: flex row with optional logo + text + coloured bar
    html += '<div style="margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:3px solid ' + _bColor + ';">'
      + (_bLogo
          ? '<img src="' + _bLogo + '" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;background:#fff;flex-shrink:0;" alt="School logo" />'
          : '')
      + '<div style="flex:1;min-width:0;">'
      + (_bSchool ? '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:' + _bColor + ';margin-bottom:3px;">' + _bSchool + '</div>' : '')
      + '<div style="font-size:22px;font-weight:800;color:#111827;line-height:1.15;">Result Sheet — ' + cn + (ay ? ' (' + ay + ')' : '') + '</div>'
      + (_metaParts.length ? '<div style="font-size:12.5px;color:#6b7280;margin-top:4px;">' + _metaParts.join(' &nbsp;&bull;&nbsp; ') + '</div>' : '')
      + (_bAddr ? '<div style="font-size:11px;color:#9ca3af;margin-top:3px;">' + _bAddr + '</div>' : '')
      + '</div>'
      + '</div>'
      + '<div style="font-size:11.5px;color:#9ca3af;margin-top:6px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span>Generated: ' + _dateStr + '</span>'
      + (_bSig && tn ? '<span style="font-style:italic;font-size:11px;">Signature: ___________</span>' : '')
      + '</div>'
      + '</div>';
  }

  if (incMetrics) {
    const stats = [
      ['#1a56db','Total Students', results.length, 'in class'],
      ['#059669','Class Average',  classAvg.toFixed(1)+'%', 'overall'],
      ['#f59e0b','Top Score',      Math.max(...pcts).toFixed(1)+'%', results[0].student],
      ['#dc2626','Lowest Score',   Math.min(...pcts).toFixed(1)+'%', 'of class'],
      ['#0d9488','Pass Rate',      Math.round((passing/results.length)*100)+'%', passing+'/'+results.length+' passed'],
    ];
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;">'
      + stats.map(([c,l,v,s]) =>
          '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 10px;border-top:3px solid '+c+';">'
          + '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:4px;">'+l+'</div>'
          + '<div style="font-size:20px;font-weight:800;color:#111827;line-height:1;">'+v+'</div>'
          + '<div style="font-size:10px;color:#9ca3af;margin-top:3px;">'+s+'</div>'
          + '</div>').join('')
      + '</div>';
  }

  // Full results table — every student row is generated here
  // Build category groups for export header
  const _expCatPalette = [
    { fg:'#1A56DB', bg:'#EFF6FF', border:'#BFDBFE' },
    { fg:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    { fg:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
    { fg:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
    { fg:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
    { fg:'#0D9488', bg:'#F0FDFA', border:'#99F6E4' },
  ];
  const _expCatGroups = [];
  [...window.categories.map(c => c.name), '__none__'].forEach(catKey => {
    const subjs = subjects.filter(s => (s.category || '__none__') === catKey);
    if (!subjs.length) return;
    const mandatory = catKey === '__none__' ? true : window.isCatMandatory(catKey);
    const label = catKey === '__none__' ? '' : catKey;
    const namedIdx = window.categories.findIndex(c => c.name === catKey);
    const ci = namedIdx >= 0 ? namedIdx % _expCatPalette.length : _expCatPalette.length - 1;
    _expCatGroups.push({ label, mandatory, subjects: subjs, color: _expCatPalette[ci] });
  });
  const _expHasNamed = _expCatGroups.some(g => g.label !== '');

  html += '<table style="width:100%;border-collapse:collapse;font-size:'+fs+'px;table-layout:fixed;"><thead>';

  if (_expHasNamed) {
    // Row 1: category group headers
    html += '<tr style="background:#f1f5f9;">'
      + '<th rowspan="2" style="width:46px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Rank</th>'
      + '<th rowspan="2" style="width:52px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Index</th>'
      + '<th rowspan="2" style="width:140px;padding:7px 8px;border-bottom:2px solid #e5e7eb;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;text-align:left;white-space:normal;word-break:break-word;min-width:140px;vertical-align:middle;">Student Name</th>';
    _expCatGroups.forEach(g => {
      const n = g.subjects.length;
      if (g.label === '') {
        g.subjects.forEach(() => { html += '<th style="background:#f8fafc;border-bottom:1px solid #e5e7eb;"></th>'; });
      } else {
        const badge = g.mandatory ? ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>' : ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="flex-shrink:0;vertical-align:middle;margin-right:3px;margin-top:-1px"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>';
        html += '<th colspan="'+n+'" style="text-align:center;background:'+g.color.bg+';color:'+g.color.fg+';border:1.5px solid '+g.color.border+';border-bottom:2.5px solid '+g.color.fg+';font-size:'+(fsSm+1)+'px;font-weight:800;letter-spacing:0.05em;padding:6px 4px 4px;">'
          + g.label.toUpperCase() + badge + '</th>';
      }
    });
    html += '<th rowspan="2" style="width:62px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Total<br><span style="font-weight:400;font-size:'+(fsSm-1)+'px;">/'+totalMax+'</span></th>'
      + '<th rowspan="2" style="width:58px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Avg %</th>'
      + '</tr>';
    // Row 2: individual subject names
    html += '<tr>';
    _expCatGroups.forEach(g => {
      g.subjects.forEach(s => {
        const btop = g.label !== '' ? 'border-top:2px solid '+g.color.fg+';' : '';
        html += '<th style="width:'+subjectColW+'px;padding:5px '+pad+'px;'+btop+'border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+(fsSm-1)+'px;text-transform:uppercase;color:'+( g.label !== '' ? g.color.fg : '#6b7280' )+';background:'+(g.label !== '' ? g.color.bg : '#f1f5f9')+';overflow:hidden;text-overflow:ellipsis;">'
          + s.name+'<br><span style="font-weight:400;font-size:'+(fsSm-2)+'px;">/'+s.max+'</span></th>';
      });
    });
    html += '</tr>';
  } else {
    html += '<tr style="background:#f1f5f9;">'
      + '<th style="width:46px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;">Rank</th>'
      + '<th style="width:52px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;">Index</th>'
      + '<th style="width:140px;padding:7px 8px;border-bottom:2px solid #e5e7eb;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;text-align:left;white-space:normal;word-break:break-word;min-width:140px;">Student Name</th>'
      + subjects.map(s=>'<th style="width:'+subjectColW+'px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;overflow:hidden;text-overflow:ellipsis;">'+s.name+'<br><span style="font-weight:400;font-size:'+(fsSm-1)+'px;">/'+s.max+'</span></th>').join('')
      + '<th style="width:62px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;">Total<br><span style="font-weight:400;font-size:'+(fsSm-1)+'px;">/'+totalMax+'</span></th>'
      + '<th style="width:58px;padding:7px '+pad+'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:'+fsSm+'px;text-transform:uppercase;color:#6b7280;">Avg %</th>'
      + '</tr>';
  }
  html += '</thead><tbody>';

  results.forEach((r, i) => {
    const gc = getGradeColor(r.grade);
    const rankBgs  = ['#fef3c7','#f1f5f9','#fff7ed'];
    const rankBds  = ['#f59e0b','#cbd5e1','#fdba74'];
    const rankBg   = r.rank <= 3 ? rankBgs[r.rank-1] : '#f8fafc';
    const rankBd   = r.rank <= 3 ? rankBds[r.rank-1] : '#e5e7eb';
    const rowBg    = i % 2 === 1 ? '#f9fafb' : '#ffffff';
    const rh       = Math.max(7, pad);  // row cell padding — floor raised from 5→7 (see pad comment above)
    html += '<tr style="background:'+rowBg+';">'
      + '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:'+rankBg+';border:2px solid '+rankBd+';font-size:'+(fsSm-1)+'px;font-weight:700;line-height:1;">'+r.rank+'</span></td>'
      + '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;">'
      + '<span style="background:#ebf2ff;color:#1040b0;border-radius:4px;padding:1px 5px;font-size:'+fsSm+'px;font-weight:700;">'+r.idx+'</span></td>'
      + '<td style="padding:'+rh+'px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:'+fsMd+'px;white-space:normal;word-break:break-word;overflow-wrap:break-word;">'+r.student+'</td>'
      + subjects.map(s => {
          const v = r.subjMarks[s.name];
          if (v === null) {
            return '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:'+fsMd+'px;color:#d1d5db;">—</td>';
          }
          // Absent — show AB badge only; never assign a grade to an absent student
          if (v === 'AB') {
            return '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;">'
              + '<span style="display:inline-block;font-size:'+(fsSm-1)+'px;font-weight:800;letter-spacing:0.04em;color:#dc2626;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:4px;padding:1px 5px;">AB</span>'
              + '</td>';
          }
          const sp = s.max > 0 ? (v / s.max) * 100 : 0;
          const subjPm = window.getSubjectPassPct(s.name);
          const sc = sp >= 80 ? '#059669' : sp >= subjPm ? '#1a56db' : '#dc2626';
          if (incSubjGrades) {
            // A mark below the subject pass mark is always F, regardless of grading scale
            const sg = sp < subjPm ? 'F' : getGrade(sp);
            const sgc = getGradeColor(sg);
            return '<td style="padding:'+(Math.max(4,rh-2))+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;">'
              + '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;">'
              + '<span style="font-weight:700;font-size:'+fsMd+'px;color:'+sc+';line-height:1.1;">'+v+'</span>'
              + '<span style="display:inline-flex;align-items:center;justify-content:center;width:'+Math.max(20,fsSm+10)+'px;height:'+Math.max(20,fsSm+10)+'px;border-radius:50%;background:'+sgc+'22;border:1.5px solid '+sgc+'66;font-size:'+(fsSm-1)+'px;font-weight:800;color:'+sgc+';line-height:1;">'+sg+'</span>'
              + '</div></td>';
          }
          return '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;font-size:'+fsMd+'px;color:'+sc+';">'+v+'</td>';
        }).join('')
      + '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;font-size:'+fsMd+'px;">'+r.total+'<span style="font-size:'+(fsSm-1)+'px;font-weight:400;color:#6b7280;">/'+(r.totalMax||totalMax)+'</span></td>'
      + '<td style="padding:'+rh+'px '+pad+'px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;font-size:'+fsMd+'px;color:'+gc+';">'+r.pct+'%</td>'
      + '</tr>';
  });
  html += '</tbody></table>';

  if (incGrading) {
    html += '<div id="export-grading-scale" style="margin-top:20px;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;background:#ebf2ff;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:8px;">Grading Scale</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
      + sortedGrades.map(g=>'<span style="background:'+g.color+'22;color:'+g.color+';border:1px solid '+g.color+'55;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;">'+g.label+' \u2265 '+g.minPct+'%</span>').join('')
      + '</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:6px;">Pass mark: '+passPct+'% and above</div>'
      + '</div>';
  }

  wrap.innerHTML = html;
  return wrap;
}

// ════════════════════════════════════════════
//  STORAGE ENGINE  (File System Access API + localStorage fallback)
//
//  • On supported browsers (Chrome/Edge desktop) the user can pick a
//    real folder on their device. All data is written as JSON files there.
//  • On unsupported browsers (Firefox, iOS Safari, older Edge) the engine
//    silently falls back to localStorage — behaviour is unchanged.
//
//  Public API (all synchronous-looking wrappers):
//    window.StorageEngine.setItem(key, value)   → Promise<void>
//    window.StorageEngine.getItem(key)          → Promise<string|null>
//    window.StorageEngine.removeItem(key)       → Promise<void>
//    window.StorageEngine.isFileBased()         → bool
//    window.StorageEngine.requestDirectory()    → Promise<bool>  (asks user to pick folder)
//    window.StorageEngine.releaseDirectory()    → void
// ════════════════════════════════════════════

// ── Window exports ──
Object.assign(window, {
  addGradeEntry,
  buildExportDOM,
  closeGradePanel,
  closeShareModal,
  commitGradePct,
  downloadSubjectGradesExcel,
  exportSubjectGradesAs,
  exportSubjectGradesJPEG,
  exportSubjectGradesPDF,
  generateExport,
  getGrade,
  getGradeColor,
  gradeClass,
  handleJpeg,
  handlePdf,
  openGradePanel,
  openShareModal,
  pctColor,
  refreshGradePreview,
  refreshPreviewBarOnly,
  removeGradeEntry,
  renderGradePanel,
  resetGradeDefaults,
  selectShareFormat,
  setProgress,
  sortAndRefresh,
  triggerNativeShare,
  triggerShareDownload,
  updateGradeColor,
  updateGradeCurrentBadge,
  updateGradeLabel,
  updateGradePct
});

// Expose gradingScale with getter/setter so other modules can read and mutate it
Object.defineProperty(window, 'gradingScale', {
  get() { return gradingScale; },
  set(v) { gradingScale = v; },
  configurable: true,
});
