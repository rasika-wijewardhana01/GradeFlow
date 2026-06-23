// ═══════════════════════════════════════════════════════════════
//  src/modules/print.js
//  printResults() — renders the result sheet as a pixel-perfect
//  A3-landscape PDF using iframe → html2canvas → jsPDF.
//  No browser print dialog involved → no auto-scaling squish.
// ═══════════════════════════════════════════════════════════════

async function printResults() {
  if (!results || !results.length) {
    window.toast('Calculate results first before exporting', 'error');
    return;
  }
  if (!window.jspdf || !window.html2canvas) {
    window.toast('PDF libraries not loaded yet — please wait a moment and try again', 'error');
    return;
  }

  // ── Show progress toast ──────────────────────────────────────
  window.toast('Generating PDF…', 'info');

  // ── 1. Gather branding / class data ─────────────────────────
  var _br      = window.getBrandingForExport();
  var _bColor  = (_br && _br.primaryColor)              ? _br.primaryColor   : '#1a56db';
  var _bSchool = (_br && _br.schoolFullName)             ? _br.schoolFullName : (document.getElementById('schoolName').value || '');
  var _bAddr   = (_br && _br.showAddress && _br.address) ? _br.address        : '';
  var _bTerm   = (_br && _br.termLabel)                  ? _br.termLabel      : '';
  var _bPrinc  = (_br && _br.principal)                  ? _br.principal      : '';
  var _bSig    = !!(_br && _br.showSig);
  var _bLogo   = (_br && _br.logoDataUrl)                ? _br.logoDataUrl    : null;
  var _dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

  var cn       = document.getElementById('className').value    || '';
  var ay       = document.getElementById('academicYear').value || '';
  var tn       = document.getElementById('teacherName').value  || '';

  var totalMax     = window.getGlobalMax();
  var sortedGrades = window.gradingScale.slice().sort(function(a,b){ return b.minPct - a.minPct; });
  var passPct      = sortedGrades.length > 1 ? sortedGrades[sortedGrades.length - 2].minPct : 50;
  var pcts         = results.map(function(r){ return r.pct; });
  var classAvg     = pcts.reduce(function(a,b){ return a+b; }, 0) / pcts.length;
  var passing      = results.filter(function(r){ return r.pct >= passPct; }).length;

  // ── 2. Category palette ──────────────────────────────────────
  var _pal = [
    { fg:'#1A56DB', bg:'#EFF6FF', border:'#BFDBFE' },
    { fg:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    { fg:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
    { fg:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
    { fg:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
    { fg:'#0D9488', bg:'#F0FDFA', border:'#99F6E4' },
  ];
  var _catGroups = [];
  window.categories.map(function(c){ return c.name; }).concat(['__none__']).forEach(function(catKey){
    var subjs = subjects.filter(function(s){ return (s.category || '__none__') === catKey; });
    if (!subjs.length) return;
    var label    = catKey === '__none__' ? '' : catKey;
    var mand     = catKey === '__none__' ? true : window.isCatMandatory(catKey);
    var namedIdx = window.categories.findIndex(function(c){ return c.name === catKey; });
    var ci       = namedIdx >= 0 ? namedIdx % _pal.length : _pal.length - 1;
    _catGroups.push({ label:label, mandatory:mand, subjects:subjs, color:_pal[ci] });
  });
  var _hasNamedCats = _catGroups.some(function(g){ return g.label !== ''; });

  // ── 3. PDF / canvas geometry ─────────────────────────────────
  // A3 landscape: 420 × 297 mm
  // At 96 dpi: 1mm = 96/25.4 ≈ 3.7795px
  // We render at natural width — NO scaling — then tile into PDF pages.
  var PDF_W_MM    = 420;
  var PDF_H_MM    = 297;
  var MARGIN_MM   = 12;
  var PRINT_W_MM  = PDF_W_MM - MARGIN_MM * 2;   // 396 mm usable
  var PRINT_H_MM  = PDF_H_MM - MARGIN_MM * 2;   // 273 mm usable
  var MM_TO_PX    = 96 / 25.4;                  // ≈ 3.7795
  var SCALE       = 2;                           // retina capture

  // Content pixel width = A3 usable width at 96dpi
  var CONTENT_W_PX = Math.round(PRINT_W_MM * MM_TO_PX);  // ≈ 1496px

  // ── 4. Column / font sizing (same logic as before, now at true A3 width) ──
  var A3_W   = CONTENT_W_PX;
  var FIXW   = 320;
  var MIN_CW = 52, MAX_CW = 110;
  var subW   = Math.max(MIN_CW, Math.min(MAX_CW, Math.floor((A3_W - FIXW) / Math.max(subjects.length, 1))));
  var fs     = subW >= 90 ? 12 : subW >= 70 ? 11 : subW >= 56 ? 10 : 9;
  var fsSm   = Math.max(fs - 2, 7);
  var pad    = Math.max(6, Math.round(subW * 0.10));
  var ROW_H  = 8;    // px top+bottom cell padding — fixed, never derived from subW
  var BSZ    = Math.max(20, fsSm + 10);  // badge circle diameter

  // ── 4b. Row-per-page budget (prevents row squishing) ─────────
  // Natural row height: ROW_H*2 (top+bottom pad) + score line (~11px) + gap (2px) + badge (BSZ) + border (1px)
  var ROW_H_NATURAL = ROW_H * 2 + 11 + 2 + BSZ + 1;
  // Page 1 overhead: header (~107px) + metrics (~122px) + thead (~52px) + body-pad (8px)
  // thead height depends on whether categories exist (2-row) or not (1-row)
  var THEAD_H      = _hasNamedCats ? 52 : 32;
  var PAGE1_OVERHEAD = 107 + 122 + THEAD_H + 8;
  var PAGE_H_CSS   = Math.round(PRINT_H_MM * MM_TO_PX);   // usable page height in CSS px
  // How many rows fit without compression
  var ROWS_PER_P1   = Math.max(5, Math.floor((PAGE_H_CSS - PAGE1_OVERHEAD) / ROW_H_NATURAL));
  var ROWS_PER_CONT = Math.max(5, Math.floor(PAGE_H_CSS / ROW_H_NATURAL));

  // ── 5. Medal colours ─────────────────────────────────────────
  var MDL_BG = ['#fef3c7','#f1f5f9','#fff7ed'];
  var MDL_BD = ['#f59e0b','#cbd5e1','#fdba74'];

  // ── 6. Header HTML ────────────────────────────────────────────
  var metaParts = [];
  if (tn)      metaParts.push('Class Teacher: ' + tn);
  if (_bTerm)  metaParts.push(_bTerm);
  if (_bPrinc) metaParts.push('Principal: ' + _bPrinc);

  var headerHTML = '<div style="margin-bottom:22px;">'
    + '<div style="display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:3px solid ' + _bColor + ';">'
    + (_bLogo ? '<img src="' + _bLogo + '" style="width:64px;height:64px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;background:#fff;flex-shrink:0;" alt="School logo" />' : '')
    + '<div style="flex:1;min-width:0;">'
    + (_bSchool ? '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:' + _bColor + ';margin-bottom:4px;">' + _bSchool + '</div>' : '')
    + '<div style="font-size:24px;font-weight:800;color:#111827;line-height:1.1;">Result Sheet &mdash; ' + cn + (ay ? ' (' + ay + ')' : '') + '</div>'
    + (metaParts.length ? '<div style="font-size:12.5px;color:#6b7280;margin-top:5px;">' + metaParts.join(' &nbsp;&bull;&nbsp; ') + '</div>' : '')
    + (_bAddr ? '<div style="font-size:11px;color:#9ca3af;margin-top:3px;">' + _bAddr + '</div>' : '')
    + '</div>'
    + '</div>'
    + '<div style="font-size:11.5px;color:#9ca3af;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">'
    + '<span>Generated: ' + _dateStr + '</span>'
    + (_bSig ? '<span style="font-style:italic;font-size:11px;">Signature: ___________</span>' : '')
    + '</div>'
    + '</div>';

  // ── 7. Metric cards ───────────────────────────────────────────
  var stats = [
    ['#1a56db', 'Total Students', String(results.length),                                'in class'],
    ['#059669', 'Class Average',  classAvg.toFixed(1) + '%',                             'overall'],
    ['#f59e0b', 'Top Score',      Math.max.apply(null, pcts).toFixed(1) + '%',           results[0].student],
    ['#dc2626', 'Lowest Score',   Math.min.apply(null, pcts).toFixed(1) + '%',           'of class'],
    ['#0d9488', 'Pass Rate',      Math.round((passing / results.length) * 100) + '%',    passing + '/' + results.length + ' passed'],
  ];
  var metricsHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:22px;">';
  stats.forEach(function(st){
    metricsHTML += '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 12px;border-top:4px solid ' + st[0] + ';background:#fff;">'
      + '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:5px;">' + st[1] + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:#111827;line-height:1;">' + st[2] + '</div>'
      + '<div style="font-size:10px;color:#9ca3af;margin-top:4px;">' + st[3] + '</div>'
      + '</div>';
  });
  metricsHTML += '</div>';

  // ── 8. Results table ──────────────────────────────────────────
  var tableHTML = '<table style="width:100%;border-collapse:collapse;font-size:' + fs + 'px;table-layout:fixed;"><thead>';

  if (_hasNamedCats) {
    tableHTML += '<tr style="background:#f1f5f9;">'
      + '<th rowspan="2" style="width:42px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Rank</th>'
      + '<th rowspan="2" style="width:48px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Index</th>'
      + '<th rowspan="2" style="width:130px;padding:7px 8px;border-bottom:2px solid #e5e7eb;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;text-align:left;vertical-align:middle;">Student Name</th>';

    _catGroups.forEach(function(g){
      if (g.label === '') {
        g.subjects.forEach(function(){ tableHTML += '<th style="background:#f8fafc;border-bottom:1px solid #e5e7eb;"></th>'; });
      } else {
        var mandSVG = g.mandatory
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="vertical-align:middle;margin-right:3px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/><\/svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="vertical-align:middle;margin-right:3px;"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/><\/svg>';
        tableHTML += '<th colspan="' + g.subjects.length + '" style="text-align:center;background:' + g.color.bg + ';color:' + g.color.fg + ';border:1.5px solid ' + g.color.border + ';border-bottom:2.5px solid ' + g.color.fg + ';font-size:' + (fsSm + 1) + 'px;font-weight:800;letter-spacing:0.05em;padding:6px 4px 4px;">'
          + g.label.toUpperCase() + ' ' + mandSVG + '</th>';
      }
    });
    tableHTML += '<th rowspan="2" style="width:60px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Total<br><span style="font-weight:400;font-size:' + (fsSm-1) + 'px;">/' + totalMax + '</span></th>'
      + '<th rowspan="2" style="width:54px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;vertical-align:middle;">Avg %</th>'
      + '</tr>';
    tableHTML += '<tr>';
    _catGroups.forEach(function(g){
      g.subjects.forEach(function(s){
        var btop = g.label !== '' ? ('border-top:2px solid ' + g.color.fg + ';') : '';
        tableHTML += '<th style="width:' + subW + 'px;padding:5px ' + pad + 'px;' + btop + 'border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + (fsSm-1) + 'px;text-transform:uppercase;color:' + (g.label !== '' ? g.color.fg : '#6b7280') + ';background:' + (g.label !== '' ? g.color.bg : '#f1f5f9') + ';overflow:hidden;text-overflow:ellipsis;">'
          + s.name + '<br><span style="font-weight:400;font-size:' + (fsSm-2) + 'px;">/' + s.max + '</span></th>';
      });
    });
    tableHTML += '</tr>';
  } else {
    tableHTML += '<tr style="background:#f1f5f9;">'
      + '<th style="width:42px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;">Rank</th>'
      + '<th style="width:48px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;">Index</th>'
      + '<th style="width:130px;padding:7px 8px;border-bottom:2px solid #e5e7eb;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;text-align:left;">Student Name</th>';
    subjects.forEach(function(s){
      tableHTML += '<th style="width:' + subW + 'px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;overflow:hidden;text-overflow:ellipsis;">'
        + s.name + '<br><span style="font-weight:400;font-size:' + (fsSm-1) + 'px;">/' + s.max + '</span></th>';
    });
    tableHTML += '<th style="width:60px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;">Total<br><span style="font-weight:400;font-size:' + (fsSm-1) + 'px;">/' + totalMax + '</span></th>'
      + '<th style="width:54px;padding:7px ' + pad + 'px;border-bottom:2px solid #e5e7eb;text-align:center;font-size:' + fsSm + 'px;text-transform:uppercase;color:#6b7280;">Avg %</th>'
      + '</tr>';
  }

  tableHTML += '</thead><tbody>';

  // ── Page-break sentinel style ─────────────────────────────────
  // A zero-height div that the smartCutY slicer will snap to, ensuring the
  // canvas is cut BEFORE the next row rather than mid-row.
  var PAGE_BREAK_SENTINEL = '</tbody></table>'
    + '<div class="gf-page-break" style="height:0;overflow:hidden;font-size:0;line-height:0;"></div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:' + fs + 'px;table-layout:fixed;"><tbody>';

  // Track rows written and which "page slot" we are on.
  // page=0 → page 1 (has header+metrics overhead, fewer rows fit)
  // page≥1 → continuation pages (full height available)
  var _pageSlot   = 0;
  var _rowsOnPage = 0;

  results.forEach(function(r, i){
    // ── Decide if we need a page break BEFORE this row ───────────
    var _limit = (_pageSlot === 0) ? ROWS_PER_P1 : ROWS_PER_CONT;
    if (_rowsOnPage >= _limit) {
      tableHTML += PAGE_BREAK_SENTINEL;
      _pageSlot++;
      _rowsOnPage = 0;
    }

    var gc    = window.getGradeColor(r.grade);
    var rBg   = r.rank <= 3 ? MDL_BG[r.rank-1] : '#f8fafc';
    var rBd   = r.rank <= 3 ? MDL_BD[r.rank-1] : '#e5e7eb';
    var rowBg = i % 2 === 1 ? '#f9fafb' : '#ffffff';
    var rankCell = '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + rBg + ';border:2px solid ' + rBd + ';font-size:' + (fsSm-1) + 'px;font-weight:800;color:' + (r.rank <= 3 ? '#111827' : '#6b7280') + ';">' + r.rank + '</span>';

    tableHTML += '<tr style="background:' + rowBg + ';">'
      + '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;">' + rankCell + '</td>'
      + '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;"><span style="background:#ebf2ff;color:#1040b0;border-radius:4px;padding:1px 5px;font-size:' + fsSm + 'px;font-weight:700;">' + r.idx + '</span></td>'
      + '<td style="padding:' + ROW_H + 'px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:' + fs + 'px;white-space:normal;word-break:break-word;vertical-align:middle;">' + r.student + '</td>';

    subjects.forEach(function(s){
      var v = r.subjMarks[s.name];
      if (v === null || v === undefined) {
        tableHTML += '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;font-size:' + fs + 'px;color:#d1d5db;">&mdash;</td>';
      } else if (v === 'AB') {
        tableHTML += '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;">'
          + '<span style="display:inline-block;font-size:' + (fsSm-1) + 'px;font-weight:800;letter-spacing:0.04em;color:#dc2626;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:4px;padding:1px 5px;">AB</span>'
          + '</td>';
      } else {
        var sp    = s.max > 0 ? (v / s.max) * 100 : 0;
        var subjPm = window.getSubjectPassPct(s.name);
        var sc    = sp >= 80 ? '#059669' : sp >= subjPm ? '#1a56db' : '#dc2626';
        var sg    = sp < subjPm ? 'F' : window.getGrade(sp);
        var sgc   = window.getGradeColor(sg);
        tableHTML += '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;overflow:visible;">'
          + '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">'
          + '<span style="font-weight:700;font-size:' + fs + 'px;color:' + sc + ';line-height:1.2;">' + v + '</span>'
          + '<span style="display:inline-flex;align-items:center;justify-content:center;width:' + BSZ + 'px;height:' + BSZ + 'px;border-radius:50%;background:' + sgc + '22;border:1.5px solid ' + sgc + '66;font-size:' + (fsSm-1) + 'px;font-weight:800;color:' + sgc + ';line-height:1;flex-shrink:0;">' + sg + '</span>'
          + '</div></td>';
      }
    });

    tableHTML += '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;font-weight:700;font-size:' + fs + 'px;">'
      + r.total + '<span style="font-size:' + (fsSm-1) + 'px;font-weight:400;color:#6b7280;">/' + (r.totalMax || totalMax) + '</span></td>'
      + '<td style="padding:' + ROW_H + 'px ' + pad + 'px;border-bottom:1px solid #f1f5f9;text-align:center;vertical-align:middle;font-weight:700;font-size:' + fs + 'px;color:' + gc + ';">' + r.pct + '%</td>'
      + '</tr>';

    _rowsOnPage++;
  });
  tableHTML += '</tbody></table>';

  // ── 9. Grading scale footer ────────────────────────────────────
  var gradingHTML = '<div style="margin-top:22px;border:1px solid #bfdbfe;border-radius:12px;padding:14px 18px;background:#ebf2ff;">'
    + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;margin-bottom:8px;">Grading Scale</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:7px;">';
  sortedGrades.forEach(function(g){
    gradingHTML += '<span style="background:' + g.color + '22;color:' + g.color + ';border:1px solid ' + g.color + '55;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;">'
      + g.label + ' &ge; ' + g.minPct + '%</span>';
  });
  gradingHTML += '</div>'
    + '<div style="font-size:11px;color:#6b7280;margin-top:7px;">Pass mark: ' + passPct + '% and above</div>'
    + '</div>';

  // ── 10. Page-number footer (injected per PDF page) ────────────
  var pgFooterStyle = 'text-align:center;font-size:10px;color:#9ca3af;padding-top:8px;';
  var docTitle = cn + (ay ? ' \u2014 ' + ay : '');

  // ── 11. Full document HTML ─────────────────────────────────────
  var bodyCSS = [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html, body { background: #ffffff; font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; color: #111827; }',
    'body { padding: 0; width: ' + CONTENT_W_PX + 'px; }',
    '-webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact;',
  ].join(' ');

  var fullHTML = headerHTML + metricsHTML + tableHTML + gradingHTML;

  // ── 12. Render in hidden iframe ────────────────────────────────
  var iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'z-index:-1',
    'opacity:0', 'pointer-events:none',
    'width:' + CONTENT_W_PX + 'px',
    'height:4000px',
    'border:none', 'overflow:hidden',
  ].join(';');
  document.body.appendChild(iframe);

  try {
    var iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write('<!DOCTYPE html><html data-theme="light"><head>'
      + '<meta charset="UTF-8">'
      + '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
      + '<style>' + bodyCSS + '</style>'
      + '</head><body>' + fullHTML + '</body></html>');
    iDoc.close();

    // Wait for fonts + layout
    if (iDoc.fonts && iDoc.fonts.ready) await iDoc.fonts.ready;
    await new Promise(function(res){ requestAnimationFrame(function(){ requestAnimationFrame(res); }); });
    await new Promise(function(res){ setTimeout(res, 400); });

    // Measure true content height
    iDoc.body.style.paddingBottom = '8px';
    var contentH = Math.ceil(iDoc.body.scrollHeight);
    iframe.style.height = contentH + 'px';
    await new Promise(function(res){ requestAnimationFrame(res); });

    // Capture via html2canvas at SCALE×
    var canvas = await html2canvas(iDoc.body, {
      scale:           SCALE,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: '#ffffff',
      logging:         false,
      width:           CONTENT_W_PX,
      height:          contentH,
      windowWidth:     CONTENT_W_PX,
      windowHeight:    contentH,
      scrollX: 0, scrollY: 0, x: 0, y: 0,
      onclone: function(cloneDoc) {
        cloneDoc.documentElement.setAttribute('data-theme', 'light');
        cloneDoc.documentElement.style.overflow = 'hidden';
        cloneDoc.body.style.width    = CONTENT_W_PX + 'px';
        cloneDoc.body.style.overflow = 'hidden';
        cloneDoc.body.style.background = '#ffffff';
      }
    });

    // ── 13. Collect row boundaries + sentinel cut points ──────────
    var rowBoundaries = [];
    iDoc.querySelectorAll('tr').forEach(function(tr) {
      var rect   = tr.getBoundingClientRect();
      var top    = Math.round(rect.top    + (iframe.contentWindow.scrollY || 0));
      var bottom = Math.round(rect.bottom + (iframe.contentWindow.scrollY || 0));
      if (bottom > top) rowBoundaries.push({ top: top, bottom: bottom, hard: false });
    });
    // Also include top-level section blocks (header, metrics, footer)
    Array.from(iDoc.body.children).forEach(function(el) {
      var rect   = el.getBoundingClientRect();
      var top    = Math.round(rect.top    + (iframe.contentWindow.scrollY || 0));
      var bottom = Math.round(rect.bottom + (iframe.contentWindow.scrollY || 0));
      if (bottom > top) rowBoundaries.push({ top: top, bottom: bottom, hard: false });
    });
    // Collect page-break sentinels as HARD cut points — the slicer will
    // always prefer cutting here regardless of the naive page-height boundary.
    var hardCuts = [];
    iDoc.querySelectorAll('.gf-page-break').forEach(function(el) {
      var rect = el.getBoundingClientRect();
      var pos  = Math.round(rect.top + (iframe.contentWindow.scrollY || 0));
      hardCuts.push(pos);
      rowBoundaries.push({ top: pos, bottom: pos, hard: true });
    });
    rowBoundaries.sort(function(a, b){ return a.top - b.top; });

    function smartCutY(naiveCutPx, srcStartCss) {
      // 1. Check if a hard sentinel falls within this page's range — prefer it
      var bestHard = -1;
      for (var h = 0; h < hardCuts.length; h++) {
        if (hardCuts[h] > srcStartCss && hardCuts[h] <= naiveCutPx) {
          bestHard = hardCuts[h]; // take the LAST sentinel ≤ naiveCut
        }
      }
      if (bestHard >= 0) return bestHard;

      // 2. No sentinel — snap to nearest row boundary (original logic)
      var bestCut = naiveCutPx;
      for (var i = rowBoundaries.length - 1; i >= 0; i--) {
        if (rowBoundaries[i].bottom <= naiveCutPx) {
          bestCut = rowBoundaries[i].bottom;
          break;
        }
        if (rowBoundaries[i].top < naiveCutPx) {
          bestCut = rowBoundaries[i].top;
          break;
        }
      }
      return bestCut;
    }

    // ── 14. Tile canvas onto A3 landscape PDF pages ────────────────
    var { jsPDF } = window.jspdf;
    var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

    var canvasW     = canvas.width;                // CONTENT_W_PX * SCALE
    var canvasH     = canvas.height;               // contentH * SCALE
    var pxPerMm     = canvasW / PRINT_W_MM;        // canvas-px per mm
    var pageH_mm    = PRINT_H_MM;
    var pageH_cvpx  = Math.round(pageH_mm * pxPerMm);
    var pageH_csspx = Math.round(pageH_mm * MM_TO_PX);

    var srcY_cv  = 0;
    var srcY_css = 0;
    var pageNum  = 0;
    var totalPages = Math.ceil(contentH / pageH_csspx) + 1; // rough upper bound

    while (srcY_cv < canvasH) {
      if (pageNum > 0) pdf.addPage();

      var naiveEndCss   = srcY_css + pageH_csspx;
      var snappedEndCss = Math.min(smartCutY(naiveEndCss, srcY_css), contentH);
      var isLastPage    = (snappedEndCss >= contentH) || (naiveEndCss >= contentH);
      var snappedEndCv  = isLastPage ? canvasH : Math.min(Math.round(snappedEndCss * SCALE), canvasH);
      var sliceH_cv     = snappedEndCv - srcY_cv;
      if (sliceH_cv <= 0) break;

      // Render slice
      var tmp = document.createElement('canvas');
      tmp.width  = canvasW;
      tmp.height = sliceH_cv;
      var ctx = tmp.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, sliceH_cv);
      ctx.drawImage(canvas, 0, srcY_cv, canvasW, sliceH_cv, 0, 0, canvasW, sliceH_cv);

      var sliceH_mm = sliceH_cv / pxPerMm;

      // Add content
      pdf.addImage(tmp.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM, PRINT_W_MM, sliceH_mm);

      // Page number footer
      var pg = pageNum + 1;
      pdf.setFontSize(9);
      pdf.setTextColor(180, 180, 180);
      pdf.text(
        docTitle + ' \u2014 Page ' + pg,
        PDF_W_MM / 2,
        PDF_H_MM - 6,
        { align: 'center' }
      );

      srcY_cv  = snappedEndCv;
      srcY_css = snappedEndCss;
      pageNum++;
    }

    // ── 15. Download ───────────────────────────────────────────────
    var fileName = (cn + (ay ? '_' + ay : '') + '_Results').replace(/\s+/g, '_') + '.pdf';
    pdf.save(fileName);
    window.toast('PDF downloaded!', 'success');
    window.showDownloadTip && window.showDownloadTip();

  } catch(e) {
    console.error('Results PDF error:', e);
    window.toast('PDF render failed: ' + e.message, 'error');
  } finally {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
  }
}

// ── Window exports ──
Object.assign(window, {
  printResults
});
