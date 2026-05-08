/**
 * API 客户端 - 统一管理所有后端 API 调用
 * JWT Token 自动管理，请求/响应拦截
 */

import { AISettings } from '../types';

// 根据环境确定 API 基础 URL
// 开发环境：使用代理 '/api'
// 生产环境：使用环境变量 VITE_API_BASE_URL 或相对路径 '/api'
const isDevelopment = import.meta.env.MODE === 'development';
const API_BASE = isDevelopment 
  ? '/api' 
  : (import.meta.env.VITE_API_BASE_URL || '/api');
const TOKEN_KEY = 'study_test_token';
const REFRESH_TOKEN_KEY = 'study_test_refresh_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface ApiError {
  message: string;
  status?: number;
}

class ApiClient {
  private baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, { ...options, headers });
      const contentType = response.headers.get('content-type');
      let data: any = {};
      if (contentType?.includes('application/json')) data = await response.json();

      if (response.status === 401) {
        const errMsg = data.error || data.message || '认证失败';
        if (getToken()) {
          removeToken();
          window.dispatchEvent(new CustomEvent('auth:expired'));
          throw { message: '登录已过期，请重新登录', status: 401 } as ApiError;
        }
        throw { message: errMsg, status: 401 } as ApiError;
      }
      if (!contentType?.includes('application/json')) {
        if (!response.ok) throw { message: `请求失败 (${response.status})`, status: response.status } as ApiError;
        return {} as T;
      }
      if (!response.ok) throw { message: data.error || data.message || `请求失败 (${response.status})`, status: response.status } as ApiError;
      return data as T;
    } catch (error) {
      if ((error as ApiError).status) throw error;
      throw { message: '网络连接失败，请检查网络', status: 0 } as ApiError;
    }
  }

  async get<T>(endpoint: string): Promise<T> { return this.request<T>(endpoint, { method: 'GET' }); }
  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
  }
  async put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
  }
  async delete<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined });
  }
}

const client = new ApiClient(API_BASE);

/** 与 ApiClient 一致的基础路径（供 geminiService 等直接使用 fetch 的场景） */
export function getApiBaseUrl(): string {
  return import.meta.env.MODE === 'development'
    ? '/api'
    : (import.meta.env.VITE_API_BASE_URL || '/api');
}

// ─── 类型定义 ───────────────────────────────────────────────

export type UserRole = 'admin' | 'teacher' | 'student' | 'independent';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  teacher_id?: number | null;
  teacher_name?: string | null;
  phone?: string | null;
  status?: 'active' | 'pending';
  passwordReset?: boolean;
  student_count?: number;
  help_read?: number;
}

export interface LoginResponse {
  message?: string;
  token: string;
  user: AuthUser;
}

export interface InviteCode {
  id: number;
  code: string;
  type: 'registration' | 'subject';
  creator_id: number;
  subject_id?: string | null;
  subject_name?: string;
  description: string;
  expires_at: string;
  used_count: number;
  created_at: string;
}

export interface StudentItem {
  id: number;
  username: string;
  email: string;
  phone?: string;
  status: string;
  created_at: string;
}

export interface SubjectItem {
  id: string;
  name: string;
  icon: string;
  welcomeTitle?: string;
  welcomeDesc?: string;
  isSystem: boolean;
  isShared?: boolean;
  shareScope?: 'none' | 'students' | 'all';
  isSubscribed?: boolean;
  isOwner?: boolean;
  subscriberCount?: number;
  userId?: number;
  createdBy?: number;
  createdAt: string;
}

export interface PendingSubscription {
  subscription_id: number;
  subject_id: string;
  user_id: number;
  subscribed_at: string;
  status: string;
  subject_name: string;
  subject_icon: string;
  username: string;
  email: string;
}

export interface QuestionItem {
  id: number;
  subject_id: string;  // 后端返回的字段名
  type: string;
  title: string;
  code?: string;
  options?: string[];
  answer: string | string[];
  explanation?: string;
  points: number;
  input?: string;
  shareCode?: string;
  isOwner?: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface MistakeItem { id: number; questionId: number; consecutiveCorrect: number; createdAt: string; updatedAt: string; }
export interface FavoriteItem { id: number; questionId: number; createdAt: string; }
export interface StatsItem { id: number; subject: string; totalQuestions: number; correctCount: number; totalAttempts: number; studyTime: number; date: string; }

// ─── 认证 API ───────────────────────────────────────────────

export const authApi = {
  register: (data: { username: string; password: string; email?: string; role?: UserRole; phone?: string; inviteCode?: string; teacherPhone?: string; }) =>
    client.post<LoginResponse>('/auth/register', data),
  login: (username: string, password: string) =>
    client.post<LoginResponse>('/auth/login', { username, password }),
  me: () => client.get<{ user: AuthUser }>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    client.put<{ message: string }>('/auth/password', { oldPassword, newPassword }),
  convertRole: (data: { targetRole: UserRole; phone?: string; inviteCode?: string; teacherPhone?: string; }) =>
    client.post<LoginResponse>('/auth/convert-role', data),
  bindTeacher: (data: { inviteCode?: string; teacherPhone?: string; }) =>
    client.post<LoginResponse>('/auth/bind-teacher', data),
  listUsers: () => client.get<{ users: AuthUser[] }>('/auth/list'),
  getTeacherStudents: (teacherId: number) =>
    client.get<{ students: any[] }>(`/auth/teacher-students/${teacherId}`),
  resetUserPassword: (userId: number) =>
    client.put<{ message: string }>('/auth/reset-password', { userId }),
  deleteUser: (userId: number) =>
    client.delete<{ message: string }>(`/auth/user/${userId}`),
  getSettings: () => client.get<{ settings: AISettings | null }>('/auth/settings'),
  saveSettings: (settings: AISettings) =>
    client.put<{ message: string }>('/auth/settings', { settings }),
  markHelpRead: () => client.put<{ message: string }>('/auth/help-read'),
  deleteAccount: () => client.delete<{ message: string }>('/auth/account'),
  checkUsername: (username: string) => client.get<{ exists: boolean }>(`/auth/check-username?username=${encodeURIComponent(username)}`),
};

// ─── 邀请码 API ─────────────────────────────────────────────

export const inviteCodeApi = {
  list: (type?: 'registration' | 'subject') =>
    client.get<{ codes: InviteCode[] }>(`/invite-codes${type ? `?type=${type}` : ''}`),
  create: (data: { type: 'registration' | 'subject'; code?: string; description?: string; subjectId?: string; scope?: 'students' | 'all'; }) =>
    client.post<{ id: number; code: string; scope: string; message: string }>('/invite-codes', { ...data, subjectId: data.subjectId, scope: data.scope || 'all' }),
  delete: (id: number) =>
    client.delete<{ message: string }>(`/invite-codes/${id}`),
};

// ─── 学生管理 API ───────────────────────────────────────────

export const studentApi = {
  listPending: () => client.get<{ students: StudentItem[] }>('/students/pending'),
  approve: (id: number) => client.put<{ message: string }>(`/students/approve/${id}`),
  reject: (id: number) => client.put<{ message: string }>(`/students/reject/${id}`),
  listMy: () => client.get<{ students: StudentItem[] }>('/students/my'),
  remove: (id: number) => client.put<{ message: string }>(`/students/remove/${id}`),
  resetPassword: (id: number) => client.put<{ message: string }>(`/students/reset-password/${id}`),
};

// ─── 科目 API ───────────────────────────────────────────────

export const subjectApi = {
  list: () => client.get<{ subjects: SubjectItem[] }>('/subjects'),
  create: (data: { id: string; name: string; icon: string; welcomeTitle?: string; welcomeDesc?: string; shareScope?: string; }) =>
    client.post<{ message: string; id: string }>('/subjects', { ...data, welcome_title: data.welcomeTitle, welcome_desc: data.welcomeDesc, share_scope: data.shareScope || 'none' }),
  update: (id: string, data: { name?: string; icon?: string; welcomeTitle?: string; welcomeDesc?: string; shareScope?: string; studentIds?: number[]; }) =>
    client.put<{ message: string }>(`/subjects/${id}`, { ...data, welcome_title: data.welcomeTitle, welcome_desc: data.welcomeDesc, share_scope: data.shareScope, student_ids: data.studentIds }),
  getStudents: (id: string) =>
    client.get<{ shareScope: string; studentIds: number[]; isAllStudents: boolean }>(`/subjects/${id}/students`),
  delete: (id: string) => client.delete<{ message: string }>(`/subjects/${id}`),
  initialize: (id: string) => client.post<{ message: string; deletedQuestions: number }>(`/subjects/${id}/initialize`),
  join: (code: string) => client.post<{ message: string; subject: { id: string; name: string }; status?: string }>('/subjects/join', { code }),
  leave: (id: string) => client.post<{ message: string }>(`/subjects/${id}/leave`),
  listSubscribed: () => client.get<{ subjects: SubjectItem[] }>('/subjects/subscribed'),
  listPendingSubscriptions: () => client.get<{ subscriptions: PendingSubscription[] }>('/subjects/pending-subscriptions'),
  approveSubscription: (id: number) => client.put<{ message: string }>(`/subjects/subscriptions/${id}/approve`),
  rejectSubscription: (id: number) => client.put<{ message: string }>(`/subjects/subscriptions/${id}/reject`),
};

// ─── 题目 API ───────────────────────────────────────────────

export const questionApi = {
  list: (params?: { subject?: string; type?: string; page?: number; limit?: number; }) => {
    const query = new URLSearchParams();
    if (params?.subject) query.set('subject_id', params.subject); // 后端期望 subject_id 参数
    if (params?.type) query.set('type', params.type);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return client.get<{ questions: QuestionItem[]; total: number; page?: number; limit?: number }>(`/questions${qs ? '?' + qs : ''}`);
  },
  /** 按后端单页上限分页拉取，直到拿全该筛选条件下的题目（避免 limit=5000 被后端截断为 200） */
  listAll: async (params?: { subject?: string; type?: string }) => {
    const pageSize = 200;
    const maxPages = 100;
    const all: QuestionItem[] = [];
    let total = 0;
    for (let page = 1; page <= maxPages; page++) {
      const res = await questionApi.list({ ...params, page, limit: pageSize });
      total = res.total;
      all.push(...res.questions);
      if (all.length >= total || res.questions.length === 0) break;
    }
    return { questions: all, total };
  },
  create: (data: Partial<QuestionItem>) => client.post<{ message: string; id: number }>('/questions', data),
  batchImport: (questions: Partial<QuestionItem>[], subjectId?: string) =>
    client.post<{ message: string; ids: number[]; count: number }>('/questions/batch', { questions, subject_id: subjectId }),
  update: (id: number, data: Partial<QuestionItem>) => client.put<{ message: string }>(`/questions/${id}`, data),
  delete: (id: number) => client.delete<{ message: string }>(`/questions/${id}`),
  share: (id: number) => client.post<{ shareCode: string }>(`/questions/${id}/share`),
};

// ─── 练习/错题 API ─────────────────────────────────────────

export const practiceApi = {
  getMistakes: (subject?: string) => client.get<{ mistakes: MistakeItem[] }>(`/practice/mistakes${subject ? `?subject=${subject}` : ''}`),
  addMistake: (questionId: number, isCorrect: boolean = false) => client.post<{ message: string; mastered?: boolean }>('/practice/mistakes', { question_id: questionId, is_correct: isCorrect }),
  updateMistake: (questionId: number, consecutiveCorrect: number) => client.put('/practice/mistakes', { questionId, consecutiveCorrect }),
  deleteMistake: (questionId: number) => client.delete(`/practice/mistakes/${questionId}`),
  getFavorites: (subject?: string) => client.get<{ favorites: FavoriteItem[] }>(`/practice/favorites${subject ? `?subject=${subject}` : ''}`),
  addFavorite: (questionId: number, subject: string) => client.post<{ message: string }>('/practice/favorites', { question_id: questionId }),
  removeFavorite: (questionId: number) => client.delete(`/practice/favorites/${questionId}`),
  getStats: (subject?: string) => client.get<{ stats: StatsItem[] }>(`/practice/stats${subject ? `?subject=${subject}` : ''}`),
  updateStats: (data: { subject: string; totalQuestions?: number; correctCount?: number; totalAttempts?: number; studyTime?: number; date: string; }) =>
    client.post<{ message: string }>('/practice/stats', data),
};

// ─── 数据同步 API ───────────────────────────────────────────

export const syncApi = {
  migrate: (data: { questions?: any[]; mistakes?: any[]; favorites?: any[]; subjects?: any[]; }) =>
    client.post<{ message: string; migrated: { questions: number; mistakes: number; favorites: number; subjects: number } }>('/sync/migrate', data),
  exportAll: () => client.get<{ questions: QuestionItem[]; mistakes: MistakeItem[]; favorites: FavoriteItem[]; subjects: SubjectItem[]; stats: StatsItem[]; }>('/sync/export'),
};

export const healthApi = {
  check: () => client.get<{ status: string; timestamp: string }>('/health'),
};

export const uploadApi = {
  image: async (file: File): Promise<{ url: string; filename: string }> => {
    const form = new FormData();
    form.append('file', file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw { message: data.error || `上传失败 (${res.status})`, status: res.status } as { message: string; status: number };
    }
    return res.json();
  },
};

export default client;
