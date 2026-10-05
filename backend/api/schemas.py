"""API request/response Pydantic models."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from docugrid_auth import MCP_JWT_AUDIENCE

class FileInfo(BaseModel):
    id: str
    name: str
    updated_at: str
    url: str



class AuditPoint(BaseModel):
    side: str
    page: int
    x: float
    y: float
    fileName: str | None = None
    fileHash: str | None = None



class AuditLink(BaseModel):
    id: str
    createdAt: str
    createdBy: str | None = None
    comment: str | None = None
    left: AuditPoint
    right: AuditPoint



class AutoLinkMatchedCoordinate(BaseModel):
    page: int
    x: float
    y: float
    width: float
    height: float
    matched_text: str
    x_norm: float = 0.0
    y_norm: float = 0.0
    width_norm: float = 0.0
    height_norm: float = 0.0



class AutoLinkRequest(BaseModel):
    pdf_file_path: str | None = None
    version_id: str | None = None
    target_value: str | float
    user_id: str
    field_id: str
    match_strategy: str = "best"
    context_hint: str | None = None
    dry_run: bool = False
    create_version: bool = False
    queue_on_ocr: bool = False
    trigger_ocr: bool = False



class AutoLinkResponse(BaseModel):
    status: str
    output_pdf_path: str = ""
    matched_coordinates: List[AutoLinkMatchedCoordinate] = []
    message: str = ""
    ocr_recommended: bool = False
    stamp_id: str = ""
    error_code: str | None = None
    dry_run: bool = False
    source_pdf_path: str | None = None
    total_matches_found: int = 0
    new_version_id: str | None = None
    queue_id: str | None = None
    ocr_job_id: str | None = None
    match_source: str | None = None



class AutoVouchStampItem(BaseModel):
    id: str
    source_pdf_path: str
    output_pdf_path: str
    field_id: str
    user_id: str
    target_value: str
    match_count: int
    matched_coordinates: list = []
    created_at: str
    version_id: str | None = None
    dry_run: bool = False



class SystemConfigPayload(BaseModel):
    google_drive_connected: bool = False
    notification_email_enabled: bool = True
    ocr_auto_extract_enabled: bool = True
    alert_consumption_tax_months_before_due: int = 2
    alert_corporate_tax_months_before_due: int = 2
    ai_openai_enabled: bool = False
    ai_openai_model: str = "gpt-4o-mini"
    ai_openai_key_configured: bool = False
    ai_openai_key_last4: Optional[str] = None
    ai_gemini_enabled: bool = False
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_gemini_key_configured: bool = False
    ai_gemini_key_last4: Optional[str] = None
    drive_root_folder_id: Optional[str] = None
    drive_credentials_configured: bool = False
    drive_mode: str = "unconfigured"
    matrix_year_display_count: int = 5
    updated_at: str | None = None



class SystemConfigUpdateBody(BaseModel):
    google_drive_connected: bool = False
    notification_email_enabled: bool = True
    ocr_auto_extract_enabled: bool = True
    alert_consumption_tax_months_before_due: int = 2
    alert_corporate_tax_months_before_due: int = 2
    ai_openai_enabled: bool = False
    ai_openai_model: str = "gpt-4o-mini"
    ai_gemini_enabled: bool = False
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_openai_api_key: Optional[str] = None
    ai_gemini_api_key: Optional[str] = None
    clear_ai_openai_key: bool = False
    clear_ai_gemini_key: bool = False
    drive_root_folder_id: Optional[str] = None
    matrix_year_display_count: int = 5



class ClientMasterClient(BaseModel):
    id: str
    name: str
    fiscalMonth: int
    category: str
    tags: list[str] = []
    firmId: str | None = None
    profile: dict[str, str] = Field(default_factory=dict)
    profileMeta: dict[str, dict[str, str]] = Field(default_factory=dict)
    profileHistory: dict[str, list[dict[str, str]]] = Field(default_factory=dict)



class ClientMasterGroup(BaseModel):
    id: str
    name: str
    relationType: str
    clientIds: list[str]
    note: str | None = None


class ClientMasterRelation(BaseModel):
    id: str
    kind: str
    fromClientId: str
    toClientId: str
    percent: float | None = None
    note: str | None = None
    groupId: str | None = None


class ClientMasterRelationLayout(BaseModel):
    """関係図の手動配置（ノード絶対座標・ラベル/曲げオフセット）."""

    nodes: dict[str, dict[str, float]] = Field(default_factory=dict)
    labels: dict[str, dict[str, float]] = Field(default_factory=dict)
    bends: dict[str, dict[str, float]] = Field(default_factory=dict)


class ClientMasterPayload(BaseModel):
    clients: list[ClientMasterClient]
    groups: list[ClientMasterGroup]
    relations: list[ClientMasterRelation] = Field(default_factory=list)
    # key = "{focusClientId}__{viewMode}"
    relationLayouts: dict[str, ClientMasterRelationLayout] = Field(default_factory=dict)
    updated_at: str | None = None



class StakeholderMasterPayload(BaseModel):
    roleByStakeholderId: dict[str, str]
    clientScopesByStakeholderId: dict[str, list[str]]
    updated_at: str | None = None



class AuditEventItem(BaseModel):
    id: int
    created_at: str
    stakeholder_id: str | None = None
    user_email: str | None = None
    role: str | None = None
    client_id: str | None = None
    path: str
    action: str
    result: str
    detail: str | None = None
    http_status: int | None = None



class LoginRequest(BaseModel):
    email: str
    password: str
    stakeholder_id: str = ""



class GoogleLoginRequest(BaseModel):
    credential: str
    invite_token: str = ""



class FirmRegisterBody(BaseModel):
    credential: str
    firm_label: str = Field(..., min_length=1, max_length=120)
    display_name: str | None = Field(default=None, max_length=80)



class FirmJoinRequestBody(BaseModel):
    credential: str
    join_code: str = Field(..., min_length=4, max_length=32)



class FirmMemberInviteBody(BaseModel):
    email: str = Field(..., min_length=3)
    firm_role: str = "operator"
    persona_id: str | None = None



class AuthConfigResponse(BaseModel):
    google_client_id: str = ""
    password_login_enabled: bool = False
    session_cookie: bool = True
    legacy_files: bool = False
    csrf: bool = True



class FirmMemberItem(BaseModel):
    id: str
    email: str
    stakeholder_id: str
    firm_role: str
    persona_id: str = ""
    status: str
    display_name: str | None = None



class FirmMemberPatchBody(BaseModel):
    status: str | None = None
    firm_role: str | None = None
    persona_id: str | None = None
    display_name: str | None = None



class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int



class McpTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    expires_at: str
    audience: str = MCP_JWT_AUDIENCE



class RolePermissionsPayload(BaseModel):
    permissionsByRole: dict[str, list[str]]
    updated_at: str | None = None



class FirmTaskAssignee(BaseModel):
    member_id: str
    display_name: str
    assignment_role: str = "main"



class FirmTaskItem(BaseModel):
    client_id: str
    period_key: str
    slot_label: str
    kind: str
    assignees: List[FirmTaskAssignee] = []
    primary_assignee_id: str | None = None



class FirmClientTaskSummary(BaseModel):
    client_id: str
    missing_total: int
    pending_approval_total: int
    incomplete_period_count: int
    assignees: List[FirmTaskAssignee] = []



class FirmStaffTaskSummary(BaseModel):
    member_id: str
    display_name: str
    missing_total: int
    pending_approval_total: int
    open_client_count: int
    assigned_client_count: int
    assigned_client_ids: List[str] = []



class FirmTasksResponse(BaseModel):
    firm_id: str
    missing_total: int
    pending_approval_total: int
    client_count: int
    clients: List[FirmClientTaskSummary]
    items: List[FirmTaskItem]
    staff: List[FirmStaffTaskSummary] = []
    unassigned_missing_total: int = 0
    unassigned_pending_total: int = 0



class BillingCheckoutBody(BaseModel):
    plan_id: str



class BillingPortalBody(BaseModel):
    return_path: str = "/settings?tab=billing"



class BillingAiTopupBody(BaseModel):
    packs: int = 1


class MigrationPendingConfirmBody(BaseModel):
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None


class MigrationPendingBatchConfirmBody(BaseModel):
    item_ids: List[str]
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None


class MigrationPendingReclassifyBody(BaseModel):
    item_ids: List[str] = Field(default_factory=list)
    source_path_prefix: Optional[str] = None
    vision_mode: str = "on"


class MigrationWalletGrantBody(BaseModel):
    tokens: int = Field(ge=1, le=50_000_000)


class BillingPartnerCreateBody(BaseModel):
    name: str
    email: str
    commission_percent: float | None = None



class BillingPartnerAttachBody(BaseModel):
    partner_id: str
    contract_years: int = 1



class PayrollEmployeeItem(BaseModel):
    id: str
    client_id: str
    employee_code: str | None = None
    name: str
    hire_date: str | None = None
    tax_column: str = "甲"
    dependent_count: int = 0
    spouse_deduction: bool = False
    social_insurance_grade: int | None = None
    notes: str | None = None
    active: bool = True
    created_at: str | None = None
    updated_at: str | None = None



class PayrollEmployeesPayload(BaseModel):
    employees: List[PayrollEmployeeItem]



class WithholdingLedgerRowItem(BaseModel):
    id: str
    client_id: str
    employee_id: str
    year_month: str
    gross_pay_yen: int = 0
    bonus_yen: int = 0
    health_insurance_yen: int = 0
    pension_yen: int = 0
    employment_insurance_yen: int = 0
    income_tax_yen: int = 0
    resident_tax_yen: int = 0
    net_pay_yen: int = 0
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None



class WithholdingLedgerPayload(BaseModel):
    rows: List[WithholdingLedgerRowItem]
    summary: dict | None = None



class YearEndRunBody(BaseModel):
    tax_year: int
    settlement_month: str | None = None



class SanteiRunBody(BaseModel):
    tax_year: int



class CaptureItemPatchBody(BaseModel):
    status: str | None = None
    title: str | None = None
    audit_message: str | None = None
    pinned: bool | None = None
    category: str | None = None



class CaptureAnalyzeBody(BaseModel):
    total_yen: int | None = None
    proof_yen: int | None = None
    declared_yen: int | None = None
    dependent_count: int | None = None
    life_insurance_yen: int | None = None
    spouse_deduction: bool | None = None
    attendees: int | None = None
    registration_number: str | None = None



class CaptureReauditBody(BaseModel):
    total_yen: int | None = None
    proof_yen: int | None = None
    declared_yen: int | None = None
    dependent_count: int | None = None
    life_insurance_yen: int | None = None
    spouse_deduction: bool | None = None
    attendees: int | None = None
    registration_number: str | None = None



class CaptureRouteBody(BaseModel):
    period_key: str | None = None
    slot_id: str | None = None
    slot_label: str | None = None



class CaptureApplyPayrollBody(BaseModel):
    employee_id: str | None = None



class InvoiceVerifyBody(BaseModel):
    registration_number: str



class ClientMetricUpsertBody(BaseModel):
    metric_key: str
    period_key: str
    value_yen: int | None = None
    value_num: float | None = None



class ClientCommThreadBody(BaseModel):
    id: str | None = None
    channel: str = "email"
    subject: str
    preview: str = ""
    participants: str = ""
    occurred_at: str | None = None



class ClientSimulationBody(BaseModel):
    payload: dict



class ClientRecordItemBody(BaseModel):
    id: str | None = None
    domain: str
    title: str = ""
    body: str = ""
    meta: dict | None = None
    sort_order: int = 0


class ClientKarteEntryBody(BaseModel):
    id: str | None = None
    horizon: str
    period_key: str | None = None
    title: str = ""
    body: str = ""
    status: str = "open"
    due_date: str | None = None
    meeting_at: str | None = None
    tags: list[str] = []
    sort_order: int = 0


class ClientCalendarEventBody(BaseModel):
    id: str | None = None
    date: str
    time: str | None = None
    title: str
    company: str | None = None
    contact: str | None = None
    attendees: int = 1
    type: str = "meeting"



class MeResponse(BaseModel):
    email: str
    role: str
    stakeholder_id: str
    firm_id: str = ""
    firm_label: str = ""
    display_name: str = ""
    persona_id: str = ""
    persona_label: str = ""
    permissions: list[str] = []
    visible_client_ids: list[str] = []
    assigned_client_ids: list[str] = []


class ClientTransferCreateBody(BaseModel):
    clientId: str = Field(..., min_length=1, max_length=80)


class ClientTransferClaimBody(BaseModel):
    code: str = Field(..., min_length=4, max_length=32)
    confirm: bool = False



class ScreenDesignSaveBody(BaseModel):
    """Non-engineer editable layer. Only `personas` keys need to be set."""
    version: int = 1
    personas: dict[str, dict] = {}



class IntegrationPortItem(BaseModel):
    port_id: str
    label_ja: str
    ssot_owner: str = ""
    ssot_owner_label: str = ""
    manual_policy: Optional[str] = None
    manual_policy_label: str = ""
    direction: Optional[str] = None
    source: str = ""
    target: str = ""
    api_method: str = ""
    api_path: str = ""
    idempotency_key_template: str = ""
    status: str = "planned"
    notes: str = ""



class IntegrationPortWriteBody(BaseModel):
    port_id: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    ssot_owner: str = ""
    ssot_owner_label: str = ""
    manual_policy: Optional[str] = None
    manual_policy_label: str = ""
    direction: Optional[str] = None
    source: str = ""
    target: str = ""
    api_method: str = ""
    api_path: str = ""
    idempotency_key_template: str = ""
    status: str = "planned"
    notes: str = ""



class IntegrationPortsListPayload(BaseModel):
    version: int
    port_count: int
    config_path: str
    ports: List[IntegrationPortItem]



class IntegrationPortsReloadPayload(BaseModel):
    version: int
    port_count: int
    message: str



class IntegrationPortsExportPayload(BaseModel):
    version: int
    port_count: int
    yaml_text: str



class IntegrationPortsValidateBody(BaseModel):
    yaml_text: str = Field(..., min_length=1)



class IntegrationPortsValidatePayload(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    version: Optional[int] = None
    port_count: Optional[int] = None



class IntegrationPortsImportBody(BaseModel):
    yaml_text: str = Field(..., min_length=1)
    mode: str = Field(default="replace", pattern="^(replace|merge)$")



class IntegrationPortsImportPayload(BaseModel):
    version: int
    port_count: int
    message: str



class IntegrationPortSamplePayload(BaseModel):
    port_id: str
    http_method: str
    url: str
    idempotency_key: str = ""
    payload: dict
    target_base_url_hint: Optional[str] = None



class IntegrationPortTestBody(BaseModel):
    dry_run: bool = True
    payload: Optional[dict] = None
    client_id: str = "client-demo"
    period_key: str = "2025-03"
    target_base_url: str = ""
    batch_id: str = "batch-001"
    journal_id: str = "journal-demo"
    user_id: str = "dev-test"



class IntegrationPortTestResultPayload(BaseModel):
    port_id: str
    dry_run: bool
    status: str
    message: str
    http_method: str = ""
    url: str = ""
    request_body: dict = Field(default_factory=dict)
    response_status: Optional[int] = None
    response_body: Any = None
    validation_errors: List[str] = Field(default_factory=list)
    idempotency_key: str = ""
    tested_at: str = ""



class IntegrationPortHealthItem(BaseModel):
    port_id: str
    last_test: Optional[IntegrationPortTestResultPayload] = None



class FormCatalogAnchorItem(BaseModel):
    region: str = "any"
    any_of: list[str] = Field(default_factory=list)



class FormCatalogMapsTo(BaseModel):
    tax_type: Optional[str] = None
    slot_label: Optional[str] = None
    category: Optional[str] = None
    required: Optional[bool] = None
    type_id: Optional[str] = None



class DocumentTypeFlagsItem(BaseModel):
    ocr: bool = False
    dashboard: bool = False
    alert: bool = False



class DocumentTypeCatalogItem(BaseModel):
    enabled: bool = False
    default_period_key: Optional[str] = None
    sort_fields: list[Dict[str, str]] = Field(default_factory=list)
    metrics: Dict[str, str] = Field(default_factory=dict)



class DocumentTypeItem(BaseModel):
    id: str
    label: str
    flags: DocumentTypeFlagsItem = Field(default_factory=DocumentTypeFlagsItem)
    catalog: DocumentTypeCatalogItem = Field(default_factory=DocumentTypeCatalogItem)



class DocumentTypeListPayload(BaseModel):
    version: int
    type_count: int
    config_path: str
    types: list[DocumentTypeItem]



class DocumentCategoryFormRef(BaseModel):
    form_id: str
    label_ja: str



class DocumentCategoryItem(BaseModel):
    id: str
    label: str
    group: str = ""
    type_id: Optional[str] = None
    form_count: int = 0
    forms: list[DocumentCategoryFormRef] = Field(default_factory=list)



class DocumentCategoryListPayload(BaseModel):
    version: int
    category_count: int
    config_path: str
    categories: list[DocumentCategoryItem]
    unmatched: list[DocumentCategoryFormRef] = Field(default_factory=list)
    unmatched_count: int = 0



class FormCatalogPageScan(BaseModel):
    skip_in_package: bool = False
    continuation: bool = True



class FormCatalogFormItem(BaseModel):
    form_id: str
    label_ja: str
    role: str = "body"
    maps_to: FormCatalogMapsTo = Field(default_factory=FormCatalogMapsTo)
    anchors: list[FormCatalogAnchorItem] = Field(default_factory=list)
    must_not: list[str] = Field(default_factory=list)
    page_scan: FormCatalogPageScan = Field(default_factory=FormCatalogPageScan)
    filename_hints: list[str] = Field(default_factory=list)
    notes: str = ""



class FormCatalogListPayload(BaseModel):
    version: int
    form_count: int
    config_path: str
    max_scan_pages: int
    forms: list[FormCatalogFormItem]



class FormCatalogExportPayload(BaseModel):
    version: int
    form_count: int
    yaml_text: str



class FormCatalogValidateBody(BaseModel):
    yaml_text: str



class FormCatalogValidatePayload(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    version: Optional[int] = None
    form_count: Optional[int] = None



class FormCatalogImportBody(BaseModel):
    yaml_text: str
    mode: str = "merge"



class FormCatalogImportPayload(BaseModel):
    version: int
    form_count: int
    message: str



class FormCatalogReloadPayload(BaseModel):
    version: int
    form_count: int
    message: str



class FormCatalogReorderBody(BaseModel):
    form_ids: list[str] = Field(default_factory=list)


class FormCatalogWriteBody(BaseModel):
    form_id: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    role: str = "body"
    maps_to: Optional[FormCatalogMapsTo] = None
    anchors: list[FormCatalogAnchorItem] = Field(default_factory=list)
    must_not: list[str] = Field(default_factory=list)
    page_scan: Optional[FormCatalogPageScan] = None
    filename_hints: list[str] = Field(default_factory=list)
    notes: str = ""



class FormCatalogTextMarkerItem(BaseModel):
    id: Optional[str] = None
    phrase: str = Field(..., min_length=1)
    region: str = "any"
    note: str = ""



class FormCatalogPageAnnotationBody(BaseModel):
    id: Optional[str] = None
    page: int = Field(..., ge=1)
    form_name: str = Field(..., min_length=1)
    form_id: Optional[str] = None
    slot_label: Optional[str] = None
    tax_type: Optional[str] = None
    is_cover: bool = False
    markers: list[FormCatalogTextMarkerItem] = Field(default_factory=list)
    exclude_phrases: list[str] = Field(default_factory=list)
    notes: str = ""



class FormCatalogSampleItem(BaseModel):
    id: str
    original_filename: str
    page_count: int
    uploaded_at: str
    notes: str = ""
    annotations: list[dict] = Field(default_factory=list)



class FormCatalogSampleListPayload(BaseModel):
    sample_count: int
    annotation_count: int
    samples: list[FormCatalogSampleItem]
    presets: list[dict] = Field(default_factory=list)
    slot_options: list[dict] = Field(default_factory=list)



class FormCatalogSampleCoverageItem(BaseModel):
    form_id: str
    label_ja: str
    configured: bool = False
    sample_count: int = 0
    annotation_count: int = 0
    last_uploaded_at: Optional[str] = None


class FormCatalogSampleCoveragePayload(BaseModel):
    form_count: int
    configured_count: int
    items: list[FormCatalogSampleCoverageItem] = Field(default_factory=list)


class FormCatalogCompilePayload(BaseModel):
    forms_updated: int
    form_ids: list[str] = Field(default_factory=list)
    learning_summary: list[str] = Field(default_factory=list)
    prompt_preview: str = ""



class FormCatalogPromptPreviewPayload(BaseModel):
    prompt_preview: str
    annotation_count: int
    sample_count: int


class AiPromptDefinitionItem(BaseModel):
    key: str
    template: str
    source: str
    variables: list[str] = Field(default_factory=list)
    builtin_default: str = ""


class AiPromptListPayload(BaseModel):
    prompts: list[AiPromptDefinitionItem] = Field(default_factory=list)


class AiPromptUpdateBody(BaseModel):
    template: str
    scope: str = "firm"


class AiPromptTestResultPayload(BaseModel):
    key: str
    engine: str
    prompt_used: str
    text_excerpt: str = ""
    raw_response: Optional[Any] = None
    parsed: Optional[Any] = None
    error: Optional[str] = None



class LegalMasterEntryItem(BaseModel):
    id: str
    domain: str
    master_key: str
    label_ja: str
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    jurisdiction: Optional[str] = None
    valid_from: str
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    attributes: Optional[Any] = None
    master_version_id: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""



class LegalMasterWriteBody(BaseModel):
    domain: str = Field(..., min_length=1)
    master_key: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    jurisdiction: Optional[str] = None
    valid_from: str = Field(..., min_length=1)
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    attributes: Optional[dict] = None
    master_version_id: Optional[str] = None



class LegalMasterListPayload(BaseModel):
    entry_count: int
    db_path: str
    domains: List[dict]
    entries: List[LegalMasterEntryItem]



class LegalMasterCsvExportPayload(BaseModel):
    entry_count: int
    csv_text: str



class LegalMasterCsvValidateBody(BaseModel):
    csv_text: str = Field(..., min_length=1)



class LegalMasterCsvValidatePayload(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    row_count: int = 0



class LegalMasterCsvImportBody(BaseModel):
    csv_text: str = Field(..., min_length=1)
    mode: str = Field(default="merge", pattern="^(replace|merge)$")



class LegalMasterRatePayload(BaseModel):
    master_key: str
    as_of: str
    value: Any = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    valid_from: str
    valid_to: Optional[str] = None
    master_version_id: Optional[str] = None
    jurisdiction: Optional[str] = None
    label_ja: Optional[str] = None



class LegalMasterNtaPreviewBody(BaseModel):
    template: str = Field(default="income_tax_speed_table", pattern="^(income_tax_speed_table)$")
    url: Optional[str] = None
    text: Optional[str] = None
    valid_from: str = Field(..., min_length=1)
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    jurisdiction: Optional[str] = None



class LegalMasterNtaPreviewPayload(BaseModel):
    template: str
    source: str
    entries: List[LegalMasterWriteBody] = Field(default_factory=list)
    csv_text: str = ""
    warnings: List[str] = Field(default_factory=list)



class WithholdingTableSummary(BaseModel):
    table_type: str
    label_ja: str
    year_label: str = ""
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    source_url: Optional[str] = None
    row_count: int = 0


class WithholdingMonthlyPayload(BaseModel):
    tables: List[WithholdingTableSummary] = Field(default_factory=list)
    table: Optional[Dict[str, Any]] = None


class WithholdingLookupPayload(BaseModel):
    salary: int
    dependents: int
    kind: str
    tax: int
    method: str
    valid_from: Optional[str] = None
    year_label: Optional[str] = None



class CorporateTaxRatePayload(BaseModel):
    table: Optional[Dict[str, Any]] = None


class CorporateTaxCalcPayload(BaseModel):
    taxable_income: int
    fiscal_year_start: str
    small_business: bool
    excluded_business: bool
    reduced_rate: Optional[float] = None
    standard_rate: float
    threshold: int
    reduced_portion: int
    standard_portion: int
    tax: int
    valid_from: Optional[str] = None


class RefTableSummary(BaseModel):
    id: str
    label_ja: str
    category: str = ""
    unit: str = ""
    source_law: Optional[str] = None
    source_url: Optional[str] = None
    version_count: int = 0
    latest_valid_from: Optional[str] = None


class RefTableListPayload(BaseModel):
    tables: List[RefTableSummary] = Field(default_factory=list)


class RefTableDetailPayload(BaseModel):
    table: Optional[Dict[str, Any]] = None


class RefTableRowUpsertBody(BaseModel):
    valid_from: str = Field(..., description="対象バージョンの valid_from (YYYY-MM-DD)")
    match_key: str = Field("prefecture_code", description="upsert の照合キー")
    row: Dict[str, Any] = Field(..., description="追加・更新する行")


class SimplifiedConsumptionCalcBody(BaseModel):
    tax_by_type: Dict[int, float] = Field(default_factory=dict)
    unclassified_tax: float = 0.0
    unclassified_types: Optional[List[int]] = None
    as_of: Optional[str] = None


class DefenseSurtaxCalcBody(BaseModel):
    corporate_tax_amount: int = Field(..., ge=0)
    as_of: str



class MetricMappingItem(BaseModel):
    metric_key: str
    label_ja: str
    field_id: str
    account_code: str = ""
    account_name: str = ""
    slot_id: str = ""
    period_key: str = ""
    document_label: str = ""
    status: str = "planned"
    notes: str = ""



class MetricMappingWriteBody(BaseModel):
    metric_key: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    field_id: str = Field(..., min_length=1)
    account_code: str = ""
    account_name: str = ""
    slot_id: str = ""
    period_key: str = ""
    document_label: str = ""
    status: str = "planned"
    notes: str = ""



class MetricMappingsListPayload(BaseModel):
    version: int
    mapping_count: int
    config_path: str
    mappings: List[MetricMappingItem]



class MetricMappingsExportPayload(BaseModel):
    version: int
    mapping_count: int
    yaml_text: str
    csv_text: str



class MetricMappingsValidateBody(BaseModel):
    yaml_text: Optional[str] = None
    csv_text: Optional[str] = None



class MetricMappingsImportBody(BaseModel):
    yaml_text: Optional[str] = None
    csv_text: Optional[str] = None
    mode: str = Field(default="merge", pattern="^(replace|merge)$")



class MaAssumptionsBody(BaseModel):
    planning_avg_clients_per_firm: int | None = None
    avg_clients_mode: str | None = None



class DriveStatusPayload(BaseModel):
    google_drive_connected: bool = False
    drive_root_folder_id: Optional[str] = None
    drive_credentials_configured: bool = False
    drive_mode: str = "unconfigured"
    service_account_email: Optional[str] = None
    auth_method: str = "none"
    connected_email: Optional[str] = None
    oauth_available: bool = False
    root_location: str = "none"
    shared_drive_id: Optional[str] = None
    shared_drive_name: Optional[str] = None
    office_visible: bool = False
    needs_office_share: bool = False
    shared_member_emails: List[str] = Field(default_factory=list)
    eligible_member_emails: List[str] = Field(default_factory=list)
    eligible_member_count: int = 0
    office_hints: List[str] = Field(default_factory=list)



class DriveOAuthStartPayload(BaseModel):
    authorize_url: str
    redirect_uri: str



class DriveSharedDriveItem(BaseModel):
    id: str
    name: str = ""



class DriveSharedDrivesPayload(BaseModel):
    drives: List[DriveSharedDriveItem] = Field(default_factory=list)
    empty_hint: Optional[str] = None
    connected_email: Optional[str] = None



class DriveUseSharedDriveBody(BaseModel):
    shared_drive_id: str



class DriveShareFirmPayload(BaseModel):
    ok: bool = True
    mode: str = "member_emails"
    shared: List[str] = Field(default_factory=list)
    already: List[str] = Field(default_factory=list)
    failed: List[dict] = Field(default_factory=list)
    domain: Optional[str] = None
    message: str = ""
    root_folder_id: Optional[str] = None
    eligible_member_emails: List[str] = Field(default_factory=list)
    tip: Optional[str] = None



class MoneytreeStatusPayload(BaseModel):
    configured: bool
    mock_mode: bool
    connected: bool
    guest_label: Optional[str] = None
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    accounts_count: int = 0
    environment: str = "staging"
    vault_url: Optional[str] = None
    client_id_scope: Optional[str] = None



class MoneytreeConnectPayload(BaseModel):
    mock: bool
    authorize_url: Optional[str] = None
    state: Optional[str] = None



class MoneytreeSyncPayload(BaseModel):
    accounts_synced: int
    transactions_synced: int
    synced_at: str



class MoneytreeFirmClientStatusItem(BaseModel):
    client_id: str
    connected: bool
    guest_label: Optional[str] = None
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    accounts_count: int = 0



class MoneytreeFirmStatusPayload(BaseModel):
    clients: list[MoneytreeFirmClientStatusItem]



class SlotDocumentItem(BaseModel):
    id: str
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None
    original_name: str
    page_count: Optional[int] = None
    content_sha256: str
    byte_size: int
    uploaded_by: Optional[str] = None
    uploaded_at: str
    logical_document_id: Optional[str] = None
    current_version_id: Optional[str] = None
    current_version_label: Optional[str] = None
    workflow_status: Optional[str] = None
    docugrid_document_id: Optional[str] = None
    logical_status: Optional[str] = None
    classify_metadata: Optional[dict] = None
    google_drive_file_id: Optional[str] = None
    version_count: Optional[int] = None
    normalize_result: Optional[dict] = None
    ocr_job_id: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_from_slot_id: Optional[str] = None
    deleted_from_slot_label: Optional[str] = None
    client_shared_at: Optional[str] = None
    client_shared_by: Optional[str] = None
    contains_individual_number: bool = False
    spi_retention_until: Optional[str] = None
    content_type: Optional[str] = None
    is_pdf: bool = True
    is_convertible_image: bool = False



class DocumentVersionItem(BaseModel):
    id: str
    logical_document_id: str
    version_label: str
    content_sha256: str
    byte_size: int
    page_count: Optional[int] = None
    original_name: str
    source: str
    parent_version_id: Optional[str] = None
    created_by_stakeholder_id: Optional[str] = None
    created_by_email: Optional[str] = None
    created_at: str
    content_type: Optional[str] = None
    is_pdf: bool = True
    is_convertible_image: bool = False



class ReviewEventCreate(BaseModel):
    client_id: str
    period_key: str
    slot_id: str
    content_sha256: Optional[str] = None
    version_label: Optional[str] = None
    event_type: str
    status: Optional[str] = None
    action_title: Optional[str] = None
    reason: Optional[str] = None
    is_major: bool = False
    logical_document_id: Optional[str] = None
    document_version_id: Optional[str] = None
    detail: Optional[str] = None



class ReviewEventBatchCreate(BaseModel):
    events: List[ReviewEventCreate]



class ReviewEventItem(BaseModel):
    id: str
    client_id: str
    period_key: str
    slot_id: str
    content_sha256: Optional[str] = None
    version_label: Optional[str] = None
    event_type: str
    status: Optional[str] = None
    action_title: Optional[str] = None
    reason: Optional[str] = None
    actor_stakeholder_id: Optional[str] = None
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    is_major: bool = False
    created_at: str
    logical_document_id: Optional[str] = None
    document_version_id: Optional[str] = None
    detail: Optional[str] = None

class ReviewTimelineItem(ReviewEventItem):
    slot_label: Optional[str] = None



class ExtractionApplyBody(BaseModel):
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None
    fields: dict[str, str]


class ExtractionDraftBody(BaseModel):
    """OCR 手動修正の状態保存（顧客マスタには触れない）。"""

    client_id: str
    period_key: str
    slot_id: str
    fields: dict[str, str] = {}
    edited_ids: list[str] = []



class DocumentTemplateUpdateBody(BaseModel):
    templateName: str = "標準顧客納品用パッケージ"
    sortOrder: List[str] = []



class AuthoringTemplateCreateBody(BaseModel):
    title: str
    body: str
    description: str = ""
    category: str = "general"
    scope: str = "local"  # local | global



class AuthoringTemplateUpdateBody(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None



class AuthoringTemplateParseBody(BaseModel):
    body: str



class AuthoringPartyBinding(BaseModel):
    slot: int = Field(default=1, ge=1, le=9)
    client_id: str


class AuthoringTemplateRenderBody(BaseModel):
    client_id: str
    values: Optional[Dict[str, str]] = None
    parties: Optional[List[AuthoringPartyBinding]] = None


class AuthoringTemplateRenderAdhocBody(BaseModel):
    client_id: str
    body: str
    values: Optional[Dict[str, str]] = None
    parties: Optional[List[AuthoringPartyBinding]] = None



class AuthoringExportPdfBody(BaseModel):
    client_id: str
    title: str
    body: str



class ReviewChecklistReturnAnchorBody(BaseModel):
    documentType: str = ""
    slotId: str = ""
    scheduleRef: str = ""
    keywords: List[str] = Field(default_factory=list)



class ReviewChecklistItemBody(BaseModel):
    id: Optional[str] = None
    label: str
    description: str = ""
    category: str = "一般"
    sortOrder: int = 0
    returnAnchor: Optional[ReviewChecklistReturnAnchorBody] = None
    alertRule: str = "presence_in_return"



class ReviewChecklistTemplateBody(BaseModel):
    title: str
    description: str = ""
    periodTypes: List[str] = Field(default_factory=lambda: ["year"])
    sections: Optional[List[Dict[str, object]]] = None
    items: List[ReviewChecklistItemBody] = Field(default_factory=list)



class ReviewChecklistChecksBody(BaseModel):
    client_id: str
    period_key: str
    template_id: Optional[str] = None
    checks: Dict[str, Dict[str, object]] = Field(default_factory=dict)
    header: Optional[Dict[str, str]] = None
    itemStates: Optional[Dict[str, Dict[str, object]]] = None
    workflowStatus: Optional[str] = None
    circulationMemo: Optional[str] = None



class ReviewChecklistCreateBody(BaseModel):
    title: str
    description: str = ""
    periodTypes: List[str] = Field(default_factory=lambda: ["year"])
    sourceTemplateId: Optional[str] = None
    sections: Optional[List[Dict[str, object]]] = None



class ReviewChecklistDefaultBody(BaseModel):
    template_id: str



class ReviewChecklistExportPdfBody(BaseModel):
    client_id: str
    period_key: str
    template_id: Optional[str] = None



class OcrJobCreateBody(BaseModel):
    client_id: str
    document_version_id: str
    period_key: Optional[str] = None
    slot_id: Optional[str] = None
    slot_label: Optional[str] = None
    force: bool = False

__all__ = [
    "AuditEventItem",
    "AuditLink",
    "AuditPoint",
    "AuthConfigResponse",
    "AiPromptDefinitionItem",
    "AiPromptListPayload",
    "AiPromptTestResultPayload",
    "AiPromptUpdateBody",
    "AuthoringExportPdfBody",
    "AuthoringPartyBinding",
    "AuthoringTemplateCreateBody",
    "AuthoringTemplateParseBody",
    "AuthoringTemplateRenderAdhocBody",
    "AuthoringTemplateRenderBody",
    "AuthoringTemplateUpdateBody",
    "AutoLinkMatchedCoordinate",
    "AutoLinkRequest",
    "AutoLinkResponse",
    "AutoVouchStampItem",
    "BillingAiTopupBody",
    "MigrationPendingConfirmBody",
    "MigrationPendingBatchConfirmBody",
    "MigrationPendingReclassifyBody",
    "MigrationWalletGrantBody",
    "BillingCheckoutBody",
    "BillingPartnerAttachBody",
    "BillingPartnerCreateBody",
    "BillingPortalBody",
    "CaptureAnalyzeBody",
    "CaptureApplyPayrollBody",
    "CaptureItemPatchBody",
    "CaptureReauditBody",
    "CaptureRouteBody",
    "ClientCalendarEventBody",
    "ClientKarteEntryBody",
    "ClientCommThreadBody",
    "ClientMasterClient",
    "ClientMasterGroup",
    "ClientMasterRelation",
    "ClientMasterPayload",
    "ClientMetricUpsertBody",
    "ClientRecordItemBody",
    "ClientSimulationBody",
    "DocumentTemplateUpdateBody",
    "DocumentVersionItem",
    "DriveStatusPayload",
    "DriveOAuthStartPayload",
    "DriveSharedDriveItem",
    "DriveSharedDrivesPayload",
    "DriveUseSharedDriveBody",
    "DriveShareFirmPayload",
    "ExtractionApplyBody",
    "ExtractionDraftBody",
    "FileInfo",
    "FirmClientTaskSummary",
    "FirmJoinRequestBody",
    "FirmMemberInviteBody",
    "FirmMemberItem",
    "FirmMemberPatchBody",
    "FirmRegisterBody",
    "FirmStaffTaskSummary",
    "FirmTaskAssignee",
    "FirmTaskItem",
    "FirmTasksResponse",
    "FormCatalogAnchorItem",
    "FormCatalogCompilePayload",
    "FormCatalogExportPayload",
    "FormCatalogFormItem",
    "FormCatalogImportBody",
    "FormCatalogImportPayload",
    "DocumentTypeCatalogItem",
    "DocumentTypeFlagsItem",
    "DocumentTypeItem",
    "DocumentTypeListPayload",
    "DocumentCategoryFormRef",
    "DocumentCategoryItem",
    "DocumentCategoryListPayload",
    "FormCatalogListPayload",
    "FormCatalogMapsTo",
    "FormCatalogPageAnnotationBody",
    "FormCatalogPageScan",
    "FormCatalogPromptPreviewPayload",
    "FormCatalogReloadPayload",
    "FormCatalogReorderBody",
    "FormCatalogSampleItem",
    "FormCatalogSampleListPayload",
    "FormCatalogSampleCoverageItem",
    "FormCatalogSampleCoveragePayload",
    "FormCatalogTextMarkerItem",
    "FormCatalogValidateBody",
    "FormCatalogValidatePayload",
    "FormCatalogWriteBody",
    "GoogleLoginRequest",
    "IntegrationPortHealthItem",
    "IntegrationPortItem",
    "IntegrationPortSamplePayload",
    "IntegrationPortTestBody",
    "IntegrationPortTestResultPayload",
    "IntegrationPortWriteBody",
    "IntegrationPortsExportPayload",
    "IntegrationPortsImportBody",
    "IntegrationPortsImportPayload",
    "IntegrationPortsListPayload",
    "IntegrationPortsReloadPayload",
    "IntegrationPortsValidateBody",
    "IntegrationPortsValidatePayload",
    "InvoiceVerifyBody",
    "LegalMasterCsvExportPayload",
    "LegalMasterCsvImportBody",
    "LegalMasterCsvValidateBody",
    "LegalMasterCsvValidatePayload",
    "LegalMasterEntryItem",
    "LegalMasterListPayload",
    "LegalMasterNtaPreviewBody",
    "LegalMasterNtaPreviewPayload",
    "LegalMasterRatePayload",
    "LegalMasterWriteBody",
    "WithholdingTableSummary",
    "WithholdingMonthlyPayload",
    "WithholdingLookupPayload",
    "CorporateTaxRatePayload",
    "CorporateTaxCalcPayload",
    "RefTableSummary",
    "RefTableListPayload",
    "RefTableDetailPayload",
    "RefTableRowUpsertBody",
    "SimplifiedConsumptionCalcBody",
    "DefenseSurtaxCalcBody",
    "LoginRequest",
    "MaAssumptionsBody",
    "McpTokenResponse",
    "MeResponse",
    "ClientTransferCreateBody",
    "ClientTransferClaimBody",
    "MetricMappingItem",
    "MetricMappingWriteBody",
    "MetricMappingsExportPayload",
    "MetricMappingsImportBody",
    "MetricMappingsListPayload",
    "MetricMappingsValidateBody",
    "MoneytreeConnectPayload",
    "MoneytreeFirmClientStatusItem",
    "MoneytreeFirmStatusPayload",
    "MoneytreeStatusPayload",
    "MoneytreeSyncPayload",
    "OcrJobCreateBody",
    "PayrollEmployeeItem",
    "PayrollEmployeesPayload",
    "ReviewChecklistChecksBody",
    "ReviewChecklistCreateBody",
    "ReviewChecklistDefaultBody",
    "ReviewChecklistExportPdfBody",
    "ReviewChecklistItemBody",
    "ReviewChecklistReturnAnchorBody",
    "ReviewChecklistTemplateBody",
    "ReviewEventBatchCreate",
    "ReviewEventCreate",
    "ReviewEventItem",
    "ReviewTimelineItem",
    "RolePermissionsPayload",
    "SanteiRunBody",
    "ScreenDesignSaveBody",
    "SlotDocumentItem",
    "StakeholderMasterPayload",
    "SystemConfigPayload",
    "SystemConfigUpdateBody",
    "TokenResponse",
    "WithholdingLedgerPayload",
    "WithholdingLedgerRowItem",
    "YearEndRunBody",
]
