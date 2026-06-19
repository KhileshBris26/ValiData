import re

with open('frontend/src/pages/DataCatalog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add states
old_states = """  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);"""
new_states = """  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);"""
content = content.replace(old_states, new_states)

# 2. Add loading logic in fetchCatalog
old_fetch_start = """  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);"""
new_fetch_start = """  useEffect(() => {
    const fetchCatalog = async () => {
      if (refreshTrigger > 0) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }"""
content = content.replace(old_fetch_start, new_fetch_start)

# 3. Add loading finish logic
old_fetch_end = """      setLoading(false);
    };
    fetchCatalog();
  }, [platform]);"""
new_fetch_end = """      setLoading(false);
      setIsRefreshing(false);
    };
    fetchCatalog();
  }, [platform, refreshTrigger]);"""
content = content.replace(old_fetch_end, new_fetch_end)

# 4. Cache bust the scores request
old_api_call = "axios.get(`${API_BASE}/dashboard/catalog-quality-scores`);"
new_api_call = "axios.get(`${API_BASE}/dashboard/catalog-quality-scores?_t=${Date.now()}`);"
content = content.replace(old_api_call, new_api_call)

# 5. Add refresh button in JSX
old_jsx_tabs = """        <div className="catalog-tabs">
          {tabs.map(tab => (
            <button 
              key={tab} 
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>"""
new_jsx_tabs = """        <div className="catalog-tabs">
          {tabs.map(tab => (
            <button 
              key={tab} 
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: '16px' }}>
          <button 
            onClick={() => setRefreshTrigger(prev => prev + 1)} 
            disabled={isRefreshing}
            className="btn-outline"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 12px', 
              background: 'rgba(255,255,255,0.05)', 
              color: 'var(--text-main)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '6px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              opacity: isRefreshing ? 0.7 : 1,
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            <RotateCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>"""
content = content.replace(old_jsx_tabs, new_jsx_tabs)


with open('frontend/src/pages/DataCatalog.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("DataCatalog patched")
