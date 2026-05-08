import { useState, useEffect, useMemo, useCallback } from 'react';
import { QUESTION_BANK as INITIAL_BANK } from '../questionBank';
import type { Question, Subject, SubjectId, MistakeRecord } from '../types';
import { DEFAULT_SUBJECTS, CUSTOM_SUBJECT_PREFIX, MAX_OWN_SUBJECTS } from '../types';
import { questionApi, subjectApi, practiceApi, type AuthUser } from '../services/api';

export function useQuestionBank(currentUser: string | null, authUser: AuthUser | null, setShowToast: (msg: string | null) => void) {
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [currentSubjectId, setCurrentSubjectId] = useState<SubjectId>(() => {
    const saved = localStorage.getItem('study_test_current_subject');
    return (saved as SubjectId) || DEFAULT_SUBJECTS[0]?.id || 'chinese';
  });
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [mistakeRecords, setMistakeRecords] = useState<MistakeRecord[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [examQuestionCount, setExamQuestionCount] = useState<string>("20");

  // 从 API 加载数据
  useEffect(() => {
    if (!currentUser) {
      setDataLoaded(true);
      return;
    }

    (async () => {
      try {
        setQuestionsLoading(true);
        const [questionsRes, mistakesRes, favoritesRes, subjectsRes] = await Promise.allSettled([
          questionApi.listAll({ subject: currentSubjectId }),
          practiceApi.getMistakes(),
          practiceApi.getFavorites(),
          subjectApi.list(),
        ]);
        setQuestionsLoading(false);

        if (questionsRes.status === 'fulfilled') {
          const qs = questionsRes.value.questions.map((q: any) => ({
            id: q.id, subject: q.subject_id, type: q.type, title: q.title,
            code: q.code, options: q.options, answer: q.answer,
            explanation: q.explanation, points: q.points, input: q.input,
          }));
          setCustomQuestions(qs);
        }

        if (mistakesRes.status === 'fulfilled') {
          setMistakeRecords(mistakesRes.value.mistakes.map((m: any) => ({
            questionId: m.question_id, consecutiveCorrect: m.consecutive_correct,
          })));
        }

        if (favoritesRes.status === 'fulfilled') {
          setFavoriteIds(favoritesRes.value.favorites.map((f: any) => f.id));
        }

        if (subjectsRes.status === 'fulfilled' && subjectsRes.value.subjects.length > 0) {
          const subs = subjectsRes.value.subjects.map((s: any) => ({
            id: s.id, name: s.name, icon: s.icon,
            welcomeTitle: s.welcome_title || s.welcomeTitle || '', welcomeDesc: s.welcome_desc || s.welcomeDesc || '',
            isCustom: true, isEditable: !!s.is_owner,
            isShared: !!s.is_shared, shareScope: s.share_scope || 'none', isOwner: !!s.is_owner, isSubscribed: !!s.is_subscribed,
            subscriberCount: s.subscriber_count || 0, creatorName: s.creator_name || '',
            subscriptionStatus: s.subscription_status || undefined,
          }));
          setCustomSubjects(prev => {
            const merged = new Map<string, Subject>(subs.map(s => [s.id, s]));
            const defaultIds = new Set(DEFAULT_SUBJECTS.map(s => s.id));
            for (const s of prev) {
              if (!merged.has(s.id) && !defaultIds.has(s.id)) merged.set(s.id, s);
            }
            return Array.from(merged.values());
          });
          if (!subs.find((s: Subject) => s.id === currentSubjectId)) {
            setCurrentSubjectId(prevId => {
              const allIds = new Set(subs.map(s => s.id));
              return allIds.has(prevId) ? prevId : (subs[0]?.id || DEFAULT_SUBJECTS[0]?.id || 'chinese');
            });
          }
        } else {
          const userId = authUser?.id || '';
          const userDefaults = DEFAULT_SUBJECTS.map(s => ({
            ...s, id: `${s.id}_${userId}`,
            isCustom: true, isEditable: true, isOwner: true,
          }));
          setCustomSubjects(userDefaults);
          for (const s of userDefaults) {
            subjectApi.create({ id: s.id, name: s.name, icon: s.icon, welcomeTitle: s.welcomeTitle, welcomeDesc: s.welcomeDesc }).catch(() => {});
          }
        }
      } catch (e) {
        console.error('从 API 加载数据失败:', e);
        setQuestionsLoading(false);
        setCustomSubjects(DEFAULT_SUBJECTS);
      }
      setDataLoaded(true);
    })();
  }, [currentUser, currentSubjectId]);

  useEffect(() => {
    if (currentSubjectId) localStorage.setItem('study_test_current_subject', currentSubjectId);
  }, [currentSubjectId]);

  // 计算值
  const allSubjects = useMemo(() => customSubjects, [customSubjects]);

  const ownSubjectCount = useMemo(() =>
    allSubjects.filter(s => s.isOwner !== false && !s.isShared).length, [allSubjects]);

  const sharedSubjectCount = useMemo(() =>
    allSubjects.filter(s => s.isOwner === false || s.isShared).length, [allSubjects]);

  const currentSubject = useMemo(() =>
    allSubjects.find(s => s.id === currentSubjectId) || allSubjects[0] || DEFAULT_SUBJECTS[0], [allSubjects, currentSubjectId]);

  const fullBank = useMemo(() =>
    [...INITIAL_BANK, ...customQuestions].filter(q => q.subject === currentSubjectId), [customQuestions, currentSubjectId]);

  const currentBank = useMemo(() => fullBank.filter(q => !removedIds.includes(q.id)), [fullBank, removedIds]);

  const currentSubjectFavoriteCount = useMemo(() =>
    currentBank.filter(q => favoriteIds.includes(q.id)).length, [currentBank, favoriteIds]);

  // 自动清理已移除题目的错题记录
  useEffect(() => {
    const currentIds = new Set(currentBank.map(q => q.id));
    setMistakeRecords(prev => {
      const filtered = prev.filter(r => currentIds.has(r.questionId));
      return filtered.length !== prev.length ? filtered : prev;
    });
  }, [currentBank]);

  // 题目操作
  const toggleFavorite = useCallback(async (id: number) => {
    const isFav = favoriteIds.includes(id);
    try {
      if (isFav) {
        setFavoriteIds(prev => prev.filter(fid => fid !== id));
        if (currentUser) practiceApi.removeFavorite(id).catch(() => {});
        setShowToast('已取消收藏');
      } else {
        setFavoriteIds(prev => [...prev, id]);
        if (currentUser) {
          const q = [...INITIAL_BANK, ...customQuestions].find(q => q.id === id);
          if (q) practiceApi.addFavorite(id, q.subject).catch(() => {});
        }
        setShowToast('已加入收藏夹');
      }
    } catch (error) {
      console.error('toggleFavorite error:', error);
    }
  }, [favoriteIds, currentUser, customQuestions, setShowToast]);

  const removeQuestion = useCallback(async (id: number) => {
    setRemovedIds(prev => [...new Set([...prev, id])]);
    if (currentUser && customQuestions.some(q => q.id === id)) {
      questionApi.delete(id).catch(e => console.warn('API删除题目失败:', e));
    }
  }, [currentUser, customQuestions]);

  const deduplicateBank = useCallback(() => {
    const seen = new Map<string, { question: Question; source: 'initial' | 'custom' }>();
    fullBank.forEach(q => {
      const fingerprint = `${q.title.trim()}_${q.type}_${JSON.stringify(q.options)}_${JSON.stringify(q.answer)}`;
      const isFromInitial = INITIAL_BANK.some(iq => iq.id === q.id);
      const source = isFromInitial ? 'initial' : 'custom';
      if (!seen.has(fingerprint)) {
        seen.set(fingerprint, { question: q, source });
      } else {
        if (source === 'custom') {
          setRemovedIds(prev => [...new Set([...prev, q.id])]);
        }
        const existing = seen.get(fingerprint)!;
        if (existing.source === 'custom' && source === 'initial') {
          setRemovedIds(prev => [...new Set([...prev, existing.question.id])]);
          seen.set(fingerprint, { question: q, source: 'initial' });
        }
      }
    });
    const keptIds = new Set([...seen.values()].map(entry => entry.question.id));
    setCustomQuestions(prev => prev.filter(cq => keptIds.has(cq.id)));
    setShowToast('题库去重完成');
  }, [fullBank, setShowToast]);

  const filterObjectiveOnly = useCallback(() => {
    const objectiveTypes = ['single', 'multiple'];
    const toRemove = INITIAL_BANK.filter(q => !objectiveTypes.includes(q.type)).map(q => q.id);
    setRemovedIds(prev => [...new Set([...prev, ...toRemove])]);
    setCustomQuestions(prev => prev.filter(q => objectiveTypes.includes(q.type)));
    setShowToast('已去除非选择/判断题');
  }, [setShowToast]);

  // 导入
  const handleImport = useCallback(async (newQuestions: Question[], targetSubjectId: SubjectId = currentSubjectId) => {
    if (!currentUser) {
      setShowToast('请先登录以保存题目到服务器');
      return;
    }
    const generateUniqueId = () => Date.now() + Math.floor(Math.random() * 1000);
    const enriched = newQuestions.map((q) => ({
      ...q, id: generateUniqueId(), subject: targetSubjectId
    }));
    try {
      const apiQuestions = enriched.map(q => ({
        subject_id: q.subject, type: q.type, title: q.title,
        code: q.code, options: q.options, answer: q.answer,
        explanation: q.explanation, points: q.points, input: q.input,
      }));
      await questionApi.batchImport(apiQuestions, targetSubjectId);
      setCustomQuestions(prev => [...prev, ...enriched]);
      setShowToast(`成功导入 ${newQuestions.length} 道题目到题库!`);
    } catch (e: any) {
      let errorMessage = '数据库同步失败';
      if (e?.message) errorMessage = e.message;
      else if (e?.response?.data?.error) errorMessage = e.response.data.error;
      else if (e?.status === 0) errorMessage = '网络连接失败,请检查网络';
      else if (e?.status === 401) errorMessage = '登录已过期,请重新登录';
      else if (e?.status === 403) errorMessage = '无权限向此科目导入题目';
      else if (e?.status === 500) errorMessage = '服务器错误,请稍后重试';
      setShowToast(`导入失败:${errorMessage},请稍后重试`);
    }
  }, [currentUser, currentSubjectId, setShowToast]);

  // 导出
  const exportQuestionBank = useCallback((format: 'csv' | 'json') => {
    const date = new Date().toLocaleDateString().replace(/\//g, '-');
    const name = currentSubject?.name || currentSubjectId;
    if (format === 'json') {
      const exportData = {
        version: '1.0', exportedAt: new Date().toISOString(),
        subject: name, subjectId: currentSubjectId,
        totalQuestions: currentBank.length,
        questions: currentBank.map((q, idx) => ({
          index: idx + 1, type: q.type, title: q.title,
          code: q.code || undefined, options: q.options || [],
          answer: q.answer, explanation: q.explanation || '', points: q.points || 5,
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${name}_题库_${date}.json`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowToast(`题库已导出为 JSON 文件，共 ${currentBank.length} 题`);
      return;
    }
    const headers = ['题目ID', '科目', '题型', '题目内容', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析', '分值'];
    const rows = currentBank.map((q, idx) => [
      idx + 1, currentSubject?.name || currentSubjectId,
      q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '编程题',
      q.title, q.options?.[0] || '', q.options?.[1] || '', q.options?.[2] || '', q.options?.[3] || '',
      Array.isArray(q.answer) ? q.answer.join(',') : q.answer, q.explanation || '', q.points || 5,
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => {
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    }).join(','))].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${name}_题库_${date}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowToast(`题库已导出为 CSV 文件，共 ${currentBank.length} 题`);
  }, [currentBank, currentSubject, currentSubjectId, setShowToast]);

  return {
    customQuestions, setCustomQuestions,
    customSubjects, setCustomSubjects,
    currentSubjectId, setCurrentSubjectId,
    removedIds, setRemovedIds,
    mistakeRecords, setMistakeRecords,
    favoriteIds, setFavoriteIds,
    dataLoaded, setDataLoaded,
    questionsLoading,
    examQuestionCount, setExamQuestionCount,
    allSubjects, ownSubjectCount, sharedSubjectCount,
    currentSubject, fullBank, currentBank,
    currentSubjectFavoriteCount,
    toggleFavorite, removeQuestion,
    deduplicateBank, filterObjectiveOnly,
    handleImport, exportQuestionBank,
  };
}
