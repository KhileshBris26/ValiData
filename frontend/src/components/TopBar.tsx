import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, ChevronDown, CheckCircle, Shield, LogOut } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { authService } from '../services/authService';
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

  // Fetch available roles for dropdown
  const availableRoles = isConnected ? authService.fetchUserRoles(username, platformLabel) : [];

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
            <div className="connection-status-widget">
              <span className="connection-indicator-dot"></span>
              <span className="connection-text">
                Connected as <strong className="username-txt">{username}</strong> ({platformLabel})
              </span>
              <span className="widget-divider">|</span>
              <div className="role-dropdown-container" ref={dropdownRef}>
                <button 
                  className="role-selector-btn"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                >
                  <Shield size={13} className="role-shield-icon" />
                  <span>Role: <strong className="role-name">{activeRole}</strong></span>
                  <ChevronDown size={14} className={`chevron-icon ${showRoleDropdown ? 'open' : ''}`} />
                </button>
                
                {showRoleDropdown && (
                  <div className="role-menu-popup glass-panel">
                    <div className="role-menu-header">Switch Active Role</div>
                    {availableRoles.map(role => (
                      <button
                        key={role}
                        className={`role-menu-item ${role === activeRole ? 'active' : ''}`}
                        onClick={() => handleRoleSelect(role)}
                      >
                        <span>{role}</span>
                        {role === activeRole && <CheckCircle size={12} className="check-icon" />}
                      </button>
                    ))}
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
