#!/usr/bin/env python3
"""Check local design images; remote GitHub rendering still needs verification."""
import sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1] if len(sys.argv)>1 else 'design')
images=list((root/'screenshots').rglob('*.png'))
assert images, 'No screenshots found'
for f in images:
    assert f.stat().st_size>0, f'Empty image: {f}'
    with Image.open(f) as im: im.verify()
print(f'PASS: {len(images)} valid local screenshots; GitHub links not checked')
