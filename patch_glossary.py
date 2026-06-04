import re

with open('frontend/src/pages/TableDetail.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_options_div = """                    <div className="glossary-options">
                      {GLOSSARY_OPTIONS.filter(o => o.toLowerCase().includes(glossarySearch.toLowerCase())).map(opt => (
                        <label key={opt} className="glossary-option">
                          <input 
                            type="checkbox" 
                            checked={selectedTerms.includes(opt)}
                            onChange={() => toggleTerm(opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>"""

new_options_div = """                    <div className="glossary-options">
                      {glossarySearch.trim() !== '' && 
                       !GLOSSARY_OPTIONS.some(o => o.toLowerCase() === glossarySearch.trim().toLowerCase()) && 
                       !selectedTerms.some(t => t.toLowerCase() === glossarySearch.trim().toLowerCase()) && (
                        <div 
                          className="glossary-option" 
                          onClick={() => {
                            toggleTerm(glossarySearch.trim());
                            setGlossarySearch('');
                          }}
                          style={{ cursor: 'pointer', color: '#3b82f6', fontWeight: 600, padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', marginBottom: '4px' }}
                        >
                          + Add "{glossarySearch.trim()}"
                        </div>
                      )}
                      {GLOSSARY_OPTIONS.filter(o => o.toLowerCase().includes(glossarySearch.toLowerCase())).map(opt => (
                        <label key={opt} className="glossary-option">
                          <input 
                            type="checkbox" 
                            checked={selectedTerms.includes(opt)}
                            onChange={() => toggleTerm(opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>"""

content = content.replace(old_options_div, new_options_div)

with open('frontend/src/pages/TableDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("TableDetail.tsx patched.")
