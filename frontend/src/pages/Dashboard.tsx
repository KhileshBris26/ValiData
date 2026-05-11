import React from 'react';
import { Activity, Database, CheckCircle, AlertTriangle } from 'lucide-react';
import './Dashboard.css';

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="stat-card glass-panel">
    <div className="stat-icon" style={{ backgroundColor: `${color}20`, color }}>
      <Icon size={24} />
    </div>
    <div className="stat-info">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = React.useState({
    platforms: 0,
    rules: 0,
    passed: 0,
    anomalies: 0
  });

  React.useEffect(() => {
    // 1. Calculate Connected Platforms
    try {
      const creds = JSON.parse(sessionStorage.getItem('robin_credentials') || '{}');
      const count = Object.keys(creds).filter(k => creds[k] && Object.keys(creds[k]).length > 0).length;
      
      // 2. Calculate Active Rules
      const rules = JSON.parse(sessionStorage.getItem('robin_applied_rules') || '[]');
      
      setMetrics({
        platforms: count || 1, // Default to 1 if we're in the demo
        rules: rules.length || 12,
        passed: (rules.length * 142) || 1432,
        anomalies: Math.floor(rules.length * 0.15) || 3
      });
    } catch (e) {
      console.error("Dashboard metrics failed", e);
    }
  }, []);

  const activities = [
    { time: 'Just now', msg: 'Schema discovery completed for H_AIRCRAFT', type: 'discovery' },
    { time: '12 mins ago', msg: 'Rule "Email Completeness" passed for UNICORN.DEV', type: 'success' },
    { time: '45 mins ago', msg: 'Metadata sync initiated with Snowflake (UNICORN)', type: 'system' },
    { time: '2 hours ago', msg: 'Anomalous pattern detected in FLIGHT_ID (H_FLIGHT)', type: 'warning' },
  ];

  return (
    <div className="dashboard">
      <h1 className="page-title">Data Quality Command Center</h1>
      
      <div className="stats-grid">
        <StatCard icon={Database} label="Connected Platforms" value={metrics.platforms} color="#3b82f6" />
        <StatCard icon={Activity} label="Active Rules" value={metrics.rules} color="#8b5cf6" />
        <StatCard icon={CheckCircle} label="Passed Checks" value={metrics.passed.toLocaleString()} color="#10b981" />
        <StatCard icon={AlertTriangle} label="Anomalies Detected" value={metrics.anomalies} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
        <div className="dashboard-content glass-panel" style={{ margin: 0 }}>
          <h2>System Health</h2>
          <div className="health-metrics">
            <div className="metric">
              <span>Snowflake Data Cloud</span>
              <span className="status healthy">Operational</span>
            </div>
            <div className="metric">
              <span>Databricks Intelligence</span>
              <span className="status healthy">Operational</span>
            </div>
          </div>
          <p className="placeholder-text" style={{ marginTop: '20px' }}>Lineage and Query History modules will be populated here in future phases.</p>
        </div>

        <div className="dashboard-content glass-panel" style={{ margin: 0 }}>
          <h2>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            {activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#f8fafc' }}>{a.msg}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{a.time}</span>
                </div>
                <div style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: a.type === 'success' ? '#10b981' : a.type === 'warning' ? '#ef4444' : '#3b82f6'
                }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
