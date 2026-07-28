// PDF 文本提取 + 扫描件检测 + 智能 OCR 调度（pdfjs-dist 在函数内动态加载）
import { loadPdfjs } from './types';
import { onlineOCR } from './ocr';

export async function extractTextFromPDF(
  file: File,
  _options?: {
    onOcrProgress?: (progress: { current: number; total: number; status: string }) => void;
    onOcrReady?: () => void;
  }
): Promise<{ text: string; hasOcrResult: boolean }> {
  try {
    const pdfjsLib = await loadPdfjs();
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
          : `PDF_CONTENT_INSUFFICIENT:${charCount}`,
      };
    }

    return { text: fullText, hasOcrResult: false };
  } catch (error: any) {
    // 先检查是否是 OCR 需要的特殊错误（普通对象，没有 instanceof Error）
    if (
      error &&
      (error.isOcrNeeded ||
        error.message === 'PDF_SCAN_DETECTED' ||
        error.message?.startsWith('PDF_CONTENT_INSUFFICIENT'))
    ) {
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

// 检测 PDF 是否可能是扫描件
export async function checkIfPDfIsScanned(
  file: File
): Promise<{ isScanned: boolean; textLength: number }> {
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

/**
 * 纯文本提取（不抛异常，用于智能 OCR 判断）
 */
async function tryExtractPdfText(
  file: File
): Promise<{ text: string; pageCount: number }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrayBuffer);
    const pdfjsLib = await loadPdfjs();
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
