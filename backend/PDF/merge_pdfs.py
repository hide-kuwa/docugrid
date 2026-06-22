from pypdf import PdfWriter
import os
from datetime import date

# --- 設定 ---
# 結合したいPDFのファイル名を、まとめたい順番で指定してください
input_files = ["document_part1.pdf", "document_part2.pdf", "appendix.pdf"]
# --- 設定ここまで ---

# 今日の日付を取得
today_str = date.today().strftime("%Y%m%d")
# 出力ファイル名を生成
output_filename = f"merged_document_{today_str}.pdf"

merger = PdfWriter()

# 入力ファイルが存在するか確認しながら結合リストに追加
valid_files_found = False
for pdf_file in input_files:
    if os.path.exists(pdf_file):
        merger.append(pdf_file)
        print(f"'{pdf_file}' を結合リストに追加しました。")
        valid_files_found = True
    else:
        print(f"警告: ファイル '{pdf_file}' が見つかりませんでした。スキップします。")

# 1つでも有効なファイルがあった場合のみ処理を実行
if valid_files_found:
    # 結合したPDFを新しいファイルに書き出す
    with open(output_filename, "wb") as f:
        merger.write(f)
    print(f"\nPDFの結合が完了し、'{output_filename}' として保存しました。")
else:
    print("\nエラー: 結合できるPDFファイルが1つも見つかりませんでした。")

merger.close()