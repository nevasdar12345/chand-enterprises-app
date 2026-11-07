"""
Shrink the product photos already stored in app/static/product-images/ (one-time job).

WHY: the 27 PNG files in that folder are 2.1 - 2.7 MB each (about 61 MB in total).
Customers never need that size: the shop shows ~640 px pictures.

WHAT TO EXPECT: keeping the .png type saves roughly half (61 MB -> ~32 MB). For a ~90 %
saving (about 200 KB per photo) re-upload the photo from Admin > Products > Image: the
server now converts uploads to WebP automatically and the product gets the new link.

HOW IT KEEPS YOUR LINKS WORKING: every file keeps its name and its type (a .png stays a
.png), so the image links already saved in your database keep working. Only the pixel size
and file weight change.

USE:
    pip install Pillow
    python tools/optimize_images.py            # dry run: shows what would be saved
    python tools/optimize_images.py --apply    # really overwrite the files

Then commit/push the folder. Keep a backup of the originals first if you want one.
"""
import argparse
import io
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is missing. Run:  pip install Pillow")

FOLDER = Path(__file__).resolve().parent.parent / "app" / "static" / "product-images"
MAX_SIDE = 1000


def shrink(path: Path):
    original = path.read_bytes()
    img = Image.open(io.BytesIO(original))
    img = ImageOps.exif_transpose(img)
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out = io.BytesIO()
    ext = path.suffix.lower()
    if ext == ".png":
        img.save(out, "PNG", optimize=True)
    elif ext in (".jpg", ".jpeg"):
        img.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True)
    elif ext == ".webp":
        img.save(out, "WEBP", quality=82, method=4)
    else:
        return None
    data = out.getvalue()
    return (original, data) if len(data) < len(original) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="overwrite the files (default: dry run)")
    args = ap.parse_args()

    if not FOLDER.is_dir():
        sys.exit(f"Folder not found: {FOLDER}")

    before = after = 0
    for path in sorted(FOLDER.iterdir()):
        if not path.is_file():
            continue
        try:
            result = shrink(path)
        except Exception as exc:
            print(f"skip  {path.name}: {exc}")
            continue
        if not result:
            continue
        original, data = result
        before += len(original)
        after += len(data)
        print(f"{path.name:55s} {len(original)/1024:8.0f} KB -> {len(data)/1024:7.0f} KB")
        if args.apply:
            path.write_bytes(data)

    saved = before - after
    print(f"\nTotal: {before/1048576:.1f} MB -> {after/1048576:.1f} MB (saves {saved/1048576:.1f} MB)")
    if not args.apply:
        print("Dry run only. Add --apply to overwrite the files.")


if __name__ == "__main__":
    main()
