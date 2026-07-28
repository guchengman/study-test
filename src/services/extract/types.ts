// 共享类型 + 动态加载 helper（第一批已确认：mammoth / pdfjs-dist 必须函数内动态 import，严禁顶层静态引入）

// PDF.js 配置：通过 Vite 的 `?url` 导入把 worker 作为本地资源打包，彻底不再依赖 CDN
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// 缓存破除：给 worker URL 追加查询参数 ?v=2，使 Cloudflare 将其视为全新资源而回源，
// 重新拉取源站已修正为 text/javascript 的 worker 文件，修复 "Setting up fake worker failed" 导致的 PDF 导入失败。
// （源站 nginx 已为 .mjs 强制 text/javascript，问题纯属 CDN 缓存了修复前的错误 MIME。）
export const PDF_WORKER_URL = `${pdfWorkerUrl}?v=2`;

// 懒加载 pdfjs-dist（带缓存，仅首次动态加载并设置 worker）
let _pdfjsLibCache: typeof import('pdfjs-dist') | null = null;
export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!_pdfjsLibCache) {
    _pdfjsLibCache = await import('pdfjs-dist');
    _pdfjsLibCache.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  }
  return _pdfjsLibCache;
}

// 懒加载 mammoth
export async function loadMammoth(): Promise<typeof import('mammoth')> {
  return import('mammoth');
}

// CSV 解析结果 / 题目中间结构
export interface ParsedQuestion {
  type: string;
  title: string;
  options?: string[];
  answer: string | string[];
  explanation?: string;
  points?: number;
  code?: string;
  input?: string;
}

// PaddleOCR API 类型定义
export interface PaddleOCRResult {
  text: string;
  hasOcrResult: boolean;
}

// PaddleOCR API 响应中的 prunedResult 结构
export interface OCRPrunedResult {
  rec_texts?: string[];
  rec_scores?: number[];
  det_boxes?: number[][][];
  [key: string]: unknown;
}

// 从 PDF 页面提取图片（返回 canvas 以便 Tesseract.js / AI 识别）
export async function extractPageImage(
  page: any,
  scale: number = 2.0
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  return canvas;
}

// 提取图片数据为 base64
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1];
}

// 文件转 base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 从 ocrResults 中提取文字
export function extractTextFromOcrResults(
  ocrResults: Array<{ prunedResult?: OCRPrunedResult }>
): string {
  const texts: string[] = [];
  for (const res of ocrResults) {
    if (res.prunedResult) {
      if (res.prunedResult.rec_texts && Array.isArray(res.prunedResult.rec_texts)) {
        texts.push(...res.prunedResult.rec_texts);
      }
      // 兼容：prunedResult 可能直接是对象，包含其他文字字段
      if (!res.prunedResult.rec_texts) {
        // 尝试从 prunedResult 中找任何字符串值
        for (const value of Object.values(res.prunedResult)) {
          if (typeof value === 'string' && value.trim()) {
            texts.push(value.trim());
          } else if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string' && item.trim()) {
                texts.push(item.trim());
              }
            }
          }
        }
      }
    }
  }
  return texts.join('\n');
}

// 默认 PaddleOCR API 端点
export const DEFAULT_PADDLEOCR_API_URL =
  'https://aistudio.baidu.com/paddleocr/api/ocr';

// 取 OCR 后端地址（本地走 3100 调试端口）
export function getOcrApiUrl(): string {
  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  return isDev ? 'http://localhost:3100/api/ocr/baidu' : '/api/ocr/baidu';
}
