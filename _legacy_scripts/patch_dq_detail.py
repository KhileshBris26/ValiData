import re

with open('frontend/src/pages/DataQualityDetail.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace hasEvaluated
content = re.sub(
    r"const \[hasEvaluated, setHasEvaluated\] = useState\(\(\) => localStorage\.getItem\('robin_has_evaluated'\) === 'true'\);",
    r"const [hasEvaluated, setHasEvaluated] = useState(false);",
    content
)

# 2. Replace ruleExecutionResults
exec_regex = r"const \[ruleExecutionResults, setRuleExecutionResults\] = useState<Record<string, \{\n    total: number;\n    passed: number;\n    failed: number;\n    score: number;\n  \}>>\(\(\) => \{\n    try \{\n      const saved = localStorage\.getItem\(`robin_rule_exec_results_\$\{table\}`\);\n      return saved \? JSON\.parse\(saved\) : \{\};\n    \} catch \{ return \{\}; \}\n  \}\);"
exec_replace = r"""const [ruleExecutionResults, setRuleExecutionResults] = useState<Record<string, {
    total: number;
    passed: number;
    failed: number;
    score: number;
  }>>({});"""
content = re.sub(exec_regex, exec_replace, content)

# 3. Replace evaluatedResults
eval_regex = r"const \[evaluatedResults, setEvaluatedResults\] = useState<\{\n    table\?: string;\n    overall: number;\n    validity: number;\n    accuracy: number;\n    columns: Record<string, string>;\n  \} \| null>\(\(\) => \{\n    try \{\n      const saved = localStorage\.getItem\(`robin_evaluated_results_\$\{table\}`\);\n      return saved \? JSON\.parse\(saved\) : null;\n    \} catch \{\n      return null;\n    \}\n  \}\);"
eval_replace = r"""const [evaluatedResults, setEvaluatedResults] = useState<{
    table?: string;
    overall: number;
    validity: number;
    accuracy: number;
    columns: Record<string, string>;
  } | null>(null);"""
content = re.sub(eval_regex, eval_replace, content)

# 4. Replace the useEffect for table
use_effect_regex = r"useEffect\(\(\) => \{\n    if \(table\) \{\n      try \{\n        const savedResults = localStorage\.getItem\(`robin_evaluated_results_\$\{table\}`\);\n        setEvaluatedResults\(savedResults \? JSON\.parse\(savedResults\) : null\);\n      \} catch \{\n        setEvaluatedResults\(null\);\n      \}\n      try \{\n        const savedProfiles = localStorage\.getItem\(`robin_col_profiles_\$\{table\}`\);\n        setColProfiles\(savedProfiles \? JSON\.parse\(savedProfiles\) : \{\}\);\n      \} catch \{\n        setColProfiles\(\{\}\);\n      \}\n    \}\n  \}, \[table\]\);"
use_effect_replace = r"""
  const fetchLatestEvaluations = async () => {
    if (!table) return;
    try {
      const res = await axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}`);
      if (res.data && res.data.has_evaluated) {
        setHasEvaluated(true);
        const backendExecs = res.data.executions || [];
        
        // Reconstruct evaluatedResults
        const newEval = {
            table: table,
            overall: res.data.overall || 100,
            validity: res.data.overall || 100, // approximations if validity/accuracy aren't split in backend
            accuracy: res.data.overall || 100,
            columns: {} as Record<string, string>
        };
        
        // Reconstruct ruleExecutionResults
        const newRuleExecResults: Record<string, any> = {};
        backendExecs.forEach((ex: any) => {
            const key = `${ex.column_name}|${ex.rule_type}`;
            const scoreVal = ex.total_rows > 0 ? Math.round((1 - ex.failed_rows / ex.total_rows) * 100) : 100;
            newRuleExecResults[key] = {
                total: ex.total_rows,
                passed: ex.passed_rows || (ex.total_rows - ex.failed_rows),
                failed: ex.failed_rows,
                score: scoreVal
            };
            
            // Reconstruct column status based on the lowest score
            if (!newEval.columns[ex.column_name]) {
                newEval.columns[ex.column_name] = scoreVal > 80 ? 'high' : scoreVal > 50 ? 'med' : 'low';
            } else {
                const currentStatus = newEval.columns[ex.column_name];
                if (currentStatus === 'high' && scoreVal <= 80) newEval.columns[ex.column_name] = 'med';
                if (currentStatus === 'med' && scoreVal <= 50) newEval.columns[ex.column_name] = 'low';
            }
        });
        
        setEvaluatedResults(newEval);
        setRuleExecutionResults(newRuleExecResults);
      } else {
        setHasEvaluated(false);
        setEvaluatedResults(null);
        setRuleExecutionResults({});
      }
    } catch (e) {
      console.error("Failed to fetch latest evaluations:", e);
    }
  };

  useEffect(() => {
    if (table) {
      fetchLatestEvaluations();
      try {
        const savedProfiles = localStorage.getItem(`robin_col_profiles_${table}`);
        setColProfiles(savedProfiles ? JSON.parse(savedProfiles) : {});
      } catch {
        setColProfiles({});
      }
    }
  }, [table]);
"""
content = re.sub(use_effect_regex, use_effect_replace, content)

# 5. Remove localStorage sets in handleEvaluate
content = content.replace("localStorage.setItem(`robin_evaluated_results_${table}`, JSON.stringify(results));", "")
content = content.replace("localStorage.setItem(`robin_table_quality_${table}`, results.overall.toString());", "")
content = content.replace("localStorage.setItem('robin_has_evaluated', 'true');", "")
content = content.replace("localStorage.setItem(`robin_rule_exec_results_${table}`, JSON.stringify(newRuleExecResults));", "")

# 6. Remove the local storage usage for scores in the UI rendering
# Specifically:
# useEffect(() => {
#    if (table && evaluatedResults && evaluatedResults.table === table) {
#      localStorage.setItem(`robin_table_quality_${table}`, displayOverall.toString());
#    }
#  }, [table, displayOverall, evaluatedResults]);
render_sync_regex = r"useEffect\(\(\) => \{\n    if \(table && evaluatedResults && evaluatedResults\.table === table\) \{\n      localStorage\.setItem\(`robin_table_quality_\$\{table\}`, displayOverall\.toString\(\)\);\n    \}\n  \}, \[table, displayOverall, evaluatedResults\]\);"
content = re.sub(render_sync_regex, "", content)

with open('frontend/src/pages/DataQualityDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("DataQualityDetail.tsx patched.")
