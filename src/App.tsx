/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/app/AppLayout';
import { HomePage } from './pages/HomePage';
import { ExamPage } from './pages/ExamPage';
import { ResultPage } from './pages/ResultPage';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="exam" element={<ExamPage />} />
          <Route path="result" element={<ResultPage />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
