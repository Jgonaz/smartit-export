"""Genera páginas para probar el visor sin SmartIT: tests/out/<fixture>.html.

Uso: python3 tests/make_pages.py  y abre tests/out/ejemplo.html en Chrome.
Cada página carga viewer.html con un sustituto mínimo de las APIs de Chrome y los datos de tests/fixtures/.
"""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'tests' / 'out'
out.mkdir(exist_ok=True)
stub = '''<script src="../fixtures/{name}.js"></script>
<script>
  // Sustituto de chrome.* para abrir el visor como archivo local.
  const mem = {{ k: window.SIE_FIXTURE }};
  window.chrome = {{
    storage: {{ local: {{ get: async k => (typeof k === 'string' ? {{ [k]: mem[k] }} : Object.fromEntries(k.map(x => [x, mem[x]]))), set: async o => Object.assign(mem, o), remove: async k => {{ [].concat(k).forEach(x => delete mem[x]); }} }}, onChanged: {{ addListener() {{}} }} }},
    runtime: {{ sendMessage: async () => ({{}}), getURL: p => '../../' + p }}
  }};
  if (!location.hash) location.hash = 'k';
</script>
'''
html = (root / 'viewer.html').read_text(encoding='utf-8')
html = html.replace('href="viewer.css"', 'href="../../viewer.css"')
for js in ('theme.js', 'carpeta.js'):
    html = html.replace(f'src="{js}"', f'src="../../{js}"')
for f in sorted((root / 'tests' / 'fixtures').glob('*.js')):
    page = html.replace('<script src="viewer.js"></script>', stub.format(name=f.stem) + '<script src="../../viewer.js"></script>')
    (out / f'{f.stem}.html').write_text(page, encoding='utf-8')
    print('tests/out/' + f.stem + '.html')
