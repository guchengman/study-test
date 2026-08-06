// 导入主面板：AI 提示词输入 / 模型选择 / 待解析文本 / 文件上传 / 公式识别（从 ImportModal 抽取）
import React from 'react';
import { Upload, FileText, Loader2, Info, Sparkles, Wand2, Maximize2, Cpu } from 'lucide-react';
import { MarkdownEditor } from '../MarkdownEditor';
import { EmptyState } from '../ui/EmptyState';

const MODELS = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    desc: '最新V4版本,速度极快,支持128K上下文。',
    req: '适合各种中文题目,需配置 API Key。',
  },
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    desc: '阿里最强模型,中文理解能力顶尖。',
    req: '适合复杂中文语境,需配置 API Key。',
  },
  {
    id: 'zhipu-chatglm-4',
    name: '智谱 GLM-4',
    desc: '清华系大模型,中文处理非常出色。',
    req: '适合学术或专业题目,需配置 API Key。',
  },
  {
    id: 'moonshot-v1-8k',
    name: '月之暗面 8K',
    desc: '月之暗面最新模型,上下文理解优秀。',
    req: '适合长文本和复杂逻辑,需配置 API Key。',
  },
  {
    id: 'baichuan2-53b',
    name: '百川 53B',
    desc: '百川智能大参数模型,中文表现优异。',
    req: '适合专业领域题目,需配置 API Key。',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter 通用接口',
    desc: '通过 OpenRouter 访问任意模型,支持数百种AI模型。',
    req: '需配置 OpenRouter API Key 和模型名称(如 openai/gpt-4o)。',
  },
  {
    id: 'custom',
    name: '自定义接口',
    desc: '使用您自己的 OpenAI 兼容接口。',
    req: '需在设置中配置 Endpoint 和 Key。',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    desc: '速度极快,结构化输出能力强。',
    req: '适合清晰的题目文本,解析效率最高。',
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    desc: '推理能力最强,适合复杂、模糊或超长文本。',
    req: '适合手写识别、复杂排版或需要深度理解的题目。',
  },
];

const DEFAULT_PROMPTS = [
  '生成10道Python选择题，包含单选和多选题，难度适中',
  '生成8道四年级数学选择题，包含加减乘除和应用题',
  '生成6道英语语法单选题，适合小学水平，附详细解析',
  '生成5道Python循环结构选择题，考察for和while循环',
  '生成10道混合学科选择题，涵盖语数英三科',
];

interface FormulaProgress {
  current: number;
  total: number;
  success: number;
  failed: number;
}

interface ImportTabsProps {
  promptInput: string;
  onPromptInputChange: (v: string) => void;
  showHistory: boolean;
  onShowHistoryChange: (v: boolean) => void;
  promptHistory: string[];
  onSavePromptToHistory: (p: string) => void;
  isGenerating: boolean;
  onGenerateFromPrompt: () => void;
  selectedModel: string;
  onSelectedModelChange: (m: string) => void;
  text: string;
  onTextChange: (v: string) => void;
  isParsing: boolean;
  onAIParse: () => void;
  isConvertingFormula: boolean;
  formulaProgress: FormulaProgress;
  uploadingFileName: string | null;
  convertFormulaEnabled: boolean;
  onConvertFormulaEnabledChange: (v: boolean) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  onExpandPrompt: () => void;
  onExpandText: () => void;
  error: string | null;
}

export const ImportTabs: React.FC<ImportTabsProps> = ({
  promptInput,
  onPromptInputChange,
  showHistory,
  onShowHistoryChange,
  promptHistory,
  onSavePromptToHistory,
  isGenerating,
  onGenerateFromPrompt,
  selectedModel,
  onSelectedModelChange,
  text,
  onTextChange,
  isParsing,
  onAIParse,
  isConvertingFormula,
  formulaProgress,
  uploadingFileName,
  convertFormulaEnabled,
  onConvertFormulaEnabledChange,
  onFileChange,
  onDownloadTemplate,
  onExpandPrompt,
  onExpandText,
  error,
}) => {
  return (
    <div className="space-y-6">
      {/* AI 生成提示词区域 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Sparkles className="text-purple-600" size={16} /> AI生成题目提示词
            <button
              onClick={onExpandPrompt}
              className="ml-2 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="放大编辑"
            >
              <Maximize2 size={14} />
            </button>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer transition-all border border-slate-200 hover:border-purple-300">
              <Upload size={13} />
              <span>上传文件</span>
              <span className="text-[9px] text-slate-400">PDF/DOCX/DOC/TXT/MD/CSV/XLSX/JSON</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.json"
                onChange={onFileChange}
              />
            </label>
            {/* 公式识别开关 */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-all border border-slate-200 hover:border-blue-300 select-none">
              <input
                type="checkbox"
                checked={convertFormulaEnabled}
                onChange={(e) => onConvertFormulaEnabledChange(e.target.checked)}
                className="w-3 h-3 accent-blue-600 rounded"
              />
              <span className="whitespace-nowrap">公式→LaTeX</span>
              <span className="text-[9px] text-slate-400 hidden sm:inline">自动识别文档中的公式图片</span>
            </label>
            {/* 模板下载 */}
            <button
              onClick={onDownloadTemplate}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all border border-transparent hover:border-green-200"
              title="下载标准化 MD 模板"
            >
              <FileText size={12} />
              <span className="hidden sm:inline">下载模板</span>
            </button>
            {uploadingFileName && (
              <span className="text-[10px] text-purple-600 animate-pulse">
                正在处理: {uploadingFileName}
              </span>
            )}
            {/* 公式识别进度 */}
            {isConvertingFormula && (
              <div className="w-full p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                <div className="shrink-0">
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-blue-700 font-medium">
                    📐 正在识别公式... {formulaProgress.current}/{formulaProgress.total}
                  </div>
                  <div className="text-[10px] text-blue-500">
                    ✅ {formulaProgress.success} 个公式已识别
                    {formulaProgress.failed > 0 && `  ⚠️ ${formulaProgress.failed} 个跳过或失败`}
                  </div>
                  <div className="mt-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${formulaProgress.total > 0 ? (formulaProgress.current / formulaProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-col lg:flex-row">
          <div className="relative flex-1" onFocus={() => onShowHistoryChange(true)} onBlur={() => onShowHistoryChange(false)}>
            <MarkdownEditor
              value={promptInput}
              onChange={(v) => { onPromptInputChange(v); onShowHistoryChange(v.trim() === ''); }}
              placeholder="输入提示词生成题目，或点击右侧上传文件提取文本..."
              rows={3}
            />
            {showHistory && promptInput.trim() === '' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-80 overflow-y-auto">
                {promptHistory.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50/50 sticky top-0">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={10} className="text-purple-500" />
                        历史记录 ({promptHistory.length})
                      </div>
                    </div>
                    {promptHistory.map((historyPrompt, index) => {
                      const truncatedText = historyPrompt.length > 40
                        ? historyPrompt.substring(0, 40) + '...'
                        : historyPrompt;
                      return (
                        <div
                          key={`history-${index}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onPromptInputChange(historyPrompt);
                            onShowHistoryChange(false);
                          }}
                          className="px-4 py-3 hover:bg-purple-50 cursor-pointer text-sm transition-colors group flex items-start gap-3"
                        >
                          <div className="shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-700 leading-snug" title={historyPrompt}>
                              {truncatedText}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">点击使用</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {DEFAULT_PROMPTS.length > 0 && (
                  <div className="divide-y divide-slate-100 border-t border-dashed border-slate-200">
                    <div className="px-4 py-2.5 text-[10px] font-bold text-blue-600 uppercase tracking-wide bg-blue-50/50 sticky top-0">
                      <div className="flex items-center gap-1.5">
                        <Wand2 size={10} />
                        默认提示词模板
                      </div>
                    </div>
                    {DEFAULT_PROMPTS.map((defaultPrompt, index) => {
                      const truncatedText = defaultPrompt.length > 40
                        ? defaultPrompt.substring(0, 40) + '...'
                        : defaultPrompt;
                      const getTag = (t: string) => {
                        if (t.includes('Python')) return { label: 'Python', color: 'bg-green-100 text-green-700' };
                        if (t.includes('数学')) return { label: '数学', color: 'bg-blue-100 text-blue-700' };
                        if (t.includes('英语')) return { label: '英语', color: 'bg-amber-100 text-amber-700' };
                        if (t.includes('混合')) return { label: '混合', color: 'bg-purple-100 text-purple-700' };
                        return { label: '通用', color: 'bg-slate-100 text-slate-700' };
                      };
                      const tag = getTag(defaultPrompt);
                      return (
                        <div
                          key={`default-${index}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onPromptInputChange(defaultPrompt);
                            onShowHistoryChange(false);
                            onSavePromptToHistory(defaultPrompt);
                          }}
                          className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm transition-colors group flex items-start gap-3"
                        >
                          <div className="shrink-0 w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Wand2 size={12} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tag.color}`}>
                                {tag.label}
                              </span>
                            </div>
                            <div className="text-slate-700 leading-snug" title={defaultPrompt}>
                              {truncatedText}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {promptHistory.length === 0 && (
                  <EmptyState
                    icon={<Sparkles size={20} />}
                    title="暂无历史记录"
                    description="使用默认模板或输入自定义提示词"
                    className="px-4"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onGenerateFromPrompt}
            disabled={!promptInput.trim() || isGenerating}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 whitespace-nowrap"
          >
            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            生成题目
          </button>
        </div>
        <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 flex items-start gap-2">
          <Info size={14} className="text-purple-600 mt-0.5 shrink-0" />
          <div className="text-[11px] text-purple-700 leading-relaxed">
            <span className="font-bold">提示:</span>
            输入详细的提示词来生成题目,如"生成5道Python编程题,难度适中,包含函数和循环"。
            <span className="block mt-1 text-slate-500">上传文件后，文字内容将自动填充到提示词输入框中。</span>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-blue-600" /> 选择 AI 解析模型
          </div>
          {!localStorage.getItem('ai_settings') && selectedModel !== 'deepseek-v4-flash' && (
            <span className="text-[10px] text-rose-500 font-bold animate-pulse">
              需配置 API Key
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => { onSelectedModelChange(model.id); localStorage.setItem('last_selected_model', model.id); }}
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

        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
          <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-700 leading-relaxed">
            <span className="font-bold">模型要求:</span>
            {MODELS.find((m) => m.id === selectedModel)?.req}
          </div>
        </div>
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <FileText size={16} className="text-blue-600" />
          待解析文本
          <button
            onClick={onExpandText}
            className="ml-2 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="放大编辑"
          >
            <Maximize2 size={14} />
          </button>
        </label>
        <MarkdownEditor
          value={text}
          onChange={onTextChange}
          placeholder="在此粘贴题目文本，AI解析后生成结构化题目..."
          rows={8}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onAIParse}
          disabled={!text.trim() || isParsing}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
        >
          {isParsing ? <Loader2 className="animate-spin" size={18} /> : <Cpu size={18} />}
          开始 AI 解析
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
          <Info size={16} className="text-rose-600 mt-0.5 shrink-0" />
          <div className="text-[11px] text-rose-700">{error}</div>
        </div>
      )}
    </div>
  );
};
