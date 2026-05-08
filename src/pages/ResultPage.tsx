import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ResultScreen } from '../components/app/ResultScreen';

export function ResultPage() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ctx.finalResult) {
      navigate('/', { replace: true });
    }
  }, [ctx.finalResult, navigate]);

  useEffect(() => {
    if (ctx.status === 'welcome') {
      navigate('/', { replace: true });
    }
  }, [ctx.status, navigate]);

  const handleBackWelcome = useCallback(() => {
    ctx.goWelcome();
    navigate('/', { replace: true });
  }, [ctx.goWelcome, navigate]);

  if (!ctx.finalResult) return null;

  return (
    <ResultScreen
      finalResult={ctx.finalResult}
      examQuestions={ctx.examQuestions}
      mistakeRecords={ctx.mistakeRecords}
      masteredIds={ctx.masteredIds}
      elapsedTime={ctx.elapsedTime}
      onBackWelcome={handleBackWelcome}
    />
  );
}
