import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Loader2, Database, Key, LayoutList } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import SearchableDropdown from '../components/SearchableDropdown';
import './UsageAnalytics.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

interface ColumnDef {
  key: string;
  label: string;
  filterable?: boolean;
  sortable?: boolean;
}

const FilterableTable = ({ data, columns }: { data: any[], columns: ColumnDef[] }) => {
  const [sortCol, setSortCol] = useState('count');
  const [sortDesc, setSortDesc] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const getUniqueValues = (key: string) => {
    return Array.from(new Set(data.map(d => d[key]))).filter(Boolean).sort();
  };

  let processed = [...data];
  
  Object.keys(filters).forEach(k => {
    if (filters[k]) {
      processed = processed.filter(d => String(d[k]) === filters[k]);
    }
  });

  processed.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  return (
    <table className="analytics-table">
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: c.sortable ? 'pointer' : 'default', userSelect: 'none' }}
                  onClick={() => {
                    if (c.sortable) {
                      if (sortCol === c.key) setSortDesc(!sortDesc);
                      else { setSortCol(c.key); setSortDesc(true); }
                    }
                  }}
                >
                  <span>{c.label}</span>
                  {c.sortable && (
                    <span style={{ fontSize: '0.75rem', opacity: 0.7, paddingLeft: '4px' }}>
                      {sortCol === c.key ? (sortDesc ? '▼' : '▲') : '↕'}
                    </span>
                  )}
                </div>
                {c.filterable && (
                  <select 
                    style={{ background: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '4px', fontSize: '0.8rem', outline: 'none' }}
                    value={filters[c.key] || ''}
                    onChange={e => setFilters({...filters, [c.key]: e.target.value})}
                  >
                    <option value="">All</option>
                    {getUniqueValues(c.key).map((v: any) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {processed.length ? processed.map((row, i) => (
          <tr key={i}>
            {columns.map(c => (
              <td key={c.key}>
                {c.key === 'count' ? <span className="badge">{row[c.key]}</span> : row[c.key]}
              </td>
            ))}
          </tr>
        )) : <tr><td colSpan={columns.length} style={{textAlign: 'center', opacity: 0.5}}>No data matching filters</td></tr>}
      </tbody>
    </table>
  );
};

const UsageAnalytics: React.FC = () => {
  const { platform } = usePlatform();
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Database filter state
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);

  const fetchDatabases = async () => {
    setLoadingMeta(true);
    try {
      let credentials = null;
      const saved = sessionStorage.getItem('robin_credentials');
      if (saved) {
        credentials = JSON.parse(saved)[platform];
      }
      const res = await axios.post(`${API_BASE}/metadata/entities`, {
        platform,
        entity_type: 'databases',
        credentials
      });
      if (res.data?.entities) {
        setDatabases(res.data.entities);
      }
    } catch (err) {
      console.error('Failed to fetch databases for analytics:', err);
    }
    setLoadingMeta(false);
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      let credentials = null;
      const saved = sessionStorage.getItem('robin_credentials');
      if (saved) {
        credentials = JSON.parse(saved)[platform];
      }

      const res = await axios.post(`${API_BASE}/analytics/usage`, {
        platform,
        credentials,
        days_back: 7,
        database_name: selectedDatabase || undefined
      }, { timeout: 30000 });
      
      setAnalytics(res.data.analytics);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Failed to fetch analytics");
    }
    setLoading(false);
  };

  useEffect(() => {
    setDatabases([]);
    setSelectedDatabase('');
    fetchDatabases();
    fetchAnalytics();
  }, [platform]);

  return (
    <div className="usage-analytics">
      <div className="analytics-header">
        <h1 className="page-title">Usage & Query Analytics</h1>
        
        <div className="analytics-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ minWidth: '250px' }}>
            <SearchableDropdown 
              label={platform === 'databricks' ? "Catalog" : "Database"}
              value={selectedDatabase}
              onChange={setSelectedDatabase}
              options={databases}
              placeholder="All Databases..."
              isLoading={loadingMeta}
            />
          </div>
          
          <button className="btn btn-primary" onClick={fetchAnalytics} disabled={loading} style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>
            {loading ? <Loader2 className="spinner" size={16} /> : <Activity size={16} />}
            Analyze
          </button>
        </div>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      {loading && !analytics ? (
        <div className="empty-state">
          <Loader2 className="spinner large" size={48} />
          <p>Analyzing query history across {platform}... This might take a moment.</p>
        </div>
      ) : analytics ? (
        <div className="analytics-grid">
          {/* Top Tables */}
          <div className="glass-panel analytics-card">
            <div className="card-header">
              <Database className="icon-accent" size={20} />
              <h2>Most Queried Tables</h2>
            </div>
            <FilterableTable 
              data={analytics.top_tables || []} 
              columns={[
                { key: 'database', label: 'Database', filterable: true },
                { key: 'schema', label: 'Schema', filterable: true },
                { key: 'table', label: 'Table Name', filterable: true },
                { key: 'count', label: 'Query Count', sortable: true }
              ]} 
            />
          </div>

          {/* Top Columns */}
          <div className="glass-panel analytics-card">
            <div className="card-header">
              <LayoutList className="icon-accent" size={20} />
              <h2>Most Queried Columns</h2>
            </div>
            <FilterableTable 
              data={analytics.top_columns || []} 
              columns={[
                { key: 'database', label: 'Database', filterable: true },
                { key: 'schema', label: 'Schema', filterable: true },
                { key: 'table', label: 'Table', filterable: true },
                { key: 'column', label: 'Column Name', filterable: true },
                { key: 'count', label: 'Query Count', sortable: true }
              ]} 
            />
          </div>

          {/* Top JOIN Keys */}
          <div className="glass-panel analytics-card">
            <div className="card-header">
              <Key className="icon-accent" size={20} />
              <h2>Common JOIN Conditions</h2>
            </div>
            <FilterableTable 
              data={analytics.top_join_keys || []} 
              columns={[
                { key: 'name', label: 'Join Condition' },
                { key: 'count', label: 'Query Count', sortable: true }
              ]} 
            />
          </div>
        </div>
      ) : !loading && (
        <div className="empty-state">No data available. Click Refresh to analyze query history.</div>
      )}
    </div>
  );
};

export default UsageAnalytics;
