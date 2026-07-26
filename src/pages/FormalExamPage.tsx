/**
 * 正式考试页面（路由 /formal-exam）
 *
 * 三种视图：
 *  1. list   —— 可参加列表 + 我的历史（双 Tab）；owner 显示「管理考试」入口
 *  2. taking —— 调用 useFormalExam 状态机，渲染 FormalExamScreen
 *  3. result —— 刚交卷（hook.result）或查看历史某次答卷（viewAttempt），渲染 FormalResultScreen
 *
 * owner 判定：isAdmin || isTeacher || 任一科目 isOwner。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Trophy, ClipboardList, History, Clock, PlusCircle, Star, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useFormalExam } from '../hooks/useFormalExam';
import { examApi } from '../services/examApi';
import { FormalExamScreen } from '../components/app/FormalExamScreen';
import { FormalResultScreen } from '../components/app/FormalResultScreen';
import type { ExamAvailableItem, ExamHistoryItem } from '../types';

interface ViewAttempt {
  attemptId: number;
  title: string;
  passScore: number;
  totalPoints: number;
  score: number;
  correctCount: number;
  totalCount: number;
}

type ListTab = 'available' | 'history';

export function FormalExamPage() {
  const ctx = useAppContext();
  const navigate = useNavigate();
  const exam = useFormalExam();

  const [available, setAvailable] = useState<ExamAvailableItem[]>([]);
  const [history, setHistory] = useState<ExamHistoryItem[]>([]);
  const [bestScores, setBestScores] = useState<Record<number, number>>({});
  const [tab, setTab] = useState<ListTab>('available');
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);
  const [viewAttempt, setViewAttempt] = useState<ViewAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const isOwner = ctx.isAdmin || ctx.isTeacher || ctx.allSubjects.some((s) => s.isOwner);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const [av, hi] = await Promise.all([examApi.listAvailable(), examApi.myHistory()]);
      setAvailable(av.exams);
      setHistory(hi.history);
      setBestScores(hi.bestScores);
    } catch (e: any) {
      setListError(e?.message || '加载考试列表失败');
    } finally {
      setListLoading(false);
    }
  }, []);

  // 进入列表阶段时刷新数据（含后端惰性 auto_submit 后的最新状态）
  useEffect(() => {
    if (exam.phase === 'list') void loadList();
  }, [exam.phase, loadList]);

  const subjectName = (id: string): string => {
    const s = ctx.allSubjects.find((x) => x.id === id);
    return s ? s.name : id;
  };

  // 优先级：查看历史答卷 > 答题中 > 刚交卷 > 列表
  if (viewAttempt) {
    return (
      <FormalResultScreen
        attemptId={viewAttempt.attemptId}
        examTitle={viewAttempt.title}
        passScore={viewAttempt.passScore}
        totalPoints={viewAttempt.totalPoints}
        score={viewAttempt.score}
        correctCount={viewAttempt.correctCount}
        totalCount={viewAttempt.totalCount}
        onViewHistory={() => {
          setViewAttempt(null);
          setTab('history');
        }}
        onBackToList={() => {
          setViewAttempt(null);
          setTab('available');
        }}
      />
    );
  }

  if (exam.phase === 'taking' && exam.attempt && exam.currentExam) {
    return (
      <FormalExamScreen
        exam={exam.currentExam}
        questions={exam.attempt.questions}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        userAnswers={exam.userAnswers}
        setAnswer={exam.setAnswer}
        timeLeft={exam.timeLeft}
        submitting={exam.submitting}
        onBack={exam.reset}
        onSubmit={() => void exam.submit()}
      />
    );
  }

  if (exam.phase === 'result' && exam.result && exam.currentExam) {
    return (
      <FormalResultScreen
        attemptId={exam.attempt!.attemptId}
        examTitle={exam.currentExam.title}
        passScore={exam.currentExam.pass_score}
        totalPoints={exam.result.total_points}
        score={exam.result.score}
        correctCount={exam.result.correct_count}
        totalCount={exam.result.details.length}
        onViewHistory={() => {
          exam.reset();
          setTab('history');
        }}
        onBackToList={() => exam.reset()}
      />
    );
  }

  // ── 列表阶段 ──
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={26} className="text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-800">正式考试</h1>
        </div>
        {isOwner && (
          <button
            onClick={() => navigate('/exams/manage')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm"
          >
            <PlusCircle size={18} /> 管理考试
          </button>
        )}
      </div>

      {exam.error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
          <AlertTriangle size={16} /> {exam.error}
        </div>
      )}
      {listError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
          <AlertTriangle size={16} /> {listError}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('available')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            tab === 'available' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <ClipboardList size={16} /> 可参加 ({available.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            tab === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <History size={16} /> 我的历史 ({history.length})
        </button>
      </div>

      {listLoading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-12">
          <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          加载中...
        </div>
      ) : tab === 'available' ? (
        available.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
            <ClipboardList size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">当前没有可参加的正式考试。</p>
            <p className="text-slate-400 text-sm mt-1">已发布的考试会显示在这里，留意考试时间窗哦。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {available.map((e) => (
              <div key={e.id} className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-800 text-lg leading-snug">{e.title}</h3>
                  <StateBadge state={e.attempt_state} />
                </div>
                <div className="text-sm text-slate-500 mb-3">
                  {subjectName(e.subject_id)} · {e.duration_minutes} 分钟 · 满分 {e.total_points} · 及格 {e.pass_score}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 mb-4">
                  <Clock size={12} />
                  {e.start_time ? `开始 ${e.start_time.replace('T', ' ')}` : '长期开放'}
                  {e.end_time ? ` · 截止 ${e.end_time.replace('T', ' ')}` : ''}
                </div>
                <button
                  onClick={() => {
                    setCurrentIndex(0);
                    void exam.startExam(e);
                  }}
                  disabled={exam.loading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {exam.loading ? '准备中...' : e.attempt_state === 'submitted' ? '再次参加' : '开始考试'}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        // 历史 Tab
        history.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
            <History size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">还没有考试记录，去「可参加」里参加一场吧。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.attemptId} className="bg-white rounded-2xl p-4 shadow shadow-slate-200/50 border border-slate-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 truncate">{h.exam_title}</span>
                    {h.is_best && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full">
                        <Star size={11} fill="currentColor" /> 最佳
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    得分 <span className="font-bold text-slate-700">{h.score}</span> / {h.total_points}
                    {h.passed ? (
                      <span className="ml-2 text-emerald-600 font-bold">及格</span>
                    ) : (
                      <span className="ml-2 text-rose-500 font-bold">未及格</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {h.submitted_at ? h.submitted_at.replace('T', ' ') : ''} · 最佳分 {bestScores[h.exam_id] ?? h.score}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setViewAttempt({
                      attemptId: h.attemptId,
                      title: h.exam_title,
                      passScore: h.pass_score,
                      totalPoints: h.total_points,
                      score: h.score,
                      correctCount: h.correct_count,
                      totalCount: h.total_count,
                    })
                  }
                  className="flex-shrink-0 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
                >
                  查看错题
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </motion.div>
  );
}

function StateBadge({ state }: { state: ExamAvailableItem['attempt_state'] }) {
  if (state === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-full">
        <Clock size={11} /> 进行中
      </span>
    );
  }
  if (state === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">
        <CheckCircle2 size={11} /> 已参加
      </span>
    );
  }
  return null;
}
