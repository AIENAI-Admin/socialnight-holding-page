"""Inlines src/ and assets/ into a single self-contained index.html.

The page is handed around as a standalone file and gets opened from contexts that
don't resolve relative URLs, so nothing may reference an external resource: CSS,
fonts, logo and grid script all get embedded.

Run after any edit to src/.
"""

import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"

# Load order matters: grid and lasers paint the background, countdown reads the
# headline that views.js later cross-fades. Add new modules here.
SCRIPTS = ("grid.js", "lasers.js", "disco.js", "click.js", "countdown.js", "views.js")


def b64(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_uri(path, mime):
    return f"data:{mime};base64,{b64(path)}"


def inline_fonts(css):
    def swap(match):
        name = match.group(1)
        return data_uri(ASSETS / "fonts" / f"{name}.woff2", "font/woff2")

    return re.sub(r"\{\{FONT:([a-z0-9-]+)\}\}", swap, css)


def main():
    css = inline_fonts((SRC / "styles.css").read_text())
    # The disco ball is a background-image rather than an <img> so that a
    # browser without WebP renders nothing instead of a broken-image icon. It
    # is decorative, so silence is the right failure.
    css = css.replace("{{DISCO}}", data_uri(ASSETS / "disco-ball.webp", "image/webp"))

    html = (SRC / "page.html").read_text()
    html = html.replace("{{STYLES}}", "\n" + css)
    html = html.replace("{{LOGO}}", data_uri(ASSETS / "logo.png", "image/png"))
    # One <script> per module rather than one concatenated block. A parse or
    # throw in any single module then only costs that module: the decorative
    # ones can fail without taking the countdown or the view routing with them.
    scripts = "\n".join(
        f"<script>\n{(SRC / name).read_text()}</script>"
        for name in SCRIPTS
    )
    # The click is two cuts from one recording: the press and the release of a
    # real mouse, fired separately by click.js. Bare base64 rather than a data
    # URI because it is handed to decodeAudioData, not to a src attribute.
    scripts = scripts.replace("{{CLICK_DOWN}}", b64(ASSETS / "click-down.wav"))
    scripts = scripts.replace("{{CLICK_UP}}", b64(ASSETS / "click-up.wav"))
    html = html.replace("{{SCRIPT}}", scripts)

    leftover = re.findall(r"\{\{[^}]+\}\}", html)
    if leftover:
        raise SystemExit(f"unresolved placeholders: {sorted(set(leftover))}")

    out = ROOT / "index.html"
    out.write_text(html)
    print(f"index.html  {out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
