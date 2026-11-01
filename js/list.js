/* 题库页：文件树列表（学科 → 分类 → 专题 逐级展开）+ 搜索 + 收藏筛选 + 勾选开背。
   标签不再用于页面组织；搜索框与结果区分离，输入时不重建输入框。 */
(function () {
  'use strict';
  var uiState = { search: '', favOnly: false, expanded: {}, selected: {} };
  var rootEl = null;

  function statusBadge(q) {
    var now = Date.now();
    if (App.review.dueForReview(q, now)) return '<span class="chip due">今天到期</span>';
    if (q.lastStudiedAt == null) return '<span class="chip new">新</span>';
    return '<span class="chip plan">' + App.util.esc(App.util.fmtDue(q.dueAt)) + '</span>';
  }

  function filtered(opts) {
    return App.store.filterQuestions(Object.assign(
      { search: uiState.search, favOnly: uiState.favOnly }, opts || {}
    ));
  }

  function selectedIds() {
    return Object.keys(uiState.selected).filter(function (id) { return uiState.selected[id] && App.store.byId(id); });
  }

  async function startWith(ids) {
    var order = await App.ui.chooseOrder();
    if (!order) return;
    if (!App.session.start({ ids: ids, mode: 'free', order: order })) { App.ui.toast('没有可背的题目'); return; }
    App.ui.go('study');
  }

  /* ---------- 文件树 ---------- */
  function subtreeIds(path) {
    return filtered({ category: path }).map(function (q) { return q.id; });
  }
  function subtreeCount(path) { return subtreeIds(path).length; }

  /* 归属在本级（category 恰好等于该路径）的题目 */
  function exactQuestions(path) {
    var isUncat = path.length === 1 && path[0] === '未分类';
    var key = path.join('|');
    return filtered().filter(function (q) {
      var c = q.category || [];
      return isUncat ? c.length === 0 : c.join('|') === key;
    });
  }

  function childFolders(path) {
    var tree = App.store.categoryTree();
    if (!path.length) {
      var roots = tree.roots.slice();
      if (subtreeCount(['未分类'])) roots.push('未分类');
      return roots;
    }
    if (path.length >= 3 || path[0] === '未分类') return [];
    return tree.subs[path.join('|')] || [];
  }

  function questionRow(q, lv) {
    var checked = !!uiState.selected[q.id];
    return (
      '<li class="q-item tree-lv' + lv + (checked ? ' checked' : '') + '" data-id="' + App.util.esc(q.id) + '">' +
      '  <button class="check" data-check="' + App.util.esc(q.id) + '" aria-label="选择">' + (checked ? '✓' : '') + '</button>' +
      '  <div class="q-main" data-edit="' + App.util.esc(q.id) + '">' +
      '    <div class="q-title">' + App.util.esc(q.question) + '</div>' +
      '    <div class="q-meta">' + statusBadge(q) +
      (q.category && q.category.length ? '<span class="chip catc">' + App.util.esc(q.category.join(' / ')) + '</span>' : '<span class="chip catc subtle">未分类</span>') +
      '    </div>' +
      '  </div>' +
      '  <button class="star' + (q.favorite ? ' on' : '') + '" data-favq="' + App.util.esc(q.id) + '" aria-label="收藏">' + (q.favorite ? '★' : '☆') + '</button>' +
      '</li>');
  }

  function nodeHtml(path, lv) {
    var key = path.join('|');
    var open = !!uiState.expanded[key];
    var count = subtreeCount(path);
    var html =
      '<div class="tree-row' + (open ? ' open' : '') + '" data-lv="' + lv + '">' +
      '  <button class="tree-toggle" data-toggle="' + App.util.esc(key) + '" aria-label="展开">' +
      (childFolders(path).length || exactQuestions(path).length ? '▸' : '·') + '</button>' +
      '  <div class="tree-name" data-toggle="' + App.util.esc(key) + '">' + App.util.esc(path[path.length - 1]) + '</div>' +
      '  <span class="tree-count">' + count + '</span>' +
      (count ? '<button class="btn ghost sm tree-go" data-gopath="' + App.util.esc(key) + '">背</button>' : '') +
      '</div>';
    if (open) {
      childFolders(path).forEach(function (name) { html += nodeHtml(path.concat([name]), lv + 1); });
      exactQuestions(path).forEach(function (q) { html += questionRow(q, lv + 1); });
    }
    return html;
  }

  function treeHtml() {
    var html = '';
    childFolders([]).forEach(function (name) { html += nodeHtml([name], 0); });
    return html;
  }

  /* ---------- 结果区 ---------- */
  function listAreaHtml() {
    var searching = !!uiState.search.trim();
    var all = filtered();
    var selCount = selectedIds().length;
    var html;

    if (searching) {
      html =
        '<div class="result-bar">' +
        '  <span>搜到 ' + all.length + ' 题' + (selCount ? ' · 已选 ' + selCount + ' 题' : '') + '</span>' +
        (all.length ? '<button class="btn ghost sm" id="btn-study-filter">背当前结果</button>' : '') +
        '</div>';
      if (!all.length) {
        html += '<div class="empty"><div class="empty-title">没有匹配的题目</div><div class="empty-desc">换个关键词试试</div></div>';
      } else {
        html += '<ul class="q-list">' + all.map(function (q) { return questionRow(q, 0); }).join('') + '</ul>';
      }
    } else if (!App.store.all().length) {
      html = '<div class="empty"><div class="empty-title">题库还是空的</div>' +
        '<div class="empty-desc">点右上角“添加”录入第一道题，或“导入”一份 JSON 备份</div></div>';
    } else {
      html =
        '<div class="result-bar"><span>全部题目 ' + all.length + ' 题' + (selCount ? ' · 已选 ' + selCount + ' 题' : '') + '</span>' +
        '<span class="tree-hint">点目录展开，右侧“背”直接开背该目录</span></div>' +
        '<div class="tree-list">' + treeHtml() + '</div>';
    }
    html += '<div style="height:96px"></div>'; // 给底部条留白
    return html;
  }

  function selectBarHtml() {
    var selCount = selectedIds().length;
    if (!selCount) return '';
    return '<div class="select-bar"><span>已选 ' + selCount + ' 题</span>' +
      '<div><button class="btn ghost sm" id="btn-sel-all">全选结果</button>' +
      '<button class="btn primary sm" id="btn-study-sel">开背</button></div></div>';
  }

  function refreshListArea() {
    var area = rootEl.querySelector('#list-area');
    if (area) area.innerHTML = listAreaHtml();
    var bar = document.querySelector('.select-bar');
    if (bar) bar.remove();
    if (selectedIds().length) {
      rootEl.insertAdjacentHTML('beforeend', selectBarHtml());
      rootEl.querySelector('#btn-sel-all').onclick = function () {
        filtered().forEach(function (q) { uiState.selected[q.id] = true; });
        refreshListArea();
      };
      rootEl.querySelector('#btn-study-sel').onclick = function () { startWith(selectedIds()); };
    }
  }

  /* ---------- 整页 ---------- */
  function render(root, params) {
    rootEl = root;
    var html =
      '<div class="page">' +
      '<header class="page-head list-head">' +
      '  <div><div class="brand">题库</div><div class="sub">共 ' + App.store.all().length + ' 题</div></div>' +
      '  <div class="head-actions">' +
      '    <button class="icon-btn" id="btn-import" title="导入">导入</button>' +
      '    <button class="icon-btn" id="btn-export" title="导出">导出</button>' +
      '    <button class="icon-btn" id="btn-more" title="更多">⋯</button>' +
      '    <button class="btn primary sm" id="btn-add">+ 添加</button>' +
      '  </div>' +
      '</header>' +

      '<div class="search-box">' +
      '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '  <input id="search" type="search" placeholder="搜索题目、答案、分类" value="' + App.util.esc(uiState.search) + '">' +
      '</div>' +

      '<div class="chip-row">' +
      '  <button class="fchip' + (uiState.favOnly ? ' on' : '') + '" data-fav="1">★ 只看收藏</button>' +
      '</div>' +

      '<div id="list-area">' + listAreaHtml() + '</div>' +
      '</div>' + selectBarHtml();

    root.innerHTML = html;
    bind();
  }

  function bind() {
    rootEl.querySelector('#btn-add').onclick = function () { App.ui.go('edit'); };
    rootEl.querySelector('#btn-import').onclick = function () { App.io.pickImport(); };
    rootEl.querySelector('#btn-export').onclick = function () { App.io.exportFile(); };
    rootEl.querySelector('#btn-more').onclick = moreMenu;

    var search = rootEl.querySelector('#search');
    search.oninput = function () {
      uiState.search = search.value;
      refreshListArea();          // 只重绘结果区，输入框保持原元素
    };

    rootEl.querySelector('.chip-row').addEventListener('click', function (e) {
      if (e.target.closest('[data-fav]')) { uiState.favOnly = !uiState.favOnly; refreshListArea(); }
    });

    var studyFilter = rootEl.querySelector('#btn-study-filter');
    if (studyFilter) studyFilter.onclick = function () { startWith(filtered().map(function (q) { return q.id; })); };

    var selAll = rootEl.querySelector('#btn-sel-all');
    if (selAll) selAll.onclick = function () {
      filtered().forEach(function (q) { uiState.selected[q.id] = true; });
      refreshListArea();
    };

    var studySel = rootEl.querySelector('#btn-study-sel');
    if (studySel) studySel.onclick = function () { startWith(selectedIds()); };

    // 结果区事件委托：目录展开、目录直背、勾选、收藏、编辑
    rootEl.querySelector('#list-area').addEventListener('click', function (e) {
      var toggle = e.target.closest('[data-toggle]');
      var gopath = e.target.closest('[data-gopath]');
      var check = e.target.closest('[data-check]');
      var favq = e.target.closest('[data-favq]');
      var edit = e.target.closest('[data-edit]');
      if (toggle) {
        var key = toggle.dataset.toggle;
        if (uiState.expanded[key]) delete uiState.expanded[key]; else uiState.expanded[key] = true;
        refreshListArea();
      } else if (gopath) {
        startWith(subtreeIds(gopath.dataset.gopath.split('|')));
      } else if (check) {
        var id = check.dataset.check;
        if (uiState.selected[id]) delete uiState.selected[id]; else uiState.selected[id] = true;
        refreshListArea();
      } else if (favq) {
        App.store.toggleFavorite(favq.dataset.favq);
        refreshListArea();
      } else if (edit) {
        App.ui.go('edit', { id: edit.dataset.edit });
      }
    });
  }

  async function moreMenu() {
    var pick = await App.ui.menuSheet([
      { act: 'cloud', label: '云端同步（MySQL）' },
      { act: 'online', label: '从网站题库导入' },
      { act: 'clear', label: '清空所有数据', danger: true },
      { act: 'logout', label: '退出登录' }
    ]);
    if (pick === 'cloud') { App.cloud.sheet(); return; }
    if (pick === 'online') { App.io.pickOnline(); return; }
    if (pick === 'logout') {
      var out = await App.ui.confirmDialog({ title: '退出登录？', desc: '题库与背诵进度保留在本机，重新登录后继续。', okText: '退出' });
      if (out) { App.auth.logout(); App.ui.render(); }
      return;
    }
    if (pick === 'clear') {
      var ok = await App.ui.confirmDialog({
        title: '清空所有数据？',
        desc: '将删除全部题目与背诵进度，建议先导出备份。此操作不可恢复。',
        okText: '仍然清空', danger: true
      });
      if (!ok) return;
      App.store.clearAll();
      uiState.selected = {};
      uiState.expanded = {};
      App.ui.toast('已清空');
      App.ui.render();
    }
  }

  App.ui.register('list', render);
})();
