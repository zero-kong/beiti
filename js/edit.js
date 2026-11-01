/* 添加 / 编辑题目页：题目、答案必填；学科分类（三级）选填；来源链接与备注选填。
   编辑不重置进度。页面不再提供标签录入（题库已按目录树组织，标签字段仅存量保留）。 */
(function () {
  'use strict';
  var catPicked = [];   // 学科分类路径（最多 3 级）

  function render(root, params) {
    var q = params.id ? App.store.byId(params.id) : null;
    catPicked = q && q.category ? q.category.slice() : [];
    var isEdit = !!q;

    root.innerHTML =
      '<div class="edit-page">' +
      '  <div class="study-top">' +
      '    <button class="icon-btn" id="btn-back">←</button>' +
      '    <div class="study-mid"><span class="study-mode">' + (isEdit ? '编辑题目' : '添加题目') + '</span></div>' +
      '    <button class="icon-btn" style="visibility:hidden">·</button>' +
      '  </div>' +
      '  <div class="study-main">' +
      '    <label class="field"><span>题目 <i>*</i></span>' +
      '      <textarea id="f-question" rows="3" placeholder="例如：HashMap 的 put 流程是什么？">' + App.util.esc(q ? q.question : '') + '</textarea>' +
      '    </label>' +
      '    <label class="field"><span>参考答案 <i>*</i></span>' +
      '      <textarea id="f-answer" rows="8" placeholder="支持 Markdown：&#10;- 要点一&#10;- 要点二，可 **加粗**、`行内代码`&#10;```java&#10;// 整块代码展示&#10;```&#10;篇幅以面试中能口头复述为准">' + App.util.esc(q ? q.answer : '') + '</textarea>' +
      '    </label>' +
      '    <div class="field"><span>学科分类（选填，最多三级）</span>' +
      '      <div class="cat-edit" id="cat-edit"></div>' +
      '    </div>' +
      '    <label class="field"><span>来源链接（选填）</span>' +
      '      <input id="f-source" type="url" placeholder="https://…" value="' + App.util.esc(q ? q.source : '') + '">' +
      '    </label>' +
      '    <label class="field"><span>个人备注（选填）</span>' +
      '      <textarea id="f-note" rows="3" placeholder="自己的记忆钩子、口误提醒等">' + App.util.esc(q ? q.note : '') + '</textarea>' +
      '    </label>' +
      (isEdit
        ? '<button class="btn danger ghost-danger block" id="btn-del">删除这道题</button>' +
          '<div class="form-hint">编辑内容不会重置这道题的复习进度</div>'
        : '') +
      '  </div>' +
      '  <div class="study-actions"><button class="btn primary block lg" id="btn-save">保存</button></div>' +
      '</div>';

    bind(root, q);
  }

  /* ---------- 学科分类选择器 ---------- */
  function renderCat(root) {
    var box = root.querySelector('#cat-edit');
    if (!box) return;
    var depth = catPicked.length;
    var tree = App.store.categoryTree();

    var html = '<div class="picked-cats">' +
      (catPicked.length
        ? catPicked.map(function (c, i) {
            return '<span class="chip catc">' + App.util.esc(c) +
              (i === catPicked.length - 1 ? '<button type="button" data-catrm="1">×</button>' : '') + '</span>';
          }).join('') + '<span class="chip catc subtle">第 ' + catPicked.length + ' 级</span>'
        : '<span class="chip catc subtle">未设置（将归入未分类）</span>') +
      (catPicked.length ? '<button type="button" class="fchip sm" data-catreset="1">重置</button>' : '') +
      '</div>';

    if (depth < 3) {
      var opts = depth === 0 ? tree.roots : (tree.subs[catPicked.join('|')] || []);
      if (opts.length) {
        html += '<div class="chip-row cat in-form">' +
          opts.map(function (o) {
            return '<button type="button" class="fchip" data-catpick="' + App.util.esc(o) + '">' + App.util.esc(o) + '</button>';
          }).join('') + '</div>';
      }
      html += '<input id="f-cat" placeholder="自定义第 ' + (depth + 1) + ' 级，回车添加">';
    }
    box.innerHTML = html;
  }

  function bindCat(root) {
    var box = root.querySelector('#cat-edit');
    if (!box) return;
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-catrm]')) catPicked = catPicked.slice(0, -1);
      if (e.target.closest('[data-catreset]')) catPicked = [];
      var pick = e.target.closest('[data-catpick]');
      if (pick && catPicked.length < 3) {
        catPicked = catPicked.slice();
        catPicked[catPicked.length] = pick.dataset.catpick;   // 追加为当前深度
      }
      renderCat(root);
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('#f-cat');
      if (!input) return;
      e.preventDefault();
      var v = input.value.trim();
      if (v && catPicked.length < 3) { catPicked.push(v); renderCat(root); }
    });
  }

  function bind(root, q) {
    renderCat(root);
    bindCat(root);

    root.querySelector('#btn-back').onclick = function () {
      if (history.length > 1) history.back(); else App.ui.go('list');
    };

    root.querySelector('#btn-save').onclick = function () {
      var question = root.querySelector('#f-question').value.trim();
      var answer = root.querySelector('#f-answer').value.trim();
      if (!question) { App.ui.toast('题目不能为空'); return; }
      if (!answer) { App.ui.toast('参考答案不能为空'); return; }
      var data = {
        question: question, answer: answer, category: catPicked.slice(),
        source: root.querySelector('#f-source').value.trim(),
        note: root.querySelector('#f-note').value.trim()
      };
      if (q) App.store.updateContent(q.id, data);
      else App.store.addQuestion(data);
      App.ui.toast(q ? '已保存' : '已添加');
      App.ui.go('list');
    };

    var del = root.querySelector('#btn-del');
    if (del) del.onclick = async function () {
      var ok = await App.ui.confirmDialog({
        title: '删除这道题？', desc: '题目与它的背诵进度都会删除。',
        okText: '删除', danger: true
      });
      if (!ok) return;
      App.store.removeQuestion(q.id);
      App.ui.toast('已删除');
      App.ui.go('list');
    };
  }

  App.ui.register('edit', render);
})();
