/**
 * 应用顶栏：科目标识、快捷入口、考试计时、用户菜单
 */
import React from 'react';
import {
  RefreshCcw,
  Key,
  Shield,
  Users,
  HelpCircle,
  CheckCircle2,
  Trash2,
  ChevronDown,
  XCircle,
  Settings,
  Timer,
  ChevronLeft,
} from 'lucide-react';
import type { Subject } from '../../types';
import type { AuthUser } from '../../services/api';
import { formatTime } from '../../utils/examScoring';

export type AppHeaderStatus = 'welcome' | 'exam' | 'result' | 'mistakes';

export interface AppHeaderProps {
  currentSubject: Subject;
  onGoWelcome: () => void;
  currentUser: string | null;
  authUser: AuthUser | null;
  isAdmin: boolean;
  isTeacher: boolean;
  status: AppHeaderStatus;
  elapsedTime: number;
  currentIndex: number;
  examTotal: number;
  showUserMenu: boolean;
  setShowUserMenu: (v: boolean) => void;
  setShowInitModal: (v: boolean) => void;
  setIsJoinSubjectOpen: (v: boolean) => void;
  getUserList: () => Promise<
    { username: string; email: string; role: string; phone: string; teacherName: string; studentCount: number; passwordReset: boolean; createdAt: number; id?: number }[]
  >;
  setUserList: React.Dispatch<
    React.SetStateAction<
      { username: string; email: string; role: string; phone: string; teacherName: string; studentCount: number; passwordReset: boolean; createdAt: number; id?: number }[]
    >
  >;
  setShowUserManagement: (v: boolean) => void;
  setIsStudentManagementOpen: (v: boolean) => void;
  setIsHelpOpen: (v: boolean) => void;
  setShowDeleteAccountConfirm: (v: boolean) => void;
  setShowRoleSwitch: (v: boolean) => void;
  setShowChangePasswordModal: (v: boolean) => void;
  setShowLogoutConfirm: (v: boolean) => void;
  setIsModalOpen: (v: boolean) => void;
}

export function AppHeader(props: AppHeaderProps) {
  const {
    currentSubject,
    onGoWelcome,
    currentUser,
    authUser,
    isAdmin,
    isTeacher,
    status,
    elapsedTime,
    currentIndex,
    examTotal,
    showUserMenu,
    setShowUserMenu,
    setShowInitModal,
    setIsJoinSubjectOpen,
    getUserList,
    setUserList,
    setShowUserManagement,
    setIsStudentManagementOpen,
    setIsHelpOpen,
    setShowDeleteAccountConfirm,
    setShowRoleSwitch,
    setShowChangePasswordModal,
    setShowLogoutConfirm,
    setIsModalOpen,
  } = props;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 cursor-pointer" onClick={onGoWelcome}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <span className="text-xl">{currentSubject.icon}</span>
            </div>
            <h1 className="font-bold text-lg tracking-tight hidden sm:block">{currentSubject.name}</h1>
          </div>

          <button
            onClick={(e) => {
              if (!currentUser) return;
              e.stopPropagation();
              setShowInitModal(true);
            }}
            className={`ml-2 sm:ml-4 px-2 sm:px-3 py-1.5 rounded-lg font-medium text-xs sm:text-sm transition-all flex items-center gap-1 ${
              currentUser
                ? 'bg-slate-300 text-slate-700 hover:bg-slate-400 cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title={currentUser ? '初始化考试科目和题库' : '登录后可使用'}
            disabled={!currentUser}
          >
            <RefreshCcw size={12} className="sm:size-3.5" />
            <span className="hidden xs:inline">重置</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {currentUser && (
            <button
              onClick={() => setIsJoinSubjectOpen(true)}
              className="px-2 sm:px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-emerald-100 transition-all flex items-center gap-1"
              title="加入共享科目"
            >
              <Key size={14} />
              <span className="hidden sm:inline">加入科目</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                setShowUserManagement(true);
                getUserList().then((list) => setUserList(list));
              }}
              className="px-2 sm:px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-red-100 transition-all flex items-center gap-1"
              title="管理用户"
            >
              <Shield size={14} />
              <span className="hidden sm:inline">管理用户</span>
            </button>
          )}
          {isTeacher && (
            <button
              onClick={() => setIsStudentManagementOpen(true)}
              className="px-2 sm:px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-indigo-100 transition-all flex items-center gap-1"
              title="学生管理"
            >
              <Users size={14} />
              <span className="hidden sm:inline">学生管理</span>
            </button>
          )}
          <button
            onClick={() => setIsHelpOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg font-medium text-xs sm:text-sm hover:bg-blue-100 transition-all flex items-center gap-1.5"
            title="帮助手册"
          >
            <HelpCircle size={15} />
            <span className="hidden sm:inline">帮助</span>
          </button>

          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-medium text-sm hover:bg-amber-100 transition-all flex items-center gap-2"
                title="用户菜单"
              >
                <CheckCircle2 size={16} />
                <span>{currentUser}</span>
                {isAdmin && (
                  <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">管理员</span>
                )}
                {isTeacher && !isAdmin && (
                  <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold">老师</span>
                )}
                {!isAdmin && !isTeacher && authUser?.role === 'independent' && (
                  <span className="text-xs bg-slate-400 text-white px-2 py-0.5 rounded-full font-bold">独立</span>
                )}
                {!isAdmin && !isTeacher && authUser?.role === 'student' && (
                  <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">学生</span>
                )}
                <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 min-w-[160px]">
                    {!isAdmin && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowDeleteAccountConfirm(true);
                        }}
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-500"
                      >
                        <Trash2 size={15} className="text-slate-400" />
                        注销账号
                      </button>
                    )}
                    {!isAdmin && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowRoleSwitch(true);
                        }}
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                      >
                        <Users size={15} className="text-indigo-500" />
                        切换身份
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowChangePasswordModal(true);
                      }}
                      className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                    >
                      <Key size={15} className="text-blue-500" />
                      修改密码
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 text-red-600 border-t border-slate-50 mt-1 pt-1.5"
                    >
                      <XCircle size={15} />
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg font-medium text-sm hover:bg-blue-100 transition-all flex items-center gap-2"
              title="登录"
            >
              <Settings size={16} />
              <span>登录</span>
            </button>
          )}

          {status === 'exam' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-slate-600 font-medium text-sm">
                <Timer size={16} />
                <span>{formatTime(elapsedTime)}</span>
              </div>
              <div className="text-sm font-medium text-slate-500">
                题目 {currentIndex + 1} / {examTotal}
              </div>
            </div>
          )}

          {(status === 'result' || status === 'mistakes') && (
            <div className="flex items-center gap-3">
              <button
                onClick={onGoWelcome}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-semibold hover:bg-slate-200 transition-all"
              >
                <ChevronLeft size={22} />
                <span>返回上一级</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
