"""判定フロー実行 — ひな形の bindings を顧問先マスタ／指標から解決してノードを評価する。"""

from __future__ import annotations

from typing import Any, Mapping

from services.consumption_taxable_client import infer_entity_type, parse_yen, profile_truthy

ResultOverride = str  # auto | yes | no | outcome_id


def _display(value: Any, kind: str) -> str:
    if kind == "yen":
        try:
            return f"{int(value):,}円"
        except (TypeError, ValueError):
            return "0円"
    if kind == "flag":
        if value is None:
            return "未回答"
        return "該当" if bool(value) else "非該当"
    if kind == "entity":
        if value == "corporate":
            return "法人"
        if value == "individual":
            return "個人"
        return "未指定"
    if value is None or value == "":
        return "—"
    return str(value)


def _transform(raw: Any, transform: str) -> Any:
    if transform == "yen":
        return parse_yen(raw)
    if transform == "truthy":
        return profile_truthy(raw)
    if transform == "bool":
        if raw is None:
            return None
        if isinstance(raw, bool):
            return raw
        return profile_truthy(raw)
    if transform == "entity_type":
        if raw in ("individual", "corporate"):
            return raw
        inferred = infer_entity_type({"entity_major": raw} if raw is not None else {})
        return inferred
    if transform == "text":
        return "" if raw is None else str(raw).strip()
    return raw


def _pick_metric(facts: list[dict], binding: Mapping[str, Any]) -> Any:
    metric_key = str(binding.get("metric_key") or "")
    pick = str(binding.get("pick") or "latest")
    rows = [f for f in facts if f.get("metric_key") == metric_key]
    if pick == "sum_m01_m06":
        total = 0
        for row in rows:
            key = str(row.get("period_key") or "")
            try:
                month = int(key.lstrip("M"))
            except ValueError:
                continue
            if 1 <= month <= 6:
                total += int(row.get("value_yen") or 0)
        return total
    yen_rows = [f for f in rows if isinstance(f.get("value_yen"), int)]
    if not yen_rows:
        return 0
    ordered = sorted(yen_rows, key=lambda r: str(r.get("period_key") or ""))
    chosen = ordered[0] if pick == "oldest" else ordered[-1]
    return chosen.get("value_yen") or 0


def resolve_bindings(
    definition: Mapping[str, Any],
    *,
    client: Mapping[str, Any],
    facts: list[dict],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    profile = client.get("profile") if isinstance(client.get("profile"), dict) else {}
    inputs: dict[str, Any] = {}
    resolved: list[dict[str, Any]] = []
    for binding in definition.get("bindings") or []:
        if not isinstance(binding, dict):
            continue
        input_id = str(binding.get("input_id") or "").strip()
        if not input_id:
            continue
        source = str(binding.get("source") or "const")
        transform = str(binding.get("transform") or "text")
        origin = {"origin": source}
        raw: Any = None
        if source == "const":
            raw = binding.get("value")
        elif source == "master":
            field = str(binding.get("field") or "name")
            raw = client.get(field)
            origin["field"] = field
        elif source == "profile":
            field = str(binding.get("field") or "")
            raw = profile.get(field)
            origin["field"] = field
            if input_id == "is_invoice_registered" and not profile_truthy(raw):
                blob = str(profile.get("consumption_tax") or "")
                if "インボイス" in blob or "適格請求書" in blob:
                    raw = True
                    origin["field"] = "consumption_tax"
        elif source == "metric":
            raw = _pick_metric(facts, binding)
            origin["metric_key"] = binding.get("metric_key")
            origin["pick"] = binding.get("pick")
        value = _transform(raw, transform)
        inputs[input_id] = value
        kind = "yen" if transform == "yen" else "flag" if transform in ("truthy", "bool") else "text"
        if transform == "entity_type":
            kind = "entity"
        resolved.append(
            {
                "input_id": input_id,
                "value": value,
                "display": _display(value, kind),
                "kind": kind,
                **origin,
            }
        )
    return inputs, resolved


def _cmp(left: Any, op: str, right: Any) -> bool:
    try:
        lv = float(left)
        rv = float(right)
    except (TypeError, ValueError):
        return False
    if op == ">":
        return lv > rv
    if op == ">=":
        return lv >= rv
    if op == "<":
        return lv < rv
    if op == "<=":
        return lv <= rv
    if op == "==":
        return lv == rv
    return False


def eval_when(when: Any, inputs: Mapping[str, Any]) -> bool:
    if not isinstance(when, dict):
        return False
    if "all" in when:
        parts = when.get("all") or []
        return bool(parts) and all(eval_when(p, inputs) for p in parts)
    if "any" in when:
        parts = when.get("any") or []
        return any(eval_when(p, inputs) for p in parts)
    input_id = str(when.get("input") or "")
    actual = inputs.get(input_id)
    if "eq" in when:
        return actual == when.get("eq")
    op = str(when.get("op") or "")
    if op:
        return _cmp(actual, op, when.get("value"))
    return bool(actual)


def _node_answer(node: Mapping[str, Any], inputs: Mapping[str, Any]) -> bool | None:
    when = node.get("when")
    if not isinstance(when, dict):
        return None
    input_id = str(when.get("input") or "")
    if input_id and inputs.get(input_id) is None:
        return None
    return bool(eval_when(when, inputs))


def _facts_for_node(node: Mapping[str, Any], effective: Mapping[str, Any]) -> list[dict[str, Any]]:
    facts = []
    for fact in node.get("facts") or []:
        if not isinstance(fact, dict):
            continue
        fid = str(fact.get("input_id") or "")
        kind = str(fact.get("kind") or "text")
        val = effective.get(fid)
        facts.append(
            {
                "id": fid,
                "label": fact.get("label") or fid,
                "value": "" if val is None else val,
                "display": _display(val, "entity" if fid == "entity_type" else kind),
                "kind": kind,
                "threshold": fact.get("threshold"),
                "comparison": fact.get("comparison"),
            }
        )
    return facts


def _merge_overrides(auto_inputs: dict[str, Any], overrides: Mapping[str, Any] | None) -> dict[str, Any]:
    if not overrides:
        return dict(auto_inputs)
    out = dict(auto_inputs)
    for key, raw in overrides.items():
        out[str(key)] = raw
    return out


def _run_tree_definition(
    template: Mapping[str, Any],
    definition: Mapping[str, Any],
    *,
    auto_inputs: Mapping[str, Any],
    resolved_bindings: list[dict[str, Any]],
    effective: dict[str, Any],
    override_keys: list[str],
    result_override: str,
    as_of: str,
) -> dict[str, Any]:
    nodes_by_id = {
        str(n.get("id")): n
        for n in (definition.get("nodes") or [])
        if isinstance(n, dict) and n.get("id")
    }
    outcomes_raw = definition.get("outcomes") if isinstance(definition.get("outcomes"), dict) else {}
    outcome_catalog = {
        key: {
            "id": key,
            "label": str(val.get("label") or key) if isinstance(val, dict) else str(key),
            "message": str(val.get("message") or "") if isinstance(val, dict) else "",
            "order": int(val.get("order") or 99) if isinstance(val, dict) else 99,
        }
        for key, val in outcomes_raw.items()
        if key not in ("true", "false")
    }
    start = str(definition.get("start") or next(iter(nodes_by_id), ""))
    path: list[str] = []
    edges: list[dict[str, str]] = []
    current = start
    auto_outcome: str | None = None
    pending_node: str | None = None
    guard = 0
    while current and guard < 40:
        guard += 1
        if current.startswith("outcome:"):
            auto_outcome = current.split(":", 1)[1]
            break
        node = nodes_by_id.get(current)
        if not node:
            break
        path.append(current)
        answer = _node_answer(node, effective)
        if answer is None:
            pending_node = current
            break
        branch = "yes" if answer else "no"
        nxt = str(node.get(branch) or "")
        edges.append({"from": current, "to": nxt, "branch": branch})
        current = nxt

    nodes_out = []
    for nid, node in nodes_by_id.items():
        answer = _node_answer(node, effective) if nid in path or nid == pending_node else None
        nodes_out.append(
            {
                "id": nid,
                "label": node.get("label") or nid,
                "rule": node.get("rule") or "",
                "kind": "decision",
                "matched": answer is True,
                "answer": answer,
                "yes": node.get("yes"),
                "no": node.get("no"),
                "match_yes": dict(node.get("match_yes") or node.get("match_inputs") or {}),
                "match_no": dict(node.get("match_no") or {}),
                "facts": _facts_for_node(node, effective),
                "documents": list(node.get("documents") or []),
                "match_inputs": dict(node.get("match_yes") or node.get("match_inputs") or {}),
                "layout": dict(node.get("layout") or {}),
                "on_path": nid in path,
                "is_current": nid == pending_node,
            }
        )

    override = (result_override or "auto").strip() or "auto"
    if override != "auto" and override in outcome_catalog:
        outcome_id = override
        source = "manual"
        message = f"手動設定により{outcome_catalog[outcome_id]['label']}として扱います。"
    elif auto_outcome and auto_outcome in outcome_catalog:
        outcome_id = auto_outcome
        source = "auto"
        message = outcome_catalog[outcome_id]["message"] or f"{outcome_catalog[outcome_id]['label']}に該当します。"
    else:
        outcome_id = None
        source = "auto"
        incomplete = outcomes_raw.get("false") if isinstance(outcomes_raw.get("false"), dict) else {}
        message = str(incomplete.get("message") or "フローに沿って YES / NO を選んでください。")

    outcome_label = (
        outcome_catalog[outcome_id]["label"]
        if outcome_id
        else str((outcomes_raw.get("false") or {}).get("label") or "未確定")
    )
    passed = outcome_id is not None
    ordered_outcomes = sorted(outcome_catalog.values(), key=lambda o: (o["order"], o["id"]))

    return {
        "template_id": template.get("id"),
        "template_title": template.get("title"),
        "template_version": template.get("version"),
        "family_id": template.get("family_id") or template.get("id"),
        "as_of": as_of,
        "law_valid_from": template.get("valid_from"),
        "law_valid_to": template.get("valid_to"),
        "law_label": template.get("law_label") or "",
        "law_range": template.get("law_range")
        or f"{template.get('valid_from') or '開始未設定'} 〜 {template.get('valid_to') or '終期なし'}",
        "frozen": False,
        "mode": "tree",
        "start": start,
        "path": path,
        "edges": edges,
        "pending_node": pending_node,
        "outcome_id": outcome_id,
        "outcome_options": ordered_outcomes,
        "passed": passed,
        "is_taxable": passed,
        "outcome_label": outcome_label,
        "outcomes": {
            "true": {
                "label": str((outcomes_raw.get("true") or {}).get("label") or "区分確定"),
                "message": str((outcomes_raw.get("true") or {}).get("message") or ""),
            },
            "false": {
                "label": str((outcomes_raw.get("false") or {}).get("label") or "未確定"),
                "message": str((outcomes_raw.get("false") or {}).get("message") or ""),
            },
            **{
                key: {"label": meta["label"], "message": meta["message"]}
                for key, meta in outcome_catalog.items()
            },
        },
        "message": message,
        "matched_conditions": path,
        "auto_is_taxable": auto_outcome is not None,
        "auto_passed": auto_outcome is not None,
        "auto_matched_conditions": list(path),
        "auto_outcome_id": auto_outcome,
        "result_override": override,
        "result_source": source,
        "conditions": nodes_out,
        "inputs": effective,
        "auto_inputs": dict(auto_inputs),
        "input_override_keys": override_keys,
        "bindings": resolved_bindings,
        "client_name": effective.get("client_name") or "",
    }


def run_definition(
    template: Mapping[str, Any],
    *,
    auto_inputs: Mapping[str, Any],
    resolved_bindings: list[dict[str, Any]],
    input_overrides: Mapping[str, Any] | None = None,
    result_override: str = "auto",
    as_of: str | None = None,
) -> dict[str, Any]:
    definition = template.get("definition") if isinstance(template.get("definition"), dict) else {}
    if not as_of:
        from datetime import date as date_cls

        as_of = date_cls.today().isoformat()
    effective = _merge_overrides(dict(auto_inputs), input_overrides)
    override_keys = list((input_overrides or {}).keys())
    mode = str(definition.get("mode") or "")
    if mode == "tree" or str(definition.get("combine") or "") == "tree":
        return _run_tree_definition(
            template,
            definition,
            auto_inputs=auto_inputs,
            resolved_bindings=resolved_bindings,
            effective=effective,
            override_keys=override_keys,
            result_override=result_override,
            as_of=as_of,
        )

    nodes_out: list[dict[str, Any]] = []
    matched: list[str] = []
    for node in definition.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        nid = str(node.get("id") or "")
        ok = eval_when(node.get("when"), effective)
        if ok:
            matched.append(nid)
        nodes_out.append(
            {
                "id": nid,
                "label": node.get("label") or nid,
                "rule": node.get("rule") or "",
                "kind": node.get("kind") or "flag",
                "matched": ok,
                "facts": _facts_for_node(node, effective),
                "documents": list(node.get("documents") or []),
                "match_inputs": dict(node.get("match_inputs") or {}),
            }
        )
    combine = str(definition.get("combine") or "any")
    auto_passed = any(matched) if combine != "all" else False
    if combine == "all":
        auto_passed = bool(nodes_out) and all(n["matched"] for n in nodes_out)

    outcomes = definition.get("outcomes") if isinstance(definition.get("outcomes"), dict) else {}
    yes = outcomes.get("true") if isinstance(outcomes.get("true"), dict) else {}
    no = outcomes.get("false") if isinstance(outcomes.get("false"), dict) else {}
    yes_label = str(yes.get("label") or "該当")
    no_label = str(no.get("label") or "非該当")
    yes_msg = str(yes.get("message") or "該当します。")
    no_msg = str(no.get("message") or "該当しません。")

    override = result_override if result_override in ("auto", "yes", "no") else "auto"
    if override == "yes":
        passed = True
        source = "manual"
        message = f"手動設定により{yes_label}として扱います。"
        shown_matched = list(matched)
    elif override == "no":
        passed = False
        source = "manual"
        message = f"手動設定により{no_label}として扱います。"
        shown_matched = []
    else:
        passed = auto_passed
        source = "auto"
        message = yes_msg if passed else no_msg
        shown_matched = list(matched)

    return {
        "template_id": template.get("id"),
        "template_title": template.get("title"),
        "template_version": template.get("version"),
        "family_id": template.get("family_id") or template.get("id"),
        "as_of": as_of,
        "law_valid_from": template.get("valid_from"),
        "law_valid_to": template.get("valid_to"),
        "law_label": template.get("law_label") or "",
        "law_range": template.get("law_range")
        or f"{template.get('valid_from') or '開始未設定'} 〜 {template.get('valid_to') or '終期なし'}",
        "frozen": False,
        "mode": "checklist",
        "passed": passed,
        "is_taxable": passed,
        "outcome_label": yes_label if passed else no_label,
        "outcomes": {"true": {"label": yes_label, "message": yes_msg}, "false": {"label": no_label, "message": no_msg}},
        "message": message,
        "matched_conditions": shown_matched,
        "auto_is_taxable": auto_passed,
        "auto_passed": auto_passed,
        "auto_matched_conditions": list(matched),
        "result_override": override,
        "result_source": source,
        "conditions": nodes_out,
        "inputs": effective,
        "auto_inputs": dict(auto_inputs),
        "input_override_keys": override_keys,
        "bindings": resolved_bindings,
        "client_name": effective.get("client_name") or "",
    }


def run_template_for_client(
    template: Mapping[str, Any],
    *,
    firm_id: str,
    client: Mapping[str, Any],
    input_overrides: Mapping[str, Any] | None = None,
    result_override: str = "auto",
    as_of: str | None = None,
) -> dict[str, Any]:
    definition = template.get("definition") if isinstance(template.get("definition"), dict) else {}
    try:
        from services.client_metrics_service import list_metric_facts

        facts = list_metric_facts(firm_id, str(client.get("id") or ""))
    except Exception:
        facts = []
    auto_inputs, resolved = resolve_bindings(definition, client=client, facts=facts)
    return run_definition(
        template,
        auto_inputs=auto_inputs,
        resolved_bindings=resolved,
        input_overrides=input_overrides,
        result_override=result_override,
        as_of=as_of,
    )
