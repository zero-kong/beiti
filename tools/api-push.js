/* 应急工具：git 通道（github.com:443）不通但 api.github.com 可达时，经 API 创建提交并更新 main。
   用法：node tools/api-push.js（成功后自动 git fetch 并对齐本地指针） */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'zero-kong/beiti';
const ROOT = path.join(__dirname, '..');

function gh(endpoint, method, body) {
  const args = ['api', endpoint];
  if (method && method !== 'GET') args.push('--method', method);
  if (body) args.push('--input', '-');
  return JSON.parse(execFileSync('gh', args, {
    input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  }));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: ROOT }).trim();
}

function main() {
  const ref = gh(`repos/${REPO}/git/ref/heads/main`);
  const base = ref.object.sha;
  const local = git(['rev-parse', 'HEAD']);
  if (base === local) { console.log('远端已与本地一致，无需推送'); return; }
  const baseTree = gh(`repos/${REPO}/git/commits/${base}`).tree.sha;

  const files = git(['diff', '--name-only', '--diff-filter=ACMRT', base, local]).split('\n').filter(Boolean);
  if (!files.length) {
    // 只可能是删除或元数据差异，走强一致提醒
    const deleted = git(['diff', '--name-only', '--diff-filter=D', base, local]).split('\n').filter(Boolean);
    if (!deleted.length) { console.log('没有可同步的文件差异'); return; }
    throw new Error('包含删除操作，API 通道不支持，请开启代理后 git push');
  }
  console.log('待更新', files.length, '个文件:', files.join(', '));

  const tree = files.map(f => ({
    path: f,
    mode: '100644',
    type: 'blob',
    sha: gh(`repos/${REPO}/git/blobs`, 'POST', {
      content: fs.readFileSync(path.join(ROOT, f), 'utf8'),
      encoding: 'utf-8'
    }).sha
  }));
  const newTree = gh(`repos/${REPO}/git/trees`, 'POST', { base_tree: baseTree, tree });

  const message = git(['log', base + '..HEAD', '--pretty=%B']).split('\n\n')[0].trim();
  const commit = gh(`repos/${REPO}/git/commits`, 'POST', { message, tree: newTree.sha, parents: [base] });
  gh(`repos/${REPO}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: false });
  console.log('API 推送成功 →', commit.sha.slice(0, 7), commit.html_url);

  // 对齐本地指针；git 通道不可达时给出手工指引而不算失败
  try {
    git(['fetch', 'origin']);
    git(['reset', '-q', '--mixed', 'origin/main']);
    console.log('本地指针已对齐远端');
  } catch (e) {
    console.log('提示：git fetch 不可达，本地分支指针与远端不同（内容一致）。');
    console.log('代理恢复后执行：git fetch origin && git reset --mixed origin/main');
  }
}

try { main(); } catch (e) { console.error('失败:', e.message); process.exit(1); }
