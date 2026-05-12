import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, Eye, EyeOff, ShieldCheck, KeyRound, User, ArrowLeft, Check, Phone, BookOpen, UserCircle } from 'lucide-react';
import type { UserRole } from '../services/api';

type ModalMode = 'register' | 'login' | 'forgotPassword' | 'setupPassword';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<{ success: boolean; needSetupPassword?: boolean; error?: string }>;
  onRegister: (data: { username: string; password: string; email: string; role?: UserRole; phone?: string; inviteCode?: string; teacherPhone?: string; }) => Promise<{ success: boolean; error?: string }>;
  onChangePassword?: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  onSendCode?: (email: string) => Promise<{ success: boolean; message: string }>;
  onVerifyCode?: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  onResetPassword?: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  onCheckUsername?: (username: string) => Promise<{ exists: boolean }>;
  onSetupPassword?: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  isAdmin?: boolean;
  currentUser?: string | null;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  onChangePassword,
  onSendCode,
  onVerifyCode,
  onResetPassword,
  onCheckUsername,
  onSetupPassword,
  isAdmin = false,
  currentUser,
}) => {
  // 模式：register=注册, login=登录, forgotPassword=忘记密码, setupPassword=设置密码
  const [mode, setMode] = useState<ModalMode>('register');
  
  // 注册状态
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('independent');
  const [regPhone, setRegPhone] = useState('');
  const [regInviteCode, setRegInviteCode] = useState('');
  const [regTeacherPhone, setRegTeacherPhone] = useState('');
  const [regStudentMethod, setRegStudentMethod] = useState<'code' | 'phone' | 'none'>('none');
  const [regStep, setRegStep] = useState<1 | 2>(1); // 1: 填写信息, 2: 验证邮箱
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regCountdown, setRegCountdown] = useState(0);

  // 登录状态
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // 忘记密码状态
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);

  // 设置密码状态（密码被重置后）
  const [setupPasswordUsername, setSetupPasswordUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // 成功提示状态
  const [successMessage, setSuccessMessage] = useState('');

  // 追踪 isOpen 上一次的值，只在弹窗从关闭到打开时重置
  const prevIsOpenRef = useRef(isOpen);
  // 追踪是否在注册流程中（已到验证码步骤）
  const inRegFlowRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape 键关闭弹窗
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 焦点陷阱
  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', trap);
    first.focus();
    return () => el.removeEventListener('keydown', trap);
  }, [isOpen]);

  // 同步注册流程状态到 ref
  useEffect(() => {
    if (regStep === 2) {
      inRegFlowRef.current = true;
    } else if (regStep === 1 && mode !== 'register') {
      inRegFlowRef.current = false;
    }
  }, [regStep, mode]);

  // 初始化
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // 从关闭变为打开
      if (inRegFlowRef.current) {
        // 用户在注册流程中，恢复到注册验证码步骤，不重置
        setMode('register');
      } else {
        // 正常打开：重置模式为登录，清除表单
        setMode('login');
        resetAllForms();
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // 重置所有表单
  const resetAllForms = () => {
    setRegUsername('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegCode('');
    setRegStep(1);
    setRegError('');
    setRegCountdown(0);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
    setResetEmail('');
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
    setResetCountdown(0);
    setSetupPasswordUsername('');
    setSetupPassword('');
    setSetupConfirmPassword('');
    setSetupError('');
    setSuccessMessage('');
  };

  // 验证码倒计时
  useEffect(() => {
    if (regCountdown > 0) {
      const timer = setTimeout(() => setRegCountdown(regCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [regCountdown]);

  useEffect(() => {
    if (resetCountdown > 0) {
      const timer = setTimeout(() => setResetCountdown(resetCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resetCountdown]);

  if (!isOpen) return null;

  // 发送注册验证码
  const handleSendRegCode = async () => {
    setRegError('');
    
    // 首先检查用户名格式
    if (regUsername.length < 3) {
      setRegError('用户名至少3个字符');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(regUsername)) {
      setRegError('用户名只能包含字母、数字和下划线');
      return;
    }
    
    // 检查用户名是否已被注册（优先检测）
    setRegLoading(true);
    if (onCheckUsername) {
      const checkResult = await onCheckUsername(regUsername);
      if (checkResult.exists) {
        setRegLoading(false);
        setRegError('用户名已被注册');
        return;
      }
    }
    
    // 邮箱必填校验
    if (!regEmail || !regEmail.includes('@')) {
      setRegLoading(false);
      setRegError('请输入有效的邮箱地址');
      return;
    }
    if (regPassword.length < 6) {
      setRegLoading(false);
      setRegError('密码至少6位');
      return;
    }
    if (regRole === 'teacher' && !regPhone) {
      setRegLoading(false);
      setRegError('老师注册必须填写手机号');
      return;
    }
    if (regRole === 'student' && regStudentMethod === 'code' && !regInviteCode) {
      setRegLoading(false);
      setRegError('请输入注册邀请码');
      return;
    }
    if (regRole === 'student' && regStudentMethod === 'phone' && !regTeacherPhone) {
      setRegLoading(false);
      setRegError('请输入老师手机号');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegLoading(false);
      setRegError('两次输入的密码不一致');
      return;
    }

    const result = await onSendCode?.(regEmail);
    setRegLoading(false);

    if (result?.success) {
      setRegStep(2);
      setRegCountdown(60);
    } else {
      setRegError(result?.message || '发送失败');
    }
  };

  // 完成注册
  const handleCompleteReg = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    
    if (regCode.length !== 6) {
      setRegError('请输入6位验证码');
      return;
    }

    setRegLoading(true);
    try {
      const verifyResult = await onVerifyCode?.(regEmail, regCode);
      
      if (!verifyResult?.success) {
        setRegLoading(false);
        setRegError(verifyResult?.error || '验证码错误');
        return;
      }

      const regResult = await onRegister?.({
        username: regUsername,
        password: regPassword,
        email: regEmail,
        role: regRole,
        phone: regRole === 'teacher' ? regPhone : undefined,
        inviteCode: regRole === 'student' && regStudentMethod === 'code' ? regInviteCode : undefined,
        teacherPhone: regRole === 'student' && regStudentMethod === 'phone' ? regTeacherPhone : undefined,
      });
      setRegLoading(false);

      if (regResult?.success) {
        inRegFlowRef.current = false;
        setSuccessMessage('注册成功！请登录。');
        setMode('login');
        setLoginUsername(regUsername);
        setRegStep(1);
      } else {
        setRegError(regResult?.error || '注册失败');
      }
    } catch (err) {
      console.error('注册异常:', err);
      setRegLoading(false);
      setRegError('注册失败，请重试');
    }
  };

  // 登录处理
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const result = await onLogin(loginUsername, loginPassword);
      setLoginLoading(false);
      if (result.success && result.needSetupPassword) {
        setSetupPasswordUsername(loginUsername);
        setMode('setupPassword');
      } else if (result.success) {
        onClose();
      } else {
        setLoginError(result.error || '用户名或密码错误');
      }
    } catch (err) {
      console.error('登录异常:', err);
      setLoginLoading(false);
      setLoginError('登录失败，请重试');
    }
  };

  // 设置密码处理
  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    if (setupPassword.length < 6) {
      setSetupError('密码至少6位');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setSetupError('两次输入的密码不一致');
      return;
    }
    setSetupLoading(true);
    const result = await onSetupPassword?.(setupPasswordUsername, setupPassword);
    setSetupLoading(false);
    if (result?.success) {
      setSuccessMessage('密码设置成功！请登录。');
      setMode('login');
      setLoginUsername(setupPasswordUsername);
      setSetupPassword('');
      setSetupConfirmPassword('');
    } else {
      setSetupError(result?.error || '设置失败');
    }
  };

  // 发送重置密码验证码
  const handleSendResetCode = async () => {
    if (!resetEmail.includes('@')) {
      setResetError('请输入有效的邮箱地址');
      return;
    }
    setResetError('');
    await onSendCode?.(resetEmail);
    setResetCountdown(60);
  };

  // 重置密码处理
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('两次输入的密码不一致');
      return;
    }
    if (resetNewPassword.length < 6) {
      setResetError('新密码至少6位');
      return;
    }
    setResetLoading(true);
    const result = await onResetPassword?.(resetEmail, resetCode, resetNewPassword);
    setResetLoading(false);
    if (result?.success) {
      setSuccessMessage('密码重置成功！请使用新密码登录。');
      setMode('login');
      setLoginUsername('');
      setResetEmail('');
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } else {
      setResetError(result?.error || '重置失败');
    }
  };

  // 通用输入框样式
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  // 渲染注册表单
  const renderRegisterForm = () => (
    <form onSubmit={regStep === 1 ? (e) => { e.preventDefault(); handleSendRegCode(); } : handleCompleteReg}>
      {regStep === 1 ? (
        <>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-1">创建账号</h2>
            <p className="text-sm text-slate-500">加入我们，开始学习之旅</p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              用户名
            </label>
            <input
              type="text"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              placeholder="3-20位字母、数字或下划线"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              邮箱
            </label>
            <input
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="用于接收验证码和找回密码"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              密码
            </label>
            <input
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              placeholder="至少6位"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              确认密码
            </label>
            <input
              type="password"
              value={regConfirmPassword}
              onChange={(e) => setRegConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              style={inputStyle}
              required
            />
          </div>

          {/* 角色选择 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              选择角色
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { role: 'teacher' as UserRole, label: '老师', icon: BookOpen, color: '#4f46e5' },
                { role: 'student' as UserRole, label: '学生', icon: User, color: '#059669' },
                { role: 'independent' as UserRole, label: '独立用户', icon: UserCircle, color: '#64748b' },
              ].map(opt => (
                <button key={opt.role} type="button" onClick={() => { setRegRole(opt.role); setRegStudentMethod('none'); }}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: '10px', border: regRole === opt.role ? `2px solid ${opt.color}` : '2px solid #e2e8f0',
                    background: regRole === opt.role ? `${opt.color}10` : '#fff', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.2s',
                  }}>
                  <opt.icon size={18} style={{ color: regRole === opt.role ? opt.color : '#94a3b8' }} />
                  <span style={{ fontSize: '12px', fontWeight: regRole === opt.role ? '600' : '400', color: regRole === opt.role ? opt.color : '#64748b' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 老师额外字段：手机号 */}
          {regRole === 'teacher' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#4f46e5', fontWeight: '500' }}>
                <Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />手机号（必填）
              </label>
              <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="学生可通过手机号找到您" style={inputStyle} required />
            </div>
          )}

          {/* 学生额外字段：关联老师 */}
          {regRole === 'student' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#059669', fontWeight: '500' }}>
                关联老师方式
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {[
                  { key: 'code', label: '邀请码' },
                  { key: 'phone', label: '老师手机号' },
                  { key: 'none', label: '暂不关联' },
                ].map(opt => (
                  <button key={opt.key} type="button" onClick={() => setRegStudentMethod(opt.key as any)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '8px', border: regStudentMethod === opt.key ? '2px solid #059669' : '2px solid #e2e8f0',
                      background: regStudentMethod === opt.key ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: '12px',
                      color: regStudentMethod === opt.key ? '#059669' : '#64748b', fontWeight: regStudentMethod === opt.key ? '600' : '400',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {regStudentMethod === 'code' && (
                <input type="text" value={regInviteCode} onChange={e => setRegInviteCode(e.target.value.toUpperCase())}
                  placeholder="输入老师提供的注册邀请码" maxLength={20} style={inputStyle} />
              )}
              {regStudentMethod === 'phone' && (
                <input type="tel" value={regTeacherPhone} onChange={e => setRegTeacherPhone(e.target.value)}
                  placeholder="输入老师的手机号" style={inputStyle} />
              )}
              {regStudentMethod === 'none' && (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>注册后可在设置中绑定老师</p>
              )}
            </div>
          )}

          {regError && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#dc2626'
            }}>
              {regError}
            </div>
          )}

          <button
            type="submit"
            disabled={regLoading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: regLoading ? '#94a3b8' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: regLoading ? 'not-allowed' : 'pointer',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            }}
          >
            {regLoading ? '发送中...' : '注册'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              退出
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                resetAllForms();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              已有账号？立即登录
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRegStep(1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            <ArrowLeft size={16} /> 返回修改信息
          </button>

          <div className="text-center mb-6">
            <div style={{
              width: '56px',
              height: '56px',
              backgroundColor: '#dbeafe',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <Mail size={24} color="#3b82f6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">验证邮箱</h2>
            <p className="text-sm text-slate-500">验证码已发送至</p>
            <p style={{ fontWeight: '600', color: '#3b82f6', marginTop: '4px' }}>{regEmail}</p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              输入验证码
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={regCode}
                onChange={(e) => setRegCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入6位验证码"
                maxLength={6}
                style={{ ...inputStyle, textAlign: 'center', fontSize: '20px', letterSpacing: '8px' }}
                required
              />
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
              验证码5分钟内有效
            </p>
          </div>

          {regError && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#dc2626'
            }}>
              {regError}
            </div>
          )}

          <button
            type="submit"
            disabled={regLoading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: regLoading ? '#94a3b8' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: regLoading ? 'not-allowed' : 'pointer',
              marginBottom: '12px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
            }}
          >
            {regLoading ? '验证中...' : '完成注册'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              退出
            </button>
            <button
              type="button"
              onClick={handleSendRegCode}
              disabled={regCountdown > 0}
              style={{
                background: 'none',
                border: 'none',
                color: regCountdown > 0 ? '#94a3b8' : '#3b82f6',
                fontSize: '14px',
                cursor: regCountdown > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {regCountdown > 0 ? `${regCountdown}秒后可重新发送` : '没收到？重新发送'}
            </button>
          </div>
        </>
      )}
    </form>
  );

  // 渲染登录表单
  const renderLoginForm = () => (
    <form onSubmit={handleLogin}>
      {successMessage && (
        <div style={{
          padding: '14px 16px',
          backgroundColor: '#ecfdf5',
          border: '1px solid #6ee7b7',
          borderRadius: '12px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            backgroundColor: '#10b981',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Check size={14} color="white" />
          </div>
          <span style={{ color: '#065f46', fontSize: '14px', fontWeight: '500' }}>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6ee7b7',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">欢迎回来</h2>
        <p className="text-sm text-slate-500">登录您的账号</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          用户名
        </label>
        <input
          type="text"
          value={loginUsername}
          onChange={(e) => setLoginUsername(e.target.value)}
          placeholder="请输入用户名"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          密码
        </label>
        <input
          type="password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          placeholder="请输入密码"
          style={inputStyle}
          required
        />
      </div>

      {loginError && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#dc2626'
        }}>
          {loginError}
        </div>
      )}

      <button
        type="submit"
        disabled={loginLoading}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: loginLoading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: loginLoading ? 'not-allowed' : 'pointer',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
        }}
      >
        {loginLoading ? '登录中...' : '登录'}
      </button>

      {/* 新用户注册提示 */}
      <div style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
        textAlign: 'center'
      }}>
        <span style={{ color: '#64748b', fontSize: '14px' }}>
          新用户？{' '}
          <button
            type="button"
            onClick={() => {
              setMode('register');
              resetAllForms();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            请注册
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '12px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          退出
        </button>
        <button
          type="button"
          onClick={() => setMode('forgotPassword')}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          忘记密码？
        </button>
      </div>
    </form>
  );

  // 渲染忘记密码表单
  const renderForgotPasswordForm = () => (
    <form onSubmit={handleResetPassword}>
      <button
        type="button"
        onClick={() => {
          setMode('login');
          resetAllForms();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: '14px',
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        <ArrowLeft size={16} /> 返回
      </button>

      <div className="text-center mb-6">
        <div style={{
          width: '56px',
          height: '56px',
          backgroundColor: '#ede9fe',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <KeyRound size={24} color="#8b5cf6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">重置密码</h2>
        <p className="text-sm text-slate-500">通过邮箱验证找回密码</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          邮箱地址
        </label>
        <input
          type="email"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
          placeholder="请输入注册时的邮箱"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          验证码
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="请输入6位验证码"
            maxLength={6}
            style={{ ...inputStyle, flex: 1, textAlign: 'center', fontSize: '16px', letterSpacing: '4px' }}
            required
          />
          <button
            type="button"
            onClick={handleSendResetCode}
            disabled={resetCountdown > 0}
            style={{
              padding: '12px 16px',
              backgroundColor: resetCountdown > 0 ? '#e2e8f0' : '#8b5cf6',
              color: resetCountdown > 0 ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              cursor: resetCountdown > 0 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {resetCountdown > 0 ? `${resetCountdown}s` : '获取验证码'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          新密码
        </label>
        <input
          type="password"
          value={resetNewPassword}
          onChange={(e) => setResetNewPassword(e.target.value)}
          placeholder="至少6位"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          确认新密码
        </label>
        <input
          type="password"
          value={resetConfirmPassword}
          onChange={(e) => setResetConfirmPassword(e.target.value)}
          placeholder="再次输入新密码"
          style={inputStyle}
          required
        />
      </div>

      {resetError && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#dc2626'
        }}>
          {resetError}
        </div>
      )}

      <button
        type="submit"
        disabled={resetLoading}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: resetLoading ? '#94a3b8' : '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: resetLoading ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
        }}
      >
        {resetLoading ? '重置中...' : '重置密码'}
      </button>
    </form>
  );

  // 渲染设置密码表单
  const renderSetupPasswordForm = () => (
    <form onSubmit={handleSetupPassword}>
      <button
        type="button"
        onClick={() => {
          setMode('login');
          resetAllForms();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: '14px',
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        <ArrowLeft size={16} /> 返回
      </button>

      <div className="text-center mb-6">
        <div style={{
          width: '56px',
          height: '56px',
          backgroundColor: '#fef3c7',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <KeyRound size={24} color="#d97706" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">设置新密码</h2>
        <p className="text-sm text-slate-500">您的密码已被管理员重置，请设置新密码</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          用户名
        </label>
        <input
          type="text"
          value={setupPasswordUsername}
          disabled
          style={{ ...inputStyle, backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          新密码
        </label>
        <input
          type="password"
          value={setupPassword}
          onChange={(e) => setSetupPassword(e.target.value)}
          placeholder="请输入新密码（至少6位）"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
          确认密码
        </label>
        <input
          type="password"
          value={setupConfirmPassword}
          onChange={(e) => setSetupConfirmPassword(e.target.value)}
          placeholder="请再次输入新密码"
          style={inputStyle}
          required
        />
      </div>

      {setupError && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#dc2626'
        }}>
          {setupError}
        </div>
      )}

      <button
        type="submit"
        disabled={setupLoading}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: setupLoading ? '#94a3b8' : '#d97706',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: setupLoading ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)',
        }}
      >
        {setupLoading ? '设置中...' : '设置密码'}
      </button>
    </form>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px', padding: '0' }}
        role="dialog"
        aria-modal="true"
        aria-label="登录注册"
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(0,0,0,0.05)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            zIndex: 1,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ padding: '32px 28px' }}>
          {mode === 'register' && renderRegisterForm()}
          {mode === 'login' && renderLoginForm()}
          {mode === 'forgotPassword' && renderForgotPasswordForm()}
          {mode === 'setupPassword' && renderSetupPasswordForm()}
        </div>
      </div>
    </div>
  );
};
