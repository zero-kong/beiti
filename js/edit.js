/* 添加 / 编辑题目页：题目、答案必填；标签可多个；来源链接与备注选填。编辑不重置进度。 */
(function () {
  'use strict';
  var picked = [];   // 已选标签

  function render(root, params) {
    var q = params.id ? App.store.byId(params.id) : null;
    picked = q ? q.tags.slice() : [];
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
      '    <div class="field"><span>标签（选填，可多个）</span>' +
      '      <div class="tag-edit">' +
      '        <div class="picked-tags" id="picked"></div>' +
      '        <input id="f-tag" placeholder="输入后按回车添加">' +
      '      </div>' +
      '      <div class="suggest" id="suggest"></div>' +
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

  function renderTags(root) {
    root.querySelector('#picked').innerHTML = picked.map(function (t) {
      return '<span class="chip tag picked">' + App.util.esc(t) + '<button data-rm="' + App.util.esc(t) + '">×</button></span>';
    }).join('');
    var existing = App.store.allTags().filter(function (t) { return picked.indexOf(t) === -1; });
    root.querySelector('#suggest').innerHTML = existing.length
      ? '可选：' + existing.slice(0, 12).map(function (t) {
          return '<button class="fchip sm" data-add="' + App.util.esc(t) + '">' + App.util.esc(t) + '</button>';
        }).join(' ')
      : '';
  }

  function bind(root, q) {
    renderTags(root);

    root.querySelector('#btn-back').onclick = function () {
      if (history.length > 1) history.back(); else App.ui.go('list');
    };

    var tagInput = root.querySelector('#f-tag');
    tagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagInput.value.trim());
        tagInput.value = '';
      }
    });

    root.querySelector('.tag-edit').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]');
      if (rm) {
        picked = picked.filter(function (t) { return t !== rm.dataset.rm; });
        renderTags(root);
      }
    });
    root.querySelector('#suggest').addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      if (add) { addTag(add.dataset.add); renderTags(root); }
    });

    function addTag(t) {
      if (t && picked.indexOf(t) === -1) picked.push(t);
      renderTags(root);
    }

    root.querySelector('#btn-save').onclick = function () {
      var question = root.querySelector('#f-question').value.trim();
      var answer = root.querySelector('#f-answer').value.trim();
      if (!question) { App.ui.toast('题目不能为空'); return; }
      if (!answer) { App.ui.toast('参考答案不能为空'); return; }
      var data = {
        question: question, answer: answer, tags: picked.slice(),
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
