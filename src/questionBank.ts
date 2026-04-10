import { Question } from './types';

export const QUESTION_BANK: Question[] = [
  // --- Python 题库 ---
  { id: 1, subject: 'python', type: 'single', title: 'Python 中用于输出的函数是？', options: ['print()', 'input()', 'len()', 'type()'], answer: 'print()', points: 5, explanation: 'print() 是 Python 的标准输出函数。' },
  { id: 2, subject: 'python', type: 'single', title: 'Python 中用于接收输入的函数是？', options: ['print()', 'input()', 'len()', 'type()'], answer: 'input()', points: 5, explanation: 'input() 用于从键盘获取用户输入。' },
  { id: 3, subject: 'python', type: 'single', title: '下列哪个符号用于表示 Python 的单行注释？', options: ['#', '//', '/*', '--'], answer: '#', points: 5, explanation: '# 符号用于单行注释。' },
  { id: 4, subject: 'python', type: 'single', title: 'Python 中定义函数的关键字是？', options: ['func', 'def', 'function', 'define'], answer: 'def', points: 5, explanation: '使用 def 关键字定义函数。' },
  { id: 5, subject: 'python', type: 'single', title: 'Python 列表的索引是从几开始的？', options: ['0', '1', '-1', '任意数字'], answer: '0', points: 5, explanation: 'Python 索引从 0 开始。' },
  { id: 6, subject: 'python', type: 'single', title: '运行 print("Hello" + "World") 的结果是？', options: ['Hello World', 'HelloWorld', 'Hello+World', '报错'], answer: 'HelloWorld', points: 5, explanation: '字符串相加表示直接拼接。' },
  { id: 7, subject: 'python', type: 'single', title: '在 Python 中，10 / 2 的结果类型是？', options: ['整数', '浮点数', '字符串', '布尔值'], answer: '浮点数', points: 5, explanation: 'Python 3 中的除法 / 总是返回浮点数。' },
  { id: 8, subject: 'python', type: 'single', title: '运行 print(3 * 4) 的结果是？', options: ['7', '12', '34', '报错'], answer: '12', points: 5, explanation: '执行数学乘法运算。' },
  { id: 9, subject: 'python', type: 'single', title: '在 Python 中，如何定义一个列表？', options: ['a = (1, 2)', 'a = [1, 2]', 'a = {1, 2}', 'a = "1, 2"'], answer: 'a = [1, 2]', points: 5, explanation: '列表使用方括号 [] 定义。' },
  { id: 10, subject: 'python', type: 'single', title: '运行 print(10 % 3) 的结果是？', options: ['3', '1', '0', '0.33'], answer: '1', points: 5, explanation: '% 是取余运算符，10 除以 3 余 1。' },

  // --- 英语题库 ---
  { id: 1001, subject: 'english', type: 'single', title: 'Which of the following is a synonym for "happy"?', options: ['Sad', 'Joyful', 'Angry', 'Bored'], answer: 'Joyful', points: 5, explanation: '"Joyful" means feeling, expressing, or causing great pleasure and happiness.' },
  { id: 1002, subject: 'english', type: 'single', title: 'What is the past tense of "go"?', options: ['Goes', 'Going', 'Went', 'Gone'], answer: 'Went', points: 5, explanation: 'The past tense of the irregular verb "go" is "went".' },
  { id: 1003, subject: 'english', type: 'single', title: 'Choose the correct spelling:', options: ['Recieve', 'Receive', 'Receve', 'Recive'], answer: 'Receive', points: 5, explanation: 'The correct spelling is "Receive" (i before e except after c).' },
  { id: 1004, subject: 'english', type: 'single', title: 'What is the opposite of "brave"?', options: ['Strong', 'Cowardly', 'Fearless', 'Smart'], answer: 'Cowardly', points: 5, explanation: '"Cowardly" means lacking courage.' },
  { id: 1005, subject: 'english', type: 'single', title: 'Which word is a noun?', options: ['Run', 'Beautiful', 'Apple', 'Quickly'], answer: 'Apple', points: 5, explanation: '"Apple" is a person, place, or thing (a noun).' },

  // --- 语文题库 ---
  { id: 2001, subject: 'chinese', type: 'single', title: '《静夜思》的作者是？', options: ['杜甫', '李白', '白居易', '王维'], answer: '李白', points: 5, explanation: '《静夜思》是唐代诗人李白的代表作之一。' },
  { id: 2002, subject: 'chinese', type: 'single', title: '“举头望明月”的下一句是？', options: ['低头思故乡', '疑是地上霜', '春风吹又生', '粒粒皆辛苦'], answer: '低头思故乡', points: 5, explanation: '出自李白的《静夜思》。' },
  { id: 2003, subject: 'chinese', type: 'single', title: '下列哪个不是“岁寒三友”？', options: ['松', '竹', '梅', '菊'], answer: '菊', points: 5, explanation: '岁寒三友指松、竹、梅。' },
  { id: 2004, subject: 'chinese', type: 'single', title: '“三人行，必有我师焉”出自哪部作品？', options: ['《论语》', '《孟子》', '《大学》', '《中庸》'], answer: '《论语》', points: 5, explanation: '这是孔子的名言，记录在《论语》中。' },
  { id: 2005, subject: 'chinese', type: 'single', title: '下列词语中没有错别字的一项是？', options: ['穿流不息', '变本加利', '重峦叠嶂', '再接再励'], answer: '重峦叠嶂', points: 5, explanation: '川流不息、变本加厉、再接再厉。' },

  // --- 数学题库 ---
  { id: 3001, subject: 'math', type: 'single', title: '1 + 1 等于多少？', options: ['1', '2', '3', '4'], answer: '2', points: 5, explanation: '基础加法运算。' },
  { id: 3002, subject: 'math', type: 'single', title: '一个正方形的边长是 4，它的面积是？', options: ['8', '12', '16', '20'], answer: '16', points: 5, explanation: '正方形面积 = 边长 × 边长 = 4 × 4 = 16。' },
  { id: 3003, subject: 'math', type: 'single', title: '三角形的内角和是多少度？', options: ['90', '180', '270', '360'], answer: '180', points: 5, explanation: '任意三角形的内角和均为 180 度。' },
  { id: 3004, subject: 'math', type: 'single', title: '2 的 3 次方是多少？', options: ['6', '8', '9', '12'], answer: '8', points: 5, explanation: '2 * 2 * 2 = 8。' },
  { id: 3005, subject: 'math', type: 'single', title: '下列哪个数是质数？', options: ['4', '9', '11', '15'], answer: '11', points: 5, explanation: '11 只能被 1 和 11 整除。' },
];
