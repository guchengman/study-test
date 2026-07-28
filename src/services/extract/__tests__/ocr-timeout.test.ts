/**
 * ocr-timeout.test.ts
 *
 * 目的：为「离线 OCR 点击后绝不卡死」的 Bug 修复加回归测试。
 *
 * Bug 根因：原实现首次运行要从 CDN 下载 pdf.js worker + Tesseract 的
 * worker/WASM/语言包，且没有任何超时；国内 CDN 慢/被墙时会无限卡在
 * 「正在初始化 OCR 引擎…」。修复点：
 *   1) types.ts 把 PDF worker 改为 Vite `?url` 本地化导入；
 *   2) ocr.ts 新增 `withTimeout<T>()`，把 `import('tesseract.js')` +
 *      `createWorker` 用 `Promise.race` 包 45s 超时，超时即 reject 且
 *      抛出明确中文错误（提示先跑 `npm run setup:tesseract`）。
 *
 * 本测试不改动任何业务源码，只新增验证：
 *   (a) withTimeout 超时机制本身：传入永不应答的 Promise + 极小超时，
 *       断言超时后 reject 且错误信息正确。
 *       —— 模块未导出 withTimeout，按任务要求在测试内用「相同逻辑」复刻验证
 *          （零业务源码改动）；真实的 withTimeout 由 (b) 经实际调用链覆盖。
 *   (b) 超时保护（绝不卡死）：用 vi.mock 让 tesseract.js 的 createWorker
 *       永不应答（模拟 CDN 慢/被墙的挂起），并通过【公开入口】
 *       extractTextFromPDFWithOCR（即用户点击「离线 OCR」真正走到的方法）
 *       驱动真实调用链 …→ initTesseract → withTimeout(createWorker)，
 *       用 vi.useFakeTimers() + vi.advanceTimersByTimeAsync(46000) 推进时间，
 *       断言它在 ~45s 内 reject 且信息含「OCR 引擎初始化超时」，证明不会无限挂起。
 *       （注：initTesseract 本身未 export，故经由公开入口验证，这同时覆盖了
 *         用户真实触碰的调用路径，是比直接调用 initTesseract 更强的回归证明。）
 *
 * 清理：每个用例结束 vi.useRealTimers() 复位定时器；vi.resetModules() 复位
 *       模块级状态（tesseractWorker / tesseractInitialized），避免跨用例污染。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// (a) 复刻 ocr.ts 内的 withTimeout 逻辑，在测试内独立验证「超时即 reject」机制本身
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

// 用桩替换 tesseract.js：createWorker 返回永不应答的 Promise，
// 模拟「CDN 慢/被墙时 worker 永远加载不出来」的挂起场景
vi.mock('tesseract.js', () => ({
  createWorker: () => new Promise<unknown>(() => {}),
}));

// 用桩替换 ./types 的 loadPdfjs，避免真实加载 pdfjs-dist / 解析 PDF；
// 只提供走到 initTesseract 所需的最小 pdfjs 假对象（其余导出给空桩即可，
// 因为超时在 initTesseract 处就已抛出，不会触达后续页面渲染等逻辑）
vi.mock('../types', () => ({
  loadPdfjs: vi.fn(async () => ({
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    })),
  })),
  extractPageImage: vi.fn(),
  canvasToBase64: vi.fn(),
  fileToBase64: vi.fn(),
  extractTextFromOcrResults: vi.fn(),
  getOcrApiUrl: vi.fn(),
  DEFAULT_PADDLEOCR_API_URL: '',
}));

describe('OCR 初始化超时保护（离线 OCR 绝不卡死）', () => {
  beforeEach(() => {
    // 用 fake timers 控制 setTimeout，避免真的等 45 秒
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('(a) 永不应答的 Promise 在超时后 reject 且错误信息正确', async () => {
    const neverResolves = new Promise<string>(() => {});
    const p = withTimeout(neverResolves, 50, '自定义超时信息');

    // 先挂上 reject 监听（必须在推进定时器之前，否则定时器触发时 p 已 reject 却无 handler → unhandled rejection）
    const assertion = expect(p).rejects.toThrowError('自定义超时信息');

    // 推进时间越过 50ms 阈值
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('(b) tesseract.js 永不应答时，离线 OCR 入口在 ~45s 内 reject 且信息含「OCR 引擎初始化超时」', async () => {
    const { extractTextFromPDFWithOCR } = await import('../ocr');
    const fakeFile = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as File;

    // 走真实调用链：extractTextFromPDFWithOCR → initTesseract → withTimeout(createWorker)
    // 超时后该入口会把错误包装为「OCR 识别失败: <原始错误>」，原始错误含「OCR 引擎初始化超时」
    const p = extractTextFromPDFWithOCR(fakeFile);
    const assertion = expect(p).rejects.toThrowError(/OCR 引擎初始化超时/);

    // 推进到 45s 超时阈值之外（46s），绝不能是真的等 45 秒
    await vi.advanceTimersByTimeAsync(46000);

    // 证明不会无限挂起：一定在 ~45s 内以明确中文错误 reject
    await assertion;
  });
});
