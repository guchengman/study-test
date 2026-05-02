import { useState, useEffect } from 'react';

export function VisitCounter() {
  const [count, setCount] = useState<number>(0);
  useEffect(() => {
    fetch('/api/auth/visit').then(r => r.json()).then(d => setCount(d.count || 0)).catch(() => {});
  }, []);
  return <p className="text-slate-300 mt-1">访问次数：{count.toLocaleString()}</p>;
}
