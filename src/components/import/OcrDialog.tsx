// OCR 确认对话框（从 ImportModal 抽取）
import React from 'react';
import { motion } from 'motion/react';
import { ScanText, Image, ExternalLink } from 'lucide-react';

export type OcrMode = 'none' | 'offline' | 'online' | 'ai';

interface OcrDialogProps {
  isOpen: boolean;
  ocrMode: OcrMode;
  onOcrModeChange: (m: OcrMode) => void;
  aiVisionModel: string;
  onAiVisionModelChange: (m: string) => void;
  onCancel: () => void;
  // 确认按钮：父级根据当前 ocrMode 分发到具体 handler
  onConfirm: () => void;
}

export const OcrDialog: React.FC<OcrDialogProps> = ({
  isOpen,
  ocrMode,
  onOcrModeChange,
  aiVisionModel,
  onAiVisionModelChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
            <ScanText size={32} className="text-white" />
          </div>

          <h3 className="text-lg font-bold text-slate-800 mb-2">检测到扫描件 PDF</h3>
          <p className="text-sm text-slate-500 mb-4">
            此 PDF 似乎不包含可提取的文字，可能是扫描件或图片型 PDF。
          </p>

          <div className="bg-slate-50 rounded-xl p-4 mb-4 text-left space-y-3">
            <p className="text-sm font-bold text-slate-700">请选择处理方式：</p>

            {/* Option 1: Offline OCR */}
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                ocrMode === 'offline'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => onOcrModeChange('offline')}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                ocrMode === 'offline' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
              }`}>
                {ocrMode === 'offline' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">启用离线OCR文字识别</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">默认</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">使用本地 Tesseract 引擎识别文字，支持中英文，无需网络</p>
              </div>
            </div>

            {/* Option 2: Online OCR */}
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                ocrMode === 'online'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => onOcrModeChange('online')}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                ocrMode === 'online' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
              }`}>
                {ocrMode === 'online' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">启用在线OCR文字识别</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">默认</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">使用百度 OCR 高精度识别（通用文字识别），每月免费 5 万次，支持中英文混合</p>
                <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[11px] font-medium text-slate-600 mb-1.5">⚙️ API 配置（需管理员设置）</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-500">
                    <li>访问 <a href="https://cloud.baidu.com/doc/OCR/s/dk3iqnq51" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">百度智能云 OCR 控制台</a> 创建应用</li>
                    <li>获取 <code className="bg-slate-200 px-1 rounded text-[10px]">API Key</code> 和 <code className="bg-slate-200 px-1 rounded text-[10px]">Secret Key</code></li>
                    <li>在服务器 <code className="bg-slate-200 px-1 rounded text-[10px]">server/.env</code> 中填入密钥后重启服务</li>
                  </ol>
                  <a href="https://cloud.baidu.com/product/ocr.html" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 hover:underline font-medium">
                    <ExternalLink size={10} />
                    前往申请百度 OCR API →
                  </a>
                </div>
              </div>
            </div>

            {/* Option 3: AI Vision */}
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                ocrMode === 'ai'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => onOcrModeChange('ai')}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                ocrMode === 'ai' ? 'border-purple-500 bg-purple-500' : 'border-slate-300'
              }`}>
                {ocrMode === 'ai' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Image size={14} className="text-purple-600" />
                  <span className="font-medium text-slate-700">在线AI识别（多模态）</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">推荐</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">将每页渲染为图片，发送到多模态 AI 同时识别文字、图表、公式、表格等全部内容。需在设置中配置 AI API Key（Gemini/DeepSeek/OpenRouter/Qwen）</p>
              </div>
            </div>
          </div>

          {/* AI 识别模型选择 */}
          {ocrMode === 'ai' && (
            <div className="space-y-3 mb-4">
              <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                <label className="text-xs font-medium text-purple-700 mb-1.5 block">选择识别模型：</label>
                <select
                  value={aiVisionModel}
                  onChange={(e) => onAiVisionModelChange(e.target.value)}
                  className="w-full text-xs bg-white border border-purple-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <optgroup label="Google Gemini">
                    <option value="gemini-3-flash-preview">Gemini 3 Flash — 速度快，适合批量识别</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro — 推理强，适合复杂页面</option>
                  </optgroup>
                  <optgroup label="DeepSeek">
                    <option value="deepseek-v4-flash">DeepSeek V4 Flash — 性价比高</option>
                  </optgroup>
                  <optgroup label="通义千问">
                    <option value="qwen-max">Qwen Max — 中文理解顶尖</option>
                  </optgroup>
                  <optgroup label="通用接口">
                    <option value="openrouter">OpenRouter — 需在设置中配置模型</option>
                    <option value="custom">自定义接口 — 需在设置中配置 Endpoint</option>
                  </optgroup>
                </select>
                <p className="text-[11px] text-purple-600 mt-1.5">
                  使用 AI 模型设置中的对应 API Key。识别内容：文字 + 图表/公式/表格描述。
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-all"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                ocrMode === 'offline'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-amber-100'
                  : ocrMode === 'ai'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-purple-100'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-blue-100'
              }`}
            >
              <ScanText size={16} />
              {ocrMode === 'offline' ? '开始离线识别' : ocrMode === 'ai' ? '开始AI识别' : '开始在线识别'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
