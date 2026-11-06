"""Turn albania-latest.osm.pbf into a compact, cell-chunked offline map for the app."""
import osmium, json, math, gzip, base64, sys, glob, os
from collections import defaultdict
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import linemerge

PBF = sys.argv[1]
CELL = 0.1
KLAT = 110574; KLON = 111320 * math.cos(math.radians(41))

ROADCLS = {
 'motorway':'mot','motorway_link':'lnk','trunk':'tru','trunk_link':'lnk','primary':'pri','primary_link':'lnk',
 'secondary':'sec','secondary_link':'lnk','tertiary':'ter','tertiary_link':'lnk',
 'unclassified':'unc','residential':'res','living_street':'res','pedestrian':'ped','road':'unc',
 'service':'svc','track':'trk','footway':'fp','path':'fp','steps':'fp','cycleway':'fp','bridleway':'fp'}
SKIP_SERVICE = {'parking_aisle','driveway','drive-through','emergency_access'}
GLOBAL_ROADS = {'mot','tru','pri','sec','lnk'}
EPS = {'mot':8,'tru':8,'pri':6,'sec':5,'lnk':3,'ter':3,'unc':3,'res':2.5,'ped':2,'svc':2,'fp':2.5,'trk':5}
PLACES = {'city':'city','town':'town','village':'village','suburb':'suburb'}
# Everyday places from OpenStreetMap (the hand-picked list in data.py is separate): amenity/shop value -> app glyph code
POI_AM = {'restaurant':'eat','fast_food':'eat','food_court':'eat','cafe':'cafe','ice_cream':'cafe','bar':'bar','pub':'bar','nightclub':'bar',
 'atm':'atm','bank':'bank','bureau_de_change':'money','money_transfer':'money','pharmacy':'pharmacy','hospital':'hospital','clinic':'hospital',
 'doctors':'hospital','dentist':'hospital','fuel':'fuel','post_office':'post','police':'police','bus_station':'bus','taxi':'taxi','toilets':'wc','marketplace':'shop'}
POI_SHOP = {'supermarket':'shop','convenience':'shop','general':'shop','kiosk':'shop','greengrocer':'shop','butcher':'shop','seafood':'shop',
 'alcohol':'shop','beverages':'shop','mall':'shop','department_store':'shop','bakery':'bakery','pastry':'bakery','chemist':'pharmacy',
 'mobile_phone':'phone','telecommunication':'phone','clothes':'bag','shoes':'bag','gift':'bag','souvenir':'bag','beach':'bag','sports':'bag','optician':'bag','tobacco':'shop'}
def poi_code(t):
    am = t.get('amenity'); sh = t.get('shop')
    if am in POI_AM: return POI_AM[am], am
    if sh in POI_SHOP: return POI_SHOP[sh], sh
    return None, None

def enc(pts):
    out=[]; pl=po=0
    for i,(la,lo) in enumerate(pts):
        a=round((la-39)*1e5); b=round((lo-19)*1e5)
        out += [a,b] if i==0 else [a-pl,b-po]; pl,po=a,b
    return out

def simplify(pts, eps):
    if len(pts) < 3: return pts
    ls = LineString([(lo*KLON, la*KLAT) for la,lo in pts]).simplify(eps, preserve_topology=False)
    return [(y/KLAT, x/KLON) for x,y in ls.coords]

def ring_simplify(pts, eps):
    if len(pts) < 4: return None
    pg = Polygon([(lo*KLON, la*KLAT) for la,lo in pts]).simplify(eps, preserve_topology=True)
    if pg.is_empty or pg.geom_type != 'Polygon': return None
    return [(y/KLAT, x/KLON) for x,y in pg.exterior.coords]

def cell_of(la, lo): return f"{int(math.floor(la/CELL))}_{int(math.floor(lo/CELL))}"

cells = defaultdict(lambda: {"r": defaultdict(list), "lbl": {}, "p": [], "u": [], "s": [], "b": [90,180,-90,-180]})
glob_roads = defaultdict(list)
rivers = []; coast = []; lakes = []; border = []
counts = defaultdict(int)

def grow(c, pts):
    b = c["b"]
    for la,lo in pts:
        b[0]=min(b[0],la); b[1]=min(b[1],lo); b[2]=max(b[2],la); b[3]=max(b[3],lo)

fp = osmium.FileProcessor(PBF).with_locations().with_areas()
for o in fp:
    if o.is_node():
        t = o.tags; pl = t.get('place')
        if pl in PLACES:
            name = t.get('name:sq') or t.get('name')
            if not name: continue
            la, lo = o.location.lat, o.location.lon
            c = cells[cell_of(la,lo)]; c["p"].append([name, PLACES[pl], round(la,5), round(lo,5)]); grow(c,[(la,lo)])
            counts['place_'+pl] += 1
    if (o.is_node() or o.is_way()) and ('amenity' in o.tags or 'shop' in o.tags):
        code, kind = poi_code(o.tags)
        if code:
            try:
                if o.is_node(): la, lo = o.location.lat, o.location.lon
                else:
                    ps = [(n.location.lat, n.location.lon) for n in o.nodes]; la = sum(p[0] for p in ps)/len(ps); lo = sum(p[1] for p in ps)/len(ps)
                t = o.tags; name = (t.get('name:sq') or t.get('name') or '')[:48]
                row = [round((la-39)*1e5), round((lo-19)*1e5), code, name, kind]
                if t.get('opening_hours'): row.append(t.get('opening_hours')[:60])
                c = cells[cell_of(la,lo)]; c["s"].append(row); grow(c, [(la,lo)]); counts['poi'] += 1
            except Exception: pass
    if o.is_way():
        t = o.tags; hw = t.get('highway')
        try: pts = [(n.location.lat, n.location.lon) for n in o.nodes]
        except osmium.InvalidLocationError: continue
        if len(pts) < 2: continue
        if hw in ROADCLS:
            if t.get('area') == 'yes': continue
            cls = ROADCLS[hw]
            name = t.get('name:sq') or t.get('name') or ''
            if cls == 'svc' and t.get('service') in SKIP_SERVICE and not name: continue
            if cls == 'fp' and t.get('footway') in ('sidewalk','crossing') and not name: continue   # drawn alongside the street already
            if cls == 'trk' and not name and t.get('tracktype') != 'grade1': continue   # farm and hill tracks: not useful here
            eps = 0.8 if t.get('junction') in ('roundabout','circular') else EPS[cls]
            s = simplify(pts, eps); counts[cls] += 1
            if cls in GLOBAL_ROADS:
                glob_roads[cls].append(enc(s))
                key = cell_of(*s[len(s)//2])
            else:
                key = cell_of(*s[len(s)//2]); c = cells[key]; c["r"][cls].append(enc(s)); grow(c, s)
            if name and cls in ('pri','sec','ter','unc','res','ped','tru','mot'):
                c = cells[key]; L = sum(math.hypot((a[0]-b[0])*KLAT,(a[1]-b[1])*KLON) for a,b in zip(s,s[1:]))
                k = name
                if k not in c["lbl"] or c["lbl"][k][0] < L:
                    mid = s[len(s)//2]; c["lbl"][k] = [round(L), cls, round(mid[0],5), round(mid[1],5)]
        elif t.get('waterway') == 'river':
            rivers.append(enc(simplify(pts, 25))); counts['river'] += 1
        elif t.get('natural') == 'coastline':
            coast.append(pts); counts['coast'] += 1
    elif o.is_area():
        t = o.tags
        nat = t.get('natural'); lu = t.get('landuse')
        is_lake = nat == 'water' and t.get('water') in (None,'lake','reservoir','lagoon','basin_no') or t.get('water') in ('lake','reservoir','lagoon')
        is_town = lu == 'residential'
        is_border = t.get('boundary') == 'administrative' and t.get('admin_level') == '2' and (t.get('ISO3166-1') == 'AL' or t.get('name:en') == 'Albania')
        if not (is_lake or is_town or is_border): continue
        try:
            for poly in o.outer_rings():
                ring = [(n.lat, n.lon) for n in poly]
                if is_border:
                    border.append(enc(simplify(ring, 40))); continue
                la = [p[0] for p in ring]; lo = [p[1] for p in ring]
                area = (max(la)-min(la))*KLAT*(max(lo)-min(lo))*KLON
                if is_lake and area > 150000:
                    r = ring_simplify(ring, 15 if area < 5e7 else 40)
                    if r: lakes.append(enc(r)); counts['lake'] += 1
                elif is_town and area > 40000:
                    r = ring_simplify(ring, 10)
                    if r:
                        c = cells[cell_of(*r[0])]; c["u"].append(enc(r)); grow(c, r); counts['urban'] += 1
        except Exception:
            pass

# ---- coastline: merge into chains, build sea polygon (sea lies to the west)
lines = linemerge([LineString([(lo,la) for la,lo in c]) for c in coast])
geoms = list(lines.geoms) if hasattr(lines, 'geoms') else [lines]
chains = sorted(geoms, key=lambda g: g.length, reverse=True)
main = list(chains[0].coords)
if main[0][1] < main[-1][1]: main = main[::-1]          # north -> south
islands = [list(g.coords) for g in chains[1:] if g.is_ring]
sea_pts = [(la,lo) for lo,la in main]
sea_pts = simplify(sea_pts, 8)
west = 18.3
sea = sea_pts + [(sea_pts[-1][0], west), (sea_pts[0][0], west)]
isl = []
for r in islands:
    rr = ring_simplify([(la,lo) for lo,la in r], 20)
    if rr: isl.append(enc(rr))
coast_lines = [enc(simplify([(la,lo) for lo,la in g.coords], 6)) for g in chains if len(g.coords) > 1]

# ---- pack cells
outcells = {}
for k, c in cells.items():
    if c["b"][0] > c["b"][2]: continue
    lbl = [[n, v[1], v[2], v[3]] for n, v in c["lbl"].items()]
    outcells[k] = {"b": [round(x,4) for x in c["b"]], "r": dict(c["r"]), "l": lbl, "p": c["p"], "u": c["u"], "s": c["s"]}

out = {"v": 1, "g": dict(glob_roads), "rv": rivers, "lk": lakes, "sea": enc(sea), "isl": isl, "cst": coast_lines, "bd": border, "c": outcells}
raw = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
gz = gzip.compress(raw, 9)
open(os.path.join(os.path.dirname(__file__), "..", "data", "country.json.gz.b64"), "w").write(base64.b64encode(gz).decode())
print(dict(counts))
print("cells", len(outcells), "raw MB", round(len(raw)/1e6,2), "gz MB", round(len(gz)/1e6,2), "b64 MB", round(len(gz)*4/3/1e6,2))
print("sea pts", len(sea), "islands", len(isl), "coast chains", len(chains), [len(g.coords) for g in chains[:5]])
