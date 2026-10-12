/**
 * FR-701 顶栏通知铃铛：未读角标 + 点击进入通知中心。
 *
 * 自管理状态：挂载后拉取未读数，之后每 60s 轮询一次；监听自定义事件
 * 'notifications:refresh' 以便其它页面在标已读后即时刷新角标。
 * 仅在已登录时渲染（依赖 localStorage token）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationApi } from '../services/notificationApi';
import { getToken } from '../services/api';

const POLL_MS = 60_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [loggedIn, setLoggedIn] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await notificationApi.unreadCount();
      setCount(res.count);
    } catch {
      /* 静默：角标拉取失败不影响主界面 */
    }
  }, []);

  useEffect(() => {
    setLoggedIn(!!getToken());
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onRefresh = () => refresh();
    window.addEventListener('notifications:refresh', onRefresh);
    window.addEventListener('auth:login', onRefresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('notifications:refresh', onRefresh);
      window.removeEventListener('auth:login', onRefresh);
    };
  }, [refresh]);

  if (!loggedIn) return null;

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
      title="通知中心"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
