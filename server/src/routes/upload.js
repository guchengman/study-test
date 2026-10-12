import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import pool from '../db.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { checkQuota, recordUsage } from '../utils/quotaService.js';
import log from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsRoot = path.resolve(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userDir = path.join(uploadsRoot, `user_${req.user.id}`);
    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    // 安全：移除 svg（可内嵌 script，存在存储型 XSS 风险）；扩展名 + MIME 双重校验
    const allowed = /\.(png|jpe?g|gif|webp|bmp)$/i;
    const mimeOk = /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(file.mimetype);
    if (allowed.test(path.extname(file.originalname)) && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式: png, jpg, jpeg, gif, webp, bmp'));
    }
  },
});

const router = Router();

// 统一限流（15 分钟 / 每 IP 300 次）
router.use(apiLimiter);

router.post('/image', authMiddleware, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: '文件大小不能超过 5MB' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请选择图片文件' });
    }

    const userId = req.user.id;
    const savedPath = req.file.path;

    // FR-606：上传字节配额 + 存储熔断（95%）校验。multer 已落盘，超限则删除并 429。
    try {
      const orgId = await resolvePersonalOrgId(pool, userId);
      const quota = await checkQuota(pool, orgId, 'upload_bytes', req.file.size);
      if (!quota.allowed) {
        try { unlinkSync(savedPath); } catch { /* 删除失败不阻断响应 */ }
        return res.status(quota.status || 429).json({ error: '存储配额已用完或已熔断', reason: quota.reason });
      }
      await recordUsage(pool, orgId, 'upload_bytes', req.file.size);
      await recordUsage(pool, orgId, 'file_count', 1);
    } catch (qerr) {
      // 配额基础设施异常：不阻断上传主流程（已落盘），仅告警
      log.error('upload quota error:', qerr);
    }

    const url = `/api/uploads/user_${userId}/${req.file.filename}`;

    res.json({ url, filename: req.file.filename });
  });
});

export { router as uploadRoutes, uploadsRoot };
export default router;
