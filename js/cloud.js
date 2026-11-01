/* 云端同步（MySQL）：拉取合并（updated_at 新者胜）+ 全量推送 + 墓碑删除。
   配置（服务地址 + 同步令牌）只存本机 localStorage；数据库密码仅存在服务端。 */
(function () {
  'use strict';
  var CFG_KEY = 'beiti.cloud.v1';
  var CURSOR_KEY = 'beiti.cloud.cursor';
  var STAT_KEY = 'beiti.cloud.stat';
  var OVERLAP = 5 * 60 * 1000;   // 拉取时回看 5 分钟，容忍设备间时钟偏差

  var pushTimer = null;
  var cloud = { suppressed: false };

  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
  function configured() { var c = cfg(); return !!(c.url && c.token); }

  function api(path, body) {
    var c = cfg();
    return fetch(c.url.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.token },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function sanitizeRow(r) {
    return {
      id: String(r.id),
      question: String(r.question || ''),
      answer: String(r.answer || ''),
      category: Array.isArray(r.category) ? r.category.slice(0, 3).map(String) : [],
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      source: String(r.source || ''),
      note: String(r.note || ''),
      favorite: !!r.favorite,
      stage: typeof r.stage === 'number' ? r.stage : -1,
      dueAt: typeof r.dueAt === 'number' ? r.dueAt : null,
      lastFeedback: r.lastFeedback || null,
      lastStudiedAt: typeof r.lastStudiedAt === 'number' ? r.lastStudiedAt : null,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0
    };
  }

  /* 把服务端行合并进本地：删除墓碑直接移除；其余按 updatedAt 新者胜 */
  function applyRows(rows) {
    var s = App.store.get(), max = 0;
    rows.forEach(function (r) {
      max = Math.max(max, r.updatedAt || 0);
      if (r.deleted) {
        s.questions = s.questions.filter(function (q) { return q.id !== r.id; });
        if (s.session) {
          var i = s.session.ids.indexOf(r.id);
          if (i !== -1) { s.session.ids.splice(i, 1); if (i < s.session.index) s.session.index--; }
        }
        return;
      }
      var q = null;
      for (var k = 0; k < s.questions.length; k++) if (s.questions[k].id === r.id) { q = s.questions[k]; break; }
      if (!q) s.questions.push(sanitizeRow(r));
      else if ((r.updatedAt || 0) > (q.updatedAt || 0)) Object.assign(q, sanitizeRow(r));
    });
    return max;
  }

  function sync(silent) {
    if (!configured()) {
      if (!silent) App.ui.toast('请先配置服务地址与令牌');
      return Promise.resolve(false);
    }
    var since = Math.max(0, (+(localStorage.getItem(CURSOR_KEY) || 0)) - OVERLAP);
    return api('/api/pull', { since: since }).then(function (res) {
      cloud.suppressed = true;
      var maxUpdated = 0;
      try { maxUpdated = applyRows(res.questions || []); App.store.save(); }
      finally { cloud.suppressed = false; }
      var deleted = (App.store.get().deletedIds || []).slice();
      return api('/api/push', { questions: App.store.all(), deleted: deleted }).then(function () {
        App.store.get().deletedIds = [];
        App.store.save();
        /* 游标推进：本次见过的最大行时间 与 刚推送时间 取大者——
           自己刚推的数据无需再拉，updated_at=0 的存量行也只会在首拉全量出现一次 */
        localStorage.setItem(CURSOR_KEY, String(Math.max(maxUpdated, Date.now() - 1)));
        localStorage.setItem(STAT_KEY, JSON.stringify({ lastSyncAt: Date.now(), count: App.store.all().length }));
        if (!silent) App.ui.toast('已同步（本地 ' + App.store.all().length + ' 题）');
        return true;
      });
    }).catch(function (e) {
      if (!silent) App.ui.toast('同步失败：' + (e.message || '网络错误'));
      return false;
    });
  }

  /* 数据有任何变化（persist 钩子调用）→ 防抖推送 */
  function notifyChange() {
    if (!configured()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { sync(true); }, 4000);
  }

  function autoBoot() {
    if (configured()) setTimeout(function () { sync(true); }, 1200);
  }

  /* ---------- 设置弹层 ---------- */
  function sheet() {
    var host = document.createElement('div');
    host.className = 'overlay';
    var c = cfg();
    var stat = null;
    try { stat = JSON.parse(localStorage.getItem(STAT_KEY) || 'null'); } catch (e) {}

    host.innerHTML =
      '<div class="sheet">' +
      '  <div class="sheet-title">云端同步（MySQL）</div>' +
      '  <div class="sheet-desc">数据库密码只在服务端；这里只存地址与令牌，换设备需重新填写</div>' +
      '  <label class="field"><span>服务地址</span>' +
      '    <input id="cloud-url" placeholder="http://<服务器地址>:8790" value="' + App.util.esc(c.url || '') + '">' +
      '  </label>' +
      '  <label class="field"><span>同步令牌</span>' +
      '    <input id="cloud-token" placeholder="见服务端 api/config.local.json" value="' + App.util.esc(c.token || '') + '">' +
      '  </label>' +
      '  <div class="cloud-stat">' + (stat
        ? '上次同步 ' + new Date(stat.lastSyncAt).toLocaleString() + ' · ' + stat.count + ' 题'
        : '尚未同步过') + '</div>' +
      '  <button class="btn primary block" id="cloud-save">保存</button>' +
      '  <button class="btn ghost block" id="cloud-sync">立即同步</button>' +
      (configured() ? '<button class="btn ghost-danger block" id="cloud-clear">断开云端（不清数据）</button>' : '') +
      '  <button class="btn ghost block" data-close="1">关闭</button>' +
      '</div>';

    host.addEventListener('click', function (e) {
      if (e.target === host) { host.remove(); return; }
      if (e.target.closest('[data-close]')) { host.remove(); return; }
      if (e.target.closest('#cloud-save')) {
        saveCfg({
          url: host.querySelector('#cloud-url').value.trim(),
          token: host.querySelector('#cloud-token').value.trim()
        });
        App.ui.toast('已保存');
        host.remove();
        App.ui.render();
        return;
      }
      if (e.target.closest('#cloud-sync')) {
        saveCfg({
          url: host.querySelector('#cloud-url').value.trim(),
          token: host.querySelector('#cloud-token').value.trim()
        });
        host.remove();
        sync(false);
        return;
      }
      if (e.target.closest('#cloud-clear')) {
        localStorage.removeItem(CFG_KEY);
        localStorage.removeItem(CURSOR_KEY);
        localStorage.removeItem(STAT_KEY);
        App.ui.toast('已断开云端，本地数据保留');
        host.remove();
      }
    });
    document.body.appendChild(host);
  }

  cloud.configured = configured;
  cloud.sync = sync;
  cloud.notifyChange = notifyChange;
  cloud.autoBoot = autoBoot;
  cloud.sheet = sheet;
  App.cloud = cloud;
})();
