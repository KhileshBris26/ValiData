import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wand2, Database, GitMerge, History, KeyRound, BookOpen, Sun, Moon, Sparkles, Radio, Bell, Users } from 'lucide-react';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const userType = localStorage.getItem('user_type');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <aside className="sidebar glass-panel">
      <nav className="sidebar-nav">
        <NavLink to="/" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/ai-agent" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <Sparkles size={20} />
          <span>AI Agent</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.8rem' }}>⌘ I</span>
        </NavLink>

        <NavLink to="/studio" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <Wand2 size={20} />
          <span>Rule Studio</span>
        </NavLink>

        <NavLink to="/catalog" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <BookOpen size={20} />
          <span>Data Catalog</span>
        </NavLink>

        <NavLink to="/lineage" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <GitMerge size={20} />
          <span>Lineage Discovery</span>
        </NavLink>

        <NavLink to="/connections" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <KeyRound size={20} />
          <span>Connections</span>
        </NavLink>

        <NavLink to="/analytics" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <History size={20} />
          <span>Usage Analytics</span>
        </NavLink>

        {userType === 'admin' && (
          <NavLink to="/admin-dashboard" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Users size={20} />
            <span>User Management</span>
          </NavLink>
        )}

        <div className="nav-section-title">Data Observability</div>
        <NavLink to="/observability/connections" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <Radio size={20} />
          <span>Connections</span>
        </NavLink>
        <NavLink to="/observability/alerts" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
          <Bell size={20} />
          <span>Alerts</span>
        </NavLink>

        <div className="nav-section-title">Coming Soon</div>
        
        <div className="nav-item disabled">
          <Database size={20} />
          <span>DAMA Quality</span>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div className="branding">
          Powered by <strong>BRISTLECONE</strong>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
