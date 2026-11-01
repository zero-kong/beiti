/* 背题 · 云同步 API：MySQL 存储 + 静态托管。
   凭据与令牌只放在本目录 config.local.json（已 gitignore），绝不入库。

   端点（均需 Authorization: Bearer <token>，除 health）：
   - GET  /api/health        探活
   - POST /api/pull          {since}  → {serverTime, questions}  增量拉取（含墓碑）
   - POST /api/push          {questions, deleted} → {ok, accepted}  上行合并（updated_at 新者胜）

   同时托管仓库根目录的静态文件，可单机一体化部署：
   node server.js → http://<主机>:8790/
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.local.json'), 'utf8'));
const PORT = config.port || 8790;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const pool = mysql.createPool(Object.assign({
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 4
}, config.db));

/* ---------- 建表 ---------- */
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id VARCHAR(64) PRIMARY KEY,
      question TEXT NOT NULL,
      answer MEDIUMTEXT NOT NULL,
      category VARCHAR(255) NOT NULL DEFAULT '',
      tags VARCHAR(1024) NOT NULL DEFAULT '[]',
      source VARCHAR(1024) DEFAULT '',
      note TEXT,
      favorite TINYINT(1) DEFAULT 0,
      stage INT DEFAULT -1,
      due_at BIGINT NULL,
      last_feedback VARCHAR(16) NULL,
      last_studied_at BIGINT NULL,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0,
      deleted TINYINT(1) DEFAULT 0,
      KEY idx_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/* ---------- 工具 ---------- */
function toRow(q) {
  return [
    String(q.id).slice(0, 64),
    String(q.question || ''),
    String(q.answer || ''),
    (Array.isArray(q.category) ? q.category : []).join('|').slice(0, 255),
    JSON.stringify(Array.isArray(q.tags) ? q.tags : []).slice(0, 1024),
    String(q.source || '').slice(0, 1024),
    String(q.note || ''),
    q.favorite ? 1 : 0,
    typeof q.stage === 'number' ? q.stage : -1,
    typeof q.dueAt === 'number' ? q.dueAt : null,
    q.lastFeedback || null,
    typeof q.lastStudiedAt === 'number' ? q.lastStudiedAt : null,
    typeof q.createdAt === 'number' ? q.createdAt : 0,
    typeof q.updatedAt === 'number' ? q.updatedAt : 0
  ];
}
const COLS = ['id', 'question', 'answer', 'category', 'tags', 'source', 'note', 'favorite',
              'stage', 'due_at', 'last_feedback', 'last_studied_at', 'created_at', 'updated_at'];

function fromRow(r) {
  return {
    id: r.id, question: r.question, answer: r.answer,
    category: r.category ? r.category.split('|').filter(Boolean) : [],
    tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch (e) { return []; } })(),
    source: r.source || '', note: r.note || '',
    favorite: !!r.favorite, stage: r.stage, dueAt: r.due_at,
    lastFeedback: r.last_feedback, lastStudiedAt: r.last_studied_at,
    createdAt: r.created_at, updatedAt: r.updated_at, deleted: !!r.deleted
  };
}

function authOk(req) {
  const h = req.headers['authorization'] || '';
  const token = h.replace(/^Bearer\s+/i, '');
  return token && token === config.token;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0; const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > (limit || 20 * 1024 * 1024)) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

/* ---------- 业务 ---------- */
async function handlePull(body) {
  const since = Number.isFinite(body && body.since) ? Number(body.since) : 0;
  // >= 而不是 >：存量迁移行 updated_at 为 0，首拉（since=0）也要能拉到
  const [rows] = await pool.query('SELECT * FROM questions WHERE updated_at >= ? ORDER BY updated_at', [since]);
  return { serverTime: Date.now(), questions: rows.map(fromRow) };
}

async function handlePush(body) {
  const qs = Array.isArray(body && body.questions) ? body.questions : [];
  const deleted = Array.isArray(body && body.deleted) ? body.deleted : [];
  let accepted = 0;

  // upsert：updated_at 新者胜（同条记录多设备并发时不回退）；分批多值插入，远程库一次往返
  const valid = qs.filter(q => q && q.id && q.question && q.answer);
  const placeholders = '(' + COLS.map(() => '?').join(', ') + ')';
  const guard = COLS.map(function (c) {
    if (c === 'id') return null;
    return c + ' = IF(VALUES(updated_at) >= updated_at, VALUES(' + c + '), ' + c + ')';
  }).filter(Boolean).join(', ');
  const sqlHead = 'INSERT INTO questions (' + COLS.join(', ') + ') VALUES ';
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const params = [];
    chunk.forEach(function (q) {
      params.push.apply(params, toRow(q));
    });
    await pool.query(sqlHead + chunk.map(() => placeholders).join(', ') +
                    ' ON DUPLICATE KEY UPDATE ' + guard, params);
    accepted += chunk.length;
  }
  if (deleted.length) {
    const now = Date.now();
    for (let i = 0; i < deleted.length; i += 100) {
      const ids = deleted.slice(i, i + 100).map(id => String(id).slice(0, 64));
      await pool.query('UPDATE questions SET deleted = 1, updated_at = ? WHERE id IN (' +
                       ids.map(() => '?').join(',') + ')', [now].concat(ids));
    }
  }
  return { ok: true, accepted: accepted, tombstoned: deleted.length };
}

/* ---------- 静态托管 ---------- */
function serveStatic(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file.startsWith(path.join(ROOT, 'api'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

/* ---------- 服务器 ---------- */
const server = http.createServer(async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (req.url.split('?')[0] === '/api/health') return json(res, 200, { ok: true, time: Date.now() });

  if (req.url.split('?')[0].startsWith('/api/')) {
    if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
    try {
      const body = req.method === 'POST' ? JSON.parse(await readBody(req) || '{}') : {};
      if (req.url.split('?')[0] === '/api/pull') return json(res, 200, await handlePull(body));
      if (req.url.split('?')[0] === '/api/push') return json(res, 200, await handlePush(body));
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});

ensureSchema().then(function () {
  server.listen(PORT, function () {
    console.log('API + 静态站点: http://127.0.0.1:' + PORT + '/  （数据库 ' + config.db.host + '/' + config.db.database + '）');
  });
}).catch(function (e) {
  console.error('数据库初始化失败:', e.message);
  process.exit(1);
});
