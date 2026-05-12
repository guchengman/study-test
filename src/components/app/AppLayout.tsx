import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  X,
  XCircle,
  Users,
  Settings,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Key,
  PlusCircle,
  Share2,
  AlertTriangle,
  RefreshCcw,
  Check,
} from 'lucide-react';
import { AppHeader } from './AppHeader';
import { VisitCounter } from '../VisitCounter';
import { ImportModal } from '../ImportModal';
import { LoginModal } from '../LoginModal';
import { ConfirmModal } from '../ConfirmModal';
import { JoinSubjectModal } from '../JoinSubjectModal';
import { RoleSwitchModal } from '../RoleSwitchModal';
import { HelpModal } from '../HelpModal';
import { StudentManagementModal } from '../StudentManagementModal';
import { StudentSelectorModal } from '../StudentSelectorModal';
import { SubjectShareCode } from '../SubjectShareCode';
import { useAppContext } from '../../context/AppContext';
import { useBackPrevention } from '../../hooks/useBackPrevention';
import { subjectApi, authApi, questionApi } from '../../services/api';
import { QUESTION_BANK as INITIAL_BANK } from '../../questionBank';
import { CUSTOM_SUBJECT_PREFIX, MAX_OWN_SUBJECTS, SUBJECT_ICONS, suggestSubject } from '../../types';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = useAppContext();
  const { showExitPrompt, confirmExit, cancelExit } = useBackPrevention();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100 overflow-x-hidden max-w-full">
      <AppHeader
        currentSubject={ctx.currentSubject}
        onGoWelcome={() => { ctx.goWelcome(); navigate('/', { replace: true }); }}
        currentUser={ctx.currentUser}
        authUser={ctx.authUser}
        isAdmin={ctx.isAdmin}
        isTeacher={ctx.isTeacher}
        status={ctx.status === 'result' ? 'result' : ctx.status === 'exam' ? 'exam' : 'welcome'}
        elapsedTime={ctx.elapsedTime}
        currentIndex={ctx.currentIndex}
        examTotal={ctx.examQuestions.length}
        showUserMenu={ctx.showUserMenu}
        setShowUserMenu={ctx.setShowUserMenu}
        setShowInitModal={ctx.setShowInitModal}
        setIsJoinSubjectOpen={ctx.setIsJoinSubjectOpen}
        getUserList={ctx.getUserList}
        setUserList={ctx.setUserList}
        setShowUserManagement={ctx.setShowUserManagement}
        setIsStudentManagementOpen={ctx.setIsStudentManagementOpen}
        setIsHelpOpen={ctx.setIsHelpOpen}
        setShowDeleteAccountConfirm={ctx.setShowDeleteAccountConfirm}
        setShowRoleSwitch={ctx.setShowRoleSwitch}
        setShowChangePasswordModal={ctx.setShowChangePasswordModal}
        setShowLogoutConfirm={ctx.setShowLogoutConfirm}
        setIsModalOpen={ctx.setIsModalOpen}
      />

      <main className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
        <AnimatePresence mode="wait">
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </main>

      <footer className="py-6 sm:py-8 text-center text-slate-400 text-xs sm:text-sm">
        <p className="text-slate-400">© 2026 海龙在线学习平台 - 海龙制作</p>
        <VisitCounter />
      </footer>

      {/* Toast */}
      <AnimatePresence>
        {ctx.showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-slate-800 text-white rounded-full shadow-2xl font-bold text-sm flex items-center gap-2"
          >
            <CheckCircle2 size={18} className="text-emerald-400" />
            {ctx.showToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      {ctx.isImportModalOpen && (
        <ImportModal
          onClose={() => ctx.setIsImportModalOpen(false)}
          onImport={ctx.handleImport}
          allSubjects={ctx.allSubjects}
          currentSubjectId={ctx.currentSubjectId}
          authUser={ctx.authUser}
        />
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={ctx.isModalOpen}
        onClose={() => ctx.setIsModalOpen(false)}
        onLogin={ctx.login}
        onRegister={ctx.register}
        onChangePassword={ctx.changePassword}
        onSendCode={ctx.sendVerificationCode}
        onVerifyCode={ctx.verifyCode}
        onResetPassword={ctx.resetPassword}
        onCheckUsername={ctx.checkUsername}
        onSetupPassword={ctx.setupPassword}
        isAdmin={ctx.isAdmin}
        currentUser={ctx.currentUser}
      />

      {/* Join Subject Modal */}
      <JoinSubjectModal
        isOpen={ctx.isJoinSubjectOpen}
        onClose={() => ctx.setIsJoinSubjectOpen(false)}
        onJoined={() => window.location.reload()}
      />

      {/* Student Management Modal */}
      {ctx.isStudentManagementOpen && (
        <StudentManagementModal isOpen={ctx.isStudentManagementOpen} onClose={() => ctx.setIsStudentManagementOpen(false)} />
      )}

      {/* Student Selector Modal */}
      {!!ctx.studentSelectorSubject && (
        <StudentSelectorModal
          isOpen={!!ctx.studentSelectorSubject}
          subjectId={ctx.studentSelectorSubject?.id || ''}
          subjectName={ctx.studentSelectorSubject?.name || ''}
          onClose={() => ctx.setStudentSelectorSubject(null)}
          onStudentIdsChange={async (studentIds) => {
            if (ctx.studentSelectorSubject && ctx.currentUser) {
              await subjectApi.update(ctx.studentSelectorSubject.id, { shareScope: 'students', studentIds });
            }
          }}
        />
      )}

      {/* 用户管理模态框 */}
      {ctx.showUserManagement && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users size={20} className="text-purple-600" />
                用户管理
              </h3>
              <button onClick={() => ctx.setShowUserManagement(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="space-y-3">
                {ctx.userList.map((user) => (
                  <div key={user.username} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800">{user.username}</span>
                          {user.role === 'admin' && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">管理员</span>}
                          {user.role === 'teacher' && <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full font-medium">老师</span>}
                          {user.role === 'student' && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium">学生</span>}
                          {user.role === 'independent' && <span className="text-xs bg-slate-400 text-white px-2 py-0.5 rounded-full font-medium">独立用户</span>}
                          {user.passwordReset && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">需重置密码</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          {user.phone && <span>{user.phone}</span>}
                          {user.email && <span>{user.email}</span>}
                        </div>
                      </div>
                      {user.username !== 'admin' && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => {
                            ctx.setUserActionConfirm({
                              type: 'clearPassword', username: user.username,
                              onConfirm: async () => {
                                const result = await ctx.clearUserPassword(user.username);
                                if (result.success) { ctx.setUserActionConfirm(null); ctx.getUserList().then(list => ctx.setUserList(list)); }
                                else ctx.setShowToast(result.error || '操作失败');
                              }
                            });
                          }} className="px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-sm hover:bg-orange-200">清空密码</button>
                          <button onClick={() => {
                            ctx.setUserActionConfirm({
                              type: 'delete', username: user.username,
                              onConfirm: async () => {
                                const result = await ctx.deleteUser(user.username);
                                if (result.success) { ctx.setUserActionConfirm(null); ctx.getUserList().then(list => ctx.setUserList(list)); }
                                else ctx.setShowToast(result.error || '操作失败');
                              }
                            });
                          }} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200">删除</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => ctx.setShowUserManagement(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 用户操作确认弹窗 */}
      <ConfirmModal
        isOpen={!!ctx.userActionConfirm}
        title={ctx.userActionConfirm?.type === 'delete' ? '删除用户' : '清除密码'}
        message={ctx.userActionConfirm?.type === 'delete'
          ? `确定要删除用户 "${ctx.userActionConfirm?.username}" 吗?此操作不可恢复。`
          : `确定要清除用户 "${ctx.userActionConfirm?.username}" 的密码吗?该用户下次登录时需要设置新密码。`}
        confirmText={ctx.userActionConfirm?.type === 'delete' ? '确认删除' : '确认清除'}
        cancelText="取消"
        type="warning"
        onConfirm={() => ctx.userActionConfirm?.onConfirm()}
        onCancel={() => ctx.setUserActionConfirm(null)}
      />

      {/* 退出登录确认弹窗 */}
      <ConfirmModal
        isOpen={ctx.showLogoutConfirm}
        title="退出登录"
        message={`确定要退出 ${ctx.currentUser} 登录吗?退出后将无法使用题库管理和科目管理功能。`}
        confirmText="确定退出"
        cancelText="取消"
        type="warning"
        onConfirm={() => { ctx.setShowLogoutConfirm(false); ctx.logout(); }}
        onCancel={() => ctx.setShowLogoutConfirm(false)}
      />

      {/* 注销账号确认弹窗 */}
      <ConfirmModal
        isOpen={ctx.showDeleteAccountConfirm}
        title="确认注销账号"
        message={`确定要注销 ${ctx.currentUser} 吗?此操作将永久删除您的账号及所有关联数据(题库、科目、错题记录等),不可恢复。`}
        confirmText={ctx.isDeletingAccount ? '注销中...' : '确认注销'}
        cancelText="取消"
        type="danger"
        onConfirm={async () => {
          ctx.setIsDeletingAccount(true);
          try {
            await authApi.deleteAccount();
            ctx.setShowDeleteAccountConfirm(false);
            ctx.logout();
            ctx.setDeleteAccountResult('success');
          } catch (err: any) {
            ctx.setDeleteAccountError(err.message || '注销失败,请稍后重试');
            ctx.setDeleteAccountResult('error');
          } finally {
            ctx.setIsDeletingAccount(false);
          }
        }}
        onCancel={() => ctx.setShowDeleteAccountConfirm(false)}
      />

      {/* 注销结果弹窗 */}
      {ctx.deleteAccountResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center"
          >
            {ctx.deleteAccountResult === 'success' ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">账号已成功注销</h3>
                <p className="text-sm text-slate-500 mb-6">感谢您的使用,欢迎随时回来注册新账号。</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle size={32} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">注销失败</h3>
                <p className="text-sm text-red-500 mb-6">{ctx.deleteAccountError}</p>
              </>
            )}
            <button onClick={() => ctx.setDeleteAccountResult(null)}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${ctx.deleteAccountResult === 'success' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              知道了
            </button>
          </motion.div>
        </div>
      )}

      {/* Help Modal */}
      <HelpModal isOpen={ctx.isHelpOpen} onClose={() => ctx.setIsHelpOpen(false)} />

      {/* Role Switch Modal */}
      <RoleSwitchModal
        isOpen={ctx.showRoleSwitch}
        onClose={() => ctx.setShowRoleSwitch(false)}
        currentRole={ctx.authUser?.role || 'independent'}
        onConvertRole={ctx.convertRole}
        onBindTeacher={ctx.bindTeacher}
      />

      {/* 修改密码弹窗 */}
      {ctx.showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4">修改密码</h3>
            <div className="space-y-4">
              <input type="password" autoComplete="current-password"
                value={ctx.changePasswordForm.oldPassword}
                onChange={e => ctx.setChangePasswordForm(p => ({ ...p, oldPassword: e.target.value }))}
                placeholder="当前密码" className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm" />
              <input type="password" autoComplete="new-password"
                value={ctx.changePasswordForm.newPassword}
                onChange={e => ctx.setChangePasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                placeholder="新密码(至少6位)" className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm" />
              <input type="password" autoComplete="new-password"
                value={ctx.changePasswordForm.confirmPassword}
                onChange={e => ctx.setChangePasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="确认新密码" className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm" />
              {ctx.changePasswordError && <p className="text-sm text-red-500">{ctx.changePasswordError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { ctx.setShowChangePasswordModal(false); ctx.setChangePasswordError(''); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl">取消</button>
              <button onClick={async () => {
                if (!ctx.changePasswordForm.oldPassword) { ctx.setChangePasswordError('请输入当前密码'); return; }
                if (ctx.changePasswordForm.newPassword.length < 6) { ctx.setChangePasswordError('新密码至少6位'); return; }
                if (ctx.changePasswordForm.newPassword !== ctx.changePasswordForm.confirmPassword) { ctx.setChangePasswordError('两次输入不一致'); return; }
                ctx.setIsChangingPassword(true);
                const result = await ctx.changePassword(ctx.changePasswordForm.oldPassword, ctx.changePasswordForm.newPassword);
                ctx.setIsChangingPassword(false);
                if (result.success) {
                  ctx.setShowChangePasswordModal(false);
                  ctx.setShowToast('密码修改成功');
                } else {
                  ctx.setChangePasswordError(result.error || '修改失败');
                }
              }} disabled={ctx.isChangingPassword}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl disabled:opacity-50">
                {ctx.isChangingPassword ? '修改中...' : '确认修改'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 系统初始化模态框 */}
      {ctx.showInitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <RefreshCcw size={20} className="text-blue-600" />
                系统初始化
              </h3>
              <button onClick={() => ctx.setShowInitModal(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                选择要初始化的科目。初始化后将:<br/>
                • 清空所选科目的所有题目(包括默认题库)<br/>
                • 清空错题记录、收藏夹和自定义题目<br/>
                • 系统变为真正的空题库状态
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                  if (ctx.selectedInitSubjects.length === ctx.allSubjects.length) {
                    ctx.setSelectedInitSubjects([]);
                  } else {
                    ctx.setSelectedInitSubjects(ctx.allSubjects.map(s => s.id));
                  }
                }}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${ctx.selectedInitSubjects.length === ctx.allSubjects.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-slate-400'}`}>
                    {ctx.selectedInitSubjects.length === ctx.allSubjects.length && <Check size={12} className="text-white" />}
                  </div>
                  <span className="font-medium text-slate-700">全选所有科目</span>
                </label>

                <div className="pl-6 space-y-2">
                  {ctx.allSubjects.map(subject => (
                    <label key={subject.id} className="flex items-center gap-2 cursor-pointer group select-none" onClick={() => {
                      if (ctx.selectedInitSubjects.includes(subject.id)) {
                        ctx.setSelectedInitSubjects(prev => prev.filter(id => id !== subject.id));
                      } else {
                        ctx.setSelectedInitSubjects(prev => [...prev, subject.id]);
                      }
                    }}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${ctx.selectedInitSubjects.includes(subject.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-slate-400'}`}>
                        {ctx.selectedInitSubjects.includes(subject.id) && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-slate-600 group-hover:text-slate-800 flex items-center gap-1">
                        <span>{subject.icon}</span>
                        {subject.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => ctx.setShowInitModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                取消
              </button>
              <button onClick={() => {
                if (ctx.selectedInitSubjects.length === 0) {
                  ctx.setShowToast('请至少选择一个科目进行初始化');
                  return;
                }
                const initialBankIdsToHide = INITIAL_BANK
                  .filter(q => ctx.selectedInitSubjects.includes(q.subject))
                  .map(q => q.id);
                const customQuestionIdsToRemove = ctx.customQuestions
                  .filter(q => ctx.selectedInitSubjects.includes(q.subject))
                  .map(q => q.id);
                const newRemovedIds = [...new Set([...ctx.removedIds, ...initialBankIdsToHide, ...customQuestionIdsToRemove])];
                const remainingCustomQuestions = ctx.customQuestions.filter(
                  q => !ctx.selectedInitSubjects.includes(q.subject)
                );
                const allRemovedIdsSet = new Set(newRemovedIds);
                const remainingMistakeRecords = ctx.mistakeRecords.filter(
                  r => !allRemovedIdsSet.has(r.questionId)
                );
                const remainingFavoriteIds = ctx.favoriteIds.filter(
                  id => !allRemovedIdsSet.has(id)
                );
                if (ctx.currentUser) {
                  for (const sid of ctx.selectedInitSubjects) {
                    subjectApi.delete(sid).catch(() => {});
                  }
                  for (const q of ctx.customQuestions.filter(q => ctx.selectedInitSubjects.includes(q.subject))) {
                    questionApi.delete(q.id).catch(() => {});
                  }
                }
                if (ctx.selectedInitSubjects.includes(ctx.currentSubjectId)) {
                  const remainingSubjects = ctx.allSubjects.filter(s => !ctx.selectedInitSubjects.includes(s.id));
                  ctx.setCurrentSubjectId(remainingSubjects[0]?.id || 'chinese');
                }
                ctx.setCustomQuestions(remainingCustomQuestions);
                ctx.setMistakeRecords(remainingMistakeRecords);
                ctx.setFavoriteIds(remainingFavoriteIds);
                ctx.setRemovedIds(newRemovedIds);
                ctx.setShowInitModal(false);
                if (ctx.selectedInitSubjects.length === ctx.allSubjects.length) {
                  ctx.setShowToast('✅ 系统已完全初始化!现在是真正的空题库状态。');
                } else {
                  ctx.setShowToast(`✅ 已初始化科目: ${ctx.selectedInitSubjects.map(id => ctx.allSubjects.find(s => s.id === id)?.name || id).join(', ')}!`);
                }
              }}
              disabled={ctx.selectedInitSubjects.length === 0}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <RefreshCcw size={16} />
                确认初始化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 科目管理模态框 */}
      {ctx.showSubjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                科目管理
              </h3>
              <button onClick={() => {
                ctx.setShowSubjectModal(false);
                ctx.setEditingSubject(null);
                ctx.setIsAddingNewSubject(false);
              }} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* 科目列表模式 */}
            {!ctx.editingSubject && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-4">
                  管理科目列表(所有科目均可编辑,至少保留1个科目)
                </p>
                {ctx.allSubjects.length > 0 && (
                  <div className="space-y-2">
                    {ctx.allSubjects.map(subject => (
                      <div key={subject.id}>
                        <div className={`flex items-center justify-between p-3 rounded-xl border ${
                          subject.isSubscribed && !subject.isOwner
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{subject.icon}</span>
                            <div>
                              <div className="font-medium text-slate-800 flex items-center gap-1.5">
                                {subject.name}
                                {subject.isSubscribed && !subject.isOwner ? (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                    <Share2 size={8} />共享{subject.creatorName ? ` · ${subject.creatorName}` : ''}
                                  </span>
                                ) : subject.isShared && subject.isOwner ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    subject.shareScope === 'students' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {subject.shareScope === 'students' ? '学生共享' : '已共享'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">自有</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">
                                {ctx.customQuestions.filter(q => q.subject === subject.id).length} 道题目
                                {subject.isShared && subject.isOwner && subject.subscriberCount ? ` · ${subject.subscriberCount}人订阅` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(ctx.isAdmin || subject.isOwner) && !subject.isSubscribed && (
                              <button
                                onClick={() => {
                                  if (ctx.expandedShareSubject === subject.id) {
                                    ctx.setExpandedShareSubject(null);
                                  } else {
                                    ctx.setExpandedShareSubject(subject.id);
                                  }
                                }}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                                  subject.shareScope === 'students'
                                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    : subject.shareScope === 'all'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                }`}
                                title="共享设置"
                              >
                                <Share2 size={12} />
                                <span className="hidden sm:inline">
                                  {subject.shareScope === 'students' ? '学生共享' : subject.shareScope === 'all' ? '全员共享' : '共享'}
                                </span>
                                <ChevronDown size={10} className={`transition-transform ${ctx.expandedShareSubject === subject.id ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                            {(ctx.isAdmin || !subject.isSubscribed || subject.isOwner) && (
                              <>
                                <button
                                  onClick={() => {
                                    ctx.setEditingSubject(subject);
                                    ctx.setIsAddingNewSubject(false);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <Edit3 size={12} />
                                  <span className="hidden sm:inline">编辑</span>
                                </button>
                                <button
                                  onClick={() => ctx.setSubjectToDelete(subject)}
                                  disabled={ctx.allSubjects.length <= 1}
                                  className="px-3 py-1.5 bg-rose-500 text-white text-sm rounded-lg hover:bg-rose-600 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={12} />
                                  <span className="hidden sm:inline">删除</span>
                                </button>
                              </>
                            )}
                            {subject.isSubscribed && !subject.isOwner && (
                              <button
                                onClick={async () => {
                                  if (confirm(`确定要退订科目「${subject.name}」吗?退订后该科目将不再显示。`)) {
                                    try {
                                      await subjectApi.leave(subject.id);
                                      window.location.reload();
                                    } catch (e: any) {
                                      ctx.setShowToast(e.message || '退订失败');
                                    }
                                  }
                                }}
                                className="px-3 py-1.5 bg-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-300 transition-colors"
                              >
                                退订
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 共享设置展开区域 */}
                        {ctx.expandedShareSubject === subject.id && (ctx.isAdmin || subject.isOwner) && !subject.isSubscribed && (
                          <div className="mt-1 p-4 bg-slate-50 rounded-xl border border-slate-200 ml-2">
                            <div className="flex items-center gap-2 mb-3">
                              <Share2 size={14} className="text-blue-600" />
                              <span className="text-sm font-bold text-slate-700">共享设置</span>
                            </div>
                            <div className="space-y-2 mb-3">
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                (subject.shareScope || 'none') === 'none' ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={(subject.shareScope || 'none') === 'none'}
                                  onChange={async () => {
                                    ctx.setCustomSubjects(ctx.allSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: false, shareScope: 'none' as const } : s
                                    ));
                                    if (ctx.currentUser) {
                                      subjectApi.update(subject.id, { shareScope: 'none' }).catch(() => {});
                                    }
                                    ctx.setShowToast(`已关闭「${subject.name}」共享`);
                                  }}
                                  className="accent-slate-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-slate-700">不共享</div>
                                  <div className="text-xs text-slate-400">仅自己可见</div>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                subject.shareScope === 'students' ? 'bg-indigo-50 ring-2 ring-indigo-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={subject.shareScope === 'students'}
                                  onChange={async () => {
                                    ctx.setCustomSubjects(ctx.allSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: true, shareScope: 'students' as const } : s
                                    ));
                                    if (ctx.currentUser) {
                                      try {
                                        await subjectApi.update(subject.id, { shareScope: 'students', studentIds: [] });
                                      } catch (e: any) {
                                        ctx.setShowToast('保存失败: ' + (e.message || '未知错误'));
                                        return;
                                      }
                                    }
                                    ctx.setShowToast(`已开启「${subject.name}」学生共享`);
                                    ctx.setExpandedShareSubject(null);
                                    ctx.setShowSubjectModal(false);
                                    ctx.setStudentSelectorSubject({ id: subject.id, name: subject.name });
                                  }}
                                  className="accent-indigo-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-indigo-700">仅共享给学生</div>
                                  <div className="text-xs text-slate-400">你的学生可直接访问,也可生成邀请码</div>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                subject.shareScope === 'all' ? 'bg-emerald-50 ring-2 ring-emerald-400' : 'bg-white hover:bg-slate-50 border border-slate-100'
                              }`}>
                                <input
                                  type="radio"
                                  name={`share-${subject.id}`}
                                  checked={subject.shareScope === 'all'}
                                  onChange={async () => {
                                    ctx.setCustomSubjects(ctx.allSubjects.map(s =>
                                      s.id === subject.id ? { ...s, isShared: true, shareScope: 'all' as const } : s
                                    ));
                                    if (ctx.currentUser) {
                                      try {
                                        await subjectApi.update(subject.id, { shareScope: 'all' });
                                      } catch (e: any) {
                                        ctx.setShowToast('保存失败: ' + (e.message || '未知错误'));
                                        return;
                                      }
                                    }
                                    ctx.setShowToast(`已开启「${subject.name}」全员共享`);
                                  }}
                                  className="accent-emerald-600"
                                />
                                <div>
                                  <div className="text-sm font-medium text-emerald-700">全员共享</div>
                                  <div className="text-xs text-slate-400">任何用户可通过邀请码加入</div>
                                </div>
                              </label>
                            </div>
                            {subject.shareScope === 'students' && (
                              <div className="mt-2">
                                <button
                                  onClick={() => {
                                    ctx.setExpandedShareSubject(null);
                                    ctx.setShowSubjectModal(false);
                                    ctx.setStudentSelectorSubject({ id: subject.id, name: subject.name });
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-indigo-200 hover:border-indigo-300 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <GraduationCap size={14} className="text-indigo-500" />
                                    <span className="text-sm text-indigo-700">选择共享学生</span>
                                  </div>
                                  <ChevronRight size={14} className="text-indigo-400" />
                                </button>
                              </div>
                            )}
                            {(subject.shareScope === 'students' || subject.shareScope === 'all') && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <Key size={14} className={subject.shareScope === 'students' ? 'text-indigo-600' : 'text-emerald-600'} />
                                  <span className="text-sm font-medium text-slate-700">邀请码</span>
                                  {subject.shareScope === 'students' && (
                                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">仅限学生使用</span>
                                  )}
                                </div>
                                <SubjectShareCode subjectId={subject.id} subjectName={subject.name} scope={subject.shareScope} />
                                {subject.subscriberCount ? (
                                  <p className="text-xs text-emerald-600 mt-2">已有 {subject.subscriberCount} 人订阅</p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {ctx.ownSubjectCount < MAX_OWN_SUBJECTS ? (
                  <button
                    onClick={() => {
                      ctx.setEditingSubject({
                        id: `${CUSTOM_SUBJECT_PREFIX}${Date.now()}`,
                        name: '',
                        icon: '📝',
                        welcomeTitle: '新课程学习',
                        welcomeDesc: '开始新的学习之旅',
                      });
                      ctx.setIsAddingNewSubject(true);
                      ctx.setIsSubjectPendingCreation(false);
                    }}
                    className="w-full mt-4 px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 border-2 border-dashed border-indigo-200"
                  >
                    <PlusCircle size={18} />
                    添加新科目({ctx.ownSubjectCount}/{MAX_OWN_SUBJECTS})
                  </button>
                ) : (
                  <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-center">
                    <p className="text-sm text-amber-700">
                      已达到自有科目最大数量({MAX_OWN_SUBJECTS}个),如需添加请先删除现有科目
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 编辑表单模式 */}
            {ctx.editingSubject && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => {
                      ctx.setEditingSubject(null);
                      ctx.setIsAddingNewSubject(false);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={20} className="text-slate-500" />
                  </button>
                  <h4 className="font-bold text-slate-700">
                    {ctx.isAddingNewSubject ? '添加新科目' : `编辑「${ctx.editingSubject.name}」`}
                  </h4>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">科目名称</label>
                  <input
                    type="text"
                    value={ctx.editingSubject.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const suggestion = suggestSubject(newName);
                      if (suggestion) {
                        ctx.setEditingSubject({
                          ...ctx.editingSubject!,
                          name: newName,
                          icon: suggestion.icon,
                          welcomeTitle: suggestion.welcomeTitle,
                          welcomeDesc: suggestion.welcomeDesc,
                        });
                      } else {
                        ctx.setEditingSubject({ ...ctx.editingSubject!, name: newName });
                      }
                    }}
                    placeholder="例如:物理、化学..."
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors"
                    maxLength={20}
                  />
                  {ctx.editingSubject.name.trim() && suggestSubject(ctx.editingSubject.name) && (
                    <p className="text-xs text-blue-500 mt-1">已根据科目名称自动推荐图标和描述,可自行修改</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">选择图标</label>
                  <div className="bg-slate-50 rounded-xl p-3 max-h-48 overflow-y-auto">
                    {Object.entries(SUBJECT_ICONS).map(([category, icons]) => (
                      <div key={category} className="mb-3 last:mb-0">
                        <div className="text-xs text-slate-400 font-medium mb-2">{category}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {icons.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => ctx.setEditingSubject({ ...ctx.editingSubject!, icon })}
                              className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${
                                ctx.editingSubject!.icon === icon
                                  ? 'bg-blue-600 text-white scale-110 shadow-md ring-2 ring-blue-400'
                                  : 'bg-white hover:bg-blue-50 hover:scale-105 shadow-sm'
                              }`}
                              title={icon}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>当前选择:</span>
                    <span className="text-2xl bg-blue-50 w-10 h-10 rounded-lg flex items-center justify-center border border-blue-100">
                      {ctx.editingSubject.icon}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">欢迎标题</label>
                  <input
                    type="text"
                    value={ctx.editingSubject.welcomeTitle}
                    onChange={(e) => ctx.setEditingSubject({ ...ctx.editingSubject!, welcomeTitle: e.target.value })}
                    placeholder="例如:化学知识小测"
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors"
                    maxLength={30}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">科目描述</label>
                  <textarea
                    value={ctx.editingSubject.welcomeDesc}
                    onChange={(e) => ctx.setEditingSubject({ ...ctx.editingSubject!, welcomeDesc: e.target.value })}
                    placeholder="简要描述这个科目的内容..."
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-colors resize-none"
                    rows={2}
                    maxLength={100}
                  />
                </div>
              </div>
            )}

            {ctx.editingSubject && (
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    ctx.setEditingSubject(null);
                    ctx.setIsAddingNewSubject(false);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  返回列表
                </button>
                <button
                  onClick={() => {
                    if (!ctx.editingSubject!.name.trim()) {
                      ctx.setShowToast('请输入科目名称');
                      return;
                    }
                    if (ctx.isAddingNewSubject) {
                      if (ctx.ownSubjectCount >= MAX_OWN_SUBJECTS) {
                        ctx.setShowToast(`最多只能添加 ${MAX_OWN_SUBJECTS} 个自有科目`);
                        return;
                      }
                      const newSubject = { ...ctx.editingSubject!, id: `${CUSTOM_SUBJECT_PREFIX}${Date.now()}` };
                      ctx.setCustomSubjects([...ctx.allSubjects, newSubject]);
                      ctx.setCurrentSubjectId(newSubject.id);
                      ctx.setIsSubjectPendingCreation(true);
                      if (ctx.currentUser) {
                        subjectApi.create({ id: newSubject.id, name: newSubject.name, icon: newSubject.icon, welcomeTitle: newSubject.welcomeTitle, welcomeDesc: newSubject.welcomeDesc, shareScope: newSubject.shareScope || 'none' })
                          .then(() => ctx.setIsSubjectPendingCreation(false))
                          .catch(() => ctx.setIsSubjectPendingCreation(false));
                      } else {
                        ctx.setIsSubjectPendingCreation(false);
                      }
                      ctx.setShowToast(`已添加科目「${newSubject.name}」`);
                    } else {
                      ctx.setCustomSubjects(ctx.allSubjects.map(s =>
                        s.id === ctx.editingSubject!.id ? ctx.editingSubject! : s
                      ));
                      if (ctx.currentUser) {
                        subjectApi.update(ctx.editingSubject!.id, {
                          name: ctx.editingSubject!.name,
                          icon: ctx.editingSubject!.icon,
                          welcomeTitle: ctx.editingSubject!.welcomeTitle,
                          welcomeDesc: ctx.editingSubject!.welcomeDesc,
                          shareScope: ctx.editingSubject!.shareScope || 'none',
                        }).catch(() => {});
                      }
                      ctx.setShowToast(`已更新科目「${ctx.editingSubject!.name}」`);
                    }
                    ctx.setEditingSubject(null);
                    ctx.setIsAddingNewSubject(false);
                    ctx.setIsSubjectPendingCreation(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  {ctx.isAddingNewSubject ? '添加' : '保存'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 科目删除确认对话框 */}
      <AnimatePresence>
        {ctx.subjectToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => ctx.setSubjectToDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.4 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-rose-500 to-red-600 px-6 py-8 flex flex-col items-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">确认删除</h3>
              </div>

              <div className="p-6 text-center">
                <p className="text-slate-600 mb-2">确定要删除科目</p>
                <p className="text-lg font-bold text-slate-800 mb-3">
                  「{ctx.subjectToDelete.name}」
                </p>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4">
                  <p className="text-sm text-rose-600">
                    <span className="font-bold">{ctx.customQuestions.filter(q => q.subject === ctx.subjectToDelete!.id).length}</span> 道关联题目也将被删除
                  </p>
                </div>
                <p className="text-xs text-slate-400">此操作无法撤销</p>
              </div>

              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => ctx.setSubjectToDelete(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (ctx.allSubjects.length <= 1) {
                      ctx.setShowToast('至少保留一个科目');
                      ctx.setSubjectToDelete(null);
                      return;
                    }
                    const newCustomSubjects = ctx.allSubjects.filter(s => s.id !== ctx.subjectToDelete!.id);
                    ctx.setCustomSubjects(newCustomSubjects);
                    if (ctx.currentSubjectId === ctx.subjectToDelete!.id) {
                      const fallback = newCustomSubjects[0] || ctx.allSubjects[0];
                      ctx.setCurrentSubjectId(fallback?.id || 'chinese');
                    }
                    if (ctx.currentUser) {
                      subjectApi.delete(ctx.subjectToDelete!.id).catch(() => {});
                    }
                    const customQuestionIds = ctx.customQuestions
                      .filter(q => q.subject === ctx.subjectToDelete!.id)
                      .map(q => q.id);
                    const newRemovedIds = [...new Set([...ctx.removedIds, ...customQuestionIds])];
                    ctx.setRemovedIds(newRemovedIds);
                    ctx.setCustomQuestions(prev => prev.filter(q => q.subject !== ctx.subjectToDelete!.id));
                    ctx.setShowToast(`已删除科目「${ctx.subjectToDelete!.name}」及相关题目`);
                    ctx.setSubjectToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-br from-rose-500 to-red-600 text-white font-semibold rounded-xl hover:from-rose-600 hover:to-red-700 transition-all shadow-lg shadow-rose-200"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 退出应用确认 */}
      {showExitPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1001] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 text-center"
          >
            <h3 className="text-lg font-bold text-slate-800 mb-2">确定要退出吗？</h3>
            <p className="text-sm text-slate-500 mb-6">点击返回将离开应用页面</p>
            <div className="flex gap-3">
              <button
                onClick={cancelExit}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmExit}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
              >
                退出
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
