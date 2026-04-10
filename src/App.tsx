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
  Database,
  CopyCheck,
  Filter,
  LogOut,
  LogIn,
  User,
  Star,
  Users,
  Search,
  X
} from 'lucide-react';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  deleteDoc, 
  writeBatch,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { QUESTION_BANK as INITIAL_BANK } from './questionBank';
import { Question, ExamResult, SubjectId, SUBJECTS } from './types';
import { ImportModal } from './components/ImportModal';
import { SettingsModal } from './components/SettingsModal';
import { PlusCircle, Settings as SettingsIcon } from 'lucide-react';

interface MistakeRecord {
  questionId: number;
  consecutiveCorrect: number;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<'welcome' | 'exam' | 'result' | 'mistakes' | 'login'>('welcome');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [activeBank, setActiveBank] = useState<Question[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [mistakeRecords, setMistakeRecords] = useState<MistakeRecord[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);

  const [masteredIds, setMasteredIds] = useState<number[]>([]);

  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string | string[]>>({});
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalResult, setFinalResult] = useState<ExamResult | null>(null);
  const [isMistakeMode, setIsMistakeMode] = useState(false);
  const [isFullMode, setIsFullMode] = useState(false);
  const [isFavoritesMode, setIsFavoritesMode] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDeduplicate, setConfirmingDeduplicate] = useState(false);
  const [confirmingFilter, setConfirmingFilter] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [examQuestionCount, setExamQuestionCount] = useState<string>("20");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [currentSubjectId, setCurrentSubjectId] = useState<SubjectId>(() => {
    const saved = localStorage.getItem('current_subject_id');
    return (saved as SubjectId) || 'python';
  });

  const currentSubject = useMemo(() => 
    SUBJECTS.find(s => s.id === currentSubjectId) || SUBJECTS[0]
  , [currentSubjectId]);

  useEffect(() => {
    localStorage.setItem('current_subject_id', currentSubjectId);
  }, [currentSubjectId]);

  // Auth Listener
  useEffect(() => {
    const statsRef = doc(db, 'stats', 'visitor_stats');
    
    // Listen for visitor count updates
    const unsubscribe = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        setVisitorCount(docSnap.data().visitorCount);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stats/visitor_stats');
    });

    // Increment count if not already counted in this session
    const hasVisited = sessionStorage.getItem('has_visited');
    if (!hasVisited) {
      const incrementCount = async () => {
        try {
          const docSnap = await getDoc(statsRef);
          if (!docSnap.exists()) {
            await setDoc(statsRef, { visitorCount: 1, lastUpdated: serverTimestamp() });
          } else {
            await setDoc(statsRef, { 
              visitorCount: increment(1), 
              lastUpdated: serverTimestamp() 
            }, { merge: true });
          }
          sessionStorage.setItem('has_visited', 'true');
        } catch (error) {
          // Silently fail or log to console for stats
          console.error('Error incrementing visitor count:', error);
        }
      };
      incrementCount();
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        setStatus('welcome');
        // Initialize user profile in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              createdAt: serverTimestamp(),
              removedIds: []
            });
          } else {
            // Load removedIds from profile
            const data = userDoc.data();
            if (data.removedIds) setRemovedIds(data.removedIds);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setStatus('welcome');
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync Data with Firestore
  useEffect(() => {
    if (!user) return;

    // Listen to custom questions
    const cqRef = collection(db, 'users', user.uid, 'customQuestions');
    const unsubscribeCQ = onSnapshot(cqRef, (snapshot) => {
      const questions = snapshot.docs.map(doc => doc.data() as Question);
      setCustomQuestions(questions);
    }, (error) => handleFirestoreError(error, OperationType.LIST, cqRef.path));

    // Listen to mistake records
    const mqRef = collection(db, 'users', user.uid, 'wrongQuestions');
    const unsubscribeMQ = onSnapshot(mqRef, (snapshot) => {
      const records = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          questionId: parseInt(doc.id),
          consecutiveCorrect: data.consecutiveCorrect || 0
        } as MistakeRecord;
      });
      setMistakeRecords(records);
    }, (error) => handleFirestoreError(error, OperationType.LIST, mqRef.path));

    // Listen to favorites
    const favRef = collection(db, 'users', user.uid, 'favorites');
    const unsubscribeFav = onSnapshot(favRef, (snapshot) => {
      const ids = snapshot.docs.map(doc => parseInt(doc.id));
      setFavoriteIds(ids);
    }, (error) => handleFirestoreError(error, OperationType.LIST, favRef.path));

    return () => {
      unsubscribeCQ();
      unsubscribeMQ();
      unsubscribeFav();
    };
  }, [user]);

  // Sync removedIds to Firestore
  useEffect(() => {
    if (!user || removedIds.length === 0) return;
    const userRef = doc(db, 'users', user.uid);
    setDoc(userRef, { removedIds }, { merge: true }).catch(err => 
      handleFirestoreError(err, OperationType.UPDATE, userRef.path)
    );
  }, [user, removedIds]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      setShowToast('登录失败，请重试');
      console.error(error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setRemovedIds([]);
      setMistakeRecords([]);
      setFavoriteIds([]);
      setCustomQuestions([]);
    } catch (error) {
      console.error(error);
    }
  };

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
  const fullBank = useMemo(() => 
    [...INITIAL_BANK, ...customQuestions].filter(q => q.subject === currentSubjectId)
  , [customQuestions, currentSubjectId]);

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

  const startExam = (mode: 'normal' | 'mistakes' | 'full' | 'favorites' | 'random' = 'normal') => {
    let source = currentBank;
    setIsMistakeMode(mode === 'mistakes');
    setIsFullMode(mode === 'full');
    setIsRandomMode(mode === 'random');
    setIsFavoritesMode(mode === 'favorites');

    if (mode === 'mistakes') {
      const mistakeIds = mistakeRecords.map(r => r.questionId);
      const uniqueMistakeIds = Array.from(new Set(mistakeIds));
      source = currentBank.filter(q => uniqueMistakeIds.includes(q.id));
      
      if (source.length === 0) {
        setShowToast('错题本目前是空的哦！');
        return;
      }
    } else if (mode === 'favorites') {
      source = currentBank.filter(q => favoriteIds.includes(q.id));
      if (source.length === 0) {
        setShowToast('收藏夹目前是空的哦！');
        return;
      }
    }

    if (source.length === 0) {
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
    
    if (user) {
      // Remove from Firestore mistake records
      const mistakeRef = doc(db, 'users', user.uid, 'wrongQuestions', id.toString());
      try {
        await deleteDoc(mistakeRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, mistakeRef.path);
      }
    }
    
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

  const toggleFavorite = async (id: number) => {
    if (!user) {
      setShowToast('请登录以使用收藏功能');
      return;
    }
    const isFav = favoriteIds.includes(id);
    const favRef = doc(db, 'users', user.uid, 'favorites', id.toString());
    
    try {
      if (isFav) {
        await deleteDoc(favRef);
        setShowToast('已取消收藏');
      } else {
        await setDoc(favRef, { questionId: id.toString(), timestamp: serverTimestamp() });
        setShowToast('已加入收藏夹');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, favRef.path);
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
    if (!user) return;
    
    const recordRef = doc(db, 'users', user.uid, 'wrongQuestions', questionId.toString());
    const currentRecord = mistakeRecords.find(r => r.questionId === questionId);
    
    try {
      if (isCorrect) {
        if (currentRecord) {
          const nextCorrect = (currentRecord.consecutiveCorrect || 0) + 1;
          if (nextCorrect >= 3) {
            await deleteDoc(recordRef);
            setMasteredIds(prev => [...new Set([...prev, questionId])]);
            setShowToast('太棒了！这道题你已经掌握，已从错题本移除 ✨');
          } else {
            await setDoc(recordRef, { consecutiveCorrect: nextCorrect, timestamp: serverTimestamp() }, { merge: true });
          }
        }
      } else {
        await setDoc(recordRef, { consecutiveCorrect: 0, timestamp: serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, recordRef.path);
    }
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

  const calculateResult = async () => {
    let score = 0;
    const correctness: Record<number, boolean> = {};
    
    const batch = user ? writeBatch(db) : null;

    for (const q of examQuestions) {
      const userAns = userAnswers[q.id];
      let isCorrect = false;
      
      if (q.type === 'single') {
        isCorrect = typeof userAns === 'string' && typeof q.answer === 'string'
          ? userAns.trim() === q.answer.trim()
          : userAns === q.answer;
      } else if (q.type === 'multiple') {
        const sortedUser = Array.isArray(userAns) ? [...userAns].map(s => s.trim()).sort() : [];
        const sortedAns = Array.isArray(q.answer) ? [...q.answer].map(s => s.trim()).sort() : [];
        isCorrect = sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(sortedAns);
      } else if (q.type === 'programming') {
        const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
        isCorrect = normalize(userAns as string) === normalize(q.answer as string);
      }

      correctness[q.id] = isCorrect;
      
      if (isCorrect) {
        score += (100 / examQuestions.length);
      }

      if (user && batch) {
        const recordRef = doc(db, 'users', user.uid, 'wrongQuestions', q.id.toString());
        if (isCorrect) {
          const currentRecord = mistakeRecords.find(r => r.questionId === q.id);
          if (currentRecord) {
            const nextCorrect = (currentRecord.consecutiveCorrect || 0) + 1;
            if (nextCorrect >= 3) {
              batch.delete(recordRef);
              setMasteredIds(prev => [...new Set([...prev, q.id])]);
              // We can't easily show toast for each in batch, but we can show a general one later
            } else {
              batch.set(recordRef, { consecutiveCorrect: nextCorrect, timestamp: serverTimestamp() }, { merge: true });
            }
          }
        } else {
          batch.set(recordRef, { consecutiveCorrect: 0, timestamp: serverTimestamp() }, { merge: true });
        }
      }
    }

    if (user && batch) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'batch-update-wrong-questions');
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

  const handleImport = async (newQuestions: Question[]) => {
    if (!user) return;
    
    const maxId = Math.max(0, ...[...INITIAL_BANK, ...customQuestions].map(q => q.id), 1000);
    const batch = writeBatch(db);
    
    newQuestions.forEach((q, i) => {
      const id = maxId + i + 1;
      const qRef = doc(db, 'users', user.uid, 'customQuestions', id.toString());
      batch.set(qRef, { ...q, id, subject: currentSubjectId });
    });

    try {
      await batch.commit();
      setShowToast(`成功导入 ${newQuestions.length} 道题目！`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'batch-import-questions');
    }
  };

  const currentQuestion = examQuestions[currentIndex];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStatus('welcome')}>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <span className="text-xl">{currentSubject.icon}</span>
              </div>
              <h1 className="font-bold text-lg tracking-tight hidden sm:block">{currentSubject.name}</h1>
            </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3 pr-4 border-r border-slate-200">
                <button 
                  onClick={() => startExam('favorites')}
                  className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all relative"
                  title="我的收藏"
                >
                  <Star size={20} fill={favoriteIds.length > 0 ? "currentColor" : "none"} className={favoriteIds.length > 0 ? "text-amber-500" : ""} />
                  {favoriteIds.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {favoriteIds.length}
                    </span>
                  )}
                </button>
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-200" />
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900 leading-none">{user.displayName}</div>
                  <button onClick={handleLogout} className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-tighter">退出登录</button>
                </div>
              </div>
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
                <ChevronLeft size={18} />
                <span>返回上一级</span>
              </button>
              <div className="h-4 w-[1px] bg-slate-200" />
              <span className="text-slate-400 font-bold text-sm">
                {currentSubject.name}
              </span>
            </div>
          )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {authLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : status === 'login' ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto bg-white rounded-3xl p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
            >
              <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-8">
                <User size={48} />
              </div>
              <h2 className="text-3xl font-bold mb-4">欢迎回来</h2>
              <p className="text-slate-500 mb-10 leading-relaxed">
                请登录以同步您的题库、错题本和学习进度。
              </p>
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm group"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-6 h-6" />
                <span>使用 Google 账号登录</span>
              </button>
              <p className="mt-8 text-xs text-slate-400">
                登录即代表您同意我们的服务条款和隐私政策
              </p>
            </motion.div>
          ) : status === 'welcome' && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
            >
              {/* Subject Selection */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => setCurrentSubjectId(subject.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                      currentSubjectId === subject.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{subject.icon}</span>
                    <span>{subject.name}</span>
                  </button>
                ))}
              </div>

              <h2 className="text-3xl font-bold mb-4">{currentSubject.welcomeTitle}</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
                {currentSubject.welcomeDesc} (题库共 {currentBank.length} 题)
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left">
                <button 
                  onClick={() => startExam('random')}
                  className="p-6 bg-purple-50 rounded-2xl border-2 border-purple-100 hover:border-purple-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <RefreshCcw size={24} />
                  </div>
                  <div className="font-bold text-lg text-purple-900">随机练习模式</div>
                  <div className="text-sm text-purple-600/70">即时反馈，自定义题数</div>
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
                        className="w-20 px-3 py-1.5 bg-white/80 border-2 border-purple-200 rounded-xl text-sm font-bold text-purple-600 outline-none focus:border-purple-500 focus:bg-white transition-all text-center"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">
                      范围: 1-{currentBank.length}
                    </span>
                  </div>
                </button>

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
                  onClick={() => startExam('favorites')}
                  className="p-6 bg-amber-50 rounded-2xl border-2 border-amber-100 hover:border-amber-300 transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Star size={24} fill="currentColor" />
                  </div>
                  <div className="font-bold text-lg text-amber-900">我的收藏题库</div>
                  <div className="text-sm text-amber-600/70">复习您标记的重点题目</div>
                  <div className="mt-2 inline-block px-2 py-0.5 bg-amber-200 text-amber-700 text-xs font-bold rounded-full">
                    收藏总数: {favoriteIds.length}
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

              <div className="flex flex-wrap justify-center gap-6 text-slate-400 text-sm">
                <div className="flex items-center gap-1"><CircleDot size={16} /> 单选题</div>
                <div className="flex items-center gap-1"><ListChecks size={16} /> 多选题</div>
                <div className="flex items-center gap-1"><Trash2 size={16} /> 题库剔除功能</div>
                {visitorCount !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-slate-500 font-bold animate-in fade-in zoom-in duration-500">
                    <Users size={14} className="text-blue-500" />
                    <span>累计访问: {visitorCount.toLocaleString()}</span>
                  </div>
                )}
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
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setStatus('welcome')}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="返回上一级"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="h-4 w-[1px] bg-slate-200" />
                      <span className="text-slate-400 font-bold text-sm">
                        {currentSubject.name}
                      </span>
                    </div>
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full uppercase tracking-wider">
                      {currentQuestion.type === 'single' ? '单选题' : currentQuestion.type === 'multiple' ? '多选题' : '编程题'}
                    </span>
                    {isRandomMode && (
                      <span className="px-3 py-1 bg-purple-50 text-purple-600 text-xs font-bold rounded-full">
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
                    {examQuestions.length === favoriteIds.filter(id => examQuestions.some(eq => eq.id === id)).length && examQuestions.every(eq => favoriteIds.includes(eq.id)) && (
                      <span className="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full">
                        收藏复习
                      </span>
                    )}
                    {isFullMode && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">
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
                            <span className="text-[10px] font-bold text-amber-700">确认去重？</span>
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
                            <span className="text-[10px] font-bold text-amber-700">确认仅客观题？</span>
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
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => toggleFavorite(currentQuestion.id)}
                          className={`flex items-center gap-1.5 transition-colors text-xs font-bold uppercase ${favoriteIds.includes(currentQuestion.id) ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                        >
                          <Star size={14} fill={favoriteIds.includes(currentQuestion.id) ? "currentColor" : "none"} />
                          {favoriteIds.includes(currentQuestion.id) ? '已收藏' : '收藏'}
                        </button>
                        {/* 剔除功能仅在 全量练习、错题强化 中显示，随机练习、正式考试、收藏复习中隐藏 */}
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
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">搜索结果：</div>
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
                          className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all"
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
                        
                        const isCorrect = currentQuestion.type === 'single'
                          ? (typeof qAns === 'string' && typeof option === 'string' ? qAns.trim() === option.trim() : qAns === option)
                          : (Array.isArray(qAns) ? qAns.map(s => s.trim()).includes(option.trim()) : false);

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
                          className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all mt-4"
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
                  
                  <div className="flex flex-col items-center gap-6">
                    <button 
                      onClick={() => setStatus('welcome')}
                      className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                    >
                      <ChevronLeft size={20} /> 返回上一级
                    </button>
                    <div className="text-slate-400 font-bold text-sm flex items-center gap-2">
                      <div className="h-px w-8 bg-slate-200" />
                      {currentSubject.name}
                      <div className="h-px w-8 bg-slate-200" />
                    </div>
                  </div>
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
