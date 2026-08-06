import '@testing-library/jest-dom';

/**
 * jsdom 不实现 ResizeObserver，而 VirtualList 的行高自测量依赖它。
 * 这里补一个最小桩：observe 时立即回调一次（模拟首帧上报），其余为空操作。
 * 不参与真实高度测量（jsdom 无布局引擎，高度恒为 0），仅保证组件不因缺 API 崩溃。
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      // 同步回调一次，模拟浏览器首次 observe 时的初始上报
      this.callback([{ target } as ResizeObserverEntry], this);
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
