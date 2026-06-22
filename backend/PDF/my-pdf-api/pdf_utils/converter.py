from PIL import Image
import io
from typing import List

def convert_images_to_pdf(image_streams: List[io.BytesIO]):
    pil_images = []
    for stream in image_streams:
        img = Image.open(stream)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        pil_images.append(img)

    if not pil_images:
        return None

    # 結果をメモリ上のPDFデータとして作成
    output_stream = io.BytesIO()
    pil_images[0].save(
        output_stream,
        "PDF",
        resolution=100.0,
        save_all=True,
        append_images=pil_images[1:]
    )
    output_stream.seek(0)

    return output_stream