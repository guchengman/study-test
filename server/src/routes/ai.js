/**
 * 服务端 AI 代理：避免生产构建将 Gemini Key 打入前端；Key 仅来自环境变量 GEMINI_API_KEY
 */
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 简易内存限流：每用户每分钟最多 10 次请求
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  const key = userId;
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// 每 5 分钟清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > 5 * 60 * 1000) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

router.post('/gemini/generate', authMiddleware, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(503).json({ error: '服务器未配置 GEMINI_API_KEY' });
  }

  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后重试' });
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
