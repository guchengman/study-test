import type React from 'react';

/** 登录弹窗家族共享的内联样式（从 LoginModal 提取，P1-8 拆分） */

export const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  color: '#475569',
  fontWeight: '500',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

export const errorBoxStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  marginBottom: '16px',
  fontSize: '13px',
  color: '#dc2626',
};

/** 主行动按钮（primary 色随表单主题：蓝=登录/注册、紫=重置、琥珀=设置、绿=完成注册） */
export const primaryButton = (bg: string, loading: boolean, glow: string): React.CSSProperties => ({
  width: '100%',
  padding: '14px',
  backgroundColor: loading ? '#94a3b8' : bg,
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: loading ? 'not-allowed' : 'pointer',
  marginBottom: '16px',
  boxShadow: `0 2px 8px ${glow}`,
});

export const linkBtnStyle = (color: string, bold = false): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  color,
  fontWeight: bold ? '600' : '400',
  cursor: 'pointer',
  fontSize: '14px',
});

export const backBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  color: '#64748b',
  fontSize: '14px',
  cursor: 'pointer',
  marginBottom: '16px',
};

/** 表单头部圆形图标 */
export const iconCircle = (bg: string): React.CSSProperties => ({
  width: '56px',
  height: '56px',
  backgroundColor: bg,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 12px',
});

export const fieldGap = (mb = '16px'): React.CSSProperties => ({ marginBottom: mb });
