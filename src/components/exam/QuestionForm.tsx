/**
 * FR-105：新建单题模态（含听力音频上传）。提交走 questionApi.create。
 * 与 ImportModal 并存的第二个建题入口；科目由模态内下拉选择（题目管理页无外部选中科目上下文）。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Upload, AlertTriangle, BookPlus } from 'lucide-react';
import { questionApi, uploadApi } from '../../services/api';
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
  onClose: () => void;
  onCreated: () => void;
}

export function QuestionForm({ open, subjects, onClose, onCreated }: QuestionFormProps) {
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [type, setType] = useState<string>('single');
  const [title, setTitle] = useState<string>('');
  const [optionsText, setOptionsText] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [points, setPoints] = useState<number>(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!open) return null;
  const needsOptions = type === 'single' || type === 'multiple';

  const reset = () => {
    setSubjectId(subjects[0]?.id || '');
    setType('single'); setTitle(''); setOptionsText(''); setAnswer('');
    setExplanation(''); setPoints(1); setAudioUrl(null); setError(null);
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
    if (!answer.trim()) { setError('答案不能为空'); return; }
    const opts = needsOptions ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!opts || opts.length < 2)) { setError('单选/多选题选项至少 2 项（每行一个）'); return; }

    setSubmitting(true);
    try {
      await questionApi.create({
        subject_id: subjectId, type, title: title.trim(),
        options: opts,
        answer: type === 'multiple' ? answer.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : answer.trim(),
        explanation: explanation.trim() || undefined, points: Number(points) > 0 ? Number(points) : 1,
        audio_url: audioUrl,
      });
      reset();
      onCreated();
    } catch (e) {
      setError((e as { message?: string })?.message || '创建题目失败');
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
            <h3 className="text-lg font-bold text-slate-800">新建题目</h3>
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

          <label className="block text-sm">
            <span className="font-bold text-slate-600">{needsOptions ? '正确答案（须与某选项一致；多选用逗号分隔）' : '参考答案'}</span>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none" />
          </label>

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
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={handleClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">取消</button>
          <button type="button" onClick={handleSubmit} disabled={submitting || subjects.length === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '创建中...' : '创建题目'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
