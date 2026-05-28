import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight, Loader2, Database, ArrowLeft, LogIn, UserPlus, ShieldAlert, Mail } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { authService } from '../services/authService';
import './LoginPage.css';

type ScreenStep = 'platform' | 'role' | 'admin_login' | 'user_entry' | 'user_signin' | 'user_signup';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
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
          navigate('/');
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
      </div>

      <div className="security-badge">
        <Shield size={14} />
        <span>Enterprise Grade Encryption Active</span>
      </div>
    </div>
  );
};

export default LoginPage;
