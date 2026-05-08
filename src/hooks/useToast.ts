import { useState, useEffect, useCallback } from 'react';

export function useToast() {
  const [showToast, setShowToast] = useState<string | null>(null);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return { showToast, setShowToast };
}
