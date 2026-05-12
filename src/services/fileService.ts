// 动态导入 pdfjs-dist 和 tesseract 以减小主包体积
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { loadApiConfig } from '../config/apiConfig';
import { AISettings } from '../types';

// PDF.js 配置
const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';

// 初始化 PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

export async function extractTextFromPDF(
  file: File,
  options?: {
    onOcrProgress?: (progress: { current: number; total: number; status: string }) => void;
    onOcrReady?: () => void;
  }
): Promise<{ text: string; hasOcrResult: boolean }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    console.log(`PDF 文件大小: ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB`);
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      disableFontFace: true,
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF 页数: ${pdf.numPages}, 版本: ${(pdf as any).pdfInfo?.metadata || '未知'}`);
    
    // 检测 PDF 是否加密
    if (pdf._pdfInfo?.encrypt) {
      throw new Error('此 PDF 文件已加密，无法解析。请先解除密码保护。');
    }
    
    let fullText = '';
    let pagesWithText = 0;
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) return item.str;
          return '';
        })
        .join(' ');
      
      if (pageText.trim()) {
        pagesWithText++;
      }
      
      fullText += pageText + '\n';
    }
    
    console.log(`PDF 解析完成: ${pagesWithText}/${pdf.numPages} 页包含文字，总计 ${fullText.length} 字符`);
    
    // 检测是否是扫描件（几乎没有文字）
    if (!fullText.trim() || fullText.trim().length < 50) {
      // 抛出特殊错误，告知可能是扫描件
      const isScanned = !fullText.trim();
      const charCount = fullText.trim().length;
      
      throw {
        isScanned,
        charCount,
        isOcrNeeded: true,
        message: isScanned
          ? 'PDF_SCAN_DETECTED'
          : `PDF_CONTENT_INSUFFICIENT:${charCount}`
      };
    }
    
    return { text: fullText, hasOcrResult: false };
  } catch (error: any) {
    // 先检查是否是 OCR 需要的特殊错误（普通对象，没有 instanceof Error）
    if (error && (error.isOcrNeeded || error.message === 'PDF_SCAN_DETECTED' || error.message?.startsWith('PDF_CONTENT_INSUFFICIENT'))) {
      throw error;
    }
    
    console.error('PDF extraction error:', error);
    
    // 提供更友好的错误信息
    if (error instanceof Error) {
      if (error.message?.includes('password') || error.message?.includes('加密')) {
        throw new Error('此 PDF 文件已加密，请先解除密码保护后再试。');
      }
      if (error.message?.includes('Missing PDF')) {
        throw new Error('文件格式不正确或文件已损坏，无法解析。');
      }
      if (error.name === 'InvalidPDFException' || error.message?.includes('Invalid PDF')) {
        throw new Error('PDF 文件格式无效或已损坏，请尝试重新下载或转换文件。');
      }
      throw error;
    }
    throw new Error('PDF 解析过程中发生未知错误: ' + (error?.message || '未知原因'));
  }
}

// OCR 引擎状态
let tesseractWorker: any = null;
let tesseractInitialized = false;

// 初始化 Tesseract OCR
async function initTesseract(
  onProgress?: (progress: { current: number; total: number; status: string }) => void
): Promise<any> {
  if (tesseractWorker && tesseractInitialized) {
    return tesseractWorker;
  }
  
  // 动态导入 Tesseract.js
  const Tesseract = await import('tesseract.js');
  
  // 创建 worker
  tesseractWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress({
          current: Math.round(m.progress * 100),
          total: 100,
          status: '正在识别文字...'
        });
      }
    }
  });
  
  tesseractInitialized = true;
  return tesseractWorker;
}

// 从 PDF 页面提取图片（返回 canvas 以便 Tesseract.js 识别）
async function extractPageImage(page: any, scale: number = 2.0): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;
  
  return canvas;
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
        status: `正在识别第 ${i}/${pdf.numPages} 页...`
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

// 检测 PDF 是否可能是扫描件
export async function checkIfPDfIsScanned(file: File): Promise<{ isScanned: boolean; textLength: number }> {
  try {
    const result = await extractTextFromPDF(file);
    return { isScanned: result.text.trim().length < 50, textLength: result.text.length };
  } catch (error: any) {
    if (error.isOcrNeeded) {
      return { isScanned: error.isScanned, textLength: error.charCount || 0 };
    }
    return { isScanned: true, textLength: 0 };
  }
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  // Strip HTML tags to get plain text for AI parsing
  return result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 从 DOCX 提取 HTML 内容（mammoth 自动将图片转为 base64 data URI）
 * 返回 HTML 字符串和提取到的图片列表（可上传到服务器）
 */
export async function extractHtmlFromDocx(file: File): Promise<{
  html: string;
  images: Array<{ name: string; data: string; mime: string }>;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const images: Array<{ name: string; data: string; mime: string }> = [];
  const imgRegex = /<img[^>]+src="data:([^;]+);base64,([^"]+)"[^>]*>/g;
  let match;
  let idx = 0;
  while ((match = imgRegex.exec(result.value)) !== null) {
    images.push({ name: `img_${++idx}`, mime: match[1], data: match[2] });
  }
  return { html: result.value, images };
}

export async function extractTextFromTxt(file: File): Promise<string> {
  // 尝试多种编码读取
  const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'BIG5'];
  
  for (const encoding of encodings) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder(encoding);
      const text = decoder.decode(arrayBuffer);
      // 检查是否包含有效的中文字符或ASCII内容
      const hasChinese = /[\u4e00-\u9fa5]/.test(text);
      const hasContent = text.trim().length > 10;
      // 计算乱码指标：如果大量字符是乱码，ratio会很低
      const validChars = (text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\w\s.,;:!?，。；：！？、""''（）【】\d\-+=<>(){}\[\]]/g) || []).length;
      const ratio = validChars / Math.max(text.length, 1);
      
      if ((hasChinese || hasContent) && ratio > 0.5) {
        console.log(`TXT文件使用 ${encoding} 编码解析成功，长度: ${text.length}`);
        return text;
      }
    } catch {
      continue;
    }
  }
  
  // 最后尝试直接读取
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// Markdown 文件本质上也是纯文本，复用 TXT 的多编码读取逻辑
export async function extractTextFromMd(file: File): Promise<string> {
  return extractTextFromTxt(file);
}

// 尝试解析 DOC 文件（旧版 Word 二进制格式）
// 注意：mammoth 不原生支持 .doc 格式，这里尝试解析并给出友好提示
export async function extractTextFromDoc(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // mammoth 理论上可以尝试解析 .doc，但成功率很低
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value && result.value.trim().length > 0) {
      return result.value;
    }
  } catch {
    // 忽略错误，继续尝试其他方式
  }
  
  // 尝试将 DOC 作为纯文本读取（可能得到乱码）
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('UTF-8', { fatal: false });
    const text = decoder.decode(arrayBuffer);
    if (text.trim().length > 0) {
      return text;
    }
  } catch {
    // 忽略
  }
  
  // 最后抛出友好提示
  throw new Error(
    'DOC 格式（旧版 Word 文件）不支持直接解析。建议将文件另存为 DOCX 格式后再试。\n' +
    '操作方法：在 Microsoft Word 中打开 DOC 文件，点击"文件" > "另存为" > 选择 "Word 文档 (*.docx)"'
  );
}

// CSV 解析器 - 将 CSV 文件转换为题目数组
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

// 提取图片数据为 base64
function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1];
}

// 文件转 base64
function fileToBase64(file: File): Promise<string> {
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

// PaddleOCR API 响应中的 prunedResult 结构
interface OCRPrunedResult {
  rec_texts?: string[];
  rec_scores?: number[];
  det_boxes?: number[][][];
  [key: string]: unknown;
}

// 从 ocrResults 中提取文字
function extractTextFromOcrResults(ocrResults: Array<{ prunedResult?: OCRPrunedResult }>): string {
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
const DEFAULT_PADDLEOCR_API_URL = 'https://aistudio.baidu.com/paddleocr/api/ocr';

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
  const baseUrl = apiUrl || localStorage.getItem('paddle_ocr_api_url') || DEFAULT_PADDLEOCR_API_URL;
  
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
          'Authorization': `token ${apiKey}`
        },
        body: JSON.stringify(requestBody)
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
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF 页数: ${pdf.numPages}，使用逐页图片模式`);
    
    let fullText = '';
    const pageTexts: string[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({
        current: i,
        total: pdf.numPages,
        status: `正在识别第 ${i}/${pdf.numPages} 页...`
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
            'Authorization': `token ${apiKey}`
          },
          body: JSON.stringify(requestBody)
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

// ==================== 百度高精度 OCR ====================
// 通过后端代理调用百度 accurate_basic（中文/试卷/公式最强）
// 后端在 /api/ocr/baidu

function getOcrApiUrl() {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isDev ? 'http://localhost:3100/api/ocr/baidu' : '/api/ocr/baidu';
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
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ current: i, total: pdf.numPages, status: `正在识别第 ${i}/${pdf.numPages} 页...` });
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, viewport }).promise;
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const pageText = await baiduOnlineOCR(base64);
    fullText += `【第 ${i} 页】\n${pageText}\n\n`;
  }

  return fullText.trim();
}

// ==================== 多模态 AI 视觉识别（方案C：纯 AI 识别整页内容） ====================

const AI_VISION_PROMPT = `你是一个专业的试卷识别与转录专家。请将这张PDF页面的所有内容完整转录为结构化文本，**不得遗漏任何元素**：

**必须识别并输出的内容：**

1. **文字内容**：逐字转录，保持标题层级、段落结构、题号标记
2. **图片与插图**：用 \`【图片描述：...】\` 格式详细描述图片内容（如实验装置图、流程图、结构图等）
3. **数学/化学公式**：严格使用LaTeX格式 — 行内公式用 \$...\$，块级公式用 \$\$...\$\$。化学方程式、离子方程式、结构式等全部用LaTeX表示
4. **表格**：用Markdown表格格式完整输出，包含所有行列和数据
5. **图表与坐标图**：描述图表类型、坐标轴含义、数据趋势等关键信息
6. **特殊符号**：化学符号（→↑↓△等）、单位符号、上下标等必须准确转录

**关键要求：**
- 不要省略任何页面元素，即使看起来不重要的内容也要包含
- 严格遵循原页面的逻辑顺序（从上到下、从左到右）
- 对于混合排版的页面，先转录文字再描述图片
- 所有公式必须严格使用LaTeX语法，确保可被渲染`;

async function callGeminiVision(base64: string, prompt: string, apiKey: string, model?: string, maxOutputTokens?: number): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: model || 'gemini-3-flash-preview',
    config: {
      maxOutputTokens: maxOutputTokens || 8192,
    },
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: base64 } },
      ],
    },
  });

  return response.text?.trim() || '';
}

async function callOpenAIVision(
  base64: string,
  prompt: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number = 2000
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          ],
        },
      ],
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/** 通过服务端 Gemini 代理发送图片识别请求（无需用户自有 Key） */
async function callServerGeminiVision(base64: string, prompt: string, model?: string): Promise<string> {
  const { getToken, getApiBaseUrl } = await import('./api');
  const token = getToken();
  if (!token) throw new Error('未登录，无法使用服务端 AI');

  const res = await fetch(`${getApiBaseUrl()}/ai/gemini/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: model || 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: base64 } },
        ],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `服务端 Gemini 请求失败 (${res.status})`);
  }
  const data = await res.json();
  return data.text?.trim() || '';
}

/** 模型到视觉提供商的映射 */
function getModelVisionConfig(modelName: string, settingsOverride?: AISettings) {
  const settings = settingsOverride || loadApiConfig();

  if (modelName.startsWith('gemini') && settings.geminiKey) {
    return { type: 'gemini' as const, key: settings.geminiKey, model: modelName };
  }
  if (modelName.startsWith('deepseek') && settings.deepseekKey) {
    return { type: 'openai' as const, baseUrl: 'https://api.deepseek.com/v1', key: settings.deepseekKey, model: 'deepseek-chat' };
  }
  if (modelName.startsWith('qwen') && settings.qwenKey) {
    return { type: 'openai' as const, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: settings.qwenKey, model: 'qwen-vl-max' };
  }
  if (modelName === 'openrouter' && settings.openrouterKey) {
    return { type: 'openai' as const, baseUrl: 'https://openrouter.ai/api/v1', key: settings.openrouterKey, model: settings.openrouterModel || 'google/gemini-2.0-flash-001' };
  }
  if (modelName === 'custom' && settings.customKey && settings.customEndpoint) {
    return { type: 'openai' as const, baseUrl: settings.customEndpoint, key: settings.customKey, model: 'custom-model' };
  }
  return null;
}

function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return /(429|quota|rate.?limit|exceeded|too many requests|resource.*exhaust)/i.test(msg);
}

/** 将页面图片发送到多模态 AI 获取识别结果，优先使用指定模型，失败时回退 */
async function recognizePageWithAI(
  canvas: HTMLCanvasElement,
  prompt: string,
  modelName: string,
  maxTokens?: number,
  settingsOverride?: AISettings
): Promise<string> {
  const base64 = canvasToBase64(canvas);
  let lastError = '';

  // 1. 使用指定模型
  const config = getModelVisionConfig(modelName, settingsOverride);
  if (config) {
    try {
      if (config.type === 'gemini') {
        return await callGeminiVision(base64, prompt, config.key, config.model, maxTokens);
      } else {
        return await callOpenAIVision(base64, prompt, config.baseUrl, config.key, config.model, maxTokens);
      }
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn(`Model ${modelName} vision failed, trying fallbacks:`, e);
    }
  }

  // 2. 如果指定模型未配置或失败，尝试服务端 Gemini 代理（仅限 gemini 模型）
  if (modelName.startsWith('gemini')) {
    try { return await callServerGeminiVision(base64, prompt, modelName); }
    catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Server Gemini vision failed:', e);
    }
  }

  // 3. 回退：尝试所有已配置的提供商
  const settings = settingsOverride || loadApiConfig();
  if (settings.geminiKey && !modelName.startsWith('gemini')) {
    try { return await callGeminiVision(base64, prompt, settings.geminiKey, 'gemini-3-flash-preview', maxTokens); }
    catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Gemini fallback failed:', e);
    }
  }
  if (settings.deepseekKey && !modelName.startsWith('deepseek')) {
    try {
      return await callOpenAIVision(base64, prompt, 'https://api.deepseek.com/v1', settings.deepseekKey, 'deepseek-chat', maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('DeepSeek fallback failed:', e);
    }
  }
  if (settings.qwenKey && !modelName.startsWith('qwen')) {
    try {
      return await callOpenAIVision(base64, prompt, 'https://dashscope.aliyuncs.com/compatible-mode/v1', settings.qwenKey, 'qwen-vl-max', maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Qwen fallback failed:', e);
    }
  }
  if (settings.openrouterKey && modelName !== 'openrouter') {
    try {
      const m = settings.openrouterModel || 'google/gemini-2.0-flash-001';
      return await callOpenAIVision(base64, prompt, 'https://openrouter.ai/api/v1', settings.openrouterKey, m, maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('OpenRouter fallback failed:', e);
    }
  }
  // 最后尝试服务端代理
  try { return await callServerGeminiVision(base64, prompt); }
  catch (e) {
    lastError = (e as Error).message || String(e);
    console.warn('Server fallback failed:', e);
  }

  throw new Error(lastError || '所有 AI 提供商均识别失败');
}

/** 在线AI识别 PDF：将每页渲染为图片，发送到多模态 AI 直接识别全部内容（文字+图表+公式）
 *  @param modelName 模型名称，如 gemini-3-flash-preview、deepseek-v4-flash、qwen-max 等
 *  @param settingsOverride 用户服务端保存的 AI 设置（优先于 sessionStorage） */
export async function parsePdfWithAIVision(
  file: File,
  modelName: string,
  onProgress?: (progress: { current: number; total: number; status: string }) => void,
  settingsOverride?: AISettings
): Promise<{ content: string }> {
  const settings = settingsOverride || loadApiConfig();
  const { getToken } = await import('./api');
  const config = getModelVisionConfig(modelName, settingsOverride);
  const hasKey = !!(config || settings.geminiKey || settings.deepseekKey || settings.openrouterKey || settings.qwenKey);
  const isLoggedIn = !!getToken();
  if (!hasKey && !isLoggedIn) {
    throw new Error('未配置多模态 AI API Key 且未登录。请在设置中配置 AI API Key 或先登录以使用服务端 AI。');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  console.log(`AI 视觉识别 PDF，模型: ${modelName}，页数: ${pdf.numPages}`);

  const pageTexts: string[] = [];
  let rateLimitCount = 0;
  let authErrorCount = 0;
  let lastErrorMsg = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ current: i, total: pdf.numPages, status: `AI 正在识别第 ${i}/${pdf.numPages} 页...` });

    const page = await pdf.getPage(i);
    const canvas = await extractPageImage(page, 3.0);
    try {
      const result = await recognizePageWithAI(canvas, AI_VISION_PROMPT, modelName, 8192, settingsOverride);
      pageTexts.push(`【第 ${i} 页】\n${result}`);
      console.log(`第 ${i}/${pdf.numPages} 页 AI 识别完成`);
    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      lastErrorMsg = errMsg;
      if (isRateLimitError(e)) {
        rateLimitCount++;
      } else if (/401|403|unauthorized|forbidden/i.test(errMsg)) {
        authErrorCount++;
      }
      pageTexts.push(`【第 ${i} 页】\n[AI 识别失败，此页无内容]`);
      console.warn(`第 ${i}/${pdf.numPages} 页 AI 识别失败:`, errMsg);
    }

    // 避免触发 API 频率限制，页间等待 1.5 秒
    if (i < pdf.numPages) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const fullText = pageTexts.join('\n\n');
  console.log(`AI 视觉识别完成，总计 ${fullText.length} 字符`);

  // 检查是否所有页面都失败了
  const successCount = pageTexts.filter((t) => !t.includes('[AI 识别失败')).length;
  if (successCount === 0) {
    const hasKey = settings.geminiKey || settings.deepseekKey || settings.openrouterKey || settings.qwenKey;
    if (rateLimitCount > 0) {
      throw new Error(
        `API 调用频率限制或免费配额已用尽（${rateLimitCount}/${pdf.numPages} 页触发限制）。` +
        '建议：1) 等待 1-2 分钟再试；2) 切换到 gemini-3-flash-preview 模型（免费配额更宽松）；3) 更换其他已配置 API Key 的模型。'
      );
    }
    if (authErrorCount > 0) {
      throw new Error(
        `API Key 认证失败（${authErrorCount}/${pdf.numPages} 页返回 401/403）。请检查 API Key 是否正确且未过期。`
      );
    }
    throw new Error(
      hasKey
        ? `所有页面 AI 识别均失败。错误: ${lastErrorMsg || '未知错误'}`
        : '服务端未配置 GEMINI_API_KEY 且未设置个人 AI API Key。请在设置中配置 API Key，或联系管理员在 server/.env 中填入 GEMINI_API_KEY'
    );
  }

  return { content: fullText.trim() };
}

/**
 * 纯文本提取（不抛异常，用于智能 OCR 判断）
 */
async function tryExtractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrayBuffer);
    const pdf = await pdfjsLib.getDocument({ data: uint8Arr }).promise;
    const pageCount = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      fullText += pageText + '\n';
    }

    return { text: fullText.trim(), pageCount };
  } catch {
    return { text: '', pageCount: 0 };
  }
}

/**
 * 智能解析 PDF：优先文本提取，失败自动走百度 OCR
 * @returns content: 识别的文字, useOCR: 是否走了 OCR
 */
export async function parsePdfSmartOCR(
  file: File,
  onProgress?: (progress: { current: number; total: number; status: string }) => void
): Promise<{ content: string; useOCR: boolean }> {
  // 第一步：提取原生文本
  onProgress?.({ current: 0, total: 1, status: '正在提取文本...' });

  let text = '';
  let pageCount = 0;

  try {
    const result = await tryExtractPdfText(file);
    text = result.text || '';
    pageCount = result.pageCount || 0;
  } catch {
    text = '';
  }

  // 有足够文字直接返回，不用 OCR
  if (text.length > 20) {
    console.log('文本 PDF，直接提取，无需 OCR');
    return { content: text, useOCR: false };
  }

  // 文本太少，判定为扫描 PDF，走百度 OCR
  console.log('扫描版 PDF，切换百度 OCR...');
  onProgress?.({ current: 0, total: pageCount || 1, status: '正在在线 OCR 识别...' });

  const ocrText = await onlineOCR(file, onProgress);
  return { content: ocrText, useOCR: true };
}

export async function parseCSV(file: File): Promise<ParsedQuestion[]> {
  const text = await extractTextFromTxt(file);
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV 文件内容不足，至少需要包含标题行和数据行。');
  }
  
  // 解析 CSV 行（处理带引号的值）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  // 解析标题行
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  
  // 映射列名到索引
  const columnMap: Record<string, number> = {};
  const possibleNames: Record<string, string[]> = {
    type: ['type', '题型', '题目类型'],
    title: ['title', '题目', '题干', 'question'],
    options: ['options', '选项', 'choices'],
    answer: ['answer', '答案', 'correct'],
    explanation: ['explanation', '解析', 'explanation', '分析'],
    points: ['points', '分值', 'score', '分数'],
    code: ['code', '代码', '编程代码'],
    input: ['input', '输入', '输入样例']
  };
  
  for (const [field, names] of Object.entries(possibleNames)) {
    for (const name of names) {
      const idx = headers.findIndex(h => h === name || h.includes(name));
      if (idx !== -1) {
        columnMap[field] = idx;
        break;
      }
    }
  }
  
  // 验证必要字段
  if (columnMap.type === undefined || columnMap.title === undefined || columnMap.answer === undefined) {
    throw new Error(
      'CSV 文件缺少必要的列。\n' +
      '必要的列包括：题型(type)、题目(title)、答案(answer)。\n' +
      '可选列包括：选项(options)、解析(explanation)、分值(points)。\n' +
      '示例 CSV 格式：\n' +
      'type,title,options,answer,explanation,points\n' +
      'single,"以下哪个是Python的关键字？","import,def,print,return","print","print是Python的输出函数",5'
    );
  }
  
  const questions: ParsedQuestion[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length === 0 || !values.some(v => v.trim())) {
      continue; // 跳过空行
    }
    
    try {
      const typeValue = values[columnMap.type]?.trim().toLowerCase();
      let type: string = 'single';
      
      // 解析题型
      if (typeValue?.includes('单')) {
        type = 'single';
      } else if (typeValue?.includes('多')) {
        type = 'multiple';
      } else if (typeValue?.includes('编程') || typeValue?.includes('代码') || typeValue?.includes('program')) {
        type = 'programming';
      } else if (typeValue?.includes('single') || typeValue === '1' || typeValue === 'a') {
        type = 'single';
      } else if (typeValue?.includes('multiple') || typeValue?.includes('多选')) {
        type = 'multiple';
      }
      
      const title = values[columnMap.title]?.trim();
      if (!title) {
        console.warn(`跳过第 ${i + 1} 行：题目为空`);
        continue;
      }
      
      // 解析答案
      let answer: string | string[] = '';
      const answerValue = values[columnMap.answer]?.trim() || '';
      
      if (type === 'multiple') {
        // 多选题：答案可能是逗号分隔的多个选项
        answer = answerValue.split(/[,，;；|]/).map(a => a.trim()).filter(a => a);
      } else {
        answer = answerValue;
      }
      
      // 解析选项
      let options: string[] | undefined;
      if (type !== 'programming' && columnMap.options !== undefined) {
        const optionsValue = values[columnMap.options]?.trim();
        if (optionsValue) {
          options = optionsValue.split(/[,，;；|]/).map(o => o.trim()).filter(o => o);
        }
      }
      
      // 解析分值
      let points = 5; // 默认分值
      if (columnMap.points !== undefined) {
        const pointsValue = values[columnMap.points]?.trim();
        if (pointsValue) {
          const parsedPoints = parseInt(pointsValue, 10);
          if (!isNaN(parsedPoints) && parsedPoints > 0) {
            points = parsedPoints;
          }
        }
      }
      
      // 解析代码
      let code: string | undefined;
      if (columnMap.code !== undefined) {
        code = values[columnMap.code]?.trim();
      }
      
      // 解析输入
      let input: string | undefined;
      if (columnMap.input !== undefined) {
        input = values[columnMap.input]?.trim();
      }
      
      questions.push({
        type,
        title,
        options,
        answer,
        explanation: columnMap.explanation !== undefined ? values[columnMap.explanation]?.trim() : undefined,
        points,
        code,
        input
      });
    } catch (err) {
      console.warn(`解析第 ${i + 1} 行时出错:`, err);
    }
  }
  
  if (questions.length === 0) {
    throw new Error('CSV 文件中没有找到有效的题目数据。');
  }
  
  return questions;
}
