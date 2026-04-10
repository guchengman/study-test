import { Question } from './types';

export const QUESTIONS: Question[] = [
  {
    id: 1,
    subject: 'python',
    type: 'single',
    title: 'Python 文件的后缀名（扩展名）通常是什么？',
    options: ['.txt', '.py', '.doc', '.exe'],
    answer: '.py',
    points: 5
  },
  {
    id: 2,
    subject: 'python',
    type: 'single',
    title: '在 Python 中，想要在屏幕上打印出“你好”，应该使用哪个指令？',
    options: ['input("你好")', 'print("你好")', 'output("你好")', 'write("你好")'],
    answer: 'print("你好")',
    points: 5
  },
  {
    id: 3,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'a = 10\nb = 5\nprint(a + b)',
    options: ['10', '5', '15', '105'],
    answer: '15',
    points: 5
  },
  {
    id: 4,
    subject: 'python',
    type: 'single',
    title: '在 Python 中，用来表示乘法的符号是？',
    options: ['x', 'X', '*', '·'],
    answer: '*',
    points: 5
  },
  {
    id: 5,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，屏幕上会打印几次“Hi”？',
    code: 'for i in range(3):\n    print("Hi")',
    options: ['1 次', '2 次', '3 次', '4 次'],
    answer: '3 次',
    points: 5
  },
  {
    id: 6,
    subject: 'python',
    type: 'single',
    title: '下列哪个选项定义的变量是一个字符串？',
    options: ['a = 100', 'a = "100"', 'a = 10 + 20', 'a = 0.5'],
    answer: 'a = "100"',
    points: 5
  },
  {
    id: 7,
    subject: 'python',
    type: 'single',
    title: '在 Python 中，代码中的注释（不被运行的说明）通常以什么符号开头？',
    options: ['//', '/*', '#', '--'],
    answer: '#',
    points: 5
  },
  {
    id: 8,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'score = 90\nif score >= 60:\n    print("及格")\nelse:\n    print("不及格")',
    options: ['及格', '不及格', 'score', '90'],
    answer: '及格',
    points: 5
  },
  {
    id: 9,
    subject: 'python',
    type: 'single',
    title: 'range(5) 生成的数字序列是从几开始的？',
    options: ['0', '1', '5', '没有数字'],
    answer: '0',
    points: 5
  },
  {
    id: 10,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'print("1" + "2")',
    options: ['3', '12', '"3"', '报错'],
    answer: '12',
    points: 5
  },
  {
    id: 11,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，变量 a 的最终值是？',
    code: 'a = 5\na = a + 2\nprint(a)',
    options: ['2', '5', '7', '52'],
    answer: '7',
    points: 5
  },
  {
    id: 12,
    subject: 'python',
    type: 'single',
    title: '想要统计字符串 "Python" 有几个字符，应该使用哪个函数？',
    options: ['len()', 'size()', 'count()', 'sum()'],
    answer: 'len()',
    points: 5
  },
  {
    id: 13,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'print("A" * 3)',
    options: ['A3', 'AAA', 'A+A+A', '报错'],
    answer: 'AAA',
    points: 5
  },
  {
    id: 14,
    subject: 'python',
    type: 'single',
    title: '在 Python 中，if 语句的末尾必须加上什么符号？',
    options: ['分号 ;', '句号 。', '冒号 :', '感叹号 !'],
    answer: '冒号 :',
    points: 5
  },
  {
    id: 15,
    subject: 'python',
    type: 'single',
    title: '下列哪个选项可以从键盘接收用户输入的信息？',
    options: ['print()', 'input()', 'get()', 'read()'],
    answer: 'input()',
    points: 5
  },
  {
    id: 16,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'print(10 - 2 * 3)',
    options: ['24', '4', '10', '8'],
    answer: '4',
    points: 5
  },
  {
    id: 17,
    subject: 'python',
    type: 'single',
    title: '在 Python 中，缩进（代码前面的空格）的作用是什么？',
    options: ['为了好看', '没有作用', '表示代码的归属关系（如循环体）', '防止报错'],
    answer: '表示代码的归属关系（如循环体）',
    points: 5
  },
  {
    id: 18,
    subject: 'python',
    type: 'single',
    title: '运行下列代码，输出的结果是？',
    code: 'a = "小明"\nprint(a)',
    options: ['a', '小明', '"小明"', '报错'],
    answer: '小明',
    points: 5
  },
  {
    id: 19,
    subject: 'python',
    type: 'single',
    title: '下列哪个表达式的结果是 True（正确）？',
    options: ['5 > 10', '3 == 3', '10 < 2', '8 != 8'],
    answer: '3 == 3',
    points: 5
  },
  {
    id: 20,
    subject: 'python',
    type: 'single',
    title: 'Python 是由谁创造的？（常识题）',
    options: ['比尔·盖茨', '吉多·范罗苏姆', '乔布斯', '马斯克'],
    answer: '吉多·范罗苏姆',
    points: 5
  }
];
