/* 数据层：localStorage 持久化、题目 CRUD、筛选统计、导入导出的合并逻辑。 */
(function () {
  'use strict';
  var KEY = 'beiti.v1';
  var state = null;

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function get() {
    if (!state) {
      try {
        var raw = localStorage.getItem(KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.questions)) {
          state = parsed;
          state.session = state.session || null;
        }
      } catch (e) { /* 损坏数据当作首次使用 */ }
      if (!state) {
        state = { version: 1, questions: seedQuestions(), session: null };
        persist();
      }
    }
    return state;
  }

  /* ---------- 题目 ---------- */
  function all() { return get().questions; }

  function byId(id) {
    return all().find(function (q) { return q.id === id; }) || null;
  }

  function addQuestion(data) {
    var q = {
      id: data.id || App.util.uid(),
      question: data.question,
      answer: data.answer,
      tags: Array.isArray(data.tags) ? data.tags.filter(Boolean).map(String) : [],
      source: data.source || '',
      note: data.note || '',
      favorite: !!data.favorite,
      stage: typeof data.stage === 'number' ? data.stage : -1,
      dueAt: typeof data.dueAt === 'number' ? data.dueAt : null,
      lastFeedback: data.lastFeedback || null,
      lastStudiedAt: typeof data.lastStudiedAt === 'number' ? data.lastStudiedAt : null,
      createdAt: data.createdAt || Date.now()
    };
    get().questions.push(q);
    persist();
    return q;
  }

  /* 编辑只改内容字段，不重置进度 */
  function updateContent(id, patch) {
    var q = byId(id);
    if (!q) return null;
    if (patch.question !== undefined) q.question = patch.question;
    if (patch.answer !== undefined) q.answer = patch.answer;
    if (patch.tags !== undefined) q.tags = patch.tags;
    if (patch.source !== undefined) q.source = patch.source;
    if (patch.note !== undefined) q.note = patch.note;
    persist();
    return q;
  }

  function toggleFavorite(id) {
    var q = byId(id);
    if (!q) return null;
    q.favorite = !q.favorite;
    persist();
    return q;
  }

  function removeQuestion(id) {
    var s = get();
    var before = s.questions.length;
    s.questions = s.questions.filter(function (q) { return q.id !== id; });
    /* 本轮队列里同步移除，避免背诵时撞到已删除的题 */
    if (s.session) {
      var idx = s.session.ids.indexOf(id);
      if (idx !== -1) {
        s.session.ids.splice(idx, 1);
        if (idx < s.session.index) s.session.index--;
        var rq = s.session.requeued.indexOf(id);
        if (rq !== -1) s.session.requeued.splice(rq, 1);
      }
    }
    persist();
    return s.questions.length < before;
  }

  /* ---------- 筛选与统计 ---------- */
  function allTags() {
    var freq = {};
    all().forEach(function (q) {
      q.tags.forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
    });
    return Object.keys(freq).sort(function (a, b) {
      return freq[b] - freq[a] || a.localeCompare(b, 'zh');
    });
  }

  function filterQuestions(opts) {
    opts = opts || {};
    var kw = (opts.search || '').trim().toLowerCase();
    var tags = opts.tags || [];
    var favOnly = !!opts.favOnly;
    return all().filter(function (q) {
      if (favOnly && !q.favorite) return false;
      if (tags.length && !q.tags.some(function (t) { return tags.indexOf(t) !== -1; })) return false;
      if (kw) {
        var hay = (q.question + '\n' + q.answer + '\n' + q.tags.join(' ')).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  function dueList(now) {
    now = now == null ? Date.now() : now;
    return all()
      .filter(function (q) { return App.review.dueForReview(q, now); })
      .sort(function (a, b) { return a.dueAt - b.dueAt; });
  }

  function counts(now) {
    now = now == null ? Date.now() : now;
    var qs = all();
    return {
      total: qs.length,
      studied: qs.filter(function (q) { return q.lastStudiedAt != null; }).length,
      favorite: qs.filter(function (q) { return q.favorite; }).length,
      dueToday: dueList(now).length
    };
  }

  /* ---------- 导入导出 ---------- */
  function exportData() {
    return {
      format: 'beiti-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      questions: JSON.parse(JSON.stringify(all()))
    };
  }

  /* 解析文件内容：接受完整备份对象或纯题目数组；逐条规范化并挑出非法行 */
  function parseImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('不是有效的 JSON 文件'); }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
    if (!list) throw new Error('文件里没有题目列表（需要 questions 数组）');
    var valid = [], invalid = 0;
    list.forEach(function (item) {
      if (!item || typeof item !== 'object') { invalid++; return; }
      var question = String(item.question || '').trim();
      var answer = String(item.answer || '').trim();
      if (!question || !answer) { invalid++; return; }
      valid.push({
        id: typeof item.id === 'string' && item.id ? item.id : App.util.uid(),
        question: question,
        answer: answer,
        tags: Array.isArray(item.tags) ? item.tags.filter(function (t) { return t != null && t !== ''; }).map(String) : [],
        source: item.source != null ? String(item.source) : '',
        note: item.note != null ? String(item.note) : '',
        favorite: !!item.favorite,
        stage: typeof item.stage === 'number' && item.stage >= -1 && item.stage <= 4 ? Math.floor(item.stage) : -1,
        dueAt: typeof item.dueAt === 'number' && item.dueAt > 0 ? item.dueAt : null,
        lastFeedback: item.lastFeedback || null,
        lastStudiedAt: typeof item.lastStudiedAt === 'number' && item.lastStudiedAt > 0 ? item.lastStudiedAt : null,
        createdAt: typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : Date.now()
      });
    });
    return { valid: valid, invalid: invalid };
  }

  /* 预览：区分新增与同标识重复，由用户选择保留现有或替换 */
  function analyzeImport(items) {
    var add = [], dup = [];
    items.forEach(function (it) { (byId(it.id) ? dup : add).push(it); });
    return { add: add, dup: dup };
  }

  function applyImport(items, mode) {
    var s = get();
    var added = 0, replaced = 0, skipped = 0;
    items.forEach(function (it) {
      var existing = byId(it.id);
      if (!existing) { s.questions.push(it); added++; }
      else if (mode === 'replace') {
        var i = s.questions.indexOf(existing);
        s.questions[i] = it;
        replaced++;
      } else { skipped++; }
    });
    if (added || replaced) persist();
    return { added: added, replaced: replaced, skipped: skipped };
  }

  function clearAll() {
    var s = get();
    s.questions = [];
    s.session = null;
    persist();
  }

  function save() { persist(); }

  App.store = {
    get: get, all: all, byId: byId,
    addQuestion: addQuestion, updateContent: updateContent,
    toggleFavorite: toggleFavorite, removeQuestion: removeQuestion,
    allTags: allTags, filterQuestions: filterQuestions,
    dueList: dueList, counts: counts,
    exportData: exportData, parseImport: parseImport,
    analyzeImport: analyzeImport, applyImport: applyImport,
    clearAll: clearAll, save: save
  };

  /* ---------- 首批示例题目（可在题库里编辑或删除） ---------- */
  function seedQuestions() {
    var now = Date.now();
    function seed(question, answer, tags) {
      return {
        id: App.util.uid(), question: question, answer: answer,
        tags: tags, source: '', note: '', favorite: false,
        stage: -1, dueAt: null, lastFeedback: null, lastStudiedAt: null, createdAt: now
      };
    }
    return [
      seed('HashMap 的 put 流程与扩容机制是什么？',
        '- 对 key 的 hash 做高 16 位异或扰动，定位到桶\n- 桶为空直接放入；否则遍历链表或红黑树，equals 相同则覆盖，不同则尾插\n- 链表长度达到 8 且数组长度达到 64 时树化，避免退化为 O(n) 查找\n- 元素超过容量 × 0.75（负载因子）时扩容为原来的 2 倍并重新分布\n- JDK 8 重新分布时元素要么留原下标，要么移动到原下标 + 旧容量', ['Java', '示例']),
      seed('JVM 如何判断一个对象可以被回收？',
        '- 主流做法是可达性分析：从 GC Roots 出发不可达的对象判定可回收\n- GC Roots 包括栈上局部变量、静态变量、常量引用、JNI 引用等\n- 软、弱、虚引用提供不同强度的回收时机\n- 不可达对象至少经过两次标记才会真正回收，finalize 只会执行一次\n- 收集器按分代假设工作：新生代复制算法，老年代标记清除或标记整理', ['Java', '示例']),
      seed('synchronized 的锁升级过程是怎样的？',
        '- 对象头 Mark Word 记录锁状态：无锁 → 偏向锁 → 轻量级锁 → 重量级锁\n- 同一线程重复获取时进入偏向锁，只有发生竞争撤销时才有开销\n- 出现第二个线程竞争就升级为轻量级锁，在线程栈上通过 CAS 自旋获取\n- 自旋失败或竞争加剧则膨胀为重量级锁，依赖操作系统互斥量\n- 锁只能升级不能降级，JDK 15 起偏向锁默认废弃', ['Java', '示例']),
      seed('线上接口突然变慢，你会怎么排查？',
        '- 前提：先看监控确定范围，是个别接口、整个应用，还是某个依赖\n- 应用层：线程池是否打满、GC 停顿、大对象、锁竞争、慢日志\n- 依赖层：下游 RPC 超时、缓存命中率下降、数据库慢 SQL 与锁等待\n- 流量层：是否有突增、重试风暴、慢查询拖垮连接池\n- 方案：先限流降级扩容止血，恢复后再做根因修复与压测回归', ['高并发', '示例']),
      seed('如何设计一个秒杀系统？',
        '- 前提：读多写少、库存少、瞬时流量极高，核心是不让多余流量打到数据库\n- 方案：前端按钮防抖、CDN 静态化、网关限流、答题验证码削峰\n- 库存预热到 Redis，用 Lua 或原子操作扣减防止超卖\n- 异步下单：请求进 MQ 排队，数据库只处理最终成功的事务\n- 取舍：牺牲部分实时性换稳定性；兜底用对账与超时回补保证最终一致', ['高并发', '示例']),
      seed('useState 的闭包陷阱是什么，怎么解决？',
        '- state 是那次渲染的快照，setState 后并不会立刻改变当前作用域里的变量\n- 在定时器、异步回调里读 state，拿到的是创建回调那次渲染的旧值\n- 解决一：函数式更新 setX(prev => ...)，不依赖外部旧值\n- 解决二：把最新值放进 useRef，回调中读 ref.current\n- 连续计算优先用函数式更新，需要副作用里拿最新值就用 ref', ['React', '示例']),
      seed('列表渲染为什么要用 key？',
        '- diff 通过 key 判断是不是同一个节点，从而复用 DOM 和组件状态\n- 用数组索引当 key，在插入、删除、排序时会错位复用，出现状态串扰\n- 稳定唯一的 id 是最佳实践；key 只要求兄弟节点间唯一\n- key 变化会触发卸载重建并重置 state，也可以借它强制重置组件', ['React', '示例']),
      seed('说说事件循环里宏任务与微任务的执行顺序',
        '- 每轮循环：执行一个宏任务，然后清空整个微任务队列，之后才可能渲染\n- 微任务：Promise.then、queueMicrotask、MutationObserver\n- 宏任务：setTimeout / setInterval、I/O、UI 事件等\n- async 函数 await 之后的代码会进入微任务队列\n- 经典结论：同一轮里所有微任务先于下一个宏任务执行', ['ES6', '示例']),
      seed('ReAct 模式是什么，为什么比纯 Prompt 问答好？',
        '- 前提：大模型单次直接回答复杂问题容易漏步骤、产生幻觉\n- 方案：按 Thought → Action（工具调用）→ Observation 循环推进\n- 每步只解决一个小问题，用工具拿到真实数据再下结论\n- 中间过程可观察、可中断、可纠错，失败时根据观察调整策略重试\n- 取舍：轮数和时延变多，但答案可靠性和可追溯性明显更好', ['Agent', '示例']),
      seed('大模型工具调用失败了怎么处理？',
        '- 参数校验失败：把具体错误回传给模型，让它基于报错重新生成参数\n- 执行超时或异常：设置超时与重试上限，超限后走降级路径\n- 结果过大：先截断或摘要再回传，控制上下文长度\n- 模型调用了不存在的工具：在提示中给出工具清单并约束输出格式\n- 记录完整调用链与失败原因，方便复盘和评估改进', ['Agent', '示例'])
    ];
  }
})();
