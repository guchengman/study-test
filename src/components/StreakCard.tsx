/**
 * FR-501 Streak 连续打卡卡片：火焰图标 + 当前连续天数 + 补签按钮（条件禁用）。
 *
 * 自管理状态：挂载后拉取本人 streak；补签成功后即时刷新。
 * 仅在已登录时渲染（依赖 localStorage token）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Flame, Loader2, CheckCircle2 } from 'lucide-react';
import { streakApi, type StreakStatus } from '../services/streakApi';
import { getToken } from '../services/api';

export function StreakCard() {
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const res = await streakApi.get();
      setStreak(res.streak);
    } catch {
      /* 静默：卡片加载失败不影响主界面 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onMakeup = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await streakApi.makeup();
      setStreak(res.streak);
      setMsg('补签成功，连续打卡已延续！');
    } catch (e: any) {
      setMsg(e.message || '补签失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> 加载打卡状态…
      </div>
    );
  }

  if (!streak) return null;

  const canMakeup = streak.can_makeup && !busy;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
      <div
        className={`flex items-center justify-center w-14 h-14 rounded-full shrink-0 ${
          streak.current > 0 ? 'bg-orange-50 text-orange-500' : 'bg-slate-50 text-slate-300'
        }`}
      >
        <Flame size={28} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-800">{streak.current}</span>
          <span className="text-sm text-slate-500">天连续</span>
          {streak.active_today && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 size={13} /> 今日已打卡
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          最长 {streak.longest} 天 · 补签卡 {streak.makeup_cards} 张
        </div>
        {msg && <div className="text-xs text-blue-600 mt-1">{msg}</div>}
      </div>

      <button
        onClick={onMakeup}
        disabled={!canMakeup}
        title={streak.can_makeup ? '用一张补签卡延续连续' : '仅当昨日活跃、今日缺席时可补签'}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition-colors ${
          canMakeup
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
        }`}
      >
        {busy ? '补签中…' : '补签'}
      </button>
    </div>
  );
}
