(function () {

  /* ════════════════════════════════════════
     A. EDUCATIONAL SYMBOL LAYER
     Scatter grade letters, math symbols,
     subject icons around the background
  ════════════════════════════════════════ */
  var symbolData = [
    /* Grade letters */
    { t:'A+', x:4,   y:8,   sz:52, op:0.09, rot:-12, col:'#60a5fa', dur:9,  del:0 },
    { t:'A',  x:88,  y:12,  sz:40, op:0.07, rot:8,   col:'#a78bfa', dur:11, del:1.2 },
    { t:'B+', x:92,  y:72,  sz:36, op:0.06, rot:-6,  col:'#34d399', dur:10, del:0.5 },
    { t:'B',  x:6,   y:78,  sz:44, op:0.08, rot:10,  col:'#60a5fa', dur:13, del:2 },
    { t:'A+', x:50,  y:3,   sz:30, op:0.05, rot:-4,  col:'#fbbf24', dur:8,  del:0.8 },
    { t:'C+', x:14,  y:45,  sz:28, op:0.05, rot:14,  col:'#f472b6', dur:12, del:1.8 },
    { t:'A',  x:78,  y:40,  sz:34, op:0.06, rot:-9,  col:'#34d399', dur:9,  del:3 },
    { t:'95', x:22,  y:88,  sz:26, op:0.06, rot:6,   col:'#a78bfa', dur:14, del:0.3 },
    { t:'78', x:72,  y:85,  sz:24, op:0.05, rot:-7,  col:'#60a5fa', dur:10, del:2.5 },
    { t:'100',x:55,  y:91,  sz:22, op:0.05, rot:3,   col:'#fbbf24', dur:11, del:1.5 },
    /* Math / science symbols */
    { t:'∑',  x:35,  y:6,   sz:38, op:0.07, rot:-5,  col:'#60a5fa', dur:10, del:0.7 },
    { t:'π',  x:68,  y:8,   sz:34, op:0.07, rot:7,   col:'#a78bfa', dur:9,  del:2.2 },
    { t:'√',  x:8,   y:28,  sz:30, op:0.06, rot:-10, col:'#34d399', dur:12, del:1 },
    { t:'∫',  x:82,  y:28,  sz:32, op:0.06, rot:5,   col:'#f472b6', dur:11, del:3.5 },
    { t:'Δ',  x:18,  y:62,  sz:28, op:0.06, rot:-14, col:'#fbbf24', dur:13, del:0.2 },
    { t:'∞',  x:76,  y:60,  sz:26, op:0.06, rot:9,   col:'#60a5fa', dur:10, del:1.7 },
    { t:'÷',  x:42,  y:93,  sz:30, op:0.05, rot:-3,  col:'#a78bfa', dur:9,  del:2.8 },
    { t:'×',  x:62,  y:94,  sz:24, op:0.05, rot:11,  col:'#34d399', dur:11, del:0.6 },
    /* Subject symbols */
    { t:'📐', x:28,  y:16,  sz:22, op:0.12, rot:-8,  col:'#fff',    dur:12, del:1.3 },
    { t:'📏', x:56,  y:14,  sz:20, op:0.11, rot:5,   col:'#fff',    dur:10, del:2.6 },
    { t:'🔬', x:84,  y:50,  sz:20, op:0.10, rot:-4,  col:'#fff',    dur:9,  del:0.9 },
    { t:'📚', x:10,  y:52,  sz:20, op:0.10, rot:7,   col:'#fff',    dur:13, del:3.2 },
    { t:'🖊️', x:46,  y:88,  sz:18, op:0.10, rot:-6,  col:'#fff',    dur:11, del:1.9 },
    { t:'🎓', x:72,  y:18,  sz:22, op:0.11, rot:3,   col:'#fff',    dur:10, del:0.4 },
    { t:'📊', x:20,  y:32,  sz:18, op:0.09, rot:-12, col:'#fff',    dur:12, del:2.1 },
    { t:'✏️', x:88,  y:82,  sz:18, op:0.09, rot:10,  col:'#fff',    dur:9,  del:1.6 },
    /* Formula fragments */
    { t:'f(x)',x:32,  y:78,  sz:18, op:0.07, rot:-5,  col:'#93c5fd', dur:11, del:0.1 },
    { t:'y=mx',x:60,  y:78,  sz:16, op:0.06, rot:6,   col:'#c4b5fd', dur:13, del:2.4 },
    { t:'E=mc²',x:5,  y:18,  sz:14, op:0.07, rot:-8,  col:'#6ee7b7', dur:10, del:3.1 },
    { t:'2+2',x:92,  y:34,  sz:16, op:0.06, rot:4,   col:'#fcd34d', dur:12, del:0.6 },
  ];

  var symContainer = document.getElementById('gfeSymbols');
  symbolData.forEach(function(s) {
    var el = document.createElement('div');
    el.className = 'gfe-sym';
    el.textContent = s.t;
    el.style.cssText = [
      'left:'  + s.x + '%',
      'top:'   + s.y + '%',
      '--sz:'  + s.sz + 'px',
      '--op:'  + s.op,
      '--rot:' + s.rot + 'deg',
      '--col:' + s.col,
      '--dur:' + s.dur + 's',
      '--del:' + s.del + 's',
      'font-size:' + s.sz + 'px',
    ].join(';');
    symContainer.appendChild(el);
  });


  /* ════════════════════════════════════════
     B. CANVAS — Aurora + Chalk Dust + Streaks
  ════════════════════════════════════════ */
  var cvs = document.getElementById('gfeCanvas');
  var ctx = cvs.getContext('2d');
  var W, H, frame = 0, rafId;

  /* — Aurora waves — */
  var waves = [
    { color:[59,130,246],  alpha:0.16, amp:0.26, freq:0.0011, speed:0.00038, yBase:0.32 },
    { color:[139,92,246],  alpha:0.13, amp:0.20, freq:0.0017, speed:0.00055, yBase:0.48 },
    { color:[16,185,129],  alpha:0.09, amp:0.17, freq:0.0008, speed:0.00028, yBase:0.62 },
    { color:[99,102,241],  alpha:0.08, amp:0.13, freq:0.0020, speed:0.00065, yBase:0.42 },
    { color:[245,158,11],  alpha:0.055,amp:0.09, freq:0.0014, speed:0.00045, yBase:0.56 },
  ];

  /* — Chalk dust particles — */
  var DUST = 90;
  var dust = [];
  for (var i = 0; i < DUST; i++) {
    dust.push({
      x:  Math.random(),
      y:  Math.random(),
      vx: (Math.random() - 0.5) * 0.0008,
      vy: -Math.random() * 0.0006 - 0.0001,   /* drift upward slowly */
      r:  Math.random() * 1.8 + 0.3,
      a:  Math.random() * 0.18 + 0.04,
      col: ['rgba(255,255,255,','rgba(147,197,253,','rgba(196,181,253,','rgba(110,231,183,'][Math.floor(Math.random()*4)],
      life: Math.random(),    /* phase offset */
    });
  }

  /* — Floating chalk streaks (short lines) — */
  var STREAKS = 18;
  var streaks = [];
  for (var s = 0; s < STREAKS; s++) {
    streaks.push({
      x:  Math.random(),
      y:  Math.random(),
      vx: (Math.random()-0.5) * 0.0004,
      vy: -Math.random() * 0.0003 - 0.00005,
      len: Math.random() * 28 + 8,
      ang: Math.random() * Math.PI,
      a:  Math.random() * 0.07 + 0.02,
      col:['rgba(255,255,255,','rgba(147,197,253,','rgba(167,139,250,'][s%3],
    });
  }

  function resize() {
    W = cvs.width  = window.innerWidth;
    H = cvs.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    frame++;

    /* —— Aurora bands —— */
    waves.forEach(function(w) {
      var pts = [];
      var steps = 100;
      for (var i = 0; i <= steps; i++) {
        var x = (i / steps) * W;
        var y = H * w.yBase
              + Math.sin(x * w.freq + frame * w.speed * 60)          * H * w.amp
              + Math.sin(x * w.freq * 2.4 + frame * w.speed * 42 + 1.3) * H * w.amp * 0.38
              + Math.sin(x * w.freq * 0.6 + frame * w.speed * 22 + 2.5) * H * w.amp * 0.22;
        pts.push([x, y]);
      }

      var r=w.color[0],g=w.color[1],b=w.color[2];
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0,   'rgba('+r+','+g+','+b+',0)');
      grad.addColorStop(0.28,'rgba('+r+','+g+','+b+','+w.alpha+')');
      grad.addColorStop(0.72,'rgba('+r+','+g+','+b+','+w.alpha+')');
      grad.addColorStop(1,   'rgba('+r+','+g+','+b+',0)');

      ctx.beginPath();
      ctx.moveTo(0, H);
      pts.forEach(function(p, i) {
        if (i===0) { ctx.lineTo(p[0],p[1]); }
        else {
          var prev=pts[i-1], cpx=(prev[0]+p[0])/2;
          ctx.quadraticCurveTo(prev[0],prev[1],cpx,(prev[1]+p[1])/2);
        }
      });
      ctx.lineTo(W,H); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      /* glowing edge */
      ctx.beginPath();
      pts.forEach(function(p, i) {
        if (i===0) { ctx.moveTo(p[0],p[1]); }
        else {
          var prev=pts[i-1], cpx=(prev[0]+p[0])/2;
          ctx.quadraticCurveTo(prev[0],prev[1],cpx,(prev[1]+p[1])/2);
        }
      });
      ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+(w.alpha*2.4)+')';
      ctx.lineWidth = 1.4;
      ctx.shadowColor = 'rgba('+r+','+g+','+b+',0.55)';
      ctx.shadowBlur  = 16;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    });

    /* —— Chalk dust —— */
    dust.forEach(function(d) {
      d.x += d.vx; d.y += d.vy;
      if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      if (d.x < -0.01) d.x = 1.01;
      if (d.x > 1.01)  d.x = -0.01;
      var alpha = d.a * (0.6 + 0.4 * Math.sin(frame * 0.03 + d.life * 6));
      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, d.r, 0, Math.PI*2);
      ctx.fillStyle = d.col + alpha + ')';
      ctx.fill();
    });

    /* —— Chalk streaks —— */
    streaks.forEach(function(sk) {
      sk.x += sk.vx; sk.y += sk.vy;
      if (sk.y < -0.05) { sk.y = 1.05; sk.x = Math.random(); }
      var alpha = sk.a * (0.5 + 0.5 * Math.sin(frame * 0.02 + sk.x * 8));
      var cx = sk.x*W, cy = sk.y*H;
      var hx = Math.cos(sk.ang)*sk.len*0.5, hy = Math.sin(sk.ang)*sk.len*0.5;
      var grd = ctx.createLinearGradient(cx-hx,cy-hy,cx+hx,cy+hy);
      grd.addColorStop(0,   sk.col+'0)');
      grd.addColorStop(0.5, sk.col+alpha+')');
      grd.addColorStop(1,   sk.col+'0)');
      ctx.beginPath();
      ctx.moveTo(cx-hx, cy-hy);
      ctx.lineTo(cx+hx, cy+hy);
      ctx.strokeStyle = grd;
      ctx.lineWidth   = Math.random() * 1.5 + 0.5;
      ctx.stroke();
    });

    rafId = requestAnimationFrame(drawFrame);
  }
  drawFrame();


  /* ════════════════════════════════════════
     C. TYPING TAGLINE
  ════════════════════════════════════════ */
  var TAGLINES = ['Smart Grade Management','Instant Report Cards','Analytics at a Glance'];
  var taglineEl = document.getElementById('gfpTagline');
  var tIdx=0, charIdx=0, isDeleting=false, typeTimer;

  function typeStep() {
    var full = TAGLINES[tIdx];
    if (!isDeleting) {
      charIdx++;
      taglineEl.textContent = full.slice(0,charIdx);
      if (charIdx===full.length) { typeTimer=setTimeout(startDel,1900); return; }
    } else {
      charIdx--;
      taglineEl.textContent = full.slice(0,charIdx);
      if (charIdx===0) { isDeleting=false; tIdx=(tIdx+1)%TAGLINES.length; typeTimer=setTimeout(typeStep,420); return; }
    }
    typeTimer = setTimeout(typeStep, isDeleting?38:68);
  }
  function startDel() { isDeleting=true; typeTimer=setTimeout(typeStep,38); }
  setTimeout(typeStep, 850);


  /* ════════════════════════════════════════
     D. TIME-OF-DAY GREETING
  ════════════════════════════════════════ */
  var greetEl = document.getElementById('gfpGreeting');
  var h = new Date().getHours();
  var greetMap = [
    [5, 12, '☀️',  'Good morning'],
    [12,17, '⛅',  'Good afternoon'],
    [17,21, '🌆', 'Good evening'],
    [0, 5,  '🌙', 'Good night'],
    [21,24, '🌙', 'Good night'],
  ];

  // Build the base greeting text (emoji + phrase, no name yet)
  var greetBase = '';
  greetMap.forEach(function(g){ if(h>=g[0]&&h<g[1]) greetBase = g[2]+'\u2002'+g[3]; });
  greetEl.textContent = greetBase;

  // Resolve teacher name asynchronously:
  //   1. Try IndexedDB primary store (gradeflow_db / 'data')
  //   2. Fall back to localStorage
  //   3. If no name found (first visit or not set) — keep plain greeting
  (function resolveGreetingName() {
    var SESSION_KEY = 'schoolResultManager_session_v1';

    function applyName(raw) {
      try {
        var parsed = JSON.parse(raw);
        var fullName = (parsed && parsed.meta && typeof parsed.meta.teacherName === 'string')
          ? parsed.meta.teacherName.trim() : '';
        if (fullName) {
          // Smart display name: if name starts with a title (Mr., Dr., etc.)
          // keep "Title Firstname" — otherwise just the first word.
          var parts = fullName.trim().split(/\s+/);
          var TITLES = /^(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Rev\.?)$/i;
          var displayName = (parts.length >= 2 && TITLES.test(parts[0]))
            ? parts[0] + ' ' + parts[1]   // e.g. "Mr. Ahmed"
            : parts[0];                    // e.g. "Rashika"
          greetEl.textContent = greetBase + ', ' + displayName;
        }
        // No name set → leave plain greeting already shown
      } catch(e) { /* malformed data — stay silent */ }
    }

    function fallbackToLocalStorage() {
      try {
        var raw = localStorage.getItem(SESSION_KEY);
        if (raw) applyName(raw);
      } catch(ex) {}
    }

    // Primary: IndexedDB
    try {
      var idbReq = indexedDB.open('gradeflow_db', 2);
      idbReq.onsuccess = function(ev) {
        try {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains('data')) { fallbackToLocalStorage(); return; }
          var tx     = db.transaction('data', 'readonly');
          var getReq = tx.objectStore('data').get(SESSION_KEY);
          getReq.onsuccess = function() {
            if (getReq.result) { applyName(getReq.result); }
            else               { fallbackToLocalStorage(); }
          };
          getReq.onerror = fallbackToLocalStorage;
        } catch(ex) { fallbackToLocalStorage(); }
      };
      idbReq.onerror = fallbackToLocalStorage;
    } catch(ex) { fallbackToLocalStorage(); }
  })();


  /* ════════════════════════════════════════
     E. PROGRESS MEMORY
     Stats panel (Students / Exams / Last Save) removed — always show
     feature pills and a cycling loading status instead.
  ════════════════════════════════════════ */
  var memEl    = document.getElementById('gfpMemory');
  var statusEl = document.getElementById('gfpStatus');

  /* Detect whether we are restoring an existing session so we can
     tailor the status line — we still read the class name for that. */
  var _cn = '';
  var _hasSession = false;
  try {
    _cn = localStorage.getItem('rsm_class_name') || localStorage.getItem('gf_class_name') || '';
    for (var _k = 0; _k < localStorage.length; _k++) {
      var _key = localStorage.key(_k);
      if (_key && (_key.indexOf('rsm_') === 0 || _key.indexOf('gf_') === 0)) {
        _hasSession = true; break;
      }
    }
  } catch(e) {}

  /* Always render the feature pills — clean, consistent UI */
  memEl.innerHTML = '<div class="gfp-features">'
    + '<span class="gfp-fpill gfp-fpill-b">📝 Marks Entry</span>'
    + '<span class="gfp-fpill gfp-fpill-p">🎯 Auto Grades</span>'
    + '<span class="gfp-fpill gfp-fpill-g">📊 Analytics</span>'
    + '<span class="gfp-fpill gfp-fpill-a">📄 PDF Reports</span>'
    + '</div>';

  /* Status line: restoring vs. fresh load */
  if (_hasSession) {
    var _restoreMsgs = [
      _cn ? 'Restoring ' + _cn + '\u2026' : 'Restoring session\u2026',
      'Loading data\u2026',
      'Almost ready\u2026'
    ];
    var _rIdx = 0;
    statusEl.textContent = _restoreMsgs[0];
    var _rt = setInterval(function() {
      _rIdx = (_rIdx + 1) % _restoreMsgs.length;
      statusEl.textContent = _restoreMsgs[_rIdx];
    }, 900);
    setTimeout(function() { clearInterval(_rt); }, 2800);
  } else {
    var _newMsgs = ['Loading\u2026', 'Preparing workspace\u2026', 'Almost ready\u2026'];
    var _nIdx = 0;
    statusEl.textContent = _newMsgs[0];
    var _nt = setInterval(function() {
      _nIdx = (_nIdx + 1) % _newMsgs.length;
      statusEl.textContent = _newMsgs[_nIdx];
    }, 900);
    setTimeout(function() { clearInterval(_nt); }, 2800);
  }


  /* ════════════════════════════════════════
     F. DISMISS
  ════════════════════════════════════════ */
  function hideSplash() {
    var sp=document.getElementById('gf-splash');
    if(!sp||sp.classList.contains('gfp-exit')) return;
    clearTimeout(typeTimer); cancelAnimationFrame(rafId);
    sp.classList.add('gfp-exit');
    setTimeout(function(){ if(sp&&sp.parentNode) sp.parentNode.removeChild(sp); },680);
  }
  window.gfHideSplash = hideSplash;
  setTimeout(hideSplash, 3800);

})();
