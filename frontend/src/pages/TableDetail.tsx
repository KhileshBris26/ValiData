import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useClickOutside } from '../hooks/useClickOutside';
import { usePlatform } from '../context/PlatformContext';
import { 
  ChevronRight, ChevronLeft, Database, ShieldCheck, AlertCircle, 
  BarChart2, Clock, Grid, 
  Edit3, RotateCw, Users, Info, 
  MoreVertical, Hash, Type, Plus, Loader2, Save, X, Search, Power, HelpCircle
} from 'lucide-react';
import './TableDetail.css';

import { API_BASE } from '../api';

type LineageNode = {
  id: string; title: string; icon: string;
  completeness: string; completenessColor: string;
  attrs: string[]; tags?: string[];
};
type LineageConfig = {
  upstreams: LineageNode[];
  current: LineageNode;
  downstream: { node: LineageNode; farNode: LineageNode | null }[];
  failedCol: string | null;
  edges: { from: string; to: string; flows: { src: string; tgt: string; expr?: string }[] }[];
};

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

const TableDetail: React.FC = () => {
  const { database, schema, table } = useParams<{ database: string; schema: string; table: string }>();
  const { platform } = usePlatform();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (table) {
      localStorage.setItem('robin_active_context_table', table);
    }
  }, [table]);

  const GLOSSARY_OPTIONS = [
    "Academic title", "Advertising", "Age of customer", "Asset", "Bill of materials", "Biometrics", 
    "Personal Data", "PHI data", "Personal ID", "Sensitive", "Confidential", "GDPR", "CCPA", "HIPAA",
    "SSN", "Passport Number", "Driver's License", "Fingerprint", "Eye Color", "Date of Birth",
    "Email", "Phone", "Mobile", "Home Address", "Work Address", "Latitude", "Longitude", "ZIP Code",
    "Credit Card", "Account Number", "IBAN", "SWIFT Code", "Transaction ID", "Amount", "Currency", "Revenue",
    "Profit", "Tax ID", "Patient ID", "Medical Record", "Diagnosis Code", "Blood Type", "Prescription", "Insurance ID",
    "Customer SKU", "Supplier ID", "Part Number", "Inventory Level", "Lead Time", "Warehouse Location", "Shipping Method",
    "Employee ID", "Salary", "Department", "Hire Date", "Performance Rating", "Job Title", "Emergency Contact",
    "Customer Segment", "Lifetime Value", "Loyalty Tier", "Gender", "Ethnicity", "Marital Status", "Income Level",
    "Contract ID", "Start Date", "End Date", "Agreement Type", "Legal Entity", "Jurisdiction", "Clause Type",
    "Product Category", "Brand Name", "MSRP", "Wholesale Price", "Discount Code", "Promotion ID", "Campaign Name",
    "Server IP", "MAC Address", "User Agent", "Session ID", "Clickstream Data", "Page URL", "Referrer", "Device ID",
    "IoT Sensor ID", "Temperature", "Pressure", "Voltage", "Energy Consumption", "Vibration Level", "Error Code",
    "Audit Log", "System Event", "Access Token", "API Key", "Authentication Method", "Encryption Type", "Firewall Rule",
    "Cost Center", "General Ledger", "Journal Entry", "Fiscal Year", "Budget Code", "Invoice Number", "Purchase Order",
    "Student ID", "Course Code", "Grade", "GPA", "Enrollment Status", "Faculty Name", "Campus Location",
    "Flight Number", "Seat Class", "Departure Time", "Arrival Time", "Frequent Flyer ID", "Baggage Weight", "Gate Number"
  ].sort();

  const [summary, setSummary] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [hasSavedDescription, setHasSavedDescription] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const [attrFilters, setAttrFilters] = useState<{ [key: string]: string }>({});
  const [selectedColumn, setSelectedColumn] = useState<{ nodeId: string; col: string } | null>(null);
  const [activeEdge, setActiveEdge] = useState<{ from: string; to: string; flows: { src: string; tgt: string; expr?: string }[] } | null>(null);
  const [showTransformationModal, setShowTransformationModal] = useState(false);
  const [showAiExplanation, setShowAiExplanation] = useState(false);
  const [showTransformationContext, setShowTransformationContext] = useState(false);
  
  const [hasEvaluated, setHasEvaluated] = useState(() => localStorage.getItem('robin_has_evaluated') === 'true');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [shutDownRules, setShutDownRules] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`robin_shut_down_rules_${table}`) || '[]'); } catch { return []; }
  });
  const [deletedRules, setDeletedRules] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`robin_deleted_rules_${table}`) || '[]'); } catch { return []; }
  });
  const [hoveredRule, setHoveredRule] = useState<string | null>(null);
  const [selectedRuleForPanel, setSelectedRuleForPanel] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState('Configuration');
  
  // Glossary state
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);

  const fetchTableMetadata = useCallback(async () => {
    if (!database || !schema || !table) return;
    try {
      const res = await axios.post(`${API_BASE}/metadata/fetch`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        column_name: ""
      });
      if (res.data.status === 'success') {
        const desc = res.data.description || '';
        setSummary(desc);
        setEditedSummary(desc);
        setHasSavedDescription(desc.length > 0);
        if (res.data.terms && Array.isArray(res.data.terms)) {
          setSelectedTerms(res.data.terms);
        }
      }
    } catch (err) {
      console.error("Failed to fetch catalog metadata", err);
    }
  }, [platform, database, schema, table]);

  useEffect(() => {
    fetchTableMetadata();
  }, [fetchTableMetadata]);

  useEffect(() => {
    if (table) {
      localStorage.setItem(`robin_shut_down_rules_${table}`, JSON.stringify(shutDownRules));
      localStorage.setItem(`robin_deleted_rules_${table}`, JSON.stringify(deletedRules));
    }
  }, [table, shutDownRules, deletedRules]);
  const glossaryRef = useRef<HTMLDivElement>(null);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);
  useClickOutside(glossaryRef, () => setIsGlossaryOpen(false));
  const [glossarySearch, setGlossarySearch] = useState('');

  const [dynamicLineage, setDynamicLineage] = useState<LineageConfig | null>(null);
  const [isLoadingLineage, setIsLoadingLineage] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);

  const [dynamicColumns, setDynamicColumns] = useState<any[]>([]);
  const [_isLoadingCols, setIsLoadingCols] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [dataFilter, setDataFilter] = useState('');

  useEffect(() => {
    const fetchColumns = async () => {
      if (!database || !schema || !table) return;
      setIsLoadingCols(true);
      try {
        let credentials = null;
        const saved = localStorage.getItem('robin_credentials');
        if (saved) credentials = JSON.parse(saved)[platform];

        const res = await axios.post(`${API_BASE}/metadata/entities`, {
          platform,
          entity_type: 'columns',
          database_name: database,
          schema_name: schema,
          table_name: table,
          credentials
        });

        if (res.data.entities) {
          setDynamicColumns(res.data.entities.map((col: any) => 
            typeof col === 'string' ? { name: col, type: 'VARCHAR', nullable: true } : col
          ));
        }
      } catch (err) {
        console.error("Failed to fetch columns", err);
      }
      setIsLoadingCols(false);
    };
    fetchColumns();
  }, [database, schema, table, platform]);

  const fetchDynamicLineage = useCallback(async () => {
    if (!database || !schema || !table) return;
    setIsLoadingLineage(true);
    try {
      setLineageError(null);
      let credentials = null;
      const saved = localStorage.getItem('robin_credentials');
      if (saved) credentials = JSON.parse(saved)[platform];

      const res = await axios.post(`${API_BASE}/lineage/infer`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        credentials
      }, { timeout: 60000 });

      if (res.data && res.data.nodes && res.data.edges) {
        const nodes = res.data.nodes;
        const edges = res.data.edges;
        const tKey = (table || '').trim().toUpperCase();
        
        // Robust matching: find node that matches table name case-insensitively
        const currentNode = nodes.find((n: any) => 
          (n.id || '').trim().toUpperCase() === tKey ||
          (n.data?.label || '').trim().toUpperCase() === tKey
        );

        if (currentNode) {
          const getIcon = (name: string) => {
            const n = name.toUpperCase();
            if (n.startsWith('H_')) return '🏛️';
            if (n.startsWith('L_')) return '🔗';
            if (n.startsWith('S_')) return '📋';
            if (n.startsWith('E_')) return '✈️';
            return '❄️';
          };

          const mapNode = (n: any): LineageNode => {
            const nodeId = n.id;
            const isCurrent = nodeId.toUpperCase() === tKey;
            
            // Extract column names from the backend-provided 'columns' data
            let nodeAttrs: string[] = [];
            if (n.data?.columns && Array.isArray(n.data.columns)) {
              nodeAttrs = n.data.columns.map((c: any) => c.name || c.COLUMN_NAME || c.column_name);
            } else if (n.data?.joinColumns) {
              nodeAttrs = n.data.joinColumns;
            }
            
            // For the current table, use the full dynamicColumns list we already have for maximum freshness
            if (isCurrent && dynamicColumns.length > 0) {
              nodeAttrs = dynamicColumns.map(c => c.attribute);
            }

            return {
              id: nodeId,
              title: nodeId,
              icon: getIcon(nodeId),
              completeness: isCurrent ? '100' : '100',
              completenessColor: '#10b981',
              attrs: nodeAttrs
            };
          };

          const currentLineageNode = mapNode(currentNode);
          
          // Get ALL upstreams, but filter down to unique source tables
          const uniqueUpstreamSources = Array.from(new Set(edges.filter((e: any) => e.target.toUpperCase() === tKey).map((e: any) => e.source)));
          const upstreams = uniqueUpstreamSources.map((sourceId: any) => {
            const uNode = nodes.find((n: any) => n.id === sourceId) || { id: sourceId, data: { label: sourceId } };
            return mapNode(uNode);
          });

          // Group downstream edges by target to avoid duplicates
          const uniqueDownstreamTargets = Array.from(new Set(edges.filter((e: any) => e.source.toUpperCase() === tKey).map((e: any) => e.target)));
          
          const downstreamConfigs = uniqueDownstreamTargets.map((targetId: any) => {
            const dNode = nodes.find((n: any) => n.id === targetId) || { id: targetId, data: { label: targetId } };
            const dLineageNode = mapNode(dNode);
            
            // Find Far Node (nodes dNode points to)
            const farEdges = edges.filter((e: any) => e.source === dNode.id);
            const fNode = farEdges.length > 0 ? nodes.find((n: any) => n.id === farEdges[0].target) : null;
            const fLineageNode = fNode ? mapNode(fNode) : null;
            
            return { node: dLineageNode, farNode: fLineageNode };
          });

          // Group edges to aggregate multiple column flows between the same source and target
          const aggregatedEdgesMap = new Map<string, { from: string; to: string; flows: any[] }>();
          edges.forEach((e: any) => {
            const key = `${e.source}->${e.target}`;
            if (!aggregatedEdgesMap.has(key)) {
              aggregatedEdgesMap.set(key, { from: e.source, to: e.target, flows: [] });
            }
            if (e.data?.col1) {
              aggregatedEdgesMap.get(key)!.flows.push({ 
                src: e.data.col1, 
                tgt: e.data.col2, 
                expr: e.data.match_type === 'exact' ? undefined : e.data.match_type 
              });
            }
          });

          setDynamicLineage({
            upstreams: upstreams.length > 0 ? upstreams : [{ id: 'SOURCE', title: 'Data Source', icon: '📥', completeness: '100', completenessColor: '#10b981', attrs: [] }],
            current: currentLineageNode,
            downstream: downstreamConfigs,
            failedCol: null,
            edges: Array.from(aggregatedEdgesMap.values())
          });
        } else {
          setLineageError(`Table "${table}" not found in discovered lineage.`);
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch dynamic lineage:", err);
      setLineageError(err.response?.data?.detail || err.message || "Failed to infer lineage from warehouse.");
    }
    setIsLoadingLineage(false);
  }, [database, schema, table, platform]);

  const fetchPreview = useCallback(async () => {
    if (!database || !schema || !table) return;
    setIsLoadingPreview(true);
    try {
      let credentials = null;
      const saved = localStorage.getItem('robin_credentials');
      if (saved) credentials = JSON.parse(saved)[platform];

      const res = await axios.post(`${API_BASE}/metadata/preview`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        credentials
      });
      if (res.data.rows) {
        setPreviewRows(res.data.rows);
      }
    } catch (err) {
      console.error("Failed to fetch data preview", err);
    }
    setIsLoadingPreview(false);
  }, [database, schema, table, platform]);

  useEffect(() => {
    if (activeTab === 'Lineage' || activeTab === 'Relationships' || activeTab === 'Data Transformations') {
      fetchDynamicLineage();
    } else if (activeTab === 'Data') {
      fetchPreview();
    } else {
      setDynamicLineage(null); // Clear when not in tab to ensure fresh fetch
    }
  }, [activeTab, fetchDynamicLineage, fetchPreview]);

  const generateAiDescription = (tableName: string, dbName: string, schName: string): string => {
    const name = (tableName || '').toLowerCase();
    const db = dbName || 'the data warehouse';
    const sch = schName || 'the schema';
    if (name.includes('loan') && name.includes('raw')) {
      return `Raw loan origination data ingested from the core banking system into ${db}.${sch}. Contains unadjusted loan records including customer identifiers, principal amounts, interest rates (in variable formats), loan types, and start dates. Serves as the primary bronze-layer source for all downstream curated and enriched loan datasets. Interest rate values require standardization (percent-to-decimal normalization) before analytical use.`;
    } else if (name.includes('loan') && name.includes('curated')) {
      return `Curated silver-layer loan dataset within ${db}.${sch}. Produced by the LOANS_RAW → LOANS_CURATED transformation pipeline, which standardizes interest rates, trims whitespace, and validates date formats. This table is the canonical source of truth for loan analytics and feeds into BANKING_METRICS_ENRICHED and CUSTOMER_PROFITABILITY_ENRICHED downstream. All column-level DQ rules are enforced at this layer.`;
    } else if (name.includes('customer')) {
      return `Customer master data table in ${db}.${sch} containing enriched customer profile attributes including segmentation, product association, revenue data, and approval status. This table links to downstream reporting datasets and is subject to PII classification rules under GDPR. Data is refreshed on a nightly schedule and profiled weekly for completeness and uniqueness violations.`;
    } else if (name.includes('metric') || name.includes('analytics')) {
      return `Aggregated analytics and metrics table in ${db}.${sch}. Consolidates key business KPIs derived from multiple upstream curated tables. Used as a primary source for executive dashboards and financial reporting. Data is computed via scheduled dbt models and refreshed every 6 hours. Column-level DQ thresholds are enforced to ensure metric reliability.`;
    } else if (name.includes('enriched')) {
      return `Gold-layer enriched dataset in ${db}.${sch}. Combines data from multiple silver-layer sources through JOIN operations and business-logic transformations. Optimized for analytical consumption by BI tools and data science teams. Each row represents a fully resolved, deduplicated entity with all dimensional attributes populated.`;
    } else {
      return `Catalog asset discovered in ${db}.${sch}. This table contains structured data managed within the ${platform === 'snowflake' ? 'Snowflake' : 'Databricks'} platform. It participates in the enterprise data lineage graph and is subject to data quality monitoring through Robin's pushdown evaluation engine. Stewardship and glossary terms should be assigned to improve the Data Trust Index score.`;
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    // Simulate AI generation with a realistic delay
    await new Promise(resolve => setTimeout(resolve, 1600));
    try {
      let credentials = null;
      const saved = localStorage.getItem('robin_credentials');
      if (saved) {
        credentials = JSON.parse(saved)[platform];
      }
      
      let generatedDesc = '';
      try {
        const res = await axios.post(`${API_BASE}/ai/table_summary`, {
          platform, table_name: table, credentials
        });
        if (res.data.summary) generatedDesc = res.data.summary;
      } catch (err) {}
      
      if (!generatedDesc) {
        generatedDesc = generateAiDescription(table || '', database || '', schema || '');
      }
      
      await axios.post(`${API_BASE}/metadata/save`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        column_name: "",
        description: generatedDesc,
        terms: selectedTerms,
        is_auto_generated: true
      });
      
      setSummary(generatedDesc);
      setEditedSummary(generatedDesc);
      setHasSavedDescription(true);
    } catch (err) {
      console.error("Failed to save AI description", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API_BASE}/metadata/save`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        column_name: "",
        description: editedSummary,
        terms: selectedTerms,
        is_auto_generated: false
      });
      setSummary(editedSummary);
      setHasSavedDescription(editedSummary.length > 0);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save description", err);
    }
  };

  const handleCancel = () => {
    setEditedSummary(summary);
    setIsEditing(false);
  };

  const toggleTerm = async (term: string) => {
    let newTerms;
    if (selectedTerms.includes(term)) {
      newTerms = selectedTerms.filter(t => t !== term);
    } else {
      newTerms = [...selectedTerms, term];
    }
    
    try {
      await axios.post(`${API_BASE}/metadata/save`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        column_name: "",
        description: summary,
        terms: newTerms,
        is_auto_generated: false
      });
      setSelectedTerms(newTerms);
    } catch (err) {
      console.error("Failed to save terms", err);
    }
  };

  // Data Trust Index calculation (0-100) based on weighted pillars
  const savedQuality = localStorage.getItem(`robin_table_quality_${table}`);
  const qualityBase = savedQuality ? parseInt(savedQuality) : 100;

  const qualityWeight = 0.4;
  const freshnessWeight = 0.2;
  const governanceWeight = 0.4;

  const freshnessScore = 100; // In a production app, this would come from warehouse metadata
  const descriptionScoreVal = hasSavedDescription ? 100 : 0;
  const glossaryScoreVal = selectedTerms.length > 0 ? 100 : 0;
  const governanceScore = Math.round((descriptionScoreVal + glossaryScoreVal) / 2);

  const trustIndex = Math.round(
    (qualityBase * qualityWeight) +
    (freshnessScore * freshnessWeight) +
    (governanceScore * governanceWeight)
  );

  // Keep compatibility for any other parts using overallScore
  const overallScore = trustIndex;

  const appliedRules = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('robin_applied_rules') || '[]');
    } catch {
      return [];
    }
  }, []);

  const staticAttributes: any[] = [];

  const attributes = dynamicColumns && dynamicColumns.length > 0 
    ? dynamicColumns.map(c => ({ 
        name: c.name || c.attribute || 'UNKNOWN', 
        type: c.type || 'string',
        tags: c.tags || (c.tag ? [c.tag] : undefined),
        tag: c.tag
      }))
    : staticAttributes;

  return (
    <div className="table-detail">
      {/* Breadcrumbs + Back nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          title="Go back"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '6px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
        >
          <ChevronLeft size={14} /> Back
        </button>

        {/* Breadcrumb trail */}
        <div className="breadcrumbs">
          <Link to="/catalog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-main)'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)'}
          >Data Catalog</Link>
          <ChevronRight size={14} />
          <Link to="/catalog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-main)'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)'}
          >Analytical Data Warehouse</Link>
          <ChevronRight size={14} />
          <span className="accent">{database}</span>
          <ChevronRight size={14} />
          <span className="accent">{schema}</span>
          <ChevronRight size={14} />
          <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{table}</span>
        </div>
      </div>

      {/* Header */}
      <div className="detail-header">
        <div className="title-section">
          <div className="table-icon-wrapper">
            <Grid size={24} />
          </div>
          <h1>{table}</h1>
        </div>
        
        <div className="header-actions">
          <div className="action-icons">
            <ShieldCheck size={20} className="icon-btn" />
            <RotateCw size={20} className="icon-btn" />
            <BarChart2 size={20} className="icon-btn" />
          </div>
          <div 
            className="dropdown-btn"
            onClick={() => {
              setIsEvaluating(true);
              setTimeout(() => {
                setIsEvaluating(false);
                setHasEvaluated(true);
                localStorage.setItem('robin_has_evaluated', 'true');
              }, 1000);
            }}
            style={{ cursor: isEvaluating ? 'not-allowed' : 'pointer', opacity: isEvaluating ? 0.7 : 1 }}
          >
            <span>{isEvaluating ? 'Evaluating...' : 'Profile and evaluate'}</span>
            <ChevronDown size={16} />
          </div>
          <button className="btn-edit">Edit</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button className={`tab ${activeTab === 'Overview' ? 'active' : ''}`} onClick={() => setActiveTab('Overview')}>Overview</button>
        <button className={`tab ${activeTab === 'History' ? 'active' : ''}`} onClick={() => setActiveTab('History')}>History</button>
        <button className={`tab ${activeTab === 'Data' ? 'active' : ''}`} onClick={() => setActiveTab('Data')}>Data</button>
        <button className={`tab ${activeTab === 'Data structure' ? 'active' : ''}`} onClick={() => setActiveTab('Data structure')}>Data structure</button>
        <button className={`tab ${activeTab === 'Lineage' ? 'active' : ''}`} onClick={() => setActiveTab('Lineage')}>Lineage</button>
        <button className={`tab ${activeTab === 'Relationships' ? 'active' : ''}`} onClick={() => setActiveTab('Relationships')}>Relationships</button>
        <button className={`tab ${activeTab === 'Data Transformations' ? 'active' : ''}`} onClick={() => setActiveTab('Data Transformations')}>Data Transformations</button>
      </div>

      {activeTab === 'Lineage' ? (
        <div className="lineage-detail-container card glass-panel" style={{ padding: '2rem', marginTop: '1rem', position: 'relative' }}>
          <div className="lineage-canvas-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div className="header-left">
              <span className="lineage-subtext" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Catalog lineage</span>
              <p className="lineage-caption" style={{ fontSize: '1.05rem', color: 'var(--text-main)', marginTop: '0.25rem' }}>Visual end-to-end trace for table <strong>{table}</strong>.</p>
            </div>
            <div className="header-right">
              <Link to="/lineage" className="btn-edit" style={{ textDecoration: 'none', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '0.55rem 1rem', borderRadius: '6px', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}>
                <Grid size={14} /> <span>Open in Lineage Studio</span>
              </Link>
            </div>
          </div>

          <div className="lineage-widescreen-canvas" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '2.5rem 1.5rem', position: 'relative', overflowX: 'auto', minHeight: '520px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            {/* Soft grid background */}
            {isLoadingLineage ? (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(248, 250, 252, 0.8)', backdropFilter: 'blur(2px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#ffffff', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                   <Loader2 className="spinner" size={20} color="#3b82f6" />
                   <span style={{ color: '#1e293b', fontWeight: 600 }}>Syncing with Live Lineage Studio...</span>
                </div>
              </div>
            ) : null}

            <div className="lineage-nodes-flex-row" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', zIndex: 5, position: 'relative', minWidth: 'fit-content' }}>
              
              {/* Dynamic node rendering helper */}
              {(() => {
                // ─── helpers ────────────────────────────────────────────────
                const renderTableNode = (
                  nodeId: string,
                  nodeTitle: string,
                  iconStr: string,
                  completenessPct: string,
                  completenessColor: string,
                  attributes: string[],
                  active: boolean = false,
                  customTags: string[] = [],
                  highlightedCols: Set<string> = new Set(),
                  onColClick: (col: string) => void = () => {}
                ) => {
                  const isExpanded = selectedColumn !== null ? true : expandedNodes.includes(nodeId);
                  const filterText = attrFilters[nodeId] || '';

                  const toggleExpand = () => {
                    if (isExpanded && selectedColumn === null) {
                      setExpandedNodes(expandedNodes.filter(n => n !== nodeId));
                    } else if (!isExpanded) {
                      setExpandedNodes([...expandedNodes, nodeId]);
                    }
                  };

                  const filteredAttrs = attributes.filter(a => a.toLowerCase().includes(filterText.toLowerCase()));

                  return (
                    <div
                      className={`custom-lin-table-node ${active ? 'active-highlight' : ''}`}
                      style={{
                        background: '#ffffff',
                        border: active ? '2.5px solid #2563eb' : '1px solid #cbd5e1',
                        borderRadius: '8px',
                        width: '260px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: active ? '0 4px 20px rgba(37, 99, 235, 0.12)' : '0 4px 15px rgba(0, 0, 0, 0.04)',
                        position: 'relative',
                        transition: 'all 0.2s ease-in-out',
                        alignSelf: 'center'
                      }}
                    >
                      {/* Node Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem', background: active ? '#eff6ff' : '#f3f4f6', padding: '4px', borderRadius: '50%' }}>{iconStr}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nodeTitle}>
                          {nodeTitle}
                        </span>
                      </div>

                      {/* Completeness bar */}
                      {completenessPct && (
                        <div style={{ width: '100%', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${completenessPct}%`, height: '100%', background: completenessColor }}></div>
                        </div>
                      )}

                      {/* Tags */}
                      {customTags.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {customTags.map((tag, idx) => (
                            <span key={idx} style={{ fontSize: '0.725rem', background: tag.includes('+') ? '#f8fafc' : '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.15)' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Expand trigger & footer */}
                      <div
                        onClick={toggleExpand}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}
                      >
                        <span style={{ color: completenessColor || '#64748b', fontWeight: 600 }}>{completenessPct ? `${completenessPct}%` : ''}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{attributes.length} attributes</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </div>
                      </div>

                      {/* Expanded columns list */}
                      {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          {/* Filter bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', padding: '0 4px', cursor: 'default' }}>Name ⌄</span>
                            <input
                              type="text"
                              placeholder="Filter by name"
                              value={filterText}
                              onChange={e => setAttrFilters({ ...attrFilters, [nodeId]: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: '0.75rem', border: 'none', background: 'transparent', outline: 'none', color: '#1e293b' }}
                            />
                          </div>

                          {/* Column rows */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto', paddingRight: '2px' }}>
                            {filteredAttrs.map((attr, idx) => {
                              const isSelected = selectedColumn?.nodeId === nodeId && selectedColumn?.col === attr;
                              const isHighlighted = !isSelected && highlightedCols.has(attr);
                              const isFailedDQ = attr === 'INTEREST_RATE'; // DQ red indicator

                              return (
                                <div
                                  key={idx}
                                  onClick={(e) => { e.stopPropagation(); onColClick(attr); }}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.75rem',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    background: isSelected ? '#2563eb' : isHighlighted ? '#dbeafe' : 'transparent',
                                    border: isSelected ? '1px solid #1d4ed8' : isHighlighted ? '1px solid #bfdbfe' : '1px solid transparent',
                                    color: isSelected ? '#ffffff' : '#334155',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontWeight: isSelected || isHighlighted ? 600 : 500, color: isSelected ? '#ffffff' : '#1e293b' }}>{attr}</span>
                                  </div>
                                  {isFailedDQ && (
                                    <div className="dq-trigger-area" style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                      <div style={{ width: '28px', height: '3px', background: '#ef4444', borderRadius: '1.5px' }}></div>
                                      <span style={{ color: isSelected ? '#ffffff' : '#ef4444', fontWeight: 600, fontSize: '0.65rem' }}>0%</span>
                                      {/* DQ hover tooltip */}
                                      <div className="dq-hover-tooltip" style={{ position: 'absolute', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 14px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, bottom: '24px', right: '-10px', width: '190px', display: 'none', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></span><span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#334155' }}>Passed</span></div>
                                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>0</span><span style={{ fontSize: '0.75rem', color: '#64748b' }}>0%</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></span><span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#334155' }}>Failed</span></div>
                                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>275 150</span><span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>100%</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                };

                return (() => {

                  // ─────────────────────────────────────────────────────────────
                  // Lineage config map — keyed by uppercase table name
                  // ─────────────────────────────────────────────────────────────
                  
                  if (lineageError) {
                    return (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(248, 250, 252, 0.9)', backdropFilter: 'blur(4px)', padding: '2rem', textAlign: 'center' }}>
                        <div style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: '24px', borderRadius: '12px', maxWidth: '400px' }}>
                          <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '12px' }} />
                          <h4 style={{ color: '#991b1b', margin: '0 0 8px 0' }}>Lineage Inference Failed</h4>
                          <p style={{ color: '#b91c1c', fontSize: '0.85rem', margin: 0 }}>{lineageError}</p>
                          <button 
                            onClick={fetchDynamicLineage}
                            style={{ marginTop: '16px', background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Retry Discovery
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const buildConfig = (): LineageConfig => {
                    // This is a fallback that uses our discovered columns
                    return {
                      upstreams: [{ id: 'SOURCE', title: 'Data Source', icon: '📥', completeness: '100', completenessColor: '#10b981', attrs: [] }],
                      current:  { id: table || 'CURRENT', title: table || 'CURRENT', icon: '❄️', completeness: '100', completenessColor: '#10b981', attrs: dynamicColumns.map(c => c.name || c.attribute) },
                      downstream: [],
                      failedCol: null,
                      edges: [],
                    };
                  };

                  const cfg = dynamicLineage || buildConfig();

                  // ── Column flow edges for BFS ────────────────────────────────
                  type ColFlow = { src: string; tgt: string; expr?: string };
                  type LEdge = { from: string; to: string; flows: ColFlow[] };

                  const edges: LEdge[] = cfg.edges || [];

                  // BFS: compute which columns to highlight per node + which edges glow
                  const highlightMap = new Map<string, Set<string>>();
                  const glowEdges = new Set<string>();
                  if (selectedColumn) {
                    const queue: { nodeId: string; col: string }[] = [{ nodeId: selectedColumn.nodeId, col: selectedColumn.col }];
                    const visited = new Set<string>();
                    if (!highlightMap.has(selectedColumn.nodeId)) highlightMap.set(selectedColumn.nodeId, new Set());
                    highlightMap.get(selectedColumn.nodeId)!.add(selectedColumn.col);
                    while (queue.length > 0) {
                      const { nodeId, col } = queue.shift()!;
                      const key = `${nodeId}:${col}`;
                      if (visited.has(key)) continue;
                      visited.add(key);
                      edges.forEach(edge => {
                        if (edge.from === nodeId) {
                          edge.flows.forEach(f => {
                            if (f.src === col) {
                              glowEdges.add(`${edge.from}→${edge.to}`);
                              if (!highlightMap.has(edge.to)) highlightMap.set(edge.to, new Set());
                              highlightMap.get(edge.to)!.add(f.tgt);
                              queue.push({ nodeId: edge.to, col: f.tgt });
                            }
                          });
                        }
                        if (edge.to === nodeId) {
                          edge.flows.forEach(f => {
                            if (f.tgt === col) {
                              glowEdges.add(`${edge.from}→${edge.to}`);
                              if (!highlightMap.has(edge.from)) highlightMap.set(edge.from, new Set());
                              highlightMap.get(edge.from)!.add(f.src);
                              queue.push({ nodeId: edge.from, col: f.src });
                            }
                          });
                        }
                      });
                    }
                  }

                  const glow = (fromId: string, toId: string) => glowEdges.has(`${fromId}→${toId}`);
                  const arrowColor = (fromId: string, toId: string) => glow(fromId, toId) ? '#2563eb' : '#94a3b8';
                  const arrowWidth = (fromId: string, toId: string) => glow(fromId, toId) ? '2.5' : '2';
                  const arrowDash = (fromId: string, toId: string) => glow(fromId, toId) ? '0' : '3 3';

                  const getEdge = (fromId: string, toId: string) => edges.find(e => e.from === fromId && e.to === toId);
                  const openEdge = (fromId: string, toId: string) => {
                    const e = getEdge(fromId, toId);
                    setActiveEdge(e ? { from: fromId, to: toId, flows: e.flows } : { from: fromId, to: toId, flows: [] });
                  };

                  const mkColClick = (nodeId: string) => (col: string) => {
                    if (selectedColumn?.nodeId === nodeId && selectedColumn?.col === col) {
                      setSelectedColumn(null);
                    } else {
                      setSelectedColumn({ nodeId, col });
                    }
                  };

                  const hc = (nodeId: string) => highlightMap.get(nodeId) || new Set<string>();

                  // ── Render ──────────────────────────────────────────────────
                  return (
                    <>
                      {/* Upstream nodes column */}
                      <div className="lineage-upstream-column" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                        {cfg.upstreams.map((u, ui) => (
                          <div key={ui} style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            {renderTableNode(u.id, u.title, u.icon, u.completeness, u.completenessColor, u.attrs, false, u.tags || [], hc(u.id), mkColClick(u.id))}
                            
                            {/* Upstream → Current connector */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => openEdge(u.id, cfg.current.id)} title="Click to view column transformations">
                              <svg style={{ width: '60px', height: '24px', overflow: 'visible', flexShrink: 0 }}>
                                <path d="M 0 12 L 60 12" stroke={arrowColor(u.id, cfg.current.id)} strokeWidth={arrowWidth(u.id, cfg.current.id)} strokeDasharray={arrowDash(u.id, cfg.current.id)} fill="none" />
                                <polygon points="60,12 54,9 54,15" fill={arrowColor(u.id, cfg.current.id)} />
                              </svg>
                              <span style={{ fontSize: '0.6rem', color: arrowColor(u.id, cfg.current.id), fontWeight: 600, letterSpacing: '0.3px' }}>TRANSFORM</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Current (active) node */}
                      {renderTableNode(cfg.current.id, cfg.current.title, cfg.current.icon, cfg.current.completeness, cfg.current.completenessColor, cfg.current.attrs, true, [], hc(cfg.current.id), mkColClick(cfg.current.id))}

                      {/* Downstream fan-out */}
                      <svg style={{ width: '60px', height: `${cfg.downstream.length * 160}px`, overflow: 'visible', flexShrink: 0 }}>
                        {cfg.downstream.map((d, i) => {
                          const totalH = cfg.downstream.length * 160;
                          const mid = totalH / 2;
                          const yTarget = (i * 160) + 80;
                          const col = arrowColor(cfg.current.id, d.node.id);
                          return (
                            <g key={i} style={{ cursor: 'pointer' }} onClick={() => openEdge(cfg.current.id, d.node.id)}>
                              <path d={`M 0 ${mid} C 30 ${mid}, 30 ${yTarget}, 60 ${yTarget}`} stroke={col} strokeWidth={arrowWidth(cfg.current.id, d.node.id)} fill="none" />
                              <polygon points={`60,${yTarget} 54,${yTarget - 3} 54,${yTarget + 3}`} fill={col} />
                              <text 
                                x="10" 
                                y={mid + (yTarget - mid) * 0.3} 
                                fill={col} 
                                style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.3px', opacity: 0.8 }}
                              >
                                TRANSFORM
                              </text>
                            </g>
                          );
                        })}
                      </svg>

                      <div className="lineage-branch-column-stack" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                        {cfg.downstream.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            {renderTableNode(d.node.id, d.node.title, d.node.icon, d.node.completeness, d.node.completenessColor, d.node.attrs, false, d.node.tags || [], hc(d.node.id), mkColClick(d.node.id))}
                            {d.farNode && (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => openEdge(d.node.id, d.farNode!.id)} title="Click to view column transformations">
                                  <svg style={{ width: '40px', height: '12px', overflow: 'visible', flexShrink: 0 }}>
                                    <path d="M 0 6 L 40 6" stroke={arrowColor(d.node.id, d.farNode!.id)} strokeWidth={arrowWidth(d.node.id, d.farNode!.id)} strokeDasharray={arrowDash(d.node.id, d.farNode!.id)} fill="none" />
                                    <polygon points="40,6 34,3 34,9" fill={arrowColor(d.node.id, d.farNode!.id)} />
                                  </svg>
                                  <span style={{ fontSize: '0.6rem', color: arrowColor(d.node.id, d.farNode!.id), fontWeight: 600, letterSpacing: '0.3px' }}>TRANSFORM</span>
                                </div>
                                {renderTableNode(d.farNode!.id, d.farNode!.title, d.farNode!.icon, d.farNode!.completeness, d.farNode!.completenessColor, d.farNode!.attrs, false, d.farNode!.tags || [], hc(d.farNode!.id), mkColClick(d.farNode!.id))}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })();

              })()}

              {/* Edge Column Flow Modal */}
              {activeEdge && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }} onClick={() => setActiveEdge(null)}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', width: '580px', maxWidth: '92vw', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Column Flow</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{activeEdge.from} <span style={{ color: '#6366f1' }}>→</span> {activeEdge.to}</div>
                      </div>
                      <button onClick={() => setActiveEdge(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem', padding: '4px' }}>✕</button>
                    </div>
                    {activeEdge.flows.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Source Column</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Transformation</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Target Column</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeEdge.flows.map((f, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: selectedColumn?.col === f.src || selectedColumn?.col === f.tgt ? '#eff6ff' : 'transparent' }}>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#1e293b', fontWeight: 500 }}>{f.src}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                {f.expr ? (
                                  <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>{f.expr}</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>direct</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#6366f1', fontWeight: 500 }}>{f.tgt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.85rem' }}>No detailed column mapping available for this connection.</div>
                    )}
                  </div>
                </div>
              )}






            </div>
          </div>

          {/* Transformation Modal Popup */}
          {showTransformationModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                width: '750px',
                maxWidth: '90vw',
                padding: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                position: 'relative'
              }}>
                {/* Top Header Row with Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <span>+</span> Add to chain
                    </button>
                    <button style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <span>⇅</span> Add all to chain
                    </button>
                  </div>
                  <button onClick={() => setShowTransformationModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    &times;
                  </button>
                </div>

                {/* Source node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontSize: '0.85rem', fontWeight: 600 }}>
                  <span>❄️</span> LOANS_RAW.INTEREST_RATE
                </div>

                {/* Middle Grey Transformation Box */}
                <div 
                  onClick={() => setShowTransformationContext(true)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                  title="Click to view transformation context"
                >
                  {/* Left icon with vertical arrows line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1rem', color: '#64748b' }}>↕</span>
                  </div>

                  {/* The transformation expression SQL text */}
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.825rem', color: '#1e293b', fontFamily: 'monospace', lineHeight: 1.5, wordBreak: 'break-all' }}>
                    TO_CHAR(IFF(REGEXP_LIKE(LOANS_RAW.interest_rate, '%'), TO_DECIMAL(REGEXP_REPLACE(LOANS_RAW.interest_rate, '[^0-9.\\-]', ''), 18, 10) / 100, TO_DECIMAL(REGEXP_REPLACE(LOANS_RAW.interest_rate, '[^0-9.\\-]', 18, 10)), 'FM0D999999999')
                  </div>

                  {/* Action icons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span title="Copy transformation code" style={{ cursor: 'pointer', color: '#64748b' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </span>
                    <span title="View AI insights" onClick={(e) => { e.stopPropagation(); setShowAiExplanation(true); }} style={{ color: '#ec4899', fontSize: '1.1rem', cursor: 'pointer' }}>✨</span>
                  </div>
                </div>

                {/* Destination node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontSize: '0.85rem', fontWeight: 600 }}>
                  <span>🏠</span> <span>❄️</span> LOANS_CURATED.INTEREST_RATE
                </div>
              </div>
            </div>
          )}

          {/* Transformation Context Drawer Popup */}
          {showTransformationContext && (
            <div style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '480px',
              maxWidth: '100vw',
              background: '#ffffff',
              borderLeft: '1px solid #e2e8f0',
              boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.08)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              animation: 'slideInRight 0.3s ease-in-out',
              overflowY: 'auto'
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 600, color: '#1e293b' }}>Transformation context</span>
                <button onClick={() => setShowTransformationContext(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#64748b', cursor: 'pointer' }}>
                  &times;
                </button>
              </div>

              {/* Explain transformation sub-row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#c026d3', marginBottom: '16px' }}>
                <span>◆</span> Explain transformation
              </div>

              {/* Line numbered Code Block Container */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                gap: '12px',
                fontFamily: 'monospace',
                fontSize: '0.775rem',
                lineHeight: 1.5,
                color: '#334155'
              }}>
                {/* Numbers Column */}
                <div style={{ display: 'flex', flexDirection: 'column', color: '#94a3b8', userSelect: 'none', textAlign: 'right', minWidth: '24px' }}>
                  {Array.from({ length: 26 }, (_, i) => (
                    <span key={i + 1} style={{ display: 'block' }}>{i + 1}</span>
                  ))}
                </div>

                {/* SQL Code Content Column */}
                <div style={{ whiteSpace: 'pre', color: '#1e293b', overflowX: 'auto', flex: 1 }}>
{`/* Lineage extracted at: 2025-12-03 22:44:26 UTC\n*/\n/*\n  Application             : Snowflake Web App\n  (snowsight_worksheet)\n  Procedure               :\n  Last execution          : 2025-10-28 15:10:47.\n  341 Z\n  Execution count         : 12\n  Rows produced (all exec): 3301800\n  Duration ms (last exec) : 1458\n  Query tag (last exec)   :\n*/\nINSERT INTO DEMO_ENV.FINANCIAL_SILVER.LOANS_CURATED\nSELECT\n  loan_id,\n  customer_id,\n  TRIM(loan_type) AS loan_type,\n  principal_amt,\n  TO_CHAR(\n    IFF(\n      REGEXP_LIKE(interest_rate, '%'),\n      TO_DECIMAL(REGEXP_REPLACE(interest_rate,\n      '[^0-9.\\\\-]', ''), 18, 10) / 100,\n      TO_DECIMAL(REGEXP_REPLACE(interest_rate,\n      '[^0-9.\\\\-]', ''), 18, 10)\n    ),\n    'FM0D999999999'\n  ) AS interest_rate,\n  TRY_TO_DATE(start_date) AS start_date\nFROM DEMO_ENV.FINANCIAL_BRONZE.LOANS_RAW;`}
                </div>
              </div>
            </div>
          )}

          {/* AI Explanation Drawer/Popup */}
          {showAiExplanation && (
            <div style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '450px',
              maxWidth: '100vw',
              background: '#ffffff',
              borderLeft: '1px solid #e2e8f0',
              boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.08)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              animation: 'slideInRight 0.3s ease-in-out',
              overflowY: 'auto'
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 600, color: '#1e293b' }}>Transformation snippet</span>
                <button onClick={() => setShowAiExplanation(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#64748b', cursor: 'pointer' }}>
                  &times;
                </button>
              </div>

              {/* Top info card with Snowflake logo matching reference image exactly */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <span>❄️</span> LOANS_RAW.INTEREST_RATE
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: '#475569',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.4
                }}>
                  {`TO_CHAR(IFF(REGEXP_LIKE(LOANS_RAW.interest_rate, '%'),\n  TO_DECIMAL(REGEXP_REPLACE(LOANS_RAW.interest_rate, '[^0-9.\\-]', ''), 18, 10) / 100,\n  TO_DECIMAL(REGEXP_REPLACE(LOANS_RAW.interest_rate, '[^0-9.\\-]', ''), 18, 10)),\n  'FM0D999999999')`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <span>🏠</span> <span>❄️</span> LOANS_CURATED.INTEREST_RATE
                </div>
              </div>

              {/* High-Level AI Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}>
                  This Snowflake expression standardizes and formats an interest rate value from a raw string field (<code>LOANS_RAW.interest_rate</code>) into a consistent numeric percentage representation as text.
                </p>

                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>High-Level Summary</strong>
                  <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>It extracts numeric content (including decimal points and minus signs) from a raw interest rate string.</li>
                    <li><strong>Purpose:</strong> Casts the cleaned string to a numeric data type with precision 18 and scale 10 for accurate calculations.</li>
                  </ol>
                </div>

                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>4. Normalize to decimal rate</strong>
                  <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>
                      <strong>Transformation (conditional with IFF):</strong>
                      <ul style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <li>If percent sign present: <code>TO_DECIMAL(...) / 100</code></li>
                        <li>Else: <code>TO_DECIMAL(...)</code></li>
                      </ul>
                    </li>
                    <li>
                      <strong>Purpose:</strong> Ensures the result is a decimal rate. For example:
                      <ul style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <li><code>"5%"</code> &rarr; 0.05</li>
                        <li><code>"0.05"</code> &rarr; 0.05</li>
                        <li><code>"-2.5%"</code> &rarr; -0.025</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>5. Format as string</strong>
                  <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>
                      <strong>Transformation:</strong> <code>TO_CHAR(&lt;decimal&gt;, 'FM0D999999999')</code>
                    </li>
                    <li>
                      <strong>Purpose:</strong> Converts the decimal rate to a string with:
                      <ul style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <li>A leading zero before the decimal point if needed.</li>
                        <li>A decimal separator (D) according to session locale.</li>
                        <li>Up to 10 fractional digits (trailing fractional zeros are suppressed by FM).</li>
                        <li>No extra leading/trailing spaces due to FM (fill mode).</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Context Alignment</strong>
                  <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Input Context:</strong> "Interest Rate" is a business term coming from <code>LOANS_RAW.interest_rate</code> which may be variably formatted (e.g., with percent signs or extra text).</li>
                    <li><strong>Output Context:</strong> The result is the standardized "Interest Rate" as a normalized decimal rate string, making the value consistent regardless of whether the source used percent notation or decimal notation.</li>
                  </ol>
                </div>

                {/* Helpful icons exactly as seen in fourth image */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }} title="Helpful">👍</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }} title="Not helpful">👎</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'History' ? (
        <div className="card glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Audit History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { date: 'May 4, 2025 — 3:22 PM', user: 'system', action: 'DQ evaluation run', detail: '7 rules executed · Overall score: 82% · 3 rules passed', icon: '🔄', color: '#3b82f6' },
              { date: 'May 4, 2025 — 11:05 AM', user: 'john.taylor', action: 'Glossary term added', detail: '"Personal Data", "GDPR" assigned to EMAIL, CUSTOMER_NAME', icon: '🏷️', color: '#8b5cf6' },
              { date: 'May 3, 2025 — 4:48 PM', user: 'system', action: 'Schema snapshot taken', detail: '11 attributes detected · 3,301,800 rows profiled', icon: '📸', color: '#10b981' },
              { date: 'May 3, 2025 — 9:00 AM', user: 'rachel.adams', action: 'Stewardship updated', detail: 'Data Consumer assigned: paul.james, rachel.adams', icon: '👥', color: '#f59e0b' },
              { date: 'May 2, 2025 — 6:15 PM', user: 'system', action: 'DQ rule created', detail: '"Completeness — EMAIL" rule applied to EMAIL column', icon: '🛡️', color: '#3b82f6' },
              { date: 'May 2, 2025 — 6:14 PM', user: 'system', action: 'DQ rule created', detail: '"Uniqueness — CUSTOMER_NAME" rule applied', icon: '🛡️', color: '#3b82f6' },
              { date: 'May 1, 2025 — 2:00 PM', user: 'john.taylor', action: 'Description added', detail: 'AI-generated summary approved and saved', icon: '📝', color: '#8b5cf6' },
              { date: 'Apr 28, 2025 — 10:30 AM', user: 'system', action: 'Table auto-discovered', detail: `Catalog ingestion from ${database}.${schema} via Snowflake connector`, icon: '🔍', color: '#64748b' },
            ].map((event, idx, arr) => (
              <div key={idx} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                {/* Timeline line */}
                {idx < arr.length - 1 && (
                  <div style={{ position: 'absolute', left: '19px', top: '40px', bottom: 0, width: '2px', background: '#f1f5f9', zIndex: 0 }} />
                )}
                {/* Icon */}
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: `${event.color}18`, border: `2px solid ${event.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, zIndex: 1, marginTop: '4px' }}>
                  {event.icon}
                </div>
                {/* Content */}
                <div style={{ paddingBottom: '1.5rem', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{event.action}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{event.date}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{event.detail}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>by <span style={{ color: '#475569', fontWeight: 500 }}>{event.user}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : activeTab === 'Data' ? (
        <div className="card glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Live Data Preview (Sample 100)</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Sampling real records from {platform} · Click headers to sort</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Filter results..." 
                  value={dataFilter}
                  onChange={(e) => setDataFilter(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 32px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    width: '240px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              <button 
                onClick={fetchPreview}
                disabled={isLoadingPreview}
                className="btn-outline" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isLoadingPreview ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                Refresh
              </button>
            </div>
          </div>
          
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            {isLoadingPreview ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <span>Fetching live data from {platform}...</span>
              </div>
            ) : previewRows.length > 0 ? (() => {
              // Filtering logic
              let filtered = [...previewRows];
              if (dataFilter) {
                const lowerFilter = dataFilter.toLowerCase();
                filtered = filtered.filter(row => 
                  Object.values(row).some(val => String(val).toLowerCase().includes(lowerFilter))
                );
              }

              // Sorting logic
              if (sortConfig) {
                filtered.sort((a, b) => {
                  const aVal = a[sortConfig.key];
                  const bVal = b[sortConfig.key];
                  if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                  if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                  return 0;
                });
              }

              const headers = Object.keys(previewRows[0]);

              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {headers.map(h => (
                        <th 
                          key={h} 
                          onClick={() => {
                            setSortConfig({
                              key: h,
                              direction: sortConfig?.key === h && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                            });
                          }}
                          style={{ 
                            textAlign: 'left', 
                            padding: '12px 14px', 
                            color: '#475569', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.5px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            position: 'relative',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {h}
                            {sortConfig?.key === h ? (
                              <span style={{ fontSize: '10px' }}>{sortConfig.direction === 'asc' ? '🔼' : '🔽'}</span>
                            ) : (
                              <span style={{ fontSize: '10px', opacity: 0.2 }}>↕️</span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length > 0 ? filtered.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9', background: ri % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        {headers.map((h, ci) => {
                          const val = row[h];
                          const isNull = val === null || val === 'None' || val === 'NULL';
                          return (
                            <td key={ci} style={{ padding: '10px 14px', color: isNull ? '#ef4444' : '#334155', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {isNull ? 'NULL' : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          No results match your filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              );
            })() : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <span>No data found in {table}.</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>🔒 Data is sampled from the warehouse. Sensitive fields are masked in accordance with governance policies.</span>
          </div>
        </div>

      ) : activeTab === 'Data structure' ? (
        <div className="card glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Schema & Column Structure</h3>
            <span style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '0.75rem', color: '#64748b' }}>Snowflake · TABLE type</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 1fr 100px', gap: '8px', padding: '8px 14px', background: '#f8fafc', borderRadius: '6px 6px 0 0', fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e2e8f0' }}>
              <span>Column Name</span><span>Data Type</span><span>Nullable</span><span>DQ Score</span><span>Business Term</span><span>PII</span>
            </div>
            {dynamicColumns.map((col, idx) => {
              const name = col.name || col.attribute;
              const nameLower = name.toLowerCase();
              const isPii = nameLower.includes('email') || nameLower.includes('phone') || nameLower.includes('name') || nameLower.includes('address') || nameLower.includes('ssn');
              const businessTerm = name.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              const dqScore = 90 + Math.floor(Math.random() * 10); // Random high score for demo
              
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 1fr 100px', gap: '8px', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: col.type?.startsWith('NUMBER') || col.type?.startsWith('INT') ? '#eff6ff' : col.type?.startsWith('TIMESTAMP') || col.type === 'DATE' ? '#f0fdf4' : '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: col.type?.startsWith('NUMBER') || col.type?.startsWith('INT') ? '#2563eb' : col.type?.startsWith('TIMESTAMP') || col.type === 'DATE' ? '#16a34a' : '#7c3aed', flexShrink: 0 }}>
                      {col.type?.startsWith('NUMBER') || col.type?.startsWith('INT') ? '#' : col.type?.startsWith('TIMESTAMP') || col.type === 'DATE' ? 'T' : 'S'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', fontFamily: 'monospace' }}>{name}</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}>{col.type || 'VARCHAR'}</span>
                  <span style={{ fontSize: '0.78rem', color: col.nullable ? '#64748b' : '#16a34a', fontWeight: 500 }}>{col.nullable ? 'YES' : 'NO'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${dqScore}%`, height: '100%', background: dqScore > 85 ? '#10b981' : dqScore > 60 ? '#f59e0b' : '#ef4444', borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, width: '30px' }}>{dqScore}%</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{businessTerm}</span>
                  <span>{isPii ? <span style={{ padding: '2px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>PII</span> : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>}</span>
                </div>
              );
            })}
          </div>
        </div>

      ) : activeTab === 'Relationships' ? (
        <div className="card glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Table Relationships</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Detected foreign key relationships and join paths involving <strong>{table}</strong></p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {dynamicLineage ? (
              [
                ...dynamicLineage.upstreams.filter(u => u.id !== 'SOURCE').map(u => {
                  const edge = dynamicLineage.edges.find(e => e.from === u.id && e.to === dynamicLineage.current.id);
                  const joinKey = edge?.flows?.[0] ? `${edge.flows[0].src} = ${edge.flows[0].tgt}` : 'Shared context';
                  return { direction: 'upstream', table: u.id, schema: schema || 'DEV', joinKey, type: 'Inferred JOIN', confidence: 'High', color: '#3b82f6' };
                }),
                ...dynamicLineage.downstream.map(d => {
                  const edge = dynamicLineage.edges.find(e => e.from === dynamicLineage.current.id && e.to === d.node.id);
                  const joinKey = edge?.flows?.[0] ? `${edge.flows[0].src} = ${edge.flows[0].tgt}` : 'Shared context';
                  return { direction: 'downstream', table: d.node.id, schema: schema || 'DEV', joinKey, type: 'Inferred JOIN', confidence: 'High', color: '#10b981' };
                })
              ].map((rel, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', transition: 'box-shadow 0.2s' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${rel.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                    {rel.direction === 'upstream' ? '⬆️' : rel.direction === 'downstream' ? '⬇️' : '↔️'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', fontFamily: 'monospace' }}>{rel.table}</span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{rel.schema}</span>
                      <span style={{ padding: '1px 7px', background: `${rel.color}15`, color: rel.color, border: `1px solid ${rel.color}40`, borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{rel.direction}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px', fontFamily: 'monospace' }}>
                      <span style={{ color: '#94a3b8' }}>{rel.type}: </span>{rel.joinKey}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: rel.confidence === 'High' ? '#16a34a' : '#d97706', padding: '2px 8px', background: rel.confidence === 'High' ? '#f0fdf4' : '#fffbeb', borderRadius: '10px', border: `1px solid ${rel.confidence === 'High' ? '#bbf7d0' : '#fde68a'}` }}>{rel.confidence} confidence</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <span>Analyzing relationships...</span>
              </div>
            )}
          </div>
        </div>

      ) : activeTab === 'Data Transformations' ? (
        <div className="card glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Data Transformations</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>SQL pipelines that produce or consume <strong>{table}</strong></p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {dynamicLineage ? (
              [
                ...dynamicLineage.upstreams.filter(u => u.id !== 'SOURCE').map(u => ({
                  direction: 'Producer', icon: '⬇️', app: 'Snowflake SQL', procedure: '—', lastRun: '2025-10-28 15:10:47', execCount: 12, rows: '3,301,800', duration: '1,458 ms',
                  sql: `INSERT INTO ${database}.${schema}.${table}\nSELECT\n  *\nFROM ${database}.${schema}.${u.id};`
                })),
                ...dynamicLineage.downstream.map(d => ({
                  direction: 'Consumer', icon: '⬆️', app: 'Snowflake SQL', procedure: '—', lastRun: '2025-10-29 06:00:00', execCount: 30, rows: '1,245,600', duration: '823 ms',
                  sql: `INSERT INTO ${database}.${schema}.${d.node.id}\nSELECT\n  *\nFROM ${database}.${schema}.${table};`
                }))
              ].map((t, idx) => {
                // Generate semi-random but deterministic stats based on the table name
                const seed = (t.sql.length + idx) % 10;
                const rows = (500000 + (seed * 123456)).toLocaleString();
                const duration = (400 + (seed * 85)).toLocaleString();
                const executions = 10 + seed;
                const lastRunDate = new Date();
                lastRunDate.setHours(lastRunDate.getHours() - (seed * 2));
                const lastRunStr = lastRunDate.toISOString().replace('T', ' ').split('.')[0];

                return (
                  <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ padding: '14px 18px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{t.direction} Pipeline</span>
                          <span style={{ padding: '1px 8px', background: t.direction === 'Producer' ? '#eff6ff' : '#f0fdf4', color: t.direction === 'Producer' ? '#2563eb' : '#16a34a', border: `1px solid ${t.direction === 'Producer' ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600 }}>{t.app}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '16px' }}>
                          <span>Last run: {lastRunStr}</span>
                          <span>Executions: {executions}</span>
                          <span>Rows: {rows}</span>
                          <span>Duration: {duration} ms</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '14px 18px', background: '#1e293b', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e2e8f0', whiteSpace: 'pre', overflowX: 'auto', lineHeight: 1.6 }}>
                      {t.sql}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <span>Extracting transformation SQL...</span>
              </div>
            )}
          </div>
        </div>

      ) : (
        <div className="detail-content">
          {/* Left Column */}
          <div className="content-left">
            {/* Data Trust Index */}
            <div className="card glass-panel">
              <div className="card-header-main">
                <div className="header-title">
                  <h3>Data trust index</h3>
                  <span className="trust-status limited">
                    <AlertCircle size={14} />
                    {overallScore > 80 ? 'Excellent' : overallScore > 50 ? 'Limited' : 'Poor'} {overallScore}
                  </span>
                </div>
                <ChevronUp size={18} className="collapse-icon" />
              </div>
              <div className="trust-metrics">
                <div className="metric-group">
                  <div className="metric-row">
                    <span>Overall score</span>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${trustIndex}%`, background: trustIndex > 80 ? 'var(--success)' : trustIndex > 50 ? '#fbbf24' : '#ef4444' }}></div>
                    </div>
                    <span className="score-val">{trustIndex}</span>
                  </div>
                </div>

                <div className="metric-group">
                  <div className="metric-row">
                    <span>Data quality</span>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${qualityBase}%`, background: qualityBase > 80 ? 'var(--success)' : '#64748b' }}></div>
                    </div>
                    <span className="score-val">{qualityBase}</span>
                  </div>
                  <Link to={`/catalog/${database}/${schema}/${table}/dq/primary`} className="dq-link">
                    <div className="metric-sub-row">Primary DQ monitor</div>
                  </Link>
                </div>

                <div className="metric-group">
                  <div className="metric-row">
                    <span>Data freshness</span>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${freshnessScore}%`, background: '#3b82f6' }}></div>
                    </div>
                    <span className="score-val">{freshnessScore}</span>
                  </div>
                  <div className="metric-sub-row">Real-time sync enabled</div>
                </div>

                <div className="metric-group">
                  <div className="metric-row">
                    <span>Governance</span>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${governanceScore}%`, background: '#8b5cf6' }}></div>
                    </div>
                    <span className="score-val">{governanceScore}</span>
                  </div>
                  <div className="metric-sub-item">
                    <span>Description status</span>
                    <div className="status-val">
                      {hasSavedDescription ? <ShieldCheck size={12} style={{ color: 'var(--success)' }} /> : <X size={12} style={{ color: 'var(--error)' }} />}
                      <span>{hasSavedDescription ? 'Available' : 'Missing'}</span>
                    </div>
                  </div>
                  <div className="metric-sub-item">
                    <span>Business terms</span>
                    <div className="status-val">
                      {selectedTerms.length > 0 ? <ShieldCheck size={12} style={{ color: 'var(--success)' }} /> : <X size={12} style={{ color: 'var(--error)' }} />}
                      <span>{selectedTerms.length} assigned</span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="card-footer-text">The trust index is a weighted score of Quality (40%), Freshness (20%), and Governance (40%).</p>
            </div>

            {/* DQ Monitors */}
            <div className="card glass-panel">
              <div className="card-header-with-btn">
                <h3>DQ Monitors</h3>
                <button className="btn-outline">Create</button>
              </div>
              <div className="dq-table">
                <div className="dq-row header">
                  <span>Name</span>
                  <span>Overall DQ</span>
                  <span>Last run</span>
                </div>
                <div className="dq-row">
                  <Link to={`/catalog/${database}/${schema}/${table}/dq/primary`} className="dq-link">
                    <span className="dq-name clickable">Primary</span>
                  </Link>
                  <div className="dq-progress">
                    <div className="dq-bar" style={{ width: `${qualityBase}%` }}></div>
                    <span>{qualityBase}%</span>
                  </div>
                  <span className="dq-date">October 21, 2025, 7:52:42 PM</span>
                </div>
              </div>
            </div>


            {/* Attributes */}
            <div className="card glass-panel">
              <div className="card-header-with-btn">
                <h3>Attributes</h3>
                <button className="btn-outline">Add Attribute</button>
              </div>
              <div className="attributes-list">
                {attributes.map((attr, idx) => (
                  <div key={idx} className="attr-row">
                    <div className="attr-type">
                      {attr.type === 'number' ? <Hash size={14} /> : attr.type === 'timestamp' ? <Clock size={14} /> : <Type size={14} />}
                    </div>
                    <span className="attr-name">{attr.name}</span>
                    <div className="attr-tags">
                      {attr.tag && <span className="attr-tag">{attr.tag}</span>}
                      {attr.tags?.map((t: string, ti: number) => <span key={ti} className="attr-tag">{t}</span>)}
                      {(attr as any).more && <span className="attr-tag more">{(attr as any).more}</span>}
                      {appliedRules.filter((r: any) => r.attribute === attr.name && !deletedRules.includes(r.name)).map((rule: any, ri: number) => {
                        const isShut = shutDownRules.includes(rule.name);
                        const isHovered = hoveredRule === rule.name;
                        const hoverDetails = getRuleHoverDetails(rule.name);

                        return (
                          <span 
                            key={ri} 
                            onMouseEnter={() => setHoveredRule(rule.name)}
                            onMouseLeave={() => setHoveredRule(null)}
                            onClick={() => setSelectedRuleForPanel(rule.name)}
                            style={{
                              cursor: 'pointer',
                              background: isShut ? 'rgba(255, 255, 255, 0.03)' : 'rgba(192, 132, 252, 0.12)',
                              border: '1px solid rgba(192, 132, 252, 0.25)',
                              borderRadius: '4px',
                              padding: 0,
                              fontSize: '0.75rem',
                              color: isShut ? '#64748b' : '#c084fc',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              opacity: isShut ? 0.4 : 1,
                              position: 'relative'
                            }}
                          >
                            {/* Hover Tooltip Card */}
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
                              padding: '2px 6px', 
                              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                              textDecoration: isShut ? 'line-through' : 'none'
                            }}>
                              {rule.name} {hasEvaluated && '✓'}
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isShut) {
                                  setShutDownRules(shutDownRules.filter(r => r !== rule.name));
                                } else {
                                  setShutDownRules([...shutDownRules, rule.name]);
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                color: isShut ? '#f43f5e' : '#94a3b8',
                                padding: '2px 4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title={isShut ? "Turn On" : "Turn Off"}
                            >
                              <Power size={11} />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletedRules([...deletedRules, rule.name]);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                padding: '2px 4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Delete"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <MoreVertical size={16} className="attr-more" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="content-right">
            {/* Summary */}
            <div className="card glass-panel">
              <h3>Summary</h3>
              <div className="summary-item">
                <span className="summary-label">Description</span>

                {isEditing ? (
                  <div className="edit-summary-container">
                    <textarea
                      className="summary-textarea"
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                      placeholder="Enter table description..."
                    />
                    <div className="edit-actions">
                      <button className="btn-small save" onClick={handleSave}><Save size={12} /> Save</button>
                      <button className="btn-small cancel" onClick={handleCancel}><X size={12} /> Cancel</button>
                    </div>
                  </div>
                ) : isRegenerating ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.1rem', animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>✨</span>
                      <span style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: 600 }}>AI is generating a description…</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[100, 80, 60].map((w, i) => (
                        <div key={i} style={{ height: '10px', background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)', backgroundSize: '200% 100%', borderRadius: '6px', width: `${w}%`, animation: 'shimmer 1.5s infinite' }} />
                      ))}
                    </div>
                  </div>
                ) : summary ? (
                  <div className="summary-display">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8rem', padding: '2px 8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff', borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>✨ AI</span>
                      <p className="summary-text" style={{ margin: 0, lineHeight: 1.65, color: '#334155', fontSize: '0.85rem' }}>{summary}</p>
                    </div>
                    <div className="summary-actions">
                      <button className="btn-small" onClick={() => setIsEditing(true)}><Edit3 size={12} /> Edit</button>
                      <button className="btn-small" onClick={handleRegenerate} disabled={isRegenerating}>
                        <RotateCw size={12} /> Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0 10px 0', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)' }}>✨</div>
                    <div>
                      <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>No description yet</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Let AI analyse this table and generate a contextual description</p>
                    </div>
                    <button
                      onClick={handleRegenerate}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                    >
                      ✨ Generate AI Description
                    </button>
                    <button className="btn-small" onClick={() => setIsEditing(true)} style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      <Edit3 size={11} /> Write manually
                    </button>
                  </div>
                )}
              </div>
              <div className="summary-item">
                <span className="summary-label">Location</span>
                <div className="location-info">
                  <div className="location-row">
                     <Database size={12} /> 
                     <span>Analytical Data Warehouse (Snowflake)</span>
                  </div>
                  <div className="location-row sub">
                     <Grid size={12} /> 
                     <span>{database} <ChevronRight size={10} /> {schema} <ChevronRight size={10} /> {table}</span>
                  </div>
                </div>
              </div>
              <div className="summary-item">
                <span className="summary-label">Origin</span>
                <div className="origin-info">
                  <span>DWH: Core System</span>
                  <span className="pushdown-tag"><ShieldCheck size={12} /> Pushdown</span>
                </div>
              </div>
              <div className="summary-item">
                <span className="summary-label">Table type</span>
                <span>TABLE</span>
              </div>
            </div>

            {/* Glossary Terms */}
            <div className="card glass-panel glossary-card">
              <h3>Glossary terms</h3>
              
              <div className="glossary-selected">
                {selectedTerms.map(term => (
                  <span key={term} className="term-tag interactive" onClick={() => toggleTerm(term)}>
                    {term} <X size={10} />
                  </span>
                ))}
              </div>

              <div className="glossary-add-container" ref={glossaryRef}>
                <button className="btn-small add-term-btn" onClick={() => setIsGlossaryOpen(!isGlossaryOpen)}>
                  <Plus size={12} /> Add Term
                </button>
                
                {isGlossaryOpen && (
                  <div className="glossary-dropdown glass-panel">
                    <div className="glossary-search">
                      <Search size={14} />
                      <input 
                        type="text" 
                        placeholder="Search terms..." 
                        value={glossarySearch}
                        onChange={(e) => setGlossarySearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="glossary-options">
                      {GLOSSARY_OPTIONS.filter(o => o.toLowerCase().includes(glossarySearch.toLowerCase())).map(opt => (
                        <label key={opt} className="glossary-option">
                          <input 
                            type="checkbox" 
                            checked={selectedTerms.includes(opt)}
                            onChange={() => toggleTerm(opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stewardship */}
            <div className="card glass-panel">
              <div className="card-header-with-btn">
                <h3>Stewardship</h3>
                <button className="btn-outline-small">Edit</button>
              </div>
              <div className="steward-section">
                <span className="steward-label">Owner</span>
                <div className="steward-value"><Users size={14} /> Data Office</div>
              </div>
              <div className="steward-section">
                <span className="steward-label">Data Owner</span>
                <div className="steward-value user"><Info size={14} /> john.taylor</div>
              </div>
              <div className="steward-section">
                <span className="steward-label">Data Steward</span>
                <div className="steward-value">-</div>
              </div>
              <div className="steward-section">
                <span className="steward-label">Data Consumer</span>
                <div className="steward-users">
                  <div className="steward-value user"><Info size={14} /> paul.james</div>
                  <div className="steward-value user"><Info size={14} /> rachel.adams</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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

          {/* Tab Navigation */}
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
                      <AlertCircle size={16} />
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
                        ✨ Ask AI
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
                          <span style={{ color: '#64748b' }}>📖</span> ISO_CODES_COUNTRIES_SI...
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

// Internal icon components to match lucide interface
const ChevronDown = ({ size, className }: any) => <ChevronRight size={size} className={className} style={{ transform: 'rotate(90deg)' }} />;
const ChevronUp = ({ size, className }: any) => <ChevronRight size={size} className={className} style={{ transform: 'rotate(-90deg)' }} />;

export default TableDetail;

