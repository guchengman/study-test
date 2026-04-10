import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, FileText, Clipboard, Loader2, CheckCircle2, AlertCircle, Cpu, Info, Settings } from 'lucide-react';
import { extractTextFromPDF, extractTextFromDocx, extractTextFromTxt } from '../services/fileService';
import { parseQuestionsWithAI } from '../services/geminiService';
import { Question } from '../types';
import { SettingsModal } from './SettingsModal';

const MODELS = [
  { 
    id: 'gemini-3-flash-preview', 
    name: 'Gemini 3 Flash', 
    desc: '速度极快，结构化输出能力强。',
    req: '适合清晰的题目文本，解析效率最高。'
  },
  { 
    id: 'gemini-1.5-pro', 
    name: 'Gemini 1.5 Pro', 
    desc: '推理能力最强，适合复杂、模糊或超长文本。',
    req: '适合手写识别、复杂排版或需要深度理解的题目。'
  },
  { 
    id: 'deepseek-chat', 
    name: 'DeepSeek Chat', 
    desc: '国产之光，极高性价比，逻辑能力强。',
    req: '适合各种中文题目，需配置 API Key。'
  },
  { 
    id: 'qwen-max', 
    name: '通义千问 Max', 
    desc: '阿里最强模型，中文理解能力顶尖。',
    req: '适合复杂中文语境，需配置 API Key。'
  },
  { 
    id: 'zhipu-chatglm-4', 
    name: '智谱 GLM-4', 
    desc: '清华系大模型，中文处理非常出色。',
    req: '适合学术或专业题目，需配置 API Key。'
  },
  { 
    id: 'custom', 
    name: '自定义接口', 
    desc: '使用您自己的 OpenAI 兼容接口。',
    req: '需在设置中配置 Endpoint 和 Key。'
  }
];

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: Question[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Question[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    try {
      let extractedText = '';
      if (file.name.endsWith('.pdf')) {
        extractedText = await extractTextFromPDF(file);
      } else if (file.name.endsWith('.docx')) {
        extractedText = await extractTextFromDocx(file);
      } else if (file.name.endsWith('.txt')) {
        extractedText = await extractTextFromTxt(file);
      } else {
        throw new Error('不支持的文件格式，请上传 PDF, DOCX 或 TXT。');
      }
      setText(prev => prev + '\n' + extractedText);
    } catch (err: any) {
      setError(err.message || '文件读取失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIParse = async () => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);
    try {
      const parsed = await parseQuestionsWithAI(text, selectedModel);
      setPreview(parsed);
    } catch (err: any) {
      setError(err.message || 'AI 解析失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmImport = () => {
    onImport(preview);
    onClose();
    setPreview([]);
    setText('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Upload className="text-blue-600" size={24} />
              导入题目到题库
            </h2>
            <p className="text-sm text-slate-500 mt-1">支持 Word、PDF、TXT 或直接粘贴文本</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-blue-600"
              title="API 设置"
            >
              <Settings size={20} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {preview.length === 0 ? (
            <>
              {/* Upload Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-all group">
                  <Upload className="text-slate-300 group-hover:text-blue-500 mb-2" size={32} />
                  <span className="text-sm font-medium text-slate-600">点击上传文件</span>
                  <span className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT</span>
                  <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileChange} />
                </label>
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                  <Clipboard className="text-slate-300 mb-2" size={32} />
                  <span className="text-sm font-medium text-slate-600">直接在下方粘贴</span>
                  <span className="text-xs text-slate-400 mt-1">支持各种非规范格式</span>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-blue-600" /> 选择 AI 解析模型
                  </div>
                  {!localStorage.getItem('ai_settings') && selectedModel !== 'gemini-3-flash-preview' && (
                    <span className="text-[10px] text-rose-500 font-bold animate-pulse">
                      需配置 API Key
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                        selectedModel === model.id 
                          ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-50' 
                          : 'border-slate-100 hover:border-slate-200 bg-white'
                      }`}
                    >
                      <div className="font-bold text-[11px] text-slate-800 truncate">{model.name}</div>
                      <div className="text-[9px] text-slate-500 mt-1 leading-tight line-clamp-2">{model.desc}</div>
                    </button>
                  ))}
                </div>
                
                {/* Model Requirements */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                  <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-amber-700 leading-relaxed">
                    <span className="font-bold">模型要求：</span>
                    {MODELS.find(m => m.id === selectedModel)?.req}
                  </div>
                </div>
              </div>

              {/* Textarea */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={16} /> 待解析文本内容
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在此粘贴题目内容，例如：
1. Python 的输出函数是？
A. print B. input
答案：A"
                  className="w-full h-64 p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none font-mono text-sm transition-all resize-none"
                />
              </div>
            </>
          ) : (
            /* Preview Area */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  解析成功！预览题目 ({preview.length} 题)
                </h3>
                <button 
                  onClick={() => {
                    setPreview([]);
                    setText(''); // 清空待解析文本内容
                  }} 
                  className="text-sm text-blue-600 hover:underline"
                >
                  重新编辑文本
                </button>
              </div>
              <div className="space-y-3">
                {preview.map((q, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="flex items-start gap-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">
                        {q.type}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{q.title}</p>
                        {q.options && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {q.options.map((opt, i) => (
                              <div key={i} className="text-xs text-slate-500 flex gap-1">
                                <span className="font-bold">{String.fromCharCode(65+i)}.</span> {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-emerald-600 font-bold">答案：{Array.isArray(q.answer) ? q.answer.join(',') : q.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-600 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
          >
            取消
          </button>
          {preview.length === 0 ? (
            <button
              disabled={!text.trim() || isProcessing}
              onClick={handleAIParse}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              开始 AI 智能解析
            </button>
          ) : (
            <button
              onClick={confirmImport}
              className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
            >
              确认添加到题库
            </button>
          )}
        </div>
      </motion.div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
