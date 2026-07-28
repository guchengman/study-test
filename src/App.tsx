/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/app/AppLayout';

// 路由级代码分割（R3 / T10a）：5 个页面改为 React.lazy，首屏仅加载 AppLayout 外壳
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ExamPage = lazy(() => import('./pages/ExamPage').then((m) => ({ default: m.ExamPage })));
const ResultPage = lazy(() => import('./pages/ResultPage').then((m) => ({ default: m.ResultPage })));
const FormalExamPage = lazy(() => import('./pages/FormalExamPage').then((m) => ({ default: m.FormalExamPage })));
const ExamManagePage = lazy(() => import('./pages/ExamManagePage').then((m) => ({ default: m.ExamManagePage })));

const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-gray-400">加载中…</div>
);

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={<PageFallback />}><HomePage /></Suspense>} />
          <Route path="exam" element={<Suspense fallback={<PageFallback />}><ExamPage /></Suspense>} />
          <Route path="result" element={<Suspense fallback={<PageFallback />}><ResultPage /></Suspense>} />
          <Route path="formal-exam" element={<Suspense fallback={<PageFallback />}><FormalExamPage /></Suspense>} />
          <Route path="exams/manage" element={<Suspense fallback={<PageFallback />}><ExamManagePage /></Suspense>} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
