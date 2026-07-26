/**
 * 组卷表单（创建 / 编辑）
 *
 * 功能：选择可管理科目 → 拉取该科目题目供勾选 → 逐题设分 → 设定限时 / 时间窗 / 及格分 / 状态。
 * 提交时构建 question_set = [{question_id, points}] 并调用 onSubmit（由 ExamManagePage 负责 API 调用）。
 * 与后端契约：ExamFormPayload（见 src/types.ts）；时间窗用 datetime-local，提交时转为后端 DATETIME 字符串。
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, CheckSquare, Square, AlertTriangle, Shuffle, Info } from 'lucide-react';
import { questionApi, type QuestionItem } from '../../services/api';
import type { Exam, ExamFormPayload, ExamStatus, Subject } from '../../types';

/** 后端 DATETIME 字符串 → datetime-local 值（YYYY-MM-DDTHH:mm） */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
}

/** datetime-local 值 → 后端 DATETIME 字符串（YYYY-MM-DD HH:MM:SS） */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const v = value.replace('T', ' ');
  return v.length === 16 ? `${v}:00` : v;
}

/** Fisher-Yates 洗牌，返回新数组（不修改入参） */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从数组中随机抽取 n 个（不重复） */
function sampleN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.max(0, n));
}

/** 按题型分组 */
function groupByType(questions: QuestionItem[]): Record<string, QuestionItem[]> {
  const m: Record<string, QuestionItem[]> = {};
  for (const q of questions) {
    if (!m[q.type]) m[q.type] = [];
    m[q.type].push(q);
  }
  return m;
}

/**
 * 按题型比例分配抽取数量：各题型份额 = round(N × 该型题库量 / 题库总量)，
 * 余数优先补给剩余容量最大的题型，保证每型 ≤ 其题库量且总和 = N。
 */
function stratifiedAllocation(pool: QuestionItem[], N: number): Record<string, number> {
  const byType = groupByType(pool);
  const types = Object.keys(byType);
  const total = pool.length || 1;
  const alloc: Record<string, number> = {};
  types.forEach((t) => {
    alloc[t] = Math.floor((N * byType[t].length) / total);
  });
  let remainder = N - types.reduce((s, t) => s + alloc[t], 0);
  // 余数按「剩余容量」从大到小循环补给，直到分完或无力可补
  const bySpare = types.slice().sort(
    (a, b) => byType[b].length - alloc[b] - (byType[a].length - alloc[a])
  );
  let guard = 0;
  while (remainder > 0 && bySpare.length > 0) {
    const t = bySpare[guard % bySpare.length];
    if (alloc[t] < byType[t].length) {
      alloc[t]++;
      remainder--;
    }
    guard++;
    if (guard > types.length * 8) break;
  }
  return alloc;
}

function typeLabel(t: string): string {
  return t === 'single' ? '单选' : t === 'multiple' ? '多选' : '编程';
}

/** 题集是否变化（按 {question_id: points} 比较，忽略顺序） */
function questionSetChanged(
  orig: { question_id: number; points: number }[],
  next: { question_id: number; points: number }[]
): boolean {
  if (orig.length !== next.length) return true;
  const oMap = new Map(orig.map((q) => [q.question_id, q.points]));
  const nMap = new Map(next.map((q) => [q.question_id, q.points]));
  if (oMap.size !== nMap.size) return true;
  for (const [id, pts] of oMap) {
    if (nMap.get(id) !== pts) return true;
  }
  return false;
}

/**
 * 已发布考试后端仅允许改 start_time/end_time/status；
 * 这里检测用户是否改了「会被静默忽略」的字段（题集/标题/说明/限时/及格分）。
 */
function publishedFieldsChanged(
  exam: Exam,
  next: {
    title: string;
    description: string;
    durationMinutes: number;
    passScore: number;
    questionSet: { question_id: number; points: number }[];
  }
): boolean {
  if ((exam.title || '') !== next.title.trim()) return true;
  if ((exam.description || '') !== (next.description.trim() || '')) return true;
  if (Number(exam.duration_minutes) !== Number(next.durationMinutes)) return true;
  if (Number(exam.pass_score) !== Number(next.passScore)) return true;
  if (questionSetChanged(exam.question_set || [], next.questionSet)) return true;
  return false;
}

export interface ExamFormProps {
  /** 可管理的科目列表 */
  subjects: Subject[];
  /** 编辑时传入的试卷（含 question_set） */
  initialExam?: Exam | null;
  /** 提交回调；examId 在编辑时为原试卷 id */
  onSubmit: (payload: ExamFormPayload, examId?: number) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

export function ExamForm(props: ExamFormProps) {
  const { subjects, initialExam, onSubmit, onCancel, submitting } = props;

  const [subjectId, setSubjectId] = useState<string>(initialExam?.subject_id || subjects[0]?.id || '');
  const [title, setTitle] = useState<string>(initialExam?.title || '');
  const [description, setDescription] = useState<string>(initialExam?.description || '');
  const [durationMinutes, setDurationMinutes] = useState<number>(initialExam?.duration_minutes || 60);
  const [passScore, setPassScore] = useState<number>(initialExam?.pass_score || 60);
  const [startTime, setStartTime] = useState<string>(toLocalInput(initialExam?.start_time || null));
  const [endTime, setEndTime] = useState<string>(toLocalInput(initialExam?.end_time || null));
  const [status, setStatus] = useState<ExamStatus>(initialExam?.status || 'draft');

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // 随机选题弹窗状态
  const [showRandom, setShowRandom] = useState(false);
  const [randomCount, setRandomCount] = useState<number>(0);
  const [randomStrategy, setRandomStrategy] = useState<'stratified' | 'pure'>('stratified');
  const [randomReplace, setRandomReplace] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);

  // 已发布考试保存提示弹窗
  const [showPublishWarn, setShowPublishWarn] = useState(false);

  // 切换编辑对象时回填表单
  useEffect(() => {
    if (initialExam) {
      setSubjectId(initialExam.subject_id);
      setTitle(initialExam.title);
      setDescription(initialExam.description || '');
      setDurationMinutes(initialExam.duration_minutes);
      setPassScore(initialExam.pass_score);
      setStartTime(toLocalInput(initialExam.start_time));
      setEndTime(toLocalInput(initialExam.end_time));
      setStatus(initialExam.status);
      const sel: Record<number, number> = {};
      initialExam.question_set.forEach((q) => {
        sel[q.question_id] = q.points;
      });
      setSelected(sel);
    }
    // 仅在切换编辑对象时回填
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExam]);

  // 科目变化时拉取题目
  useEffect(() => {
    if (!subjectId) {
      setQuestions([]);
      return;
    }
    let active = true;
    setQuestionsLoading(true);
    questionApi
      .listAll({ subject: subjectId })
      .then((res) => {
        if (active) setQuestions(res.questions);
      })
      .catch(() => {
        if (active) setQuestions([]);
      })
      .finally(() => {
        if (active) setQuestionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subjectId]);

  const toggleQuestion = (qid: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[qid] !== undefined) {
        delete next[qid];
      } else {
        // 每题默认 1 分，避免总分被默认 10 分放大（如 292 题 → 2920 分）
        next[qid] = 1;
      }
      return next;
    });
  };

  const setPoints = (qid: number, points: number) => {
    setSelected((prev) => ({ ...prev, [qid]: points }));
  };

  const subjectName = subjects.find((s) => s.id === subjectId)?.name || '';

  const openRandomModal = () => {
    setRandomCount(Math.min(10, questions.length));
    setRandomStrategy('stratified');
    setRandomReplace(false);
    setRandomError(null);
    setShowRandom(true);
  };

  const applyRandom = () => {
    const raw = Math.floor(Number(randomCount));
    if (!Number.isFinite(raw) || raw <= 0) {
      setRandomError('请输入大于 0 的题目数量');
      return;
    }
    if (questions.length === 0) {
      setShowRandom(false);
      return;
    }
    const cap = Math.min(raw, questions.length);
    let chosen: QuestionItem[];
    if (randomStrategy === 'pure') {
      chosen = sampleN(questions, cap);
    } else {
      const alloc = stratifiedAllocation(questions, cap);
      const byType = groupByType(questions);
      chosen = [];
      Object.keys(alloc).forEach((t) => {
        const k = Math.min(alloc[t], byType[t].length);
        if (k > 0) chosen.push(...sampleN(byType[t], k));
      });
    }
    setSelected((prev) => {
      const next = randomReplace ? {} : { ...prev };
      // 已选项保留原分值；新抽中的默认 1 分
      chosen.forEach((q) => {
        if (next[q.id] === undefined) next[q.id] = 1;
      });
      return next;
    });
    setShowRandom(false);
  };

  const totalPoints = Object.values(selected).reduce((sum, p) => sum + (Number(p) > 0 ? Number(p) : 0), 0);
  const selectedCount = Object.keys(selected).length;

  /** 根据给定状态构造提交载荷 */
  const buildPayload = (statusValue: ExamStatus): ExamFormPayload => ({
    subject_id: subjectId,
    title: title.trim(),
    question_set: Object.entries(selected).map(([qid, points]) => ({
      question_id: Number(qid),
      points: Number(points) > 0 ? Number(points) : 0,
    })),
    duration_minutes: Number(durationMinutes) || 60,
    start_time: fromLocalInput(startTime),
    end_time: fromLocalInput(endTime),
    pass_score: Number(passScore) || 60,
    description: description.trim() || null,
    status: statusValue,
  });

  /** 「撤销发布并保存」：将状态降为草稿后提交，使题目等修改可落库 */
  const confirmRevokeAndSave = async () => {
    setShowPublishWarn(false);
    await onSubmit(buildPayload('draft'), initialExam?.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!subjectId) {
      setFormError('请选择所属科目');
      return;
    }
    if (!title.trim()) {
      setFormError('请填写考试标题');
      return;
    }
    const questionSet = Object.entries(selected).map(([qid, points]) => ({
      question_id: Number(qid),
      points: Number(points) > 0 ? Number(points) : 0,
    }));
    if (questionSet.length === 0) {
      setFormError('请至少选择一道题目');
      return;
    }

    // 发布态保护：已发布考试后端仅允许改时间窗与状态，其余字段会被静默忽略。
    // 若用户未改状态（仍是 published）却改了题集/标题/限时/及格分等，明确拦截并提示。
    if (initialExam && initialExam.status === 'published' && status === 'published') {
      if (
        publishedFieldsChanged(initialExam, {
          title,
          description,
          durationMinutes,
          passScore,
          questionSet,
        })
      ) {
        setShowPublishWarn(true);
        return;
      }
    }
    await onSubmit(buildPayload(status), initialExam?.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-100"
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-slate-800">{initialExam ? '编辑考试' : '新建考试'}</h2>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <X size={20} />
        </button>
      </div>

      {formError && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm mb-4 whitespace-pre-line">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> <span>{formError}</span>
        </div>
      )}

      {initialExam?.status === 'published' && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm mb-4 whitespace-pre-line">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            当前考试处于「已发布」状态：题目、限时、及格分等字段不可直接修改（后端仅允许改时间窗与状态）。
            如需改动，请先将下方「状态」改为「草稿」或「已关闭」，保存后即可修改；改完如需对外可重新发布。
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 科目 + 标题 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">所属科目</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            >
              {subjects.length === 0 && <option value="">（无可管理科目）</option>}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">考试标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：第一章单元测试"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1">考试说明（可选）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="考试范围、注意事项等"
            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none h-20 resize-none"
          />
        </div>

        {/* 限时 / 及格分 / 状态 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">限时（分钟）</label>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">及格分</label>
            <input
              type="number"
              min={0}
              value={passScore}
              onChange={(e) => setPassScore(parseInt(e.target.value, 10) || 60)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ExamStatus)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
        </div>

        {/* 时间窗 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">开放开始（可选）</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">开放结束（可选）</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none"
            />
          </div>
        </div>

        {/* 选题 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-slate-600">
              选择题目（已选 {selectedCount} 题 · 合计 {totalPoints} 分）
            </label>
            {questions.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openRandomModal}
                  className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                >
                  <Shuffle size={14} /> 随机选题
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sel: Record<number, number> = {};
                    questions.forEach((q) => {
                      sel[q.id] = selected[q.id] ?? 10;
                    });
                    setSelected(sel);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  <CheckSquare size={14} /> 全选
                </button>
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-500"
                >
                  <Square size={14} /> 清空
                </button>
              </div>
            )}
          </div>

          {questionsLoading ? (
            <div className="text-sm text-slate-400 py-6 text-center">加载题目中...</div>
          ) : questions.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">该科目暂无题目，请先导入题目。</div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-100 rounded-2xl p-2">
              {questions.map((q) => {
                const isSel = selected[q.id] !== undefined;
                return (
                  <div key={q.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
                    <button type="button" onClick={() => toggleQuestion(q.id)} className="flex-shrink-0">
                      {isSel ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-400 uppercase">
                        {q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '编程题'}
                      </div>
                      <div className="text-sm text-slate-700 truncate">{q.title}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number"
                        min={0}
                        value={isSel ? selected[q.id] : 10}
                        disabled={!isSel}
                        onChange={(e) => setPoints(q.id, parseInt(e.target.value, 10) || 0)}
                        className="w-16 px-2 py-1 rounded-lg border-2 border-slate-100 focus:border-blue-600 outline-none text-sm disabled:bg-slate-50 disabled:text-slate-300"
                      />
                      <span className="text-xs text-slate-400">分</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 操作 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting || questionsLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            <Save size={18} /> {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </form>

      {/* 随机选题弹窗 */}
      {showRandom && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowRandom(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-800">随机选题</h3>
              <button
                type="button"
                onClick={() => setShowRandom(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              从「{subjectName}」题库共 {questions.length} 题中随机抽取
            </p>

            <label className="block text-sm font-bold text-slate-600 mb-1">抽取数量</label>
            <input
              type="number"
              min={1}
              max={questions.length}
              value={randomCount}
              onChange={(e) => {
                setRandomCount(parseInt(e.target.value, 10) || 0);
                setRandomError(null);
              }}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none mb-3"
            />
            {randomCount > questions.length && (
              <p className="text-xs text-amber-500 -mt-2 mb-2">
                题库仅 {questions.length} 题，将抽取全部 {questions.length} 题
              </p>
            )}

            <label className="block text-sm font-bold text-slate-600 mb-1">抽取方式</label>
            <div className="space-y-2 mb-3">
              <label
                className={`flex items-start gap-2 p-2 rounded-xl border-2 cursor-pointer transition-colors ${
                  randomStrategy === 'stratified' ? 'border-blue-600 bg-blue-50/40' : 'border-slate-100'
                }`}
              >
                <input
                  type="radio"
                  checked={randomStrategy === 'stratified'}
                  onChange={() => setRandomStrategy('stratified')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-bold text-slate-700">按题型比例随机（推荐）</div>
                  <div className="text-xs text-slate-400">
                    按题库各题型占比分配题数再各自随机抽取，试卷题型结构与题库一致、更公平。
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 p-2 rounded-xl border-2 cursor-pointer transition-colors ${
                  randomStrategy === 'pure' ? 'border-blue-600 bg-blue-50/40' : 'border-slate-100'
                }`}
              >
                <input
                  type="radio"
                  checked={randomStrategy === 'pure'}
                  onChange={() => setRandomStrategy('pure')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-bold text-slate-700">纯随机抽取</div>
                  <div className="text-xs text-slate-400">从全部题目等概率抽取，简单但可能某题型扎堆。</div>
                </div>
              </label>
            </div>

            {randomStrategy === 'stratified' && randomCount > 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-2 mb-3">
                预览分配：
                {Object.entries(
                  stratifiedAllocation(questions, Math.min(Math.max(randomCount, 0), questions.length))
                ).map(([t, n]) => (
                  <span key={t} className="inline-block mr-3 mt-0.5">
                    {typeLabel(t)} {n} 题
                  </span>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 mb-4 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={randomReplace}
                onChange={(e) => setRandomReplace(e.target.checked)}
              />
              替换已选题目（取消勾选则追加到现有选择）
            </label>

            {randomError && <p className="text-xs text-rose-500 mb-2">{randomError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRandom(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyRandom}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
              >
                确认抽取
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已发布考试保存提示 */}
      {showPublishWarn && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowPublishWarn(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-full bg-amber-100 text-amber-600 flex-shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">已发布考试无法直接修改</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              当前考试处于「已发布」状态，题目、限时、及格分等字段不可直接保存（后端仅允许改时间窗与状态）。
              如需应用本次修改，可先<span className="font-bold text-slate-800">撤销发布</span>（状态改为「草稿」），保存后再重新发布即可。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPublishWarn(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                我再想想
              </button>
              <button
                type="button"
                onClick={confirmRevokeAndSave}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
              >
                撤销发布并保存
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
