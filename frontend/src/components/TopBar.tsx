import React from 'react';
import { Database } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import './TopBar.css';

const TopBar: React.FC = () => {
  const { platform, setPlatform } = usePlatform();

  return (
    <header className="top-bar glass-panel">
      <div className="top-bar-left">
        <div className="logo-icon">DV</div>
        <h2>DATA Vision</h2>
      </div>
      
      <div className="top-bar-right">
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
      </div>
    </header>
  );
};

export default TopBar;
