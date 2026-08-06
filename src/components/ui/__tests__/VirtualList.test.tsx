/**
 * VirtualList 组件测试（P0 三件套 —— 长列表虚拟滚动）
 *
 * 覆盖点：
 *  1) count < threshold（默认 50）→ 退回原生 map 渲染，全部条目在 DOM 中（零改动保障）；
 *  2) count >= threshold → 走 react-window VariableSizeList，只渲染可视区 + overscan 子集；
 *  3) renderItem 原样透传业务 JSX，入参 (item, index) 正确；
 *  4) gap 间距语义（最后一项不加 paddingBottom）；
 *  5) useVirtualViewportHeight 的比例计算与 resize 跟随、上下限钳制。
 *
 * jsdom 说明：
 *  - 无布局引擎，getBoundingClientRect 恒为 0，会让 VariableSizeList 认为每行高 1px 从而
 *    "全量渲染"，掩盖虚拟化行为。故此处 stub 出固定行高，让窗口计算可验证。
 *  - ResizeObserver 桩见 vitest.setup.ts。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, act, renderHook, cleanup } from '@testing-library/react';
import { VirtualList, DEFAULT_VIRTUALIZE_THRESHOLD, useVirtualViewportHeight } from '../VirtualList';

/** 每行的模拟真实高度（px） */
const ROW_HEIGHT = 100;
/** 虚拟化时的窗口高度（px）→ 理论可视 3 行 */
const VIEWPORT = 300;

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeAll(() => {
  // jsdom 无布局：为所有元素提供确定性高度，令行高测量链路可被断言
  HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: ROW_HEIGHT,
      width: 500,
      height: ROW_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

afterEach(() => {
  cleanup();
});

/** 造 n 条形如 { id, label } 的数据 */
function makeItems(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `q-${i}`, label: `题目 ${i}` }));
}

/** 冲刷 rAF（measure 批量提交）与随后的重渲染 */
async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

function renderList(count: number, extra: Record<string, unknown> = {}) {
  const items = makeItems(count);
  const renderItem = vi.fn((item: { id: string; label: string }, index: number) => (
    <div data-testid="row" data-index={index}>
      {item.label}
    </div>
  ));
  const utils = render(
    <VirtualList
      items={items}
      renderItem={renderItem}
      itemKey={(item) => item.id}
      viewportHeight={VIEWPORT}
      estimatedItemHeight={ROW_HEIGHT}
      overscanCount={2}
      {...extra}
    />
  );
  return { items, renderItem, ...utils };
}

describe('VirtualList —— 短列表（< 阈值）保持原生渲染', () => {
  it('30 条时全部 30 个卡片都在 DOM 中，且无虚拟化容器', async () => {
    const { renderItem } = renderList(30);
    await flushFrames();

    const rows = screen.getAllByTestId('row');
    expect(rows).toHaveLength(30);
    expect(screen.getByText('题目 0')).toBeTruthy();
    expect(screen.getByText('题目 29')).toBeTruthy();
    expect(renderItem).toHaveBeenCalledTimes(30);
  });

  it('renderItem 入参 (item, index) 一一对应', async () => {
    const { renderItem, items } = renderList(30);
    await flushFrames();

    expect(renderItem).toHaveBeenNthCalledWith(1, items[0], 0);
    expect(renderItem).toHaveBeenNthCalledWith(30, items[29], 29);
  });

  it('gap 转成 paddingBottom，最后一项不加', async () => {
    renderList(30, { gap: 12 });
    await flushFrames();

    const rows = screen.getAllByTestId('row');
    const firstWrapper = rows[0].parentElement as HTMLElement;
    const lastWrapper = rows[29].parentElement as HTMLElement;
    expect(firstWrapper.style.paddingBottom).toBe('12px');
    expect(lastWrapper.style.paddingBottom).toBe('');
  });

  it('阈值边界：49 条不虚拟化（全渲染）', async () => {
    renderList(DEFAULT_VIRTUALIZE_THRESHOLD - 1);
    await flushFrames();
    expect(screen.getAllByTestId('row')).toHaveLength(DEFAULT_VIRTUALIZE_THRESHOLD - 1);
  });
});

describe('VirtualList —— 长列表（>= 阈值）窗口化渲染', () => {
  it('80 条时只渲染可视区 + overscan 子集，而非全部 80 个', async () => {
    renderList(80);
    await flushFrames();

    const rows = screen.getAllByTestId('row');
    // 可视区 300px / 行高 100px ≈ 3 行，叠加 overscan(2) 后应远小于 80
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(80);
    expect(rows.length).toBeLessThanOrEqual(12);
  });

  it('首屏可找到靠前条目的文本，远端条目未挂载', async () => {
    renderList(80);
    await flushFrames();

    expect(screen.getByText('题目 0')).toBeTruthy();
    expect(screen.queryByText('题目 79')).toBeNull();
  });

  it('阈值边界：50 条即进入虚拟化', async () => {
    renderList(DEFAULT_VIRTUALIZE_THRESHOLD);
    await flushFrames();
    expect(screen.getAllByTestId('row').length).toBeLessThan(DEFAULT_VIRTUALIZE_THRESHOLD);
  });

  it('滚动后渲染窗口向后推移（远端条目按需挂载）', async () => {
    const { container } = renderList(80);
    await flushFrames();

    // react-window 的滚动容器 = VirtualList 外层 div 的第一个子元素
    const scroller = (container.firstChild as HTMLElement).firstElementChild as HTMLElement;
    expect(scroller).toBeTruthy();

    // jsdom 无布局：scrollTop / scrollHeight / clientHeight 恒为 0 且不可写，
    // 这里在实例上覆写，让 react-window 的 onScroll 能读到真实的滚动位移。
    const stubScrollMetrics = (offset: number) => {
      Object.defineProperty(scroller, 'scrollTop', { value: offset, configurable: true });
      Object.defineProperty(scroller, 'clientHeight', { value: VIEWPORT, configurable: true });
      Object.defineProperty(scroller, 'scrollHeight', {
        value: ROW_HEIGHT * 80,
        configurable: true,
      });
    };

    await act(async () => {
      stubScrollMetrics(ROW_HEIGHT * 40);
      scroller.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 32));
    });

    expect(screen.queryByText('题目 0')).toBeNull();
    expect(screen.getByText('题目 40')).toBeTruthy();
  });

  it('虚拟化模式下 className 仍应用在外层容器', async () => {
    const { container } = renderList(80, { className: 'exam-list' });
    await flushFrames();
    expect((container.firstChild as HTMLElement).className).toBe('exam-list');
  });
});

describe('useVirtualViewportHeight', () => {
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      writable: true,
      configurable: true,
    });
  });

  function setInnerHeight(value: number) {
    Object.defineProperty(window, 'innerHeight', {
      value,
      writable: true,
      configurable: true,
    });
  }

  it('按比例计算视口高度', () => {
    setInnerHeight(1000);
    const { result } = renderHook(() => useVirtualViewportHeight(0.8, 320, 1200));
    expect(result.current).toBe(800);
  });

  it('钳制在 [min, max] 区间内', () => {
    setInnerHeight(100);
    const { result: low } = renderHook(() => useVirtualViewportHeight(0.8, 320, 1200));
    expect(low.current).toBe(320);

    setInnerHeight(5000);
    const { result: high } = renderHook(() => useVirtualViewportHeight(0.8, 320, 1200));
    expect(high.current).toBe(1200);
  });

  it('resize 后跟随更新', async () => {
    setInnerHeight(1000);
    const { result } = renderHook(() => useVirtualViewportHeight(0.5, 100, 1200));
    expect(result.current).toBe(500);

    await act(async () => {
      setInnerHeight(600);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(300);
  });
});
