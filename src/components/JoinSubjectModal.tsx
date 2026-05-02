import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Link, Loader2, Clock } from 'lucide-react';
import { subjectApi } from '../services/api';

interface JoinSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined: () => void;
}

export const JoinSubjectModal: React.FC<JoinSubjectModalProps> = ({ isOpen, onClose, onJoined }) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, setIsPending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!code.trim()) { setError('请输入科目邀请码'); return; }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    setIsPending(false);
    try {
      const res = await subjectApi.join(code.trim());
      if (res.status === 'pending') {
        setSuccess(`已申请加入共享科目「${res.subject.name}」，等待老师审核`);
        setIsPending(true);
      } else {
        setSuccess(`已成功加入共享科目「${res.subject.name}」`);
      }
      setCode('');
      onJoined();
      setTimeout(() => { onClose(); setSuccess(''); setIsPending(false); }, 2000);
    } catch (err: any) {
      setError(err.message || '加入失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Link className="text-blue-600" size={20} />加入共享科目
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">输入科目创建者提供的邀请码</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">科目邀请码</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="请输入邀请码" maxLength={20}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm text-center text-lg tracking-widest font-mono" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
          {success && (
            <p className={`text-xs p-2 rounded-lg flex items-center gap-1 ${isPending ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}>
              {isPending && <Clock size={12} />}{success}
            </p>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg text-sm">取消</button>
          <button onClick={handleSubmit} disabled={isSubmitting || !code.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5 text-sm">
            {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Link size={14} />}加入科目
          </button>
        </div>
      </motion.div>
    </div>
  );
};
