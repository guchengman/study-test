import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up PDF.js worker using a reliable CDN
// Note: For pdfjs-dist 5.x, we use the .mjs worker
const PDF_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      // Standard options for better compatibility
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Filter and join text items, handling potential non-text items
      const pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) return item.str;
          return '';
        })
        .join(' ');
        
      fullText += pageText + '\n';
    }
    
    if (!fullText.trim()) {
      throw new Error('未能从 PDF 中提取到文字内容，可能是扫描件或加密文件。');
    }
    
    return fullText;
  } catch (error) {
    console.error('PDF extraction error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('PDF 解析过程中发生未知错误');
  }
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function extractTextFromTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
