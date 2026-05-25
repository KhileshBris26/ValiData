import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Database, CheckCircle, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../api';
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
  const [backendRules, setBackendRules] = React.useState<any[]>([]);
  const [backendAnomalies, setBackendAnomalies] = React.useState<any[]>([]);
  const [selectedFinding, setSelectedFinding] = React.useState<any>(null);
  const [metrics, setMetrics] = React.useState({
    platforms: 0,
    rules: 0,
    passed: 0,
    anomalies: 0
  });

  const fetchDashboardData = async (platformsCount: number) => {
    try {
      const metricsRes = await axios.get(`${API_BASE}/dashboard/metrics`);
      const rulesRes = await axios.get(`${API_BASE}/dashboard/rules`);
      const anomaliesRes = await axios.get(`${API_BASE}/dashboard/anomalies`);

      setMetrics({
        platforms: platformsCount,
        rules: metricsRes.data.active_rules_count,
        passed: metricsRes.data.passed_checks_count,
        anomalies: metricsRes.data.anomalies_count
      });
      setBackendRules(rulesRes.data.rules || []);
      setBackendAnomalies(anomaliesRes.data.anomalies || []);
    } catch (e) {
      console.error("Failed to fetch dashboard data from backend", e);
    }
  };

  const syncAllRulesToBackend = async () => {
    try {
      const rulesToSync: any[] = [];
      
      // 1. Sync robin_applied_rules
      const appliedRules = JSON.parse(localStorage.getItem('robin_applied_rules') || '[]');
      appliedRules.forEach((r: any) => {
        rulesToSync.push({
          platform: r.platform || 'snowflake',
          database_name: r.database || 'UNICORN',
          schema_name: r.schema || 'DEV',
          table_name: r.table || 'H_AIRCRAFT',
          column_name: r.attribute || 'UNKNOWN',
          rule_type: r.name || r.label || 'Completeness',
          rule_params: r.rule_params || {},
          status: r.status === 'deactivated' ? 'Inactive' : 'Active'
        });
      });

      // 2. Sync column-specific rules (robin_rules_*)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('robin_rules_')) {
          const parts = key.split('_');
          if (parts.length >= 6) {
            const database_name = parts[2];
            const schema_name = parts[3];
            const table_name = parts[4];
            const column_name = parts.slice(5).join('_');
            const colRules = JSON.parse(localStorage.getItem(key) || '[]');
            colRules.forEach((r: any) => {
              rulesToSync.push({
                platform: 'snowflake',
                database_name,
                schema_name,
                table_name,
                column_name,
                rule_type: r.name || r.label || 'Completeness',
                rule_params: r.rule_params || {},
                status: r.status === 'deactivated' ? 'Inactive' : 'Active'
              });
            });
          }
        }
      }

      if (rulesToSync.length > 0) {
        await axios.post(`${API_BASE}/dashboard/rules/sync`, { rules: rulesToSync });
      }
    } catch (e) {
      console.error("Failed to sync rules to backend", e);
    }
  };

  React.useEffect(() => {
    const initDashboard = async () => {
      let count = 0;
      try {
        const connected = JSON.parse(localStorage.getItem('robin_connected_platforms') || '[]');
        count = connected.length;
      } catch (e) {
        console.error("Failed to get connected platforms count", e);
      }

      await syncAllRulesToBackend();
      await fetchDashboardData(count);
    };
    initDashboard();
  }, []);

  const handleResolveAnomaly = async (id: number) => {
    try {
      await axios.post(`${API_BASE}/dashboard/anomalies/resolve`, { id });
      let count = 0;
      try {
        const creds = JSON.parse(localStorage.getItem('robin_credentials') || '{}');
        count = Object.keys(creds).filter(k => creds[k] && Object.keys(creds[k]).length > 0).length;
      } catch (e) {}
      await fetchDashboardData(count);
      setSelectedFinding(null);
    } catch (e) {
      console.error("Failed to resolve anomaly", e);
    }
  };


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

          <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Lineage Flow</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
                <div style={{ textAlign: 'center' }}>Hubs</div>
                <div style={{ color: '#3b82f6' }}>→</div>
                <div style={{ textAlign: 'center' }}>Links</div>
                <div style={{ color: '#3b82f6' }}>→</div>
                <div style={{ textAlign: 'center' }}>Sats</div>
              </div>
            </div>
            
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px', fontWeight: 600 }}>Talk to AI Architect</div>
              <button 
                onClick={() => navigate('/ai-agent')}
                style={{ width: '100%', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600 }}
              >
                <Activity size={18} />
                Ask AI Anything
              </button>
            </div>
          </div>
        </div>

        {/* Query History & Usage Analytics */}
        <div className="dashboard-content glass-panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Warehouse Analytics</h2>
            <div style={{ fontSize: '0.75rem', color: '#3b82f6', cursor: 'pointer' }}>Usage Reports</div>
          </div>
          
          <div style={{ padding: '14px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.1)', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Most Queried Asset</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc' }}>H_AIRCRAFT</div>
              <button 
                onClick={() => navigate('/analytics')}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#3b82f6', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
              >
                Go to Page
              </button>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>1.2k reads in last 24h · 98% DQ score</div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '10px', fontWeight: 600 }}>Recent Query Log</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { query: 'SELECT * FROM H_AIRCRAFT...', duration: '45ms' },
                { query: 'INSERT INTO L_FLIGHT_AIR...', duration: '822ms' },
                { query: 'CALL SP_DQ_VALIDATE...', duration: '1.2s' }
              ].map((q, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.75rem' }}>
                  <code style={{ color: '#94a3b8' }}>{q.query}</code>
                  <span style={{ color: '#64748b' }}>{q.duration}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rules Overlay */}
      {showRulesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowRulesOverlay(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '600px', height: '500px', display: 'flex', flexDirection: 'column', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '24px' }}>
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
                  {backendRules.map((r, i) => (
                    <tr key={i} className="hover-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => setSelectedFinding(r)}>
                      <td style={{ padding: '10px' }}>{r.table_name || 'Global'}</td>
                      <td style={{ padding: '10px' }}>{r.rule_type}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: r.status === 'Active' ? '#10b981' : '#ef4444' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedFinding && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#8b5cf6' }}>Rule Details: {selectedFinding.table_name}</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                  This <strong>{selectedFinding.rule_type}</strong> rule (for column <code>{selectedFinding.column_name || 'All'}</code>) is currently active and enforcing pushdown validation on the warehouse.
                </p>
                <button onClick={() => setSelectedFinding(null)} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.8rem', cursor: 'pointer' }}>Close Details</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anomalies Overlay */}
      {showAnomaliesOverlay && (
        <div className="overlay-backdrop" onClick={() => setShowAnomaliesOverlay(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '600px', height: '500px', display: 'flex', flexDirection: 'column', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
              <h3 style={{ margin: 0 }}>Detailed Anomaly Findings</h3>
              <button onClick={() => { setShowAnomaliesOverlay(false); setSelectedFinding(null); }} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
              {backendAnomalies.map((a, i) => (
                <div key={i} onClick={() => setSelectedFinding(a)} style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, color: '#ef4444' }}>{a.title}</div>
                  <div style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '4px' }}>{a.msg}</div>
                  {selectedFinding?.id === a.id && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.8rem', color: '#fecaca', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Root Cause Analysis:</strong> Pipeline execution anomaly or DDL metadata drift.</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveAnomaly(a.id);
                          }}
                          style={{
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Resolve Anomaly
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {backendAnomalies.length === 0 && (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>
                  No active anomalies detected! Everything is operational.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
