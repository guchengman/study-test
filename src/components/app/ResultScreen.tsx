/**
 * 考试结果与逐题解析
 */
import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, CheckCircle2, XCircle, Star, Award } from 'lucide-react';
import type { Question, ExamResult, MistakeRecord } from '../../types';
import { formatTime } from '../../utils/examScoring';
import { MarkdownRenderer } from '../MarkdownRenderer';

export interface ResultScreenProps {
  finalResult: ExamResult;
  examQuestions: Question[];
  mistakeRecords: MistakeRecord[];
  masteredIds: number[];
  elapsedTime: number;
  onBackWelcome: () => void;
}

export function ResultScreen(props: ResultScreenProps) {
  const { finalResult, examQuestions, mistakeRecords, masteredIds, elapsedTime, onBackWelcome } = props;

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-5 sm:space-y-6"
    >
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />

        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-slate-400 mb-2 uppercase tracking-widest">考试结果</h2>
          <div className="text-7xl font-black text-slate-900 mb-4 tabular-nums">
            {finalResult.score}
            <span className="text-2xl text-slate-300 font-bold ml-2">/ 100</span>
          </div>

          <div className="flex justify-center gap-8 mb-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-500">{Object.values(finalResult.correctness).filter(Boolean).length}</div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">正确</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-rose-500">{Object.values(finalResult.correctness).filter((c) => !c).length}</div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">错误</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{formatTime(elapsedTime)}</div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">用时</div>
            </div>
          </div>

          <p className="text-slate-500 max-w-sm mx-auto mb-5 sm:mb-6 text-sm">
            {finalResult.score >= 90
              ? '太棒了!错题已更新,继续保持。'
              : finalResult.score >= 60
                ? '表现不错!错题已加入错题本,记得复习。'
                : '别灰心,错题本会帮你记录薄弱点,多练几次!'}
          </p>

          <div className="flex flex-col items-center gap-4 sm:gap-5">
            <button
              onClick={onBackWelcome}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
            >
              <ChevronLeft size={22} /> 返回上一级
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-lg sm:text-xl font-bold px-2">题目解析</h3>
        {examQuestions.map((q, idx) => {
          const isCorrect = finalResult.correctness[q.id];
          const mistakeRecord = mistakeRecords.find((r) => r.questionId === q.id);

          return (
            <div
              key={q.id}
              className={`bg-white rounded-2xl p-4 sm:p-5 border-l-4 shadow-sm ${isCorrect ? 'border-emerald-500' : 'border-rose-500'}`}
            >
              <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-400">题目 {idx + 1}</span>
                    {isCorrect ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                        <CheckCircle2 size={14} /> 正确
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 text-xs font-bold">
                        <XCircle size={14} /> 错误
                      </span>
                    )}
                    {mistakeRecord && isCorrect && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black uppercase">
                        连续对 {mistakeRecord.consecutiveCorrect} 次
                      </span>
                    )}
                    {mistakeRecords.some((r) => r.questionId === q.id) && (
                      <div className="flex items-center gap-0.5 ml-1">
                        {[1, 2, 3].map((star) => {
                          const record = mistakeRecords.find((r) => r.questionId === q.id);
                          const count = record?.consecutiveCorrect || 0;
                          return (
                            <Star
                              key={star}
                              size={10}
                              className={star <= count ? 'text-amber-500 fill-amber-500' : 'text-slate-200'}
                            />
                          );
                        })}
                      </div>
                    )}
                    {masteredIds.includes(q.id) && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1">
                        <Award size={10} /> 已掌握
                      </span>
                    )}
                  </div>
                  <MarkdownRenderer content={q.title} className="font-bold text-slate-800 leading-snug" />
                </div>
              </div>

              <div className="space-y-2 sm:space-y-3 text-sm">
                <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl text-sm">
                  <span className="text-slate-400 font-bold">你的回答:</span>
                  <MarkdownRenderer
                    content={
                      Array.isArray(finalResult.answers[q.id])
                        ? (finalResult.answers[q.id] as string[]).join(', ')
                        : (finalResult.answers[q.id] as string) || '(未回答)'
                    }
                    className={`inline ${isCorrect ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}`}
                  />
                </div>
                {!isCorrect && (
                  <div className="p-2.5 sm:p-3 bg-blue-50 rounded-xl text-sm">
                    <span className="text-blue-400 font-bold">正确答案:</span>
                    <MarkdownRenderer
                      content={Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}
                      className="inline text-blue-700 font-medium"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
