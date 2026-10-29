/* 复习规则单元测试：node test/run.js（无第三方依赖） */
var assert = require('assert');
var review = require('../js/review.js');

var DAY = 86400000;
var T0 = new Date(2026, 9, 28, 10, 0, 0).getTime();   // 2026-10-28 10:00（测试基准时刻）

function newQ() {
  return { id: 'x', question: 'q', answer: 'a', tags: [], favorite: false,
           stage: -1, dueAt: null, lastFeedback: null, lastStudiedAt: null };
}

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('\n[记住] 新题与间隔推进');
test('新题选记住：进入阶段0，1 天后到期', function () {
  var p = review.computeNext(newQ(), 'remember', T0);
  assert.strictEqual(p.stage, 0);
  assert.strictEqual(p.dueAt, T0 + 1 * DAY);
});
test('到期复习连续记住：1 → 3 → 7 → 14 → 30 天', function () {
  var q = newQ();
  var expect = [1, 3, 7, 14, 30];
  var now = T0;
  expect.forEach(function (days, stage) {
    var p = review.computeNext(q, 'remember', now);
    assert.strictEqual(p.stage, stage, '第 ' + (stage + 1) + ' 次记住后阶段应为 ' + stage);
    assert.strictEqual(p.dueAt, now + days * DAY, '第 ' + (stage + 1) + ' 次记住后应 ' + days + ' 天后到期');
    Object.assign(q, p);
    now = q.dueAt + 1000;   // 到期后稍晚来复习
  });
});
test('阶段到顶后记住：维持 30 天', function () {
  var q = newQ(); q.stage = 4; q.dueAt = T0 - DAY; q.lastStudiedAt = T0 - 31 * DAY;
  var p = review.computeNext(q, 'remember', T0);
  assert.strictEqual(p.stage, 4);
  assert.strictEqual(p.dueAt, T0 + 30 * DAY);
});

console.log('\n[模糊]');
test('到期题选模糊：阶段不变，明天再复习', function () {
  var q = newQ(); q.stage = 2; q.dueAt = T0 - DAY; q.lastStudiedAt = T0 - DAY;
  var p = review.computeNext(q, 'fuzzy', T0);
  assert.strictEqual(p.stage, 2);
  assert.strictEqual(p.dueAt, T0 + DAY);
});

console.log('\n[忘记]');
test('到期题选忘记：重置阶段，明天继续复习', function () {
  var q = newQ(); q.stage = 3; q.dueAt = T0 - DAY; q.lastStudiedAt = T0 - 10 * DAY;
  var p = review.computeNext(q, 'forgot', T0);
  assert.strictEqual(p.stage, -1);
  assert.strictEqual(p.dueAt, T0 + DAY);
});
test('提前背诵时忘记：同样按忘记处理（重置 + 明天）', function () {
  var q = newQ(); q.stage = 2; q.dueAt = T0 + 5 * DAY; q.lastStudiedAt = T0 - DAY;
  var p = review.computeNext(q, 'forgot', T0);
  assert.strictEqual(p.stage, -1);
  assert.strictEqual(p.dueAt, T0 + DAY);
});

console.log('\n[先看看]');
test('新题先看看：安排明天，不提高掌握程度', function () {
  var p = review.computeNext(newQ(), 'peek', T0);
  assert.strictEqual(p.stage, -1);
  assert.strictEqual(p.dueAt, T0 + DAY);
});
test('旧题先看看：保留已有到期状态（逾期仍逾期）', function () {
  var q = newQ(); q.stage = 1; q.dueAt = T0 - 2 * DAY; q.lastStudiedAt = T0 - 3 * DAY;
  var p = review.computeNext(q, 'peek', T0);
  assert.strictEqual(p.dueAt, undefined);
});

console.log('\n[当天额外练习 / 提前背诵]');
test('当天再次背同一题选记住：不提升阶段、不延长到期时间', function () {
  var q = newQ(); q.stage = 0; q.dueAt = T0 + DAY; q.lastStudiedAt = T0 - 3600e3;
  var p = review.computeNext(q, 'remember', T0);
  assert.strictEqual(p.stage, undefined);
  assert.strictEqual(p.dueAt, undefined);
  assert.strictEqual(p.lastFeedback, 'remember');
});
test('提前背诵选模糊：不改到期时间', function () {
  var q = newQ(); q.stage = 2; q.dueAt = T0 + 6 * DAY; q.lastStudiedAt = T0 - 2 * DAY;
  var p = review.computeNext(q, 'fuzzy', T0);
  assert.strictEqual(p.dueAt, undefined);
  assert.strictEqual(p.stage, undefined);
});
test('边界：今晚 23:00 到期的题，上午复习算“到期”，记住正常推进', function () {
  var q = newQ();
  q.stage = 0; q.dueAt = new Date(2026, 9, 28, 23, 0).getTime(); q.lastStudiedAt = T0 - DAY;
  var p = review.computeNext(q, 'remember', T0);
  assert.strictEqual(p.stage, 1);
  assert.strictEqual(p.dueAt, T0 + 3 * DAY);
});
test('边界：明天凌晨到期的题，今天提前背选记住不推进', function () {
  var q = newQ();
  q.stage = 0; q.dueAt = new Date(2026, 9, 29, 0, 30).getTime(); q.lastStudiedAt = T0 - DAY;
  var p = review.computeNext(q, 'remember', T0);
  assert.strictEqual(p.stage, undefined);
});

console.log('\n[今日待复习判定]');
test('dueForReview：今天到期与逾期为真，明天及以后、新题为假', function () {
  var due = { dueAt: new Date(2026, 9, 28, 23, 0).getTime() };
  var over = { dueAt: T0 - 3 * DAY };
  var tomorrow = { dueAt: T0 + DAY + 3600e3 };
  var fresh = { dueAt: null };
  assert.ok(review.dueForReview(due, T0));
  assert.ok(review.dueForReview(over, T0));
  assert.ok(!review.dueForReview(tomorrow, T0));
  assert.ok(!review.dueForReview(fresh, T0));
});

console.log('\n[本轮强化重现]');
function ses(ids, index, requeued) { return { ids: ids.slice(), index: index, requeued: requeued || [] }; }
test('忘记后隔 3 道其他题重现一次', function () {
  var s = ses(['a', 'b', 'c', 'd', 'e', 'f'], 1, []);   // 刚答完 a，下一题是 b
  assert.strictEqual(review.planRequeue(s, 'a'), true);
  assert.deepStrictEqual(s.ids, ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 0).concat(['a', 'b', 'c', 'd', 'a', 'e', 'f']));
  assert.deepStrictEqual(s.requeued, ['a']);
});
test('同一题最多重现一次', function () {
  var s = ses(['a', 'b', 'c', 'd', 'a', 'e'], 4, ['a']);  // 重现后再忘
  assert.strictEqual(review.planRequeue(s, 'a'), false);
  assert.deepStrictEqual(s.ids, ['a', 'b', 'c', 'd', 'a', 'e']);
});
test('剩余题量不足 3 道时不重现（留待明天）', function () {
  var s = ses(['a', 'b', 'c', 'd'], 3, []);   // 只剩 d 一题
  assert.strictEqual(review.planRequeue(s, 'a'), false);
  assert.deepStrictEqual(s.ids, ['a', 'b', 'c', 'd']);
});

console.log('\n测试结果：' + passed + ' 通过，' + failed + ' 失败\n');
process.exit(failed ? 1 : 0);
