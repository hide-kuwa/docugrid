from pypdf import PdfReader, PdfWriter
import os
from datetime import date

# --- 設定 ---
# 回転させたいPDFファイルの名前を指定してください
input_filename = "scanned_document.pdf"
# 回転させる角度（90, 180, 270など）を指定してください
rotation_angle = 90
# --- 設定ここまで ---

# 今日の日付と元のファイル名を取得
today_str = date.today().strftime("%Y%m%d")
base_name, _ = os.path.splitext(input_filename)

# 新しい命名規則で出力ファイル名を生成
output_filename = f"{base_name}_rotated_{today_str}.pdf"

# 入力ファイルが存在するか確認
if not os.path.exists(input_filename):
    print(f"エラー: 入力ファイル '{input_filename}' が見つかりません。")
else:
    reader = PdfReader(input_filename)
    writer = PdfWriter()

    # 全てのページをループして回転させる
    for page in reader.pages:
        # 指定した角度だけ時計回りに回転
        page.rotate(rotation_angle)
        writer.add_page(page)

    # 回転させたページを新しいファイルに書き出す
    with open(output_filename, "wb") as f:
        writer.write(f)
        
    print(f"全ページを {rotation_angle} 度回転させ、'{output_filename}' として保存しました。")