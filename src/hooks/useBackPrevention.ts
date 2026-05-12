import { useEffect, useState, useCallback } from 'react';

export function useBackPrevention() {
  const [showExitPrompt, setShowExitPrompt] = useState(false);

  useEffect(() => {
    let handling = false;
    window.history.pushState({ __appBack: true }, '', window.location.href);

    const handler = () => {
      if (handling) return;
      handling = true;
      setShowExitPrompt(true);
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const confirmExit = useCallback(() => {
    setShowExitPrompt(false);
    // popstate 已经执行了后退导航，什么都不做即退出
  }, []);

  const cancelExit = useCallback(() => {
    setShowExitPrompt(false);
    // 撤销后退：前进回到应用页面
    window.history.forward();
  }, []);

  return { showExitPrompt, confirmExit, cancelExit };
}
