// 本地化 Tesseract OCR 资源准备脚本（Node ESM，使用 Node 22 原生 fetch，无额外依赖）。
//
// 用途：把离线 OCR 所需的 worker / WASM 核心 / 语言包全部放到 public/tesseract/，
//       彻底摆脱首次运行从 CDN 下载导致的无限卡死问题。
//
// 用法：node scripts/setup/tesseract-assets.mjs
//       （已通过 package.json 的 `npm run setup:tesseract` 暴露）

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 项目根目录（scripts/setup -> 上两级）
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'tesseract');

// 从本脚本位置解析 node_modules 中的资源
function resolveFromModules(relativePath) {
  return require.resolve(relativePath);
}

// 安全拷贝单个文件，并做存在性校验
function copyFileSafe(src, dest, label) {
  if (!fs.existsSync(src)) {
    throw new Error(`未找到 ${label}：${src}\n请确认依赖已安装（先执行 npm install）。`);
  }
  fs.copyFileSync(src, dest);
  const size = fs.statSync(dest).size;
  console.log(`  ✓ 已拷贝 ${label} -> ${path.relative(ROOT, dest)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  console.log('开始准备 Tesseract 本地资源...\n');

  // 1. 确保输出目录存在
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 2. 拷贝 Tesseract worker 脚本
  const workerSrc = resolveFromModules('tesseract.js/dist/worker.min.js');
  copyFileSafe(workerSrc, path.join(OUT_DIR, 'worker.min.js'), 'Tesseract worker');

  // 3. 拷贝 tesseract.js-core 下的核心文件（WASM 与 JS 绑定）
  const coreDir = path.dirname(resolveFromModules('tesseract.js-core/package.json'));
  const coreFiles = fs
    .readdirSync(coreDir)
    .filter((f) => f === 'index.js' || f.startsWith('tesseract-core'));
  if (coreFiles.length === 0) {
    throw new Error(
      `在 ${coreDir} 中未找到任何 tesseract-core* 文件，请确认 tesseract.js-core 已正确安装。`
    );
  }
  for (const f of coreFiles) {
    copyFileSafe(path.join(coreDir, f), path.join(OUT_DIR, f), `tesseract.js-core/${f}`);
  }

  // 4. 下载语言包（eng + chi_sim）。
  //    说明：离线 OCR 的“卡死”问题发生在【运行时】从 CDN 下载；
  //          此脚本是【构建/初始化期】一次性把语言包拉到本地 public/tesseract/，
  //          之后运行时完全不依赖网络。这里使用多个镜像依次尝试以提升成功率。
  const LANGS = ['eng', 'chi_sim'];
  // 镜像列表（按序尝试）：
  //   - jsDelivr 是 tesseract.js 官方默认语言数据源，最稳定，作为首选；
  //   - GitHub raw（naptha/tessdata）作为兜底，有时需要 ?raw=true 防止重定向。
  const MIRRORS = [
    (lang) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`,
    (lang) => `https://github.com/naptha/tessdata/raw/4.0.0/${lang}.traineddata.gz?raw=true`,
    (lang) => `https://raw.githubusercontent.com/naptha/tessdata/4.0.0/${lang}.traineddata.gz`,
  ];

  for (const lang of LANGS) {
    const fileName = `${lang}.traineddata.gz`;
    const outPath = path.join(OUT_DIR, fileName);

    // 已存在且大小合理则跳过，避免重复下载
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      const size = fs.statSync(outPath).size;
      console.log(`  • 已存在，跳过下载 ${fileName} (${(size / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }

    let downloaded = false;
    for (const makeUrl of MIRRORS) {
      const url = makeUrl(lang);
      console.log(`  正在下载 ${fileName} ...`);
      console.log(`    URL: ${url}`);
      try {
        // GitHub raw 有时需要 User-Agent 头
        const res = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'StudyTest-Tesseract-Setup', Accept: '*/*' },
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        // 流式写入：先把 Web ReadableStream 转成 Node Readable，再管道写入文件
        await new Promise((resolve, reject) => {
          const readStream = Readable.fromWeb(res.body);
          const writeStream = fs.createWriteStream(outPath);
          readStream.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          readStream.pipe(writeStream);
        });

        const size = fs.statSync(outPath).size;
        if (size < 1000) {
          // 语言包几乎不可能这么小，几乎一定是错误页面
          fs.unlinkSync(outPath);
          throw new Error(`下载到的 ${fileName} 文件过小（${size} 字节），可能不是有效语言包。`);
        }
        console.log(`  ✓ 已下载 ${fileName} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        downloaded = true;
        break;
      } catch (err) {
        // 清理可能残留的半成品文件，尝试下一个镜像
        if (fs.existsSync(outPath)) {
          try {
            fs.unlinkSync(outPath);
          } catch {
            /* 忽略清理失败 */
          }
        }
        console.warn(`    ⚠ 该镜像下载失败：${err.message}，尝试下一个镜像...`);
      }
    }

    if (!downloaded) {
      console.error(`\n❌ 所有镜像均无法下载语言包 ${fileName}。`);
      console.error('请检查网络，或手动将语言包放入 public/tesseract/ 后重试。');
      process.exit(1);
    }
  }

  // 5. 打印结果
  const files = fs.readdirSync(OUT_DIR);
  console.log('\nTesseract 资源已就绪：public/tesseract/');
  console.log('文件列表：');
  for (const f of files) {
    const size = fs.statSync(path.join(OUT_DIR, f)).size;
    console.log(`  - ${f} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }
}

main().catch((err) => {
  console.error('\n❌ 准备 Tesseract 资源失败：', err.message);
  process.exit(1);
});
