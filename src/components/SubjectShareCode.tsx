import { useState, useEffect } from 'react';
import { Key, Check, Copy, Loader2 } from 'lucide-react';
import { inviteCodeApi } from '../services/api';

export function SubjectShareCode({ subjectId, subjectName, scope = 'all', pending = false }: { subjectId: string; subjectName: string; scope?: 'students' | 'all'; pending?: boolean }) {
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    loadCode();
  }, [subjectId]);

  const loadCode = async () => {
    try {
      setLoading(true);
      const res = await inviteCodeApi.list('subject');
      const codes = res.codes.filter((c: any) => c.subject_id === subjectId);
      if (codes.length > 0) {
        setShareCode(codes[0].code);
        setCodeExpiresAt(codes[0].expires_at);
      } else {
        setShareCode(null);
        setCodeExpiresAt(null);
      }
    } catch {
      setShareCode(null);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    try {
      setLoading(true);
      await inviteCodeApi.create({
        type: 'subject',
        subjectId,
        description: `${subjectName} 科目邀请码`,
        scope: scope,
      });
      await loadCode();
    } catch (e: any) {
      alert('生成邀请码失败: ' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (shareCode) {
      navigator.clipboard.writeText(shareCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (loading && !shareCode) {
    return <p className="text-xs text-slate-400">加载中...</p>;
  }

  // 待创建状态（科目还未同步到后端）
  if (pending) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-600">
        <Loader2 size={12} className="animate-spin" />
        <span>题库创建中，请稍候...</span>
      </div>
    );
  }

  if (!shareCode) {
    return (
      <button
        onClick={generateCode}
        disabled={loading}
        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {loading ? '生成中...' : '生成邀请码'}
      </button>
    );
  }

  const isExpired = codeExpiresAt ? new Date(codeExpiresAt) < new Date() : false;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white rounded-lg px-3 py-1.5 border border-slate-200 flex items-center gap-2">
        <Key size={12} className="text-emerald-500 flex-shrink-0" />
        <code className="text-sm font-mono font-bold text-slate-800 tracking-wider">{shareCode}</code>
        {isExpired && <span className="text-[10px] text-red-500">已过期</span>}
        {!isExpired && codeExpiresAt && (
          <span className="text-[10px] text-slate-400">
            {Math.ceil((new Date(codeExpiresAt).getTime() - Date.now()) / 86400000)}天后过期
          </span>
        )}
      </div>
      <button onClick={copyCode} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="复制">
        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-400" />}
      </button>
      {isExpired && (
        <button onClick={generateCode} disabled={loading} className="text-xs text-emerald-600 hover:underline">
          重新生成
        </button>
      )}
    </div>
  );
}
