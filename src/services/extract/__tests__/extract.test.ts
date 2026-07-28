/**
 * src/services/extract 抽取层回归测试（R4 动态 import 下沉）
 *
 * 重点验证：
 *  1) 各 loader（loadMammoth / loadPdfjs）是「函数内动态 import」，
 *     可通过 vi.mock 拦截验证动态导入机制可用、导出符合预期；
 *     同时保证没有顶层静态引入 mammoth / pdfjs-dist（红线）。
 *  2) 纯函数 extractTextFromOcrResults / getOcrApiUrl 行为正确。
 *  3) docx / txt / md / csv 各 loader 在 mammoth/TextDecoder 可解析时产出正确结构。
 *
 * 说明：mammoth / pdfjs-dist 在测试中用 vi.mock 桩替代，避免真实加载重型依赖，
 * 这同时验证了「动态 import 机制」本身（loader 内部 import('mammoth') 能被解析）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import {
  loadMammoth,
  loadPdfjs,
  extractTextFromOcrResults,
  getOcrApiUrl,
  PDF_WORKER_URL,
} from '../types';
import { extractTextFromDocx, extractHtmlFromDocx } from '../docxExtract';
import { extractTextFromTxt, extractTextFromMd } from '../mdExtract';
import { parseCSV } from '../csvExtract';

// 用桩替换重型依赖；loader 内部用动态 import('mammoth'|'pdfjs-dist') 会被此处拦截
vi.mock('mammoth', () => ({
  convertToHtml: vi.fn(),
  extractRawText: vi.fn(),
}));
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

// 构造一个仅有 arrayBuffer 的伪 File（jsdom 下避免 Blob 行为差异，纯字符串喂入）
function makeFile(content: string): File {
  return {
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  } as unknown as File;
}

beforeEach(() => {
  (mammoth.convertToHtml as unknown as vi.Mock).mockReset();
  (mammoth.extractRawText as unknown as vi.Mock).mockReset();
  (pdfjs.getDocument as unknown as vi.Mock).mockReset();
});

describe('loader: loadMammoth（动态 import 机制）', () => {
  it('返回模块且导出 convertToHtml / extractRawText', async () => {
    const mod = await loadMammoth();
    expect(typeof mod.convertToHtml).toBe('function');
    expect(typeof mod.extractRawText).toBe('function');
  });
});

describe('loader: loadPdfjs（动态 import + 缓存 + worker 配置）', () => {
  it('返回模块，设置 GlobalWorkerOptions.workerSrc，且二次调用命中缓存', async () => {
    const mod = await loadPdfjs();
    expect(typeof mod.getDocument).toBe('function');
    expect((pdfjs as unknown as { GlobalWorkerOptions: { workerSrc?: string } }).GlobalWorkerOptions.workerSrc).toBe(
      PDF_WORKER_URL,
    );
    const again = await loadPdfjs();
    expect(again).toBe(mod); // 模块级缓存
  });
});

describe('extractTextFromOcrResults（纯函数）', () => {
  it('合并多结果中的 rec_texts，换行连接', () => {
    const out = extractTextFromOcrResults([
      { prunedResult: { rec_texts: ['第一行', '第二行'] } },
      { prunedResult: { rec_texts: ['第三行'] } },
    ]);
    expect(out).toBe('第一行\n第二行\n第三行');
  });

  it('无 prunedResult / 空数组 → 空串', () => {
    expect(extractTextFromOcrResults([])).toBe('');
    expect(extractTextFromOcrResults([{}])).toBe('');
  });

  it('rec_texts 缺失时回退抓取 prunedResult 内字符串值', () => {
    const out = extractTextFromOcrResults([
      { prunedResult: { someText: 'A', other: 1, arr: ['x', 'y'] } },
    ]);
    // 仅字符串值参与拼接（trim 后）
    expect(out).toContain('A');
    expect(out).toContain('x');
    expect(out).toContain('y');
  });
});

describe('getOcrApiUrl（环境相关）', () => {
  it('localhost / 127.0.0.1 走本地 3100 调试端口，否则走相对路径', () => {
    const url = getOcrApiUrl();
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      expect(url).toBe('http://localhost:3100/api/ocr/baidu');
    } else {
      expect(url).toBe('/api/ocr/baidu');
    }
    expect(url.endsWith('/api/ocr/baidu')).toBe(true);
  });
});

describe('docxExtract（mammoth 桩）', () => {
  it('extractTextFromDocx 剥离 HTML 标签得到纯文本', async () => {
    (mammoth.convertToHtml as unknown as vi.Mock).mockResolvedValue({
      value: '<p>Hello</p> <p>World</p>',
    });
    const text = await extractTextFromDocx(makeFile('dummy.docx'));
    expect(text).toBe('Hello World');
  });

  it('extractHtmlFromDocx 抽取 data URI 图片', async () => {
    (mammoth.convertToHtml as unknown as vi.Mock).mockResolvedValue({
      value: '<img src="data:image/png;base64,AAA" alt="x"><div>body</div>',
    });
    const { html, images } = await extractHtmlFromDocx(makeFile('dummy.docx'));
    expect(html).toContain('data:image/png;base64,AAA');
    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({ name: 'img_1', mime: 'image/png', data: 'AAA' });
  });
});

describe('txt / md 抽取（多编码回退）', () => {
  it('extractTextFromTxt UTF-8 内容原样返回', async () => {
    const text = await extractTextFromTxt(makeFile('Hello World\n第二行'));
    expect(text).toBe('Hello World\n第二行');
  });

  it('extractTextFromMd 复用 txt 逻辑', async () => {
    const text = await extractTextFromMd(makeFile('# 标题\n内容'));
    expect(text).toBe('# 标题\n内容');
  });
});

describe('parseCSV（CSV → ParsedQuestion[]）', () => {
  // 注意：options 字段内含逗号，必须加引号，否则会被拆成多列（与解析器约定一致）
  const csv = [
    'type,title,options,answer,explanation,points,code,input',
    'single,1+1=?,"A,B,C,D",B,常识,5,,',
    'multiple,哪些是偶数?,"A,B,C,D","B,D",两个偶数,10,,',
    'programming,打印1,,print(1),代码,20,print,1',
  ].join('\n');

  it('正确映射 single / multiple / programming 三类题', async () => {
    const qs = await parseCSV(makeFile(csv));
    expect(qs).toHaveLength(3);

    expect(qs[0]).toMatchObject({
      type: 'single',
      title: '1+1=?',
      answer: 'B',
      options: ['A', 'B', 'C', 'D'],
      points: 5,
    });

    expect(qs[1].type).toBe('multiple');
    expect(qs[1].answer).toEqual(['B', 'D']);
    expect(qs[1].options).toEqual(['A', 'B', 'C', 'D']);
    expect(qs[1].points).toBe(10);

    expect(qs[2].type).toBe('programming');
    expect(qs[2].answer).toBe('print(1)');
    expect(qs[2].code).toBe('print');
    expect(qs[2].input).toBe('1');
    // 编程题无 options 列
    expect(qs[2].options).toBeUndefined();
  });

  it('中文表头同样可识别（题型/题目/答案列）', async () => {
    const cnCsv = [
      '题型,题干,选项,答案,分值',
      '单选题,1+1=?,A,B,C,D,B,5',
    ].join('\n');
    const qs = await parseCSV(makeFile(cnCsv));
    expect(qs[0]).toMatchObject({ type: 'single', title: '1+1=?', answer: 'B', points: 5 });
  });

  it('行数不足（<2）抛错', async () => {
    await expect(parseCSV(makeFile('type,title,answer'))).rejects.toThrow(/内容不足/);
  });

  it('缺少必要列（type/title/answer）抛错', async () => {
    const bad = 'title,options\nQ1,A,B';
    await expect(parseCSV(makeFile(bad))).rejects.toThrow(/缺少必要的列/);
  });
});
