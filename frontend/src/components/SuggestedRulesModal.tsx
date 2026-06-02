import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { X, Loader2, Save } from 'lucide-react';
import './SuggestedRulesModal.css';

interface GeneratedRule {
  temp_id: string;
  column_name: string;
  rule_type: string;
  rule_description: string;
  rule_params: any;
  confidence_score: string;
  source: string;
  selected: boolean;
}

interface SuggestedRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string;
  database: string;
  schema: string;
  table: string;
  columns: { attribute: string }[];
  onRulesApplied: () => void;
}

const SuggestedRulesModal: React.FC<SuggestedRulesModalProps> = ({
  isOpen,
  onClose,
  platform,
  database,
  schema,
  table,
  columns,
  onRulesApplied
}) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns ? columns.map(c => c.attribute) : []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [rules, setRules] = useState<GeneratedRule[]>([]);
  const [error, setError] = useState<string>('');
  
  if (!isOpen) return null;

  const handleColumnToggle = (col: string) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleGenerate = async () => {
    if (selectedColumns.length === 0) {
      setError("Please select at least one column.");
      return;
    }
    
    setIsGenerating(true);
    setError('');
    setRules([]);
    
    try {
      const saved = localStorage.getItem('robin_credentials');
      let credentials = null;
      if (saved) {
        try {
          credentials = JSON.parse(saved)[platform];
        } catch (e) {
          // ignore parsing error
        }
      }

      const response = await axios.post(`${API_BASE}/dq/suggest-rules`, {
        platform: String(platform || ''),
        database_name: String(database || ''),
        schema_name: String(schema || ''),
        table_name: String(table || ''),
        selected_columns: selectedColumns,
        credentials
      });
      
      if (response && response.data && response.data.status === 'success') {
        const rawRules = Array.isArray(response.data.rules) ? response.data.rules : [];
        setRules(rawRules.map((r: any, idx: number) => ({
          temp_id: `temp_rule_${idx}`,
          column_name: String(r?.column_name || ''),
          rule_type: String(r?.rule_type || ''),
          rule_description: String(r?.rule_description || ''),
          rule_params: r?.rule_params,
          confidence_score: String(r?.confidence_score || ''),
          source: String(r?.source || ''),
          selected: true
        })));
      } else {
        const msg = response?.data?.error_message;
        setError(typeof msg === 'string' ? msg : "Failed to generate rules for the selected columns.");
      }
    } catch (err: any) {
      console.error("Rule generation failed", err);
      try {
        const detail = err.response?.data?.detail;
        if (detail) {
          if (typeof detail === 'string') {
            setError(detail);
          } else if (typeof detail.error === 'string') {
            setError(detail.error);
          } else {
            setError(JSON.stringify(detail));
          }
        } else {
          setError(err.message || "Failed to generate rules.");
        }
      } catch (safeErr) {
        setError("An unexpected error occurred.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleRule = (temp_id: string) => {
    setRules(prev => prev.map(r => r.temp_id === temp_id ? { ...r, selected: !r.selected } : r));
  };

  const handleToggleAll = (checked: boolean) => {
    setRules(prev => prev.map(r => ({ ...r, selected: checked })));
  };

  const handleApply = async () => {
    const rulesToApply = rules.filter(r => r.selected);
    if (rulesToApply.length === 0) {
      setError("Please select at least one rule to apply.");
      return;
    }

    setIsApplying(true);
    setError('');

    try {
      const saved = localStorage.getItem('robin_credentials');
      let credentials = null;
      if (saved) {
        try {
          credentials = JSON.parse(saved)[platform];
        } catch (e) { }
      }

      await axios.post(`${API_BASE}/dq/apply-rules`, {
        platform: String(platform || ''),
        database_name: String(database || ''),
        schema_name: String(schema || ''),
        table_name: String(table || ''),
        rules: rulesToApply,
        credentials
      });
      
      onRulesApplied();
      onClose();
    } catch (err: any) {
      console.error("Apply rules failed", err);
      try {
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : (err.message || "Failed to apply rules."));
      } catch (safeErr) {
        setError("An unexpected error occurred while saving.");
      }
    } finally {
      setIsApplying(false);
    }
  };

  const selectedCount = Array.isArray(rules) ? rules.filter(r => r && r.selected).length : 0;
  const hasRules = Array.isArray(rules) && rules.length > 0;

  return (
    <div className="srm-overlay">
      <div className="srm-modal">
        <div className="srm-header">
          <h3>Suggested Rules for {String(table || '')}</h3>
          <button className="srm-close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="srm-body">
          {error ? <div className="srm-error">{String(error)}</div> : null}
          
          <div className="srm-top-bar">
            <div className="srm-col-selector">
              <label>Select Columns:</label>
              <div className="srm-checkbox-group">
                {Array.isArray(columns) && columns.length > 0 && (
                  <label className="srm-checkbox-label srm-select-all-cols">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.length === columns.length} 
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns(columns.map(c => c?.attribute || ''));
                        } else {
                          setSelectedColumns([]);
                        }
                      }} 
                    />
                    <strong>Select All</strong>
                  </label>
                )}
                {Array.isArray(columns) && columns.map(c => (
                  <label key={c?.attribute || Math.random()} className="srm-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.includes(c?.attribute || '')} 
                      onChange={() => handleColumnToggle(c?.attribute || '')} 
                    />
                    {String(c?.attribute || '')}
                  </label>
                ))}
              </div>
            </div>
            <button 
              className="srm-btn-primary" 
              onClick={handleGenerate} 
              disabled={isGenerating || selectedColumns.length === 0}
            >
              {isGenerating ? <><Loader2 size={16} className="spinner" /> Generating...</> : 'Generate Rules'}
            </button>
          </div>

          {hasRules ? (
            <div className="srm-rules-container">
              <div className="srm-rules-header">
                <h4>Generated Rules</h4>
                <label className="srm-select-all">
                  <input 
                    type="checkbox" 
                    checked={selectedCount === rules.length} 
                    onChange={(e) => handleToggleAll(e.target.checked)} 
                  />
                  Select All
                </label>
              </div>
              <div className="srm-table-wrapper">
                <table className="srm-table">
                  <thead>
                    <tr>
                      <th>Apply</th>
                      <th>Column</th>
                      <th>Rule Type</th>
                      <th>Description</th>
                      <th>Source</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.temp_id} className={r.selected ? 'selected-row' : ''}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={!!r.selected} 
                            onChange={() => handleToggleRule(r.temp_id)} 
                          />
                        </td>
                        <td className="srm-col-name">{String(r.column_name)}</td>
                        <td className="srm-rule-type">
                          <span className="srm-badge">{String(r.rule_type)}</span>
                        </td>
                        <td>{String(r.rule_description)}</td>
                        <td>
                          <span className={`srm-badge-source ${r.source === 'AI' ? 'ai' : 'rule-based'}`}>
                            {String(r.source)}
                          </span>
                        </td>
                        <td>
                          <span className="srm-confidence">
                            {String(r.confidence_score)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
        
        {hasRules ? (
          <div className="srm-footer">
            <span className="srm-selection-count">{selectedCount} rules selected</span>
            <button 
              className="srm-btn-success" 
              onClick={handleApply} 
              disabled={isApplying || selectedCount === 0}
            >
              {isApplying ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save & Apply</>}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SuggestedRulesModal;
