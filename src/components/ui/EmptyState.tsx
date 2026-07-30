/**
 * 统一空状态组件（P-9 / T1）
 *
 * 收敛全站零散的「纯文字 py-4 / py-6 / 图标卡片」空状态为一种形态：
 * 统一间距 `py-8 text-center text-slate-400`，可选图标 / 描述 / 行动点。
 * 纯展示组件，无内部 state。
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** 可选图标（lucide 节点，如 <Database size={40} />），统一渲染为灰阶 */
  icon?: ReactNode;
  /** 空状态主文案 */
  title: string;
  /** 可选的辅助描述 */
  description?: string;
  /** 可选的行动点（按钮等 ReactNode），居中排列 */
  action?: ReactNode;
  /** 追加到容器的类名 */
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`py-8 text-center text-slate-400 ${className}`.trim()}>
      {icon ? <div className="flex justify-center mb-3 text-slate-300">{icon}</div> : null}
      <p className="text-sm font-bold text-slate-500">{title}</p>
      {description ? <p className="text-xs text-slate-400 mt-1">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
