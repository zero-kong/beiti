/* UI 框架：hash 路由、底部导航、toast / 确认框 / 顺序选择，以及首页。 */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');

  /* ---------- 弹层 ---------- */
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2200);
  }

  function closeModal(host) { host.remove(); }

  /* 确认框，返回 Promise<boolean> */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'overlay';
      host.innerHTML =
        '<div class="dialog" role="alertdialog">' +
        '  <div class="dialog-title">' + App.util.esc(opts.title) + '</div>' +
        (opts.desc ? '<div class="dialog-desc">' + App.util.esc(opts.desc) + '</div>' : '') +
        '  <div class="dialog-btns">' +
        '    <button class="btn ghost" data-act="no">' + App.util.esc(opts.cancelText || '取消') + '</button>' +
        '    <button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="yes">' + App.util.esc(opts.okText || '确定') + '</button>' +
        '  </div>' +
        '</div>';
      host.addEventListener('click', function (e) {
        var act = e.target.closest('button') && e.target.closest('button').dataset.act;
        if (act || e.target === host) { closeModal(host); resolve(act === 'yes'); }
      });
      document.body.appendChild(host);
    });
  }

  /* 底部弹层：选择背诵顺序，返回 Promise<'seq'|'random'|null> */
  function chooseOrder() {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'overlay';
      host.innerHTML =
        '<div class="sheet">' +
        '  <div class="sheet-title">背诵顺序</div>' +
        '  <div class="sheet-desc">随机顺序选定后本轮固定，方便随时继续上次</div>' +
        '  <button class="btn primary block" data-act="seq">按顺序背</button>' +
        '  <button class="btn ghost block" data-act="random">随机打乱背</button>' +
        '</div>';
      host.addEventListener('click', function (e) {
        if (e.target === host) { closeModal(host); resolve(null); return; }
        var btn = e.target.closest('button[data-act]');
        if (btn) { closeModal(host); resolve(btn.dataset.act); }
      });
      document.body.appendChild(host);
    });
  }

  /* ---------- 路由 ---------- */
  var routes = {};

  function render() {
    var hash = location.hash || '#/';
    var name = hash.slice(2).split('?')[0] || 'home';
    var params = {};
    hash.split('?')[1] && hash.split('?')[1].split('&').forEach(function (kv) {
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    var page = routes[name] || routes.home;
    // 关闭可能残留的弹层
    document.querySelectorAll('.overlay').forEach(function (o) { o.remove(); });
    var isTabbed = name === 'home' || name === 'list';
    if (name !== 'study' && App.studyDispose) App.studyDispose();   // 移除背诵页键盘监听
    tabbar.style.display = isTabbed ? '' : 'none';
    document.body.classList.toggle('has-tabbar', isTabbed);
    app.innerHTML = '';
    page(app, params);
    window.scrollTo(0, 0);
    tabbar.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.route === name);
    });
  }

  function go(name, params) {
    var h = '#/' + name;
    if (params) h += '?' + Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    if (location.hash === h) render(); else location.hash = h;
  }

  function register(name, fn) { routes[name] = fn; }

  /* ---------- 首页 ---------- */
  function renderHome(root) {
    var c = App.store.counts();
    var ses = App.session.active();
    var today = new Date();
    var dateStr = (today.getMonth() + 1) + '月' + today.getDate() + '日';

    var html =
      '<header class="page-head"><div><div class="brand">背题</div>' +
      '<div class="sub">' + dateStr + ' · 面试备考背诵</div></div></header>' +

      '<section class="stat-strip">' +
      '  <span>全部 <b>' + c.total + '</b></span><i></i>' +
      '  <span>已学 <b>' + c.studied + '</b></span><i></i>' +
      '  <span>收藏 <b>' + c.favorite + '</b></span>' +
      '</section>';

    if (c.total === 0) {
      html +=
        '<div class="empty">' +
        '  <div class="empty-title">还没有题目</div>' +
        '  <div class="empty-desc">先去题库添加几道想背的题，或导入一份 JSON 备份</div>' +
        '  <button class="btn primary block" id="go-add">去添加题目</button>' +
        '</div>';
    } else {
      var dueReady = c.dueToday > 0;
      html +=
        '<button class="big-card' + (dueReady ? ' hot' : '') + '" id="start-review"' + (dueReady ? '' : ' data-empty="1"') + '>' +
        '  <div class="big-ico due' + (dueReady ? ' on' : '') + '">' +
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>' +
        '  </div>' +
        '  <div class="big-txt"><div class="big-title">今日待复习' + (dueReady ? ' <em>' + c.dueToday + '</em> 题' : '') + '</div>' +
        '  <div class="big-sub">' + (dueReady ? '含逾期题目，按到期时间排序' : '今天没有到期题目，去自由背题吧') + '</div></div>' +
        '  <span class="chev">›</span>' +
        '</button>' +

        '<button class="big-card" id="start-free">' +
        '  <div class="big-ico free"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>' +
        '  <div class="big-txt"><div class="big-title">自由背题</div><div class="big-sub">从全部 ' + c.total + ' 题里开背</div></div>' +
        '  <span class="chev">›</span>' +
        '</button>';

      if (ses) {
        html +=
          '<button class="big-card" id="continue-last">' +
          '  <div class="big-ico cont"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg></div>' +
          '  <div class="big-txt"><div class="big-title">继续上次</div><div class="big-sub">第 ' + (ses.index + 1) + ' / ' + ses.ids.length + ' 题 · ' + (ses.mode === 'review' ? '到期复习' : '自由背题') + '</div></div>' +
          '  <span class="chev">›</span>' +
          '</button>';
      }
    }

    root.innerHTML = '<div class="page">' + html + '</div>';

    var goAdd = root.querySelector('#go-add');
    if (goAdd) goAdd.onclick = function () { App.ui.go('edit'); };

    var reviewBtn = root.querySelector('#start-review');
    if (reviewBtn) reviewBtn.onclick = async function () {
      var due = App.store.dueList();
      if (!due.length) { toast('今天没有到期题目'); return; }
      App.session.start({ ids: due.map(function (q) { return q.id; }), mode: 'review', order: 'seq' });
      App.ui.go('study');
    };

    var freeBtn = root.querySelector('#start-free');
    if (freeBtn) freeBtn.onclick = async function () {
      var order = await chooseOrder();
      if (!order) return;
      var ids = App.store.all().map(function (q) { return q.id; });
      if (!App.session.start({ ids: ids, mode: 'free', order: order })) { toast('没有可背的题目'); return; }
      App.ui.go('study');
    };

    var contBtn = root.querySelector('#continue-last');
    if (contBtn) contBtn.onclick = function () { App.ui.go('study'); };
  }

  App.ui = {
    toast: toast, confirmDialog: confirmDialog, chooseOrder: chooseOrder,
    register: register, render: render, go: go, renderHome: renderHome
  };
})();
