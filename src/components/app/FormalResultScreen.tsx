/**
 * 正式考试成绩 + 错题回顾
 *
 * 顶部展示本次得分 / 满分 / 是否及格 / 正确率。
 * 错题回顾：过滤 is_correct === false（答错）或 is_correct === null（编程题待定）的题，
 * 透出 user_answer / correct_answer / explanation；编程题标注「待人工判分」。
 * 题目正文通过 GET /api/exams/attempts/:id 获取（含标题 + 作答结果）。
 */
import React from 'react';
import { motion } from 'motion/react';
import { Trophy, CheckCircle2, XCircle, Clock, BookOpen, History, List } from 'lucide-react';
import { examApi } from '../../services/examApi';
import type { ExamAttemptQuestion } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { VirtualList, useVirtualViewportHeight } from '../ui/VirtualList';

/** 将单个答案按选项拼成「字母. 文本」；已经是该格式或非字母则原样返回 */
function formatLetterAnswer(label: string, options?: string[]): string {
  const s = (label ?? '').toString().trim();
  if (!s) return label;
  // 已经是「A. xxx」格式（兼容前端历史上已拼好的 user_answer）
  if (/^[A-Z]\.\s/.test(s)) return s;
  if (options && options.length) {
    const m = s.match(/^([A-Z])/i);
    if (m) {
      const idx = m[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        return `${m[1].toUpperCase()}. ${options[idx]}`;
      }
    }
  }
  return s;
}

/**
 * 在原 formatAnswer 基础上叠加字母→选项文本的补全。
 * - null/空 → 「（未作答）」
 * - 数组 → 每项分别补全后用「、」连接
 * - 单值：若是字母且该题有 options，则补成「字母. 文本」；否则原样回显
 */
function formatAnswerWithOption(ans: string | string[] | null | undefined, options?: string[]): string {
  if (ans === null || ans === undefined) return '（未作答）';
  if (Array.isArray(ans)) {
    if (ans.length === 0) return '（未作答）';
    return ans.map((a) => formatLetterAnswer(a, options)).join('、');
  }
  const out = formatLetterAnswer(ans, options);
  return out || '（未作答）';
}

export interface FormalResultScreenProps {
  attemptId: number;
  examTitle: string;
  passScore: number;
  totalPoints: number;
  score: number;
  correctCount: number;
  totalCount: number;
  onViewHistory: () => void;
  onBackToList: () => void;
}

export function FormalResultScreen(props: FormalResultScreenProps) {
  const { attemptId, examTitle, passScore, totalPoints, score, correctCount, totalCount, onViewHistory, onBackToList } = props;

  const [questions, setQuestions] = React.useState<ExamAttemptQuestion[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // 错题数超过阈值时，回顾列表改为窗口化滚动（阈值内维持整页流式渲染）
  const viewportHeight = useVirtualViewportHeight();

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    examApi
      .getAttempt(attemptId)
      .then((res) => {
        if (!active) return;
        setQuestions(res.questions || []);
      })
      .catch((e: any) => {
        if (!active) return;
        setError(e?.message || '加载答卷详情失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attemptId]);

  const passed = score >= passScore;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const wrongQuestions = questions.filter((q) => q.is_correct === false || q.is_correct === null);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
      {/* 成绩卡片 */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${passed ? 'bg-emerald-100' : 'bg-rose-100'}`}>
          <Trophy size={40} className={passed ? 'text-emerald-600' : 'text-rose-500'} />
        </div>
        <div className="text-2xl font-bold text-slate-800">{examTitle}</div>
        <div className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-bold ${passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {passed ? '已及格' : '未及格'}（及格线 {passScore} 分）
        </div>

        <div className="mt-6 flex items-end justify-center gap-1">
          <span className="text-5xl font-black text-blue-600 tabular-nums">{score}</span>
          <span className="text-xl text-slate-400 mb-1">/ {totalPoints}</span>
        </div>
        <div className="mt-3 text-slate-500 text-sm">
          正确 {correctCount} / {totalCount} 题 · 正确率 {accuracy}%
        </div>
      </div>

      {/* 错题回顾 */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={18} className="text-blue-600" />
          <span className="font-bold text-slate-700">错题回顾</span>
          <span className="text-xs text-slate-400">（含编程题待定项，已透出正确答案与解析）</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
            <Spinner size="sm" className="text-blue-500" />
            加载答卷详情...
          </div>
        )}
        {error && <p className="text-rose-500 text-sm py-4 text-center">{error}</p>}

        {!loading && !error && wrongQuestions.length === 0 && (
          <EmptyState title={questions.length === 0 ? '暂无错题记录。' : '🎉 本次考试全部答对，没有错题！'} />
        )}

        {!loading && !error && wrongQuestions.length > 0 && (
          <VirtualList
            items={wrongQuestions}
            itemKey={(q) => q.id}
            gap={16}
            estimatedItemHeight={240}
            viewportHeight={viewportHeight}
            renderItem={(q, idx) => (
              <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-400 mt-0.5">#{idx + 1}</span>
                  <MarkdownRenderer content={q.title} className="font-bold text-slate-800 text-sm flex-1" />
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {q.type === 'programming' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-full">
                      <Clock size={12} /> 待人工判分
                    </span>
                  ) : q.is_correct === false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-full">
                      <XCircle size={12} /> 答错
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-400">{q.points} 分 · 本题得分 {q.earned}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-white border border-rose-100">
                    <div className="text-[11px] font-bold text-rose-500 mb-1">你的答案</div>
                    {/* 答案内含选项原文，可能带 LaTeX，走 MarkdownRenderer 兜底 */}
                    <MarkdownRenderer
                      content={formatAnswerWithOption(q.user_answer, q.options)}
                      className="text-slate-600 font-mono break-words"
                    />
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-emerald-100">
                    <div className="text-[11px] font-bold text-emerald-500 mb-1">正确答案</div>
                    <MarkdownRenderer
                      content={formatAnswerWithOption(q.correct_answer, q.options)}
                      className="text-slate-600 font-mono break-words"
                    />
                  </div>
                </div>

                {q.explanation ? (
                  <div className="mt-2 p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-blue-500 mb-1">
                      <CheckCircle2 size={12} /> 解析
                    </div>
                    <MarkdownRenderer content={q.explanation} className="text-slate-600 text-sm leading-relaxed" />
                  </div>
                ) : null}
              </div>
            )}
          />
        )}
      </div>

      {/* 操作 */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onViewHistory}
          className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
        >
          <History size={18} /> 我的历史
        </button>
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
        >
          <List size={18} /> 返回列表
        </button>
      </div>
    </motion.div>
  );
}
