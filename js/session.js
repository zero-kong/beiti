/* 本轮背诵会话：队列构建（去重、顺序/随机固定）、答题推进、忘记重现、继续上次。 */
(function () {
  'use strict';

  function active() {
    var s = App.store.get();
    var ses = s.session;
    if (ses && Array.isArray(ses.ids) && ses.index < ses.ids.length) return ses;
    return null;
  }

  /* 开始新一轮：ids 去重并剔除已删除的题；随机顺序只在此处洗一次，之后固定 */
  function start(opts) {
    var seen = {};
    var ids = [];
    opts.ids.forEach(function (id) {
      if (!seen[id] && App.store.byId(id)) { seen[id] = true; ids.push(id); }
    });
    if (!ids.length) return null;
    if (opts.order === 'random') {
      for (var i = ids.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      }
    }
    var s = App.store.get();
    s.session = {
      ids: ids,
      index: 0,
      mode: opts.mode || 'free',       // free | review
      order: opts.order === 'random' ? 'random' : 'seq',
      createdAt: Date.now(),
      requeued: [],
      counts: { remember: 0, fuzzy: 0, forgot: 0, peek: 0 }
    };
    App.store.save();
    return s.session;
  }

  function current() {
    var ses = active();
    if (!ses) return null;
    var q = App.store.byId(ses.ids[ses.index]);
    if (!q) return null;   // 题目被删掉的极端情况，由页面处理
    return { session: ses, question: q, pos: ses.index + 1, total: ses.ids.length };
  }

  /*
    提交当前题的反馈：更新复习字段 → 计数 → 前移 → 忘记则尝试本轮重现。
    返回 { done, requeued }。
  */
  function answer(feedback) {
    var ses = active();
    if (!ses) return { done: true, requeued: false };
    var id = ses.ids[ses.index];
    var q = App.store.byId(id);
    if (q) Object.assign(q, App.review.computeNext(q, feedback));
    ses.counts[feedback] = (ses.counts[feedback] || 0) + 1;
    ses.index++;
    var requeued = false;
    if (feedback === 'forgot') requeued = App.review.planRequeue(ses, id);
    App.store.save();
    return { done: ses.index >= ses.ids.length, requeued: requeued };
  }

  /* 结束本轮（用户主动结束或答完） */
  function finish() {
    App.store.get().session = null;
    App.store.save();
  }

  App.session = { active: active, start: start, current: current, answer: answer, finish: finish };
})();
