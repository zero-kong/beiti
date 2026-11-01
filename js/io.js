/* JSON 导入导出：导出全部题库与进度；导入前预览数量，重复题选择保留或替换。 */
(function () {
  'use strict';
  var fileInput = null;

  function ensureInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) readAndPreview(file);
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }

  function pickImport() { ensureInput().click(); }

  /* ---------- 在线题库（同源 data/ 目录，部署后可用） ---------- */
  function pickOnline() {
    fetch('data/index.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (packs) {
      if (!Array.isArray(packs) || !packs.length) throw new Error('empty');
      var host = document.createElement('div');
      host.className = 'overlay';
      host.innerHTML =
        '<div class="sheet">' +
        '  <div class="sheet-title">从网站题库导入</div>' +
        '  <div class="sheet-desc">题包保存在本站 data/ 目录，导入前仍会预览数量</div>' +
        packs.map(function (p) {
          return '<button class="btn ghost block" data-pack="' + App.util.esc(p.file) + '">' + App.util.esc(p.name) + '</button>';
        }).join('') +
        '  <button class="btn ghost block" data-act="cancel">取消</button>' +
        '</div>';
      host.addEventListener('click', function (e) {
        if (e.target === host) { host.remove(); return; }
        var btn = e.target.closest('button');
        if (!btn) return;
        host.remove();
        if (btn.dataset.act === 'cancel') return;
        fetch('data/' + btn.dataset.pack).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }).then(function (text) {
          var parsed;
          try { parsed = App.store.parseImport(text); }
          catch (err) { App.ui.toast(err.message || '题包解析失败'); return; }
          if (!parsed.valid.length) { App.ui.toast('题包里没有可用题目'); return; }
          preview(parsed);
        }).catch(function () { App.ui.toast('题包获取失败'); });
      });
      document.body.appendChild(host);
    }).catch(function () {
      App.ui.toast('在线题库不可用（本地文件方式打开时请用“导入”选择 JSON 文件）');
    });
  }

  function exportFile() {
    if (!App.store.all().length) { App.ui.toast('题库为空，没有可导出的内容'); return; }
    var data = App.store.exportData();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '背题备份_' + App.util.fmtStamp() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    App.ui.toast('已导出 ' + data.questions.length + ' 题');
  }

  function readAndPreview(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = App.store.parseImport(reader.result);
      } catch (err) {
        App.ui.toast(err.message || '文件解析失败');
        return;
      }
      if (!parsed.valid.length) { App.ui.toast('文件里没有可用的题目（需要 question 与 answer 字段）'); return; }
      preview(parsed);
    };
    reader.onerror = function () { App.ui.toast('读取文件失败'); };
    reader.readAsText(file, 'utf-8');
  }

  function preview(parsed) {
    var r = App.store.analyzeImport(parsed.valid);
    var host = document.createElement('div');
    host.className = 'overlay';
    host.innerHTML =
      '<div class="dialog">' +
      '  <div class="dialog-title">导入预览</div>' +
      '  <div class="dialog-desc">' +
      '    文件共 ' + parsed.valid.length + ' 题：新增 ' + r.add.length + ' 题，与现有重复 ' + r.dup.length + ' 题' +
      (parsed.invalid ? '，另有 ' + parsed.invalid + ' 条格式不符已忽略' : '') + '.' +
      '  </div>' +
      (r.dup.length ? '<div class="dialog-desc">重复题选择“保留现有”将跳过，选择“替换”会用文件内容覆盖本地这道题。</div>' : '') +
      '  <div class="dialog-btns col">' +
      '    <button class="btn primary block" data-act="keep">保留现有' + (r.dup.length ? '（跳过重复）' : '') + '</button>' +
      (r.dup.length ? '<button class="btn danger block" data-act="replace">替换重复题</button>' : '') +
      '    <button class="btn ghost block" data-act="cancel">取消</button>' +
      '  </div>' +
      '</div>';
    host.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (e.target === host || !btn) return;
      var act = btn.dataset.act;
      host.remove();
      if (act === 'cancel') return;
      var mode = act === 'replace' ? 'replace' : 'keep';
      var res = App.store.applyImport(parsed.valid, mode);
      App.ui.toast('已导入：新增 ' + res.added + (res.replaced ? '，替换 ' + res.replaced : '') + (res.skipped ? '，跳过 ' + res.skipped : ''));
      App.ui.go('list');
      App.ui.render();
    });
    document.body.appendChild(host);
  }

  App.io = { pickImport: pickImport, pickOnline: pickOnline, exportFile: exportFile };
})();
