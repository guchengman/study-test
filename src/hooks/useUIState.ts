import { useState, useCallback } from 'react';
import type { Subject, SubjectId } from '../types';
import { DEFAULT_SUBJECTS } from '../types';

export function useUIState() {
  // 退出登录确认
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showRoleSwitch, setShowRoleSwitch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountResult, setDeleteAccountResult] = useState<'success' | 'error' | null>(null);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');

  // 导入/加入科目
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isJoinSubjectOpen, setIsJoinSubjectOpen] = useState(false);
  const [isStudentManagementOpen, setIsStudentManagementOpen] = useState(false);

  // 搜索
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // 导出格式
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('json');

  // 考试内确认弹窗
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDeduplicate, setConfirmingDeduplicate] = useState(false);
  const [confirmingFilter, setConfirmingFilter] = useState(false);

  // 科目管理
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isAddingNewSubject, setIsAddingNewSubject] = useState(false);
  const [isSubjectPendingCreation, setIsSubjectPendingCreation] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  // 初始化
  const [showInitModal, setShowInitModal] = useState(false);
  const [selectedInitSubjects, setSelectedInitSubjects] = useState<SubjectId[]>([]);

  // 用户管理
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [userList, setUserList] = useState<{ username: string; email: string; role: string; phone: string; teacherName: string; studentCount: number; passwordReset: boolean; createdAt: number; id?: number }[]>([]);
  const [userActionConfirm, setUserActionConfirm] = useState<{ type: 'delete' | 'clearPassword'; username: string; onConfirm: () => void } | null>(null);
  const [expandedTeacher, setExpandedTeacher] = useState<number | null>(null);
  const [teacherStudents, setTeacherStudents] = useState<{ id: number; username: string; email: string; phone: string; status: string; created_at: string }[]>([]);
  const [expandedShareSubject, setExpandedShareSubject] = useState<string | null>(null);
  const [studentSelectorSubject, setStudentSelectorSubject] = useState<{ id: string; name: string } | null>(null);

  return {
    showLogoutConfirm, setShowLogoutConfirm,
    showRoleSwitch, setShowRoleSwitch,
    showUserMenu, setShowUserMenu,
    isHelpOpen, setIsHelpOpen,
    showDeleteAccountConfirm, setShowDeleteAccountConfirm,
    isDeletingAccount, setIsDeletingAccount,
    deleteAccountResult, setDeleteAccountResult,
    deleteAccountError, setDeleteAccountError,
    showChangePasswordModal, setShowChangePasswordModal,
    changePasswordForm, setChangePasswordForm,
    isChangingPassword, setIsChangingPassword,
    changePasswordError, setChangePasswordError,
    isImportModalOpen, setIsImportModalOpen,
    isJoinSubjectOpen, setIsJoinSubjectOpen,
    isStudentManagementOpen, setIsStudentManagementOpen,
    searchQuery, setSearchQuery,
    isSearchOpen, setIsSearchOpen,
    exportFormat, setExportFormat,
    confirmingDelete, setConfirmingDelete,
    confirmingDeduplicate, setConfirmingDeduplicate,
    confirmingFilter, setConfirmingFilter,
    showSubjectModal, setShowSubjectModal,
    editingSubject, setEditingSubject,
    isAddingNewSubject, setIsAddingNewSubject,
    isSubjectPendingCreation, setIsSubjectPendingCreation,
    subjectToDelete, setSubjectToDelete,
    showInitModal, setShowInitModal,
    selectedInitSubjects, setSelectedInitSubjects,
    showUserManagement, setShowUserManagement,
    userList, setUserList,
    userActionConfirm, setUserActionConfirm,
    expandedTeacher, setExpandedTeacher,
    teacherStudents, setTeacherStudents,
    expandedShareSubject, setExpandedShareSubject,
    studentSelectorSubject, setStudentSelectorSubject,
  };
}
