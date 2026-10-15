import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RouteMeta from './components/RouteMeta';
import RouteFocus from './components/RouteFocus';
import ErrorBoundary from './components/ErrorBoundary';
import RouteFallback from './components/RouteFallback';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

/*
 * Widoki są ładowane dopiero przy wejściu na trasę. Przed tym zmianą wszystkie siedemnaście
 * stron były w jednym eager imporcie, więc pakiet startowy miał 639,7 kB zminifikowanego kodu
 * (177,51 kB gzip) i nauczyciel wchodzący na /login pobierał m.in. kolejkę oceniania,
 * edytor kluczy i react-image-crop, których na loginie nie ma. Shell (auth, sidebar,
 * meta, fokus) zostaje w paku startowym — bez niego pierwsze malowanie byłoby pustym ekranem.
 */
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const VerifyPhonePage = lazy(() => import('./pages/VerifyPhonePage'));
const NewDashboardPage = lazy(() => import('./pages/NewDashboardPage'));
const ClassesPage = lazy(() => import('./pages/ClassesPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const GradingQueuePage = lazy(() => import('./pages/GradingQueuePage'));
const GradeThresholdsPage = lazy(() => import('./pages/GradeThresholdsPage'));
const AnswerKeysPage = lazy(() => import('./pages/AnswerKeysPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const HistorySessionPage = lazy(() => import('./pages/HistorySessionPage'));
const StudentWorkPage = lazy(() => import('./pages/StudentWorkPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function App() {
  return (
    <BrowserRouter>
      <RouteMeta />
      <RouteFocus />
      <AuthProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Trasy bez logowania */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/verify-phone" element={<VerifyPhonePage />} />

              {/* Trasy chronione */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <NewDashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/classes"
                element={
                  <ProtectedRoute>
                    <ClassesPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/classes/:classId"
                element={
                  <ProtectedRoute>
                    <StudentsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/grading/:classId"
                element={
                  <ProtectedRoute>
                    <GradingQueuePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/grade-thresholds"
                element={
                  <ProtectedRoute>
                    <GradeThresholdsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/answer-keys"
                element={
                  <ProtectedRoute>
                    <AnswerKeysPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/history/:sessionId"
                element={
                  <ProtectedRoute>
                    <HistorySessionPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/history/:sessionId/grade/:gradeId"
                element={
                  <ProtectedRoute>
                    <StudentWorkPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/wallet"
                element={
                  <ProtectedRoute>
                    <WalletPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Stary adres menu: subskrypcji nie wprowadzamy, saldo jest doładowywane */}
              <Route path="/subscription" element={<Navigate to="/wallet" replace />} />

              {/* Defaultowe przekierowanie */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
