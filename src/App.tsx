import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/layout/Layout'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import Scores from './pages/Scores'
import Leaderboard from './pages/Leaderboard'
import TeeTimes from './pages/TeeTimes'
import Groups from './pages/Groups'
import RSVP from './pages/RSVP'
import RSVPLanding from './pages/RSVPLanding'
import Contests from './pages/Contests'
import Updates from './pages/Updates'
import AdminPanel from './pages/AdminPanel'
import AccountPage from './pages/AccountPage'
import MyTeamPage from './pages/MyTeamPage'
import CoursePage from './pages/CoursePage'
import WelcomePage from './pages/WelcomePage'
import InviteResponsePage from './pages/InviteResponsePage'

function Spinner() {
  return (
    <div style={{ minHeight: '100dvh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin" style={{ width: 40, height: 40, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to={sessionStorage.getItem('chubbs-new-reg') ? '/welcome' : '/'} replace /> : <AuthPage />} />
      <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
      <Route path="/invite-response" element={<InviteResponsePage />} />
      <Route path="/rsvp-landing" element={<RSVPLanding />} />

      <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/my-team" element={<ProtectedRoute><Layout><MyTeamPage /></Layout></ProtectedRoute>} />
      <Route path="/course" element={<ProtectedRoute><Layout><CoursePage /></Layout></ProtectedRoute>} />
      <Route path="/scores" element={<ProtectedRoute><Layout><Scores /></Layout></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Layout><Leaderboard /></Layout></ProtectedRoute>} />
      <Route path="/tee-times" element={<ProtectedRoute><Layout><TeeTimes /></Layout></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Layout><Groups /></Layout></ProtectedRoute>} />
      <Route path="/contests" element={<ProtectedRoute><Layout><Contests /></Layout></ProtectedRoute>} />
      <Route path="/updates" element={<ProtectedRoute><Layout><Updates /></Layout></ProtectedRoute>} />
<Route path="/rsvp" element={<ProtectedRoute adminOnly><Layout><RSVP /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminPanel /></Layout></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Layout><AccountPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
