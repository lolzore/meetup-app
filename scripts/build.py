"""Build every version of Golem Basecamp from one source.

  python3 scripts/build.py            -> www/ (Android + iPhone apps), web/ (website), dist/ (private page, offline file, pins)

Needs `npm install` first (Leaflet and MQTT.js are read from node_modules).
"""
import json, sys, os, html, shutil
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
from data import P, PHRASES, SOURCES

def rd(*p): return open(os.path.join(ROOT, *p), encoding="utf-8").read()
def wr(path, text):
    path = os.path.join(ROOT, path); os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)

ONLINE_URL = os.environ.get("GB_ONLINE_URL", "")
# Where the group is staying is private: it is NOT part of this repository. The apps and website get it, encrypted,
# from the group after unlocking. For a private build (your own offline copy) point GB_TRIP_FILE at a JSON file:
# {"address": "...", "lat": .., "lon": .., "sq": "directions in Albanian", "en": "directions in English"}
TRIP_FILE = os.environ.get("GB_TRIP_FILE")
TRIP = json.load(open(TRIP_FILE, encoding="utf-8")) if TRIP_FILE else None
tpl = rd("src", "template.html").replace("__APPJS__", rd("src", "app.js"))
lcss = rd("node_modules", "leaflet", "dist", "leaflet.css")
ljs = rd("node_modules", "leaflet", "dist", "leaflet.js")
mjs = rd("node_modules", "mqtt", "dist", "mqtt.min.js")
for lib in (ljs, mjs): assert "</script" not in lib.lower()
MAPDATA = rd("data", "country.json.gz.b64").strip()
def data_for(mode):
    home = TRIP if (TRIP and mode in ("artifact", "file")) else None   # never baked into the public app or website
    return json.dumps({"home": home, "places": P, "phrases": PHRASES, "sources": SOURCES}, ensure_ascii=False, separators=(",", ":"))

HEAD_EXTRA = {
  "web": '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png">'
         '<link rel="icon" href="icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes">'
         '<meta name="apple-mobile-web-app-title" content="Basecamp"><meta name="mobile-web-app-capable" content="yes">',
  "app": "", "file": "",
}
SW_REG = ('<script>if("serviceWorker" in navigator) addEventListener("load",()=>navigator.serviceWorker'
          '.register("sw.js").catch(()=>{}));</script>')

def build(mode):
    out = tpl.replace("__LEAFLET_CSS__", lcss).replace("__MAPDATA__", MAPDATA)
    if mode != "artifact":
        out = out.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
    if mode == "artifact":
        out = out.replace("__LEAFLET_JS__", '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>')
    else:
        libs = "<script>" + ljs + "</script>"
        if mode in ("app", "web"): libs += "<script>" + mjs + "</script>"
        out = out.replace("__LEAFLET_JS__", libs)
        if mode == "web": out += SW_REG
        out = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
               '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
               + HEAD_EXTRA[mode] +
               '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style>'
               '</head><body>' + out + '</body></html>')
    return out.replace("__MODE__", mode).replace("__ONLINE_URL__", ONLINE_URL).replace("__DATA__", data_for(mode))

def kml():
    def pm(name, desc, lat, lon, style):
        return (f'<Placemark><name>{html.escape(name)}</name><description>{html.escape(desc)}</description>'
                f'<styleUrl>#{style}</styleUrl><Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
    styles = {"home": "ff2b2fc3", "eat": "ff665f0f", "cheap": "ff466e2a", "cafe": "ffb04f7a", "money": "ff0b86b8", "atm": "ff17a0d4",
              "bus": "ffd16f1d", "health": "ff6b39d0", "sight": "ff2b5a8a", "transport": "ffd16f1d", "avoid": "ff272fc3",
              "protest": "ff272fc3", "shop": "ff7a7058"}
    st = "".join(f'<Style id="{k}"><IconStyle><color>{v}</color></IconStyle></Style>' for k, v in styles.items())
    pms = [pm("HOME: " + TRIP["address"], " | ".join(x for x in [TRIP.get("sq"), TRIP.get("en")] if x), TRIP["lat"], TRIP["lon"], "home")] if TRIP else []
    for p in P:
        if p.get("lat") is None: continue
        bits = [b for b in [p.get("rating") and f'TripAdvisor {p["rating"]} ({p["reviews"]} reviews)', p.get("price"), p.get("hours"), p.get("note")] if b]
        pms.append(pm(("AVOID: " if p["cat"] in ("avoid", "protest") else "") + p["name"], " · ".join(bits), p["lat"], p["lon"], p["cat"]))
    return ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Golem Basecamp</name>'
            + st + "".join(pms) + "</Document></kml>")

if __name__ == "__main__":
    wr("www/index.html", build("app"))
    wr("web/index.html", build("web"))
    wr("dist/index.html", build("artifact"))
    wr("dist/golem-basecamp.html", build("file"))
    wr("dist/golem-pins.kml", kml())
    for f in ("manifest.webmanifest", "sw.js", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        src = os.path.join(ROOT, "assets", "web", f)
        if os.path.exists(src): shutil.copy(src, os.path.join(ROOT, "web", f))
    print("built www/, web/ and dist/")
