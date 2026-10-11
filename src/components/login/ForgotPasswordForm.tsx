import React from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import {
  labelStyle, inputStyle, errorBoxStyle, primaryButton, backBtnStyle, iconCircle,
} from './formStyles';

/** 忘记密码表单受控值 */
export interface ForgotValues {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}

export const initialForgotValues: ForgotValues = {
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: '',
};

interface ForgotPasswordFormProps {
  values: ForgotValues;
  setValue: <K extends keyof ForgotValues>(key: K, value: ForgotValues[K]) => void;
  error: string;
  loading: boolean;
  countdown: number;
  onSendCode: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

/** 忘记密码/重置密码表单，从 LoginModal 拆出（P1-8） */
export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  values, setValue, error, loading, countdown, onSendCode, onSubmit, onBack,
}) => (
  <form onSubmit={onSubmit}>
    <button type="button" onClick={onBack} style={backBtnStyle}>
      <ArrowLeft size={16} /> 返回
    </button>

    <div className="text-center mb-6">
      <div style={iconCircle('#ede9fe')}>
        <KeyRound size={24} color="#8b5cf6" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">重置密码</h2>
      <p className="text-sm text-slate-500">通过邮箱验证找回密码</p>
    </div>

    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>邮箱地址</label>
      <input
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => setValue('email', e.target.value)}
        placeholder="请输入注册时的邮箱"
        style={inputStyle}
        required
      />
    </div>

    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>验证码</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          autoComplete="one-time-code"
          value={values.code}
          onChange={(e) => setValue('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="请输入6位验证码"
          maxLength={6}
          style={{ ...inputStyle, flex: 1, textAlign: 'center', fontSize: '16px', letterSpacing: '4px' }}
          required
        />
        <button
          type="button"
          onClick={onSendCode}
          disabled={countdown > 0}
          style={{
            padding: '12px 16px',
            backgroundColor: countdown > 0 ? '#e2e8f0' : '#8b5cf6',
            color: countdown > 0 ? '#94a3b8' : 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            cursor: countdown > 0 ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {countdown > 0 ? `${countdown}s` : '获取验证码'}
        </button>
      </div>
    </div>

    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>新密码</label>
      <input
        type="password"
        autoComplete="new-password"
        value={values.newPassword}
        onChange={(e) => setValue('newPassword', e.target.value)}
        placeholder="至少6位"
        style={inputStyle}
        required
      />
    </div>

    <div style={{ marginBottom: '20px' }}>
      <label style={labelStyle}>确认新密码</label>
      <input
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(e) => setValue('confirmPassword', e.target.value)}
        placeholder="再次输入新密码"
        style={inputStyle}
        required
      />
    </div>

    {error && <div style={errorBoxStyle}>{error}</div>}

    <button type="submit" disabled={loading} style={primaryButton('#8b5cf6', loading, 'rgba(139, 92, 246, 0.3)')}>
      {loading ? '重置中...' : '重置密码'}
    </button>
  </form>
);
