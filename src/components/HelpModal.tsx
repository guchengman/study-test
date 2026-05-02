import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, BookOpen, HelpCircle, GraduationCap, Users, Database, Settings,
  Sparkles, Share2, UserCheck, FileText, BarChart3, ChevronRight,
  ChevronDown, Star, BookMarked, RefreshCcw, Filter, Search,
  Shield, Key, Globe, Brain, Layers, CheckCircle2, Target,
  ChevronLeft, Wand2, Upload
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SectionId = 'quickstart' | 'exam' | 'subjects' | 'ai-import' | 'users' | 'share' | 'settings';

interface Section {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'quickstart', label: '快速开始', icon: <Rocket size={16} /> },
  { id: 'exam', label: '考试与练习', icon: <Target size={16} /> },
  { id: 'subjects', label: '科目管理', icon: <Layers size={16} /> },
  { id: 'ai-import', label: 'AI 导入题目', icon: <Sparkles size={16} /> },
  { id: 'users', label: '用户与身份', icon: <Users size={16} /> },
  { id: 'share', label: '科目共享', icon: <Share2 size={16} /> },
  { id: 'settings', label: 'API 设置', icon: <Settings size={16} /> },
];

const content: Record<SectionId, { title: string; items: { q: string; a: React.ReactNode }[] }> = {
  quickstart: {
    title: '快速开始',
    items: [
      {
        q: '如何开始一次练习？',
        a: (
          <div className="space-y-2">
            <p>进入首页后，您会看到 6 个功能卡片：</p>
            <div className="grid gap-2">
              {[
                { icon: <CheckCircle2 size={14} />, label: '随机练习', desc: '即时反馈，每题答完即显示答案和解析，可自定题数' },
                { icon: <FileText size={14} />, label: '正式考试', desc: '抽取 N 题（默认 20 题），全部答完提交后出分' },
                { icon: <Database size={14} />, label: '全量测试', desc: '题库所有题目逐一展示，支持搜索/去重/过滤' },
                { icon: <RefreshCcw size={14} />, label: '错题练习', desc: '自动收集错题，连续答对 3 次自动移除' },
                { icon: <Star size={14} />, label: '收藏题库', desc: '复习收藏的重点题目' },
                { icon: <Upload size={14} />, label: '导入题目', desc: '支持 Word/PDF/粘贴文本，AI 智能解析' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="shrink-0 mt-0.5 text-blue-500">{item.icon}</span>
                  <span><b>{item.label}</b> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2">选择任一卡片即可开始学习。首次使用建议先在设置中配置 AI API Key。</p>
          </div>
        ),
      },
      {
        q: '如何切换科目？',
        a: '点击首页顶部的科目标签即可切换。默认有语文、数学、英语、Python 四个科目，登录后您可以创建更多自定义科目。',
      },
      {
        q: '需要注册登录吗？',
        a: '未登录也可使用基本的练习和考试功能（数据存储在浏览器本地）。登录后可获得：云端数据同步、科目共享协作、多设备数据漫游、AI 设置持久化等高级功能。',
      },
    ],
  },
  exam: {
    title: '考试与练习模式',
    items: [
      {
        q: '四种模式有什么区别？',
        a: (
          <div className="space-y-3">
            <div className="border-l-2 border-green-400 pl-3">
              <p className="text-sm font-semibold text-green-700">随机练习</p>
              <p className="text-xs text-slate-600">即时反馈模式，每答完一题立刻显示答案和解析。可自定义题目数量，适合日常刷题巩固。</p>
            </div>
            <div className="border-l-2 border-blue-400 pl-3">
              <p className="text-sm font-semibold text-blue-700">正式考试</p>
              <p className="text-xs text-slate-600">模拟真实考试，抽取 N 题（默认 20 题），全部完成提交后统一出分。有计时器，不可提前看答案。</p>
            </div>
            <div className="border-l-2 border-purple-400 pl-3">
              <p className="text-sm font-semibold text-purple-700">全量测试</p>
              <p className="text-xs text-slate-600">展示题库中所有题目，支持搜索框搜索、一键去重、仅保留客观题过滤。可收藏或剔除题目。</p>
            </div>
            <div className="border-l-2 border-rose-400 pl-3">
              <p className="text-sm font-semibold text-rose-700">错题练习</p>
              <p className="text-xs text-slate-600">系统自动记录答错的题目，针对薄弱环节强化练习。同一题连续答对 3 次即标记为「已掌握」并移出错题本。</p>
            </div>
          </div>
        ),
      },
      {
        q: '支持哪些题型？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">系统支持三种题型：</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">单选题</span>
              <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">多选题</span>
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">编程题/问答题</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">单选题点击选项自动提交（或手动确认），多选题可多选后手动提交，编程题在代码编辑器中作答后提交。</p>
          </div>
        ),
      },
      {
        q: '如何查看考试结果？',
        a: '提交试卷后自动进入结果页，展示总分、正确数/错误数、用时。每题均展示你的回答 vs 正确答案和解析，错题会标注并计入错题本。',
      },
      {
        q: '全量测试中的搜索和去重功能怎么用？',
        a: '在全量测试模式下，顶部有搜索框可按关键词搜索题目。右侧有「去重」按钮一键基于指纹识别去除重复题目，「客观题」按钮可过滤仅保留选择题。',
      },
    ],
  },
  subjects: {
    title: '科目管理',
    items: [
      {
        q: '如何创建自定义科目？',
        a: '登录后，点击首页右上角的「科目管理」按钮（用户名旁边的齿轮图标），在弹窗中可创建自定义科目。自定义科目支持设置名称、图标、欢迎语和描述，最多可创建 5 个。',
      },
      {
        q: '如何编辑或删除科目？',
        a: '在「科目管理」弹窗中，每个科目卡片右下角有编辑和删除按钮。默认科目（语文/数学/英语/Python）也可编辑名称和图标。系统会提示至少保留 1 个科目。',
      },
      {
        q: '如何重置/清空题库？',
        a: '登录后，点击顶部科目名称旁的「重置」按钮，可一键清空当前科目的所有题目，变为空题库状态。此操作不可恢复，请谨慎使用。',
      },
    ],
  },
  'ai-import': {
    title: 'AI 导入题目',
    items: [
      {
        q: '如何导入题目？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">在首页点击「导入新增题目」卡片，打开导入弹窗。支持以下方式：</p>
            <ul className="text-xs text-slate-600 space-y-1.5">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />直接粘贴文本到输入框，点击「AI 解析」自动提取题目</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />上传 Word (.doc/.docx)、PDF、TXT、Markdown 文件</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />使用「AI 生成」功能，输入主题和数量直接生成题目</li>
            </ul>
          </div>
        ),
      },
      {
        q: 'AI 解析和 AI 生成有什么区别？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600"><b>AI 解析</b>：适用于已有考试资料（试卷、习题文档等），AI 自动识别并提取其中的题目，转换为标准格式。</p>
            <p className="text-xs text-slate-600"><b>AI 生成</b>：直接输入主题要求（如"生成 10 道 Python 选择题"），AI 根据您的提示词自动创作题目。</p>
          </div>
        ),
      },
      {
        q: '支持哪些 AI 模型？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">系统支持多种 AI 模型，可在右上角齿轮图标「API 设置」中配置：</p>
            <div className="flex flex-wrap gap-1.5">
              {['DeepSeek V4 Flash', '通义千问 Max', '智谱 GLM-4', '月之暗面 8K', '百川 53B', 'Gemini 2.0 Flash', 'Gemini 2.5 Pro', 'OpenRouter 通用', '自定义接口'].map((m) => (
                <span key={m} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{m}</span>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">登录后 API Key 保存到服务器，未登录仅保存在浏览器本地。</p>
          </div>
        ),
      },
      {
        q: '导入前可以预览审核吗？',
        a: 'AI 解析/生成完成后，系统会展示题目预览列表。您可以审核每一道题的内容，确认无误后再点击「确认导入」批量存入题库。系统还会自动检测题目所属科目。',
      },
    ],
  },
  users: {
    title: '用户与身份系统',
    items: [
      {
        q: '有哪些用户角色？',
        a: (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">管理员</span>
              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium">老师</span>
              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">学生</span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">独立用户</span>
            </div>
            <p className="text-xs text-slate-600"><b>管理员</b>：最高权限，可管理所有用户</p>
            <p className="text-xs text-slate-600"><b>老师</b>：可创建和管理题库、管理学生、共享科目</p>
            <p className="text-xs text-slate-600"><b>学生</b>：可加入老师的题库进行学习</p>
            <p className="text-xs text-slate-600"><b>独立用户</b>：独立使用，不绑定老师</p>
          </div>
        ),
      },
      {
        q: '如何切换身份？',
        a: '登录后点击右上角用户名，在下拉菜单中选择「切换身份」。独立用户可以自由切换为老师（需绑定手机号）或学生（需邀请码/老师手机号）。管理员不支持切换身份。',
      },
      {
        q: '老师如何管理学生？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">老师角色登录后，顶部会出现「学生管理」按钮，进入后可操作：</p>
            <ul className="text-xs text-slate-600 space-y-1.5">
              <li><span className="font-medium">注册邀请码</span> — 生成邀请码供学生注册时绑定</li>
              <li><span className="font-medium">待审核学生</span> — 审核/拒绝通过手机号申请加入的学生</li>
              <li><span className="font-medium">学生管理</span> — 查看已加入的学生，可移除或重置密码</li>
              <li><span className="font-medium">科目申请</span> — 审核学生加入共享科目的申请</li>
            </ul>
          </div>
        ),
      },
      {
        q: '忘记密码怎么办？',
        a: '在登录页面点击「忘记密码」，输入注册邮箱，系统会发送 6 位验证码，验证通过后即可设置新密码。',
      },
    ],
  },
  share: {
    title: '科目共享与协作',
    items: [
      {
        q: '如何共享自己的科目？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">老师登录后，在「科目管理」弹窗中点击科目右下角的共享图标，可设置：</p>
            <ul className="text-xs text-slate-600 space-y-1.5">
              <li><span className="font-medium">不共享</span> — 仅自己可见</li>
              <li><span className="font-medium">仅共享给学生</span> — 可指定学生，也可全体学生</li>
              <li><span className="font-medium">全员共享</span> — 所有注册用户都可申请加入</li>
            </ul>
            <p className="text-xs text-slate-500 mt-1">设置共享后会自动生成邀请码，将邀请码发给他人即可加入。</p>
          </div>
        ),
      },
      {
        q: '如何加入别人的共享科目？',
        a: '点击顶部「加入科目」按钮，输入对方提供的邀请码即可申请加入。如果共享设置为「全员共享」会直接加入，如果为仅学生共享则需要老师审核。',
      },
      {
        q: '加入共享科目后能看到什么？',
        a: '加入共享科目后，该科目会出现在您的首页科目选择栏中。您可以查看和使用该科目中的所有题目，但不能编辑或删除（只有科目创建者和老师有权限）。',
      },
    ],
  },
  settings: {
    title: 'AI 模型 API 设置',
    items: [
      {
        q: '为什么需要配置 API Key？',
        a: '系统中的 AI 功能（导入题目、AI 解析、AI 生成）需要调用第三方 AI 模型的 API。您需要先在对应平台注册获取 API Key，然后在「API 设置」中配置。登录后保存到服务器，未登录仅保存在浏览器本地。',
      },
      {
        q: '如何配置 API Key？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">点击首页或导入弹窗右上角的齿轮图标，打开 API 设置。三个标签页：</p>
            <div className="space-y-1.5">
              <p className="text-xs"><b>国产大模型</b> — 支持 Gemini、DeepSeek、通义千问、智谱、月之暗面、百川、腾讯混元、文心一言</p>
              <p className="text-xs"><b>OpenRouter</b> — 通用接口，支持数百种模型（如 GPT-4o、Claude 等），需配置 API Key 和模型名称</p>
              <p className="text-xs"><b>自定义</b> — 可接入任何兼容 OpenAI 格式的自定义接口</p>
            </div>
          </div>
        ),
      },
      {
        q: 'API Key 存储在哪里？安全吗？',
        a: '登录后 API Key 会加密存储在我们的服务器数据库中，只有您本人可以访问。未登录时存储在浏览器本地（sessionStorage），关闭标签页即清除。建议勿将 API Key 分享给他人。',
      },
      {
        q: '推荐使用哪个模型？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">根据不同场景推荐：</p>
            <div className="grid gap-1.5">
              <div className="flex items-start gap-2 text-xs"><span className="shrink-0 text-blue-500">•</span><span><b>DeepSeek V4 Flash</b> — 首选，速度极快，中文理解能力强，128K 上下文，适合日常使用</span></div>
              <div className="flex items-start gap-2 text-xs"><span className="shrink-0 text-blue-500">•</span><span><b>Gemini 2.5 Pro</b> — 复杂题目解析时准确率最高</span></div>
              <div className="flex items-start gap-2 text-xs"><span className="shrink-0 text-blue-500">•</span><span><b>通义千问 Max</b> — 中文教育类题目表现出色</span></div>
            </div>
          </div>
        ),
      },
    ],
  },
};

function Rocket({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<SectionId>('quickstart');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (sectionId: SectionId, idx: number) => {
    const key = `${sectionId}-${idx}`;
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const section = content[activeSection];
  if (!section) return null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="text-blue-600" size={20} />
                使用帮助手册
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">了解所有功能，快速上手</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/60 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Section Navigation */}
          <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1 scrollbar-thin">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  activeSection === s.id
                    ? 'bg-white text-blue-700 shadow-sm border border-blue-100'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                }`}
              >
                <span className={activeSection === s.id ? 'text-blue-500' : 'text-slate-400'}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-50">
            <span className="w-1 h-5 bg-blue-500 rounded-full shrink-0" />
            {section.title}
          </h3>
          {section.items.map((item, idx) => {
            const key = `${activeSection}-${idx}`;
            const isExpanded = expandedItems[key] ?? true; // 默认展开
            return (
              <div
                key={idx}
                className="rounded-xl border border-slate-100 overflow-hidden transition-all hover:border-slate-200"
              >
                <button
                  onClick={() => toggleItem(activeSection, idx)}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                      Q
                    </span>
                    {item.q}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-50">
                        <div className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                          <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            A
                          </span>
                          <div className="flex-1 min-w-0">{item.a}</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-400">
            版本 1.0 · 海龙在线学习平台
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            知道了
          </button>
        </div>
      </motion.div>
    </div>
  );
};
