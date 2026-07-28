// PaddleOCR API 设置面板（从 ImportModal 抽取）
// 红线：本组件不得重新硬编码密钥默认值；密钥来自父级（其父级已从
// localStorage / import.meta.env.VITE_PADDLEOCR_API_KEY 读取后传入）。
import React from 'react';
import { motion } from 'motion/react';
import { X, Cpu, ScanText } from 'lucide-react';

interface PaddleOcrSettingsProps {
  isOpen: boolean;
  apiKey: string;
  apiUrl: string;
  onApiKeyChange: (v: string) => void;
  onApiUrlChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const PaddleOcrSettings: React.FC<PaddleOcrSettingsProps> = ({
  isOpen,
  apiKey,
  apiUrl,
  onApiKeyChange,
  onApiUrlChange,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Cpu size={20} className="text-blue-600" />
            PaddleOCR API 设置
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          PaddleOCR PP-OCRv5 是百度开源的最新一代文字识别引擎，支持中英日文识别，精度比 v4 提升 13%。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              AI Studio 访问令牌 (Access Token)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="请输入 AI Studio Access Token"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none text-sm transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">
              在 AI Studio 个人中心 → 访问令牌 页面获取
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              API 地址（可选）
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => onApiUrlChange(e.target.value)}
              placeholder="留空则使用默认地址"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none text-sm transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">
              在 PaddleOCR 任务页面获取 API 调用地址，留空则使用官方默认地址
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-2">配置步骤：</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>访问 <a href="https://aistudio.baidu.com/paddleocr/task" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">PaddleOCR 任务页面</a></li>
                <li>登录 AI Studio 账号</li>
                <li>在 <a href="https://aistudio.baidu.com/usercenter/token" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">个人中心</a> 获取访问令牌</li>
                <li>在任务页面获取 API 调用地址（填入上方"API 地址"）</li>
                <li>将令牌和地址填入上方输入框，点击保存</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-all"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            保存
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <a
            href="https://aistudio.baidu.com/paddleocr/task"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            <ScanText size={16} />
            点击此处前往 PaddleOCR 任务页面
          </a>
        </div>
      </motion.div>
    </div>
  );
};
