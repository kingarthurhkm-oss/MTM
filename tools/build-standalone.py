"""Create a self-contained offline HTML companion from the Android assets."""
from pathlib import Path
import base64
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / 'tools/build-korea-map.py'), '--check'], check=True)
subprocess.run([sys.executable, str(root / 'tools/build-army-data.py'), '--check'], check=True)
subprocess.run([sys.executable, str(root / 'tools/build-terrain.py'), '--check'], check=True)
assets = root / 'app/src/main/assets/game'
out = root / 'dist'
out.mkdir(exist_ok=True)
html = (assets / 'index.html').read_text(encoding='utf-8')
css = (assets / 'style.css').read_text(encoding='utf-8')
font = base64.b64encode((assets / 'fonts/noto-sans-kr.woff2').read_bytes()).decode()
css = css.replace('fonts/noto-sans-kr.woff2', 'data:font/woff2;base64,' + font)
parts = []
for name in ['hex.js', 'geography.js', 'terrain-data.js', 'terrain.js', 'army-data.js', 'army.js', 'sectors.js', 'engine.js', 'ui.js']:
    js = (assets / name).read_text(encoding='utf-8')
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
# One versioned release name for both distribution routes.
release = json.loads((root / 'package.json').read_text(encoding='utf-8'))['htmlRelease']
if not re.fullmatch(r'v[1-9][0-9]*', release):
    raise ValueError('htmlRelease must be v2, v3, ...')
if f'PENINSULA 2026 {release}' not in html:
    raise ValueError('HTML title and htmlRelease must agree')
filename = f'peninsula-2026-{release}.html'
targets = [out / filename, root / 'downloads' / filename]
for target in targets:
    target.write_text(html, encoding='utf-8', newline='\n')
    print('Created', target)

# Retire the two ambiguous, unversioned distribution files after building.
for directory in [out, root / 'downloads']:
    for old_name in ['peninsula-2026.html', 'peninsula-2026-army.html', 'peninsula-2026-v2.html', 'peninsula-2026-v3.html']:
        (directory / old_name).unlink(missing_ok=True)
