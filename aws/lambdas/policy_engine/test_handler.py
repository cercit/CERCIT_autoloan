"""
Tests for the policy engine Lambda, with Supabase replaced by a stub.
Needs zen-engine: pip install -r aws/lambdas/policy_engine/requirements.txt
Run: npm run test:lambda   (or python aws/lambdas/policy_engine/test_handler.py)
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))

import handler  # noqa: E402

POLICIES = {
    "2026.08": json.loads((ROOT / "docs/engine-evaluation/zen-policy.json").read_text(encoding="utf-8")),
    "2026.09": json.loads((ROOT / "policy/credit-rules-2026.09.json").read_text(encoding="utf-8")),
}
CASES = {
    "2026.08": json.loads((ROOT / "docs/engine-evaluation/cases.json").read_text(encoding="utf-8"))
    + json.loads((ROOT / "docs/engine-evaluation/fuzz.json").read_text(encoding="utf-8")),
    "2026.09": json.loads((ROOT / "tests/policy/fixtures-2026.09.json").read_text(encoding="utf-8")),
}


class FakeSupabase:
    def __init__(self):
        self.in_force = "2026.08"
        self.valid_tokens = {"Bearer good-token"}
        self.calls = []

    def request(self, method, path, payload=None, auth_header=None):
        self.calls.append((method, path, payload))
        if path == "/auth/v1/user":
            if auth_header not in self.valid_tokens:
                raise handler.PolicyError(502, "Supabase /auth/v1/user returned 401")
            return {"id": "user-1"}
        if path == "/rest/v1/rpc/fn_policy_document_at":
            code = payload.get("p_at", "")[:7].replace("-", ".") or self.in_force
            if code not in POLICIES:
                return []
            return [{
                "policy_version_id": f"id-{code}",
                "version_code": code,
                "engine": "zen",
                "document": POLICIES[code],
                "document_sha256": f"sha-{code}",
            }]
        raise AssertionError(f"unexpected call {path}")


failures = 0


def check(name, condition, detail=""):
    global failures
    if not condition:
        failures += 1
        print(f"  FAIL {name} {detail}")


def api_event(body, token="Bearer good-token"):
    headers = {"Authorization": token} if token else {}
    return {"requestContext": {}, "headers": headers, "body": json.dumps(body)}


def reset(fake):
    handler._request = fake.request
    handler._policies.clear()
    handler._decisions.clear()


fake = FakeSupabase()
reset(fake)

# 1. Every version gives the expected result for every stored case
for code, cases in CASES.items():
    matched = 0
    for c in cases:
        got = handler.evaluate(c["input"], at=f"{code.replace('.', '-')}-15T00:00:00+05:30")
        e = c["expected"]
        if (got["decision"], got["hard"], got["soft"], got["score"]) == (e["decision"], e["hard"], e["soft"], e["score"]):
            matched += 1
        elif failures < 3:
            check(f"{code} {c['id']}", False, json.dumps({"expected": e, "got": got}))
    print(f"{code}: {matched}/{len(cases)} cases match")
    check(f"{code} all cases", matched == len(cases))

    # The facts the Lambda asks for are exactly the facts the cases carry
    wanted = handler.required_facts(POLICIES[code])
    check(f"{code} required facts", set(wanted) == set(cases[0]["input"]),
          f"extra={set(wanted) - set(cases[0]['input'])} unused={set(cases[0]['input']) - set(wanted)}")

# 2. The response names the version used
reset(fake)
facts_08 = CASES["2026.08"][0]["input"]
r = handler.handler(api_event({"facts": facts_08}), None)
body = json.loads(r["body"])
check("api 200", r["statusCode"] == 200, r)
check("version named", body.get("policyVersion") == "2026.08" and body.get("policyVersionId") == "id-2026.08", body)
check("sha named", body.get("documentSha256") == "sha-2026.08", body)

# 3. Sign-in is required through the API, not for direct invoke
r = handler.handler(api_event({"facts": facts_08}, token=None), None)
check("no token 401", r["statusCode"] == 401, r)
r = handler.handler(api_event({"facts": facts_08}, token="Bearer stolen"), None)
check("bad token 401", r["statusCode"] == 401, r)
before = len(fake.calls)
direct = handler.handler({"facts": facts_08}, None)
check("direct invoke", direct["decision"] == CASES["2026.08"][0]["expected"]["decision"], direct)
check("direct invoke skips sign-in", not any(p == "/auth/v1/user" for _, p, _ in fake.calls[before:]))

# 4. Missing and malformed facts are refused with a clear message
partial = {k: v for k, v in facts_08.items() if k not in ("bureauScore", "incomeVerified")}
r = handler.handler(api_event({"facts": partial}), None)
body = json.loads(r["body"])
check("missing 400", r["statusCode"] == 400 and body.get("missing") == ["bureauScore", "incomeVerified"], body)
r = handler.handler(api_event({"nofacts": 1}), None)
check("no facts 400", r["statusCode"] == 400, r)
r = handler.handler({"requestContext": {}, "headers": {"authorization": "Bearer good-token"}, "body": "{oops"}, None)
check("bad json 400 (lowercase header accepted)", r["statusCode"] == 400 and "JSON" in r["body"], r)
try:
    handler.handler({"facts": partial}, None)
    check("direct invoke raises on missing facts", False)
except handler.PolicyError as e:
    check("direct invoke raises on missing facts", e.status == 400)

# 5. 2026.09 facts may be null when the report is missing
facts_09 = dict(CASES["2026.09"][0]["input"])
facts_09.update(hasBureau=False, bureauScore=None, dpd60Ever=None, dpd90OrWriteoff12m=None, anyDpd6m=None,
                minorDpdMonths7to12=None, writeoffCount5y=None, settledCount5y=None, enquiries90d=None,
                activeAccounts=None, ccServicingPattern=None)
got = handler.evaluate(facts_09, at="2026-09-15T00:00:00+05:30")
check("null bureau refers", got["decision"] == "review" and "MISSING_DATA" in got["soft"], got)

# 6. Policy in force is cached for a minute; a dated request always asks the database
reset(fake)
handler.evaluate(facts_08)
fake.in_force = "2026.09"
cached = handler.evaluate(facts_08)
check("cache used", cached["policyVersion"] == "2026.08", cached)
handler._policies["CAR_NEW"] = (handler._policies["CAR_NEW"][0] - handler.POLICY_CACHE_SECONDS - 1,
                                handler._policies["CAR_NEW"][1])
try:
    handler.evaluate(facts_08)
    check("new version after cache expiry asks for its own facts", False)
except handler.PolicyError as e:
    check("new version after cache expiry asks for its own facts",
          e.status == 400 and e.body["policyVersion"] == "2026.09", e.body)
before = len(fake.calls)
handler.evaluate(facts_08, at="2026-08-20T00:00:00+05:30")
handler.evaluate(facts_08, at="2026-08-20T00:00:00+05:30")
check("dated requests not cached", len(fake.calls) - before == 2)

# 7. Nothing in force
r = handler.handler(api_event({"facts": facts_08, "at": "2020-01-01T00:00:00Z"}), None)
check("no policy 404", r["statusCode"] == 404, r)

if failures:
    print(f"\n{failures} Lambda check(s) failed")
    sys.exit(1)
print("\nPolicy engine Lambda: all checks pass")
