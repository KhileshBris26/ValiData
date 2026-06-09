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

  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [availableWarehouses, setAvailableWarehouses] = useState<string[]>([]);
  const [isFetchingWarehouses, setIsFetchingWarehouses] = useState(false);
  const [warehouseError, setWarehouseError] = useState('');
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);

  // Retrieve user session
  const sessionStr = localStorage.getItem('robin_user_session');
  const session = sessionStr ? JSON.parse(sessionStr) : null;
  const isConnected = session?.is_connected && localStorage.getItem('is_connected') === 'true';
  const token = localStorage.getItem('robin_auth_token');
  const userType = localStorage.getItem('user_type');

  const username = session?.username || localStorage.getItem('robin_user') || 'User';
  const activeRole = session?.selected_role || localStorage.getItem('selected_role') || 'PUBLIC';
  const activeWarehouse = session?.selected_warehouse || localStorage.getItem('selected_warehouse') || 'SMALL_WH';
  const platformLabel = (platform || session?.platform || 'snowflake').toUpperCase();

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
      const activePlat = (platform || session?.platform || 'snowflake').toLowerCase();
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
        const roles: string[] = response.data.all_roles || response.data.roles || [];
        setAvailableRoles(roles);
        
        const currentRole = session?.selected_role || localStorage.getItem('selected_role');
        if (roles.length > 0 && (!currentRole || !roles.includes(currentRole))) {
          localStorage.setItem('selected_role', roles[0]);
          if (session) {
            session.selected_role = roles[0];
            localStorage.setItem('robin_user_session', JSON.stringify(session));
          }
        } else if (activePlat === 'snowflake' && roles.length > 0 && currentRole && !roles.includes(currentRole)) {
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

  const fetchLiveWarehouses = async () => {
    if (!isConnected) return;
    setIsFetchingWarehouses(true);
    setWarehouseError('');
    try {
      const saved = localStorage.getItem('robin_credentials');
      const activePlat = (platform || session?.platform || 'snowflake').toLowerCase();
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

      const response = await axios.post(`${API_BASE}/auth/fetch-warehouses`, payload);
      if (response.data && response.data.status === 'success') {
        const warehouses: string[] = response.data.warehouses || [];
        setAvailableWarehouses(warehouses);
        
        const currentSelected = session?.selected_warehouse || localStorage.getItem('selected_warehouse');
        if (warehouses.length > 0 && (!currentSelected || !warehouses.includes(currentSelected))) {
          localStorage.setItem('selected_warehouse', warehouses[0]);
          if (session) {
            session.selected_warehouse = warehouses[0];
            localStorage.setItem('robin_user_session', JSON.stringify(session));
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch warehouses in TopBar:', err);
      const errMsg = err.response?.data?.detail || err.message || '';
      if (errMsg) {
        setWarehouseError(`Warehouse fetch error: ${errMsg}`);
      }
    } finally {
      setIsFetchingWarehouses(false);
    }
  };

  useEffect(() => {
    const adminToken = localStorage.getItem('robin_auth_token');
    const roleType = localStorage.getItem('user_type');
    const isConn = localStorage.getItem('is_connected') === 'true';

    if (adminToken && roleType === 'admin' && !isConn) {
      console.log('Self-healing admin session in TopBar');
      
      const savedCreds = localStorage.getItem('robin_credentials');
      if (!savedCreds) {
        const defaultCredentials = {
          databricks: {
            server_hostname: 'dbc-ff683f53-d730.cloud.databricks.com',
            http_path: '/sql/1.0/warehouses/755e296acd2446b6',
            access_token: 'dapia91ce03b26effdb0d8f98680724ab63c'
          },
          snowflake: {
            account: 'CEDKVOT-PHB81098',
            user: 'KHILESHKHUBNANI26',
            password: 'Citius@Mar2026',
            role: 'ACCOUNTADMIN',
            warehouse: 'SMALL_WH',
            database: 'UNICORN',
            schema: 'DEV'
          }
        };
        localStorage.setItem('robin_credentials', JSON.stringify(defaultCredentials));
      }

      localStorage.setItem('is_connected', 'true');
      localStorage.setItem('selected_role', 'ACCOUNTADMIN');
      localStorage.setItem('selected_platform', 'snowflake');

      const adminSession = {
        username: localStorage.getItem('robin_user') || 'Khilesh',
        user_type: 'admin',
        platform: 'snowflake',
        credentials_encrypted: true,
        selected_role: 'ACCOUNTADMIN',
        is_connected: true
      };
      localStorage.setItem('robin_user_session', JSON.stringify(adminSession));

      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchLiveRoles();
      fetchLiveWarehouses();
    }
  }, [isConnected, platformLabel]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(event.target as Node)) {
        setShowWarehouseDropdown(false);
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

  const handleWarehouseDropdownToggle = () => {
    const nextState = !showWarehouseDropdown;
    setShowWarehouseDropdown(nextState);
    if (nextState) {
      fetchLiveWarehouses();
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
        const activePlat = (platform || session?.platform || 'snowflake').toLowerCase();
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

  const handleWarehouseSelect = (newWarehouse: string) => {
    if (newWarehouse === activeWarehouse) {
      setShowWarehouseDropdown(false);
      return;
    }
    // Update local storage
    localStorage.setItem('selected_warehouse', newWarehouse);
    if (session) {
      session.selected_warehouse = newWarehouse;
      localStorage.setItem('robin_user_session', JSON.stringify(session));
    }

    // ALSO update the warehouse inside the credentials object!
    const saved = localStorage.getItem('robin_credentials');
    if (saved) {
      try {
        const creds = JSON.parse(saved);
        const activePlat = (platform || session?.platform || 'snowflake').toLowerCase();
        if (creds[activePlat]) {
          creds[activePlat].warehouse = newWarehouse;
          localStorage.setItem('robin_credentials', JSON.stringify(creds));
        }
      } catch (e) {
        console.error('Failed to update warehouse in credentials:', e);
      }
    }

    setShowWarehouseDropdown(false);
    // Reload page to propagate changes
    window.location.reload();
  };

  const handleLogout = () => {
    // Clear all session states completely
    localStorage.removeItem('robin_auth_token');
    localStorage.removeItem('robin_user');
    localStorage.removeItem('selected_role');
    localStorage.removeItem('selected_warehouse');
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
            {warehouseError && (
              <span className="role-warning-badge" title={warehouseError}>
                <AlertTriangle size={14} color="#f87171" style={{ marginRight: '4px' }} />
                <span className="warning-text">WH Fetch Error</span>
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

              <span className="widget-divider">|</span>
              <div className="warehouse-dropdown-container" ref={warehouseDropdownRef}>
                <button 
                  className={`warehouse-selector-btn ${warehouseError ? 'warehouse-warning' : ''}`}
                  onClick={handleWarehouseDropdownToggle}
                  disabled={isFetchingWarehouses}
                >
                  <Database size={13} className="warehouse-db-icon" />
                  <span>WH: <strong className="warehouse-name">{activeWarehouse}</strong></span>
                  {isFetchingWarehouses ? (
                    <Loader2 size={14} className="spinner" />
                  ) : (
                    <ChevronDown size={14} className={`chevron-icon ${showWarehouseDropdown ? 'open' : ''}`} />
                  )}
                </button>
                
                {showWarehouseDropdown && (
                  <div className="warehouse-menu-popup glass-panel">
                    <div className="warehouse-menu-header">Switch Warehouse</div>
                    {availableWarehouses.length === 0 ? (
                      <div className="warehouse-menu-item" style={{ color: '#64748b', cursor: 'default' }}>
                        No warehouses found
                      </div>
                    ) : (
                      availableWarehouses.map(wh => (
                        <button
                          key={wh}
                          className={`warehouse-menu-item ${wh === activeWarehouse ? 'active' : ''}`}
                          onClick={() => handleWarehouseSelect(wh)}
                        >
                          <span>{wh}</span>
                          {wh === activeWarehouse && <CheckCircle size={12} className="check-icon" />}
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
