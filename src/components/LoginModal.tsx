import React, { useState, useEffect, useRef } from 'react';
import { X, Check, KeyRound, ArrowLeft } from 'lucide-react';
import type { UserRole } from '../services/api';
import {
  RegisterForm, initialRegisterValues, type RegisterValues,
} from './login/RegisterForm';
import {
  ForgotPasswordForm, initialForgotValues, type ForgotValues,
} from './login/ForgotPasswordForm';
import {
  labelStyle, inputStyle, errorBoxStyle, primaryButton, linkBtnStyle, backBtnStyle, iconCircle,
} from './login/formStyles';

type ModalMode = 'register' | 'login' | 'forgotPassword' | 'setupPassword';

/**
 * P2-10：验证码发送失败的降级提示文案
 * 按服务端状态码区分场景，网络/邮件服务失败时给用户可操作的引导
 */
const sendCodeFailureText = (result: { message?: string; status?: number } | undefined): string => {
  switch (result?.status) {
    case 429: // 限频：服务端话术已含建议，直接透传
    case 400:
      return result?.message || '发送失败，请稍后重试';
    case 502: // EmailJS 发信失败：不吞掉原因，补充可操作引导
      return `${result?.message || '邮件服务暂时不可用'}；若持续失败，请稍后重试或联系管理员`;
    case 503:
      return result?.message || '邮件验证服务未启用，请联系管理员';
    case 0: // 网络连接失败（api.ts 统一话术）
      return '网络连接失败，请检查网络后重试';
    default:
      return result?.message || '邮件发送失败，请稍后重试';
  }
};

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<{ success: boolean; needSetupPassword?: boolean; error?: string }>;
  onRegister: (data: { username: string; password: string; email: string; role?: UserRole; phone?: string; inviteCode?: string; teacherPhone?: string; emailCode?: string; }) => Promise<{ success: boolean; error?: string }>;
  onChangePassword?: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  onSendCode?: (email: string, purpose: 'register' | 'reset') => Promise<{ success: boolean; message: string; status?: number }>;
  onResetPassword?: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  onCheckUsername?: (username: string) => Promise<{ exists: boolean }>;
  onSetupPassword?: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  isAdmin?: boolean;
  currentUser?: string | null;
}

/**
 * 登录/注册/忘记密码/设置密码弹窗编排器（P1-8 拆分）
 * 表单 UI 与受控值类型见 ./login/RegisterForm 与 ./login/ForgotPasswordForm
 */
export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  onSendCode,
  onResetPassword,
  onCheckUsername,
  onSetupPassword,
}) => {
  // 模式：register=注册, login=登录, forgotPassword=忘记密码, setupPassword=设置密码
  const [mode, setMode] = useState<ModalMode>('register');

  // 注册状态（受控值对象归 RegisterForm，状态留在此处编排）
  const [reg, setReg] = useState<RegisterValues>(initialRegisterValues);
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
  const [reset, setReset] = useState<ForgotValues>(initialForgotValues);
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

  const setRegField = <K extends keyof RegisterValues>(key: K, value: RegisterValues[K]) =>
    setReg(prev => ({ ...prev, [key]: value }));
  const setResetField = <K extends keyof ForgotValues>(key: K, value: ForgotValues[K]) =>
    setReset(prev => ({ ...prev, [key]: value }));

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
    setReg({ ...initialRegisterValues });
    setRegStep(1);
    setRegError('');
    setRegCountdown(0);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
    setReset({ ...initialForgotValues });
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

  // 发送注册验证码（第一步提交 / 第二步重发共用）
  const handleSendRegCode = async () => {
    setRegError('');

    // 首先检查用户名格式
    if (reg.username.length < 3) {
      setRegError('用户名至少3个字符');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(reg.username)) {
      setRegError('用户名只能包含字母、数字和下划线');
      return;
    }

    // 检查用户名是否已被注册（优先检测）
    setRegLoading(true);
    if (onCheckUsername) {
      const checkResult = await onCheckUsername(reg.username);
      if (checkResult.exists) {
        setRegLoading(false);
        setRegError('用户名已被注册');
        return;
      }
    }

    // 邮箱必填校验
    if (!reg.email || !reg.email.includes('@')) {
      setRegLoading(false);
      setRegError('请输入有效的邮箱地址');
      return;
    }
    if (reg.password.length < 6) {
      setRegLoading(false);
      setRegError('密码至少6位');
      return;
    }
    if (reg.role === 'teacher' && !reg.phone) {
      setRegLoading(false);
      setRegError('老师注册必须填写手机号');
      return;
    }
    if (reg.role === 'student' && reg.studentMethod === 'code' && !reg.inviteCode) {
      setRegLoading(false);
      setRegError('请输入注册邀请码');
      return;
    }
    if (reg.role === 'student' && reg.studentMethod === 'phone' && !reg.teacherPhone) {
      setRegLoading(false);
      setRegError('请输入老师手机号');
      return;
    }
    if (reg.password !== reg.confirmPassword) {
      setRegLoading(false);
      setRegError('两次输入的密码不一致');
      return;
    }

    const result = await onSendCode?.(reg.email, 'register');
    setRegLoading(false);

    if (result?.success) {
      setRegStep(2);
      setRegCountdown(60);
    } else {
      setRegError(sendCodeFailureText(result));
    }
  };

  // 完成注册
  const handleCompleteReg = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (reg.code.length !== 6) {
      setRegError('请输入6位验证码');
      return;
    }

    setRegLoading(true);
    try {
      // 验证码随注册提交，由服务端校验并消费（一次性）
      const regResult = await onRegister?.({
        username: reg.username,
        password: reg.password,
        email: reg.email,
        role: reg.role,
        phone: reg.role === 'teacher' ? reg.phone : undefined,
        inviteCode: reg.role === 'student' && reg.studentMethod === 'code' ? reg.inviteCode : undefined,
        teacherPhone: reg.role === 'student' && reg.studentMethod === 'phone' ? reg.teacherPhone : undefined,
        emailCode: reg.code,
      });
      setRegLoading(false);

      if (regResult?.success) {
        inRegFlowRef.current = false;
        setSuccessMessage('注册成功！请登录。');
        setMode('login');
        setLoginUsername(reg.username);
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
    if (!reset.email.includes('@')) {
      setResetError('请输入有效的邮箱地址');
      return;
    }
    setResetError('');
    const result = await onSendCode?.(reset.email, 'reset');
    if (result?.success) {
      setResetCountdown(60);
      setResetError('');
    } else {
      setResetError(sendCodeFailureText(result));
    }
  };

  // 重置密码处理
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (reset.newPassword !== reset.confirmPassword) {
      setResetError('两次输入的密码不一致');
      return;
    }
    if (reset.newPassword.length < 6) {
      setResetError('新密码至少6位');
      return;
    }
    setResetLoading(true);
    const result = await onResetPassword?.(reset.email, reset.code, reset.newPassword);
    setResetLoading(false);
    if (result?.success) {
      setSuccessMessage('密码重置成功！请使用新密码登录。');
      setMode('login');
      setLoginUsername('');
      setReset({ ...initialForgotValues });
    } else {
      setResetError(result?.error || '重置失败');
    }
  };

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
        <label style={labelStyle}>用户名</label>
        <input
          type="text"
          autoComplete="username"
          value={loginUsername}
          onChange={(e) => setLoginUsername(e.target.value)}
          placeholder="请输入用户名"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>密码</label>
        <input
          type="password"
          autoComplete="current-password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          placeholder="请输入密码"
          style={inputStyle}
          required
        />
      </div>

      {loginError && <div style={errorBoxStyle}>{loginError}</div>}

      <button type="submit" disabled={loginLoading} style={primaryButton('#3b82f6', loginLoading, 'rgba(59, 130, 246, 0.3)')}>
        {loginLoading ? '登录中...' : '登录'}
      </button>

      {/* 新用户注册提示 */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
        <span style={{ color: '#64748b', fontSize: '14px' }}>
          新用户？{' '}
          <button type="button" onClick={() => { setMode('register'); resetAllForms(); }} style={linkBtnStyle('#3b82f6', true)}>
            请注册
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '12px' }}>
        <button type="button" onClick={onClose} style={linkBtnStyle('#94a3b8')}>退出</button>
        <button type="button" onClick={() => setMode('forgotPassword')} style={linkBtnStyle('#64748b')}>忘记密码？</button>
      </div>
    </form>
  );

  // 渲染设置密码表单
  const renderSetupPasswordForm = () => (
    <form onSubmit={handleSetupPassword}>
      <button type="button" onClick={() => { setMode('login'); resetAllForms(); }} style={backBtnStyle}>
        <ArrowLeft size={16} /> 返回
      </button>

      <div className="text-center mb-6">
        <div style={iconCircle('#fef3c7')}>
          <KeyRound size={24} color="#d97706" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">设置新密码</h2>
        <p className="text-sm text-slate-500">您的密码已被管理员重置，请设置新密码</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>用户名</label>
        <input
          type="text"
          value={setupPasswordUsername}
          disabled
          style={{ ...inputStyle, backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>新密码</label>
        <input
          type="password"
          autoComplete="new-password"
          value={setupPassword}
          onChange={(e) => setSetupPassword(e.target.value)}
          placeholder="请输入新密码（至少6位）"
          style={inputStyle}
          required
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>确认密码</label>
        <input
          type="password"
          autoComplete="new-password"
          value={setupConfirmPassword}
          onChange={(e) => setSetupConfirmPassword(e.target.value)}
          placeholder="请再次输入新密码"
          style={inputStyle}
          required
        />
      </div>

      {setupError && <div style={errorBoxStyle}>{setupError}</div>}

      <button type="submit" disabled={setupLoading} style={primaryButton('#d97706', setupLoading, 'rgba(217, 119, 6, 0.3)')}>
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
          {mode === 'register' && (
            <RegisterForm
              values={reg}
              setValue={setRegField}
              step={regStep}
              error={regError}
              loading={regLoading}
              countdown={regCountdown}
              onSendCode={handleSendRegCode}
              onComplete={handleCompleteReg}
              onBack={() => setRegStep(1)}
              onExit={onClose}
              onSwitchToLogin={() => { setMode('login'); resetAllForms(); }}
            />
          )}
          {mode === 'login' && renderLoginForm()}
          {mode === 'forgotPassword' && (
            <ForgotPasswordForm
              values={reset}
              setValue={setResetField}
              error={resetError}
              loading={resetLoading}
              countdown={resetCountdown}
              onSendCode={handleSendResetCode}
              onSubmit={handleResetPassword}
              onBack={() => { setMode('login'); resetAllForms(); }}
            />
          )}
          {mode === 'setupPassword' && renderSetupPasswordForm()}
        </div>
      </div>
    </div>
  );
};
