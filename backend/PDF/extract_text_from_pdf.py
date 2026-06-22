import fitz  # PyMuPDF
import os
from datetime import date

# --- 設定 ---
# テキストを抽出したいPDFファイルの名前を指定してください
input_filename = "report.pdf"
# --- 設定ここまで ---

# 今日の日付と元のファイル名を取得
today_str = date.today().strftime("%Y%m%d")
base_name, _ = os.path.splitext(input_filename)

# 新しい命名規則で出力ファイル名を生成
output_filename = f"{base_name}_text_{today_str}.txt"

# 入力ファイルが存在するか確認
if not os.path.exists(input_filename):
    print(f"エラー: 入力ファイル '{input_filename}' が見つかりません。")
else:
    # PDFファイルを開く
    doc = fitz.open(input_filename)
    
    full_text = ""
    # 全てのページからテキストを抽出
    for page_num, page in enumerate(doc):
        full_text += page.get_text()
        full_text += "\n--- Page {} ---\n".format(page_num + 1)
    
    doc.close()

    # 抽出したテキストをテキストファイルに書き出す
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(full_text)
    
    print(f"テキストの抽出が完了し、'{output_filename}' として保存しました。")