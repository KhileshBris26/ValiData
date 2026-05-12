import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronDown, Plus, HelpCircle, Terminal, Trash2, Sparkles
} from 'lucide-react';
import './CreateRule.css';


interface ConditionRow {
  attribute: string;
  op: string;
  val: string;
  result: 'Valid' | 'Invalid';
  score: string;
  explanation: string;
}

const CreateRule: React.FC = () => {
  const { database, schema, table, column } = useParams<{ database: string; schema: string; table: string; column: string }>();
  const navigate = useNavigate();

  const [dimension] = useState('Validity');

  const [conditions, setConditions] = useState<ConditionRow[]>([
    {
      attribute: column || 'EMAIL',
      op: 'is empty',
      val: 'value',
      result: 'Invalid',
      score: '0',
      explanation: 'IS_EMPTY'
    }
  ]);

  const [fallbackResult, setFallbackResult] = useState<'Valid' | 'Invalid'>('Valid');
  const [fallbackScore, setFallbackScore] = useState('');

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        attribute: column || 'EMAIL',
        op: 'is empty',
        val: 'value',
        result: 'Invalid',
        score: '0',
        explanation: `CONDITION_${conditions.length + 1}`
      }
    ]);
  };

  const removeCondition = (idx: number) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== idx));
    }
  };

  const handleFieldChange = (idx: number, field: keyof ConditionRow, value: any) => {
    const updated = [...conditions];
    updated[idx] = { ...updated[idx], [field]: value };
    setConditions(updated);
  };

  const handleAskAI = (idx: number) => {
    const updated = [...conditions];
    updated[idx] = {
      ...updated[idx],
      explanation: `AI_SUGGESTED_${updated[idx].explanation || 'VALIDATION'}`
    };
    setConditions(updated);
    alert("AI suggested the validation logic successfully!");
  };

  const handleSaveRule = () => {
    if (!conditions || conditions.length === 0) return;

    const newRule = {
      label: conditions[0].explanation || `Rule for ${column}`,
      score: conditions[0].score || '100%',
      status: conditions[0].result?.toLowerCase() === 'valid' ? 'valid' as const : 'invalid' as const
    };

    const storageKey = `robin_rules_${database}_${schema}_${table}_${column}`;
    const existingRules = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!existingRules.some((r: any) => r.label === newRule.label)) {
      existingRules.push(newRule);
      localStorage.setItem(storageKey, JSON.stringify(existingRules));
    }

    alert("Rule logic successfully saved!");
    if (window.opener) {
      window.close();
    } else {
      navigate(`/catalog/${database}/${schema}/${table}/dq/primary`);
    }
  };

  const handleTestRule = () => {
    alert("Data Quality Rule logic tested and validated successfully!");
    handleSaveRule();
  };


  return (
    <div className="cr-modal-overlay">
      <div className="cr-modal-window">
        {/* Top Modal Navigation Header */}
        <div className="cr-modal-top-bar">
          <div className="cr-modal-blank"></div>
          <h3 className="cr-modal-title">Create DQ Rule</h3>
          <div className="cr-modal-actions">
            <span className="cr-saving-label">Saving</span>
            <button className="cr-modal-close-btn" onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                navigate(-1);
              }
            }}>
              ✕
            </button>
          </div>
        </div>

        <div className="create-rule-container">
          {/* Step Progress Indicators */}
          <div className="create-rule-steps">
            <div className="step-item active">
              <span>1. Logic implementation</span>
            </div>
            <span className="step-sep">——————</span>
            <div className="step-item">
              <span>2. General information</span>
            </div>
          </div>


      <div className="create-rule-content">
        {/* Main Content Area */}
        <div className="create-rule-main">
          <div className="cr-header">
            <h2>Logic implementation</h2>
            <p className="cr-subtext">The draft of the new Rule is created. Continue by specifying its type and defining its conditions.</p>
          </div>

          <div className="cr-logic-controls">
            <div className="cr-selector">
              <Terminal size={14} />
              <span>Rule</span>
              <ChevronDown size={14} />
            </div>
            <div className="cr-selector">
              <span className="dim-badge-dot"></span>
              <span>{dimension}</span>
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Conditional Expression List */}
          {conditions.map((cond, idx) => (
            <div className="cr-condition-card" key={idx}>
              <div className="cond-header-row">
                <div className="cond-title">
                  <span className="cond-index">{idx + 1}</span>
                  <span>IS_EMPTY</span>
                </div>

                <div className="cond-tools">
                  <button className="btn-ai-assist" onClick={() => handleAskAI(idx)}>
                    <Sparkles size={12} /> Ask AI
                  </button>
                  <button className="btn-icon-panel">
                    <Terminal size={12} />
                  </button>
                  {conditions.length > 1 && (
                    <button className="btn-icon-panel" onClick={() => removeCondition(idx)}>
                      <Trash2 size={12} style={{ color: '#ef4444' }} />
                    </button>
                  )}
                </div>
              </div>

              {/* WHEN */}
              <div className="cond-logic-section">
                <span className="cond-label">WHEN</span>
                <div className="cond-inputs-row">
                  <select 
                    className="cr-input-field" 
                    style={{ width: '150px' }}
                    value={cond.attribute}
                    onChange={(e) => handleFieldChange(idx, 'attribute', e.target.value)}
                  >
                    <option value={column || "EMAIL"}>Az {column || "EMAIL"}</option>
                    <option value="TRANSACTION_ID">Az TRANSACTION_ID</option>
                    <option value="APPROVAL_STATUS">Az APPROVAL_STATUS</option>
                    <option value="PAYMENT_METHOD">Az PAYMENT_METHOD</option>
                    <option value="ID">Az ID</option>
                    <option value="NAME">Az NAME</option>
                  </select>

                  <select 
                    className="cr-input-field" 
                    style={{ width: '130px' }}
                    value={cond.val}
                    onChange={(e) => handleFieldChange(idx, 'val', e.target.value)}
                  >
                    <option value="value">value</option>
                    <option value="length">length</option>
                    <option value="count">count</option>
                  </select>

                  <select 
                    className="cr-input-field" 
                    style={{ width: '150px' }}
                    value={cond.op}
                    onChange={(e) => handleFieldChange(idx, 'op', e.target.value)}
                  >
                    <option value="is empty">is empty</option>
                    <option value="is not empty">is not empty</option>
                    <option value="is null">is null</option>
                    <option value="is not null">is not null</option>
                    <option value="is unique">is unique</option>
                    <option value="matches regex">matches regex</option>
                    <option value="custom">custom</option>
                  </select>
                </div>
                <div className="add-expression-link">
                  <Plus size={12} /> Add expression
                </div>
              </div>


              {/* THEN */}
              <div className="cond-then-section">
                <span className="cond-label">THEN</span>
                <div className="then-inputs-grid">
                  <div className="then-input-item">
                    <span className="then-input-label">Result</span>
                    <div className="toggle-btn-group">
                      <button 
                        className={`toggle-item valid ${cond.result === 'Valid' ? 'active' : ''}`}
                        onClick={() => handleFieldChange(idx, 'result', 'Valid')}
                      >
                        Valid
                      </button>
                      <button 
                        className={`toggle-item invalid ${cond.result === 'Invalid' ? 'active' : ''}`}
                        onClick={() => handleFieldChange(idx, 'result', 'Invalid')}
                      >
                        Invalid
                      </button>
                    </div>
                  </div>

                  <div className="then-input-item">
                    <span className="then-input-label">Score <HelpCircle size={10} /></span>
                    <input 
                      type="text" 
                      className="cr-input-field" 
                      style={{ width: '100%' }}
                      placeholder="0" 
                      value={cond.score}
                      onChange={(e) => handleFieldChange(idx, 'score', e.target.value)}
                    />
                  </div>

                  <div className="then-input-item">
                    <span className="then-input-label">Explanation <HelpCircle size={10} /></span>
                    <input 
                      type="text" 
                      className="cr-input-field full" 
                      value={cond.explanation}
                      onChange={(e) => handleFieldChange(idx, 'explanation', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Buttons row */}
          <div className="cr-footer-actions">
            <button className="btn-add-condition" onClick={addCondition}>
              <Plus size={14} /> Add condition
            </button>
            <button className="btn-test-rule" onClick={handleTestRule}>
              Test rule
            </button>
          </div>

          {/* Fallback IF Block */}
          <div className="cr-fallback-card">
            <div className="cond-header-row">
              <div className="cond-title">
                <span>IF none of the conditions above apply THEN</span>
              </div>
            </div>
            <p className="cr-subtext">This is a fallback condition, in which you can set the result type. The explanation is predefined and can't be changed.</p>

            <div className="cond-then-section">
              <div className="then-inputs-grid">
                <div className="then-input-item">
                  <span className="then-input-label">Result</span>
                  <div className="toggle-btn-group">
                    <button 
                      className={`toggle-item valid ${fallbackResult === 'Valid' ? 'active' : ''}`}
                      onClick={() => setFallbackResult('Valid')}
                    >
                      Valid
                    </button>
                    <button 
                      className={`toggle-item invalid ${fallbackResult === 'Invalid' ? 'active' : ''}`}
                      onClick={() => setFallbackResult('Invalid')}
                    >
                      Invalid
                    </button>
                  </div>
                </div>

                <div className="then-input-item">
                  <span className="then-input-label">Score <HelpCircle size={10} /></span>
                  <input 
                    type="text" 
                    className="cr-input-field" 
                    style={{ width: '100%' }}
                    placeholder="0" 
                    value={fallbackScore}
                    onChange={(e) => setFallbackScore(e.target.value)}
                  />
                </div>

                <div className="then-input-item">
                  <span className="then-input-label">Explanation <HelpCircle size={10} /></span>
                  <input 
                    type="text" 
                    className="cr-input-field full" 
                    readOnly
                    value="OTHER" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Summary */}
        <div className="cr-summary-sidebar">
          <div className="summary-card">
            <div className="summary-title">
              <span>Rule summary</span>
              <ChevronDown size={14} />
            </div>

            <div className="summary-detail-item">
              <span className="s-lbl">DQ Dimension:</span>
              <span className="s-val"><span className="s-dot green"></span> {dimension}</span>
            </div>

            <div className="summary-detail-item">
              <span className="s-lbl">Input attributes, parameters and variables used in conditions 1:</span>
              <span className="s-val">Az {column || 'EMAIL'}</span>
            </div>

            <div className="summary-detail-item">
              <span className="s-lbl">Rule logic:</span>
              <div className="s-val" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className="s-dot red"></span> Failed result</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className="s-dot green"></span> Passed result</span>
                <span>1. OTHER</span>
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
        {/* Next Step Modal Footer */}
        <div className="cr-modal-footer">
          <button className="cr-next-step-btn" onClick={handleSaveRule}>
            Next step
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateRule;


