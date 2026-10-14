/**
 * FR-105：新建单题模态（含听力音频上传）。提交走 questionApi.create。
 * 与 ImportModal 并存的第二个建题入口；科目由模态内下拉选择（题目管理页无外部选中科目上下文）。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Upload, AlertTriangle, BookPlus } from 'lucide-react';
import { questionApi, uploadApi, type QuestionItem } from '../../services/api';
import { PROGRAMMING_LANGUAGES } from '../../types';
import { AudioPlayer } from '../AudioPlayer';

const TYPES = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill_in', label: '填空题' },
  { value: 'short_answer', label: '简答题' },
  { value: 'programming', label: '编程题' },
];

export interface QuestionFormProps {
  open: boolean;
  subjects: { id: string; name: string }[];
  /** 传入则为编辑模式：预填现有内容（含 judge_config），提交走 questionApi.update */
  editing?: QuestionItem | null;
  onClose: () => void;
  onCreated: () => void;
}

export function QuestionForm({ open, subjects, editing = null, onClose, onCreated }: QuestionFormProps) {
  const isEdit = !!editing?.id;
  const initCases = (editing?.judge_config?.test_cases || []).map((c) => ({
    input: c.input || '', expected_output: c.expected_output || '', is_sample: c.is_sample !== false,
  }));
  const [subjectId, setSubjectId] = useState<string>(editing?.subject_id || subjects[0]?.id || '');
  const [type, setType] = useState<string>(editing?.type || 'single');
  const [title, setTitle] = useState<string>(editing?.title || '');
  const [optionsText, setOptionsText] = useState<string>((editing?.options || []).join('\n'));
  const [answer, setAnswer] = useState<string>(
    Array.isArray(editing?.answer) ? (editing!.answer as string[]).join(',') : (editing?.answer ?? ''));
  const [explanation, setExplanation] = useState<string>(editing?.explanation || '');
  const [points, setPoints] = useState<number>(editing?.points || 1);
  const [audioUrl, setAudioUrl] = useState<string | null>(editing?.audio_url ?? null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [starter, setStarter] = useState<string>(editing?.judge_config?.starter_code || '');
  const [lang, setLang] = useState<string>(editing?.judge_config?.language || 'python');
  const [cases, setCases] = useState<{ input: string; expected_output: string; is_sample: boolean }[]>(
    initCases.length ? initCases : [{ input: '', expected_output: '', is_sample: true }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!open) return null;
  const needsOptions = type === 'single' || type === 'multiple';
  const isProgramming = type === 'programming';

  const reset = () => {
    setSubjectId(subjects[0]?.id || '');
    setType('single'); setTitle(''); setOptionsText(''); setAnswer('');
    setExplanation(''); setPoints(1); setAudioUrl(null); setError(null);
    setStarter(''); setCases([{ input: '', expected_output: '', is_sample: true }]); setLang('python');
  };
  const handleClose = () => { reset(); onClose(); };

  const onPickAudio = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setUploading(true);
    try {
      const { url } = await uploadApi.audio(file);
      setAudioUrl(url);
    } catch (e) {
      setError((e as { message?: string })?.message || '音频上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!subjectId) { setError('请选择所属科目'); return; }
    if (!title.trim()) { setError('题干不能为空'); return; }
    if (!isProgramming && !answer.trim()) { setError('答案不能为空'); return; }
    const opts = needsOptions ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!opts || opts.length < 2)) { setError('单选/多选题选项至少 2 项（每行一个）'); return; }
    if (isProgramming && !cases.some((c) => c.expected_output.trim())) { setError('编程题至少填一个样例用例的期望输出'); return; }

    setSubmitting(true);
    try {
      const payload: Partial<QuestionItem> = {
        subject_id: subjectId, type, title: title.trim(),
        options: opts,
        answer: isProgramming ? [] : (type === 'multiple' ? answer.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : answer.trim()),
        explanation: explanation.trim() || undefined, points: Number(points) > 0 ? Number(points) : 1,
        audio_url: audioUrl,
        judge_config: isProgramming
          ? { language: lang, time_limit_ms: 2000, memory_limit_mb: 128, starter_code: starter || null,
              test_cases: cases.filter((c) => c.expected_output.trim()).map((c) => ({ input: c.input, expected_output: c.expected_output, is_sample: c.is_sample !== false })) }
          : (isEdit ? null : undefined),
      };
      if (isEdit && editing?.id) {
        await questionApi.update(editing.id, payload);
      } else {
        await questionApi.create(payload);
      }
      // 通知题库缓存刷新（首页/练习无需切科目即可见新题）
      window.dispatchEvent(new CustomEvent('questions:changed'));
      reset();
      onCreated();
    } catch (e) {
      setError((e as { message?: string })?.message || (isEdit ? '保存题目失败' : '创建题目失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookPlus size={20} className="text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑题目' : '新建题目'}</h3>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="font-bold text-slate-600">科目</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none">
                {subjects.length === 0 && <option value="">（无可管理科目）</option>}
                {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-600">题型</span>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none">
                {TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-600">分值</span>
              <input type="number" min={1} value={points}
                onChange={(e) => setPoints(parseInt(e.target.value, 10) || 1)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none" />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-bold text-slate-600">题干</span>
            <textarea value={title} onChange={(e) => setTitle(e.target.value)} placeholder="题目内容…"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-20 resize-none" />
          </label>

          {needsOptions && (
            <label className="block text-sm">
              <span className="font-bold text-slate-600">选项（每行一个）</span>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={'甲\n乙'}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-20 resize-none" />
            </label>
          )}

          {!isProgramming && (
            <label className="block text-sm">
              <span className="font-bold text-slate-600">{needsOptions ? '正确答案（须与某选项一致；多选用逗号分隔）' : '参考答案'}</span>
              <input value={answer} onChange={(e) => setAnswer(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none" />
            </label>
          )}

          <label className="block text-sm">
            <span className="font-bold text-slate-600">解析（可选）</span>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-16 resize-none" />
          </label>

          {/* FR-105 听力音频（可空；上传后可预览播放） */}
          <div className="p-3 rounded-2xl border border-indigo-100 bg-indigo-50/50">
            <div className="flex items-center gap-2 mb-2">
              <Upload size={16} className="text-indigo-600" />
              <span className="text-sm font-bold text-slate-600">听力音频（可选）</span>
              <span className="text-xs text-slate-400">支持 mp3 / m4a / wav，≤15MB</span>
            </div>
            <input type="file" accept="audio/mpeg,audio/mp3,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
              onChange={(e) => void onPickAudio(e.target.files?.[0])} />
            {uploading && <span className="ml-2 text-xs text-indigo-500">上传中…</span>}
            {audioUrl && (
              <div className="mt-2 space-y-1">
                <AudioPlayer src={audioUrl} />
                <button type="button" onClick={() => setAudioUrl(null)} className="text-xs text-rose-500 hover:underline">移除音频</button>
              </div>
            )}
          </div>

          {/* FR-106 编程题判题配置（仅 programming）：初始代码 + 样例用例增删 */}
          {isProgramming && (
            <div className="p-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-600">编程题判题配置</span>
                <select value={lang} onChange={(e) => setLang(e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 outline-none">
                  {PROGRAMMING_LANGUAGES.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
                </select>
                <span className="text-xs text-slate-400">2s / 128MB</span>
              </div>
              <label className="block text-sm">
                <span className="font-bold text-slate-600">初始代码（可选）</span>
                <textarea value={starter} onChange={(e) => setStarter(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-100 focus:border-emerald-600 outline-none font-mono text-xs h-20 resize-none" />
              </label>
              <div className="space-y-2">
                <span className="text-sm font-bold text-slate-600">样例用例（输入 → 期望输出）</span>
                {cases.map((c, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <textarea value={c.input} onChange={(e) => setCases((p) => p.map((x, j) => j === i ? { ...x, input: e.target.value } : x))}
                      placeholder="stdin 输入" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-xs h-16 resize-none" />
                    <textarea value={c.expected_output} onChange={(e) => setCases((p) => p.map((x, j) => j === i ? { ...x, expected_output: e.target.value } : x))}
                      placeholder="期望 stdout" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-xs h-16 resize-none" />
                    <button type="button" onClick={() => setCases((p) => p.filter((_, j) => j !== i))} className="text-rose-500 text-xs px-1">删除</button>
                  </div>
                ))}
                <button type="button" onClick={() => setCases((p) => [...p, { input: '', expected_output: '', is_sample: true }])}
                  className="text-xs text-emerald-600 font-bold">+ 添加用例</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={handleClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">取消</button>
          <button type="button" onClick={handleSubmit} disabled={submitting || subjects.length === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? (isEdit ? '保存中...' : '创建中...') : (isEdit ? '保存修改' : '创建题目')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
