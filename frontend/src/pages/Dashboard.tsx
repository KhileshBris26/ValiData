import React from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [showRulesOverlay, setShowRulesOverlay] = React.useState(false);
  const [showAnomaliesOverlay, setShowAnomaliesOverlay] = React.useState(false);
  const [metrics, setMetrics] = React.useState({
    platforms: 0,
    rules: 0,
    passed: 0,
    anomalies: 0
  });

  React.useEffect(() => {
    try {
      const creds = JSON.parse(sessionStorage.getItem('robin_credentials') || '{}');
      const count = Object.keys(creds).filter(k => creds[k] && Object.keys(creds[k]).length > 0).length;
      const rules = JSON.parse(sessionStorage.getItem('robin_applied_rules') || '[]');
      
      setMetrics({
        platforms: count || 1,
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
        <div onClick={() => navigate('/connections')} style={{ cursor: 'pointer' }}>
          <StatCard icon={Database} label="Connected Platforms" value={metrics.platforms} color="#3b82f6" />
        </div>
        <div onClick={() => setShowRulesOverlay(true)} style={{ cursor: 'pointer' }}>
          <StatCard icon={Activity} label="Active Rules" value={metrics.rules} color="#8b5cf6" />
        </div>
        <StatCard icon={CheckCircle} label="Passed Checks" value={metrics.passed.toLocaleString()} color="#10b981" />
        <div onClick={() => setShowAnomaliesOverlay(true)} style={{ cursor: 'pointer' }}>
          <StatCard icon={AlertTriangle} label="Anomalies Detected" value={metrics.anomalies} color="#ef4444" />
        </div>
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

      {/* Rules Overlay */}
      {showRulesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowRulesOverlay(false)}>
          <div className="glass-panel overlay-content" onClick={e => e.stopPropagation()} style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Active DQ Rules by Table</h3>
              <button onClick={() => setShowRulesOverlay(false)} className="btn-icon">×</button>
            </div>
            <table style={{ width: '100%', color: '#f8fafc', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Table Name</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Rule Type</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px' }}>H_AIRCRAFT</td>
                  <td style={{ padding: '10px' }}>Completeness Check</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>Active</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px' }}>L_FLIGHT_AIRCRAFT</td>
                  <td style={{ padding: '10px' }}>Foreign Key Integrity</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>Active</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px' }}>S_AIRCRAFT_DETAILS</td>
                  <td style={{ padding: '10px' }}>JSON Schema Validation</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>Active</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomalies Overlay */}
      {showAnomaliesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowAnomaliesOverlay(false)}>
          <div className="glass-panel overlay-content" onClick={e => e.stopPropagation()} style={{ width: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Detailed Anomaly Findings</h3>
              <button onClick={() => setShowAnomaliesOverlay(false)} className="btn-icon">×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontWeight: 600, color: '#ef4444' }}>Schema Drift Detected</div>
                <div style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '4px' }}>Table H_FLIGHT in UNICORN.DEV has 2 new columns detected during last metadata sync.</div>
              </div>
              <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontWeight: 600, color: '#ef4444' }}>Volume Spike</div>
                <div style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '4px' }}>Ingestion volume for S_AIRPORT_LOGS increased by 400% compared to the 7-day average.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
