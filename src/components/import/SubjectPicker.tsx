// 目标科目选择弹窗（从 ImportModal 抽取）
import React from 'react';
import { motion } from 'motion/react';
import { X, FileText, CheckCircle2 } from 'lucide-react';
import type { Subject, SubjectId } from '../../types';

interface SubjectPickerProps {
  isOpen: boolean;
  allSubjects: Subject[] | undefined;
  selectedTargetSubject: SubjectId;
  onSelect: (id: SubjectId) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

// allSubjects 为空时的兜底选项（与原逻辑一致）
const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'python', name: 'Python', icon: '🐍', isOwner: true, isShared: false },
  { id: 'english', name: '英语', icon: '🔤', isOwner: true, isShared: false },
  { id: 'chinese', name: '语文', icon: '📖', isOwner: true, isShared: false },
  { id: 'math', name: '数学', icon: '📐', isOwner: true, isShared: false },
] as Subject[];

export const SubjectPicker: React.FC<SubjectPickerProps> = ({
  isOpen,
  allSubjects,
  selectedTargetSubject,
  onSelect,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const mySubjects =
    allSubjects && allSubjects.length > 0 ? allSubjects : DEFAULT_SUBJECTS;
  const owned = mySubjects.filter((s) => s.isOwner !== false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">准备导入题库</h2>
            <p className="text-sm text-slate-500 mt-1">请选择要导入的目标科目</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileText size={16} className="text-green-600" /> 请选择目标科目
            </label>
            <div className="grid grid-cols-2 gap-3">
              {owned.length === 0 ? (
                <p className="col-span-2 text-sm text-slate-400 text-center py-6">
                  暂无可导入的题库，请先创建自己的题库
                </p>
              ) : (
                owned.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => onSelect(subject.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col items-center justify-center ${
                      selectedTargetSubject === subject.id
                        ? 'border-green-600 bg-green-50/50 ring-2 ring-green-50'
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <span className="text-2xl mb-1">{subject.icon}</span>
                    <span className="font-bold text-sm text-slate-800">{subject.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center gap-2"
            >
              <CheckCircle2 size={18} />
              确认导入
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
