import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ExamScreen } from '../components/app/ExamScreen';

export function ExamPage() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ctx.isExamActive) {
      navigate('/', { replace: true });
    }
  }, [ctx.isExamActive, navigate]);

  useEffect(() => {
    if (ctx.status === 'result') {
      navigate('/result', { replace: true });
    }
  }, [ctx.status, navigate]);

  const currentQuestion = ctx.examQuestions[ctx.currentIndex];

  const handleSetStatus = useCallback((s: string) => {
    if (s === 'welcome') {
      ctx.goWelcome();
      navigate('/', { replace: true });
    }
  }, [ctx.goWelcome, navigate]);

  const handleRemoveQuestion = useCallback((id: number) => {
    ctx.handleRemoveQuestionFromExam(id, ctx.removeQuestion);
    ctx.setConfirmingDelete(false);
  }, [ctx.handleRemoveQuestionFromExam, ctx.removeQuestion, ctx.setConfirmingDelete]);

  if (!ctx.isExamActive) return null;
  if (!currentQuestion) return null;

  return (
    <ExamScreen
      examQuestions={ctx.examQuestions}
      currentIndex={ctx.currentIndex}
      setCurrentIndex={ctx.setCurrentIndex}
      currentQuestion={currentQuestion}
      userAnswers={ctx.userAnswers}
      handleAnswerChange={ctx.handleAnswerChange}
      toggleMultipleAnswer={ctx.toggleMultipleAnswer}
      showFeedback={ctx.showFeedback}
      setShowFeedback={ctx.setShowFeedback}
      isRandomMode={ctx.isRandomMode}
      isMistakeMode={ctx.isMistakeMode}
      isFullMode={ctx.isFullMode}
      favoriteIds={ctx.favoriteIds}
      mistakeRecords={ctx.mistakeRecords}
      toggleFavorite={ctx.toggleFavorite}
      removeQuestion={handleRemoveQuestion}
      confirmingDelete={ctx.confirmingDelete}
      setConfirmingDelete={ctx.setConfirmingDelete}
      searchQuery={ctx.searchQuery}
      setSearchQuery={ctx.setSearchQuery}
      isSearchOpen={ctx.isSearchOpen}
      setIsSearchOpen={ctx.setIsSearchOpen}
      confirmingDeduplicate={ctx.confirmingDeduplicate}
      setConfirmingDeduplicate={ctx.setConfirmingDeduplicate}
      deduplicateBank={ctx.deduplicateBank}
      confirmingFilter={ctx.confirmingFilter}
      setConfirmingFilter={ctx.setConfirmingFilter}
      filterObjectiveOnly={ctx.filterObjectiveOnly}
      currentUser={ctx.currentUser}
      exportFormat={ctx.exportFormat}
      setExportFormat={ctx.setExportFormat}
      exportQuestionBank={ctx.exportQuestionBank}
      openImportModal={() => ctx.setIsImportModalOpen(true)}
      checkProgrammingAnswer={ctx.checkProgrammingAnswer}
      checkMultipleAnswer={ctx.checkMultipleAnswer}
      calculateResult={ctx.calculateResult}
      setStatus={handleSetStatus}
      setIsImportModalOpen={ctx.setIsImportModalOpen}
    />
  );
}
