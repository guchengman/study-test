import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { authMiddleware } from '../middleware/auth.js';

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
    const allowed = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式: png, jpg, jpeg, gif, svg, webp, bmp'));
    }
  },
});

const router = Router();

router.post('/image', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
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
    const url = `/api/uploads/user_${userId}/${req.file.filename}`;

    res.json({ url, filename: req.file.filename });
  });
});

export { router as uploadRoutes, uploadsRoot };
export default router;
