import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Layers, Radio, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import './ObservabilityConnectionDetail.css';

const ObservabilityConnectionDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Let's retrieve existing connections from localStorage
  const saved = localStorage.getItem('observability_connections');
  let connection: any = null;

  if (saved) {
    try {
      const all = JSON.parse(saved);
      connection = all.find((c: any) => String(c.id) === String(id));
    } catch (e) {
      // Fallback
    }
  }

  // Sample fallback if connection wasn't found
  if (!connection) {
    connection = {
      id: Number(id) || 1,
      name: Number(id) === 1 ? 'Demo Airflow' : 'Demo dbt Core',
      totalJobs: Number(id) === 1 ? 14 : 6,
      type: Number(id) === 1 ? 'Airflow with OpenLineage' : 'dbt Core with OpenLineage',
      created: 'Oct 21, 2025',
      lastEvent: 'yesterday'
    };
  }

  const isDbt = connection.type.toLowerCase().includes('dbt');

  // Sample jobs list
  const dbtJobs = [
    { id: 1, name: 'jaffle_shop.dbt-run-jaffle_shop', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Failed' },
    { id: 2, name: 'jaffle_shop.model.jaffle_shop.customers', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Failed' },
    { id: 3, name: 'jaffle_shop.model.jaffle_shop.orders', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Failed' },
    { id: 4, name: 'jaffle_shop.model.jaffle_shop.stg_customers', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Completed' },
    { id: 5, name: 'jaffle_shop.model.jaffle_shop.stg_orders', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Completed' },
    { id: 6, name: 'jaffle_shop.model.jaffle_shop.stg_payments', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Completed' }
  ];

  const airflowJobs = [
    { id: 11, name: 'airflow_demo.cosmos_jaffle_shop_demo.run_jaffle_shop', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Failed' },
    { id: 12, name: 'airflow_demo.cosmos_jaffle_shop_demo.raw_payments_seed', start: 'Oct 21, 2025, 8:56 AM', end: 'Oct 21, 2025, 8:56 AM', duration: 'Less than a second', status: 'Failed' }
  ];

  const jobs = isDbt ? dbtJobs : airflowJobs;

  return (
    <div className="obs-connection-detail-page">
      <div className="detail-header-nav">
        <button className="btn-back" onClick={() => navigate('/observability/connections')}>
          <ChevronLeft size={16} /> <span>Connections</span>
        </button>
        <span className="category-crumb">Orchestrator connections</span>
      </div>

      <div className="connection-header-row">
        <h1 className="connection-title">{connection.name}</h1>
      </div>

      <div className="tabs-header">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="tab-panel overview-panel">
          <div className="detail-summary-card glass-panel">
            <div className="jobs-stat">
              <span className="stat-label">Total jobs</span>
              <span className="stat-value">{connection.totalJobs}</span>
            </div>

            <div className="connection-meta-grid">
              <div className="meta-row">
                <span className="meta-label">Connection name</span>
                <span className="meta-value">{connection.name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Connection type</span>
                <span className="meta-value highlight-type">
                  {isDbt ? (
                    <span className="type-badge dbt"><Layers size={14} color="#ff3621" /> {connection.type}</span>
                  ) : (
                    <span className="type-badge airflow"><Radio size={14} color="#00a4e4" /> {connection.type}</span>
                  )}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Created</span>
                <span className="meta-value">{connection.created}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Last event</span>
                <span className="meta-value">{connection.lastEvent}</span>
              </div>
            </div>
          </div>

          <div className="jobs-list-section">
            <div className="list-header">
              <h2 className="jobs-count-title">{jobs.length} jobs</h2>
              <div className="list-actions">
                <span className="live-badge"><Clock size={12} /> now</span>
                <button className="btn btn-refresh btn-secondary-outline">
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            <div className="jobs-table-container glass-panel">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Last run start</th>
                    <th>Last run end</th>
                    <th>Last run duration</th>
                    <th>Last run status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const isFailed = j.status.toLowerCase() === 'failed';
                    return (
                      <tr key={j.id}>
                        <td className="job-name">{j.name}</td>
                        <td className="job-date">{j.start}</td>
                        <td className="job-date">{j.end}</td>
                        <td className="job-duration">{j.duration}</td>
                        <td className="job-status">
                          <span className={`status-badge ${isFailed ? 'failed' : 'completed'}`}>
                            {isFailed ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                            {j.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="tab-panel settings-panel glass-panel">
          <h3>Connection Settings</h3>
          <p className="settings-desc">Configure your OpenLineage API endpoints and listener configurations for real-time asset discovery.</p>
          <div className="settings-form">
            <div className="form-group">
              <label>Lineage HTTP Endpoint</label>
              <input type="text" className="input-field" disabled value="https://api.robin-observability.io/v1/lineage" />
            </div>
            <div className="form-group">
              <label>API Auth Token</label>
              <input type="password" className="input-field" disabled value="••••••••••••••••••••••••" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ObservabilityConnectionDetail;
