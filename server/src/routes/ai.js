/**
 * 服务端 AI 代理：避免生产构建将 Gemini Key 打入前端；Key 仅来自环境变量 GEMINI_API_KEY
 */
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/gemini/generate', authMiddleware, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(503).json({ error: '服务器未配置 GEMINI_API_KEY' });
  }
  try {
    const { model, contents, config } = req.body || {};
    if (!model) {
      return res.status(400).json({ error: '缺少 model' });
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
