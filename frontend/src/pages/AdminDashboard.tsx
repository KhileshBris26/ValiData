import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Server, FileText, Settings, ArrowLeft, LogOut, CheckCircle } from 'lucide-react';
import './AdminDashboard.css';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeMessage, setActiveMessage] = React.useState<string | null>(null);

  const handleSignOut = () => {
    localStorage.removeItem('robin_auth_token');
    localStorage.removeItem('robin_user');
    localStorage.removeItem('selected_role');
    localStorage.removeItem('user_type');
    localStorage.removeItem('is_authenticated');
    navigate('/login');
  };

  const showSimulatedAction = (actionName: string) => {
    setActiveMessage(`Simulated action: "${actionName}" executed successfully in admin sandbox!`);
    setTimeout(() => setActiveMessage(null), 4000);
  };

  const adminCards = [
    {
      title: 'User Permissions',
      desc: 'Promote users to admins, manage global roles, and configure directory integrations.',
      icon: Users,
      color: '#8b5cf6',
      action: 'Manage Access Control'
    },
    {
      title: 'Platform Connection Audits',
      desc: 'View live warehouse sessions, connection failures, and credential rotations.',
      icon: Server,
      color: '#3b82f6',
      action: 'View Connection History'
    },
    {
      title: 'Audit & System Logs',
      desc: 'Analyze control plane errors, audit queries, and inspect scheduler runtime daemon logs.',
      icon: FileText,
      color: '#10b981',
      action: 'Download System Logs'
    },
    {
      title: 'Global System Settings',
      desc: 'Set system-wide alerting thresholds, enable/disable schedulers, and adjust cache TTLs.',
      icon: Settings,
      color: '#f59e0b',
      action: 'Configure Overrides'
    }
  ];

  return (
    <div className="admin-container">
      <div className="admin-background">
        <div className="admin-blob"></div>
        <div className="admin-blob"></div>
      </div>

      <div className="admin-card-container glass-panel">
        <div className="admin-header-section">
          <div className="admin-title-row">
            <div className="shield-icon-bg">
              <Shield size={28} color="#8b5cf6" />
            </div>
            <div>
              <h1 className="admin-main-title">Admin Command Center</h1>
              <p className="admin-subtitle">ValiData Control Plane Management Portal</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <button onClick={() => navigate('/')} className="btn-admin-nav">
              <ArrowLeft size={16} />
              <span>Go to main app</span>
            </button>
            <button onClick={handleSignOut} className="btn-admin-signout">
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {activeMessage && (
          <div className="admin-toast-message">
            <CheckCircle size={16} color="#10b981" />
            <span>{activeMessage}</span>
          </div>
        )}

        <div className="admin-tools-grid">
          {adminCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div key={idx} className="admin-tool-card">
                <div className="admin-card-header">
                  <div className="admin-card-icon" style={{ backgroundColor: `${card.color}15`, color: card.color }}>
                    <Icon size={20} />
                  </div>
                  <h3>{card.title}</h3>
                </div>
                <p className="admin-card-desc">{card.desc}</p>
                <button 
                  onClick={() => showSimulatedAction(card.action)}
                  className="btn-admin-action"
                  style={{ border: `1px solid ${card.color}30`, color: card.color }}
                >
                  {card.action}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
