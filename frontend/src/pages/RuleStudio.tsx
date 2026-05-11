import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import SearchableDropdown from '../components/SearchableDropdown';
import './RuleStudio.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

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

  // Rule configuration state
  const [ruleType, setRuleType] = useState('NULL_CHECK');
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');
  const [pattern, setPattern] = useState('');

  const [loadingMeta, setLoadingMeta] = useState<'none' | 'db' | 'schema' | 'table' | 'column'>('none');
  
  const [loading, setLoading] = useState<'none' | 'ai' | 'execute'>('none');
  const [result, setResult] = useState<any>(null);

  // Helper to fetch metadata
  const fetchMetadata = async (entityType: string, params: any) => {
    let credentials = null;
    const saved = sessionStorage.getItem('robin_credentials');
    if (saved) {
      const creds = JSON.parse(saved);
      credentials = creds[platform];
    }
    const res = await axios.post(`${API_BASE}/metadata/entities`, {
      platform,
      entity_type: entityType,
      credentials,
      ...params
    }, { timeout: 15000 });
    return res.data.entities || [];
  };

  // 1. Fetch Databases on mount or platform change
  useEffect(() => {
    setDatabase(''); setSchema(''); setTableName(''); setColumnName('');
    setDatabases([]); setSchemas([]); setTables([]); setColumns([]);
    
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

  // 2. Fetch Schemas when Database changes
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

  // 3. Fetch Tables when Schema changes
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

  // 4. Fetch Columns when Table changes
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

  const getFullyQualifiedTable = () => {
    if (platform === 'snowflake') return `${database}.${schema}.${tableName}`;
    if (platform === 'databricks') return `${database}.${schema}.${tableName}`;
    return tableName;
  };

  const handleAISuggest = async () => {
    if (!tableName || !columnName) return alert("Table and Column required");
    
    let credentials = null;
    const saved = sessionStorage.getItem('robin_credentials');
    if (saved) {
      const creds = JSON.parse(saved);
      credentials = creds[platform];
    }

    setLoading('ai');
    try {
      const res = await axios.post(`${API_BASE}/ai/suggest_rules`, {
        platform,
        table_name: getFullyQualifiedTable(),
        column_name: columnName,
        credentials
      });
      setResult({ type: 'ai', data: res.data });
    } catch (err: any) {
      setResult({ type: 'error', data: err.response?.data?.detail || err.message });
    }
    setLoading('none');
  };

  const handleExecute = async () => {
    if (!tableName || !columnName) return alert("Table and Column required");

    let credentials = null;
    const saved = sessionStorage.getItem('robin_credentials');
    if (saved) {
      const creds = JSON.parse(saved);
      credentials = creds[platform];
    }

    setLoading('execute');
    try {
      const payload: any = {
        platform,
        rule_type: ruleType,
        table_name: getFullyQualifiedTable(),
        column_name: columnName,
        credentials
      };
      
      if (ruleType === 'RANGE_CHECK') {
        payload.rule_params = { min_val: minVal, max_val: maxVal };
      } else if (ruleType === 'PATTERN_CHECK') {
        payload.rule_params = { pattern };
      }

      const res = await axios.post(`${API_BASE}/rules/execute`, payload);
      setResult({ type: 'execute', data: res.data });
    } catch (err: any) {
      setResult({ type: 'error', data: err.response?.data?.detail || err.message });
    }
    setLoading('none');
  };

  return (
    <div className="rule-studio">
      <h1 className="page-title">Rule Studio</h1>
      
      <div className="studio-layout">
        {/* Left Column: Configuration */}
        <div className="config-panel glass-panel">
          <h2>Configuration ({platform.toUpperCase()})</h2>
          
          <SearchableDropdown 
            label={platform === 'databricks' ? "Catalog" : "Database"}
            value={database}
            onChange={setDatabase}
            options={databases}
            placeholder={`Select ${platform === 'databricks' ? "Catalog" : "Database"}...`}
            isLoading={loadingMeta === 'db'}
          />

          <SearchableDropdown 
            label="Schema"
            value={schema}
            onChange={setSchema}
            options={schemas}
            placeholder="Select Schema..."
            isLoading={loadingMeta === 'schema'}
            disabled={!database}
          />

          <SearchableDropdown 
            label="Table Name"
            value={tableName}
            onChange={setTableName}
            options={tables}
            placeholder="Select Table..."
            isLoading={loadingMeta === 'table'}
            disabled={!schema}
          />

          <SearchableDropdown 
            label="Column Name"
            value={columnName}
            onChange={setColumnName}
            options={columns}
            placeholder="Select Column..."
            isLoading={loadingMeta === 'column'}
            disabled={!tableName}
          />

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Data Quality Rule Type</label>
            <select 
              className="dropdown-select"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value)}
              disabled={!columnName}
            >
              <option value="NULL_CHECK">Completeness: Null Check</option>
              <option value="BLANK_CHECK">Completeness: Blank Check</option>
              <option value="UNIQUE_CHECK">Uniqueness: Unique Check</option>
              <option value="RANGE_CHECK">Validity: Range Check</option>
              <option value="PATTERN_CHECK">Validity: Regex Pattern Check</option>
              <option value="MIN_MAX_PROFILE">Profiling: Min/Max/Avg Profiling</option>
            </select>
          </div>

          {ruleType === 'RANGE_CHECK' && (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Minimum Value</label>
                <input type="number" className="dropdown-select" value={minVal} onChange={(e) => setMinVal(e.target.value)} placeholder="e.g. 0" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Maximum Value</label>
                <input type="number" className="dropdown-select" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} placeholder="e.g. 100" />
              </div>
            </div>
          )}

          {ruleType === 'PATTERN_CHECK' && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Regex Pattern</label>
              <input type="text" className="dropdown-select" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. ^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$" />
            </div>
          )}

          <div className="action-buttons">
            <button className="btn btn-secondary" onClick={handleAISuggest} disabled={loading !== 'none' || !columnName}>
              {loading === 'ai' ? <Loader2 className="spinner" size={18} /> : <Sparkles size={18} />}
              Ask AI Native
            </button>
            <button className="btn btn-primary" onClick={handleExecute} disabled={loading !== 'none' || !columnName}>
              {loading === 'execute' ? <Loader2 className="spinner" size={18} /> : <Play size={18} />}
              Execute Rule
            </button>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="results-panel glass-panel">
          <h2>Results Console</h2>
          <div className="console-output">
            {!result && <div className="placeholder">Select a table and run an action...</div>}
            
            {result?.type === 'error' && (
              <div className="error-text">
                <strong>Error:</strong><br/>
                {JSON.stringify(result.data, null, 2)}
              </div>
            )}

            {result?.type === 'ai' && (
              <div className="success-text">
                <strong style={{color: 'var(--accent-secondary)'}}>AI Suggestions from {result.data.platform}:</strong>
                <pre className="code-block">
                  {result.data.ai_suggestions?.[0]?.ai_suggestion || result.data.ai_suggestions?.[0]?.AI_SUGGESTION || JSON.stringify(result.data.ai_suggestions, null, 2)}
                </pre>
              </div>
            )}

            {result?.type === 'execute' && (
              <div className="success-text">
                <strong style={{color: 'var(--success)'}}>Execution successful on {result.data.platform}:</strong>
                <pre className="code-block">
                  {JSON.stringify(result.data.results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuleStudio;
