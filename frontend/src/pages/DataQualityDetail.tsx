import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import { 
  ChevronRight, ShieldCheck, Clock, ExternalLink, Filter, ChevronDown, HelpCircle, Plus, Power, X
} from 'lucide-react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';
import './DataQualityDetail.css';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

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
  const [rowCount, setRowCount] = useState<number | string>('...');
  const [tablePreview, setTablePreview] = useState<any[]>([]);
  const [openAddRule, setOpenAddRule] = useState<string | null>(null);
  const [lastScanDate] = useState(new Date().toLocaleString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true 
  }));

  const fetchPreview = async () => {
    try {
      const saved = sessionStorage.getItem('robin_credentials');
      let credentials = null;
      if (saved) credentials = JSON.parse(saved)[platform];

      const res = await axios.post(`${API_BASE}/metadata/preview`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        credentials
      });
      if (res.data.rows) setTablePreview(res.data.rows);
    } catch (err) {
      console.error("Failed to fetch preview", err);
    }
  };

  useEffect(() => {
    const fetchColumns = async () => {
      setIsLoadingCols(true);
      try {
        const saved = sessionStorage.getItem('robin_credentials');
        let credentials = null;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[platform]) {
            credentials = parsed[platform];
          }
        }
        
        try {
          const rowCountRes = await axios.post(`${API_BASE}/metadata/row_count`, {
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

        const res = await axios.post(`${API_BASE}/metadata/entities`, {
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
            if (lowCol.includes('email')) terms = 'E-mail';
            if (lowCol.includes('phone') || lowCol.includes('telephone')) terms = 'Phone Number';
            if (lowCol.includes('id')) terms = 'Identifier';
            if (lowCol.includes('name')) terms = 'Full Name';
            if (lowCol.includes('country')) terms = 'ISO-2 Country Code';
            if (lowCol.includes('revenue') || lowCol.includes('amount')) terms = 'Financial Value';

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
        }
      } catch (err) {
        console.error("Failed to fetch columns", err);
      } finally {
        setIsLoadingCols(false);
      }
    };

    fetchColumns();
    fetchPreview();
  }, [database, schema, table, platform]);

  const activeColumnsList = dynamicColumns.map(colItem => {
    const storageKey = `robin_rules_${database}_${schema}_${table}_${colItem.attribute}`;
    const storedRules = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    const agentRules = JSON.parse(sessionStorage.getItem('robin_applied_rules') || '[]');
    const matchingAgentRules = agentRules
      .filter((ar: any) => ar.attribute === colItem.attribute)
      .map((ar: any) => ({ label: ar.name, score: hasEvaluated ? '68%' : '100%', status: 'valid' as const }));

    const combinedRules = [...colItem.appliedRules];
    [...storedRules, ...matchingAgentRules].forEach((sr: any) => {
      if (!combinedRules.some(cr => cr.label === sr.label || cr.label === sr.name)) {
        combinedRules.push(sr);
      }
    });

    if (combinedRules.length > 0) {
      let dqPct = '100%';
      if (hasEvaluated) {
        if (colItem.attribute === 'EMAIL') dqPct = '68%';
        else if (colItem.attribute === 'CUSTOMER_NAME') dqPct = '92%';
        else if (colItem.attribute === 'APPROVAL_STATUS') dqPct = '67%';
        else dqPct = '85%';
      }
      return { ...colItem, overallDQ: dqPct, appliedRules: combinedRules };
    }
    return colItem;
  });

  const handleAddRuleClick = (attr: string) => {
    setOpenAddRule(openAddRule === attr ? null : attr);
  };

  const getOverallScore = () => {
    const allRules = activeColumnsList.flatMap(c => c.appliedRules);
    if (allRules.length === 0) return hasEvaluated ? 82 : 28;
    const scores = allRules.map(r => parseInt(r.score));
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  const overallScore = getOverallScore();
  const numericRowCount = typeof rowCount === 'number' ? rowCount : (rowCount === '...' ? 1678 : parseInt(rowCount.replace(/,/g, '')));
  const passedCount = Math.floor(numericRowCount * (overallScore / 100));
  const failedCount = numericRowCount - passedCount;

  return (
    <div className="dq-detail">
      <div className="dq-breadcrumbs">
        <Link to="/catalog" className="breadcrumb-link">Catalog items</Link>
        <ChevronRight size={14} className="separator" />
        <Link to={`/catalog/${database}/${schema}/${table}`} className="breadcrumb-link">{table}</Link>
        <ChevronRight size={14} className="separator" />
        <span className="breadcrumb-current">Primary</span>
      </div>

      <div className="dq-hero">
        <div className="dq-hero-top">
          <div className="dq-meta-left">
            <span className="result-label">Result from:</span>
            <div className="timestamp-badge">
              <Clock size={14} />
              <span>{lastScanDate}</span>
              <ChevronDown size={14} />
            </div>
            <span className="pushdown-badge">
              <ShieldCheck size={14} />
              Pushdown
            </span>
          </div>
          <div className="dq-meta-right">
            <span className="invalid-records-link">See all invalid records <ExternalLink size={14} /></span>
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
      </div>

      <div className="dq-detail-container">
        <div className="dq-hero-metrics glass-panel">
          <div className="metric-card">
            <span className="m-label">Overall</span>
            <h2 className="m-score" style={{ color: overallScore > 80 ? '#10b981' : overallScore > 50 ? '#f59e0b' : '#ef4444' }}>{overallScore}%</h2>
            <div className="overall-bar-bg"><div className="overall-bar-fill" style={{ width: `${overallScore}%`, background: overallScore > 80 ? '#10b981' : '#ef4444' }}></div></div>
            <div className="m-sub-stats">
              <span className="stat-item"><span className="dot green"></span> {passedCount.toLocaleString()} Passed</span>
              <span className="stat-item"><span className="dot red"></span> {failedCount.toLocaleString()} Failed</span>
            </div>
          </div>
          <div className="metric-card">
            <span className="m-label">DQ Dimensions</span>
            <div className="dimensions-list">
              <div className="dim-row"><span className="dim-dot green"></span><span className="dim-pct">{hasEvaluated ? `${overallScore}%` : '28%'}</span><span className="dim-lbl">Validity</span></div>
              <div className="dim-row"><span className="dim-dot pink"></span><span className="dim-pct">100%</span><span className="dim-lbl">Accuracy</span></div>
            </div>
          </div>
          <div className="metric-card graph-card">
            <span className="m-label">Dq over time</span>
            <div className="graph-plot">
              <div className="graph-svg-container"><svg viewBox="0 0 160 50"><path d="M 0 30 Q 40 32 80 34 T 160 10" fill="none" stroke="#6366f1" strokeWidth="2" /></svg></div>
              <div className="graph-x-axis"><span>Oct 14</span><span>Oct 21</span><span>Oct 28</span><span>Nov 04</span><span>Today</span></div>
            </div>
          </div>
          <div className="metric-card text-card">
            <span className="m-label">Number of records</span>
            <h2 className="m-score">{rowCount} <HelpCircle size={14} className="info-icon" /></h2>
            <span className="m-subtext">Last run change</span><span className="m-sub-change">0</span>
            <button className="btn-profiling-detail" onClick={() => setActiveTab('Profiling & Rules')}>Show profiling detail</button>
          </div>
          <div className="metric-card text-card">
            <span className="m-label">Metadata</span>
            <div className="meta-info"><span className="m-bold">{activeColumnsList.reduce((acc, curr) => acc + curr.appliedRules.length, 0)}</span> applied rules</div>
            <div className="meta-info"><span className="m-bold">{activeColumnsList.length}</span> attributes</div>
          </div>
        </div>

        <div className="dq-tabs-row">
          <div className="tabs-list">
            {['Profiling & Rules', 'Detailed results', 'Records', 'Settings', 'Invalid record samples'].map(t => (
              <button key={t} className={`dq-tab-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>
            ))}
          </div>
          <div className="attributes-dropdown"><span>All Attributes</span><ChevronDown size={14} /></div>
        </div>

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
                    {activeColumnsList.flatMap((col) => col.appliedRules.map((rule, ri) => (
                      <tr key={`${col.attribute}-${ri}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{ri === 0 ? col.attribute : ''}</td>
                        <td style={{ padding: '10px 16px' }}>{rule.label}</td>
                        <td style={{ padding: '10px 16px' }}><span className="dim-badge">Validity</span></td>
                        <td style={{ padding: '10px 16px', color: '#15803d' }}>{hasEvaluated ? '1,376' : '-'}</td>
                        <td style={{ padding: '10px 16px', color: '#b91c1c' }}>{hasEvaluated ? '302' : '-'}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{rule.score}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className={`status-badge ${rule.status}`}>{rule.status === 'valid' ? 'Passed' : 'Failed'}</span>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'Records' ? (
            <div style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Record Browser</h3>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {tablePreview.length > 0 && Object.keys(tablePreview[0]).map(k => <th key={k} style={{ padding: '10px 16px', textAlign: 'left' }}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tablePreview.map((rec, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {Object.values(rec).map((val: any, vi) => <td key={vi} style={{ padding: '10px 16px' }}>{String(val)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'Settings' ? (
            <div style={{ padding: '24px' }}><h3>Monitor Settings</h3><p>Configure monitor properties here.</p></div>
          ) : activeTab === 'Invalid record samples' ? (
            <div style={{ padding: '24px' }}><h3>Invalid record samples</h3><p>Records that failed quality checks.</p></div>
          ) : (
            <>
              <div className="dq-table-actions">
                <div className="filter-input-wrapper"><Filter size={16} /><input type="text" placeholder="Filter" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <button className="btn-suggested-rules">Suggested Rules</button>
              </div>
              <div className="dq-scrollable-table">
                <table className="dq-main-table">
                  <thead>
                    <tr><th>Attribute</th><th>Overall DQ</th><th>Terms</th><th>Profiling summary</th><th>Top 3 values</th><th>Applied rules</th></tr>
                  </thead>
                  <tbody>
                    {isLoadingCols ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>Loading attributes...</td></tr>
                    ) : (
                      activeColumnsList.filter(d => d.attribute.toLowerCase().includes(search.toLowerCase())).map((row, idx) => (
                        <tr key={idx}>
                          <td className="attr-cell"><span className="attr-type-badge">{row.type}</span><span className="attr-name-bold">{row.attribute}</span></td>
                          <td className="dq-cell">
                            <div className="dq-progress-cell"><div className="dq-progress-fill-bg"><div className="dq-fill" style={{ width: row.overallDQ, background: row.overallDQ === '100%' ? '#10b981' : '#ef4444' }}></div></div><span>{row.overallDQ}</span></div>
                          </td>
                          <td>{row.terms && <span className="term-badge">{row.terms}</span>}</td>
                          <td className="profile-cell">{row.profileSummary.map((ps, pi) => <div key={pi} className="ps-row"><span>{ps.label}</span><span>{ps.pct}</span></div>)}</td>
                          <td className="values-cell">{row.topValues.map((tv, ti) => <div key={ti} className="tv-row"><span>{tv.pct}</span><span>{tv.label}</span></div>)}</td>
                          <td className="applied-rules-cell">
                            <button className="btn-add-rule" onClick={() => handleAddRuleClick(row.attribute)}>
                              <Plus size={12} /> Add
                            </button>
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
                                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{hoverDetails.title}</h4>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {hoverDetails.stats.map((stat, si) => (
                                          <div key={si} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#334155' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: stat.color }} />
                                              <span>{stat.label}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                              <span style={{ color: '#64748b' }}>{stat.count}</span>
                                              <span style={{ color: '#0f172a', fontWeight: 500 }}>{stat.pct}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '12px', height: '12px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }} />
                                    </div>
                                  )}
                                  <span style={{ padding: '0.2rem 0.5rem', fontWeight: 600, color: isShut ? '#64748b' : '#38bdf8', borderRight: '1px solid rgba(255, 255, 255, 0.08)' }}>{rule.score}</span>
                                  <span style={{ padding: '0.2rem 0.55rem', color: isShut ? '#64748b' : '#f8fafc', borderRight: '1px solid rgba(255, 255, 255, 0.08)', textDecoration: isShut ? 'line-through' : 'none' }}>{rule.label}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (isShut) { setShutDownRules(shutDownRules.filter(r => r !== rule.label)); } else { setShutDownRules([...shutDownRules, rule.label]); } }}
                                    style={{ background: 'transparent', border: 'none', borderRight: '1px solid rgba(255, 255, 255, 0.08)', color: isShut ? '#f43f5e' : '#94a3b8', padding: '0.2rem 0.45rem', cursor: 'pointer' }}
                                  >
                                    <Power size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDeletedRules([...deletedRules, rule.label]); }}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0.2rem 0.45rem', cursor: 'pointer' }}
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
      </div>

      {selectedRuleForPanel && (
        <div className="side-panel">
          <div className="side-panel-header">
            <h3>{selectedRuleForPanel}</h3>
            <button onClick={() => setSelectedRuleForPanel(null)}><X size={20} /></button>
          </div>
          <div className="side-panel-tabs">
            {['Configuration', 'Implementation', 'Data Quality'].map(t => <button key={t} className={panelTab === t ? 'active' : ''} onClick={() => setPanelTab(t)}>{t}</button>)}
          </div>
          <div className="side-panel-content">
            {panelTab === 'Configuration' ? <p>Rule configuration details...</p> : panelTab === 'Implementation' ? <p>Implementation logic...</p> : <p>Data quality results...</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataQualityDetail;
