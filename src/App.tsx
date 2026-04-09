/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  ChevronLeft, 
  Timer, 
  Award, 
  RefreshCcw,
  ListChecks,
  CircleDot,
  Trash2,
  History,
  Home,
  Database,
  CopyCheck,
  Filter
} from 'lucide-react';
import { QUESTION_BANK as INITIAL_BANK } from './questionBank';
import { Question, ExamResult } from './types';
import { ImportModal } from './components/ImportModal';
import { PlusCircle } from 'lucide-react';

interface MistakeRecord {
  questionId: number;
  consecutiveCorrect: number;
}

export default function App() {
  const [status, setStatus] = useState<'welcome' | 'exam' | 'result' | 'mistakes'>('welcome');
  const [activeBank, setActiveBank] = useState<Question[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('removed_questions');
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.from(new Set(parsed));
  });
  const [mistakeRecords, setMistakeRecords] = useState<MistakeRecord[]>(() => {
    const saved = localStorage.getItem('mistake_records');
    const parsed: MistakeRecord[] = saved ? JSON.parse(saved) : [];
    // Deduplicate on load
    const unique = Array.from(new Map(parsed.map(r => [r.questionId, r])).values());
    return unique;
  });

  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string | string[]>>({});
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalResult, setFinalResult] = useState<ExamResult | null>(null);
  const [isMistakeMode, setIsMistakeMode] = useState(false);
  const [isFullMode, setIsFullMode] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [examQuestionCount, setExamQuestionCount] = useState<string>("20");
  const [customQuestions, setCustomQuestions] = useState<Question[]>(() => {
    const saved = localStorage.getItem('custom_questions');
    return saved ? JSON.parse(saved) : [];
  });

  const deduplicateBank = () => {
    const seen = new Set();
    const uniqueQuestions: Question[] = [];
    
    // We check both title and options/answer to determine duplicates
    fullBank.forEach(q => {
      const fingerprint = `${q.title.trim()}_${q.type}_${JSON.stringify(q.options)}_${JSON.stringify(q.answer)}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        // If it's a custom question, we keep it in our list
        if (customQuestions.some(cq => cq.id === q.id)) {
          uniqueQuestions.push(q);
        }
      } else {
        // If it's a duplicate and it was in our custom list, it will be filtered out
        // If it was in INITIAL_BANK, we add it to removedIds to "hide" it
        if (INITIAL_BANK.some(iq => iq.id === q.id)) {
          setRemovedIds(prev => [...new Set([...prev, q.id])]);
        }
      }
    });

    // Update custom questions to only include unique ones
    const newCustom = customQuestions.filter(cq => 
      uniqueQuestions.some(uq => uq.id === cq.id)
    );
    setCustomQuestions(newCustom);
    setShowToast('题库去重完成');
  };

  const filterObjectiveOnly = () => {
    // Objective types are 'single', 'multiple', 'true/false'
    const objectiveTypes = ['single', 'multiple', 'true/false'];
    
    // For INITIAL_BANK, we add non-objective to removedIds
    const toRemove = INITIAL_BANK
      .filter(q => !objectiveTypes.includes(q.type))
      .map(q => q.id);
    
    setRemovedIds(prev => [...new Set([...prev, ...toRemove])]);

    // For customQuestions, we filter them out
    setCustomQuestions(prev => prev.filter(q => objectiveTypes.includes(q.type)));
    
    setShowToast('已去除非选择/判断题');
  };

  // Sync state to localStorage
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  useEffect(() => {
    localStorage.setItem('removed_questions', JSON.stringify(removedIds));
  }, [removedIds]);

  useEffect(() => {
    // Deduplicate mistake records just in case
    const uniqueRecords = Array.from(new Map(mistakeRecords.map(r => [r.questionId, r])).values());
    localStorage.setItem('mistake_records', JSON.stringify(uniqueRecords));
  }, [mistakeRecords]);

  useEffect(() => {
    localStorage.setItem('custom_questions', JSON.stringify(customQuestions));
  }, [customQuestions]);

  // Combined bank (memoized for performance and stability)
  const fullBank = useMemo(() => [...INITIAL_BANK, ...customQuestions], [customQuestions]);

  // Filtered bank (excluding removed questions)
  const currentBank = useMemo(() => fullBank.filter(q => !removedIds.includes(q.id)), [fullBank, removedIds]);

  // Automatically remove mistake records for questions that are no longer in the bank
  useEffect(() => {
    const currentIds = new Set(currentBank.map(q => q.id));
    setMistakeRecords(prev => {
      const filtered = prev.filter(r => currentIds.has(r.questionId));
      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [currentBank]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'exam') {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  const startExam = (mode: 'normal' | 'mistakes' | 'full' = 'normal') => {
    let source = currentBank;
    setIsMistakeMode(mode === 'mistakes');
    setIsFullMode(mode === 'full');

    if (mode === 'mistakes') {
      const mistakeIds = mistakeRecords.map(r => r.questionId);
      // Ensure unique IDs and filter
      const uniqueMistakeIds = Array.from(new Set(mistakeIds));
      source = currentBank.filter(q => uniqueMistakeIds.includes(q.id));
      
      if (source.length === 0) {
        setShowToast('错题本目前是空的哦！');
        return;
      }
    }

    const shuffled = [...source].sort(() => 0.5 - Math.random());
    let selected = shuffled;
    
    if (mode === 'normal') {
      const count = parseInt(examQuestionCount) || 20;
      selected = shuffled.slice(0, count);
    }
    
    setExamQuestions(selected);
    setStatus('exam');
    setCurrentIndex(0);
    setUserAnswers({});
    setStartTime(Date.now());
    setElapsedTime(0);
    setConfirmingDelete(false);
    setShowFeedback(false);
  };

  const removeQuestion = (id: number) => {
    setRemovedIds(prev => [...new Set([...prev, id])]);
    // Also remove from mistake records if present
    setMistakeRecords(prev => prev.filter(r => r.questionId !== id));
    
    setShowToast('该题目已从题库及错题本中剔除');
    setConfirmingDelete(false);

    if (status === 'exam') {
      const nextQuestions = examQuestions.filter(q => q.id !== id);
      if (nextQuestions.length === 0) {
        setStatus('welcome');
      } else {
        setExamQuestions(nextQuestions);
        // If we removed the last question in the list, go to previous
        if (currentIndex >= nextQuestions.length) {
          setCurrentIndex(Math.max(0, nextQuestions.length - 1));
        }
      }
    }
  };

  const handleAnswerChange = (questionId: number, answer: string | string[]) => {
    if (showFeedback && (isMistakeMode || isFullMode)) return;
    setUserAnswers(prev => ({ ...prev, [questionId]: answer }));
    
    // Auto-check for single choice in practice modes
    const q = examQuestions.find(q => q.id === questionId);
    if ((isMistakeMode || isFullMode) && q?.type === 'single') {
      setShowFeedback(true);
      updateMistakeRecord(q.id, answer === q.answer);
    }
  };

  const checkProgrammingAnswer = () => {
    const q = examQuestions[currentIndex];
    const userAns = userAnswers[q.id] as string;
    const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
    const isCorrect = normalize(userAns) === normalize(q.answer as string);
    
    setShowFeedback(true);
    updateMistakeRecord(q.id, isCorrect);
  };

  const toggleMultipleAnswer = (questionId: number, option: string) => {
    if (showFeedback && (isMistakeMode || isFullMode)) return;
    const current = (userAnswers[questionId] as string[]) || [];
    if (current.includes(option)) {
      handleAnswerChange(questionId, current.filter(o => o !== option));
    } else {
      handleAnswerChange(questionId, [...current, option]);
    }
  };

  const updateMistakeRecord = (questionId: number, isCorrect: boolean) => {
    setMistakeRecords(prev => {
      const newRecords = [...prev];
      const recordIdx = newRecords.findIndex(r => r.questionId === questionId);
      
      if (isCorrect) {
        if (recordIdx !== -1) {
          newRecords[recordIdx].consecutiveCorrect += 1;
          if (newRecords[recordIdx].consecutiveCorrect >= 3) {
            newRecords.splice(recordIdx, 1);
          }
        }
      } else {
        if (recordIdx === -1) {
          newRecords.push({ questionId, consecutiveCorrect: 0 });
        } else {
          newRecords[recordIdx].consecutiveCorrect = 0;
        }
      }
      return newRecords;
    });
  };

  const checkMultipleAnswer = () => {
    const q = examQuestions[currentIndex];
    const userAns = userAnswers[q.id] || [];
    const sortedUser = Array.isArray(userAns) ? [...userAns].sort() : [];
    const sortedAns = Array.isArray(q.answer) ? [...q.answer].sort() : [];
    const isCorrect = sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(sortedAns);
    
    setShowFeedback(true);
    updateMistakeRecord(q.id, isCorrect);
  };

  const calculateResult = () => {
    let score = 0;
    const correctness: Record<number, boolean> = {};
    const newMistakeRecords = [...mistakeRecords];

    examQuestions.forEach(q => {
      const userAns = userAnswers[q.id];
      let isCorrect = false;
      
      if (q.type === 'single') {
        isCorrect = userAns === q.answer;
      } else if (q.type === 'multiple') {
        const sortedUser = Array.isArray(userAns) ? [...userAns].sort() : [];
        const sortedAns = Array.isArray(q.answer) ? [...q.answer].sort() : [];
        isCorrect = sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(sortedAns);
      } else if (q.type === 'programming') {
        // Simple normalization for basic code comparison
        const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
        isCorrect = normalize(userAns as string) === normalize(q.answer as string);
      }

      correctness[q.id] = isCorrect;
      if (isCorrect) {
        score += (100 / examQuestions.length); // Dynamic scoring based on count

        // Update mistake records for correct answer
        const recordIdx = newMistakeRecords.findIndex(r => r.questionId === q.id);
        if (recordIdx !== -1) {
          newMistakeRecords[recordIdx].consecutiveCorrect += 1;
          if (newMistakeRecords[recordIdx].consecutiveCorrect >= 3) {
            newMistakeRecords.splice(recordIdx, 1); // Remove if 3 times correct
          }
        }
      } else {
        // Update mistake records for wrong answer
        const recordIdx = newMistakeRecords.findIndex(r => r.questionId === q.id);
        if (recordIdx === -1) {
          newMistakeRecords.push({ questionId: q.id, consecutiveCorrect: 0 });
        } else {
          newMistakeRecords[recordIdx].consecutiveCorrect = 0; // Reset counter on wrong
        }
      }
    });

    setMistakeRecords(newMistakeRecords);
    setFinalResult({
      score: Math.round(score),
      totalPoints: 100,
      answers: userAnswers,
      correctness
    });
    setStatus('result');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleImport = (newQuestions: Question[]) => {
    setCustomQuestions(prev => {
      // Ensure IDs don't collide by finding the max ID
      const maxId = Math.max(0, ...fullBank.map(q => q.id), 1000);
      const processed = newQuestions.map((q, i) => ({
        ...q,
        id: maxId + i + 1
      }));
      return [...prev, ...processed];
    });
    setShowToast(`成功导入 ${newQuestions.length} 道题目！`);
  };

  const currentQuestion = examQuestions[currentIndex];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStatus('welcome')}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <BookOpen size={24} />
            </div>
            <h1 className="font-bold text-lg tracking-tight hidden sm:block">Python 模拟考试</h1>
          </div>
          
          {status === 'exam' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-slate-600 font-medium text-sm">
                <Timer size={16} />
                <span>{formatTime(elapsedTime)}</span>
              </div>
              <div className="text-sm font-medium text-slate-500">
                题目 {currentIndex + 1} / {examQuestions.length}
              </div>
            </div>
          )}
          
          {(status === 'result' || status === 'mistakes') && (
            <button 
              onClick={() => setStatus('welcome')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-semibold hover:bg-slate-200 transition-colors"
            >
              <RefreshCcw size={18} />
              <span>返回首页</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {status === 'welcome' && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
            >
              <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-6">
                <Award size={48} />
              </div>
              <h2 className="text-3xl font-bold mb-4">欢迎参加 Python 编程模拟考</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
                本测试每次从 {currentBank.length} 道精选题库中随机抽取 20 道题目。
                难度专为小学生设计，支持错题自动记录与强化练习。
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left">
                <button 
                  onClick={() => startExam('normal')}
                  className="p-6 bg-blue-50 rounded-2xl border-2 border-blue-100 hover:border-blue-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <BookOpen size={24} />
                  </div>
                  <div className="font-bold text-lg text-blue-900">开始正式考试</div>
                  <div className="text-sm text-blue-600/70">随机抽取 {examQuestionCount || '...'} 题，全面检测</div>
                  <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative group/input">
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={examQuestionCount}
                        placeholder="20"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setExamQuestionCount(val);
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(examQuestionCount);
                          if (isNaN(val) || val <= 0 || val > currentBank.length) {
                            setExamQuestionCount("20");
                            setShowToast(`题数已重置为默认值 (1-${currentBank.length} 之间)`);
                          }
                        }}
                        className="w-20 px-3 py-1.5 bg-white/80 border-2 border-blue-200 rounded-xl text-sm font-bold text-blue-600 outline-none focus:border-blue-500 focus:bg-white transition-all text-center"
                      />
                      <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-md font-black shadow-sm opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none">
                        修改题数
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">
                      范围: 1-{currentBank.length}
                    </span>
                  </div>
                </button>

                <button 
                  onClick={() => startExam('full')}
                  className="p-6 bg-emerald-50 rounded-2xl border-2 border-emerald-100 hover:border-emerald-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Database size={24} />
                  </div>
                  <div className="font-bold text-lg text-emerald-900">题库全量测试</div>
                  <div className="text-sm text-emerald-600/70">包含题库所有题目，深度练习</div>
                </button>

                <button 
                  onClick={() => startExam('mistakes')}
                  className="p-6 bg-rose-50 rounded-2xl border-2 border-rose-100 hover:border-rose-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-rose-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <History size={24} />
                  </div>
                  <div className="font-bold text-lg text-rose-900">进入错题练习</div>
                  <div className="text-sm text-rose-600/70">针对薄弱环节，连续对 3 次即消除</div>
                  <div className="mt-2 inline-block px-2 py-0.5 bg-rose-200 text-rose-700 text-xs font-bold rounded-full">
                    当前错题: {mistakeRecords.length}
                  </div>
                </button>

                <button 
                  onClick={() => setIsImportModalOpen(true)}
                  className="p-6 bg-indigo-50 rounded-2xl border-2 border-indigo-100 hover:border-indigo-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <PlusCircle size={24} />
                  </div>
                  <div className="font-bold text-lg text-indigo-900">导入新增题目</div>
                  <div className="text-sm text-indigo-600/70">支持 Word/PDF/粘贴，AI 智能解析</div>
                </button>
              </div>

              <div className="flex flex-wrap justify-center gap-4 text-slate-400 text-sm">
                <div className="flex items-center gap-1"><CircleDot size={16} /> 单选题</div>
                <div className="flex items-center gap-1"><ListChecks size={16} /> 多选题</div>
                <div className="flex items-center gap-1"><Trash2 size={16} /> 题库剔除功能</div>
              </div>
            </motion.div>
          )}

          {status === 'exam' && (
            <motion.div 
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Progress Bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentIndex + 1) / examQuestions.length) * 100}%` }}
                />
              </div>

              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setStatus('welcome')}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all mr-1"
                      title="返回首页"
                    >
                      <Home size={18} />
                    </button>
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full uppercase tracking-wider">
                      {currentQuestion.type === 'single' ? '单选题' : currentQuestion.type === 'multiple' ? '多选题' : '编程题'}
                    </span>
                    {isMistakeMode && (
                      <span className="px-3 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-full">
                        错题强化
                      </span>
                    )}
                    {isFullMode && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">
                          全量练习
                        </span>
                        <button 
                          onClick={deduplicateBank}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md hover:bg-slate-200 transition-colors"
                          title="一键去重"
                        >
                          <CopyCheck size={12} /> 去重
                        </button>
                        <button 
                          onClick={filterObjectiveOnly}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md hover:bg-slate-200 transition-colors"
                          title="仅保留选择/判断"
                        >
                          <Filter size={12} /> 仅客观题
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmingDelete ? (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                        <span className="text-[10px] font-black text-rose-500 uppercase">确认剔除？</span>
                        <button 
                          onClick={() => removeQuestion(currentQuestion.id)}
                          className="px-2 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-md hover:bg-rose-700 transition-colors"
                        >
                          确定
                        </button>
                        <button 
                          onClick={() => setConfirmingDelete(false)}
                          className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md hover:bg-slate-200 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setConfirmingDelete(true)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition-colors text-xs font-bold uppercase"
                      >
                        <Trash2 size={14} /> 剔除此题
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-bold mb-6 leading-snug">
                  {currentQuestion.title}
                </h3>

                <div className="space-y-3">
                  {currentQuestion.type === 'programming' ? (
                    <div className="space-y-4">
                      <textarea
                        disabled={showFeedback && (isMistakeMode || isFullMode)}
                        value={(userAnswers[currentQuestion.id] as string) || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        placeholder="在此输入你的 Python 代码..."
                        className="w-full h-48 p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none font-mono text-sm transition-all resize-none"
                      />
                      {showFeedback && (isMistakeMode || isFullMode) && (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs">
                          <div className="text-slate-400 mb-2 uppercase font-bold">参考代码：</div>
                          <pre className="text-emerald-600 whitespace-pre-wrap">{currentQuestion.answer}</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    currentQuestion.options?.map((option, i) => {
                      const isSelected = currentQuestion.type === 'single' 
                        ? userAnswers[currentQuestion.id] === option
                        : (userAnswers[currentQuestion.id] as string[] || []).includes(option);
                      
                      const isCorrect = currentQuestion.type === 'single'
                        ? currentQuestion.answer === option
                        : (currentQuestion.answer as string[]).includes(option);

                      let borderClass = 'border-slate-100 hover:border-slate-200 hover:bg-slate-50';
                      let bgClass = '';
                      let dotClass = 'bg-slate-100 text-slate-400 group-hover:bg-slate-200';

                      if (isSelected) {
                        borderClass = 'border-blue-600 bg-blue-50/50';
                        dotClass = 'bg-blue-600 text-white';
                      }

                      if (showFeedback && (isMistakeMode || isFullMode)) {
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
                          disabled={showFeedback && (isMistakeMode || isFullMode)}
                          onClick={() => currentQuestion.type === 'single' 
                            ? handleAnswerChange(currentQuestion.id, option)
                            : toggleMultipleAnswer(currentQuestion.id, option)
                          }
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group ${borderClass} ${bgClass}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${dotClass}`}>
                            {String.fromCharCode(65 + i)}
                          </div>
                          <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-slate-600'}`}>
                            {option}
                          </span>
                          {showFeedback && (isMistakeMode || isFullMode) && isCorrect && (
                            <CheckCircle2 size={20} className="ml-auto text-emerald-500" />
                          )}
                          {showFeedback && (isMistakeMode || isFullMode) && isSelected && !isCorrect && (
                            <XCircle size={20} className="ml-auto text-rose-500" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {showFeedback && (isMistakeMode || isFullMode) && (
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
                      正确答案：<span className="font-bold text-emerald-600">
                        {Array.isArray(currentQuestion.answer) ? currentQuestion.answer.join('、') : currentQuestion.answer}
                      </span>
                    </p>
                    <p className="text-slate-500 text-sm mt-2 leading-relaxed italic">
                      {currentQuestion.explanation || '暂无详细解析，请牢记正确答案。'}
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  disabled={currentIndex === 0 || ((isMistakeMode || isFullMode) && showFeedback)}
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-all"
                >
                  <ChevronLeft size={20} /> 上一题
                </button>

                {(isMistakeMode || isFullMode) && !showFeedback && currentQuestion.type === 'multiple' && (
                  <button
                    onClick={checkMultipleAnswer}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    确认答案
                  </button>
                )}

                {(isMistakeMode || isFullMode) && !showFeedback && currentQuestion.type === 'programming' && (
                  <button
                    onClick={checkProgrammingAnswer}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    确认代码
                  </button>
                )}

                {(isMistakeMode || isFullMode ? showFeedback : true) && (
                  currentIndex === examQuestions.length - 1 ? (
                    <button
                      onClick={calculateResult}
                      className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      提交试卷
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setCurrentIndex(prev => prev + 1);
                        setShowFeedback(false);
                      }}
                      className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      下一题 <ChevronRight size={20} />
                    </button>
                  )
                )}
              </div>
            </motion.div>
          )}

          {status === 'result' && finalResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />
                
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold text-slate-400 mb-2 uppercase tracking-widest">考试结果</h2>
                  <div className="text-7xl font-black text-slate-900 mb-4 tabular-nums">
                    {finalResult.score}
                    <span className="text-2xl text-slate-300 font-bold ml-2">/ 100</span>
                  </div>
                  
                  <div className="flex justify-center gap-8 mb-8">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-500">
                        {Object.values(finalResult.correctness).filter(Boolean).length}
                      </div>
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">正确</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-rose-500">
                        {Object.values(finalResult.correctness).filter(c => !c).length}
                      </div>
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">错误</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-500">
                        {formatTime(elapsedTime)}
                      </div>
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-tighter">用时</div>
                    </div>
                  </div>

                  <p className="text-slate-500 max-w-sm mx-auto mb-8">
                    {finalResult.score >= 90 ? "太棒了！错题已更新，继续保持。" : 
                     finalResult.score >= 60 ? "表现不错！错题已加入错题本，记得复习。" : 
                     "别灰心，错题本会帮你记录薄弱点，多练几次！"}
                  </p>
                  
                  <button 
                    onClick={() => setStatus('welcome')}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    返回首页
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold px-2">题目解析</h3>
                {examQuestions.map((q, idx) => {
                  const isCorrect = finalResult.correctness[q.id];
                  const mistakeRecord = mistakeRecords.find(r => r.questionId === q.id);
                  
                  return (
                    <div 
                      key={q.id}
                      className={`bg-white rounded-2xl p-6 border-l-4 shadow-sm ${
                        isCorrect ? 'border-emerald-500' : 'border-rose-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
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
                          </div>
                          <h4 className="font-bold text-slate-800 leading-snug">{q.title}</h4>
                        </div>
                      </div>

                      <div className="space-y-3 text-sm">
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <span className="text-slate-400 font-bold mr-2">你的回答:</span>
                          <span className={isCorrect ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                            {Array.isArray(finalResult.answers[q.id]) 
                              ? (finalResult.answers[q.id] as string[]).join(', ') 
                              : (finalResult.answers[q.id] as string) || '(未回答)'}
                          </span>
                        </div>
                        {!isCorrect && (
                          <div className="p-3 bg-blue-50 rounded-xl">
                            <span className="text-blue-400 font-bold mr-2">正确答案:</span>
                            <span className="text-blue-700 font-medium">
                              {Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-12 text-center text-slate-400 text-sm">
        <p>© 2026 Python 编程在线模拟考试系统 | 海龙制作</p>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-slate-800 text-white rounded-full shadow-2xl font-bold text-sm flex items-center gap-2"
          >
            <CheckCircle2 size={18} className="text-emerald-400" />
            {showToast}
          </motion.div>
        )}
      </AnimatePresence>

      <ImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImport={handleImport} 
      />
    </div>
  );
}
