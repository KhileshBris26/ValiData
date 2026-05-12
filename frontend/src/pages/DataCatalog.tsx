import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';
import { Search, ChevronDown, MoreHorizontal, ChevronLeft, ChevronRight, Tag, ShieldCheck, AlertCircle, Hash, Layers, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import './DataCatalog.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

const DataCatalog: React.FC = () => {
  const { platform } = usePlatform();
  const [activeTab, setActiveTab] = useState('Published');
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      try {
        let credentials = null;
        const saved = sessionStorage.getItem('robin_credentials');
        if (saved) {
          const creds = JSON.parse(saved);
          credentials = creds[platform];
        }
        const res = await axios.post(`${API_BASE}/catalog/tables`, {
          platform,
          credentials
        });
        
        // Enrich backend names with deterministic data synced with TableDetail
        const enriched = (res.data.tables || []).map((t: any, idx: number) => {
          const name = t.NAME || t.name;
          const db = t.DATABASE || t.database;
          const sch = t.SCHEMA || t.schema;
          
          // Check sessionStorage for user updates (synced with TableDetail)
          const hasDesc = sessionStorage.getItem(`robin_has_saved_desc_${name}`) === 'true';
          const terms = JSON.parse(sessionStorage.getItem(`robin_terms_${name}`) || '[]');
          
          // Calculate scores using the exact same logic as TableDetail (Weighted Pillars)
          const savedQuality = sessionStorage.getItem(`robin_table_quality_${name}`);
          const qualityBase = savedQuality ? parseInt(savedQuality) : 100;

          const freshnessScore = 100; // Simulated/Warehouse metadata
          const descriptionScoreVal = hasDesc ? 100 : 0;
          const glossaryScoreVal = terms.length > 0 ? 100 : 0;
          const governanceScore = Math.round((descriptionScoreVal + glossaryScoreVal) / 2);

          const qualityWeight = 0.4;
          const freshnessWeight = 0.2;
          const governanceWeight = 0.4;

          const totalTrustScore = Math.round(
            (qualityBase * qualityWeight) +
            (freshnessScore * freshnessWeight) +
            (governanceScore * governanceWeight)
          );
          const recordCount = t.RECORDS !== undefined ? Number(t.RECORDS) : (t.records !== undefined ? Number(t.records) : 1000 + (idx * 157) % 50000);
          sessionStorage.setItem(`robin_record_count_${name}`, recordCount.toString());
          
          return {
            name: name,
            database: db,
            schema: sch,
            description: hasDesc ? `User-curated description active for ${name}` : `Auto-discovered catalog item from ${db}.${sch}`,
            terms: terms.length > 0 ? terms : (idx % 3 === 0 ? ['Sensitive', 'Personal Data'] : ['Internal Use']),
            trustIndex: totalTrustScore > 60 ? 'Trusted' : 'Limited',
            trustScore: totalTrustScore,
            anomalies: '-',
            quality: qualityBase,
            attributes: t.ATTRIBUTES !== undefined ? Number(t.ATTRIBUTES) : (t.attributes !== undefined ? Number(t.attributes) : 5 + (idx * 3) % 20),
            records: t.RECORDS !== undefined ? Number(t.RECORDS) : (t.records !== undefined ? Number(t.records) : 1000 + (idx * 157) % 50000),
            origin: platform === 'snowflake' ? 'Snowflake' : 'Databricks'
          };
        });
        setTables(enriched);
      } catch (err) {
        console.error("Error fetching catalog", err);
      }
      setLoading(false);
    };
    fetchCatalog();
  }, [platform]);

  // Filtering logic
  const [selectedDBs, setSelectedDBs] = useState<string[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  // Advanced Top Filters State
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedNumAttributes, setSelectedNumAttributes] = useState<string | null>(null);
  const [selectedNumRecords, setSelectedNumRecords] = useState<string | null>(null);

  const uniqueDBs = Array.from(new Set(tables.map(t => t.database))).filter(Boolean).sort();
  const uniqueSchemas = Array.from(new Set(tables.map(t => t.schema))).filter(Boolean).sort();
  const uniqueNames = Array.from(new Set(tables.map(t => t.name))).filter(Boolean).sort();
  const allUniqueTerms = Array.from(new Set(tables.flatMap(t => t.terms || []))).filter(Boolean).sort();

  const filteredTables = tables.filter(t => {
    const dbMatch = selectedDBs.length === 0 || selectedDBs.includes(t.database);
    const schemaMatch = selectedSchemas.length === 0 || selectedSchemas.includes(t.schema);
    const nameMatch = selectedNames.length === 0 || selectedNames.includes(t.name);

    const termsMatch = selectedTerms.length === 0 || selectedTerms.some(term => (t.terms || []).includes(term));

    const qualityMatch = !selectedQuality || (
      selectedQuality === 'Excellent (>80%)' ? t.quality > 80 :
      selectedQuality === 'Good (50%-80%)' ? (t.quality >= 50 && t.quality <= 80) :
      t.quality < 50
    );

    const sourceMatch = !selectedSource || t.origin === selectedSource;

    const attrMatch = !selectedNumAttributes || (
      selectedNumAttributes === '< 5' ? t.attributes < 5 :
      selectedNumAttributes === '5 - 15' ? (t.attributes >= 5 && t.attributes <= 15) :
      t.attributes > 15
    );

    const recMatch = !selectedNumRecords || (
      selectedNumRecords === '< 1,000' ? t.records < 1000 :
      selectedNumRecords === '1,000 - 10,000' ? (t.records >= 1000 && t.records <= 10000) :
      t.records > 10000
    );

    return dbMatch && schemaMatch && nameMatch && termsMatch && qualityMatch && sourceMatch && attrMatch && recMatch;
  });

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    if (list.includes(val)) {
      setList(list.filter(i => i !== val));
    } else {
      setList([...list, val]);
    }
  };

  const FilterDropdown = ({ options, selected, onToggle, label }: { options: string[], selected: string[], onToggle: (v: string) => void, label: string }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="filter-dropdown-container">
        <div className="filter-header" onClick={() => setOpen(!open)}>
          <span>{label}</span>
          <ChevronDown size={14} className={open ? 'rotate' : ''} />
        </div>
        {open && (
          <div className="filter-popup glass-panel">
            <div className="filter-options">
              {options.map(opt => (
                <label key={opt} className="filter-option">
                  <input 
                    type="checkbox" 
                    checked={selected.includes(opt)} 
                    onChange={() => onToggle(opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <button className="clear-filter-btn" onClick={() => { onToggle('CLEAR_ALL'); setOpen(false); }}>Clear</button>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleToggleDB = (v: string) => {
    if (v === 'CLEAR_ALL') setSelectedDBs([]);
    else toggleFilter(selectedDBs, setSelectedDBs, v);
  };

  const handleToggleSchema = (v: string) => {
    if (v === 'CLEAR_ALL') setSelectedSchemas([]);
    else toggleFilter(selectedSchemas, setSelectedSchemas, v);
  };

  const handleToggleName = (v: string) => {
    if (v === 'CLEAR_ALL') setSelectedNames([]);
    else toggleFilter(selectedNames, setSelectedNames, v);
  };

  const tabs = ['Published', 'Unpublished', 'All'];
  const filters = [
    { name: 'Terms', icon: Tag },
    { name: 'Data Quality', icon: ShieldCheck },
    { name: 'Data Source', icon: Database },
    { name: 'Location', icon: MapPin },
    { name: 'Number of Attributes', icon: Hash },
    { name: 'Number of Records', icon: Layers },
    { name: 'Processing Date', icon: Calendar },
    { name: 'Anomaly State', icon: AlertCircle },
    { name: 'Stewardship', icon: Users },
  ];

  return (
    <div className="data-catalog">
      <div className="catalog-header">
        <div className="catalog-tabs">
          {tabs.map(tab => (
            <button 
              key={tab} 
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Type here to search full-text for Catalog items" 
            className="catalog-search"
          />
        </div>

        <div className="filters-container">
          {filters.map(f => (
            <div key={f.name} style={{ position: 'relative' }}>
              <button 
                onClick={() => setOpenFilter(openFilter === f.name ? null : f.name)} 
                className="filter-btn"
                style={{
                  background: openFilter === f.name ? 'rgba(15, 23, 42, 0.1)' : 'transparent'
                }}
              >
                <span>{f.name}</span>
                <ChevronDown size={14} />
              </button>
              {openFilter === f.name && (
                <div 
                  className="filter-popup glass-panel" 
                  style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    zIndex: 100, 
                    minWidth: '200px', 
                    marginTop: '4px', 
                    background: '#ffffff', 
                    border: '1px solid #cbd5e1', 
                    padding: '12px', 
                    borderRadius: '8px', 
                    boxShadow: '0 10px 35px rgba(0,0,0,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  {f.name === 'Terms' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {allUniqueTerms.map(term => (
                        <label key={term} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
                          <input type="checkbox" checked={selectedTerms.includes(term)} onChange={() => {
                            setSelectedTerms(prev => prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]);
                          }} />
                          <span>{term}</span>
                        </label>
                      ))}
                      {selectedTerms.length > 0 && (
                        <button onClick={() => setSelectedTerms([])} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', padding: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>Clear all</button>
                      )}
                    </div>
                  )}

                  {f.name === 'Data Quality' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {['Excellent (>80%)', 'Good (50%-80%)', 'Poor (<50%)'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
                          <input type="radio" checked={selectedQuality === opt} onChange={() => setSelectedQuality(opt === selectedQuality ? null : opt)} />
                          <span>{opt}</span>
                        </label>
                      ))}
                      {selectedQuality && (
                        <button onClick={() => setSelectedQuality(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', padding: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>Clear filter</button>
                      )}
                    </div>
                  )}

                  {f.name === 'Data Source' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {['Snowflake', 'Databricks'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
                          <input type="radio" checked={selectedSource === opt} onChange={() => setSelectedSource(opt === selectedSource ? null : opt)} />
                          <span>{opt}</span>
                        </label>
                      ))}
                      {selectedSource && (
                        <button onClick={() => setSelectedSource(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', padding: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>Clear filter</button>
                      )}
                    </div>
                  )}

                  {f.name === 'Number of Attributes' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {['< 5', '5 - 15', '> 15'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
                          <input type="radio" checked={selectedNumAttributes === opt} onChange={() => setSelectedNumAttributes(opt === selectedNumAttributes ? null : opt)} />
                          <span>{opt}</span>
                        </label>
                      ))}
                      {selectedNumAttributes && (
                        <button onClick={() => setSelectedNumAttributes(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', padding: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>Clear filter</button>
                      )}
                    </div>
                  )}

                  {f.name === 'Number of Records' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {['< 1,000', '1,000 - 10,000', '> 10,000'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
                          <input type="radio" checked={selectedNumRecords === opt} onChange={() => setSelectedNumRecords(opt === selectedNumRecords ? null : opt)} />
                          <span>{opt}</span>
                        </label>
                      ))}
                      {selectedNumRecords && (
                        <button onClick={() => setSelectedNumRecords(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', padding: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>Clear filter</button>
                      )}
                    </div>
                  )}

                  {['Location', 'Processing Date', 'Anomaly State', 'Stewardship'].includes(f.name) && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '4px' }}>
                      Filters using all catalog assets
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="catalog-content glass-panel">
        <div className="table-actions">
          <div className="hidden-columns">
            <span>Hidden columns</span>
            <ChevronDown size={14} />
          </div>
          <div className="active-filter-indicators">
            {selectedDBs.length > 0 && <span className="filter-tag">DBs: {selectedDBs.length} <span className="close" onClick={() => setSelectedDBs([])}>×</span></span>}
            {selectedSchemas.length > 0 && <span className="filter-tag">Schemas: {selectedSchemas.length} <span className="close" onClick={() => setSelectedSchemas([])}>×</span></span>}
            {selectedTerms.length > 0 && <span className="filter-tag">Terms: {selectedTerms.length} <span className="close" onClick={() => setSelectedTerms([])}>×</span></span>}
            {selectedQuality && <span className="filter-tag">Quality: {selectedQuality} <span className="close" onClick={() => setSelectedQuality(null)}>×</span></span>}
            {selectedSource && <span className="filter-tag">Source: {selectedSource} <span className="close" onClick={() => setSelectedSource(null)}>×</span></span>}
            {selectedNumAttributes && <span className="filter-tag">Attributes: {selectedNumAttributes} <span className="close" onClick={() => setSelectedNumAttributes(null)}>×</span></span>}
            {selectedNumRecords && <span className="filter-tag">Records: {selectedNumRecords} <span className="close" onClick={() => setSelectedNumRecords(null)}>×</span></span>}
          </div>
        </div>

        <div className="catalog-table-wrapper">
          {loading ? (
            <div className="catalog-loader">
              <Loader2 className="spinner" size={48} />
              <p>Scanning {platform} account for metadata...</p>
            </div>
          ) : (
            <table className="catalog-table">
              <thead>
                <tr>
                  <th className="checkbox-col"><input type="checkbox" /></th>
                  <th>
                    <FilterDropdown 
                      label="Database" 
                      options={uniqueDBs} 
                      selected={selectedDBs} 
                      onToggle={handleToggleDB} 
                    />
                  </th>
                  <th>
                    <FilterDropdown 
                      label="Schema" 
                      options={uniqueSchemas} 
                      selected={selectedSchemas} 
                      onToggle={handleToggleSchema} 
                    />
                  </th>
                  <th>
                    <FilterDropdown 
                      label="Name" 
                      options={uniqueNames} 
                      selected={selectedNames} 
                      onToggle={handleToggleName} 
                    />
                  </th>
                  <th>Description</th>
                  <th>Terms</th>
                  <th>Data trust index</th>
                  <th>Anomalies</th>
                  <th>Overall Quality</th>
                  <th># Attributes</th>
                  <th># Records</th>
                  <th>Origin</th>
                </tr>
              </thead>
              <tbody>
                {filteredTables.map((row, idx) => (
                  <tr key={idx}>
                    <td className="checkbox-col"><input type="checkbox" /></td>
                    <td className="db-col">{row.database}</td>
                    <td className="schema-col">{row.schema}</td>
                    <td className="name-col">
                      <Link to={`/catalog/${row.database}/${row.schema}/${row.name}`} className="item-name-link">
                        <div className="item-name">
                          <Layers size={14} className="type-icon" />
                          <span>{row.name}</span>
                          <MoreHorizontal size={14} className="hover-actions" />
                        </div>
                      </Link>
                    </td>
                    <td className="desc-col">{row.description}</td>
                    <td className="terms-col">
                      <div className="terms-list">
                        {row.terms.slice(0, 2).map((term: string, tIdx: number) => (
                          <span key={tIdx} className="term-tag">{term}</span>
                        ))}
                        {row.terms.length > 2 && <span className="term-count">+{row.terms.length - 2}</span>}
                      </div>
                    </td>
                    <td className="trust-col">
                      <div className={`trust-badge ${row.trustIndex.toLowerCase()}`}>
                        {row.trustIndex === 'Trusted' ? <ShieldCheck size={12} /> : <AlertCircle size={12} />}
                        <span>{row.trustIndex} {row.trustScore}</span>
                      </div>
                    </td>
                    <td className="anomalies-col">{row.anomalies}</td>
                    <td className="quality-col">
                      <div className="quality-indicator">
                        <div className="progress-bar-bg">
                          <div 
                            className={`progress-bar-fill ${row.quality > 80 ? 'high' : row.quality > 50 ? 'med' : 'low'}`}
                            style={{ width: `${row.quality}%` }}
                          ></div>
                        </div>
                        <span>{row.quality}%</span>
                      </div>
                    </td>
                    <td>{row.attributes}</td>
                    <td>{row.records.toLocaleString()}</td>
                    <td>
                      <div className="origin-tag">
                        <div className="origin-dot" style={{ backgroundColor: row.origin === 'Snowflake' ? '#3b82f6' : '#ff3621' }}></div>
                        {row.origin}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="catalog-footer">
          <button className="show-more">
            <ChevronDown size={14} />
            Show 10 more
          </button>
          
          <div className="pagination">
            <div className="page-nav">
              <ChevronLeft size={18} className="nav-btn disabled" />
              <div className="page-current">1</div>
              <span className="page-total">of 6</span>
              <ChevronRight size={18} className="nav-btn" />
            </div>
            <div className="items-per-page">
              1-{filteredTables.length} of {tables.length} items
              <ChevronDown size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Placeholder icons for filters
const Database = () => <Hash size={14} />;
const MapPin = () => <Hash size={14} />;
const Calendar = () => <Hash size={14} />;
const Users = () => <Hash size={14} />;

export default DataCatalog;
