// 纯文本 / Markdown 文件提取（多编码回退读取）
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
      const validChars = (
        text.match(
          /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\w\s.,;:!?，。；：！？、""''（）【】\d\-+=<>(){}\[\]]/g
        ) || []
      ).length;
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
