// 本地 Tesseract / PaddleOCR / 百度 OCR 实现（重依赖均函数内动态加载）
import {
  loadPdfjs,
  extractPageImage,
  canvasToBase64,
  fileToBase64,
  extractTextFromOcrResults,
  getOcrApiUrl,
  DEFAULT_PADDLEOCR_API_URL,
} from './types';
import type { PaddleOCRResult } from './types';

// OCR 引擎状态
let tesseractWorker: any = null;
let tesseractInitialized = false;

// OCR 引擎初始化超时（毫秒）：避免 CDN / 网络异常导致界面无限卡死
const OCR_INIT_TIMEOUT_MS = 45000;

// 给 Promise 包一层超时保护，超时即 reject，绝不无限等待
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

// 初始化 Tesseract OCR
async function initTesseract(
  onProgress?: (progress: { current: number; total: number; status: string }) => void
): Promise<any> {
  if (tesseractWorker && tesseractInitialized) {
    return tesseractWorker;
  }

  // 本地资源目录：开发环境为 '/tesseract/'，生产（base: './'）为 './tesseract/'
  const base = import.meta.env.BASE_URL;
  const assets = `${base}tesseract/`;

  // 动态导入 Tesseract.js 并创建 worker，全程使用本地资源（不依赖任何 CDN）
  const initPromise = (async (): Promise<any> => {
    const Tesseract = await import('tesseract.js');
    tesseractWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
      workerPath: `${assets}worker.min.js`,
      corePath: assets,
      langPath: assets,
      logger: (m: any) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress({
            current: Math.round(m.progress * 100),
            total: 100,
            status: '正在识别文字...',
          });
        }
      },
    });
    return tesseractWorker;
  })();

  const timeoutMsg =
    'OCR 引擎初始化超时（45s）。请确认已运行 `npm run setup:tesseract` 且浏览器可访问 /tesseract/ 下的本地 WASM 与语言包（离线 OCR 不依赖网络）。';

  try {
    tesseractWorker = await withTimeout(initPromise, OCR_INIT_TIMEOUT_MS, timeoutMsg);
  } catch (error) {
    // 初始化失败或超时：清理半成品状态，避免复用脏 worker
    tesseractWorker = null;
    tesseractInitialized = false;
    throw error;
  }

  tesseractInitialized = true;
  return tesseractWorker;
}

// 使用 OCR 从 PDF 提取文字
export async function extractTextFromPDFWithOCR(
  file: File,
  onProgress?: (progress: { current: number; total: number; status: string }) => void
): Promise<{ text: string; hasOcrResult: boolean }> {
  try {
    console.log('开始 OCR 识别...');

    // 1. 加载 PDF 并获取页面
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await loadPdfjs();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log(`PDF 页数: ${pdf.numPages}`);

    // 2. 初始化 Tesseract OCR
    onProgress?.({ current: 0, total: pdf.numPages, status: '正在初始化 OCR 引擎...' });
    const worker = await initTesseract(onProgress);

    let fullText = '';

    // 3. 逐页处理
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({
        current: i,
        total: pdf.numPages,
        status: `正在识别第 ${i}/${pdf.numPages} 页...`,
      });

      const page = await pdf.getPage(i);

      // 提取页面图片
      const imageData = await extractPageImage(page, 2.0);

      // 使用 Tesseract 识别
      const result = await worker.recognize(imageData);

      if (result.data.text.trim()) {
        fullText += `【第 ${i} 页】\n${result.data.text}\n\n`;
      }

      console.log(`第 ${i}/${pdf.numPages} 页识别完成`);
    }

    console.log(`OCR 识别完成，总计 ${fullText.length} 字符`);

    // 清理 worker
    await worker.terminate();
    tesseractWorker = null;
    tesseractInitialized = false;

    return { text: fullText.trim(), hasOcrResult: true };
  } catch (error: any) {
    console.error('OCR 识别失败:', error);

    // 清理 worker
    if (tesseractWorker) {
      try {
        await tesseractWorker.terminate();
      } catch {}
      tesseractWorker = null;
      tesseractInitialized = false;
    }

    throw new Error('OCR 识别失败: ' + (error.message || '未知错误'));
  }
}

// 使用 PaddleOCR AI Studio API 进行在线识别
// 支持两种模式：
//   1. 直接上传 PDF（fileType: 0）—— 推荐，服务端处理所有页面
//   2. 逐页上传图片（fileType: 1）—— 降级方案，适用于直接上传 PDF 失败时
export async function extractTextFromPDFWithPaddleOCR(
  file: File,
  apiKey: string,
  onProgress?: (progress: { current: number; total: number; status: string }) => void,
  apiUrl?: string
): Promise<PaddleOCRResult> {
  const baseUrl =
    apiUrl || localStorage.getItem('paddle_ocr_api_url') || DEFAULT_PADDLEOCR_API_URL;

  try {
    console.log('开始 PaddleOCR AI Studio 在线识别...');
    console.log(`API URL: ${baseUrl}`);
    console.log(`API Key: ${apiKey ? '已设置' : '未设置'}`);

    // ========== 方案1: 直接上传 PDF 文件 ==========
    onProgress?.({ current: 0, total: 1, status: '正在上传 PDF 文件到 PaddleOCR...' });

    try {
      const pdfBase64 = await fileToBase64(file);

      const requestBody = {
        file: pdfBase64,
        fileType: 0, // 0 = PDF 文件
        useDocOrientationClassify: true,
        useDocUnwarping: false,
        useTextlineOrientation: true,
      };

      console.log(`PDF 直接上传模式，文件大小: ${(pdfBase64.length / 1024).toFixed(1)} KB`);

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `token ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`API 响应状态: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`PDF 直接上传失败: ${response.status}`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`API 完整响应:`, result);

      // 检查 API 错误
      if (result.errorCode && result.errorCode !== 0) {
        throw new Error(`API 错误 [${result.errorCode}]: ${result.errorMsg || '未知错误'}`);
      }

      // 解析 ocrResults
      if (result.result?.ocrResults && Array.isArray(result.result.ocrResults)) {
        const fullText = extractTextFromOcrResults(result.result.ocrResults);
        if (fullText.trim()) {
          console.log(`PDF 直接上传识别完成，总计 ${fullText.length} 字符`);
          return { text: fullText.trim(), hasOcrResult: true };
        }
      }

      // 尝试 layoutParsingResults 格式（旧版 API）
      if (result.result?.layoutParsingResults) {
        const texts: string[] = [];
        for (const layoutResult of result.result.layoutParsingResults) {
          if (layoutResult.markdown?.text) {
            texts.push(layoutResult.markdown.text);
          }
        }
        const fullText = texts.join('\n\n');
        if (fullText.trim()) {
          console.log(`PDF 直接上传识别完成（layoutParsing格式），总计 ${fullText.length} 字符`);
          return { text: fullText.trim(), hasOcrResult: true };
        }
      }

      console.warn('PDF 直接上传未识别到文字，尝试逐页图片模式...');
      // 如果直接上传没有识别出文字，降级到逐页模式
    } catch (pdfError: any) {
      console.warn(`PDF 直接上传失败，降级到逐页图片模式: ${pdfError.message}`);
    }

    // ========== 方案2: 逐页渲染图片上传 ==========
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await loadPdfjs();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log(`PDF 页数: ${pdf.numPages}，使用逐页图片模式`);

    let fullText = '';
    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({
        current: i,
        total: pdf.numPages,
        status: `正在识别第 ${i}/${pdf.numPages} 页...`,
      });

      const page = await pdf.getPage(i);

      // 提取页面图片（使用较高分辨率以提高识别率）
      const imageData = await extractPageImage(page, 3.0);
      const base64Image = canvasToBase64(imageData);

      try {
        const requestBody = {
          file: base64Image,
          fileType: 1, // 1 = 图片
          useDocOrientationClassify: true,
          useDocUnwarping: false,
          useTextlineOrientation: true,
        };

        console.log(`正在调用 PaddleOCR API，第 ${i}/${pdf.numPages} 页...`);
        console.log(`图片大小: ${(base64Image.length / 1024).toFixed(1)} KB`);

        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`API 响应状态: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        // 检查 API 错误
        if (result.errorCode && result.errorCode !== 0) {
          throw new Error(`API 错误 [${result.errorCode}]: ${result.errorMsg || '未知错误'}`);
        }

        let pageText = '';

        // 格式1: ocrResults（官方 PP-OCRv5 格式）
        if (result.result?.ocrResults && Array.isArray(result.result.ocrResults)) {
          pageText = extractTextFromOcrResults(result.result.ocrResults);
        }

        // 格式2: layoutParsingResults（旧版 API）
        if (!pageText && result.result?.layoutParsingResults) {
          for (const layoutResult of result.result.layoutParsingResults) {
            if (layoutResult.markdown?.text) {
              pageText += layoutResult.markdown.text + '\n';
            }
          }
        }

        // 格式3: 直接的 text 或 content 字段
        if (!pageText && (result.result?.text || result.result?.content)) {
          pageText = result.result.text || result.result.content;
        }

        if (pageText.trim()) {
          pageTexts.push(pageText.trim());
          console.log(`第 ${i} 页识别成功: ${pageText.length} 字符`);
        } else {
          console.warn(`第 ${i} 页未识别到文字，响应:`, JSON.stringify(result).substring(0, 300));
        }
      } catch (apiError: any) {
        console.error(`第 ${i} 页识别失败:`, apiError);
        throw apiError;
      }
    }

    fullText = pageTexts.join('\n\n');
    console.log(`PaddleOCR AI Studio 识别完成，总计 ${fullText.length} 字符`);

    return { text: fullText.trim(), hasOcrResult: true };
  } catch (error: any) {
    console.error('PaddleOCR AI Studio 识别失败:', error);
    throw new Error('PaddleOCR AI Studio 在线识别失败: ' + (error.message || '未知错误'));
  }
}

/**
 * 调用后端代理的百度 OCR 接口
 */
async function baiduOnlineOCR(imageBase64: string): Promise<string> {
  const url = getOcrApiUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error_code) {
    throw new Error(`百度 OCR 错误 [${data.error_code}]: ${data.error_msg || ''}`);
  }

  return data.words_result?.map((it: any) => it.words).join('\n') || '';
}

/**
 * 百度在线 OCR：将 PDF 每页渲染为高清图片并逐页识别
 */
export async function onlineOCR(
  file: File,
  onProgress?: (progress: { current: number; total: number; status: string }) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ current: i, total: pdf.numPages, status: `正在识别第 ${i}/${pdf.numPages} 页...` });
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const pageText = await baiduOnlineOCR(base64);
    fullText += `【第 ${i} 页】\n${pageText}\n\n`;
  }

  return fullText.trim();
}
