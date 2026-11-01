/* Fayda two-phone test plan. No libraries. Talks to Supabase's REST interface (schema `qe`).
 * Everything the page writes goes through textContent, never innerHTML, so a comment cannot inject markup. */
(function () {
  'use strict';

  var cfg = window.QE_CONFIG || {};
  var STATUSES = [['pass', 'Pass'], ['fail', 'Fail'], ['blocked', 'Blocked'], ['skipped', 'Skip']];
  var LABEL = { pass: 'Pass', fail: 'Fail', blocked: 'Blocked', skipped: 'Skipped' };
  var RANK = { fail: 4, blocked: 3, pass: 2, skipped: 1 }; // the worst current mark decides a step's colour
  var POLL_MS = 20000;
  var LIMIT = 10000;

  var state = { steps: [], results: [], notes: [], loaded: false, error: '' };
  var ui = {}; // per-step open form: { mode: 'mark'|'edit'|'add', status, text, ... }
  var el = {};
  var store = safeStorage();

  // ---------- small helpers ----------
  function safeStorage() {
    try { var t = '__qe'; window.localStorage.setItem(t, t); window.localStorage.removeItem(t); return window.localStorage; }
    catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; }
  }
  function h(tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function clean(s, max) { return String(s == null ? '' : s).replace(/\s+$/g, '').slice(0, max); }
  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  // Case text may use a little formatting: lines starting with "- " are bullets, **bold**, [label](link) and bare https:// links.
  // Built from DOM nodes, never innerHTML. A link must be https://... or a file in this site's downloads/ folder, nothing else.
  function inline(text) {
    var frag = document.createDocumentFragment();
    var re = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>"')]+)/g;
    var last = 0; var m;
    var safe = function (u) { return /^https:\/\/[^\s]+$/.test(u) || /^downloads\/[\w.\-]+$/.test(u); };
    var link = function (label, url) {
      var a = h('a', { href: url, text: label });
      if (url.indexOf('downloads/') === 0) a.setAttribute('download', '');
      else { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
      return a;
    };
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.slice(0, 2) === '**') frag.appendChild(h('strong', { text: tok.slice(2, -2) }));
      else if (tok.charAt(0) === '[') {
        var parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        frag.appendChild(parts && safe(parts[2]) ? link(parts[1], parts[2]) : document.createTextNode(tok));
      } else frag.appendChild(/^https:/.test(tok) ? link(tok, tok) : document.createTextNode(tok));
      last = m.index + tok.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function rich(text) {
    var frag = document.createDocumentFragment(); var list = null;
    String(text).split('\n').forEach(function (line) {
      var b = /^\s*[-•]\s+(.*)$/.exec(line);
      if (b) { if (!list) { list = h('ul', { class: 'bul' }); frag.appendChild(list); } list.appendChild(h('li', null, inline(b[1]))); return; }
      list = null;
      if (line.trim()) frag.appendChild(h('p', { class: 'para' }, inline(line)));
    });
    return frag;
  }
  function me() {
    return { name: clean(el.who.value, 80).trim(), run: clean(el.run.value, 60).trim() || 'Run 1', build: clean(el.build.value, 80).trim(), device: clean(el.device.value, 120).trim() };
  }

  // ---------- database ----------
  function configured() { return !!(cfg.url && cfg.anonKey); }
  function call(method, path, body, prefer) {
    var headers = { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Accept-Profile': 'qe', 'Content-Profile': 'qe', 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    return fetch(cfg.url.replace(/\/+$/, '') + '/rest/v1/' + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) {
      if (r.status === 204) return null;
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { /* not JSON */ }
        if (!r.ok) {
          var msg = (data && (data.message || data.hint)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }
  function load() {
    return Promise.all([
      call('GET', 'steps?select=*&archived=eq.false&order=section_pos.asc,pos.asc,created_at.asc&limit=' + LIMIT),
      call('GET', 'results?select=*&order=created_at.desc&limit=' + LIMIT),
      call('GET', 'notes?select=*&order=created_at.asc&limit=' + LIMIT),
    ]).then(function (r) {
      state.steps = r[0] || []; state.results = r[1] || []; state.notes = r[2] || [];
      state.loaded = true; state.error = '';
    }).catch(function (e) {
      state.error = e.status === 404 || /schema/i.test(e.message)
        ? 'The test database is not ready: the "qe" schema is not exposed yet (' + e.message + '). See README, step "Expose the schema".'
        : 'Could not reach the database (' + e.message + '). Check your connection and press Refresh.';
    });
  }

  // ---------- derived data ----------
  function currentMarks(stepId, run) {
    // newest mark per tester for this step in this run (results are newest first)
    var seen = {}; var out = [];
    for (var i = 0; i < state.results.length; i++) {
      var r = state.results[i];
      if (r.step_id !== stepId || r.run !== run || seen[r.tester]) continue;
      seen[r.tester] = true; out.push(r);
    }
    return out;
  }
  function overall(marks) {
    var best = null;
    marks.forEach(function (m) { if (!best || RANK[m.status] > RANK[best]) best = m.status; });
    return best;
  }
  function runsList() {
    var s = {}; state.results.forEach(function (r) { s[r.run] = true; });
    return Object.keys(s).sort();
  }

  // ---------- render ----------
  function render() {
    var who = me();
    paintBanner();
    // run suggestions
    el.runs.textContent = '';
    runsList().forEach(function (r) { el.runs.appendChild(h('option', { value: r })); });

    // summary over the steps, using each step's worst current mark in this run
    var onlyMine = el.mine.checked;
    var counts = { pass: 0, fail: 0, blocked: 0, skipped: 0, none: 0 };
    state.steps.forEach(function (s) {
      var marks = currentMarks(s.id, who.run).filter(function (m) { return !onlyMine || (who.name && m.tester === who.name); });
      var o = overall(marks); counts[o || 'none']++;
    });
    el.summary.textContent = '';
    el.summary.appendChild(h('span', { class: 'pill none', text: state.steps.length + (state.steps.length === 1 ? ' test case' : ' test cases') }));
    ['pass', 'fail', 'blocked', 'skipped', 'none'].forEach(function (k) {
      el.summary.appendChild(h('span', { class: 'pill ' + k, text: counts[k] + ' ' + (k === 'none' ? 'not run' : LABEL[k].toLowerCase()) }));
    });

    // plan
    var keepScroll = window.scrollY;
    el.plan.textContent = '';
    if (!state.loaded) {
      el.plan.appendChild(h('p', { class: 'muted', text: state.error ? '' : 'Loading the plan…' }));
    } else if (!state.steps.length) {
      el.plan.appendChild(h('p', { class: 'muted', text: 'There are no test cases yet.' }));
    }
    var sections = []; var bySection = {};
    state.steps.forEach(function (s) {
      if (!bySection[s.section]) { bySection[s.section] = []; sections.push(s.section); }
      bySection[s.section].push(s);
    });
    if (ui['add:?']) el.plan.appendChild(stepForm(null, undefined));
    sections.forEach(function (sec) {
      var list = bySection[sec];
      el.plan.appendChild(h('h2', null, sec, h('button', { class: 'linkbtn small', type: 'button', onclick: function () { openAdd(sec); } }, '+ Add test case')));
      list.forEach(function (s, i) { el.plan.appendChild(stepCard(s, i + 1, who, onlyMine)); });
      if (ui['add:' + sec]) el.plan.appendChild(stepForm(null, sec));
    });
    if (state.loaded) {
      el.plan.appendChild(h('h2', null, 'New section'));
      if (ui['add:*']) el.plan.appendChild(stepForm(null, null));
      else el.plan.appendChild(h('button', { type: 'button', onclick: function () { openAdd('*'); } }, '+ Add a section with its first test case'));
    }
    window.scrollTo(0, keepScroll);
  }

  function stepCard(s, n, who, onlyMine) {
    var marks = currentMarks(s.id, who.run).filter(function (m) { return !onlyMine || (who.name && m.tester === who.name); });
    var o = overall(marks);
    var card = h('article', { class: 'step' + (o ? ' status-' + o : ''), id: 'step-' + s.id });
    card.appendChild(h('h3', null, h('span', { class: 'num', text: n + '.' }), s.title, h('span', { class: 'pill ' + (o || 'none'), text: o ? LABEL[o] : 'Not run' })));
    if (s.detail) card.appendChild(h('div', { class: 'detail' }, rich(s.detail)));
    if (s.expected) card.appendChild(h('div', { class: 'expected' }, inline(s.expected)));

    if (marks.length) {
      var box = h('div', { class: 'marks' });
      marks.forEach(function (m) {
        box.appendChild(h('div', { class: 'mark' },
          h('span', { class: 'pill ' + m.status, text: LABEL[m.status] }), ' ',
          h('span', { class: 'who', text: m.tester }), ' ',
          h('span', { class: 'muted', text: when(m.created_at) + (m.build ? ' · ' + m.build : '') + (m.device ? ' · ' + m.device : '') }),
          m.comment ? h('div', { text: m.comment }) : null));
      });
      card.appendChild(box);
    }

    var earlier = state.results.filter(function (r) { return r.step_id === s.id && r.run === who.run && marks.indexOf(r) < 0 && !(onlyMine && !(who.name && r.tester === who.name)); });
    var currentIds = {}; marks.forEach(function (m) { currentIds[m.id] = true; });
    earlier = earlier.filter(function (r) { return !currentIds[r.id]; });
    if (earlier.length) {
      var det = h('details', { class: 'small earlier' }, h('summary', { text: 'Earlier marks (' + earlier.length + ')' }));
      earlier.forEach(function (r) {
        det.appendChild(h('div', { class: 'mark' }, h('span', { class: 'pill ' + r.status, text: LABEL[r.status] }), ' ', h('span', { class: 'who', text: r.tester }), ' ',
          h('span', { class: 'muted', text: when(r.created_at) }), r.comment ? h('div', { text: r.comment }) : null));
      });
      card.appendChild(det);
    }

    var f = ui[s.id];
    if (f && f.mode === 'mark') card.appendChild(markForm(s, f));
    else if (f && f.mode === 'edit') card.appendChild(stepForm(s, s.section));
    else {
      var row = h('div', { class: 'btnrow' });
      STATUSES.forEach(function (st) { row.appendChild(h('button', { class: st[0], type: 'button', onclick: function () { openMark(s.id, st[0]); } }, st[1])); });
      card.appendChild(row);
    }

    // notes
    var notes = state.notes.filter(function (x) { return x.step_id === s.id; });
    if (notes.length || ui['note:' + s.id] !== undefined) {
      var nb = h('div', { class: 'notes' });
      notes.forEach(function (x) {
        nb.appendChild(h('div', { class: 'note' }, h('strong', { text: x.tester }), ' ', h('span', { class: 'muted', text: when(x.created_at) }), ': ', x.body));
      });
      card.appendChild(nb);
    }
    if (ui['note:' + s.id] !== undefined) card.appendChild(noteForm(s));
    else if (!f) {
      card.appendChild(h('div', { class: 'btnrow' },
        h('button', { class: 'linkbtn', type: 'button', onclick: function () { ui['note:' + s.id] = ''; render(); } }, 'Comment'),
        h('button', { class: 'linkbtn', type: 'button', onclick: function () { ui[s.id] = { mode: 'edit' }; render(); } }, 'Edit'),
        h('button', { class: 'linkbtn', type: 'button', onclick: function () { archive(s); } }, 'Remove')));
    }
    return card;
  }

  function needName() {
    if (me().name) return false;
    setBanner('Type your name at the top first, so your mark and comment carry it.', true);
    el.who.focus();
    return true;
  }
  // A message from an action (saved, could not save) wins over a standing problem (no database, could not load).
  var msg = { text: '', error: false };
  function paintBanner() {
    var text = msg.text || (!configured() ? 'This page has no database set up yet (config.js is empty). See README.' : state.error);
    var isError = msg.text ? msg.error : true;
    el.banner.hidden = !text;
    el.banner.className = 'banner' + (isError ? ' error' : '');
    el.banner.textContent = text;
  }
  function setBanner(text, isError) { msg = { text: text, error: !!isError }; paintBanner(); }

  function openMark(id, status) { if (needName()) return; ui[id] = { mode: 'mark', status: status, text: '' }; render(); focusIn('step-' + id, 'textarea'); }
  function openAdd(sec) { ui['add:' + sec] = true; render(); if (sec === '?') focusIn('plan', 'input[aria-label="Test case title"]'); }
  function focusIn(id, sel) { var n = document.getElementById(id); var t = n && n.querySelector(sel); if (t) t.focus(); }

  function markForm(s, f) {
    var ta = h('textarea', { id: 'm-' + s.id, maxlength: 2000, 'aria-label': 'Comment', placeholder: f.status === 'fail' ? 'What happened? (required for Fail)' : 'Comment (optional)' });
    ta.value = f.text || '';
    ta.addEventListener('input', function () { f.text = ta.value; });
    var save = h('button', { class: 'primary', type: 'button', onclick: function () {
      if (f.status === 'fail' && !clean(ta.value, 2000).trim()) { setBanner('Say what went wrong in the comment, so the team can fix it.', true); ta.focus(); return; }
      save.disabled = true;
      var w = me();
      call('POST', 'results', { step_id: s.id, run: w.run, tester: w.name, status: f.status, build: w.build, device: w.device, comment: clean(ta.value, 2000).trim() }, 'return=minimal')
        .then(function () { delete ui[s.id]; setBanner('', false); return load(); })
        .catch(function (e) { setBanner('Could not save (' + e.message + '). Try again.', true); })
        .then(render);
    } }, 'Save ' + LABEL[f.status]);
    return h('div', { class: 'form' }, h('strong', { text: LABEL[f.status] }), ta,
      h('div', { class: 'btnrow' }, save, h('button', { type: 'button', onclick: function () { delete ui[s.id]; render(); } }, 'Cancel')));
  }

  function noteForm(s) {
    var ta = h('textarea', { maxlength: 2000, 'aria-label': 'Comment', placeholder: 'Write a comment' });
    ta.value = ui['note:' + s.id] || '';
    ta.addEventListener('input', function () { ui['note:' + s.id] = ta.value; });
    var save = h('button', { class: 'primary', type: 'button', onclick: function () {
      if (needName()) return;
      var body = clean(ta.value, 2000).trim();
      if (!body) { ta.focus(); return; }
      save.disabled = true;
      call('POST', 'notes', { step_id: s.id, tester: me().name, body: body }, 'return=minimal')
        .then(function () { delete ui['note:' + s.id]; setBanner('', false); return load(); })
        .catch(function (e) { setBanner('Could not save (' + e.message + '). Try again.', true); })
        .then(render);
    } }, 'Post comment');
    return h('div', { class: 'form' }, ta, h('div', { class: 'btnrow' }, save, h('button', { type: 'button', onclick: function () { delete ui['note:' + s.id]; render(); } }, 'Cancel')));
  }

  // One form for editing a test case, adding one to a section, or adding a new section (section === null).
  // With section === undefined (the top "New test case" button) the person picks an existing section or types a new one.
  function stepForm(s, sec) {
    var isNew = !s;
    var pick = sec === undefined;
    var secInput = sec === null || pick ? h('input', { maxlength: 120, 'aria-label': 'Section name', placeholder: 'Section name' }) : null;
    var secSelect = null;
    if (pick) {
      var names = []; state.steps.forEach(function (x) { if (names.indexOf(x.section) < 0) names.push(x.section); });
      secSelect = h('select', { 'aria-label': 'Section' });
      names.forEach(function (n) { secSelect.appendChild(h('option', { value: n, text: n })); });
      secSelect.appendChild(h('option', { value: '', text: 'New section…' }));
      secInput.hidden = names.length > 0;
      secSelect.addEventListener('change', function () { secInput.hidden = secSelect.value !== ''; if (!secInput.hidden) secInput.focus(); });
    }
    var title = h('input', { maxlength: 300, 'aria-label': 'Test case title', placeholder: 'Test case title' });
    var detail = h('textarea', { maxlength: 4000, 'aria-label': 'What to do', placeholder: 'What to do (a line starting with - is a bullet; [text](https://link) makes a link; **bold**)' });
    var expected = h('textarea', { maxlength: 2000, 'aria-label': 'Expected result', placeholder: 'Expected result' });
    if (s) { title.value = s.title; detail.value = s.detail; expected.value = s.expected; }
    var key = s ? s.id : 'add:' + (sec === null ? '*' : sec === undefined ? '?' : sec);
    var close = function () { if (s) delete ui[s.id]; else delete ui[key]; render(); };
    var save = h('button', { class: 'primary', type: 'button', onclick: function () {
      if (needName()) return;
      var t = clean(title.value, 300).trim();
      var newSection = sec === null || (pick && secSelect.value === '');
      var secName = newSection ? clean(secInput.value, 120).trim() : pick ? secSelect.value : sec;
      if (!t || !secName) { setBanner('A test case needs a title' + (newSection ? ' and a section name' : '') + '.', true); (t ? secInput : title).focus(); return; }
      save.disabled = true;
      var w = me();
      var req;
      if (s) {
        req = call('PATCH', 'steps?id=eq.' + encodeURIComponent(s.id), { title: t, detail: clean(detail.value, 4000), expected: clean(expected.value, 2000), updated_by: w.name }, 'return=minimal');
      } else {
        var inSec = state.steps.filter(function (x) { return x.section === secName; });
        var secPos = inSec.length ? inSec[0].section_pos : state.steps.reduce(function (m, x) { return Math.max(m, x.section_pos); }, -1) + 1;
        var pos = inSec.reduce(function (m, x) { return Math.max(m, x.pos); }, -1) + 1;
        req = call('POST', 'steps', { section: secName, section_pos: secPos, pos: pos, title: t, detail: clean(detail.value, 4000), expected: clean(expected.value, 2000), created_by: w.name, updated_by: w.name }, 'return=minimal');
      }
      req.then(function () { close(); setBanner('', false); return load(); })
        .catch(function (e) { setBanner('Could not save the test case (' + e.message + '). Try again.', true); })
        .then(render);
    } }, isNew ? 'Add test case' : 'Save changes');
    var kids = [h('strong', { text: isNew ? (sec === null ? 'New section' : sec === undefined ? 'New test case' : 'New test case in "' + sec + '"') : 'Edit test case' })];
    if (secSelect) kids.push(secSelect);
    if (secInput) kids.push(secInput);
    kids.push(title, detail, expected, h('div', { class: 'btnrow' }, save, h('button', { type: 'button', onclick: close }, 'Cancel')));
    return h.apply(null, ['div', { class: 'form' }].concat(kids));
  }

  function archive(s) {
    if (needName()) return;
    if (!window.confirm('Remove this test case from the plan? Its results stay in the database and it can be brought back from there.')) return;
    call('PATCH', 'steps?id=eq.' + encodeURIComponent(s.id), { archived: true, updated_by: me().name }, 'return=minimal')
      .then(load).catch(function (e) { setBanner('Could not remove the test case (' + e.message + ').', true); }).then(render);
  }

  // ---------- export and share ----------
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a comment starting with = + - @ must not run as a formula in a spreadsheet
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function downloadCsv() {
    var run = me().run;
    var rows = [['Run', 'Section', 'Test case', 'Tester', 'Status', 'Current', 'Comment', 'Build', 'Phones', 'Time']];
    state.steps.forEach(function (s) {
      var current = {}; currentMarks(s.id, run).forEach(function (m) { current[m.id] = true; });
      var all = state.results.filter(function (r) { return r.step_id === s.id && r.run === run; }).reverse(); // oldest first
      if (!all.length) rows.push([run, s.section, s.title, '', 'not run', '', '', '', '', '']);
      all.forEach(function (m) { rows.push([run, s.section, s.title, m.tester, m.status, current[m.id] ? 'yes' : 'no', m.comment, m.build, m.device, m.created_at]); });
    });
    var blob = new Blob([rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'fayda-test-results-' + run.replace(/[^\w-]+/g, '_') + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copyLink() {
    var url = location.href.split('#')[0];
    var done = function () { setBanner('Link copied: ' + url, false); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { setBanner('Copy this link: ' + url, false); });
    else setBanner('Copy this link: ' + url, false);
  }

  // ---------- start ----------
  function boot() {
    ['who', 'run', 'build', 'device', 'runs', 'mine', 'summary', 'plan', 'banner', 'share', 'csv', 'refresh', 'newcase'].forEach(function (id) { el[id] = document.getElementById(id); });
    ['who', 'run', 'build', 'device'].forEach(function (k) {
      el[k].value = store.getItem('qe.' + k) || '';
      el[k].addEventListener('input', function () { store.setItem('qe.' + k, el[k].value); if (k === 'run') render(); });
    });
    el.mine.addEventListener('change', render);
    el.newcase.addEventListener('click', function () { if (ui['add:?']) { delete ui['add:?']; render(); } else openAdd('?'); });
    el.share.addEventListener('click', copyLink);
    el.csv.addEventListener('click', downloadCsv);
    el.refresh.addEventListener('click', function () { load().then(render); });
    render();
    if (!configured()) return;
    load().then(function () { render(); if (location.hash.indexOf('#step-') === 0) { var n = document.getElementById(location.hash.slice(1)); if (n) n.scrollIntoView(); } });
    setInterval(function () {
      var a = document.activeElement;
      var typing = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
      if (document.hidden || typing) return; // never rebuild the page under someone who is typing
      load().then(render);
    }, POLL_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
