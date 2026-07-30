/**
 * 统一加载指示器（P-5 / T1）
 *
 * 基于 lucide `Loader2` 的纯展示组件：**无任何内部 state**，
 * loading 的判定条件（如 `submitting` / `isLoading`）一律保留在业务侧。
 *
 * 三种标准用法：
 * 1. 行内：`<Spinner size="sm" />`（跟随父级 currentColor）
 * 2. 按钮内：`<button disabled={loading}>{loading && <Spinner size="sm" />}提交</button>`
 * 3. 全屏遮罩：`<SpinnerOverlay text="正在加载..." />`
 */
import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

/** size 语义 → 像素值映射（sm=16 对应旧版 w-4 h-4 圆点 spinner） */
const SIZE_MAP: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

export interface SpinnerProps {
  /** 尺寸档位，默认 md（24px） */
  size?: SpinnerSize;
  /** 追加的类名（如 text-blue-500 控制颜色，颜色默认跟随 currentColor） */
  className?: string;
}

/** 纯展示 spinner，无内部状态。 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <Loader2
      size={SIZE_MAP[size]}
      className={`animate-spin ${className}`.trim()}
      aria-label="加载中"
    />
  );
}

export interface SpinnerOverlayProps {
  /** 遮罩中央的可选文案 */
  text?: string;
  /** 尺寸档位，默认 lg（32px） */
  size?: SpinnerSize;
  /** 追加到遮罩容器的类名 */
  className?: string;
}

/** 全屏遮罩型 spinner：居中 + 可选文案。同样无内部状态，是否渲染由业务侧条件控制。 */
export function SpinnerOverlay({ text, size = 'lg', className = '' }: SpinnerOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-[1001] flex flex-col items-center justify-center gap-3 bg-slate-900/60 backdrop-blur-sm ${className}`.trim()}
      role="status"
    >
      <Spinner size={size} className="text-white" />
      {text ? <p className="text-white text-sm font-medium">{text}</p> : null}
    </div>
  );
}
