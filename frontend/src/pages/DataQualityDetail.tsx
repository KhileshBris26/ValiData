import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { 
  ChevronRight, ShieldCheck, Clock, ExternalLink, Filter, ChevronDown, HelpCircle, Plus, Power, X, MoreVertical
} from 'lucide-react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';
import './DataQualityDetail.css';

interface DQRow {
  attribute: string;
  type: string;
  overallDQ: string;
  terms?: string;
  profileSummary: { label: string; pct: string }[];
  topValues: { label: string; pct: string }[];
  masks: { label: string; pct: string }[];
  appliedRules: { label: string; score: string; status: 'valid' | 'invalid' }[];
}

const getRuleHoverDetails = (ruleName: string) => {
  const nameLower = ruleName.toLowerCase();
  if (nameLower.includes('country')) {
    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Not Accurate', count: '240', pct: '14.3%' },
        { color: '#db2777', label: 'Accurate', count: '1438', pct: '85.7%' }
      ]
    };
  } else if (nameLower.includes('email') || nameLower.includes('completeness')) {
    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Null', count: '537', pct: '32%' },
        { color: '#db2777', label: 'Valid / Not Null', count: '1141', pct: '68%' }
      ]
    };
  } else if (nameLower.includes('approval') || nameLower.includes('status')) {
    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Null', count: '553', pct: '33%' },
        { color: '#db2777', label: 'Valid', count: '1125', pct: '67%' }
      ]
    };
  } else if (nameLower.includes('name') || nameLower.includes('uniqueness') || nameLower.includes('unique')) {
    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Duplicates', count: '134', pct: '8%' },
        { color: '#db2777', label: 'Unique', count: '1544', pct: '92%' }
      ]
    };
  } else {
    // Default fallback
    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Not Valid', count: '235', pct: '14%' },
        { color: '#db2777', label: 'Valid', count: '1443', pct: '86%' }
      ]
    };
  }
};

const DataQualityDetail: React.FC = () => {
  const { database, schema, table } = useParams<{ database: string; schema: string; table: string }>();
  const { platform } = usePlatform();
  const navigate = useNavigate();

  useEffect(() => {
    if (table) {
      sessionStorage.setItem('robin_active_context_table', table);
    }
  }, [table]);

  const [activeTab, setActiveTab] = useState('Profiling & Rules');
  const [hasEvaluated, setHasEvaluated] = useState(() => sessionStorage.getItem('robin_has_evaluated') === 'true');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [shutDownRules, setShutDownRules] = useState<string[]>([]);
  const [deletedRules, setDeletedRules] = useState<string[]>([]);
  const [hoveredRule, setHoveredRule] = useState<string | null>(null);
  const [selectedRuleForPanel, setSelectedRuleForPanel] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState('Configuration');

  const [search, setSearch] = useState('');
  const [dynamicColumns, setDynamicColumns] = useState<DQRow[]>([]);
  const [isLoadingCols, setIsLoadingCols] = useState(true);

  // No hardcoded fallback data â€” columns are always loaded from the API
  const dqData: DQRow[] = [];

  const [rowCount, setRowCount] = useState(1678);

  useEffect(() => {
    const fetchColumns = async () => {
      setIsLoadingCols(true);
      try {
        const saved = sessionStorage.getItem('robin_credentials');
        let credentials = null;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[platform]) {
            credentials = parsed[parsed[platform] ? platform : '']; // avoid TS warning
            credentials = parsed[platform];
          }
        }
        
        // Fetch row count
        try {
          const rowCountRes = await axios.post('http://127.0.0.1:8000/api/v1/metadata/row_count', {
            platform,
            table_name: table,
            credentials
          });
          if (rowCountRes.data.row_count) {
            setRowCount(rowCountRes.data.row_count);
          }
        } catch (err) {
          console.error("Failed to fetch table row count", err);
        }

        const res = await axios.post('http://127.0.0.1:8000/api/v1/metadata/entities', {
          platform,
          entity_type: 'columns',
          database_name: database,
          schema_name: schema,
          table_name: table,
          credentials
        });

        if (res.data.entities && res.data.entities.length > 0) {
          const parsedCols = res.data.entities.map((col: string) => {
            let terms: string | undefined = undefined;
            const lowCol = col.toLowerCase();
            const match = dqData.find(d => d.attribute.toUpperCase() === col.toUpperCase());
            if (lowCol.includes('email')) terms = 'E-mail';
            if (lowCol.includes('phone') || lowCol.includes('telephone')) terms = 'Phone Number';
            if (lowCol.includes('id')) terms = 'Identifier';

            if (lowCol.includes('name')) terms = 'Full Name';
            if (lowCol.includes('country')) terms = 'ISO-2 Country Code';
            if (lowCol.includes('revenue') || lowCol.includes('amount')) terms = 'Financial Value';

            if (match) {
              return { ...match, attribute: col, terms: terms || match.terms };
            }

            const nameLen = col.length;

            const notNullVal = nameLen % 13 === 0 ? 92 : (nameLen % 7 === 0 ? 84 : 100);
            const distinctVal = (nameLen * 11) % 100 || 55;
            const uniqueVal = distinctVal - (nameLen % 3);

            let tv: { label: string; pct: string }[] = [];
            if (lowCol.includes('email')) {
              tv = [{ label: 'user@example.com', pct: '18%' }, { label: 'test@domain.com', pct: '12%' }, { label: 'info@org.com', pct: '2%' }];
            } else if (lowCol.includes('id') || lowCol.includes('hk_')) {
              tv = [{ label: `${col}_10932`, pct: '1%' }, { label: `${col}_10955`, pct: '1%' }, { label: `${col}_10981`, pct: '0%' }];
            } else if (lowCol.includes('amount') || lowCol.includes('balance') || lowCol.includes('revenue')) {
              tv = [{ label: '1240.50', pct: '8%' }, { label: '500.00', pct: '4%' }, { label: '99.99', pct: '2%' }];
            } else if (lowCol.includes('country') || lowCol.includes('code')) {
              tv = [{ label: 'US', pct: '21%' }, { label: 'CA', pct: '14%' }, { label: 'GB', pct: '12%' }];
            } else if (lowCol.includes('status')) {
              tv = [{ label: 'Active', pct: '62%' }, { label: 'Pending', pct: '24%' }, { label: 'Inactive', pct: '14%' }];
            } else if (lowCol.includes('date') || lowCol.includes('ts') || lowCol.includes('time')) {
              tv = [{ label: '2024-01-15', pct: '2%' }, { label: '2024-03-22', pct: '1%' }, { label: '2024-06-01', pct: '1%' }];
            } else if (lowCol.includes('source') || lowCol.includes('record_source')) {
              tv = [{ label: 'SYSTEM_A', pct: '45%' }, { label: 'SYSTEM_B', pct: '38%' }, { label: 'MANUAL', pct: '17%' }];
            } else {
              tv = [{ label: `${col}_V1`, pct: '36%' }, { label: `${col}_V2`, pct: '24%' }, { label: `${col}_V3`, pct: '15%' }];
            }

            return {
              attribute: col,
              terms,
              type: lowCol.includes('hk_') || lowCol.includes('amount') || lowCol.includes('balance') ? 'num' : 'Az',
              overallDQ: '-',
              profileSummary: [
                { label: 'Not Null', pct: `${notNullVal}%` },
                { label: 'Distinct', pct: `${distinctVal}%` },
                { label: 'Unique', pct: `${uniqueVal > 0 ? uniqueVal : 1}%` }
              ],
              topValues: tv,
              masks: [],
              appliedRules: []
            };
          });
          setDynamicColumns(parsedCols);
        } else {
          setDynamicColumns([]);
        }
      } catch (err) {
        console.error("Failed to fetch column entities via API:", err);
        setDynamicColumns([]);
      } finally {
        setIsLoadingCols(false);
      }
    };

    fetchColumns();
  }, [database, schema, table, platform]);

  const [openAddRuleAttr, setOpenAddRuleAttr] = useState<string | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');

  const activeColumnsList = dynamicColumns.map(colItem => {
    const storageKey = `robin_rules_${database}_${schema}_${table}_${colItem.attribute}`;
    const storedRules = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    
    // Also grab agent rules
    const agentRules = JSON.parse(sessionStorage.getItem('robin_applied_rules') || '[]');
    const matchingAgentRules = agentRules
      .filter((ar: any) => ar.attribute === colItem.attribute)
      .map((ar: any) => {
        let score = '100%';
        if (hasEvaluated) {
          if (colItem.attribute === 'EMAIL') score = '68%';
          if (colItem.attribute === 'APPROVAL_STATUS') score = '67%';
          if (colItem.attribute === 'CUSTOMER_NAME') score = '92%';
        }
        return { label: ar.name, score, status: 'valid' as const };
      });

    const combinedRules = [...colItem.appliedRules];

    // Merge both stored rules and agent rules
    [...storedRules, ...matchingAgentRules].forEach((sr: any) => {
      if (!combinedRules.some(cr => cr.label === sr.label || cr.label === sr.name)) {
        combinedRules.push(sr);
      }
    });

    if (combinedRules.length > 0) {
      let dqPct = '100%';
      if (hasEvaluated) {
        if (colItem.attribute === 'EMAIL') dqPct = '68%';
        if (colItem.attribute === 'CUSTOMER_NAME') dqPct = '92%';
        if (colItem.attribute === 'APPROVAL_STATUS') dqPct = '67%';
      }
      return {
        ...colItem,
        overallDQ: dqPct,
        appliedRules: combinedRules
      };
    }
    return colItem;
  });

  const handleAddRuleClick = (attr: string) => {
    setOpenAddRuleAttr(openAddRuleAttr === attr ? null : attr);
    setRuleSearch('');
  };

  const handleApplyRule = (attr: string, ruleName: string) => {
    const newRule = { label: ruleName, score: '100%', status: 'valid' as const };
    const storageKey = `robin_rules_${database}_${schema}_${table}_${attr}`;
    const existingRules = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    if (!existingRules.some((r: any) => r.label === ruleName)) {
      existingRules.push(newRule);
      sessionStorage.setItem(storageKey, JSON.stringify(existingRules));
    }

    const updated = activeColumnsList.map(c => {
      if (c.attribute === attr) {
        return {
          ...c,
          overallDQ: '100%',
          appliedRules: [
            ...c.appliedRules,
            newRule
          ]
        };
      }
      return c;
    });
    setDynamicColumns(updated);
    setOpenAddRuleAttr(null);
  };



  return (
    <div className="dq-detail">

      {/* Breadcrumbs */}
      <div className="dq-breadcrumbs">
        <Link to="/catalog" className="breadcrumb-link">Catalog items</Link>
        <ChevronRight size={14} className="separator" />
        <Link to={`/catalog/${database}/${schema}/${table}`} className="breadcrumb-link">{table}</Link>
        <ChevronRight size={14} className="separator" />
        <span className="breadcrumb-current">Primary</span>
      </div>

      {/* Hero Header */}
      <div className="dq-hero">
        <div className="dq-hero-top">
          <div className="dq-meta-left">
            <span className="result-label">Result from:</span>
            <div className="timestamp-badge">
              <Clock size={14} />
              <span>October 22, 2025, 11:01:20 AM</span>
              <ChevronDown size={14} />
            </div>
            <span className="pushdown-badge">
              <ShieldCheck size={14} />
              Pushdown
            </span>
          </div>

          <div className="dq-meta-right">
            <span className="invalid-records-link">
              See all invalid records <ExternalLink size={14} />
            </span>
            <button 
              className="btn-profile-evaluate"
              onClick={() => {
                setIsEvaluating(true);
                setTimeout(() => {
                  setIsEvaluating(false);
                  setHasEvaluated(true);
                  sessionStorage.setItem('robin_has_evaluated', 'true');
                }, 1000);
              }}
              disabled={isEvaluating}
            >
              {isEvaluating ? 'Evaluating...' : 'Profile and Evaluate'}
            </button>
          </div>
        </div>

        {/* 5-Column Score Info row */}
        <div className="dq-hero-metrics glass-panel">
          {/* Overall */}
          <div className="metric-card">
            <span className="m-label">Overall</span>
            <h2 className={`m-score ${hasEvaluated ? 'text-green' : 'text-red'}`} style={{ color: hasEvaluated ? '#10b981' : undefined }}>
              {hasEvaluated ? '82%' : '39%'}
            </h2>
            <div className="overall-bar-bg">
              <div 
                className={`overall-bar-fill ${hasEvaluated ? 'green' : 'red'}`} 
                style={{ width: hasEvaluated ? '82%' : '39%', background: hasEvaluated ? '#10b981' : undefined }}
              ></div>
            </div>
            <div className="m-sub-stats">
              <span className="stat-item"><span className="dot green"></span> {hasEvaluated ? '1376 Passed' : '654 Passed'}</span>
              <span className="stat-item"><span className="dot red"></span> {hasEvaluated ? '302 Failed' : '1024 Failed'}</span>
            </div>
          </div>

          {/* DQ Dimensions */}
          <div className="metric-card">
            <span className="m-label">DQ Dimensions</span>
            <div className="dimensions-list">
              <div className="dim-row">
                <span className="dim-dot green"></span>
                <span className="dim-pct">44%</span>
                <span className="dim-lbl">Validity</span>
              </div>
              <div className="dim-row">
                <span className="dim-dot pink"></span>
                <span className="dim-pct">92%</span>
                <span className="dim-lbl">Accuracy</span>
              </div>
            </div>
          </div>

          {/* DQ over time (Simulated Graph) */}
          <div className="metric-card graph-card">
            <span className="m-label">Dq over time</span>
            <div className="graph-plot">
              <div className="graph-svg-container">
                <svg viewBox="0 0 160 50">
                  <path d="M 0 30 Q 40 32 80 34 T 160 10" fill="none" stroke="#6366f1" strokeWidth="2" />
                  <circle cx="160" cy="10" r="3" fill="#6366f1" />
                </svg>
              </div>
              <div className="graph-x-axis">
                <span>Sep 21</span>
                <span>Sep 28</span>
                <span>Oct 05</span>
                <span>Oct 12</span>
                <span>Oct 19</span>
              </div>
            </div>
          </div>

          {/* Number of records */}
          <div className="metric-card text-card">
            <span className="m-label">Number of records</span>
            <h2 className="m-score">{rowCount} <HelpCircle size={14} className="info-icon" /></h2>

            <span className="m-subtext">Last run change</span>
            <span className="m-sub-change">0</span>
            <button className="btn-profiling-detail">Show profiling detail</button>
          </div>

          {/* Metadata */}
          <div className="metric-card text-card">
            <span className="m-label">Metadata</span>
            <div className="meta-info">
              <span className="m-bold">{hasEvaluated ? '7' : '4'}</span> applied rules
            </div>
            <div className="meta-info">
              <span className="m-bold">13</span> attributes
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="dq-tabs-row">
        <div className="tabs-list">
          {['Profiling & Rules', 'Detailed results', 'Records', 'Settings', 'Invalid record samples'].map(t => (
            <button 
              key={t}
              className={`dq-tab-btn ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="attributes-dropdown">
          <span>All Attributes</span>
          <ChevronDown size={14} />
        </div>
      </div>

      {/* Tab Content Panel */}
      <div className="dq-table-container glass-panel">
        {activeTab === 'Detailed results' ? (
          <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Detailed Rule Results</h3>
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Attribute</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Rule Name</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Dimension</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Passed</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Failed</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Score</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { attr: 'EMAIL', rule: 'Email Format Check', dim: 'Validity', passed: 1142, failed: 536, score: '68%', status: 'Failed' },
                    { attr: 'CUSTOMER_NAME', rule: 'Not Null Check', dim: 'Completeness', passed: 1545, failed: 133, score: '92%', status: 'Warning' },
                    { attr: 'APPROVAL_STATUS', rule: 'Valid Values Check', dim: 'Validity', passed: 1124, failed: 554, score: '67%', status: 'Failed' },
                    { attr: 'CUSTOMER_ID', rule: 'Uniqueness Check', dim: 'Uniqueness', passed: 1678, failed: 0, score: '100%', status: 'Passed' },
                    { attr: 'PHONE', rule: 'Pattern Match', dim: 'Validity', passed: 1510, failed: 168, score: '90%', status: 'Passed' },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{row.attr}</td>
                      <td style={{ padding: '10px 16px' }}>{row.rule}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{row.dim}</span></td>
                      <td style={{ padding: '10px 16px', color: '#15803d' }}>{row.passed.toLocaleString()}</td>
                      <td style={{ padding: '10px 16px', color: row.failed > 0 ? '#b91c1c' : '#64748b' }}>{row.failed.toLocaleString()}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{row.score}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, background: row.status === 'Passed' ? '#dcfce7' : row.status === 'Warning' ? '#fef9c3' : '#fee2e2', color: row.status === 'Passed' ? '#15803d' : row.status === 'Warning' ? '#854d0e' : '#991b1b' }}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'Records' ? (
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px 0' }}>Record Browser</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Showing {rowCount.toLocaleString()} records from last evaluation run.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder="Search recordsâ€¦" style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none', width: '200px' }} />
                <select style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
                  <option>All records</option>
                  <option>Valid only</option>
                  <option>Invalid only</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Customer ID</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Customer Name</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Phone</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Approval Status</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>DQ Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: 1001, name: 'Alice Johnson', email: 'alice@example.com', phone: '+1-555-0101', status: 'Approved', valid: true },
                    { id: 1002, name: 'Bob Chen', email: 'bobchenATdomain', phone: '+1-555-0102', status: 'Pending', valid: false },
                    { id: 1003, name: 'Carol White', email: 'carol@org.com', phone: '+1-555-0103', status: 'Rejected', valid: true },
                    { id: 1004, name: '', email: 'david@company.com', phone: '', status: 'Approved', valid: false },
                    { id: 1005, name: 'Eva Martinez', email: 'eva@work.io', phone: '+1-555-0105', status: 'Approved', valid: true },
                    { id: 1006, name: 'Frank Lee', email: 'frank@biz.net', phone: '+1-555-0106', status: 'UNKNOWN', valid: false },
                  ].map((rec, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{rec.id}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{rec.id}</td>
                      <td style={{ padding: '10px 16px', color: rec.name ? '#0f172a' : '#ef4444', fontStyle: rec.name ? 'normal' : 'italic' }}>{rec.name || 'NULL'}</td>
                      <td style={{ padding: '10px 16px', color: rec.email.includes('@') ? '#0f172a' : '#ef4444' }}>{rec.email}</td>
                      <td style={{ padding: '10px 16px', color: rec.phone ? '#0f172a' : '#94a3b8' }}>{rec.phone || 'â€”'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, background: rec.status === 'Approved' ? '#dcfce7' : rec.status === 'Rejected' ? '#fee2e2' : rec.status === 'Pending' ? '#fef9c3' : '#f1f5f9', color: rec.status === 'Approved' ? '#15803d' : rec.status === 'Rejected' ? '#991b1b' : rec.status === 'Pending' ? '#854d0e' : '#64748b' }}>{rec.status}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, background: rec.valid ? '#dcfce7' : '#fee2e2', color: rec.valid ? '#15803d' : '#991b1b' }}>{rec.valid ? 'âœ“ Valid' : 'âœ— Invalid'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
              <span>Showing 6 of {rowCount.toLocaleString()}</span>
              <button style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>â† Prev</button>
              <button style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>Next â†’</button>
            </div>
          </div>
        ) : activeTab === 'Settings' ? (
          <div style={{ padding: '28px 32px', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>Monitor Settings</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Configure how this DQ monitor runs and alerts.</p>
            </div>
            {[
              { label: 'Monitor Name', type: 'text', value: 'Primary DQ Monitor' },
              { label: 'Description', type: 'textarea', value: 'Validates data quality rules for core attributes of this table.' },
              { label: 'Schedule', type: 'select', options: ['Every 6 hours', 'Every 12 hours', 'Daily', 'Weekly', 'Manual only'], value: 'Daily' },
              { label: 'Notification Email', type: 'text', value: 'datateam@company.com' },
              { label: 'Failure Threshold', type: 'text', value: '20%' },
            ].map((field, fi) => (
              <div key={fi} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea defaultValue={field.value} rows={2} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', resize: 'vertical', outline: 'none', color: '#1e293b' }} />
                ) : field.type === 'select' ? (
                  <select defaultValue={field.value} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', background: '#fff' }}>
                    {field.options!.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" defaultValue={field.value} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', outline: 'none' }} />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Stop on First Failure</label>
              <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
              <button style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Save Settings</button>
              <button style={{ padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}>Reset</button>
            </div>
          </div>
        ) : activeTab === 'Invalid record samples' ? (
          <div style={{ padding: '24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px 0' }}>Invalid record samples</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Samples of records that do not match current valid data criteria.</p>
              </div>
              <button 
                onClick={() => setHasEvaluated(true)}
                style={{
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                Re-evaluate
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '12px 16px' }}>Transaction ID</th>
                    <th style={{ padding: '12px 16px' }}>Country Code</th>
                    <th style={{ padding: '12px 16px' }}>Amount</th>
                    <th style={{ padding: '12px 16px' }}>Customer Name</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Rule Violation</th>
                  </tr>
                </thead>
                <tbody style={{ color: '#334155' }}>
                  {[
                    { id: 'TXN_001', country: 'XYZ', amount: '$1,200', customer: 'Paul James', status: 'Invalid', violation: 'Not a 2 value country code' },
                    { id: 'TXN_002', country: 'US', amount: '$4,500', customer: 'Rachel Adams', status: 'Valid', violation: '-' },
                    { id: 'TXN_003', country: '12', amount: '$950', customer: 'David Smith', status: 'Invalid', violation: 'Not a 2 value country code' },
                    { id: 'TXN_004', country: 'CAN', amount: '$3,120', customer: 'Laura Zhang', status: 'Invalid', violation: 'Not a 2 value country code' }
                  ].map((rec, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9', background: ri % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{rec.id}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ 
                          padding: '2px 6px', 
                          background: rec.country.length !== 2 ? '#fee2e2' : '#f1f5f9', 
                          color: rec.country.length !== 2 ? '#b91c1c' : '#475569', 
                          borderRadius: '4px',
                          fontWeight: rec.country.length !== 2 ? 600 : 400
                        }}>
                          {rec.country}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{rec.amount}</td>
                      <td style={{ padding: '12px 16px' }}>{rec.customer}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          background: rec.status === 'Invalid' ? '#fee2e2' : '#dcfce7',
                          color: rec.status === 'Invalid' ? '#991b1b' : '#15803d',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          {rec.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: rec.violation !== '-' ? '#b91c1c' : '#64748b' }}>
                        {rec.violation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
        <div className="dq-table-actions">
          <div className="filter-input-wrapper">
            <Filter size={16} className="filter-icon" />
            <input 
              type="text" 
              placeholder="Filter" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-suggested-rules">Suggested Rules</button>
        </div>

        <div className="dq-hidden-columns">
          <span>Hidden columns</span>
          <ChevronDown size={14} />
        </div>

        {/* Core DQ Table */}
        <div className="dq-scrollable-table">
          <table className="dq-main-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Overall DQ</th>
                <th>Terms</th>
                <th>Profiling summary <HelpCircle size={12} /></th>
                <th>Top 3 values <HelpCircle size={12} /></th>
                <th>Masks <HelpCircle size={12} /></th>
                <th>Applied rules</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingCols ? (
                // Skeleton rows while columns are loading from API
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
                    <td className="attr-cell">
                      <span className="attr-type-badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'transparent', minWidth: '24px' }}>Az</span>
                      <span style={{ display: 'inline-block', width: `${80 + (i % 3) * 40}px`, height: '12px', borderRadius: '4px', background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
                    </td>
                    {[1,2,3,4,5,6].map(c => (
                      <td key={c} style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-block', width: `${50 + c * 10}px`, height: '10px', borderRadius: '4px', background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', animationDelay: `${c * 0.1}s` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : activeColumnsList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8', fontSize: '14px' }}>
                    No column data available. Run <strong>Profile and Evaluate</strong> to populate attributes.
                  </td>
                </tr>
              ) : (
                activeColumnsList.filter(d => d.attribute.toLowerCase().includes(search.toLowerCase())).map((row, idx) => (
                <tr key={idx}>
                  <td className="attr-cell">
                    <span className="attr-type-badge">{row.type}</span>
                    <span className="attr-name-bold">{row.attribute}</span>
                  </td>
                  <td className="dq-cell">
                    {row.overallDQ !== '-' ? (
                      <div className="dq-progress-cell">
                        <div className="dq-progress-fill-bg">
                          <div className="dq-fill green" style={{ width: row.overallDQ }}></div>
                        </div>
                        <span>{row.overallDQ}</span>
                      </div>
                    ) : (
                      <span className="dash">-</span>
                    )}
                  </td>
                  <td>
                    {row.terms && <span className="term-badge">{row.terms}</span>}
                  </td>
                  <td className="profile-cell">
                    {row.profileSummary.map((ps, pi) => (
                      <div className="profile-stat-row" key={pi}>
                        <span className="ps-label">{ps.label}</span>
                        <span className="ps-pct">{ps.pct}</span>
                      </div>
                    ))}
                  </td>
                  <td className="values-cell">
                    {row.topValues.map((tv, ti) => (
                      <div className="top-val-row" key={ti}>
                        <span className="tv-pct">{tv.pct}</span>
                        <span className="tv-label">{tv.label}</span>
                      </div>
                    ))}
                  </td>
                  <td className="masks-cell">
                    {row.masks.map((m, mi) => (
                      <div className="mask-row" key={mi}>
                        <span className="mask-pct">{m.pct}</span>
                        <span className="mask-label">{m.label}</span>
                      </div>
                    ))}
                  </td>
                  <td className="applied-rules-cell">
                    <button className="btn-add-rule" onClick={() => handleAddRuleClick(row.attribute)}>
                      <Plus size={12} /> Add
                    </button>
                    {openAddRuleAttr === row.attribute && (
                      <div className="add-rule-popup glass-panel">
                        <div className="popup-search-box">
                          <Filter size={14} className="popup-search-icon" />
                          <input 
                            type="text" 
                            placeholder="Search" 
                            value={ruleSearch} 
                            onChange={(e) => setRuleSearch(e.target.value)} 
                          />
                        </div>
                        <div className="popup-rules-list">
                          {[
                            "Accurate Segment",
                            `AI Rule Accuracy Check for ${row.attribute}`,
                            `AI Rule ${row.attribute} Completeness Check`,
                            `AI Rule ${row.attribute} is not null`,
                            `AI Rule Pattern Check for ${row.attribute}`
                          ].filter(r => r.toLowerCase().includes(ruleSearch.toLowerCase())).map((suggested, sIdx) => (
                            <div 
                              key={sIdx} 
                              className="popup-rule-item"
                              onClick={() => handleApplyRule(row.attribute, suggested)}
                            >
                              <span>{suggested}</span>
                              <span className="popup-dot"></span>
                            </div>
                          ))}
                        </div>
                        <div 
                          className="popup-create-rule"
                          onClick={() => navigate(`/catalog/${database}/${schema}/${table}/dq/primary/create-rule/${row.attribute}`)}
                        >
                          <Plus size={14} /> Create rule
                        </div>
                      </div>
                    )}
                    {row.appliedRules.filter(rule => !deletedRules.includes(rule.label)).map((rule, ri) => {
                      const isShut = shutDownRules.includes(rule.label);
                      const isHovered = hoveredRule === rule.label;
                      const hoverDetails = getRuleHoverDetails(rule.label);

                      return (
                        <div 
                          className="applied-rule-badge" 
                          key={ri}
                          onMouseEnter={() => setHoveredRule(rule.label)}
                          onMouseLeave={() => setHoveredRule(null)}
                          onClick={() => setSelectedRuleForPanel(rule.label)}
                          style={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: isShut ? 'rgba(255, 255, 255, 0.01)' : 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '4px',
                            padding: 0,
                            fontSize: '0.8rem',
                            opacity: isShut ? 0.4 : 1,
                            transition: 'all 0.2s',
                            width: 'fit-content',
                            marginRight: '0.4rem',
                            marginBottom: '0.4rem',
                            position: 'relative'
                          }}
                        >
                          {/* Rich White Hover Tooltip Card */}
                          {isHovered && (
                            <div style={{
                              position: 'absolute',
                              bottom: 'calc(100% + 8px)',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '320px',
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '12px',
                              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                              zIndex: 1000,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              color: '#1e293b',
                              textAlign: 'left',
                              cursor: 'default'
                            }}>
                              <h4 style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#0f172a',
                                margin: 0,
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                                lineHeight: 1.3
                              }}>
                                {hoverDetails.title}
                              </h4>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {hoverDetails.stats.map((stat, si) => (
                                  <div key={si} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    fontSize: '13px',
                                    color: '#334155'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}>
                                      <div style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '3px',
                                        background: stat.color,
                                        flexShrink: 0
                                      }} />
                                      <span style={{ color: '#334155' }}>{stat.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                      <span style={{ width: '45px', textAlign: 'right', color: '#64748b', fontFamily: 'monospace' }}>
                                        {stat.count}
                                      </span>
                                      <span style={{ width: '42px', textAlign: 'right', color: '#0f172a', fontWeight: 500 }}>
                                        {stat.pct}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Tooltip triangle arrow */}
                              <div style={{
                                position: 'absolute',
                                bottom: '-6px',
                                left: '50%',
                                transform: 'translateX(-50%) rotate(45deg)',
                                width: '12px',
                                height: '12px',
                                background: '#ffffff',
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0'
                              }} />
                            </div>
                          )}

                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            fontWeight: 600, 
                            color: isShut ? '#64748b' : '#38bdf8',
                            borderRight: '1px solid rgba(255, 255, 255, 0.08)'
                          }}>
                            {rule.score}
                          </span>
                          <span style={{ 
                            padding: '0.2rem 0.55rem', 
                            color: isShut ? '#64748b' : '#f8fafc',
                            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                            textDecoration: isShut ? 'line-through' : 'none'
                          }}>
                            {rule.label}
                          </span>
                          
                          {/* Toggle active / shut down button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isShut) {
                                setShutDownRules(shutDownRules.filter(r => r !== rule.label));
                              } else {
                                setShutDownRules([...shutDownRules, rule.label]);
                              }
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                              color: isShut ? '#f43f5e' : '#94a3b8',
                              padding: '0.2rem 0.45rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '100%'
                            }}
                            title={isShut ? "Turn On" : "Turn Off"}
                          >
                            <Power size={14} />
                          </button>

                          {/* Delete rule button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletedRules([...deletedRules, rule.label]);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              padding: '0.2rem 0.45rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '100%'
                            }}
                            title="Delete"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    {selectedRuleForPanel && (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '450px',
          height: '100vh',
          background: '#ffffff',
          borderLeft: '1px solid #e2e8f0',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.08)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          color: '#1e293b',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          animation: 'slideIn 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ 
              display: 'inline-flex', 
              padding: '6px', 
              background: '#eff6ff', 
              color: '#3b82f6', 
              borderRadius: '6px' 
            }}>
              <ShieldCheck size={20} />
            </span>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#0f172a',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '320px'
            }} title={selectedRuleForPanel}>
              {selectedRuleForPanel}
            </h3>
          </div>
          <button
            onClick={() => setSelectedRuleForPanel(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Horizontal Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: '24px',
          padding: '0 20px',
          borderBottom: '1px solid #f1f5f9',
          background: '#fcfcfd'
        }}>
          {['Configuration', 'Implementation', 'Data Quality'].map((tab) => {
            const isActive = panelTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setPanelTab(tab)}
                style={{
                  padding: '12px 2px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  color: isActive ? '#1d4ed8' : '#475569',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{
          flex: 1,
          padding: '24px 20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          background: '#f8fafc'
        }}>
          {panelTab === 'Configuration' && (
            <>
              {/* Rule Instance Name */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <label style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#475569'
                }}>
                  Rule instance name
                </label>
                <input 
                  type="text" 
                  defaultValue={selectedRuleForPanel}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#334155',
                    background: '#ffffff',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Input Configuration */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <h4 style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#0f172a',
                  margin: 0
                }}>
                  Input configuration
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{
                    fontSize: '13px',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>Az</span> Target Column *
                  </span>
                  <select
                    defaultValue="COUNTRY_CODE"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#334155',
                      background: '#ffffff',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="COUNTRY_CODE">COUNTRY_CODE</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="CUSTOMER_NAME">CUSTOMER_NAME</option>
                    <option value="APPROVAL_STATUS">APPROVAL_STATUS</option>
                  </select>
                </div>
              </div>

              {/* DQ Threshold */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <h4 style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#0f172a',
                  margin: 0
                }}>
                  DQ Threshold
                </h4>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  color: '#334155',
                  cursor: 'pointer'
                }}>
                  <input type="checkbox" style={{ cursor: 'pointer' }} />
                  Set DQ Threshold
                  <span style={{ color: '#94a3b8', display: 'inline-flex' }}>
                    <HelpCircle size={16} />
                  </span>
                </label>
              </div>
            </>
          )}

          {panelTab === 'Implementation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* DQ Evaluation Rule Card */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <h4 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#475569',
                  margin: 0
                }}>
                  DQ Evaluation Rule
                </h4>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  background: '#ffffff'
                }}>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    background: '#f43f5e',
                    flexShrink: 0
                  }} />
                  <span style={{
                    fontSize: '14px',
                    color: '#334155',
                    flex: 1,
                    fontWeight: 500
                  }}>
                    Accuracy
                  </span>
                  <ChevronDown size={16} style={{ color: '#64748b' }} />
                </div>
              </div>

              {/* Rule logic block */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#1e293b'
                }}>
                  Rule logic
                </span>
                <button style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#334155',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}>
                  <span style={{ color: '#64748b' }}>&lt;/&gt;</span> Rule
                  <ChevronDown size={14} style={{ color: '#64748b' }} />
                </button>
              </div>

              {/* Large rule expression card */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Rule expression header */}
                <div style={{
                  background: '#f1f5f9',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #e2e8f0',
                  position: 'relative'
                }}>
                  {/* Vertical red line accent */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: '4px',
                    background: '#ef4444'
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '50%',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475569'
                    }}>
                      1
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#334155'
                    }}>
                      Not a 2 value country code
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      background: '#ffffff',
                      border: '1px solid #818cf8',
                      borderRadius: '6px',
                      color: '#4f46e5',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}>
                      âœ¨ Ask AI
                    </button>
                    <div style={{
                      display: 'inline-flex',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      overflow: 'hidden'
                    }}>
                      <button style={{
                        padding: '6px 10px',
                        background: '#eff6ff',
                        border: 'none',
                        borderRight: '1px solid #cbd5e1',
                        color: '#2563eb',
                        cursor: 'pointer'
                      }}>
                        <ShieldCheck size={14} />
                      </button>
                      <button style={{
                        padding: '6px 10px',
                        background: '#ffffff',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}>
                        &lt;/&gt;
                      </button>
                    </div>
                    <button style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '4px'
                    }}>
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>

                {/* Rule expression contents: WHEN & THEN */}
                <div style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  {/* WHEN Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.05em'
                    }}>
                      WHEN
                    </span>

                    {/* Expression row 1 */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#334155'
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>Az</span> Country c...
                        </span>
                        <ChevronDown size={14} style={{ color: '#64748b' }} />
                      </div>
                      <div style={{
                        width: '120px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#334155'
                      }}>
                        <span>va...</span>
                        <ChevronDown size={14} style={{ color: '#64748b' }} />
                      </div>
                    </div>

                    {/* Operator row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#334155'
                    }}>
                      <span>is not from Reference Data ...</span>
                      <ChevronDown size={14} style={{ color: '#64748b' }} />
                    </div>

                    {/* Reference Lookup Details */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#475569'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <span style={{ color: '#64748b' }}>ðŸ“–</span> ISO_CODES_COUNTRIES_SI...
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', paddingLeft: '22px' }}>
                        / <span style={{ color: '#38bdf8', fontWeight: 600 }}>Az</span> ISOALPHA2_CODE
                      </span>
                    </div>

                    {/* Add expression link */}
                    <button style={{
                      alignSelf: 'flex-start',
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: '2px 0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{ fontSize: '16px' }}>+</span> Add expression
                    </button>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

                  {/* THEN Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.05em'
                    }}>
                      THEN
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>Result</span>
                      <div style={{
                        display: 'flex',
                        background: '#f1f5f9',
                        borderRadius: '6px',
                        padding: '3px',
                        border: '1px solid #e2e8f0'
                      }}>
                        {['Accurate', 'No refe...', 'Not Ac...'].map((opt, oi) => {
                          const isActive = oi === 2; // "Not Ac..." selected
                          return (
                            <button
                              key={oi}
                              style={{
                                flex: 1,
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '4px',
                                background: isActive ? '#ffffff' : 'transparent',
                                color: isActive ? '#1d4ed8' : '#64748b',
                                fontWeight: isActive ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                transition: 'all 0.2s'
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Score section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        Score <HelpCircle size={14} style={{ color: '#94a3b8' }} />
                      </span>
                      <input
                        type="text"
                        placeholder=""
                        style={{
                          padding: '10px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '13px',
                          background: '#ffffff',
                          color: '#334155',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Explanation section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        Explanation <HelpCircle size={14} style={{ color: '#94a3b8' }} />
                      </span>
                      <input
                        type="text"
                        defaultValue="Not a 2 value country code"
                        style={{
                          padding: '10px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '13px',
                          background: '#ffffff',
                          color: '#334155',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {panelTab === 'Data Quality' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>Validation History</h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Validation logs indicate passing performance. 0% unhandled data.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
};

export default DataQualityDetail;
