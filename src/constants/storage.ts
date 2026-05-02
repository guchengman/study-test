/**
 * localStorage Key 管理
 * 集中管理所有 localStorage 的 key，避免硬编码
 */

// 基础前缀
const STORAGE_PREFIX = 'python_test_';

// 存储 Key 定义
export const STORAGE_KEYS = {
  // 自定义题目（按科目存储）
  CUSTOM_QUESTIONS: `${STORAGE_PREFIX}custom_questions`,
  
  // 错题记录
  MISTAKE_RECORDS: `${STORAGE_PREFIX}mistake_records`,
  
  // 收藏夹
  FAVORITE_IDS: `${STORAGE_PREFIX}favorite_ids`,
  
  // 已移除的题目ID
  REMOVED_IDS: `${STORAGE_PREFIX}removed_ids`,
  
  // 当前科目
  CURRENT_SUBJECT_ID: 'current_subject_id',
  
  // AI 设置
  AI_SETTINGS: 'ai_settings',
  
  // 提示词历史
  PROMPT_HISTORY: 'prompt_history',
  
  // 自定义科目列表
  CUSTOM_SUBJECTS: `${STORAGE_PREFIX}custom_subjects`,
  
  // 可编辑科目的名称（Python或其他已编辑的科目）
  EDITABLE_SUBJECTS: `${STORAGE_PREFIX}editable_subjects`,

  // 用户系统
  USERS: 'users',  // 注册用户列表
  CURRENT_USER: 'current_user',  // 当前登录用户
  CURRENT_USER_ROLE: 'current_user_role',  // 当前用户角色 (admin/user)
  // 验证码相关
  VERIFICATION_CODE: 'verification_code',
  VERIFICATION_EMAIL: 'verification_email',
  VERIFICATION_EXPIRES: 'verification_expires',
} as const;

// 类型定义
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

// 获取带前缀的 key
export function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

// 清除所有应用相关数据
export function clearAllStorage(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}
