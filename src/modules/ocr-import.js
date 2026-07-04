// ═══════════════════════════════════════════════════════════════
//  src/modules/ocr-import.js
//  Camera / photo → AI OCR → auto-fill marks table.
//  Teacher points camera at a physical mark sheet → Claude
//  reads the marks → fills them into the current exam.
//  Uses the Anthropic Messages API (claude-sonnet-4-6).
// ═══════════════════════════════════════════════════════════════

let _ocrState = { imageDataUrl: null, stream: null };

function openOcrModal() {
  if (!window.students?.length || !window.subjects?.length) {
    window.toast('Add students and subjects first before using OCR import', 'error');
    return;
  }
  _ocrReset();
  document.getElementById('ocrModalOverlay').classList.add('open');
}

function closeOcrModal() {
  _ocrStopCamera();
  document.getElementById('ocrModalOverlay').classList.remove('open');
}

function _ocrReset() {
  _ocrState = { imageDataUrl: null, stream: null };
  _ocrSetView('upload');
  const canvas = document.getElementById('ocrCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function _ocrSetView(id) {
  ['upload', 'preview', 'processing', 'review'].forEach(v => {
    const el = document.getElementById('ocr-view-' + v);
    if (el) el.style.display = v === id ? '' : 'none';
  });
}

// ── Camera capture ────────────────────────────────────────────
async function ocrOpenCamera() {
  const video = document.getElementById('ocrVideo');
  if (!video) return;
  _ocrSetView('preview');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    _ocrState.stream = stream;
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    _ocrSetView('upload');
    window.toast(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera error: ' + err.message, 'error');
  }
}

function ocrCapture() {
  const video  = document.getElementById('ocrVideo');
  const canvas = document.getElementById('ocrCanvas');
  if (!video || !canvas) return;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  _ocrState.imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  _ocrStopCamera();
  _ocrSetView('preview');
  const img = document.getElementById('ocrPreviewImg');
  if (img) { img.src = _ocrState.imageDataUrl; img.style.display = ''; }
  document.getElementById('ocrVideo').style.display = 'none';
  document.getElementById('ocrCaptureBtn').style.display = 'none';
  document.getElementById('ocrConfirmBtn').style.display = '';
}

function _ocrStopCamera() {
  if (_ocrState.stream) { _ocrState.stream.getTracks().forEach(t => t.stop()); _ocrState.stream = null; }
}

// ── File upload ───────────────────────────────────────────────
function ocrHandleFile(e) {
  const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { window.toast('Please select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    _ocrState.imageDataUrl = ev.target.result;
    _ocrSetView('preview');
    const img = document.getElementById('ocrPreviewImg');
    if (img) { img.src = ev.target.result; img.style.display = ''; }
    document.getElementById('ocrVideo').style.display = 'none';
    document.getElementById('ocrCaptureBtn').style.display = 'none';
    document.getElementById('ocrConfirmBtn').style.display = '';
  };
  reader.readAsDataURL(file);
}

// ── Send to Claude API for OCR ────────────────────────────────
async function ocrProcess() {
  if (!_ocrState.imageDataUrl) { window.toast('No image to process', 'error'); return; }

  _ocrSetView('processing');
  document.getElementById('ocrStatusMsg').textContent = 'Reading mark sheet…';

  const studentNames = (window.students || []).map(s => s.name);
  const subjectNames = (window.subjects || []).map(s => `${s.name} (max: ${s.max})`);

  const prompt = `You are reading a school exam mark sheet image. Extract the marks table from this image.

Students in this class: ${studentNames.join(', ')}

Subjects in this exam: ${subjectNames.join(', ')}

Return ONLY a valid JSON object with this exact structure, no preamble or explanation:
{
  "marks": {
    "Student Name": { "Subject Name": <number or "AB" if absent>, ... },
    ...
  },
  "confidence": "high" | "medium" | "low",
  "notes": "any issues or unreadable cells"
}

Rules:
- Use "AB" if the student was marked absent for that subject
- Use null if the mark is not visible or unreadable
- Match student names exactly as given above (fuzzy match if needed)
- Match subject names exactly as given above
- Only include students and subjects that are in the lists above`;

  const base64 = _ocrState.imageDataUrl.split(',')[1];
  const mediaType = _ocrState.imageDataUrl.split(';')[0].split(':')[1];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) throw new Error('API error ' + response.status);

    const data = await response.json();
    const raw  = data.content?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    _ocrRenderReview(parsed);
  } catch (err) {
    _ocrSetView('upload');
    window.toast('OCR failed: ' + err.message, 'error');
    console.error('[OCR]', err);
  }
}

// ── Review screen ─────────────────────────────────────────────
function _ocrRenderReview(parsed) {
  const container = document.getElementById('ocrReviewTable');
  if (!container) return;

  const marks   = parsed.marks || {};
  const students = window.students || [];
  const subjects  = window.subjects  || [];

  // Count how many marks were found
  let found = 0, total = students.length * subjects.length;

  const rows = students.map(s => {
    const cells = subjects.map(sub => {
      const val = marks[s.name]?.[sub.name];
      found++;
      const displayVal = val === null || val === undefined ? '' : String(val);
      const isAB = displayVal === 'AB';
      const isNum = !isNaN(parseFloat(displayVal)) && displayVal !== '';
      const cellClass = isAB ? 'ocr-cell-ab' : isNum ? 'ocr-cell-ok' : 'ocr-cell-empty';
      return `<td class="${cellClass}">
        <input type="text" class="ocr-mark-input" data-student="${_ocrEsc(s.name)}" data-subject="${_ocrEsc(sub.name)}"
          value="${_ocrEsc(displayVal)}" maxlength="5"
          style="width:52px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--surface);color:var(--text);font-size:13px;" />
      </td>`;
    }).join('');
    return `<tr><td style="font-weight:500;padding:6px 10px;white-space:nowrap;">${_ocrEsc(s.name)}</td>${cells}</tr>`;
  }).join('');

  const headers = subjects.map(s => `<th style="font-size:11px;padding:6px 4px;min-width:60px;">${_ocrEsc(s.name)}<br><span style="opacity:0.5;">/${s.max}</span></th>`).join('');

  container.innerHTML = `
    <div class="ocr-confidence ocr-confidence-${parsed.confidence || 'medium'}">
      Confidence: <strong>${parsed.confidence || 'medium'}</strong>
      ${parsed.notes ? ` — ${_ocrEsc(parsed.notes)}` : ''}
    </div>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;font-size:13px;width:100%;">
        <thead><tr><th style="text-align:left;padding:6px 10px;">Student</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _ocrSetView('review');
}

// ── Apply marks to the live marks table ──────────────────────
function ocrApplyMarks() {
  const inputs = document.querySelectorAll('.ocr-mark-input');
  let applied = 0, skipped = 0;

  inputs.forEach(input => {
    const studentName = input.dataset.student;
    const subjectName = input.dataset.subject;
    const val = input.value.trim();
    if (!val) { skipped++; return; }

    const key = `${studentName}||${subjectName}`;
    if (val === 'AB') {
      window.marks[key] = 'AB';
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) { window.marks[key] = num; applied++; }
      else { skipped++; }
    }
  });

  // Trigger autosave and re-render marks table
  if (typeof window.markDirty === 'function') window.markDirty();
  if (typeof window.renderMarksTable === 'function') window.renderMarksTable();

  closeOcrModal();
  window.toast(`✓ ${applied} marks applied${skipped ? ', ' + skipped + ' skipped' : ''}`, 'success');
}

function _ocrEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

Object.assign(window, { openOcrModal, closeOcrModal, ocrOpenCamera, ocrCapture, ocrHandleFile, ocrProcess, ocrApplyMarks, _ocrReset, _ocrSetView });
