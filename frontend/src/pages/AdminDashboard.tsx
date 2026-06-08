import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Server, FileText, Settings, ArrowLeft, LogOut, CheckCircle, Search, Filter } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../api';
import './AdminDashboard.css';

export interface AdminUser {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  email: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  platform: string;
  created_at?: string;
  approved_at?: string;
  approved_by?: string;
  revoked_at?: string;
  last_login_at?: string;
  roles?: string | string[];
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tools' | 'users'>('users');
  const [pendingRequests, setPendingRequests] = useState<AdminUser[]>([]);
  const [processedRequests, setProcessedRequests] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'SNOWFLAKE' | 'DATABRICKS'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED' | 'REVOKED'>('ALL');

  // Gate page from regular users
  useEffect(() => {
    const role = localStorage.getItem('user_type');
    if (role !== 'admin') {
      navigate('/');
    }
  }, [navigate]);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/admin/users`);
      const allUsers = response.data.users || [];
      const pending = allUsers.filter((u: AdminUser) => u.status === 'PENDING');
      const processed = allUsers.filter((u: AdminUser) => u.status !== 'PENDING');
      setPendingRequests(pending);
      setProcessedRequests(processed);
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/status`, { status: 'APPROVED', admin_username: adminUser });
      setActiveMessage(`User request approved successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/status`, { status: 'REJECTED', admin_username: adminUser });
      setActiveMessage(`User request rejected successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevoke = async (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/status`, { status: 'REVOKED', admin_username: adminUser });
      setActiveMessage(`User access revoked successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReactivate = async (id: string) => {
    const adminUser = localStorage.getItem('robin_user') || 'Admin';
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/status`, { status: 'APPROVED', admin_username: adminUser });
      setActiveMessage(`User reactivated successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to completely delete this user? This action cannot be undone.")) return;
    try {
      await axios.delete(`${API_BASE}/admin/users/${id}`);
      setActiveMessage(`User deleted successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAdmin = async (id: string, currentRoles?: string | string[]) => {
    let rolesArray: string[] = [];
    if (typeof currentRoles === 'string') {
        try { rolesArray = JSON.parse(currentRoles); } catch { rolesArray = []; }
    } else if (Array.isArray(currentRoles)) {
        rolesArray = currentRoles;
    }
    const isAdmin = rolesArray.includes('ADMIN');
    const newIsAdmin = !isAdmin;
    
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/admin_access`, { is_admin: newIsAdmin, admin_username: localStorage.getItem('robin_user') || 'Admin' });
      setActiveMessage(`Admin access ${newIsAdmin ? 'granted' : 'revoked'} successfully!`);
      setTimeout(() => setActiveMessage(null), 4000);
      loadRequests();
    } catch (e) {
      console.error(e);
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
    const full = req.full_name || '';
    const user = req.username || '';
    const eml = req.email || '';
    const matchesSearch = 
      full.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      eml.toLowerCase().includes(searchQuery.toLowerCase());
      
    const platform = req.platform || 'snowflake';
    const matchesPlatform = 
      platformFilter === 'ALL' || 
      platform.toLowerCase() === platformFilter.toLowerCase();
      
    return matchesSearch && matchesPlatform;
  });

  // Filter processed requests
  const filteredProcessed = processedRequests.filter(req => {
    const full = req.full_name || '';
    const user = req.username || '';
    const eml = req.email || '';
    const matchesSearch = 
      full.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      eml.toLowerCase().includes(searchQuery.toLowerCase());
      
    const platform = req.platform || 'snowflake';
    const matchesPlatform = 
      platformFilter === 'ALL' || 
      platform.toLowerCase() === platformFilter.toLowerCase();
      
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
              className={`admin-sidebar-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={18} />
              <span>User Management</span>
              {pendingRequests.length > 0 && (
                <span className="sidebar-badge">{pendingRequests.length}</span>
              )}
            </button>
            <button 
              className={`admin-sidebar-btn ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <Server size={18} />
              <span>System Tools</span>
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
                        <option value="REVOKED">Revoked</option>
                      </select>
                    </div>
                  </div>
                </div>

                <h2 className="requests-section-title">Pending Access Requests</h2>
                <div className="admin-table-container">
                  {isLoading ? (
                    <div className="empty-state">
                      <div className="spinner" style={{ margin: '0 auto 10px', width: '24px', height: '24px', border: '3px solid rgba(59, 130, 246, 0.3)', borderTopColor: '#3b82f6', borderRadius: '50%' }}></div>
                      Loading requests...
                    </div>
                  ) : filteredPending.length === 0 ? (
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
                              <span className="badge platform">{req.platform}</span>
                            </td>
                            <td>{req.created_at}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => handleApprove(req.user_id || req.id)} className="btn-approve">
                                Approve
                              </button>
                              <button onClick={() => handleReject(req.user_id || req.id)} className="btn-reject" style={{ marginRight: '8px' }}>
                                Reject
                              </button>
                              <button onClick={() => handleDelete(req.user_id || req.id)} className="btn-reject" style={{ background: 'transparent', border: '1px solid #ef4444' }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <h2 className="requests-section-title">All Users</h2>
                <div className="admin-table-container">
                  {isLoading ? (
                    <div className="empty-state">
                      <div className="spinner" style={{ margin: '0 auto 10px', width: '24px', height: '24px', border: '3px solid rgba(59, 130, 246, 0.3)', borderTopColor: '#3b82f6', borderRadius: '50%' }}></div>
                      Loading users...
                    </div>
                  ) : filteredProcessed.length === 0 ? (
                    <div className="empty-state">No users match the filters.</div>
                  ) : (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Full Name</th>
                          <th>Username</th>
                          <th>Platform</th>
                          <th>Status</th>
                          <th>Privilege</th>
                          <th>Created At</th>
                          <th>Last Login</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProcessed.map(req => (
                          <tr key={req.id}>
                            <td className="font-semibold">{req.full_name}</td>
                            <td>{req.username}</td>
                            <td>
                              <span className="badge platform">{req.platform}</span>
                            </td>
                            <td>
                              <span className={`badge ${req.status.toLowerCase()}`}>
                                {req.status}
                              </span>
                            </td>
                            <td>
                              {(() => {
                                let rolesArray: string[] = [];
                                if (typeof req.roles === 'string') {
                                    try { rolesArray = JSON.parse(req.roles); } catch { rolesArray = []; }
                                } else if (Array.isArray(req.roles)) {
                                    rolesArray = req.roles;
                                }
                                const isAdmin = rolesArray.includes('ADMIN');
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isAdmin ? <span className="badge approved" style={{ width: '50px', textAlign: 'center' }}>Admin</span> : <span className="badge pending" style={{ width: '50px', textAlign: 'center' }}>User</span>}
                                    <button onClick={() => handleToggleAdmin(req.user_id || req.id, req.roles)} className={isAdmin ? "btn-reject" : "btn-approve"} style={{ padding: '2px 8px', fontSize: '11px', border: isAdmin ? '1px solid #ef4444' : '1px solid #10b981', background: 'transparent' }}>
                                      {isAdmin ? "Demote" : "Promote"}
                                    </button>
                                  </div>
                                );
                              })()}
                            </td>
                            <td>{req.created_at}</td>
                            <td>{req.last_login_at || 'Never'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {req.status === 'APPROVED' && (
                                <button onClick={() => handleRevoke(req.user_id || req.id)} className="btn-reject" style={{ padding: '4px 10px', marginRight: '8px' }}>
                                  Revoke Access
                                </button>
                              )}
                              {(req.status === 'REJECTED' || req.status === 'REVOKED') && (
                                <button onClick={() => handleReactivate(req.user_id || req.id)} className="btn-approve" style={{ padding: '4px 10px', marginRight: '8px' }}>
                                  Re-activate
                                </button>
                              )}
                              <button onClick={() => handleDelete(req.user_id || req.id)} className="btn-reject" style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #ef4444' }}>
                                Delete
                              </button>
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
