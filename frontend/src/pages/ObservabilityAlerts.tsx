import React, { useState, useEffect } from 'react';
import { Search, Bell, AlertCircle, CheckCircle, ShieldAlert, ChevronDown, UserPlus, Users, X, Mail, ArrowRight, Plus, Minus, Maximize, Lock, Unlock } from 'lucide-react';
import './ObservabilityAlerts.css';

interface AlertItem {
  id: number;
  title: string;
  status: string;
  time: string;
  impact: string;
  severity: string;
  resolution: string;
  findingType: string;
  timestamp: Date;
}

interface UserRecipient {
  id: number;
  name: string;
  email: string;
}

const initialAlerts: AlertItem[] = [
  { id: 1, title: 'Job airflow_demo.cosmos_jaffle_shop_demo Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Resolved', findingType: 'Job failure', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  { id: 2, title: 'Job airflow_demo.cosmos_jaffle_shop_demo.raw_payments_seed Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Expected', findingType: 'Job failure', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  { id: 3, title: 'Job jaffle_shop.dbt-run-jaffle_shop Failed', status: 'Active', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Not set', findingType: 'Job failure', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  { id: 4, title: 'Job jaffle_shop.model.jaffle_shop.orders Failed', status: 'Active', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Not set', findingType: 'Job failure', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000) },
  { id: 5, title: 'Job jaffle_shop.model.jaffle_shop.customers Failed', status: 'Active', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Not set', findingType: 'Job failure', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000) },
  { id: 6, title: 'Job jaffle_shop.dbt-run-jaffle_shop Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Resolved', findingType: 'Job failure', timestamp: new Date(Date.now() - 36 * 60 * 60 * 1000) },
  { id: 7, title: 'Job jaffle_shop.model.jaffle_shop.orders Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Resolved', findingType: 'Job failure', timestamp: new Date(Date.now() - 36 * 60 * 60 * 1000) },
  { id: 8, title: 'Job jaffle_shop.model.jaffle_shop.customers Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Resolved', findingType: 'Job failure', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  { id: 9, title: 'Job airflow_demo.cosmos_jaffle_shop_demo Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Resolved', findingType: 'Job failure', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  { id: 10, title: 'Job airflow_demo.cosmos_jaffle_shop_demo.orders.run Failed', status: 'Inactive', time: 'yesterday', impact: '1 Job failure', severity: 'Critical', resolution: 'Not set', findingType: 'Job failure', timestamp: new Date(Date.now() - 60 * 60 * 1000) }
];

const defaultUsers: UserRecipient[] = [
  { id: 1, name: 'DataOps Manager', email: 'dataops@robin-observability.com' },
  { id: 2, name: 'Data Engineer Lead', email: 'de_lead@robin-observability.com' }
];

const resolutionChoices = [
  { label: 'Expected', color: '#6366f1' },
  { label: 'False positive', color: '#eab308' },
  { label: 'Not set', color: '#94a3b8' },
  { label: 'Open', color: '#d946ef' },
  { label: 'Resolved', color: '#10b981' }
];

const ObservabilityAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>(initialAlerts);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Alert for Detailed Popover
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  // Selected Finding for drill-down popover screen
  const [selectedFinding, setSelectedFinding] = useState<AlertItem | null>(null);

  // Modals management state
  const [showManageUsers, setShowManageUsers] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  // Resolution inner popover inside the detailed alert screen
  const [resDropdownOpen, setResDropdownOpen] = useState(false);

  // Zooming & Scrolling lineage view states
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLocked, setIsLocked] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserRecipient[]>(() => {
    const saved = localStorage.getItem('observability_users');
    return saved ? JSON.parse(saved) : defaultUsers;
  });

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Filter Selection arrays for checkboxes
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [alertStarted, setAlertStarted] = useState<string>('All');
  const [selectedFindingTypes, setSelectedFindingTypes] = useState<string[]>([]);

  // Subscription channel checkboxes
  const [useEmail, setUseEmail] = useState(true);
  const [useTeams, setUseTeams] = useState(false);
  const [useSlack, setUseSlack] = useState(false);
  const [subscribedUserIds, setSubscribedUserIds] = useState<number[]>([]);

  // Inner filter searches
  const [statusSearch, setStatusSearch] = useState('');
  const [resSearch, setResSearch] = useState('');
  const [sevSearch, setSevSearch] = useState('');
  const [findingTypeSearch, setFindingTypeSearch] = useState('');

  useEffect(() => {
    localStorage.setItem('observability_users', JSON.stringify(users));
  }, [users]);

  // Initial user matching for subscription selection
  useEffect(() => {
    setSubscribedUserIds(users.map(u => u.id));
  }, [users]);

  // Checkbox toggle handler
  const handleToggle = (item: string, currentSelected: string[], setter: (val: string[]) => void) => {
    if (currentSelected.includes(item)) {
      setter(currentSelected.filter(i => i !== item));
    } else {
      setter([...currentSelected, item]);
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const newUser: UserRecipient = {
      id: Date.now(),
      name: newUserName,
      email: newUserEmail
    };
    setUsers(prev => [...prev, newUser]);
    setNewUserName('');
    setNewUserEmail('');
  };

  const deleteUser = (id: number) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleActivateSubscription = () => {
    if (useEmail && subscribedUserIds.length === 0) {
      alert('Please select at least one recipient user to receive the alert emails.');
      return;
    }
    alert(`Success! Failure alerts will be delivered via Email to ${subscribedUserIds.length} user(s).`);
    setShowSubscribeModal(false);
  };

  const toggleDropdown = (id: string) => {
    setOpenDropdown(prev => (prev === id ? null : id));
  };

  // Change resolution inside the alert detailed popover
  const handleResolutionChange = (alertId: number, nextRes: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resolution: nextRes } : a));
    if (selectedAlert && selectedAlert.id === alertId) {
      setSelectedAlert(prev => prev ? { ...prev, resolution: nextRes } : null);
    }
    if (selectedFinding && selectedFinding.id === alertId) {
      setSelectedFinding(prev => prev ? { ...prev, resolution: nextRes } : null);
    }
    setResDropdownOpen(false);
  };

  // Zoom / Scale handlers
  const handleZoomIn = () => {
    if (isLocked) return;
    setZoomLevel(prev => Math.min(prev + 0.15, 2));
  };

  const handleZoomOut = () => {
    if (isLocked) return;
    setZoomLevel(prev => Math.max(prev - 0.15, 0.4));
  };

  const handleFitView = () => {
    if (isLocked) return;
    setZoomLevel(1);
  };

  const handleToggleLock = () => {
    setIsLocked(prev => !prev);
  };

  // Available Filter Option Arrays
  const statusOptions = ['Active', 'Inactive', 'Stale'].filter(o => o.toLowerCase().includes(statusSearch.toLowerCase()));
  const resOptions = ['Expected', 'False positive', 'Not set', 'Open', 'Resolved'].filter(o => o.toLowerCase().includes(resSearch.toLowerCase()));
  const sevOptions = ['Critical', 'High', 'Low', 'Medium'].filter(o => o.toLowerCase().includes(sevSearch.toLowerCase()));
  const alertStartedOptions = [
    { label: 'All time', value: 'All' },
    { label: 'Last 24 hours', value: '24' },
    { label: 'Last 7 days', value: '7' },
    { label: 'Last 14 days', value: '14' },
    { label: 'Last 30 days', value: '30' }
  ];
  
  const findingTypeOptions = [
    { label: 'Job finding', value: 'Job finding', isParent: true },
    { label: 'Job failure', value: 'Job failure', indent: true },
    { label: 'Job aborted', value: 'Job aborted', indent: true },
    { label: 'Data quality', value: 'Data quality', isParent: true },
    { label: 'Rule below threshold', value: 'Rule below threshold', indent: true },
    { label: 'CI below threshold', value: 'CI below threshold', indent: true },
    { label: 'Data Anomaly', value: 'Data Anomaly', isParent: true },
    { label: 'Profiling Anomaly', value: 'Profiling Anomaly', indent: true },
    { label: 'Profiling Anomaly for Attribute', value: 'Profiling Anomaly for Attribute', indent: true },
    { label: 'Profiling Anomaly for CI', value: 'Profiling Anomaly for CI', indent: true },
    { label: 'Data Freshness Finding', value: 'Data Freshness Finding', indent: true }
  ].filter(o => o.label.toLowerCase().includes(findingTypeSearch.toLowerCase()));

  // Filter alerts dynamically based on conditions
  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(alert.status);
    const matchesResolution = selectedResolutions.length === 0 || selectedResolutions.includes(alert.resolution);
    const matchesSeverity = selectedSeverities.length === 0 || selectedSeverities.includes(alert.severity);
    const matchesFindingType = selectedFindingTypes.length === 0 || selectedFindingTypes.includes(alert.findingType);

    let matchesTime = true;
    if (alertStarted !== 'All') {
      const msDiff = Date.now() - alert.timestamp.getTime();
      const hoursDiff = msDiff / (1000 * 60 * 60);
      const daysDiff = hoursDiff / 24;
      if (alertStarted === '24') matchesTime = hoursDiff <= 24;
      if (alertStarted === '7') matchesTime = daysDiff <= 7;
      if (alertStarted === '14') matchesTime = daysDiff <= 14;
      if (alertStarted === '30') matchesTime = daysDiff <= 30;
    }

    return matchesSearch && matchesStatus && matchesResolution && matchesSeverity && matchesFindingType && matchesTime;
  });

  return (
    <div className="obs-alerts-page" onClick={() => setOpenDropdown(null)}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">OpenLineage Alerting Workspace</h1>
          <p className="subtitle">Real-time alerts tracking pipeline failures, unexpected asset runs, and schema changes.</p>
        </div>
        <div className="top-action-stack">
          <button className="btn btn-secondary-outline" onClick={() => setShowManageUsers(true)}>
            <Users size={16} /> <span>Manage users</span>
          </button>
          <button className="btn btn-subscribe" onClick={() => setShowSubscribeModal(true)}>
            <Bell size={14} /> <span>Subscribe</span>
          </button>
        </div>
      </div>

      <div className="alerts-toolbar glass-panel" onClick={e => e.stopPropagation()}>
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} 
          />
        </div>

        <div className="custom-filter-dropdowns">
          {/* 1. Status Filter */}
          <div className="custom-dropdown-wrapper">
            <button className={`filter-trigger-btn ${selectedStatuses.length > 0 ? 'active' : ''}`} onClick={() => toggleDropdown('status')}>
              <span>Status</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === 'status' && (
              <div className="custom-dropdown-popover glass-panel">
                <input 
                  type="text" 
                  className="dropdown-search-input" 
                  placeholder="Search" 
                  value={statusSearch} 
                  onChange={e => setStatusSearch(e.target.value)} 
                />
                <div className="checkbox-list">
                  {statusOptions.map(opt => (
                    <label key={opt} className="checkbox-item">
                      <input 
                        type="checkbox" 
                        checked={selectedStatuses.includes(opt)} 
                        onChange={() => handleToggle(opt, selectedStatuses, setSelectedStatuses)} 
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Resolution Filter */}
          <div className="custom-dropdown-wrapper">
            <button className={`filter-trigger-btn ${selectedResolutions.length > 0 ? 'active' : ''}`} onClick={() => toggleDropdown('resolution')}>
              <span>Resolution</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === 'resolution' && (
              <div className="custom-dropdown-popover glass-panel">
                <input 
                  type="text" 
                  className="dropdown-search-input" 
                  placeholder="Search" 
                  value={resSearch} 
                  onChange={e => setResSearch(e.target.value)} 
                />
                <div className="checkbox-list">
                  {resOptions.map(opt => (
                    <label key={opt} className="checkbox-item">
                      <input 
                        type="checkbox" 
                        checked={selectedResolutions.includes(opt)} 
                        onChange={() => handleToggle(opt, selectedResolutions, setSelectedResolutions)} 
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Severity Filter */}
          <div className="custom-dropdown-wrapper">
            <button className={`filter-trigger-btn ${selectedSeverities.length > 0 ? 'active' : ''}`} onClick={() => toggleDropdown('severity')}>
              <span>Severity</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === 'severity' && (
              <div className="custom-dropdown-popover glass-panel">
                <input 
                  type="text" 
                  className="dropdown-search-input" 
                  placeholder="Search" 
                  value={sevSearch} 
                  onChange={e => setSevSearch(e.target.value)} 
                />
                <div className="checkbox-list">
                  {sevOptions.map(opt => (
                    <label key={opt} className="checkbox-item">
                      <input 
                        type="checkbox" 
                        checked={selectedSeverities.includes(opt)} 
                        onChange={() => handleToggle(opt, selectedSeverities, setSelectedSeverities)} 
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Alert Started Filter */}
          <div className="custom-dropdown-wrapper">
            <button className={`filter-trigger-btn ${alertStarted !== 'All' ? 'active' : ''}`} onClick={() => toggleDropdown('alert-started')}>
              <span>Alert started</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === 'alert-started' && (
              <div className="custom-dropdown-popover glass-panel">
                <div className="radio-list">
                  {alertStartedOptions.map(opt => (
                    <button 
                      key={opt.value} 
                      className={`radio-item ${alertStarted === opt.value ? 'selected' : ''}`} 
                      onClick={() => { setAlertStarted(opt.value); setOpenDropdown(null); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. Finding Type Filter */}
          <div className="custom-dropdown-wrapper">
            <button className={`filter-trigger-btn ${selectedFindingTypes.length > 0 ? 'active' : ''}`} onClick={() => toggleDropdown('finding-type')}>
              <span>Finding type</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === 'finding-type' && (
              <div className="custom-dropdown-popover glass-panel">
                <input 
                  type="text" 
                  className="dropdown-search-input" 
                  placeholder="Search" 
                  value={findingTypeSearch} 
                  onChange={e => setFindingTypeSearch(e.target.value)} 
                />
                <div className="checkbox-list hierarchical">
                  {findingTypeOptions.map(opt => (
                    <label key={opt.value} className={`checkbox-item ${opt.indent ? 'indented' : 'parent-title'}`}>
                      <input 
                        type="checkbox" 
                        checked={selectedFindingTypes.includes(opt.value)} 
                        onChange={() => handleToggle(opt.value, selectedFindingTypes, setSelectedFindingTypes)} 
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Manage Users */}
      {showManageUsers && (
        <div className="modal-overlay" onClick={() => setShowManageUsers(false)}>
          <div className="modal-content glass-panel animate-modal-slide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Users size={18} /> Manage Alert Recipients</h3>
              <button className="btn-close" onClick={() => setShowManageUsers(false)}><X size={18} /></button>
            </div>

            <form className="user-add-form" onSubmit={handleAddUser}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="e.g. Robin Analyst" className="input-field" value={newUserName} onChange={e => setNewUserName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" placeholder="e.g. user@domain.com" className="input-field" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary btn-add-user">
                <UserPlus size={16} /> <span>Add</span>
              </button>
            </form>

            <div className="users-list-section">
              <h4>Alert Subscribers List ({users.length})</h4>
              <div className="user-cards-grid">
                {users.map(u => (
                  <div key={u.id} className="user-recipient-card">
                    <div className="user-info">
                      <strong className="u-name">{u.name}</strong>
                      <span className="u-email">{u.email}</span>
                    </div>
                    <button className="btn-delete-user" onClick={() => deleteUser(u.id)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Subscribe Alerts */}
      {showSubscribeModal && (
        <div className="modal-overlay" onClick={() => setShowSubscribeModal(false)}>
          <div className="modal-content glass-panel animate-modal-slide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Bell size={18} /> Subscribe to Failure Alerts</h3>
              <button className="btn-close" onClick={() => setShowSubscribeModal(false)}><X size={18} /></button>
            </div>

            <div className="subscribe-options-wrapper">
              <h4>Delivery Channels</h4>
              <p className="desc-text">Select notification platforms where your team will receive alerts on failure events.</p>

              <div className="channel-cards-list">
                <label className={`channel-card ${useEmail ? 'active' : ''}`}>
                  <input type="checkbox" checked={useEmail} onChange={e => setUseEmail(e.target.checked)} />
                  <div className="channel-label-stack">
                    <span className="ch-title"><Mail size={16} /> Email Alerts</span>
                    <span className="ch-status active">Fully Configurable</span>
                  </div>
                </label>

                <label className="channel-card disabled">
                  <input type="checkbox" disabled checked={useTeams} onChange={e => setUseTeams(e.target.checked)} />
                  <div className="channel-label-stack">
                    <span className="ch-title">Microsoft Teams</span>
                    <span className="ch-status">Coming soon</span>
                  </div>
                </label>

                <label className="channel-card disabled">
                  <input type="checkbox" disabled checked={useSlack} onChange={e => setUseSlack(e.target.checked)} />
                  <div className="channel-label-stack">
                    <span className="ch-title">Slack Notifications</span>
                    <span className="ch-status">Coming soon</span>
                  </div>
                </label>
              </div>

              {useEmail && (
                <div className="email-users-checklist-area">
                  <h4>Email Recipients List</h4>
                  <div className="recipients-list-scroller">
                    {users.map(u => (
                      <label key={u.id} className="recipient-checkbox-item">
                        <input 
                          type="checkbox" 
                          checked={subscribedUserIds.includes(u.id)} 
                          onChange={e => {
                            if (e.target.checked) setSubscribedUserIds([...subscribedUserIds, u.id]);
                            else setSubscribedUserIds(subscribedUserIds.filter(id => id !== u.id));
                          }} 
                        />
                        <span>{u.name} ({u.email})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="subscribe-actions">
                <button className="btn btn-secondary-outline" onClick={() => setShowSubscribeModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleActivateSubscription}>Confirm Activation</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ALERT DETAILED DETAILS POPOVER SCREEN */}
      {selectedAlert && !selectedFinding && (
        <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content glass-panel animate-modal-slide details-popover-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertCircle size={18} color="#ef4444" /> Alert Details & Telemetry</h3>
              <button className="btn-close" onClick={() => setSelectedAlert(null)}><X size={18} /></button>
            </div>

            <div className="popover-grid-top">
              {/* Box 1: Alert details */}
              <div className="summary-card glass-panel">
                <h4>Alert details</h4>
                <div className="info-block">
                  <div className="prop-row">
                    <span className="prop-label">Asset</span>
                    <span className="prop-value monospace">jaffle_shop.model.jaffle_shop.orders</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Findings</span>
                    <span className="prop-value">{selectedAlert.impact}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Status</span>
                    <span className={`prop-value status-badge ${selectedAlert.status.toLowerCase()}`}>{selectedAlert.status}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Severity</span>
                    <span className={`prop-value severity-badge ${selectedAlert.severity.toLowerCase()}`}>
                      <ShieldAlert size={12} /> {selectedAlert.severity}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Detection details */}
              <div className="summary-card glass-panel">
                <h4>Detection details</h4>
                <div className="info-block">
                  <div className="prop-row">
                    <span className="prop-label">First detected</span>
                    <span className="prop-value">Oct 21, 2025, 8:54 AM</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Last seen</span>
                    <span className="prop-value">Oct 21, 2025, 8:56 AM</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Ended</span>
                    <span className="prop-value">-</span>
                  </div>
                </div>
              </div>

              {/* Box 3: Resolution Status Custom Popover Dropdown */}
              <div className="summary-card glass-panel">
                <h4>Resolution</h4>
                <div className="info-block">
                  <div className="prop-row">
                    <span className="prop-label">Current Status</span>
                    <span className={`res-val ${selectedAlert.resolution.toLowerCase().replace(' ', '-')}`}>
                      <span className="resolution-dot"></span>
                      {selectedAlert.resolution}
                    </span>
                  </div>
                  <div className="res-select-wrapper" style={{ position: 'relative' }}>
                    <label>Select resolution</label>
                    <button 
                      className="filter-trigger-btn custom-res-trigger" 
                      onClick={e => { e.stopPropagation(); setResDropdownOpen(!resDropdownOpen); }}
                      style={{ width: '100%', justifyContent: 'space-between', marginTop: '0.25rem' }}
                    >
                      <span>Select resolution</span>
                      <ChevronDown size={14} />
                    </button>
                    {resDropdownOpen && (
                      <div className="custom-dropdown-popover resolution-list-popover glass-panel">
                        {resolutionChoices.map(res => (
                          <button 
                            key={res.label} 
                            className="resolution-choice-item" 
                            onClick={() => handleResolutionChange(selectedAlert.id, res.label)}
                          >
                            <span className="dot" style={{ backgroundColor: res.color }}></span>
                            <span className="lbl">{res.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Middle: Findings table */}
            <div className="findings-table-card glass-panel">
              <h4>Findings</h4>
              <div className="table-scroller">
                <table className="findings-table">
                  <thead>
                    <tr>
                      <th>Finding</th>
                      <th>Finding type</th>
                      <th>Asset</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th>First detected</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr onClick={() => setSelectedFinding(selectedAlert)} style={{ cursor: 'pointer' }}>
                      <td>Job jaffle_shop.model.jaffle_shop.orders Failed</td>
                      <td>Job failure</td>
                      <td className="monospace">jaffle_shop.model.jaffle_shop.orders</td>
                      <td><span className={`status-badge ${selectedAlert.status.toLowerCase()}`}>{selectedAlert.status}</span></td>
                      <td>
                        <span className={`severity-badge ${selectedAlert.severity.toLowerCase()}`}>
                          <ShieldAlert size={12} /> {selectedAlert.severity}
                        </span>
                      </td>
                      <td>Oct 21, 2025, 8:54 AM</td>
                      <td>Oct 21, 2025, 8:56 AM</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom: Lineage View & Activity */}
            <div className="popover-grid-bottom">
              <div className="lineage-view-box glass-panel" style={{ position: 'relative' }}>
                <h4>Lineage view</h4>
                <div className="visual-lineage-graph" style={{ position: 'relative', overflow: 'hidden', height: '170px' }}>
                  <div 
                    className="lineage-panning-container" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      transform: `scale(${zoomLevel})`, 
                      transformOrigin: 'left center',
                      transition: 'transform 0.2s ease-in-out',
                      width: 'fit-content'
                    }}
                  >
                    <div className="node-box">
                      <span className="node-lbl">_currency_table</span>
                    </div>
                    <ArrowRight size={14} className="node-arr" />
                    <div className="node-box active-warn">
                      <span className="node-lbl">jaffle_shop.dbt-run-jaffle_shop</span>
                      <span className="warn-dot"></span>
                    </div>
                    <ArrowRight size={14} className="node-arr" />
                    <div className="node-box active-warn highlight">
                      <span className="node-lbl">stg_payments</span>
                      <span className="warn-dot"></span>
                    </div>
                    <ArrowRight size={14} className="node-arr" />
                    <div className="node-box">
                      <span className="node-lbl">orders</span>
                    </div>
                  </div>

                  {/* React Flow styled zoom/pan/lock controls exactly as shown in the mockup */}
                  <div className="react-flow-controls-box">
                    <button className="control-btn" onClick={handleZoomIn} title="Zoom in">
                      <Plus size={14} />
                    </button>
                    <button className="control-btn" onClick={handleZoomOut} title="Zoom out">
                      <Minus size={14} />
                    </button>
                    <button className="control-btn" onClick={handleFitView} title="Fit to view">
                      <Maximize size={14} />
                    </button>
                    <button className={`control-btn ${isLocked ? 'locked' : ''}`} onClick={handleToggleLock} title={isLocked ? 'Unlock view' : 'Lock view'}>
                      {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                  </div>

                  <span className="react-flow-watermark">React Flow</span>
                </div>
              </div>

              <div className="activity-view-box glass-panel">
                <h4>Activity</h4>
                <div className="activity-timeline">
                  <div className="timeline-item">
                    <span className="time">Oct 22, 2025, 10:17 AM</span>
                    <p className="act-lbl">Alert marked as <strong>{selectedAlert.resolution}</strong> by jessica.smith@ataccama.com</p>
                  </div>
                  <div className="timeline-item">
                    <span className="time">Oct 22, 2025, 10:15 AM</span>
                    <p className="act-lbl">Alert marked as <strong>Open</strong> by jessica.smith@ataccama.com</p>
                  </div>
                  <div className="timeline-item">
                    <span className="time">Oct 21, 2025, 8:54 AM</span>
                    <p className="act-lbl">Alert created</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FINDINGS DETAILED SCREEN POPOVER */}
      {selectedFinding && (
        <div className="modal-overlay" onClick={() => setSelectedFinding(null)}>
          <div className="modal-content glass-panel animate-modal-slide details-popover-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertCircle size={18} color="#ef4444" /> Findings Details - Job {selectedFinding.title}</h3>
              <button className="btn-close" onClick={() => setSelectedFinding(null)}><X size={18} /></button>
            </div>

            <div className="findings-subpopover-grid">
              {/* Left Column: Failure reason & Job run history & Findings updates */}
              <div className="findings-left-stack">
                <div className="failure-reason-callout">
                  <div className="reason-header">
                    <AlertCircle size={14} /> <span>Database Error</span>
                  </div>
                  <p className="reason-desc">Database Error in model orders (models/marts/orders.sql) division by zero compiled code at target/run/jaffle_shop/models/marts/orders.sql</p>
                  <div className="run-id-row">
                    <span className="lbl">Run ID</span>
                    <span className="val monospace">019a06d7-9c71-7017-be28-34050d750491</span>
                  </div>
                </div>

                {/* Job Run History */}
                <div className="job-history-box glass-panel">
                  <div className="box-top">
                    <h4>Job run history</h4>
                    <button className="btn btn-secondary-outline btn-job-details" onClick={() => alert('Opening additional execution logs...')}>
                      Open job details
                    </button>
                  </div>
                  <div className="duration-chart-wrapper">
                    <div className="y-axis-lbl">Duration (seconds)</div>
                    <div className="chart-canvas-mock">
                      <div className="bar-group">
                        <div className="bar-rect green" style={{ height: '120px' }}></div>
                        <span className="bar-time">Oct 21, 2025, 8:47 AM</span>
                      </div>
                      <div className="bar-group">
                        <div className="bar-rect red" style={{ height: '90px' }}></div>
                        <span className="bar-time">Oct 21, 2025, 8:53 AM</span>
                      </div>
                      <div className="bar-group">
                        <div className="bar-rect red" style={{ height: '100px' }}></div>
                        <span className="bar-time">Oct 21, 2025, 8:56 AM</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Finding updates */}
                <div className="finding-updates-box glass-panel">
                  <h4>Finding updates</h4>
                  <div className="table-scroller">
                    <table className="findings-table">
                      <thead>
                        <tr>
                          <th>Update</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Job jaffle_shop.model.jaffle_shop.orders Failed</td>
                          <td>Oct 21, 2025, 8:56 AM</td>
                        </tr>
                        <tr>
                          <td>Job jaffle_shop.model.jaffle_shop.orders Failed <br/><span className="sub-lbl">Summary: Created / Status: <strong>Active</strong></span></td>
                          <td>Oct 21, 2025, 8:53 AM</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Description & Summary */}
              <div className="findings-right-stack">
                <div className="desc-box glass-panel">
                  <h4>Description</h4>
                  <p className="desc-text">Job failure detected</p>
                </div>

                <div className="summary-box glass-panel">
                  <h4>Summary</h4>
                  <div className="summary-props">
                    <div className="summary-row">
                      <span className="prop-label">Asset</span>
                      <span className="prop-value monospace">jaffle_shop.model.jaffle_shop.orders</span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">Finding type</span>
                      <span className="prop-value">Job failure</span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">Severity</span>
                      <span className={`prop-value severity-badge ${selectedFinding.severity.toLowerCase()}`}>
                        <ShieldAlert size={12} /> {selectedFinding.severity}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">Status</span>
                      <span className={`prop-value status-badge ${selectedFinding.status.toLowerCase()}`}>{selectedFinding.status}</span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">First detected</span>
                      <span className="prop-value">Oct 21, 2025, 8:54 AM</span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">Last seen</span>
                      <span className="prop-value">Oct 21, 2025, 8:56 AM</span>
                    </div>
                    <div className="summary-row">
                      <span className="prop-label">Ended</span>
                      <span className="prop-value">-</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="alerts-list">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map(alert => {
            return (
              <div key={alert.id} className="alert-card glass-panel" onClick={() => setSelectedAlert(alert)} style={{ cursor: 'pointer' }}>
                <div className="alert-info-col">
                  <h3 className="alert-title">
                    <span className={`status-dot ${alert.status.toLowerCase()}`}></span>
                    {alert.title}
                  </h3>
                  <p className="alert-meta">
                    <span className={`meta-status ${alert.status.toLowerCase()}`}>{alert.status}</span>
                    <span className="meta-separator">/</span>
                    <span className="meta-time">{alert.time}</span>
                    <span className="meta-separator">/</span>
                    <span className="meta-impact">{alert.impact}</span>
                  </p>
                </div>

                <div className="alert-meta-col">
                  <div className="meta-item severity">
                    <span className="meta-label">Severity</span>
                    <span className={`severity-badge ${alert.severity.toLowerCase()}`}>
                      <ShieldAlert size={12} /> {alert.severity}
                    </span>
                  </div>

                  <div className="meta-item resolution">
                    <span className="meta-label">Resolution</span>
                    <span className={`res-val ${alert.resolution.toLowerCase().replace(' ', '-')}`}>
                      <span className="resolution-dot"></span>
                      {alert.resolution}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-alerts glass-panel">
            <CheckCircle size={24} color="#10b981" />
            <h3>No alerts match your search filters</h3>
            <p>Everything looks fully functional and monitored.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ObservabilityAlerts;
