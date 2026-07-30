import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'motion/react';
import { X, Settings, ScanText, Upload } from 'lucide-react';
import {
  extractTextFromPDF,
  extractHtmlFromDocx,
  extractTextFromTxt,
  extractTextFromMd,
  extractTextFromDoc,
  parseCSV,
  extractTextFromPDFWithOCR,
  parsePdfSmartOCR,
  parsePdfWithAIVision,
} from '../services/fileService';
import { parseQuestionsWithAI, generateQuestionsFromPrompt } from '../services/geminiService';
import { batchImageToLatex } from '../services/formulaService';
import { parseQuestionsFromMd } from '../services/mdParserService';
import { Question, SubjectId, Subject, AISettings } from '../types';
import { authApi, uploadApi, type AuthUser } from '../services/api';
import { SettingsModal } from './SettingsModal';
import { MarkdownEditor } from './MarkdownEditor';
import { STORAGE_KEYS } from '../constants/storage';
import { ImportTabs } from './import/ImportTabs';
import { PreviewList } from './import/PreviewList';
import { SubjectPicker } from './import/SubjectPicker';
import { OcrDialog, type OcrMode } from './import/OcrDialog';
import { PaddleOcrSettings } from './import/PaddleOcrSettings';
import { convertParsedQuestions } from './import/questionConvert';

interface ImportModalProps {
  isOpen?: boolean; // Optional, parent controls visibility via conditional rendering
  onClose: () => void;
  onImport: (questions: Question[], targetSubjectId?: string) => void;
  allSubjects?: Subject[];
  currentSubjectId?: SubjectId;
  authUser?: AuthUser | null;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  onClose,
  onImport,
  allSubjects,
  currentSubjectId,
  authUser,
}) => {
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem('last_selected_model') || 'deepseek-v4-flash'
  );
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
  // OCR 模式: 'none' = 直接解析, 'offline' = 离线OCR, 'online' = 在线OCR, 'ai' = 在线AI识别
  const [ocrMode, setOcrMode] = useState<OcrMode>('offline');
  // AI 视觉识别模型
  const [aiVisionModel, setAiVisionModel] = useState(
    () => localStorage.getItem('last_ai_vision_model') || 'gemini-3-flash-preview'
  );
  // PaddleOCR API 设置对话框
  const [showPaddleOcrSettings, setShowPaddleOcrSettings] = useState(false);
  const [paddleOcrApiKey, setPaddleOcrApiKey] = useState(
    () => localStorage.getItem('paddle_ocr_api_key') || import.meta.env.VITE_PADDLEOCR_API_KEY || ''
  );
  const [paddleOcrApiUrl, setPaddleOcrApiUrl] = useState(
    () => localStorage.getItem('paddle_ocr_api_url') || ''
  );
  // 公式识别相关状态
  const [convertFormulaEnabled, setConvertFormulaEnabled] = useState(true);
  const [isConvertingFormula, setIsConvertingFormula] = useState(false);
  const [formulaProgress, setFormulaProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  useEffect(() => {
    // Modal is controlled by parent, so we always try to fetch settings when mounted
    if (!authUser) {
      setServerSettings(null);
      return;
    }
    setServerSettings(null);
    authApi.getSettings().then((res) => {
      if (res.settings) setServerSettings(res.settings);
    }).catch(() => {});
  }, [authUser]);

  const [promptInput, setPromptInput] = useState('');
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
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
          const result = await extractTextFromPDF(file);
          extractedText = result.text;
        } catch (err: any) {
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
        const imageReplacements: Map<string, string> = new Map();

        if (images.length > 0 && convertFormulaEnabled) {
          setIsConvertingFormula(true);
          setFormulaProgress({ current: 0, total: images.length, success: 0, failed: 0 });

          let formulaResults: Awaited<ReturnType<typeof batchImageToLatex>> = [];
          try {
            formulaResults = await batchImageToLatex(
              images.map((img) => ({ data: img.data })),
              (current, total, success, failed) => {
                setFormulaProgress({ current, total, success, failed });
              }
            );
          } catch (err) {
            console.warn('公式识别整体异常，降级为原图上传:', err);
          } finally {
            setIsConvertingFormula(false);
          }

          if (formulaResults.length > 0) {
            const uploadTasks: Promise<{ name: string; url: string; mime: string; data: string } | null>[] = [];
            for (let i = 0; i < images.length; i++) {
              const img = images[i];
              const result = formulaResults[i];
              if (result?.isFormula && result.latex) {
                const dataUri = `data:${img.mime};base64,${img.data}`;
                imageReplacements.set(dataUri, result.latex);
              } else {
                uploadTasks.push(
                  (async () => {
                    try {
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
                    } catch {
                      return null;
                    }
                  })()
                );
              }
            }
            const uploadResults = await Promise.allSettled(uploadTasks);
            for (const r of uploadResults) {
              if (r.status === 'fulfilled' && r.value) {
                imageReplacements.set(`data:${r.value.mime};base64,${r.value.data}`, r.value.url);
              }
            }
          } else {
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
                imageReplacements.set(`data:${r.value.mime};base64,${r.value.data}`, r.value.url);
              }
            }
          }
        } else if (images.length > 0) {
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
              imageReplacements.set(`data:${r.value.mime};base64,${r.value.data}`, r.value.url);
            }
          }
        }

        for (const [dataUri, replacement] of imageReplacements) {
          md = md.split(dataUri).join(replacement);
        }
        md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/g, '![]($1)');
        extractedText = md.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else if (file.name.endsWith('.doc')) {
        extractedText = await extractTextFromDoc(file);
      } else if (file.name.endsWith('.txt')) {
        extractedText = await extractTextFromTxt(file);
      } else if (file.name.endsWith('.md')) {
        const mdText = await extractTextFromMd(file);
        const parsedFromMd = parseQuestionsFromMd(mdText);
        if (parsedFromMd.length > 0) {
          const convertedQuestions = convertParsedQuestions(parsedFromMd, currentSubjectId);
          console.log(`MD 标准化解析成功，共 ${convertedQuestions.length} 道题目`);
          setPreview(convertedQuestions);
          setIsParsing(false);
          setUploadingFileName(null);
          return;
        }
        extractedText = mdText;
      } else if (file.name.endsWith('.csv')) {
        const parsedQuestions = await parseCSV(file);
        const convertedQuestions = convertParsedQuestions(parsedQuestions, currentSubjectId);
        console.log(`CSV 解析成功，共 ${convertedQuestions.length} 道题目`);
        setPreview(convertedQuestions);
        setIsParsing(false);
        setUploadingFileName(null);
        return;
      } else if (file.name.endsWith('.json')) {
        const fileText = await file.text();
        let jsonData: any;
        try {
          jsonData = JSON.parse(fileText);
        } catch {
          throw new Error('JSON 文件格式错误，无法解析');
        }

        const questions = Array.isArray(jsonData) ? jsonData : jsonData.questions;
        if (!questions || !Array.isArray(questions)) {
          throw new Error('JSON 文件中未找到 questions 数组');
        }

        const convertedQuestions = convertParsedQuestions(questions, currentSubjectId).filter(
          (q) => q.title.trim()
        );

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

      setPromptInput(extractedText);
    } catch (err: any) {
      console.error('文件解析失败:', err);
      setError(err.message || '文件读取失败');
    } finally {
      setIsParsing(false);
      setIsConvertingFormula(false);
      setUploadingFileName(null);
    }
  };

  // 处理 OCR 确认（离线识别）
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
      setOcrPendingFile(null);
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

  // 处理在线 OCR 开始（使用 OCR.Space，无需 API Key）
  const handleOnlineOcrStart = async () => {
    if (!ocrPendingFile) return;

    setShowOcrDialog(false);
    setIsOcrProcessing(true);
    setError(null);

    try {
      const result = await parsePdfSmartOCR(ocrPendingFile, (progress) => {
        setOcrProgress(progress);
      });

      console.log(
        `在线 OCR 识别完成，${result.useOCR ? '通过 OCR' : '直接提取'}文字: ${result.content.length} 字符`
      );

      if (!result.content?.trim()) {
        throw new Error('OCR 未能识别出任何文字内容');
      }

      setPromptInput(result.content);
      setOcrPendingFile(null);
    } catch (err: any) {
      console.error('在线 OCR 识别失败:', err);
      setError(err.message || '在线 OCR 识别失败');
      setOcrPendingFile(null);
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress({ current: 0, total: 0, status: '' });
    }
  };

  // 处理在线AI识别（多模态 AI 直接识别整页内容，无需 OCR）
  const handleAiVisionOcrStart = async () => {
    if (!ocrPendingFile) return;

    setShowOcrDialog(false);
    setIsOcrProcessing(true);
    setError(null);

    try {
      const result = await parsePdfWithAIVision(
        ocrPendingFile,
        aiVisionModel,
        (progress) => {
          setOcrProgress(progress);
        },
        serverSettings || undefined
      );

      console.log(`AI 视觉识别完成 (${aiVisionModel})，提取文字: ${result.content.length} 字符`);

      if (!result.content?.trim()) {
        throw new Error('AI 未能识别出任何内容，请检查 API Key 配置或尝试其他识别方式');
      }

      setPromptInput(result.content);
      setOcrPendingFile(null);
    } catch (err: any) {
      console.error('AI 视觉识别失败:', err);
      setError(err.message || 'AI 视觉识别失败');
      setOcrPendingFile(null);
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress({ current: 0, total: 0, status: '' });
    }
  };

  // OCR 对话框确认：根据当前模式分发到具体 handler
  const handleOcrDialogConfirm = () => {
    if (ocrMode === 'offline') handleOcrConfirm();
    else if (ocrMode === 'ai') handleAiVisionOcrStart();
    else handleOnlineOcrStart();
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

    const newHistory = [prompt, ...promptHistory.filter((p) => p !== prompt)];
    const limitedHistory = newHistory.slice(0, 10);

    setPromptHistory(limitedHistory);
    localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(limitedHistory));
  };

  // 根据提示词生成题目
  const handleGenerateFromPrompt = async () => {
    if (!promptInput.trim()) return;

    setIsGenerating(true);
    setError(null);
    try {
      const generatedText = await generateQuestionsFromPrompt(
        promptInput,
        selectedModel,
        serverSettings || undefined
      );
      setText(generatedText);
      savePromptToHistory(promptInput);
    } catch (err: any) {
      setError(err.message || 'AI 生成失败');
    } finally {
      setIsGenerating(false);
      setShowHistory(false);
    }
  };

  // 下载标准化 MD 模板文件
  const handleDownloadTemplate = () => {
    const template = `### 单选题 | 分值:5 | 难度:基础 | 知识点:二次函数
题干：已知二次函数 $f(x)=ax^2+bx+c$ 的对称轴方程为？
A. $x=-\\frac{b}{2a}$
B. $x=\\frac{b}{2a}$
C. $x=-\\frac{c}{a}$
D. $x=\\frac{c}{a}$
**答案：A**
解析：二次函数对称轴公式为 $x=-\\frac{b}{2a}$。

### 多选题 | 分值:8 | 难度:中等 | 知识点:化学方程式
题干：下列哪些化学方程式书写正确？
A. $2H_2 + O_2 \\rightarrow 2H_2O$
B. $H_2 + O_2 \\rightarrow H_2O$
C. $C + O_2 \\rightarrow CO_2$
D. $2Mg + O_2 \\rightarrow 2MgO$
**答案：A,C,D**
解析：B 选项未配平，正确的应为 $2H_2 + O_2 \\rightarrow 2H_2O$。

### 单选题 | 分值:5 | 难度:困难 | 知识点:英语语法
题干：Which of the following sentences is grammatically correct?
A. He **don't** like coffee.
B. She **doesn't** speaks English.
C. They **have** already finished their homework.
D. I **has** seen that movie.
**答案：C**
解析：A应为doesn't，B应为speak，D应为have。
`;
    const blob = new Blob([template], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '题库导入模板.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 验证题目格式
  const validateQuestions = (questions: Question[]): { valid: Question[]; invalid: Question[] } => {
    const valid: Question[] = [];
    const invalid: Question[] = [];

    for (const q of questions) {
      let isValid = true;

      if (!q.title || !q.answer || !q.type || !q.subject) {
        isValid = false;
      }

      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length === 0)) {
        isValid = false;
      }

      if (q.type === 'single' && Array.isArray(q.answer)) {
        q.answer = q.answer[0] || '';
      }

      if (q.type === 'multiple' && !Array.isArray(q.answer)) {
        q.answer = [String(q.answer)];
      }

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

    const { valid, invalid } = validateQuestions([...preview]);

    if (invalid.length > 0) {
      setError(`发现 ${invalid.length} 道题目格式有问题,已自动修复部分问题。建议检查题目内容是否完整。`);
      setPreview(valid);
    }

    const mySubjects = (allSubjects || []).filter((s) => s.isOwner !== false);

    if (currentSubjectId && mySubjects.some((s) => s.id === currentSubjectId)) {
      setSelectedTargetSubject(currentSubjectId);
    } else {
      setSelectedTargetSubject(mySubjects[0]?.id || 'python');
    }

    setIsSubjectSelectionOpen(true);
  };

  const handleSubjectSelectionConfirm = () => {
    const finalQuestions = preview.map((q) => ({
      ...q,
      subject: selectedTargetSubject,
    }));

    const { valid } = validateQuestions(finalQuestions);

    onImport(valid, selectedTargetSubject);
    onClose();
    setPreview([]);
    setText('');
    setPromptInput('');
    setIsSubjectSelectionOpen(false);
  };

  const handleSubjectSelectionCancel = () => {
    setIsSubjectSelectionOpen(false);
  };

  // OCR 处理中遮罩
  const renderOcrProcessing = () => {
    if (!isOcrProcessing) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        >
          <div className="text-center">
            <div
              className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                ocrMode === 'offline'
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                  : 'bg-gradient-to-br from-blue-400 to-indigo-500'
              }`}
            >
              <ScanText size={32} className="text-white" />
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-2">
              正在 {ocrMode === 'none' ? '直接解析' : ocrMode === 'offline' ? '离线' : '在线'} OCR 识别
            </h3>
            <p className="text-sm text-slate-500 mb-4">{ocrPendingFile?.name}</p>

            <div className="mb-2">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    ocrMode === 'offline'
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                      : 'bg-gradient-to-r from-blue-400 to-indigo-500'
                  }`}
                  style={{
                    width:
                      ocrProgress.total > 0
                        ? `${(ocrProgress.current / ocrProgress.total) * 100}%`
                        : '0%',
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {ocrProgress.status || '正在初始化...'}
              {ocrProgress.total > 0 && ` (${ocrProgress.current}/${ocrProgress.total})`}
            </p>

            <div
              className={`mt-4 p-3 rounded-lg text-left ${
                ocrMode === 'none' ? 'bg-green-50' : ocrMode === 'offline' ? 'bg-amber-50' : 'bg-blue-50'
              }`}
            >
              <p
                className={`text-xs ${
                  ocrMode === 'none'
                    ? 'text-green-700'
                    : ocrMode === 'offline'
                    ? 'text-amber-700'
                    : 'text-blue-700'
                }`}
              >
                <span className="font-bold">提示：</span>
                {ocrMode === 'none'
                  ? '直接解析会尝试提取 PDF 中已有的文字内容，速度最快。'
                  : ocrMode === 'offline'
                  ? '离线 OCR 使用本地 Tesseract 引擎，识别速度取决于文件大小，请耐心等待。'
                  : '在线 OCR 使用 PaddleOCR PP-OCRv5，支持直接上传 PDF，识别速度快、精度高，结果将自动填入输入框。'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

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
              <ImportTabs
                promptInput={promptInput}
                onPromptInputChange={setPromptInput}
                showHistory={showHistory}
                onShowHistoryChange={setShowHistory}
                promptHistory={promptHistory}
                onSavePromptToHistory={savePromptToHistory}
                isGenerating={isGenerating}
                onGenerateFromPrompt={handleGenerateFromPrompt}
                selectedModel={selectedModel}
                onSelectedModelChange={setSelectedModel}
                text={text}
                onTextChange={setText}
                isParsing={isParsing}
                onAIParse={handleAIParse}
                isConvertingFormula={isConvertingFormula}
                formulaProgress={formulaProgress}
                uploadingFileName={uploadingFileName}
                convertFormulaEnabled={convertFormulaEnabled}
                onConvertFormulaEnabledChange={setConvertFormulaEnabled}
                onFileChange={handleFileChange}
                onDownloadTemplate={handleDownloadTemplate}
                onExpandPrompt={() => setIsPromptExpanded(true)}
                onExpandText={() => setIsTextExpanded(true)}
                error={error}
              />
            ) : (
              <PreviewList
                preview={preview}
                onReparse={() => setPreview([])}
                onConfirm={handleConfirmImportClick}
              />
            )}
          </div>
        </motion.div>

        {/* Subject Selection Modal */}
        <SubjectPicker
          isOpen={isSubjectSelectionOpen}
          allSubjects={allSubjects}
          selectedTargetSubject={selectedTargetSubject}
          onSelect={setSelectedTargetSubject}
          onCancel={handleSubjectSelectionCancel}
          onConfirm={handleSubjectSelectionConfirm}
        />
      </div>

      {/* Settings Modal */}
      {isSettingsOpen &&
        ReactDOM.createPortal(
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} authUser={authUser} />,
          document.body
        )}

      {/* Prompt Expand Modal */}
      {isPromptExpanded &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
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
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Text Expand Modal */}
      {isTextExpanded &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
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
      {renderOcrProcessing()}

      {/* OCR Confirm Dialog */}
      <OcrDialog
        isOpen={showOcrDialog}
        ocrMode={ocrMode}
        onOcrModeChange={setOcrMode}
        aiVisionModel={aiVisionModel}
        onAiVisionModelChange={(m) => {
          setAiVisionModel(m);
          localStorage.setItem('last_ai_vision_model', m);
        }}
        onCancel={handleOcrCancel}
        onConfirm={handleOcrDialogConfirm}
      />

      {/* PaddleOCR API Settings Dialog */}
      <PaddleOcrSettings
        isOpen={showPaddleOcrSettings}
        apiKey={paddleOcrApiKey}
        apiUrl={paddleOcrApiUrl}
        onApiKeyChange={setPaddleOcrApiKey}
        onApiUrlChange={setPaddleOcrApiUrl}
        onClose={() => setShowPaddleOcrSettings(false)}
        onSave={() => {
          localStorage.setItem('paddle_ocr_api_key', paddleOcrApiKey);
          localStorage.setItem('paddle_ocr_api_url', paddleOcrApiUrl);
          setShowPaddleOcrSettings(false);
        }}
      />
    </>
  );
};
