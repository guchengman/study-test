import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Settings, Key, Globe, Save, ShieldCheck, Loader2, Moon, Cloud, Bot, Brain, ChevronDown, ExternalLink, Server } from 'lucide-react';
import { AISettings } from '../types';
import { loadApiConfig, saveApiConfig, initializeDefaultConfig, clearAllApiKeys, maskApiKey, BUILD_TIME_CONFIG } from '../config/apiConfig';
import { authApi, type AuthUser } from '../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser?: AuthUser | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, authUser }) => {
  const [settings, setSettings] = useState<AISettings>({
    deepseekKey: '',
    qwenKey: '',
    zhipuKey: '',
    moonshotKey: '',
    baichuanKey: '',
    hunyuanKey: '',
    ernieKey: '',
    openrouterKey: '',
    openrouterModel: '',
    customEndpoint: '',
    customKey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chinese' | 'openrouter' | 'custom'>('chinese');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isLoggedIn = !!authUser;

  useEffect(() => {
    if (!isOpen) return;
    setSaveError(null);
    setSaveSuccess(false);
    loadSettings();
  }, [isOpen]);

  const loadSettings = async () => {
    if (isLoggedIn) {
      // 已登录：优先从服务器加载
      setIsLoading(true);
      try {
        const res = await authApi.getSettings();
        if (res.settings) {
          setSettings({ ...BUILD_TIME_CONFIG, ...res.settings });
        } else {
          // 服务器无设置，从本地加载作为初始值
          initializeDefaultConfig();
          setSettings(loadApiConfig());
        }
      } catch {
        // 服务器加载失败，降级到本地
        initializeDefaultConfig();
        setSettings(loadApiConfig());
      } finally {
        setIsLoading(false);
      }
    } else {
      // 未登录：使用本地存储
      initializeDefaultConfig();
      setSettings(loadApiConfig());
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      // 总是保存到本地（作为临时/离线使用）
      saveApiConfig(settings);

      if (isLoggedIn) {
        // 已登录：同步保存到服务器
        await authApi.saveSettings(settings);
      }
      setSaveSuccess(true);
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setSaveError(err.response?.data?.error || err.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // API registration links
  const apiLinks: Record<string, { url: string; text: string }> = {
    gemini: { url: 'https://aistudio.google.com/app/apikey', text: '获取 Gemini API Key' },
    deepseek: { url: 'https://platform.deepseek.com/api_keys', text: '获取 DeepSeek API Key' },
    qwen: { url: 'https://bailian.console.aliyun.com/api-key', text: '获取通义千问 API Key' },
    zhipu: { url: 'https://open.bigmodel.cn/console/apigray/key', text: '获取智谱 API Key' },
    moonshot: { url: 'https://platform.moonshot.cn/console/api-keys', text: '获取 Moonshot API Key' },
    baichuan: { url: 'https://platform.baichuan-ai.com/home/my-key', text: '获取百川 API Key' },
    hunyuan: { url: 'https://cloud.tencent.com/document/product/1729/97766', text: '获取腾讯混元 API Key' },
    ernie: { url: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/interface', text: '获取文心 API Key' },
    openrouter: { url: 'https://openrouter.ai/keys', text: '获取 OpenRouter API Key' },
    custom: { url: 'https://openrouter.ai/keys', text: '获取 API Key' },
  };

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const renderApiInput = (
    label: React.ReactNode,
    value: string | undefined,
    onChange: (v: string) => void,
    placeholder: string,
    apiKey: string
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span className="flex items-center gap-2">{label}</span>
        <div className="flex items-center gap-2">
          {value && !showKeys[apiKey] && (
            <span className="text-[10px] text-slate-400 font-mono">{maskApiKey(value)}</span>
          )}
          {apiLinks[apiKey] && (
            <a
              href={apiLinks[apiKey].url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-[10px] font-normal px-2 py-0.5 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
            >
              <ExternalLink size={10} />
              {apiLinks[apiKey].text}
            </a>
          )}
        </div>
      </label>
      <div className="relative">
        <input
          type={showKeys[apiKey] ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-14 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm transition-all"
        />
        {value && (
          <button
            type="button"
            onClick={() => setShowKeys({ ...showKeys, [apiKey]: !showKeys[apiKey] })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded transition-colors"
          >
            {showKeys[apiKey] ? '隐藏' : '显示'}
          </button>
        )}
      </div>
    </div>
  );

  const renderChineseModels = () => (
    <div className="space-y-3">
      {renderApiInput(
        <>
          <img src="https://www.gstatic.com/ai/brain/logo.png" className="w-3.5 h-3.5" alt="Gemini" referrerPolicy="no-referrer" />
          Gemini API Key
        </>,
        settings.geminiKey,
        (v) => setSettings({ ...settings, geminiKey: v }),
        'AIza...',
        'gemini'
      )}
      {renderApiInput(
        <>
          <img src="https://www.deepseek.com/favicon.ico" className="w-3.5 h-3.5" alt="DeepSeek" referrerPolicy="no-referrer" />
          DeepSeek API Key
        </>,
        settings.deepseekKey,
        (v) => setSettings({ ...settings, deepseekKey: v }),
        'sk-...',
        'deepseek'
      )}
      {renderApiInput(
        <>
          <Globe size={14} className="text-orange-500" />
          通义千问 (Qwen) API Key
        </>,
        settings.qwenKey,
        (v) => setSettings({ ...settings, qwenKey: v }),
        'sk-...',
        'qwen'
      )}
      {renderApiInput(
        <>
          <ShieldCheck size={14} className="text-purple-500" />
          智谱清言 (ChatGLM) API Key
        </>,
        settings.zhipuKey,
        (v) => setSettings({ ...settings, zhipuKey: v }),
        'API Key',
        'zhipu'
      )}
      {renderApiInput(
        <>
          <Moon size={14} className="text-gray-700" />
          月之暗面 (Moonshot) API Key
        </>,
        settings.moonshotKey,
        (v) => setSettings({ ...settings, moonshotKey: v }),
        'sk-...',
        'moonshot'
      )}
      {renderApiInput(
        <>
          <Cloud size={14} className="text-blue-600" />
          百川智能 (Baichuan) API Key
        </>,
        settings.baichuanKey,
        (v) => setSettings({ ...settings, baichuanKey: v }),
        'API Key',
        'baichuan'
      )}
      {renderApiInput(
        <>
          <Brain size={14} className="text-green-600" />
          腾讯混元 (HunYuan) API Key
        </>,
        settings.hunyuanKey,
        (v) => setSettings({ ...settings, hunyuanKey: v }),
        'API Key',
        'hunyuan'
      )}
      {renderApiInput(
        <>
          <Bot size={14} className="text-red-500" />
          百度文心一言 (ERNIE) API Key
        </>,
        settings.ernieKey,
        (v) => setSettings({ ...settings, ernieKey: v }),
        'API Key',
        'ernie'
      )}
    </div>
  );

  const renderOpenRouter = () => (
    <div className="space-y-3">
      {renderApiInput(
        <>
          <Key size={14} className="text-indigo-600" />
          OpenRouter API Key
        </>,
        settings.openrouterKey,
        (v) => setSettings({ ...settings, openrouterKey: v }),
        'sk-or-v1-...',
        'openrouter'
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700">
          OpenRouter 模型名称
        </label>
        <input
          type="text"
          value={settings.openrouterModel}
          onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
          placeholder="如 openai/gpt-4o, anthropic/claude-3.5-sonnet"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm transition-all"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          支持所有 OpenRouter 平台的模型，格式为 provider/model-name
        </p>
      </div>
    </div>
  );

  const renderCustom = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
          <Key size={14} className="text-slate-500" />
          自定义接口 Base URL
        </label>
        <input
          type="text"
          value={settings.customEndpoint}
          onChange={(e) => setSettings({ ...settings, customEndpoint: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm transition-all"
        />
      </div>
      {renderApiInput(
        <>
          <Key size={14} className="text-slate-500" />
          自定义 API Key
        </>,
        settings.customKey,
        (v) => setSettings({ ...settings, customKey: v }),
        'Custom API Key',
        'custom'
      )}
      <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
        <p className="text-[10px] text-amber-700 leading-relaxed">
          提示：此接口需兼容 OpenAI API 格式，支持大多数开源模型部署
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings className="text-blue-600" size={20} />
                AI 模型 API 设置
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isLoggedIn ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <Server size={12} />
                    已登录 - 设置将保存到您的账号
                  </span>
                ) : (
                  '配置个人专属 API Key，数据本地存储'
                )}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex mt-4 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('chinese')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'chinese'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              国产大模型
            </button>
            <button
              onClick={() => setActiveTab('openrouter')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'openrouter'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              OpenRouter
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'custom'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              自定义
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-600" size={24} />
              <span className="ml-2 text-sm text-slate-500">加载中...</span>
            </div>
          ) : (
            <>
              {activeTab === 'chinese' && renderChineseModels()}
              {activeTab === 'openrouter' && renderOpenRouter()}
              {activeTab === 'custom' && renderCustom()}

              {activeTab === 'chinese' && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-700 leading-relaxed">
                    💡 请先点击输入框旁边的链接注册并获取 API Key，然后粘贴到此处。
                    {isLoggedIn
                      ? '您的 API Key 将保存到服务器，登录后可在任何设备上使用。'
                      : '您的 API Key 将存储在浏览器本地，不会发送到任何服务器。'}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 保存成功提示 */}
          {saveSuccess && (
            <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs text-green-600 text-center font-medium">保存成功</p>
            </div>
          )}

          {/* 保存错误提示 */}
          {saveError && (
            <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-600 text-center">{saveError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm('确定要清除所有已保存的 API Key 吗？此操作不可恢复。')) {
                clearAllApiKeys();
                setSettings({ ...BUILD_TIME_CONFIG });
              }
            }}
            className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-all text-xs"
          >
            清除所有 Key
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-all text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5 text-sm"
            >
              {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              保存配置
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
