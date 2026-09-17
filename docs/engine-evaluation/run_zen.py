"""Runs the same zen-policy.json through the Python binding (what a Python 3.12 Lambda would use)."""
import json
import sys
import time

sys.path.insert(0, "pylib")
import zen  # noqa: E402

with open("zen-policy.json", "rb") as fh:
    content = fh.read()

engine = zen.ZenEngine()
decision = engine.create_decision(content.decode("utf-8"))

for label, path in (("scenarios", "cases.json"), ("generated", "fuzz.json")):
    with open(path, encoding="utf-8") as fh:
        cases = json.load(fh)
    match = 0
    diffs = []
    t0 = time.perf_counter()
    for c in cases:
        r = decision.evaluate(c["input"])["result"]
        got = {
            "decision": r["decision"],
            "hard": sorted(set(r["hard"])),
            "soft": sorted(set(r["soft"])),
            "score": r["score"],
        }
        e = c["expected"]
        if got["decision"] == e["decision"] and got["hard"] == e["hard"] and got["soft"] == e["soft"] and got["score"] == e["score"]:
            match += 1
        elif len(diffs) < 3:
            diffs.append({"id": c["id"], "exp": e, "got": got})
    ms = (time.perf_counter() - t0) * 1000 / len(cases)
    print(f"zen-python/{label}: {match}/{len(cases)} match, {ms:.3f} ms per evaluation")
    for d in diffs:
        print("  DIFF", d)
