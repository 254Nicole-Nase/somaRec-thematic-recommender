"""Compare the actual ordered lexical hits for equivalent queries."""


def comparison(baseline, report):
    old_queries = {q["id"]: q for q in baseline["queries"]}
    old_runs = {r["query_id"]: r for r in baseline["runs"] if r["system"] == "A_lexical"}
    queries = {q["id"]: q for q in report["queries"]}
    rows = []
    for run in report["runs"]:
        if run["system"] != "A_lexical":
            continue
        key = run["query_id"]
        query = queries[key]
        if old_queries.get(key) != query:
            continue  # Custom experiments have no comparable baseline for this query.
        before, after = old_runs[key]["results"], run["results"]
        old_ids, new_ids = ([hit["work_id"] for hit in hits] for hits in (before, after))
        changes = []
        for wid in dict.fromkeys(old_ids + new_ids):
            def position_and_fields(hits, ids):
                if wid not in ids:
                    return None, set()
                pos = ids.index(wid)
                return pos + 1, {m["field"] for m in hits[pos]["literal_evidence_matches"]}
            previous, past_fields = position_and_fields(before, old_ids)
            current, now_fields = position_and_fields(after, new_ids)
            changes.append({"work_id": wid, "previous_rank": previous, "current_rank": current,
                            "fields_added": sorted(now_fields - past_fields),
                            "fields_removed": sorted(past_fields - now_fields)})
        rows.append({"query_id": key, "query": query["query"], "before": old_ids, "after": new_ids,
                     "added": [w for w in new_ids if w not in old_ids],
                     "removed": [w for w in old_ids if w not in new_ids], "changes": changes,
                     "was_empty": not before, "is_empty": not after, "interpretation": run["interpretation"]})
    return {"baseline_commit": "fa10c736fda32378db233094e9d8efe63034696c", "mode": report["mode"],
            "queries": rows}
