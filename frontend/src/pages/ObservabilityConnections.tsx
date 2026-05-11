import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Radio, CheckCircle, ExternalLink, Activity, Sparkles, Layers } from 'lucide-react';
import './ObservabilityConnections.css';

interface Connection {
  id: number;
  name: string;
  totalJobs: number;
  type: string;
  created: string;
  lastEvent: string;
}

const ObservabilityConnections: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>(() => {
    const saved = sessionStorage.getItem('observability_connections');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return [
      {
        id: 1,
        name: 'Demo Airflow',
        totalJobs: 14,
        type: 'Airflow with OpenLineage',
        created: 'Oct 21, 2025',
        lastEvent: 'yesterday'
      },
      {
        id: 2,
        name: 'Demo dbt Core',
        totalJobs: 6,
        type: 'dbt Core with OpenLineage',
        created: 'Oct 21, 2025',
        lastEvent: 'yesterday'
      }
    ];
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [activeDetails, setActiveDetails] = useState<number | null>(null);

  // Add form fields
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Airflow with OpenLineage');
  const [newTotalJobs, setNewTotalJobs] = useState(0);

  useEffect(() => {
    sessionStorage.setItem('observability_connections', JSON.stringify(connections));
  }, [connections]);

  const handleAddConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newConn: Connection = {
      id: Date.now(),
      name: newName,
      totalJobs: Number(newTotalJobs) || 0,
      type: newType,
      created: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      lastEvent: 'just now'
    };

    setConnections(prev => [...prev, newConn]);
    setNewName('');
    setNewType('Airflow with OpenLineage');
    setNewTotalJobs(0);
    setShowAddForm(false);
  };

  const deleteConnection = (id: number) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    if (activeDetails === id) setActiveDetails(null);
  };

  const toggleDetails = (id: number) => {
    setActiveDetails(prev => (prev === id ? null : id));
  };

  return (
    <div className="obs-connections-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Observability</h1>
          <p className="subtitle">Real-time health telemetry and lineage synchronization for your data orchestrators and transformation apps.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={18} />
          <span>Add connection</span>
        </button>
      </div>

      {showAddForm && (
        <form className="add-connection-form glass-panel" onSubmit={handleAddConnection}>
          <h3>New Observability Connection</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Connection Name</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="e.g. Production dbt Core" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Connection Type</label>
              <select className="input-field" value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="Airflow with OpenLineage">Airflow with OpenLineage</option>
                <option value="dbt Core with OpenLineage">dbt Core with OpenLineage</option>
                <option value="Prefect with OpenLineage">Prefect with OpenLineage</option>
                <option value="Dagster with OpenLineage">Dagster with OpenLineage</option>
              </select>
            </div>
            <div className="form-group">
              <label>Total Jobs / Direct Runs</label>
              <input 
                type="number" 
                className="input-field" 
                placeholder="e.g. 10" 
                value={newTotalJobs} 
                onChange={e => setNewTotalJobs(Number(e.target.value))} 
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary-outline" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Connection</button>
          </div>
        </form>
      )}

      <div className="connections-grid">
        {connections.map(conn => {
          const isDbt = conn.type.toLowerCase().includes('dbt');
          return (
            <div key={conn.id} className="connection-card glass-panel">
              <div className="card-header">
                <div className="title-area">
                  <span className="platform-icon-container">
                    {isDbt ? <Layers size={18} color="#ff3621" /> : <Radio size={18} color="#00a4e4" />}
                  </span>
                  <h3>{conn.name}</h3>
                </div>
                <button className="btn-text-action" onClick={() => navigate(`/observability/connections/${conn.id}`)}>
                  <span>View details</span>
                  <ExternalLink size={14} />
                </button>
              </div>

              <div className="card-body">
                <div className="jobs-stat">
                  <span className="stat-label">Total jobs</span>
                  <span className="stat-value">{conn.totalJobs}</span>
                </div>

                <div className="connection-meta-grid">
                  <div className="meta-row">
                    <span className="meta-label">Connection name</span>
                    <span className="meta-value">{conn.name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Connection type</span>
                    <span className="meta-value highlight-type">
                      {isDbt ? (
                        <span className="type-badge dbt"><Sparkles size={12} /> {conn.type}</span>
                      ) : (
                        <span className="type-badge airflow"><Activity size={12} /> {conn.type}</span>
                      )}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Created</span>
                    <span className="meta-value">{conn.created}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Last event</span>
                    <span className="meta-value">{conn.lastEvent}</span>
                  </div>
                </div>
              </div>

              {activeDetails === conn.id && (
                <div className="card-expanded-details">
                  <div className="details-header">
                    <h4>Connected Assets & Telemetry</h4>
                    <button className="btn-delete" onClick={() => deleteConnection(conn.id)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                  <p>OpenLineage events are actively ingested for this connection. All asset dependencies and transforms are mapped dynamically to the active Lineage graph.</p>
                  <div className="telemetry-badges">
                    <span className="badge-ok"><CheckCircle size={12} /> Healthy</span>
                    <span className="badge-metric"><strong>Pulse:</strong> Active</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ObservabilityConnections;
