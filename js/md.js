/* 轻量 Markdown 渲染器（零依赖）：代码块（带语言标签、复制、简单高亮）、行内代码、
   加粗、斜体、列表、有序列表、标题、链接、引用、分隔线。
   输入先整体转义再做转换，防注入；未识别的语言不高亮、原样展示。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.App = root.App || {};
  root.App.md = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 代码高亮（保守策略） ---------- */
  function kwRe(words) {
    return '\\b(?:' + words.trim().split(/\s+/).map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')\\b';
  }

  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

  var LANGS = null;
  function langs() {
    if (LANGS) return LANGS;
    var clikeKw = kwRe(
      'abstract async await break case catch char class const continue debugger default delete do double ' +
      'double else enum export extends final finally float for function go if implements import in ' +
      'instanceof int interface let long new package private protected public return short static struct ' +
      'super switch synchronized this throw throws trait try typeof val var void while with yield true false null nil');
    var pyKw = kwRe('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self');
    var shKw = kwRe('if then else elif fi for while do done case esac function return in export local echo cd ls');
    LANGS = {
      clike: { re: new RegExp(
        '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +
        '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' +
        '|\\b(0x[\\da-fA-F]+|\\d+(?:\\.\\d+)?)\\b' +
        '|' + clikeKw, 'g') },
      python: { re: new RegExp(
        '(#[^\\n]*)' +
        '|("""[\\s\\S]*?"""|"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')' +
        '|\\b(\\d+(?:\\.\\d+)?)\\b' +
        '|' + pyKw, 'g') },
      sql: { re: new RegExp(
        '(--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)' +
        '|(\'(?:[^\'\\n]|\'\')*\'|"(?:[^"\\n]|"")*")' +
        '|\\b(\\d+(?:\\.\\d+)?)\\b' +
        '|\\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AND|OR|NOT|NULL|AS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|PRIMARY|KEY|FOREIGN|REFERENCES|ALTER|DROP|EXISTS|BETWEEN|LIKE|IN|UNION|CASE|WHEN|THEN|END)\\b', 'gi') },
      shell: { re: new RegExp(
        '(#[^\\n]*)' +
        '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\n]|\\\\.)*\')' +
        '|\\b(\\d+)\\b' +
        '|' + shKw, 'g') }
    };
    return LANGS;
  }

  var ALIAS = {
    js: 'clike', javascript: 'clike', ts: 'clike', typescript: 'clike', jsx: 'clike', tsx: 'clike',
    java: 'clike', c: 'clike', cpp: 'clike', 'c++': 'clike', cs: 'clike', csharp: 'clike',
    go: 'clike', rust: 'clike', rs: 'clike', kt: 'clike', kotlin: 'clike', swift: 'clike',
    php: 'clike', dart: 'clike', scala: 'clike',
    py: 'python', python: 'python', python3: 'python',
    sh: 'shell', bash: 'shell', shell: 'shell', zsh: 'shell', console: 'shell',
    sql: 'sql', mysql: 'sql', psql: 'sql', postgresql: 'sql'
  };

  function highlight(code, lang) {
    var conf = langs()[ALIAS[String(lang || '').toLowerCase()]];
    if (!conf) return esc(code);
    var html = '', last = 0, m;
    conf.re.lastIndex = 0;
    while ((m = conf.re.exec(code))) {
      html += esc(code.slice(last, m.index));
      var cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : 'tk-k';
      html += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    html += esc(code.slice(last));
    return html;
  }

  /* ---------- 行内 ---------- */
  function inline(s) {
    var t = esc(s);
    var codes = [];
    t = t.replace(/`([^`\n]+)`/g, function (all, c) {
      codes.push(c);
      return '\u0001' + (codes.length - 1) + '\u0001';
    });
    t = t.replace(/\*\*([^*\n](?:[^*]*[^*\n])?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\u0001(\d+)\u0001/g, function (all, i) {
      return '<code class="ic">' + codes[i] + '</code>';
    });
    return t;
  }

  /* ---------- 代码块 HTML ---------- */
  function blockHtml(lang, code) {
    return '<pre class="codeblk"><div class="blk-head"><span>' + esc(lang || '') + '</span>' +
      '<button class="copy" type="button">复制</button></div>' +
      '<code>' + highlight(code, lang) + '</code></pre>';
  }

  /* ---------- 主渲染 ---------- */
  function render(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');

    var blocks = [];
    text = text.replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g, function (all, lang, code) {
      blocks.push(blockHtml(lang, code.replace(/\n$/, '')));
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });

    var out = [], para = [], list = null, quote = [];

    function flushPara() {
      if (para.length) { out.push('<p>' + para.map(inline).join(' ') + '</p>'); para = []; }
    }
    function flushList() {
      if (list) { out.push('<' + list.tag + '>' + list.items.map(function (it) {
        return '<li>' + inline(it) + '</li>';
      }).join('') + '</' + list.tag + '>'); list = null; }
    }
    function flushQuote() {
      if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; }
    }
    function flushAll() { flushPara(); flushList(); flushQuote(); }

    text.split('\n').forEach(function (raw) {
      var line = raw;
      var blk = line.match(/^\u0000(\d+)\u0000$/);
      if (blk) { flushAll(); out.push(blocks[+blk[1]]); return; }
      if (/^\s*$/.test(line)) { flushAll(); return; }

      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushAll(); var lv = h[1].length + 1; out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); return; }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); return; }

      var q = line.match(/^>\s?(.*)$/);
      if (q) { flushPara(); flushList(); quote.push(q[1]); return; }

      var ul = line.match(/^\s*[-*+]\s+(.*)$/);
      var ol = line.match(/^\s*\d+[.、)]\s+(.*)$/);
      if (ul || ol) {
        flushPara(); flushQuote();
        var tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
        list.items.push((ul || ol)[1]);
        return;
      }

      flushList(); flushQuote();
      para.push(line.trim());
    });
    flushAll();
    return out.join('');
  }

  /* ---------- 复制按钮（事件委托，一次绑定） ---------- */
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return legacyCopy(txt); });
    }
    return Promise.resolve(legacyCopy(txt));
  }
  function legacyCopy(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  if (typeof document !== 'undefined' && !globalThis.__mdCopyBound) {
    globalThis.__mdCopyBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.codeblk .copy') : null;
      if (!btn) return;
      var pre = btn.closest('.codeblk');
      var code = pre && pre.querySelector('code');
      if (!code) return;
      copyText(code.textContent).then(function (ok) {
        btn.textContent = ok ? '已复制' : '复制失败';
        setTimeout(function () { btn.textContent = '复制'; }, 1500);
      });
    });
  }

  return { render: render, highlight: highlight, esc: esc, MONO: MONO };
});
