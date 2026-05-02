// 动态导入 pdfjs-dist 以减小主包体积
import mammoth from 'mammoth';

// 懒加载 PDF.js
let pdfjsLib: any = null;
const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  }
  return pdfjsLib;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    
    console.log(`PDF 文件大小: ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB`);
    
    const loadingTask = pdfjs.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      // 增加超时时间和禁用字体子集优化
      disableFontFace: true,
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF 页数: ${pdf.numPages}, 版本: ${pdf.pdfInfo?.metadata || '未知'}`);
    
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
    if (!fullText.trim()) {
      throw new Error(
        '此 PDF 可能是扫描件或图片型 PDF，不包含可提取的文字。' +
        '\n\n可能的解决方案：' +
        '\n1. 如果您有原始的 Word 或文字版文档，请上传该文件' +
        '\n2. 使用 OCR（文字识别）软件先将 PDF 转换为可搜索 PDF' +
        '\n3. 手动复制 PDF 中的文字内容，粘贴到文本框中'
      );
    }
    
    // 检测文字是否过少
    if (fullText.trim().length < 50) {
      throw new Error(
        'PDF 中文字内容过少（' + fullText.trim().length + ' 字符），无法用于生成题目。' +
        '\n请确认文件内容是否完整，或尝试使用其他格式的文件。'
      );
    }
    
    return fullText;
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    
    // 提供更友好的错误信息
    if (error.message?.includes('password') || error.message?.includes('加密')) {
      throw new Error('此 PDF 文件已加密，请先解除密码保护后再试。');
    }
    
    if (error.message?.includes('Missing PDF')) {
      throw new Error('文件格式不正确或文件已损坏，无法解析。');
    }
    
    if (error.name === 'InvalidPDFException' || error.message?.includes('Invalid PDF')) {
      throw new Error('PDF 文件格式无效或已损坏，请尝试重新下载或转换文件。');
    }
    
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('PDF 解析过程中发生未知错误: ' + (error?.message || '未知原因'));
  }
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
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
