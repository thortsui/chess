#!/usr/bin/env python3
"""改版號：一次更新網站選單右上角、iOS App、app/package.json 三處。

用法：
  python3 tools/bump_version.py fix       # 修正、調整 → 0.5.0 → 0.5.1
  python3 tools/bump_version.py feature   # 有新功能   → 0.5.3 → 0.6.0
  python3 tools/bump_version.py 0.7.2     # 直接指定
原始碼（Claude 網頁版 xiangqi.html）若在旁邊，也一併更新。
"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [ROOT / 'index.html', ROOT / 'app/package.json', ROOT / 'app/ios/App/App.xcodeproj/project.pbxproj',
         pathlib.Path('/home/claude/xiangqi.html')]
cur = re.search(r'class="ver"[^>]*>v(\d+\.\d+\.\d+)<', (ROOT / 'index.html').read_text()).group(1)
a, b, c = map(int, cur.split('.'))
arg = sys.argv[1] if len(sys.argv) > 1 else 'fix'
new = f'{a}.{b}.{c + 1}' if arg == 'fix' else f'{a}.{b + 1}.0' if arg == 'feature' else arg
assert re.fullmatch(r'\d+\.\d+\.\d+', new), new
for f in FILES:
    if not f.exists(): continue
    s = f.read_text()
    s = s.replace(f'aria-label="版本 {cur}">v{cur}<', f'aria-label="版本 {new}">v{new}<')
    s = re.sub(r'MARKETING_VERSION = [\d.]+;', f'MARKETING_VERSION = {new};', s)
    s = s.replace(f'"version": "{cur}"', f'"version": "{new}"')
    f.write_text(s)
doc = ROOT / 'docs/功能說明.md'
doc.write_text(re.sub(r'目前版本：\*\*[\d.]+\*\*', f'目前版本：**{new}**', doc.read_text()))
print(f'{cur} → {new}')
