# DocuGrid

> **TAXX** エコシステムの **資料整理アプリ**（本リポジトリ）。帳簿本体は別リポ [**税務会計システム**](https://github.com/hide-kuwa/accounting-ui)（リポ名 ccounting-ui）。命名は [docs/product-naming.md](docs/product-naming.md)。

## Vision (Why)

DocuGrid frees tax and audit teams from tedious **document organization** work.
Instead of traditional folder hierarchies, it visualizes all materials as a desk-like grid workspace, where documents can be collected, organized, merged, and processed intuitively before handing off to the **税務会計システム** and the broader **TAXX** cockpit.

## Product (What)

DocuGrid is a browser-based PDF freestyle editing and merging engine.
It removes file-level constraints and enables page-level operations across all uploaded documents in a single workspace.

## Core Features

- **Cross-file merging**
  - Expand pages from multiple PDFs into one large grid.
  - Reorder pages freely across files with drag and drop, then export as one consolidated PDF.
- **Smart annotation**
  - Open full-screen editor from thumbnails.
  - Store highlight coordinates as JSON metadata.
  - Burn annotations into PDFs as native, Acrobat-recognizable annotations during processing.
- **API-first architecture**
  - Frontend and backend are decoupled for future embedding as widgets or API integrations into other internal products/workflows.

## Target Architecture

- **Frontend (target)**: React, TypeScript, Vite, Tailwind CSS, @dnd-kit, react-pdf（長期目標は `docs/architecture.md` 参照）
- **Frontend (このリポジトリで動いているもの)**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI, PyMuPDF (fitz)
- **Transport**: JSON + `multipart/form-data`（ファイル）

## Current Repository Runtime (Now)

Current runnable path in this repository is:

- `frontend` (Next.js UI)
- `backend/main.py` (FastAPI PDF API)

`backend/core` is a separate track (auth/accounting API) and is not part of the default DocuGrid runtime path.

## Local Setup

既定の API ベース URL は **`http://localhost:8000/api`**（フロントの `src/config/api.ts` と `frontend/.env.local.example` と一致）。

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

開発用テスト（任意）:

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest
```

本番デプロイ時は `backend/.env.example` を参照し、最低限次を設定する:

- `DOCUGRID_ENV=production`
- `DOCUGRID_JWT_SECRET`（32文字以上のランダム文字列）
- `DOCUGRID_ALLOW_HEADER_AUTH=false`
- `DOCUGRID_LOGIN_PASSWORD`（デフォルト `password` から変更）

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# 必要なら .env.local で NEXT_PUBLIC_API_BASE を編集
npm install
npm run dev
```

ブラウザは `http://localhost:3000`（Next の既定ポート）。

### リポジトリルートから（任意）

```bash
npm install
npm run install:backend
npm run install:frontend
# ターミナルを分けて:
npm run dev:backend
npm run dev:frontend
```

`NEXT_PUBLIC_API_BASE` は `frontend/.env.local` で上書き可能（未設定時は上記 8000 を使用）。

## Development Direction

- Cross-file drag-and-drop and PyMuPDF-based highlight burn-in are already prototyped.
- Ongoing focus:
  1. Hardening code quality and reliability
  2. Improving UI/UX polish
  3. Preparing for OCR integration (for example, Tesseract)

## Documentation

- Architecture baseline: `docs/architecture.md`
- API contract (current runtime): `docs/api-contract.md`
- 手動スモーク手順: `docs/smoke-checklist.md`
- プロダクトロードマップ: `docs/roadmap.md`

## Testing

```bash
# リポジトリルート（推奨）
npm run test              # pytest + tsc
npm run test:backend      # backend/tests の pytest のみ
npm run test:frontend     # TypeScript 型チェックのみ
```

- **CI**: push / PR で GitHub Actions が `pytest` と `tsc --noEmit` を実行（`.github/workflows/ci.yml`）
- **手動**: リリース前は `docs/smoke-checklist.md` のブラウザ確認
