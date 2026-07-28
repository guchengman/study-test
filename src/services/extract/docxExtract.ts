// DOCX / DOC 文本提取（mammoth 在函数内动态加载）
import { loadMammoth } from './types';

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await loadMammoth();
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
  const mammoth = await loadMammoth();
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

// 尝试解析 DOC 文件（旧版 Word 二进制格式）
// 注意：mammoth 不原生支持 .doc 格式，这里尝试解析并给出友好提示
export async function extractTextFromDoc(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = await loadMammoth();
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
