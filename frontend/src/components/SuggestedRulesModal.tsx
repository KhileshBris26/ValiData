import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { X, Loader2, Save } from 'lucide-react';
import './SuggestedRulesModal.css';

interface GeneratedRule {
  temp_id: string; // generated locally for list keys
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
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns.map(c => c.attribute));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [rules, setRules] = useState<GeneratedRule[]>([]);
  const [error, setError] = useState('');
  
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
      if (saved) credentials = JSON.parse(saved)[platform];

      const response = await axios.post(`${API_BASE}/dq/suggest-rules`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        selected_columns: selectedColumns,
        credentials
      });
      
      if (response.data.status === 'success') {
        const rawRules = response.data.rules || [];
        setRules(rawRules.map((r: any, idx: number) => ({
          ...r,
          temp_id: `temp_rule_${idx}`,
          selected: true
        })));
      } else {
        setError(response.data.error_message || "Failed to generate rules for the selected columns.");
      }
    } catch (err: any) {
      console.error("Rule generation failed", err);
      // Ensure we extract the deepest error message
      const errMsg = err.response?.data?.detail?.error || err.response?.data?.detail || err.message || "Failed to generate rules.";
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
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
      if (saved) credentials = JSON.parse(saved)[platform];

      await axios.post(`${API_BASE}/dq/apply-rules`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table,
        rules: rulesToApply,
        credentials
      });
      
      onRulesApplied();
      onClose();
    } catch (err: any) {
      console.error("Apply rules failed", err);
      setError(err.response?.data?.detail || "Failed to apply rules.");
    } finally {
      setIsApplying(false);
    }
  };

  const selectedCount = rules.filter(r => r.selected).length;
  const hasRules = rules.length > 0;

  return (
    <div className="srm-overlay">
      <div className="srm-modal">
        <div className="srm-header">
          <h3>Suggested Rules for {table}</h3>
          <button className="srm-close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="srm-body">
          {error && <div className="srm-error">{error}</div>}
          
          <div className="srm-top-bar">
            <div className="srm-col-selector">
              <label>Select Columns:</label>
              <div className="srm-checkbox-group">
                {columns.map(c => (
                  <label key={c.attribute} className="srm-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.includes(c.attribute)} 
                      onChange={() => handleColumnToggle(c.attribute)} 
                    />
                    {c.attribute}
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

          {hasRules && (
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
                            checked={r.selected} 
                            onChange={() => handleToggleRule(r.temp_id)} 
                          />
                        </td>
                        <td className="srm-col-name">{r.column_name}</td>
                        <td className="srm-rule-type">
                          <span className="srm-badge">{r.rule_type}</span>
                        </td>
                        <td>{r.rule_description}</td>
                        <td>
                          <span className={`srm-badge-source ${r.source === 'AI' ? 'ai' : 'rule-based'}`}>
                            {r.source}
                          </span>
                        </td>
                        <td>
                          <span className="srm-confidence">
                            {r.confidence_score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        
        {hasRules && (
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
        )}
      </div>
    </div>
  );
};

export default SuggestedRulesModal;
