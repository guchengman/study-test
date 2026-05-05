/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Database,
  CopyCheck,
  Filter,
  Star,
  Search,
  X,
  Check,
  PlusCircle,
  Settings,
  Edit3,
  Layers,
  AlertTriangle,
  Users,
  Key,
  Shield,
  Share2,
  Copy,
  Phone,
  Mail,
  GraduationCap,
  ChevronDown,
  Clock,
  HelpCircle,
  CloudOff,
  Loader2,
  Cloud,
  Upload,
  Download
} from 'lucide-react';
import { QUESTION_BANK as INITIAL_BANK } from './questionBank';
import { Question, ExamResult, SubjectId, Subject, DEFAULT_SUBJECTS, SUBJECT_ICONS, CUSTOM_SUBJECT_PREFIX, MAX_OWN_SUBJECTS, MAX_SHARED_SUBJECTS, suggestSubject } from './types';
import { ImportModal } from './components/ImportModal';
import { LoginModal } from './components/LoginModal';
import { ConfirmModal } from './components/ConfirmModal';
import { JoinSubjectModal } from './components/JoinSubjectModal';
import { RoleSwitchModal } from './components/RoleSwitchModal';
import { VisitCounter } from './components/VisitCounter';
import { useAuth } from './hooks/useAuth';
import { questionApi, subjectApi, practiceApi, syncApi, inviteCodeApi, authApi, getToken, type AuthUser } from './services/api';

import { StudentManagementModal } from './components/StudentManagementModal';
import { HelpModal } from './components/HelpModal';
import { SubjectShareCode } from './components/SubjectShareCode';
import { StudentSelectorModal } from './components/StudentSelectorModal';

interface MistakeRecord {
  questionId: number;
  consecutiveCorrect: number;
}





export default function App() {
  // 用户认证
  const { currentUser, isAdmin, isTeacher, login, logout, isModalOpen, setIsModalOpen, register, changePassword, sendVerificationCode, verifyCode, resetPassword, checkUsername, getUserList, clearUserPassword, deleteUser, setupPassword, authUser, convertRole, bindTeacher, refreshUser } = useAuth();

  // 退出登录确认弹窗
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showRoleSwitch, setShowRoleSwitch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountResult, setDeleteAccountResult] = useState<'success' | 'error' | null>(null);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');

  const [status, setStatus] = useState<'welcome' | 'exam' | 'result' | 'mistakes'>('welcome');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [mistakeRecords, setMistakeRecords] = useState<MistakeRecord[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);

  const [masteredIds, setMasteredIds] = useState<number[]>([]);

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
  const [confirmingDeduplicate, setConfirmingDeduplicate] = useState(false);
  const [confirmingFilter, setConfirmingFilter] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isJoinSubjectOpen, setIsJoinSubjectOpen] = useState(false);
  const [isStudentManagementOpen, setIsStudentManagementOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [examQuestionCount, setExamQuestionCount] = useState<string>("20");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [currentSubjectId, setCurrentSubjectId] = useState<SubjectId>(DEFAULT_SUBJECTS[0]?.id || 'chinese');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('json');

  // 初始化模态框状态
  const [showInitModal, setShowInitModal] = useState(false);
  const [selectedInitSubjects, setSelectedInitSubjects] = useState<SubjectId[]>([]);

  // 统一科目管理(所有科目均可编辑/删除,但至少保留1个)
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isAddingNewSubject, setIsAddingNewSubject] = useState(false);
  const [isSubjectPendingCreation, setIsSubjectPendingCreation] = useState(false);

  // 用户管理
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [userList, setUserList] = useState<{ username: string; email: string; role: string; phone: string; teacherName: string; studentCount: number; passwordReset: boolean; createdAt: number; id?: number }[]>([]);
  const [userActionConfirm, setUserActionConfirm] = useState<{ type: 'delete' | 'clearPassword'; username: string; onConfirm: () => void } | null>(null);
  const [expandedTeacher, setExpandedTeacher] = useState<number | null>(null);
  const [teacherStudents, setTeacherStudents] = useState<{ id: number; username: string; email: string; phone: string; status: string; created_at: string }[]>([]);
  const [expandedShareSubject, setExpandedShareSubject] = useState<string | null>(null);
  const [studentSelectorSubject, setStudentSelectorSubject] = useState<{ id: string; name: string } | null>(null);

  // 计算所有科目(统一管理)
  const allSubjects = useMemo(() => {
    return customSubjects;
  }, [customSubjects]);

  // 计算自有科目和共享科目数量
  const ownSubjectCount = useMemo(() =>
    allSubjects.filter(s => s.isOwner !== false && s.isShared !== 1).length
  , [allSubjects]);

  const sharedSubjectCount = useMemo(() =>
    allSubjects.filter(s => s.isOwner === false || s.isShared === 1).length
  , [allSubjects]);

  const currentSubject = useMemo(() =>
    allSubjects.find(s => s.id === currentSubjectId) || allSubjects[0] || DEFAULT_SUBJECTS[0]
  , [allSubjects, currentSubjectId]);

  // 移除了 localStorage 存储,现在完全依赖 API

  // 纯 API 驱动的数据加载
  const [dataLoaded, setDataLoaded] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  useEffect(() => {
    // 强制登录验证 - 未登录用户无法使用应用
    if (!currentUser) {
      setDataLoaded(true);
      return;
    }

    // 从 API 加载用户数据
    (async () => {
      try {
        setQuestionsLoading(true);
        // 并行加载所有数据 - 按当前科目加载题目,避免全量查询问题
        const [questionsRes, mistakesRes, favoritesRes, subjectsRes] = await Promise.allSettled([
          questionApi.list({ subject: currentSubjectId, limit: 5000 }),
          practiceApi.getMistakes(),
          practiceApi.getFavorites(),
          subjectApi.list(),
        ]);
        setQuestionsLoading(false);

        // 题目
        if (questionsRes.status === 'fulfilled') {
          const qs = questionsRes.value.questions.map((q: any) => ({
            id: q.id, subject: q.subject_id, type: q.type, title: q.title,
            code: q.code, options: q.options, answer: q.answer,
            explanation: q.explanation, points: q.points, input: q.input,
          }));
          setCustomQuestions(qs);
        }

        // 错题
        if (mistakesRes.status === 'fulfilled') {
          const ms = mistakesRes.value.mistakes.map((m: any) => ({
            questionId: m.question_id, consecutiveCorrect: m.consecutive_correct,
          }));
          setMistakeRecords(ms);
        }

        // 收藏
        if (favoritesRes.status === 'fulfilled') {
          const fs = favoritesRes.value.favorites.map((f: any) => f.id);
          setFavoriteIds(fs);
        }

        // 科目
        if (subjectsRes.status === 'fulfilled' && subjectsRes.value.subjects.length > 0) {
          const subs = subjectsRes.value.subjects.map((s: any) => ({
            id: s.id, name: s.name, icon: s.icon,
            welcomeTitle: s.welcome_title || s.welcomeTitle || '', welcomeDesc: s.welcome_desc || s.welcomeDesc || '',
            isCustom: true, isEditable: !!s.is_owner,
            isShared: !!s.is_shared, shareScope: s.share_scope || 'none', isOwner: !!s.is_owner, isSubscribed: !!s.is_subscribed,
            subscriberCount: s.subscriber_count || 0, creatorName: s.creator_name || '',
            subscriptionStatus: s.subscription_status || undefined,
          }));
          setCustomSubjects(subs);
          // 如果当前科目ID不在新列表中,重置为第一个
          if (!subs.find((s: Subject) => s.id === currentSubjectId)) {
            setCurrentSubjectId(subs[0]?.id || DEFAULT_SUBJECTS[0]?.id || 'chinese');
          }
        } else {
            // 为新用户自动创建默认科目
            const userId = authUser?.id || '';
            const userDefaults = DEFAULT_SUBJECTS.map(s => ({
              ...s,
              id: `${s.id}_${userId}`,
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
        // 纯 API 模式,不降级到 localStorage
        setCustomSubjects(DEFAULT_SUBJECTS);
      }
      setDataLoaded(true);
    })();
  }, [currentUser, currentSubjectId]);


  // 重试同步待同步的题目
  // 移除了待同步题目功能,所有操作直接通过 API 完成


  // 无需登录,统一为本地模式

  const deduplicateBank = () => {
    const seen = new Map<string, { question: Question; source: 'initial' | 'custom' }>();

    // 遍历完整题库,按指纹去重
    fullBank.forEach(q => {
      const fingerprint = `${q.title.trim()}_${q.type}_${JSON.stringify(q.options)}_${JSON.stringify(q.answer)}`;
      const isFromInitial = INITIAL_BANK.some(iq => iq.id === q.id);
      const source = isFromInitial ? 'initial' : 'custom';

      if (!seen.has(fingerprint)) {
        // 首次遇到,保存
        seen.set(fingerprint, { question: q, source });
      } else {
        // 重复项:如果是自定义题目加入removedIds,如果是初始题库则忽略
        if (source === 'custom') {
          setRemovedIds(prev => [...new Set([...prev, q.id])]);
        }
        // 如果已保存的是自定义题,而当前是初始题库,替换它
        const existing = seen.get(fingerprint)!;
        if (existing.source === 'custom' && source === 'initial') {
          // 将旧的自定义题目标记为移除
          setRemovedIds(prev => [...new Set([...prev, existing.question.id])]);
          seen.set(fingerprint, { question: q, source: 'initial' });
        }
      }
    });

    // 从 seen 中提取保留的题目ID集合
    const keptIds = new Set([...seen.values()].map(entry => entry.question.id));

    // 更新 customQuestions,移除被去重掉的题目
    setCustomQuestions(prev => prev.filter(cq => keptIds.has(cq.id)));

    setShowToast('题库去重完成');
    setConfirmingDeduplicate(false);
  };

  const filterObjectiveOnly = () => {
    // Objective types are 'single', 'multiple'
    const objectiveTypes = ['single', 'multiple'];

    // For INITIAL_BANK, we add non-objective to removedIds
    const toRemove = INITIAL_BANK
      .filter(q => !objectiveTypes.includes(q.type))
      .map(q => q.id);

    setRemovedIds(prev => [...new Set([...prev, ...toRemove])]);

    // For customQuestions, we filter them out
    setCustomQuestions(prev => prev.filter(q => objectiveTypes.includes(q.type)));

    setShowToast('已去除非选择/判断题');
    setConfirmingFilter(false);
  };

  // 导出题库为 CSV 或 JSON 格式
  const exportQuestionBank = () => {
    const date = new Date().toLocaleDateString().replace(/\//g, '-');
    const name = currentSubject?.name || currentSubjectId;

    if (exportFormat === 'json') {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        subject: name,
        subjectId: currentSubjectId,
        totalQuestions: currentBank.length,
        questions: currentBank.map((q, idx) => ({
          index: idx + 1,
          type: q.type,
          title: q.title,
          code: q.code || undefined,
          options: q.options || [],
          answer: q.answer,
          explanation: q.explanation || '',
          points: q.points || 5,
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}_题库_${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowToast(`题库已导出为 JSON 文件，共 ${currentBank.length} 题`);
      return;
    }

    const headers = ['题目ID', '科目', '题型', '题目内容', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析', '分值'];
    const rows = currentBank.map((q, idx) => [
      idx + 1,
      currentSubject?.name || currentSubjectId,
      q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '编程题',
      q.title,
      q.options?.[0] || '',
      q.options?.[1] || '',
      q.options?.[2] || '',
      q.options?.[3] || '',
      Array.isArray(q.answer) ? q.answer.join(',') : q.answer,
      q.explanation || '',
      q.points || 5
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(','))
    ].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}_题库_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowToast(`题库已导出为 CSV 文件，共 ${currentBank.length} 题`);
  };

  // 导入题库（打开导入弹窗）
  const openImportModal = () => {
    setIsImportModalOpen(true);
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Combined bank (memoized for performance and stability)
  const fullBank = useMemo(() =>
    [...INITIAL_BANK, ...customQuestions].filter(q => q.subject === currentSubjectId)
  , [customQuestions, currentSubjectId]);

  // Filtered bank (excluding removed questions)
  const currentBank = useMemo(() => fullBank.filter(q => !removedIds.includes(q.id)), [fullBank, removedIds]);

  // Current subject favorites count
  const currentSubjectFavoriteCount = useMemo(() =>
    currentBank.filter(q => favoriteIds.includes(q.id)).length
  , [currentBank, favoriteIds]);

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

  const startExam = (mode: 'normal' | 'mistakes' | 'full' | 'favorites' | 'random' = 'normal') => {
    let source = currentBank;
    setIsMistakeMode(mode === 'mistakes');
    setIsFullMode(mode === 'full');
    setIsRandomMode(mode === 'random');

    // 全量测试模式允许空题库进入，以便用户导入题目
    // 但题库完全为空时，所有模式都不允许进入
    if (currentBank.length === 0) {
      setShowToast('当前题库为空，请先导入题目');
      return;
    }
    if (mode === 'mistakes') {
      const mistakeIds = mistakeRecords.map(r => r.questionId);
      const uniqueMistakeIds = Array.from(new Set(mistakeIds));
      source = currentBank.filter(q => uniqueMistakeIds.includes(q.id));

      if (source.length === 0) {
        setShowToast('错题本目前是空的哦!');
        return;
      }
    } else if (mode === 'favorites') {
      source = currentBank.filter(q => favoriteIds.includes(q.id));
      if (source.length === 0) {
        setShowToast('收藏夹目前是空的哦!');
        return;
      }
    } else if (mode !== 'full' && source.length === 0) {
      // 全量测试模式允许空题库进入，以便用户导入题目
      setShowToast('当前题库中没有符合条件的题目');
      return;
    }

    const shuffled = [...source].sort(() => 0.5 - Math.random());
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
    setConfirmingDelete(false);
    setShowFeedback(false);
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const removeQuestion = async (id: number) => {
    const newRemovedIds = [...new Set([...removedIds, id])];
    setRemovedIds(newRemovedIds);

    // 同步到 API(只删除实际存在的题目)
    if (currentUser && customQuestions.some(q => q.id === id)) {
      questionApi.delete(id).catch(e => console.warn('API删除题目失败:', e));
    }

    setShowToast('该题目已从题库及错题本中剔除');
    setConfirmingDelete(false);

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
  };

  const toggleFavorite = async (id: number) => {
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
  };

  const handleAnswerChange = (questionId: number, answer: string | string[]) => {
    if (showFeedback && (isMistakeMode || isFullMode)) return;
    setUserAnswers(prev => ({ ...prev, [questionId]: answer }));

    // Auto-check for single choice in practice modes
    const q = examQuestions.find(q => q.id === questionId);
    if ((isMistakeMode || isFullMode || isRandomMode) && q?.type === 'single') {
      setShowFeedback(true);
      const isCorrect = typeof answer === 'string' && typeof q.answer === 'string'
        ? answer.trim() === q.answer.trim()
        : answer === q.answer;
      updateMistakeRecord(q.id, isCorrect);
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
    if (showFeedback && (isMistakeMode || isFullMode || isRandomMode)) return;
    const current = (userAnswers[questionId] as string[]) || [];
    if (current.includes(option)) {
      handleAnswerChange(questionId, current.filter(o => o !== option));
    } else {
      handleAnswerChange(questionId, [...current, option]);
    }
  };

  const updateMistakeRecord = async (questionId: number, isCorrect: boolean) => {
    const currentRecord = mistakeRecords.find(r => r.questionId === questionId);

    if (isCorrect) {
      // 答对时:如果在错题本中,增加连续正确次数,达到3次则移除
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
      // 答错时:如果不在错题本中则添加,已存在则重置计数
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
  };

  const isAnswerCorrect = (q: Question, userAns: any) => {
    if (!userAns) return false;

    if (q.type === 'single') {
      const uAns = typeof userAns === 'string' ? userAns.trim() : String(userAns);
      const qAns = typeof q.answer === 'string' ? q.answer.trim() : String(q.answer);

      // 1. Direct match
      if (uAns === qAns) return true;

      // 2. Label match (e.g., answer is "A", user selected the text of option A)
      if (q.options && /^[A-Z]$/.test(qAns.toUpperCase())) {
        const labelIndex = qAns.toUpperCase().charCodeAt(0) - 65;
        if (q.options[labelIndex]?.trim() === uAns) return true;
      }

      return false;
    }

    if (q.type === 'multiple') {
      const sortedUser = Array.isArray(userAns) ? [...userAns].map(s => s.trim()).sort() : [];
      const qAns = q.answer;

      // If answer is labels like ["A", "B"]
      let targetAns = Array.isArray(qAns) ? [...qAns].map(s => s.trim()).sort() : [];
      if (q.options && targetAns.every(a => /^[A-Z]$/.test(a.toUpperCase()))) {
        targetAns = targetAns.map(label => {
          const idx = label.toUpperCase().charCodeAt(0) - 65;
          return q.options![idx]?.trim() || label;
        }).sort();
      }

      return sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(targetAns);
    }

    if (q.type === 'programming') {
      const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
      return normalize(userAns as string) === normalize(q.answer as string);
    }

    return false;
  };

  const checkMultipleAnswer = () => {
    const q = examQuestions[currentIndex];
    const userAns = userAnswers[q.id] || [];
    const isCorrect = isAnswerCorrect(q, userAns);

    setShowFeedback(true);
    updateMistakeRecord(q.id, isCorrect);
  };

  const calculateResult = async () => {
    let score = 0;
    const correctness: Record<number, boolean> = {};

    for (const q of examQuestions) {
      const userAns = userAnswers[q.id];
      const isCorrect = isAnswerCorrect(q, userAns);

      correctness[q.id] = isCorrect;

      if (isCorrect) {
        score += (100 / examQuestions.length);
      }

      // 更新本地错题记录
      const currentRecord = mistakeRecords.find(r => r.questionId === q.id);
      if (isCorrect) {
        if (currentRecord) {
          const nextCorrect = (currentRecord.consecutiveCorrect || 0) + 1;
          if (nextCorrect >= 3) {
            // 连续答对3次,从错题本移除
            const updated = mistakeRecords.filter(r => r.questionId !== q.id);
            setMistakeRecords(updated);
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

  // 移除了待同步题目功能,所有操作直接通过 API 完成

  const handleImport = async (newQuestions: Question[], targetSubjectId: SubjectId = currentSubjectId) => {
    // 未登录用户不能导入题目
    if (!currentUser) {
      setShowToast('请先登录以保存题目到服务器');
      return;
    }

    // 使用时间戳+随机数生成唯一ID,避免ID冲突
    const generateUniqueId = () => Date.now() + Math.floor(Math.random() * 1000);
    const enriched = newQuestions.map((q) => ({
      ...q,
      id: generateUniqueId(),
      subject: targetSubjectId
    }));

    // 批量同步到后端数据库
      try {
        const apiQuestions = enriched.map(q => ({
          subject_id: q.subject,  // 使用 subject_id 字段
          type: q.type,
          title: q.title,
          code: q.code,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          points: q.points,
          input: q.input,
        }));

        // 传递 targetSubjectId 作为后端的 subject_id
        await questionApi.batchImport(apiQuestions, targetSubjectId);

        // API 调用成功后,将题目添加到前端状态
        setCustomQuestions(prev => [...prev, ...enriched]);
        setShowToast(`成功导入 ${newQuestions.length} 道题目到题库!`);
      } catch (e: any) {
        console.error('API批量导入失败:', e);

        // 解析错误信息
        let errorMessage = '数据库同步失败';
        if (e?.message) {
          errorMessage = e.message;
        } else if (e?.response?.data?.error) {
          errorMessage = e.response.data.error;
        } else if (e?.status === 0) {
          errorMessage = '网络连接失败,请检查网络';
        } else if (e?.status === 401) {
          errorMessage = '登录已过期,请重新登录';
        } else if (e?.status === 403) {
          errorMessage = '无权限向此科目导入题目';
        } else if (e?.status === 500) {
          errorMessage = '服务器错误,请稍后重试';
        }

        setShowToast(`导入失败:${errorMessage},请稍后重试`);
      }
  };

  const currentQuestion = examQuestions[currentIndex];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStatus('welcome')}>
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <span className="text-xl">{currentSubject.icon}</span>
                </div>
                <h1 className="font-bold text-lg tracking-tight hidden sm:block">{currentSubject.name}</h1>
              </div>

              {/* 初始化按钮 - 登录用户可用 */}
              <button
                onClick={(e) => {
                  if (!currentUser) return;
                  e.stopPropagation();
                  setShowInitModal(true);
                }}
                className={`ml-2 sm:ml-4 px-2 sm:px-3 py-1.5 rounded-lg font-medium text-xs sm:text-sm transition-all flex items-center gap-1 ${
                  currentUser
                    ? 'bg-slate-300 text-slate-700 hover:bg-slate-400 cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={currentUser ? '初始化考试科目和题库' : '登录后可使用'}
                disabled={!currentUser}
              >
                <RefreshCcw size={12} className="sm:size-3.5" />
                <span className="hidden xs:inline">重置</span>
              </button>
            </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* 加入共享科目入口 */}
            {currentUser && (
              <button
                onClick={() => setIsJoinSubjectOpen(true)}
                className="px-2 sm:px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-emerald-100 transition-all flex items-center gap-1"
                title="加入共享科目"
              >
                <Key size={14} />
                <span className="hidden sm:inline">加入科目</span>
              </button>
            )}
            {/* 管理员用户管理入口 */}
            {isAdmin && (
              <button
                onClick={() => {
                  setShowUserManagement(true);
                  getUserList().then(list => setUserList(list));
                }}
                className="px-2 sm:px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-red-100 transition-all flex items-center gap-1"
                title="管理用户"
              >
                <Shield size={14} />
                <span className="hidden sm:inline">管理用户</span>
              </button>
            )}
            {/* 老师学生管理入口 */}
            {isTeacher && (
              <button
                onClick={() => setIsStudentManagementOpen(true)}
                className="px-2 sm:px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-indigo-100 transition-all flex items-center gap-1"
                title="学生管理"
              >
                <Users size={14} />
                <span className="hidden sm:inline">学生管理</span>
              </button>
            )}
            {/* 帮助按钮 - 始终可见 */}
            <button
              onClick={() => setIsHelpOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-blue-100 transition-all flex items-center gap-1.5"
              title="帮助手册"
            >
              <HelpCircle size={15} />
              <span className="hidden sm:inline">帮助</span>
            </button>

            {/* 移除了待同步题目提示 */}

            {/* 登录/登出按钮 */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-medium text-sm hover:bg-amber-100 transition-all flex items-center gap-2"
                  title="用户菜单"
                >
                  <CheckCircle2 size={16} />
                  <span>{currentUser}</span>
                  {isAdmin && (
                    <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                      管理员
                    </span>
                  )}
                  {isTeacher && !isAdmin && (
                    <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold">
                      老师
                    </span>
                  )}
                  {!isAdmin && !isTeacher && authUser?.role === 'independent' && (
                    <span className="text-xs bg-slate-400 text-white px-2 py-0.5 rounded-full font-bold">
                      独立
                    </span>
                  )}
                  {!isAdmin && !isTeacher && authUser?.role === 'student' && (
                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">
                      学生
                    </span>
                  )}
                  <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 min-w-[160px]">
                      {!isAdmin && (
                        <button
                          onClick={() => { setShowUserMenu(false); setShowDeleteAccountConfirm(true); }}
                          className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-500"
                        >
                          <Trash2 size={15} className="text-slate-400" />
                          注销账号
                        </button>
                      )}
                      {!isAdmin && (
                        <button
                          onClick={() => { setShowUserMenu(false); setShowRoleSwitch(true); }}
                          className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                        >
                          <Users size={15} className="text-indigo-500" />
                          切换身份
                        </button>
                      )}
                      <button
                        onClick={() => { setShowUserMenu(false); setShowChangePasswordModal(true); }}
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                      >
                        <Key size={15} className="text-blue-500" />
                        修改密码
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }}
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-red-600 border-t border-slate-50 mt-1 pt-1.5"
                      >
                        <XCircle size={15} />
                        退出登录
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg font-medium text-sm hover:bg-blue-100 transition-all flex items-center gap-2"
                title="登录"
              >
                <Settings size={16} />
                <span>登录</span>
              </button>
            )}

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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStatus('welcome')}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-semibold hover:bg-slate-200 transition-all"
              >
                <ChevronLeft size={22} />
                <span>返回上一级</span>
              </button>
            </div>
          )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
        <AnimatePresence mode="wait">
          {status === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
            >
              {/* Subject Selection */}
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-5 sm:mb-6 relative">
                {allSubjects.map((subject) => {
                  const isPending = subject.subscriptionStatus === 'pending';
                  const isApprovedShared = subject.isSubscribed && !subject.isOwner && !isPending;
                  return (
                  <div key={subject.id} className="relative group">
                    <button
                      onClick={() => !isPending && setCurrentSubjectId(subject.id)}
                      disabled={questionsLoading}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                        questionsLoading
                          ? 'opacity-60 cursor-wait'
                          : isPending
                            ? 'bg-amber-50 text-amber-500 cursor-not-allowed opacity-70 border-2 border-amber-200 border-dashed'
                            : currentSubjectId === subject.id
                              ? isApprovedShared
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105'
                                : 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105'
                              : isApprovedShared
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-2 border-emerald-300 border-dashed'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {questionsLoading && currentSubjectId === subject.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <span>{subject.icon}</span>
                      )}
                      <span>{subject.name}</span>
                      {isPending && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 bg-amber-200 text-amber-700">
                          <Clock size={9} />待审核
                        </span>
                      )}
                      {isApprovedShared && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${
                          currentSubjectId === subject.id
                            ? 'bg-emerald-400/30 text-white'
                            : 'bg-emerald-200 text-emerald-800'
                        }`}>
                          <Share2 size={9} />
                          共享{subject.creatorName ? `·${subject.creatorName}` : ''}
                        </span>
                      )}
                    </button>
                  </div>
                  );
                })}
                {/* 科目管理入口 - 登录用户可用 */}
                <button
                  onClick={() => {
                    if (!currentUser) return;
                    setEditingSubject(null);
                    setIsAddingNewSubject(false);
                    setShowSubjectModal(true);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all text-sm ${
                    currentUser
                      ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer'
                      : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                  }`}
                  title={currentUser ? '管理科目' : '登录后可使用'}
                  disabled={!currentUser}
                >
                  <Layers size={14} />
                  <span>管理</span>
                </button>
              </div>



              <h2 className="text-2xl sm:text-3xl font-bold mb-3">{currentSubject.welcomeTitle}</h2>
              <p className="text-slate-500 mb-5 sm:mb-6 max-w-md mx-auto leading-relaxed text-sm sm:text-base">
                {currentSubject.welcomeDesc} (题库共 {currentBank.length} 题)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 text-left">
                <button
                  onClick={() => startExam('random')}
                  className="p-4 sm:p-5 bg-emerald-50 rounded-2xl border-2 border-emerald-100 hover:border-emerald-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <RefreshCcw size={24} />
                  </div>
                  <div className="font-bold text-lg text-emerald-900">随机练习模式</div>
                  <div className="text-sm text-emerald-600/70">即时反馈,自定义题数</div>
                  <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative group/input">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={examQuestionCount}
                        placeholder="10"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setExamQuestionCount(val);
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(examQuestionCount);
                          if (isNaN(val) || val <= 0 || val > currentBank.length) {
                            setExamQuestionCount("10");
                            setShowToast(`题数已重置为默认值 (1-${currentBank.length} 之间)`);
                          }
                        }}
                        className="w-20 px-3 py-1.5 bg-white/80 border-2 border-emerald-200 rounded-xl text-sm font-bold text-emerald-600 outline-none focus:border-emerald-500 focus:bg-white transition-all text-center"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">
                      范围: 1-{currentBank.length}
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => startExam('normal')}
                  className="p-4 sm:p-5 bg-blue-50 rounded-2xl border-2 border-blue-100 hover:border-blue-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <BookOpen size={24} />
                  </div>
                  <div className="font-bold text-lg text-blue-900">开始正式考试</div>
                  <div className="text-sm text-blue-600/70">随机抽取 {examQuestionCount || '...'} 题,全面检测</div>
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
                  className="p-4 sm:p-5 bg-purple-50 rounded-2xl border-2 border-purple-100 hover:border-purple-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Database size={24} />
                  </div>
                  <div className="font-bold text-lg text-purple-900">题库全量测试</div>
                  <div className="text-sm text-purple-600/70">包含题库所有题目,深度练习</div>
                </button>

                <button
                  onClick={() => startExam('mistakes')}
                  className="p-4 sm:p-5 bg-rose-50 rounded-2xl border-2 border-rose-100 hover:border-rose-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-rose-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <History size={24} />
                  </div>
                  <div className="font-bold text-lg text-rose-900">进入错题练习</div>
                  <div className="text-sm text-rose-600/70">针对薄弱环节,连续对 3 次即消除</div>
                  <div className="mt-2 inline-block px-2 py-0.5 bg-rose-200 text-rose-700 text-xs font-bold rounded-full">
                    当前错题: {mistakeRecords.length}
                  </div>
                </button>

                <button
                  onClick={() => startExam('favorites')}
                  className={`p-4 sm:p-5 rounded-2xl border-2 transition-all text-left group ${
                    currentSubjectFavoriteCount === 0
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-amber-50 border-amber-100 hover:border-amber-300'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${
                    currentSubjectFavoriteCount === 0 ? 'bg-slate-400 text-white' : 'bg-amber-500 text-white'
                  }`}>
                    <Star size={24} fill={currentSubjectFavoriteCount > 0 ? "currentColor" : "none"} />
                  </div>
                  <div className={`font-bold text-lg ${currentSubjectFavoriteCount === 0 ? 'text-slate-500' : 'text-amber-900'}`}>
                    {currentSubjectFavoriteCount === 0 ? '暂无收藏题目' : '我的收藏题库'}
                  </div>
                  <div className="text-sm text-amber-600/70">复习您标记的重点题目</div>
                  <div className="mt-2 inline-block px-2 py-0.5 bg-amber-200 text-amber-700 text-xs font-bold rounded-full">
                    收藏总数: {currentSubjectFavoriteCount}
                  </div>
                  {currentSubjectFavoriteCount === 0 && (
                    <div className="mt-2 text-xs text-slate-400">练习时点击⭐收藏题目</div>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsImportModalOpen(true);
                  }}
                  disabled={!currentUser}
                  className={`p-4 sm:p-5 rounded-2xl border-2 transition-all text-left group ${
                    currentUser
                      ? 'bg-indigo-50 border-indigo-100 hover:border-indigo-300'
                      : 'bg-slate-50 border-slate-100 cursor-not-allowed'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${
                    currentUser ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-500'
                  }`}>
                    <PlusCircle size={24} />
                  </div>
                  <div className={`font-bold text-lg ${currentUser ? 'text-indigo-900' : 'text-slate-400'}`}>导入新增题目</div>
                  <div className={`text-sm ${currentUser ? 'text-indigo-600/70' : 'text-slate-400'}`}>
                    {currentUser ? '支持 Word/PDF/粘贴,AI 智能解析' : '登录后可使用'}
                  </div>
                </button>
              </div>

              {/* 空状态引导 */}
              {(mistakeRecords.length === 0 && favoriteIds.length === 0) && (
                <div className="mt-4 p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
                  <p className="text-sm text-blue-600">
                    💡 开始练习后,做错的题目会自动进入错题本
                  </p>
                  <p className="text-xs text-blue-400 mt-1">
                    点击⭐收藏题目,可随时复习重点内容
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-slate-400 text-xs sm:text-sm mt-4">
                <div className="flex items-center gap-1"><CircleDot size={16} /> 单选题</div>
                <div className="flex items-center gap-1"><ListChecks size={16} /> 多选题</div>
                <div className="flex items-center gap-1"><Trash2 size={16} /> 题库剔除功能</div>
              </div>
            </motion.div>
          )}

          {status === 'exam' && (
            examQuestions.length === 0 ? (
              /* 空题库状态 */
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
                  <button
                    onClick={() => setStatus('welcome')}
                    className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    返回首页
                  </button>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 sm:space-y-5"
            >
              {/* Progress Bar */}
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
                      {currentQuestion.type === 'single' && currentQuestion.options?.length === 2 && ['正确','错误'].every(o => currentQuestion.options!.includes(o)) ? '判断题' : currentQuestion.type === 'single' ? '单选题' : currentQuestion.type === 'multiple' ? '多选题' : '编程题'}
                    </span>
                    {isRandomMode && (
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">
                        随机练习
                      </span>
                    )}
                    {isMistakeMode && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-full">
                          错题强化
                        </span>
                        <div className="flex items-center gap-0.5 bg-slate-100 px-2 py-1 rounded-full">
                          {[1, 2, 3].map((star) => {
                            const record = mistakeRecords.find(r => r.questionId === currentQuestion.id);
                            const count = record?.consecutiveCorrect || 0;
                            return (
                              <Star
                                key={star}
                                size={12}
                                className={star <= count ? "text-amber-500 fill-amber-500" : "text-slate-300"}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {examQuestions.length > 0 && examQuestions.every(eq => favoriteIds.includes(eq.id)) && (
                      <span className="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full">
                        收藏复习
                      </span>
                    )}
                    {isFullMode && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-purple-50 text-purple-600 text-xs font-bold rounded-full">
                          全量练习
                        </span>
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
                              <button onClick={() => { setSearchQuery(""); setIsSearchOpen(false); }}>
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
                            <button onClick={deduplicateBank} className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">是</button>
                            <button onClick={() => setConfirmingDeduplicate(false)} className="text-[10px] font-black text-slate-400 hover:text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100">否</button>
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
                            <button onClick={filterObjectiveOnly} className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">是</button>
                            <button onClick={() => setConfirmingFilter(false)} className="text-[10px] font-black text-slate-400 hover:text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100">否</button>
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
                            currentUser
                              ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                          title="导入题库"
                        >
                          <Upload size={12} /> 导入
                        </button>

                        <div className="flex items-center rounded-md overflow-hidden border border-green-200">
                          <select
                            value={exportFormat}
                            onChange={e => setExportFormat(e.target.value as 'csv' | 'json')}
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
                        className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200 rounded-2xl shadow-lg shadow-rose-100/50">
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
                          className={`flex items-center gap-1.5 transition-colors text-xs font-bold uppercase ${favoriteIds.includes(currentQuestion.id) ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                        >
                          <Star size={14} fill={favoriteIds.includes(currentQuestion.id) ? "currentColor" : "none"} />
                          {favoriteIds.includes(currentQuestion.id) ? '已收藏' : '收藏'}
                        </button>
                        {/* 剔除功能仅在 全量练习、错题强化 中显示,随机练习、正式考试、收藏复习中隐藏 */}
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

                <h3 className="text-xl font-bold mb-6 leading-snug">
                  {currentQuestion.title}
                </h3>

                {isFullMode && searchQuery && (
                  <div className="mb-6 space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">搜索结果:</div>
                    <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
                      {examQuestions.filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                        examQuestions.filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase())).map((q, idx) => (
                          <button
                            key={q.id}
                            onClick={() => {
                              const newIndex = examQuestions.findIndex(eq => eq.id === q.id);
                              setCurrentIndex(newIndex);
                              setShowFeedback(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                              currentQuestion.id === q.id
                                ? 'bg-blue-600 text-white font-bold'
                                : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span className="opacity-50 mr-2">#{examQuestions.findIndex(eq => eq.id === q.id) + 1}</span>
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
                        <button
                          onClick={checkProgrammingAnswer}
                          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
                        >
                          提交并查看解析
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentQuestion.options?.map((option, i) => {
                        const userAns = userAnswers[currentQuestion.id];
                        const qAns = currentQuestion.answer;

                        const isSelected = currentQuestion.type === 'single'
                          ? (typeof userAns === 'string' && typeof option === 'string' ? userAns.trim() === option.trim() : userAns === option)
                          : (Array.isArray(userAns) ? userAns.map(s => s.trim()).includes(option.trim()) : false);

                        // Check if this specific option is correct
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
                          const targetAns = Array.isArray(qAns) ? qAns.map(s => s.trim()) : [String(qAns).trim()];

                          if (targetAns.includes(optTrim)) {
                            isCorrect = true;
                          } else {
                            // Check if targetAns contains labels like ["A", "B"]
                            const labelIndices = targetAns
                              .filter(a => /^[A-Z]$/.test(a.toUpperCase()))
                              .map(a => a.toUpperCase().charCodeAt(0) - 65);
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
                            onClick={() => currentQuestion.type === 'single'
                              ? handleAnswerChange(currentQuestion.id, option)
                              : toggleMultipleAnswer(currentQuestion.id, option)
                            }
                            className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group ${borderClass}`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${dotClass}`}>
                              {String.fromCharCode(65 + i)}
                            </div>
                            <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-slate-600'}`}>
                              {option}
                            </span>
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
                      正确答案:<span className="font-bold text-emerald-600">
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
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-all"
                >
                  <ChevronLeft size={20} /> 上一题
                </button>

                {(isMistakeMode || isFullMode || isRandomMode) && !showFeedback && currentQuestion.type === 'multiple' && (
                  <button
                    onClick={checkMultipleAnswer}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    确认答案
                  </button>
                )}

                {(isMistakeMode || isFullMode || isRandomMode) && !showFeedback && currentQuestion.type === 'programming' && (
                  <button
                    onClick={checkProgrammingAnswer}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    确认代码
                  </button>
                )}

                {(isMistakeMode || isFullMode || isRandomMode ? showFeedback : true) && (
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
            )
          )}

          {status === 'result' && finalResult && (
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

                  <p className="text-slate-500 max-w-sm mx-auto mb-5 sm:mb-6 text-sm">
                    {finalResult.score >= 90 ? "太棒了!错题已更新,继续保持。" :
                     finalResult.score >= 60 ? "表现不错!错题已加入错题本,记得复习。" :
                     "别灰心,错题本会帮你记录薄弱点,多练几次!"}
                  </p>

                  <div className="flex flex-col items-center gap-4 sm:gap-5">
                    <button
                      onClick={() => setStatus('welcome')}
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
                  const mistakeRecord = mistakeRecords.find(r => r.questionId === q.id);

                  return (
                    <div
                      key={q.id}
                      className={`bg-white rounded-2xl p-4 sm:p-5 border-l-4 shadow-sm ${
                        isCorrect ? 'border-emerald-500' : 'border-rose-500'
                      }`}
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
                            {mistakeRecords.some(r => r.questionId === q.id) && (
                              <div className="flex items-center gap-0.5 ml-1">
                                {[1, 2, 3].map((star) => {
                                  const record = mistakeRecords.find(r => r.questionId === q.id);
                                  const count = record?.consecutiveCorrect || 0;
                                  return (
                                    <Star
                                      key={star}
                                      size={10}
                                      className={star <= count ? "text-amber-500 fill-amber-500" : "text-slate-200"}
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
                          <h4 className="font-bold text-slate-800 leading-snug">{q.title}</h4>
                        </div>
                      </div>

                      <div className="space-y-2 sm:space-y-3 text-sm">
                        <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl text-sm">
                          <span className="text-slate-400 font-bold mr-2">你的回答:</span>
                          <span className={isCorrect ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                            {Array.isArray(finalResult.answers[q.id])
                              ? (finalResult.answers[q.id] as string[]).join(', ')
                              : (finalResult.answers[q.id] as string) || '(未回答)'}
                          </span>
                        </div>
                        {!isCorrect && (
                          <div className="p-2.5 sm:p-3 bg-blue-50 rounded-xl text-sm">
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

      <footer className="py-6 sm:py-8 text-center text-slate-400 text-xs sm:text-sm">
        <p className="text-slate-400">© 2026 海龙在线学习平台 - 海龙制作</p>
        <VisitCounter />
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

      {isImportModalOpen && (
        <div>
          {console.log('ImportModal should render')}
          <ImportModal
            onClose={() => setIsImportModalOpen(false)} 
            onImport={handleImport}
            allSubjects={allSubjects}
            currentSubjectId={currentSubjectId}
            authUser={authUser}
          />
        </div>
      )}

      <LoginModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLogin={login}
        onRegister={register}
        onChangePassword={changePassword}
        onSendCode={sendVerificationCode}
        onVerifyCode={verifyCode}
        onResetPassword={resetPassword}
        onCheckUsername={checkUsername}
        onSetupPassword={setupPassword}
        isAdmin={isAdmin}
        currentUser={currentUser}
      />

      <JoinSubjectModal
        isOpen={isJoinSubjectOpen}
        onClose={() => setIsJoinSubjectOpen(false)}
        onJoined={() => window.location.reload()}
      />

      {isStudentManagementOpen && (
          <StudentManagementModal
            onClose={() => setIsStudentManagementOpen(false)}
          />
      )}

      {!!studentSelectorSubject && (
          <StudentSelectorModal
            subjectId={studentSelectorSubject?.id || ''}
            subjectName={studentSelectorSubject?.name || ''}
            onClose={() => setStudentSelectorSubject(null)}
            onStudentIdsChange={async (studentIds) => {
              if (studentSelectorSubject && currentUser) {
                await subjectApi.update(studentSelectorSubject.id, { shareScope: 'students', studentIds });
              }
            }}
          />
      )}

      {/* 用户管理模态框 */}
      {showUserManagement && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users size={20} className="text-purple-600" />
                用户管理
              </h3>
              <button
                onClick={() => setShowUserManagement(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* 用户列表 */}
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="space-y-3">
                {userList.map((user) => (
                  <div key={user.username} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800">{user.username}</span>
                          {user.role === 'admin' && (
                            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">管理员</span>
                          )}
                          {user.role === 'teacher' && (
                            <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full font-medium">老师</span>
                          )}
                          {user.role === 'student' && (
                            <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium">学生</span>
                          )}
                          {user.role === 'independent' && (
                            <span className="text-xs bg-slate-400 text-white px-2 py-0.5 rounded-full font-medium">独立用户</span>
                          )}
                          {user.passwordReset && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">需重置密码</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          {user.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={12} className="text-slate-400" />
                              {user.phone}
                            </span>
                          )}
                          {user.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={12} className="text-slate-400" />
                              {user.email}
                            </span>
                          )}
                          {user.role === 'teacher' && (
                            <button
                              onClick={async () => {
                                if (expandedTeacher === user.id) {
                                  setExpandedTeacher(null);
                                  setTeacherStudents([]);
                                } else {
                                  setExpandedTeacher(user.id!);
                                  try {
                                    const res = await authApi.getTeacherStudents(user.id!);
                                    setTeacherStudents(res.students);
                                  } catch {
                                    setTeacherStudents([]);
                                  }
                                }
                              }}
                              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                              <Users size={12} />
                              {user.studentCount} 名学生
                              <ChevronDown size={12} className={`transition-transform ${expandedTeacher === user.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          {user.role === 'student' && user.teacherName && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <GraduationCap size={12} />
                              老师:{user.teacherName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        {user.username !== 'admin' && (
                          <>
                            <button
                              onClick={() => {
                                setUserActionConfirm({
                                  type: 'clearPassword',
                                  username: user.username,
                                  onConfirm: async () => {
                                    const result = await clearUserPassword(user.username);
                                    if (result.success) {
                                      setUserActionConfirm(null);
                                      getUserList().then(list => setUserList(list));
                                    } else {
                                      alert(result.error);
                                    }
                                  }
                                });
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-sm hover:bg-orange-200 transition-colors"
                              title="清除密码"
                            >
                              <Key size={14} />
                              <span>清空密码</span>
                            </button>
                            <button
                              onClick={() => {
                                setUserActionConfirm({
                                  type: 'delete',
                                  username: user.username,
                                  onConfirm: async () => {
                                    const result = await deleteUser(user.username);
                                    if (result.success) {
                                      setUserActionConfirm(null);
                                      getUserList().then(list => setUserList(list));
                                    } else {
                                      alert(result.error);
                                    }
                                  }
                                });
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200 transition-colors"
                              title="删除用户"
                            >
                              <Trash2 size={14} />
                              <span>删除</span>
                            </button>
                          </>
                        )}
                        {user.username === 'admin' && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Shield size={12} />
                            受保护账号
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 老师的学生列表展开区域 */}
                    {expandedTeacher === user.id && user.role === 'teacher' && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        {teacherStudents.length === 0 ? (
                          <p className="text-sm text-slate-400 pl-2">暂无学生</p>
                        ) : (
                          <div className="space-y-2">
                            {teacherStudents.map((s) => (
                              <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-slate-100">
                                <span className="text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">学生</span>
                                <span className="font-medium text-slate-700 text-sm">{s.username}</span>
                                {s.phone && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Phone size={10} />{s.phone}
                                  </span>
                                )}
                                {s.email && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Mail size={10} />{s.email}
                                  </span>
                                )}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                                  {s.status === 'active' ? '活跃' : '待审核'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 关闭按钮 */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowUserManagement(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 用户操作确认弹窗 */}
      <ConfirmModal
        isOpen={!!userActionConfirm}
        title={userActionConfirm?.type === 'delete' ? '删除用户' : '清除密码'}
        message={
          userActionConfirm?.type === 'delete'
            ? `确定要删除用户 "${userActionConfirm?.username}" 吗?此操作不可恢复。`
            : `确定要清除用户 "${userActionConfirm?.username}" 的密码吗?该用户下次登录时需要设置新密码。`
        }
        confirmText={userActionConfirm?.type === 'delete' ? '确认删除' : '确认清除'}
        cancelText="取消"
        type="warning"
        onConfirm={() => userActionConfirm?.onConfirm()}
        onCancel={() => setUserActionConfirm(null)}
      />

      {/* 退出登录确认弹窗 */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="退出登录"
        message={`确定要退出 ${currentUser} 登录吗?退出后将无法使用题库管理和科目管理功能。`}
        confirmText="确定退出"
        cancelText="取消"
        type="warning"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* 注销账号确认弹窗 */}
      <ConfirmModal
        isOpen={showDeleteAccountConfirm}
        title="确认注销账号"
        message={`确定要注销 ${currentUser} 吗?此操作将永久删除您的账号及所有关联数据(题库、科目、错题记录等),不可恢复。`}
        confirmText={isDeletingAccount ? '注销中...' : '确认注销'}
        cancelText="取消"
        type="danger"
        onConfirm={async () => {
          setIsDeletingAccount(true);
          try {
            await authApi.deleteAccount();
            setShowDeleteAccountConfirm(false);
            logout();
            setDeleteAccountResult('success');
          } catch (err: any) {
            setDeleteAccountError(err.message || '注销失败,请稍后重试');
            setDeleteAccountResult('error');
          } finally {
            setIsDeletingAccount(false);
          }
        }}
        onCancel={() => setShowDeleteAccountConfirm(false)}
      />

      {/* 注销结果弹窗 */}
      {deleteAccountResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center"
          >
            {deleteAccountResult === 'success' ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">账号已成功注销</h3>
                <p className="text-sm text-slate-500 mb-6">感谢您的使用,欢迎随时回来注册新账号。</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle size={32} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">注销失败</h3>
                <p className="text-sm text-red-500 mb-6">{deleteAccountError}</p>
              </>
            )}
            <button
              onClick={() => setDeleteAccountResult(null)}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                deleteAccountResult === 'success'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              知道了
            </button>
          </motion.div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Key size={20} className="text-blue-600" />
                修改密码
              </h3>
              <button
                onClick={() => { setShowChangePasswordModal(false); setChangePasswordError(''); setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' }); }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">当前密码</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={changePasswordForm.oldPassword}
                  onChange={(e) => setChangePasswordForm(prev => ({ ...prev, oldPassword: e.target.value }))}
                  placeholder="请输入当前密码"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">新密码</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="至少6位字符"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">确认新密码</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
              {changePasswordError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  {changePasswordError}
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowChangePasswordModal(false); setChangePasswordError(''); setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' }); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!changePasswordForm.oldPassword) {
                    setChangePasswordError('请输入当前密码');
                    return;
                  }
                  if (changePasswordForm.newPassword.length < 6) {
                    setChangePasswordError('新密码至少6位');
                    return;
                  }
                  if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
                    setChangePasswordError('两次输入的新密码不一致');
                    return;
                  }
                  setIsChangingPassword(true);
                  setChangePasswordError('');
                  const result = await changePassword(changePasswordForm.oldPassword, changePasswordForm.newPassword);
                  setIsChangingPassword(false);
                  if (result.success) {
                    setShowChangePasswordModal(false);
                    setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                    setShowToast('密码修改成功');
                  } else {
                    setChangePasswordError(result.error || '修改失败');
                  }
                }}
                disabled={isChangingPassword}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isChangingPassword ? '修改中...' : '确认修改'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 帮助手册弹窗 */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* 角色切换弹窗 */}
      <RoleSwitchModal
        isOpen={showRoleSwitch}
        onClose={() => setShowRoleSwitch(false)}
        currentRole={authUser?.role || 'independent'}
        onConvertRole={convertRole}
        onBindTeacher={bindTeacher}
      />

      {/* 初始化模态框 */}
      {showInitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <RefreshCcw size={20} className="text-blue-600" />
                系统初始化
              </h3>
              <button
                onClick={() => setShowInitModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                选择要初始化的科目。初始化后将:<br/>
                • 清空所选科目的所有题目(包括默认题库)<br/>
                • 清空错题记录、收藏夹和自定义题目<br/>
                • 系统变为真正的空题库状态
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                  if (selectedInitSubjects.length === allSubjects.length) {
                    setSelectedInitSubjects([]);
                  } else {
                    setSelectedInitSubjects(allSubjects.map(s => s.id));
                  }
                }}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedInitSubjects.length === allSubjects.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-slate-400'}`}>
                    {selectedInitSubjects.length === allSubjects.length && <Check size={12} className="text-white" />}
                  </div>
                  <span className="font-medium text-slate-700">全选所有科目</span>
                </label>

                <div className="pl-6 space-y-2">
                  {allSubjects.map(subject => (
                    <label key={subject.id} className="flex items-center gap-2 cursor-pointer group select-none" onClick={() => {
                      if (selectedInitSubjects.includes(subject.id)) {
                        setSelectedInitSubjects(prev => prev.filter(id => id !== subject.id));
                      } else {
                        setSelectedInitSubjects(prev => [...prev, subject.id]);
                      }
                    }}>
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedInitSubjects.includes(subject.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-slate-400'}`}
                      >
                        {selectedInitSubjects.includes(subject.id) && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-slate-600 group-hover:text-slate-800 flex items-center gap-1">
                        <span>{subject.icon}</span>
                        {subject.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowInitModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (selectedInitSubjects.length === 0) {
                    alert('请至少选择一个科目进行初始化!');
                    return;
                  }

                  // 获取要隐藏的题目ID(根据科目筛选)
                  const initialBankIdsToHide = INITIAL_BANK
                    .filter(q => selectedInitSubjects.includes(q.subject))
                    .map(q => q.id);

                  // 计算自定义题目中属于选中科目的题目ID
                  const customQuestionIdsToRemove = customQuestions
                    .filter(q => selectedInitSubjects.includes(q.subject))
                    .map(q => q.id);

                  // 合并新的removedIds(追加,而不是替换)
                  const newRemovedIds = [...new Set([...removedIds, ...initialBankIdsToHide, ...customQuestionIdsToRemove])];

                  // 过滤掉选中科目的自定义题目
                  const remainingCustomQuestions = customQuestions.filter(
                    q => !selectedInitSubjects.includes(q.subject)
                  );

                  // 过滤掉选中科目的错题记录(通过关联的题目ID)
                  const allRemovedIdsSet = new Set(newRemovedIds);
                  const remainingMistakeRecords = mistakeRecords.filter(
                    r => !allRemovedIdsSet.has(r.questionId)
                  );

                  // 过滤掉选中科目的收藏(通过关联的题目ID)
                  const remainingFavoriteIds = favoriteIds.filter(
                    id => !allRemovedIdsSet.has(id)
                  );

                  // 移除了 localStorage 更新

                  // 同步删除到 API(只删除实际存在的题目)
                  if (currentUser) {
                    for (const sid of selectedInitSubjects) {
                      subjectApi.delete(sid).catch(() => {});
                    }
                    for (const q of customQuestions.filter(q => selectedInitSubjects.includes(q.subject_id || q.subject))) {
                      questionApi.delete(q.id).catch(() => {});
                    }
                  }

                  // 如果包含当前科目,重置为第一个可用科目
                  if (selectedInitSubjects.includes(currentSubjectId)) {
                    const remainingSubjects = allSubjects.filter(s => !selectedInitSubjects.includes(s.id));
                    setCurrentSubjectId(remainingSubjects[0]?.id || DEFAULT_SUBJECTS[0]?.id || 'chinese');
                  }

                  // 重置所有状态
                  setCustomQuestions(remainingCustomQuestions);
                  setMistakeRecords(remainingMistakeRecords);
                  setFavoriteIds(remainingFavoriteIds);
                  setRemovedIds(newRemovedIds);

                  // 关闭模态框并显示提示
                  setShowInitModal(false);

                  if (selectedInitSubjects.length === allSubjects.length) {
                    setShowToast('✅ 系统已完全初始化!现在是真正的空题库状态。');
                  } else {
                    setShowToast(`✅ 已初始化科目: ${selectedInitSubjects.map(id => allSubjects.find(s => s.id === id)?.name || id).join(', ')}!`);
                  }
                }}
                disabled={selectedInitSubjects.length === 0}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCcw size={16} />
                确认初始化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 科目管理模态框 */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                科目管理
              </h3>
              <button
                onClick={() => {
                  setShowSubjectModal(false);
                  setEditingSubject(null);
                  setIsAddingNewSubject(false);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* 科目列表模式 */}
            {!editingSubject && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-4">
                  管理科目列表(所有科目均可编辑,至少保留1个科目)
                </p>

                {/* 统一科目列表 */}
                {allSubjects.length > 0 && (
                  <div className="space-y-2">
                    {allSubjects.map(subject => (
                      <div key={subject.id}>
                        <div className={`flex items-center justify-between p-3 rounded-xl border ${
                          subject.isSubscribed && !subject.isOwner
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{subject.icon}</span>
                            <div>
                              <div className="font-medium text-slate-800 flex items-center gap-1.5">
                                {subject.name}
                                {subject.isSubscribed && !subject.isOwner ? (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                    <Share2 size={8} />共享{subject.creatorName ? ` · ${subject.creatorName}` : ''}
                                  </span>
                                ) : subject.isShared && subject.isOwner ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    subject.shareScope === 'students' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {subject.shareScope === 'students' ? '学生共享' : '已共享'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">自有</span>
                                )}

                              </div>
                              <div className="text-xs text-slate-400">
                                {customQuestions.filter(q => q.subject === subject.id).length} 道题目
                                {subject.isShared && subject.isOwner && subject.subscriberCount ? ` · ${subject.subscriberCount}人订阅` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* 共享按钮 - 管理员或科目拥有者可用 */}
                            {(isAdmin || subject.isOwner) && !subject.isSubscribed && (
                              <button
                                onClick={() => {
                                  if (expandedShareSubject === subject.id) {
                                    setExpandedShareSubject(null);
                                  } else {
                                    setExpandedShareSubject(subject.id);
                                  }
                                }}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                                  subject.shareScope === 'students'
                                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    : subject.shareScope === 'all'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                }`}
                                title="共享设置"
                              >
                                <Share2 size={12} />
                                <span className="hidden sm:inline">
                                  {subject.shareScope === 'students' ? '学生共享' : subject.shareScope === 'all' ? '全员共享' : '共享'}
                                </span>
                                <ChevronDown size={10} className={`transition-transform ${expandedShareSubject === subject.id ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                            {/* 非拥有者的共享科目只能退订(管理员除外) */}
                            {(isAdmin || !subject.isSubscribed || subject.isOwner) && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingSubject(subject);
                                    setIsAddingNewSubject(false);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <Edit3 size={12} />
                                  <span className="hidden sm:inline">编辑</span>
                                </button>
                                <button
                                  onClick={() => setSubjectToDelete(subject)}
                                  disabled={allSubjects.length <= 1}
                                  className="px-3 py-1.5 bg-rose-500 text-white text-sm rounded-lg hover:bg-rose-600 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={12} />
                                  <span className="hidden sm:inline">删除</span>
                                </button>
                              </>
                            )}
                            {subject.isSubscribed && !subject.isOwner && (
                              <button
                                onClick={async () => {
                                  if (confirm(`确定要退订科目「${subject.name}」吗?退订后该科目将不再显示。`)) {
                                    try {
                                      await subjectApi.leave(subject.id);
                                      window.location.reload();
                                    } catch (e: any) {
                                      setShowToast(e.message || '退订失败');
                                    }
                                  }
                                }}
                                className="px-3 py-1.5 bg-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-300 transition-colors"
                              >
                                退订
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 共享设置展开区域 */}
                        {expandedShareSubject === subject.id && (isAdmin || subject.isOwner) && !subject.isSubscribed && (
                          <div className="mt-1 p-4 bg-slate-50 rounded-xl border border-slate-200 ml-2">
                            <div className="flex items-center gap-2 mb-3">
                              <Share2 size={14} className="text-blue-600" />
                              <span className="text-sm font-bold text-slate-700">共享设置</span>
                            </div>
                            {/* 三个选项 */}
                            <div className="space-y-2 mb-3">
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                (subject.shareScope || 'none') === 'none' ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={(subject.shareScope || 'none') === 'none'}
                                  onChange={async () => {
                                    const updated = customSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: false, shareScope: 'none' as const } : s
                                    );
                                    setCustomSubjects(updated);
                                    if (currentUser) {
                                      subjectApi.update(subject.id, { shareScope: 'none' }).catch(() => {});
                                    }
                                    setShowToast(`已关闭「${subject.name}」共享`);
                                  }}
                                  className="accent-slate-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-slate-700">不共享</div>
                                  <div className="text-xs text-slate-400">仅自己可见</div>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                subject.shareScope === 'students' ? 'bg-indigo-50 ring-2 ring-indigo-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={subject.shareScope === 'students'}
                                  onChange={async () => {
                                    const updated = customSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: true, shareScope: 'students' as const } : s
                                    );
                                    setCustomSubjects(updated);
                                    if (currentUser) {
                                      try {
                                        await subjectApi.update(subject.id, { shareScope: 'students', studentIds: [] });
                                      } catch (e: any) {
                                        alert('保存失败: ' + (e.message || '未知错误'));
                                        return;
                                      }
                                    }
                                    setShowToast(`已开启「${subject.name}」学生共享`);
                                    setExpandedShareSubject(null);
                                    setShowSubjectModal(false);
                                    setStudentSelectorSubject({ id: subject.id, name: subject.name });
                                  }}
                                  className="accent-indigo-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-indigo-700">仅共享给学生</div>
                                  <div className="text-xs text-slate-400">你的学生可直接访问,也可生成邀请码</div>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                subject.shareScope === 'all' ? 'bg-emerald-50 ring-2 ring-emerald-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={subject.shareScope === 'all'}
                                  onChange={async () => {
                                    const updated = customSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: true, shareScope: 'all' as const } : s
                                    );
                                    setCustomSubjects(updated);
                                    if (currentUser) {
                                      try {
                                        await subjectApi.update(subject.id, { shareScope: 'all' });
                                      } catch (e: any) {
                                        alert('保存失败: ' + (e.message || '未知错误'));
                                        return;
                                      }
                                    }
                                    setShowToast(`已开启「${subject.name}」全员共享`);
                                  }}
                                  className="accent-emerald-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-emerald-700">全员共享</div>
                                  <div className="text-xs text-slate-400">任何用户可通过邀请码加入</div>
                                </div>
                              </label>
                            </div>
                            {/* 学生选择按钮(仅 students 模式) */}
                            {subject.shareScope === 'students' && (
                              <div className="mt-2">
                                <button
                                  onClick={() => {
                                    setExpandedShareSubject(null);
                                    setShowSubjectModal(false);
                                    setStudentSelectorSubject({ id: subject.id, name: subject.name });
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-indigo-200 hover:border-indigo-300 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <GraduationCap size={14} className="text-indigo-500" />
                                    <span className="text-sm text-indigo-700">选择共享学生</span>
                                  </div>
                                  <ChevronRight size={14} className="text-indigo-400" />
                                </button>
                              </div>
                            )}
                            {/* 邀请码区域(students 和 all 模式都显示) */}
                            {(subject.shareScope === 'students' || subject.shareScope === 'all') && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <Key size={14} className={subject.shareScope === 'students' ? 'text-indigo-600' : 'text-emerald-600'} />
                                  <span className="text-sm font-medium text-slate-700">邀请码</span>
                                  {subject.shareScope === 'students' && (
                                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">仅限学生使用</span>
                                  )}
                                </div>
                                <SubjectShareCode subjectId={subject.id} subjectName={subject.name} scope={subject.shareScope} />
                                {subject.subscriberCount ? (
                                  <p className="text-xs text-emerald-600 mt-2">已有 {subject.subscriberCount} 人订阅</p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加新科目按钮 */}
                {ownSubjectCount < MAX_OWN_SUBJECTS ? (
                  <button
                    onClick={() => {
                      setEditingSubject({
                        id: `${CUSTOM_SUBJECT_PREFIX}${Date.now()}`,
                        name: '',
                        icon: '📝',
                        welcomeTitle: '新课程学习',
                        welcomeDesc: '开始新的学习之旅',
                      });
                      setIsAddingNewSubject(true);
                      setIsSubjectPendingCreation(false);
                    }}
                    className="w-full mt-4 px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 border-2 border-dashed border-indigo-200"
                  >
                    <PlusCircle size={18} />
                    添加新科目({ownSubjectCount}/{MAX_OWN_SUBJECTS})
                  </button>
                ) : (
                  <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-center">
                    <p className="text-sm text-amber-700">
                      已达到自有科目最大数量({MAX_OWN_SUBJECTS}个),如需添加请先删除现有科目
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 编辑表单模式 */}
            {editingSubject && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => {
                      setEditingSubject(null);
                      setIsAddingNewSubject(false);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={20} className="text-slate-500" />
                  </button>
                  <h4 className="font-bold text-slate-700">
                    {isAddingNewSubject ? '添加新科目' : `编辑「${editingSubject.name}」`}
                  </h4>
                </div>

                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">科目名称</label>
                  <input
                    type="text"
                    value={editingSubject.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      if (isAddingNewSubject) {
                        const suggestion = suggestSubject(newName);
                        if (suggestion) {
                          setEditingSubject({
                            ...editingSubject,
                            name: newName,
                            icon: suggestion.icon,
                            welcomeTitle: suggestion.welcomeTitle,
                            welcomeDesc: suggestion.welcomeDesc,
                          });
                        } else {
                          setEditingSubject({ ...editingSubject, name: newName });
                        }
                      } else {
                        const suggestion = suggestSubject(newName);
                        if (suggestion) {
                          setEditingSubject({
                            ...editingSubject,
                            name: newName,
                            icon: suggestion.icon,
                            welcomeTitle: suggestion.welcomeTitle,
                            welcomeDesc: suggestion.welcomeDesc,
                          });
                        } else {
                          setEditingSubject({ ...editingSubject, name: newName });
                        }
                      }
                    }}
                    placeholder="例如:物理、化学..."
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors"
                    maxLength={20}
                  />
                  {editingSubject.name.trim() && suggestSubject(editingSubject.name) && (
                    <p className="text-xs text-blue-500 mt-1">已根据科目名称自动推荐图标和描述,可自行修改</p>
                  )}
                </div>

                {/* 图标选择 - 分类显示 */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">选择图标</label>
                  <div className="bg-slate-50 rounded-xl p-3 max-h-48 overflow-y-auto">
                    {Object.entries(SUBJECT_ICONS).map(([category, icons]) => (
                      <div key={category} className="mb-3 last:mb-0">
                        <div className="text-xs text-slate-400 font-medium mb-2">{category}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {icons.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => setEditingSubject({ ...editingSubject, icon })}
                              className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${
                                editingSubject.icon === icon
                                  ? 'bg-blue-600 text-white scale-110 shadow-md ring-2 ring-blue-400'
                                  : 'bg-white hover:bg-blue-50 hover:scale-105 shadow-sm'
                              }`}
                              title={icon}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 当前选中的图标预览 */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>当前选择:</span>
                    <span className="text-2xl bg-blue-50 w-10 h-10 rounded-lg flex items-center justify-center border border-blue-100">
                      {editingSubject.icon}
                    </span>
                  </div>
                </div>

                {/* 欢迎标题 */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">欢迎标题</label>
                  <input
                    type="text"
                    value={editingSubject.welcomeTitle}
                    onChange={(e) => setEditingSubject({ ...editingSubject, welcomeTitle: e.target.value })}
                    placeholder="例如:化学知识小测"
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors"
                    maxLength={30}
                  />
                </div>

                {/* 欢迎描述 */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">科目描述</label>
                  <textarea
                    value={editingSubject.welcomeDesc}
                    onChange={(e) => setEditingSubject({ ...editingSubject, welcomeDesc: e.target.value })}
                    placeholder="简要描述这个科目的内容..."
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors resize-none"
                    rows={2}
                    maxLength={100}
                  />
                </div>

{/* 共享设置暂时移除 - 简化初次创建流程 */}
              </div>
            )}

            {/* 操作按钮 - 仅在编辑模式显示 */}
            {editingSubject && (
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setEditingSubject(null);
                    setIsAddingNewSubject(false);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  返回列表
                </button>
                <button
                  onClick={() => {
                    if (!editingSubject.name.trim()) {
                      setShowToast('请输入科目名称');
                      return;
                    }

                    if (isAddingNewSubject) {
                      // 添加新科目
                      if (ownSubjectCount >= MAX_OWN_SUBJECTS) {
                        setShowToast(`最多只能添加 ${MAX_OWN_SUBJECTS} 个自有科目`);
                        return;
                      }
                      const newSubject = { ...editingSubject, id: `${CUSTOM_SUBJECT_PREFIX}${Date.now()}` };
                      setCustomSubjects([...customSubjects, newSubject]);
                      setCurrentSubjectId(newSubject.id);
                      setIsSubjectPendingCreation(true);
                      // 同步到 API
                      if (currentUser) {
                        subjectApi.create({ id: newSubject.id, name: newSubject.name, icon: newSubject.icon, welcomeTitle: newSubject.welcomeTitle, welcomeDesc: newSubject.welcomeDesc, shareScope: newSubject.shareScope || 'none' })
                          .then(() => setIsSubjectPendingCreation(false))
                          .catch(() => setIsSubjectPendingCreation(false));
                      } else {
                        setIsSubjectPendingCreation(false);
                      }
                      setShowToast(`已添加科目「${newSubject.name}」`);
                    } else {
                      // 更新科目(所有科目统一在customSubjects中管理)
                      setCustomSubjects(customSubjects.map(s =>
                        s.id === editingSubject.id ? editingSubject : s
                      ));
                      // 同步到 API
                      if (currentUser) {
                        subjectApi.update(editingSubject.id, {
                          name: editingSubject.name,
                          icon: editingSubject.icon,
                          welcomeTitle: editingSubject.welcomeTitle,
                          welcomeDesc: editingSubject.welcomeDesc,
                          shareScope: editingSubject.shareScope || 'none',
                        }).catch(() => {});
                      }
                      setShowToast(`已更新科目「${editingSubject.name}」`);
                    }

                    setEditingSubject(null);
                    setIsAddingNewSubject(false);
                    setIsSubjectPendingCreation(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  {isAddingNewSubject ? '添加' : '保存'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 科目删除确认对话框 */}
      <AnimatePresence>
        {subjectToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setSubjectToDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.4 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 顶部警告图标 */}
              <div className="bg-gradient-to-br from-rose-500 to-red-600 px-6 py-8 flex flex-col items-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">确认删除</h3>
              </div>

              {/* 内容区域 */}
              <div className="p-6 text-center">
                <p className="text-slate-600 mb-2">
                  确定要删除科目
                </p>
                <p className="text-lg font-bold text-slate-800 mb-3">
                  「{subjectToDelete.name}」
                </p>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4">
                  <p className="text-sm text-rose-600">
                    <span className="font-bold">{customQuestions.filter(q => q.subject === subjectToDelete.id).length}</span> 道关联题目也将被删除
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  此操作无法撤销
                </p>
              </div>

              {/* 按钮区域 */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => setSubjectToDelete(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    // 至少保留1个科目
                    if (allSubjects.length <= 1) {
                      setShowToast('至少保留一个科目');
                      setSubjectToDelete(null);
                      return;
                    }
                    const newCustomSubjects = customSubjects.filter(s => s.id !== subjectToDelete.id);
                    setCustomSubjects(newCustomSubjects);
                    if (currentSubjectId === subjectToDelete.id) {
                      const fallback = newCustomSubjects[0] || DEFAULT_SUBJECTS[0];
                      setCurrentSubjectId(fallback?.id || 'chinese');
                    }
                    // 先同步删除科目到 API(后端会级联删除关联题目)
                    if (currentUser) {
                      subjectApi.delete(subjectToDelete.id).catch(() => {});
                    }
                    // 前端状态清理:使用 subject_id 字段匹配
                    const customQuestionIds = customQuestions
                      .filter(q => q.subject_id === subjectToDelete.id || q.subject === subjectToDelete.id)
                      .map(q => q.id);
                    const newRemovedIds = [...new Set([...removedIds, ...customQuestionIds])];
                    setRemovedIds(newRemovedIds);
                    setCustomQuestions(prev => prev.filter(q => q.subject_id !== subjectToDelete.id && q.subject !== subjectToDelete.id));
                    setShowToast(`已删除科目「${subjectToDelete.name}」及相关题目`);
                    setSubjectToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-br from-rose-500 to-red-600 text-white font-semibold rounded-xl hover:from-rose-600 hover:to-red-700 transition-all shadow-lg shadow-rose-200"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
