import { useEffect, useState, useCallback, useRef } from 'react';

export function useBackPrevention() {
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const handlingRef = useRef(false);

  useEffect(() => {
    window.history.pushState({ __appBack: true }, '', window.location.href);

    const handler = () => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      setShowExitPrompt(true);
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const confirmExit = useCallback(() => {
    setShowExitPrompt(false);
  }, []);

  const cancelExit = useCallback(() => {
    setShowExitPrompt(false);
    // 延迟重置标志，等 forward 触发的 popstate 事件处理完
    setTimeout(() => { handlingRef.current = false; }, 100);
    window.history.forward();
  }, []);

  return { showExitPrompt, confirmExit, cancelExit };
}
