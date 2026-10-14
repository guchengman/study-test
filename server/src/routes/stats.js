/**
 * FR-301/302 学情/考情看板 API 路由。
 *
 * 端点：
 *   GET  /me/trend        — 本人某指标日趋势（?days=30&metric=practiced|correct|time_spent|exam_score）
 *   GET  /me/mastery      — 本人标签掌握度雷达（FR-108 标签维度）
 *   GET  /exam/:id/analysis — 深度考情：得分分布 + 区分度 + 诱答（owner；n<minSample 标注样本不足）
 *   GET  /class/compare   — 班级横向（teacher/admin；admin 可 ?teacher_id=）
 *   POST /admin/aggregate — 手动触发某业务日聚合（仅 platform admin；运维/联调用）
 */
import { Router } from 'express';
import pool from '../db.js';
import { authWithAuthority, adminMiddleware } from '../middleware/auth.js';
import { canManageExam } from '../utils/authority.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import {
  getTrend, getMastery, getExamAnalysisDeep, getClassCompare, aggregateForDate, dateStrInTZ,
} from '../utils/statsService.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);

const VALID_METRICS = ['practiced', 'correct', 'time_spent', 'exam_score'];

// owner 判定已收敛到 utils/authority.js canManageExam（exam.manage_super = 仅 platform admin 旁路）。

// GET /me/trend
router.get('/me/trend', authWithAuthority, async (req, res) => {
  try {
    const metric = VALID_METRICS.includes(req.query.metric) ? req.query.metric : 'practiced';
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const trend = await getTrend(pool, req.user.id, { metric, days });
    res.json({ metric, days, trend });
  } catch (err) {
    log.error('getTrend error:', err);
    res.status(500).json({ error: '获取趋势失败' });
  }
});

// GET /me/mastery
router.get('/me/mastery', authWithAuthority, async (req, res) => {
  try {
    const mastery = await getMastery(pool, req.user.id);
    res.json({ mastery });
  } catch (err) {
    log.error('getMastery error:', err);
    res.status(500).json({ error: '获取掌握度失败' });
  }
});

// GET /exam/:id/analysis
router.get('/exam/:id(\\d+)/analysis', authWithAuthority, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT created_by FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    if (!canManageExam(examRows[0], req, 'exam.manage_super')) {
      return res.status(403).json({ error: '无权查看该考试分析' });
    }
    const analysis = await getExamAnalysisDeep(pool, examId);
    if (!analysis) return res.status(404).json({ error: '考试不存在' });
    res.json({ analysis });
  } catch (err) {
    log.error('getExamAnalysisDeep error:', err);
    res.status(500).json({ error: '获取考情分析失败' });
  }
});

// GET /class/compare
router.get('/class/compare', authWithAuthority, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权查看班级对比' });
    }
    let teacherId = req.user.id;
    if (req.user.role === 'admin' && req.query.teacher_id) {
      teacherId = Number(req.query.teacher_id);
    }
    const students = await getClassCompare(pool, teacherId);
    res.json({ students });
  } catch (err) {
    log.error('getClassCompare error:', err);
    res.status(500).json({ error: '获取班级对比失败' });
  }
});

// POST /admin/aggregate — 手动聚合（默认昨日，可 ?date=YYYY-MM-DD）
router.post('/admin/aggregate', authWithAuthority, adminMiddleware, async (req, res) => {
  try {
    const date = req.query.date || (() => {
      const d = new Date(Date.now() - 24 * 3600 * 1000);
      return dateStrInTZ(d);
    })();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
    }
    const summary = await aggregateForDate(pool, date);
    res.json({ ok: true, date, ...summary });
  } catch (err) {
    log.error('manual stats aggregate error:', err);
    res.status(500).json({ error: '手动聚合失败' });
  }
});

export default router;
