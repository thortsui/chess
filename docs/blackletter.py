# 中文哥德體（blackletter）：以漢字筆畫中心線（Make Me a Hanzi / hanzi-writer-data, Arphic PL）
# 模擬寬頭鵝毛筆以固定斜角書寫：曲線折成直角段、粗細對比、筆畫起訖加菱形頓點。輸出 1024 方格（y 向下）的 SVG path。
import json, math, sys
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
HW = '/tmp/claude-0/-home-claude/863541ea-5b4b-5738-8d8c-237c848f2ff9/scratchpad/hw/'
BASE = float(sys.argv[1]) if len(sys.argv) > 1 else 150   # 筆頭寬（9 畫以下）
NIB = BASE
ANG = math.radians(float(sys.argv[3]) if len(sys.argv) > 3 else 25)                                      # 筆頭角度
TOL = 30                                                    # 折角化的容許誤差

def med(ch):
    return [[(x, 900 - y) for x, y in m] for m in json.load(open(HW + ch + '.json'))['medians']]

def compose(left_src, n_left, right_src, x0=300, sx=.70):
    L = med(left_src)[:n_left]
    R = [[(x0 + (x - 120) * sx, y) for x, y in m] for m in med(right_src)]
    return L + R

def rdp(pts, tol):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1
    i, dm = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / L
        if d > dm: i, dm = k, d
    if dm > tol: return rdp(pts[:i + 1], tol)[:-1] + rdp(pts[i:], tol)
    return [pts[0], pts[-1]]

def stroke_poly(m):
    p = rdp(m, TOL)
    if len(p) < 2: p = [m[0], m[-1]]
    # 收筆往內縮一點、起筆略延伸，讓菱形頓點自然
    nx, ny = math.cos(ANG) * NIB / 2, -math.sin(ANG) * NIB / 2
    parts = []
    for (ax, ay), (bx, by) in zip(p, p[1:]):
        parts.append(Polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]).buffer(0))
    # 菱形頓點：寬筆往右下斜點一下，自然形成菱形（起筆一律加；橫、豎的收筆也加）
    def tick(x, y, t, back):
        ux, uy = math.cos(math.radians(48)), math.sin(math.radians(48))
        if back: ax, ay, bx, by = x - ux * t, y - uy * t, x, y
        else: ax, ay, bx, by = x, y, x + ux * t, y + uy * t
        return Polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]).buffer(0)
    T = NIB * .5
    (sx, sy), (ex, ey) = p[0], p[-1]
    parts.append(tick(sx, sy, T, True))
    dx, dy = ex - p[-2][0], ey - p[-2][1]
    ang = math.degrees(math.atan2(dy, dx)) % 180
    if 65 < ang < 115 or ang < 20 or ang > 160: parts.append(tick(ex, ey, T * .8, False))
    return unary_union(parts)

def glyph(meds):
    global NIB
    n = len(meds); NIB = BASE * max(.6, min(1, 1 - .05 * (n - 8)))   # 筆畫越多筆頭越細，避免糊成一團
    g = unary_union([stroke_poly(m) for m in meds]).buffer(6, join_style=2).buffer(-6, join_style=2).simplify(1.5)
    polys = [g] if isinstance(g, Polygon) else list(g.geoms)
    d = []
    for P in polys:
        P = orient(P, 1.0)
        for ring in [P.exterior] + list(P.interiors):
            c = list(ring.coords)[:-1]
            d.append('M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in c) + 'Z')
    return ''.join(d)

CH = '帥仕相俥傌炮兵將士象車馬砲卒楚河漢界'
out = {}
for ch in CH:
    if ch == '俥': m = compose('仕', 2, '車')
    elif ch == '傌': m = compose('仕', 2, '馬')
    else: m = med(ch)
    out[ch] = glyph(m)
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/-home-claude/863541ea-5b4b-5738-8d8c-237c848f2ff9/scratchpad/bl/goth.json', 'w'), ensure_ascii=False)
print({k: len(v) for k, v in out.items()})
