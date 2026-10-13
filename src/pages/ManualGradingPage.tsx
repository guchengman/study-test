/**
 * 人工判分页面（路由 /exams/grading?examId=ID）
 *
 * FR-103：owner 对某场考试的简答/编程题「按题批改」——左栏人工题清单（含进度），
 * 选中一题后右栏平铺该题所有已交卷作答，逐行给分并批量保存（仅提交改动行）。
 * 权限由后端 isOwner 把关，越权返回 403 并在此以错误条呈现。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ClipboardCheck,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Save,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { examApi } from '../services/examApi';
import type { GradingQuestionItem, GradingResponse } from '../types';

type AnswerDisplay = { text: string };

/** 将 student 作答（string | string[] | null）归一为可读文本。 */
function renderAnswer(raw: string | string[] | null): AnswerDisplay {
  if (raw == null) return { text: '（未作答）' };
  if (Array.isArray(raw)) return { text: raw.join(' / ') };
  return { text: String(raw) };
}

export function ManualGradingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const examId = Number(params.get('examId'));

  const [questions, setQuestions] = useState<GradingQuestionItem[]>([]);
  const [activeQid, setActiveQid] = useState<number | null>(null);
  const [responses, setResponses] = useState<GradingResponse[]>([]);
  const [refAnswer, setRefAnswer] = useState<string>('');
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});

  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingResp, setLoadingResp] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTip, setSavedTip] = useState<string | null>(null);

  const activeQuestion = useMemo(
    () => questions.find((q) => q.question_id === activeQid) || null,
    [questions, activeQid],
  );

  const loadOverview = useCallback(async () => {
    if (!examId) return;
    setLoadingList(true);
    setError(null);
    try {
      const res = await examApi.gradingOverview(examId);
      setQuestions(res.questions);
      setActiveQid((cur) => cur ?? res.questions[0]?.question_id ?? null);
    } catch (e: any) {
      setError(e?.message || '加载判分列表失败');
    } finally {
      setLoadingList(false);
    }
  }, [examId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadResponses = useCallback(async (qid: number) => {
    setLoadingResp(true);
    setError(null);
    setSavedTip(null);
    try {
      const res = await examApi.getResponses(examId, qid);
      setResponses(res.responses);
      setRefAnswer(typeof res.question.reference_answer === 'string' ? res.question.reference_answer : JSON.stringify(res.question.reference_answer ?? ''));
      const d: Record<number, number> = {};
      res.responses.forEach((r) => {
        d[r.attempt_id] = r.earned;
      });
      setDraft(d);
      setDirty({});
    } catch (e: any) {
      setError(e?.message || '加载作答失败');
    } finally {
      setLoadingResp(false);
    }
  }, [examId]);

  useEffect(() => {
    if (activeQid != null) void loadResponses(activeQid);
  }, [activeQid, loadResponses]);

  const setEarned = (attemptId: number, val: number) => {
    const max = activeQuestion?.points ?? 0;
    const clamped = Math.max(0, Math.min(max, Math.round(Number.isFinite(val) ? val : 0)));
    setDraft((prev) => ({ ...prev, [attemptId]: clamped }));
    setDirty((prev) => ({ ...prev, [attemptId]: true }));
  };

  const handleSave = async () => {
    if (activeQid == null) return;
    const scores = responses
      .filter((r) => dirty[r.attempt_id])
      .map((r) => ({ attempt_id: r.attempt_id, earned: draft[r.attempt_id] ?? r.earned }));
    if (scores.length === 0) {
      setSavedTip('没有需要保存的改动');
      return;
    }
    setSaving(true);
    setError(null);
    setSavedTip(null);
    try {
      const res = await examApi.gradeResponses(examId, activeQid, scores);
      setSavedTip(`已保存 ${res.updated} 份判分`);
      await loadResponses(activeQid);
      await loadOverview();
    } catch (e: any) {
      setError(e?.message || '保存判分失败');
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/exams/manage')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            title="返回考试管理"
          >
            <ArrowLeft size={18} />
          </button>
          <ClipboardCheck size={26} className="text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-800">人工判分</h1>
          {examId ? <span className="text-sm text-slate-400">考试 #{examId}</span> : null}
        </div>
      </div>

      {!examId && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          <AlertTriangle size={16} /> 缺少 examId 参数，请从考试管理页进入。
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {examId ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 左栏：人工题清单 */}
          <div className="md:col-span-1 bg-white rounded-3xl p-4 shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="text-sm font-bold text-slate-600 mb-3">人工题（简答 / 编程）</div>
            {loadingList ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
                <Loader2 size={16} className="animate-spin" /> 加载中...
              </div>
            ) : questions.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">本卷没有需要人工判分的题目。</p>
            ) : (
              <ul className="space-y-2">
                {questions.map((q) => {
                  const done = q.graded_count >= q.total_responses && q.total_responses > 0;
                  const active = q.question_id === activeQid;
                  return (
                    <li key={q.question_id}>
                      <button
                        onClick={() => setActiveQid(q.question_id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                          active ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-700 text-sm leading-snug truncate">{q.title}</span>
                          {done ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <Circle size={16} className="text-slate-300 flex-shrink-0" />}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {q.type === 'programming' ? '编程题' : '简答题'} · {q.points} 分 · 已判 {q.graded_count}/{q.total_responses}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 右栏：某题作答列表 */}
          <div className="md:col-span-2 bg-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
            {activeQuestion == null ? (
              <p className="text-sm text-slate-400 py-8 text-center">从左侧选择一道题开始判分。</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-bold text-slate-800 text-lg leading-snug">{activeQuestion.title}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 flex-shrink-0">
                    满分 {activeQuestion.points}
                  </span>
                </div>
                {refAnswer && (
                  <div className="text-xs text-slate-500 mb-4 p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold">参考答案：</span>
                    {refAnswer}
                  </div>
                )}

                {loadingResp ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
                    <Loader2 size={16} className="animate-spin" /> 加载作答中...
                  </div>
                ) : responses.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">该题暂无已交卷作答。</p>
                ) : (
                  <div className="space-y-3">
                    {responses.map((r) => {
                      const ans = renderAnswer(r.user_answer);
                      return (
                        <div key={r.attempt_id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="text-sm font-bold text-slate-700">
                              {r.username}
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ''}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                r.graded ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                              }`}
                            >
                              {r.graded ? '已判' : '待判'}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 bg-white rounded-lg p-2.5 mb-3 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                            {ans.text}
                          </div>
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            得分
                            <input
                              type="number"
                              min={0}
                              max={activeQuestion.points}
                              step={1}
                              value={draft[r.attempt_id] ?? 0}
                              onChange={(e) => setEarned(r.attempt_id, Number(e.target.value))}
                              className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <span className="text-xs text-slate-400">/ {activeQuestion.points}</span>
                            {dirty[r.attempt_id] && <span className="text-xs text-indigo-500 font-bold">已修改</span>}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-5">
                  <div className="text-sm">
                    {savedTip ? <span className="text-emerald-600 font-bold">{savedTip}</span> : null}
                    {!savedTip && dirtyCount > 0 ? <span className="text-indigo-500">{dirtyCount} 处待保存</span> : null}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving || dirtyCount === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 保存判分
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

export default ManualGradingPage;
