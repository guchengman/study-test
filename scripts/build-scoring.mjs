/**
 * 判分逻辑「单一事实源」构建脚本（R4）
 *
 * 将 `src/shared/scoring/index.ts`（框架无关纯函数）编译为：
 *   1. `server/src/utils/examScoring.generated.js`  —— ESM，供 Node 端评分复用
 *   2. `chrome-extension/scoring.js`                —— IIFE，挂在 window.StudyScoring，供扩展 popup.js 引用
 *
 * 用法：npm run sync:scoring（已挂到 prebuild，构建前端时自动同步）
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src/shared/scoring/index.ts');

const serverOut = path.join(root, 'server/src/utils/examScoring.generated.js');
const extOut = path.join(root, 'chrome-extension/scoring.js');

const banner = '/* 本文件由 scripts/build-scoring.mjs 自动生成，请勿手动修改。修改请编辑 src/shared/scoring/index.ts 后重新生成。 */\n';

async function main() {
  // 1) 服务端 ESM
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: serverOut,
    banner: { js: banner },
    logLevel: 'info',
  });
  console.log('[build-scoring] generated', serverOut);

  // 2) 扩展端 IIFE（全局 StudyScoring）
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'StudyScoring',
    target: 'es2019',
    outfile: extOut,
    banner: { js: banner },
    logLevel: 'info',
  });
  console.log('[build-scoring] generated', extOut);
}

main().catch((err) => {
  console.error('[build-scoring] failed:', err);
  process.exit(1);
});
