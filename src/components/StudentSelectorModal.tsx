import { useState, useEffect } from 'react';
import { X, Check, GraduationCap } from 'lucide-react';
import { authApi, subjectApi } from '../services/api';

export function StudentSelectorModal({ subjectId, subjectName, isOpen, onClose, onStudentIdsChange }: { subjectId: string; subjectName: string; isOpen: boolean; onClose: () => void; onStudentIdsChange: (ids: number[]) => void }) {
  const [allStudents, setAllStudents] = useState<{ id: number; username: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isAll, setIsAll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) loadData();
  }, [subjectId, isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      let students: { id: number; username: string }[] = [];
      try {
        const stuRes = await authApi.getTeacherStudents('me' as any);
        students = stuRes.students || [];
      } catch {
        // fallback
      }
      setAllStudents(students);
      try {
        const accessRes = await subjectApi.getStudents(subjectId);
        if (accessRes.isAllStudents) {
          setIsAll(true);
          setSelectedIds([]);
        } else {
          setIsAll(false);
          setSelectedIds(accessRes.studentIds || []);
        }
      } catch {
        setIsAll(true);
        setSelectedIds([]);
      }
    } catch {
      setAllStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (studentId: number) => {
    const newIds = selectedIds.includes(studentId)
      ? selectedIds.filter(id => id !== studentId)
      : [...selectedIds, studentId];
    setSelectedIds(newIds);
    setIsAll(false);
  };

  const selectAll = () => {
    setIsAll(true);
    setSelectedIds([]);
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onStudentIdsChange(isAll ? [] : selectedIds);
      onClose();
    } catch (e: any) {
      alert('保存失败: ' + (e.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={saving ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">选择共享学生</h3>
            <p className="text-xs text-slate-400 mt-0.5">科目：{subjectName}</p>
          </div>
          <button onClick={saving ? undefined : onClose} className={`p-1 rounded-lg transition-colors ${saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'}`} disabled={saving}>
            <X size={18} className={saving ? 'text-slate-300' : 'text-slate-400'} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">加载学生列表...</p>
          ) : allStudents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">暂无学生，请先添加学生</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-600">共享范围</span>
                <button
                  onClick={selectAll}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    isAll ? 'bg-indigo-100 text-indigo-600 font-medium' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  全体学生
                </button>
              </div>
              {isAll ? (
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <GraduationCap size={28} className="mx-auto text-indigo-400 mb-2" />
                  <p className="text-sm text-indigo-600 font-medium">全部 {allStudents.length} 名学生均可访问</p>
                  <p className="text-xs text-indigo-400 mt-1">点击"指定学生"可取消全体共享</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {allStudents.map(s => (
                    <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        className="accent-indigo-600 w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">{s.username}</span>
                      {selectedIds.includes(s.id) && <Check size={14} className="text-indigo-500 ml-auto" />}
                    </label>
                  ))}
                  {selectedIds.length === 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">请至少选择一位学生，或切换为"全体学生"</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (!isAll && selectedIds.length === 0)}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : isAll ? `全体学生 (${allStudents.length}人)` : `已选 ${selectedIds.length} 人`}
          </button>
        </div>
      </div>
    </div>
  );
}
