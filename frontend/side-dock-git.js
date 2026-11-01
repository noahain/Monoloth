(function () {
    'use strict';

    var escapeHtml = window.MonolothUI.escapeHtml;
    var root = null;
    var states = new Map();
    var activeId = null;
    var activeRoot = '';

    function stateFor(mainTabId) {
        if (!states.has(mainTabId)) {
            states.set(mainTabId, { requestId: 0, branch: '', ahead: 0, behind: 0, changes: [], commits: [], diff: '', error: null });
        }
        return states.get(mainTabId);
    }

    function git(args) {
        return window.monolithApi.run_git(activeRoot, args);
    }

    function parseHead(line) {
        var head = (line || '').replace(/^##\s*/, '');
        var ahead = 0;
        var behind = 0;
        var counts = head.match(/\[(.*?)\]/);
        if (counts) {
            var aheadMatch = counts[1].match(/ahead (\d+)/);
            var behindMatch = counts[1].match(/behind (\d+)/);
            if (aheadMatch) ahead = Number(aheadMatch[1]);
            if (behindMatch) behind = Number(behindMatch[1]);
        }
        return { branch: head.split('...')[0], ahead: ahead, behind: behind };
    }

    function render(state) {
        if (!state || states.get(activeId) !== state) return;

        var meta = (state.ahead ? ' \u2191' + state.ahead : '') + (state.behind ? ' \u2193' + state.behind : '');
        var header =
            '<div class="side-dock-git-branch">' +
                '<span class="side-dock-git-branch-name">' + escapeHtml(state.branch || 'detached') + meta + '</span>' +
                '<button class="side-dock-git-refresh" data-tooltip="Refresh">&#8635;</button>' +
            '</div>';

        if (state.error) {
            root.innerHTML = header + '<div class="side-dock-empty">' + escapeHtml(state.error) + '</div>';
            return;
        }

        var changes = state.changes.map(function (line) {
            var code = line.slice(0, 2);
            var path = line.slice(3);
            return '<div class="side-dock-git-change" data-path="' + escapeHtml(path) + '">' +
                '<span class="side-dock-git-code">' + escapeHtml(code) + '</span>' +
                '<span class="side-dock-git-path">' + escapeHtml(path) + '</span></div>';
        }).join('');
        var commits = state.commits.map(function (line) {
            return '<div class="side-dock-git-commit">' + escapeHtml(line) + '</div>';
        }).join('');

        root.innerHTML = header +
            '<div class="side-dock-git-section">Changes</div>' +
            '<div class="side-dock-git-changes">' + (changes || '<div class="side-dock-empty">Working tree clean</div>') + '</div>' +
            '<div class="side-dock-git-section">Recent commits</div>' +
            '<div class="side-dock-git-commits">' + (commits || '<div class="side-dock-empty">No commits</div>') + '</div>' +
            (state.diff ? '<pre class="side-dock-git-diff">' + escapeHtml(state.diff) + '</pre>' : '');
    }

    function refresh() {
        var state = stateFor(activeId);
        var requestId = ++state.requestId;
        state.error = null;
        return Promise.all([
            git(['status', '--porcelain=v1', '--branch']),
            git(['log', '--oneline', '-n', '30', '--decorate']).catch(function () { return { code: 0, stdout: '' }; })
        ]).then(function (results) {
            if (requestId !== state.requestId) return;
            var statusOut = results[0].stdout || '';
            if (results[0].code !== 0) {
                state.error = (results[0].stderr || '').trim() || 'Not a git repository.';
                render(state);
                return;
            }
            var lines = statusOut.split('\n').filter(Boolean);
            var head = parseHead(lines[0]);
            state.branch = head.branch;
            state.ahead = head.ahead;
            state.behind = head.behind;
            state.changes = lines.slice(1);
            state.commits = (results[1].stdout || '').split('\n').filter(Boolean);
            state.diff = '';
            render(state);
        }).catch(function (err) {
            if (requestId !== state.requestId) return;
            state.error = String(err);
            render(state);
        });
    }

    function loadDiff(path) {
        var state = stateFor(activeId);
        return git(['diff', '--', path]).then(function (result) {
            state.diff = result.stdout || '(no diff)';
            render(state);
        }).catch(function (err) {
            state.diff = '';
            state.error = String(err);
            render(state);
        });
    }

    function activate(mainTabId, dir) {
        activeId = mainTabId;
        activeRoot = dir;
        return refresh();
    }

    function mount(container) {
        root = container;
        root.addEventListener('click', function (event) {
            if (event.target.closest('.side-dock-git-refresh')) {
                refresh();
                return;
            }
            var row = event.target.closest('.side-dock-git-change');
            if (row) loadDiff(row.getAttribute('data-path'));
        });
    }

    function dispose(mainTabId) {
        states.delete(mainTabId);
    }

    window.MonolithSideDockGit = {
        mount: mount,
        activate: activate,
        refresh: refresh,
        dispose: dispose
    };
})();
