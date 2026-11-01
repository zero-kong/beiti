# 背题 · 面试背诵

面向个人技术面试备考的手机背题工具。核心体验：**一题一屏 → 先回忆再看答案 → 三档自评 → 自动下一题**。按《面试背诵软件精简需求 v0.3》第一步范围实现（语音转写与 AI 评分属于第二步，暂未包含）。

纯静态 Web 应用：免构建、免账号、免服务器，数据保存在浏览器本地（localStorage），可离线背题。

## 运行

方式一（最简单）：直接双击 `index.html` 用浏览器打开。

方式二（推荐，手机上使用）：
```bash
node server.js          # 或任意静态服务器
# 电脑访问 http://localhost:8787
# 手机与电脑同一局域网时，访问 http://<电脑IP>:8787
```

长期使用建议部署到任意静态托管（GitHub Pages / Vercel / Netlify 等），把整个目录传上去即可；之后在手机浏览器里"添加到主屏幕"，即可像 App 一样全屏使用。

## 功能

- **登录**：单用户本地门禁（用户名 + 密码 SHA-256 校验，连错 5 次锁定 30 秒），登出在题库页 ⋯ 菜单。纯前端实现，防顺手翻看而非专业破解；账号信息见本地文件 `本地账号.txt`（不入库）。
- **首页**：今日待复习数量（含逾期）、开始复习、选择背诵（按学科目录挑专题开背）、自由背题、继续上次。
- **题库**：文件树列表（学科 → 分类 → 专题 逐级展开，文件夹显示题量、可一键"背"该目录）；搜索、只看收藏；勾选任意题目开背、背当前结果；添加/编辑/删除题目。
- **学科分类**：内置 Java（java基础/java集合/java并发/IO/JVM调优/java8新特性/spring/微服务）、Python、Agent 三个一级学科，数据库等在 `js/catalog.js` 追加即可；第三级来自题库数据，编辑题目时可选可自定义。
- **在线题库**：题包放在 `data/` 目录并在 `data/index.json` 登记，题库页 ⋯ → 从网站题库导入，一键预览并导入（部署后可用；file:// 打开时请用"导入"选 JSON 文件）。
- **背诵页**：翻卡显示答案；忘记 / 模糊 / 记住 三档自评 + 先看看；顺序或随机（选定后本轮固定）；收藏；本轮完成小结。桌面端支持快捷键：空格翻答案，1/2/3 忘记/模糊/记住，0 先看看。
- **复习规则**：默认间隔 1 → 3 → 7 → 14 → 30 天；模糊明天再来；忘记重置阶段并在本轮隔 3 题重现一次（仅一次，题量不足留待明天）；先看看不提高掌握程度（新题安排明天，旧题保持原到期状态）；当天重复背题不虚增阶段、不延长间隔。
- **数据**：统一 JSON 导入导出（含分类、标签、收藏、复习进度）；导入前预览数量，重复题可选保留现有或替换；清空前提示备份。

## 题目数据

每题两个必填字段：`question`（题目）、`answer`（参考答案，支持 Markdown：要点 `- ` 开头、代码块 ``` 包裹、**加粗**、`行内代码`）；选填：`category`（三级学科分类路径数组，如 `["Java","java集合","HashMap"]`）、`tags`（标签数组）、`source`（来源链接）、`note`（个人备注）。

导出文件格式：
```json
{
  "format": "beiti-backup",
  "version": 1,
  "exportedAt": "…",
  "questions": [
    {
      "id": "q_xxx", "question": "…", "answer": "- 要点1\n- 要点2",
      "category": ["Java", "java集合", "HashMap"],
      "tags": ["Java"], "source": "", "note": "", "favorite": false,
      "stage": 0, "dueAt": 1790000000000,
      "lastFeedback": "remember", "lastStudiedAt": 1790000000000, "createdAt": 1790000000000
    }
  ]
}
```
导入也接受纯题目数组。`stage` 为 -1（新题）至 4（对应间隔表下标），无标签也能导入。换设备时导出 → 在新设备导入即可迁移题库和进度。

首批内置 10 道示例题（Java / 高并发 / React / ES6 / Agent，标签含"示例"），可直接编辑或删除后录入自己的题。`data/` 目录另附在线题包：Java 面试题·八大专题（16 题）、Java 集合面试题（9 题，整理自 pdai）、Agent 开发高频装饰器（11 题）、Python 内置装饰器（10 题）。

## 目录结构

```
index.html        入口与底部导航
css/app.css       样式（手机优先，深色模式自适应）
js/util.js        工具函数（转义/日期/弹层基础）
js/review.js      复习引擎（间隔规则、本轮重现，纯逻辑）
js/store.js       数据层（localStorage、CRUD、导入导出合并、种子题）
js/session.js     本轮会话（队列、去重、推进、继续上次）
js/ui.js          路由、首页、弹层组件
js/list.js        题库页
js/study.js       背诵页
js/edit.js        添加/编辑表单
js/io.js          JSON 导入导出
test/run.js       复习规则单元测试（node test/run.js）
server.js         本地预览服务器（调试用）
```

## 测试

```bash
node test/run.js     # 16 项复习规则测试
```

## 暂缓项（需求第二步及以后）

- 背诵页语音转写与按需 AI 评分（页面已预留扩展点，不影响纯翻卡背诵）
- 账号体系与多端自动同步（当前用 JSON 导入导出迁移）
- 抖音/B 站/GitHub 自动抓取、模拟面试、知识图谱等

## 云端同步（MySQL）

题库数据可通过自建 API 同步到 MySQL，实现多设备共用一份进度。

- **架构**：静态页面 ←（API 地址 + 同步令牌）→ Node API（[api/server.js](api/server.js)）→ MySQL。**数据库密码只存在服务端** `api/config.local.json`（已 gitignore），前端与仓库里都没有。
- **同步语义**：启动自动拉取；增删改、背题自评后约 4 秒自动推送；按 `updated_at` 新者胜合并，删除通过墓碑传播到其他设备。也可在题库页 ⋯ → 云端同步里手动「立即同步」。
- **部署 API**（放在能连 MySQL 的服务器上）：
  ```bash
  # 服务器上（假设已装 Node ≥16）
  git clone https://github.com/zero-kong/beiti.git && cd beiti/api
  npm install
  cp config.example.json config.local.json   # 填入数据库地址/账号/密码，token 换成自己的随机长串
  node server.js                              # 默认 8790 端口，同时托管整个静态站点
  ```
  建议用 pm2 常驻：`pm2 start server.js --name beiti-api`。
- **各设备使用**：题库页 ⋯ → 云端同步，填 API 地址（如 `http://<服务器>:8790`）与令牌 → 立即同步。
- **注意**：GitHub Pages 是 https，浏览器会拦截对普通 http 公网地址的请求（混合内容）；因此手机建议直接访问 API 服务器托管的本站（`http://<服务器>:8790/`），电脑上 Pages 版可填 `http://localhost:8790` 联调。API 走令牌鉴权但传输是明文 http，介意的话给服务器配域名和 https。
