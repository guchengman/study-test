import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'motion/react';
import { X, Upload, FileText, Clipboard, Loader2, CheckCircle2, AlertCircle, Cpu, Info, Settings, Sparkles, Wand2, Zap } from 'lucide-react';
import { extractTextFromPDF, extractTextFromDocx, extractTextFromTxt, extractTextFromMd, extractTextFromDoc } from '../services/fileService';
import { parseQuestionsWithAI, generateQuestionsFromPrompt, parseQuestionsWithFile } from '../services/geminiService';
import { Question, SubjectId, Subject, AISettings } from '../types';
import { authApi, type AuthUser } from '../services/api';
import { SettingsModal } from './SettingsModal';
import { STORAGE_KEYS } from '../constants/storage';

const MODELS = [
  // 国产大模型
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    desc: '最新V4版本,速度极快,支持128K上下文。',
    req: '适合各种中文题目,需配置 API Key。'
  },
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    desc: '阿里最强模型,中文理解能力顶尖。',
    req: '适合复杂中文语境,需配置 API Key。'
  },
  {
    id: 'zhipu-chatglm-4',
    name: '智谱 GLM-4',
    desc: '清华系大模型,中文处理非常出色。',
    req: '适合学术或专业题目,需配置 API Key。'
  },
  {
    id: 'moonshot-v1-8k',
    name: '月之暗面 8K',
    desc: '月之暗面最新模型,上下文理解优秀。',
    req: '适合长文本和复杂逻辑,需配置 API Key。'
  },
  {
    id: 'baichuan2-53b',
    name: '百川 53B',
    desc: '百川智能大参数模型,中文表现优异。',
    req: '适合专业领域题目,需配置 API Key。'
  },
  // 通用接口
  {
    id: 'openrouter',
    name: 'OpenRouter 通用接口',
    desc: '通过 OpenRouter 访问任意模型,支持数百种AI模型。',
    req: '需配置 OpenRouter API Key 和模型名称(如 openai/gpt-4o)。'
  },
  {
    id: 'custom',
    name: '自定义接口',
    desc: '使用您自己的 OpenAI 兼容接口。',
    req: '需在设置中配置 Endpoint 和 Key。'
  },
  // Google Gemini
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    desc: '速度极快,结构化输出能力强。',
    req: '适合清晰的题目文本,解析效率最高。'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    desc: '推理能力最强,适合复杂、模糊或超长文本。',
    req: '适合手写识别、复杂排版或需要深度理解的题目。'
  },
  // {
  //   id: 'hunyuan-lite',
  //   name: '腾讯混元 Lite',
  //   desc: '腾讯混元轻量版,速度快成本低。',
  //   req: '暂未实现,请通过OpenRouter使用。'
  // },
  // {
  //   id: 'ernie-bot-4',
  //   name: '文心一言 4.0',
  //   desc: '百度最强模型,中文知识库丰富。',
  //   req: '暂未实现,请通过OpenRouter使用。'
  // },
];

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: Question[]) => void;
  allSubjects?: Subject[];
  currentSubjectId?: SubjectId;
  authUser?: AuthUser | null;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport, allSubjects, currentSubjectId, authUser }) => {
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Question[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSubjectSelectionOpen, setIsSubjectSelectionOpen] = useState(false);
  const [detectedSubject, setDetectedSubject] = useState<string | null>(null);
  const [selectedTargetSubject, setSelectedTargetSubject] = useState<SubjectId>('python');
  const [showMismatchConfirm, setShowMismatchConfirm] = useState(false);
  // 已登录用户从服务端加载的AI设置
  const [serverSettings, setServerSettings] = useState<AISettings | null>(null);
  // AI直连提取选项：选中后上传文件直接进入AI解析流程
  const [directAIExtract, setDirectAIExtract] = useState(false);
  // 上传中的文件名显示
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    setServerSettings(null);
    if (authUser) {
      authApi.getSettings().then(res => {
        if (res.settings) setServerSettings(res.settings);
      }).catch(() => {});
    }
  }, [isOpen, authUser]);
  // 默认提示词
  const DEFAULT_PROMPTS = [
    '生成10道Python选择题，包含单选和多选题，难度适中',
    '生成8道四年级数学选择题，包含加减乘除和应用题',
    '生成6道英语语法单选题，适合小学水平，附详细解析',
    '生成5道Python循环结构选择题，考察for和while循环',
    '生成10道混合学科选择题，涵盖语数英三科'
  ];

  const [promptInput, setPromptInput] = useState(''); // 新增:提示词输入
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    // 从 localStorage 加载历史记录
    const saved = localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY);
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFileName(file.name);
    setIsParsing(true);
    setError(null);
    try {
      let extractedText = '';
      const fileSize = (file.size / 1024).toFixed(1);
      
      console.log(`开始解析文件: ${file.name}, 大小: ${fileSize} KB`);
      
      if (file.name.endsWith('.pdf')) {
        extractedText = await extractTextFromPDF(file);
      } else if (file.name.endsWith('.docx')) {
        extractedText = await extractTextFromDocx(file);
      } else if (file.name.endsWith('.doc')) {
        extractedText = await extractTextFromDoc(file);
      } else if (file.name.endsWith('.txt')) {
        extractedText = await extractTextFromTxt(file);
      } else if (file.name.endsWith('.md')) {
        extractedText = await extractTextFromMd(file);
      } else {
        throw new Error('不支持的文件格式,请上传 PDF/DOCX/DOC/TXT/MD 文件。');
      }
      
      console.log(`文件解析成功，提取文字: ${extractedText.length} 字符`);
      
      if (!extractedText.trim()) {
        throw new Error('文件中没有找到可用的文字内容');
      }
      
      if (directAIExtract) {
        // AI直连提取模式：直接以附件方式上传文件给AI解析
        console.log('AI直连提取模式：直接上传文件到AI...');
        
        // 显示提示信息
        setError(null);
        
        try {
          // 直接调用AI解析（以附件方式上传文件）
          const parsed = await parseQuestionsWithFile(file, selectedModel, serverSettings || undefined);
          setPreview(parsed);
        } catch (err: any) {
          // 如果附件上传失败，回退到文本提取方式
          console.warn('附件上传失败，回退到文本提取方式:', err.message);
          setError(`AI直连提取失败 (${err.message})，已回退到文本提取模式`);
          setText(extractedText);
        }
      } else {
        // 普通模式：将文件内容填充到 AI 生成题目的提示词输入框
        setPromptInput(extractedText);
      }
    } catch (err: any) {
      console.error('文件解析失败:', err);
      setError(err.message || '文件读取失败');
    } finally {
      setIsParsing(false);
      setUploadingFileName(null);
    }
  };

  const handleAIParse = async () => {
    if (!text.trim()) return;

    setIsParsing(true);
    setError(null);
    try {
      const parsed = await parseQuestionsWithAI(text, selectedModel, serverSettings || undefined);
      setPreview(parsed);
    } catch (err: any) {
      setError(err.message || 'AI 解析失败');
    } finally {
      setIsParsing(false);
    }
  };

  // 保存提示词到历史记录
  const savePromptToHistory = (prompt: string) => {
    if (!prompt.trim()) return;

    // 避免重复
    const newHistory = [prompt, ...promptHistory.filter(p => p !== prompt)];
    // 限制历史记录数量(最多10条)
    const limitedHistory = newHistory.slice(0, 10);

    setPromptHistory(limitedHistory);
    localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(limitedHistory));
  };

  // 新增:根据提示词生成题目
  const handleGenerateFromPrompt = async () => {
    if (!promptInput.trim()) return;

    setIsGenerating(true);
    setError(null);
    try {
      const generatedText = await generateQuestionsFromPrompt(promptInput, selectedModel, serverSettings || undefined);
      setText(generatedText);
      savePromptToHistory(promptInput);
    } catch (err: any) {
      setError(err.message || 'AI 生成失败');
    } finally {
      setIsGenerating(false);
      setShowHistory(false); // 隐藏历史记录下拉框
    }
  };

  // 根据原始科目名获取显示名称
  const getSubjectDisplayName = (subjectName: string | null): string => {
    if (!subjectName) return '未知';
    const mySubjects = (allSubjects || []).filter(s => s.is_owner !== false);
    // 尝试匹配原始名称或 ID 前缀
    const matched = mySubjects.find(s => 
      s.id === subjectName || 
      s.id.replace(/_\d+$/, '') === subjectName ||
      s.name.toLowerCase().includes(subjectName.toLowerCase())
    );
    return matched?.name || (subjectName === 'python' ? 'Python' : subjectName === 'english' ? '英语' : subjectName === 'chinese' ? '语文' : subjectName === 'math' ? '数学' : subjectName);
  };

  // 根据科目ID获取显示名称
  const getSubjectDisplayNameById = (subjectId: string | null): string => {
    if (!subjectId) return '未知';
    const mySubjects = (allSubjects || []).filter(s => s.is_owner !== false);
    const matched = mySubjects.find(s => s.id === subjectId);
    if (matched) return matched.name;
    // 回退：去掉 ID 后缀获取名称
    const baseName = subjectId.replace(/_\d+$/, '');
    return baseName === 'python' ? 'Python' : baseName === 'english' ? '英语' : baseName === 'chinese' ? '语文' : baseName === 'math' ? '数学' : subjectId;
  };

  // 检测题目的subject字段是否一致，并映射到用户科目ID
  const detectSubjectFromQuestions = (questions: Question[]): { detected: string | null; matchedSubjectId: SubjectId | null } => {
    if (questions.length === 0) return { detected: null, matchedSubjectId: null };

    // 获取所有题目的subject字段（AI返回的原始科目名：python/english/chinese/math）
    const subjects = questions
      .filter(q => q.subject && typeof q.subject === 'string')
      .map(q => q.subject);

    if (subjects.length === 0) return { detected: null, matchedSubjectId: null };

    // 检查是否所有题目都是同一个科目
    const uniqueSubjects = [...new Set(subjects)];
    if (uniqueSubjects.length !== 1) return { detected: null, matchedSubjectId: null };

    const detected = uniqueSubjects[0]; // python/english/chinese/math

    // 只显示自己创建的科目（排除别人共享给自己的科目）
    // 后端返回 is_owner（布尔）和 is_shared（0/1）
    // 注意：自己创建的科目即使共享给其他人也应该显示
    const mySubjects = (allSubjects || []).filter(s => {
      // 只排除别人共享给我的科目（is_owner 为 false 且 is_shared 为 1）
      return s.is_owner !== false;
    });

    // 尝试匹配科目：先精确匹配，再尝试前缀匹配
    for (const subject of mySubjects) {
      const subjectId = String(subject.id).toLowerCase();
      const detectedLower = detected.toLowerCase();

      // 精确匹配（如 python 匹配 python）
      if (subjectId === detectedLower) {
        return { detected, matchedSubjectId: subject.id };
      }

      // 前缀匹配（如 python_12 匹配 python）
      if (subjectId.startsWith(detectedLower + '_')) {
        return { detected, matchedSubjectId: subject.id };
      }
    }

    return { detected, matchedSubjectId: null };
  };

  // 验证题目格式
  const validateQuestions = (questions: Question[]): { valid: Question[]; invalid: Question[] } => {
    const valid: Question[] = [];
    const invalid: Question[] = [];

    for (const q of questions) {
      let isValid = true;

      // 检查必填字段
      if (!q.title || !q.answer || !q.type || !q.subject) {
        isValid = false;
      }

      // 对于选择题,检查options字段
      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length === 0)) {
        isValid = false;
      }

      // 对于单选题,answer应该是字符串
      if (q.type === 'single' && Array.isArray(q.answer)) {
        // 尝试修复:取第一个元素
        q.answer = q.answer[0] || '';
      }

      // 对于多选题,answer应该是数组
      if (q.type === 'multiple' && !Array.isArray(q.answer)) {
        // 尝试修复:转换为数组
        q.answer = [String(q.answer)];
      }

      // 设置默认points
      if (q.points === undefined || q.points === null) {
        q.points = 5;
      }

      if (isValid) {
        valid.push(q);
      } else {
        invalid.push(q);
      }
    }

    return { valid, invalid };
  };

  const handleConfirmImportClick = () => {
    if (preview.length === 0) return;

    // 验证并修复题目格式
    const { valid, invalid } = validateQuestions([...preview]);

    if (invalid.length > 0) {
      setError(`发现 ${invalid.length} 道题目格式有问题,已自动修复部分问题。建议检查题目内容是否完整。`);
      // 继续使用修复后的题目
      setPreview(valid);
    }

    // 首先尝试从题目中自动检测科目（并匹配用户科目ID）
    const { detected, matchedSubjectId } = detectSubjectFromQuestions(valid);

    // 只显示自己创建的科目（排除别人共享给自己的科目）
    // 后端返回 is_owner（布尔）和 is_shared（0/1）
    // 注意：自己创建的科目即使共享给其他人也应该显示
    const mySubjects = (allSubjects || []).filter(s => {
      // 只排除别人共享给我的科目（is_owner 为 false 且 is_shared 为 1）
      return s.is_owner !== false;
    });

    if (matchedSubjectId && mySubjects.some(s => s.id === matchedSubjectId)) {
      // 自动检测成功并匹配到用户科目,设置默认选中并打开选择界面
      setDetectedSubject(detected);
      setSelectedTargetSubject(matchedSubjectId);
    } else if (currentSubjectId && mySubjects.some(s => s.id === currentSubjectId)) {
      // 检测不到科目时，默认选中当前正在查看的科目
      setDetectedSubject(null);
      setSelectedTargetSubject(currentSubjectId);
    } else {
      // 无法自动检测,使用第一个自己的科目
      setDetectedSubject(null);
      setSelectedTargetSubject(mySubjects[0]?.id || 'python');
    }

    // 打开自定义科目选择模态框
    setIsSubjectSelectionOpen(true);
  };

  const handleSubjectSelectionConfirm = () => {
    // 检查用户选择的科目是否与检测到的科目不匹配
    // detectedSubject 是名称(如 "english")，selectedTargetSubject 是 ID(如 "english_12")
    // 需要比较名称而不是直接比较
    const selectedSubjectName = selectedTargetSubject.replace(/_\d+$/, ''); // 提取名称部分
    if (detectedSubject && selectedSubjectName !== detectedSubject) {
      // 显示确认对话框
      setShowMismatchConfirm(true);
      return;
    }

    // 确保所有导入的题目都使用选择的科目
    const finalQuestions = preview.map(q => ({
      ...q,
      subject: selectedTargetSubject
    }));

    // 再次验证题目格式(防御性编程)
    const { valid } = validateQuestions(finalQuestions);

    // 传递目标科目给 onImport
    onImport(valid, selectedTargetSubject);
    onClose();
    setPreview([]);
    setText('');
    setPromptInput(''); // 清空提示词
    setIsSubjectSelectionOpen(false);
    setDetectedSubject(null);
  };

  const handleMismatchConfirm = () => {
    // 用户确认继续导入
    const finalQuestions = preview.map(q => ({
      ...q,
      subject: selectedTargetSubject
    }));
    
    // 再次验证题目格式（防御性编程）
    const { valid } = validateQuestions(finalQuestions);
    
    // 传递目标科目给 onImport
    onImport(valid, selectedTargetSubject);
    onClose();
    setPreview([]);
    setText('');
    setPromptInput(''); // 清空提示词
    setIsSubjectSelectionOpen(false);
    setDetectedSubject(null);
    setShowMismatchConfirm(false);
  };

  const handleMismatchCancel = () => {
    // 用户取消导入
    setShowMismatchConfirm(false);
  };

  const handleSubjectSelectionCancel = () => {
    setIsSubjectSelectionOpen(false);
    setDetectedSubject(null);
  };

  if (!isOpen) return null;

  return (
    <>
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
            <p className="text-sm text-slate-500 mt-1">支持 Word、PDF、TXT、MD 或直接粘贴文本</p>
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
              {/* AI生成提示词区域 - 新增 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Sparkles className="text-purple-600" size={16} /> AI生成题目提示词
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer transition-all border border-slate-200 hover:border-purple-300">
                      <Upload size={13} />
                      <span>上传文件</span>
                      <span className="text-[9px] text-slate-400">PDF/DOCX/DOC/TXT/MD</span>
                      <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleFileChange} />
                    </label>
                    {/* AI直连提取选项 */}
                    <label 
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg cursor-pointer transition-all duration-200 border-2 select-none ${
                        directAIExtract 
                          ? 'text-amber-800 bg-amber-200 border-amber-500 shadow-md scale-105' 
                          : 'text-amber-600 hover:text-amber-700 hover:bg-amber-100 border-amber-300 hover:border-amber-400 bg-amber-50 active:scale-95'
                      }`}
                      style={{
                        boxShadow: directAIExtract ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={directAIExtract} 
                        onChange={(e) => setDirectAIExtract(e.target.checked)}
                        className="w-3.5 h-3.5 accent-amber-600 cursor-pointer"
                      />
                      <Zap 
                        size={14} 
                        className={`transition-all duration-200 ${directAIExtract ? 'fill-amber-600 text-amber-700 animate-bounce' : 'text-amber-500'}`} 
                      />
                      <span className={`${directAIExtract ? 'font-bold' : 'font-medium'}`}>AI直连提取</span>
                      {directAIExtract && (
                        <span className="ml-0.5 text-[10px] bg-amber-600 text-white px-1 py-0 rounded-full">
                          ✓
                        </span>
                      )}
                    </label>
                    {uploadingFileName && (
                      <span className="text-[10px] text-purple-600 animate-pulse">
                        正在处理: {uploadingFileName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-col lg:flex-row">
                  <div className="relative flex-1">
                    <textarea
                      value={promptInput}
                      onChange={(e) => {
                        setPromptInput(e.target.value);
                        // 当输入框为空时显示历史记录
                        setShowHistory(e.target.value.trim() === '');
                      }}
                      onFocus={() => setShowHistory(true)}
                      onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                      placeholder="输入提示词生成题目，或点击右侧上传文件提取文本..."
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-purple-600 outline-none text-sm transition-all resize-y min-h-[80px]"
                    />
                    {showHistory && promptInput.trim() === '' && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-80 overflow-y-auto">
                        {/* 历史记录列表 */}
                        {promptHistory.length > 0 && (
                          <div className="divide-y divide-slate-100">
                            <div className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50/50 sticky top-0">
                              <div className="flex items-center gap-1.5">
                                <Sparkles size={10} className="text-purple-500" />
                                历史记录 ({promptHistory.length})
                              </div>
                            </div>
                            {promptHistory.map((historyPrompt, index) => {
                              // 截断过长文本，保留前40个字符
                              const truncatedText = historyPrompt.length > 40 
                                ? historyPrompt.substring(0, 40) + '...' 
                                : historyPrompt;
                              return (
                                <div
                                  key={`history-${index}`}
                                  onClick={() => {
                                    setPromptInput(historyPrompt);
                                    setShowHistory(false);
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

                        {/* 默认提示词列表 */}
                        {DEFAULT_PROMPTS.length > 0 && (
                          <div className="divide-y divide-slate-100 border-t border-dashed border-slate-200">
                            <div className="px-4 py-2.5 text-[10px] font-bold text-blue-600 uppercase tracking-wide bg-blue-50/50 sticky top-0">
                              <div className="flex items-center gap-1.5">
                                <Wand2 size={10} />
                                默认提示词模板
                              </div>
                            </div>
                            {DEFAULT_PROMPTS.map((defaultPrompt, index) => {
                              // 截断过长文本
                              const truncatedText = defaultPrompt.length > 40 
                                ? defaultPrompt.substring(0, 40) + '...' 
                                : defaultPrompt;
                              // 根据内容提取关键词作为标签
                              const getTag = (text: string) => {
                                if (text.includes('Python')) return { label: 'Python', color: 'bg-green-100 text-green-700' };
                                if (text.includes('数学')) return { label: '数学', color: 'bg-blue-100 text-blue-700' };
                                if (text.includes('英语')) return { label: '英语', color: 'bg-amber-100 text-amber-700' };
                                if (text.includes('混合')) return { label: '混合', color: 'bg-purple-100 text-purple-700' };
                                return { label: '通用', color: 'bg-slate-100 text-slate-700' };
                              };
                              const tag = getTag(defaultPrompt);
                              return (
                                <div
                                  key={`default-${index}`}
                                  onClick={() => {
                                    setPromptInput(defaultPrompt);
                                    setShowHistory(false);
                                    // 保存到历史记录
                                    savePromptToHistory(defaultPrompt);
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
                        
                        {/* 空状态提示 */}
                        {promptHistory.length === 0 && (
                          <div className="px-4 py-6 text-center text-sm text-slate-400">
                            <Sparkles size={20} className="mx-auto mb-2 opacity-50" />
                            <div>暂无历史记录</div>
                            <div className="text-[10px] mt-1">使用默认模板或输入自定义提示词</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleGenerateFromPrompt}
                    disabled={!promptInput.trim() || isGenerating}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-purple-100 flex items-center gap-2 whitespace-nowrap"
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
                    {directAIExtract ? (
                      <span className="block mt-1 text-amber-700">✓ 已开启 AI直连提取：上传文件后将直接AI解析，无需额外操作。</span>
                    ) : (
                      <span className="block mt-1 text-slate-500">勾选"AI直连提取"可实现上传后自动解析，一步完成。</span>
                    )}
                  </div>
                </div>
              </div>





              {/* Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-blue-600" /> 选择 AI 解析模型
                  </div>
                  {!localStorage.getItem('ai_settings') && selectedModel !== 'gemini-2.0-flash' && (
                    <span className="text-[10px] text-rose-500 font-bold animate-pulse">
                      需配置 API Key
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
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
                    <span className="font-bold">模型要求:</span>
                    {MODELS.find(m => m.id === selectedModel)?.req}
                  </div>
                </div>
              </div>

              {/* Textarea */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  待解析文本
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在此粘贴题目文本，AI解析后生成结构化题目..."
                  className="w-full h-40 px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleAIParse}
                  disabled={!text.trim() || isParsing}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                >
                  {isParsing ? <Loader2 className="animate-spin" size={18} /> : <Cpu size={18} />}
                  开始 AI 解析
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                  <AlertCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-rose-700">{error}</div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">解析结果预览 ({preview.length} 道题)</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview([])}
                      className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all text-sm"
                    >
                      重新解析
                    </button>
                    <button
                      onClick={handleConfirmImportClick}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center gap-2"
                    >
                      <CheckCircle2 size={18} />
                      确认导入
                    </button>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-3">
                  {preview.map((q, idx) => (
                    <div key={q.id || idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                      <div className="text-sm text-slate-600 mb-1">第 {idx + 1} 题 ({q.type})</div>
                      <div className="font-medium text-slate-800 mb-2">{q.title}</div>
                      {q.options && (
                        <div className="space-y-1 mb-2">
                          {q.options.map((opt, i) => (
                            <div key={i} className="text-sm text-slate-700">• {opt}</div>
                          ))}
                        </div>
                      )}
                      <div className="text-sm text-slate-600">
                        <span className="font-bold">答案:</span>
                        {Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}
                      </div>
                      {q.explanation && (
                        <div className="text-sm text-slate-500 mt-1">
                          <span className="font-bold">解析:</span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Mismatch Confirmation Modal */}
      {showMismatchConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div>
                <h2 className="text-lg font-bold text-rose-800">题库选择错误</h2>
                <p className="text-sm text-rose-600 mt-1">检测到的题目科目与您选择的目标科目不匹配</p>
              </div>
              <button onClick={handleMismatchCancel} className="p-2 hover:bg-rose-100 rounded-full transition-colors">
                <X size={20} className="text-rose-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  检测到题目属于 "{getSubjectDisplayName(detectedSubject)}" 科目,但您选择了 "{getSubjectDisplayNameById(selectedTargetSubject)}" 科目。
                </p>
                <p className="text-sm text-slate-600">
                  <strong>是否仍要继续导入?</strong> 这可能会导致题目被错误分类。
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleMismatchCancel}
                  className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleMismatchConfirm}
                  className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center gap-2"
                >
                  <AlertCircle size={18} />
                  继续导入
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Subject Selection Modal */}
      {isSubjectSelectionOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">选择目标题库</h2>
                {detectedSubject && (
                  <p className="text-sm text-slate-500 mt-1">
                    检测到题目属于 "{getSubjectDisplayName(detectedSubject)}" 科目
                  </p>
                )}
              </div>
              <button onClick={handleSubjectSelectionCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={16} className="text-green-600" /> 请选择目标科目
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    // 过滤掉共享科目，只显示自己创建的科目
                    const mySubjects = (allSubjects && allSubjects.length > 0 ? allSubjects : [
                      { id: 'python' as SubjectId, name: 'Python', icon: '🐍', is_owner: true, is_shared: false },
                      { id: 'english' as SubjectId, name: '英语', icon: '🔤', is_owner: true, is_shared: false },
                      { id: 'chinese' as SubjectId, name: '语文', icon: '📖', is_owner: true, is_shared: false },
                      { id: 'math' as SubjectId, name: '数学', icon: '📐', is_owner: true, is_shared: false }
                    ]).filter(s => {
                      // 排除共享科目：is_owner 为 false 或 is_shared 为 true
                      return s.is_owner !== false && !s.is_shared;
                    });
                    if (mySubjects.length === 0) {
                      return <p className="col-span-2 text-sm text-slate-400 text-center py-6">暂无可导入的题库，请先创建自己的题库</p>;
                    }
                    return mySubjects.map(subject => (
                      <button
                        key={subject.id}
                        onClick={() => setSelectedTargetSubject(subject.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col items-center justify-center ${
                          selectedTargetSubject === subject.id
                            ? 'border-green-600 bg-green-50/50 ring-2 ring-green-50'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <span className="text-2xl mb-1">{subject.icon}</span>
                        <span className="font-bold text-sm text-slate-800">{subject.name}</span>
                      </button>
                    ));
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleSubjectSelectionCancel}
                  className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleSubjectSelectionConfirm}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  确认导入
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>

      {/* Settings Modal - rendered via Portal to body to avoid backdrop-blur stacking context issues */}
      {isSettingsOpen && ReactDOM.createPortal(
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} authUser={authUser} />,
        document.body
      )}
    </>
  );
};