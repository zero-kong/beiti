/* 本地登录门禁：单用户（kongfang），密码以 SHA-256 摘要保存与比对。
   纯前端实现，作为个人隐私门禁——题库数据仍在浏览器本地，不能抵御有意绕过。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.App = root.App || {};
  root.App.auth = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var USERNAME = 'hellokk';
  var PASSWORD_SHA256 = 'df6492ed4943ee83cd4b1af2c41b7169031049a61e0d2221da1fedf4a86aa147';
  var KEY = 'beiti.auth.v1';
  var KEY_FAILS = 'beiti.auth.fails';
  var MAX_FAILS = 5, LOCK_MS = 30 * 1000;

  /* ---------- 纯 JS SHA-256（无依赖，file:// 与 https 均可用） ---------- */
  function sha256(input) {
    function rotr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var ascii = unescape(encodeURIComponent(String(input)));   // 先转 UTF-8 字节
    var maxWord = Math.pow(2, 32), length = ascii.length * 8;
    var words = [], result = '';
    var hash = [], k = [], isComposite = {}, primeCounter = 0;

    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((length / maxWord) | 0);
    words[words.length] = length;

    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var t1 = hash[7]
          + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (
              w[i - 16]
              + (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        var t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  /* ---------- 状态 ---------- */
  function lsGet(k) { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch (e) {} }

  function isAuthed() {
    try {
      var s = JSON.parse(lsGet(KEY));
      return !!s && s.u === USERNAME;
    } catch (e) { return false; }
  }

  function fails() {
    try { return JSON.parse(lsGet(KEY_FAILS)) || { n: 0, until: 0 }; }
    catch (e) { return { n: 0, until: 0 }; }
  }

  /* 返回 true=成功；字符串=失败原因 */
  function login(user, pass) {
    var f = fails();
    if (f.until > Date.now()) return '尝试次数过多，请 ' + Math.ceil((f.until - Date.now()) / 1000) + ' 秒后再试';
    if (String(user || '').trim() === USERNAME && sha256(String(pass || '')) === PASSWORD_SHA256) {
      lsSet(KEY, JSON.stringify({ u: USERNAME, t: Date.now() }));
      lsDel(KEY_FAILS);
      return true;
    }
    f.n = (f.n || 0) + 1;
    if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.n = 0; }
    lsSet(KEY_FAILS, JSON.stringify(f));
    return '用户名或密码不正确';
  }

  function logout() { lsDel(KEY); }

  /* ---------- 登录页 ---------- */
  function renderLogin(root) {
    var tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.style.display = 'none';
    document.body.classList.remove('has-tabbar');

    root.innerHTML =
      '<div class="login-page"><div class="login-box">' +
      '  <div class="login-logo">背题</div>' +
      '  <div class="login-sub">面试备考背诵 · 请先登录</div>' +
      '  <div class="card login-card">' +
      '    <label class="field"><span>用户名</span>' +
      '      <input id="login-user" autocomplete="username" autocapitalize="off">' +
      '    </label>' +
      '    <label class="field"><span>密码</span>' +
      '      <div class="pwd-box">' +
      '        <input id="login-pass" type="password" autocomplete="current-password">' +
      '        <button type="button" id="login-eye">显示</button>' +
      '      </div>' +
      '    </label>' +
      '    <div class="login-err" id="login-err"></div>' +
      '    <button class="btn primary block lg" id="login-btn">登 录</button>' +
      '  </div>' +
      '  <div class="login-tip">个人工具 · 数据保存在本设备浏览器</div>' +
      '</div></div>';

    var userInput = root.querySelector('#login-user');
    var passInput = root.querySelector('#login-pass');
    var errBox = root.querySelector('#login-err');
    var eyeBtn = root.querySelector('#login-eye');
    var btn = root.querySelector('#login-btn');

    eyeBtn.onclick = function () {
      var show = passInput.type === 'password';
      passInput.type = show ? 'text' : 'password';
      eyeBtn.textContent = show ? '隐藏' : '显示';
    };

    function submit() {
      var r = login(userInput.value, passInput.value);
      if (r === true) { App.ui.render(); return; }
      errBox.textContent = r;
      var card = root.querySelector('.login-card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }

    btn.onclick = submit;
    [userInput, passInput].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    userInput.focus();
  }

  return { isAuthed: isAuthed, login: login, logout: logout, renderLogin: renderLogin, sha256: sha256 };
});
