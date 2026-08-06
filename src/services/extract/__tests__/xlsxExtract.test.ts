/**
 * xlsxExtract 单元测试（P0 三件套 —— Excel 题库导入）
 *
 * 覆盖点：
 *  1) 中文表头（题型/题目/选项/答案/解析/分值）识别，single / multiple / programming 三类题映射；
 *  2) Excel 专有的「单元格内换行」选项写法（Alt+Enter）能被正确拆分；
 *  3) 英文表头 + code/input 列；
 *  4) 空行、空题干行被跳过；
 *  5) 异常口径：缺必要列 / 只有表头（内容不足）/ 空工作表 / 全空题干。
 *
 * 说明：这里用真实 SheetJS 构造工作簿（XLSX.write → ArrayBuffer → 伪 File），
 * 因为 parseXLSX 内部是「函数内动态 import('xlsx')」，用真依赖才能验证解析链路真实可用。
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXLSX } from '../xlsxExtract';
import { parseXLSX as parseXLSXFromShell } from '../../fileService';
import { convertParsedQuestions } from '../../../components/import/questionConvert';

/** 二维数组 → 最小 xlsx 工作簿 → 仅含 arrayBuffer 的伪 File（jsdom 下规避 Blob 差异） */
function makeXlsxFile(aoa: unknown[][], sheetName = 'Sheet1'): File {
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    name: `${sheetName}.xlsx`,
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as File;
}

describe('parseXLSX —— 中文表头基础解析', () => {
  const aoa: unknown[][] = [
    ['题型', '题目', '选项', '答案', '解析', '分值'],
    ['单选题', '1+1=?', 'A,B,C,D', 'B', '常识', 5],
    ['多选题', '哪些是偶数?', '2\n3\n4\n5', '2，4', '2 和 4 是偶数', 10],
    ['编程题', '打印 1', '', 'print(1)', '基础输出', 20],
  ];

  it('single / multiple / programming 三类题型、题干、选项、答案均正确', async () => {
    const questions = await parseXLSX(makeXlsxFile(aoa));
    expect(questions).toHaveLength(3);

    // 单选：答案保持字符串，选项按逗号拆分
    expect(questions[0]).toMatchObject({
      type: 'single',
      title: '1+1=?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'B',
      explanation: '常识',
      points: 5,
    });

    // 多选：答案拆成数组；选项用单元格内换行书写（Excel 专有形态）
    expect(questions[1].type).toBe('multiple');
    expect(questions[1].title).toBe('哪些是偶数?');
    expect(questions[1].options).toEqual(['2', '3', '4', '5']);
    expect(questions[1].answer).toEqual(['2', '4']); // 全角逗号同样是分隔符
    expect(questions[1].points).toBe(10);

    // 编程题：不产出 options
    expect(questions[2].type).toBe('programming');
    expect(questions[2].answer).toBe('print(1)');
    expect(questions[2].options).toBeUndefined();
    expect(questions[2].points).toBe(20);
  });

  it('只读取第一个工作表（多 sheet 时忽略其余）', async () => {
    const worksheetA = XLSX.utils.aoa_to_sheet(aoa);
    const worksheetB = XLSX.utils.aoa_to_sheet([
      ['题型', '题目', '答案'],
      ['单选题', '第二个表的题', 'X'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheetA, '第一张');
    XLSX.utils.book_append_sheet(workbook, worksheetB, '第二张');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = { arrayBuffer: () => Promise.resolve(buffer) } as unknown as File;

    const questions = await parseXLSX(file);
    expect(questions).toHaveLength(3);
    expect(questions.some((q) => q.title === '第二个表的题')).toBe(false);
  });
});

describe('parseXLSX —— 英文表头与可选列', () => {
  it('识别 english 表头，并带出 code / input / explanation', async () => {
    const questions = await parseXLSX(
      makeXlsxFile([
        ['type', 'title', 'options', 'answer', 'explanation', 'points', 'code', 'input'],
        ['single', 'What is 1+1?', 'A|B|C|D', 'B', 'basic', 3, '', ''],
        ['programming', 'print one', '', 'print(1)', 'io', 20, 'print', '1'],
      ])
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      type: 'single',
      title: 'What is 1+1?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'B',
      points: 3,
    });
    expect(questions[0].code).toBeUndefined();
    expect(questions[1]).toMatchObject({
      type: 'programming',
      code: 'print',
      input: '1',
      points: 20,
    });
  });

  it('缺省 / 非法分值回退默认 5 分', async () => {
    const questions = await parseXLSX(
      makeXlsxFile([
        ['type', 'title', 'answer', 'points'],
        ['single', '无分值', 'A', ''],
        ['single', '非法分值', 'A', 'abc'],
        ['single', '零分', 'A', 0],
      ])
    );
    expect(questions.map((q) => q.points)).toEqual([5, 5, 5]);
  });

  it('跳过空行与题干为空的行', async () => {
    const questions = await parseXLSX(
      makeXlsxFile([
        ['type', 'title', 'answer'],
        ['single', '有效题', 'A'],
        ['', '', ''],
        ['single', '', 'B'],
        ['single', '另一道有效题', 'C'],
      ])
    );
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.title)).toEqual(['有效题', '另一道有效题']);
  });
});

describe('parseXLSX —— 异常口径', () => {
  it('缺少必要列（type/title/answer）抛出格式引导文案', async () => {
    const file = makeXlsxFile([
      ['题目', '选项'],
      ['Q1', 'A,B'],
    ]);
    await expect(parseXLSX(file)).rejects.toThrow(/缺少必要的列/);
  });

  it('只有表头（行数 < 2）抛「内容不足」', async () => {
    const file = makeXlsxFile([['type', 'title', 'answer']]);
    await expect(parseXLSX(file)).rejects.toThrow(/内容不足/);
  });

  it('空工作表（无任何内容）抛「内容不足」', async () => {
    const file = makeXlsxFile([]);
    await expect(parseXLSX(file)).rejects.toThrow(/内容不足/);
  });

  it('有表头有数据行但题干全空 → 抛「没有找到有效的题目数据」', async () => {
    const file = makeXlsxFile([
      ['type', 'title', 'answer'],
      ['single', '', 'A'],
      ['multiple', '', 'B'],
    ]);
    await expect(parseXLSX(file)).rejects.toThrow(/没有找到有效的题目数据/);
  });
});

describe('Excel 导入链路集成（fileService 壳 → parseXLSX → convertParsedQuestions）', () => {
  it('fileService 薄壳正确 re-export parseXLSX（ImportModal 实际引用路径）', () => {
    expect(parseXLSXFromShell).toBe(parseXLSX);
  });

  it('解析结果可直接映射为领域 Question（题型 / 答案 / 分值贯通）', async () => {
    const questions = convertParsedQuestions(
      await parseXLSX(
        makeXlsxFile([
          ['题型', '题目', '选项', '答案', '分值'],
          ['单选题', '1+1=?', 'A,B,C,D', 'B', 5],
          ['多选题', '哪些是偶数?', '2,3,4,5', '2,4', 10],
        ])
      ),
      'python'
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      subject: 'python',
      type: 'single',
      title: '1+1=?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'B',
      points: 5,
    });
    expect(questions[1]).toMatchObject({ type: 'multiple', answer: ['2', '4'], points: 10 });
    // 临时负 id，提交时由后端重新分配
    expect(questions.every((q) => q.id < 0)).toBe(true);
  });
});
