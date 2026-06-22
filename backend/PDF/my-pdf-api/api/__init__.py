"""Application package bootstrap."""

from pathlib import Path
import sys

# Ensure the project root is on sys.path so top-level helpers like `pdf_utils` import cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))
