/**
 * 考试中：进度、题干、选项、全量模式工具条与导航
 */
import React from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Upload,
  Search,
  X,
  CopyCheck,
  Filter,
  Download,
  AlertTriangle,
  Star,
  Trash2,
  BookOpen,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Question, MistakeRecord } from '../../types';

export interface ExamScreenProps {
  examQuestions: Question[];
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  currentQuestion: Question | undefined;
  userAnswers: Record<number, string | string[]>;
  handleAnswerChange: (questionId: number, answer: string | string[]) => void;
  toggleMultipleAnswer: (questionId: number, option: string) => void;
  showFeedback: boolean;
  setShowFeedback: (v: boolean) => void;
  isRandomMode: boolean;
  isMistakeMode: boolean;
  isFullMode: boolean;
  favoriteIds: number[];
  mistakeRecords: MistakeRecord[];
  toggleFavorite: (id: number) => void | Promise<void>;
  removeQuestion: (id: number) => void | Promise<void>;
  confirmingDelete: boolean;
  setConfirmingDelete: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (v: boolean) => void;
  confirmingDeduplicate: boolean;
  setConfirmingDeduplicate: (v: boolean) => void;
  deduplicateBank: () => void;
  confirmingFilter: boolean;
  setConfirmingFilter: (v: boolean) => void;
  filterObjectiveOnly: () => void;
  currentUser: string | null;
  exportFormat: 'csv' | 'json';
  setExportFormat: (v: 'csv' | 'json') => void;
  exportQuestionBank: () => void;
  openImportModal: () => void;
  checkProgrammingAnswer: () => void;
  checkMultipleAnswer: () => void;
  calculateResult: () => void | Promise<void>;
  setStatus: (s: 'welcome' | 'exam' | 'result' | 'mistakes') => void;
  setIsImportModalOpen: (v: boolean) => void;
}

export function ExamScreen(props: ExamScreenProps) {
  const {
    examQuestions,
    currentIndex,
    setCurrentIndex,
    currentQuestion,
    userAnswers,
    handleAnswerChange,
    toggleMultipleAnswer,
    showFeedback,
    setShowFeedback,
    isRandomMode,
    isMistakeMode,
    isFullMode,
    favoriteIds,
    mistakeRecords,
    toggleFavorite,
    removeQuestion,
    confirmingDelete,
    setConfirmingDelete,
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    confirmingDeduplicate,
    setConfirmingDeduplicate,
    deduplicateBank,
    confirmingFilter,
    setConfirmingFilter,
    filterObjectiveOnly,
    currentUser,
    exportFormat,
    setExportFormat,
    exportQuestionBank,
    openImportModal,
    checkProgrammingAnswer,
    checkMultipleAnswer,
    calculateResult,
    setStatus,
    setIsImportModalOpen,
  } = props;

  if (examQuestions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
      >
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Database size={40} className="text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-700 mb-2">题库为空</h3>
        <p className="text-slate-500 mb-6">当前科目还没有题目，快去导入一些吧！</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              setStatus('welcome');
              setIsImportModalOpen(true);
            }}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Upload size={18} /> 导入题目
          </button>
          <button onClick={() => setStatus('welcome')} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
            返回首页
          </button>
        </div>
      </motion.div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <motion.div
      key={currentIndex}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4 sm:space-y-5"
    >
      <div className="w-full bg-slate-200 h-1.5 sm:h-2 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-blue-600"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / examQuestions.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStatus('welcome')}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="返回上一级"
              >
                <ChevronLeft size={22} />
              </button>
            </div>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full uppercase tracking-wider">
              {currentQuestion.type === 'single' &&
              currentQuestion.options?.length === 2 &&
              ['正确', '错误'].every((o) => currentQuestion.options!.includes(o))
                ? '判断题'
                : currentQuestion.type === 'single'
                  ? '单选题'
                  : currentQuestion.type === 'multiple'
                    ? '多选题'
                    : '编程题'}
            </span>
            {isRandomMode && (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">随机练习</span>
            )}
            {isMistakeMode && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-full">错题强化</span>
                <div className="flex items-center gap-0.5 bg-slate-100 px-2 py-1 rounded-full">
                  {[1, 2, 3].map((star) => {
                    const record = mistakeRecords.find((r) => r.questionId === currentQuestion.id);
                    const count = record?.consecutiveCorrect || 0;
                    return (
                      <Star key={star} size={12} className={star <= count ? 'text-amber-500 fill-amber-500' : 'text-slate-300'} />
                    );
                  })}
                </div>
              </div>
            )}
            {examQuestions.length > 0 && examQuestions.every((eq) => favoriteIds.includes(eq.id)) && (
              <span className="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full">收藏复习</span>
            )}
            {isFullMode && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-50 text-purple-600 text-xs font-bold rounded-full">全量练习</span>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 ml-2">
                  {isSearchOpen ? (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      className="flex items-center gap-1 px-2"
                    >
                      <Search size={14} className="text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索题目..."
                        className="bg-transparent border-none outline-none text-xs w-24 sm:w-40 py-1"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setIsSearchOpen(false);
                        }}
                      >
                        <X size={14} className="text-slate-400 hover:text-rose-500" />
                      </button>
                    </motion.div>
                  ) : (
                    <button
                      onClick={() => setIsSearchOpen(true)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 transition-colors"
                      title="搜索题目"
                    >
                      <Search size={16} />
                    </button>
                  )}
                </div>

                {confirmingDeduplicate ? (
                  <div className="flex items-center gap-1.5 bg-amber-50 rounded-md px-2 py-1 border border-amber-100 animate-in fade-in zoom-in duration-200">
                    <span className="text-[10px] font-bold text-amber-700">确认去重?</span>
                    <button onClick={deduplicateBank} className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      是
                    </button>
                    <button onClick={() => setConfirmingDeduplicate(false)} className="text-[10px] font-black text-slate-400 hover:text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                      否
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDeduplicate(true)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md hover:bg-slate-200 transition-colors"
                    title="一键去重"
                  >
                    <CopyCheck size={12} /> 去重
                  </button>
                )}

                {confirmingFilter ? (
                  <div className="flex items-center gap-1.5 bg-amber-50 rounded-md px-2 py-1 border border-amber-100 animate-in fade-in zoom-in duration-200">
                    <span className="text-[10px] font-bold text-amber-700">确认仅客观题?</span>
                    <button onClick={filterObjectiveOnly} className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      是
                    </button>
                    <button onClick={() => setConfirmingFilter(false)} className="text-[10px] font-black text-slate-400 hover:text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                      否
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingFilter(true)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md hover:bg-slate-200 transition-colors"
                    title="仅保留选择/判断"
                  >
                    <Filter size={12} /> 仅客观题
                  </button>
                )}

                <div className="w-px h-4 bg-slate-200" />

                <button
                  onClick={openImportModal}
                  disabled={!currentUser}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${
                    currentUser ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                  title="导入题库"
                >
                  <Upload size={12} /> 导入
                </button>

                <div className="flex items-center rounded-md overflow-hidden border border-green-200">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
                    className="bg-green-50 text-green-700 text-[10px] font-bold px-1.5 py-1 outline-none cursor-pointer hover:bg-green-100 transition-colors"
                    title="导出格式"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                  <button
                    onClick={exportQuestionBank}
                    className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-600 text-[10px] font-bold hover:bg-green-200 transition-colors"
                    title="导出题库"
                  >
                    <Download size={12} /> 导出
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {confirmingDelete ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200 rounded-2xl shadow-lg shadow-rose-100/50"
              >
                <div className="flex items-center justify-center w-8 h-8 bg-rose-100 rounded-full">
                  <AlertTriangle size={16} className="text-rose-600" />
                </div>
                <span className="text-xs font-bold text-rose-700">确认剔除此题?</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => removeQuestion(currentQuestion.id)}
                    className="px-3 py-1.5 bg-gradient-to-b from-rose-500 to-rose-600 text-white text-[11px] font-bold rounded-lg hover:from-rose-600 hover:to-rose-700 transition-all shadow-md shadow-rose-200 active:scale-95"
                  >
                    确定剔除
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="px-3 py-1.5 bg-white text-slate-600 text-[11px] font-bold rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                  >
                    取消
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleFavorite(currentQuestion.id)}
                  className={`flex items-center gap-1.5 transition-colors text-xs font-bold uppercase ${
                    favoriteIds.includes(currentQuestion.id) ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                  }`}
                >
                  <Star size={14} fill={favoriteIds.includes(currentQuestion.id) ? 'currentColor' : 'none'} />
                  {favoriteIds.includes(currentQuestion.id) ? '已收藏' : '收藏'}
                </button>
                {(isFullMode || isMistakeMode) && (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition-colors text-xs font-bold uppercase"
                  >
                    <Trash2 size={14} /> 剔除此题
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <h3 className="text-xl font-bold mb-6 leading-snug">{currentQuestion.title}</h3>

        {isFullMode && searchQuery && (
          <div className="mb-6 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">搜索结果:</div>
            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
              {examQuestions.filter((q) => q.title.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                examQuestions
                  .filter((q) => q.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        const newIndex = examQuestions.findIndex((eq) => eq.id === q.id);
                        setCurrentIndex(newIndex);
                        setShowFeedback(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        currentQuestion.id === q.id ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="opacity-50 mr-2">#{examQuestions.findIndex((eq) => eq.id === q.id) + 1}</span>
                      {q.title.length > 50 ? q.title.substring(0, 50) + '...' : q.title}
                    </button>
                  ))
              ) : (
                <div className="text-center py-4 text-slate-400 text-xs">未找到匹配题目</div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {currentQuestion.type === 'programming' ? (
            <div className="space-y-4">
              <textarea
                disabled={showFeedback && (isMistakeMode || isFullMode || isRandomMode)}
                value={(userAnswers[currentQuestion.id] as string) || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                placeholder="在此输入你的 Python 代码..."
                className="w-full h-48 p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none font-mono text-sm transition-all resize-none"
              />
              {!showFeedback && isRandomMode && (
                <button onClick={checkProgrammingAnswer} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">
                  提交并查看解析
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {currentQuestion.options?.map((option, i) => {
                const userAns = userAnswers[currentQuestion.id];
                const qAns = currentQuestion.answer;

                const isSelected =
                  currentQuestion.type === 'single'
                    ? typeof userAns === 'string' && typeof option === 'string'
                      ? userAns.trim() === option.trim()
                      : userAns === option
                    : Array.isArray(userAns)
                      ? userAns.map((s) => s.trim()).includes(option.trim())
                      : false;

                let isCorrect = false;
                if (currentQuestion.type === 'single') {
                  const optTrim = option.trim();
                  const ansTrim = typeof qAns === 'string' ? qAns.trim() : String(qAns);

                  if (optTrim === ansTrim) {
                    isCorrect = true;
                  } else if (/^[A-Z]$/.test(ansTrim.toUpperCase())) {
                    const labelIndex = ansTrim.toUpperCase().charCodeAt(0) - 65;
                    if (labelIndex === i) isCorrect = true;
                  }
                } else if (currentQuestion.type === 'multiple') {
                  const optTrim = option.trim();
                  const targetAns = Array.isArray(qAns) ? qAns.map((s) => s.trim()) : [String(qAns).trim()];

                  if (targetAns.includes(optTrim)) {
                    isCorrect = true;
                  } else {
                    const labelIndices = targetAns.filter((a) => /^[A-Z]$/.test(a.toUpperCase())).map((a) => a.toUpperCase().charCodeAt(0) - 65);
                    if (labelIndices.includes(i)) isCorrect = true;
                  }
                }

                let borderClass = 'border-slate-100 hover:border-slate-200 hover:bg-slate-50';
                let dotClass = 'bg-slate-100 text-slate-400 group-hover:bg-slate-200';

                if (isSelected) {
                  borderClass = 'border-blue-600 bg-blue-50/50';
                  dotClass = 'bg-blue-600 text-white';
                }

                if (showFeedback && (isMistakeMode || isFullMode || isRandomMode)) {
                  if (isCorrect) {
                    borderClass = 'border-emerald-500 bg-emerald-50/50';
                    dotClass = 'bg-emerald-500 text-white';
                  } else if (isSelected) {
                    borderClass = 'border-rose-500 bg-rose-50/50';
                    dotClass = 'bg-rose-500 text-white';
                  }
                }

                return (
                  <button
                    key={i}
                    disabled={showFeedback && (isMistakeMode || isFullMode || isRandomMode)}
                    onClick={() =>
                      currentQuestion.type === 'single'
                        ? handleAnswerChange(currentQuestion.id, option)
                        : toggleMultipleAnswer(currentQuestion.id, option)
                    }
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group ${borderClass}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${dotClass}`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-slate-600'}`}>{option}</span>
                    {showFeedback && (isMistakeMode || isFullMode || isRandomMode) && isCorrect && (
                      <CheckCircle2 size={20} className="ml-auto text-emerald-500" />
                    )}
                    {showFeedback && (isMistakeMode || isFullMode || isRandomMode) && isSelected && !isCorrect && (
                      <XCircle size={20} className="ml-auto text-rose-500" />
                    )}
                  </button>
                );
              })}

              {currentQuestion.type === 'multiple' && !showFeedback && isRandomMode && (
                <button
                  onClick={() => setShowFeedback(true)}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all mt-4"
                >
                  确认选择并查看解析
                </button>
              )}
            </div>
          )}
        </div>

        {showFeedback && (isMistakeMode || isFullMode || isRandomMode) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-100"
          >
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={18} className="text-blue-600" />
              <span className="font-bold text-slate-700">答案解析</span>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              正确答案:
              <span className="font-bold text-emerald-600">
                {Array.isArray(currentQuestion.answer) ? currentQuestion.answer.join('、') : currentQuestion.answer}
              </span>
            </p>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed italic">
              {currentQuestion.explanation || '暂无详细解析,请牢记正确答案。'}
            </p>
          </motion.div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          disabled={currentIndex === 0 || ((isMistakeMode || isFullMode || isRandomMode) && showFeedback)}
          onClick={() => setCurrentIndex((prev) => prev - 1)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-all"
        >
          <ChevronLeft size={20} /> 上一题
        </button>

        {(isMistakeMode || isFullMode || isRandomMode) && !showFeedback && currentQuestion.type === 'multiple' && (
          <button onClick={checkMultipleAnswer} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
            确认答案
          </button>
        )}

        {(isMistakeMode || isFullMode || isRandomMode) && !showFeedback && currentQuestion.type === 'programming' && (
          <button onClick={checkProgrammingAnswer} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
            确认代码
          </button>
        )}

        {(isMistakeMode || isFullMode || isRandomMode ? showFeedback : true) &&
          (currentIndex === examQuestions.length - 1 ? (
            <button onClick={calculateResult} className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
              提交试卷
            </button>
          ) : (
            <button
              onClick={() => {
                setCurrentIndex((prev) => prev + 1);
                setShowFeedback(false);
              }}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              下一题 <ChevronRight size={20} />
            </button>
          ))}
      </div>
    </motion.div>
  );
}
