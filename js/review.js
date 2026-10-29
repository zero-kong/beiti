/* 复习引擎：间隔表、四档反馈的计算、忘记后的本轮重现规则。纯逻辑，不碰 DOM。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.App = root.App || {};
  root.App.review = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* 默认间隔表：1、3、7、14、30 天，可调整 */
  var INTERVALS = [1, 3, 7, 14, 30];
  var DAY = 86400000;

  function endOfToday(now) {
    var d = new Date(now == null ? Date.now() : now);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  /* 是否属于“到期复习或首次学习”：
     新题（无到期时间）或到期时间在今天内 → 反馈正常生效；
     到期时间在明天及以后 → 属于提前背诵/当天额外练习，记住与模糊不改变阶段和到期时间。 */
  function isDueOrNew(q, now) {
    return q.dueAt == null || q.dueAt <= endOfToday(now);
  }

  /* 是否出现在“今日待复习”里（不看标签与收藏） */
  function dueForReview(q, now) {
    return q.dueAt != null && q.dueAt <= endOfToday(now);
  }

  /*
    计算一次反馈后的复习字段。
    remember 记住：初次 → 1 天后；到期复习中 → 进入下一间隔；到顶维持 30 天
    fuzzy   模糊：明天再复习，不提升阶段
    forgot  忘记：重置阶段，明天继续复习（无论是否到期都按忘记处理）
    peek    先看看：不提高掌握程度；新题安排明天，旧题保留已有到期状态
    提前/当天额外练习时 remember、fuzzy 不改变 stage 与 dueAt（不虚增、不延长）。
  */
  function computeNext(q, feedback, now) {
    now = now == null ? Date.now() : now;
    var due = isDueOrNew(q, now);
    var patch = { lastFeedback: feedback, lastStudiedAt: now };

    if (feedback === 'remember') {
      if (due) {
        var stage = q.stage < 0 ? 0 : Math.min(q.stage + 1, INTERVALS.length - 1);
        patch.stage = stage;
        patch.dueAt = now + INTERVALS[stage] * DAY;
      }
    } else if (feedback === 'fuzzy') {
      if (due) {
        patch.stage = q.stage;
        patch.dueAt = now + DAY;
      }
    } else if (feedback === 'forgot') {
      patch.stage = -1;
      patch.dueAt = now + DAY;
    } else if (feedback === 'peek') {
      if (q.lastStudiedAt == null) {
        patch.stage = q.stage;
        patch.dueAt = now + DAY;
      }
      /* 旧题先看看：保留已有到期状态，不改 stage / dueAt */
    }
    return patch;
  }

  /*
    忘记后的“本轮强化重现”：
    与当前位置至少隔 3 道其他题，且本轮最多重现一次；题量不足则留待明天。
    调用时机：已对当前题选了“忘记”并把 index 前移到下一题之后。
    返回是否插队成功。
  */
  function planRequeue(session, id) {
    if (!session || session.requeued.indexOf(id) !== -1) return false;
    var remaining = session.ids.length - session.index;
    if (remaining < 3) return false;
    session.ids.splice(session.index + 3, 0, id);
    session.requeued.push(id);
    return true;
  }

  return {
    INTERVALS: INTERVALS,
    isDueOrNew: isDueOrNew,
    dueForReview: dueForReview,
    computeNext: computeNext,
    planRequeue: planRequeue
  };
});
