import React from 'react';
import { Activity, Database, CheckCircle, AlertTriangle } from 'lucide-react';
import './Dashboard.css';

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="stat-card glass-panel">
    <div className="stat-icon" style={{ backgroundColor: `${color}20`, color }}>
      <Icon size={24} />
    </div>
    <div className="stat-info">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="dashboard">
      <h1 className="page-title">Data Quality Command Center</h1>
      
      <div className="stats-grid">
        <StatCard icon={Database} label="Connected Platforms" value="2" color="#3b82f6" />
        <StatCard icon={Activity} label="Active Rules" value="24" color="#8b5cf6" />
        <StatCard icon={CheckCircle} label="Passed Checks" value="1,432" color="#10b981" />
        <StatCard icon={AlertTriangle} label="Anomalies Detected" value="12" color="#ef4444" />
      </div>

      <div className="dashboard-content glass-panel">
        <h2>System Health</h2>
        <div className="health-metrics">
          <div className="metric">
            <span>Snowflake Data Cloud</span>
            <span className="status healthy">Operational</span>
          </div>
          <div className="metric">
            <span>Databricks Intelligence</span>
            <span className="status healthy">Operational</span>
          </div>
        </div>
        <p className="placeholder-text">Lineage and Query History modules will be populated here in future phases.</p>
      </div>
    </div>
  );
};

export default Dashboard;
