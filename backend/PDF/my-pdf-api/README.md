This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

バックエンド
cd C:\dev\PDF\my-pdf-api
uvicorn api.main:app --host 127.0.0.1 --port 3100
フロントエンド
cd C:\dev\PDF\my-pdf-api\pdf-merger-app
npm run dev

今後のやるべきこと
PDF 自動化システム 開発ロードマップ
システムの存在意義
「面倒なデータ入力をこの世から消し去り、会計業務の未来を創造する」
単なる PDF ツールではなく、書類を理解し、整理し、会計システムと連携する自律型・知的会計アシスタントを構築する。

フェーズ 1：AI に「目」を与える - 高機能 PDF ツールの完成
ゴール: アプリ単体で価値を提供する、強力な PDF 便利ツールを完成させる。

機能 1: OCR の実装

目的: スキャンしただけの画像 PDF に**「文字を読む能力」**を与える。

技術: Python バックエンドで Tesseract を使用。

成果物: PDF 内のテキスト検索やコピーを可能にする**「サーチャブル PDF」**を生成する機能。

フェーズ 2：AI に「分類能力」を与える - 自動タグ付け
ゴール: 書類の中身を AI が理解し、自動で分類できるようにする。

機能 2: 文書タイプの自動分類

目的: アップロードされた書類が「請求書」「領収書」「契約書」なのかを AI が自動で判断する。

技術: PDF から抽出したテキストを**大規模言語モデル（Gemini, GPT-4o）**に送信し、文書タイプを分析させる。

成果物: ファイル名やメタデータに自動でタグを付与し、整理を容易にする機能。

フェーズ 3：AI に「専門知識」を与える - データ自動抽出
ゴール: AI が会計の文脈を理解し、必要なデータだけを正確に抜き出せるようにする。

機能 3: 項目データの自動抽出

目的: 分類された書類から、仕訳や台帳登録に必要な情報をピンポイントで抽出する。

技術: 大規模言語モデルに対し、「この請求書から**『日付』『勘定科目』『金額』『摘要』**を抜き出して」といった、業務に特化した指示（プロンプト）を与える。

成果物: 会計システムに直接インポート可能な**構造化データ（JSON 形式など）**を生成する機能。

最終形態：AI に「指揮棒」を振らせる - 知的文書の指揮者
ゴール: 人間の思考を先回りし、最高の「洞察」を提供する究極のユーザー体験を実現する。

機能 4: 自動並べ替え＆自動ハイライト

目的: 勘定科目内訳書を元に、大量の証憑を全自動で並べ替え、さらに重要な箇所を自動でハイライトする。

技術:

AI が内訳書（スコア）と各証憑（楽譜）の内容を完全に理解。

AI の指示に基づき、Python が全 PDF の並べ替えとハイライト焼き付けを同時に実行。

フロントエンドでは、内訳書の項目をホバーすると、該当する証憑のハイライト箇所が即座に表示されるインタラクティブ UI を構築。

成果物: 人間が思考するまでもなく、システムが結論と根拠を同時に提示してくれる、未来の監査・レビュー体験。
