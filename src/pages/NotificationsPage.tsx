/**
 * FR-701 通知中心页（路由 /notifications）
 *
 * 功能：
 *  - 通知列表（分页 + 未读/全部切换）
 *  - 单条标记已读 / 全部标记已读
 *  - 类型标签着色 + 时间展示
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Bell, CheckCheck, Check, Inbox } from 'lucide-react';
import { notificationApi, type NotificationItem } from '../services/notificationApi';

const PAGE_SIZE = 20;

const TYPE_META: Record<string, { label: string; cls: string }> = {
  exam_published: { label: '考试发布', cls: 'bg-indigo-100 text-indigo-700' },
  score_ready: { label: '成绩就绪', cls: 'bg-emerald-100 text-emerald-700' },
  storage_alert: { label: '存储告警', cls: 'bg-amber-100 text-amber-700' },
  streak_break: { label: '打卡提醒', cls: 'bg-rose-100 text-rose-700' },
  system: { label: '系统', cls: 'bg-slate-100 text-slate-600' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await notificationApi.list({ page, limit: PAGE_SIZE, unread: unreadOnly });
      setItems(res.notifications);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleMarkRead = async (id: number) => {
    try {
      await notificationApi.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      window.dispatchEvent(new CustomEvent('notifications:refresh'));
    } catch (e: any) {
      setError(e.message || '操作失败');
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationApi.markAllRead();
      window.dispatchEvent(new CustomEvent('notifications:refresh'));
      refresh();
    } catch (e: any) {
      setError(e.message || '操作失败');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Bell size={20} className="text-blue-600" /> 通知中心
        </h1>
        <button
          onClick={handleMarkAll}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <CheckCheck size={14} /> 全部已读
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setUnreadOnly(false); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!unreadOnly ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
        >
          全部
        </button>
        <button
          onClick={() => { setUnreadOnly(true); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${unreadOnly ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
        >
          未读
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
          <Inbox size={32} className="text-slate-300" />
          暂无通知
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          {items.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.system;
            const unread = n.read_at == null;
            return (
              <div
                key={n.id}
                className={`p-4 rounded-xl border flex items-start gap-3 ${unread ? 'bg-white border-blue-200' : 'bg-slate-50 border-slate-100'}`}
              >
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.cls}`}>{meta.label}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${unread ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{n.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{fmtTime(n.created_at)}</p>
                </div>
                {unread && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    className="text-slate-400 hover:text-blue-600 shrink-0"
                    title="标记已读"
                  >
                    <Check size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </motion.div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-slate-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
