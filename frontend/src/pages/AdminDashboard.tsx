import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Server, FileText, Settings, ArrowLeft, LogOut, CheckCircle, Search, Filter } from 'lucide-react';
import { authService } from '../services/authService';
import type { UserRequest } from '../services/authService';
import './AdminDashboard.css';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tools' | 'requests'>('tools');
  const [pendingRequests, setPendingRequests] = useState<UserRequest[]>([]);
  const [processedRequests, setProcessedRequests] = useState<UserRequest[]>([]);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'SNOWFLAKE' | 'DATABRICKS'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');

  // Gate page from regular users
  useEffect(() => {
    const role = localStorage.getItem('user_type');
    if (role !== 'admin') {
      navigate('/');
    }
  }, [navigate]);

  const loadRequests = () => {
    const pending = authService.getUsersByStatus('PENDING');
    const approved = authService.getUsersByStatus('APPROVED');
    const rejected = authService.getUsersByStatus('REJECTED');
    setPendingRequests(pending);
    setProcessedRequests([...approved, ...rejected]);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    const res = authService.approveUser(id, adminUser);
    if (res.success) {
      setActiveMessage(`User request approved successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    }
  };

  const handleReject = (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    const res = authService.rejectUser(id, adminUser);
    if (res.success) {
      setActiveMessage(`User request rejected successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('robin_auth_token');
    localStorage.removeItem('robin_user');
    localStorage.removeItem('selected_role');
    localStorage.removeItem('user_type');
    localStorage.removeItem('is_authenticated');
    navigate('/login');
  };

  const showSimulatedAction = (actionName: string) => {
    setActiveMessage(`Simulated action: "${actionName}" executed successfully in admin sandbox!`);
    setTimeout(() => setActiveMessage(null), 4000);
  };

  // Filter pending requests
  const filteredPending = pendingRequests.filter(req => {
    const matchesSearch = 
      req.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesPlatform = 
      platformFilter === 'ALL' || 
      req.selected_platform.toLowerCase() === platformFilter.toLowerCase();
      
    return matchesSearch && matchesPlatform;
  });

  // Filter processed requests
  const filteredProcessed = processedRequests.filter(req => {
    const matchesSearch = 
      req.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesPlatform = 
      platformFilter === 'ALL' || 
      req.selected_platform.toLowerCase() === platformFilter.toLowerCase();
      
    const matchesStatus = 
      statusFilter === 'ALL' || 
      req.status.toLowerCase() === statusFilter.toLowerCase();
      
    return matchesSearch && matchesPlatform && matchesStatus;
  });

  const adminCards = [
    {
      title: 'User Permissions',
      desc: 'Promote users to admins, manage global roles, and configure directory integrations.',
      icon: Users,
      color: '#8b5cf6',
      action: 'Manage Access Control'
    },
    {
      title: 'Platform Connection Audits',
      desc: 'View live warehouse sessions, connection failures, and credential rotations.',
      icon: Server,
      color: '#3b82f6',
      action: 'View Connection History'
    },
    {
      title: 'Audit & System Logs',
      desc: 'Analyze control plane errors, audit queries, and inspect scheduler runtime daemon logs.',
      icon: FileText,
      color: '#10b981',
      action: 'Download System Logs'
    },
    {
      title: 'Global System Settings',
      desc: 'Set system-wide alerting thresholds, enable/disable schedulers, and adjust cache TTLs.',
      icon: Settings,
      color: '#f59e0b',
      action: 'Configure Overrides'
    }
  ];

  return (
    <div className="admin-container">
      <div className="admin-background">
        <div className="admin-blob"></div>
        <div className="admin-blob"></div>
      </div>

      <div className="admin-card-container glass-panel">
        <div className="admin-header-section">
          <div className="admin-title-row">
            <div className="shield-icon-bg">
              <Shield size={28} color="#8b5cf6" />
            </div>
            <div>
              <h1 className="admin-main-title">Admin Command Center</h1>
              <p className="admin-subtitle">ValiData Control Plane Management Portal</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <button onClick={() => navigate('/')} className="btn-admin-nav">
              <ArrowLeft size={16} />
              <span>Go to main app</span>
            </button>
            <button onClick={handleSignOut} className="btn-admin-signout">
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {activeMessage && (
          <div className="admin-toast-message">
            <CheckCircle size={16} color="#10b981" />
            <span>{activeMessage}</span>
          </div>
        )}

        <div className="admin-body-layout">
          {/* Left Navigation Sidebar */}
          <aside className="admin-sidebar">
            <button 
              className={`admin-sidebar-btn ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <Server size={18} />
              <span>System Tools</span>
            </button>
            <button 
              className={`admin-sidebar-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              <Users size={18} />
              <span>Access Requests</span>
              {pendingRequests.length > 0 && (
                <span className="sidebar-badge">{pendingRequests.length}</span>
              )}
            </button>
          </aside>

          {/* Right Content Area */}
          <main className="admin-content-area">
            {activeTab === 'tools' ? (
              <div className="admin-tools-grid">
                {adminCards.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <div key={idx} className="admin-tool-card">
                      <div className="admin-card-header">
                        <div className="admin-card-icon" style={{ backgroundColor: `${card.color}15`, color: card.color }}>
                          <Icon size={20} />
                        </div>
                        <h3>{card.title}</h3>
                      </div>
                      <p className="admin-card-desc">{card.desc}</p>
                      <button 
                        onClick={() => showSimulatedAction(card.action)}
                        className="btn-admin-action"
                        style={{ border: `1px solid ${card.color}30`, color: card.color }}
                      >
                        {card.action}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="admin-requests-view">
                {/* Search & Filter Panel */}
                <div className="search-filter-container">
                  <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search by name, username, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="filter-controls">
                    <div className="filter-group">
                      <Filter size={14} className="filter-icon" />
                      <select 
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as any)}
                        className="filter-select"
                      >
                        <option value="ALL">All Platforms</option>
                        <option value="SNOWFLAKE">Snowflake</option>
                        <option value="DATABRICKS">Databricks</option>
                      </select>
                    </div>
                    
                    <div className="filter-group">
                      <Filter size={14} className="filter-icon" />
                      <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="filter-select"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>

                <h2 className="requests-section-title">Pending Access Requests</h2>
                <div className="admin-table-container">
                  {filteredPending.length === 0 ? (
                    <div className="empty-state">No pending access requests match the filters.</div>
                  ) : (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Full Name</th>
                          <th>Username</th>
                          <th>Email</th>
                          <th>Platform</th>
                          <th>Requested At</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPending.map(req => (
                          <tr key={req.id}>
                            <td className="font-semibold">{req.full_name}</td>
                            <td>{req.username}</td>
                            <td>{req.email}</td>
                            <td>
                              <span className="badge platform">{req.selected_platform}</span>
                            </td>
                            <td>{req.requested_at_timestamp}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => handleApprove(req.id)} className="btn-approve">
                                Approve
                              </button>
                              <button onClick={() => handleReject(req.id)} className="btn-reject">
                                Reject
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <h2 className="requests-section-title">Processed Requests</h2>
                <div className="admin-table-container">
                  {filteredProcessed.length === 0 ? (
                    <div className="empty-state">No processed requests match the filters.</div>
                  ) : (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Full Name</th>
                          <th>Username</th>
                          <th>Email</th>
                          <th>Platform</th>
                          <th>Status</th>
                          <th>Requested At</th>
                          <th>Action Date</th>
                          <th>Actioned By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProcessed.map(req => (
                          <tr key={req.id}>
                            <td className="font-semibold">{req.full_name}</td>
                            <td>{req.username}</td>
                            <td>{req.email}</td>
                            <td>
                              <span className="badge platform">{req.selected_platform}</span>
                            </td>
                            <td>
                              <span className={`badge ${req.status.toLowerCase()}`}>
                                {req.status}
                              </span>
                            </td>
                            <td>{req.requested_at_timestamp}</td>
                            <td>
                              {req.status === 'APPROVED' ? req.approved_at_timestamp : req.rejected_at_timestamp}
                            </td>
                            <td>
                              <span className="admin-user-tag">
                                {req.status === 'APPROVED' ? req.approved_by || 'System' : req.rejected_by || 'System'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
