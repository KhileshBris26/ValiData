import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Loader2, Plus, Trash2, BarChart3, ListChecks } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import SearchableDropdown from '../components/SearchableDropdown';
import './RuleStudio.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

interface RuleManifestItem {
  id: string;
  column: string;
  type: string;
  params: any;
}

const RuleStudio: React.FC = () => {
  const { platform } = usePlatform();
  
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [tableName, setTableName] = useState('');
  const [columnName, setColumnName] = useState('');

  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // Rule manifest state
  const [manifest, setManifest] = useState<RuleManifestItem[]>([]);
  const [ruleType, setRuleType] = useState('NULL_CHECK');
  const [minVal] = useState('');
  const [maxVal] = useState('');
  const [pattern] = useState('');

  const [loadingMeta, setLoadingMeta] = useState<'none' | 'db' | 'schema' | 'table' | 'column'>('none');
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Helper to fetch metadata
  const fetchMetadata = async (entityType: string, params: any) => {
    let credentials = null;
    const saved = localStorage.getItem('robin_credentials');
    if (saved) {
      const creds = JSON.parse(saved);
      credentials = creds[platform];
    }
    const res = await axios.post(`${API_BASE}/metadata/entities`, {
      platform,
      entity_type: entityType,
      credentials,
      ...params
    });
    return res.data.entities || [];
  };

  useEffect(() => {
    setDatabase(''); setSchema(''); setTableName(''); setColumnName('');
    setDatabases([]); setSchemas([]); setTables([]); setColumns([]); setManifest([]);
    
    const loadDatabases = async () => {
      setLoadingMeta('db');
      try {
        const dbs = await fetchMetadata('databases', {});
        setDatabases(dbs);
      } catch (err) { console.error("Error fetching databases", err); }
      setLoadingMeta('none');
    };
    loadDatabases();
  }, [platform]);

  useEffect(() => {
    setSchema(''); setTableName(''); setColumnName('');
    setSchemas([]); setTables([]); setColumns([]);
    if (!database) return;
    const loadSchemas = async () => {
      setLoadingMeta('schema');
      try {
        const schs = await fetchMetadata('schemas', { database_name: database });
        setSchemas(schs);
      } catch (err) { console.error("Error fetching schemas", err); }
      setLoadingMeta('none');
    };
    loadSchemas();
  }, [database]);

  useEffect(() => {
    setTableName(''); setColumnName('');
    setTables([]); setColumns([]);
    if (!schema) return;
    const loadTables = async () => {
      setLoadingMeta('table');
      try {
        const tbls = await fetchMetadata('tables', { database_name: database, schema_name: schema });
        setTables(tbls);
      } catch (err) { console.error("Error fetching tables", err); }
      setLoadingMeta('none');
    };
    loadTables();
  }, [schema]);

  useEffect(() => {
    setColumnName('');
    setColumns([]);
    if (!tableName) return;
    const loadColumns = async () => {
      setLoadingMeta('column');
      try {
        const cols = await fetchMetadata('columns', { database_name: database, schema_name: schema, table_name: tableName });
        setColumns(cols.map((c: any) => c.name || c));
      } catch (err) { console.error("Error fetching columns", err); }
      setLoadingMeta('none');
    };
    loadColumns();
  }, [tableName]);

  const addToManifest = () => {
    if (!columnName) return;
    const newItem: RuleManifestItem = {
      id: Math.random().toString(36).substr(2, 9),
      column: columnName,
      type: ruleType,
      params: ruleType === 'RANGE_CHECK' ? { min_val: minVal, max_val: maxVal } : ruleType === 'PATTERN_CHECK' ? { pattern } : {}
    };
    setManifest([...manifest, newItem]);
  };

  const removeRule = (id: string) => {
    setManifest(manifest.filter(m => m.id !== id));
  };

  const executeManifest = async () => {
    if (manifest.length === 0) return;
    setExecuting(true);
    setResults([]);
    
    let credentials = null;
    const saved = localStorage.getItem('robin_credentials');
    if (saved) {
      credentials = JSON.parse(saved)[platform];
    }

    try {
      const batchResults = [];
      const tablePath = `${database}.${schema}.${tableName}`;
      
      for (const rule of manifest) {
        const res = await axios.post(`${API_BASE}/rules/execute`, {
          platform,
          rule_type: rule.type,
          table_name: tablePath,
          column_name: rule.column,
          rule_params: rule.params,
          credentials
        });
        batchResults.push({ ...res.data, rule_meta: rule });
      }
      
      setResults(batchResults);
      
      // Calculate summary
      const total = batchResults.length;
      const passed = batchResults.filter(r => (r.results?.[0]?.FAILED_ROWS || 0) === 0).length;
      setSummary({ total, passed, failed: total - passed });
      
    } catch (err: any) {
      console.error("Batch execution failed", err);
    }
    setExecuting(false);
  };

  return (
    <div className="rule-studio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Rule Studio</h1>
        {tableName && <div style={{ fontSize: '0.9rem', color: '#3b82f6', fontWeight: 600 }}>Editing: {tableName}</div>}
      </div>
      
      <div className="studio-layout">
        {/* Left: Rule Builder */}
        <div className="config-panel glass-panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={20} /> Configuration</h2>
          
          <SearchableDropdown label="Database/Catalog" value={database} onChange={setDatabase} options={databases} isLoading={loadingMeta === 'db'} />
          <SearchableDropdown label="Schema" value={schema} onChange={setSchema} options={schemas} disabled={!database} isLoading={loadingMeta === 'schema'} />
          <SearchableDropdown label="Table" value={tableName} onChange={setTableName} options={tables} disabled={!schema} isLoading={loadingMeta === 'table'} />
          <SearchableDropdown label="Column" value={columnName} onChange={setColumnName} options={columns} disabled={!tableName} isLoading={loadingMeta === 'column'} />

          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Rule Type</label>
            <select className="dropdown-select" value={ruleType} onChange={e => setRuleType(e.target.value)} disabled={!columnName}>
              <option value="NULL_CHECK">Completeness: Null Check</option>
              <option value="UNIQUE_CHECK">Uniqueness: Unique Check</option>
              <option value="RANGE_CHECK">Validity: Range Check</option>
              <option value="PATTERN_CHECK">Validity: Pattern Check</option>
            </select>
          </div>

          <button className="btn btn-secondary" onClick={addToManifest} disabled={!columnName} style={{ width: '100%', marginTop: '10px' }}>
            <Plus size={18} /> Add to Manifest
          </button>

          <div className="manifest-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>RULE MANIFEST ({manifest.length})</span>
              {manifest.length > 0 && <span onClick={() => setManifest([])} style={{ fontSize: '0.75rem', color: '#ef4444', cursor: 'pointer' }}>Clear All</span>}
            </div>
            {manifest.map((m) => (
              <div key={m.id} className="manifest-item">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{m.column}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{m.type}</span>
                </div>
                <Trash2 className="remove-btn" size={16} onClick={() => removeRule(m.id)} />
              </div>
            ))}
          </div>

          <button className="btn btn-primary" onClick={executeManifest} disabled={manifest.length === 0 || executing} style={{ width: '100%', marginTop: 'auto' }}>
            {executing ? <Loader2 className="spinner" size={18} /> : <Play size={18} />}
            Execute Batch ({manifest.length})
          </button>
        </div>

        {/* Right: Results Engine */}
        <div className="results-panel glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><BarChart3 size={20} /> Results Explorer</h2>
            {summary && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <span className="status-badge status-pass">{summary.passed} Passed</span>
                <span className="status-badge status-fail">{summary.failed} Failed</span>
              </div>
            )}
          </div>

          {!results.length && !executing && (
            <div className="empty-results">
              <ListChecks size={48} opacity={0.2} />
              <p>Configure rules and execute batch to see quality insights.</p>
            </div>
          )}

          {executing && (
            <div className="empty-results">
              <Loader2 className="spinner" size={32} />
              <p>Executing rules on {platform} warehouse...</p>
            </div>
          )}

          {results.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div className="results-grid">
                <div className="health-card">
                  <div className="label">Total Checks</div>
                  <div className="value">{summary.total}</div>
                </div>
                <div className="health-card">
                  <div className="label">Quality Score</div>
                  <div className="value" style={{ color: summary.passed === summary.total ? '#10b981' : '#f59e0b' }}>
                    {Math.round((summary.passed / summary.total) * 100)}%
                  </div>
                </div>
              </div>

              <table className="results-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Rule</th>
                    <th>Rows</th>
                    <th>Fails</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const fails = r.results?.[0]?.FAILED_ROWS || 0;
                    const total = r.results?.[0]?.TOTAL_ROWS || 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.rule_meta.column}</td>
                        <td>{r.rule_meta.type}</td>
                        <td>{total}</td>
                        <td style={{ color: fails > 0 ? '#ef4444' : '#10b981' }}>{fails}</td>
                        <td>
                          <span className={`status-badge ${fails === 0 ? 'status-pass' : 'status-fail'}`}>
                            {fails === 0 ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RuleStudio;
