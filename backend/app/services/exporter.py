"""Export Service with CSV Formula Injection Sanitization."""

from __future__ import annotations

import csv
import io
import json
from typing import Any


def sanitize_csv_cell(value: Any) -> str:
    """Sanitize cell value to prevent CSV formula injection (CWE-1236).

    Prepends a single quote `'` if the string begins with dangerous prefix
    characters (`=`, `+`, `-`, `@`, `\t`, `\r`) that spreadsheet programs interpret as formulas.
    """
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


def export_tabular_to_csv(headers: list[str], rows: list[list[Any]]) -> str:
    """Render sanitized tabular data into a CSV string."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Write sanitized headers
    writer.writerow([sanitize_csv_cell(h) for h in headers])

    # Write sanitized rows
    for row in rows:
        writer.writerow([sanitize_csv_cell(cell) for cell in row])

    return output.getvalue()


def export_json(data: Any, pretty: bool = True) -> str:
    """Render structured data as formatted JSON."""
    indent = 2 if pretty else None
    return json.dumps(data, indent=indent, default=str)


def export_html_report(title: str, markdown_content: str, metadata: dict[str, Any]) -> str:
    """Render a standalone, styled HTML document for a research report."""
    meta_tags = "\n".join(f"<li><strong>{k}:</strong> {v}</li>" for k, v in metadata.items())
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #1e293b; line-height: 1.6; }}
        h1, h2, h3 {{ color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }}
        ul.meta {{ list-style: none; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }}
        pre {{ background: #f1f5f9; padding: 12px; border-radius: 6px; overflow-x: auto; }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <ul class="meta">
        {meta_tags}
    </ul>
    <pre>{markdown_content}</pre>
</body>
</html>"""
