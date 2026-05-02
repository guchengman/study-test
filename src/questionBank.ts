import { Question } from './types';

// 项目初始题库已清空 - 用户需要自己导入题库
// 用户导入的题库会保存在localStorage中，重启或更新软件都不会丢失
export const QUESTION_BANK: Question[] = [];
