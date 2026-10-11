import React from 'react';
import { Mail, ArrowLeft, Phone, BookOpen, User, UserCircle } from 'lucide-react';
import type { UserRole } from '../../services/api';
import {
  labelStyle, inputStyle, errorBoxStyle, primaryButton, linkBtnStyle, backBtnStyle, iconCircle,
} from './formStyles';

/** 注册表单受控值（状态归属 LoginModal 编排器） */
export interface RegisterValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  code: string;
  role: UserRole;
  phone: string;
  inviteCode: string;
  teacherPhone: string;
  studentMethod: 'code' | 'phone' | 'none';
}

export const initialRegisterValues: RegisterValues = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  code: '',
  role: 'independent',
  phone: '',
  inviteCode: '',
  teacherPhone: '',
  studentMethod: 'none',
};

interface RegisterFormProps {
  values: RegisterValues;
  setValue: <K extends keyof RegisterValues>(key: K, value: RegisterValues[K]) => void;
  step: 1 | 2;
  error: string;
  loading: boolean;
  countdown: number;
  /** 第一步提交/重新发送：校验并发送验证码 */
  onSendCode: () => void;
  /** 第二步提交：携验证码完成注册 */
  onComplete: (e: React.FormEvent) => void;
  /** 第二步返回修改信息 */
  onBack: () => void;
  /** 关闭弹窗 */
  onExit: () => void;
  /** 切换到登录模式 */
  onSwitchToLogin: () => void;
}

/** 注册表单（两步：填写信息 → 邮箱验证码），从 LoginModal 拆出（P1-8） */
export const RegisterForm: React.FC<RegisterFormProps> = ({
  values, setValue, step, error, loading, countdown,
  onSendCode, onComplete, onBack, onExit, onSwitchToLogin,
}) => (
  <form onSubmit={step === 1 ? (e) => { e.preventDefault(); onSendCode(); } : onComplete}>
    {step === 1 ? (
      <>
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">创建账号</h2>
          <p className="text-sm text-slate-500">加入我们，开始学习之旅</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>用户名</label>
          <input
            type="text"
            autoComplete="username"
            value={values.username}
            onChange={(e) => setValue('username', e.target.value)}
            placeholder="3-20位字母、数字或下划线"
            style={inputStyle}
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>邮箱</label>
          <input
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValue('email', e.target.value)}
            placeholder="用于接收验证码和找回密码"
            style={inputStyle}
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>密码</label>
          <input
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => setValue('password', e.target.value)}
            placeholder="至少6位"
            style={inputStyle}
            required
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>确认密码</label>
          <input
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(e) => setValue('confirmPassword', e.target.value)}
            placeholder="再次输入密码"
            style={inputStyle}
            required
          />
        </div>

        {/* 角色选择 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ ...labelStyle, marginBottom: '8px' }}>选择角色</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { role: 'teacher' as UserRole, label: '老师', icon: BookOpen, color: '#4f46e5' },
              { role: 'student' as UserRole, label: '学生', icon: User, color: '#059669' },
              { role: 'independent' as UserRole, label: '独立用户', icon: UserCircle, color: '#64748b' },
            ].map(opt => (
              <button key={opt.role} type="button"
                onClick={() => { setValue('role', opt.role); setValue('studentMethod', 'none'); }}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: '10px',
                  border: values.role === opt.role ? `2px solid ${opt.color}` : '2px solid #e2e8f0',
                  background: values.role === opt.role ? `${opt.color}10` : '#fff', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.2s',
                }}>
                <opt.icon size={18} style={{ color: values.role === opt.role ? opt.color : '#94a3b8' }} />
                <span style={{ fontSize: '12px', fontWeight: values.role === opt.role ? '600' : '400', color: values.role === opt.role ? opt.color : '#64748b' }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 老师额外字段：手机号 */}
        {values.role === 'teacher' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...labelStyle, color: '#4f46e5' }}>
              <Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />手机号（必填）
            </label>
            <input type="tel" autoComplete="tel" value={values.phone}
              onChange={e => setValue('phone', e.target.value)}
              placeholder="学生可通过手机号找到您" style={inputStyle} required />
          </div>
        )}

        {/* 学生额外字段：关联老师 */}
        {values.role === 'student' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...labelStyle, color: '#059669', marginBottom: '8px' }}>关联老师方式</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {[
                { key: 'code', label: '邀请码' },
                { key: 'phone', label: '老师手机号' },
                { key: 'none', label: '暂不关联' },
              ].map(opt => (
                <button key={opt.key} type="button" onClick={() => setValue('studentMethod', opt.key as RegisterValues['studentMethod'])}
                  style={{
                    flex: 1, padding: '6px', borderRadius: '8px',
                    border: values.studentMethod === opt.key ? '2px solid #059669' : '2px solid #e2e8f0',
                    background: values.studentMethod === opt.key ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: '12px',
                    color: values.studentMethod === opt.key ? '#059669' : '#64748b',
                    fontWeight: values.studentMethod === opt.key ? '600' : '400',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {values.studentMethod === 'code' && (
              <input type="text" autoComplete="off" value={values.inviteCode}
                onChange={e => setValue('inviteCode', e.target.value.toUpperCase())}
                placeholder="输入老师提供的注册邀请码" maxLength={20} style={inputStyle} />
            )}
            {values.studentMethod === 'phone' && (
              <input type="tel" autoComplete="tel" value={values.teacherPhone}
                onChange={e => setValue('teacherPhone', e.target.value)}
                placeholder="输入老师的手机号" style={inputStyle} />
            )}
            {values.studentMethod === 'none' && (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>注册后可在设置中绑定老师</p>
            )}
          </div>
        )}

        {error && <div style={errorBoxStyle}>{error}</div>}

        <button type="submit" disabled={loading} style={primaryButton('#3b82f6', loading, 'rgba(59, 130, 246, 0.3)')}>
          {loading ? '发送中...' : '注册'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '16px' }}>
          <button type="button" onClick={onExit} style={linkBtnStyle('#94a3b8')}>退出</button>
          <button type="button" onClick={onSwitchToLogin} style={linkBtnStyle('#3b82f6', true)}>已有账号？立即登录</button>
        </div>
      </>
    ) : (
      <>
        <button type="button" onClick={onBack} style={backBtnStyle}>
          <ArrowLeft size={16} /> 返回修改信息
        </button>

        <div className="text-center mb-6">
          <div style={iconCircle('#dbeafe')}>
            <Mail size={24} color="#3b82f6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-1">验证邮箱</h2>
          <p className="text-sm text-slate-500">验证码已发送至</p>
          <p style={{ fontWeight: '600', color: '#3b82f6', marginTop: '4px' }}>{values.email}</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>输入验证码</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              autoComplete="one-time-code"
              value={values.code}
              onChange={(e) => setValue('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="请输入6位验证码"
              maxLength={6}
              style={{ ...inputStyle, textAlign: 'center', fontSize: '20px', letterSpacing: '8px' }}
              required
            />
          </div>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>验证码5分钟内有效</p>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <button type="submit" disabled={loading}
          style={{ ...primaryButton('#10b981', loading, 'rgba(16, 185, 129, 0.3)'), marginBottom: '12px' }}>
          {loading ? '验证中...' : '完成注册'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '12px' }}>
          <button type="button" onClick={onExit} style={linkBtnStyle('#94a3b8')}>退出</button>
          <button type="button" onClick={onSendCode} disabled={countdown > 0}
            style={linkBtnStyle(countdown > 0 ? '#94a3b8' : '#3b82f6')}>
            {countdown > 0 ? `${countdown}秒后可重新发送` : '没收到？重新发送'}
          </button>
        </div>
      </>
    )}
  </form>
);
