import { useState, useEffect, useCallback, useRef } from 'react';
import type { Question, ExamResult, MistakeRecord } from '../types';
import { isAnswerCorrect } from '../utils/examScoring';
import { practiceApi } from '../services/api';

interface UseExamParams {
  currentBank: Question[];
  favoriteIds: number[];
  mistakeRecords: MistakeRecord[];
  setMistakeRecords: React.Dispatch<React.SetStateAction<MistakeRecord[]>>;
  examQuestionCount: string;
  currentUser: string | null;
  setShowToast: (msg: string | null) => void;
  setConfirmingDeduplicate: (v: boolean) => void;
  setConfirmingFilter: (v: boolean) => void;
  setSearchQuery: (v: string) => void;
  setIsSearchOpen: (v: boolean) => void;
  setIsImportModalOpen: (v: boolean) => void;
}

export function useExam({
  currentBank, favoriteIds, mistakeRecords, setMistakeRecords,
  examQuestionCount, currentUser, setShowToast,
  setConfirmingDeduplicate, setConfirmingFilter,
  setSearchQuery, setIsSearchOpen,
  setIsImportModalOpen,
}: UseExamParams) {
  const [status, setStatus] = useState<'welcome' | 'exam' | 'result'>('welcome');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [isMistakeMode, setIsMistakeMode] = useState(false);
  const [isFullMode, setIsFullMode] = useState(false);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string | string[]>>({});
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalResult, setFinalResult] = useState<ExamResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [masteredIds, setMasteredIds] = useState<number[]>([]);

  const isExamActive = examQuestions.length > 0 && status === 'exam';

  // 计时器
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'exam') {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  const updateMistakeRecord = useCallback(async (questionId: number, isCorrect: boolean) => {
    const currentRecord = mistakeRecords.find(r => r.questionId === questionId);
    if (isCorrect) {
      if (currentRecord) {
        const nextCorrect = (currentRecord.consecutiveCorrect || 0) + 1;
        if (nextCorrect >= 3) {
          setMistakeRecords(prev => prev.filter(r => r.questionId !== questionId));
          setMasteredIds(prev => [...new Set([...prev, questionId])]);
          if (currentUser) practiceApi.deleteMistake(questionId).catch(() => {});
          setShowToast('太棒了!这道题你已经掌握,已从错题本移除 ✨');
        } else {
          setMistakeRecords(prev =>
            prev.map(r => r.questionId === questionId ? { ...r, consecutiveCorrect: nextCorrect } : r)
          );
        }
      }
    } else {
      if (!currentRecord) {
        setMistakeRecords(prev => [...prev, { questionId, consecutiveCorrect: 0 }]);
        if (currentUser) practiceApi.addMistake(questionId, false).catch(() => {});
      } else {
        setMistakeRecords(prev =>
          prev.map(r => r.questionId === questionId ? { ...r, consecutiveCorrect: 0 } : r)
        );
        if (currentUser) practiceApi.updateMistake(questionId, 0).catch(() => {});
      }
    }
  }, [mistakeRecords, currentUser, setMistakeRecords, setShowToast]);

  const startExam = useCallback((mode: 'normal' | 'mistakes' | 'full' | 'favorites' | 'random' = 'normal') => {
    let source = currentBank;
    setIsMistakeMode(mode === 'mistakes');
    setIsFullMode(mode === 'full');
    setIsRandomMode(mode === 'random');

    if (currentBank.length === 0) {
      setShowToast('当前题库为空，请先导入题目');
      return;
    }
    if (mode === 'mistakes') {
      const mistakeIds = mistakeRecords.map(r => r.questionId);
      const uniqueMistakeIds = Array.from(new Set(mistakeIds));
      source = currentBank.filter(q => uniqueMistakeIds.includes(q.id));
      if (source.length === 0) { setShowToast('错题本目前是空的哦!'); return; }
    } else if (mode === 'favorites') {
      source = currentBank.filter(q => favoriteIds.includes(q.id));
      if (source.length === 0) { setShowToast('收藏夹目前是空的哦!'); return; }
    }

    const shuffled = mode === 'full' ? [...source] : [...source].sort(() => 0.5 - Math.random());
    let selected = shuffled;
    if (mode === 'normal' || mode === 'random') {
      const count = parseInt(examQuestionCount) || (mode === 'random' ? 10 : 20);
      selected = shuffled.slice(0, count);
    }

    setExamQuestions(selected);
    setMasteredIds([]);
    setStatus('exam');
    setCurrentIndex(0);
    setUserAnswers({});
    setStartTime(Date.now());
    setElapsedTime(0);
    setShowFeedback(false);
    setSearchQuery("");
    setIsSearchOpen(false);
    setConfirmingDeduplicate(false);
    setConfirmingFilter(false);
  }, [currentBank, mistakeRecords, favoriteIds, examQuestionCount, setShowToast, setSearchQuery, setIsSearchOpen, setConfirmingDeduplicate, setConfirmingFilter]);

  const handleAnswerChange = useCallback((questionId: number, answer: string | string[]) => {
    if (showFeedback && (isMistakeMode || isFullMode)) return;
    setUserAnswers(prev => ({ ...prev, [questionId]: answer }));

    const q = examQuestions.find(q => q.id === questionId);
    if ((isMistakeMode || isFullMode || isRandomMode) && q?.type === 'single') {
      setShowFeedback(true);
      const correct = typeof answer === 'string' && typeof q.answer === 'string'
        ? answer.trim() === q.answer.trim() : answer === q.answer;
      updateMistakeRecord(q.id, correct);
    }
  }, [showFeedback, isMistakeMode, isFullMode, isRandomMode, examQuestions, updateMistakeRecord]);

  const toggleMultipleAnswer = useCallback((questionId: number, option: string) => {
    if (showFeedback && (isMistakeMode || isFullMode || isRandomMode)) return;
    const current = (userAnswers[questionId] as string[]) || [];
    if (current.includes(option)) {
      handleAnswerChange(questionId, current.filter(o => o !== option));
    } else {
      handleAnswerChange(questionId, [...current, option]);
    }
  }, [showFeedback, isMistakeMode, isFullMode, isRandomMode, userAnswers, handleAnswerChange]);

  const checkProgrammingAnswer = useCallback(() => {
    const q = examQuestions[currentIndex];
    const userAns = userAnswers[q.id] as string;
    const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
    const correct = normalize(userAns) === normalize(q.answer as string);
    setShowFeedback(true);
    updateMistakeRecord(q.id, correct);
  }, [examQuestions, currentIndex, userAnswers, updateMistakeRecord]);

  const checkMultipleAnswer = useCallback(() => {
    const q = examQuestions[currentIndex];
    const userAns = userAnswers[q.id] || [];
    const correct = isAnswerCorrect(q, userAns);
    setShowFeedback(true);
    updateMistakeRecord(q.id, correct);
  }, [examQuestions, currentIndex, userAnswers, updateMistakeRecord]);

  const calculateResult = useCallback(() => {
    let score = 0;
    const correctness: Record<number, boolean> = {};

    for (const q of examQuestions) {
      const userAns = userAnswers[q.id];
      const correct = isAnswerCorrect(q, userAns);
      correctness[q.id] = correct;
      if (correct) score += (100 / examQuestions.length);

      const currentRecord = mistakeRecords.find(r => r.questionId === q.id);
      if (correct) {
        if (currentRecord) {
          const nextCorrect = (currentRecord.consecutiveCorrect || 0) + 1;
          if (nextCorrect >= 3) {
            setMistakeRecords(prev => prev.filter(r => r.questionId !== q.id));
            setMasteredIds(prev => [...new Set([...prev, q.id])]);
          } else {
            setMistakeRecords(prev =>
              prev.map(r => r.questionId === q.id ? { ...r, consecutiveCorrect: nextCorrect } : r)
            );
          }
        }
      } else {
        if (!currentRecord) {
          setMistakeRecords(prev => [...prev, { questionId: q.id, consecutiveCorrect: 0 }]);
        } else {
          setMistakeRecords(prev =>
            prev.map(r => r.questionId === q.id ? { ...r, consecutiveCorrect: 0 } : r)
          );
        }
      }
    }

    setFinalResult({ score: Math.round(score), totalPoints: 100, answers: userAnswers, correctness });
    setStatus('result');
  }, [examQuestions, userAnswers, mistakeRecords, setMistakeRecords]);

  const goWelcome = useCallback(() => {
    setStatus('welcome');
    setExamQuestions([]);
    setFinalResult(null);
    setShowFeedback(false);
    setMasteredIds([]);
    setUserAnswers({});
  }, []);

  const handleRemoveQuestionFromExam = useCallback(async (id: number, removeFromBank: (id: number) => void) => {
    removeFromBank(id);
    setShowToast('该题目已从题库及错题本中剔除');

    if (status === 'exam') {
      const nextQuestions = examQuestions.filter(q => q.id !== id);
      if (nextQuestions.length === 0) {
        setStatus('welcome');
      } else {
        setExamQuestions(nextQuestions);
        if (currentIndex >= nextQuestions.length) {
          setCurrentIndex(Math.max(0, nextQuestions.length - 1));
        }
      }
    }
  }, [status, examQuestions, currentIndex, setShowToast]);

  return {
    status,
    isRandomMode, isMistakeMode, isFullMode,
    examQuestions, currentIndex, setCurrentIndex,
    userAnswers, setUserAnswers,
    startTime, elapsedTime,
    finalResult,
    showFeedback, setShowFeedback,
    masteredIds,
    isExamActive,
    startExam, calculateResult, goWelcome,
    handleAnswerChange, toggleMultipleAnswer,
    checkProgrammingAnswer, checkMultipleAnswer,
    updateMistakeRecord,
    handleRemoveQuestionFromExam,
  };
}
