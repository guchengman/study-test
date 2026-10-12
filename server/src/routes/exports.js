/**
 * FR-206 成绩导出路由。
 *
 * 端点：
 *   POST   /api/exports              — 创建导出任务（scope='exam' 需 owner，scope='self' 需登录）
 *   GET    /api/exports/jobs         — 当前用户最近 jobs
 *   GET    /api/exports/jobs/:id     — 查询 job 状态（前端轮询）
 *   GET    /api/exports/jobs/:id/download — 下载 CSV（仅 owner/requester、status=done）
 *
 * 快速路径：POST 创建后同步尝试 processJob；若失败或超时由后台调度器兜底。
 */
import { Router } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { createExportJob, getJobStatus, listJobs, processJob, EXPORTS_DIR } from '../utils/exportService.js';
import log from '../utils/logger.js';

const router = Router();

/** owner 判定（与 exams.js 同口径） */
function isOwner(exam, userId, role) {
  return role === 'admin' || role === 'teacher' || exam.created_by === userId;
}

// ─── POST /api/exports ─────────────────────────────────────

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { scope, exam_id } = req.body;

    if (!scope || !['exam', 'self'].includes(scope)) {
      return res.status(400).json({ error: 'scope 必须为 exam 或 self' });
    }

    let examId = null;
    if (scope === 'exam') {
      if (!exam_id) return res.status(400).json({ error: 'scope=exam 时 exam_id 必填' });
      examId = Number(exam_id);
      // 鉴权：owner 才能导出本场
      const [examRows] = await pool.execute('SELECT created_by FROM exams WHERE id = ?', [examId]);
      if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
      if (!isOwner(examRows[0], req.user.id, req.user.role)) {
        return res.status(403).json({ error: '无权导出该考试成绩' });
      }
    }

    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    const jobId = await createExportJob(pool, {
      requested_by: req.user.id,
      org_id: orgId,
      exam_id: examId,
      scope,
    });

    // 快速路径：立即尝试处理（大多数场景数据量小、ms 级完成）
    // 不阻塞响应——fire-and-forget，由 scheduler 兜底
    processJob(pool, jobId).catch((err) => {
      log.warn({ msg: 'export_fast_path_error', jobId, err: err.message }, '导出快速路径异常（调度器兜底）');
    });

    res.status(201).json({ job_id: jobId, status: 'queued' });
  } catch (err) {
    log.error('创建导出任务错误:', err);
    res.status(500).json({ error: '创建导出任务失败' });
  }
});

// ─── GET /api/exports/jobs ─────────────────────────────────

router.get('/jobs', authMiddleware, async (req, res) => {
  try {
    const jobs = await listJobs(pool, req.user.id);
    res.json({ jobs });
  } catch (err) {
    log.error('获取导出任务列表错误:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// ─── GET /api/exports/jobs/:id ─────────────────────────────

router.get('/jobs/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const job = await getJobStatus(pool, jobId);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    if (job.requested_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权查看该任务' });
    }
    res.json(job);
  } catch (err) {
    log.error('查询导出任务状态错误:', err);
    res.status(500).json({ error: '查询任务状态失败' });
  }
});

// ─── GET /api/exports/jobs/:id/download ────────────────────

router.get('/jobs/:id(\\d+)/download', authMiddleware, async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const job = await getJobStatus(pool, jobId);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    if (job.requested_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权下载该文件' });
    }
    if (job.status !== 'done') {
      return res.status(409).json({ error: `任务尚未完成（当前: ${job.status}）` });
    }

    const filePath = path.resolve(EXPORTS_DIR, `export_${jobId}.csv`);
    if (!existsSync(filePath)) {
      return res.status(410).json({ error: '文件已过期或删除' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="export_${jobId}.csv"`);
    res.sendFile(filePath);
  } catch (err) {
    log.error('下载导出文件错误:', err);
    res.status(500).json({ error: '下载失败' });
  }
});

export default router;
