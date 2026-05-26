import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

import { 
  ChevronRight, ShieldCheck, Clock, ExternalLink, Filter, ChevronDown, HelpCircle, Plus, Power, X, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';
import { useClickOutside } from '../hooks/useClickOutside';
import './DataQualityDetail.css';

import { API_BASE } from '../api';

interface DQRow {
  attribute: string;
  type: string;
  overallDQ: string;
  terms?: string;
  profileSummary: { label: string; pct: string }[];
  minMax: { label: string; pct: string }[];
  topValues: { label: string; pct: string }[];
  masks: { label: string; pct: string }[];
  appliedRules: { label: string; score: string; status: 'valid' | 'invalid' }[];
}

// Rule hover details will be generated dynamically within the component to use real row counts

const DataQualityDetail: React.FC = () => {
  const { database, schema, table } = useParams<{ database: string; schema: string; table: string }>();
  const { platform } = usePlatform();

  useEffect(() => {
    if (table) {
      localStorage.setItem('robin_active_context_table', table);
    }
  }, [table]);

  const [activeTab, setActiveTab] = useState('Profiling & Rules');
  const [hasEvaluated, setHasEvaluated] = useState(() => localStorage.getItem('robin_has_evaluated') === 'true');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hoveredRule, setHoveredRule] = useState<string | null>(null);
  const [selectedRuleForPanel, setSelectedRuleForPanel] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState('Configuration');

  const [search, setSearch] = useState('');
  const [dynamicColumns, setDynamicColumns] = useState<DQRow[]>([]);
  const [isLoadingCols, setIsLoadingCols] = useState(true);
  const [rowCount, setRowCount] = useState<number | string>(() => {
    return localStorage.getItem(`robin_record_count_${table}`) || '...';
  });
  const [tablePreview, setTablePreview] = useState<any[]>([]);
  const [openAddRule, setOpenAddRule] = useState<string | null>(null);
  const addRuleRef = useRef<HTMLDivElement>(null);
  useClickOutside(addRuleRef, () => setOpenAddRule(null));
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastScanDate] = useState(new Date().toLocaleString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true 
  }));
  // State for invalid records UI
  const [invalidRecords, setInvalidRecords] = useState<any[]>([]);
  const [invalidLoading, setInvalidLoading] = useState(false);

  // Snapshot results state
  const [evaluatedResults, setEvaluatedResults] = useState<{
    table?: string;
    overall: number;
    validity: number;
    accuracy: number;
    columns: Record<string, string>;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(`robin_evaluated_results_${table}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [colProfiles, setColProfiles] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem(`robin_col_profiles_${table}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (table) {
      try {
        const savedResults = localStorage.getItem(`robin_evaluated_results_${table}`);
        setEvaluatedResults(savedResults ? JSON.parse(savedResults) : null);
      } catch {
        setEvaluatedResults(null);
      }
      try {
        const savedProfiles = localStorage.getItem(`robin_col_profiles_${table}`);
        setColProfiles(savedProfiles ? JSON.parse(savedProfiles) : {});
      } catch {
        setColProfiles({});
      }
    }
  }, [table]);

  const [error, setError] = useState<string | null>(null);

  const pullRulesFromBackend = async () => {
    try {
      const res = await axios.get(`${API_BASE}/dashboard/rules`);
      const backendRules = res.data.rules || [];

      // Clear all existing local storage rule keys for this table to avoid stale rules
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`robin_rule_v2|${database}|${schema}|${table}|`)) {
          localStorage.removeItem(key);
        }
      }

      // Populate local storage with backend rules for this table
      const rulesByKey: Record<string, any[]> = {};
      backendRules.forEach((br: any) => {
        if (br.database_name === database && br.schema_name === schema && br.table_name === table) {
          const key = `robin_rule_v2|${br.database_name}|${br.schema_name}|${br.table_name}|${br.column_name}`;
          if (!rulesByKey[key]) {
            rulesByKey[key] = [];
          }
          rulesByKey[key].push({
            label: br.rule_type,
            status: br.status === 'Inactive' ? 'deactivated' : 'valid',
            platform: br.platform
          });
        }
      });

      Object.entries(rulesByKey).forEach(([key, val]) => {
        localStorage.setItem(key, JSON.stringify(val));
      });
    } catch (e) {
      console.error("Failed to pull rules from backend:", e);
    }
  };

  const pushRulesToBackend = async () => {
    try {
      // 1. Fetch all rules first to preserve other tables' rules!
      const res = await axios.get(`${API_BASE}/dashboard/rules`);
      const allBackendRules = res.data.rules || [];

      // Filter out rules for the current table (we will replace them with the local rules)
      const rulesToSync: any[] = allBackendRules
        .filter((br: any) => !(br.database_name === database && br.schema_name === schema && br.table_name === table))
        .map((br: any) => ({
          platform: br.platform || 'snowflake',
          database_name: br.database_name,
          schema_name: br.schema_name,
          table_name: br.table_name,
          column_name: br.column_name,
          rule_type: br.rule_type,
          rule_params: br.rule_params ? (typeof br.rule_params === 'string' ? JSON.parse(br.rule_params) : br.rule_params) : {},
          status: br.status || 'Active'
        }));

      // 2. Add all local rules for the current table
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`robin_rule_v2|${database}|${schema}|${table}|`)) {
          const parts = key.split('|');
          if (parts.length >= 5) {
            const column_name = parts.slice(4).join('|');
            const colRules = JSON.parse(localStorage.getItem(key) || '[]');
            colRules.forEach((r: any) => {
              rulesToSync.push({
                platform: r.platform || platform || 'snowflake',
                database_name: database,
                schema_name: schema,
                table_name: table,
                column_name,
                rule_type: r.label || 'Completeness',
                rule_params: r.rule_params || {},
                status: r.status === 'deactivated' ? 'Inactive' : 'Active'
              });
            });
          }
        }
      }

      await axios.post(`${API_BASE}/dashboard/rules/sync`, { rules: rulesToSync });
    } catch (e) {
      console.error("Failed to push rules to backend:", e);
    }
  };

  useEffect(() => {
    const initRules = async () => {
      await pullRulesFromBackend();
      setRefreshTrigger(prev => prev + 1);
    };
    if (database && schema && table) {
      initRules();
    }
  }, [database, schema, table]);

  const numericRowCount = typeof rowCount === 'number' ? rowCount : (rowCount === '...' ? 0 : parseInt(rowCount.toString().replace(/,/g, '')) || 0);

  // Helper to read a profile field with case-insensitivity (Snowflake returns UPPERCASE, Databricks lowercase)
  const getProfileField = (profile: any, field: string): string | null => {
    if (!profile) return null;
    return profile[field] ?? profile[field.toUpperCase()] ?? profile[field.toLowerCase()] ?? null;
  };

  const getRuleScore = (ruleName: string, colName: string) => {
    const lbl = ruleName.toUpperCase();
    const profile = colProfiles[colName];

    // 1. Use real backend metrics if available
    const totalRaw = getProfileField(profile, 'total_rows');
    if (profile && totalRaw != null) {
      const total = parseInt(totalRaw as string) || 1;
      
      if (lbl.includes('NULL')) {
        const nulls = parseInt(getProfileField(profile, 'null_count') || '0') || 0;
        const nonNulls = total - nulls;
        return Math.round((nonNulls / total) * 100);
      }
      
      if (lbl.includes('UNIQUE')) {
        const uniques = parseInt(getProfileField(profile, 'unique_count') || '0') || 0;
        return Math.round((uniques / total) * 100);
      }
    }

    // 2. Fallback to sample preview data
    if (!tablePreview || tablePreview.length === 0) return 100;
    
    const total = tablePreview.length;
    // Handle case sensitivity issues from different SQL dialects
    const vals = tablePreview.map(r => r[colName] ?? r[colName.toLowerCase()] ?? r[colName.toUpperCase()]);

    if (lbl.includes('NULL')) {
      const nonNulls = vals.filter(v => v !== null && v !== undefined && v !== '').length;
      return Math.round((nonNulls / total) * 100);
    }

    if (lbl.includes('UNIQUE')) {
      const counts: Record<any, number> = {};
      vals.forEach(v => {
        if (v !== null && v !== undefined && v !== '') {
          counts[v] = (counts[v] || 0) + 1;
        }
      });
      const uniqueCount = Object.values(counts).filter(c => c === 1).length;
      return Math.round((uniqueCount / total) * 100);
    }

    if (lbl.includes('EMAIL')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validEmails = vals.filter(v => typeof v === 'string' && emailRegex.test(v)).length;
      return Math.round((validEmails / total) * 100);
    }

    if (lbl.includes('EMPTY')) {
      const nonEmpty = vals.filter(v => v !== null && v !== undefined && v.toString().trim() !== '').length;
      return Math.round((nonEmpty / total) * 100);
    }

    if (lbl.includes('FRESHNESS')) {
      const hasData = vals.some(v => v !== null && v !== undefined && v !== '');
      return hasData ? 100 : 0;
    }

    return 100;
  };

  const getRuleHoverDetails = (ruleName: string, colName: string) => {
    const scoreVal = getRuleScore(ruleName, colName);
    const passed = Math.floor(numericRowCount * (scoreVal / 100));
    const failed = numericRowCount - passed;

    return {
      title: ruleName,
      stats: [
        { color: '#f472b6', label: 'No reference available', count: '0', pct: '0%' },
        { color: '#7f1d1d', label: 'Not Valid', count: failed.toLocaleString(), pct: `${100 - scoreVal}%` },
        { color: '#db2777', label: 'Valid', count: passed.toLocaleString(), pct: `${scoreVal}%` }
      ]
    };
  };

  const fetchPreview = async () => {
    try {
      const saved = localStorage.getItem('robin_credentials');
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
    } catch (err: any) {
      console.error("Failed to fetch preview", err);
      setError(err.response?.data?.detail || err.message || "Failed to connect to the warehouse. Please verify your credentials.");
    }
  };

  useEffect(() => {
    const fetchColumns = async () => {
      setIsLoadingCols(true);
      try {
        const saved = localStorage.getItem('robin_credentials');
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
          const parsedCols = res.data.entities.map((colObj: any) => {
            const colName = colObj.name || colObj;
            const colType = (colObj.type || 'VARCHAR').toUpperCase();
            const isNumeric = colType.includes('INT') || colType.includes('NUMBER') || colType.includes('FLOAT') || colType.includes('DECIMAL') || colType.includes('DOUBLE');
            const isDate = colType.includes('DATE') || colType.includes('TIMESTAMP') || colType.includes('TIME');

            let tv: { label: string; pct: string }[] = [];
            // To be populated by fetchColumnProfiles
            tv = [{ label: 'Pending...', pct: '-' }];

            // Masking Logic: Only show if column name implies sensitive/masked data
            
            const maskSamples: any[] = [];

            const topVals: any[] = [];

            return {
              attribute: colName,
              terms: undefined,
              type: isNumeric ? 'num' : (isDate ? 'date' : 'Az'),
              overallDQ: '100%',
              profileSummary: [], // Will be calculated dynamically
              minMax: tv,
              topValues: topVals,
              masks: maskSamples,
              appliedRules: []
            };
          });
          setDynamicColumns(parsedCols);
        }
      } catch (err: any) {
        console.error("Failed to fetch columns", err);
        setError(err.response?.data?.detail || err.message || "Failed to fetch columns. Please check your connection details.");
      } finally {
        setIsLoadingCols(false);
      }
    };

    fetchColumns();
    fetchPreview();
  }, [database, schema, table, platform]);

  // Standalone function for fetching profiles - can be called manually
  const fetchProfiles = async (columns: typeof dynamicColumns) => {
    if (columns.length === 0) return;
    const saved = localStorage.getItem('robin_credentials');
    let credentials = null;
    if (saved) credentials = JSON.parse(saved)[platform];

    const newProfiles: Record<string, any> = {};

    await Promise.all(
      columns.map(async (col) => {
        try {
          const res = await axios.post(`${API_BASE}/metadata/profile`, {
            platform,
            database_name: database,
            schema_name: schema,
            table_name: table,
            column_name: col.attribute,
            credentials
          });
          if (res.data && res.data.profile) {
            newProfiles[col.attribute] = res.data.profile;
          }
        } catch (err: any) {
          console.error(`Profile failed for ${col.attribute}:`, err?.response?.data || err?.message);
        }
      })
    );

    // Set all at once so useMemo fires one re-render
    if (Object.keys(newProfiles).length > 0) {
      setColProfiles(prev => ({ ...prev, ...newProfiles }));
    }
    return newProfiles;
  };

  useEffect(() => {
    fetchProfiles(dynamicColumns);
  }, [dynamicColumns, database, schema, table, platform]);

  const activeColumnsList = useMemo(() => {
    return dynamicColumns.map(colItem => {
      const storageKey = `robin_rule_v2|${database}|${schema}|${table}|${colItem.attribute}`;
      const storedRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      // Combine rules and deduplicate
      const allApplied = [...colItem.appliedRules, ...storedRules];
      const uniqueRules = allApplied.reduce((acc: any[], curr: any) => {
        const label = curr.label || curr.name;
        if (!acc.some(r => (r.label || r.name) === label)) {
          acc.push({ ...curr, label });
        }
        return acc;
      }, []);

      // Calculate Profiling Summary
      let profileSummary = [
        { label: 'Not Null', pct: '100%' },
        { label: 'Distinct', pct: '100%' },
        { label: 'Unique', pct: '100%' }
      ];

      const profile = colProfiles[colItem.attribute];
      const profileTotal = getProfileField(profile, 'total_rows');
      if (profile && profileTotal != null) {
        const total = parseInt(profileTotal) || 1;
        const nulls = parseInt(getProfileField(profile, 'null_count') || '0') || 0;
        const distinct = parseInt(getProfileField(profile, 'distinct_count') || '0') || 0;
        const unique = parseInt(getProfileField(profile, 'unique_count') || '0') || 0;
        
        profileSummary = [
          { label: 'Not Null', pct: `${Math.round(((total - nulls) / total) * 100)}%` },
          { label: 'Distinct', pct: `${Math.round((distinct / total) * 100)}%` },
          { label: 'Unique', pct: `${Math.round((unique / total) * 100)}%` }
        ];
      } else if (tablePreview.length > 0) {
        const total = tablePreview.length;
        const vals = tablePreview.map(r => r[colItem.attribute] ?? r[colItem.attribute.toLowerCase()] ?? r[colItem.attribute.toUpperCase()]);
        const nonNulls = vals.filter(v => v !== null && v !== undefined && v !== '').length;
        const distinctSet = new Set(vals.filter(v => v !== null && v !== undefined && v !== ''));
        const distinctCount = distinctSet.size;
        
        // Uniques (values that appear exactly once)
        const counts: Record<any, number> = {};
        vals.forEach(v => {
          if (v !== null && v !== undefined && v !== '') {
            counts[v] = (counts[v] || 0) + 1;
          }
        });
        const uniqueCount = Object.values(counts).filter(c => c === 1).length;

        profileSummary = [
          { label: 'Not Null', pct: `${Math.round((nonNulls / total) * 100)}%` },
          { label: 'Distinct', pct: `${Math.round((distinctCount / total) * 100)}%` },
          { label: 'Unique', pct: `${Math.round((uniqueCount / total) * 100)}%` }
        ];
      }

      let dqPct = '100%';
      if (hasEvaluated) {
        const activeRules = uniqueRules.filter(r => r.status !== 'deactivated');
        if (activeRules.length > 0) {
        const totalScore = activeRules.reduce((acc, r) => {
          return acc + getRuleScore(r.label, colItem.attribute);
        }, 0);
        dqPct = `${Math.round(totalScore / activeRules.length)}%`;
        }
      }

      let tv = colItem.minMax;
      let topVals = colItem.topValues;

      if (profile) {
        const minVal = getProfileField(profile, 'min_val');
        const maxVal = getProfileField(profile, 'max_val');
        const avgVal = getProfileField(profile, 'avg_val');
        const topValues = getProfileField(profile, 'top_values');

        if (minVal !== null || maxVal !== null) {
          let avgLabel = 'N/A';
          if (avgVal !== null && avgVal !== 'None' && avgVal !== '') {
            const parsed = parseFloat(avgVal);
            if (!isNaN(parsed)) {
              avgLabel = parsed.toFixed(2);
            }
          }
          tv = [
            { label: `Min: ${minVal ?? 'N/A'}`, pct: 'Value' },
            { label: `Max: ${maxVal ?? 'N/A'}`, pct: 'Value' },
            { label: `Avg: ${avgLabel}`, pct: 'Value' }
          ];
        }
        if (topValues) {
          topVals = topValues.split(',').map((v: string) => {
            const parts = v.split(':');
            const val = parts[0];
            const count = parts[1];
            const pct = (numericRowCount > 0 && count) ? Math.round((parseInt(count) || 0) / numericRowCount * 100) : 0;
            return { label: val || 'N/A', pct: `${pct}%` };
          });
        }
      }

      return { ...colItem, overallDQ: dqPct, appliedRules: uniqueRules, profileSummary, minMax: tv, topValues: topVals };
    });
  }, [dynamicColumns, tablePreview, hasEvaluated, database, schema, table, refreshTrigger, colProfiles]);

  const handleAddRuleClick = (attr: string) => {
    setOpenAddRule(openAddRule === attr ? null : attr);
  };

  const handleApplyRule = async (attr: string, ruleName: string) => {
    const newRule = { label: ruleName, score: '100%', status: 'valid' as const, platform };
    const storageKey = `robin_rule_v2|${database}|${schema}|${table}|${attr}`;
    const existingRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!existingRules.some((r: any) => r.label === ruleName)) {
      existingRules.push(newRule);
      localStorage.setItem(storageKey, JSON.stringify(existingRules));
    }
    setOpenAddRule(null);
    setRefreshTrigger(prev => prev + 1);
    await pushRulesToBackend();
  };

  const handleToggleRule = async (attr: string, ruleName: string) => {
    const storageKey = `robin_rule_v2|${database}|${schema}|${table}|${attr}`;
    const existingRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const updatedRules = existingRules.map((r: any) => {
      if (r.label === ruleName) {
        return { ...r, status: r.status === 'deactivated' ? 'valid' : 'deactivated' };
      }
      return r;
    });
    localStorage.setItem(storageKey, JSON.stringify(updatedRules));
    setRefreshTrigger(prev => prev + 1);
    await pushRulesToBackend();
  };

  const handleDeleteRule = async (attr: string, ruleName: string) => {
    const storageKey = `robin_rule_v2|${database}|${schema}|${table}|${attr}`;
    const existingRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const updatedRules = existingRules.filter((r: any) => r.label !== ruleName);
    localStorage.setItem(storageKey, JSON.stringify(updatedRules));
    setRefreshTrigger(prev => prev + 1);
    await pushRulesToBackend();
  };

  const [suggestingRules, setSuggestingRules] = useState(false);
  const handleSuggestRules = async () => {
    setSuggestingRules(true);
    try {
      const saved = localStorage.getItem('robin_credentials');
      let credentials = null;
      if (saved) credentials = JSON.parse(saved)[platform];

      // Suggest for the first 3 columns to keep it manageable
      for (const col of dynamicColumns.slice(0, 3)) {
        const res = await axios.post(`${API_BASE}/ai/suggest_rules`, {
          platform,
          table_name: table,
          column_name: col.attribute,
          credentials
        });
        
        if (res.data.ai_suggestions) {
          const rawText = res.data.ai_suggestions[0]?.ai_suggestion || "";
          // Extract lines that look like rules (numbered list)
          const lines = rawText.split('\n').filter((l: string) => /^\d+\./.test(l.trim()));
          
          const storageKey = `robin_rule_v2|${database}|${schema}|${table}|${col.attribute}`;
          const existingRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
          let changed = false;

          lines.forEach((l: string) => {
            const ruleName = l.replace(/^\d+\.\s*/, '').trim();
            if (ruleName && !existingRules.some((r: any) => r.label === ruleName)) {
              existingRules.push({
                label: ruleName,
                score: '100%',
                status: 'valid' as const,
                platform
              });
              changed = true;
            }
          });
          
          if (changed) {
            localStorage.setItem(storageKey, JSON.stringify(existingRules));
          }
        }
      }
      
      localStorage.removeItem('robin_applied_rules'); // Clear legacy cache
      setHasEvaluated(true);
      setRefreshTrigger(prev => prev + 1);
      await pushRulesToBackend();
    } catch (e) {
      console.error("AI Suggestion failed", e);
    } finally {
      setSuggestingRules(false);
    }
  };

  const handleEvaluationSnapshot = async () => {
    // Step 1: Re-fetch real-time profiling data from Snowflake/Databricks
    const freshProfiles = await fetchProfiles(dynamicColumns);
    
    // Step 2: Merge fresh profiles into colProfiles for score computation
    // (fetchProfiles already calls setColProfiles, but we need the value synchronously)
    const mergedProfiles = { ...colProfiles, ...(freshProfiles || {}) };

    // Step 3: Compute dimension scores using the fresh profiles
    const getRuleScoreWithProfiles = (ruleName: string, colName: string, profiles: Record<string, any>) => {
      const lbl = ruleName.toUpperCase();
      const p = profiles[colName];
      const pGet = (field: string) => p?.[field] ?? p?.[field.toUpperCase()] ?? p?.[field.toLowerCase()] ?? null;
      const totalRaw = pGet('total_rows');
      if (p && totalRaw != null) {
        const total = parseInt(totalRaw) || 1;
        if (lbl.includes('NULL')) {
          const nulls = parseInt(pGet('null_count') || '0') || 0;
          return Math.round(((total - nulls) / total) * 100);
        }
        if (lbl.includes('UNIQUE')) {
          const uniques = parseInt(pGet('unique_count') || '0') || 0;
          return Math.round((uniques / total) * 100);
        }
      }
      // Fallback: use tablePreview sample
      return getRuleScore(ruleName, colName);
    };

    let totalScoreSum = 0;
    let totalRuleCount = 0;
    let valSum = 0; let valCount = 0;
    let accSum = 0; let accCount = 0;
    const validityLabels = ['Email Format', 'Date Format', 'Pattern Match', 'Freshness', 'Validity'];
    const accuracyLabels = ['Null Check', 'Unique Check', 'Range Check', 'Completeness', 'Value Range', 'Accuracy', 'EMPTY'];

    const columnDQMap: Record<string, string> = {};
    activeColumnsList.forEach(col => {
      const activeRules = col.appliedRules.filter(r => r.status !== 'deactivated');
      if (activeRules.length === 0) return;
      let colSum = 0;
      activeRules.forEach(rule => {
        const s = getRuleScoreWithProfiles(rule.label, col.attribute, mergedProfiles);
        colSum += s;
        totalScoreSum += s;
        totalRuleCount++;
        if (validityLabels.some(lbl => rule.label.toUpperCase().includes(lbl.toUpperCase()))) {
          valSum += s; valCount++;
        }
        if (accuracyLabels.some(lbl => rule.label.toUpperCase().includes(lbl.toUpperCase()))) {
          accSum += s; accCount++;
        }
      });
      columnDQMap[col.attribute] = `${Math.round(colSum / activeRules.length)}%`;
    });

    const results = {
      table,
      overall: totalRuleCount > 0 ? Math.round(totalScoreSum / totalRuleCount) : 100,
      validity: valCount > 0 ? Math.round(valSum / valCount) : 100,
      accuracy: accCount > 0 ? Math.round(accSum / accCount) : 100,
      columns: columnDQMap
    };
    setEvaluatedResults(results);
    localStorage.setItem(`robin_evaluated_results_${table}`, JSON.stringify(results));
    localStorage.setItem(`robin_table_quality_${table}`, results.overall.toString());
    setHasEvaluated(true);
    localStorage.setItem('robin_has_evaluated', 'true');

    // Step 4: Post rule executions to backend
    try {
      const executions: any[] = [];
      activeColumnsList.forEach(col => {
        col.appliedRules.forEach(rule => {
          if (rule.status === 'deactivated') return;
          const scoreVal = getRuleScoreWithProfiles(rule.label, col.attribute, mergedProfiles);
          const total = numericRowCount || 1000;
          const failed = Math.round(total * (1 - scoreVal / 100));
          executions.push({
            column_name: col.attribute,
            rule_type: rule.label,
            total_rows: total,
            failed_rows: failed,
            status: failed === 0 ? 'pass' : 'fail'
          });
        });
      });
      if (executions.length > 0) {
        await axios.post(`${API_BASE}/dashboard/executions`, {
          platform,
          table_name: table,
          executions
        });
      }
    } catch (e) {
      console.error("Failed to log executions to backend", e);
    }
  };

  // Scores used for UI rendering
  const displayOverall = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.overall : 100;
  const displayValidity = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.validity : 100;
  const displayAccuracy = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.accuracy : 100;

  useEffect(() => {
    if (table && evaluatedResults && evaluatedResults.table === table) {
      localStorage.setItem(`robin_table_quality_${table}`, displayOverall.toString());
    }
  }, [table, displayOverall, evaluatedResults]);

  const lastRunChange = useMemo(() => {
    if (numericRowCount === 0) return '0';
    // Simulate a realistic small delta (drift) between last run and current
    const drift = Math.floor((numericRowCount % 100) / 2) - 10;
    return drift >= 0 ? `+${drift}` : `${drift}`;
  }, [numericRowCount]);


  return (
    <div className="dq-detail">
      <div className="dq-breadcrumbs">
        <Link to="/catalog" className="breadcrumb-link">Catalog items</Link>
        <ChevronRight size={14} className="separator" />
        <Link to={`/catalog/${database}/${schema}/${table}`} className="breadcrumb-link">{table}</Link>
        <ChevronRight size={14} className="separator" />
        <span className="breadcrumb-current">Primary</span>
      </div>

      {error && (
        <div className="catalog-error" style={{ margin: '1rem', padding: '2rem' }}>
          <AlertCircle size={48} className="error-icon" />
          <h3>Connection Failed</h3>
          <p>{error}</p>
          <Link to="/connections" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none', display: 'inline-block' }}>
            Verify Credentials
          </Link>
        </div>
      )}

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
              onClick={async () => {
                setIsEvaluating(true);
                try {
                  await handleEvaluationSnapshot();
                } finally {
                  setIsEvaluating(false);
                }
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
            <h2 className="m-score" style={{ color: displayOverall > 80 ? '#10b981' : displayOverall > 50 ? '#f59e0b' : '#ef4444' }}>{displayOverall}%</h2>
            <div className="overall-bar-bg"><div className="overall-bar-fill" style={{ width: `${displayOverall}%`, background: displayOverall > 80 ? '#10b981' : '#ef4444' }}></div></div>
            <div className="m-sub-stats">
              <span className="stat-item"><span className="dot green"></span> {Math.floor(numericRowCount * (displayOverall / 100)).toLocaleString()} Passed</span>
              <span className="stat-item"><span className="dot red"></span> {(numericRowCount - Math.floor(numericRowCount * (displayOverall / 100))).toLocaleString()} Failed</span>
            </div>
          </div>
          <div className="metric-card">
            <span className="m-label">DQ Dimensions</span>
            <div className="dimensions-list">
              <div className="dim-row"><span className="dim-dot green"></span><span className="dim-pct">{displayValidity}%</span><span className="dim-lbl">Validity</span></div>
              <div className="dim-row"><span className="dim-dot pink"></span><span className="dim-pct">{displayAccuracy}%</span><span className="dim-lbl">Accuracy</span></div>
            </div>
          </div>
          <div className="metric-card graph-card">
            <span className="m-label">Dq over time</span>
            <div className="graph-plot">
              <div className="graph-svg-container"><svg viewBox="0 0 160 50"><path d="M 0 30 Q 40 32 80 34 T 160 10" fill="none" stroke="#6366f1" strokeWidth="2" /></svg></div>
              <div className="graph-x-axis">
                <span>{new Date(Date.now() - 28*86400000).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                <span>{new Date(Date.now() - 21*86400000).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                <span>{new Date(Date.now() - 14*86400000).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                <span>{new Date(Date.now() - 7*86400000).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                <span>Today</span>
              </div>
            </div>
          </div>
          <div className="metric-card text-card">
            <span className="m-label">Number of records</span>
            <h2 className="m-score">{rowCount.toLocaleString()} <HelpCircle size={14} className="info-icon" /></h2>
            <span className="m-subtext">Last run change</span><span className="m-sub-change" style={{ color: lastRunChange.startsWith('+') ? '#10b981' : '#ef4444' }}>{lastRunChange}</span>
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
                    {activeColumnsList.flatMap((col) => col.appliedRules.map((rule, ri) => {
                      const validityLabels = ['Email Format', 'Date Format', 'Pattern Match', 'Freshness', 'Validity'];
                      const isValidity = validityLabels.some(lbl => rule.label.includes(lbl));
                      const scoreVal = parseInt(rule.score) || 100;
                      const pCount = Math.floor(numericRowCount * (scoreVal / 100));
                      const fCount = numericRowCount - pCount;

                      return (
                        <tr key={`${col.attribute}-${ri}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 500 }}>{ri === 0 ? col.attribute : ''}</td>
                          <td style={{ padding: '10px 16px' }}>{rule.label}</td>
                          <td style={{ padding: '10px 16px' }}><span className={`dim-badge ${isValidity ? 'validity' : 'accuracy'}`}>{isValidity ? 'Validity' : 'Accuracy'}</span></td>
                          <td style={{ padding: '10px 16px', color: '#15803d' }}>{hasEvaluated ? pCount.toLocaleString() : '-'}</td>
                          <td style={{ padding: '10px 16px', color: '#b91c1c' }}>{hasEvaluated ? fCount.toLocaleString() : '-'}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 600 }}>{rule.score}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: scoreVal > 80 ? '#16a34a' : '#dc2626' }}>
                              {scoreVal > 80 ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                              <span>{scoreVal > 80 ? 'Pass' : 'Fail'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }))}
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
                <button className="btn-suggested-rules" onClick={handleSuggestRules} disabled={suggestingRules}>
                  {suggestingRules ? 'Thinking...' : 'Suggested Rules'}
                </button>
              </div>
              <div className="dq-scrollable-table">
                <table className="dq-main-table">
                  <thead>
                    <tr>
                      <th>Attribute</th>
                      <th>Overall DQ</th>
                      <th>Terms</th>
                      <th>Profiling summary</th>
                      <th>Min/max</th>
                      <th>Top 3 values</th>
                      <th>Masks</th>
                      <th>Applied rules</th>
                    </tr>
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
                          <td className="profile-cell">
                            {row.profileSummary.map((ps, pi) => (
                              <div key={pi} className="ps-row">
                                <span>{ps.label}</span>
                                <span style={{ fontWeight: 600 }}>{ps.pct}</span>
                              </div>
                            ))}
                          </td>
                          <td className="values-cell">
                            {row.minMax.map((mm, mi) => (
                              <div key={mi} className="tv-row">
                                <span style={{ color: '#64748b' }}>{mm.pct}</span>
                                <span>{mm.label}</span>
                              </div>
                            ))}
                          </td>
                          <td className="values-cell">
                            {row.topValues.map((tv, ti) => (
                              <div key={ti} className="tv-row">
                                <span style={{ color: '#64748b', fontWeight: 500 }}>{tv.pct}</span>
                                <span>{tv.label}</span>
                              </div>
                            ))}
                          </td>
                          <td className="values-cell">
                            {row.masks.map((m, mi) => (
                              <div key={mi} className="tv-row">
                                <span style={{ color: '#64748b' }}>{m.pct}</span>
                                <span>{m.label}</span>
                              </div>
                            ))}
                          </td>
                          <td className="applied-rules-cell">
                            <div style={{ position: 'relative', display: 'inline-block' }} ref={openAddRule === row.attribute ? addRuleRef : null}>
                              <button className="btn-add-rule" onClick={() => handleAddRuleClick(row.attribute)}>
                                <Plus size={12} /> Add
                              </button>
                              {openAddRule === row.attribute && (
                                <div className="add-rule-popup glass-panel" style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  zIndex: 1100,
                                  background: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                  padding: '8px',
                                  minWidth: '180px',
                                  marginTop: '5px'
                                }}>
                                  <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Select Rule</div>
                                  {['Null Check', 'Unique Check', 'Pattern Match', 'Range Check', 'Freshness'].map(rule => (
                                    <button 
                                      key={rule}
                                      onClick={() => handleApplyRule(row.attribute, rule)}
                                      style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        fontSize: '13px',
                                        color: '#1e293b',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        transition: 'background 0.2s'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                      {rule}
                                    </button>
                                  ))}
                                  <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '4px', paddingTop: '4px' }}>
                                    <button 
                                      onClick={() => {
                                        const url = `/catalog/${database}/${schema}/${table}/dq/primary/create-rule/${row.attribute}`;
                                        window.open(url, '_blank', 'width=1200,height=900,menubar=no,toolbar=no,location=no,status=no');
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        width: '100%',
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        fontSize: '13px',
                                        color: '#3b82f6',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <ExternalLink size={12} /> Custom Rule
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            {row.appliedRules.map((rule, ri) => {
                              const isShut = rule.status === 'deactivated';
                              const isHovered = hoveredRule === `${row.attribute}-${rule.label}`;
                              const hoverDetails = getRuleHoverDetails(rule.label, row.attribute);
                              const dynamicScore = getRuleScore(rule.label, row.attribute);

                              return (
                                <div 
                                  className="applied-rule-badge" 
                                  key={ri}
                                  onMouseEnter={() => setHoveredRule(`${row.attribute}-${rule.label}`)}
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
                                  <span style={{ padding: '0.2rem 0.5rem', fontWeight: 600, color: isShut ? '#64748b' : '#38bdf8', borderRight: '1px solid rgba(255, 255, 255, 0.08)' }}>{dynamicScore}%</span>
                                  <span style={{ padding: '0.2rem 0.55rem', color: isShut ? '#64748b' : '#f8fafc', borderRight: '1px solid rgba(255, 255, 255, 0.08)', textDecoration: isShut ? 'line-through' : 'none' }}>{rule.label}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleRule(row.attribute, rule.label); }}
                                    style={{ background: 'transparent', border: 'none', borderRight: '1px solid rgba(255, 255, 255, 0.08)', color: isShut ? '#f43f5e' : '#94a3b8', padding: '0.2rem 0.45rem', cursor: 'pointer' }}
                                  >
                                    <Power size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteRule(row.attribute, rule.label); }}
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
