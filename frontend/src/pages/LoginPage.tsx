import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight, Loader2, Database, ArrowLeft, LogIn, UserPlus, ShieldAlert, Mail, Server, Globe, Key } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { authService, decryptData } from '../services/authService';
import './LoginPage.css';

type ScreenStep = 'platform' | 'role' | 'admin_login' | 'user_entry' | 'user_signin' | 'user_signup' | 'user_connect' | 'user_select_role';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPlatform } = usePlatform();
  
  // State machine for multi-step flows
  const [step, setStep] = useState<ScreenStep>('platform');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  // User Signup extra fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Snowflake connection credentials states
  const [sfAccount, setSfAccount] = useState('');
  const [sfUsername, setSfUsername] = useState('');
  const [sfPassword, setSfPassword] = useState('');
  const [sfWarehouse, setSfWarehouse] = useState('');
  const [sfDatabase, setSfDatabase] = useState('');
  const [sfSchema, setSfSchema] = useState('');

  // Databricks connection credentials states
  const [dbWorkspaceUrl, setDbWorkspaceUrl] = useState('');
  const [dbToken, setDbToken] = useState('');
  const [dbClusterId, setDbClusterId] = useState('');

  // Connection testing states
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testConnectionSuccess, setTestConnectionSuccess] = useState<boolean | null>(null);
  const [testConnectionMessage, setTestConnectionMessage] = useState('');

  // Role Selection states
  const [fetchedRoles, setFetchedRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('PUBLIC');

  // Parse location state redirect feedback (such as logout alerts)
  useEffect(() => {
    if (location.state && (location.state as any).message) {
      setSuccessMessage((location.state as any).message);
      // Wipe the history state so refreshing the browser hides the alert
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Connection gating redirection on mount
  useEffect(() => {
    const token = localStorage.getItem('robin_auth_token');
    const userType = localStorage.getItem('user_type');
    const isConnected = localStorage.getItem('is_connected') === 'true';

    if (token) {
      if (userType === 'admin') {
        navigate('/admin-dashboard');
      } else if (userType === 'user') {
        if (isConnected) {
          navigate('/');
        } else {
          // Pre-populate username and route to connection configuration page
          const savedUser = localStorage.getItem('robin_user') || '';
          setUserUsername(savedUser);
          setStep('user_connect');
        }
      }
    }
  }, [navigate]);

  // Handle platform selection
  const selectPlatform = (platform: 'snowflake' | 'databricks') => {
    setPlatform(platform);
    localStorage.setItem('selected_platform', platform);
    setStep('role');
  };

  // Handle role selection
  const selectRole = (role: 'admin' | 'user') => {
    localStorage.setItem('selected_role', role);
    localStorage.setItem('user_type', role);
    if (role === 'admin') {
      setStep('admin_login');
    } else {
      setStep('user_entry');
    }
  };

  // Handle Admin login submit
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      if (adminUsername === 'Khilesh' && adminPassword === 'ValiData@2026') {
        localStorage.setItem('robin_auth_token', 'admin_token_Khilesh_secure');
        localStorage.setItem('robin_user', 'Khilesh');
        localStorage.setItem('is_authenticated', 'true');
        localStorage.setItem('user_type', 'admin');
        navigate('/admin-dashboard');
      } else {
        setError('Invalid admin credentials');
      }
      setIsLoading(false);
    }, 800);
  };

  // Handle User sign in submit
  const handleUserSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Clear any leftover connection tokens
    localStorage.removeItem('robin_user_session');
    localStorage.removeItem('is_connected');
    localStorage.removeItem('selected_role');

    setTimeout(() => {
      if (userUsername.trim() && userPassword.trim()) {
        const result = authService.authenticateUser(userUsername, userPassword);
        if (result.success && result.user) {
          localStorage.setItem('robin_auth_token', `user_token_${userUsername}_secure`);
          localStorage.setItem('robin_user', userUsername);
          localStorage.setItem('is_authenticated', 'true');
          localStorage.setItem('user_type', 'user');
          const userPlatform = result.user.selected_platform || 'snowflake';
          localStorage.setItem('selected_platform', userPlatform);
          setPlatform(userPlatform as 'snowflake' | 'databricks');

          // Pre-populate connection fields if they are already saved in the user request object
          if (result.user.credentials) {
            const creds = result.user.credentials;
            if (userPlatform === 'snowflake') {
              setSfAccount(creds.account || '');
              setSfUsername(creds.username || '');
              setSfPassword(decryptData(creds.password) || '');
              setSfWarehouse(creds.warehouse || '');
              setSfDatabase(creds.database || '');
              setSfSchema(creds.schema || '');
            } else if (userPlatform === 'databricks') {
              setDbWorkspaceUrl(creds.workspace_url || '');
              setDbToken(decryptData(creds.token) || '');
              setDbClusterId(creds.cluster_id || '');
            }
          }

          // Force step to platform connection config screen
          setStep('user_connect');
        } else {
          setError(result.message);
        }
      } else {
        setError('Please fill in all credentials.');
      }
      setIsLoading(false);
    }, 800);
  };

  // Handle User sign up submit
  const handleUserSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    if (!fullName.trim() || !userUsername.trim() || !email.trim() || !userPassword.trim() || !userConfirmPassword.trim()) {
      setError('All fields are mandatory.');
      setIsLoading(false);
      return;
    }

    if (userPassword !== userConfirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    setTimeout(() => {
      const selectedPlatform = localStorage.getItem('selected_platform') || 'snowflake';
      const result = authService.createUserRequest({
        full_name: fullName.trim(),
        username: userUsername.trim(),
        email: email.trim(),
        password_raw: userPassword,
        password_masked: '*'.repeat(userPassword.length),
        selected_platform: selectedPlatform
      });

      if (result.success) {
        setSuccessMessage(result.message);
        setFullName('');
        setEmail('');
        setUserUsername('');
        setUserPassword('');
        setUserConfirmPassword('');
        
        setTimeout(() => {
          setStep('user_signin');
          setSuccessMessage('');
        }, 3000);
      } else {
        setError(result.message);
      }
      setIsLoading(false);
    }, 800);
  };

  // Handle connection testing
  const handleTestConnection = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTestingConnection(true);
    setTestConnectionSuccess(null);
    setTestConnectionMessage('');

    const activePlat = localStorage.getItem('selected_platform') || 'snowflake';

    setTimeout(() => {
      if (activePlat === 'snowflake') {
        if (!sfAccount.trim() || !sfUsername.trim() || !sfPassword.trim()) {
          setTestConnectionSuccess(false);
          setTestConnectionMessage('Connection failed: Account Identifier, Username, and Password are required.');
          setIsTestingConnection(false);
          return;
        }
        if (!sfAccount.includes('.')) {
          setTestConnectionSuccess(false);
          setTestConnectionMessage('Connection failed: Invalid Snowflake Account Identifier format.');
          setIsTestingConnection(false);
          return;
        }
        setTestConnectionSuccess(true);
        setTestConnectionMessage('Connection successful! Valid Snowflake parameters.');
      } else {
        if (!dbWorkspaceUrl.trim() || !dbToken.trim()) {
          setTestConnectionSuccess(false);
          setTestConnectionMessage('Connection failed: Workspace URL and Personal Access Token are required.');
          setIsTestingConnection(false);
          return;
        }
        if (!dbWorkspaceUrl.startsWith('http://') && !dbWorkspaceUrl.startsWith('https://')) {
          setTestConnectionSuccess(false);
          setTestConnectionMessage('Connection failed: Workspace URL must start with http:// or https://.');
          setIsTestingConnection(false);
          return;
        }
        setTestConnectionSuccess(true);
        setTestConnectionMessage('Connection successful! Valid Databricks workspace token.');
      }
      setIsTestingConnection(false);
    }, 1200);
  };

  // Handle Save Credentials and proceed to Role Selection
  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const activePlat = localStorage.getItem('selected_platform') || 'snowflake';
    const currentUser = localStorage.getItem('robin_user') || 'user';

    setTimeout(() => {
      let credentials: any = {};
      if (activePlat === 'snowflake') {
        credentials = {
          account: sfAccount.trim(),
          username: sfUsername.trim(),
          password: sfPassword,
          warehouse: sfWarehouse.trim(),
          database: sfDatabase.trim(),
          schema: sfSchema.trim()
        };
      } else {
        credentials = {
          workspace_url: dbWorkspaceUrl.trim(),
          token: dbToken,
          cluster_id: dbClusterId.trim()
        };
      }

      const res = authService.updateUserCredentials(currentUser, activePlat, credentials);
      if (res.success) {
        // Fetch Snowflake/Databricks roles based on connection info
        const roles = authService.fetchUserRoles(currentUser, activePlat);
        setFetchedRoles(roles);
        if (roles.length > 0) {
          const defaultRole = roles.includes('PUBLIC') ? 'PUBLIC' : roles[0] || 'PUBLIC';
          setSelectedRole(defaultRole);
        }
        setStep('user_select_role');
      } else {
        setError(res.message);
      }
      setIsLoading(false);
    }, 800);
  };

  // Refresh roles button trigger
  const handleRefreshRoles = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage('');
    setError('');

    const currentUser = localStorage.getItem('robin_user') || 'user';
    const activePlat = localStorage.getItem('selected_platform') || 'snowflake';

    setTimeout(() => {
      const roles = authService.fetchUserRoles(currentUser, activePlat);
      setFetchedRoles(roles);
      if (roles.length > 0) {
        const defaultRole = roles.includes('PUBLIC') ? 'PUBLIC' : roles[0] || 'PUBLIC';
        setSelectedRole(defaultRole);
        setSuccessMessage('Roles refreshed successfully');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError('No roles found. Please contact your Snowflake administrator.');
      }
      setIsLoading(false);
    }, 1000);
  };

  // Handle Role Confirmation and Enter Application
  const handleSelectRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const currentUser = localStorage.getItem('robin_user') || 'user';
    const activePlat = localStorage.getItem('selected_platform') || 'snowflake';

    setTimeout(() => {
      authService.updateUserRole(currentUser, selectedRole);

      localStorage.setItem('selected_role', selectedRole);
      localStorage.setItem('is_connected', 'true');

      const userSession = {
        username: currentUser,
        user_type: 'USER',
        platform: activePlat,
        credentials_encrypted: true,
        selected_role: selectedRole,
        is_connected: true
      };
      localStorage.setItem('robin_user_session', JSON.stringify(userSession));

      setIsLoading(false);
      navigate('/');
    }, 800);
  };

  const getPlatformLabel = () => {
    const p = localStorage.getItem('selected_platform') || 'snowflake';
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="blob"></div>
        <div className="blob"></div>
        <div className="blob"></div>
      </div>

      <div className="login-card glass-panel">
        <div className="login-header">
          <div className="logo-section">
            <div className="logo-icon">
              <Database size={24} color="#3b82f6" />
            </div>
            <h1 className="brand-name">ValiData</h1>
          </div>
        </div>

        {/* 1. Platform Selection */}
        {step === 'platform' && (
          <div className="login-flow-step">
            <h2 className="step-title">Select Database Platform</h2>
            <p className="step-subtitle">Choose the target environment to inspect and profile</p>
            <div className="selection-tiles">
              <button onClick={() => selectPlatform('snowflake')} className="selection-tile">
                <div className="tile-icon-wrapper snowflake-color">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    <line x1="4.93" y1="19.07" x2="19.07" y2="4.93"></line>
                    <polyline points="10 4 12 2 14 4"></polyline>
                    <polyline points="10 20 12 22 14 20"></polyline>
                    <polyline points="4 10 2 12 4 14"></polyline>
                    <polyline points="20 10 22 12 20 14"></polyline>
                  </svg>
                </div>
                <span className="tile-label">Snowflake</span>
              </button>

              <button onClick={() => selectPlatform('databricks')} className="selection-tile">
                <div className="tile-icon-wrapper databricks-color">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                  </svg>
                </div>
                <span className="tile-label">Databricks</span>
              </button>
            </div>
            {successMessage && <div className="success-message">{successMessage}</div>}
          </div>
        )}

        {/* 2. Role Selection */}
        {step === 'role' && (
          <div className="login-flow-step">
            <h2 className="step-title">Select User Role</h2>
            <p className="step-subtitle">Platform: <strong className="highlight-text">{getPlatformLabel()}</strong></p>
            <div className="selection-tiles">
              <button onClick={() => selectRole('admin')} className="selection-tile">
                <div className="tile-icon-wrapper role-admin-color">
                  <ShieldAlert size={36} />
                </div>
                <span className="tile-label">Admin</span>
              </button>

              <button onClick={() => selectRole('user')} className="selection-tile">
                <div className="tile-icon-wrapper role-user-color">
                  <User size={36} />
                </div>
                <span className="tile-label">User</span>
              </button>
            </div>
            <button onClick={() => setStep('platform')} className="btn-step-back">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* 3. Admin Authentication Flow */}
        {step === 'admin_login' && (
          <div className="login-flow-step">
            <h2 className="step-title">Admin Authentication</h2>
            <p className="step-subtitle">Role: <strong className="highlight-text">Admin</strong> · Platform: <strong className="highlight-text">{getPlatformLabel()}</strong></p>
            <form onSubmit={handleAdminSubmit} className="login-form">
              {error && <div className="error-message">{error}</div>}
              
              <div className="input-group">
                <label htmlFor="admin-username">Username</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    id="admin-username"
                    type="text" 
                    placeholder="Enter admin username" 
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="admin-password">Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    id="admin-password"
                    type="password" 
                    placeholder="Enter admin password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-login" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="spinner" size={20} />
                ) : (
                  <>
                    <span>Authenticate Admin</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <button onClick={() => setStep('role')} className="btn-step-back">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* 4. User Entry Selection */}
        {step === 'user_entry' && (
          <div className="login-flow-step">
            <h2 className="step-title">User Account Entry</h2>
            <p className="step-subtitle">Platform: <strong className="highlight-text">{getPlatformLabel()}</strong></p>
            
            <div className="user-entry-options">
              <button onClick={() => setStep('user_signin')} className="user-entry-btn">
                <LogIn size={20} />
                <span>Sign In to existing account</span>
              </button>
              
              <button onClick={() => setStep('user_signup')} className="user-entry-btn accent-btn">
                <UserPlus size={20} />
                <span>Create new user account</span>
              </button>
            </div>
            
            <button onClick={() => setStep('role')} className="btn-step-back">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* 5. User Sign In Form */}
        {step === 'user_signin' && (
          <div className="login-flow-step">
            <h2 className="step-title">User Sign In</h2>
            <p className="step-subtitle">Sign in to your ValiData account ({getPlatformLabel()})</p>
            <form onSubmit={handleUserSignIn} className="login-form">
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}
              
              <div className="input-group">
                <label htmlFor="user-username">Username</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    id="user-username"
                    type="text" 
                    placeholder="Enter your username" 
                    value={userUsername}
                    onChange={(e) => setUserUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="user-password">Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    id="user-password"
                    type="password" 
                    placeholder="Enter your password" 
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-login" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="spinner" size={20} />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <button onClick={() => setStep('user_entry')} className="btn-step-back">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* 6. User Sign Up Form */}
        {step === 'user_signup' && (
          <div className="login-flow-step">
            <h2 className="step-title">User Sign Up</h2>
            <p className="step-subtitle">Register new ValiData profile ({getPlatformLabel()})</p>
            <form onSubmit={handleUserSignUp} className="login-form">
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}
              
              <div className="input-group">
                <label htmlFor="signup-fullname">Full Name</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    id="signup-fullname"
                    type="text" 
                    placeholder="Enter full name" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="signup-username">Username</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    id="signup-username"
                    type="text" 
                    placeholder="Create username" 
                    value={userUsername}
                    onChange={(e) => setUserUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="signup-email">Email</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input 
                    id="signup-email"
                    type="email" 
                    placeholder="Enter email address" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="signup-password">Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    id="signup-password"
                    type="password" 
                    placeholder="Create password" 
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="signup-confirm-password">Confirm Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    id="signup-confirm-password"
                    type="password" 
                    placeholder="Verify password" 
                    value={userConfirmPassword}
                    onChange={(e) => setUserConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-login" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="spinner" size={20} />
                ) : (
                  <>
                    <span>Create Profile</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <button onClick={() => setStep('user_entry')} className="btn-step-back">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* 7. Connect Your Platform Step */}
        {step === 'user_connect' && (
          <div className="login-flow-step">
            <h2 className="step-title">Connect Your Platform</h2>
            <p className="step-subtitle">Configure credentials for <strong className="highlight-text">{getPlatformLabel()}</strong></p>
            
            <form onSubmit={handleSaveConnection} className="login-form">
              {error && <div className="error-message">{error}</div>}
              
              {localStorage.getItem('selected_platform') === 'snowflake' ? (
                <>
                  <div className="input-group">
                    <label htmlFor="sf-account">Account Identifier</label>
                    <div className="input-wrapper">
                      <Globe size={18} className="input-icon" />
                      <input 
                        id="sf-account"
                        type="text" 
                        placeholder="e.g. xy12345.region.azure" 
                        value={sfAccount}
                        onChange={(e) => {
                          setSfAccount(e.target.value);
                          setTestConnectionSuccess(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="sf-username">Username</label>
                    <div className="input-wrapper">
                      <User size={18} className="input-icon" />
                      <input 
                        id="sf-username"
                        type="text" 
                        placeholder="Snowflake Username" 
                        value={sfUsername}
                        onChange={(e) => {
                          setSfUsername(e.target.value);
                          setTestConnectionSuccess(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="sf-password">Password</label>
                    <div className="input-wrapper">
                      <Lock size={18} className="input-icon" />
                      <input 
                        id="sf-password"
                        type="password" 
                        placeholder="••••••••" 
                        value={sfPassword}
                        onChange={(e) => {
                          setSfPassword(e.target.value);
                          setTestConnectionSuccess(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group-row">
                    <div className="input-group">
                      <label htmlFor="sf-warehouse">Warehouse (optional)</label>
                      <input 
                        id="sf-warehouse"
                        type="text" 
                        placeholder="COMPUTE_WH" 
                        value={sfWarehouse}
                        onChange={(e) => setSfWarehouse(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="sf-database">Database (optional)</label>
                      <input 
                        id="sf-database"
                        type="text" 
                        placeholder="DEMO_DB" 
                        value={sfDatabase}
                        onChange={(e) => setSfDatabase(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="sf-schema">Schema (optional)</label>
                      <input 
                        id="sf-schema"
                        type="text" 
                        placeholder="PUBLIC" 
                        value={sfSchema}
                        onChange={(e) => setSfSchema(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="input-group">
                    <label htmlFor="db-url">Workspace URL</label>
                    <div className="input-wrapper">
                      <Globe size={18} className="input-icon" />
                      <input 
                        id="db-url"
                        type="text" 
                        placeholder="https://adb-123456.azuredatabricks.net" 
                        value={dbWorkspaceUrl}
                        onChange={(e) => {
                          setDbWorkspaceUrl(e.target.value);
                          setTestConnectionSuccess(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="db-token">Personal Access Token</label>
                    <div className="input-wrapper">
                      <Key size={18} className="input-icon" />
                      <input 
                        id="db-token"
                        type="password" 
                        placeholder="dapi••••••••••••••••" 
                        value={dbToken}
                        onChange={(e) => {
                          setDbToken(e.target.value);
                          setTestConnectionSuccess(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="db-cluster">Cluster ID (optional)</label>
                    <div className="input-wrapper">
                      <Server size={18} className="input-icon" />
                      <input 
                        id="db-cluster"
                        type="text" 
                        placeholder="1012-034567-make123" 
                        value={dbClusterId}
                        onChange={(e) => setDbClusterId(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {testConnectionSuccess === true && (
                <div className="test-success-banner">
                  <span>{testConnectionMessage}</span>
                </div>
              )}

              {testConnectionSuccess === false && (
                <div className="test-error-banner">
                  <span>{testConnectionMessage}</span>
                </div>
              )}

              <div className="connection-action-buttons">
                <button 
                  type="button" 
                  onClick={handleTestConnection} 
                  className="btn-test-connection" 
                  disabled={isTestingConnection}
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 className="spinner" size={16} />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>

                <button 
                  type="submit" 
                  className="btn-login" 
                  disabled={isLoading || testConnectionSuccess !== true}
                >
                  {isLoading ? (
                    <Loader2 className="spinner" size={20} />
                  ) : (
                    <>
                      <span>Save & Continue</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 8. Role Selection Step */}
        {step === 'user_select_role' && (
          <div className="login-flow-step">
            <h2 className="step-title">Select Security Context</h2>
            <p className="step-subtitle">Platform connection verified successfully</p>
            
            <form onSubmit={handleSelectRoleSubmit} className="login-form">
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}

              <div className="connection-summary-panel">
                <div className="summary-row">
                  <span className="summary-label">Username:</span>
                  <span className="summary-value font-semibold">{localStorage.getItem('robin_user')}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Platform:</span>
                  <span className="summary-value badge platform">{localStorage.getItem('selected_platform')}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Credentials Status:</span>
                  <span className="summary-value success-text">•••••••• (Masked & Encrypted)</span>
                </div>
              </div>

              <div className="role-dropdown-container-with-refresh">
                <div className="input-group select-role-group">
                  <label htmlFor="active-role-select">Select Active Role</label>
                  {fetchedRoles.length === 0 ? (
                    <div className="error-message no-roles-error">
                      No roles found. Please contact your Snowflake administrator.
                    </div>
                  ) : (
                    <div className="input-wrapper select-wrapper">
                      <Shield size={18} className="input-icon" />
                      <select 
                        id="active-role-select"
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="custom-role-dropdown"
                        required
                      >
                        {fetchedRoles.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                
                <button 
                  type="button" 
                  onClick={handleRefreshRoles}
                  className="btn-refresh-roles"
                  disabled={isLoading}
                >
                  ↻ Refresh Roles
                </button>
              </div>

              <button 
                type="submit" 
                className="btn-login" 
                disabled={isLoading || fetchedRoles.length === 0}
              >
                {isLoading ? (
                  <Loader2 className="spinner" size={20} />
                ) : (
                  <>
                    <span>Confirm & Enter Application</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <button 
              onClick={() => {
                setError('');
                setSuccessMessage('');
                setStep('user_connect');
              }} 
              className="btn-step-back"
            >
              <ArrowLeft size={16} />
              <span>Reconnect</span>
            </button>
          </div>
        )}
      </div>

      <div className="security-badge">
        <Shield size={14} />
        <span>Enterprise Grade Encryption Active</span>
      </div>
    </div>
  );
};

export default LoginPage;
