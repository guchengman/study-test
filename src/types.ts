export type QuestionType = 'single' | 'multiple' | 'programming';

export interface Question {
  id: number;
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
