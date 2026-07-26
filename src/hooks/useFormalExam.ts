/**
 * 正式考试状态机 Hook
 *
 * 状态：`list`（列表） → `taking`（答题） → `result`（成绩 / 错题回顾）
 * 负责：
 *  - 调用 examApi 开始 / 提交 / 复用 attempt
 *  - 基于服务端 deadline 的客户端倒计时；归零自动调用 submit（强制自动交卷·前端侧）
 *  - reused:true 时通过 getAttempt 回填已作答答案，支持「稍后继续」
 *
 * 评分权威在服务端；本 Hook 不信任本地分数，仅做交互与计时。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { examApi } from '../services/examApi';
import type { ExamAvailableItem, ExamStartResponse, ExamSubmitResponse } from '../types';

export type FormalExamPhase = 'list' | 'taking' | 'result';

export interface UseFormalExam {
  /** 当前状态机阶段 */
  phase: FormalExamPhase;
  /** 列表加载（由页面负责，本 Hook 仅管理答题流程） */
  loading: boolean;
  /** 流程级错误提示 */
  error: string | null;
  /** 正在参加的试卷（来自 available 列表，含 pass_score 等元信息） */
  currentExam: ExamAvailableItem | null;
  /** 开始考试后的 attempt（attemptId / deadline / 题目） */
  attempt: ExamStartResponse | null;
  /** 学员作答 { [questionId]: 答案 } */
  userAnswers: Record<number, string | string[]>;
  /** 剩余秒数（基于 deadline 实时计算） */
  timeLeft: number;
  /** 截止时间戳（ms），用于校验 */
  deadline: number | null;
  /** 是否正在提交 */
  submitting: boolean;
  /** 提交后的成绩（含 details） */
  result: ExamSubmitResponse | null;
  /** 开始一场考试 */
  startExam: (exam: ExamAvailableItem) => Promise<void>;
  /** 记录某题答案 */
  setAnswer: (questionId: number, answer: string | string[]) => void;
  /** 手动 / 自动提交 */
  submit: () => Promise<void>;
  /** 返回列表并重置状态 */
  reset: () => void;
}

export function useFormalExam(): UseFormalExam {
  const [phase, setPhase] = useState<FormalExamPhase>('list');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentExam, setCurrentExam] = useState<ExamAvailableItem | null>(null);
  const [attempt, setAttempt] = useState<ExamStartResponse | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string | string[]>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<ExamSubmitResponse | null>(null);

  const timerRef = useRef<number | null>(null);
  // 始终持有最新的 submit，供倒计时归零时触发自动交卷
  const submitRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (deadlineMs: number) => {
      clearTimer();
      const tick = (): number => {
        const left = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
        setTimeLeft(left);
        return left;
      };
      tick();
      const id = window.setInterval(() => {
        const left = tick();
        if (left <= 0) {
          clearTimer();
          // 强制自动交卷：前端主动侧（后端惰性兜底 + owner sweep 为补充）
          void submitRef.current();
        }
      }, 1000);
      timerRef.current = id;
    },
    [clearTimer],
  );

  const submit = useCallback(async () => {
    if (!attempt || !currentExam) return;
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    clearTimer();
    try {
      const res = await examApi.submit(currentExam.id, attempt.attemptId, userAnswers);
      setResult(res);
      setPhase('result');
    } catch (e: any) {
      setError(e?.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [attempt, currentExam, userAnswers, submitting, clearTimer]);

  // 同步最新 submit 到 ref，保证倒计时回调调用的是最新闭包
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const startExam = useCallback(
    async (exam: ExamAvailableItem) => {
      setLoading(true);
      setError(null);
      try {
        const res = await examApi.start(exam.id);
        setCurrentExam(exam);
        setAttempt(res);
        setResult(null);

        // 复用进行中 attempt：回填已作答答案，支持「稍后继续」
        let initialAnswers: Record<number, string | string[]> = {};
        if (res.reused) {
          try {
            const a = await examApi.getAttempt(res.attemptId);
            initialAnswers = a.attempt.answers || {};
          } catch {
            // 取答案失败则从头开始，不阻断考试
            initialAnswers = {};
          }
        }
        setUserAnswers(initialAnswers);
        setPhase('taking');

        const deadlineMs = new Date(res.deadline).getTime();
        setDeadline(deadlineMs);
        startCountdown(deadlineMs);
      } catch (e: any) {
        setError(e?.message || '开始考试失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [startCountdown],
  );

  const setAnswer = useCallback((questionId: number, answer: string | string[]) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setPhase('list');
    setCurrentExam(null);
    setAttempt(null);
    setUserAnswers({});
    setResult(null);
    setDeadline(null);
    setTimeLeft(0);
    setError(null);
  }, [clearTimer]);

  // 卸载时清理计时器
  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    phase,
    loading,
    error,
    currentExam,
    attempt,
    userAnswers,
    timeLeft,
    deadline,
    submitting,
    result,
    startExam,
    setAnswer,
    submit,
    reset,
  };
}
