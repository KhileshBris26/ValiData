import re

with open('frontend/src/pages/DataCatalog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """
        // Fetch persistent metadata across multiple schemas
        let metadataMap: any = {};
        try {
          if (res.data.tables && res.data.tables.length > 0) {
            // Group by DB and Schema
            const schemaSet = new Set<string>();
            res.data.tables.forEach((t: any) => {
              const db = t.DATABASE || t.database;
              const sch = t.SCHEMA || t.schema;
              if (db && sch) {
                schemaSet.add(`${db}||${sch}`);
              }
            });

            const promises = Array.from(schemaSet).map(async (schemaKey) => {
              const [db, sch] = schemaKey.split("||");
              try {
                const metaRes = await axios.post(`${API_BASE}/metadata/fetch-all`, {
                  platform,
                  database_name: db,
                  schema_name: sch
                });
                if (metaRes.data.metadata) {
                  return metaRes.data.metadata;
                }
              } catch (e) {
                console.error(`Failed to fetch metadata for ${db}.${sch}`, e);
              }
              return {};
            });

            const results = await Promise.all(promises);
            results.forEach(resMap => {
              metadataMap = { ...metadataMap, ...resMap };
            });
          }
        } catch (err) {
          console.error("Failed to fetch metadata", err);
        }
"""

# Replace the try/catch block for fetching metadata
pattern = r"// Fetch persistent metadata\s+let metadataMap: any = \{\};\s+try \{.*?\bconst metaRes = await axios\.post.*?catch \(err\) \{\s+console\.error\(\"Failed to fetch metadata\", err\);\s+\}"

new_content = re.sub(pattern, replacement.strip(), content, flags=re.DOTALL)

with open('frontend/src/pages/DataCatalog.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
    print("Patched DataCatalog.tsx")
