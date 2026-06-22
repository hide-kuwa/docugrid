"""UI persona resolution (screen shell per actor type).

Persona is separate from RBAC `role`: same permissions can map to different home layouts.
"""

from __future__ import annotations

PERSONA_FIRM_DIRECTOR = "firm_director"
PERSONA_FIRM_STAFF_MAIN = "firm_staff_main"
PERSONA_FIRM_STAFF_SUPPORT = "firm_staff_support"
PERSONA_CLIENT_ACCOUNTING = "client_accounting"
PERSONA_CLIENT_EXECUTIVE = "client_executive"
PERSONA_CLIENT_SALES_EXPENSE = "client_sales_expense"
PERSONA_CLIENT_CONTROLLER = "client_controller"
PERSONA_BANK = "bank"
PERSONA_TAX_OFFICE = "tax_office"
PERSONA_PLATFORM_ADMIN = "platform_admin"

PERSONA_LABELS: dict[str, str] = {
    PERSONA_FIRM_DIRECTOR: "税理士事務所・所長",
    PERSONA_FIRM_STAFF_MAIN: "税理士事務所・担当スタッフ",
    PERSONA_FIRM_STAFF_SUPPORT: "税理士事務所・補佐スタッフ",
    PERSONA_CLIENT_ACCOUNTING: "クライアント・担当経理",
    PERSONA_CLIENT_EXECUTIVE: "クライアント・社長",
    PERSONA_CLIENT_SALES_EXPENSE: "クライアント・営業（経費精算）",
    PERSONA_CLIENT_CONTROLLER: "クライアント・管理会計",
    PERSONA_BANK: "銀行",
    PERSONA_TAX_OFFICE: "税務署",
    PERSONA_PLATFORM_ADMIN: "プラットフォーム管理者",
}

# Dev stakeholder_id → default persona (overridable via firm_members.persona_id)
STAKEHOLDER_PERSONA_BY_ID: dict[str, str] = {
    "actor-admin": PERSONA_PLATFORM_ADMIN,
    "actor-s1": PERSONA_FIRM_STAFF_MAIN,
    "actor-s2": PERSONA_FIRM_STAFF_SUPPORT,
    "actor-s3": PERSONA_FIRM_DIRECTOR,
    "actor-c1": PERSONA_CLIENT_ACCOUNTING,
    "actor-c-ceo": PERSONA_CLIENT_EXECUTIVE,
    "actor-c-sales": PERSONA_CLIENT_SALES_EXPENSE,
    "actor-c-controller": PERSONA_CLIENT_CONTROLLER,
    "actor-b1": PERSONA_BANK,
    "actor-tp1": PERSONA_CLIENT_ACCOUNTING,
    "actor-tax1": PERSONA_TAX_OFFICE,
    "actor-beta-admin": PERSONA_FIRM_DIRECTOR,
    "actor-beta-staff": PERSONA_FIRM_STAFF_MAIN,
}

VALID_PERSONA_IDS = frozenset(PERSONA_LABELS.keys())


def persona_label(persona_id: str) -> str:
    return PERSONA_LABELS.get(persona_id, persona_id or "不明")


def resolve_persona_id(*, stakeholder_id: str, stored_persona_id: str | None = None) -> str:
    pid = (stored_persona_id or "").strip()
    if pid in VALID_PERSONA_IDS:
        return pid
    return STAKEHOLDER_PERSONA_BY_ID.get(stakeholder_id, PERSONA_FIRM_STAFF_MAIN)
