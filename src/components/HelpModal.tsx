import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, BookOpen, HelpCircle, GraduationCap, Users, Database, Settings,
  Sparkles, Share2, UserCheck, FileText, BarChart3, ChevronRight,
  ChevronDown, Star, BookMarked, RefreshCcw, Filter, Search,
  Shield, Key, Globe, Brain, Layers, CheckCircle2, Target,
  ChevronLeft, Wand2, Upload, Rocket, Zap, Clock, Download,
  Lock, Cloud, Wrench, Code, FolderTree, Package, Scan, Server, User, Trash2
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SectionId = 'overview' | 'quickstart' | 'management' | 'settings' | 'security';

interface Section {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'overview', label: '功能概览', icon: <Rocket size={16} /> },
  { id: 'quickstart', label: '快速开始', icon: <Zap size={16} /> },
  { id: 'management', label: '综合管理', icon: <Layers size={16} /> },
  { id: 'settings', label: 'API 设置', icon: <Settings size={16} /> },
  { id: 'security', label: '安全隐私', icon: <Shield size={16} /> },
];

const content: Record<SectionId, { title: string; items: { q: string; a: React.ReactNode }[] }> = {
  overview: {
    title: '功能概览',
    items: [
      {
        q: '这是一个什么系统？',
        a: (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              <b>海龙在线学习平台</b> 是一款功能强大的在线题库与学习管理系统，帮助您高效管理题目、练习、考试和学员。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <Database size={16} className="text-blue-500" />, label: '题库管理', desc: '按科目分类管理' },
                { icon: <Sparkles size={16} className="text-purple-500" />, label: 'AI 出题', desc: '自动生成高质量题' },
                { icon: <FileText size={16} className="text-green-500" />, label: '在线答题', desc: '模拟真实考试' },
                { icon: <Upload size={16} className="text-amber-500" />, label: '一键导入', desc: 'Word/Excel批量导入' },
                { icon: <Users size={16} className="text-indigo-500" />, label: '学员管理', desc: '查看学习进度' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <span className="shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                    <p className="text-[10px] text-slate-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              🌐 在线体验：<a href="https://www.xiaoyue.shop" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.xiaoyue.shop</a> · 
              GitHub：<a href="https://github.com/guchengman/study-test" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">github.com/guchengman/study-test</a>
            </p>
          </div>
        ),
      },
      {
        q: '解决了哪些痛点？',
        a: (
          <div className="space-y-2">
            {[
              { pain: '期末考试一堆科目，题库整理到手酸', solution: '一个平台搞定所有科目题目，随时切换' },
              { pain: '对着PDF刷题，错过的题下次还错', solution: '智能记录错题本，专门攻克薄弱点' },
              { pain: '出卷子靠复制粘贴，眼睛都要瞎了', solution: 'AI自动生成试卷，一键导出打印' },
              { pain: '学员练习情况靠截图反馈，完全失控', solution: '后台实时统计，每道题的正确率一目了然' },
              { pain: '导入历史题库只能手动一条条录', solution: 'Word/Excel一键导入，1000题分分钟搞定' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[10px]">😫</span>
                <span className="text-slate-500 line-through mr-1">{item.pain}</span>
                <span className="shrink-0 px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-[10px]">✓</span>
                <span className="text-slate-700">{item.solution}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        q: '为什么选择我们？',
        a: (
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '🎨', label: '界面友好', desc: '简洁清晰，一看就会用' },
              { icon: '⚡', label: '响应快速', desc: '前后端分离架构' },
              { icon: '🔒', label: '安全可靠', desc: 'JWT认证，加密存储' },
              { icon: '📦', label: '开箱即用', desc: 'Windows一键安装' },
              { icon: '🔄', label: '持续更新', desc: '活跃维护' },
              { icon: '☁️', label: '云端同步', desc: '多设备数据漫游' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-base">{item.icon}</span>
                <div>
                  <p className="font-semibold text-slate-700">{item.label}</p>
                  <p className="text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        q: '支持哪些平台和扩展？',
        a: (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
              <Globe size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-700">Web 端</p>
                <p className="text-xs text-slate-600">支持 Chrome、Edge、Firefox、Safari 等主流浏览器</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
              <Download size={16} className="text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-700">题库导出</p>
                <p className="text-xs text-slate-600">支持将题库导出为 Word/Excel 格式，方便离线使用或打印</p>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  quickstart: {
    title: '快速开始',
    items: [
      {
        q: '如何开始一次练习？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">进入首页后，您会看到功能卡片区域，分为「快速开始」和「综合管理」两大模块：</p>
            <div className="grid gap-2">
              {[
                { icon: <CheckCircle2 size={14} />, label: '随机练习', desc: '即时反馈，每题答完即显示答案和解析，可自定题数', color: 'green' },
                { icon: <FileText size={14} />, label: '正式考试', desc: '抽取 N 题（默认 20 题），全部答完提交后出分', color: 'blue' },
                { icon: <Database size={14} />, label: '全量测试', desc: '题库所有题目逐一展示，支持搜索/去重/过滤', color: 'purple' },
                { icon: <RefreshCcw size={14} />, label: '错题练习', desc: '自动收集错题，连续答对 3 次自动移除', color: 'rose' },
                { icon: <Star size={14} />, label: '收藏题库', desc: '复习收藏的重点题目', color: 'amber' },
                { icon: <Upload size={14} />, label: '导入题目', desc: '支持 Word/PDF/粘贴文本，AI 智能解析', color: 'indigo' },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs text-slate-600 p-2 bg-${item.color}-50 rounded-lg`}>
                  <span className={`shrink-0 mt-0.5 text-${item.color}-500`}>{item.icon}</span>
                  <span><b>{item.label}</b> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">选择任一卡片即可开始学习。首次使用建议先在设置中配置 AI API Key。</p>
          </div>
        ),
      },
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
        q: '如何切换科目？',
        a: '点击首页顶部的科目标签即可切换。默认有语文、数学、英语、Python 四个科目，登录后您可以创建更多自定义科目。',
      },
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
        q: '需要注册登录吗？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">
              <b>未登录</b>：也可使用基本的练习和考试功能（数据存储在浏览器本地）。
            </p>
            <p className="text-xs text-slate-600">
              <b>登录后</b>：可获得以下高级功能：
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {['云端数据同步', '科目共享协作', '多设备数据漫游', 'AI 设置持久化', '学员管理', '批量导入'].map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                  <span className="text-slate-600">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  management: {
    title: '综合管理',
    items: [
      {
        q: '如何创建自定义科目？',
        a: '登录后，点击首页右上角的「科目管理」按钮，在弹窗中可创建自定义科目。自定义科目支持设置名称、图标、欢迎语和描述，最多可创建 5 个。',
      },
      {
        q: '如何编辑或删除科目？',
        a: '在「科目管理」弹窗中，每个科目卡片右下角有编辑和删除按钮。默认科目（语文/数学/英语/Python）也可编辑名称和图标。系统会提示至少保留 1 个科目。',
      },
      {
        q: '如何重置/清空题库？',
        a: '登录后，点击顶部科目名称旁的「重置」按钮，可一键清空当前科目的所有题目，变为空题库状态。此操作不可恢复，请谨慎使用。',
      },
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
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="text-xs font-semibold text-blue-700">AI 解析</p>
              <p className="text-xs text-slate-600">适用于已有考试资料（试卷、习题文档等），AI 自动识别并提取其中的题目，转换为标准格式。</p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <p className="text-xs font-semibold text-purple-700">AI 生成</p>
              <p className="text-xs text-slate-600">直接输入主题要求（如"生成 10 道 Python 选择题"），AI 根据您的提示词自动创作题目。</p>
            </div>
          </div>
        ),
      },
      {
        q: '支持哪些 AI 模型？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">系统支持多种 AI 模型，可在右上角齿轮图标「API 设置」中配置：</p>
            <div className="flex flex-wrap gap-1.5">
              {['DeepSeek V4 Flash', '通义千问 Max', '智谱 GLM-4', '月之暗面 8K', '百川 53B', 'Gemini 3 Flash', 'Gemini 3 Pro', 'OpenRouter 通用', '自定义接口'].map((m) => (
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
      {
        q: '忘记密码怎么办？',
        a: '在登录页面点击「忘记密码」，输入注册邮箱，系统会发送 6 位验证码，验证通过后即可设置新密码。',
      },
    ],
  },
  settings: {
    title: 'AI 模型 API 设置',
    items: [
      {
        q: '什么是 API？为什么要配置 API？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600"><b>API（应用程序接口）</b>就像一把「钥匙」，允许程序调用 AI 模型来处理您的数据。</p>
            <p className="text-xs text-slate-600">系统中的 AI 功能（导入题目、AI 解析、AI 生成）需要调用第三方 AI 服务。每次调用 AI 都会消耗 API 配额，您需要在各平台充值或使用免费额度来支付这些费用。</p>
            <div className="p-2 bg-amber-50 rounded-lg mt-2">
              <p className="text-xs text-amber-700">💡 您只需配置一次 API Key，之后所有 AI 功能都可以正常使用。</p>
            </div>
          </div>
        ),
      },
      {
        q: '如何配置 API Key？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">点击首页或导入弹窗右上角的齿轮图标，打开 API 设置。三个标签页：</p>
            <div className="space-y-1.5">
              <div className="p-2 bg-blue-50 rounded-lg">
                <p className="text-xs"><b>国产大模型</b></p>
                <p className="text-xs text-slate-600">支持 Gemini、DeepSeek、通义千问、智谱、月之暗面、百川、腾讯混元、文心一言</p>
              </div>
              <div className="p-2 bg-purple-50 rounded-lg">
                <p className="text-xs"><b>OpenRouter</b></p>
                <p className="text-xs text-slate-600">通用接口，支持数百种模型（如 GPT-4o、Claude 等），需配置 API Key 和模型名称</p>
              </div>
              <div className="p-2 bg-green-50 rounded-lg">
                <p className="text-xs"><b>自定义</b></p>
                <p className="text-xs text-slate-600">可接入任何兼容 OpenAI 格式的自定义接口</p>
              </div>
            </div>
          </div>
        ),
      },
      {
        q: '免费 API 申请指南',
        a: (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">以下是提供免费额度的平台，适合日常学习和轻度使用：</p>
            
            <div className="space-y-2">
              <div className="p-2.5 bg-blue-50 rounded-lg">
                <p className="text-xs font-semibold text-blue-700">① Google Gemini（推荐）</p>
                <p className="text-xs text-slate-600 mt-1">免费额度：每分钟 15 次请求，每天 1500 次</p>
                <p className="text-xs text-slate-600">申请地址：<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://aistudio.google.com/app/apikey</a></p>
                <p className="text-xs text-slate-600">步骤：注册 Google 账号 → 进入 AI Studio → 点击「Get API Key」→ 创建密钥</p>
              </div>
              
              <div className="p-2.5 bg-green-50 rounded-lg">
                <p className="text-xs font-semibold text-green-700">② DeepSeek</p>
                <p className="text-xs text-slate-600 mt-1">免费额度：新用户赠送 10 元代金券</p>
                <p className="text-xs text-slate-600">申请地址：<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">https://platform.deepseek.com/api_keys</a></p>
                <p className="text-xs text-slate-600">步骤：注册账号 → 登录控制台 → API Keys → 创建密钥</p>
              </div>
              
              <div className="p-2.5 bg-purple-50 rounded-lg">
                <p className="text-xs font-semibold text-purple-700">③ 阿里云百炼（通义千问）</p>
                <p className="text-xs text-slate-600 mt-1">免费额度：百炼模型赠送 100 万 Tokens</p>
                <p className="text-xs text-slate-600">申请地址：<a href="https://bailian.console.aliyun.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">https://bailian.console.aliyun.com</a></p>
                <p className="text-xs text-slate-600">步骤：注册阿里云账号 → 进入百炼平台 → 开通服务 → 获取密钥</p>
              </div>
              
              <div className="p-2.5 bg-orange-50 rounded-lg">
                <p className="text-xs font-semibold text-orange-700">④ 智谱 AI</p>
                <p className="text-xs text-slate-600 mt-1">免费额度：新用户赠送 500 万 Tokens</p>
                <p className="text-xs text-slate-600">申请地址：<a href="https://open.bigmodel.cn/usercenter/apikeys" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">https://open.bigmodel.cn/usercenter/apikeys</a></p>
                <p className="text-xs text-slate-600">步骤：注册智谱账号 → 进入控制台 → API Keys → 创建密钥</p>
              </div>
              
              <div className="p-2.5 bg-cyan-50 rounded-lg">
                <p className="text-xs font-semibold text-cyan-700">⑤ OpenRouter（支持 GPT/Claude 等）</p>
                <p className="text-xs text-slate-600 mt-1">免费额度：注册赠送 $1 Credits（约 1000 次请求）</p>
                <p className="text-xs text-slate-600">申请地址：<a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">https://openrouter.ai/keys</a></p>
                <p className="text-xs text-slate-600">步骤：注册账号（可用 Google 登录）→ 点击「Keys」→ 创建密钥</p>
              </div>
            </div>
          </div>
        ),
      },
      {
        q: 'API 充值指南',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">当免费额度用完后，可以在各平台充值：</p>
            
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-blue-500">•</span>
                <span><b>Google Gemini</b>：在 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a> 的「Billing」中绑定信用卡，按量付费</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-green-500">•</span>
                <span><b>DeepSeek</b>：在 <a href="https://platform.deepseek.com/top_up" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">控制台充值</a> 页面直接充值，最低 10 元起</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-purple-500">•</span>
                <span><b>阿里云百炼</b>：在 <a href="https://bailian.console.aliyun.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">控制台</a> 充值，支持支付宝/银行卡</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-orange-500">•</span>
                <span><b>智谱 AI</b>：在 <a href="https://open.bigmodel.cn/usercenter Consumption" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">计费管理</a> 页面充值</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-cyan-500">•</span>
                <span><b>OpenRouter</b>：在 <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">Credits 页面</a> 充值，支持信用卡/加密货币</span>
              </div>
            </div>
            
            <div className="p-2 bg-green-50 rounded-lg mt-2">
              <p className="text-xs text-green-700">💡 充值建议：对于题库导入场景，建议每次充值 50-100 元，可使用数月之久。</p>
            </div>
          </div>
        ),
      },
      {
        q: 'API Key 存储在哪里？安全吗？',
        a: (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <Lock size={14} className="text-green-500 shrink-0 mt-0.5" />
              <span className="text-slate-600"><b>登录后</b>：API Key 会加密存储在我们的服务器数据库中，只有您本人可以访问。</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Shield size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="text-slate-600"><b>未登录</b>：存储在浏览器本地（sessionStorage），关闭标签页即清除。</span>
            </div>
            <p className="text-xs text-amber-600 mt-2">⚠️ 建议勿将 API Key 分享给他人。</p>
          </div>
        ),
      },
      {
        q: '推荐使用哪个模型？',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">根据不同场景推荐：</p>
            <div className="grid gap-1.5">
              <div className="flex items-start gap-2 text-xs p-2 bg-green-50 rounded-lg">
                <span className="shrink-0 text-green-500">•</span>
                <span><b>DeepSeek V4 Flash</b> — 首选，速度极快，中文理解能力强，128K 上下文，适合日常使用</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-purple-50 rounded-lg">
                <span className="shrink-0 text-purple-500">•</span>
                <span><b>Gemini 3 Pro</b> — 复杂题目解析时准确率最高</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-blue-50 rounded-lg">
                <span className="shrink-0 text-blue-500">•</span>
                <span><b>通义千问 Max</b> — 中文教育类题目表现出色</span>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  security: {
    title: '安全隐私',
    items: [
      {
        q: '我们的安全承诺',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">我们高度重视用户数据安全，采取多重措施保障您的信息安全：</p>
            <div className="grid gap-2">
              <div className="flex items-start gap-2 text-xs p-2 bg-green-50 rounded-lg">
                <Shield size={14} className="text-green-500 shrink-0 mt-0.5" />
                <span><b>传输加密</b>：所有数据传输采用 HTTPS 加密，确保数据在传输过程中不被窃取</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-blue-50 rounded-lg">
                <Lock size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <span><b>存储加密</b>：敏感数据（如 API Key）使用加密存储，即使数据库泄露也无法被解密</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-purple-50 rounded-lg">
                <Scan size={14} className="text-purple-500 shrink-0 mt-0.5" />
                <span><b>数据隔离</b>：每个用户的数据完全隔离，只有本人可以访问自己的数据</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-amber-50 rounded-lg">
                <Server size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <span><b>安全防护</b>：服务器部署在专业云平台，配备防火墙、DDoS防护等安全措施</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        q: 'API Key 安全说明',
        a: (
          <div className="space-y-2">
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-xs"><b>为什么要保护 API Key？</b></p>
              <p className="text-xs text-slate-600 mt-1">API Key 相当于您 AI 账户的「钥匙」，一旦泄露，他人可能免费使用您的 API 额度。</p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs"><b>我们的保护措施</b></p>
              <p className="text-xs text-slate-600 mt-1">登录后，API Key 会加密存储在服务器数据库中。存储时使用单向加密，即使管理员也无法直接查看您的 Key。</p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <p className="text-xs"><b>安全建议</b></p>
              <ul className="text-xs text-slate-600 mt-1 space-y-1">
                <li>• 请勿将 API Key 直接分享给他人</li>
                <li>• 定期检查 API 使用情况，发现异常及时处理</li>
                <li>• 可以在 AI 平台设置 API Key 的使用限制（如 IP 白名单）</li>
              </ul>
            </div>
          </div>
        ),
      },
      {
        q: '数据存储与隐私',
        a: (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <Database size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span>题目数据、学员信息等存储在云端服务器，支持多设备同步</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <User size={14} className="text-green-500 shrink-0 mt-0.5" />
              <span>我们不会将您的数据用于 AI 模型训练或任何商业目的</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Trash2 size={14} className="text-red-500 shrink-0 mt-0.5" />
              <span>注销账户后，数据将在约定期限内安全删除</span>
            </div>
          </div>
        ),
      },
      {
        q: '考试防作弊机制',
        a: (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">系统提供多种防作弊功能：</p>
            <div className="grid gap-1.5">
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-blue-500">•</span>
                <span><b>随机出题</b>：每个学员的题目顺序和选项顺序随机打乱</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-blue-500">•</span>
                <span><b>时间限制</b>：可设置考试时长，超时自动提交</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-blue-500">•</span>
                <span><b>禁止切屏</b>：可启用离开页面次数限制</span>
              </div>
              <div className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="text-blue-500">•</span>
                <span><b>记录日志</b>：记录答题时长、离开次数等异常行为</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        q: '常见安全建议',
        a: (
          <div className="space-y-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="text-xs font-semibold text-blue-700">账户安全</p>
              <ul className="text-xs text-slate-600 mt-1 space-y-1">
                <li>• 使用强密码（包含大小写字母、数字、特殊字符）</li>
                <li>• 避免在公共电脑上保存登录状态</li>
                <li>• 发现异常登录请及时修改密码</li>
              </ul>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs font-semibold text-green-700">AI 使用安全</p>
              <ul className="text-xs text-slate-600 mt-1 space-y-1">
                <li>• 在 AI 平台设置 API 消费限额，避免意外超额</li>
                <li>• 定期查看 API 使用统计，发现异常及时处理</li>
                <li>• 如发现 API 被盗用，立即在 AI 平台删除该 Key 并重新生成</li>
              </ul>
            </div>
          </div>
        ),
      },
    ],
  },
};

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
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
              <p className="text-xs text-slate-500 mt-0.5">了解所有功能，快速上手 · v2.0</p>
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
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
            <span className="w-1 h-5 bg-blue-500 rounded-full shrink-0" />
            {section.title}
          </h3>
          {section.items.map((item, idx) => {
            const key = `${activeSection}-${idx}`;
            const isExpanded = expandedItems[key] ?? true;
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
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              版本 2.0 · 海龙在线学习平台
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
