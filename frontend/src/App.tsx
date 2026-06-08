
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PlatformProvider } from './context/PlatformContext';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import RuleStudio from './pages/RuleStudio';
import Connections from './pages/Connections';
import LineageStudio from './pages/LineageStudio';
import UsageAnalytics from './pages/UsageAnalytics';
import DataCatalog from './pages/DataCatalog';
import TableDetail from './pages/TableDetail';
import DataQualityDetail from './pages/DataQualityDetail';
import CreateRule from './pages/CreateRule';
import AIAgent from './pages/AIAgent';
import RuleDetail from './pages/RuleDetail';
import ObservabilityConnections from './pages/ObservabilityConnections';
import ObservabilityConnectionDetail from './pages/ObservabilityConnectionDetail';
import ObservabilityAlerts from './pages/ObservabilityAlerts';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('robin_auth_token');
  const userType = localStorage.getItem('user_type');
  const isConnected = localStorage.getItem('is_connected') === 'true';
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (userType === 'user' && !isConnected) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <PlatformProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/*" 
            element={
              <ProtectedRoute>
                <AuthenticatedApp />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </Router>
    </PlatformProvider>
  );
}

function AuthenticatedApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPopup = location.pathname.includes('/create-rule/');

  // Inactivity auto-logout monitoring (15 minutes)
  React.useEffect(() => {
    let timeoutId: number;
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutDueToInactivity, INACTIVITY_TIMEOUT);
    };

    const logoutDueToInactivity = () => {
      // Clear session completely
      localStorage.removeItem('robin_auth_token');
      localStorage.removeItem('robin_user');
      localStorage.removeItem('selected_role');
      localStorage.removeItem('user_type');
      localStorage.removeItem('is_authenticated');
      localStorage.removeItem('is_connected');
      localStorage.removeItem('selected_platform');
      localStorage.removeItem('robin_user_session');

      // Navigate to login with expiry reason
      navigate('/login', { state: { message: 'Session expired. Please login again.' } });
    };

    // User activity listeners
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);

    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
    };
  }, [navigate]);

  return (
    <div className="app-root">
      {!isPopup && <TopBar />}
      <div className="app-container" style={{ paddingTop: isPopup ? 0 : 'var(--top-bar-height)' }}>
        {!isPopup && <Sidebar />}
        <main className="main-content" style={{ paddingLeft: isPopup ? 0 : 'var(--sidebar-width)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ai-agent" element={<AIAgent />} />
            <Route path="/studio" element={<RuleStudio />} />
            <Route path="/lineage" element={<LineageStudio />} />
            <Route path="/analytics" element={<UsageAnalytics />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/observability/connections" element={<ObservabilityConnections />} />
            <Route path="/observability/connections/:id" element={<ObservabilityConnectionDetail />} />
            <Route path="/observability/alerts" element={<ObservabilityAlerts />} />
            <Route path="/catalog" element={<DataCatalog />} />
            <Route path="/catalog/:database/:schema/:table" element={<TableDetail />} />
            <Route path="/catalog/:database/:schema/:table/dq/primary" element={<DataQualityDetail />} />
            <Route path="/catalog/:database/:schema/:table/dq/primary/create-rule/:column" element={<CreateRule />} />
            <Route path="/rule/:ruleName" element={<RuleDetail />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
