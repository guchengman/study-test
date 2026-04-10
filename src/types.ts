export type QuestionType = 'single' | 'multiple' | 'programming';

export type SubjectId = 'python' | 'english' | 'chinese' | 'math';

export interface Subject {
  id: SubjectId;
  name: string;
  icon: string;
  welcomeTitle: string;
  welcomeDesc: string;
}

export const SUBJECTS: Subject[] = [
  { 
    id: 'python', 
    name: 'Python 考试', 
    icon: '🐍', 
    welcomeTitle: 'Python 编程能力自测', 
    welcomeDesc: '涵盖基础语法、数据类型、控制流及函数等核心知识点' 
  },
  { 
    id: 'english', 
    name: '英语考试', 
    icon: '🔤', 
    welcomeTitle: '英语综合能力测试', 
    welcomeDesc: '包含词汇、语法、阅读理解等全方位英语练习' 
  },
  { 
    id: 'chinese', 
    name: '语文考试', 
    icon: '📖', 
    welcomeTitle: '语文素养水平测试', 
    welcomeDesc: '涉及文学常识、古诗词、现代文阅读等内容' 
  },
  { 
    id: 'math', 
    name: '数学考试', 
    icon: '📐', 
    welcomeTitle: '数学逻辑思维挑战', 
    welcomeDesc: '从基础算术到逻辑推理，全面锻炼数学思维' 
  },
];

export interface Question {
  id: number;
  subject: SubjectId;
  type: QuestionType;
  title: string;
  code?: string;
  options?: string[];
  answer: string | string[];
  explanation?: string;
  points: number;
  input?: string; // For questions that mention specific input
}

export interface ExamResult {
  score: number;
  totalPoints: number;
  answers: Record<number, string | string[]>;
  correctness: Record<number, boolean>;
}

export interface AISettings {
  deepseekKey?: string;
  qwenKey?: string;
  zhipuKey?: string;
  customEndpoint?: string;
  customKey?: string;
}
