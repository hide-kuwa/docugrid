# よくあるバグ・情報漏洩の原因と再発防止

最終更新: 2026-07-13（初版）

このリポジトリ（DocuGrid）で実際に踏んだ／踏みやすい不具合・情報漏洩の原因を、**再発させないためのルール**としてまとめる。新機能・修正・レビュー時に該当箇所を確認すること。

関連: [`security-checklist.md`](security-checklist.md)、[`document-taxonomy.md`](document-taxonomy.md)、[`auth-tenancy-design.md`](auth-tenancy-design.md)、[`storage-and-sqlite.md`](storage-and-sqlite.md)、[`../AGENTS.md`](../AGENTS.md)

---

## 0. 大原則（これだけは必ず）

1. **フロントのフィルタは UX のみ。境界は常にサーバーで判定する。**
2. すべてのクエリ／変更で、JWT の `firm_id` とリソースの `firm_id` が一致することを確認する。
3. 顧問先スコープ API は `client_id` を解決してから `authorize_client_access`。
4. IDOR 対策：`リソース → client → firm` を解決してから許可判定。
5. 秘密情報はコミットしない。本番はパスワードログインと旧 `/files` を無効化。

実装の中心：`backend/services/tenancy.py`、`backend/docugrid_auth.py`、`backend/api/deps.py`

---

## A. 情報漏洩を招きやすいパターン

| # | アンチパターン | あるべき対策 | 参照 |
|---|----------------|--------------|------|
| A-1 | フロントで一覧を絞っているから安全、とサーバー側チェックを省略 | 一覧・取得・更新の**すべて**でサーバー側 `firm_id` フィルタ | `visible_client_ids`、`tenancy.py` |
| A-2 | `GET /resource/{id}` で ID だけ見て所有者確認しない（IDOR） | `id → client_id → firm_id` を解決し `authorize_client_access` / `authorize_firm_resource` | `backend/services/tenancy.py` |
| A-3 | 共有マスタ（`client_master.json` 等）を PUT で全置換 | 自 firm の行のみマージ更新し、他 firm 行は保持 | `update_client_master` |
| A-4 | API キー・トークンを平文で保存／レスポンスに含める | サーバーで暗号化保存（Fernet）、画面には下4桁のみ | `backend/services/firm_settings.py` |
| A-5 | ログ・監査イベント・エラー本文に元ファイル名や機微情報を出す | 機微値はログに出さない（テストで `secret-co` 不在を検証） | `test_smoke.py::test_slot_document_permanent_delete_leaves_tombstone` |
| A-6 | 開発用の抜け道（`/files`、ヘッダ認証、パスワードログイン）を本番でも有効 | 本番 env で無効化。`validate_production_env.py` で検査 | `docs/production-deployment.md` |
| A-7 | 秘密鍵・`.env`・DB ファイルをコミット | `.gitignore` を確認。`storage/*.db`・`*.env*` はコミットしない | — |

新しい API を足すときは、**必ず既存の同種 API と同じ認可パターン**を踏襲する（独自実装しない）。

---

## B. バグを招きやすいパターン（実際に踏んだもの）

### B-1. テスト状態の汚染（共有ストレージ・固定ID）

**症状:** 単体では通るが全体実行で落ちる／逆。`assert 24 == 1` のように件数が合わない。

**原因:** テストが実ストレージ（`backend/storage/*.db`・`*.json`）に固定の `slot_id` / `client_id` / `period_key` で書き込み、過去実行分が残留する。あるいは、書き込みが本番ファイルに漏れて開発環境の設定まで壊す（例：`role_permissions.json` の operator 権限、`platform_ma_assumptions.json`）。

**ルール:**
- テストで作るリソースの ID は**実行ごとに一意**にする（`f"..._{uuid.uuid4().hex[:8]}"`）。
- 永続先を持つサービスは、fixture で**実際に読み書きするパス**を `tmp_path` に `monkeypatch` する。モジュール定数を直接持つものは要注意：
  - `services.ma_goals_service.ASSUMPTIONS_PATH`
  - `api.master_store.CLIENT_MASTER_PATH` / `services.tenancy.CLIENT_MASTER_PATH`
  - `services.*_service.STORAGE_DIR`、`*.DB_PATH`
- fixture 追加後、`Test-Path backend/storage/<該当ファイル>` で**本番ファイルが再生成されていない**ことを確認する。

参照: [`storage-and-sqlite.md`](storage-and-sqlite.md)

### B-2. monkeypatch のパッチ先ズレ

**症状:** `monkeypatch.setattr(...)` しているのに効かず、503／403／実サービス呼び出しになる。

**原因:** **定義元**をパッチしていて、**実際に参照される名前空間**をパッチしていない。

**ルール:** 「**使う側（lookup される側）**」をパッチする。
- ルートが `from services import stripe_billing_service as _stripe` して `_stripe.is_stripe_configured()` を呼ぶなら、パッチ対象は `services.stripe_billing_service.is_stripe_configured`（`api.application....` ではない）。
- リファクタで定数の所在が移ると旧パッチが死ぬ（例：`main.STORAGE_DIR` は廃止 → `api.routers.audit.STORAGE_DIR` を参照）。`AttributeError: module 'main' has no attribute 'STORAGE_DIR'` はこの兆候。

### B-3. `from __future__ import annotations` + typing 未 import

**症状:** import・起動は成功するのに、`/openapi.json`（Swagger UI・自動リロード）が **500**。

**原因:** 注釈が文字列評価に遅延され、`Dict[...]` 等を使っているのに `typing` から import していないと、**スキーマ生成時**に `PydanticUndefinedAnnotation: name 'Dict' is not defined` で落ちる。

**ルール:**
- Pydantic モデルで使う型（`Dict`・`List`・`Optional`・`Any` 等）は**必ず import**する。
- モデル追加・変更後は `python -c "from main import app; app.openapi()"` か `GET /openapi.json` が 200 かを確認する（起動確認だけでは検知できない）。

### B-4. dict リテラルの重複キー・None 上書きでキーが消える

**症状:** 期待するフィールドが出力から消える（例：`KeyError: 'schema_version'`）。

**原因:** 同じ辞書リテラル内でキーを二重定義し、後勝ちで `None` に上書き → 最後の `{k:v for ... if v is not None}` でキーごと消滅。

**ルール:** 辞書リテラルでキーを重複させない。「None を落とす」フィルタと組み合わせる場合は特に、定数フィールドが後段で上書きされていないか確認する。
参照: `backend/services/extracted_document_meta.py`

### B-5. リファクタによる呼び出しシグネチャのドリフト

**症状:** 本番コードに引数が増えたのにモック／呼び出し側が古く、`TypeError: <lambda>() got an unexpected keyword argument 'max_pages'` → ジョブが `failed`。

**原因:** 実装（`classify_pdf(..., max_pages=...)`、`extract_text_from_pdf(content, max_pages=...)`）の変更にテストのモック署名が追随していない。

**ルール:** 関数シグネチャを変えたら、**モック・呼び出し側・型**を同時に更新する。モックは実シグネチャに合わせて `max_pages=None` 等の受け口を持たせる。

### B-6. `datetime.utcnow()`（非推奨・タイムゾーン曖昧）

**症状:** `DeprecationWarning: datetime.datetime.utcnow() is deprecated`。将来の Python で削除。

**ルール:** 新規コードで `datetime.utcnow()` を使わない。挙動（naive・UTC・`isoformat()` に `+00:00` を付けない）を保つ置換は：

```python
from datetime import datetime, timezone

datetime.now(timezone.utc).replace(tzinfo=None)
```

`datetime.now(timezone.utc)`（aware）にすると、既存の naive 値との比較で `TypeError`、`isoformat()` の形式変化などの差分が出るため、既存フォーマットを保つ場合は `.replace(tzinfo=None)` を付ける。

### B-7. 稼働中サーバーの stale reload（実装は正しいのに 404/500）

**症状:** コードは正しいのに実サーバーが古い挙動（新ルートが 404、直前の編集で 500 のまま）。

**原因:** Windows の `--reload`（StatReload）が反映しきらない／JSON など**コード以外**のファイル変更は拾わない（`storage/*.json` を直しても稼働中プロセスのキャッシュは古いまま）。

**ルール:**
- ルート追加・`storage/*.json`（権限マスタ等）変更後は、**バックエンドをクリーン再起動**して反映を確認する。
- 8000 を掴んだままの旧プロセス（reloader/worker）は個別に停止してから起動する。
- 反映確認：新ルートは 404 でなく 401/200 を返すか、`GET /openapi.json` が 200 か。

---

## C. PR 前チェック（最低限）

```bash
# バックエンド：全テスト
cd backend && python -m pytest -q

# セキュリティ／テナント境界に触れたとき
cd backend && python -m pytest tests/test_security.py tests/test_tenancy.py -q

# スキーマ／ルートを触ったとき（OpenAPI が壊れていないか）
cd backend && python -c "from main import app; app.openapi(); print('openapi ok')"

# 本番 env を用意したとき
cd backend && python scripts/validate_production_env.py --env-file .env.production
```

確認観点：

- [ ] 追加/変更 API は既存と同じ認可パターン（`firm_id` / `authorize_*`）を踏襲したか
- [ ] 一覧・取得・更新の**すべて**でサーバー側スコープ判定があるか
- [ ] 機微情報（キー・元ファイル名）をログ・レスポンスに出していないか
- [ ] テストは一意 ID・`tmp_path` で hermetic か（本番 `storage/` を汚さないか）
- [ ] monkeypatch は**参照される側**をパッチしているか
- [ ] Pydantic の型 import 漏れがないか（`/openapi.json` 200）
- [ ] `datetime.utcnow()` を新規に増やしていないか
