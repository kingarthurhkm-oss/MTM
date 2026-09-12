"""Create a self-contained offline HTML companion from the Android assets."""
from pathlib import Path
import base64
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / 'tools/build-army-data.py'), '--check'], check=True)
assets = root / 'app/src/main/assets/game'
out = root / 'dist'
out.mkdir(exist_ok=True)
html = (assets / 'index.html').read_text()
css = (assets / 'style.css').read_text()
font = base64.b64encode((assets / 'fonts/noto-sans-kr.woff2').read_bytes()).decode()
css = css.replace('fonts/noto-sans-kr.woff2', 'data:font/woff2;base64,' + font)
parts = []
for name in ['geography.js', 'army-data.js', 'army.js', 'engine.js', 'ui.js']:
    js = (assets / name).read_text()
    js = re.sub(r'^import .+?;\n', '', js, flags=re.M)
    js = re.sub(r'^export ', '', js, flags=re.M)
    parts.append(js)
symbols = {}
for p in sorted((assets / 'symbols').glob('*.svg')):
    symbols[p.stem] = 'data:image/svg+xml;base64,' + base64.b64encode(p.read_bytes()).decode()
import json
code = '\n'.join(parts)
code = code.replace("const symbolPath=(side,type)=>`symbols/${side}-${type}.svg`;",
                    'const SYMBOLS=' + json.dumps(symbols) + ';\nconst symbolPath=(side,type)=>SYMBOLS[side+"-"+type];')
html = re.sub(r'  <meta http-equiv="Content-Security-Policy"[^>]+>\n', '', html)
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="ui.js"></script>', '<script>\n(()=>{\n' + code.replace('</script', '<\\/script') + '\n})();\n</script>')
targets = [out / 'peninsula-2026.html', root / 'downloads/peninsula-2026-army.html']
for target in targets:
    target.write_text(html)
    print('Created', target)
