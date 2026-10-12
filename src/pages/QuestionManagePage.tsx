/**
 * 题目管理页面（路由 /questions/manage）— FR-107 回收站与版本历史
 *
 * 两个 Tab：
 *  - 我的题目：列表 + 软删除（移入回收站）+ 版本历史入口
 *  - 回收站：已软删题目 + 恢复 / 彻底删除（被考试引用时后端 409 拦截）
 * 版本历史抽屉：某题的历史版本（seq 降序）+ 回退到指定版本
 *
 * 数据全部走 questionApi（见 services/api.ts）；类型展示用原始 DTO（不经 questionItemToQuestion
 * 白名单降级），以正确显示 judge/fill_in/short_answer 等新题型。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Trash2,
  History,
  RotateCcw,
  X,
  AlertTriangle,
  Inbox,
  ChevronLeft,
  Undo2,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { questionApi } from '../services/api';
import type { QuestionItem, RecycleQuestionItem, QuestionVersion } from '../services/api';

const TYPE_LABELS: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  programming: '编程题',
  judge: '判断题',
  fill_in: '填空题',
  short_answer: '简答题',
  true_false: '判断题',
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] || t;
}

type Tab = 'questions' | 'recycle';

export function QuestionManagePage() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('questions');
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [recycle, setRecycle] = useState<RecycleQuestionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 版本历史抽屉
  const [versionsFor, setVersionsFor] = useState<QuestionItem | null>(null);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const subjectName = useCallback(
    (id: string): string => ctx.allSubjects.find((s) => s.id === id)?.name || id,
    [ctx.allSubjects],
  );

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await questionApi.listAll({});
      setQuestions(res.questions);
    } catch (e: any) {
      setError(e?.message || '加载题目列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecycle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await questionApi.listRecycle({ limit: 200 });
      setRecycle(res.questions);
    } catch (e: any) {
      setError(e?.message || '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'questions') void loadQuestions();
    else void loadRecycle();
  }, [tab, loadQuestions, loadRecycle]);

  // 软删除（移入回收站）
  const handleSoftDelete = async (q: QuestionItem) => {
    if (!window.confirm(`确定将题目「${q.title}」移入回收站？可在回收站恢复。`)) return;
    setBusyId(q.id);
    setError(null);
    try {
      await questionApi.delete(q.id);
      await loadQuestions();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  // 从回收站恢复
  const handleRestore = async (q: RecycleQuestionItem) => {
    setBusyId(q.id);
    setError(null);
    try {
      await questionApi.restore(q.id);
      await loadRecycle();
    } catch (e: any) {
      setError(e?.message || '恢复失败');
    } finally {
      setBusyId(null);
    }
  };

  // 彻底删除（物理删）
  const handlePermanentDelete = async (q: RecycleQuestionItem) => {
    if (!window.confirm(`确定彻底删除题目「${q.title}」？此操作不可恢复。被考试引用的题目将被拒绝。`)) return;
    setBusyId(q.id);
    setError(null);
    try {
      await questionApi.deletePermanent(q.id);
      await loadRecycle();
    } catch (e: any) {
      setError(e?.message || '彻底删除失败');
    } finally {
      setBusyId(null);
    }
  };

  // 打开版本历史
  const openVersions = async (q: QuestionItem) => {
    setVersionsFor(q);
    setVersions([]);
    setVersionsLoading(true);
    setError(null);
    try {
      const res = await questionApi.listVersions(q.id);
      setVersions(res.versions);
    } catch (e: any) {
      setError(e?.message || '加载版本历史失败');
    } finally {
      setVersionsLoading(false);
    }
  };

  const closeVersions = () => {
    setVersionsFor(null);
    setVersions([]);
  };

  // 回退到指定版本
  const handleRevert = async (seq: number) => {
    if (!versionsFor) return;
    if (!window.confirm(`确定回退题目「${versionsFor.title}」到版本 #${seq}？当前内容会先存为一个新版本。`)) return;
    setBusyId(versionsFor.id);
    setError(null);
    try {
      await questionApi.revertVersion(versionsFor.id, seq);
      await openVersions(versionsFor); // 刷新版本列表（回退会新增一版）
      if (tab === 'questions') await loadQuestions();
    } catch (e: any) {
      setError(e?.message || '回退失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/formal-exam')}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回"
          >
            <ChevronLeft size={20} />
          </button>
          <BookOpen size={26} className="text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-800">题目管理</h1>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('questions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            tab === 'questions' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <BookOpen size={16} /> 我的题目 ({questions.length})
        </button>
        <button
          onClick={() => setTab('recycle')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            tab === 'recycle' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <Inbox size={16} /> 回收站 ({recycle.length})
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-12">
          <span className="w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
          加载中...
        </div>
      ) : tab === 'questions' ? (
        questions.length === 0 ? (
          <EmptyState icon={<BookOpen size={40} />} text="还没有可管理的题目。" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {questions.map((q) => {
              const owner = !!(q as any).is_owner;
              return (
                <div key={q.id} className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-slate-800 leading-snug line-clamp-2">{q.title}</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 flex-shrink-0">
                      {typeLabel(q.type)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mb-4">
                    {subjectName(q.subject_id)} · {q.points} 分
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openVersions(q)}
                      disabled={!owner}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-bold hover:bg-blue-100 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      title={owner ? '查看版本历史' : '仅题目所有者可查看'}
                    >
                      <History size={14} /> 版本历史
                    </button>
                    <button
                      onClick={() => handleSoftDelete(q)}
                      disabled={!owner || busyId === q.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-500 rounded-lg font-bold hover:bg-rose-100 transition-colors text-sm ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
                      title={owner ? '移入回收站' : '仅题目所有者可删除'}
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        recycle.length === 0 ? (
          <EmptyState icon={<Inbox size={40} />} text="回收站是空的。" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {recycle.map((q) => (
              <div key={q.id} className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-500 leading-snug line-clamp-2">{q.title}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400 flex-shrink-0">
                    {typeLabel(q.type)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-4">
                  {subjectName(q.subject_id)} · 删除于 {q.deleted_at ? new Date(q.deleted_at).toLocaleString() : '—'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleRestore(q)}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-bold hover:bg-emerald-100 transition-colors text-sm disabled:opacity-40"
                  >
                    <Undo2 size={14} /> 恢复
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(q)}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-500 rounded-lg font-bold hover:bg-rose-100 transition-colors text-sm ml-auto disabled:opacity-40"
                  >
                    <Trash2 size={14} /> 彻底删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 版本历史抽屉 */}
      <AnimatePresence>
        {versionsFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeVersions}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <History size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-800 truncate">版本历史 · {versionsFor.title}</h3>
                </div>
                <button onClick={closeVersions} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {versionsLoading ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
                    <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                    加载版本中...
                  </div>
                ) : versions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">暂无历史版本（编辑一次题目后会生成快照）。</p>
                ) : (
                  versions.map((v) => (
                    <div key={v.seq} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-slate-700 text-sm">版本 #{v.seq}</span>
                        <span className="text-xs text-slate-400">{new Date(v.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-slate-600 line-clamp-2 mb-1">{v.payload?.title}</div>
                      <div className="text-xs text-slate-400 mb-3">
                        {typeLabel(v.payload?.type || '')} · {v.payload?.points} 分 ·
                        {subjectName(v.payload?.subject_id || '')}
                      </div>
                      <button
                        onClick={() => handleRevert(v.seq)}
                        disabled={busyId === versionsFor.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-40"
                      >
                        <RotateCcw size={14} /> 回退到此版本
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
      <div className="text-slate-300 mx-auto mb-3 flex justify-center [&>svg]:w-10 [&>svg]:h-10">{icon}</div>
      <p className="text-slate-500">{text}</p>
    </div>
  );
}
