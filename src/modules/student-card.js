// ═══════════════════════════════════════════════════════════════
//  src/modules/student-card.js
//  Student Report Card modal: render, navigate, export single
//  PDF, export all as ZIP of PDFs. PDF generation progress UI.
// ═══════════════════════════════════════════════════════════════
function openStudentCardModal() {
  if (!results.length) { window.toast('Calculate results first', 'error'); return; }
  // Sync any unsaved branding form edits into brandingSettings before rendering
  window._syncBrandingFromDOM();
  // Populate student selector
  const sel = document.getElementById('scStudentSelect');
  sel.innerHTML = '<option value="">Select a student…</option>' +
    results.map((r, i) => `<option value="${i}">#${r.idx} — ${r.student}</option>`).join('');
  // Reset state
  document.getElementById('scCardPreview').style.display = 'none';
  document.getElementById('scEmptyState').style.display = '';
  document.getElementById('scDownloadOneBtn').disabled = true;
  // Always re-enable the "Export all as ZIP" button when the modal opens.
  // If a previous export was cancelled, the button could still be disabled
  // from _pdfGenOpen() — this guarantees it is always clickable on open.
  document.getElementById('scDownloadAllBtn').disabled = false;
  document.getElementById('scModalOverlay').classList.add('open');
}

function closeStudentCardModal() {
  // If an export is in progress, cancel it so the progress overlay closes
  // itself and _pdfGenFinish re-enables the button cleanly.
  if (typeof _pdfGenCancelRequested !== 'undefined') {
    _pdfGenCancelRequested = true;
  }
  // Guarantee the ZIP button is never left permanently disabled when the
  // modal closes, regardless of what the export machinery last set it to.
  const btnAll = document.getElementById('scDownloadAllBtn');
  if (btnAll) btnAll.disabled = false;

  document.getElementById('scModalOverlay').classList.remove('open');
}

function scNav(dir) {
  const sel = document.getElementById('scStudentSelect');
  const cur = parseInt(sel.value);
  const n   = results.length;
  if (!n) return;
  let next;
  if (isNaN(cur)) { next = dir > 0 ? 0 : n - 1; }
  else { next = (cur + dir + n) % n; }
  sel.value = next;
  renderStudentCard();
}

function renderStudentCard() {
  window._syncBrandingFromDOM();
  const sel = document.getElementById('scStudentSelect');
  const idx = parseInt(sel.value);
  const preview = document.getElementById('scCardPreview');
  const empty   = document.getElementById('scEmptyState');
  const oneBtn  = document.getElementById('scDownloadOneBtn');

  if (isNaN(idx) || idx < 0 || idx >= results.length) {
    preview.style.display = 'none';
    empty.style.display = '';
    oneBtn.disabled = true;
    return;
  }
  preview.style.display = '';
  empty.style.display = 'none';
  oneBtn.disabled = false;

  const r   = results[idx];
  preview.innerHTML = _buildStudentCardHTML(r);
}

// Darken a hex colour by `amount` (0–1) for gradient end stops
function _hexDarken(hex, amount) {
  try {
    let h = hex.replace('#','');
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    let r = parseInt(h.slice(0,2),16);
    let g = parseInt(h.slice(2,4),16);
    let b = parseInt(h.slice(4,6),16);
    r = Math.max(0, Math.round(r * (1 - amount)));
    g = Math.max(0, Math.round(g * (1 - amount)));
    b = Math.max(0, Math.round(b * (1 - amount)));
    return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  } catch(e) { return hex; }
}

function _buildStudentCardHTML(r, forceLightMode) {
  const cn   = document.getElementById('className').value    || '';
  const ay   = document.getElementById('academicYear').value || '';
  const tn   = document.getElementById('teacherName').value  || '';
  const el   = document.getElementById('examLabel').value    || '';

  // ── Pull ALL branding / setup fields ──────────────────────────────────────
  const bs         = window.brandingSettings || {};
  const sn         = bs.schoolFullName || document.getElementById('schoolName').value || '';
  const schoolAddr = (bs.showAddress && bs.address) ? bs.address : '';
  const principal  = bs.principal  || '';
  const showSig    = !!bs.showSig;
  const logoUrl    = bs.logoDataUrl || null;
  const accentHex  = bs.primaryColor || '#1a56db';
  // Darken accent for gradient end (shift lightness ~15% darker)
  const accentDark = _hexDarken(accentHex, 0.18);

  // ── Dark mode detection ───────────────────────────────────────────────────
  // forceLightMode=true when called from PDF export (off-screen container is always light)
  const isDark = forceLightMode ? false : document.documentElement.getAttribute('data-theme') === 'dark';

  // Colour palette — switches between light and dark tokens
  const C = isDark ? {
    cardBg:        '#2d3748',
    cardBorder:    '#4a5568',
    text:          '#e2e8f0',
    textMuted:     '#a0aec0',
    textLight:     '#718096',
    rowEven:       '#2d3748',
    rowOdd:        '#323d4f',
    rowBorder:     '#4a5568',
    theadBg:       '#374151',
    theadText:     '#94a3b8',
    theadBorder:   '#4a5568',
    summaryBg:     '#374151',
    summaryBorder: '#4a5568',
    footerBg:      '#374151',
    footerBorder:  '#4a5568',
    barBg:         '#4a5568',
    absentBar:     '#4a5568',
    absentText:    '#718096',
    absentDash:    '#718096',
    absentGradeBg: '#374151',
    absentGradeBorder: '#4a5568',
    absentBadgeBg:     '#450a0a',
    absentBadgeBorder: '#b91c1c',
    absentBadgeText:   '#f87171',
    notChosenBg:   '#1e3a5f',
    notChosenBorder: '#3b82f6',
    notChosenText: '#60a5fa',
    passBg:        '#064e3b',
    passBorder:    '#0a6650',
    passText:      '#34d399',
    failBg:        '#450a0a',
    failBorder:    '#7f1d1d',
    failText:      '#f87171',
  } : {
    cardBg:        '#ffffff',
    cardBorder:    '#e2e8f0',
    text:          '#1e293b',
    textMuted:     '#475569',
    textLight:     '#94a3b8',
    rowEven:       '#ffffff',
    rowOdd:        '#f8fafc',
    rowBorder:     '#f1f5f9',
    theadBg:       '#f1f5f9',
    theadText:     '#64748b',
    theadBorder:   '#e2e8f0',
    summaryBg:     '#f8fafc',
    summaryBorder: '#e2e8f0',
    footerBg:      '#f8fafc',
    footerBorder:  '#e2e8f0',
    barBg:         '#e2e8f0',
    absentBar:     '#e2e8f0',
    absentText:    '#cbd5e1',
    absentDash:    '#cbd5e1',
    absentGradeBg: '#f1f5f9',
    absentGradeBorder: '#e2e8f0',
    absentBadgeBg:     '#fef2f2',
    absentBadgeBorder: '#fca5a5',
    absentBadgeText:   '#dc2626',
    notChosenBg:   '#eff6ff',
    notChosenBorder: '#bfdbfe',
    notChosenText: '#1a56db',
    passBg:        '#d1fae5',
    passBorder:    '#6ee7b7',
    passText:      '#059669',
    failBg:        '#fee2e2',
    failBorder:    '#fca5a5',
    failText:      '#dc2626',
  };

  const sortedG = [...gradingScale].sort((a,b) => b.minPct - a.minPct);
  const passPct = sortedG.length > 1 ? sortedG[sortedG.length - 2].minPct : 50;
  const isPass  = r.pct >= passPct;
  const gc      = window.getGradeColor(r.grade);

  // Rank colours
  const rankColors = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };
  const rankColor  = rankColors[r.rank] || (isDark ? '#60a5fa' : '#1a56db');
  const rankBg     = rankColors[r.rank] ? rankColors[r.rank] + '18' : (isDark ? '#1e3a5f' : '#1a56db18');

  const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

  // ── Per-subject class averages ────────────────────────────────────────────
  // Compute the average mark (as % of max) across ALL students who have a mark entered.
  const subjClassAvg = {};
  subjects.forEach((s) => {
    const vals = [];
    students.forEach((st) => {
      const k = `${st.name}||${s.name}`;
      const v = marks[k];
      if (v !== '' && v !== undefined && v !== null && !isNaN(parseFloat(v))) {
        vals.push((parseFloat(v) / s.max) * 100);
      }
    });
    subjClassAvg[s.name] = vals.length > 0
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  });

  // ── Subject rows ──────────────────────────────────────────────────────────
  let subjectRows = '';
  let rowIdx = 0; // visual index for alternating rows (skip not-chosen electives)
  subjects.forEach((s) => {
    const v = r.subjMarks[s.name];
    const isElective = s.category && !window.isCatMandatory(s.category);

    // Elective subjects the student did NOT choose are silently skipped —
    // they add no value to the printed card and inflate it to extra pages.
    const isNotChosen = isElective && (v === null || v === undefined);
    if (isNotChosen) return; // ← skip entirely; don't render a row

    // For mandatory subjects (or electives with 0 entered): truly absent if v===0 and no raw mark
    // We detect absent as: not-chosen already handled above; for mandatory, 0 with no mark entered
    // Use the raw marks store to check if a mark was actually entered
    const rawKey = `${r.student}||${s.name}`;
    const rawMark = marks[rawKey];
    // v==='AB' is the explicit absent sentinel stored by computeResults() when
    // the teacher used the "Mark Absent" feature.  It must be caught FIRST —
    // before the rawMark===undefined check — because rawMark itself is also 'AB'
    // (not undefined/empty), so the old condition evaluated to false and let
    // parseFloat('AB')=NaN slip through, producing "NaN / 100" and Grade F.
    const isAbsent = !isNotChosen && (v === 'AB' || v === null || v === undefined || v === '' || (rawMark === undefined || rawMark === '') && !isElective);

    const numV = isAbsent ? 0 : parseFloat(v);
    const pct  = isAbsent ? 0 : (s.max > 0 ? (numV / s.max) * 100 : 0);
    const subjPassPct = window.getSubjectPassPct(s.name);
    const grade = isAbsent ? null : window.getGrade(pct);
    const gradeColor = isAbsent ? C.absentDash : window.getGradeColor(grade);
    const barColor = isAbsent ? C.absentBar
      : pct >= 80 ? '#10b981'
      : pct >= subjPassPct ? '#3b82f6'
      : '#ef4444';

    const markNum  = isAbsent ? null : String(numV);
    const markMax  = isAbsent ? null : String(s.max);
    const pctStr   = isAbsent ? '' : pct.toFixed(1) + '%';
    const rowBg    = rowIdx % 2 === 0 ? C.rowEven : C.rowOdd;
    rowIdx++;

    // Category label — shown below subject name to prevent overflow
    const catLabel = s.category
      ? `<div style="margin-top:3px;"><span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:${isElective ? (isDark ? '#374151' : '#f1f5f9') : (isDark ? '#374151' : '#f1f5f9')};color:${C.textLight};border:1px solid ${C.rowBorder};">${s.category}</span></div>`
      : '';

    subjectRows += `<tr style="background:${rowBg};">
      <td style="padding:9px 14px;border-bottom:1px solid ${C.rowBorder};font-weight:600;font-size:13px;color:${C.text};white-space:normal;overflow-wrap:break-word;word-break:normal;overflow:hidden;">${s.name}${catLabel}</td>
      <td style="padding:9px 14px;border-bottom:1px solid ${C.rowBorder};text-align:center;font-size:13px;color:${C.textMuted};white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:middle;overflow:hidden;">
        ${isAbsent
          ? (v === 'AB'
              ? `<span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:0.05em;color:${C.absentBadgeText};background:${C.absentBadgeBg};border:1.5px solid ${C.absentBadgeBorder};border-radius:4px;padding:2px 7px;">AB</span>`
              : `<span style="color:${C.absentDash};font-size:14px;">&#8212;</span>`)
          : `<span style="font-weight:700;color:${C.text};">${markNum}</span><span style="color:${C.textLight};margin:0 3px;font-weight:400;">/</span><span style="color:${C.textMuted};">${markMax}</span>`
        }
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid ${C.rowBorder};text-align:left;vertical-align:middle;overflow:hidden;">
        ${isAbsent
          ? `<div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:80px;height:7px;background:${C.absentBar};border-radius:99px;"></span><span style="font-size:11px;color:${C.absentText};white-space:nowrap;">Absent</span></div>`
          : `<div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
               <div style="flex:0 0 90px;min-width:0;height:7px;background:${C.barBg};border-radius:99px;overflow:hidden;">
                 <div style="height:100%;background:${barColor};border-radius:99px;width:${Math.min(100,pct).toFixed(1)}%;"></div>
               </div>
               <span style="font-size:12px;font-weight:700;color:${barColor};white-space:nowrap;overflow:hidden;">${pctStr}</span>
             </div>`
        }
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid ${C.rowBorder};text-align:center;vertical-align:middle;">
        ${(() => {
          const ca = subjClassAvg[s.name];
          if (ca === null) {
            return `<span style="font-size:11px;color:${C.textLight};">—</span>`;
          }
          const caColor = ca >= 80 ? '#10b981' : ca >= (subjPassPct) ? '#3b82f6' : '#ef4444';
          const diffAmt = isAbsent ? null : (pct - ca);
          const diffStr = diffAmt === null ? '' : (diffAmt >= 0 ? `+${diffAmt.toFixed(0)}` : `${diffAmt.toFixed(0)}`);
          const diffColor = diffAmt === null ? '' : diffAmt >= 0 ? '#10b981' : '#ef4444';
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
            <span style="font-size:11px;font-weight:700;color:${caColor};white-space:nowrap;">${ca.toFixed(1)}%</span>
            ${diffStr ? `<span style="font-size:9px;font-weight:700;color:${diffColor};white-space:nowrap;">${diffStr}%</span>` : ''}
          </div>`;
        })()}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid ${C.rowBorder};text-align:center;vertical-align:middle;">
        ${isAbsent
          ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${C.absentGradeBg};border:1.5px solid ${C.absentGradeBorder};font-size:13px;color:${C.absentDash};">&#8212;</span>`
          : `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${gradeColor}18;border:1.5px solid ${gradeColor}50;font-size:11px;font-weight:800;color:${gradeColor};">${grade}</span>`
        }
      </td>
    </tr>`;
  });

  // Grading scale pills
  const scalePills = sortedG.map(g =>
    `<span style="background:${g.color}18;color:${g.color};border:1px solid ${g.color}40;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap;">${g.label} &#8805;${g.minPct}%</span>`
  ).join('');

  return `
  <div style="font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;color:${C.text};background:${C.cardBg};border-radius:0;overflow:visible;border:1px solid ${C.cardBorder};border-bottom:3px solid ${accentHex};">

    <!-- ── HEADER BAND ── -->
    <div style="background:linear-gradient(135deg,${accentHex} 0%,${accentDark} 100%);padding:22px 24px 18px;color:#fff;position:relative;overflow:hidden;border-radius:0;">
      <!-- decorative circles -->
      <div style="position:absolute;top:-30px;right:-30px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,0.05);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-40px;right:60px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.04);pointer-events:none;"></div>
      <!-- School identity row: name/address left, logo right -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
        <div style="flex:1;min-width:0;">
          ${sn ? `<div style="font-size:11px;font-weight:800;letter-spacing:0.10em;opacity:0.90;text-transform:uppercase;line-height:1.3;">${sn}</div>` : ''}
          ${schoolAddr ? `<div style="font-size:10px;opacity:0.68;margin-top:2px;line-height:1.4;">${schoolAddr}</div>` : ''}
        </div>
        ${logoUrl
          ? `<img src="${logoUrl}" alt="School logo" style="width:68px;height:68px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,0.15);padding:5px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.18);">`
          : ''
        }
      </div>
      <!-- Divider -->
      <div style="height:1px;background:rgba(255,255,255,0.18);margin-bottom:12px;"></div>
      <!-- Class / exam context -->
      <div style="font-size:12px;font-weight:500;opacity:0.82;line-height:1.5;">${cn}${ay ? '&ensp;&middot;&ensp;' + ay : ''}${el ? '&ensp;&middot;&ensp;<em>' + el + '</em>' : ''}</div>
      <!-- Student name -->
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-top:8px;line-height:1.2;">${r.student}</div>
      <!-- Index + teacher / principal -->
      <div style="font-size:11.5px;opacity:0.70;margin-top:5px;font-weight:400;display:flex;flex-wrap:wrap;gap:0 14px;">
        <span>Index&nbsp;#${r.idx}</span>
        ${tn ? `<span>Teacher:&nbsp;${tn}</span>` : ''}
        ${principal ? `<span>Principal:&nbsp;${principal}</span>` : ''}
      </div>
    </div>

    <!-- ── SUMMARY STRIP ── -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);background:${C.summaryBg};border-bottom:2px solid ${C.summaryBorder};">

      <div style="padding:16px 12px;text-align:center;border-right:1px solid ${C.summaryBorder};">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:${C.textLight};">Rank</div>
        <div style="font-size:28px;font-weight:800;color:${rankColor};letter-spacing:-1px;margin-top:3px;line-height:1;">${r.rank}</div>
        <div style="font-size:10px;color:${C.textLight};margin-top:3px;">of&nbsp;${results.length}</div>
      </div>

      <div style="padding:16px 12px;text-align:center;border-right:1px solid ${C.summaryBorder};">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:${C.textLight};">Total</div>
        <div style="font-size:28px;font-weight:800;color:${C.text};letter-spacing:-1px;margin-top:3px;line-height:1;">${r.total}</div>
        <div style="font-size:10px;color:${C.textLight};margin-top:3px;">/ ${r.totalMax}</div>
      </div>

      <div style="padding:16px 12px;text-align:center;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:${C.textLight};">Average</div>
        <div style="font-size:28px;font-weight:800;color:${C.text};letter-spacing:-1px;margin-top:3px;line-height:1;">${r.pct}%</div>
        <div style="height:5px;background:${C.barBg};border-radius:99px;overflow:hidden;margin:5px 14px 4px;"><div style="height:100%;background:${gc};border-radius:99px;width:${Math.min(100,r.pct)}%;"></div></div>
      </div>
    </div>

    <!-- ── SUBJECT TABLE ── -->
    <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
      <colgroup>
        <col style="width:24%;">
        <col style="width:16%;">
        <col style="width:33%;">
        <col style="width:15%;">
        <col style="width:12%;">
      </colgroup>
      <thead>
        <tr style="background:${C.theadBg};">
          <th style="padding:10px 14px;color:${C.theadText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ${C.theadBorder};text-align:left;">Subject</th>
          <th style="padding:10px 14px;color:${C.theadText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ${C.theadBorder};text-align:center;">Marks</th>
          <th style="padding:10px 14px;color:${C.theadText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ${C.theadBorder};text-align:left;">Performance</th>
          <th style="padding:8px 10px;color:${C.theadText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ${C.theadBorder};text-align:center;white-space:nowrap;">Class Avg</th>
          <th style="padding:10px 14px;color:${C.theadText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ${C.theadBorder};text-align:center;">Grade</th>
        </tr>
      </thead>
      <tbody>${subjectRows}</tbody>
    </table>

    <!-- ── FOOTER ── -->
    <div style="padding:14px 20px 20px;background:${C.footerBg};border-top:2px solid ${accentHex};display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${scalePills}</div>
        <div style="font-size:10px;color:${C.textLight};white-space:nowrap;">Generated ${dateStr}</div>
      </div>
      ${showSig ? `
      <div style="display:flex;justify-content:space-around;gap:24px;padding-top:18px;margin-top:6px;border-top:1px solid ${C.footerBorder};">
        <div style="text-align:center;flex:1;max-width:180px;">
          <div style="height:52px;border-bottom:1.5px solid ${C.textLight};margin-bottom:8px;"></div>
          <div style="font-size:10.5px;font-weight:600;color:${C.textMuted};">${tn ? tn : 'Class Teacher'}</div>
          <div style="font-size:9px;color:${C.textLight};margin-top:2px;letter-spacing:0.04em;text-transform:uppercase;">Class Teacher</div>
        </div>
        ${principal ? `
        <div style="text-align:center;flex:1;max-width:180px;">
          <div style="height:52px;border-bottom:1.5px solid ${C.textLight};margin-bottom:8px;"></div>
          <div style="font-size:10.5px;font-weight:600;color:${C.textMuted};">${principal}</div>
          <div style="font-size:9px;color:${C.textLight};margin-top:2px;letter-spacing:0.04em;text-transform:uppercase;">Principal</div>
        </div>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

// ════════════════════════════════════════════
//  PDF GENERATION PROGRESS OVERLAY
// ════════════════════════════════════════════

let _pdfGenCancelRequested = false;

function _pdfGenCancel() {
  _pdfGenCancelRequested = true;
  // Update UI immediately so user sees feedback
  const title = document.getElementById('pdfGenTitle');
  const step  = document.getElementById('pdfGenStep');
  const btn   = document.getElementById('pdfGenCancelBtn');
  if (title) title.textContent = 'Cancelling…';
  if (step)  step.innerHTML    = 'Stopping after current card';
  if (btn)   btn.disabled      = true;
}

function _pdfGenOpen({ title = 'Generating PDF…', name = '', step = '', total = 0 }) {
  const overlay  = document.getElementById('pdfGenOverlay');
  const elTitle  = document.getElementById('pdfGenTitle');
  const elStep   = document.getElementById('pdfGenStep');
  const elBar    = document.getElementById('pdfGenBar');
  const elCounts = document.getElementById('pdfGenCounts');

  elTitle.textContent = title;
  // Rebuild step innerHTML — this is the sole place that sets the name display.
  // Do NOT separately set elName.textContent: the innerHTML assignment below
  // destroys any previously fetched #pdfGenName reference, causing a null crash
  // on the second call (e.g. export-all after export-one).
  elStep.innerHTML = step
    ? `${step}<br><span class="pdf-gen-name">${name}</span>`
    : `Preparing report card for<br><span class="pdf-gen-name">${name}</span>`;
  elBar.style.width     = '0%';
  elBar.style.transition = 'width 0.35s cubic-bezier(0.4,0,0.2,1)';

  // Reset cancel state
  _pdfGenCancelRequested = false;
  const cancelBtn = document.getElementById('pdfGenCancelBtn');
  if (cancelBtn) cancelBtn.disabled = false;

  if (total > 1) {
    elCounts.textContent = `0 / ${total}`;
    elCounts.classList.remove('hidden');
  } else {
    elCounts.classList.add('hidden');
  }

  // Lock both export buttons so user can't double-trigger
  const btnOne = document.getElementById('scDownloadOneBtn');
  const btnAll = document.getElementById('scDownloadAllBtn');
  if (btnOne) btnOne.disabled = true;
  if (btnAll) btnAll.disabled = true;

  overlay.classList.add('open');
}

function _pdfGenUpdate({ current = 0, total = 1, name = '', step = '' }) {
  const pct      = total > 0 ? Math.round((current / total) * 100) : 0;
  const elBar    = document.getElementById('pdfGenBar');
  const elCounts = document.getElementById('pdfGenCounts');
  const elStep   = document.getElementById('pdfGenStep');

  elBar.style.width = pct + '%';

  if (total > 1) {
    elCounts.textContent = `${current} / ${total}`;
  }

  // Update step text — rebuild innerHTML to keep .pdf-gen-name styled
  const label = step || 'Rendering';
  elStep.innerHTML = `${label}<br><span class="pdf-gen-name">${name}</span>`;
}

function _pdfGenFinish(successMsg) {
  // Animate bar to 100% then fade out after a short hold
  const elBar = document.getElementById('pdfGenBar');
  elBar.style.width = '100%';

  setTimeout(() => {
    const overlay = document.getElementById('pdfGenOverlay');
    overlay.style.transition = 'opacity 0.28s ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.classList.remove('open');
      overlay.style.opacity = '';
      overlay.style.transition = '';
    }, 300);
  }, 480);

  // Re-enable export buttons
  const btnOne = document.getElementById('scDownloadOneBtn');
  const btnAll = document.getElementById('scDownloadAllBtn');
  // scDownloadOneBtn is only enabled when a student is selected — restore that state
  const sel = document.getElementById('scStudentSelect');
  if (btnOne) btnOne.disabled = !(sel && sel.value !== '');
  if (btnAll) btnAll.disabled = false;

  if (successMsg) window.toast(successMsg, 'success');
}

// ── Export a single student card as PDF ──
async function exportOneStudentCard() {
  const sel = document.getElementById('scStudentSelect');
  const idx = parseInt(sel.value);
  if (isNaN(idx) || !results[idx]) { window.toast('Select a student first', 'error'); return; }
  if (!window.jspdf) { window.toast('jsPDF not loaded yet', 'error'); return; }

  const r = results[idx];

  _pdfGenOpen({
    title: 'Generating PDF…',
    name:  r.student,
    step:  'Rendering report card for',
    total: 1,
  });

  // Small yield so the overlay paints before the heavy render starts
  await new Promise(res => setTimeout(res, 30));

  const pdfBlob = await _renderStudentCardToPdfBlob(r);

  if (!pdfBlob) {
    _pdfGenFinish();  // close overlay even on failure (error toast already shown inside)
    return;
  }

  const cn   = (document.getElementById('className').value || 'Class').replace(/\s+/g,'_');
  const name = r.student.replace(/\s+/g,'_');
  const url  = URL.createObjectURL(pdfBlob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${cn}_${name}_ReportCard.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);

  _pdfGenFinish(`Card exported for ${r.student}`);
  window.showDownloadTip && window.showDownloadTip();
}

// ── Export all students as a ZIP of PDFs ──
async function exportAllStudentCards() {
  if (!results.length) { window.toast('No results to export', 'error'); return; }
  if (typeof JSZip === 'undefined') { window.toast('JSZip not loaded', 'error'); return; }

  const total = results.length;

  _pdfGenOpen({
    title: `Generating ${total} PDF${total > 1 ? 's' : ''}…`,
    name:  results[0].student,
    step:  'Starting with',
    total,
  });
  await new Promise(res => setTimeout(res, 30));

  const zip = new JSZip();
  const cn  = (document.getElementById('className').value || 'Class').replace(/\s+/g,'_');

  for (let i = 0; i < total; i++) {
    // Check if user cancelled
    if (_pdfGenCancelRequested) {
      _pdfGenFinish(i > 0 ? `Cancelled — ${i} card${i > 1 ? 's' : ''} exported` : null);
      return;
    }

    const r = results[i];

    _pdfGenUpdate({
      current: i,
      total,
      name: r.student,
      step: `Rendering card ${i + 1} of ${total} —`,
    });
    await new Promise(res => setTimeout(res, 10)); // yield so UI repaints

    try {
      const pdfBlob = await _renderStudentCardToPdfBlob(r);
      if (pdfBlob) {
        const name = r.student.replace(/[^a-zA-Z0-9_\- ]/g,'').trim().replace(/\s+/g,'_');
        zip.file(`${name}_ReportCard.pdf`, pdfBlob);
      }
    } catch(e) {
      console.warn('Card failed for', r.student, e);
    }
  }

  _pdfGenUpdate({ current: total, total, name: 'Compressing ZIP…', step: '' });
  await new Promise(res => setTimeout(res, 10));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `${cn}_ReportCards.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);

  _pdfGenFinish(`ZIP with ${total} student cards downloaded!`);
  window.showDownloadTip && window.showDownloadTip();
}

// ── Core: render one student card HTML to a PDF Blob using jsPDF + html2canvas ──
async function _renderStudentCardToPdfBlob(r) {
  if (!window.jspdf) return null;
  // Ensure latest unsaved branding edits are in brandingSettings before PDF render
  window._syncBrandingFromDOM();

  // ── PDF / canvas geometry ─────────────────────────────────────────────────
  // A4 portrait: 210 × 297 mm.
  // At 96 dpi  → 794 × 1123 px (CSS pixels).
  // We render the card at A4 content width (margin on each side = MARGIN_MM).
  // scale:2 gives retina-quality sharpness on the captured canvas.
  //
  // FIX: Use an off-screen iframe so the card is laid out in a clean, isolated
  // viewport that is exactly CARD_W_PX wide. This avoids two key problems:
  //   1. The main page's <html> has `overflow-y:scroll` (scrollbar-gutter:stable)
  //      which eats ~17 px, causing percentage widths to resolve incorrectly when
  //      html2canvas sets windowWidth to CARD_W_PX but the actual layout gutter
  //      is already reserved.
  //   2. `position:fixed` overlays in the live DOM can be clipped or composited
  //      differently across browsers when the element is wider than the viewport.
  //
  // Using a hidden <iframe> with explicit width gives us a pristine, full-width
  // layout context that matches what html2canvas captures.
  const PDF_W_MM   = 210;
  const PDF_H_MM   = 297;
  const MARGIN_MM  = 12;
  const PRINT_W_MM = PDF_W_MM - MARGIN_MM * 2;   // 186 mm usable width
  const SCALE      = 3;                            // 3× → ~216 DPI effective print resolution

  // Card content pixel width = A4 usable area at 96 dpi.
  // 96 dpi → 1 mm = 96/25.4 ≈ 3.7795 px
  const MM_TO_PX   = 96 / 25.4;
  const CARD_W_PX  = Math.round(PRINT_W_MM * MM_TO_PX);  // ≈ 703 px (exact A4 content width)

  // ── Build the card markup ─────────────────────────────────────────────────
  const cardHTML = _buildStudentCardHTML(r, true);   // always light-mode for PDF

  // ── Render inside a hidden iframe for a clean, isolated layout context ────
  const iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'z-index:-1',        // behind everything — invisible but rendered
    'opacity:0',
    'pointer-events:none',
    `width:${CARD_W_PX}px`,
    'height:2000px',     // tall enough; we measure actual height below
    'border:none',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(iframe);

  try {
    // ── Populate the iframe with a minimal document ───────────────────────
    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(`<!DOCTYPE html>
<html data-theme="light" style="margin:0;padding:0;background:#fff;overflow:hidden;">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; background: #ffffff; width: ${CARD_W_PX}px; overflow: hidden; }
  body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
</style>
</head>
<body>${cardHTML}
</body>
</html>`);
    iDoc.close();
    /* ---- original iDoc.close() call and the stray PWA block that used to
            follow are now consolidated here; the PWA comment below is inert  ---- */
    // ══ PWA block was accidentally inside the iframe write — removed ══

    // Wait for fonts + full layout paint (longer budget at scale:3)
    if (iDoc.fonts && iDoc.fonts.ready) await iDoc.fonts.ready;
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    await new Promise(res => setTimeout(res, 300));

    // Measure the card's true rendered height inside the iframe
    const cardEl   = iDoc.body.firstElementChild || iDoc.body;
    // Add a small bottom padding to the body so html2canvas captures the card's
    // border-bottom (which sits outside scrollHeight and would otherwise be clipped)
    iDoc.body.style.paddingBottom = '6px';
    const cardH_px = Math.ceil(iDoc.body.scrollHeight);

    // Resize iframe to exact content height to avoid any clipping
    iframe.style.height = cardH_px + 'px';
    await new Promise(res => requestAnimationFrame(res));

    // ── Capture the card via html2canvas ─────────────────────────────────
    const canvasEl = await html2canvas(iDoc.body, {
      scale:           SCALE,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: '#ffffff',
      logging:         false,
      width:           CARD_W_PX,
      height:          cardH_px,
      windowWidth:     CARD_W_PX,
      windowHeight:    cardH_px,
      scrollX:         0,
      scrollY:         0,
      x:               0,
      y:               0,
      onclone: (cloneDoc) => {
        // Ensure cloned document is also forced to light mode
        cloneDoc.documentElement.setAttribute('data-theme', 'light');
        cloneDoc.documentElement.style.overflow = 'hidden';
        cloneDoc.body.style.width    = CARD_W_PX + 'px';
        cloneDoc.body.style.overflow = 'hidden';
        cloneDoc.body.style.background = '#ffffff';
      }
    });

    // ── Collect row boundaries for smart page-break detection ────────────
    // We measure every <tr> in the iframe so we know exactly where each row
    // starts and ends (in CSS px, relative to the top of the body). The page
    // slicer will then snap its cut to the nearest row boundary so no row is
    // ever split across two PDF pages.
    const rowBoundaries = []; // [ { top, bottom } ] in CSS px
    const allRows = iDoc.querySelectorAll('tr');
    allRows.forEach(tr => {
      const rect = tr.getBoundingClientRect();
      // getBoundingClientRect() is relative to the iframe viewport (top:0),
      // which equals the document offset because we scrolled to 0.
      const top    = Math.round(rect.top  + (iframe.contentWindow.scrollY || 0));
      const bottom = Math.round(rect.bottom + (iframe.contentWindow.scrollY || 0));
      if (bottom > top) rowBoundaries.push({ top, bottom });
    });
    // Also collect any non-table block-level elements (header band, summary strip, footer)
    // so we never split those either.
    // Use the card's direct children — each is a discrete visual section.
    const cardRoot = iDoc.body.firstElementChild;
    if (cardRoot) {
      Array.from(cardRoot.children).forEach(el => {
        const rect   = el.getBoundingClientRect();
        const top    = Math.round(rect.top    + (iframe.contentWindow.scrollY || 0));
        const bottom = Math.round(rect.bottom + (iframe.contentWindow.scrollY || 0));
        if (bottom > top) rowBoundaries.push({ top, bottom });
      });
    }
    rowBoundaries.sort((a, b) => a.top - b.top);

    // ── Helper: given a naive page-cut at `naiveCutPx` (CSS px), walk
    // backward to find the last row boundary that ends at or before that cut.
    // This ensures the cut always falls cleanly between rows.
    function smartCutY(naiveCutPx) {
      // Find the last row whose bottom edge is <= naiveCutPx
      let bestCut = naiveCutPx;
      for (let i = rowBoundaries.length - 1; i >= 0; i--) {
        if (rowBoundaries[i].bottom <= naiveCutPx) {
          bestCut = rowBoundaries[i].bottom;
          break;
        }
        // If the naive cut falls *inside* this row, back up to the row's top
        if (rowBoundaries[i].top < naiveCutPx) {
          bestCut = rowBoundaries[i].top;
          break;
        }
      }
      return bestCut;
    }

    // ── Compose PDF pages ─────────────────────────────────────────────────
    // pxPerMm: how many captured canvas-px correspond to 1 mm of printed width.
    // canvasEl.width = CARD_W_PX * SCALE (due to scale:2).
    // PRINT_W_MM = the usable mm width on the A4 page.
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const canvasW      = canvasEl.width;            // CARD_W_PX * SCALE
    const canvasH      = canvasEl.height;           // cardH_px  * SCALE
    const pxPerMm      = canvasW / PRINT_W_MM;      // scale-aware canvas-px → mm
    const pageH_css    = PDF_H_MM - MARGIN_MM * 2;  // usable page height in mm
    const pageH_cvpx   = Math.round(pageH_css * pxPerMm);   // …in canvas px
    const pageH_csspx  = Math.round(pageH_css * MM_TO_PX);  // …in CSS px (for row lookup)

    let srcY_cv = 0;   // current Y position in canvas pixels
    let srcY_cs = 0;   // matching Y in CSS pixels (srcY_cv / SCALE)
    let pageNum = 0;

    while (srcY_cv < canvasH) {
      if (pageNum > 0) pdf.addPage();

      // Naive end of this page in CSS px
      const naiveEndCss = srcY_cs + pageH_csspx;

      // Snap to a clean row boundary (never cuts mid-row)
      const snappedEndCss = Math.min(smartCutY(naiveEndCss), cardH_px);
      // Convert back to canvas px (multiply by SCALE)
      // On the last page, always go to the true canvas bottom so the card's
      // border-bottom (which lives after the last row boundary) is never clipped.
      const isLastPage   = (snappedEndCss >= cardH_px) || (naiveEndCss >= cardH_px);
      const snappedEndCv = isLastPage ? canvasH : Math.min(Math.round(snappedEndCss * SCALE), canvasH);

      const sliceH_cv = snappedEndCv - srcY_cv;
      if (sliceH_cv <= 0) break;

      // Render this slice into a temp canvas
      const tmp = document.createElement('canvas');
      tmp.width  = canvasW;
      tmp.height = sliceH_cv;
      const ctx  = tmp.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, sliceH_cv);
      ctx.drawImage(canvasEl, 0, srcY_cv, canvasW, sliceH_cv, 0, 0, canvasW, sliceH_cv);

      // Exact mm height for this slice — preserves aspect ratio perfectly
      const sliceH_mm = sliceH_cv / pxPerMm;
      // Lossless PNG — no compression artefacts on text edges or thin lines
      pdf.addImage(tmp.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM, PRINT_W_MM, sliceH_mm);

      srcY_cv  = snappedEndCv;
      srcY_cs  = snappedEndCss;
      pageNum++;
    }

    return pdf.output('blob');

  } catch(e) {
    console.error('Student card PDF error:', e);
    window.toast('PDF render failed: ' + e.message, 'error');
    return null;
  } finally {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
  }
}

// ════════════════════════════════════════════
//  END INDIVIDUAL STUDENT REPORT CARD ENGINE
// ════════════════════════════════════════════






// ── Window exports ──
Object.assign(window, {
  _pdfGenCancel,
  closeStudentCardModal,
  exportAllStudentCards,
  exportOneStudentCard,
  openStudentCardModal,
  renderStudentCard,
  scNav
});
