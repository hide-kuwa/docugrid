import fitz  # PyMuPDF
import os
from datetime import date

# --- 設定 ---
# 処理したいPDFファイルの名前を指定してください
input_filename = "input.pdf"
# ハイライトしたいキーワードを指定してください
search_text = "ハイライトしたい単語"
# --- 設定ここまで ---

# 今日の日付と元のファイル名を取得
today_str = date.today().strftime("%Y%m%d")
base_name, _ = os.path.splitext(input_filename)

# 新しい命名規則で出力ファイル名を生成
output_filename = f"{base_name}_highlighted_{today_str}.pdf"

# 入力ファイルが存在するか確認
if not os.path.exists(input_filename):
    print(f"エラー: 入力ファイル '{input_filename}' が見つかりません。")
else:
    # PDFファイルを開く
    doc = fitz.open(input_filename)
    highlight_count = 0

    print(f"'{search_text}' を検索してハイライトを追加します...")

    # 全てのページをループしてテキストを検索
    for page in doc:
        # テキストが見つかった全ての場所を取得
        text_instances = page.search_for(search_text)
        # 見つかった各テキストにハイライト注釈を追加
        for inst in text_instances:
            highlight = page.add_highlight_annot(inst)
            highlight.update()  # 注釈の適用
            highlight_count += 1
    
    if highlight_count > 0:
        # 変更を新しいファイルに保存
        doc.save(output_filename, garbage=4, deflate=True, clean=True)
        print(f"合計 {highlight_count} 箇所にハイライトを追加し、'{output_filename}' として保存しました。")
    else:
        print(f"ハイライト対象のテキスト '{search_text}' が見つかりませんでした。")

    doc.close()