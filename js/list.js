/* 题库页：搜索、标签/收藏筛选、勾选开背、添加编辑入口、导入导出。
   结构上搜索框与筛选条常驻，只重绘结果区，避免输入过程中输入框被重建。 */
(function () {
  'use strict';
  var uiState = { search: '', tags: [], favOnly: false, selected: {} };
  var rootEl = null;

  function statusBadge(q) {
    var now = Date.now();
    if (App.review.dueForReview(q, now)) return '<span class="chip due">今天到期</span>';
    if (q.lastStudiedAt == null) return '<span class="chip new">新</span>';
    return '<span class="chip plan">' + App.util.esc(App.util.fmtDue(q.dueAt)) + '</span>';
  }

  function filtered() {
    return App.store.filterQuestions({
      search: uiState.search, tags: uiState.tags, favOnly: uiState.favOnly
    });
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

  /* ---------- 结果区（输入/筛选变化时只重绘这里） ---------- */
  function listAreaHtml() {
    var list = filtered();
    var selCount = selectedIds().length;
    var html =
      '<div class="result-bar">' +
      '  <span>筛选结果 ' + list.length + ' 题' + (selCount ? ' · 已选 ' + selCount + ' 题' : '') + '</span>' +
      (list.length ? '<button class="btn ghost sm" id="btn-study-filter">背当前结果</button>' : '') +
      '</div>';

    if (!App.store.all().length) {
      html += '<div class="empty"><div class="empty-title">题库还是空的</div>' +
        '<div class="empty-desc">点右上角“添加”录入第一道题，或“导入”一份 JSON 备份</div></div>';
    } else if (!list.length) {
      html += '<div class="empty"><div class="empty-title">没有匹配的题目</div><div class="empty-desc">换个关键词，或取消部分筛选</div></div>';
    } else {
      html += '<ul class="q-list">' + list.map(function (q) {
        var checked = !!uiState.selected[q.id];
        return (
          '<li class="q-item' + (checked ? ' checked' : '') + '" data-id="' + App.util.esc(q.id) + '">' +
          '  <button class="check" data-check="' + App.util.esc(q.id) + '" aria-label="选择">' + (checked ? '✓' : '') + '</button>' +
          '  <div class="q-main" data-edit="' + App.util.esc(q.id) + '">' +
          '    <div class="q-title">' + App.util.esc(q.question) + '</div>' +
          '    <div class="q-meta">' + statusBadge(q) +
          q.tags.map(function (t) { return '<span class="chip tag">' + App.util.esc(t) + '</span>'; }).join('') +
          '    </div>' +
          '  </div>' +
          '  <button class="star' + (q.favorite ? ' on' : '') + '" data-favq="' + App.util.esc(q.id) + '" aria-label="收藏">' + (q.favorite ? '★' : '☆') + '</button>' +
          '</li>');
      }).join('') + '</ul>';
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
    var tags = App.store.allTags();

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
      '  <input id="search" type="search" placeholder="搜索题目、答案、标签" value="' + App.util.esc(uiState.search) + '">' +
      '</div>' +

      '<div class="chip-row" id="tag-row">' +
      '  <button class="fchip' + (uiState.favOnly ? ' on' : '') + '" data-fav="1">★ 收藏</button>' +
      tags.map(function (t) {
        return '<button class="fchip' + (uiState.tags.indexOf(t) !== -1 ? ' on' : '') + '" data-tag="' + App.util.esc(t) + '">' + App.util.esc(t) + '</button>';
      }).join('') +
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

    rootEl.querySelector('#tag-row').addEventListener('click', function (e) {
      var fav = e.target.closest('[data-fav]');
      var tag = e.target.closest('[data-tag]');
      if (fav) uiState.favOnly = !uiState.favOnly;
      if (tag) {
        var t = tag.dataset.tag;
        var i = uiState.tags.indexOf(t);
        if (i === -1) uiState.tags.push(t); else uiState.tags.splice(i, 1);
      }
      if (fav || tag) render(rootEl);
    });

    var studyFilter = rootEl.querySelector('#btn-study-filter');
    if (studyFilter) studyFilter.onclick = function () {
      startWith(filtered().map(function (q) { return q.id; }));
    };

    var selAll = rootEl.querySelector('#btn-sel-all');
    if (selAll) selAll.onclick = function () {
      filtered().forEach(function (q) { uiState.selected[q.id] = true; });
      refreshListArea();
    };

    var studySel = rootEl.querySelector('#btn-study-sel');
    if (studySel) studySel.onclick = function () { startWith(selectedIds()); };

    // 结果区事件委托：容器常驻，内部节点随便重绘
    rootEl.querySelector('#list-area').addEventListener('click', function (e) {
      var check = e.target.closest('[data-check]');
      var favq = e.target.closest('[data-favq]');
      var edit = e.target.closest('[data-edit]');
      if (check) {
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
    var ok = await App.ui.confirmDialog({
      title: '清空所有数据？',
      desc: '将删除全部题目与背诵进度，建议先导出备份。此操作不可恢复。',
      okText: '仍然清空', danger: true
    });
    if (!ok) return;
    App.store.clearAll();
    uiState.selected = {};
    App.ui.toast('已清空');
    App.ui.render();
  }

  App.ui.register('list', render);
})();
