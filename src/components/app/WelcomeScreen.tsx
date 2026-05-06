/**
 * 首页：科目切换与练习模式入口
 */
import React from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  Clock,
  Share2,
  Layers,
  RefreshCcw,
  BookOpen,
  Database,
  History,
  Star,
  PlusCircle,
  CircleDot,
  ListChecks,
  Trash2,
} from 'lucide-react';
import type { Subject, SubjectId } from '../../types';

export interface WelcomeScreenProps {
  allSubjects: Subject[];
  currentSubjectId: SubjectId;
  setCurrentSubjectId: (id: SubjectId) => void;
  questionsLoading: boolean;
  currentSubject: Subject;
  currentBankLength: number;
  examQuestionCount: string;
  setExamQuestionCount: React.Dispatch<React.SetStateAction<string>>;
  setShowToast: (msg: string | null) => void;
  startExam: (mode: 'normal' | 'mistakes' | 'full' | 'favorites' | 'random') => void;
  mistakeRecordsLength: number;
  currentSubjectFavoriteCount: number;
  setIsImportModalOpen: (v: boolean) => void;
  currentUser: string | null;
  setEditingSubject: (s: Subject | null) => void;
  setIsAddingNewSubject: (v: boolean) => void;
  setShowSubjectModal: (v: boolean) => void;
  mistakeRecordsEmpty: boolean;
  favoriteIdsEmpty: boolean;
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  const {
    allSubjects,
    currentSubjectId,
    setCurrentSubjectId,
    questionsLoading,
    currentSubject,
    currentBankLength,
    examQuestionCount,
    setExamQuestionCount,
    setShowToast,
    startExam,
    mistakeRecordsLength,
    currentSubjectFavoriteCount,
    setIsImportModalOpen,
    currentUser,
    setEditingSubject,
    setIsAddingNewSubject,
    setShowSubjectModal,
    mistakeRecordsEmpty,
    favoriteIdsEmpty,
  } = props;

  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
    >
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
                    <Clock size={9} />
                    待审核
                  </span>
                )}
                {isApprovedShared && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${
                      currentSubjectId === subject.id ? 'bg-emerald-400/30 text-white' : 'bg-emerald-200 text-emerald-800'
                    }`}
                  >
                    <Share2 size={9} />
                    共享{subject.creatorName ? `·${subject.creatorName}` : ''}
                  </span>
                )}
              </button>
            </div>
          );
        })}
        <button
          onClick={() => {
            if (!currentUser) return;
            setEditingSubject(null);
            setIsAddingNewSubject(false);
            setShowSubjectModal(true);
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all text-sm ${
            currentUser ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer' : 'bg-slate-50 text-slate-300 cursor-not-allowed'
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
        {currentSubject.welcomeDesc} (题库共 {currentBankLength} 题)
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
                  if (isNaN(val) || val <= 0 || val > currentBankLength) {
                    setExamQuestionCount('10');
                    setShowToast(`题数已重置为默认值 (1-${currentBankLength} 之间)`);
                  }
                }}
                className="w-20 px-3 py-1.5 bg-white/80 border-2 border-emerald-200 rounded-xl text-sm font-bold text-emerald-600 outline-none focus:border-emerald-500 focus:bg-white transition-all text-center"
              />
            </div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">
              范围: 1-{currentBankLength}
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
                  if (isNaN(val) || val <= 0 || val > currentBankLength) {
                    setExamQuestionCount('20');
                    setShowToast(`题数已重置为默认值 (1-${currentBankLength} 之间)`);
                  }
                }}
                className="w-20 px-3 py-1.5 bg-white/80 border-2 border-blue-200 rounded-xl text-sm font-bold text-blue-600 outline-none focus:border-blue-500 focus:bg-white transition-all text-center"
              />
              <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-md font-black shadow-sm opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none">
                修改题数
              </div>
            </div>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">
              范围: 1-{currentBankLength}
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
          <div className="mt-2 inline-block px-2 py-0.5 bg-rose-200 text-rose-700 text-xs font-bold rounded-full">当前错题: {mistakeRecordsLength}</div>
        </button>

        <button
          onClick={() => startExam('favorites')}
          className={`p-4 sm:p-5 rounded-2xl border-2 transition-all text-left group ${
            currentSubjectFavoriteCount === 0 ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-amber-50 border-amber-100 hover:border-amber-300'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${
              currentSubjectFavoriteCount === 0 ? 'bg-slate-400 text-white' : 'bg-amber-500 text-white'
            }`}
          >
            <Star size={24} fill={currentSubjectFavoriteCount > 0 ? 'currentColor' : 'none'} />
          </div>
          <div className={`font-bold text-lg ${currentSubjectFavoriteCount === 0 ? 'text-slate-500' : 'text-amber-900'}`}>
            {currentSubjectFavoriteCount === 0 ? '暂无收藏题目' : '我的收藏题库'}
          </div>
          <div className="text-sm text-amber-600/70">复习您标记的重点题目</div>
          <div className="mt-2 inline-block px-2 py-0.5 bg-amber-200 text-amber-700 text-xs font-bold rounded-full">
            收藏总数: {currentSubjectFavoriteCount}
          </div>
          {currentSubjectFavoriteCount === 0 && <div className="mt-2 text-xs text-slate-400">练习时点击⭐收藏题目</div>}
        </button>

        <button
          onClick={() => setIsImportModalOpen(true)}
          disabled={!currentUser}
          className={`p-4 sm:p-5 rounded-2xl border-2 transition-all text-left group ${
            currentUser ? 'bg-indigo-50 border-indigo-100 hover:border-indigo-300' : 'bg-slate-50 border-slate-100 cursor-not-allowed'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${
              currentUser ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-500'
            }`}
          >
            <PlusCircle size={24} />
          </div>
          <div className={`font-bold text-lg ${currentUser ? 'text-indigo-900' : 'text-slate-400'}`}>导入新增题目</div>
          <div className={`text-sm ${currentUser ? 'text-indigo-600/70' : 'text-slate-400'}`}>
            {currentUser ? '支持 Word/PDF/粘贴,AI 智能解析' : '登录后可使用'}
          </div>
        </button>
      </div>

      {mistakeRecordsEmpty && favoriteIdsEmpty && (
        <div className="mt-4 p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
          <p className="text-sm text-blue-600">💡 开始练习后,做错的题目会自动进入错题本</p>
          <p className="text-xs text-blue-400 mt-1">点击⭐收藏题目,可随时复习重点内容</p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-slate-400 text-xs sm:text-sm mt-4">
        <div className="flex items-center gap-1">
          <CircleDot size={16} /> 单选题
        </div>
        <div className="flex items-center gap-1">
          <ListChecks size={16} /> 多选题
        </div>
        <div className="flex items-center gap-1">
          <Trash2 size={16} /> 题库剔除功能
        </div>
      </div>
    </motion.div>
  );
}
