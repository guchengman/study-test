import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useUIState } from '../hooks/useUIState';
import { useQuestionBank } from '../hooks/useQuestionBank';
import { useExam } from '../hooks/useExam';

type AppContextType = ReturnType<typeof useAuth> &
  ReturnType<typeof useToast> &
  ReturnType<typeof useUIState> &
  ReturnType<typeof useQuestionBank> &
  ReturnType<typeof useExam>;

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const toast = useToast();
  const ui = useUIState();
  const qb = useQuestionBank(auth.currentUser, auth.authUser, toast.setShowToast);
  const exam = useExam({
    currentBank: qb.currentBank,
    favoriteIds: qb.favoriteIds,
    mistakeRecords: qb.mistakeRecords,
    setMistakeRecords: qb.setMistakeRecords,
    examQuestionCount: qb.examQuestionCount,
    currentUser: auth.currentUser,
    setShowToast: toast.setShowToast,
    setConfirmingDeduplicate: ui.setConfirmingDeduplicate,
    setConfirmingFilter: ui.setConfirmingFilter,
    setSearchQuery: ui.setSearchQuery,
    setIsSearchOpen: ui.setIsSearchOpen,
    setIsImportModalOpen: ui.setIsImportModalOpen,
  });

  return (
    <AppContext.Provider value={{ ...auth, ...toast, ...ui, ...qb, ...exam }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
