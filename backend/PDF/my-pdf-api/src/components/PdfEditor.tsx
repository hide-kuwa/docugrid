import dynamic from 'next/dynamic';

// PdfEditorClientコンポーネントをダイナミックにインポートする
// ssr: false というオプションが最重要！
const PdfEditorClient = dynamic(
  () => import('@/components/PdfEditor.client'),
  { 
    // ssr: false は「サーバーサイドでは絶対にレンダリングしないでね」という意味
    ssr: false,
    // 読み込み中に表示するローディング画面
    loading: () => <p className="text-white">エディターを読み込んでいます...</p>
  }
);

// エクスポートするのは、このダイナミックローダー
export default function PdfEditor() {
  return <PdfEditorClient />;
}