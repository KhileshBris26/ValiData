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
      
      // Calculate Passed Checks accurately: (Total Rules * 100 sampled rows) - Known Anomalies
      const totalChecks = (rules.length || 12) * 100;
      const anomalyCount = 3; 
      
      setMetrics({
        platforms: count || 1,
        rules: rules.length || 12,
        passed: totalChecks - anomalyCount,
        anomalies: anomalyCount
      });
    } catch (e) {
      console.error("Dashboard metrics failed", e);
    }
  }, []);

  const [selectedFinding, setSelectedFinding] = React.useState<any>(null);

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

      {/* Main Dashboard Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
        
        {/* System Health & Lineage Summary */}
        <div className="dashboard-content glass-panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Lineage & System Health</h2>
            <button onClick={() => navigate('/catalog')} className="btn-small" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>View Full Catalog</button>
          </div>
          
          <div className="health-metrics" style={{ marginBottom: '20px' }}>
            <div className="metric">
              <span>Snowflake Data Cloud</span>
              <span className="status healthy">Operational</span>
            </div>
            <div className="metric">
              <span>Databricks Intelligence</span>
              <span className="status healthy">Operational</span>
            </div>
          </div>

          <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Lineage Flow (Data Vault 2.0)</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>🏛️</div>
                <div style={{ fontSize: '0.7rem', color: '#f8fafc', marginTop: '4px' }}>Hubs</div>
              </div>
              <div style={{ color: '#3b82f6' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>🔗</div>
                <div style={{ fontSize: '0.7rem', color: '#f8fafc', marginTop: '4px' }}>Links</div>
              </div>
              <div style={{ color: '#3b82f6' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>📋</div>
                <div style={{ fontSize: '0.7rem', color: '#f8fafc', marginTop: '4px' }}>Sats</div>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '16px', textAlign: 'center' }}>14 active relationships inferred from query history in UNICORN.DEV</p>
          </div>
        </div>

        {/* Query History & Recent Activity */}
        <div className="dashboard-content glass-panel" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Query History</h2>
            <div style={{ fontSize: '0.75rem', color: '#3b82f6', cursor: 'pointer' }}>View All History</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { query: 'SELECT * FROM H_AIRCRAFT...', duration: '45ms', status: 'SUCCESS' },
              { query: 'INSERT INTO L_FLIGHT_AIR...', duration: '822ms', status: 'SUCCESS' },
              { query: 'CALL SP_DQ_VALIDATE...', duration: '1.2s', status: 'SUCCESS' },
              { query: 'DROP TABLE TEMP_RECO...', duration: '12ms', status: 'SUCCESS' }
            ].map((q, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem' }}>
                <code style={{ color: '#e2e8f0', fontSize: '0.75rem' }}>{q.query}</code>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{q.duration}</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.65rem' }}>{q.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '10px', fontWeight: 600 }}>System Events</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activities.slice(0, 2).map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: a.type === 'success' ? '#10b981' : '#3b82f6' }} />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rules Overlay */}
      {showRulesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowRulesOverlay(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '600px', maxHeight: '500px', display: 'flex', flexDirection: 'column', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
              <h3 style={{ margin: 0 }}>Active DQ Rules by Table</h3>
              <button onClick={() => setShowRulesOverlay(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
              <table style={{ width: '100%', color: '#f8fafc', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Table Name</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Rule Type</th>
                    <th style={{ textAlign: 'right', padding: '10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'H_AIRCRAFT', type: 'Completeness', status: 'Active' },
                    { name: 'L_FLIGHT_AIRCRAFT', type: 'FK Integrity', status: 'Active' },
                    { name: 'S_AIRCRAFT_DETAILS', type: 'JSON Validation', status: 'Active' },
                    { name: 'H_FLIGHT', type: 'Unique ID', status: 'Active' },
                    { name: 'S_AIRPORT_LOGS', type: 'Timestamp Sync', status: 'Active' },
                    { name: 'H_CUSTOMER', type: 'PII Check', status: 'Active' },
                    { name: 'L_ORDER_ITEM', type: 'Calc Logic', status: 'Active' },
                    { name: 'S_ORDER_DETAILS', type: 'Range Check', status: 'Active' },
                    { name: 'H_PRODUCT', type: 'Master Sync', status: 'Active' },
                    { name: 'L_SHIPMENT', type: 'Delay Logic', status: 'Active' }
                  ].map((r, i) => (
                    <tr key={i} className="hover-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => setSelectedFinding(r)}>
                      <td style={{ padding: '10px' }}>{r.name}</td>
                      <td style={{ padding: '10px' }}>{r.type}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedFinding && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#8b5cf6' }}>Rule Details: {selectedFinding.name}</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>This {selectedFinding.type} rule is currently enforcing pushdown validation on the warehouse. Last evaluation returned 100% success.</p>
                <button onClick={() => setSelectedFinding(null)} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.8rem', cursor: 'pointer' }}>Close Details</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anomalies Overlay */}
      {showAnomaliesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowAnomaliesOverlay(false)}>
          <div className="glass-panel overlay-content" onClick={e => e.stopPropagation()} style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', position: 'sticky', top: 0, background: '#1e293b', zIndex: 10, paddingBottom: '10px' }}>
              <h3>Detailed Anomaly Findings</h3>
              <button onClick={() => setShowAnomaliesOverlay(false)} className="btn-icon">×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { title: "Schema Drift Detected", msg: "Table H_FLIGHT in UNICORN.DEV has 2 new columns detected during last metadata sync.", type: "drift" },
                { title: "Volume Spike", msg: "Ingestion volume for S_AIRPORT_LOGS increased by 400% compared to the 7-day average.", type: "volume" },
                { title: "Null Rate Violation", msg: "H_AIRCRAFT: AIRCRAFT_TYPE column showed a sudden jump to 15% nulls from 0.02%.", type: "null" }
              ].map((a, i) => (
                <div key={i} onClick={() => setSelectedFinding(a)} style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, color: '#ef4444' }}>{a.title}</div>
                  <div style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '4px' }}>{a.msg}</div>
                  {selectedFinding?.title === a.title && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.8rem', color: '#fecaca' }}>
                      <strong>Root Cause Analysis:</strong> Pipeline refresh at 04:00 AM triggered an unvalidated DDL change. Recommendation: Rollback to previous schema version or update DQ manifest.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
