import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings, Key, Globe, Save, ShieldCheck, Loader2 } from 'lucide-react';
import { AISettings } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AISettings>({
    deepseekKey: '',
    qwenKey: '',
    zhipuKey: '',
    customEndpoint: '',
    customKey: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      const user = auth.currentUser;
      if (user) {
        setIsLoading(true);
        try {
          const docRef = doc(db, 'user_settings', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().aiSettings) {
            setSettings(docSnap.data().aiSettings);
          } else {
            // Fallback to localStorage if no cloud settings
            const saved = localStorage.getItem('ai_settings');
            if (saved) setSettings(JSON.parse(saved));
          }
        } catch (e) {
          console.error('Failed to load cloud settings', e);
          const saved = localStorage.getItem('ai_settings');
          if (saved) setSettings(JSON.parse(saved));
        } finally {
          setIsLoading(false);
        }
      } else {
        const saved = localStorage.getItem('ai_settings');
        if (saved) {
          try {
            setSettings(JSON.parse(saved));
          } catch (e) {
            console.error('Failed to load settings', e);
          }
        }
      }
    };

    loadSettings();
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, 'user_settings', user.uid);
        await setDoc(docRef, { aiSettings: settings }, { merge: true });
      }
      // Always save to localStorage for offline/immediate use
      localStorage.setItem('ai_settings', JSON.stringify(settings));
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'user_settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Settings className="text-blue-600" size={24} />
              AI 模型 API 设置
            </h2>
            <p className="text-xs text-slate-500 mt-1">配置个人专属 API Key，数据加密存储</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="text-sm text-slate-500 font-medium">正在加载您的个人设置...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* DeepSeek */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <img src="https://www.deepseek.com/favicon.ico" className="w-4 h-4" alt="DeepSeek" referrerPolicy="no-referrer" />
                  DeepSeek API Key
                </label>
                <input
                  type="password"
                  value={settings.deepseekKey}
                  onChange={(e) => setSettings({ ...settings, deepseekKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all"
                />
              </div>

              {/* Qwen */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Globe size={16} className="text-orange-500" />
                  通义千问 (Qwen) API Key
                </label>
                <input
                  type="password"
                  value={settings.qwenKey}
                  onChange={(e) => setSettings({ ...settings, qwenKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all"
                />
              </div>

              {/* Zhipu */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-purple-500" />
                  智谱清言 (ChatGLM) API Key
                </label>
                <input
                  type="password"
                  value={settings.zhipuKey}
                  onChange={(e) => setSettings({ ...settings, zhipuKey: e.target.value })}
                  placeholder="API Key"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all"
                />
              </div>

              <div className="h-px bg-slate-100 my-2" />

              {/* Custom */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Key size={16} className="text-slate-500" />
                  自定义 OpenAI 兼容接口
                </label>
                <input
                  type="text"
                  value={settings.customEndpoint}
                  onChange={(e) => setSettings({ ...settings, customEndpoint: e.target.value })}
                  placeholder="Base URL (如 https://api.openai.com/v1)"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all"
                />
                <input
                  type="password"
                  value={settings.customKey}
                  onChange={(e) => setSettings({ ...settings, customKey: e.target.value })}
                  placeholder="Custom API Key"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-600 outline-none text-sm transition-all"
                />
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-[10px] text-blue-700 leading-relaxed">
              提示：Gemini 模型已内置，无需额外配置。其他模型需要您提供有效的 API Key 才能使用。设置将与您的账号同步。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            保存配置
          </button>
        </div>
      </motion.div>
    </div>
  );
};
