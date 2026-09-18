"""
Lambda: policy engine (backlog FD4.3)

Evaluates application facts against the credit policy version in force, using
the GoRules Zen decision model stored in Supabase (policy_documents). The rules
live in the database, versioned and approved; this function only runs them.

POST /evaluate
  body: {"facts": {...}, "product": "CAR_NEW", "at": "2026-09-17T10:00:00+05:30"}
  "product" and "at" are optional (defaults: CAR_NEW, now).

POST /simulate  (backlog CC3.1)
  body: {"versionId": "...", "limit": 200, "record": true}
  Runs recent real applications through the proposed version and the version in
  force, and reports what would change. Nothing about an applicant is returned
  beyond the application reference an officer can already look up.

Every fact the policy version reads must be present (null is allowed, e.g. a
bureau score when there is no bureau report). The response names the version
used, so each decision can be traced to the exact rules that produced it.

Called through API Gateway, the request must carry a signed-in user's Supabase
token. Called directly (Lambda invoke), IAM already controls access.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import zen

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
POLICY_CACHE_SECONDS = int(os.environ.get("POLICY_CACHE_SECONDS", "60"))

_engine = zen.ZenEngine()
_policies: dict[str, tuple[float, dict]] = {}  # product -> (loaded, policy in force now)
_decisions: dict[str, tuple[object, list[str]]] = {}  # sha256 -> (decision, required facts)

_EXPRESSION_WORDS = {"and", "or", "not", "true", "false", "null", "in"}


class PolicyError(Exception):
    def __init__(self, status: int, message: str, **extra):
        super().__init__(message)
        self.status = status
        self.body = {"error": message, **extra}


def handler(event, context):
    via_api = isinstance(event, dict) and "requestContext" in event
    try:
        if via_api:
            _require_user(event.get("headers") or {})
        body = _parse_body(event, via_api)
        path = (event.get("path") or "") if via_api else ""
        if path.endswith("/simulate") or ("versionId" in body and "facts" not in body):
            if not body.get("versionId"):
                raise PolicyError(400, "versionId is required")
            result = simulate(body["versionId"], body.get("limit", 200), body.get("record", True),
                              body.get("product", "CAR_NEW"))
        else:
            result = evaluate(body["facts"], body.get("product", "CAR_NEW"), body.get("at"))
        return _response(200, result) if via_api else result
    except PolicyError as e:
        if not via_api:
            raise
        return _response(e.status, e.body)


def simulate(version_id: str, limit: int = 200, record: bool = True, product: str = "CAR_NEW") -> dict:
    """Run recent applications through a proposed version and the one in force."""
    proposed = _policy_by_id(version_id)
    live = _policy_in_force(product, None)

    rows = _rpc("fn_policy_facts", {"p_limit": max(1, min(int(limit), 2000))}) or []
    counts = {"approve": 0, "review": 0, "decline": 0}
    was = {"approve": 0, "review": 0, "decline": 0}
    flips: dict[str, int] = {}
    changed: list[dict] = []
    skipped: list[str] = []

    for row in rows:
        facts = row["facts"]
        try:
            before = _run(live, facts)
            after = _run(proposed, facts)
        except PolicyError:
            skipped.append(row["application_id"])
            continue
        was[before["decision"]] += 1
        counts[after["decision"]] += 1
        if before["decision"] != after["decision"]:
            key = f"{before['decision']}->{after['decision']}"
            flips[key] = flips.get(key, 0) + 1
            if len(changed) < 50:
                changed.append({
                    "applicationId": row["application_id"],
                    "was": before["decision"],
                    "now": after["decision"],
                    "because": sorted(set(after["hard"] + after["soft"]) - set(before["hard"] + before["soft"])),
                })

    summary = {
        "proposed": proposed["version_code"],
        "inForce": live["version_code"],
        "evaluated": len(rows) - len(skipped),
        "skipped": len(skipped),
        "before": was,
        "after": counts,
        "changed": sum(flips.values()),
        "examples": changed,
    }

    if record and rows:
        summary["simulationId"] = _rpc("fn_policy_simulation_record", {
            "p_version_id": version_id,
            "p_compared_to": live["policy_version_id"],
            "p_sample_size": len(rows) - len(skipped),
            "p_flips": flips,
            "p_summary": {k: v for k, v in summary.items() if k != "examples"},
        })

    return {"flips": flips, **summary}


def _run(policy: dict, facts: dict) -> dict:
    decision, required = _decision_for(policy)
    missing = [f for f in required if f not in facts]
    if missing:
        raise PolicyError(400, "facts missing", missing=missing, policyVersion=policy["version_code"])
    result = decision.evaluate(facts)["result"]
    return {
        "decision": result["decision"],
        "hard": sorted(set(result.get("hard") or [])),
        "soft": sorted(set(result.get("soft") or [])),
        "score": result["score"],
    }


def _policy_by_id(version_id: str) -> dict:
    rows = _rpc("fn_policy_document_by_id", {"p_version_id": version_id})
    if not rows:
        raise PolicyError(404, "policy version not found")
    policy = rows[0]
    if policy["engine"] != "zen":
        raise PolicyError(500, f"policy {policy['version_code']} uses engine {policy['engine']}, expected zen")
    return policy


def evaluate(facts: dict, product: str = "CAR_NEW", at: str | None = None) -> dict:
    policy = _policy_in_force(product, at)
    try:
        result = _run(policy, facts)
    except PolicyError:
        raise
    except Exception as e:  # Zen reports bad fact types here
        raise PolicyError(400, f"facts could not be evaluated: {e}", policyVersion=policy["version_code"])

    return {
        **result,
        "policyVersion": policy["version_code"],
        "policyVersionId": policy["policy_version_id"],
        "documentSha256": policy["document_sha256"],
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


def required_facts(document: dict) -> list[str]:
    """Every fact the decision tables read: column fields plus names used in free-form conditions."""
    fields: set[str] = set()
    for node in document.get("nodes", []):
        if node.get("type") != "decisionTableNode":
            continue
        content = node["content"]
        free_columns = []
        for column in content.get("inputs", []):
            if column.get("field"):
                fields.add(column["field"])
            else:
                free_columns.append(column["id"])
        for rule in content.get("rules", []):
            for column_id in free_columns:
                cell = re.sub(r"'[^']*'", "", rule.get(column_id) or "")
                for name in re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", cell):
                    if name not in _EXPRESSION_WORDS:
                        fields.add(name)
    return sorted(fields)


def _policy_in_force(product: str, at: str | None) -> dict:
    # Only "now" is cached, briefly, so an approved change takes effect within a minute
    cached = None if at else _policies.get(product)
    if cached and time.monotonic() - cached[0] < POLICY_CACHE_SECONDS:
        return cached[1]

    args = {"p_product": product}
    if at:
        args["p_at"] = at
    rows = _rpc("fn_policy_document_at", args)
    if not rows:
        raise PolicyError(404, f"no policy version in force for {product}" + (f" at {at}" if at else ""))
    policy = rows[0]
    if policy["engine"] != "zen":
        raise PolicyError(500, f"policy {policy['version_code']} uses engine {policy['engine']}, expected zen")

    if not at:
        _policies[product] = (time.monotonic(), policy)
    return policy


def _decision_for(policy: dict):
    sha = policy["document_sha256"]
    if sha not in _decisions:
        document = policy["document"]
        _decisions[sha] = (_engine.create_decision(json.dumps(document)), required_facts(document))
    return _decisions[sha]


def _require_user(headers: dict) -> None:
    auth = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
    if not auth.lower().startswith("bearer "):
        raise PolicyError(401, "sign-in required")
    try:
        _request("GET", "/auth/v1/user", auth_header=auth)
    except PolicyError:
        raise PolicyError(401, "sign-in required")


def _parse_body(event: dict, via_api: bool) -> dict:
    body = event.get("body") if via_api else event
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            raise PolicyError(400, "body must be JSON")
    if not isinstance(body, dict) or not (isinstance(body.get("facts"), dict) or body.get("versionId")):
        raise PolicyError(400, "body must contain a facts object")
    return body


def _rpc(name: str, args: dict):
    return _request("POST", f"/rest/v1/rpc/{name}", payload=args)


def _request(method: str, path: str, payload: dict | None = None, auth_header: str | None = None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": auth_header or f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        raise PolicyError(502, f"Supabase {path} returned {e.code}")
    except urllib.error.URLError as e:
        raise PolicyError(502, f"Supabase unreachable: {e.reason}")


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }
