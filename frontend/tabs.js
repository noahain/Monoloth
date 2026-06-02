(function () {
  'use strict';

  if (!window.monolithApi) {
    throw new Error('TabManager: monolithApi not loaded');
  }

  const api = window.monolithApi;
  const eventApi = window.__TAURI__ && window.__TAURI__.event;

  const state = {
    config: { enabled: true, position: 'top', activeTabId: null, tabs: [] },
    runtime: new Map(),
    sessionToTab: new Map(),
    generations: new Map(),
    skipNextEof: new Map(),
    dragging: null,
    contextMenuEl: null,
    profilePickerEl: null,
    xtermPoolEl: null,
  };

  function uuidv4() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function resolveSessionId(tabId, view) {
    if (!tabId) return null;
    if (view === 'primary' || !view) return tabId;
    var m = /^secondary:(\d+)$/.exec(view);
    if (m) return tabId + '__sec' + m[1];
    return null;
  }

  function getActiveXterm() {
    var rt = state.runtime.get(state.config.activeTabId);
    return rt ? activeXtermFromRuntime(rt) : null;
  }

  function getActiveTabId() { return state.config.activeTabId; }

  function getActiveView() {
    var rt = state.runtime.get(state.config.activeTabId);
    return rt && rt.activeView ? rt.activeView : 'primary';
  }

  function isMainActive() { return state.config.activeTabId != null; }

  function activeXtermFromRuntime(rt) {
    if (!rt) return null;
    if (rt.activeView === 'primary') return rt.xterms.primary;
    var m = /^secondary:(\d+)$/.exec(rt.activeView);
    if (m) return rt.xterms.secondaries.get(parseInt(m[1], 10));
    return rt.xterms.primary;
  }

  function activeSessionIdFromRuntime(rt) {
    if (!rt) return null;
    if (rt.activeView === 'primary') return rt.sessionIds.primary;
    var m = /^secondary:(\d+)$/.exec(rt.activeView);
    if (m) return rt.sessionIds.secondaries.get(parseInt(m[1], 10));
    return rt.sessionIds.primary;
  }

  function makeFitAddon(term) {
    if (!window.FitAddon) return null;
    var FitClass = window.FitAddon.FitAddon || window.FitAddon;
    try {
      var addon = new FitClass();
      term.loadAddon(addon);
      term._fitAddon = addon;
      return addon;
    } catch (e) {
      return null;
    }
  }

  function fitTerminal(term) {
    if (!term || !term._fitAddon) return;
    try { term._fitAddon.fit(); } catch (e) { /* ignore */ }
  }

  function setupTerminalHandlers(term, sessionId) {
    term.attachCustomKeyEventHandler(function (e) {
      if (e.type !== 'keydown') return true;

      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && term.hasSelection && term.hasSelection()) {
        if (navigator.clipboard) {
          try { navigator.clipboard.writeText(term.getSelection()); } catch (err) { /* ignore */ }
        }
        try { term.clearSelection(); } catch (err) {}
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        if (term.hasSelection && term.hasSelection()) {
          if (navigator.clipboard) {
            try { navigator.clipboard.writeText(term.getSelection()); } catch (err) { /* ignore */ }
          }
          try { term.clearSelection(); } catch (err) {}
        }
        return false;
      }
      if (e.ctrlKey && e.code === 'KeyV') return false;
      if (e.shiftKey && e.code === 'Insert') return false;

      if (e.ctrlKey && e.shiftKey && e.code === 'KeyW') {
        var active = state.config.activeTabId;
        if (active) {
          window.TabManager.closeTab(active).catch(function (err) { console.error(err); });
        }
        return false;
      }
      return true;
    });

    if (typeof term.onScroll === 'function') {
      term.onScroll(function () {
        try { term.refresh(0, term.rows - 1); } catch (e) { /* ignore */ }
      });
    }

    var el = term.element;
    if (el) {
      el.addEventListener('paste', function (e) {
        var data = (e.clipboardData || window.clipboardData);
        if (!data) return;
        var text = data.getData('text');
        if (text) {
          try { api.send_input(sessionId, text).catch(function (err) { console.error(err); }); } catch (err) { /* ignore */ }
          e.preventDefault();
        }
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var sel = window.getSelection ? window.getSelection().toString() : '';
        if (sel && navigator.clipboard) {
          try { navigator.clipboard.writeText(sel); } catch (err) { /* ignore */ }
        }
      });
    }
  }

  function buildTabElement(tab) {
    var el = document.createElement('div');
    el.className = 'tab';
    el.dataset.tabId = tab.id;
    el.dataset.pinned = String(!!tab.pinned);

    if (tab.color) {
      var dot = document.createElement('span');
      dot.className = 'tab-color-dot';
      dot.style.background = tab.color;
      el.appendChild(dot);
    }

    var label = document.createElement('span');
    label.className = 'tab-label';
    var pathTail = tab.dir ? tab.dir.split(/[\\\/]/).pop() : '';
    label.textContent = tab.profile || pathTail || 'tab';
    el.appendChild(label);

    if (tab.secondaryCount && tab.secondaryCount > 0) {
      var icons = document.createElement('span');
      icons.className = 'tab-secondary-icons';
      for (var i = 0; i < tab.secondaryCount; i++) {
        var btn = document.createElement('button');
        btn.className = 'tab-secondary-icon';
        btn.dataset.secondaryIdx = String(i);
        btn.textContent = '\u2699';
        btn.addEventListener('click', function (idx, ev) {
          ev.stopPropagation();
          window.TabManager.switchView(tab.id, 'secondary:' + idx);
        }.bind(null, i));
        icons.appendChild(btn);
      }
      el.appendChild(icons);
    }

    if (tab.pinned) {
      var pin = document.createElement('button');
      pin.className = 'tab-pin';
      pin.textContent = '\ud83d\udd12';
      pin.dataset.tooltip = 'Pinned';
      el.appendChild(pin);
    } else {
      var close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '\u00d7';
      close.dataset.tooltip = 'Close (Ctrl+Shift+W)';
      close.addEventListener('click', function (ev) {
        ev.stopPropagation();
        window.TabManager.closeTab(tab.id);
      });
      el.appendChild(close);
    }

    el.addEventListener('click', function () { window.TabManager.switchTab(tab.id); });
    return el;
  }

  function createXtermForView(sessionId) {
    if (!window.Terminal) return null;
    var term = new window.Terminal({
      allowTransparency: true,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      fontSize: 14,
      fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
    });
    try { term.open(state.xtermPoolEl); } catch (e) { console.error('term.open failed', e); }
    makeFitAddon(term);
    setupTerminalHandlers(term, sessionId);
    fitTerminal(term);
    return term;
  }

  function buildRuntimeForTab(tab) {
    var tabId = tab.id;
    var rt = {
      xterms: { primary: null, secondaries: new Map() },
      sessionIds: { primary: tabId, secondaries: new Map() },
      activeView: tab.activeView || 'primary',
      dom: null,
      pinned: !!tab.pinned,
      profile: tab.profile,
      color: tab.color,
      dir: tab.dir,
      secondaryCount: tab.secondaryCount || 0,
    };
    state.runtime.set(tabId, rt);
    state.sessionToTab.set(tabId, { tabId: tabId, view: 'primary' });

    rt.xterms.primary = createXtermForView(tabId);

    var count = tab.secondaryCount || 0;
    for (var i = 0; i < count; i++) {
      var sid = tabId + '__sec' + i;
      var term = createXtermForView(sid);
      rt.xterms.secondaries.set(i, term);
      rt.sessionIds.secondaries.set(i, sid);
      state.sessionToTab.set(sid, { tabId: tabId, view: 'secondary', secondaryIndex: i });
    }

    var list = document.getElementById('tab-list');
    if (list) {
      var el = buildTabElement(Object.assign({}, tab));
      list.appendChild(el);
      rt.dom = el;
    }
    return rt;
  }

  async function createTab(profileName) {
    if (profileName == null) {
      return showProfilePicker();
    }
    var tabId = uuidv4();
    var cols = 80;
    var rows = 24;
    var dir = null;
    try {
      var lastDir = await api.get_config('last_directory');
      if (lastDir) dir = lastDir;
    } catch (e) { dir = null; }

    var result = await api.createTab(tabId, profileName, dir || null, cols, rows);
    var tab = result[0];
    var sessions = result[1] || [];

    state.config.tabs.push(tab);
    for (var s = 0; s < sessions.length; s++) {
      state.generations.set(sessions[s][0], sessions[s][1]);
    }

    buildRuntimeForTab(tab);

    if (!state.config.activeTabId) {
      await setActiveTab(tabId);
      await switchTab(tabId);
    }
    return tab;
  }

  async function closeTab(tabId) {
    var rt = state.runtime.get(tabId);
    if (!rt) return;

    var force = false;
    if (rt.pinned) {
      var ok = false;
      try { ok = window.confirm('This tab is pinned. Close anyway?'); } catch (e) { ok = false; }
      if (!ok) return;
      force = true;
    }

    try {
      await api.closeTab(tabId, force);
    } catch (e) {
      console.error('closeTab failed:', e);
      return;
    }

    var view = document.getElementById('terminal-view');
    if (rt.xterms.primary && rt.xterms.primary.element && rt.xterms.primary.element.parentElement === view) {
      state.xtermPoolEl.appendChild(rt.xterms.primary.element);
    }
    rt.xterms.secondaries.forEach(function (term) {
      if (term && term.element && term.element.parentElement === view) {
        state.xtermPoolEl.appendChild(term.element);
      }
    });

    state.sessionToTab.delete(rt.sessionIds.primary);
    state.generations.delete(rt.sessionIds.primary);
    state.skipNextEof.delete(rt.sessionIds.primary);
    rt.sessionIds.secondaries.forEach(function (sid) {
      state.sessionToTab.delete(sid);
      state.generations.delete(sid);
      state.skipNextEof.delete(sid);
    });

    if (rt.xterms.primary) {
      try { rt.xterms.primary.dispose(); } catch (e) { /* ignore */ }
    }
    rt.xterms.secondaries.forEach(function (term) {
      try { term.dispose(); } catch (e) { /* ignore */ }
    });

    if (rt.dom && rt.dom.parentElement) {
      rt.dom.parentElement.removeChild(rt.dom);
    }

    state.runtime.delete(tabId);
    state.config.tabs = state.config.tabs.filter(function (t) { return t.id !== tabId; });

    if (state.config.activeTabId === tabId) {
      var next = state.config.tabs[0];
      if (next) {
        try { await setActiveTab(next.id); } catch (e) { /* ignore */ }
        await switchTab(next.id);
      } else {
        state.config.activeTabId = null;
      }
    }
  }

  async function setActiveTab(tabId) {
    try { await api.setActiveTab(tabId); } catch (e) { console.error('setActiveTab failed:', e); }
    state.config.activeTabId = tabId;
  }

  async function switchTab(tabId) {
    if (state.config.activeTabId === tabId) return;
    var prevId = state.config.activeTabId;

    if (prevId) {
      var prevRt = state.runtime.get(prevId);
      if (prevRt) {
        var prevTerm = activeXtermFromRuntime(prevRt);
        if (prevTerm && prevTerm.element && prevTerm.element.parentElement !== state.xtermPoolEl) {
          state.xtermPoolEl.appendChild(prevTerm.element);
          fitTerminal(prevTerm);
        }
      }
    }

    await setActiveTab(tabId);
    var rt = state.runtime.get(tabId);
    if (!rt) return;

    var view = document.getElementById('terminal-view');
    var term = activeXtermFromRuntime(rt);
    if (view && term && term.element) {
      view.appendChild(term.element);
    }
    fitTerminal(term);

    var sid = activeSessionIdFromRuntime(rt);
    var cols = term ? term.cols : 80;
    var rows = term ? term.rows : 24;
    if (sid) {
      try { await api.resize_terminal(sid, cols, rows); } catch (e) { console.error('resize_terminal failed:', e); }
    }

    var activeEls = document.querySelectorAll('.tab.active');
    for (var i = 0; i < activeEls.length; i++) activeEls[i].classList.remove('active');
    if (rt.dom) rt.dom.classList.add('active');
  }

  async function switchView(tabId, view) {
    try { await api.setTabActiveView(tabId, view); } catch (e) { console.error('setTabActiveView failed:', e); }
    var rt = state.runtime.get(tabId);
    if (!rt) return;

    var isActive = state.config.activeTabId === tabId;
    if (isActive) {
      var prevTerm = activeXtermFromRuntime(rt);
      if (prevTerm && prevTerm.element) {
        state.xtermPoolEl.appendChild(prevTerm.element);
        fitTerminal(prevTerm);
      }
    }

    rt.activeView = view;

    if (isActive) {
      var newTerm = activeXtermFromRuntime(rt);
      var viewEl = document.getElementById('terminal-view');
      if (viewEl && newTerm && newTerm.element) {
        viewEl.appendChild(newTerm.element);
      }
      fitTerminal(newTerm);
      var sid = activeSessionIdFromRuntime(rt);
      var cols = newTerm ? newTerm.cols : 80;
      var rows = newTerm ? newTerm.rows : 24;
      if (sid) {
        try { await api.resize_terminal(sid, cols, rows); } catch (e) { console.error('resize_terminal failed:', e); }
      }
    }
  }

  async function pinTab(tabId, pinned) {
    try { await api.setTabPinned(tabId, pinned); } catch (e) { console.error('setTabPinned failed:', e); }
    var rt = state.runtime.get(tabId);
    if (rt) rt.pinned = pinned;
    var cfgTab = state.config.tabs.find(function (x) { return x.id === tabId; });
    if (cfgTab) cfgTab.pinned = pinned;

    if (rt && rt.dom && rt.dom.parentElement) {
      var parent = rt.dom.parentElement;
      parent.removeChild(rt.dom);
      if (cfgTab) {
        var rebuilt = buildTabElement(Object.assign({}, cfgTab, { secondaryCount: rt.secondaryCount }));
        parent.appendChild(rebuilt);
        rt.dom = rebuilt;
      }
    }
  }

  async function setTabColor(tabId, color) {
    try { await api.setTabColor(tabId, color); } catch (e) { console.error('setTabColor failed:', e); }
    var cfgTab = state.config.tabs.find(function (x) { return x.id === tabId; });
    if (cfgTab) cfgTab.color = color;
    var rt = state.runtime.get(tabId);
    if (!rt || !rt.dom) return;
    var dot = rt.dom.querySelector('.tab-color-dot');
    if (color) {
      if (dot) {
        dot.style.background = color;
        dot.style.display = '';
      } else {
        var newDot = document.createElement('span');
        newDot.className = 'tab-color-dot';
        newDot.style.background = color;
        rt.dom.insertBefore(newDot, rt.dom.firstChild);
      }
    } else if (dot) {
      dot.style.display = 'none';
    }
  }

  async function reorderTabs(newOrder) {
    try { await api.reorderTabs(newOrder); } catch (e) { console.error('reorderTabs failed:', e); }
    var byId = {};
    state.config.tabs.forEach(function (t) { byId[t.id] = t; });
    state.config.tabs = newOrder.map(function (id) { return byId[id]; }).filter(Boolean);

    var list = document.getElementById('tab-list');
    if (list) {
      for (var i = 0; i < newOrder.length; i++) {
        var id = newOrder[i];
        var rt = state.runtime.get(id);
        if (rt && rt.dom) list.appendChild(rt.dom);
      }
    }
  }

  async function changeProfile(tabId, profileName) {
    var cols = 80;
    var rows = 24;
    var result = await api.setTabProfile(tabId, profileName, cols, rows);
    var updated = result[0];
    var sessions = result[1] || [];
    for (var i = 0; i < sessions.length; i++) {
      state.generations.set(sessions[i][0], sessions[i][1]);
    }
    var idx = state.config.tabs.findIndex(function (t) { return t.id === tabId; });
    if (idx >= 0) state.config.tabs[idx] = updated;
    return updated;
  }

  async function refreshActiveTab() {
    if (!state.config.activeTabId) return;
    var id = state.config.activeTabId;
    var cols = 80;
    var rows = 24;
    try {
      var result = await api.refreshTab(id, cols, rows);
      var sessions = result[1] || [];
      for (var i = 0; i < sessions.length; i++) {
        state.generations.set(sessions[i][0], sessions[i][1]);
      }
    } catch (e) {
      console.error('refreshActiveTab failed:', e);
    }
  }

  function setupDragDrop() {
    var list = document.getElementById('tab-list');
    if (!list) return;

    list.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var tabEl = e.target.closest && e.target.closest('.tab');
      if (!tabEl) return;
      if (e.target.closest && e.target.closest('.tab-close, .tab-pin, .tab-secondary-icon')) return;

      var tabId = tabEl.dataset.tabId;
      var startX = e.clientX;
      var startY = e.clientY;
      var dragging = false;

      var onMove = function (ev) {
        if (!dragging && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
          dragging = true;
        }
        if (dragging) tabEl.classList.add('tab-dragging');
      };

      var onUp = function (ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        tabEl.classList.remove('tab-dragging');
        if (!dragging) return;

        var tabs = Array.prototype.slice.call(list.querySelectorAll('.tab'));
        var ids = tabs.map(function (el) { return el.dataset.tabId; });
        var fromIdx = ids.indexOf(tabId);
        if (fromIdx < 0) return;

        var toIdx = tabs.length - 1;
        for (var i = 0; i < tabs.length; i++) {
          if (i === fromIdx) continue;
          var rect = tabs[i].getBoundingClientRect();
          if (ev.clientY < rect.top + rect.height / 2) {
            toIdx = i;
            break;
          }
        }
        var filtered = ids.filter(function (id) { return id !== tabId; });
        var adjustedTo = toIdx > fromIdx ? toIdx - 1 : toIdx;
        if (adjustedTo < 0) adjustedTo = 0;
        if (adjustedTo > filtered.length) adjustedTo = filtered.length;
        filtered.splice(adjustedTo, 0, tabId);
        reorderTabs(filtered).catch(function (err) { console.error('reorderTabs failed:', err); });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function showContextMenu(e, tabId) {
    if (e && e.preventDefault) e.preventDefault();
    hideContextMenu();
    var t = state.config.tabs.find(function (x) { return x.id === tabId; });
    if (!t) return;

    var menu = document.createElement('div');
    menu.id = 'context-menu';
    if (e && typeof e.clientX === 'number') {
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
    }

    var items = [
      { label: 'Close', action: function () { window.TabManager.closeTab(tabId); } },
      { label: 'Close Others', action: function () {
        var others = state.config.tabs.filter(function (x) { return x.id !== tabId && !x.pinned; });
        return Promise.all(others.map(function (o) { return window.TabManager.closeTab(o.id); }));
      } },
      { label: t.pinned ? 'Unpin' : 'Pin', action: function () { window.TabManager.pinTab(tabId, !t.pinned); } },
    ];

    items.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'item';
      el.textContent = item.label;
      el.addEventListener('click', function () {
        hideContextMenu();
        try {
          var p = item.action();
          if (p && typeof p.catch === 'function') p.catch(function (err) { console.error(err); });
        } catch (err) { console.error(err); }
      });
      menu.appendChild(el);
    });

    var colorEl = document.createElement('div');
    colorEl.className = 'item';
    colorEl.textContent = 'Color \u25b8';
    var sub = document.createElement('div');
    sub.className = 'submenu';
    sub.style.display = 'none';

    var colors = [
      '#ff5555', '#ffaa00', '#ffff55', '#55ff55',
      '#55ffff', '#5555ff', '#aa55ff', '#ff55ff',
      null,
    ];
    colors.forEach(function (c) {
      var sw = document.createElement('span');
      sw.className = 'color-swatch';
      if (c) {
        sw.style.background = c;
        sw.dataset.tooltip = c;
      } else {
        sw.textContent = '\u2715';
        sw.dataset.tooltip = 'No color';
      }
      sw.addEventListener('click', function (ev) {
        ev.stopPropagation();
        hideContextMenu();
        window.TabManager.setTabColor(tabId, c).catch(function (err) { console.error(err); });
      });
      sub.appendChild(sw);
    });
    colorEl.appendChild(sub);
    colorEl.addEventListener('mouseenter', function () { sub.style.display = 'block'; });
    colorEl.addEventListener('mouseleave', function () { sub.style.display = 'none'; });
    menu.appendChild(colorEl);

    document.body.appendChild(menu);
    state.contextMenuEl = menu;
  }

  function hideContextMenu() {
    if (state.contextMenuEl && state.contextMenuEl.parentElement) {
      state.contextMenuEl.parentElement.removeChild(state.contextMenuEl);
    }
    state.contextMenuEl = null;
  }

  async function showProfilePicker() {
    hideProfilePicker();
    var profiles = [];
    try {
      var res = await api.get_profiles();
      if (res && Array.isArray(res.profiles)) profiles = res.profiles;
    } catch (e) {
      console.error('get_profiles failed:', e);
    }

    var picker = document.createElement('div');
    picker.id = 'profile-picker';

    var title = document.createElement('div');
    title.className = 'pp-title';
    title.textContent = 'Select Profile';
    picker.appendChild(title);

    var opts = [{ name: null, label: 'No profile' }].concat(
      profiles.map(function (p) { return { name: p, label: p }; })
    );
    opts.forEach(function (opt) {
      var el = document.createElement('div');
      el.className = 'item';
      el.textContent = opt.label;
      el.addEventListener('click', function () {
        hideProfilePicker();
        createTab(opt.name).catch(function (err) { console.error('createTab failed:', err); });
      });
      picker.appendChild(el);
    });

    document.body.appendChild(picker);
    state.profilePickerEl = picker;
  }

  function hideProfilePicker() {
    if (state.profilePickerEl && state.profilePickerEl.parentElement) {
      state.profilePickerEl.parentElement.removeChild(state.profilePickerEl);
    }
    state.profilePickerEl = null;
  }

  function setupContextMenu() {
    var list = document.getElementById('tab-list');
    if (!list) return;
    list.addEventListener('contextmenu', function (e) {
      var tabEl = e.target.closest && e.target.closest('.tab');
      if (!tabEl) return;
      showContextMenu(e, tabEl.dataset.tabId);
    });
    document.addEventListener('click', function (e) {
      if (state.contextMenuEl && !state.contextMenuEl.contains(e.target)) hideContextMenu();
    });
  }

  function setupNewTabButton() {
    var btn = document.getElementById('tab-new');
    if (btn) btn.addEventListener('click', function () { showProfilePicker(); });
  }

  async function registerPtyOutputListener() {
    if (!eventApi || typeof eventApi.listen !== 'function') return;
    try {
      await eventApi.listen('pty-output', function (e) {
        var payload = e.payload || {};
        var sessionId = payload.sessionId;
        var data = payload.data;
        var eof = payload.eof;
        var generation = payload.generation;
        if (!sessionId) return;

        if (sessionId === 'panel') {
          if (window.panelTerm) {
            if (data) {
              try { window.panelTerm.write(data); } catch (err) { /* ignore */ }
            }
            if (eof) {
              try { window.panelTerm.write('\r\n[process exited]\r\n'); } catch (err) { /* ignore */ }
            }
          }
          return;
        }

        var meta = state.sessionToTab.get(sessionId);
        if (!meta) return;
        var rt = state.runtime.get(meta.tabId);
        if (!rt) return;
        var term = meta.view === 'primary'
          ? rt.xterms.primary
          : rt.xterms.secondaries.get(meta.secondaryIndex);
        if (!term) return;

        var expected = state.generations.get(sessionId) || 0;
        if (generation != null && generation !== expected) return;

        if (eof) {
          if (state.skipNextEof.get(sessionId)) {
            state.skipNextEof.set(sessionId, false);
            return;
          }
          try { term.write('\r\n[process exited]\r\n'); } catch (err) { /* ignore */ }
          return;
        }

        if (data) {
          state.skipNextEof.set(sessionId, false);
          try { term.write(data); } catch (err) { /* ignore */ }
        }
      });
    } catch (e) {
      console.error('pty-output listener registration failed:', e);
    }
  }

  async function init() {
    state.xtermPoolEl = document.getElementById('tab-xterm-pool');
    if (!state.xtermPoolEl) {
      state.xtermPoolEl = document.createElement('div');
      state.xtermPoolEl.id = 'tab-xterm-pool';
      state.xtermPoolEl.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;visibility:hidden;';
      document.body.appendChild(state.xtermPoolEl);
    }

    await registerPtyOutputListener();

    var cfg = null;
    try {
      cfg = await api.getTabsConfig();
    } catch (e) {
      console.error('getTabsConfig failed:', e);
      cfg = { enabled: true, position: 'top', activeTabId: null, tabs: [] };
    }
    state.config = cfg;

    var tabBar = document.getElementById('tab-bar');
    if (tabBar) {
      tabBar.hidden = !cfg.enabled;
      tabBar.classList.toggle('position-bottom', cfg.position === 'bottom');
    }

    if (!cfg.tabs || cfg.tabs.length === 0) {
      try { await createTab(null); } catch (e) { console.error('initial createTab failed:', e); }
    } else {
      try {
        var result = await api.restoreTabSessions();
        var tabs = result[0] || [];
        var sessions = result[1] || [];
        for (var s = 0; s < sessions.length; s++) {
          state.generations.set(sessions[s][0], sessions[s][1]);
        }
        for (var t = 0; t < tabs.length; t++) {
          buildRuntimeForTab(tabs[t]);
        }
        var targetId = state.config.activeTabId;
        if (targetId && state.runtime.has(targetId)) {
          await switchTab(targetId);
        } else if (tabs.length > 0) {
          await setActiveTab(tabs[0].id);
          await switchTab(tabs[0].id);
        }
      } catch (e) {
        console.error('restore failed', e);
      }
    }

    setupDragDrop();
    setupContextMenu();
    setupNewTabButton();
  }

  window.TabManager = {
    init: init,
    getActiveXterm: getActiveXterm,
    getActiveTabId: getActiveTabId,
    getActiveView: getActiveView,
    isMainActive: isMainActive,
    resolveSessionId: resolveSessionId,
    setupTerminalHandlers: setupTerminalHandlers,
    createTab: createTab,
    closeTab: closeTab,
    setActiveTab: setActiveTab,
    switchTab: switchTab,
    switchView: switchView,
    pinTab: pinTab,
    setTabColor: setTabColor,
    reorderTabs: reorderTabs,
    changeProfile: changeProfile,
    refreshActiveTab: refreshActiveTab,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.TabManager.init().catch(function (err) { console.error('TabManager.init failed:', err); });
    });
  } else {
    window.TabManager.init().catch(function (err) { console.error('TabManager.init failed:', err); });
  }
})();
