import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GraduationCap, Users, User, Phone, Key, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import type { UserRole } from '../services/api';

interface RoleSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  onConvertRole: (data: { targetRole: UserRole; phone?: string; inviteCode?: string; teacherPhone?: string; }) => Promise<{ success: boolean; error?: string }>;
  onBindTeacher: (data: { inviteCode?: string; teacherPhone?: string; }) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; desc: string }> = {
  student: {
    label: '学生',
    icon: <GraduationCap size={20} />,
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    desc: '加入老师的题库，跟随老师学习',
  },
  teacher: {
    label: '老师',
    icon: <Users size={20} />,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200',
    desc: '创建和管理题库，管理学生',
  },
  independent: {
    label: '独立用户',
    icon: <User size={20} />,
    color: 'text-slate-600',
    bg: 'bg-slate-50 border-slate-200',
    desc: '独立使用，不绑定老师',
  },
};

export const RoleSwitchModal: React.FC<RoleSwitchModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  onConvertRole,
  onBindTeacher,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 转为老师需要的字段
  const [phone, setPhone] = useState('');
  // 转为学生需要的字段
  const [bindMethod, setBindMethod] = useState<'inviteCode' | 'teacherPhone'>('inviteCode');
  const [inviteCode, setInviteCode] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');

  const handleConvert = async () => {
    if (!selectedRole || selectedRole === currentRole) return;
    setIsConverting(true);
    setError(null);

    try {
      let result: { success: boolean; error?: string };

      if (selectedRole === 'teacher') {
        result = await onConvertRole({ targetRole: 'teacher', phone });
      } else if (selectedRole === 'student') {
        result = await onConvertRole({
          targetRole: 'student',
          inviteCode: bindMethod === 'inviteCode' ? inviteCode : undefined,
          teacherPhone: bindMethod === 'teacherPhone' ? teacherPhone : undefined,
        });
      } else {
        result = await onConvertRole({ targetRole: 'independent' });
      }

      if (result.success) {
        onClose();
        setSelectedRole(null);
        setPhone('');
        setInviteCode('');
        setTeacherPhone('');
      } else {
        setError(result.error || '转换失败');
      }
    } catch (err: any) {
      setError(err.message || '转换失败');
    } finally {
      setIsConverting(false);
    }
  };

  const handleBack = () => {
    setSelectedRole(null);
    setError(null);
  };

  if (!isOpen) return null;

  const availableRoles: UserRole[] = ['student', 'teacher', 'independent'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-indigo-600" size={20} />
                切换身份
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                当前身份：
                <span className={`font-semibold ${ROLE_CONFIG[currentRole]?.color}`}>
                  {ROLE_CONFIG[currentRole]?.label}
                </span>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 max-h-96">
          <AnimatePresence mode="wait">
            {!selectedRole ? (
              <motion.div
                key="select"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-3"
              >
                <p className="text-sm text-slate-600 mb-4">选择您想要切换的身份：</p>
                {availableRoles.map((role) => {
                  const config = ROLE_CONFIG[role];
                  const isCurrent = role === currentRole;
                  return (
                    <button
                      key={role}
                      onClick={() => !isCurrent && setSelectedRole(role)}
                      disabled={isCurrent}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                        isCurrent
                          ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                          : `${config.bg} hover:shadow-md cursor-pointer`
                      }`}
                    >
                      <div className={`${config.color}`}>{config.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${config.color}`}>{config.label}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">当前</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{config.desc}</p>
                      </div>
                      {!isCurrent && <ChevronRight size={16} className="text-slate-400" />}
                    </button>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <button onClick={handleBack} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-2">
                  <ChevronRight size={14} className="rotate-180" />
                  返回选择
                </button>

                <div className={`p-3 rounded-xl border-2 ${ROLE_CONFIG[selectedRole]?.bg} flex items-center gap-3`}>
                  <div className={ROLE_CONFIG[selectedRole]?.color}>{ROLE_CONFIG[selectedRole]?.icon}</div>
                  <div>
                    <span className={`font-bold text-sm ${ROLE_CONFIG[selectedRole]?.color}`}>
                      转换为{ROLE_CONFIG[selectedRole]?.label}
                    </span>
                    <p className="text-xs text-slate-500">{ROLE_CONFIG[selectedRole]?.desc}</p>
                  </div>
                </div>

                {/* 转为老师：需要手机号 */}
                {selectedRole === 'teacher' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <p className="text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        转为老师后，您将可以创建和管理题库、管理学生。需要绑定手机号以供学生查找。
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Phone size={14} className="text-slate-400" />
                        手机号 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="请输入手机号"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* 转为学生：需要邀请码或老师手机号 */}
                {selectedRole === 'student' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <p className="text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        转为学生后，您将可以加入老师的题库进行学习。需要通过邀请码或老师手机号绑定老师。
                      </p>
                    </div>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                      <button
                        onClick={() => setBindMethod('inviteCode')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                          bindMethod === 'inviteCode' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        邀请码
                      </button>
                      <button
                        onClick={() => setBindMethod('teacherPhone')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                          bindMethod === 'teacherPhone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        老师手机号
                      </button>
                    </div>
                    {bindMethod === 'inviteCode' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Key size={14} className="text-slate-400" />
                          邀请码 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          placeholder="请输入老师提供的邀请码"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Phone size={14} className="text-slate-400" />
                          老师手机号 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={teacherPhone}
                          onChange={(e) => setTeacherPhone(e.target.value)}
                          placeholder="请输入老师的手机号"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                        <p className="text-[10px] text-slate-400">提交后需等待老师审核通过</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 转为独立用户：直接确认 */}
                {selectedRole === 'independent' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <p className="text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        转为独立用户后，您将脱离老师的关联，自行管理学习内容。此操作可随时再次切换。
                      </p>
                    </div>
                  </div>
                )}

                {/* 错误提示 */}
                {error && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {selectedRole && (
          <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-all text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConvert}
              disabled={isConverting || (selectedRole === 'teacher' && !phone) || (selectedRole === 'student' && bindMethod === 'inviteCode' && !inviteCode) || (selectedRole === 'student' && bindMethod === 'teacherPhone' && !teacherPhone)}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5 text-sm"
            >
              {isConverting ? <Loader2 className="animate-spin" size={14} /> : null}
              确认切换
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
