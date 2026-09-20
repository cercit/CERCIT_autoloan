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
        self.recorded = []
        self.engine_recorded = []
        # Which application fn_policy_facts_for answers for, and whether the
        # server_engine switch is on in the database
        self.app_ref = None
        self.switch_on = False
        # Who the database says may ask for an impact check, in their own name
        self.may_simulate_tokens = {"Bearer good-token"}
        # Facts carrying both naming schemes, as fn_policy_facts returns them
        self.facts = []

    def request(self, method, path, payload=None, auth_header=None):
        self.calls.append((method, path, payload))
        if path == "/auth/v1/user":
            if auth_header not in self.valid_tokens:
                raise handler.PolicyError(502, "Supabase /auth/v1/user returned 401")
            return {"id": "user-1"}
        if path == "/rest/v1/rpc/fn_policy_may_simulate":
            return auth_header in self.may_simulate_tokens
        if path == "/rest/v1/rpc/fn_policy_document_by_id":
            code = payload["p_version_id"].replace("id-", "")
            if code not in POLICIES:
                return []
            return [{
                "policy_version_id": f"id-{code}",
                "version_code": code,
                "engine": "zen",
                "document": POLICIES[code],
                "document_sha256": f"sha-{code}",
            }]
        if path == "/rest/v1/rpc/fn_policy_facts":
            return self.facts[: payload["p_limit"]]
        if path == "/rest/v1/rpc/fn_policy_facts_for":
            return [r for r in self.facts if r["application_id"] == self.app_ref]
        if path == "/rest/v1/rpc/fn_engine_decision_record":
            self.engine_recorded.append(payload)
            return {"engineDecisionId": "eng-1", "applied": self.switch_on, "decision": payload["p_decision"]}
        if path == "/rest/v1/rpc/fn_policy_simulation_record":
            self.recorded.append(payload)
            return "sim-1"
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

# 8. The impact check (CC3.1): the same applications through both versions
fake = FakeSupabase()
reset(fake)
both = []
for c in CASES["2026.09"][:60]:
    facts = dict(c["input"])
    facts.update(
        hasSevereDPD=bool(facts.get("dpd60Ever") or facts.get("dpd90OrWriteoff12m")),
        hasRecentDPD=bool(facts.get("anyDpd6m")),
        bounces=facts.get("bounces6m") or 0,
    )
    for key in ("bureauScore", "salaryMonthsRegular", "ccServicingPattern", "foir", "freeIncomeRatio",
                "ltvOnExShowroom", "ltvOnRoad", "age", "ageAtMaturity", "tenureMonths", "onRoadPrice",
                "employmentYears"):
        if facts.get(key) is None:
            facts[key] = 0
    both.append(facts)
fake.facts = [{"application_id": f"CER-{i:04d}", "decided_at": "2026-09-01T00:00:00+05:30", "facts": f}
              for i, f in enumerate(both, 1)]

sim = handler.simulate("id-2026.09", limit=60)
print(f"impact check: {sim['evaluated']} applications, {sim['changed']} would change {sim['flips']}")
check("simulation names both versions", (sim["proposed"], sim["inForce"]) == ("2026.09", "2026.08"), sim.get("proposed"))
check("every application evaluated", sim["evaluated"] == len(both) and sim["skipped"] == 0,
      {"evaluated": sim["evaluated"], "skipped": sim["skipped"]})
check("before and after counts add up",
      sum(sim["before"].values()) == sim["evaluated"] and sum(sim["after"].values()) == sim["evaluated"], sim)
check("changes counted match the flips listed", sim["changed"] == sum(sim["flips"].values()), sim["flips"])
check("changes are explained", all(e["was"] != e["now"] for e in sim["examples"]), sim["examples"][:2])
check("result stored once", len(fake.recorded) == 1 and fake.recorded[0]["p_version_id"] == "id-2026.09", fake.recorded)
check("stored result carries no applicant detail", "examples" not in (fake.recorded[0]["p_summary"] if fake.recorded else {}), fake.recorded[:1])

# A run that could evaluate nothing is an error, not "no impact"
saved_facts = fake.facts
fake.facts = [{"application_id": "CER-9001", "decided_at": "2026-09-01T00:00:00+05:30",
               "facts": {k: v for k, v in both[0].items() if k != "ambVsEmiPct"}}]
try:
    handler.simulate("id-2026.09", limit=5, record=False)
    check("all-skipped run refuses to report no impact", False)
except handler.PolicyError as e:
    check("all-skipped run refuses to report no impact",
          e.status == 422 and "ambVsEmiPct" in e.body.get("missing", {}), e.body)
fake.facts = []
try:
    handler.simulate("id-2026.09", limit=5, record=False)
    check("empty sample refuses to report no impact", False)
except handler.PolicyError as e:
    check("empty sample refuses to report no impact", e.status == 422, e.body)
fake.facts = saved_facts

# A fact that is present but unknown (null) still evaluates
nulled = dict(both[0])
nulled["ambVsEmiPct"] = None
fake.facts = [{"application_id": "CER-9002", "decided_at": "2026-09-01T00:00:00+05:30", "facts": nulled}]
partial = handler.simulate("id-2026.09", limit=5, record=False)
check("null fact is evaluated, not skipped", partial["evaluated"] == 1 and partial["skipped"] == 0, partial)
fake.facts = saved_facts

# Nothing is stored when the caller only wants to look
before_records = len(fake.recorded)
handler.simulate("id-2026.09", limit=10, record=False)
check("dry run stores nothing", len(fake.recorded) == before_records)

# Through the API, with the path
r = handler.handler({"requestContext": {}, "path": "/prod/simulate", "headers": {"Authorization": "Bearer good-token"},
                     "body": json.dumps({"versionId": "id-2026.09", "limit": 5, "record": False})}, None)
check("simulate through the API", r["statusCode"] == 200 and json.loads(r["body"])["proposed"] == "2026.09", r)
r = handler.handler({"requestContext": {}, "path": "/prod/simulate", "headers": {"Authorization": "Bearer good-token"},
                     "body": json.dumps({"limit": 5})}, None)
check("simulate without a version", r["statusCode"] == 400, r)
r = handler.handler({"requestContext": {}, "path": "/prod/simulate", "headers": {},
                     "body": json.dumps({"versionId": "id-2026.09"})}, None)
check("simulate needs a sign-in", r["statusCode"] == 401, r)

# Signed in is not enough: the caller's own rights are checked, not the engine's key
fake.valid_tokens.add("Bearer officer-token")
r = handler.handler({"requestContext": {}, "path": "/prod/simulate", "headers": {"Authorization": "Bearer officer-token"},
                     "body": json.dumps({"versionId": "id-2026.09", "limit": 5, "record": False})}, None)
check("a signed-in user without policy rights is refused", r["statusCode"] == 403, r)
fake.may_simulate_tokens.add("Bearer officer-token")
r = handler.handler({"requestContext": {}, "path": "/prod/simulate", "headers": {"Authorization": "Bearer officer-token"},
                     "body": json.dumps({"versionId": "id-2026.09", "limit": 5, "record": False})}, None)
check("once allowed, the same caller gets through", r["statusCode"] == 200, r)

# An unknown version is reported rather than guessed at
try:
    handler.simulate("id-9999.99", limit=5)
    check("unknown version refused", False)
except handler.PolicyError as e:
    check("unknown version refused", e.status == 404, e.body)


# 6. Deciding one application (FD4.5)
reset(fake)
fake.engine_recorded = []
one = dict(both[0])
one["foir"] = 70  # over the limit, so the answer is not "approve" by default
fake.facts = [{"application_id": "CER-7001", "decided_at": "2026-09-01T00:00:00+05:30", "facts": one}]
fake.app_ref = "CER-7001"

got = handler.assess("app-uuid-1")
check("assess answers on the version in force", got["policyVersion"] == "2026.08", got.get("policyVersion"))
check("assess names the application", got["applicationId"] == "CER-7001", got.get("applicationId"))
check("assess returns a decision and its reasons",
      got["decision"] in ("approve", "review", "decline") and isinstance(got["hard"], list), got)
check("the answer is recorded once", len(fake.engine_recorded) == 1, fake.engine_recorded)
rec = fake.engine_recorded[0] if fake.engine_recorded else {}
check("the record carries the policy version and the failed rules",
      rec.get("p_version_code") == "2026.08" and rec.get("p_decision") == got["decision"]
      and rec.get("p_hard") == got["hard"], rec)
check("with the switch off, nothing is applied", got["applied"] is False, got)

# With the switch on, the database says it applied the decision
fake.switch_on = True
fake.engine_recorded = []
applied = handler.assess("app-uuid-1")
check("with the switch on, the decision is applied", applied["applied"] is True, applied)

# A fact nobody recorded is reported, not quietly treated as a pass
fake.switch_on = False
unknown = dict(one)
unknown["ambVsEmiPct"] = None
fake.facts = [{"application_id": "CER-7002", "decided_at": "2026-09-01T00:00:00+05:30", "facts": unknown}]
fake.app_ref = "CER-7002"
with_unknown = handler.assess("app-uuid-2")
check("unknown facts are named in the answer",
      with_unknown["factsNotKnown"] == ["ambVsEmiPct"], with_unknown.get("factsNotKnown"))

# An application the database does not return is an error, not an approval
fake.app_ref = "CER-NONE"
try:
    handler.assess("app-uuid-3")
    check("missing application refused", False)
except handler.PolicyError as e:
    check("missing application refused", e.status == 404, e.body)

# Through the API: the route is chosen by path, and sign-in is still required
fake.app_ref = "CER-7001"
fake.facts = [{"application_id": "CER-7001", "decided_at": "2026-09-01T00:00:00+05:30", "facts": one}]
res = handler.handler({**api_event({"applicationId": "app-uuid-1"}), "path": "/prod/assess"}, None)
check("assess route answers over the API", res["statusCode"] == 200, res)
res = handler.handler({**api_event({"applicationId": "app-uuid-1"}, token=None), "path": "/prod/assess"}, None)
check("assess needs a signed-in caller", res["statusCode"] == 401, res)
res = handler.handler({**api_event({}), "path": "/prod/assess"}, None)
check("assess without an application is refused", res["statusCode"] == 400, res)

if failures:
    print(f"\n{failures} Lambda check(s) failed")
    sys.exit(1)
print("\nPolicy engine Lambda: all checks pass")
