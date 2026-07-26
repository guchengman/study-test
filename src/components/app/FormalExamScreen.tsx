/**
 * 正式考试答题界面
 *
 * 复用 ExamScreen 的题干 / 选项渲染模式，但刻意去掉：
 *  - 实时反馈（showFeedback）、收藏（Star）、剔除（Trash2）、搜索（Search）
 *  - 错题强化 / 全量 / 随机练习等练习态特性
 * 仅保留：进度条、题型徽标、倒计时、题干、单/多选/编程作答、上一题/下一题/交卷。
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, AlarmClock, Send, XCircle } from 'lucide-react';
import type { ExamAvailableItem, ExamQuestionDetail } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { ConfirmModal } from '../ConfirmModal';

/** 秒数 → mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface FormalExamScreenProps {
  exam: ExamAvailableItem;
  questions: ExamQuestionDetail[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  userAnswers: Record<number, string | string[]>;
  setAnswer: (questionId: number, answer: string | string[]) => void;
  timeLeft: number;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

function typeLabel(type: string, options?: string[]): string {
  if (type === 'single') {
    if (options && options.length === 2 && ['正确', '错误'].every((o) => options.includes(o))) return '判断题';
    return '单选题';
  }
  if (type === 'multiple') return '多选题';
  return '编程题';
}

export function FormalExamScreen(props: FormalExamScreenProps) {
  const {
    exam,
    questions,
    currentIndex,
    setCurrentIndex,
    userAnswers,
    setAnswer,
    timeLeft,
    submitting,
    onBack,
    onSubmit,
  } = props;

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const currentQuestion = questions[currentIndex];

  if (questions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
      >
        <h3 className="text-xl font-bold text-slate-700 mb-2">本场考试暂无题目</h3>
        <p className="text-slate-500 mb-6">试卷可能还未配置题目，请联系出题人。</p>
        <button onClick={onBack} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
          返回列表
        </button>
      </motion.div>
    );
  }

  if (!currentQuestion) return null;

  const qid = currentQuestion.id;
  const userAns = userAnswers[qid];
  const isSelected = (option: string): boolean =>
    currentQuestion.type === 'single'
      ? typeof userAns === 'string' && userAns.trim() === option.trim()
      : Array.isArray(userAns)
        ? userAns.map((s) => s.trim()).includes(option.trim())
        : false;

  const toggleMultiple = (option: string) => {
    const arr = Array.isArray(userAns) ? userAns.map((s) => s.trim()) : [];
    if (arr.includes(option.trim())) {
      setAnswer(qid, arr.filter((o) => o !== option.trim()));
    } else {
      setAnswer(qid, [...arr, option.trim()]);
    }
  };

  const urgent = timeLeft <= 60;
  const isLast = currentIndex === questions.length - 1;

  return (
    <>
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-4 sm:space-y-5"
      >
      {/* 顶部：返回首页（图库同款图标）+ 退出 + 结束考试 + 倒计时 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="返回首页"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => setShowExitConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all text-sm font-bold"
          >
            <ChevronLeft size={18} /> 退出
          </button>
          <button
            disabled={submitting}
            onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XCircle size={18} /> 结束考试
          </button>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold ${
            urgent ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-white'
          }`}
        >
          <AlarmClock size={18} />
          <span className="tabular-nums">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-slate-200 h-1.5 sm:h-2 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-blue-600"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full uppercase tracking-wider">
              {typeLabel(currentQuestion.type, currentQuestion.options)}
            </span>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
              {currentQuestion.points} 分
            </span>
            <span className="text-xs text-slate-400">第 {currentIndex + 1} / {questions.length} 题</span>
          </div>
        </div>

        <MarkdownRenderer content={currentQuestion.title} className="text-xl font-bold mb-6 leading-snug" />

        <div className="space-y-3">
          {currentQuestion.type === 'programming' ? (
            <textarea
              value={(userAns as string) || ''}
              onChange={(e) => setAnswer(qid, e.target.value)}
              placeholder="在此输入你的 Python 代码..."
              className="w-full h-48 p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none font-mono text-sm transition-all resize-none"
            />
          ) : (
            <div className="space-y-3">
              {currentQuestion.options?.map((option, i) => {
                const selected = isSelected(option);
                const borderClass = selected
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50';
                const dotClass = selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200';
                return (
                  <button
                    key={i}
                    onClick={() =>
                      currentQuestion.type === 'single' ? setAnswer(qid, option) : toggleMultiple(option)
                    }
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group ${borderClass}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${dotClass}`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                    <MarkdownRenderer
                      content={option}
                      className={`flex-1 font-medium text-left ${selected ? 'text-blue-900' : 'text-slate-600'}`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 导航 + 交卷 */}
      <div className="flex items-center justify-between pt-2 gap-3">
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(currentIndex - 1)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-all"
        >
          <ChevronLeft size={20} /> 上一题
        </button>

        {isLast ? (
          <button
            disabled={submitting}
            onClick={onSubmit}
            className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-60"
          >
            <Send size={18} /> {submitting ? '提交中...' : '交卷'}
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex(currentIndex + 1)}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            下一题 <ChevronRight size={20} />
          </button>
        )}
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          正在提交并评分...
        </div>
      )}

      </motion.div>

      <ConfirmModal
        isOpen={showEndConfirm}
        type="danger"
        title="结束考试"
        message={'确定结束考试并交卷吗？\n交卷后将立即评分，且无法再修改答案。'}
        confirmText="结束并交卷"
        cancelText="再想想"
        onConfirm={() => {
          setShowEndConfirm(false);
          onSubmit();
        }}
        onCancel={() => setShowEndConfirm(false)}
      />

      <ConfirmModal
        isOpen={showExitConfirm}
        type="warning"
        title="退出考试"
        message={'确定退出考试？已作答内容会自动保留，可稍后继续。'}
        confirmText="退出"
        cancelText="继续答题"
        onConfirm={() => {
          setShowExitConfirm(false);
          onBack();
        }}
        onCancel={() => setShowExitConfirm(false)}
      />
    </>
  );
}
