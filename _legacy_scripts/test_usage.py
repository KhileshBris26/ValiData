from core.usage_analyzer import UsageAnalyzer

queries = [
    {"QUERY_TEXT": "SELECT id, name FROM users"},
    {"QUERY_TEXT": "SELECT u.id, p.title FROM users u JOIN posts p ON u.id = p.user_id"},
    {"QUERY_TEXT": "SELECT COUNT(a.status) FROM my_db.tpch.orders a JOIN my_db.tpch.customer b ON a.o_custkey = b.c_custkey"}
]

result = UsageAnalyzer.analyze_queries(queries)
print(result)

