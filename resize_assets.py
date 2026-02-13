from PIL import Image
import os

def resize_image(input_path, output_path, size):
    try:
        with Image.open(input_path) as img:
            # For the feature graphic, we might want to scale and then pad or crop
            # But here we will just force the resize to see if it works
            resized_img = img.resize(size, Image.Resampling.LANCZOS)
            resized_img.save(output_path)
            print(f"Resized {input_path} to {size} and saved to {output_path}")
    except Exception as e:
        print(f"Error resizing {input_path}: {e}")

# Icon: 512x512
resize_image('docs/play_store_assets/app_icon_512.png', 'docs/play_store_assets/app_icon_512.png', (512, 512))

# Feature Graphic: 1024x500
resize_image('docs/play_store_assets/feature_graphic_1024x500.png', 'docs/play_store_assets/feature_graphic_1024x500.png', (1024, 500))
