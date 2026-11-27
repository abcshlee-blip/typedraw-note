/* ══════════════════════════════════════════════════════════════
   TypeDraw 노트 — 종이 노트 PWA
   타이핑 + 손그림을 한 장에 섞는 노트. IndexedDB 자동 저장.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────── 상수 ─────────── */
  var PW = 800, PH = 1131, RULE = 44;
  var AUTHOR = '이성현';

  var COVER_COLORS = [
    { id: '#8c4a3f', name: '벽돌' },
    { id: '#2f4156', name: '네이비' },
    { id: '#5b6b4a', name: '올리브' },
    { id: '#6d2f38', name: '버건디' },
    { id: '#3a3a3c', name: '차콜' },
    { id: '#b08968', name: '크라프트' },
    { id: '#5b7c99', name: '하늘' },
    { id: '#7a6a8a', name: '라벤더' }
  ];
  var PATTERNS = [
    { id: 'plain', name: '무지' },
    { id: 'linen', name: '천' },
    { id: 'stripe', name: '줄' },
    { id: 'dot', name: '도트' },
    { id: 'kraft', name: '크라프트' }
  ];
  var PAPERS = [
    { id: 'lined', name: '줄 노트' },
    { id: 'grid', name: '모눈' },
    { id: 'dot', name: '도트' },
    { id: 'blank', name: '무지' }
  ];
  var PAPER_COLORS = [
    { id: 'cream', name: '크림', css: '#fbf6e9' },
    { id: 'white', name: '화이트', css: '#ffffff' },
    { id: 'dark', name: '다크', css: '#2b2b2e' }
  ];
  var FONTS = [
    { id: 'sans', name: '고딕', css: "'Noto Sans KR', system-ui, -apple-system, 'Malgun Gothic', sans-serif" },
    { id: 'myeongjo', name: '명조', css: "'Nanum Myeongjo', 'Batang', 'Apple SD Gothic Neo', serif" },
    { id: 'pen', name: '손글씨', css: "'Nanum Pen Script', 'Segoe Script', 'Gowun Dodum', cursive" },
    { id: 'gaegu', name: '개구', css: "'Gaegu', 'Nanum Pen Script', cursive" },
    { id: 'gowun', name: '고운', css: "'Gowun Dodum', 'Noto Sans KR', sans-serif" }
  ];
  var PEN_COLORS = ['#2b2b2b', '#1f4e9c', '#a8322a', '#2f6b3f', '#7a4fb0', '#c2761b'];
  var HL_COLORS = ['#ffe36e', '#b7f0a8', '#ffc2d1', '#bfe3ff', '#ffd0a3'];
  var TEXT_SIZES = [24, 32, 42, 54];

  /* 2쪽 펼침 기준: 이 너비 이상이면 두 쪽을 나란히 (폴드 펼친 화면 포함) */
  var VIEW_MIN = 540;
  var VIEW_KEY = 'tdn.viewMode';
  /* 이 너비부터는 하단 바를 한 줄로 압축한다(폴드 펼친 화면·태블릿) */
  var wideBarMq = (typeof window.matchMedia === 'function') ? window.matchMedia('(min-width: 540px)') : null;
  function isWideBar() { return !!(wideBarMq && wideBarMq.matches); }

  /* ─────────── 상태 ─────────── */
  var state = {
    notebooks: [],
    nb: null,
    idx: 0,
    spread: false,
    viewMode: 'auto',
    tool: 'pen',
    pen: { color: '#2b2b2b', width: 3.5 },
    hl: { color: '#ffe36e', width: 20 },
    eraser: { width: 28 },
    text: { font: 'sans', size: 32, color: '#2b2b2b' },
    selected: null,
    activePageId: null,
    draw: null,
    flipping: false,     // 책장 넘김 애니메이션 중
    assets: {},          // id -> objectURL
    saveTimers: {}
  };

  /* ─────────── 유틸 ─────────── */
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function uid(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fontCss(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i].css;
    return FONTS[0].css;
  }
  function fontName(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i].name;
    return '고딕';
  }
  function paperCss(id) {
    for (var i = 0; i < PAPER_COLORS.length; i++) if (PAPER_COLORS[i].id === id) return PAPER_COLORS[i].css;
    return '#fbf6e9';
  }
  function isDarkPaper() { return state.nb && state.nb.paper && state.nb.paper.color === 'dark'; }

  /* ─────────── 보기 방식 (자동 / 2쪽 / 1쪽) ─────────── */
  function loadViewMode() {
    try {
      var m = localStorage.getItem(VIEW_KEY);
      if (m === 'two' || m === 'one' || m === 'auto') return m;
    } catch (e) {}
    return 'auto';
  }
  function storeViewMode(m) {
    try { localStorage.setItem(VIEW_KEY, m); } catch (e) {}
  }
  function availWidth() {
    return Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  }
  function wantSpread() {
    if (state.viewMode === 'two') return true;
    if (state.viewMode === 'one') return false;
    return availWidth() >= VIEW_MIN;
  }
  function updateViewSwitch() {
    var box = $('#viewSwitch');
    if (box) {
      $$('button', box).forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.view === state.viewMode ? 'true' : 'false');
      });
    }
    var c = $('#btnViewCycle');
    if (c) {
      var spread = wantSpread();
      var now = spread ? '2쪽' : '1쪽';
      var next = spread ? '1쪽' : '2쪽';
      c.textContent = now;
      c.title = '지금 ' + now + ' 보기 — 누르면 ' + next + ' 보기';
      c.setAttribute('aria-label', c.title);
    }
  }
  function cycleViewMode() {
    setViewMode(wantSpread() ? 'one' : 'two');
  }
  function setViewMode(mode) {
    if (mode !== 'two' && mode !== 'one' && mode !== 'auto') mode = 'auto';
    if (mode === state.viewMode) { updateViewSwitch(); return; }
    state.viewMode = mode;
    storeViewMode(mode);
    updateViewSwitch();
    if (!$('#noteView').hidden && state.nb) {
      // 지금 보고 있던 쪽을 그대로 유지한다
      var cur = -1;
      if (state.activePageId) {
        for (var i = 0; i < state.nb.pages.length; i++) {
          if (state.nb.pages[i].id === state.activePageId) { cur = i; break; }
        }
      }
      if (cur >= 0) state.idx = cur;
      renderSpread();
      renderOptions();
      updateUndoButtons();
    }
    toast(mode === 'two' ? '두 쪽 보기로 바꿨습니다' : mode === 'one' ? '한 쪽 보기로 바꿨습니다' : (wantSpread() ? '자동 — 두 쪽 보기' : '자동 — 한 쪽 보기'));
  }

  /* ─────────── 상·하단 바 접기 (전체 화면 몰입 보기) ─────────── */
  var BARS_MS = 300;
  var barsRaf = null;

  function barsCollapsed() {
    var v = $('#noteView');
    return !!(v && !v.hidden && v.classList.contains('bars-collapsed'));
  }

  function setBarsCollapsed(collapsed, silent) {
    var view = $('#noteView');
    if (!view) return;
    var head = view.querySelector('.note-head');
    var bar = view.querySelector('.toolbar');
    if (!head || !bar) return;

    var now = view.classList.contains('bars-collapsed');
    if (collapsed === now && !silent) return;
    if (barsRaf) { cancelAnimationFrame(barsRaf); barsRaf = null; }

    // 접힘 상태에서는 바 안의 버튼을 탭·키보드·화면읽기에서 잠시 빼둔다
    if (collapsed) {
      head.setAttribute('inert', '');
      bar.setAttribute('inert', '');
    } else {
      head.removeAttribute('inert');
      bar.removeAttribute('inert');
    }

    // 1) 두 바의 자연 높이를 잰다 (같은 프레임 안에서만 잠깐 되돌려 본다)
    head.classList.remove('bar-anim');
    bar.classList.remove('bar-anim');
    head.style.height = '';
    bar.style.height = '';
    head.style.overflow = '';
    bar.style.overflow = '';
    if (now) view.classList.remove('bars-collapsed');
    var hh = head.offsetHeight;
    var bh = bar.offsetHeight;
    if (now) { view.classList.add('bars-collapsed'); void head.offsetHeight; }

    if (silent) {
      view.classList.toggle('bars-collapsed', !!collapsed);
      layoutPages();
      return;
    }

    // 2) 애니메이션 준비
    head.style.overflow = 'hidden';
    bar.style.overflow = 'hidden';
    head.classList.add('bar-anim');
    bar.classList.add('bar-anim');

    if (collapsed) {
      head.style.height = hh + 'px';
      bar.style.height = bh + 'px';
      void head.offsetHeight;
      view.classList.add('bars-collapsed');
    } else {
      head.style.height = '0px';
      bar.style.height = '0px';
      void head.offsetHeight;
      view.classList.remove('bars-collapsed');
      head.style.height = hh + 'px';
      bar.style.height = bh + 'px';
    }

    // 3) 바가 움직이는 동안 종이 크기를 계속 다시 맞춘다
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function step(t) {
      layoutPages();
      if (t - t0 < BARS_MS + 60) { barsRaf = requestAnimationFrame(step); return; }
      barsRaf = null;
      head.classList.remove('bar-anim');
      bar.classList.remove('bar-anim');
      head.style.height = '';
      bar.style.height = '';
      head.style.overflow = '';
      bar.style.overflow = '';
      layoutPages();
    }
    barsRaf = requestAnimationFrame(step);
  }

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDateLong(d) {
    d = d || new Date();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WEEK[d.getDay()] + ')';
  }
  function fmtShort(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1900);
  }

  /* ─────────── IndexedDB ─────────── */
  var DB_NAME = 'typedraw-note', DB_VER = 1, dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('notebooks')) db.createObjectStore('notebooks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function dbAll(store) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var r = tx.objectStore(store).getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function dbPut(store, val) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(val);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function dbDelete(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function dbGet(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var r = tx.objectStore(store).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  /* ─────────── 자산(사진) ─────────── */
  function assetURL(id) { return state.assets[id] || ''; }

  function putAsset(blob, w, h) {
    var id = uid('as');
    return dbPut('assets', { id: id, blob: blob, w: w, h: h, createdAt: Date.now() }).then(function () {
      state.assets[id] = URL.createObjectURL(blob);
      return { id: id, w: w, h: h };
    });
  }

  /* ─────────── 모델 ─────────── */
  function newPage() { return { id: uid('pg'), strokes: [], objects: [], updatedAt: Date.now() }; }

  function newNotebook(title) {
    return {
      id: uid('nb'),
      title: title || '나의 노트',
      cover: { color: '#8c4a3f', pattern: 'linen' },
      paper: { type: 'lined', color: 'cream' },
      pages: [newPage(), newPage()],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function serializeNB(nb) {
    return {
      id: nb.id, title: nb.title, cover: nb.cover, paper: nb.paper,
      createdAt: nb.createdAt, updatedAt: nb.updatedAt,
      pages: nb.pages.map(function (p) {
        return { id: p.id, strokes: p.strokes, objects: p.objects, updatedAt: p.updatedAt };
      })
    };
  }

  function saveNB(nb, immediate) {
    if (!nb) return;
    nb.updatedAt = Date.now();
    var run = function () {
      dbPut('notebooks', serializeNB(nb)).then(function () {
        var t = state.notebooks.filter(function (n) { return n.id === nb.id; }).length;
        if (t) {
          state.notebooks = state.notebooks.map(function (n) { return n.id === nb.id ? nb : n; });
        }
      }).catch(function (e) { console.warn('save failed', e); });
    };
    clearTimeout(state.saveTimers[nb.id]);
    if (immediate) { run(); return; }
    state.saveTimers[nb.id] = setTimeout(run, 420);
  }

  function markDirty() {
    if (!state.nb) return;
    if (state.nb.pages.length) {
      var p = pageById(state.activePageId);
      if (p) p.updatedAt = Date.now();
    }
    saveNB(state.nb);
  }

  function pageById(id) {
    if (!state.nb) return null;
    for (var i = 0; i < state.nb.pages.length; i++) if (state.nb.pages[i].id === id) return state.nb.pages[i];
    return null;
  }
  function activePage() {
    var p = pageById(state.activePageId);
    if (p) return p;
    if (state.nb && state.nb.pages.length) return state.nb.pages[clamp(state.idx, 0, state.nb.pages.length - 1)];
    return null;
  }
  function activePageEl() {
    var p = activePage();
    if (!p) return null;
    return $('#spread .page[data-page-id="' + p.id + '"]');
  }

  /* ─────────── 실행 취소 ─────────── */
  function snap(page) { return JSON.stringify({ strokes: page.strokes, objects: page.objects }); }
  function pushUndo(page) {
    if (!page) return;
    if (!page._undo) page._undo = [];
    page._undo.push(snap(page));
    if (page._undo.length > 40) page._undo.shift();
    page._redo = [];
    updateUndoButtons();
  }
  function canUndo() { var p = activePage(); return !!(p && p._undo && p._undo.length); }
  function canRedo() { var p = activePage(); return !!(p && p._redo && p._redo.length); }

  function undo() {
    var p = activePage();
    if (!p || !p._undo || !p._undo.length) return;
    if (!p._redo) p._redo = [];
    p._redo.push(snap(p));
    var s = JSON.parse(p._undo.pop());
    p.strokes = s.strokes; p.objects = s.objects;
    rerenderPage(p);
    markDirty();
    updateUndoButtons();
  }
  function redo() {
    var p = activePage();
    if (!p || !p._redo || !p._redo.length) return;
    if (!p._undo) p._undo = [];
    p._undo.push(snap(p));
    var s = JSON.parse(p._redo.pop());
    p.strokes = s.strokes; p.objects = s.objects;
    rerenderPage(p);
    markDirty();
    updateUndoButtons();
  }
  function updateUndoButtons() {
    var u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = !canUndo();
    if (r) r.disabled = !canRedo();
  }

  /* ─────────── 책장 ─────────── */
  function renderShelf() {
    var grid = $('#bookGrid');
    grid.innerHTML = '';
    var list = state.notebooks.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });

    $('#shelfEmpty').hidden = list.length > 0;

    list.forEach(function (nb) {
      var book = el('div', 'book');
      book.tabIndex = 0;
      book.setAttribute('role', 'listitem');
      book.dataset.id = nb.id;
      book.innerHTML =
        '<div class="cover pat-' + esc(nb.cover.pattern) + '" style="--c:' + esc(nb.cover.color) + '">' +
          '<div class="label"><div class="name">' + esc(nb.title) + '</div><div class="by">by ' + AUTHOR + '</div></div>' +
          '<div class="band"></div>' +
        '</div>' +
        '<div class="book-meta"><div class="t">' + esc(nb.title) + '</div>' +
        '<div class="s">' + nb.pages.length + '쪽 · ' + fmtShort(nb.updatedAt) + '</div></div>';

      var more = el('button', 'book-more');
      more.type = 'button';
      more.setAttribute('aria-label', '노트 메뉴');
      more.innerHTML = '<svg class="ico"><use href="#i-more"/></svg>';
      more.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openBookMenu(nb, more);
      });
      book.querySelector('.cover').appendChild(more);

      book.addEventListener('click', function () { openNotebook(nb.id); });
      book.addEventListener('keydown', function (e) { if (e.key === 'Enter') openNotebook(nb.id); });
      grid.appendChild(book);
    });

    var add = el('button', 'book new');
    add.type = 'button';
    add.innerHTML = '<div class="cover"><svg class="ico"><use href="#i-plus"/></svg></div>' +
      '<div class="book-meta"><div class="t" style="color:#8c7f66">새 노트</div></div>';
    add.addEventListener('click', createNotebookFlow);
    grid.appendChild(add);
  }

  function openBookMenu(nb, anchor) {
    var menu = $('#bookMenu');
    menu.dataset.nbId = nb.id;
    showPopover(menu, anchor);
  }

  function createNotebookFlow() {
    promptText('새 노트', '제목', '나의 노트').then(function (title) {
      if (title == null) return;
      var nb = newNotebook(title.trim() || '나의 노트');
      state.notebooks.unshift(nb);
      saveNB(nb, true);
      renderShelf();
      openNotebook(nb.id);
      toast('새 노트를 만들었어요');
    });
  }

  /* ─────────── 노트 열기/닫기 ─────────── */
  function openNotebook(id) {
    var nb = null;
    for (var i = 0; i < state.notebooks.length; i++) if (state.notebooks[i].id === id) nb = state.notebooks[i];
    if (!nb) return;
    state.nb = nb;
    state.idx = 0;
    state.selected = null;
    state.activePageId = nb.pages.length ? nb.pages[0].id : null;
    nb.pages.forEach(function (p) { if (!p._undo) { p._undo = []; p._redo = []; } });

    $('#shelfView').hidden = true;
    $('#noteView').hidden = false;
    $('#noteTitle').textContent = nb.title;

    applyPaperDefaults();
    renderSpread();
    renderOptions();
    updatePager();
    updateUndoButtons();
    setTool(state.tool, true);
  }

  function closeNotebook() {
    flushSave();
    cancelFlip();
    setBarsCollapsed(false, true);
    state.nb = null;
    state.selected = null;
    $('#noteView').hidden = true;
    $('#shelfView').hidden = false;
    renderShelf();
  }

  function flushSave() {
    if (state.nb) saveNB(state.nb, true);
  }

  function applyPaperDefaults() {
    var dark = isDarkPaper();
    if (dark) {
      if (state.pen.color === '#2b2b2b') state.pen.color = '#f2efe6';
      if (state.text.color === '#2b2b2b') state.text.color = '#f2efe6';
    } else {
      if (state.pen.color === '#f2efe6') state.pen.color = '#2b2b2b';
      if (state.text.color === '#f2efe6') state.text.color = '#2b2b2b';
    }
  }

  /* ─────────── 화면 구성 ─────────── */
  function renderSpread() {
    var nb = state.nb;
    var spread = $('#spread');
    spread.innerHTML = '';
    if (!nb || !nb.pages.length) return;

    state.spread = wantSpread();
    var start = state.spread ? state.idx - (state.idx % 2) : state.idx;
    if (start > nb.pages.length - 1) start = Math.max(0, nb.pages.length - 1);
    state.idx = start;

    // 두 쪽 보기에서는 쪽이 모자라도 빈 자리를 남겨 책처럼 왼쪽에 놓는다(넘길 때 자리가 흔들리지 않게)
    spread.classList.toggle('is-spread', !!state.spread);

    var show = [start];
    if (state.spread) show.push(start + 1);

    show.forEach(function (pi, k) {
      var slot = el('div', 'slot ' + (show.length > 1 ? (k === 0 ? 'left' : 'right') : 'single'));
      if (nb.pages[pi]) slot.appendChild(buildPageEl(nb.pages[pi], pi));
      else slot.classList.add('is-blank');
      spread.appendChild(slot);
    });

    if (!state.activePageId || !pageById(state.activePageId)) {
      state.activePageId = nb.pages[start].id;
    }

    layoutPages();
    show.forEach(function (pi) { if (nb.pages[pi]) redrawInk(nb.pages[pi]); });
    updateActiveSlot();
    updatePager();
    updateUndoButtons();
    updateViewSwitch();
  }

  function buildPageEl(page, index) {
    var dark = isDarkPaper();
    var pageEl = el('div', 'page ' + state.nb.paper.type + ' paper-' + state.nb.paper.color + ' editing');
    pageEl.dataset.pageId = page.id;
    pageEl.dataset.index = String(index);
    pageEl.style.setProperty('--rule', 'calc(var(--pscale) * ' + RULE + 'px)');
    pageEl.innerHTML = '<div class="bg"></div><canvas class="ink"></canvas><div class="objects"></div>' +
      '<div class="folio">' + (index + 1) + '</div>' +
      (isEmptyPage(page) ? '<div class="hint-layer">' + (state.tool === 'text' ? '탭해서 글자를 넣어 보세요' : '펜으로 그리거나, 위에서 타이핑을 골라 보세요') + '</div>' : '');

    var canvas = pageEl.querySelector('canvas');
    canvas.width = PW * 2;
    canvas.height = PH * 2;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    pageEl._canvas = canvas;
    pageEl._ctx = ctx;
    pageEl._page = page;

    renderObjects(pageEl, page);
    return pageEl;
  }

  function isEmptyPage(page) {
    return (!page.strokes || !page.strokes.length) && (!page.objects || !page.objects.length);
  }

  function layoutPages() {
    var spread = $('#spread');
    if (!spread) return;
    var rect = spread.getBoundingClientRect();
    var availW = Math.max(120, rect.width);
    var availH = Math.max(160, rect.height);
    var slots = $$('.slot', spread);
    if (!slots.length) return;

    var n = slots.length;
    var gap = n > 1 ? 6 : 0;
    var ratio = PW / PH;
    var pw = (availW - gap * (n - 1)) / n;
    var maxByH = availH * ratio;
    if (pw > maxByH) pw = maxByH;
    pw = Math.floor(pw);
    var ph = Math.floor(pw / ratio);

    slots.forEach(function (slot) {
      slot.style.width = pw + 'px';
      slot.style.flex = 'none';
      var pageEl = slot.querySelector('.page');
      if (!pageEl) return;
      pageEl.style.width = pw + 'px';
      pageEl.style.height = ph + 'px';
      pageEl.style.setProperty('--pscale', String(pw / PW));
    });
    spread.style.gap = gap + 'px';
  }

  function updateActiveSlot() {
    $$('#spread .page').forEach(function (p) {
      p.classList.toggle('is-active', p.dataset.pageId === state.activePageId);
    });
  }

  function setActivePage(pageEl) {
    if (!pageEl) return;
    var id = pageEl.dataset.pageId;
    if (state.activePageId === id) return;
    state.activePageId = id;
    state.selected = null;
    updateActiveSlot();
    updateUndoButtons();
  }

  function rerenderPage(page) {
    var spread = $('#spread');
    var pageEl = spread.querySelector('.page[data-page-id="' + page.id + '"]');
    if (!pageEl) return;
    redrawInk(page);
    renderObjects(pageEl, page);
    updateUndoButtons();
  }

  /* ─────────── 잉크(스트로크) 그리기 ─────────── */
  function applyStrokeStyle(ctx, s) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = (s.alpha == null ? 1 : s.alpha);
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  }
  function widthAt(s, pressure) {
    if (!s.pressure) return s.width;
    var p = (pressure == null ? 0.5 : pressure);
    return s.width * (0.55 + p * 0.95);
  }

  function redrawInk(page) {
    var pageEl = $('#spread .page[data-page-id="' + page.id + '"]');
    if (!pageEl) return;
    var ctx = pageEl._ctx;
    ctx.clearRect(0, 0, PW, PH);
    (page.strokes || []).forEach(function (s) { drawStrokeFull(ctx, s); });
  }

  function drawStrokeFull(ctx, s) {
    var pts = s.pts;
    var n = pts.length / 3;
    if (!n) return;
    ctx.save();
    applyStrokeStyle(ctx, s);
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(pts[0], pts[1], Math.max(0.6, widthAt(s, pts[2]) / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (n === 2) {
      ctx.lineWidth = widthAt(s, pts[5] == null ? 0.5 : pts[5]);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.lineTo(pts[3], pts[4]);
      ctx.stroke();
      ctx.restore();
      return;
    }
    var px = pts[0], py = pts[1];
    for (var i = 1; i < n - 1; i++) {
      var cx = pts[i * 3], cy = pts[i * 3 + 1];
      var nx = pts[(i + 1) * 3], ny = pts[(i + 1) * 3 + 1];
      var mx = (cx + nx) / 2, my = (cy + ny) / 2;
      ctx.lineWidth = widthAt(s, pts[i * 3 + 2]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(cx, cy, mx, my);
      ctx.stroke();
      px = mx; py = my;
    }
    var lx = pts[(n - 1) * 3], ly = pts[(n - 1) * 3 + 1];
    ctx.lineWidth = widthAt(s, pts[(n - 1) * 3 + 2]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────── 포인터 → 그리기 ─────────── */
  function pagePoint(pageEl, e) {
    var r = pageEl.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * PW,
      y: (e.clientY - r.top) / r.height * PH
    };
  }
  function pressureOf(e) {
    if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.5;
    return 0.5;
  }
  function isDrawTool() {
    return state.tool === 'pen' || state.tool === 'hl' || state.tool === 'eraser';
  }

  function onPointerDown(e) {
    // 넘기는 중이거나 넘기기 제스처로 가져간 손가락이면 그리지 않는다
    if (isGestureClaim(e)) { if (e.cancelable) e.preventDefault(); return; }
    var target = e.target;
    if (!target || !target.closest) return;
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;

    var pageEl = target.closest('.page');
    if (!pageEl) return;
    setActivePage(pageEl);

    // 객체 조작(선택·이동·크기·삭제)은 객체 쪽 리스너가 처리
    if (target.closest('.handle-bar') || target.closest('.size-handle')) return;

    var objEl = target.closest('.obj');
    if (!isDrawTool()) {
      if (objEl) {
        selectObject(pageEl, objEl);
        return;              // 텍스트 편집은 기본 동작(contenteditable)으로
      }
      hideSelection();
      if (state.tool === 'text') {
        e.preventDefault();
        createTextAt(pageEl, e);
      }
      return;
    }

    if (objEl) { hideSelection(); }
    e.preventDefault();
    startStroke(pageEl, e);
  }

  function startStroke(pageEl, e) {
    var page = pageEl._page || pageById(pageEl.dataset.pageId);
    if (!page) return;
    var pt = pagePoint(pageEl, e);
    var tool = state.tool;
    var s;
    if (tool === 'pen') {
      s = { tool: 'pen', color: state.pen.color, width: state.pen.width, alpha: 1, pressure: e.pointerType === 'pen', pts: [pt.x, pt.y, pressureOf(e)] };
    } else if (tool === 'hl') {
      s = { tool: 'hl', color: state.hl.color, width: state.hl.width, alpha: 0.32, pressure: false, pts: [pt.x, pt.y, 0.5] };
    } else {
      s = { tool: 'eraser', color: '#000000', width: state.eraser.width, alpha: 1, pressure: false, pts: [pt.x, pt.y, 0.5] };
    }

    var ctx = pageEl._ctx;
    ctx.save();
    applyStrokeStyle(ctx, s);
    ctx.lineWidth = widthAt(s, s.pts[2]);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(0.5, widthAt(s, s.pts[2]) / 2), 0, Math.PI * 2);
    if (s.tool === 'eraser') { ctx.fill(); } else { ctx.fill(); }
    ctx.restore();

    state.draw = { pageEl: pageEl, page: page, stroke: s, ctx: ctx, lastMid: null, moved: false, pointerId: e.pointerId, ptType: e.pointerType };
    try { pageEl.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onPointerMove(e) {
    var d = state.draw;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    var rect = d.pageEl.getBoundingClientRect();
    var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var x = (ev.clientX - rect.left) / rect.width * PW;
      var y = (ev.clientY - rect.top) / rect.height * PH;
      extendStroke(d, x, y, pressureOf(ev));
    }
    d.moved = true;
  }

  function extendStroke(d, x, y, pressure) {
    var s = d.stroke;
    var n = s.pts.length / 3;
    var lastX = s.pts[(n - 1) * 3], lastY = s.pts[(n - 1) * 3 + 1];
    var dx = x - lastX, dy = y - lastY;
    if (dx * dx + dy * dy < 0.16) return;

    s.pts.push(x, y, pressure);
    var ctx = d.ctx;
    ctx.save();
    applyStrokeStyle(ctx, s);
    ctx.lineWidth = widthAt(s, pressure);

    var mx = (lastX + x) / 2, my = (lastY + y) / 2;
    if (!d.lastMid) {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.quadraticCurveTo(lastX, lastY, mx, my);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(d.lastMid.x, d.lastMid.y);
      ctx.quadraticCurveTo(lastX, lastY, mx, my);
      ctx.stroke();
    }
    ctx.restore();
    d.lastMid = { x: mx, y: my };
  }

  function onPointerUp(e) {
    var d = state.draw;
    if (!d || d.pointerId !== e.pointerId) return;
    state.draw = null;
    try { d.pageEl.releasePointerCapture(e.pointerId); } catch (err) {}

    var s = d.stroke;
    var n = s.pts.length / 3;
    if (n >= 2) {
      var ctx = d.ctx;
      ctx.save();
      applyStrokeStyle(ctx, s);
      ctx.lineWidth = widthAt(s, s.pts[(n - 1) * 3 + 2]);
      ctx.beginPath();
      if (d.lastMid) ctx.moveTo(d.lastMid.x, d.lastMid.y);
      else ctx.moveTo(s.pts[0], s.pts[1]);
      ctx.lineTo(s.pts[(n - 1) * 3], s.pts[(n - 1) * 3 + 1]);
      ctx.stroke();
      ctx.restore();
    }

    pushUndo(d.page);
    d.page.strokes.push(s);
    redrawInk(d.page);
    hideHint(d.pageEl);
    markDirty();
  }

  function hideHint(pageEl) {
    var h = pageEl.querySelector('.hint-layer');
    if (h) h.remove();
  }

  /* ─────────── 객체(텍스트·체크·사진) ─────────── */
  function renderObjects(pageEl, page) {
    var layer = pageEl.querySelector('.objects');
    layer.innerHTML = '';
    (page.objects || []).forEach(function (obj) {
      layer.appendChild(buildObjectEl(pageEl, page, obj));
    });
    if (state.selected && state.selected.pageId === page.id) {
      var sel = layer.querySelector('.obj[data-obj-id="' + state.selected.objId + '"]');
      if (sel) sel.classList.add('selected');
    }
  }

  function buildObjectEl(pageEl, page, obj) {
    var wrap = el('div', 'obj obj-' + obj.type);
    wrap.dataset.objId = obj.id;
    wrap.style.left = (obj.x / PW * 100) + '%';
    wrap.style.top = (obj.y / PH * 100) + '%';

    if (obj.type === 'text') {
      wrap.style.width = (obj.w / PW * 100) + '%';
      var txt = el('div', 'txt');
      txt.contentEditable = 'true';
      txt.spellcheck = false;
      txt.textContent = obj.text || '';
      txt.style.fontFamily = fontCss(obj.font);
      txt.style.fontSize = 'calc(var(--pscale) * ' + obj.size + 'px)';
      txt.style.color = obj.color;
      txt.addEventListener('input', function () { obj.text = txt.innerText; markDirty(); });
      txt.addEventListener('focus', function () {
        if (!txt.dataset.snap) { pushUndo(page); txt.dataset.snap = '1'; }
      });
      txt.addEventListener('blur', function () {
        txt.dataset.snap = '';
        if (!txt.innerText.trim()) {
          // 빈 텍스트는 정리
          var i = page.objects.indexOf(obj);
          if (i >= 0) { page.objects.splice(i, 1); renderObjects(pageEl, page); markDirty(); }
        }
      });
      txt.addEventListener('pointerdown', function (e) { e.stopPropagation(); setActivePage(pageEl); selectObject(pageEl, wrap); });
      wrap.appendChild(buildHandleBar(obj, page, pageEl));
      wrap.appendChild(txt);
      var sh = el('div', 'size-handle');
      wrap.appendChild(sh);
      bindSizeHandle(pageEl, page, obj, wrap, sh);
    } else if (obj.type === 'check') {
      wrap.style.width = (obj.w / PW * 100) + '%';
      wrap.appendChild(buildHandleBar(obj, page, pageEl));
      var box = el('div', 'obj-check');
      var head = el('div', 'chk-head');
      head.contentEditable = 'true';
      head.spellcheck = false;
      head.textContent = obj.title || '체크리스트';
      head.addEventListener('input', function () { obj.title = head.innerText; markDirty(); });
      box.appendChild(head);

      var ul = el('ul');
      (obj.items || []).forEach(function (item, ii) {
        var li = el('li');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!item.done;
        cb.addEventListener('change', function () {
          pushUndo(page);
          item.done = cb.checked;
          span.classList.toggle('done', cb.checked);
          markDirty();
        });
        var span = el('span', 'item' + (item.done ? ' done' : ''));
        span.contentEditable = 'true';
        span.spellcheck = false;
        span.textContent = item.text || '';
        span.addEventListener('input', function () { item.text = span.innerText; markDirty(); });
        var del = el('button', 'row-del');
        del.type = 'button';
        del.textContent = '×';
        del.addEventListener('click', function () {
          pushUndo(page);
          obj.items.splice(ii, 1);
          renderObjects(pageEl, page);
          markDirty();
        });
        li.appendChild(cb); li.appendChild(span); li.appendChild(del);
        ul.appendChild(li);
      });
      box.appendChild(ul);

      var addRow = el('button', 'chk-add');
      addRow.type = 'button';
      addRow.textContent = '+ 항목';
      addRow.addEventListener('click', function () {
        pushUndo(page);
        obj.items.push({ text: '', done: false });
        renderObjects(pageEl, page);
        markDirty();
        var spans = pageEl.querySelectorAll('.obj[data-obj-id="' + obj.id + '"] .item');
        var last = spans[spans.length - 1];
        if (last) last.focus();
      });
      box.appendChild(addRow);

      box.addEventListener('pointerdown', function (e) {
        setActivePage(pageEl);
        if (e.target.closest('.handle-bar')) return;
        selectObject(pageEl, wrap);
        if (!e.target.closest('.item') && !e.target.closest('button') && !e.target.closest('input')) {
          e.stopPropagation();
        }
      });
      wrap.appendChild(box);
    } else if (obj.type === 'image') {
      wrap.style.width = (obj.w / PW * 100) + '%';
      wrap.appendChild(buildHandleBar(obj, page, pageEl));
      var img = document.createElement('img');
      img.src = assetURL(obj.assetId || obj.src);
      img.alt = '';
      img.draggable = false;
      wrap.appendChild(img);
      wrap.appendChild(el('div', 'size-handle'));
      var sh2 = el('div', 'size-handle');
      wrap.appendChild(sh2);
      bindSizeHandle(pageEl, page, obj, wrap, sh2);
      img.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        setActivePage(pageEl);
        selectObject(pageEl, wrap);
      });
    }
    return wrap;
  }

  function buildHandleBar(obj, page, pageEl) {
    var bar = el('div', 'handle-bar');
    var grip = el('button', 'grip');
    grip.type = 'button';
    grip.setAttribute('aria-label', '이동');
    grip.innerHTML = '<svg class="ico"><use href="#i-grip"/></svg>';
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      setActivePage(pageEl); selectObject(pageEl, bar.parentNode);
      startMove(e, obj, page, pageEl, bar.parentNode);
    });

    var del = el('button');
    del.type = 'button';
    del.setAttribute('aria-label', '삭제');
    del.innerHTML = '<svg class="ico"><use href="#i-close"/></svg>';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      pushUndo(page);
      var i = page.objects.indexOf(obj);
      if (i >= 0) page.objects.splice(i, 1);
      state.selected = null;
      renderObjects(pageEl, page);
      markDirty();
    });

    bar.appendChild(grip);
    bar.appendChild(del);
    return bar;
  }

  function startMove(e, obj, page, pageEl, wrapEl) {
    pushUndo(page);
    var r = pageEl.getBoundingClientRect();
    var sx = e.clientX, sy = e.clientY;
    var ox = obj.x, oy = obj.y;
    var unitX = PW / r.width, unitY = PH / r.height;
    try { wrapEl.setPointerCapture(e.pointerId); } catch (err) {}

    function move(ev) {
      obj.x = clamp(ox + (ev.clientX - sx) * unitX, 0, PW - 40);
      obj.y = clamp(oy + (ev.clientY - sy) * unitY, 0, PH - 20);
      wrapEl.style.left = (obj.x / PW * 100) + '%';
      wrapEl.style.top = (obj.y / PH * 100) + '%';
    }
    function up() {
      wrapEl.removeEventListener('pointermove', move);
      wrapEl.removeEventListener('pointerup', up);
      wrapEl.removeEventListener('pointercancel', up);
      markDirty();
    }
    wrapEl.addEventListener('pointermove', move);
    wrapEl.addEventListener('pointerup', up);
    wrapEl.addEventListener('pointercancel', up);
  }

  function bindSizeHandle(pageEl, page, obj, wrapEl, handle) {
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      pushUndo(page);
      var r = pageEl.getBoundingClientRect();
      var unitX = PW / r.width;
      var sx = e.clientX;
      var ow = obj.w;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      function move(ev) {
        obj.w = clamp(ow + (ev.clientX - sx) * unitX, 80, PW - obj.x);
        wrapEl.style.width = (obj.w / PW * 100) + '%';
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        markDirty();
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function selectObject(pageEl, objEl) {
    $$('#spread .obj.selected').forEach(function (o) { o.classList.remove('selected'); });
    objEl.classList.add('selected');
    state.selected = { pageId: pageEl.dataset.pageId, objId: objEl.dataset.objId };
    renderOptions();
  }
  function hideSelection() {
    $$('#spread .obj.selected').forEach(function (o) { o.classList.remove('selected'); });
    state.selected = null;
  }

  function selectedObject() {
    if (!state.selected) return null;
    var page = pageById(state.selected.pageId);
    if (!page) return null;
    for (var i = 0; i < page.objects.length; i++) if (page.objects[i].id === state.selected.objId) return page.objects[i];
    return null;
  }

  function createTextAt(pageEl, e) {
    var page = pageEl._page || pageById(pageEl.dataset.pageId);
    if (!page) return;
    var pt = pagePoint(pageEl, e);
    var size = state.text.size;
    var w = Math.min(460, PW - clamp(pt.x, 20, PW - 120));
    var obj = {
      id: uid('ob'), type: 'text',
      x: clamp(pt.x, 10, PW - 80),
      y: clamp(pt.y - size * 0.7, 8, PH - 60),
      w: Math.max(180, w),
      text: '',
      font: state.text.font,
      size: size,
      color: state.text.color
    };
    pushUndo(page);
    page.objects.push(obj);
    renderObjects(pageEl, page);
    hideHint(pageEl);
    var objEl = pageEl.querySelector('.obj[data-obj-id="' + obj.id + '"]');
    if (objEl) {
      selectObject(pageEl, objEl);
      var txt = objEl.querySelector('.txt');
      if (txt) {
        txt.focus();
        try {
          var rng = document.createRange();
          rng.selectNodeContents(txt);
          rng.collapse(false);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(rng);
        } catch (err) {}
      }
    }
    markDirty();
  }

  function addObjectToActive(obj) {
    var pageEl = activePageEl();
    var page = activePage();
    if (!pageEl || !page) { toast('먼저 노트를 열어 주세요'); return; }
    pushUndo(page);
    page.objects.push(obj);
    renderObjects(pageEl, page);
    hideHint(pageEl);
    markDirty();
  }

  function insertChecklist() {
    addObjectToActive({
      id: uid('ob'), type: 'check',
      x: 110, y: 170, w: 560,
      title: '체크리스트',
      items: [{ text: '', done: false }]
    });
  }

  function insertDate() {
    addObjectToActive({
      id: uid('ob'), type: 'text',
      x: 80, y: 90, w: 480,
      text: fmtDateLong(),
      font: state.text.font, size: 30, color: state.text.color
    });
  }

  function insertPhoto() {
    var input = $('#photoInput');
    input.value = '';
    input.click();
  }

  function handlePhotoFiles(files) {
    if (!files || !files.length) return;
    var pageEl = activePageEl();
    var page = activePage();
    if (!pageEl || !page) return;

    var offset = 0;
    Array.prototype.slice.call(files).slice(0, 6).forEach(function (file) {
      if (!file.type || file.type.indexOf('image') !== 0) return;
      downscaleImage(file, 1600).then(function (res) {
        return putAsset(res.blob, res.w, res.h).then(function (asset) {
          var w = 420;
          var h = w * (asset.h / asset.w);
          var obj = {
            id: uid('ob'), type: 'image', assetId: asset.id,
            x: clamp(140 + offset, 10, PW - w - 10),
            y: clamp(200 + offset, 10, PH - 80),
            w: w, h: h
          };
          offset += 24;
          addObjectToActive(obj);
        });
      }).catch(function (err) { console.warn(err); toast('사진을 넣지 못했어요'); });
    });
  }

  function downscaleImage(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSize / Math.max(w, h));
        var tw = Math.round(w * scale), th = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = tw; c.height = th;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, tw, th);
        c.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('no blob')); return; }
          resolve({ blob: blob, w: tw, h: th });
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image load')); };
      img.src = url;
    });
  }

  /* ─────────── 툴바 ─────────── */
  function setTool(tool, silent) {
    if (tool !== state.tool) closeStylePopover();
    state.tool = tool;
    $$('.tool[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    var spread = $('#spread');
    if (spread) spread.classList.toggle('drawing', isDrawTool());
    if (!silent) hideSelection();
    renderOptions();
    // 빈 쪽 안내문 갱신
    if (state.nb) {
      state.nb.pages.forEach(function (p) {
        if (!isEmptyPage(p)) return;
        var pe = $('#spread .page[data-page-id="' + p.id + '"]');
        if (!pe) return;
        var h = pe.querySelector('.hint-layer');
        if (h) h.textContent = tool === 'text' ? '탭해서 글자를 넣어 보세요' : (isDrawTool() ? '여기에 그려 보세요' : '탭해서 시작');
      });
    }
  }

  function renderOptions() {
    var row = $('#optRow');
    var pop = $('#stylePopover');
    var wide = isWideBar();
    if (row) row.innerHTML = '';
    if (pop) pop.innerHTML = '';
    var tool = state.tool;
    var parts = [];   // { label, node } — 넓은 화면에서는 팝오버에, 좁은 화면에서는 옵션 줄에 들어간다

    if (tool === 'select') {
      var obj = selectedObject();
      if (obj && obj.type === 'text') {
        parts.push({ label: '글꼴', node: fontGroup(obj) });
        parts.push({ label: '크기', node: sizeGroup(obj) });
        parts.push({ label: '색', node: colorGroup(obj, inkColors()) });
      } else if (obj) {
        var delWrap = el('div', 'opt-group');
        var db = el('button', 'chip');
        db.type = 'button';
        db.innerHTML = '<svg class="ico"><use href="#i-trash"/></svg>선택 삭제';
        db.addEventListener('click', function () {
          var page = pageById(state.selected.pageId);
          var pageEl = $('#spread .page[data-page-id="' + state.selected.pageId + '"]');
          if (!page || !pageEl) return;
          pushUndo(page);
          page.objects = page.objects.filter(function (o) { return o.id !== state.selected.objId; });
          state.selected = null;
          renderObjects(pageEl, page);
          markDirty();
          renderOptions();
        });
        delWrap.appendChild(db);
        parts.push({ label: '선택', node: delWrap });
      } else {
        var hint = el('span', 'opt-label');
        hint.textContent = '글자나 사진을 탭해 옮기거나 꾸밀 수 있어요';
        parts.push({ label: '', node: hint });
      }
    } else if (tool === 'text') {
      parts.push({ label: '글꼴', node: fontGroup(null) });
      parts.push({ label: '크기', node: sizeGroup(null) });
      parts.push({ label: '색', node: colorGroup(null, inkColors()) });
    } else if (tool === 'pen') {
      parts.push({ label: '색', node: colorGroup(null, inkColors(), state.pen.color, function (c) { state.pen.color = c; applyToSelectedText('color', c); }) });
      parts.push({ label: '굵기', node: widthGroup([2, 3.5, 6, 9], state.pen.width, function (w) { state.pen.width = w; }) });
    } else if (tool === 'hl') {
      parts.push({ label: '색', node: colorGroup(null, HL_COLORS, state.hl.color, function (c) { state.hl.color = c; }) });
      parts.push({ label: '굵기', node: widthGroup([14, 22, 32], state.hl.width, function (w) { state.hl.width = w; }) });
    } else if (tool === 'eraser') {
      parts.push({ label: '굵기', node: widthGroup([16, 28, 46], state.eraser.width, function (w) { state.eraser.width = w; }, '지우개') });
    }

    if (wide) {
      // 한 줄 바: 옵션은 색·굵기 버튼을 누르면 열리는 팝오버 안에 둔다
      if (pop) {
        parts.forEach(function (p) {
          var r = el('div', 'pop-row');
          if (p.label) {
            var l = el('span', 'pop-label');
            l.textContent = p.label;
            r.appendChild(l);
          }
          r.appendChild(p.node);
          pop.appendChild(r);
        });
        if (!pop.hidden) positionStylePopover();
      }
    } else if (row) {
      parts.forEach(function (p) { row.appendChild(p.node); });
    }

    updateStyleBtn(parts.length > 0);
    if (!parts.length) closeStylePopover();
  }

  /* ─────────── 색·굵기 압축 버튼과 팝오버 ─────────── */
  function styleState() {
    var t = state.tool;
    if (t === 'pen') return { kind: 'pen', color: state.pen.color, width: state.pen.width, cap: '색' };
    if (t === 'hl') return { kind: 'hl', color: state.hl.color, width: state.hl.width, cap: '색' };
    if (t === 'eraser') return { kind: 'eraser', color: '#8a7d64', width: state.eraser.width, cap: '굵기' };
    if (t === 'text') return { kind: 'text', color: state.text.color, width: 0, cap: '색' };
    if (t === 'select') {
      var sel = selectedObject();
      if (!sel) return null;
      return { kind: 'text', color: sel.type === 'text' ? sel.color : '#8a7d64', width: 0, cap: '선택' };
    }
    return null;
  }

  function updateStyleBtn(has) {
    var btn = $('#btnStyle');
    if (!btn) return;
    var st = styleState();
    var ok = !!has && !!st;
    btn.disabled = !ok;
    var prev = btn.querySelector('.style-prev');
    var cap = btn.querySelector('.style-cap');
    if (cap) cap.textContent = (ok && st) ? st.cap : '색';
    if (!prev) return;
    prev.innerHTML = '';
    var d = el('span', 'style-dot');
    if (ok && st && st.kind === 'text') {
      d.classList.add('is-text');
      d.textContent = '가';
      d.style.color = st.color;
    } else if (ok && st && st.kind === 'eraser') {
      d.classList.add('is-eraser');
    } else if (ok && st && st.kind === 'hl') {
      var hw = Math.round(clamp(st.width * 0.65, 10, 20));
      d.style.width = hw + 'px';
      d.style.height = '9px';
      d.style.borderRadius = '3px';
      d.style.background = st.color;
      d.style.opacity = '0.85';
    } else if (ok && st) {
      var s = Math.round(clamp(5 + st.width * 1.5, 9, 19));
      d.style.width = s + 'px';
      d.style.height = s + 'px';
      d.style.background = st.color;
    }
    prev.appendChild(d);
  }

  function stylePopoverOpen() {
    var p = $('#stylePopover');
    return !!(p && !p.hidden);
  }

  function positionStylePopover() {
    var pop = $('#stylePopover');
    var btn = $('#btnStyle');
    if (!pop || !btn || pop.hidden) return;
    var r = btn.getBoundingClientRect();
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    var top = r.top - h - 8;
    if (top < 8) top = Math.min(window.innerHeight - h - 8, r.bottom + 8);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(Math.max(8, top)) + 'px';
  }

  function openStylePopover() {
    var pop = $('#stylePopover');
    var btn = $('#btnStyle');
    if (!pop || !btn || btn.disabled) return;
    renderOptions();
    if (!pop.firstChild) return;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    positionStylePopover();
  }

  function closeStylePopover() {
    var pop = $('#stylePopover');
    var btn = $('#btnStyle');
    if (pop && !pop.hidden) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function inkColors() {
    return isDarkPaper() ? PEN_COLORS.concat(['#f2efe6']) : PEN_COLORS;
  }

  function fontGroup(targetObj) {
    var g = el('div', 'opt-group');
    FONTS.forEach(function (f) {
      var b = el('button', 'chip font-chip' + ((targetObj ? targetObj.font : state.text.font) === f.id ? ' active' : ''));
      b.type = 'button';
      b.textContent = f.name;
      b.style.fontFamily = f.css;
      b.addEventListener('click', function () {
        if (targetObj) {
          var page = pageById(state.selected.pageId);
          page && pushUndo(page);
          targetObj.font = f.id;
          var pe = $('#spread .page[data-page-id="' + state.selected.pageId + '"]');
          var oe = pe && pe.querySelector('.obj[data-obj-id="' + targetObj.id + '"] .txt');
          if (oe) oe.style.fontFamily = f.css;
          markDirty();
        } else {
          state.text.font = f.id;
          applyToSelectedText('font', f.id);
        }
        renderOptions();
      });
      g.appendChild(b);
    });
    return g;
  }

  function sizeGroup(targetObj) {
    var g = el('div', 'opt-group');
    var cur = targetObj ? targetObj.size : state.text.size;
    TEXT_SIZES.forEach(function (s) {
      var b = el('button', 'chip' + (cur === s ? ' active' : ''));
      b.type = 'button';
      b.textContent = String(s);
      b.addEventListener('click', function () {
        if (targetObj) {
          var page = pageById(state.selected.pageId);
          page && pushUndo(page);
          targetObj.size = s;
          var pe = $('#spread .page[data-page-id="' + state.selected.pageId + '"]');
          var oe = pe && pe.querySelector('.obj[data-obj-id="' + targetObj.id + '"] .txt');
          if (oe) oe.style.fontSize = 'calc(var(--pscale) * ' + s + 'px)';
          markDirty();
        } else {
          state.text.size = s;
          applyToSelectedText('size', s);
        }
        renderOptions();
      });
      g.appendChild(b);
    });
    return g;
  }

  function colorGroup(targetObj, colors, current, onPick) {
    var g = el('div', 'opt-group');
    var cur = targetObj ? targetObj.color : (current || state.text.color);
    colors.forEach(function (c) {
      var b = el('button', 'swatch' + (cur === c ? ' active' : ''));
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.addEventListener('click', function () {
        if (targetObj) {
          var page = pageById(state.selected.pageId);
          page && pushUndo(page);
          targetObj.color = c;
          var pe = $('#spread .page[data-page-id="' + state.selected.pageId + '"]');
          var oe = pe && pe.querySelector('.obj[data-obj-id="' + targetObj.id + '"] .txt');
          if (oe) oe.style.color = c;
          markDirty();
        } else if (onPick) {
          onPick(c);
        } else {
          state.text.color = c;
        }
        renderOptions();
      });
      g.appendChild(b);
    });
    return g;
  }

  function applyToSelectedText(kind, value) {
    var obj = selectedObject();
    if (!obj || obj.type !== 'text') return;
    if (kind === 'color') obj.color = value;
    if (kind === 'font') obj.font = value;
    if (kind === 'size') obj.size = value;
    var pe = $('#spread .page[data-page-id="' + state.selected.pageId + '"]');
    var oe = pe && pe.querySelector('.obj[data-obj-id="' + obj.id + '"] .txt');
    if (oe) {
      if (kind === 'color') oe.style.color = value;
      if (kind === 'font') oe.style.fontFamily = fontCss(value);
      if (kind === 'size') oe.style.fontSize = 'calc(var(--pscale) * ' + value + 'px)';
    }
    markDirty();
  }

  function widthGroup(widths, current, onPick, label) {
    var g = el('div', 'opt-group');
    if (label) {
      var l = el('span', 'opt-label');
      l.textContent = label;
      g.appendChild(l);
    }
    widths.forEach(function (w) {
      var b = el('button', 'width-btn' + (current === w ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', '굵기 ' + w);
      var dot = document.createElement('span');
      var size = Math.max(2, Math.min(14, w * 1.3));
      dot.style.width = size + 'px';
      dot.style.height = size + 'px';
      b.appendChild(dot);
      b.addEventListener('click', function () { onPick(w); renderOptions(); });
      g.appendChild(b);
    });
    return g;
  }

  /* ─────────── 페이지 이동 ─────────── */
  function updatePager() {
    var nb = state.nb;
    if (!nb) return;
    var total = nb.pages.length;
    var start = state.spread ? state.idx - (state.idx % 2) : state.idx;
    var end = state.spread ? Math.min(start + 1, total - 1) : start;
    var label = state.spread && end > start ? (start + 1) + '–' + (end + 1) + ' / ' + total : (start + 1) + ' / ' + total;
    $('#pageLabel').textContent = label;
    $('#noteSub').textContent = total + '쪽 · ' + (state.spread ? '펼침' : '한 쪽');
    var step = state.spread ? 2 : 1;
    $('#btnPrev').disabled = start <= 0;
    $('#btnNext').disabled = start + step > total - 1;
  }

  /* 화면을 곧바로 바꾸기(애니메이션 없이) */
  function commitPage(index) {
    if (!state.nb) return;
    var total = state.nb.pages.length;
    index = clamp(index, 0, total - 1);
    if (state.spread) index = index - (index % 2);
    state.idx = index;
    state.selected = null;
    state.activePageId = state.nb.pages[index] ? state.nb.pages[index].id : null;
    renderSpread();
    renderOptions();
    updateUndoButtons();
  }

  function goPage(index, opts) {
    opts = opts || {};
    if (!state.nb) return;
    if (state.flipping) cancelFlip();   // 목차처럼 도중에 다른 쪽을 고르면 넘기기를 정리하고 바로 이동한다
    var total = state.nb.pages.length;
    index = clamp(index, 0, total - 1);
    if (state.spread) index = index - (index % 2);

    var from = state.idx;
    if (index === from) { commitPage(index); return; }

    var dir = index > from ? 1 : -1;
    var animate = opts.animate !== false && !state.flipping && !reduceMotion() && !$('#noteView').hidden;
    if (animate && startFlip(dir, fromStart(from), index)) return;
    commitPage(index);
  }

  /* 지금 보이는 펼침의 첫 쪽 */
  function fromStart(idx) {
    return state.spread ? idx - (idx % 2) : idx;
  }

  function stepPage(dir) {
    if (state.flipping) return;
    var step = state.spread ? 2 : 1;
    goPage(state.idx + dir * step);
  }

  function addPage() {
    var nb = state.nb;
    if (!nb) return;
    var insertAt = state.spread ? Math.min(state.idx - (state.idx % 2) + 2, nb.pages.length) : state.idx + 1;
    var p = newPage();
    nb.pages.splice(insertAt, 0, p);
    p._undo = []; p._redo = [];
    saveNB(nb);
    goPage(insertAt);
    toast((insertAt + 1) + '쪽을 추가했어요');
  }

  /* ─────────── 책장 넘김(페이지 플립) ───────────
     종이를 책등(가운데 접힘선)이나 종이 끝을 축으로 3D로 젖혀 넘긴다.
     넘어가는 종이 앞면 = 지금 보이던 쪽, 뒷면 = 넘긴 뒤 왼쪽(또는 오른쪽)에 놓일 쪽. */
  var FLIP_MS = 460;        // 젖혀지는 시간
  var FLIP_FADE_MS = 90;    // 다 넘긴 뒤 살짝 겹쳐 사라지는 시간(그림-실제 쪽 차이를 감춤)
  var flipToken = 0;

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  function pageElByIndex(i) {
    var nb = state.nb;
    if (!nb || !nb.pages[i]) return null;
    return $('#spread .page[data-page-id="' + nb.pages[i].id + '"]');
  }

  /* 넘길 종이의 한 면: 지금 화면 모양 그대로(종이·속지·잉크·글자)를 그림으로 떠 둔다 */
  function flipFace(page, index, w, h) {
    var wrap = el('div', 'page flip-face-page ' + state.nb.paper.type + ' paper-' + state.nb.paper.color);
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.setProperty('--pscale', String(w / PW));
    wrap.style.setProperty('--rule', 'calc(' + (w / PW) + ' * ' + RULE + 'px)');
    wrap.innerHTML = '<div class="folio">' + (index + 1) + '</div>';
    var sc = clamp((w * (window.devicePixelRatio || 1)) / PW, 0.8, 2);
    return drawPageToCanvas(page, sc).then(function (src) {
      var cv = document.createElement('canvas');
      cv.className = 'ink';
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      wrap.insertBefore(cv, wrap.firstChild);
      return wrap;
    });
  }

  function startFlip(dir, fromIdx, toIdx) {
    var nb = state.nb;
    if (!nb || state.flipping) return false;
    var total = nb.pages.length;
    var spread = !!state.spread;
    var sheetIdx, backIdx, underIdx;

    if (spread) {
      if (dir > 0) { sheetIdx = fromIdx + 1; backIdx = toIdx; underIdx = fromIdx; }
      else { sheetIdx = fromIdx; backIdx = toIdx + 1; underIdx = fromIdx + 1; }
    } else {
      sheetIdx = fromIdx; backIdx = toIdx; underIdx = -1;
    }
    if (sheetIdx < 0 || sheetIdx >= total || backIdx < 0 || backIdx >= total) return false;

    var sheetEl = pageElByIndex(sheetIdx);
    if (!sheetEl) return false;
    var stage = $('#stage');
    if (!stage) return false;
    var stageRect = stage.getBoundingClientRect();
    var sr = sheetEl.getBoundingClientRect();
    if (!sr.width || !sr.height) return false;
    var underEl = underIdx >= 0 ? pageElByIndex(underIdx) : null;
    var ur = underEl ? underEl.getBoundingClientRect() : null;

    var jobs = [
      flipFace(nb.pages[sheetIdx], sheetIdx, sr.width, sr.height),
      flipFace(nb.pages[backIdx], backIdx, sr.width, sr.height)
    ];
    if (underEl && ur && ur.width) {
      jobs.push(flipFace(nb.pages[underIdx], underIdx, ur.width, ur.height));
    } else {
      underIdx = -1;
    }

    state.flipping = true;
    var token = ++flipToken;
    // 어떤 이유로 끝을 못 짚어도 화면이 잠기지 않도록 안전망
    setTimeout(function () { if (token === flipToken && state.flipping) cancelFlip(); }, 2500);

    Promise.all(jobs).then(function (faces) {
      if (token !== flipToken || !state.nb) return;
      buildFlipLayer(dir, faces, sr, ur, stageRect, toIdx, token);
    }).catch(function (err) {
      console.warn('페이지 넘김 준비 실패', err);
      if (token === flipToken) { state.flipping = false; commitPage(toIdx); }
    });
    return true;
  }

  function buildFlipLayer(dir, faces, sr, ur, stageRect, toIdx, token) {
    var offX = sr.left - stageRect.left, offY = sr.top - stageRect.top;
    var w = sr.width, h = sr.height;

    var layer = el('div', 'flip-layer');
    var scene = el('div', 'flip-scene');
    layer.appendChild(scene);

    // 넘기기 직전에 보이던 반대쪽 종이는 그대로 두고, 넘어간 종이가 덮는다
    if (faces[2] && ur) {
      var under = el('div', 'flip-under');
      under.style.left = (ur.left - stageRect.left) + 'px';
      under.style.top = (ur.top - stageRect.top) + 'px';
      under.style.width = ur.width + 'px';
      under.style.height = ur.height + 'px';
      under.appendChild(faces[2]);
      scene.appendChild(under);
    }

    var sheet = el('div', 'flip-sheet');
    sheet.style.left = offX + 'px';
    sheet.style.top = offY + 'px';
    sheet.style.width = w + 'px';
    sheet.style.height = h + 'px';
    sheet.style.transformOrigin = (dir > 0 ? '0% 50%' : '100% 50%');

    var front = el('div', 'flip-face front');
    front.appendChild(faces[0]);
    var back = el('div', 'flip-face back');
    back.appendChild(faces[1]);

    // 접힘선 쪽 그늘과 넘어가는 결 하이라이트
    var fShade = el('div', 'flip-shade');
    fShade.style.background = dir > 0
      ? 'linear-gradient(to right, rgba(48,32,10,0.55) 0%, rgba(48,32,10,0.10) 22%, rgba(255,255,255,0.12) 58%, rgba(255,255,255,0) 100%)'
      : 'linear-gradient(to left, rgba(48,32,10,0.55) 0%, rgba(48,32,10,0.10) 22%, rgba(255,255,255,0.12) 58%, rgba(255,255,255,0) 100%)';
    fShade.style.opacity = '0.25';
    front.appendChild(fShade);

    var bShade = el('div', 'flip-shade');
    bShade.style.background = dir > 0
      ? 'linear-gradient(to left, rgba(48,32,10,0.62) 0%, rgba(48,32,10,0.08) 26%, rgba(255,255,255,0.10) 100%)'
      : 'linear-gradient(to right, rgba(48,32,10,0.62) 0%, rgba(48,32,10,0.08) 26%, rgba(255,255,255,0.10) 100%)';
    bShade.style.opacity = '0.95';
    back.appendChild(bShade);

    sheet.appendChild(front);
    sheet.appendChild(back);
    scene.appendChild(sheet);
    $('#stage').appendChild(layer);

    // 넘어간 뒤의 펼침을 미리 그려 둔다(넘어가는 종이 밑에서 드러난다)
    commitPage(toIdx);

    var s = dir > 0 ? -1 : 1;
    var kf = [
      { transform: 'rotateY(0deg) translateZ(0px)', offset: 0 },
      { transform: 'rotateY(' + (s * 13) + 'deg) translateZ(14px)', offset: 0.14 },
      { transform: 'rotateY(' + (s * 92) + 'deg) translateZ(26px)', offset: 0.5 },
      { transform: 'rotateY(' + (s * 167) + 'deg) translateZ(9px)', offset: 0.88 },
      { transform: 'rotateY(' + (s * 180) + 'deg) translateZ(0px)', offset: 1 }
    ];
    var anim;
    try {
      anim = sheet.animate(kf, { duration: FLIP_MS, easing: 'cubic-bezier(.42,.02,.34,1)', fill: 'forwards' });
      if (fShade.animate) {
        fShade.animate([{ opacity: 0.25 }, { opacity: 0.95 }], { duration: FLIP_MS * 0.5, easing: 'ease-in', fill: 'forwards' });
        bShade.animate([{ opacity: 0.95 }, { opacity: 0.28 }], { duration: FLIP_MS, easing: 'ease-out', fill: 'forwards' });
      }
    } catch (e) {
      commitPageDone(token, layer);
      return;
    }

    var done = false;
    function cleanup() {
      if (done) return;
      done = true;
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      if (token === flipToken) state.flipping = false;
    }

    function settle() {
      if (done) return;
      // 덮고 있던 옛 종이를 치우면 밑에 미리 그려 둔 새 쪽이 드러난다
      var u = layer.querySelector('.flip-under');
      if (u && u.parentNode) u.parentNode.removeChild(u);
      try {
        sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLIP_FADE_MS, easing: 'ease-out', fill: 'forwards' });
      } catch (e) {}
      setTimeout(cleanup, FLIP_FADE_MS + 20);
    }

    if (anim && anim.finished && anim.finished.then) {
      anim.finished.then(function () { if (token === flipToken) settle(); }).catch(function () {});
    }
    setTimeout(function () { if (token === flipToken) settle(); }, FLIP_MS + 90);
    setTimeout(cleanup, FLIP_MS + FLIP_FADE_MS + 700);
  }

  function commitPageDone(token, layer) {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    if (token === flipToken) state.flipping = false;
  }

  function cancelFlip() {
    flipToken++;
    state.flipping = false;
    var stage = $('#stage');
    if (!stage) return;
    $$('.flip-layer', stage).forEach(function (n) { n.parentNode.removeChild(n); });
  }

  /* ─────────── 목차 ─────────── */
  function openToc() {
    var drawer = $('#tocDrawer');
    drawer.hidden = false;
    $('#scrim').hidden = false;
    renderToc();
  }
  function closeToc() {
    $('#tocDrawer').hidden = true;
    if ($('#searchModal').hidden && $('#settingsSheet').hidden) $('#scrim').hidden = true;
  }

  function renderToc() {
    var list = $('#tocList');
    list.innerHTML = '';
    var nb = state.nb;
    if (!nb) return;

    nb.pages.forEach(function (page, i) {
      var item = el('button', 'toc-item' + (i === state.idx ? ' active' : ''));
      item.type = 'button';
      var thumb = el('div', 'thumb paper-' + nb.paper.color);
      var c = document.createElement('canvas');
      c.width = 96; c.height = 136;
      thumb.appendChild(c);
      var cap = el('div', 'cap');
      cap.textContent = (i + 1) + '쪽';
      item.appendChild(thumb);
      item.appendChild(cap);
      item.addEventListener('click', function () {
        closeToc();
        goPage(i);
      });
      list.appendChild(item);
      renderThumb(c, page).catch(function () {});
    });
  }

  function renderThumb(canvas, page) {
    return drawPageToCanvas(page, 1, canvas.width / PW).then(function (src) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    });
  }

  /* ─────────── 검색 ─────────── */
  function openSearch() {
    $('#searchModal').hidden = false;
    $('#scrim').hidden = false;
    var inp = $('#searchInput');
    inp.value = '';
    $('#searchResults').innerHTML = '<div class="search-empty">찾고 싶은 글자를 입력하세요</div>';
    setTimeout(function () { inp.focus(); }, 60);
  }
  function closeSearch() {
    $('#searchModal').hidden = true;
    if ($('#tocDrawer').hidden && $('#settingsSheet').hidden) $('#scrim').hidden = true;
  }

  function runSearch(q) {
    var box = $('#searchResults');
    box.innerHTML = '';
    var nb = state.nb;
    if (!nb) return;
    q = q.trim();
    if (!q) {
      box.innerHTML = '<div class="search-empty">찾고 싶은 글자를 입력하세요</div>';
      return;
    }
    var hits = [];
    nb.pages.forEach(function (page, i) {
      (page.objects || []).forEach(function (obj) {
        var texts = [];
        if (obj.type === 'text' && obj.text) texts.push(obj.text);
        if (obj.type === 'check') {
          (obj.items || []).forEach(function (it) { if (it.text) texts.push(it.text); });
        }
        texts.forEach(function (t) {
          if (t.toLowerCase().indexOf(q.toLowerCase()) >= 0) hits.push({ page: i, text: t });
        });
      });
    });

    if (!hits.length) {
      box.innerHTML = '<div class="search-empty">"' + esc(q) + '" 를 찾지 못했어요</div>';
      return;
    }
    hits.slice(0, 60).forEach(function (h) {
      var b = el('button', 'search-hit');
      b.type = 'button';
      var snippet = h.text.replace(/\n/g, ' ');
      var plain = esc(snippet);
      var idx = snippet.toLowerCase().indexOf(q.toLowerCase());
      var marked = plain;
      if (idx >= 0) {
        var before = esc(snippet.slice(0, idx));
        var match = esc(snippet.slice(idx, idx + q.length));
        var after = esc(snippet.slice(idx + q.length));
        marked = before + '<mark>' + match + '</mark>' + after;
      }
      b.innerHTML = '<div class="pg">' + (h.page + 1) + '쪽</div><div class="tx">' + marked + '</div>';
      b.addEventListener('click', function () {
        closeSearch();
        goPage(h.page);
      });
      box.appendChild(b);
    });
  }

  /* ─────────── 설정 시트 ─────────── */
  function openSettings() {
    var nb = state.nb;
    if (!nb) return;
    $('#setTitle').value = nb.title;
    buildSettingsColors(nb);
    buildSettingsPatterns(nb);
    buildSettingsPapers(nb);
    buildSettingsPaperColors(nb);
    $('#settingsSheet').hidden = false;
    $('#scrim').hidden = false;
  }
  function closeSettings() {
    $('#settingsSheet').hidden = true;
    if ($('#tocDrawer').hidden && $('#searchModal').hidden) $('#scrim').hidden = true;
  }

  function buildSettingsColors(nb) {
    var box = $('#setColors');
    box.innerHTML = '';
    COVER_COLORS.forEach(function (c) {
      var b = el('button', 'swatch' + (nb.cover.color === c.id ? ' active' : ''));
      b.type = 'button';
      b.style.background = c.id;
      b.title = c.name;
      b.setAttribute('aria-label', c.name);
      b.addEventListener('click', function () {
        nb.cover.color = c.id;
        saveNB(nb);
        buildSettingsColors(nb);
        if (state.nb === nb && !$('#noteView').hidden) {
          // 표지는 책장에서 보이므로 여기서는 표시만 갱신
        }
        renderShelf();
      });
      box.appendChild(b);
    });
  }
  function buildSettingsPatterns(nb) {
    var box = $('#setPatterns');
    box.innerHTML = '';
    PATTERNS.forEach(function (p) {
      var b = el('button', 'chip' + (nb.cover.pattern === p.id ? ' active' : ''));
      b.type = 'button';
      b.dataset.pattern = p.id;
      b.textContent = p.name;
      b.addEventListener('click', function () {
        nb.cover.pattern = p.id;
        saveNB(nb);
        buildSettingsPatterns(nb);
        renderShelf();
      });
      box.appendChild(b);
    });
  }
  function buildSettingsPapers(nb) {
    var box = $('#setPaper');
    box.innerHTML = '';
    PAPERS.forEach(function (p) {
      var b = el('button', 'chip' + (nb.paper.type === p.id ? ' active' : ''));
      b.type = 'button';
      b.dataset.paper = p.id;
      b.textContent = p.name;
      b.addEventListener('click', function () {
        nb.paper.type = p.id;
        saveNB(nb);
        buildSettingsPapers(nb);
        if (state.nb === nb) renderSpread();
        renderShelf();
      });
      box.appendChild(b);
    });
  }
  function buildSettingsPaperColors(nb) {
    var box = $('#setPaperColor');
    box.innerHTML = '';
    PAPER_COLORS.forEach(function (p) {
      var b = el('button', 'chip' + (nb.paper.color === p.id ? ' active' : ''));
      b.type = 'button';
      b.dataset.pcolor = p.id;
      b.textContent = p.name;
      b.addEventListener('click', function () {
        nb.paper.color = p.id;
        saveNB(nb);
        buildSettingsPaperColors(nb);
        if (state.nb === nb) { applyPaperDefaults(); renderSpread(); renderOptions(); }
        renderShelf();
      });
      box.appendChild(b);
    });
  }

  /* ─────────── 내보내기 ─────────── */
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }

  function drawPageToCanvas(page, quality, scaleOverride) {
    var nb = state.nb;
    var scale = scaleOverride || quality || 2;
    var c = document.createElement('canvas');
    c.width = Math.round(PW * scale);
    c.height = Math.round(PH * scale);
    var ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // 종이
    var paperHex = paperCss(nb.paper.color);
    ctx.fillStyle = paperHex;
    ctx.fillRect(0, 0, PW, PH);

    // 속지
    var dark = nb.paper.color === 'dark';
    var ruleColor = dark ? 'rgba(255,255,255,0.14)' : (nb.paper.color === 'white' ? 'rgba(120,140,168,0.32)' : 'rgba(126,112,82,0.30)');
    ctx.strokeStyle = ruleColor;
    ctx.lineWidth = Math.max(0.7, 1 / scale);
    if (nb.paper.type === 'lined') {
      ctx.beginPath();
      for (var y = RULE; y < PH; y += RULE) { ctx.moveTo(0, y); ctx.lineTo(PW, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196,98,88,0.38)';
      ctx.beginPath(); ctx.moveTo(74, 0); ctx.lineTo(74, PH); ctx.stroke();
    } else if (nb.paper.type === 'grid') {
      ctx.beginPath();
      for (var gy = RULE; gy < PH; gy += RULE) { ctx.moveTo(0, gy); ctx.lineTo(PW, gy); }
      for (var gx = RULE; gx < PW; gx += RULE) { ctx.moveTo(gx, 0); ctx.lineTo(gx, PH); }
      ctx.stroke();
    } else if (nb.paper.type === 'dot') {
      ctx.fillStyle = ruleColor;
      for (var dy = RULE / 2; dy < PH; dy += RULE) {
        for (var dx = RULE / 2; dx < PW; dx += RULE) {
          ctx.beginPath();
          ctx.arc(dx, dy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 스트로크 — 지우개(destination-out)가 종이를 지우지 않도록 잉크층에 따로 그린 뒤 합성
    var ink = document.createElement('canvas');
    ink.width = c.width; ink.height = c.height;
    var ictx = ink.getContext('2d');
    ictx.setTransform(scale, 0, 0, scale, 0, 0);
    (page.strokes || []).forEach(function (s) { drawStrokeFull(ictx, s); });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(ink, 0, 0);
    ctx.restore();

    // 객체
    var tasks = [];
    (page.objects || []).forEach(function (obj) {
      if (obj.type === 'text') {
        drawTextObj(ctx, obj);
      } else if (obj.type === 'check') {
        drawCheckObj(ctx, obj, dark);
      } else if (obj.type === 'image') {
        tasks.push(drawImageObj(ctx, obj));
      }
    });

    return Promise.all(tasks).then(function () { return c; });
  }

  function drawTextObj(ctx, obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.font = obj.size + 'px ' + fontCss(obj.font);
    ctx.textBaseline = 'top';
    var x = obj.x + 6, y = obj.y + 4;
    var maxW = obj.w - 12;
    var lines = wrapText(ctx, obj.text || '', maxW);
    var lh = obj.size * 1.5;
    lines.forEach(function (line, i) { ctx.fillText(line, x, y + i * lh); });
    ctx.restore();
  }

  function wrapText(ctx, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      if (para === '') { out.push(''); return; }
      var line = '';
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        var test = line + ch;
        if (ctx.measureText(test).width > maxW && line) {
          out.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      out.push(line);
    });
    return out;
  }

  function drawCheckObj(ctx, obj, dark) {
    var pad = 12;
    var width = obj.w - pad * 2;
    var x = obj.x + pad, y = obj.y + pad;
    var lh = 34;
    var h = 44 + (obj.items || []).length * lh + 16;

    ctx.save();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.45)';
    roundRect(ctx, obj.x, obj.y, obj.w, h, 8);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(120,100,70,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, obj.x, obj.y, obj.w, h, 8);
    ctx.stroke();

    ctx.fillStyle = dark ? '#f2efe6' : '#332c21';
    ctx.font = '700 24px ' + fontCss('sans');
    ctx.textBaseline = 'top';
    ctx.fillText(obj.title || '체크리스트', x, y);
    ctx.beginPath();
    ctx.moveTo(x, y + 34); ctx.lineTo(x + width, y + 34);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(120,100,70,0.22)';
    ctx.stroke();

    ctx.font = '24px ' + fontCss('sans');
    (obj.items || []).forEach(function (it, i) {
      var iy = y + 44 + i * lh;
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(80,66,44,0.7)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x, iy + 4, 18, 18);
      if (it.done) {
        ctx.beginPath();
        ctx.moveTo(x + 3, iy + 12); ctx.lineTo(x + 8, iy + 18); ctx.lineTo(x + 17, iy + 5);
        ctx.stroke();
      }
      ctx.fillStyle = it.done ? (dark ? 'rgba(242,239,230,0.55)' : 'rgba(51,44,33,0.55)') : (dark ? '#f2efe6' : '#332c21');
      var label = wrapText(ctx, it.text || '', width - 34)[0] || '';
      ctx.fillText(label, x + 30, iy + 2);
    });
    ctx.restore();
  }

  function drawImageObj(ctx, obj) {
    return new Promise(function (resolve) {
      var src = assetURL(obj.assetId);
      if (!src) { resolve(); return; }
      var img = new Image();
      img.onload = function () {
        var h = obj.w * (img.naturalHeight / img.naturalWidth);
        try { ctx.drawImage(img, obj.x, obj.y, obj.w, h); } catch (e) {}
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function exportPNG() {
    var page = activePage();
    if (!page) return;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      return drawPageToCanvas(page, 2);
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        var name = (state.nb.title || 'note').replace(/[\\/:*?"<>|]/g, '_') + '-' + (state.nb.pages.indexOf(page) + 1) + '쪽.png';
        downloadBlob(blob, name);
        toast('PNG로 저장했어요');
      }, 'image/png');
    });
  }

  function printNotebook() {
    var nb = state.nb;
    if (!nb) return;
    var area = $('#printArea');
    area.innerHTML = '<div class="print-loading">준비 중…</div>';
    toast('인쇄 화면을 준비하고 있어요');

    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var tasks = nb.pages.map(function (p) { return ready.then(function () { return drawPageToCanvas(p, 2); }); });
    Promise.all(tasks).then(function (canvases) {
      area.innerHTML = '';
      canvases.forEach(function (c) {
        var div = el('div', 'print-page');
        var img = document.createElement('img');
        img.src = c.toDataURL('image/jpeg', 0.92);
        img.style.width = '148mm';
        img.style.height = '209mm';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        div.appendChild(img);
        area.appendChild(div);
      });
      setTimeout(function () { window.print(); }, 220);
    });
  }

  function exportJSON() {
    var nb = state.nb;
    var payload = {
      app: 'typedraw-note', version: 1, exportedAt: new Date().toISOString(),
      notebooks: nb ? [serializeNB(nb)] : state.notebooks.map(serializeNB),
      assets: {}
    };
    var ids = {};
    payload.notebooks.forEach(function (n) {
      n.pages.forEach(function (p) {
        (p.objects || []).forEach(function (o) { if (o.assetId) ids[o.assetId] = 1; });
      });
    });
    var keys = Object.keys(ids);
    var chain = Promise.resolve();
    keys.forEach(function (id) {
      chain = chain.then(function () {
        return dbGet('assets', id).then(function (rec) {
          if (!rec || !rec.blob) return null;
          return blobToDataURL(rec.blob).then(function (data) {
            payload.assets[id] = { data: data, w: rec.w, h: rec.h };
          });
        });
      });
    });
    chain.then(function () {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      downloadBlob(blob, 'typedraw-backup-' + stamp + '.json');
      toast('백업 파일을 저장했어요');
    });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function importJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { toast('파일을 읽을 수 없어요'); return; }
      if (!data || !data.notebooks || !data.notebooks.length) { toast('백업 파일이 아니에요'); return; }

      var assetMap = {};
      var chain = Promise.resolve();
      Object.keys(data.assets || {}).forEach(function (oldId) {
        chain = chain.then(function () {
          var rec = data.assets[oldId];
          return dataURLtoBlob(rec.data).then(function (blob) {
            var newId = uid('as');
            return dbPut('assets', { id: newId, blob: blob, w: rec.w, h: rec.h, createdAt: Date.now() }).then(function () {
              state.assets[newId] = URL.createObjectURL(blob);
              assetMap[oldId] = newId;
            });
          });
        });
      });

      chain.then(function () {
        var added = 0;
        (data.notebooks || []).forEach(function (raw) {
          var nb = {
            id: uid('nb'),
            title: raw.title || '불러온 노트',
            cover: raw.cover || { color: '#8c4a3f', pattern: 'linen' },
            paper: raw.paper || { type: 'lined', color: 'cream' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pages: (raw.pages || []).map(function (p) {
              return {
                id: uid('pg'),
                strokes: p.strokes || [],
                objects: (p.objects || []).map(function (o) {
                  var copy = JSON.parse(JSON.stringify(o));
                  copy.id = uid('ob');
                  if (copy.assetId && assetMap[copy.assetId]) copy.assetId = assetMap[copy.assetId];
                  return copy;
                }),
                updatedAt: Date.now()
              };
            })
          };
          if (!nb.pages.length) nb.pages.push(newPage());
          state.notebooks.unshift(nb);
          saveNB(nb, true);
          added++;
        });
        renderShelf();
        toast(added + '권의 노트를 불러왔어요');
      });
    };
    fr.readAsText(file);
  }

  function dataURLtoBlob(dataUrl) {
    return fetch(dataUrl).then(function (r) { return r.blob(); });
  }

  /* ─────────── 팝오버/모달 ─────────── */
  function showPopover(menu, anchor) {
    hidePopovers();
    menu.hidden = false;
    var r = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth || 220;
    var mh = menu.offsetHeight || 200;
    var left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    $('#scrim').hidden = false;
  }
  function hidePopovers() {
    ['#insertMenu', '#moreMenu', '#bookMenu'].forEach(function (s) { var m = $(s); if (m) m.hidden = true; });
    closeStylePopover();
    if ($('#tocDrawer').hidden && $('#settingsSheet').hidden && $('#searchModal').hidden && $('#promptModal').hidden && $('#confirmModal').hidden) {
      $('#scrim').hidden = true;
    }
  }

  function promptText(title, label, value) {
    return new Promise(function (resolve) {
      $('#promptTitle').textContent = title;
      var inp = $('#promptInput');
      inp.value = value || '';
      inp.placeholder = label || '';
      $('#promptModal').hidden = false;
      setTimeout(function () { inp.focus(); inp.select(); }, 60);

      function done(ok) {
        $('#promptModal').hidden = true;
        if ($('#tocDrawer').hidden && $('#settingsSheet').hidden && $('#searchModal').hidden) $('#scrim').hidden = true;
        $('#promptOk').removeEventListener('click', onOk);
        $('#promptCancel').removeEventListener('click', onCancel);
        inp.removeEventListener('keydown', onKey);
        if (activePromptCancel === onCancel) activePromptCancel = null;
        resolve(ok ? inp.value : null);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      function onKey(e) { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }
      $('#promptOk').addEventListener('click', onOk);
      $('#promptCancel').addEventListener('click', onCancel);
      inp.addEventListener('keydown', onKey);
      activePromptCancel = onCancel;
    });
  }

  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      $('#confirmOk').textContent = okLabel || '삭제';
      $('#confirmModal').hidden = false;

      function done(v) {
        $('#confirmModal').hidden = true;
        if ($('#tocDrawer').hidden && $('#settingsSheet').hidden && $('#searchModal').hidden) $('#scrim').hidden = true;
        $('#confirmOk').removeEventListener('click', onOk);
        $('#confirmCancel').removeEventListener('click', onNo);
        if (activeConfirmCancel === onNo) activeConfirmCancel = null;
        resolve(v);
      }
      function onOk() { done(true); }
      function onNo() { done(false); }
      $('#confirmOk').addEventListener('click', onOk);
      $('#confirmCancel').addEventListener('click', onNo);
      activeConfirmCancel = onNo;
    });
  }

  /* ─────────── 손으로 책장 넘기기(스와이프) ───────────
     필기와 부딪치지 않게 이럴 때만 넘긴다.
       · 두 손가락을 좌우로 밀 때(어떤 도구든)
       · 종이 바깥 좌우 여백에서 안쪽으로 밀 때(어떤 도구든)
       · 종이 바깥 모서리 32px 안쪽에서 안쪽으로 밀 때(팬 제외)
       · 선택 도구일 때 종이 위에서 좌우로 밀 때
     그 밖에 한 손가락·S팬으로 종이 안쪽에 그을 때는 절대 넘기지 않는다. */
  var EDGE_PX = 32;     // 종이 바깥 모서리에서 이만큼 안쪽
  var SWIPE_PX = 36;    // 가로로 이만큼 밀면 넘김
  var gx = {
    pts: {},            // pointerId -> {x, y, type}
    one: null,          // 한 손가락 후보
    two: null,          // 두 손가락
    claim: {}           // 넘김 제스처가 가져간 pointerId
  };

  function isGestureClaim(e) {
    return !!state.flipping || !!gx.claim[e.pointerId];
  }

  function outerEdgeSide(pageEl) {
    var slot = pageEl.closest ? pageEl.closest('.slot') : null;
    if (!slot) return null;
    if (slot.classList.contains('left')) return 'left';
    if (slot.classList.contains('right')) return 'right';
    return 'both';
  }

  function abortStrokeIfTouch() {
    var d = state.draw;
    if (!d || d.ptType !== 'touch') return;
    state.draw = null;
    try { d.pageEl.releasePointerCapture(d.pointerId); } catch (e) {}
    redrawInk(d.page);   // 그리다 만 선은 그리고, 되돌리기 기록 전이므로 버린다
  }

  function gestureDown(e) {
    if ($('#noteView').hidden) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gx.pts[e.pointerId] = { x: e.clientX, y: e.clientY, type: e.pointerType };
    if (state.flipping) return;

    var t = e.target;
    var inObj = !!(t && t.closest && t.closest('.obj'));

    // 두 손가락 좌우 밀기
    if (e.pointerType !== 'mouse') {
      var touchIds = [];
      for (var k in gx.pts) if (gx.pts[k].type !== 'mouse') touchIds.push(k);
      if (touchIds.length >= 2) {
        abortStrokeIfTouch();
        var a = gx.pts[touchIds[0]], b = gx.pts[touchIds[1]];
        gx.two = { ids: [touchIds[0], touchIds[1]], x0: (a.x + b.x) / 2, y0: (a.y + b.y) / 2, used: false };
        gx.one = null;
        touchIds.forEach(function (id) { gx.claim[id] = true; });
        if (e.cancelable) e.preventDefault();
        return;
      }
    }
    if (inObj) return;   // 글자·사진을 만지거나 옮길 때는 넘기지 않는다

    var pageEl = t && t.closest ? t.closest('.page') : null;
    var zone = 'margin';
    if (pageEl) {
      var r = pageEl.getBoundingClientRect();
      var side = outerEdgeSide(pageEl);
      var nearEdge =
        ((side === 'left' || side === 'both') && (e.clientX - r.left) <= EDGE_PX) ||
        ((side === 'right' || side === 'both') && (r.right - e.clientX) <= EDGE_PX);
      zone = nearEdge ? 'edge' : 'inside';
      if (zone === 'edge' && e.pointerType === 'pen') zone = 'inside';   // 팬으로 모서리에 쓸 때는 그대로 필기
    }

    if (zone === 'margin' || zone === 'edge') {
      gx.one = { id: e.pointerId, x0: e.clientX, y0: e.clientY, zone: zone, used: false };
      gx.claim[e.pointerId] = true;
      if (e.cancelable) e.preventDefault();
    } else if (zone === 'inside' && state.tool === 'select') {
      // 선택 도구는 그리지 않으므로 가범게 관찰만 한다(끌어서 옮기기와 부딪 치지 않게)
      gx.one = { id: e.pointerId, x0: e.clientX, y0: e.clientY, zone: zone, used: false };
    }
  }

  function gestureMove(e) {
    var p = gx.pts[e.pointerId];
    if (p) { p.x = e.clientX; p.y = e.clientY; }

    if (gx.two && !gx.two.used && gx.two.ids.indexOf(e.pointerId) >= 0) {
      var a = gx.pts[gx.two.ids[0]], b = gx.pts[gx.two.ids[1]];
      if (!a || !b) return;
      var dx2 = ((a.x + b.x) / 2) - gx.two.x0;
      var dy2 = ((a.y + b.y) / 2) - gx.two.y0;
      if (Math.abs(dx2) >= SWIPE_PX && Math.abs(dx2) > Math.abs(dy2) * 1.2) {
        gx.two.used = true;
        turnBySwipe(dx2 < 0 ? 1 : -1);
      }
      return;
    }

    var o = gx.one;
    if (!o || o.used || o.id !== e.pointerId) return;
    if (gx.two) return;
    var dx = e.clientX - o.x0, dy = e.clientY - o.y0;
    var need = o.zone === 'inside' ? SWIPE_PX * 1.2 : SWIPE_PX;
    if (Math.abs(dx) >= need && Math.abs(dx) > Math.abs(dy) * 1.25) {
      o.used = true;
      turnBySwipe(dx < 0 ? 1 : -1);
    }
  }

  function gestureUp(e) {
    delete gx.pts[e.pointerId];
    delete gx.claim[e.pointerId];
    if (gx.one && gx.one.id === e.pointerId) gx.one = null;
    if (gx.two) {
      var left = gx.two.ids.filter(function (id) { return !!gx.pts[id]; });
      if (left.length < 2) gx.two = null;
    }
  }

  function turnBySwipe(dir) {
    if (state.flipping) return;
    stepPage(dir);
  }

  /* ─────────── 뒤로가기 가드 ───────────
     폰의 뒤로가기 버튼·제스처로 앱이 바로 닫히지 않게 한다.
       · 열려 있는 창·메뉴(목차·검색·설정·더보기/삽입 메뉴·이름 입력·확인 대화상자)가 있으면 그것부터 닫고,
       · 노트 편집 화면에서는 책장으로 돌아가고,
       · 책장에서는 '종료할까요?' 확인을 띄운다.
     ★ 크로미움(삼성 인터넷·크롬)의 History Manipulation Intervention 주의 ★
       사용자 입력(터치·클릭·키) 없이 pushState로 쌓은 기록은 '뒤로가기에서 건너뛸 기록'으로
       표시되고, 그 표시는 같은 문서의 모든 기록에 함께 붙는다. 이 상태에서 뒤로가기를 누르면
       기록을 한 칸씩 물러나는 게 아니라 앱을 통째로 벗어나 버린다(폰에서는 앱이 바로 닫힘).
       또 뒤로/앞으로 이동을 한 번 하면, 새 입력이 들어오기 전까지는 그 입력을 쌓기에 인정하지 않는다.
       ★ 모바일 크로미움의 User Activation 시점 ★
       touchstart·pointerdown 시점에는 아직 '탭인지 스크롤인지' 확정되지 않아 User Activation이
       붙지 않는다. 활성화는 touchend·pointerup·click·keydown 시점에 붙는다. 그래서 pointerdown에서
       부른 pushState는 활성화 없는 기록이 되어, 펜으로 낙서한 뒤 뒤로가기를 누르면 앱이 그대로 닫혔다.
       그래서
         · 페이지를 열 때는 기록을 쌓지 않는다(쌓아 봐야 건너뛸 기록이 될 뿐이다).
         · 활성화가 붙는 제스처(pointerup·touchend·click·keydown)에서만, 그것도
           navigator.userActivation.isActive가 true인 순간에만 쌓는다(미지원 브라우저는 리스너 안이면 인정).
         · 한 제스처에 여러 칸을 몰아넣지 않고 한 번에 1칸씩(최대 GUARD_DEPTH칸) 채운다.
         · 뒤로가기로 한 칸 빠지면, popstate 안에서는 다시 쌓지 않고(그러면 건너뛸 기록이 된다)
           다음 제스처에서 그만큼 다시 채운다.
       이렇게 하면 뒤로가기는 언제나 '사용자가 만든 기록'만 지나므로 앱이 갑자기 닫히지 않는다. */
  var GUARD_DEPTH = 3;                 // 뒤로가기 한 번에 물러날 수 있는 여유 칸 수
  var GUARD_GAP = 350;                 // 한 제스처(pointerup→touchend→click)에서 1칸만 채우는 최소 간격(ms)
  var nav = { depth: 0, leaving: false, leaveHops: 0, exitTimer: null, exitOpen: false, pendingUpdate: null };
  var lastArmAt = 0;
  var activePromptCancel = null;   // 열려 있는 이름 입력창을 뒤로가기로 닫을 때
  var activeConfirmCancel = null;  // 열려 있는 확인 대화상자를 뒤로가기로 닫을 때

  // 지금이 '사용자 입력이 인정되는 순간'인지 — 모바일 크로미움은 pointerdown 때는 false다.
  // navigator.userActivation이 없는 브라우저에서는 제스처 리스너 안에서 부르는 것으로 인정한다.
  function hasUserActivation() {
    var ua = navigator.userActivation;
    if (!ua || typeof ua.isActive !== 'boolean') return true;
    return ua.isActive === true;
  }

  // 뒤로가기 여유 기록을 한 번에 1칸씩, GUARD_DEPTH칸까지 채운다.
  // 반드시 활성화가 붙은 사용자 제스처 안에서만 부른다.
  // (그 밖에서 부르면 브라우저가 '건너뛸 기록'으로 표시해 오히려 앱이 바로 닫힌다)
  function armGuard() {
    if (nav.leaving) return;
    if (nav.depth >= GUARD_DEPTH) return;
    if (!hasUserActivation()) return;
    var now = Date.now();
    if (now - lastArmAt < GUARD_GAP) return;   // 같은 제스처에서 여러 칸 쌓지 않는다
    lastArmAt = now;
    try {
      history.pushState({ typedraw: 'guard', d: nav.depth + 1 }, '');
    } catch (e) { return; }
    nav.depth++;
  }

  function openExitConfirm() {
    if (nav.exitOpen) return;
    flushSave();
    nav.exitOpen = true;
    $('#exitModal').hidden = false;
    var keep = $('#exitClose');
    if (keep) setTimeout(function () { try { keep.focus(); } catch (e) {} }, 50);
  }

  function closeExitConfirm() {
    if (!nav.exitOpen) return;
    nav.exitOpen = false;
    $('#exitModal').hidden = true;
  }

  // [종료] — 쌓아 둔 가짜 기록을 모두 지나 실제로 앱 밖으로 나간다
  // (설치 앱이면 창을 닫는 것이 가장 확실하고, 막히면 기록을 물러나 빠져나간다)
  function quitApp() {
    closeExitConfirm();
    flushSave();
    nav.leaving = true;
    nav.leaveHops = 0;
    try { window.close(); } catch (e) {}   // 탭·보통 창에서는 막히므로 아래로 넘어간다
    setTimeout(function () { stepOut(); }, 250);
  }

  // 가짜 기록을 한 칸씩 물러난다. 남은 기록이 없으면 문서가 빠져나가면서 페이지가 닫힌다.
  // (history.back/go는 브라우저 UI가 아니라서 위의 '건너뛰기' 규칙에 걸리지 않는다)
  function stepOut() {
    if (nav.leaveHops++ >= 8) {   // 안전장치: 끝없이 물러나지 않게
      nav.leaving = false;
      nav.depth = 0;
      return;
    }
    try { history.go(-1); } catch (e) {}
    // 더 물러날 기록이 없으면(설치 앱의 첫 화면) popstate가 오지 않는다 → 안내만 남긴다
    clearTimeout(nav.exitTimer);
    nav.exitTimer = setTimeout(function () {
      if (!nav.leaving) return;
      nav.leaving = false;
      nav.depth = 0;
      toast('앱의 첫 화면이라 더 나갈 곳이 없어요. 뒤로가기를 한 번 더 누르면 앱이 닫힙니다');
    }, 500);
  }

  // 뒤로가기 한 번에 닫을 것이 있으면 닫는다
  function closeTopOverlay() {
    if (!$('#confirmModal').hidden) {
      if (activeConfirmCancel) { activeConfirmCancel(); return true; }
    }
    if (!$('#promptModal').hidden) {
      if (activePromptCancel) { activePromptCancel(); return true; }
    }
    if (!$('#searchModal').hidden) { closeSearch(); return true; }
    if (!$('#settingsSheet').hidden) { closeSettings(); return true; }
    if (!$('#tocDrawer').hidden) { closeToc(); return true; }
    if (stylePopoverOpen()) { closeStylePopover(); return true; }
    var pops = ['#insertMenu', '#moreMenu', '#bookMenu'];
    for (var i = 0; i < pops.length; i++) {
      var m = $(pops[i]);
      if (m && !m.hidden) { hidePopovers(); return true; }
    }
    return false;
  }

  // 뒤로가기 한 번을 처리한다
  function handleBack() {
    if (closeTopOverlay()) return;
    if (nav.exitOpen) { closeExitConfirm(); return; }   // 종료 확인 중이면 '계속 쓰기'와 같게
    if (!$('#noteView').hidden) { closeNotebook(); return; }
    openExitConfirm();
  }

  function initBackGuard() {
    try { history.replaceState({ typedraw: 'base' }, ''); } catch (e) {}
    // 로드 때는 기록을 쌓지 않는다(위 주석 참고). 첫 제스처에서 armGuard()가 채운다.

    window.addEventListener('popstate', function () {
      if (nav.leaving) { stepOut(); return; }   // [종료] 확정 — 남은 기록을 계속 물러난다
      if (nav.depth > 0) nav.depth--;           // 방금 여유 기록 한 칸이 빠졌다
      handleBack();
      // 여기서 다시 쌓지 않는다: 뒤로/앞으로 이동 직후에 쌓은 기록은 '건너뛸 기록'이 되어
      // 정작 다음 뒤로가기에서 앱이 닫힌다. 다음 제스처에서 armGuard()가 다시 채운다.
    });

    // 사용자 제스처가 들어올 때마다 여유 기록을 확인하고 모자라면 1칸 채운다.
    // User Activation이 붙는 끝 시점(pointerup·touchend·click·keydown)에서만 쌓는다.
    // pointerdown·touchstart는 모바일에서 활성화가 없어 아예 쓰지 않는다(쌓아도 건너뛸 기록이 된다).
    var marks = ['pointerup', 'touchend', 'click', 'keydown'];
    for (var i = 0; i < marks.length; i++) {
      document.addEventListener(marks[i], armGuard, { capture: true, passive: true });
    }

    // 뒤로/앞으로로 이 화면이 되살아났을 때(bfcache)에는 상태를 초기화한다.
    // ([종료]로 나가던 중이었더라도 되살아난 화면에서는 뒤로가기가 다시 동작해야 한다)
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      nav.leaving = false;
      nav.leaveHops = 0;
      nav.depth = 0;
      closeExitConfirm();
    });
  }

  /* ─────────── 이벤트 연결 ─────────── */
  function bind() {
    $('#btnNewBook').addEventListener('click', createNotebookFlow);
    $('#btnNewBook2').addEventListener('click', createNotebookFlow);
    $('#btnBack').addEventListener('click', closeNotebook);

    // 뒤로가기 종료 확인
    $('#exitClose').addEventListener('click', function () { closeExitConfirm(); });
    $('#exitQuit').addEventListener('click', quitApp);
    $('#exitModal').addEventListener('click', function (e) {
      if (e.target === $('#exitModal')) closeExitConfirm();   // 바깥을 누르면 계속 쓰기
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.exitOpen) { e.preventDefault(); closeExitConfirm(); }
    });

    $('#noteTitle').addEventListener('click', function () {
      promptText('노트 제목', '제목', state.nb ? state.nb.title : '').then(function (v) {
        if (v == null || !state.nb) return;
        state.nb.title = v.trim() || state.nb.title;
        $('#noteTitle').textContent = state.nb.title;
        saveNB(state.nb);
        renderShelf();
      });
    });

    $$('.tool[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });

    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnPrev').addEventListener('click', function () { stepPage(-1); });
    $('#btnNext').addEventListener('click', function () { stepPage(1); });
    $('#btnAddPage').addEventListener('click', addPage);
    $('#pageLabel').addEventListener('click', openToc);

    $('#viewSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]');
      if (!b) return;
      setViewMode(b.dataset.view);
    });

    // 색·굵기 압축 버튼(넓은 화면) — 누르면 바 위에 팝오버가 열린다
    $('#btnStyle').addEventListener('click', function () {
      if (stylePopoverOpen()) { closeStylePopover(); return; }
      hidePopovers();
      openStylePopover();
    });
    // 색·굵기를 고르거나 바깥을 누르면 닫힌다
    $('#stylePopover').addEventListener('click', function (e) {
      if (e.target.closest('button')) closeStylePopover();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!stylePopoverOpen()) return;
      if (e.target.closest('#stylePopover') || e.target.closest('#btnStyle')) return;
      closeStylePopover();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && stylePopoverOpen()) closeStylePopover();
    });

    // 보기 방식 순환 버튼(넓은 화면): 2쪽 ↔ 1쪽
    $('#btnViewCycle').addEventListener('click', cycleViewMode);

    // 화면 폭이 바뀌면 팝오버 위치를 다시 잡고, 한 줄 바 ↔ 옵션 줄로 갈라질 때는 다시 그린다
    window.addEventListener('resize', function () { if (stylePopoverOpen()) positionStylePopover(); });
    if (wideBarMq) {
      var onWideChange = function () { closeStylePopover(); renderOptions(); };
      if (wideBarMq.addEventListener) wideBarMq.addEventListener('change', onWideChange);
      else if (wideBarMq.addListener) wideBarMq.addListener(onWideChange);
    }

    $('#btnInsert').addEventListener('click', function () {
      var menu = $('#insertMenu');
      if (!menu.hidden) { hidePopovers(); return; }
      showPopover(menu, $('#btnInsert'));
    });
    $('#btnMenu').addEventListener('click', function () {
      var menu = $('#moreMenu');
      if (!menu.hidden) { hidePopovers(); return; }
      showPopover(menu, $('#btnMenu'));
    });

    $('#insertMenu').addEventListener('click', function (e) {
      var b = e.target.closest('[data-insert]');
      if (!b) return;
      hidePopovers();
      var what = b.dataset.insert;
      if (what === 'check') insertChecklist();
      else if (what === 'date') insertDate();
      else if (what === 'photo') insertPhoto();
    });

    $('#moreMenu').addEventListener('click', function (e) {
      var b = e.target.closest('[data-more]');
      if (!b) return;
      var what = b.dataset.more;
      hidePopovers();
      if (what === 'settings') openSettings();
      else if (what === 'png') exportPNG();
      else if (what === 'print') printNotebook();
      else if (what === 'export') exportJSON();
      else if (what === 'import') $('#importInput').click();
      else if (what === 'delete') {
        confirmBox('노트 삭제', '"' + state.nb.title + '" 노트를 지울까요? 이 기기에서 완전히 사라집니다.', '삭제').then(function (ok) {
          if (!ok) return;
          var id = state.nb.id;
          dbDelete('notebooks', id);
          state.notebooks = state.notebooks.filter(function (n) { return n.id !== id; });
          state.nb = null;
          $('#noteView').hidden = true;
          $('#shelfView').hidden = false;
          renderShelf();
          toast('노트를 삭제했어요');
        });
      }
    });

    $('#bookMenu').addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]');
      if (!b) return;
      var id = $('#bookMenu').dataset.nbId;
      var nb = null;
      for (var i = 0; i < state.notebooks.length; i++) if (state.notebooks[i].id === id) nb = state.notebooks[i];
      hidePopovers();
      if (!nb) return;
      var what = b.dataset.book;
      if (what === 'rename') {
        promptText('노트 이름', '제목', nb.title).then(function (v) {
          if (v == null) return;
          nb.title = v.trim() || nb.title;
          saveNB(nb);
          renderShelf();
          if (state.nb && state.nb.id === nb.id) $('#noteTitle').textContent = nb.title;
        });
      } else if (what === 'design') {
        openNotebook(nb.id);
        setTimeout(openSettings, 120);
      } else if (what === 'delete') {
        confirmBox('노트 삭제', '"' + nb.title + '" 노트를 지울까요? 이 기기에서 완전히 사라집니다.', '삭제').then(function (ok) {
          if (!ok) return;
          dbDelete('notebooks', nb.id);
          state.notebooks = state.notebooks.filter(function (n) { return n.id !== nb.id; });
          renderShelf();
          toast('노트를 삭제했어요');
        });
      }
    });

    $('#btnToc').addEventListener('click', openToc);
    $('#tocAddPage').addEventListener('click', function () { addPage(); closeToc(); renderToc(); });
    $('#btnSearch').addEventListener('click', openSearch);
    $('#searchInput').addEventListener('input', debounce(function (e) { runSearch(e.target.value); }, 120));

    // 상·하단 바 접기 / 펴기
    $('#btnBarsCollapse').addEventListener('click', function () { hidePopovers(); setBarsCollapsed(true); });
    $('#btnBarsExpand').addEventListener('click', function () { setBarsCollapsed(false); });

    $$('[data-close-sheet]').forEach(function (b) { b.addEventListener('click', closeSettings); });
    $$('[data-close-drawer]').forEach(function (b) { b.addEventListener('click', closeToc); });
    $$('[data-close-search]').forEach(function (b) { b.addEventListener('click', closeSearch); });

    $('#setTitle').addEventListener('input', function (e) {
      if (!state.nb) return;
      state.nb.title = e.target.value;
      $('#noteTitle').textContent = state.nb.title;
      saveNB(state.nb);
    });

    $('#scrim').addEventListener('click', function () {
      if (!$('#settingsSheet').hidden) return closeSettings();
      if (!$('#tocDrawer').hidden) return closeToc();
      if (!$('#searchModal').hidden) return closeSearch();
      hidePopovers();
    });

    $('#photoInput').addEventListener('change', function (e) { handlePhotoFiles(e.target.files); });
    $('#importInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });
    $('#btnImportTop').addEventListener('click', function () { $('#importInput').click(); });

    // 페이지 포인터
    var spread = $('#spread');
    spread.addEventListener('pointerdown', onPointerDown);
    spread.addEventListener('pointermove', onPointerMove, { passive: false });
    spread.addEventListener('pointerup', onPointerUp);
    spread.addEventListener('pointercancel', onPointerUp);

    // 책장 넘기기 제스처(필기보다 먼저 판단한다)
    var stageEl = $('#stage');
    stageEl.addEventListener('pointerdown', gestureDown, true);
    stageEl.addEventListener('pointermove', gestureMove, true);
    stageEl.addEventListener('pointerup', gestureUp, true);
    stageEl.addEventListener('pointercancel', gestureUp, true);

    // 키보드
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (typing || $('#noteView').hidden) return;
      if (e.key === 'Escape' && barsCollapsed()) { setBarsCollapsed(false); return; }
      var k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 't') setTool('text');
      else if (k === 'p') setTool('pen');
      else if (k === 'h') setTool('hl');
      else if (k === 'e') setTool('eraser');
      else if (e.key === 'ArrowRight') stepPage(1);
      else if (e.key === 'ArrowLeft') stepPage(-1);
    });

    // 리사이즈
    window.addEventListener('resize', debounce(function () {
      if ($('#noteView').hidden) return;
      var wasSpread = state.spread;
      var nowSpread = wantSpread();
      if (wasSpread !== nowSpread) {
        renderSpread();
      } else {
        layoutPages();
        $$('#spread .page').forEach(function (pe) {
          var p = pageById(pe.dataset.pageId);
          if (p) redrawInk(p);
        });
      }
    }, 120));

    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (!$('#noteView').hidden) renderSpread(); }, 260);
    });

    // 바 높이가 바뀌면(도구 옵션 줄이 생기고 사라질 때, 글꼴이 늦게 실릴 때) 종이 크기를 다시 맞춘다
    if (typeof ResizeObserver === 'function') {
      var stageBox = $('#stage');
      if (stageBox) {
        new ResizeObserver(function () {
          if ($('#noteView').hidden) return;
          layoutPages();
        }).observe(stageBox);
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSave();
    });
    window.addEventListener('pagehide', flushSave);
  }

  /* ─────────── 서비스 워커 · 새 버전 ─────────── */
  var APP_VERSION = '11';
  var UPDATE_KEY = 'typedraw-updated-';

  // 필기 중인가(새 버전으로 새로고침하면 안 되는 순간)
  function isEditing() {
    return !$('#noteView').hidden || !$('#promptModal').hidden || !$('#confirmModal').hidden;
  }

  // 새 버전으로 한 번만 새로고침한다(같은 버전에서 되풀이하지 않아 무한 새로고침이 없다)
  function reloadForUpdate(version) {
    try {
      if (sessionStorage.getItem(UPDATE_KEY + version) === '1') return false;
      sessionStorage.setItem(UPDATE_KEY + version, '1');
    } catch (e) {}
    flushSave();
    try { window.location.reload(); } catch (e) {}
    return true;
  }

  // 새 버전이 있으면 적용한다. 쓰는 중이면 방해하지 않고 알리기만 한다.
  function applyUpdate(version) {
    nav.pendingUpdate = version;
    if (!isEditing()) { reloadForUpdate(version); return; }
    toast('새 버전을 준비했어요. 앱을 다시 열면 적용됩니다');
  }

  // version.txt로 지금 화면의 코드가 서버의 최신 버전과 같은지 확인
  // (GitHub Pages가 index.html을 잠깐 캐시해도 새 버전이 나오도록 하는 안전장치)
  function checkVersion() {
    if (!window.fetch) return;
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) {
        var v = (t || '').trim();
        if (v && v !== APP_VERSION) applyUpdate(v);
      })
      .catch(function () {});
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    var hadController = !!navigator.serviceWorker.controller;
    var swUpdated = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }   // 첫 설치: 이 화면은 이미 최신
      if (!swUpdated) return;                                  // 단순 인수: 이미 받은 파일로 충분
      checkVersion();   // 화면 코드가 서버 버전과 다를 때만 새로고침한다
    });

    // 쓰던 중이면 화면이 가려지는 순간(앱을 벗어났다 돌아오는 순간) 새 버전으로 넘어간다
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && nav.pendingUpdate && !isEditing()) {
        reloadForUpdate(nav.pendingUpdate);
      }
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          reg.addEventListener('updatefound', function () { swUpdated = true; });
          try { reg.update(); } catch (e) {}   // 열릴 때마다 새 워커 확인
          checkVersion();
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            try { reg.update(); } catch (e) {}
            checkVersion();
          });
        })
        .catch(function (e) { console.warn('SW 등록 실패', e); });
    });
  }

  /* ─────────── 첫 실행 ─────────── */
  function seedNotebook() {
    var nb = newNotebook('나의 노트');
    var p1 = nb.pages[0];
    p1.objects = [
      { id: uid('ob'), type: 'text', x: 80, y: 116, w: 600, text: 'TypeDraw 노트', font: 'pen', size: 54, color: '#8c4a3f' },
      { id: uid('ob'), type: 'text', x: 84, y: 196, w: 600, text: '종이에 쓰듯 타이핑하고, 손으로 그리는 노트.\n아래 순서대로 한번 써 보세요.', font: 'gowun', size: 26, color: '#4a4235' },
      {
        id: uid('ob'), type: 'check', x: 76, y: 330, w: 610, title: '이렇게 써요',
        items: [
          { text: '책장에서 표지를 탭하면 노트가 펼쳐집니다', done: true },
          { text: '타이핑(T)을 고르고 종이를 탭하면 글자를 넣을 수 있어요', done: false },
          { text: '펜·형광펜으로 손글씨, 지우개로 지우기 (S펜 압력 지원)', done: false },
          { text: '넓은 화면에서는 두 쪽, 폰에서는 한 쪽으로 보입니다', done: false },
          { text: '적은 내용은 기기 안에 자동 저장됩니다', done: false }
        ]
      },
      { id: uid('ob'), type: 'text', x: 84, y: 900, w: 400, text: '— 이성현', font: 'pen', size: 32, color: '#7a6142' }
    ];
    return nb;
  }

  // 책장 바닥에 지금 화면의 코드 버전을 작게 표시한다(구버전 캐시와 눈으로 구분하려고)
  function showAppVersion() {
    var el = $('#appVer');
    if (el) el.textContent = '· v' + APP_VERSION;
  }

  function init() {
    state.viewMode = loadViewMode();
    showAppVersion();
    bind();
    initBackGuard();
    updateViewSwitch();
    registerSW();

    dbAll('notebooks').then(function (rows) {
      state.notebooks = (rows || []).map(function (n) { return n; });
      if (!state.notebooks.length) {
        var nb = seedNotebook();
        state.notebooks = [nb];
        saveNB(nb, true);
      }
      // 자산 URL 미리 준비
      return dbAll('assets').then(function (assets) {
        (assets || []).forEach(function (a) {
          if (a && a.blob) state.assets[a.id] = URL.createObjectURL(a.blob);
        });
      });
    }).then(function () {
      renderShelf();
      var hash = window.location.hash.replace('#', '');
      if (hash) {
        for (var i = 0; i < state.notebooks.length; i++) {
          if (state.notebooks[i].id === hash) { openNotebook(hash); break; }
        }
      }
    }).catch(function (e) {
      console.error(e);
      toast('저장소를 열지 못했어요');
      renderShelf();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
