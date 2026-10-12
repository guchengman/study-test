/**
 * FR-206 成绩导出前端 API
 *
 * 端点：/api/exports
 * 特点：异步任务 + 轮询 + Blob 下载（不走 ApiClient JSON 拦截）
 */
import client, { getToken } from './api';

// ─── 类型 ──────────────────────────────────────────────────

export interface ExportJobCreateResponse {
  job_id: number;
  status: 'queued';
}

export interface ExportJobStatus {
  id: number;
  exam_id: number | null;
  scope: 'exam' | 'self';
  status: 'queued' | 'running' | 'done' | 'failed';
  row_count: number | null;
  file_path: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── API ───────────────────────────────────────────────────

export const exportApi = {
  /** POST /api/exports — 创建导出任务 */
  create: (scope: 'exam' | 'self', examId?: number) =>
    client.post<ExportJobCreateResponse>('/exports', {
      scope,
      ...(examId ? { exam_id: examId } : {}),
    }),

  /** GET /api/exports/jobs/:id — 轮询状态 */
  getStatus: (jobId: number) =>
    client.get<ExportJobStatus>(`/exports/jobs/${jobId}`),

  /**
   * 轮询直到 done/failed 或超时。
   * @param jobId 任务 ID
   * @param opts.interval 轮询间隔 ms（默认 1500）
   * @param opts.timeout 超时 ms（默认 60000）
   */
  pollUntilDone: async (
    jobId: number,
    opts: { interval?: number; timeout?: number } = {},
  ): Promise<ExportJobStatus> => {
    const interval = opts.interval ?? 1500;
    const timeout = opts.timeout ?? 60_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const job = await client.get<ExportJobStatus>(`/exports/jobs/${jobId}`);
      if (job.status === 'done' || job.status === 'failed') return job;
      await new Promise((r) => setTimeout(r, interval));
    }
    // 超时，返回最后一次状态
    return client.get<ExportJobStatus>(`/exports/jobs/${jobId}`);
  },

  /**
   * GET /api/exports/jobs/:id/download — 下载 CSV（Blob）。
   * 不走 ApiClient（需原始 response.blob()）。
   */
  downloadBlob: async (jobId: number): Promise<Blob> => {
    const API_BASE = import.meta.env.MODE === 'development'
      ? '/api'
      : (import.meta.env.VITE_API_BASE_URL || '/api');
    const token = getToken();
    const res = await fetch(`${API_BASE}/exports/jobs/${jobId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `下载失败 (${res.status})`);
    }
    return res.blob();
  },

  /** 触发浏览器下载 Blob */
  triggerDownload: (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default exportApi;
