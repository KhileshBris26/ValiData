import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Database, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../api';
import { usePlatform } from '../context/PlatformContext';
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
  const { platform } = usePlatform();
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

  const [warehouseAnalytics, setWarehouseAnalytics] = React.useState<any>({
    table_name: 'Loading...',
    reads: 0,
    dq_score: 100
  });
  const [queryLogs, setQueryLogs] = React.useState<any[]>([]);
  const [lineageFlow, setLineageFlow] = React.useState<any>({ nodes: [], edges: [] });
  const [isLoadingWidgets, setIsLoadingWidgets] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<string>('');


  const refreshDashboard = async () => {
    setIsLoadingWidgets(true);
    let count = 0;
    try {
      const connected = JSON.parse(localStorage.getItem('robin_connected_platforms') || '[]');
      count = connected.length;
    } catch (e) {}

    try {
      const saved = localStorage.getItem('robin_credentials');
      const credentials = saved ? JSON.parse(saved)[platform] : null;
      const payload = { platform, credentials };
      
      const [analyticsRes, logsRes, lineageRes, metricsRes, rulesRes, anomaliesRes] = await Promise.all([
        axios.post(`${API_BASE}/dashboard/warehouse_analytics`, payload),
        axios.post(`${API_BASE}/dashboard/query_logs`, payload),
        axios.post(`${API_BASE}/dashboard/lineage`, payload),
        axios.get(`${API_BASE}/dashboard/metrics`),
        axios.get(`${API_BASE}/dashboard/rules`),
        axios.get(`${API_BASE}/dashboard/anomalies`)
      ]);
      
      if (analyticsRes.data.status === 'success') {
        setWarehouseAnalytics(analyticsRes.data);
      }
      if (logsRes.data.status === 'success') {
        setQueryLogs(logsRes.data.queries || []);
      }
      if (lineageRes.data.status === 'success') {
        setLineageFlow(lineageRes.data);
      }
      setMetrics({
        platforms: count,
        rules: metricsRes.data.active_rules_count,
        passed: metricsRes.data.passed_checks_count,
        anomalies: metricsRes.data.anomalies_count
      });
      setBackendRules(rulesRes.data.rules || []);
      setBackendAnomalies(anomaliesRes.data.anomalies || []);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Failed to refresh dashboard:", e);
    } finally {
      setIsLoadingWidgets(false);
    }
  };

  const handleManualRefresh = async () => {
    try {
      await syncAllRulesToBackend();
    } catch (e) {
      console.error("Rules sync failed during manual refresh:", e);
    }
    await refreshDashboard();
  };


  const syncAllRulesToBackend = async () => {
    try {
      // 1. Fetch backend rules first to avoid overwriting database with empty client states
      const res = await axios.get(`${API_BASE}/dashboard/rules`);
      const backendRules = res.data.rules || [];

      // 2. Clear any legacy cache
      localStorage.removeItem('robin_applied_rules');

      // 3. Merge backend rules into localStorage
      if (backendRules.length > 0) {
        const rulesByKey: Record<string, any[]> = {};
        backendRules.forEach((br: any) => {
          const key = `robin_rule_v2|${br.database_name}|${br.schema_name}|${br.table_name}|${br.column_name}`;
          if (!rulesByKey[key]) {
            rulesByKey[key] = [];
          }
          rulesByKey[key].push({
            label: br.rule_type,
            status: br.status === 'Inactive' ? 'deactivated' : 'valid',
            platform: br.platform
          });
        });

        Object.entries(rulesByKey).forEach(([key, val]) => {
          localStorage.setItem(key, JSON.stringify(val));
        });
      }

      // 4. Gather all local rules and synchronize them back to the database
      const rulesToSync: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('robin_rule_v2|')) {
          const parts = key.split('|');
          if (parts.length >= 5) {
            const database_name = parts[1];
            const schema_name = parts[2];
            const table_name = parts[3];
            const column_name = parts.slice(4).join('|');
            const colRules = JSON.parse(localStorage.getItem(key) || '[]');
            colRules.forEach((r: any) => {
              rulesToSync.push({
                platform: r.platform || 'snowflake',
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

      await axios.post(`${API_BASE}/dashboard/rules/sync`, { rules: rulesToSync });
    } catch (e) {
      console.error("Failed to sync rules to backend", e);
    }
  };

  React.useEffect(() => {
    const initDashboard = async () => {
      try {
        await syncAllRulesToBackend();
      } catch (e) {
        console.error("Initial rules sync failed:", e);
      }
      await refreshDashboard();
    };
    initDashboard();

    const interval = setInterval(refreshDashboard, 60000);
    return () => clearInterval(interval);
  }, [platform]);


  const handleResolveAnomaly = async (id: number) => {
    try {
      await axios.post(`${API_BASE}/dashboard/anomalies/resolve`, { id });
      await refreshDashboard();
      setSelectedFinding(null);
    } catch (e) {
      console.error("Failed to resolve anomaly", e);
    }
  };


  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Data Quality Command Center</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastRefreshed && (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Last refreshed: {lastRefreshed}
            </span>
          )}
          <button 
            onClick={handleManualRefresh}
            disabled={isLoadingWidgets}
            className="btn-small" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.8rem', 
              padding: '6px 12px',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#f8fafc'
            }}
          >
            <RefreshCw size={14} className={isLoadingWidgets ? 'spin-animation' : ''} />
            {isLoadingWidgets ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      <div className="stats-grid">
        <div onClick={() => navigate('/connections')} style={{ cursor: 'pointer' }}>
          <StatCard icon={Database} label="Connected Platforms" value={isLoadingWidgets ? '...' : metrics.platforms} color="#3b82f6" />
        </div>
        <div onClick={() => setShowRulesOverlay(true)} style={{ cursor: 'pointer' }}>
          <StatCard icon={Activity} label="Active Rules" value={isLoadingWidgets ? '...' : metrics.rules} color="#8b5cf6" />
        </div>
        <StatCard icon={CheckCircle} label="Passed Checks" value={isLoadingWidgets ? '...' : metrics.passed.toLocaleString()} color="#10b981" />
        <div onClick={() => setShowAnomaliesOverlay(true)} style={{ cursor: 'pointer' }}>
          <StatCard icon={AlertTriangle} label="Anomalies Detected" value={isLoadingWidgets ? '...' : metrics.anomalies} color="#ef4444" />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Active Lineage Flow {lineageFlow.database && lineageFlow.schema ? `(${lineageFlow.database}.${lineageFlow.schema})` : ''}
                </div>
                {lineageFlow.edges?.length > 0 && (
                  <button 
                    onClick={() => navigate('/lineage-studio')}
                    className="btn-small" 
                    style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#818cf8', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Open Studio
                  </button>
                )}
              </div>
              
              {isLoadingWidgets ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '20px 0', textAlign: 'center' }}>
                  Analyzing lineage metadata...
                </div>
              ) : lineageFlow.edges && lineageFlow.edges.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                  {lineageFlow.edges.slice(0, 4).map((edge: any) => (
                    <div key={edge.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#f8fafc' }}>
                        <span style={{ fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={edge.source}>{edge.source}</span>
                        <span style={{ color: '#6366f1', fontWeight: 900 }}>→</span>
                        <span style={{ fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={edge.target}>{edge.target}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={edge.label}>
                        {edge.label}
                      </span>
                    </div>
                  ))}
                  {lineageFlow.edges.length > 4 && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>
                      + {lineageFlow.edges.length - 4} more relationships in schema
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                  No relationships inferred in the current schema. Ingest or query tables to generate lineage.
                </div>
              )}
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
            <div style={{ fontSize: '0.75rem', color: '#3b82f6', cursor: 'pointer' }} onClick={() => navigate('/analytics')}>Usage Reports</div>
          </div>
          
          <div style={{ padding: '14px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.1)', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Most Queried Asset</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                {isLoadingWidgets ? 'Loading...' : warehouseAnalytics.table_name || 'N/A'}
              </div>
              {warehouseAnalytics.table_name && warehouseAnalytics.table_name !== 'N/A' && warehouseAnalytics.table_name !== 'Loading...' && (
                <button 
                  onClick={() => {
                    const parts = warehouseAnalytics.table_name.split('.');
                    if (parts.length >= 3) {
                      navigate(`/catalog/${parts[0]}/${parts[1]}/${parts[2]}`);
                    } else {
                      navigate('/catalog');
                    }
                  }}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#3b82f6', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Go to Page
                </button>
              )}
            </div>
            {!isLoadingWidgets && warehouseAnalytics.table_name && warehouseAnalytics.table_name !== 'N/A' && (
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                {warehouseAnalytics.reads} reads in last 24h · {Math.round(warehouseAnalytics.dq_score)}% DQ score
              </div>
            )}
            {isLoadingWidgets && (
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                Analyzing query activity...
              </div>
            )}
            {!isLoadingWidgets && (!warehouseAnalytics.table_name || warehouseAnalytics.table_name === 'N/A') && (
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                No database query logs recorded in this environment yet.
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '10px', fontWeight: 600 }}>Recent Query Log</div>
            {isLoadingWidgets ? (
              <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '20px 0', textAlign: 'center' }}>
                Fetching execution history...
              </div>
            ) : queryLogs && queryLogs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {queryLogs.map((q: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <code style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%', fontFamily: 'monospace' }} title={q.query}>
                      {q.query}
                    </code>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#64748b', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={q.user}>by {q.user}</span>
                      <span style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        {q.duration}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                No recent query logs available in this Snowflake environment.
              </div>
            )}
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
