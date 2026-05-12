import { useState, useEffect, useCallback } from 'react';
import emailjs from '@emailjs/browser';
import { authApi, setToken, removeToken, getToken, type AuthUser, type UserRole } from '../services/api';

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '';

const VERIFY_CODE_KEY = 'verification_code';
const VERIFY_EMAIL_KEY = 'verification_email';
const VERIFY_EXPIRES_KEY = 'verification_expires';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isTeacher, setIsTeacher] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // 初始化：用 token 恢复登录状态
  useEffect(() => {
    const token = getToken();
    if (token) {
      authApi.me()
        .then(res => {
          const user = res.user;
          setCurrentUser(user.username);
          setIsAdmin(user.role === 'admin');
          setIsTeacher(user.role === 'teacher');
          setAuthUser(user);
        })
        .catch(() => {
          removeToken();
          setCurrentUser(null);
          setIsAdmin(false);
          setIsTeacher(false);
          setAuthUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // 监听 Token 过期事件
  useEffect(() => {
    const handler = () => {
      removeToken();
      setCurrentUser(null);
      setIsAdmin(false);
      setIsTeacher(false);
      setAuthUser(null);
      setIsModalOpen(true);
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  // 更新用户状态的辅助函数
  const updateUserState = useCallback((token: string, user: AuthUser) => {
    setToken(token);
    setCurrentUser(user.username);
    setIsAdmin(user.role === 'admin');
    setIsTeacher(user.role === 'teacher');
    setAuthUser(user);
    // 触发登录事件
    window.dispatchEvent(new CustomEvent('auth:login', { detail: { userId: user.id } }));
  }, []);

  // 注册 — 支持三角色
  const register = useCallback(async (data: {
    username: string;
    password: string;
    email: string;
    role?: UserRole;
    phone?: string;
    inviteCode?: string;
    teacherPhone?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (data.username.length < 3) return { success: false, error: '用户名至少3个字符' };
    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) return { success: false, error: '用户名只能包含字母、数字和下划线' };
    if (!data.email.includes('@')) return { success: false, error: '请输入有效的邮箱地址' };
    if (data.password.length < 6) return { success: false, error: '密码至少6位' };

    try {
      const res = await authApi.register(data);
      updateUserState(res.token, res.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '注册失败' };
    }
  }, [updateUserState]);

  // 登录
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; needSetupPassword?: boolean; error?: string }> => {
    try {
      const res = await authApi.login(username, password);
      updateUserState(res.token, res.user);
      if (res.user.passwordReset) return { success: true, needSetupPassword: true };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '登录失败' };
    }
  }, [updateUserState]);

  // 登出
  const logout = useCallback(() => {
    removeToken();
    setCurrentUser(null);
    setIsAdmin(false);
    setIsTeacher(false);
    setAuthUser(null);
    // 触发登出事件
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }, []);

  // 角色转换
  const convertRole = useCallback(async (data: {
    targetRole: UserRole;
    phone?: string;
    inviteCode?: string;
    teacherPhone?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authApi.convertRole(data);
      updateUserState(res.token, res.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '角色转换失败' };
    }
  }, [updateUserState]);

  // 绑定老师
  const bindTeacher = useCallback(async (data: { inviteCode?: string; teacherPhone?: string; }): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const res = await authApi.bindTeacher(data);
      updateUserState(res.token, res.user);
      return { success: true, message: res.message };
    } catch (err: any) {
      return { success: false, error: err.message || '绑定失败' };
    }
  }, [updateUserState]);

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      const user = res.user;
      setCurrentUser(user.username);
      setIsAdmin(user.role === 'admin');
      setIsTeacher(user.role === 'teacher');
      setAuthUser(user);
    } catch {}
  }, []);

  // 发送验证码
  const sendVerificationCode = useCallback(async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!email.includes('@')) return { success: false, message: '请输入有效的邮箱地址' };
    const code = Math.random().toString().slice(2, 8);
    const expireTime = new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem(VERIFY_CODE_KEY, code);
    localStorage.setItem(VERIFY_EMAIL_KEY, email);
    localStorage.setItem(VERIFY_EXPIRES_KEY, String(Date.now() + 5 * 60 * 1000));
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: email, passcode: code, time: expireTime, from_name: 'Study-test' }, EMAILJS_PUBLIC_KEY);
      return { success: true, message: '验证码已发送至您的邮箱' };
    } catch (error: any) {
      const reason = error?.text || error?.message || error?.status || '网络异常，请稍后重试';
      return { success: false, message: `邮件发送失败: ${reason}` };
    }
  }, []);

  // 验证验证码
  const verifyCode = useCallback((email: string, code: string): Promise<{ success: boolean; error?: string }> => {
    const storedCode = localStorage.getItem(VERIFY_CODE_KEY);
    const storedEmail = localStorage.getItem(VERIFY_EMAIL_KEY);
    const expires = parseInt(localStorage.getItem(VERIFY_EXPIRES_KEY) || '0');
    if (Date.now() > expires) return Promise.resolve({ success: false, error: '验证码已过期' });
    if (code !== storedCode || email !== storedEmail) return Promise.resolve({ success: false, error: '验证码错误' });
    return Promise.resolve({ success: true });
  }, []);

  // 修改密码
  const changePassword = useCallback(async (oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: '请先登录' };
    if (newPassword.length < 6) return { success: false, error: '新密码至少6位' };
    try {
      await authApi.changePassword(oldPassword, newPassword);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '修改密码失败' };
    }
  }, [currentUser]);

  // 重置密码
  const resetPassword = useCallback(async (email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!email.includes('@')) return { success: false, error: '请输入有效的邮箱地址' };
    if (code.length !== 6) return { success: false, error: '验证码应为6位数字' };
    if (newPassword.length < 6) return { success: false, error: '新密码至少6位' };
    const storedCode = localStorage.getItem(VERIFY_CODE_KEY);
    const storedEmail = localStorage.getItem(VERIFY_EMAIL_KEY);
    const expires = parseInt(localStorage.getItem(VERIFY_EXPIRES_KEY) || '0');
    if (Date.now() > expires) return { success: false, error: '验证码已过期' };
    if (code !== storedCode || email !== storedEmail) return { success: false, error: '验证码错误' };
    localStorage.removeItem(VERIFY_CODE_KEY);
    localStorage.removeItem(VERIFY_EMAIL_KEY);
    localStorage.removeItem(VERIFY_EXPIRES_KEY);
    try {
      await authApi.changePassword('', newPassword);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '重置密码失败' };
    }
  }, []);

  const checkUsername = useCallback(async (username: string): Promise<{ exists: boolean }> => {
    try {
      const res = await authApi.checkUsername(username);
      return { exists: res.exists };
    } catch { return { exists: false }; }
  }, []);

  const getUserList = useCallback(async () => {
    try {
      const res = await authApi.listUsers();
      return res.users.map(u => ({
        id: (u as any).id,
        username: u.username,
        email: u.email || '',
        role: u.role,
        phone: (u as any).phone || '',
        teacherName: (u as any).teacher_name || '',
        studentCount: (u as any).student_count || 0,
        passwordReset: u.passwordReset || false,
        createdAt: new Date((u as any).created_at || u.id).getTime()
      }));
    } catch { return []; }
  }, []);

  const clearUserPassword = useCallback(async (username: string) => {
    if (username === 'admin') return { success: false, error: '管理员账号不能清除密码' };
    try {
      const res = await authApi.listUsers();
      const user = res.users.find(u => u.username === username);
      if (!user) return { success: false, error: '用户不存在' };
      await authApi.resetUserPassword(user.id);
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message || '操作失败' }; }
  }, []);

  const setupPassword = useCallback(async (username: string, password: string) => {
    if (password.length < 6) return { success: false, error: '密码至少6位' };
    try { await authApi.changePassword('', password); return { success: true }; } catch (err: any) { return { success: false, error: err.message || '设置密码失败' }; }
  }, []);

  const deleteUser = useCallback(async (username: string) => {
    if (username === 'admin') return { success: false, error: '管理员账号不可删除' };
    try {
      const res = await authApi.listUsers();
      const user = res.users.find(u => u.username === username);
      if (!user) return { success: false, error: '用户不存在' };
      await authApi.deleteUser(user.id);
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message || '删除失败' }; }
  }, []);

  return {
    currentUser, isAdmin, isTeacher, isLoading, isModalOpen, setIsModalOpen, authUser,
    login, logout, register, changePassword, convertRole, bindTeacher, refreshUser,
    getUserList, clearUserPassword, setupPassword, deleteUser,
    sendVerificationCode, verifyCode, resetPassword, checkUsername,
  };
}
