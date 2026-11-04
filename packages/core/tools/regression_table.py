"""
Old-vs-new table for the pinned regression values (tests/regression.test.ts), for docs/model-audit/LOG.md.

  python tools/regression_table.py old.json new.json new_without_hazard_bounds.json [--findings-m4 M4] [--findings-other "M2/M3"]

Attribution: a value that differs between old and new is put down to
  - the "other" findings if new == new-without-hazard-bounds (the change is there without M4), and old != that;
  - M4 alone if new-without-hazard-bounds == old (the change only appears once hazard ranges enter the bounds);
  - both otherwise.
"""
import json, sys

old, new, nob = (json.load(open(p, encoding="utf8")) for p in sys.argv[1:4])
other = "M2/M3"
m4 = "M4"
for i, a in enumerate(sys.argv):
    if a == "--findings-other": other = sys.argv[i + 1]
    if a == "--findings-m4": m4 = sys.argv[i + 1]

def same(a, b):
    return a == b or (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 1e-9)

def why(o, n, x):
    if same(o, n): return None
    if same(x, n): return other
    if same(x, o): return m4
    return f"{other} + {m4}"

rows = []
for sc in ["surge", "flood", "compound"]:
    O, N, X = old[sc], new[sc], nob[sc]
    for k, v in N["totals"].items():
        if v is None: continue
        for b in ["low", "central", "high"]:
            o, n, x = O["totals"][k][b], v[b], X["totals"][k][b]
            w = why(o, n, x)
            if w: rows.append((sc, f"total {k} [{b}]", o, n, w))
    for so, sn, sx in zip(O["segments"], N["segments"], X["segments"]):
        w = why(so["H0"], sn["H0"], sx["H0"])
        if w: rows.append((sc, f"{sn['id']} H0", so["H0"], sn["H0"], w))
        for j, b in enumerate(["most protective", "central", "least protective"]):
            w = why(so["H"][j], sn["H"][j], sx["H"][j])
            if w: rows.append((sc, f"{sn['id']} H [{b}]", so["H"][j], sn["H"][j], w))
        if so["flags"] != sn["flags"]:
            rows.append((sc, f"{sn['id']} flags", ", ".join(map(str, so["flags"])) or "none", ", ".join(map(str, sn["flags"])) or "none", why(1, 2, 2 if sx["flags"] == sn["flags"] else 1) or other))

def f(v):
    return f"{v:.6g}" if isinstance(v, (int, float)) else str(v)

print("| Scenario | Value | Old | New | Change | Finding |")
print("|---|---|---|---|---|---|")
for sc, name, o, n, w in rows:
    ch = ""
    if isinstance(o, (int, float)) and isinstance(n, (int, float)):
        ch = f"{(n - o) / o * 100:+.1f}%" if o else ("new" if n else "")
    print(f"| {sc} | {name} | {f(o)} | {f(n)} | {ch} | {w} |")
print(f"\n{len(rows)} changed values.")
