import sqlglot
from sqlglot import exp

sql = """
WITH tickets_numbered AS (
    SELECT * FROM my_db.my_schema.real_table
),
flight_assignments AS (
    SELECT * FROM tickets_numbered
)
SELECT * FROM flight_assignments
"""

parsed = sqlglot.parse_one(sql)

# Find CTE names
cte_names = set()
for cte in parsed.find_all(exp.CTE):
    cte_names.add(cte.alias.lower())

print("CTE Names:", cte_names)

for table in parsed.find_all(exp.Table):
    t_name = table.name.lower()
    if t_name in cte_names:
        print("Ignoring CTE Table:", t_name)
    else:
        print("Real Table:", t_name)

