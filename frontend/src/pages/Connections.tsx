import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Key, Server, Hash } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import './Connections.css';

const Connections: React.FC = () => {
  const { platform } = usePlatform();
  
  // Databricks state
  const [dbHostname, setDbHostname] = useState('');
  const [dbHttpPath, setDbHttpPath] = useState('');
  const [dbToken, setDbToken] = useState('');

  // Snowflake state
  const [sfAccount, setSfAccount] = useState('');
  const [sfUser, setSfUser] = useState('');
  const [sfPassword, setSfPassword] = useState('');
  const [sfRole, setSfRole] = useState('');
  const [sfWarehouse, setSfWarehouse] = useState('');

  const [savedMessage, setSavedMessage] = useState('');
  const [testStatus, setTestStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    // Load existing credentials from sessionStorage on mount
    const saved = sessionStorage.getItem('robin_credentials');
    if (saved) {
      const creds = JSON.parse(saved);
      if (creds.databricks) {
        setDbHostname(creds.databricks.server_hostname || '');
        setDbHttpPath(creds.databricks.http_path || '');
        setDbToken(creds.databricks.access_token || '');
      }
      if (creds.snowflake) {
        setSfAccount(creds.snowflake.account || '');
        setSfUser(creds.snowflake.user || '');
        setSfPassword(creds.snowflake.password || '');
        setSfRole(creds.snowflake.role || '');
        setSfWarehouse(creds.snowflake.warehouse || '');
      }
    }
  }, []);

  const handleSave = () => {
    const credentials = {
      databricks: {
        server_hostname: dbHostname,
        http_path: dbHttpPath,
        access_token: dbToken
      },
      snowflake: {
        account: sfAccount,
        user: sfUser,
        password: sfPassword,
        role: sfRole,
        warehouse: sfWarehouse
      }
    };
    
    sessionStorage.setItem('robin_credentials', JSON.stringify(credentials));
    
    setSavedMessage('Credentials saved securely to your session!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleClear = () => {
    sessionStorage.removeItem('robin_credentials');
    setDbHostname(''); setDbHttpPath(''); setDbToken('');
    setSfAccount(''); setSfUser(''); setSfPassword(''); setSfRole('');
    setSfWarehouse('');
    setSavedMessage('Credentials cleared from session.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleTest = async () => {
    const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';
    const credentials = platform === 'snowflake' ? {
      account: sfAccount,
      user: sfUser,
      password: sfPassword,
      role: sfRole,
      warehouse: sfWarehouse
    } : {
      server_hostname: dbHostname,
      http_path: dbHttpPath,
      access_token: dbToken
    };

    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/auth/test-connection`, {
        platform,
        entity_type: 'databases',
        credentials
      });
      setTestStatus({ type: 'success', msg: res.data.message });
    } catch (err: any) {
      setTestStatus({ 
        type: 'error', 
        msg: err.response?.data?.detail || err.message || 'Connection failed' 
      });
    }
    setIsTesting(false);
  };

  return (
    <div className="connections-page">
      <h1 className="page-title">Connection Vault</h1>
      <p className="subtitle">Configure your warehouse credentials. These are securely stored in your browser's session storage and will be wiped when the tab closes.</p>
      
      <div className="conn-layout glass-panel">
        <h2 style={{marginBottom: '1.5rem'}}>Configuring {platform.toUpperCase()}</h2>

        <div className="conn-form">
          {platform === 'databricks' && (
            <div className="form-grid">
              <div className="form-group">
                <label><Server size={14}/> Server Hostname</label>
                <input type="text" className="input-field" value={dbHostname} onChange={e => setDbHostname(e.target.value)} placeholder="e.g. adb-1234.azuredatabricks.net" />
              </div>
              <div className="form-group">
                <label><Hash size={14}/> HTTP Path</label>
                <input type="text" className="input-field" value={dbHttpPath} onChange={e => setDbHttpPath(e.target.value)} placeholder="e.g. sql/protocolv1/o/1234/5678" />
              </div>
              <div className="form-group full-width">
                <label><Key size={14}/> Personal Access Token</label>
                <input type="password" className="input-field" value={dbToken} onChange={e => setDbToken(e.target.value)} placeholder="dapi..." />
              </div>
            </div>
          )}

          {platform === 'snowflake' && (
            <div className="form-grid">
              <div className="form-group">
                <label><Server size={14}/> Account Identifier</label>
                <input type="text" className="input-field" value={sfAccount} onChange={e => setSfAccount(e.target.value)} placeholder="e.g. xy12345.us-east-1" />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input type="text" className="input-field" value={sfUser} onChange={e => setSfUser(e.target.value)} placeholder="Username" />
              </div>
              <div className="form-group">
                <label><Key size={14}/> Password</label>
                <input type="password" className="input-field" value={sfPassword} onChange={e => setSfPassword(e.target.value)} placeholder="Password" />
              </div>
              <div className="form-group">
                <label>Role</label>
                <input type="text" className="input-field" value={sfRole} onChange={e => setSfRole(e.target.value)} placeholder="e.g. ACCOUNTADMIN" />
              </div>
              <div className="form-group full-width">
                <label>Warehouse</label>
                <input type="text" className="input-field" value={sfWarehouse} onChange={e => setSfWarehouse(e.target.value)} placeholder="e.g. COMPUTE_WH" />
              </div>
            </div>
          )}
        </div>

        <div className="conn-actions">
          <button className="btn btn-secondary" onClick={handleClear}>Clear Session</button>
          <button className="btn btn-secondary" onClick={handleTest} disabled={isTesting}>
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button className="btn btn-primary" onClick={handleSave}>Save Credentials</button>
        </div>
        
        {testStatus && (
          <div className={`test-result ${testStatus.type}`} style={{
            marginTop: '1rem',
            padding: '1rem',
            borderRadius: '8px',
            background: testStatus.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${testStatus.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: testStatus.type === 'success' ? '#10b981' : '#ef4444',
            fontSize: '0.9rem',
            wordBreak: 'break-word'
          }}>
            <strong>{testStatus.type === 'success' ? '✅ Success' : '❌ Connection Error'}:</strong><br/>
            {testStatus.msg}
          </div>
        )}

        {savedMessage && <div className="saved-message">{savedMessage}</div>}
      </div>
    </div>
  );
};

export default Connections;
