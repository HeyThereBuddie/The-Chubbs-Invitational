import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useYear } from './context/YearContext'
import { ToastProvider } from './context/ToastContext'
import { YearProvider } from './context/YearContext'
import { ThemeProvider } from './context/ThemeContext'
import { SyncProvider } from './context/SyncContext'
import { CourseProvider } from './context/CourseContext'
import { TourProvider } from './context/TourContext'
import Layout from './components/layout/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import UpdatePrompt from './components/UpdatePrompt'
import AuthPage from './pages/AuthPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Dashboard from './pages/Dashboard'
import Scores from './pages/Scores'
import Leaderboard from './pages/Leaderboard'
import TeeTimes from './pages/TeeTimes'
import Groups from './pages/Groups'
import Tourney from './pages/Tourney'
import RulesPage from './pages/RulesPage'
import RSVPLanding from './pages/RSVPLanding'
import Contests from './pages/Contests'
import Updates from './pages/Updates'
import AdminPanel from './pages/AdminPanel'
import AccountPage from './pages/AccountPage'
import MyTeamPage from './pages/MyTeamPage'
import CoursePage from './pages/CoursePage'
import LiveFeed from './pages/LiveFeed'
import WelcomePage from './pages/WelcomePage'
import InviteResponsePage from './pages/InviteResponsePage'
import HallOfFame from './pages/HallOfFame'
import HappysPlace from './pages/HappysPlace'
import GpsPage from './pages/GpsPage'

function Spinner() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin" style={{ width: 40, height: 40, border: '3px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false, playerRedirect }: { children: React.ReactNode; adminOnly?: boolean; playerRedirect?: string }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  // Scores is admin-only in the nav; players who deep-link land on GPS instead
  if (playerRedirect && !isAdmin) return <Navigate to={playerRedirect} replace />
  return <>{children}</>
}

// GPS is live-only — a past-tournament snapshot has no use for it, so bounce to
// the dashboard (which shows that tournament's archived data instead).
function LiveOnly({ children }: { children: React.ReactNode }) {
  const { isCurrentYear } = useYear()
  if (!isCurrentYear) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, profile, loading, recovery } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />

  // A password-reset link opens a temporary recovery session. Take over the whole
  // app with the reset screen until the user sets a new password (or the link fails),
  // so they can't slip into the app on the recovery token.
  if (recovery) return <ResetPasswordPage />

  // New players must finish the mandatory setup wizard before entering the app.
  const needsSetup = !!user && !!profile && profile.onboarded === false
  const setupExempt = location.pathname === '/welcome' || location.pathname === '/auth' || location.pathname === '/invite-response' || location.pathname === '/rsvp-landing'
  if (needsSetup && !setupExempt) return <Navigate to="/welcome" replace />

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to={sessionStorage.getItem('chubbs-new-reg') ? '/welcome' : '/'} replace /> : <AuthPage />} />
      {/* Landing target for password-reset emails. Public so the link resolves even
          before the recovery session is parsed (the recovery short-circuit above then
          takes over once it fires). */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
      <Route path="/invite-response" element={<InviteResponsePage />} />
      <Route path="/rsvp-landing" element={<RSVPLanding />} />

      <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/my-team" element={<ProtectedRoute><Layout><MyTeamPage /></Layout></ProtectedRoute>} />
      <Route path="/course" element={<ProtectedRoute><Layout><CoursePage /></Layout></ProtectedRoute>} />
      <Route path="/live-feed" element={<ProtectedRoute><Layout><LiveFeed /></Layout></ProtectedRoute>} />
      <Route path="/scores" element={<ProtectedRoute playerRedirect="/gps"><Layout><Scores /></Layout></ProtectedRoute>} />
      <Route path="/gps" element={<ProtectedRoute><LiveOnly><Layout><GpsPage /></Layout></LiveOnly></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Layout><Leaderboard /></Layout></ProtectedRoute>} />
      <Route path="/hall-of-fame" element={<ProtectedRoute><Layout><HallOfFame /></Layout></ProtectedRoute>} />
      <Route path="/happys-place" element={<ProtectedRoute><Layout><HappysPlace /></Layout></ProtectedRoute>} />
      <Route path="/tourney" element={<ProtectedRoute><Layout><Tourney /></Layout></ProtectedRoute>} />
      <Route path="/rules" element={<ProtectedRoute><Layout><RulesPage /></Layout></ProtectedRoute>} />
      <Route path="/tee-times" element={<ProtectedRoute><Layout><TeeTimes /></Layout></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Layout><Groups /></Layout></ProtectedRoute>} />
      <Route path="/contests" element={<ProtectedRoute><Layout><Contests /></Layout></ProtectedRoute>} />
      <Route path="/updates" element={<ProtectedRoute><Layout><Updates /></Layout></ProtectedRoute>} />
      <Route path="/rsvp" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminPanel /></Layout></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Layout><AccountPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <YearProvider>
              <SyncProvider>
                <CourseProvider>
                  <TourProvider>
                    <ErrorBoundary>
                      <AppRoutes />
                    </ErrorBoundary>
                    <UpdatePrompt />
                  </TourProvider>
                </CourseProvider>
              </SyncProvider>
            </YearProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
