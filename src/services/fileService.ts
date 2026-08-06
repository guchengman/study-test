// fileService 已拆分为职责单一的 extract/* 模块（R1-3）。
// 本文件作为 re-export 薄壳，保留原有导出签名，避免调用方（ImportModal / geminiService 等）改动。
//
// ⚠️ 红线：mammoth / pdfjs-dist / xlsx 的动态 import 已下沉到对应 extract 模块内部（第一批 B2 修复），
// 严禁在本壳层或任何地方恢复静态 `import mammoth` / `import * as pdfjsLib from 'pdfjs-dist'` / `import * as XLSX from 'xlsx'`。
export * from './extract/types';
export * from './extract/docxExtract';
export * from './extract/pdfExtract';
export * from './extract/ocr';
export * from './extract/aiVision';
export * from './extract/csvExtract';
export * from './extract/xlsxExtract';
export * from './extract/mdExtract';
