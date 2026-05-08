import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { WelcomeScreen } from '../components/app/WelcomeScreen';

export function HomePage() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (ctx.status === 'exam') {
      navigate('/exam', { replace: true });
    }
  }, [ctx.status, navigate]);

  return (
    <WelcomeScreen
      allSubjects={ctx.allSubjects}
      currentSubjectId={ctx.currentSubjectId}
      setCurrentSubjectId={ctx.setCurrentSubjectId}
      questionsLoading={ctx.questionsLoading}
      currentSubject={ctx.currentSubject}
      currentBankLength={ctx.currentBank.length}
      examQuestionCount={ctx.examQuestionCount}
      setExamQuestionCount={ctx.setExamQuestionCount}
      setShowToast={ctx.setShowToast}
      startExam={ctx.startExam}
      mistakeRecordsLength={ctx.mistakeRecords.length}
      currentSubjectFavoriteCount={ctx.currentSubjectFavoriteCount}
      setIsImportModalOpen={ctx.setIsImportModalOpen}
      currentUser={ctx.currentUser}
      setEditingSubject={ctx.setEditingSubject}
      setIsAddingNewSubject={ctx.setIsAddingNewSubject}
      setShowSubjectModal={ctx.setShowSubjectModal}
      mistakeRecordsEmpty={ctx.mistakeRecords.length === 0}
      favoriteIdsEmpty={ctx.favoriteIds.length === 0}
    />
  );
}
