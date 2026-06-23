// ── G.C.E. (O/L) Subject Autocomplete ──────────────────────────────────────
(function() {
  const OL_SUBJECTS = [
    {code:'11',name:'Buddhism'},{code:'12',name:'Saivanery'},{code:'14',name:'Catholicism'},
    {code:'15',name:'Christianity'},{code:'16',name:'Islam'},
    {code:'21',name:'Sinhala Language & Literature'},{code:'22',name:'Tamil Language & Literature'},
    {code:'31',name:'English Language'},{code:'32',name:'Mathematics'},
    {code:'33',name:'History'},{code:'34',name:'Science'},
    {code:'40',name:'Music (Oriental)'},{code:'41',name:'Music (Western)'},
    {code:'42',name:'Music (Carnatic)'},{code:'43',name:'Art'},
    {code:'44',name:'Dancing (Oriental)'},{code:'45',name:'Dancing (Bharata)'},
    {code:'46',name:'Appreciation of English Literary Texts'},
    {code:'47',name:'Appreciation of Sinhala Literary Texts'},
    {code:'48',name:'Appreciation of Tamil Literary Texts'},
    {code:'49',name:'Appreciation of Arabic Literary Texts'},
    {code:'50',name:'Drama and Theatre (Sinhala)'},
    {code:'51',name:'Drama and Theatre (Tamil)'},
    {code:'52',name:'Drama and Theatre (English)'},
    {code:'60',name:'Business & Accounting Studies'},{code:'61',name:'Geography'},
    {code:'62',name:'Civic Education'},{code:'63',name:'Entrepreneurship Studies'},
    {code:'64',name:'Second Language (Sinhala)'},{code:'65',name:'Second Language (Tamil)'},
    {code:'66',name:'Pali'},{code:'67',name:'Sanskrit'},{code:'68',name:'French'},
    {code:'69',name:'German'},{code:'70',name:'Hindi'},{code:'71',name:'Japanese'},
    {code:'72',name:'Arabic'},{code:'73',name:'Korean'},{code:'74',name:'Chinese'},
    {code:'75',name:'Russian'},
    {code:'80',name:'Information & Communication Technology'},
    {code:'81',name:'Agriculture & Food Technology'},
    {code:'82',name:'Aquatic Bioresources Technology'},
    {code:'84',name:'Art & Crafts'},{code:'85',name:'Home Economics'},
    {code:'86',name:'Health & Physical Education'},
    {code:'87',name:'Communication & Media Studies'},
    {code:'88',name:'Design & Construction Technology'},
    {code:'89',name:'Design & Mechanical Technology'},
    {code:'90',name:'Design, Electrical & Electronic Technology'},
    {code:'92',name:'Electronic Writing & Shorthand (Sinhala)'},
    {code:'93',name:'Electronic Writing & Shorthand (Tamil)'},
    {code:'94',name:'Electronic Writing & Shorthand (English)'},
  ];

  const ALIASES = {
    'ict':'Information & Communication Technology','it':'Information & Communication Technology',
    'maths':'Mathematics','math':'Mathematics','english':'English Language',
    'sinhala':'Sinhala Language & Literature','tamil':'Tamil Language & Literature',
    'science':'Science','history':'History','geo':'Geography','geography':'Geography',
    'art':'Art','music':'Music (Oriental)','commerce':'Business & Accounting Studies',
    'business':'Business & Accounting Studies','pe':'Health & Physical Education',
    'drama':'Drama and Theatre (Sinhala)','dancing':'Dancing (Oriental)',
    'french':'French','german':'German','arabic':'Arabic','pali':'Pali',
    'sanskrit':'Sanskrit','hindi':'Hindi','japanese':'Japanese','korean':'Korean',
    'chinese':'Chinese','russian':'Russian',
  };

  let acResults = [], acActiveIdx = -1;

  function acScore(s, q) {
    const n = s.name.toLowerCase();
    const al = ALIASES[q];
    if (al && al.toLowerCase() === n) return 200;
    if (n.startsWith(q)) return 100 + (q.length/n.length)*50;
    const words = n.split(/[\s&,()]+/);
    if (words.some(w => w.startsWith(q))) return 80 + (q.length/n.length)*30;
    if (n.includes(q)) return 50 + (q.length/n.length)*20;
    const qw = q.split(/\s+/);
    const hits = qw.filter(w => n.includes(w));
    if (hits.length === qw.length) return 30;
    if (hits.length) return 10*(hits.length/qw.length);
    return 0;
  }

  function acDoSearch(q, limit) {
    q = (q||'').toLowerCase().trim();
    if (!q) return [];
    return OL_SUBJECTS
      .map(s => ({...s, _s: acScore(s,q)}))
      .filter(s => s._s > 0)
      .sort((a,b) => b._s - a._s)
      .slice(0, limit||8);
  }

  function acHL(name, q) {
    if (!q) return name;
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return name;
    const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return esc(name.slice(0,idx)) + '<mark>' + esc(name.slice(idx,idx+q.length)) + '</mark>' + esc(name.slice(idx+q.length));
  }

  function acRender(items, q) {
    const dd = document.getElementById('acDropdown');
    if (!dd) return;
    dd.innerHTML = '';
    acActiveIdx = -1;
    if (!items.length) { dd.classList.remove('ac-open'); return; }
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'ac-item';
      li.setAttribute('role','option');
      li.innerHTML = '<span class="ac-item-name">' + acHL(item.name, q) + '</span>'
                   + '<span class="ac-item-code">Code ' + item.code + '</span>';
      li.addEventListener('mousedown', function(e) { e.preventDefault(); acPick(i); });
      li.addEventListener('mouseover', function() { acSetActive(i); });
      dd.appendChild(li);
    });
    dd.classList.add('ac-open');
  }

  function acSetActive(i) {
    const items = document.querySelectorAll('#acDropdown .ac-item');
    items.forEach((el,j) => el.classList.toggle('ac-active', j===i));
    acActiveIdx = i;
  }

  function acPick(i) {
    const item = acResults[i];
    if (!item) return;
    const inp = document.getElementById('subjectInput');
    if (inp) inp.value = item.name;
    acHide();
    if (inp) inp.focus();
  }

  window.acSearch = function(val) {
    acResults = acDoSearch(val);
    acRender(acResults, (val||'').trim());
  };

  window.acHide = function() {
    const dd = document.getElementById('acDropdown');
    if (dd) dd.classList.remove('ac-open');
    acActiveIdx = -1;
  };

  window.acKeydown = function(e) {
    const dd = document.getElementById('acDropdown');
    const open = dd && dd.classList.contains('ac-open');
    const n = acResults.length;

    if (e.key === 'ArrowDown') {
      if (!open && acResults.length) { dd.classList.add('ac-open'); }
      e.preventDefault(); acSetActive((acActiveIdx+1)%n); return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); acSetActive((acActiveIdx-1+n)%n); return;
    }
    if (e.key === 'Enter') {
      if (open && acActiveIdx >= 0) { e.preventDefault(); acPick(acActiveIdx); return; }
      // Fall through to default Enter behavior (focus max marks)
      acHide();
      document.getElementById('maxMarkInput') && document.getElementById('maxMarkInput').focus();
      return;
    }
    if (e.key === 'Escape') { acHide(); return; }
    if (e.key === 'Tab') {
      if (open) {
        if (acActiveIdx < 0 && n) acPick(0);
        else if (acActiveIdx >= 0) acPick(acActiveIdx);
        acHide();
      }
    }
  };
})();
