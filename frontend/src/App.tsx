
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('robin_auth_token');
  const location = useLocation();

  if (!token) {
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
  const isPopup = location.pathname.includes('/create-rule/');

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
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
