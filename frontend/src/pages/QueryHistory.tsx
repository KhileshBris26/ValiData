import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Search, Filter, Copy, Check, Clock, AlertTriangle, Database, Terminal, RefreshCw } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { API_BASE } from '../api';
import './UsageAnalytics.css'; // Leverage existing shared styles or create custom styling inline/in a new file

interface QueryLog {
  statement_id: string;
  query_text: string;
  status: string;
  start_time: string;
  duration_ms: number;
  user: string;
}

const QueryHistory: React.FC = () => {
  const { platform } = usePlatform();
  const [queries, setQueries] = useState<QueryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');
  
  // Search and Filter states
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchQueryHistory = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      let credentials = null;
      const saved = localStorage.getItem('robin_credentials');
      if (saved) {
        credentials = JSON.parse(saved)[platform];
      }

      const res = await axios.post(`${API_BASE}/dashboard/query_history`, {
        platform,
        credentials
      }, { timeout: 15000 });

      if (res.data) {
        setQueries(res.data.queries || []);
        setWarning(res.data.warning || null);
        setSource(res.data.source || '');
      }
    } catch (err: any) {
      console.error('Failed to fetch query history:', err);
      setError(err.response?.data?.detail || err.message || "Failed to fetch query history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueryHistory();
  }, [platform]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Process and filter queries locally
  const filteredQueries = queries.filter(q => {
    const textMatch = q.query_text.toLowerCase().includes(searchText.toLowerCase()) || 
                      q.user.toLowerCase().includes(searchText.toLowerCase()) ||
                      q.statement_id.toLowerCase().includes(searchText.toLowerCase());
    
    const status = q.status.toUpperCase();
    const statusMatch = statusFilter === 'ALL' || 
                        (statusFilter === 'SUCCESS' && (status.includes('SUCCESS') || status.includes('FINISHED') || status.includes('PASS'))) ||
                        (statusFilter === 'FAILED' && (status.includes('FAIL') || status.includes('ERROR')));
    
    return textMatch && statusMatch;
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="usage-analytics" style={{ padding: '24px', color: 'var(--text-main)' }}>
      <div className="analytics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.8rem', fontWeight: 600 }}>
            <Terminal className="icon-accent" size={28} style={{ color: 'var(--color-primary, #6366f1)' }} />
            Query History
          </h1>
          <p style={{ opacity: 0.7, fontSize: '0.9rem', marginTop: '4px' }}>
            Logs of all queries executed on {platform === 'databricks' ? 'Databricks' : 'Snowflake'} by the current user
          </p>
        </div>

        <button 
          className="btn btn-primary" 
          onClick={fetchQueryHistory} 
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          {loading ? <Loader2 className="spinner" size={16} /> : <RefreshCw size={16} />}
          Refresh Logs
        </button>
      </div>

      {error && (
        <div className="error-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
          Error: {error}
        </div>
      )}

      {warning && (
        <div className="warning-banner" style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          color: '#f59e0b',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span><strong>Notice ({source}):</strong> {warning}</span>
        </div>
      )}

      {/* Controls Bar */}
      <div className="glass-panel" style={{
        padding: '16px',
        borderRadius: '12px',
        background: 'var(--bg-card, rgba(30, 41, 59, 0.4))',
        border: '1px solid var(--panel-border, rgba(255, 255, 255, 0.08))',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
            type="text"
            placeholder="Search query text, user, statement ID..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              borderRadius: '8px',
              border: '1px solid var(--panel-border, rgba(255, 255, 255, 0.08))',
              background: 'rgba(15, 23, 42, 0.6)',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={16} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Status:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--panel-border, rgba(255, 255, 255, 0.08))',
              background: 'rgba(15, 23, 42, 0.6)',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success Only</option>
            <option value="FAILED">Failures Only</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.85rem', opacity: 0.6 }}>
          Showing {filteredQueries.length} of {queries.length} queries
        </div>
      </div>

      {/* Query List Table */}
      {loading && queries.length === 0 ? (
        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
          <Loader2 className="spinner large" size={48} style={{ color: 'var(--color-primary, #6366f1)', marginBottom: '16px' }} />
          <p style={{ opacity: 0.7 }}>Loading query history trail...</p>
        </div>
      ) : filteredQueries.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', borderRadius: '12px', opacity: 0.7 }}>
          <Database size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p>No queries match the current search or filters.</p>
        </div>
      ) : (
        <div className="glass-panel" style={{
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--panel-border, rgba(255, 255, 255, 0.08))',
          background: 'var(--bg-card, rgba(30, 41, 59, 0.4))'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="analytics-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid var(--panel-border, rgba(255, 255, 255, 0.08))' }}>
                  <th style={{ padding: '16px', fontSize: '0.85rem', fontWeight: 600, opacity: 0.8 }}>Time / ID</th>
                  <th style={{ padding: '16px', fontSize: '0.85rem', fontWeight: 600, opacity: 0.8 }}>User</th>
                  <th style={{ padding: '16px', fontSize: '0.85rem', fontWeight: 600, opacity: 0.8 }}>Query Text</th>
                  <th style={{ padding: '16px', fontSize: '0.85rem', fontWeight: 600, opacity: 0.8 }}>Duration</th>
                  <th style={{ padding: '16px', fontSize: '0.85rem', fontWeight: 600, opacity: 0.8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueries.map((q) => {
                  const isExpanded = expandedId === q.statement_id;
                  const isSuccess = q.status.toUpperCase().includes('SUCCESS') || 
                                    q.status.toUpperCase().includes('FINISHED') || 
                                    q.status.toUpperCase().includes('PASS');
                  
                  return (
                    <React.Fragment key={q.statement_id}>
                      <tr 
                        onClick={() => setExpandedId(isExpanded ? null : q.statement_id)}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                        className="query-row-hover"
                      >
                        <td style={{ padding: '16px', verticalAlign: 'top' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{q.start_time.split('.')[0]}</div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '2px', fontFamily: 'monospace' }}>{q.statement_id.substring(0, 16)}</div>
                        </td>
                        <td style={{ padding: '16px', verticalAlign: 'top' }}>
                          <span style={{ fontSize: '0.85rem', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                            {q.user}
                          </span>
                        </td>
                        <td style={{ padding: '16px', verticalAlign: 'top', maxWidth: '450px' }}>
                          <div style={{
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#e2e8f0'
                          }}>
                            {q.query_text}
                          </div>
                        </td>
                        <td style={{ padding: '16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', opacity: 0.8 }}>
                            <Clock size={12} />
                            {formatDuration(q.duration_ms)}
                          </div>
                        </td>
                        <td style={{ padding: '16px', verticalAlign: 'top' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: isSuccess ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isSuccess ? '#4ade80' : '#f87171'
                          }}>
                            {q.status}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
                          <td colSpan={5} style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: 500 }}>Full SQL Query Statement</span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCopy(q.statement_id, q.query_text); }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 10px',
                                  color: 'var(--text-main)',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer'
                                }}
                              >
                                {copiedId === q.statement_id ? (
                                  <>
                                    <Check size={12} style={{ color: '#4ade80' }} />
                                    <span style={{ color: '#4ade80' }}>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    <span>Copy SQL</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: '12px',
                              background: '#090d16',
                              borderRadius: '6px',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              color: '#67e8f9',
                              border: '1px solid rgba(255, 255, 255, 0.03)',
                              maxHeight: '300px',
                              overflowY: 'auto'
                            }}>
                              {q.query_text}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryHistory;
