/**
 * FR-104 材料题（一拖 N）——建组模态
 *
 * 一段共享材料 + N 道普通子题，提交调用 questionGroupApi.create。
 * 子题字段与单题录入对齐（type/title/options/answer/points），沿用后端 validateGroupPayload 口径在前端预校验。
 * 科目由模态内选择（题目管理页跨科目展示，无外部选中科目上下文）。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { questionGroupApi } from '../../services/api';

const SUB_TYPES = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill_in', label: '填空题' },
  { value: 'short_answer', label: '简答题' },
];

interface SubRow {
  type: string;
  title: string;
  answer: string;
  optionsText: string;
  points: number;
}

const emptyRow = (): SubRow => ({ type: 'single', title: '', answer: '', optionsText: '', points: 1 });

export interface QuestionGroupFormProps {
  open: boolean;
  subjects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

export function QuestionGroupForm({ open, subjects, onClose, onCreated }: QuestionGroupFormProps) {
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [material, setMaterial] = useState<string>('');
  const [rows, setRows] = useState<SubRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!open) return null;

  const needsOptions = (t: string) => t === 'single' || t === 'multiple';

  const updateRow = (idx: number, patch: Partial<SubRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setMaterial('');
    setRows([emptyRow()]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!subjectId) {
      setError('请选择所属科目');
      return;
    }
    if (!material.trim()) {
      setError('共享材料不能为空');
      return;
    }
    if (rows.length === 0) {
      setError('至少添加一道子题');
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.title.trim()) {
        setError(`第 ${i + 1} 道子题缺少标题`);
        return;
      }
      if (!r.answer.trim()) {
        setError(`第 ${i + 1} 道子题缺少答案`);
        return;
      }
      if (needsOptions(r.type) && r.optionsText.split('\n').map((s) => s.trim()).filter(Boolean).length < 2) {
        setError(`第 ${i + 1} 道子题为${r.type === 'single' ? '单选' : '多选'}题，选项至少 2 项（每行一个）`);
        return;
      }
    }

    const questions = rows.map((r) => {
      const q: { type: string; title: string; answer: string; points: number; options?: string[] } = {
        type: r.type,
        title: r.title.trim(),
        answer: r.answer.trim(),
        points: Number(r.points) > 0 ? Number(r.points) : 1,
      };
      if (needsOptions(r.type)) {
        q.options = r.optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
      }
      return q;
    });

    setSubmitting(true);
    try {
      await questionGroupApi.create({ subject_id: subjectId, material: material.trim(), questions });
      reset();
      onCreated();
    } catch (e: any) {
      setError(e?.message || '创建材料组失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-amber-600" />
            <h3 className="text-lg font-bold text-slate-800">新建材料组</h3>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">所属科目</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-amber-600 outline-none"
              >
                {subjects.length === 0 && <option value="">（无可管理科目）</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">共享材料（所有子题共用的题干/阅读材料）</label>
            <textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="如：阅读下列材料，完成第 1~3 题……"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-amber-600 outline-none h-24 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-slate-600">子题（{rows.length}）</label>
              <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700">
                <Plus size={14} /> 添加子题
              </button>
            </div>
            <div className="space-y-3">
              {rows.map((r, idx) => (
                <div key={idx} className="p-3 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-6 flex-shrink-0">{idx + 1}.</span>
                    <select
                      value={r.type}
                      onChange={(e) => updateRow(idx, { type: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border-2 border-slate-100 focus:border-amber-600 outline-none text-sm"
                    >
                      {SUB_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number"
                        min={1}
                        value={r.points}
                        onChange={(e) => updateRow(idx, { points: parseInt(e.target.value, 10) || 1 })}
                        className="w-16 px-2 py-1 rounded-lg border-2 border-slate-100 focus:border-amber-600 outline-none text-sm"
                      />
                      <span className="text-xs text-slate-400">分</span>
                    </div>
                    {rows.length > 1 && (
                      <button type="button" onClick={() => removeRow(idx)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0" title="删除此子题">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <input
                    value={r.title}
                    onChange={(e) => updateRow(idx, { title: e.target.value })}
                    placeholder="子题题干"
                    className="w-full px-3 py-2 rounded-lg border-2 border-slate-100 focus:border-amber-600 outline-none text-sm"
                  />
                  {needsOptions(r.type) && (
                    <textarea
                      value={r.optionsText}
                      onChange={(e) => updateRow(idx, { optionsText: e.target.value })}
                      placeholder="选项（每行一个）"
                      className="w-full px-3 py-2 rounded-lg border-2 border-slate-100 focus:border-amber-600 outline-none text-sm h-16 resize-none"
                    />
                  )}
                  <input
                    value={r.answer}
                    onChange={(e) => updateRow(idx, { answer: e.target.value })}
                    placeholder={needsOptions(r.type) ? '正确答案（须与某选项文本一致；多选用逗号分隔）' : '参考答案'}
                    className="w-full px-3 py-2 rounded-lg border-2 border-slate-100 focus:border-amber-600 outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={handleClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || subjects.length === 0}
            className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors disabled:opacity-60"
          >
            {submitting ? '创建中...' : '创建材料组'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
