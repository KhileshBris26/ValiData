import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

import { 
  ChevronRight, ShieldCheck, Clock, ExternalLink, Filter, ChevronDown, HelpCircle, Plus, Power, X, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';
import { useClickOutside } from '../hooks/useClickOutside';
import './DataQualityDetail.css';
import SuggestedRulesModal from '../components/SuggestedRulesModal';

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
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hoveredRule, setHoveredRule] = useState<string | null>(null);
  const [hoveredDim, setHoveredDim] = useState<'validity' | 'accuracy' | null>(null);
  const [calculationModal, setCalculationModal] = useState<{
    type: 'validity' | 'accuracy';
    tableName: string;
  } | null>(null);
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
  // State for invalid record samples (populated on Profile & Evaluate)
  const [sampleGroups, setSampleGroups] = useState<{
    column_name: string;
    rule_type: string;
    columns: string[];
    rows: string[][];
  }[]>([]);
  const [invalidLoading, setInvalidLoading] = useState(false);

  // Per-rule execution results keyed "colName|ruleLabel" → { total, passed, failed, score }
  const [ruleExecutionResults, setRuleExecutionResults] = useState<Record<string, {
    total: number;
    passed: number;
    failed: number;
    score: number;
  }>>({});

  // Execution History tab state
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<any>(null);
  const [runSteps, setRunSteps] = useState<any[]>([]);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);

  const handleRunClick = async (runId: string) => {
    if (!runId) return;
    setSelectedRunId(runId);
    setLoadingRunDetails(true);
    try {
      const res = await axios.get(`${API_BASE}/dq/runs/${runId}`);
      setRunDetails(res.data.run_details);
      setRunSteps(res.data.steps);
    } catch (e) {
      console.error('Failed to fetch run details:', e);
    } finally {
      setLoadingRunDetails(false);
    }
  };

  // Scheduling state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [activeScheduleForModal, setActiveScheduleForModal] = useState<any | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Snapshot results state
  const [evaluatedResults, setEvaluatedResults] = useState<{
    table?: string;
    overall: number;
    validity: number;
    accuracy: number;
    columns: Record<string, string>;
  } | null>(null);
  const [colProfiles, setColProfiles] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem(`robin_col_profiles_${table}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  
  const fetchLatestEvaluations = async () => {
    if (!table) return;
    try {
      const res = await axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}&_t=${Date.now()}`);
      if (res.data && res.data.has_evaluated) {
        setHasEvaluated(true);
        const backendExecs = res.data.executions || [];
        
        const validityLabels = ['Email Format', 'Date Format', 'Pattern Match', 'Pattern Check', 'Freshness', 'Validity'];
        const accuracyLabels = ['Null Check', 'Unique Check', 'Range Check', 'Completeness', 'Value Range', 'Accuracy', 'EMPTY', 'Blank Check'];
        
        let valSum = 0; let valCount = 0;
        let accSum = 0; let accCount = 0;

        // Reconstruct ruleExecutionResults
        const newRuleExecResults: Record<string, any> = {};
        
        // Temporary columns status mapping
        const columnsStatus: Record<string, string> = {};

        backendExecs.forEach((ex: any) => {
            const key = `${ex.column_name}|${ex.rule_type}`;
            const scoreVal = ex.total_rows > 0 ? Math.round((1 - ex.failed_rows / ex.total_rows) * 100) : 100;
            newRuleExecResults[key] = {
                total: ex.total_rows,
                passed: ex.passed_rows || (ex.total_rows - ex.failed_rows),
                failed: ex.failed_rows,
                score: scoreVal
            };
            
            const normalizedRule = ex.rule_type.replace(/_/g, ' ').toUpperCase();
            
            const isValidity = validityLabels.some(lbl => {
                const normalizedLabel = lbl.replace(/_/g, ' ').toUpperCase();
                return normalizedRule.includes(normalizedLabel) || normalizedLabel.includes(normalizedRule);
            });
            const isAccuracy = accuracyLabels.some(lbl => {
                const normalizedLabel = lbl.replace(/_/g, ' ').toUpperCase();
                return normalizedRule.includes(normalizedLabel) || normalizedLabel.includes(normalizedRule);
            });
            
            if (isValidity) {
                valSum += scoreVal;
                valCount++;
            }
            if (isAccuracy) {
                accSum += scoreVal;
                accCount++;
            }

            // Reconstruct column status based on the lowest score
            if (!columnsStatus[ex.column_name]) {
                columnsStatus[ex.column_name] = scoreVal > 80 ? 'high' : scoreVal > 50 ? 'med' : 'low';
            } else {
                const currentStatus = columnsStatus[ex.column_name];
                if (currentStatus === 'high' && scoreVal <= 80) columnsStatus[ex.column_name] = 'med';
                if (currentStatus === 'med' && scoreVal <= 50) columnsStatus[ex.column_name] = 'low';
            }
        });
        
        // Reconstruct evaluatedResults with dynamically split scores
        const newEval = {
            table: table,
            overall: res.data.overall || 100,
            validity: valCount > 0 ? Math.round(valSum / valCount) : (res.data.overall || 100),
            accuracy: accCount > 0 ? Math.round(accSum / accCount) : (res.data.overall || 100),
            columns: columnsStatus
        };
        
        setEvaluatedResults(newEval);
        setRuleExecutionResults(newRuleExecResults);
      } else {
        setHasEvaluated(false);
        setEvaluatedResults(null);
        setRuleExecutionResults({});
      }
    } catch (e) {
      console.error("Failed to fetch latest evaluations:", e);
    }
  };

  useEffect(() => {
    if (table) {
      fetchLatestEvaluations();
      try {
        const savedProfiles = localStorage.getItem(`robin_col_profiles_${table}`);
        setColProfiles(savedProfiles ? JSON.parse(savedProfiles) : {});
      } catch {
        setColProfiles({});
      }
    }
  }, [table]);


  // Local state for Custom Scheduling Modal
  const [customUnit, setCustomUnit] = useState('minutes');
  const [customValue, setCustomValue] = useState(15);
  const [customWeeklyDays, setCustomWeeklyDays] = useState<string[]>([]);
  const [customMonthlyMode, setCustomMonthlyMode] = useState('date');
  const [customMonthlyDate, setCustomMonthlyDate] = useState(1);
  const [customMonthlyIndex, setCustomMonthlyIndex] = useState(1);
  const [customMonthlyDay, setCustomMonthlyDay] = useState('Monday');
  const [customStartTime, setCustomStartTime] = useState('12:00');
  const [customTimezone, setCustomTimezone] = useState('UTC');

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try {
      const res = await axios.get(
        `${API_BASE}/dashboard/schedules?table_name=${encodeURIComponent(table || '')}&platform=${encodeURIComponent(platform)}&database_name=${encodeURIComponent(database || '')}&schema_name=${encodeURIComponent(schema || '')}`
      );
      setSchedules(res.data.schedules || []);
    } catch (e) {
      console.error("Failed to fetch schedules:", e);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const handleToggleEnable = async (schedule: any) => {
    try {
      const nextEnabled = !schedule.enabled;
      await axios.patch(`${API_BASE}/dashboard/schedules/${schedule.id}`, {
        enabled: nextEnabled
      });
      fetchSchedules();
    } catch (e) {
      console.error("Failed to toggle schedule:", e);
    }
  };

  const handleFrequencyChange = async (schedule: any, newFreq: string) => {
    if (newFreq === 'Other') {
      setActiveScheduleForModal(schedule);
      if (schedule.custom_config) {
        try {
          const cfg = JSON.parse(schedule.custom_config);
          setCustomUnit(cfg.type || 'minutes');
          setCustomValue(cfg.value || 15);
          setCustomWeeklyDays(cfg.days || []);
          setCustomMonthlyMode(cfg.mode || 'date');
          setCustomMonthlyDate(cfg.date || 1);
          setCustomMonthlyIndex(cfg.index || 1);
          setCustomMonthlyDay(cfg.day || 'Monday');
        } catch (err) {}
      }
      setCustomStartTime(schedule.start_time ? schedule.start_time.substring(11, 16) : '12:00');
      setCustomTimezone(schedule.timezone || 'UTC');
      setShowCustomModal(true);
    } else {
      try {
        const nextEnabled = newFreq !== 'Disabled';
        await axios.post(`${API_BASE}/dashboard/schedules`, {
          platform,
          database_name: database,
          schema_name: schema,
          table_name: table,
          run_type: schedule.run_type,
          frequency: newFreq,
          start_time: schedule.start_time || new Date().toISOString(),
          timezone: schedule.timezone || 'UTC',
          enabled: nextEnabled
        });
        fetchSchedules();
      } catch (e) {
        console.error("Failed to change frequency:", e);
      }
    }
  };

  const handleSaveCustomSchedule = async () => {
    if (!activeScheduleForModal) return;
    setSavingSchedule(true);
    try {
      const config = {
        type: customUnit,
        value: customValue,
        days: customWeeklyDays,
        mode: customMonthlyMode,
        date: customMonthlyDate,
        index: customMonthlyIndex,
        day: customMonthlyDay,
        interval: 1
      };
      
      const startDateTime = new Date();
      const [h, m] = customStartTime.split(':');
      startDateTime.setHours(parseInt(h) || 12);
      startDateTime.setMinutes(parseInt(m) || 0);
      startDateTime.setSeconds(0);

      await axios.post(`${API_BASE}/dashboard/schedules`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        run_type: activeScheduleForModal.run_type,
        frequency: 'Other',
        custom_config: config,
        start_time: startDateTime.toISOString(),
        timezone: customTimezone,
        enabled: true
      });
      setShowCustomModal(false);
      fetchSchedules();
    } catch (e) {
      console.error("Failed to save custom schedule:", e);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleManualRunNow = async (schedule: any) => {
    try {
      await axios.post(`${API_BASE}/dashboard/schedules/${schedule.id}/run`);
      alert("Background run has been triggered immediately!");
      fetchSchedules();
    } catch (e) {
      console.error("Failed to trigger run:", e);
    }
  };

  const formatCustomFrequency = (configStr: string) => {
    try {
      const config = JSON.parse(configStr);
      const unit = config.type;
      const val = config.value;
      if (unit === 'minutes') return `Every ${val} mins`;
      if (unit === 'hours') return `Every ${val} hours`;
      if (unit === 'days') return `Every ${val} days`;
      if (unit === 'weekly') {
        const days = config.days || [];
        return `Weekly on ${days.join(', ')}`;
      }
      if (unit === 'monthly') {
        const mode = config.mode;
        if (mode === 'date') return `Monthly on the ${config.date}th`;
        const idxStr = config.index === 1 ? '1st' : config.index === 2 ? '2nd' : config.index === 3 ? '3rd' : config.index === 4 ? '4th' : 'last';
        return `Monthly on ${idxStr} ${config.day}`;
      }
    } catch (e) {}
    return 'Custom';
  };

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

  useEffect(() => {
    if (activeTab === 'Execution History' && table) {
      const fetchHistory = async () => {
        setRunHistoryLoading(true);
        try {
          const res = await axios.get(`${API_BASE}/dq/runs`);
          setRunHistory(res.data.runs || []);
        } catch (e) {
          console.error('Failed to fetch run history:', e);
        } finally {
          setRunHistoryLoading(false);
        }
      };
      fetchHistory();
    }
  }, [activeTab, table]);

  useEffect(() => {
    if (activeTab === 'Settings' && table) {
      const fetchSchedules = async () => {
        setLoadingSchedules(true);
        try {
          const res = await axios.get(
            `${API_BASE}/dashboard/schedules?table_name=${encodeURIComponent(table)}&platform=${encodeURIComponent(platform)}&database_name=${encodeURIComponent(database || '')}&schema_name=${encodeURIComponent(schema || '')}`
          );
          setSchedules(res.data.schedules || []);
        } catch (e) {
          console.error("Failed to fetch schedules:", e);
        } finally {
          setLoadingSchedules(false);
        }
      };
      fetchSchedules();
    }
  }, [activeTab, table, database, schema, platform]);

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

    try {
      const cacheRes = await axios.get(`${API_BASE}/dashboard/column_profiles?platform=${encodeURIComponent(platform)}&database_name=${encodeURIComponent(database || '')}&schema_name=${encodeURIComponent(schema || '')}&table_name=${encodeURIComponent(table || '')}`);
      if (cacheRes.data && cacheRes.data.profile) {
        setColProfiles(cacheRes.data.profile);
        return cacheRes.data.profile;
      }
    } catch (cacheErr) {
      console.warn("Failed to fetch cached profiles, falling back to live", cacheErr);
    }

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

  const [isSuggestRulesModalOpen, setIsSuggestRulesModalOpen] = useState(false);
  const handleSuggestRules = () => {
    setIsSuggestRulesModalOpen(true);
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
    const validityLabels = ['Email Format', 'Date Format', 'Pattern Match', 'Pattern Check', 'Freshness', 'Validity'];
    const accuracyLabels = ['Null Check', 'Unique Check', 'Range Check', 'Completeness', 'Value Range', 'Accuracy', 'EMPTY', 'Blank Check'];

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
        
        const normalizedRule = rule.label.replace(/_/g, ' ').toUpperCase();
        
        const isValidity = validityLabels.some(lbl => {
            const normalizedLabel = lbl.replace(/_/g, ' ').toUpperCase();
            return normalizedRule.includes(normalizedLabel) || normalizedLabel.includes(normalizedRule);
        });
        const isAccuracy = accuracyLabels.some(lbl => {
            const normalizedLabel = lbl.replace(/_/g, ' ').toUpperCase();
            return normalizedRule.includes(normalizedLabel) || normalizedLabel.includes(normalizedRule);
        });
        
        if (isValidity) {
          valSum += s; valCount++;
        }
        if (isAccuracy) {
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
    
    
    setHasEvaluated(true);
    

    // Step 4: Build per-rule execution map and post to backend
    try {
      const executions: any[] = [];
      const newRuleExecResults: Record<string, { total: number; passed: number; failed: number; score: number }> = {};

      activeColumnsList.forEach(col => {
        col.appliedRules.forEach(rule => {
          if (rule.status === 'deactivated') return;
          const scoreVal = getRuleScoreWithProfiles(rule.label, col.attribute, mergedProfiles);
          const total = numericRowCount || 1000;
          const failed = Math.round(total * (1 - scoreVal / 100));
          const passed = total - failed;
          const key = `${col.attribute}|${rule.label}`;
          newRuleExecResults[key] = { total, passed, failed, score: scoreVal };
          executions.push({
            column_name: col.attribute,
            rule_type: rule.label,
            total_rows: total,
            failed_rows: failed,
            status: failed === 0 ? 'pass' : 'fail'
          });
        });
      });

      // Persist so values survive tab switches
      setRuleExecutionResults(newRuleExecResults);
      

      if (executions.length > 0) {
        await axios.post(`${API_BASE}/dashboard/executions`, {
          platform,
          table_name: table,
          executions
        });

        // Step 5: Fetch live sample failed records from Snowflake for Null/Unique failures
        try {
          const failedChecks = executions
            .filter(ex => ex.failed_rows > 0 && (ex.rule_type.toUpperCase().includes('NULL') || ex.rule_type.toUpperCase().includes('UNIQUE')))
            .map(ex => ({ column_name: ex.column_name, rule_type: ex.rule_type }));

          if (failedChecks.length > 0) {
            setInvalidLoading(true);
            const saved = localStorage.getItem('robin_credentials');
            const credentials = saved ? JSON.parse(saved)[platform] : null;
            const sampleRes = await axios.post(`${API_BASE}/dashboard/sample_failed_records`, {
              platform,
              table_name: `${database}.${schema}.${table}`,
              failed_checks: failedChecks,
              credentials
            });
            setSampleGroups(sampleRes.data.groups || []);
          } else {
            setSampleGroups([]);
          }
        } catch (sampleErr) {
          console.error('Failed to fetch sample failed records:', sampleErr);
        } finally {
          setInvalidLoading(false);
        }
      }
      
      // Fetch latest values from backend to ensure UI stays perfectly synced
      await fetchLatestEvaluations();
    } catch (e) {
      console.error("Failed to log executions to backend", e);
    }

    setIsEvaluating(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const getCalculationDetails = (type: 'validity' | 'accuracy') => {
    const validityLabels = ['Email Format', 'Date Format', 'Pattern Match', 'Pattern Check', 'Freshness', 'Validity'];
    const accuracyLabels = ['Null Check', 'Unique Check', 'Range Check', 'Completeness', 'Value Range', 'Accuracy', 'EMPTY', 'Blank Check'];
    
    const targetLabels = type === 'validity' ? validityLabels : accuracyLabels;
    const details: { column: string; rule: string; score: number; passed: number; total: number }[] = [];
    
    Object.entries(ruleExecutionResults).forEach(([key, val]) => {
      const parts = key.split('|');
      const column = parts[0];
      const rule = parts.slice(1).join('|');
      
      const normalizedRule = rule.replace(/_/g, ' ').toUpperCase();
      const isMatched = targetLabels.some(lbl => {
        const normalizedLabel = lbl.replace(/_/g, ' ').toUpperCase();
        return normalizedRule.includes(normalizedLabel) || normalizedLabel.includes(normalizedRule);
      });
      
      if (isMatched) {
        details.push({
          column,
          rule,
          score: val.score,
          passed: val.passed,
          total: val.total
        });
      }
    });
    
    return details;
  };

  // Scores used for UI rendering
  const displayOverall = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.overall : 100;
  const displayValidity = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.validity : 100;
  const displayAccuracy = (evaluatedResults && evaluatedResults.table === table) ? evaluatedResults.accuracy : 100;

  

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
              <div 
                className="dim-row" 
                style={{ position: 'relative', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredDim('validity')}
                onMouseLeave={() => setHoveredDim(null)}
                onClick={() => setCalculationModal({ type: 'validity', tableName: table || '' })}
                title="Click to see Validity calculation breakdown"
              >
                <span className="dim-dot green"></span>
                <span className="dim-pct" style={{ textDecoration: 'underline dashed rgba(255,255,255,0.4)' }}>{displayValidity}%</span>
                <span className="dim-lbl">Validity</span>
                
                {hoveredDim === 'validity' && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: '0',
                      width: '280px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      color: '#1e293b',
                      textAlign: 'left',
                      cursor: 'default'
                    }}
                  >
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Validity Score Calculation</h4>
                    <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.4' }}>
                      <strong>Formula:</strong> Average pass rate of all active Validity rules.
                    </p>
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                        Parameters included:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {['Email Format', 'Date Format', 'Pattern Match', 'Freshness', 'Validity'].map(lbl => (
                          <span key={lbl} style={{
                            background: '#f1f5f9', color: '#475569', fontSize: '10px', 
                            padding: '2px 6px', borderRadius: '4px', fontWeight: 500
                          }}>{lbl}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ position: 'absolute', top: '-6px', left: '20px', transform: 'rotate(45deg)', width: '12px', height: '12px', background: '#ffffff', borderTop: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }} />
                  </div>
                )}
              </div>
              
              <div 
                className="dim-row" 
                style={{ position: 'relative', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredDim('accuracy')}
                onMouseLeave={() => setHoveredDim(null)}
                onClick={() => setCalculationModal({ type: 'accuracy', tableName: table || '' })}
                title="Click to see Accuracy calculation breakdown"
              >
                <span className="dim-dot pink"></span>
                <span className="dim-pct" style={{ textDecoration: 'underline dashed rgba(255,255,255,0.4)' }}>{displayAccuracy}%</span>
                <span className="dim-lbl">Accuracy</span>
                
                {hoveredDim === 'accuracy' && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: '0',
                      width: '280px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      color: '#1e293b',
                      textAlign: 'left',
                      cursor: 'default'
                    }}
                  >
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Accuracy Score Calculation</h4>
                    <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.4' }}>
                      <strong>Formula:</strong> Average pass rate of all active Accuracy rules.
                    </p>
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                        Parameters included:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {['Null Check', 'Unique Check', 'Range Check', 'Completeness', 'Value Range', 'Accuracy', 'EMPTY'].map(lbl => (
                          <span key={lbl} style={{
                            background: '#f1f5f9', color: '#475569', fontSize: '10px', 
                            padding: '2px 6px', borderRadius: '4px', fontWeight: 500
                          }}>{lbl}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ position: 'absolute', top: '-6px', left: '20px', transform: 'rotate(45deg)', width: '12px', height: '12px', background: '#ffffff', borderTop: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }} />
                  </div>
                )}
              </div>
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
            {['Profiling & Rules', 'Detailed results', 'Records', 'Settings', 'Invalid record samples', 'Execution History'].map(t => (
              <button key={t} className={`dq-tab-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>
            ))}
          </div>
          <div className="attributes-dropdown"><span>All Attributes</span><ChevronDown size={14} /></div>
        </div>

        <div className="dq-table-container glass-panel">
          {activeTab === 'Detailed results' ? (
            <div style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>Detailed Rule Results</h3>
              {!hasEvaluated && (
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                  Run <strong>Profile and Evaluate</strong> to populate real-time results.
                </p>
              )}
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
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

                      // --- Real execution data ---
                      const execKey = `${col.attribute}|${rule.label}`;
                      const execData = ruleExecutionResults[execKey];

                      const passed  = execData ? execData.passed : 0;
                      const failed  = execData ? execData.failed : 0;
                      const score   = execData ? execData.score  : 0;

                      // Status: 3-way
                      let statusLabel: string;
                      let statusColor: string;
                      let StatusIcon: React.ReactNode;
                      if (!hasEvaluated || !execData) {
                        statusLabel = '—';
                        statusColor = '#94a3b8';
                        StatusIcon = null;
                      } else if (failed === 0) {
                        statusLabel = 'Passed';
                        statusColor = '#16a34a';
                        StatusIcon = <CheckCircle2 size={15} />;
                      } else if (passed === 0) {
                        statusLabel = 'Failed';
                        statusColor = '#dc2626';
                        StatusIcon = <XCircle size={15} />;
                      } else {
                        statusLabel = 'Partially Passed';
                        statusColor = '#d97706';
                        StatusIcon = <AlertCircle size={15} />;
                      }

                      return (
                        <tr key={`${col.attribute}-${ri}`} style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: ri % 2 === 0 ? '#ffffff' : '#fafafa'
                        }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1e293b' }}>
                            {ri === 0 ? col.attribute : ''}
                          </td>
                          <td style={{ padding: '10px 16px', color: '#374151' }}>{rule.label}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span className={`dim-badge ${isValidity ? 'validity' : 'accuracy'}`}>
                              {isValidity ? 'Validity' : 'Accuracy'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', color: '#15803d', fontWeight: 500 }}>
                            {hasEvaluated && execData ? passed.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: failed > 0 ? '#b91c1c' : '#15803d', fontWeight: 500 }}>
                            {hasEvaluated && execData ? failed.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {hasEvaluated && execData ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                  width: '56px', height: '6px', borderRadius: '3px',
                                  background: '#e2e8f0', overflow: 'hidden'
                                }}>
                                  <div style={{
                                    height: '100%', borderRadius: '3px',
                                    width: `${score}%`,
                                    background: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
                                  }} />
                                </div>
                                <span style={{ fontWeight: 700, color: score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626', minWidth: '38px' }}>
                                  {score}%
                                </span>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: statusColor, fontWeight: 500 }}>
                              {StatusIcon}
                              <span>{statusLabel}</span>
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
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Automated Run Scheduling</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Configure background task schedules</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                Set up recurring background profiling and rule evaluations for this table. Custom rules must be active to trigger evaluate runs.
              </p>

              {loadingSchedules ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '32px 0', color: '#6366f1' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span style={{ fontSize: '14px' }}>Loading scheduling properties...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Alert banner for failed runs */}
                  {schedules.some(s => s.status === 'Failed') && (
                    <div style={{
                      display: 'flex', gap: '12px', padding: '16px', borderRadius: '10px',
                      background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030',
                      boxShadow: '0 2px 8px rgba(229, 62, 62, 0.05)'
                    }}>
                      <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>Scheduled Execution Alert</strong>
                        {schedules.map(s => s.status === 'Failed' && (
                          <div key={s.id} style={{ fontSize: '13px', marginBottom: '6px' }}>
                            • The scheduled <strong>{s.run_type}</strong> run failed for table <code>{s.table_name}</code>.
                            {s.last_error && <span style={{ display: 'block', fontSize: '12px', color: '#9b2c2c', fontStyle: 'italic', marginTop: '2px', background: 'rgba(0,0,0,0.03)', padding: '4px 8px', borderRadius: '4px' }}>Error: {s.last_error}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Table Name</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Run Type</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Run Frequency</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Run Time</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next Scheduled Run</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '90px' }}>Enabled</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map((schedule) => {
                          const freqVal = schedule.frequency;
                          const showFrequencyLabel = freqVal === 'Other' ? formatCustomFrequency(schedule.custom_config) : freqVal;
                          
                          let statusText = 'Paused';
                          let statusColor = '#94a3b8';
                          let statusBg = '#f1f5f9';
                          if (schedule.enabled) {
                            if (schedule.status === 'Failed') {
                              statusText = 'Failed';
                              statusColor = '#dc2626';
                              statusBg = '#fef2f2';
                            } else {
                              statusText = 'Active';
                              statusColor = '#16a34a';
                              statusBg = '#f0fdf4';
                            }
                          }

                          return (
                            <tr key={schedule.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
                              {/* 1. Table Name (non-editable) */}
                              <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1e293b' }}>
                                <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', color: '#334155' }}>
                                  {schedule.table_name}
                                </code>
                              </td>
                              
                              {/* 2. Run Type */}
                              <td style={{ padding: '14px 16px', fontWeight: 500, color: '#475569', textTransform: 'capitalize' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                                  background: schedule.run_type === 'profile' ? '#e0e7ff' : '#fae8ff',
                                  color: schedule.run_type === 'profile' ? '#4f46e5' : '#a21caf'
                                }}>
                                  {schedule.run_type} Run
                                </span>
                              </td>
                              
                              {/* 3. Run Frequency Dropdown */}
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <select
                                    value={freqVal === 'Other' ? 'Other' : (schedule.enabled ? freqVal : 'Disabled')}
                                    onChange={(e) => handleFrequencyChange(schedule, e.target.value)}
                                    style={{
                                      padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                      fontSize: '13px', color: '#1e293b', background: '#ffffff', outline: 'none',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="Disabled">Disabled</option>
                                    <option value="5 minutes">5 minutes</option>
                                    <option value="10 minutes">10 minutes</option>
                                    <option value="20 minutes">20 minutes</option>
                                    <option value="30 minutes">30 minutes</option>
                                    <option value="1 hour">1 hour</option>
                                    <option value="4 hours">4 hours</option>
                                    <option value="6 hours">6 hours</option>
                                    <option value="12 hours">12 hours</option>
                                    <option value="24 hours">24 hours</option>
                                    <option value="Other">Other...</option>
                                  </select>
                                  
                                  {freqVal === 'Other' && (
                                    <button
                                      onClick={() => handleFrequencyChange(schedule, 'Other')}
                                      style={{
                                        border: 'none', background: 'none', color: '#6366f1',
                                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                        padding: '4px', textDecoration: 'underline'
                                      }}
                                    >
                                      {showFrequencyLabel}
                                    </button>
                                  )}
                                </div>
                              </td>
                              
                              {/* 4. Last Run Time */}
                              <td style={{ padding: '14px 16px', color: '#475569', fontFamily: 'monospace' }}>
                                {schedule.last_run_time ? new Date(schedule.last_run_time).toLocaleString() : '—'}
                              </td>
                              
                              {/* 5. Next Scheduled Run Time */}
                              <td style={{ padding: '14px 16px', color: schedule.enabled ? '#475569' : '#94a3b8', fontFamily: 'monospace' }}>
                                {schedule.enabled && schedule.next_run_time ? new Date(schedule.next_run_time).toLocaleString() : '—'}
                              </td>
                              
                              {/* 6. Status Indicator */}
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                                  padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                                  color: statusColor, background: statusBg
                                }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColor }} />
                                  {statusText}
                                </span>
                              </td>
                              
                              {/* 7. Enable/Disable Toggle */}
                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleToggleEnable(schedule)}
                                  disabled={freqVal === 'Disabled'}
                                  style={{
                                    border: 'none', background: 'none', cursor: freqVal === 'Disabled' ? 'not-allowed' : 'pointer',
                                    color: schedule.enabled ? '#6366f1' : '#94a3b8', display: 'inline-flex', alignItems: 'center'
                                  }}
                                  title={freqVal === 'Disabled' ? 'Set a frequency first' : (schedule.enabled ? 'Disable schedule' : 'Enable schedule')}
                                >
                                  <Power size={18} style={{ opacity: schedule.enabled ? 1 : 0.6 }} />
                                </button>
                              </td>
                              
                              {/* 8. Run Now Action Button */}
                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleManualRunNow(schedule)}
                                  style={{
                                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #6366f1',
                                    background: 'transparent', color: '#6366f1', fontSize: '12px', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.15s'
                                  }}
                                  onMouseOver={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#ffffff'; }}
                                  onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6366f1'; }}
                                >
                                  Run Now
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'Invalid record samples' ? (
            <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Invalid Record Samples</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Showing up to 5 live sample rows per failed check. Click <strong>Profile and Evaluate</strong> to refresh.
            </p>
            {invalidLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '32px 0', color: '#6366f1' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <span style={{ fontSize: '14px' }}>Fetching live samples from Snowflake...</span>
              </div>
            ) : sampleGroups.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
                <p style={{ fontWeight: 600, color: '#475569' }}>No Invalid Records Found</p>
                <p style={{ marginTop: '6px' }}>All validation checks passed, or no Null/Unique failures were detected.</p>
                <p style={{ marginTop: '4px', fontSize: '12px' }}>Click <strong>Profile and Evaluate</strong> to run a live check.</p>
              </div>
            ) : (
              sampleGroups.map((group, gi) => (
                <div key={gi} style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                      background: group.rule_type === 'Unique Check' ? '#fef3c7' : '#fee2e2',
                      color: group.rule_type === 'Unique Check' ? '#92400e' : '#991b1b'
                    }}>
                      {group.rule_type === 'Unique Check' ? '⚠️' : '🚫'} {group.rule_type}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>on column</span>
                    <code style={{
                      background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px',
                      fontSize: '13px', fontWeight: 700, color: '#6366f1'
                    }}>{group.column_name}</code>
                    <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
                      {group.rows.length} sample row{group.rows.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          {group.columns.map((col, ci) => (
                            <th key={ci} style={{
                              padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                              color: ci < 2 ? '#6366f1' : '#475569',
                              whiteSpace: 'nowrap',
                              textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.04em',
                              borderRight: ci === 1 ? '2px solid #c7d2fe' : 'none'
                            }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, ri) => (
                          <tr key={ri} style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: ri % 2 === 0 ? '#ffffff' : '#fafafa',
                            transition: 'background 0.15s'
                          }}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{
                                padding: '9px 14px',
                                color: ci < 2 ? '#4f46e5' : '#374151',
                                fontWeight: ci === 0 ? 600 : 400,
                                fontFamily: ci >= 2 ? 'monospace' : 'inherit',
                                maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                borderRight: ci === 1 ? '2px solid #e0e7ff' : 'none'
                              }} title={cell}>
                                {cell === 'None' || cell === 'null' ? (
                                  <span style={{ color: '#ef4444', fontStyle: 'italic', fontSize: '12px' }}>NULL</span>
                                ) : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
          ) : activeTab === 'Execution History' ? (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Execution History</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Latest runs first · refreshes when you open this tab</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '18px' }}>
                One row per <strong>Profile and Evaluate</strong> run. Accuracy Score = average pass-rate across all rules executed for the table.
              </p>

              {runHistoryLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '32px 0', color: '#6366f1' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span style={{ fontSize: '14px' }}>Loading execution history…</span>
                </div>
              ) : runHistory.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🕐</div>
                  <p style={{ fontWeight: 600, color: '#475569' }}>No Execution History Yet</p>
                  <p style={{ marginTop: '6px' }}>Runs triggered via schedule or manual execution will appear here.</p>
                </div>
              ) : selectedRunId ? (
                <div className="run-details-view">
                  <button 
                    onClick={() => setSelectedRunId(null)} 
                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}
                  >
                    <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Back to Runs
                  </button>
                  {loadingRunDetails ? (
                    <div>Loading run details...</div>
                  ) : runDetails ? (
                    <div>
                      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div><strong>Run ID:</strong> {runDetails.run_id ?? runDetails.RUN_ID}</div>
                        <div><strong>Job Name:</strong> {runDetails.job_name ?? runDetails.JOB_NAME}</div>
                        <div><strong>Status:</strong> {runDetails.status ?? runDetails.STATUS}</div>
                        <div><strong>Trigger:</strong> {runDetails.trigger_type ?? runDetails.TRIGGER_TYPE}</div>
                        <div><strong>Start:</strong> {runDetails.start_time ?? runDetails.START_TIME}</div>
                      </div>
                      <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Step Execution Logs</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Step Name</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Start Time</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>End Time</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Query ID</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Error Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runSteps.map((step, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px', fontWeight: 500 }}>{step.step_name ?? step.STEP_NAME}</td>
                              <td style={{ padding: '8px' }}>
                                <span style={{ color: (step.status ?? step.STATUS) === 'SUCCESS' ? '#16a34a' : (step.status ?? step.STATUS) === 'FAILED' ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                                  {step.status ?? step.STATUS}
                                </span>
                              </td>
                              <td style={{ padding: '8px' }}>{step.start_time ?? step.START_TIME}</td>
                              <td style={{ padding: '8px' }}>{step.end_time ?? step.END_TIME}</td>
                              <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{step.query_id ?? step.QUERY_ID ?? 'N/A'}</td>
                              <td style={{ padding: '8px', color: '#dc2626' }}>{step.error_message ?? step.ERROR_MESSAGE}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div>Run details not found.</div>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {[
                          { label: '#',               w: '40px'  },
                          { label: 'Table Name',      w: '140px' },
                          { label: 'Run Date',        w: '110px' },
                          { label: 'Run Time',        w: '120px' },
                          { label: 'Accuracy Score',  w: '110px' },
                          { label: 'Total Rows',      w: '100px' },
                          { label: 'Passed Rows',     w: '100px' },
                          { label: 'Failed Rows',     w: '100px' },
                          { label: 'Status',          w: '140px' },
                          { label: 'Duration',        w: '90px'  },
                          { label: 'Executed By',     w: '100px' },
                        ].map(col => (
                          <th key={col.label} style={{
                            padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: '#475569', whiteSpace: 'nowrap', fontSize: '11px',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            minWidth: col.w
                          }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runHistory.map((run, idx) => {
                        const score = parseFloat(run.dq_score ?? 0);
                        const scoreColor = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
                        const scoreBg   = score >= 80 ? '#f0fdf4' : score >= 50 ? '#fffbeb' : '#fef2f2';

                        const runStatus = (run.status ?? run.STATUS ?? 'UNKNOWN').toUpperCase();
                        let statusColor = '#16a34a';
                        let statusBg    = '#f0fdf4';
                        if (runStatus === 'FAILED')           { statusColor = '#dc2626'; statusBg = '#fef2f2'; }
                        if (runStatus === 'RUNNING')          { statusColor = '#2563eb'; statusBg = '#eff6ff'; }

                        const durationSec = run.duration_ms != null
                          ? run.duration_ms < 1000
                            ? `${run.duration_ms} ms`
                            : `${(run.duration_ms / 1000).toFixed(1)} s`
                          : '—';

                        return (
                          <tr 
                            key={run.run_id ?? run.RUN_ID ?? idx} 
                            onClick={() => handleRunClick(run.run_id ?? run.RUN_ID)}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                              cursor: 'pointer'
                            }}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '12px' }}>
                              {runHistory.length - idx}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>
                              <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                                {run.job_name ?? run.JOB_NAME ?? run.table_name ?? 'DQ_JOB'}
                              </code>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#374151' }}>{run.trigger_type ?? run.TRIGGER_TYPE ?? 'UNKNOWN'}</td>
                            <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace' }}>{run.start_time ?? run.START_TIME}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <div style={{
                                  width: '48px', height: '6px', borderRadius: '3px',
                                  background: '#e2e8f0', overflow: 'hidden'
                                }}>
                                  <div style={{
                                    height: '100%', borderRadius: '3px', width: `${score}%`,
                                    background: scoreColor
                                  }} />
                                </div>
                                <span style={{
                                  fontWeight: 700, fontSize: '13px', color: scoreColor,
                                  background: scoreBg, padding: '1px 7px', borderRadius: '999px'
                                }}>
                                  {score}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#374151', textAlign: 'right' }}>
                              {(run.total_rules ?? run.TOTAL_RULES ?? run.total_rows ?? 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#15803d', fontWeight: 500, textAlign: 'right' }}>
                              {(run.failed_rules != null ? (run.total_rules - run.failed_rules) : run.passed_rows ?? 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 14px', color: (run.failed_rules ?? run.failed_rows) > 0 ? '#b91c1c' : '#15803d', fontWeight: 500, textAlign: 'right' }}>
                              {(run.failed_rules ?? run.FAILED_RULES ?? run.failed_rows ?? 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '3px 10px', borderRadius: '999px',
                                fontSize: '12px', fontWeight: 600,
                                color: statusColor, background: statusBg,
                                border: `1px solid ${statusColor}30`
                              }}>
                                {runStatus === 'SUCCESS' && <CheckCircle2 size={12} />}
                                {runStatus === 'FAILED' && <XCircle size={12} />}
                                {runStatus}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '12px' }}>
                              {durationSec}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#374151' }}>
                              System
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="dq-table-actions">
                <div className="filter-input-wrapper"><Filter size={16} /><input type="text" placeholder="Filter" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <button className="btn-suggested-rules" onClick={handleSuggestRules}>
                  Suggested Rules
                </button>
              </div>
              <div className="dq-scrollable-table">
                <table className="dq-main-table">
                  <thead>
                    <tr>
                      <th>Column Name</th>
                      <th>Overall Accuracy</th>
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
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>Loading columns...</td></tr>
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
            {['Configuration', 'Implementation', 'Data Accuracy & Validation'].map(t => <button key={t} className={panelTab === t ? 'active' : ''} onClick={() => setPanelTab(t)}>{t}</button>)}
          </div>
          <div className="side-panel-content">
            {panelTab === 'Configuration' ? <p>Rule configuration details...</p> : panelTab === 'Implementation' ? <p>Implementation logic...</p> : <p>Data accuracy validation results...</p>}
          </div>
        </div>
      )}

      {showCustomModal && activeScheduleForModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '12px', padding: '24px', width: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0', color: '#1e293b', position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Custom Schedule Configuration
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Configure advanced scheduling rules for <strong>{activeScheduleForModal.run_type}</strong> run on table <code>{activeScheduleForModal.table_name}</code>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {/* 1. Unit Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Run Frequency Type</label>
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                >
                  <option value="minutes">Run every X minutes</option>
                  <option value="hours">Run every X hours</option>
                  <option value="days">Run every X days</option>
                  <option value="weekly">Weekly / Bi-weekly (specific days)</option>
                  <option value="monthly">Monthly (specific date or pattern)</option>
                </select>
              </div>

              {/* 2. Parameters based on Unit */}
              {(customUnit === 'minutes' || customUnit === 'hours' || customUnit === 'days') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                    Interval (value of X)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customValue}
                    onChange={(e) => setCustomValue(parseInt(e.target.value) || 1)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              )}

              {customUnit === 'weekly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Select Days of the Week</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                      <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={customWeeklyDays.includes(d)}
                          onChange={(e) => {
                            if (e.target.checked) setCustomWeeklyDays([...customWeeklyDays, d]);
                            else setCustomWeeklyDays(customWeeklyDays.filter(day => day !== d));
                          }}
                        />
                        {d.substring(0, 3)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {customUnit === 'monthly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="monthlyMode"
                        checked={customMonthlyMode === 'date'}
                        onChange={() => setCustomMonthlyMode('date')}
                      />
                      Specific Date
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="monthlyMode"
                        checked={customMonthlyMode === 'pattern'}
                        onChange={() => setCustomMonthlyMode('pattern')}
                      />
                      Pattern (e.g. 1st Monday)
                    </label>
                  </div>

                  {customMonthlyMode === 'date' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#475569' }}>Day of Month (1-31)</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={customMonthlyDate}
                        onChange={(e) => setCustomMonthlyDate(parseInt(e.target.value) || 1)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <select
                        value={customMonthlyIndex}
                        onChange={(e) => setCustomMonthlyIndex(parseInt(e.target.value) || 1)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                      >
                        <option value="1">1st</option>
                        <option value="2">2nd</option>
                        <option value="3">3rd</option>
                        <option value="4">4th</option>
                        <option value="-1">Last</option>
                      </select>
                      <select
                        value={customMonthlyDay}
                        onChange={(e) => setCustomMonthlyDay(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                      >
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Start Time Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Start Time (UTC or selected timezone)</label>
                <input
                  type="time"
                  value={customStartTime}
                  onChange={(e) => setCustomStartTime(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', width: '100%' }}
                />
              </div>

              {/* 4. Timezone Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Timezone</label>
                <select
                  value={customTimezone}
                  onChange={(e) => setCustomTimezone(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                >
                  <option value="UTC">UTC</option>
                  <option value="EST">EST (Eastern Standard Time)</option>
                  <option value="CST">CST (Central Standard Time)</option>
                  <option value="PST">PST (Pacific Standard Time)</option>
                  <option value="IST">IST (Indian Standard Time)</option>
                  <option value="GMT">GMT (Greenwich Mean Time)</option>
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <button
                onClick={() => setShowCustomModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1',
                  background: 'none', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomSchedule}
                disabled={savingSchedule}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  background: '#6366f1', color: '#ffffff', fontSize: '13px', fontWeight: 600,
                  cursor: savingSchedule ? 'not-allowed' : 'pointer'
                }}
              >
                {savingSchedule ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {calculationModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)',
          zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '12px', padding: '24px', width: '600px',
            maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0', color: '#1e293b', position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, textTransform: 'capitalize' }}>
                {calculationModal.type} Score Breakdown
              </h3>
              <button
                onClick={() => setCalculationModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Detailed scoring calculation for table <code>{calculationModal.tableName}</code> based on the latest execution rules.
            </p>

            {/* Calculations Breakdown */}
            {(() => {
              const details = getCalculationDetails(calculationModal.type);
              const totalScore = details.reduce((acc, curr) => acc + curr.score, 0);
              const count = details.length;
              const average = count > 0 ? Math.round(totalScore / count) : 100;
              
              return (
                <div>
                  {count === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                      <p style={{ margin: 0, fontSize: '13px' }}>No active rules executed for this dimension.</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', fontWeight: 600, color: '#6366f1' }}>Defaulting to 100%</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Formula Box */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>Scoring Formula:</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#4f46e5', background: '#e0e7ff', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>
                          {details.map(d => `${d.score}%`).join(' + ')} {count > 1 ? `) / ${count}` : ''} = {average}%
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                          Average Score = (Sum of Rule Scores) / (Number of Rules)
                        </div>
                      </div>

                      {/* Rules Table */}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Rule Executions Breakdown:</div>
                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                                <th style={{ padding: '8px 12px' }}>Column</th>
                                <th style={{ padding: '8px 12px' }}>Rule Type</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Passed Rows</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Rows</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Rule Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < details.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.column}</td>
                                  <td style={{ padding: '8px 12px' }}>{item.rule}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 500 }}>{item.passed.toLocaleString()}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{item.total.toLocaleString()}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: item.score >= 80 ? '#16a34a' : item.score >= 50 ? '#d97706' : '#dc2626' }}>
                                    {item.score}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Summary stats */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '8px', padding: '12px 16px', marginTop: '8px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 600 }}>Calculated score</div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#581c87' }}>{average}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', color: '#6b21a8', display: 'block' }}>Sum: {totalScore}%</span>
                          <span style={{ fontSize: '12px', color: '#6b21a8', display: 'block' }}>Rules Count: {count}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Close Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <button
                onClick={() => setCalculationModal(null)}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: 'none',
                  background: '#6366f1', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <SuggestedRulesModal
        isOpen={isSuggestRulesModalOpen}
        onClose={() => setIsSuggestRulesModalOpen(false)}
        platform={platform}
        database={database!}
        schema={schema!}
        table={table!}
        columns={dynamicColumns}
        onRulesApplied={async () => {
          await pullRulesFromBackend(); // Force refresh rules from backend immediately
          setRefreshTrigger(prev => prev + 1);
        }}
      />
    </div>
  );
};

export default DataQualityDetail;
