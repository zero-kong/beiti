/* 通用工具：模板转义、日期格式化、弹层等。纯函数部分同时导出给 Node 测试用。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.App = root.App || {};
  root.App.util = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DAY = 86400000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* 今天 23:59:59 的本地时间戳：复习规则里“到期”统一按“今天内”判断 */
  function endOfToday(now) {
    var d = new Date(now == null ? Date.now() : now);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function fmtDue(ts, now) {
    if (ts == null) return '';
    var base = now == null ? Date.now() : now;
    var today = new Date(base); today.setHours(0, 0, 0, 0);
    var day = new Date(ts); day.setHours(0, 0, 0, 0);
    var diff = Math.round((day.getTime() - today.getTime()) / DAY);
    if (diff <= 0) return '今天';
    if (diff === 1) return '明天';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtStamp(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  return { DAY: DAY, esc: esc, uid: uid, endOfToday: endOfToday, fmtDue: fmtDue, fmtStamp: fmtStamp, pad: pad };
});
