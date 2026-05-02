/**
 * API Configuration Manager
 * This module handles loading API configuration from environment variables
 * and provides fallback to localStorage for user-specific settings.
 */

import { AISettings } from '../types';

// Default configuration - always empty for packaged app, users must enter their own API keys
export const BUILD_TIME_CONFIG: AISettings = {
  geminiKey: '',
  deepseekKey: '',
  qwenKey: '',
  zhipuKey: '',
  moonshotKey: '',
  baichuanKey: '',
  hunyuanKey: '',
  ernieKey: '',
  openrouterKey: '',
  openrouterModel: 'openai/gpt-4o',
  customEndpoint: '',
  customKey: '',
};

/**
 * 掩码 API Key，只显示后4位
 * @param key 原始 API Key
 * @returns 脱敏后的字符串，如 "****abcd"
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return key ? '****' : '';
  return '****' + key.slice(-4);
}

/**
 * Load API configuration from sessionStorage (runtime) with fallback to build-time config
 * 使用 sessionStorage 代替 localStorage，关闭标签页即清除，减少 API Key 持久暴露风险
 * @returns AISettings object with loaded configuration
 */
export function loadApiConfig(): AISettings {
  try {
    const savedSettings = sessionStorage.getItem('ai_settings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        return { ...BUILD_TIME_CONFIG, ...parsedSettings };
      } catch (e) {
        console.warn('Failed to parse sessionStorage settings, using build-time defaults');
      }
    }
  } catch (e) {
    console.warn('Failed to access sessionStorage, using build-time defaults');
  }
  
  return { ...BUILD_TIME_CONFIG };
}

/**
 * Save API configuration to sessionStorage
 * @param settings AISettings to save
 */
export function saveApiConfig(settings: AISettings): void {
  try {
    sessionStorage.setItem('ai_settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save API configuration:', e);
  }
}

/**
 * Get a specific API key by model name
 * @param modelName Model name (e.g., 'deepseek', 'qwen', 'openrouter')
 * @param settings Current settings object
 * @returns API key string or undefined
 */
export function getApiKey(modelName: string, settings: AISettings): string | undefined {
  switch (modelName) {
    case 'gemini':
      return settings.geminiKey;
    case 'deepseek':
      return settings.deepseekKey;
    case 'qwen':
      return settings.qwenKey;
    case 'zhipu':
      return settings.zhipuKey;
    case 'moonshot':
      return settings.moonshotKey;
    case 'baichuan':
      return settings.baichuanKey;
    case 'hunyuan':
      return settings.hunyuanKey;
    case 'ernie':
      return settings.ernieKey;
    case 'openrouter':
      return settings.openrouterKey;
    case 'custom':
      return settings.customKey;
    default:
      return undefined;
  }
}

/**
 * Initialize default configuration if none exists
 */
export function initializeDefaultConfig(): void {
  const existing = sessionStorage.getItem('ai_settings');
  if (!existing) {
    sessionStorage.setItem('ai_settings', JSON.stringify(BUILD_TIME_CONFIG));
  }
}

/**
 * 清除所有 API Key
 */
export function clearAllApiKeys(): void {
  sessionStorage.removeItem('ai_settings');
}