from pypdf import PdfReader, PdfWriter
import os
from datetime import date

# --- 設定 ---
# 処理したいPDFファイルの名前を指定してください
input_filename = "input.pdf"
# --- 設定ここまで ---

# 今日の日付を YYYYMMDD 形式で取得
today_str = date.today().strftime("%Y%m%d")

# 元のファイル名から拡張子を除いた部分を取得
base_name, _ = os.path.splitext(input_filename)

# 新しい命名規則で出力ファイル名を生成
output_filename = f"{base_name}_reordered_{today_str}.pdf"

# 入力ファイルが存在するか確認
if not os.path.exists(input_filename):
    print(f"エラー: 入力ファイル '{input_filename}' が見つかりません。")
else:
    # PDFファイルを読み込む
    reader = PdfReader(input_filename)
    writer = PdfWriter()

    # ページの総数を確認
    num_pages = len(reader.pages)
    
    if num_pages >= 2:
        print("1ページ目と2ページ目を入れ替えます。")
        # 最初に2ページ目を追加
        writer.add_page(reader.pages[1])
        # 次に1ページ目を追加
        writer.add_page(reader.pages[0])

        # 3ページ目以降があれば順番通りに追加
        if num_pages > 2:
            for i in range(2, num_pages):
                writer.add_page(reader.pages[i])

        # 新しいPDFファイルとして書き出す
        with open(output_filename, "wb") as f:
            writer.write(f)
        print(f"ページの並べ替えが完了し、'{output_filename}' として保存しました。")
    else:
        print("ページ数が2ページ未満のため、並べ替え処理は行いませんでした。")