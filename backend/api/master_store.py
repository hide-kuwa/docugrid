"""Master JSON stores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from docugrid_auth import STAKEHOLDER_ROLE_BY_ID

from api.constants import (
    CLIENT_MASTER_PATH,
    DEFAULT_ROLE_PERMISSIONS,
    KNOWN_APP_PERMISSIONS,
    ROLE_PERMISSIONS_PATH,
    STAKEHOLDER_MASTER_PATH,
    SYSTEM_CONFIG_PATH,
    _role_permissions_cache,
)
from api.deps import (
    _get_role_permissions,
    _invalidate_role_permissions_cache,
    _invalidate_stakeholder_maps_cache,
)
from api.schemas import (
    ClientMasterClient,
    ClientMasterGroup,
    ClientMasterPayload,
    ClientMasterRelation,
    ClientMasterRelationLayout,
    RolePermissionsPayload,
    StakeholderMasterPayload,
    SystemConfigPayload,
    SystemConfigUpdateBody,
)
from services.firm_settings import (
    configured_flags,
    get_gemini_key,
    get_openai_key,
    load_system_config_raw,
    save_system_config_raw,
    update_secrets,
)
from services.client_assignments import (
    sync_assignments_from_scope_map,
    validate_assignments_for_clients,
)
from services.client_profile_fields import (
    sanitize_client_profile,
    sanitize_client_profile_history,
    sanitize_client_profile_meta,
)
from services.drive_context import drive_credentials_configured, resolve_drive_mode
from services.tenancy import (
    DEFAULT_FIRM_ID,
    AuthContext,
    get_client_firm_id,
    get_client_firm_map,
    invalidate_client_firm_cache,
)

def _load_system_config(firm_id: str) -> SystemConfigPayload:
    data = load_system_config_raw(firm_id)
    if data:
        try:
            base = SystemConfigPayload(
                **{k: v for k, v in data.items() if k in SystemConfigPayload.model_fields}
            )
        except Exception:
            base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    else:
        base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    flags = configured_flags(firm_id)
    return base.model_copy(
        update={
            **flags,
            "drive_credentials_configured": drive_credentials_configured(firm_id),
            "drive_mode": resolve_drive_mode(firm_id),
        }
    )


def _clamp_matrix_year_display_count(value: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 5
    return max(1, min(30, n))


def _save_system_config(firm_id: str, body: SystemConfigUpdateBody) -> SystemConfigPayload:
    update_secrets(
        firm_id,
        openai_api_key=body.ai_openai_api_key,
        gemini_api_key=body.ai_gemini_api_key,
        clear_openai=body.clear_ai_openai_key,
        clear_gemini=body.clear_ai_gemini_key,
    )
    next_payload = SystemConfigPayload(
        google_drive_connected=body.google_drive_connected,
        notification_email_enabled=body.notification_email_enabled,
        ocr_auto_extract_enabled=body.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=body.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=body.alert_corporate_tax_months_before_due,
        ai_openai_enabled=body.ai_openai_enabled,
        ai_openai_model=body.ai_openai_model or "gpt-4o-mini",
        ai_gemini_enabled=body.ai_gemini_enabled,
        ai_gemini_model=body.ai_gemini_model or "gemini-2.5-flash",
        drive_root_folder_id=(body.drive_root_folder_id or "").strip() or None,
        matrix_year_display_count=_clamp_matrix_year_display_count(body.matrix_year_display_count),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        **configured_flags(firm_id),
        drive_credentials_configured=drive_credentials_configured(firm_id),
        drive_mode=resolve_drive_mode(firm_id),
    )
    store = next_payload.model_dump(
        exclude={
            "ai_openai_key_configured",
            "ai_openai_key_last4",
            "ai_gemini_key_configured",
            "ai_gemini_key_last4",
            "drive_credentials_configured",
            "drive_mode",
        }
    )
    save_system_config_raw(firm_id, store)
    return next_payload


def _system_config_update_touches_platform(
    body: SystemConfigUpdateBody, existing: SystemConfigPayload
) -> bool:
    if body.ai_openai_api_key or body.ai_gemini_api_key:
        return True
    if body.clear_ai_openai_key or body.clear_ai_gemini_key:
        return True
    if body.ocr_auto_extract_enabled != existing.ocr_auto_extract_enabled:
        return True
    if body.ai_openai_enabled != existing.ai_openai_enabled:
        return True
    if body.ai_gemini_enabled != existing.ai_gemini_enabled:
        return True
    if (body.ai_openai_model or "gpt-4o-mini") != existing.ai_openai_model:
        return True
    if (body.ai_gemini_model or "gemini-2.5-flash") != existing.ai_gemini_model:
        return True
    return False


def _mask_system_config_for_role(payload: SystemConfigPayload, role: str) -> SystemConfigPayload:
    perms = _get_role_permissions().get(role, set())
    if "settings.platform" in perms:
        return payload
    # Firm admins (settings.manage) may configure Drive; AI keys stay platform-only.
    return payload.model_copy(
        update={
            "ocr_auto_extract_enabled": True,
            "ai_openai_enabled": False,
            "ai_gemini_enabled": False,
            "ai_openai_key_configured": False,
            "ai_openai_key_last4": None,
            "ai_gemini_key_configured": False,
            "ai_gemini_key_last4": None,
        }
    )


_RELATION_KINDS = frozenset({"group_company", "relative", "shareholding", "referral"})


def _default_client_relations() -> list[ClientMasterRelation]:
    return [
        ClientMasterRelation(
            id="r1",
            kind="group_company",
            fromClientId="c1",
            toClientId="c2",
            groupId="g1",
            note="鈴木グループ",
        ),
        ClientMasterRelation(
            id="r1b",
            kind="group_company",
            fromClientId="c7",
            toClientId="c1",
            groupId="g1",
            note="持株→事業会社",
        ),
        ClientMasterRelation(
            id="r1c",
            kind="group_company",
            fromClientId="c1",
            toClientId="c9",
            groupId="g1",
            note="食品子会社",
        ),
        ClientMasterRelation(
            id="r2",
            kind="relative",
            fromClientId="c1",
            toClientId="c4",
            groupId="g2",
            note="代表との親族関係",
        ),
        ClientMasterRelation(
            id="r2b",
            kind="relative",
            fromClientId="c4",
            toClientId="c6",
            groupId="g2",
            note="配偶者",
        ),
        ClientMasterRelation(
            id="r3",
            kind="shareholding",
            fromClientId="c4",
            toClientId="c1",
            percent=60.0,
            note="個人株主",
        ),
        ClientMasterRelation(
            id="r3b",
            kind="shareholding",
            fromClientId="c6",
            toClientId="c1",
            percent=15.0,
            note="親族株主",
        ),
        ClientMasterRelation(
            id="r3c",
            kind="shareholding",
            fromClientId="c7",
            toClientId="c2",
            percent=100.0,
            groupId="g1",
            note="HD がテックを保有",
        ),
        ClientMasterRelation(
            id="r4",
            kind="shareholding",
            fromClientId="c3",
            toClientId="c5",
            percent=25.0,
            groupId="g3",
            note="主要株主",
        ),
        ClientMasterRelation(
            id="r5",
            kind="referral",
            fromClientId="c8",
            toClientId="c1",
            note="田村さんからの紹介で顧問開始",
        ),
        ClientMasterRelation(
            id="r5b",
            kind="referral",
            fromClientId="c5",
            toClientId="c9",
            note="不動産経由でフーズを紹介",
        ),
    ]


def _default_client_master() -> ClientMasterPayload:
    return ClientMasterPayload(
        clients=[
            ClientMasterClient(id="c1", name="株式会社 鈴木商店", fiscalMonth=3, category="corporate", tags=["製造"]),
            ClientMasterClient(id="c2", name="合同会社 テック", fiscalMonth=12, category="corporate", tags=["IT"]),
            ClientMasterClient(id="c3", name="佐藤商事", fiscalMonth=9, category="corporate", tags=["卸売"]),
            ClientMasterClient(id="c4", name="鈴木 太郎 (個人)", fiscalMonth=12, category="individual", tags=["個人事業"]),
            ClientMasterClient(id="c5", name="山田不動産", fiscalMonth=12, category="corporate", tags=["不動産"]),
            ClientMasterClient(id="c6", name="鈴木 花子 (個人)", fiscalMonth=12, category="individual", tags=["個人"]),
            ClientMasterClient(id="c7", name="鈴木HD", fiscalMonth=3, category="corporate", tags=["持株"]),
            ClientMasterClient(id="c8", name="田村 一郎 (個人)", fiscalMonth=12, category="individual", tags=["紹介元"]),
            ClientMasterClient(id="c9", name="鈴木フーズ", fiscalMonth=3, category="corporate", tags=["食品"]),
        ],
        groups=[
            ClientMasterGroup(
                id="g1",
                name="鈴木グループ",
                relationType="group_company",
                clientIds=["c1", "c2", "c7", "c9"],
                note="グループ会社として連結管理",
            ),
            ClientMasterGroup(
                id="g2",
                name="鈴木家資産管理",
                relationType="relative_group",
                clientIds=["c1", "c4", "c6"],
                note="親族保有資産・個人事業を含む",
            ),
            ClientMasterGroup(
                id="g3",
                name="山田不動産 株主関係",
                relationType="shareholder",
                clientIds=["c5", "c3"],
                note="主要株主の関連先を監視",
            ),
        ],
        relations=_default_client_relations(),
        updated_at=None,
    )


def _load_client_master() -> ClientMasterPayload:
    if not CLIENT_MASTER_PATH.exists():
        return _default_client_master()
    try:
        data = json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))
        had_relations_key = "relations" in data
        payload = ClientMasterPayload(**data)
    except Exception:
        return _default_client_master()
    # 旧ファイル（relations キーなし）だけデモ辺を付与。空配列の明示保存は尊重する。
    if not had_relations_key and not payload.relations:
        id_set = {c.id for c in payload.clients}
        seeded = [
            r
            for r in _default_client_relations()
            if r.fromClientId in id_set and r.toClientId in id_set
        ]
        if seeded:
            payload.relations = seeded
    # デモ顧問先 c1 がある事務所だけ、不足しているデモ事例を足して永続化
    if any(c.id == "c1" for c in payload.clients):
        merged = _merge_missing_demo_seed(payload)
        if _demo_seed_changed(payload, merged):
            for c in merged.clients:
                if not (c.firmId or "").strip():
                    c.firmId = DEFAULT_FIRM_ID
            return _save_client_master(merged)
        payload = merged
    return payload


def _demo_seed_changed(before: ClientMasterPayload, after: ClientMasterPayload) -> bool:
    if len(before.clients) != len(after.clients):
        return True
    if len(before.relations) != len(after.relations):
        return True
    before_groups = {g.id: tuple(g.clientIds) for g in before.groups}
    after_groups = {g.id: tuple(g.clientIds) for g in after.groups}
    return before_groups != after_groups


def _merge_missing_demo_seed(payload: ClientMasterPayload) -> ClientMasterPayload:
    demo = _default_client_master()
    by_client = {c.id: c for c in payload.clients}
    for c in demo.clients:
        if c.id not in by_client:
            by_client[c.id] = c.model_copy(update={"firmId": DEFAULT_FIRM_ID})
    by_group = {g.id: g for g in payload.groups}
    for g in demo.groups:
        existing = by_group.get(g.id)
        if existing is None:
            by_group[g.id] = g
        else:
            merged_ids = list(dict.fromkeys([*existing.clientIds, *g.clientIds]))
            by_group[g.id] = existing.model_copy(update={"clientIds": merged_ids})
    by_rel = {r.id: r for r in payload.relations}
    for r in demo.relations:
        by_rel.setdefault(r.id, r)
    return ClientMasterPayload(
        clients=list(by_client.values()),
        groups=list(by_group.values()),
        relations=list(by_rel.values()),
        relationLayouts=payload.relationLayouts,
        updated_at=payload.updated_at,
    )


def _merge_client_master_for_firm(ctx: AuthContext, payload: ClientMasterPayload) -> ClientMasterPayload:
    existing = _load_client_master()
    firm = ctx.firm_id
    other_clients = [
        c
        for c in existing.clients
        if get_client_firm_id(c.id) != firm
    ]
    other_client_ids = {c.id for c in other_clients}
    firm_clients_by_id = {
        c.id: c
        for c in existing.clients
        if get_client_firm_id(c.id) == firm
    }
    for c in payload.clients:
        if c.id in other_client_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {c.id!r} belonging to another firm",
            )
        assigned_firm = (c.firmId or "").strip() or firm
        if assigned_firm != firm:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} firmId must be {firm!r}",
            )
        c.firmId = firm
        firm_clients_by_id[c.id] = c
    merged_clients = other_clients + list(firm_clients_by_id.values())
    if len({c.id for c in merged_clients}) != len(merged_clients):
        raise HTTPException(status_code=400, detail="Duplicate client id across firms")
    payload_client_ids = set(firm_clients_by_id.keys())
    kept_groups = [
        g
        for g in existing.groups
        if g.clientIds and all(cid in other_client_ids for cid in g.clientIds)
    ]
    merged_groups = kept_groups + [
        g
        for g in payload.groups
        if all(cid in payload_client_ids for cid in g.clientIds)
    ]
    kept_relations = [
        r
        for r in existing.relations
        if r.fromClientId in other_client_ids and r.toClientId in other_client_ids
    ]
    merged_relations = kept_relations + [
        r
        for r in payload.relations
        if r.fromClientId in payload_client_ids and r.toClientId in payload_client_ids
    ]
    # 配置キーは "{focusClientId}__{viewMode}"。他 firm のフォーカス分は残し、自 firm は payload で置換。
    kept_layouts = {
        k: v
        for k, v in existing.relationLayouts.items()
        if _relation_layout_focus_id(k) in other_client_ids
    }
    incoming_layouts = {
        k: v
        for k, v in payload.relationLayouts.items()
        if _relation_layout_focus_id(k) in payload_client_ids
    }
    return ClientMasterPayload(
        clients=merged_clients,
        groups=merged_groups,
        relations=merged_relations,
        relationLayouts={**kept_layouts, **incoming_layouts},
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )


def _save_client_master(payload: ClientMasterPayload) -> ClientMasterPayload:
    CLIENT_MASTER_PATH.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    invalidate_client_firm_cache()
    return payload


def _validate_client_master(payload: ClientMasterPayload) -> None:
    ids = [c.id for c in payload.clients]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate client id")
    id_set = set(ids)
    gids = [g.id for g in payload.groups]
    if len(gids) != len(set(gids)):
        raise HTTPException(status_code=400, detail="Duplicate group id")
    for c in payload.clients:
        if not (c.id or "").strip():
            raise HTTPException(status_code=400, detail="Client id must not be empty")
        if not (c.name or "").strip():
            raise HTTPException(status_code=400, detail="Client name must not be empty")
        if not 1 <= c.fiscalMonth <= 12:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} fiscalMonth must be between 1 and 12",
            )
        c.profile = sanitize_client_profile(c.profile)
        c.profileMeta = sanitize_client_profile_meta(c.profileMeta)
        c.profileHistory = sanitize_client_profile_history(c.profileHistory)
    for g in payload.groups:
        if not (g.id or "").strip():
            raise HTTPException(status_code=400, detail="Group id must not be empty")
        for cid in g.clientIds:
            if cid not in id_set:
                raise HTTPException(
                    status_code=400,
                    detail=f"Group {g.id!r} references unknown client {cid!r}",
                )
    rids = [r.id for r in payload.relations]
    if len(rids) != len(set(rids)):
        raise HTTPException(status_code=400, detail="Duplicate relation id")
    group_ids = {g.id for g in payload.groups}
    sanitized_relations: list[ClientMasterRelation] = []
    for r in payload.relations:
        if not (r.id or "").strip():
            raise HTTPException(status_code=400, detail="Relation id must not be empty")
        kind = (r.kind or "").strip()
        if kind not in _RELATION_KINDS:
            raise HTTPException(
                status_code=400,
                detail=f"Relation {r.id!r} has invalid kind {r.kind!r}",
            )
        if r.fromClientId not in id_set:
            raise HTTPException(
                status_code=400,
                detail=f"Relation {r.id!r} references unknown client {r.fromClientId!r}",
            )
        if r.toClientId not in id_set:
            raise HTTPException(
                status_code=400,
                detail=f"Relation {r.id!r} references unknown client {r.toClientId!r}",
            )
        if r.fromClientId == r.toClientId:
            raise HTTPException(
                status_code=400,
                detail=f"Relation {r.id!r} must connect two different clients",
            )
        percent = r.percent
        if kind == "shareholding":
            if percent is not None and not (0 < float(percent) <= 100):
                raise HTTPException(
                    status_code=400,
                    detail=f"Relation {r.id!r} percent must be between 0 and 100",
                )
        else:
            percent = None
        group_id = (r.groupId or "").strip() or None
        if group_id and group_id not in group_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Relation {r.id!r} references unknown group {group_id!r}",
            )
        sanitized_relations.append(
            ClientMasterRelation(
                id=r.id.strip(),
                kind=kind,
                fromClientId=r.fromClientId,
                toClientId=r.toClientId,
                percent=float(percent) if percent is not None else None,
                note=(r.note or "").strip() or None,
                groupId=group_id,
            )
        )
    payload.relations = sanitized_relations
    payload.relationLayouts = _sanitize_relation_layouts(payload.relationLayouts, id_set)


def _relation_layout_focus_id(key: str) -> str:
    return (key or "").split("__", 1)[0].strip()


def _sanitize_point_map(raw: dict[str, dict[str, float]] | None) -> dict[str, dict[str, float]]:
    if not raw:
        return {}
    out: dict[str, dict[str, float]] = {}
    for i, (pid, pt) in enumerate(raw.items()):
        if i >= 120:
            break
        sid = (pid or "").strip()
        if not sid or len(sid) > 80:
            continue
        if not isinstance(pt, dict):
            continue
        try:
            x = float(pt.get("x"))  # type: ignore[arg-type]
            y = float(pt.get("y"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if not (x == x and y == y):  # NaN
            continue
        if abs(x) > 8000 or abs(y) > 8000:
            continue
        out[sid] = {"x": x, "y": y}
    return out


def _sanitize_relation_layouts(
    layouts: dict[str, ClientMasterRelationLayout] | None,
    client_ids: set[str],
) -> dict[str, ClientMasterRelationLayout]:
    if not layouts:
        return {}
    out: dict[str, ClientMasterRelationLayout] = {}
    for i, (key, layout) in enumerate(layouts.items()):
        if i >= 200:
            break
        k = (key or "").strip()
        if not k or len(k) > 120 or "__" not in k:
            continue
        focus = _relation_layout_focus_id(k)
        if focus not in client_ids:
            continue
        cleaned = ClientMasterRelationLayout(
            nodes=_sanitize_point_map(layout.nodes),
            labels=_sanitize_point_map(layout.labels),
            bends=_sanitize_point_map(layout.bends),
        )
        if cleaned.nodes or cleaned.labels or cleaned.bends:
            out[k] = cleaned
    return out


def _role_permissions_payload_from_store() -> RolePermissionsPayload:
    perms = _get_role_permissions()
    updated_at: str | None = None
    if ROLE_PERMISSIONS_PATH.exists():
        try:
            raw = json.loads(ROLE_PERMISSIONS_PATH.read_text(encoding="utf-8"))
            updated_at = raw.get("updated_at")
        except Exception:
            pass
    return RolePermissionsPayload(
        permissionsByRole={role: sorted(perms.get(role, set())) for role in DEFAULT_ROLE_PERMISSIONS},
        updated_at=updated_at,
    )


def _validate_role_permissions(payload: RolePermissionsPayload) -> None:
    known_roles = set(DEFAULT_ROLE_PERMISSIONS.keys())
    for role, perms in payload.permissionsByRole.items():
        if role not in known_roles:
            raise HTTPException(status_code=400, detail=f"Unknown role: {role}")
        if not isinstance(perms, list):
            raise HTTPException(status_code=400, detail=f"Invalid permissions for role {role}")
        invalid = [p for p in perms if p not in KNOWN_APP_PERMISSIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown permission(s) for {role}: {invalid}")
    admin_perms = set(payload.permissionsByRole.get("admin", []))
    if "settings.manage" not in admin_perms:
        raise HTTPException(
            status_code=400,
            detail="admin role must retain settings.manage permission",
        )


def _save_role_permissions(payload: RolePermissionsPayload) -> RolePermissionsPayload:
    _validate_role_permissions(payload)
    normalized = {
        role: sorted(set(payload.permissionsByRole.get(role, [])))
        for role in DEFAULT_ROLE_PERMISSIONS
    }
    saved = RolePermissionsPayload(
        permissionsByRole=normalized,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    ROLE_PERMISSIONS_PATH.write_text(
        json.dumps(saved.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _invalidate_role_permissions_cache()
    return saved


def _validate_stakeholder_master(payload: StakeholderMasterPayload) -> None:
    known_roles = set(_get_role_permissions().keys())
    for sid, role in payload.roleByStakeholderId.items():
        if role not in known_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role {role!r} for stakeholder {sid!r}",
            )
    cm = _load_client_master()
    valid_ids = set(get_client_firm_map().keys()) | {c.id for c in cm.clients}
    validate_assignments_for_clients(payload.clientScopesByStakeholderId, valid_ids)


def _save_stakeholder_master(payload: StakeholderMasterPayload) -> StakeholderMasterPayload:
    _validate_stakeholder_master(payload)
    roles = dict(payload.roleByStakeholderId)
    roles.update(STAKEHOLDER_ROLE_BY_ID)
    next_payload = StakeholderMasterPayload(
        roleByStakeholderId=roles,
        clientScopesByStakeholderId=payload.clientScopesByStakeholderId,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    STAKEHOLDER_MASTER_PATH.write_text(next_payload.model_dump_json(indent=2), encoding="utf-8")
    sync_assignments_from_scope_map(payload.clientScopesByStakeholderId)
    _invalidate_stakeholder_maps_cache()
    return next_payload

__all__ = [
    "_clamp_matrix_year_display_count",
    "_default_client_master",
    "_load_client_master",
    "_load_system_config",
    "_mask_system_config_for_role",
    "_merge_client_master_for_firm",
    "_role_permissions_payload_from_store",
    "_save_client_master",
    "_save_role_permissions",
    "_save_stakeholder_master",
    "_save_system_config",
    "_system_config_update_touches_platform",
    "_validate_client_master",
    "_validate_role_permissions",
    "_validate_stakeholder_master",
]
