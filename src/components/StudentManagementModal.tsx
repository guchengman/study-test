import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Users, Key, Check, UserX, Loader2, Copy, Plus, RefreshCw, BookOpen } from 'lucide-react';
import { inviteCodeApi, studentApi, subjectApi, type InviteCode, type StudentItem, type PendingSubscription } from '../services/api';

interface StudentManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StudentManagementModal: React.FC<StudentManagementModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'codes' | 'pending' | 'students' | 'subjectPending'>('codes');
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [pendingStudents, setPendingStudents] = useState<StudentItem[]>([]);
  const [myStudents, setMyStudents] = useState<StudentItem[]>([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<PendingSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newCodeDesc, setNewCodeDesc] = useState('');
  const [newCustomCode, setNewCustomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [codesRes, pendingRes, studentsRes, subRes] = await Promise.all([
        inviteCodeApi.list('registration'),
        studentApi.listPending(),
        studentApi.listMy(),
        subjectApi.listPendingSubscriptions(),
      ]);
      setCodes(codesRes.codes);
      setPendingStudents(pendingRes.students);
      setMyStudents(studentsRes.students);
      setPendingSubscriptions(subRes.subscriptions);
    } catch (err) { console.error('加载数据失败', err); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { if (isOpen) loadData(); }, [isOpen, loadData]);

  const handleCreateCode = async () => {
    setIsCreating(true);
    try {
      await inviteCodeApi.create({ type: 'registration', code: newCustomCode || undefined, description: newCodeDesc });
      setNewCodeDesc(''); setNewCustomCode('');
      showToast('注册码创建成功'); loadData();
    } catch (err: any) { showToast(err.message || '创建失败'); }
    finally { setIsCreating(false); }
  };

  const handleDeleteCode = async (id: number) => {
    try { await inviteCodeApi.delete(id); showToast('邀请码已删除'); loadData(); }
    catch (err: any) { showToast(err.message || '删除失败'); }
  };

  const handleApprove = async (id: number) => {
    try { await studentApi.approve(id); showToast('已通过审核'); loadData(); }
    catch (err: any) { showToast(err.message || '操作失败'); }
  };

  const handleReject = async (id: number) => {
    try { await studentApi.reject(id); showToast('已拒绝，学生已转为独立用户'); loadData(); }
    catch (err: any) { showToast(err.message || '操作失败'); }
  };

  const handleRemove = async (id: number) => {
    try { await studentApi.remove(id); showToast('学生已移除'); loadData(); }
    catch (err: any) { showToast(err.message || '操作失败'); }
  };

  const handleResetPassword = async (id: number) => {
    try { await studentApi.resetPassword(id); showToast('密码已重置为123456'); }
    catch (err: any) { showToast(err.message || '重置失败'); }
  };

  const handleApproveSubscription = async (id: number) => {
    try { await subjectApi.approveSubscription(id); showToast('已通过审核'); loadData(); }
    catch (err: any) { showToast(err.message || '操作失败'); }
  };

  const handleRejectSubscription = async (id: number) => {
    try { await subjectApi.rejectSubscription(id); showToast('已拒绝申请'); loadData(); }
    catch (err: any) { showToast(err.message || '操作失败'); }
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code).then(() => showToast('已复制到剪贴板')); };

  if (!isOpen) return null;
  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Users className="text-blue-600" size={20} />学生管理
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={loadData} className="p-1.5 hover:bg-slate-100 rounded-lg"><RefreshCw size={16} className="text-slate-400" /></button>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} className="text-slate-400" /></button>
            </div>
          </div>
          <div className="flex mt-3 bg-slate-100 rounded-xl p-1">
            {[
              { key: 'codes', label: '注册码', Icon: Key },
              { key: 'pending', label: `待审核${pendingStudents.length > 0 ? `(${pendingStudents.length})` : ''}`, Icon: UserX },
              { key: 'students', label: `我的学生(${myStudents.length})`, Icon: Users },
              { key: 'subjectPending', label: `科目申请${pendingSubscriptions.length > 0 ? `(${pendingSubscriptions.length})` : ''}`, Icon: BookOpen },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${activeTab === tab.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                <tab.Icon size={12} />{tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
          ) : (
            <>
              {activeTab === 'codes' && (
                <>
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={newCodeDesc} onChange={e => setNewCodeDesc(e.target.value)} placeholder="描述（如：2026春季数学班）" className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs" />
                      <input value={newCustomCode} onChange={e => setNewCustomCode(e.target.value.toUpperCase())} placeholder="自定义码(可选)" maxLength={20} className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono" />
                      <button onClick={handleCreateCode} disabled={isCreating} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 shrink-0">
                        {isCreating ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}生成
                      </button>
                    </div>
                  </div>
                  {codes.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">暂无注册码</p> : codes.map(c => (
                    <div key={c.id} className={`bg-white rounded-lg border p-3 ${isExpired(c.expires_at) ? 'border-slate-200 opacity-50' : 'border-blue-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-lg font-bold text-blue-600 tracking-wider">{c.code}</span>
                          <button onClick={() => copyCode(c.code)} className="p-1 hover:bg-slate-100 rounded"><Copy size={12} className="text-slate-400" /></button>
                        </div>
                        <button onClick={() => handleDeleteCode(c.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                        {c.description && <span>{c.description}</span>}
                        <span>{c.used_count}人已用</span>
                        <span className={isExpired(c.expires_at) ? 'text-red-400' : 'text-green-500'}>
                          {isExpired(c.expires_at) ? '已过期' : `有效期至${new Date(c.expires_at).toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {activeTab === 'pending' && (
                pendingStudents.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">暂无待审核学生</p> : pendingStudents.map(s => (
                  <div key={s.id} className="bg-amber-50 rounded-lg border border-amber-100 p-3">
                    <div className="flex items-center justify-between">
                      <div><span className="font-medium text-slate-800">{s.username}</span><span className="text-xs text-slate-500 ml-2">{s.email}</span></div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(s.id)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1"><Check size={12} />通过</button>
                        <button onClick={() => handleReject(s.id)} className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-300 flex items-center gap-1"><UserX size={12} />拒绝</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {activeTab === 'students' && (
                myStudents.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">暂无学生</p> : myStudents.map(s => (
                  <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div><span className="font-medium text-slate-800">{s.username}</span><span className="text-xs text-slate-500 ml-2">{s.email}</span><span className="text-xs text-green-500 ml-2">活跃</span></div>
                      <div className="flex gap-2">
                        <button onClick={() => handleResetPassword(s.id)} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200">重置密码</button>
                        <button onClick={() => handleRemove(s.id)} className="px-2 py-1 bg-red-50 text-red-500 rounded text-xs hover:bg-red-100">移除</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {activeTab === 'subjectPending' && (
                pendingSubscriptions.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">暂无科目加入申请</p> : pendingSubscriptions.map(sub => (
                  <div key={sub.subscription_id} className="bg-amber-50 rounded-lg border border-amber-100 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{sub.subject_icon}</span>
                          <span className="font-medium text-slate-800">{sub.subject_name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          <span>{sub.username}</span>
                          {sub.email && <span className="ml-2">{sub.email}</span>}
                          <span className="ml-2 text-amber-500">申请加入</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveSubscription(sub.subscription_id)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1"><Check size={12} />通过</button>
                        <button onClick={() => handleRejectSubscription(sub.subscription_id)} className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-300 flex items-center gap-1"><UserX size={12} />拒绝</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
        {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg">{toast}</div>}
      </motion.div>
    </div>
  );
};
