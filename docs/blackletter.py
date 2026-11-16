# 中文哥德體（blackletter）：以漢字筆畫中心線（Make Me a Hanzi / hanzi-writer-data, Arphic PL）
# 以西洋大寫哥德字（Old English / Textura 大寫）為參考：寬頭筆粗細對比、弧線收尖、起筆分叉、菱形頓點、
# 字框空白中的細直線與菱形、首筆捲曲髮絲花飾、末筆甩尾。輸出 1024 方格（y 向下）的 SVG path。
import json, math, sys
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
HW = '/tmp/claude-0/-home-claude/863541ea-5b4b-5738-8d8c-237c848f2ff9/scratchpad/hw/'
BASE = float(sys.argv[1]) if len(sys.argv) > 1 else 150   # 筆頭寬（9 畫以下）
NIB = BASE
DECO = True
ANG = math.radians(float(sys.argv[3]) if len(sys.argv) > 3 else 25)                                      # 筆頭角度
TOL = 16                                                    # 折角化的容許誤差

CX = float(sys.argv[4]) if len(sys.argv) > 4 else .7   # 左右壓窄比例（瘦長）
def raw(ch):
    return [[(x, 900 - y) for x, y in m] for m in json.load(open(HW + ch + '.json'))['medians']]
def condense(ms):
    return [[(512 + (x - 512) * CX, y) for x, y in m] for m in ms]
def med(ch):
    return condense(raw(ch))

def compose(left_src, n_left, right_src, x0=300, sx=.70):
    L = raw(left_src)[:n_left]
    R = [[(x0 + (x - 120) * sx, y) for x, y in m] for m in raw(right_src)]
    return condense(L + R)

def rdp(pts, tol):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1
    i, dm = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / L
        if d > dm: i, dm = k, d
    if dm > tol: return rdp(pts[:i + 1], tol)[:-1] + rdp(pts[i:], tol)
    return [pts[0], pts[-1]]

def chaikin(p, n=2):
    for _ in range(n):
        q = [p[0]]
        for (ax, ay), (bx, by) in zip(p, p[1:]):
            q += [(ax * .75 + bx * .25, ay * .75 + by * .25), (ax * .25 + bx * .75, ay * .25 + by * .75)]
        q.append(p[-1]); p = q
    return p

def stroke_poly(m):
    p = rdp(m, TOL)
    if len(p) < 2: p = [m[0], m[-1]]
    if len(p) > 2: p = chaikin(p, 2)        # 大寫哥德字的弧線：圓潤但收在尖點
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
    ex0, ey0 = ex, ey
    def thorn(x, y, ux, uy, L, w):
        px, py = -uy, ux
        return Polygon([(x + px * w, y + py * w), (x + ux * L, y + uy * L), (x - px * w, y - py * w)])
    def rot(ux, uy, deg):
        c, s_ = math.cos(math.radians(deg)), math.sin(math.radians(deg)); return ux * c - uy * s_, ux * s_ + uy * c
    d0x, d0y = p[1][0] - p[0][0], p[1][1] - p[0][1]; l0 = math.hypot(d0x, d0y) or 1; d0x, d0y = d0x / l0, d0y / l0
    d1x, d1y = dx / (math.hypot(dx, dy) or 1), dy / (math.hypot(dx, dy) or 1)
    # 起筆：往後上方伸出一根尖刺
    for a_, L_ in ((32, .95), (-32, .8)):   # 起筆分叉成兩個尖角
        tx, ty = rot(-d0x, -d0y, a_); parts.append(thorn(sx, sy, tx, ty, NIB * L_, NIB * .2))
    # 收筆：豎畫往左下長髮絲尖刺、橫畫往右上翹尖刺、其他斜畫拉出細長髮絲
    if 65 < ang < 115:
        parts.append(thorn(ex, ey, *rot(d1x, d1y, 35), NIB * 1.0, NIB * .14))
    elif ang < 20 or ang > 160:
        parts.append(thorn(ex, ey, *rot(d1x, d1y, -40), NIB * .95, NIB * .14))
        hx, hy = rot(d1x, d1y, 120); parts.append(Polygon([(ex, ey), (ex + hx * NIB * 1.3, ey + hy * NIB * 1.3), (ex + hx * NIB * 1.3 + 9, ey + hy * NIB * 1.3 - 9), (ex + 14, ey - 14)]).buffer(0))
    else:
        parts.append(thorn(ex, ey, d1x, d1y, NIB * 1.1, NIB * .2))
    # 轉折處外側加小尖刺
    for (ax, ay), (bx, by), (cx2, cy2) in zip(p, p[1:], p[2:]):
        u1x, u1y = bx - ax, by - ay; u2x, u2y = cx2 - bx, cy2 - by; n1 = math.hypot(u1x, u1y) or 1; n2 = math.hypot(u2x, u2y) or 1
        u1x, u1y, u2x, u2y = u1x / n1, u1y / n1, u2x / n2, u2y / n2
        ox, oy = u1x - u2x, u1y - u2y; on = math.hypot(ox, oy)
        if on > 1.0: parts.append(thorn(bx, by, ox / on, oy / on, NIB * .75, NIB * .14))
    START.append((sx, sy, d0x, d0y)); END.append((ex, ey, d1x, d1y))
    return unary_union(parts)

def hair(pts, w):
    """細髮絲線（兩端尖）"""
    from shapely.geometry import LineString
    return LineString(pts).buffer(w / 2, cap_style=1, join_style=1)

def bez(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]

def dia(x, y, rx, ry):
    return Polygon([(x, y - ry), (x + rx, y), (x, y + ry), (x - rx, y)])

def glyph(meds):
    global NIB, START, END
    n = len(meds); NIB = BASE * max(.6, min(1, 1 - .05 * (n - 8)))   # 筆畫越多筆頭越細，避免糊成一團
    START, END = [], []
    body = unary_union([stroke_poly(m) for m in meds])
    deco = []
    HW_ = 20                                # 髮絲線粗細（1024 方格）
    # 1) 字框裡的空白：中間一條細直線，正中一顆菱形（像 𝔈 𝔊 ℭ 裡面那條線）
    polys = [body] if isinstance(body, Polygon) else list(body.geoms)
    for P in polys:
        for ring in P.interiors:
            H = Polygon(ring)
            if H.area < 9000: continue
            minx, miny, maxx, maxy = H.bounds; cx = (minx + maxx) / 2; h = maxy - miny; w = maxx - minx
            if h >= w * .7 and w > 55:
                line = hair([(cx, miny + h * .12), (cx, maxy - h * .12)], HW_)
                d_ = dia(cx, (miny + maxy) / 2, min(26, w * .22), min(40, h * .25))
            elif w > 70:
                cy = (miny + maxy) / 2; line = hair([(minx + w * .14, cy), (maxx - w * .14, cy)], HW_)
                d_ = dia((minx + maxx) / 2, cy, min(40, w * .25), min(24, h * .3))
            else: continue
            item = unary_union([line, d_]).intersection(H.buffer(-14))
            if not item.is_empty: deco.append(item)
    # 2) 首筆起點：往左下捲出一道髮絲花飾，末端一顆小菱形
    sx, sy, dx0, dy0 = min(START, key=lambda t: t[0] + t[1] * .3)
    R = NIB * 1.6
    c1 = bez((sx, sy), (sx - R * 1.1, sy - R * .15), (sx - R * .75, sy + R * 1.0))
    c2 = bez(c1[-1], (sx - R * .45, sy + R * 1.6), (sx - R * .05, sy + R * 1.15), 12)
    deco += [hair(c1 + c2[1:], HW_), dia(*c2[-1], 18, 26)]
    # 3) 最右下的收筆：往右上甩一道髮絲尾
    ex, ey, dx1, dy1 = max(END, key=lambda t: t[0] + t[1])
    t1 = bez((ex, ey), (ex + R * .9, ey + R * .25), (ex + R * 1.05, ey - R * .7))
    deco += [hair(t1, HW_ * .9), dia(*t1[-1], 16, 22)]
    g = unary_union([body] + deco).buffer(4, join_style=2).buffer(-4, join_style=2).simplify(1.2)
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
