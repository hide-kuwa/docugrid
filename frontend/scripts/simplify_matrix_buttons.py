# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "src" / "components" / "MatrixGrid.tsx"
t = p.read_text(encoding="utf-8")
t = t.replace("relative z-20 mt-3", "relative z-50 mt-3")
t = re.sub(
    r'onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}\s*onClick=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onPreview\(file\);\s*\}\}',
    "onClick={() => onPreview(file)}",
    t,
)
t = re.sub(
    r'onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}\s*onClick=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onEdit\(file\);\s*\}\}',
    "onClick={() => onEdit(file)}",
    t,
)
p.write_text(t, encoding="utf-8", newline="\n")
print("onPointerDown" in t, "onClick={() => onEdit(file)" in t)
