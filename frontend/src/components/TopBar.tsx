import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, ChevronDown, CheckCircle, Shield, LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { authService } from '../services/authService';
import axios from 'axios';
import { API_BASE } from '../api';
import './TopBar.css';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const { platform, setPlatform } = usePlatform();
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Retrieve user session
  const sessionStr = localStorage.getItem('robin_user_session');
  const session = sessionStr ? JSON.parse(sessionStr) : null;
  const isConnected = session?.is_connected && localStorage.getItem('is_connected') === 'true';
  const token = localStorage.getItem('robin_auth_token');
  const userType = localStorage.getItem('user_type');

  const username = session?.username || localStorage.getItem('robin_user') || 'User';
  const activeRole = session?.selected_role || localStorage.getItem('selected_role') || 'PUBLIC';
  const platformLabel = (session?.platform || platform || 'snowflake').toUpperCase();

  // Live roles state
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isFetchingRoles, setIsFetchingRoles] = useState(false);
  const [roleError, setRoleError] = useState('');

  const fetchLiveRoles = async () => {
    if (!isConnected) return;
    setIsFetchingRoles(true);
    setRoleError('');
    try {
      const saved = localStorage.getItem('robin_credentials');
      const activePlat = (session?.platform || platform || 'snowflake').toLowerCase();
      const credentials = saved ? JSON.parse(saved)[activePlat] : null;

      const payload: any = {
        platform: activePlat,
        credentials: credentials ? {
          account: credentials.account || '',
          user: credentials.user || credentials.username || '',
          password: credentials.password || '',
          warehouse: credentials.warehouse || '',
          database: credentials.database || '',
          schema: credentials.schema || '',
          workspace_url: credentials.server_hostname || credentials.workspace_url || '',
          token: credentials.access_token || credentials.token || '',
          cluster_id: credentials.http_path || credentials.cluster_id || ''
        } : {}
      };

      const response = await axios.post(`${API_BASE}/auth/fetch-roles`, payload);
      if (response.data && response.data.status === 'success') {
        const roles: string[] = response.data.roles || [];
        setAvailableRoles(roles);
        
        if (activePlat === 'snowflake' && roles.length > 0 && !roles.includes(activeRole)) {
          setRoleError('Selected role is invalid or not assigned in Snowflake');
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch live roles in TopBar:', err);
      const errMsg = err.response?.data?.detail || err.message || '';
      if (errMsg) {
        setRoleError(`Connection validation error: ${errMsg}`);
      }
    } finally {
      setIsFetchingRoles(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      fetchLiveRoles();
    }
  }, [isConnected, platformLabel]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDropdownToggle = () => {
    const nextState = !showRoleDropdown;
    setShowRoleDropdown(nextState);
    if (nextState) {
      fetchLiveRoles();
    }
  };

  const handleRoleSelect = (newRole: string) => {
    if (newRole === activeRole) {
      setShowRoleDropdown(false);
      return;
    }
    // Update local storage
    localStorage.setItem('selected_role', newRole);
    if (session) {
      session.selected_role = newRole;
      localStorage.setItem('robin_user_session', JSON.stringify(session));
    }

    // ALSO update the role inside the credentials object!
    const saved = localStorage.getItem('robin_credentials');
    if (saved) {
      try {
        const creds = JSON.parse(saved);
        const activePlat = (session?.platform || platform || 'snowflake').toLowerCase();
        if (creds[activePlat]) {
          creds[activePlat].role = newRole;
          localStorage.setItem('robin_credentials', JSON.stringify(creds));
        }
      } catch (e) {
        console.error('Failed to update role in credentials:', e);
      }
    }

    authService.updateUserRole(username, newRole);
    setShowRoleDropdown(false);
    // Reload page to propagate changes
    window.location.reload();
  };

  const handleLogout = () => {
    // Clear all session states completely
    localStorage.removeItem('robin_auth_token');
    localStorage.removeItem('robin_user');
    localStorage.removeItem('selected_role');
    localStorage.removeItem('user_type');
    localStorage.removeItem('is_authenticated');
    localStorage.removeItem('is_connected');
    localStorage.removeItem('selected_platform');
    localStorage.removeItem('robin_user_session');

    // Redirect to landing selection step in login page with feedback
    navigate('/login', { state: { message: 'You have been logged out successfully' } });
  };

  return (
    <header className="top-bar glass-panel">
      <div className="top-bar-left">
        <div className="logo-icon">VD</div>
        <h2>ValiData</h2>
      </div>

      <div className="top-bar-right">
        {isConnected ? (
          <div className="connection-status-widget-wrapper">
            {roleError && (
              <span className="role-warning-badge" title={roleError}>
                <AlertTriangle size={14} color="#f87171" style={{ marginRight: '4px' }} />
                <span className="warning-text">Invalid Role</span>
              </span>
            )}
            <div className="connection-status-widget">
              <span className="connection-indicator-dot"></span>
              <span className="connection-text">
                Connected as <strong className="username-txt">{username}</strong> ({platformLabel})
              </span>
              <span className="widget-divider">|</span>
              <div className="role-dropdown-container" ref={dropdownRef}>
                <button 
                  className={`role-selector-btn ${roleError ? 'role-warning' : ''}`}
                  onClick={handleDropdownToggle}
                  disabled={isFetchingRoles}
                >
                  <Shield size={13} className="role-shield-icon" />
                  <span>Role: <strong className="role-name">{activeRole}</strong></span>
                  {isFetchingRoles ? (
                    <Loader2 size={14} className="spinner" />
                  ) : (
                    <ChevronDown size={14} className={`chevron-icon ${showRoleDropdown ? 'open' : ''}`} />
                  )}
                </button>
                
                {showRoleDropdown && (
                  <div className="role-menu-popup glass-panel">
                    <div className="role-menu-header">Switch Active Role</div>
                    {availableRoles.length === 0 ? (
                      <div className="role-menu-item" style={{ color: '#64748b', cursor: 'default' }}>
                        No roles found
                      </div>
                    ) : (
                      availableRoles.map(role => (
                        <button
                          key={role}
                          className={`role-menu-item ${role === activeRole ? 'active' : ''}`}
                          onClick={() => handleRoleSelect(role)}
                        >
                          <span>{role}</span>
                          {role === activeRole && <CheckCircle size={12} className="check-icon" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <button onClick={handleLogout} className="btn-topbar-logout">
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <>
            {token ? (
              <div className="connection-status-widget-wrapper">
                <span className="admin-status-text">
                  Logged in as <strong className="username-txt">{username}</strong> ({userType})
                </span>
                <button onClick={handleLogout} className="btn-topbar-logout">
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <>
                <span className="platform-label">Active Platform:</span>
                <div className="platform-toggle global-toggle">
                  <button 
                    className={`plat-btn ${platform === 'snowflake' ? 'active sf' : ''}`}
                    onClick={() => setPlatform('snowflake')}
                  >
                    <Database size={16}/> Snowflake
                  </button>
                  <button 
                    className={`plat-btn ${platform === 'databricks' ? 'active db' : ''}`}
                    onClick={() => setPlatform('databricks')}
                  >
                    <Database size={16}/> Databricks
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default TopBar;
