import re

with open('frontend/src/pages/TableDetail.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add new state for qualityBase and lastRunDate right after glossary state
state_injection = """  // Glossary state
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  
  // Quality and execution state from backend
  const [qualityBase, setQualityBase] = useState<number>(100);
  const [lastRunDate, setLastRunDate] = useState<string>('Never');
  const [isRefreshingScore, setIsRefreshingScore] = useState<boolean>(false);

  const fetchQualityScore = useCallback(async () => {
    if (!table) return;
    setIsRefreshingScore(true);
    try {
      const res = await axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}`);
      if (res.data && res.data.has_evaluated) {
        setQualityBase(res.data.overall || 100);
        // Determine last run date from executions if possible, otherwise use a generic "Recently"
        // Wait, since we don't have run_date, let's look at the first execution's executed_at if it exists
        if (res.data.executions && res.data.executions.length > 0 && res.data.executions[0].executed_at) {
          const date = new Date(res.data.executions[0].executed_at + 'Z');
          setLastRunDate(date.toLocaleString());
        } else {
          setLastRunDate(new Date().toLocaleString());
        }
      } else {
        setQualityBase(100);
        setLastRunDate('Never');
      }
    } catch (e) {
      console.error('Failed to fetch quality score from backend:', e);
    } finally {
      setIsRefreshingScore(false);
    }
  }, [table]);

  useEffect(() => {
    fetchQualityScore();
  }, [fetchQualityScore]);
"""
content = content.replace("  // Glossary state\n  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);", state_injection)

# 2. Remove the old synchronous localStorage computation for qualityBase
old_quality_logic = """  // Data Trust Index calculation (0-100) based on weighted pillars
  const savedQuality = localStorage.getItem(`robin_table_quality_${table}`);
  const qualityBase = savedQuality ? parseInt(savedQuality) : 100;"""

new_quality_logic = """  // Data Trust Index calculation (0-100) based on weighted pillars
  // qualityBase is now loaded via fetchQualityScore from the backend state!"""
content = content.replace(old_quality_logic, new_quality_logic)


# 3. Add the refresh button in the "DQ Monitors" card header and update hardcoded date
old_dq_card_header = """            {/* DQ Monitors */}
            <div className="card glass-panel">
              <div className="card-header-with-btn">
                <h3>DQ Monitors</h3>
                <button className="btn-outline">Create</button>
              </div>"""
              
new_dq_card_header = """            {/* DQ Monitors */}
            <div className="card glass-panel">
              <div className="card-header-with-btn">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3>DQ Monitors</h3>
                  <button 
                    onClick={fetchQualityScore} 
                    disabled={isRefreshingScore}
                    title="Refresh score from backend"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
                  >
                    <svg style={{ animation: isRefreshingScore ? 'spin 1s linear infinite' : 'none', transformOrigin: 'center' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.44l5.67 5.67"/></svg>
                  </button>
                </div>
                <button className="btn-outline">Create</button>
              </div>"""
content = content.replace(old_dq_card_header, new_dq_card_header)

old_dq_date = """                  <span className="dq-date">October 21, 2025, 7:52:42 PM</span>"""
new_dq_date = """                  <span className="dq-date">{lastRunDate}</span>"""
content = content.replace(old_dq_date, new_dq_date)


with open('frontend/src/pages/TableDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("TableDetail.tsx patched.")
