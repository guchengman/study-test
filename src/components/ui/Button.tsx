/**
 * 统一语义色按钮（P-4 / T1）
 *
 * 全局语义色 token：
 * - primary = blue-600 / hover blue-700 —— 常规主操作与确认
 * - success = emerald-600 / hover emerald-700 —— 正向完成动作（提交试卷、确认导入等）
 * - danger  = rose-600 / hover rose-700 —— 删除 / 移除 / 重置密码等危险操作
 * - ghost   = slate 中性 —— 次级 / 取消类操作
 *
 * 设计约束：
 * - `forwardRef` + `...rest` 透传全部原生 button props（onClick / disabled / type / onKeyDown 等）
 * - `loading` 为 true 时显示 Spinner 并强制 disabled，防重复点击；
 *   loading 的判定状态仍由业务侧持有，本组件不维护任何内部 state。
 * - 默认 `type="button"`，避免在表单内被误当作 submit（可显式传 type 覆盖）。
 */
import React, { forwardRef } from 'react';
import { Spinner } from './Spinner';

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 加载中：显示 Spinner 且禁用按钮（防重复点击） */
  loading?: boolean;
}

/** 各变体共享的基础样式（含默认内边距，可通过 className 追加样式） */
const BASE_CLASS =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed';

/** 工厂：根据语义色类名生成一个 forwardRef 按钮组件 */
function createSemanticButton(displayName: string, variantClass: string) {
  const Button = forwardRef<HTMLButtonElement, AppButtonProps>(function SemanticButton(
    { loading = false, disabled, className = '', children, type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`${BASE_CLASS} ${variantClass} ${className}`.trim()}
        {...rest}
      >
        {loading ? <Spinner size="sm" /> : null}
        {children}
      </button>
    );
  });
  Button.displayName = displayName;
  return Button;
}

/** 主操作按钮：blue-600（常规确认 / 主要动作） */
export const PrimaryButton = createSemanticButton(
  'PrimaryButton',
  'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100',
);

/** 成功按钮：emerald-600（仅用于提交 / 确认导入等正向完成动作） */
export const SuccessButton = createSemanticButton(
  'SuccessButton',
  'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100',
);

/** 危险按钮：rose-600（删除 / 移除 / 重置密码等不可逆或高危动作） */
export const DangerButton = createSemanticButton(
  'DangerButton',
  'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-100',
);

/** 中性按钮：slate（次级操作 / 取消 / 返回） */
export const GhostButton = createSemanticButton(
  'GhostButton',
  'bg-slate-100 text-slate-600 hover:bg-slate-200',
);
