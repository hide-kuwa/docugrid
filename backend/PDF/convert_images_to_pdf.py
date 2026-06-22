from PIL import Image
import os
from datetime import date

# --- 設定 ---
# PDFにしたい画像ファイルの名前を順番に指定してください
image_filenames = ["image1.jpg", "image2.jpg"]
# --- 設定ここまで ---

# 今日の日付を取得
today_str = date.today().strftime("%Y%m%d")

# 新しい命名規則で出力ファイル名を生成
output_pdf_name = f"images_to_pdf_{today_str}.pdf"

images_to_convert = []
valid_image_paths = []

# 存在する画像ファイルのみをリストアップ
for filename in image_filenames:
    if os.path.exists(filename):
        valid_image_paths.append(filename)
    else:
        print(f"警告: 画像ファイル '{filename}' が見つかりません。")

if not valid_image_paths:
    print("エラー: 変換対象の画像ファイルが1つも見つかりませんでした。")
else:
    # 最初の画像を開く
    first_image = Image.open(valid_image_paths[0])
    # カラーモードがRGBAの場合、RGBに変換
    if first_image.mode == 'RGBA':
        first_image = first_image.convert('RGB')
    
    # 2枚目以降の画像を開いてリストに追加
    for image_path in valid_image_paths[1:]:
        img = Image.open(image_path)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        images_to_convert.append(img)
    
    # PDFとして保存
    first_image.save(
        output_pdf_name, 
        "PDF", 
        resolution=100.0, 
        save_all=True, 
        append_images=images_to_convert
    )
    print(f"{len(valid_image_paths)}枚の画像を '{output_pdf_name}' として保存しました。")