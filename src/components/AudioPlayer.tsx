/**
 * FR-105 听力题音频播放器：
 * 浏览器发起的 <audio src> GET 带不上 Authorization 头会 401，故用带鉴权的 fetch→blob→objectURL 渲染。
 * 不放松 /api/uploads 静态鉴权；URL 不含 token。卸载时 revokeObjectURL。
 */
import { useEffect, useRef, useState } from 'react';
import { mediaApi } from '../services/api';

export interface AudioPlayerProps {
  src: string; // 相对路径 /api/uploads/...
}

type Status = 'loading' | 'ready' | 'error';

export function AudioPlayer({ src }: AudioPlayerProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setObjectUrl(null);
    mediaApi
      .fetchBlob(src)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [src]);

  if (status === 'loading') {
    return <div className="text-xs text-slate-400 py-2">音频加载中…</div>;
  }
  if (status === 'error' || !objectUrl) {
    return <div className="text-xs text-rose-500 py-2">音频加载失败，请刷新重试</div>;
  }
  return (
    <audio
      controls
      preload="metadata"
      src={objectUrl}
      data-testid="audio-player"
      className="w-full h-10"
      aria-label="听力音频"
    />
  );
}
