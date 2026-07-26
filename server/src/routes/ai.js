/**
 * 服务端 AI 代理：避免生产构建将 Gemini Key 打入前端；Key 仅来自环境变量 GEMINI_API_KEY
 */
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { authMiddleware } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// 每用户每分钟最多 10 次请求（用 express-rate-limit 替代手写 Map，自动淘汰过期条目）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '请求过于频繁，请稍后再试' },
});

router.post('/gemini/generate', authMiddleware, aiLimiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(503).json({ error: '服务器未配置 GEMINI_API_KEY' });
  }

  try {
    const { model, contents, config } = req.body || {};
    if (!model) {
      return res.status(400).json({ error: '缺少 model' });
    }
    if (!contents || (Array.isArray(contents) && contents.length === 0)) {
      return res.status(400).json({ error: '缺少 contents' });
    }
    // 限制请求体大小，防止滥用
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 100 * 1024) {
      return res.status(400).json({ error: '请求内容过大' });
    }

    const ai = new GoogleGenAI({ apiKey: String(apiKey).trim() });
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    res.json({ text: response.text });
  } catch (err) {
    console.error('Gemini 代理错误:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Gemini 调用失败' });
  }
});

export default router;
