import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'motion/react';
import { X, Upload, FileText, Clipboard, Loader2, CheckCircle2, AlertCircle, Cpu, Info, Settings, Sparkles, Wand2, Maximize2, ScanText, ExternalLink } from 'lucide-react';
import { extractTextFromPDF, extractTextFromDocx, extractHtmlFromDocx, extractTextFromTxt, extractTextFromMd, extractTextFromDoc, parseCSV, extractTextFromPDFWithOCR, extractTextFromPDFWithPaddleOCR, checkIfPDfIsScanned, onlineOCR, parsePdfSmartOCR } from '../services/fileService';
import { parseQuestionsWithAI, generateQuestionsFromPrompt } from '../services/geminiService';
import { Question, SubjectId, Subject, AISettings } from '../types';
import { authApi, uploadApi, type AuthUser } from '../services/api';
import { SettingsModal } from './SettingsModal';
import { MarkdownEditor } from './MarkdownEditor';
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
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    desc: '速度极快,结构化输出能力强。',
    req: '适合清晰的题目文本,解析效率最高。'
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
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
  isOpen?: boolean;  // Optional, parent controls visibility via conditional rendering
  onClose: () => void;
  onImport: (questions: Question[], targetSubjectId?: string) => void;
  allSubjects?: Subject[];
  currentSubjectId?: SubjectId;
  authUser?: AuthUser | null;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport, allSubjects, currentSubjectId, authUser }) => {
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('last_selected_model') || 'deepseek-v4-flash');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Question[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSubjectSelectionOpen, setIsSubjectSelectionOpen] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [selectedTargetSubject, setSelectedTargetSubject] = useState<SubjectId>('python');
  // 已登录用户从服务端加载的AI设置
  const [serverSettings, setServerSettings] = useState<AISettings | null>(null);
  // 上传中的文件名显示
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  // OCR 相关状态
  const [showOcrDialog, setShowOcrDialog] = useState(false);
  const [ocrPendingFile, setOcrPendingFile] = useState<File | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0, status: '' });
  // OCR 模式: 'none' = 直接解析, 'offline' = 离线OCR, 'online' = 在线OCR
  const [ocrMode, setOcrMode] = useState<'none' | 'offline' | 'online'>('offline');
  // PaddleOCR API 设置对话框
  const [showPaddleOcrSettings, setShowPaddleOcrSettings] = useState(false);
  const [paddleOcrApiKey, setPaddleOcrApiKey] = useState(() => localStorage.getItem('paddle_ocr_api_key') || '97f310b23dcf2639d3a2f29ce5140c8eb4591587');
  const [paddleOcrApiUrl, setPaddleOcrApiUrl] = useState(() => localStorage.getItem('paddle_ocr_api_url') || '');
  
  useEffect(() => {
    // Modal is controlled by parent, so we always try to fetch settings when mounted
    if (!authUser) {
      setServerSettings(null);
      return;
    }
    setServerSettings(null);
    authApi.getSettings().then(res => {
      if (res.settings) setServerSettings(res.settings);
    }).catch(() => {});
  }, [authUser]);
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
    // 清除 input value，允许重复上传同一文件
    e.target.value = '';

    setUploadingFileName(file.name);
    setIsParsing(true);
    setError(null);
    try {
      let extractedText = '';
      const fileSize = (file.size / 1024).toFixed(1);
      
      console.log(`开始解析文件: ${file.name}, 大小: ${fileSize} KB`);
      
      if (file.name.endsWith('.pdf')) {
        try {
          // 尝试正常解析
          const result = await extractTextFromPDF(file);
          extractedText = result.text;
        } catch (err: any) {
          // 检测到可能是扫描件，弹出 OCR 确认框
          if (err.isOcrNeeded) {
            setOcrPendingFile(file);
            setShowOcrDialog(true);
            setIsParsing(false);
            return;
          }
          throw err;
        }
      } else if (file.name.endsWith('.docx')) {
        const { html, images } = await extractHtmlFromDocx(file);
        let md = html;
        // Upload extracted images and replace with Markdown syntax
        if (images.length > 0) {
          const uploadResults = await Promise.allSettled(
            images.map(async (img) => {
              const byteChars = atob(img.data);
              const byteArrays: Uint8Array[] = [];
              for (let offset = 0; offset < byteChars.length; offset += 512) {
                const slice = byteChars.slice(offset, offset + 512);
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
                byteArrays.push(new Uint8Array(byteNumbers));
              }
              const imgFile = new File(byteArrays, `${img.name}.png`, { type: img.mime });
              const { url } = await uploadApi.image(imgFile);
              return { name: img.name, url, mime: img.mime, data: img.data };
            })
          );
          for (const r of uploadResults) {
            if (r.status === 'fulfilled') {
              md = md.split(`data:${r.value.mime};base64,${r.value.data}`).join(r.value.url);
            }
          }
          md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/g, '![]($1)');
        }
        extractedText = md.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else if (file.name.endsWith('.doc')) {
        extractedText = await extractTextFromDoc(file);
      } else if (file.name.endsWith('.txt')) {
        extractedText = await extractTextFromTxt(file);
      } else if (file.name.endsWith('.md')) {
        extractedText = await extractTextFromMd(file);
      } else if (file.name.endsWith('.csv')) {
        // CSV 文件直接解析为题目，跳过 AI 解析步骤
        const parsedQuestions = await parseCSV(file);
        
        const convertedQuestions: Question[] = parsedQuestions.map((pq, idx) => {
          const tempId = -Date.now() - idx;
          return {
            id: tempId,
            subject: currentSubjectId || 'python' as any,
            type: pq.type as any,
            title: pq.title,
            code: pq.code,
            options: pq.options,
            answer: pq.answer,
            explanation: pq.explanation,
            points: pq.points || 5,
            input: pq.input
          };
        });
        
        console.log(`CSV 解析成功，共 ${convertedQuestions.length} 道题目`);
        setPreview(convertedQuestions);
        setIsParsing(false);
        setUploadingFileName(null);
        return;
      } else if (file.name.endsWith('.json')) {
        // JSON 文件直接解析为题目
        const text = await file.text();
        let jsonData: any;
        try {
          jsonData = JSON.parse(text);
        } catch {
          throw new Error('JSON 文件格式错误，无法解析');
        }
        
        const questions = Array.isArray(jsonData) ? jsonData : jsonData.questions;
        if (!questions || !Array.isArray(questions)) {
          throw new Error('JSON 文件中未找到 questions 数组');
        }
        
        const convertedQuestions: Question[] = questions.map((item: any, idx: number) => {
          const tempId = -Date.now() - idx;
          return {
            id: tempId,
            subject: currentSubjectId || 'python' as any,
            type: (item.type || 'single') as any,
            title: item.title || item.title || '',
            code: item.code,
            options: item.options || [],
            answer: item.answer || '',
            explanation: item.explanation || '',
            points: item.points || 5,
            input: item.input
          };
        }).filter((q: Question) => q.title.trim());
        
        console.log(`JSON 解析成功，共 ${convertedQuestions.length} 道题目`);
        setPreview(convertedQuestions);
        setIsParsing(false);
        setUploadingFileName(null);
        return;
      } else {
        throw new Error('不支持的文件格式,请上传 PDF/DOCX/DOC/TXT/MD/CSV/JSON 文件。');
      }
      
      console.log(`文件解析成功，提取文字: ${extractedText.length} 字符`);
      
      if (!extractedText.trim()) {
        throw new Error('文件中没有找到可用的文字内容');
      }
      
      // 将文件内容填充到 AI 生成题目的提示词输入框
      setPromptInput(extractedText);
    } catch (err: any) {
      console.error('文件解析失败:', err);
      setError(err.message || '文件读取失败');
    } finally {
      setIsParsing(false);
      setUploadingFileName(null);
    }
  };
  
  // 处理 OCR 确认
  const handleOcrConfirm = async () => {
    if (!ocrPendingFile) return;
    
    setShowOcrDialog(false);
    setIsOcrProcessing(true);
    setError(null);
    
    try {
      const result = await extractTextFromPDFWithOCR(ocrPendingFile, (progress) => {
        setOcrProgress(progress);
      });
      
      console.log(`OCR 识别完成，提取文字: ${result.text.length} 字符`);
      
      if (!result.text.trim()) {
        throw new Error('OCR 未能识别出任何文字内容');
      }
      
      setPromptInput(result.text);
      setOcrPendingFile(null);
    } catch (err: any) {
      console.error('OCR 识别失败:', err);
      setError(err.message || 'OCR 识别失败');
      setOcrPendingFile(null); // 清除待处理文件，允许重新上传
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress({ current: 0, total: 0, status: '' });
    }
  };
  
  // 取消 OCR
  const handleOcrCancel = () => {
    setShowOcrDialog(false);
    setOcrPendingFile(null);
    setOcrProgress({ current: 0, total: 0, status: '' });
    setError('已取消 OCR 识别。请使用其他格式的文件。');
  };
  
  // 处理直接解析（不经过 OCR）
  const handleDirectParse = async () => {
    if (!ocrPendingFile) return;
    
    setShowOcrDialog(false);
    setIsOcrProcessing(true);
    setOcrProgress({ current: 0, total: 0, status: '正在提取文字...' });
    setError(null);
    
    try {
      // 直接使用普通 PDF 解析，不进行 OCR
      const result = await extractTextFromPDF(ocrPendingFile);
      
      console.log(`直接解析完成，提取文字: ${result.text?.length || 0} 字符, hasOcrResult: ${result.hasOcrResult}`);
      
      if (!result.text?.trim()) {
        throw new Error('此 PDF 为扫描件/图片型，无法直接提取文字，请使用 OCR 识别');
      }
      
      // 如果提取的文字很少，提示用户建议使用 OCR
      if (result.text.trim().length < 50) {
        // 仍然填入提取到的文字，但给出提示
        setPromptInput(result.text + '\n\n[提示：提取到的文字很少，该PDF可能是扫描件，建议使用OCR识别以获取完整内容]');
      } else {
        setPromptInput(result.text);
      }
      setOcrPendingFile(null);
    } catch (err: any) {
      console.error('直接解析失败:', err);
      // 如果是扫描件检测错误，给出友好提示并建议 OCR
      if (err.isOcrNeeded || err.message === 'PDF_SCAN_DETECTED') {
        setError('此 PDF 为扫描件/图片型，无法直接提取文字。请关闭此提示后选择"离线OCR"或"在线OCR"进行识别。');
      } else {
        setError(err.message || '直接解析失败');
      }
      setOcrPendingFile(null); // 清除待处理文件，允许重新上传
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress({ current: 0, total: 0, status: '' });
    }
  };
  
  // 处理在线 OCR 开始（使用 OCR.Space，无需 API Key）
  const handleOnlineOcrStart = async () => {
    if (!ocrPendingFile) return;
    
    setShowOcrDialog(false);
    setIsOcrProcessing(true);
    setError(null);
    
    try {
      // 智能解析：先文本提取，空则自动走 OCR.Space
      const result = await parsePdfSmartOCR(ocrPendingFile, (progress) => {
        setOcrProgress(progress);
      });
      
      console.log(`在线 OCR 识别完成，${result.useOCR ? '通过 OCR' : '直接提取'}文字: ${result.content.length} 字符`);
      
      if (!result.content?.trim()) {
        throw new Error('OCR 未能识别出任何文字内容');
      }
      
      setPromptInput(result.content);
      setOcrPendingFile(null);
    } catch (err: any) {
      console.error('在线 OCR 识别失败:', err);
      setError(err.message || '在线 OCR 识别失败');
      setOcrPendingFile(null); // 清除待处理文件，允许重新上传
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress({ current: 0, total: 0, status: '' });
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
    const mySubjects = (allSubjects || []).filter(s => s.isOwner !== false);
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
    const mySubjects = (allSubjects || []).filter(s => s.isOwner !== false);
    const matched = mySubjects.find(s => s.id === subjectId);
    if (matched) return matched.name;
    // 回退：去掉 ID 后缀获取名称
    const baseName = subjectId.replace(/_\d+$/, '');
    return baseName === 'python' ? 'Python' : baseName === 'english' ? '英语' : baseName === 'chinese' ? '语文' : baseName === 'math' ? '数学' : subjectId;
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

    // 只显示自己创建的科目（排除别人共享给自己的科目）
    const mySubjects = (allSubjects || []).filter(s => {
      return s.isOwner !== false;
    });

    // 默认选中当前正在查看的科目，或第一个自己的科目
    if (currentSubjectId && mySubjects.some(s => s.id === currentSubjectId)) {
      setSelectedTargetSubject(currentSubjectId);
    } else {
      setSelectedTargetSubject(mySubjects[0]?.id || 'python');
    }

    // 打开科目选择模态框
    setIsSubjectSelectionOpen(true);
  };

  const handleSubjectSelectionConfirm = () => {
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
  };

  const handleSubjectSelectionCancel = () => {
    setIsSubjectSelectionOpen(false);
  };

  // Modal is rendered by parent only when needed, isOpen prop check is for safety
  // if (!isOpen) return null;

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
            <p className="text-sm text-slate-500 mt-1">支持 Word、PDF、TXT、MD、CSV、JSON 或直接粘贴文本</p>
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
                    <button
                      onClick={() => setIsPromptExpanded(true)}
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
                      <span className="text-[9px] text-slate-400">PDF/DOCX/DOC/TXT/MD/CSV/JSON</span>
                      <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt,.md,.csv,.json" onChange={handleFileChange} />
                    </label>
                    {uploadingFileName && (
                      <span className="text-[10px] text-purple-600 animate-pulse">
                        正在处理: {uploadingFileName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-col lg:flex-row">
                  <div className="relative flex-1" onFocus={() => setShowHistory(true)} onBlur={() => setTimeout(() => setShowHistory(false), 200)}>
                    <MarkdownEditor
                      value={promptInput}
                      onChange={(v) => { setPromptInput(v); setShowHistory(v.trim() === ''); }}
                      placeholder="输入提示词生成题目，或点击右侧上传文件提取文本..."
                      rows={3}
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
                  {MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model.id); localStorage.setItem('last_selected_model', model.id); }}
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
                  <button
                    onClick={() => setIsTextExpanded(true)}
                    className="ml-2 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title="放大编辑"
                  >
                    <Maximize2 size={14} />
                  </button>
                </label>
                <MarkdownEditor
                  value={text}
                  onChange={setText}
                  placeholder="在此粘贴题目文本，AI解析后生成结构化题目..."
                  rows={8}
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
                <h2 className="text-lg font-bold text-slate-800">准备导入题库</h2>
                <p className="text-sm text-slate-500 mt-1">
                  请选择要导入的目标科目
                </p>
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
                      { id: 'python' as SubjectId, name: 'Python', icon: '🐍', isOwner: true, isShared: false },
                      { id: 'english' as SubjectId, name: '英语', icon: '🔤', isOwner: true, isShared: false },
                      { id: 'chinese' as SubjectId, name: '语文', icon: '📖', isOwner: true, isShared: false },
                      { id: 'math' as SubjectId, name: '数学', icon: '📐', isOwner: true, isShared: false }
                    ]).filter(s => {
                      // 排除共享科目：is_owner 为 false 或 is_shared 为 true
                      return s.isOwner !== false && !s.isShared;
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

      {/* Prompt Expand Modal */}
      {isPromptExpanded && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="text-purple-600" size={20} />
                AI生成题目提示词
              </h3>
              <button 
                onClick={() => setIsPromptExpanded(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <MarkdownEditor
                value={promptInput}
                onChange={setPromptInput}
                placeholder="输入提示词生成题目..."
                rows={18}
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setPromptInput('');
                  setIsPromptExpanded(false);
                }}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all text-sm"
              >
                清空
              </button>
              <button 
                onClick={() => setIsPromptExpanded(false)}
                className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all"
              >
                完成
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Text Expand Modal */}
      {isTextExpanded && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                待解析文本
              </h3>
              <button 
                onClick={() => setIsTextExpanded(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <MarkdownEditor
                value={text}
                onChange={setText}
                placeholder="在此粘贴题目文本，AI解析后生成结构化题目..."
                rows={18}
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setText('');
                  setIsTextExpanded(false);
                }}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all text-sm"
              >
                清空
              </button>
              <button 
                onClick={() => setIsTextExpanded(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                完成
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* OCR Processing Modal */}
      {isOcrProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          >
            <div className="text-center">
              {/* OCR Icon */}
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                ocrMode === 'offline' 
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500' 
                  : 'bg-gradient-to-br from-blue-400 to-indigo-500'
              }`}>
                <ScanText size={32} className="text-white" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                正在 {ocrMode === 'none' ? '直接解析' : (ocrMode === 'offline' ? '离线' : '在线')} OCR 识别
              </h3>
              <p className="text-sm text-slate-500 mb-4">{ocrPendingFile?.name}</p>
              
              {/* Progress Bar */}
              <div className="mb-2">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      ocrMode === 'offline' 
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500' 
                        : 'bg-gradient-to-r from-blue-400 to-indigo-500'
                    }`}
                    style={{ 
                      width: ocrProgress.total > 0 ? `${(ocrProgress.current / ocrProgress.total) * 100}%` : '0%' 
                    }}
                  />
                </div>
              </div>
              
              {/* Progress Text */}
              <p className="text-xs text-slate-500">
                {ocrProgress.status || '正在初始化...'}
                {ocrProgress.total > 0 && ` (${ocrProgress.current}/${ocrProgress.total})`}
              </p>
              
              {/* Tips */}
              <div className={`mt-4 p-3 rounded-lg text-left ${
                ocrMode === 'none' ? 'bg-green-50' : (ocrMode === 'offline' ? 'bg-amber-50' : 'bg-blue-50')
              }`}>
                <p className={`text-xs ${
                  ocrMode === 'none' ? 'text-green-700' : (ocrMode === 'offline' ? 'text-amber-700' : 'text-blue-700')
                }`}>
                  <span className="font-bold">提示：</span>
                  {ocrMode === 'none'
                    ? '直接解析会尝试提取 PDF 中已有的文字内容，速度最快。'
                    : ocrMode === 'offline' 
                      ? '离线 OCR 使用本地 Tesseract 引擎，识别速度取决于文件大小，请耐心等待。'
                      : '在线 OCR 使用 PaddleOCR PP-OCRv5，支持直接上传 PDF，识别速度快、精度高，结果将自动填入输入框。'
                  }
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* OCR Confirm Dialog */}
      {showOcrDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          >
            <div className="text-center">
              {/* Warning Icon */}
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                <ScanText size={32} className="text-white" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 mb-2">检测到扫描件 PDF</h3>
              <p className="text-sm text-slate-500 mb-4">
                此 PDF 似乎不包含可提取的文字，可能是扫描件或图片型 PDF。
              </p>
              
              {/* Options */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4 text-left space-y-3">
                <p className="text-sm font-bold text-slate-700">请选择处理方式：</p>

                {/* Option 1: Offline OCR */}
                <div 
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    ocrMode === 'offline' 
                      ? 'border-amber-500 bg-amber-50' 
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  onClick={() => setOcrMode('offline')}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    ocrMode === 'offline' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                  }`}>
                    {ocrMode === 'offline' && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
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
                  onClick={() => setOcrMode('online')}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    ocrMode === 'online' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                  }`}>
                    {ocrMode === 'online' && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
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
              </div>
              
              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleOcrCancel}
                  className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-all"
                >
                  取消
                </button>
                <button
                  onClick={ocrMode === 'offline' ? handleOcrConfirm : handleOnlineOcrStart}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                    ocrMode === 'offline'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-amber-100'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-blue-100'
                  }`}
                >
                  <ScanText size={16} />
                  {ocrMode === 'offline' ? '开始离线识别' : '开始在线识别'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* PaddleOCR API Settings Dialog */}
      {showPaddleOcrSettings && (
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
                onClick={() => setShowPaddleOcrSettings(false)}
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
                  value={paddleOcrApiKey}
                  onChange={(e) => setPaddleOcrApiKey(e.target.value)}
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
                  value={paddleOcrApiUrl}
                  onChange={(e) => setPaddleOcrApiUrl(e.target.value)}
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
                onClick={() => setShowPaddleOcrSettings(false)}
                className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-all"
              >
                取消
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('paddle_ocr_api_key', paddleOcrApiKey);
                  localStorage.setItem('paddle_ocr_api_url', paddleOcrApiUrl);
                  setShowPaddleOcrSettings(false);
                }}
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
      )}
    </>
  );
};