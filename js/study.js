/* 背诵页：一题一屏，先回忆再看答案，四档反馈，收藏，本轮完成后小结。 */
(function () {
  'use strict';
  var revealed = false;
  var keyHandler = null;

  /* 答案渲染：以“- ”开头的行作为要点列表，其余按段落 */
  function answerHtml(a) {
    var parts = String(a).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var out = '', bullets = [];
    parts.forEach(function (line) {
      if (line.slice(0, 2) === '- ') bullets.push(line.slice(2));
      else {
        if (bullets.length) { out += '<ul>' + bullets.map(function (b) { return '<li>' + App.util.esc(b) + '</li>'; }).join('') + '</ul>'; bullets = []; }
        out += '<p>' + App.util.esc(line) + '</p>';
      }
    });
    if (bullets.length) out += '<ul>' + bullets.map(function (b) { return '<li>' + App.util.esc(b) + '</li>'; }).join('') + '</ul>';
    return out || '<p></p>';
  }

  function render(root) {
    var cur = App.session.current();
    if (!cur) { App.ui.go('home'); return; }
    var ses = cur.session, q = cur.question;
    document.removeEventListener('keydown', keyHandler);

    var head =
      '<div class="study-top">' +
      '  <button class="icon-btn" id="btn-end" title="结束本轮">✕</button>' +
      '  <div class="study-mid">' +
      '    <span class="study-mode">' + (ses.mode === 'review' ? '到期复习' : '自由背题') + '</span>' +
      '    <span class="study-pos">' + cur.pos + ' / ' + cur.total + '</span>' +
      '  </div>' +
      '  <button class="icon-btn star' + (q.favorite ? ' on' : '') + '" id="btn-fav" title="收藏">' + (q.favorite ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="progress"><i style="width:' + Math.round((ses.index / ses.ids.length) * 100) + '%"></i></div>';

    var body =
      '<div class="study-main">' +
      '  <div class="card question-card">' +
      '    <div class="tag-line">' + q.tags.map(function (t) { return '<span class="chip tag">' + App.util.esc(t) + '</span>'; }).join('') + '</div>' +
      '    <div class="q-text">' + App.util.esc(q.question) + '</div>' +
      '  </div>' +
      '  <div class="card answer-card' + (revealed ? '' : ' hidden-card') + '">' +
      '    <div class="a-label">参考答案</div>' +
      '    <div class="a-text">' + answerHtml(q.answer) + '</div>' +
      (q.note ? '<div class="a-note"><b>备注</b>' + App.util.esc(q.note) + '</div>' : '') +
      (q.source ? '<a class="a-src" href="' + App.util.esc(q.source) + '" target="_blank" rel="noopener">来源链接 ↗</a>' : '') +
      '  </div>' +
      (revealed ? '' :
        '  <div class="try-hint">先在心里把答案讲一遍，再翻开对照</div>') +
      '</div>';

    var actions =
      '<div class="study-actions">' +
      (revealed
        ? '<div class="fb-row">' +
          '  <button class="fb forgot" data-fb="forgot"><b>忘记</b><span>明天重来</span></button>' +
          '  <button class="fb fuzzy" data-fb="fuzzy"><b>模糊</b><span>明天再背</span></button>' +
          '  <button class="fb remember" data-fb="remember"><b>记住</b><span>进入下一间隔</span></button>' +
          '</div>' +
          '<button class="peek-btn" data-fb="peek">刚才没回忆，先看看（不算记住）</button>'
        : '<button class="btn primary block lg" id="btn-reveal">显示答案</button>') +
      '</div>';

    root.innerHTML = '<div class="study-page">' + head + body + actions + '</div>';
    bind(root, ses, q);
    if (revealed) {
      var main = root.querySelector('.study-main');
      if (main) main.scrollTop = 0;
    }
  }

  function bind(root, ses, q) {
    var revealBtn = root.querySelector('#btn-reveal');
    if (revealBtn) revealBtn.onclick = function () {
      revealed = true;
      render(root);
    };

    var favBtn = root.querySelector('#btn-fav');
    if (favBtn) favBtn.onclick = function () {
      App.store.toggleFavorite(q.id);
      render(root);
    };

    root.querySelector('#btn-end').onclick = async function () {
      var ok = await App.ui.confirmDialog({
        title: '结束本轮？', desc: '进度已自动保存，之后可从首页“继续上次”接着背。',
        okText: '结束本轮'
      });
      if (ok) { App.session.finish(); App.ui.go('home'); }
    };

    root.querySelectorAll('[data-fb]').forEach(function (btn) {
      btn.onclick = function () { submit(root, btn.dataset.fb); };
    });

    keyHandler = function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.key === 'Enter') {
        if (!revealed) { e.preventDefault(); revealed = true; render(root); }
        return;
      }
      if (!revealed) return;
      var map = { '1': 'forgot', '2': 'fuzzy', '3': 'remember', '0': 'peek' };
      if (map[e.key]) submit(root, map[e.key]);
    };
    document.addEventListener('keydown', keyHandler);
  }

  function submit(root, feedback) {
    if (!App.session.active()) { App.ui.go('home'); return; }
    var res = App.session.answer(feedback);
    if (feedback === 'forgot' && res.requeued) App.ui.toast('这题会在 3 题后再次出现');
    if (res.done) { renderFinish(root); return; }
    revealed = false;
    render(root);
  }

  function renderFinish(root) {
    document.removeEventListener('keydown', keyHandler);
    var ses = App.store.get().session;   // 已答完的会话仍在存储里，直接取统计
    var counts = (ses && ses.counts) || { remember: 0, fuzzy: 0, forgot: 0, peek: 0 };
    App.session.finish();
    root.innerHTML =
      '<div class="study-page done-page">' +
      '  <div class="done-box">' +
      '    <div class="done-emoji">🎉</div>' +
      '    <div class="done-title">本轮完成</div>' +
      '    <div class="done-stats">' +
      '      <span class="fb-chip remember">记住 ' + counts.remember + '</span>' +
      '      <span class="fb-chip fuzzy">模糊 ' + counts.fuzzy + '</span>' +
      '      <span class="fb-chip forgot">忘记 ' + counts.forgot + '</span>' +
      '      <span class="fb-chip peek">先看看 ' + counts.peek + '</span>' +
      '    </div>' +
      (counts.forgot ? '<div class="done-note">忘记的题目明天会出现在“今日待复习”里</div>' : '') +
      '    <button class="btn primary block" id="btn-home">返回首页</button>' +
      '  </div>' +
      '</div>';
    root.querySelector('#btn-home').onclick = function () { App.ui.go('home'); };
  }

  App.ui.register('study', function (root) { revealed = false; render(root); });
  App.studyDispose = function () { document.removeEventListener('keydown', keyHandler); };
  App.studyInternal = { render: render };   // 供调试
})();
