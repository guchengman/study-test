/**
 * VirtualList —— 基于 react-window 的通用虚拟滚动列表（UI 底座组件）
 *
 * 设计原则（P0 性能优化，零交互破坏）：
 *  1) **短列表零改动**：items 数量 < threshold（默认 50）时退回普通 map 渲染，
 *     DOM 结构、滚动行为、样式与虚拟化前保持一致，避免为小题库引入无谓风险。
 *  2) **长列表才窗口化**：达到阈值后用 VariableSizeList 只渲染可视区 + overscan，
 *     千题量级题库不再一次性挂载上千个卡片。
 *  3) **行高自测量**：题目卡片含 Markdown / KaTeX / 图片，高度不可预知，
 *     每行用 ResizeObserver 在 layout 阶段回报真实高度，写入缓存后按 rAF 批量
 *     resetAfterIndex，避免逐行 reset 造成的重复渲染与滚动抖动。
 *  4) **业务逻辑不下沉**：调用方通过 renderItem 原样传入既有卡片 JSX，
 *     本组件只负责「渲染多少、放在哪」，不感知题目结构。
 */
import React from 'react';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';

/** 低于该条目数不做虚拟化，保持原生渲染 */
export const DEFAULT_VIRTUALIZE_THRESHOLD = 50;

export interface VirtualListProps<T> {
  /** 数据源 */
  items: T[];
  /** 单条渲染函数：原样返回既有卡片 JSX 即可（勿在此处重写业务逻辑） */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** React key 生成器，缺省用下标 */
  itemKey?: (item: T, index: number) => React.Key;
  /** 虚拟化生效时的窗口高度（px）——即列表自身滚动容器的高度 */
  viewportHeight: number;
  /** 未虚拟化时的最大高度（px）。不传表示不限高、跟随页面流式滚动 */
  plainMaxHeight?: number;
  /** 行高预估值（px），用于首屏与未测量行 */
  estimatedItemHeight?: number;
  /** 条目间距（px），等价于原 space-y-* */
  gap?: number;
  /** 虚拟化阈值 */
  threshold?: number;
  /** 外层容器 class（边框 / 圆角 / 内边距等，两种模式下都会应用） */
  className?: string;
  /** 可视区外额外渲染的行数 */
  overscanCount?: number;
}

/** 传给行组件的轻量上下文（react-window itemData） */
interface VirtualRowData {
  count: number;
  gap: number;
  render: (index: number) => React.ReactNode;
  measure: (index: number, height: number) => void;
}

/**
 * 虚拟化行：外层 div 承接 react-window 的绝对定位 style，
 * 内层 div 负责真实内容与间距，并把测量结果回报给列表。
 */
const VirtualRow: React.FC<ListChildComponentProps<VirtualRowData>> = ({ index, style, data }) => {
  const { count, gap, render, measure } = data;
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // 无依赖数组：内容每次重渲染后都重新校准高度，保证 Markdown/图片异步撑开时不错位
  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const report = () => measure(index, el.getBoundingClientRect().height);
    report();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <div style={style}>
      <div ref={contentRef} style={index === count - 1 ? undefined : { paddingBottom: gap }}>
        {render(index)}
      </div>
    </div>
  );
};

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    renderItem,
    itemKey,
    viewportHeight,
    plainMaxHeight,
    estimatedItemHeight = 64,
    gap = 0,
    threshold = DEFAULT_VIRTUALIZE_THRESHOLD,
    className,
    overscanCount = 6,
  } = props;

  const count = items.length;
  const virtualized = count >= threshold;

  const listRef = React.useRef<VariableSizeList | null>(null);
  const sizeMap = React.useRef<Map<number, number>>(new Map());
  const pendingIndex = React.useRef<number | null>(null);
  const frameId = React.useRef<number | null>(null);

  // 条目数变化意味着索引→高度的对应关系失效，整体重置缓存
  React.useEffect(() => {
    sizeMap.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [count]);

  // 卸载时清理未执行的 rAF
  React.useEffect(
    () => () => {
      if (frameId.current !== null) cancelAnimationFrame(frameId.current);
    },
    []
  );

  /** 收集行高并按帧批量提交，min(index) 之后的行统一重算偏移 */
  const measure = React.useCallback((index: number, height: number) => {
    const next = Math.max(1, Math.round(height));
    if (sizeMap.current.get(index) === next) return;
    sizeMap.current.set(index, next);

    pendingIndex.current =
      pendingIndex.current === null ? index : Math.min(pendingIndex.current, index);
    if (frameId.current !== null) return;

    frameId.current = requestAnimationFrame(() => {
      frameId.current = null;
      const from = pendingIndex.current ?? 0;
      pendingIndex.current = null;
      listRef.current?.resetAfterIndex(from, true);
    });
  }, []);

  const getItemSize = React.useCallback(
    (index: number) => sizeMap.current.get(index) ?? estimatedItemHeight,
    [estimatedItemHeight]
  );

  // —— 短列表：保持原有的流式渲染 ——
  if (!virtualized) {
    return (
      <div
        className={className}
        style={plainMaxHeight ? { maxHeight: plainMaxHeight, overflowY: 'auto' } : undefined}
      >
        {items.map((item, index) => (
          <div
            key={itemKey ? itemKey(item, index) : index}
            style={index === count - 1 ? undefined : { paddingBottom: gap }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  // —— 长列表：窗口化渲染 ——
  const rowData: VirtualRowData = {
    count,
    gap,
    render: (index) => renderItem(items[index], index),
    measure,
  };

  return (
    <div className={className}>
      <VariableSizeList
        ref={listRef}
        height={viewportHeight}
        width="100%"
        itemCount={count}
        itemSize={getItemSize}
        estimatedItemSize={estimatedItemHeight}
        itemData={rowData}
        itemKey={itemKey ? (index) => itemKey(items[index], index) : undefined}
        overscanCount={overscanCount}
      >
        {VirtualRow}
      </VariableSizeList>
    </div>
  );
}

/**
 * 页面流式长列表（无固定高度容器）虚拟化时的窗口高度：按视口比例取值并跟随 resize。
 * @param ratio 占视口高度比例
 * @param min   下限（px）
 * @param max   上限（px）
 */
export function useVirtualViewportHeight(ratio = 0.8, min = 320, max = 1200): number {
  const compute = React.useCallback(() => {
    if (typeof window === 'undefined') return min;
    return Math.min(max, Math.max(min, Math.round(window.innerHeight * ratio)));
  }, [ratio, min, max]);

  const [height, setHeight] = React.useState<number>(compute);

  React.useEffect(() => {
    const onResize = () => setHeight(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  return height;
}
