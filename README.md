# meetup-app

**Golem Basecamp**: the trip app inside this project.

Offline trip companion for the Albanian coast around Golem and Durrës, plus Tirana. One codebase builds three things:

| Build | Where it comes from | Who it's for |
|---|---|---|
| **Android app** (`golem-basecamp.apk`) | `build-android.bat` on Windows, or the *Android APK* GitHub Action | Android phones (sideload) |
| **iPhone app** (`golem-basecamp.ipa`, unsigned) | The *iPhone IPA* GitHub Action (runs on GitHub's Macs) | iPhones, installed with AltStore / SideStore / Sideloadly |
| **Website** | The *Website (GitHub Pages)* GitHub Action | Anyone who doesn't want to install an app. "Add to Home Screen" keeps it offline |

## What's in it

- **Home:** taxi card in Albanian (filled in from the group, see below), compass to home or the meeting point, editable meeting point, live location, emergency numbers, notes, arrival checklist.
- **Map:** the whole of Albania offline (every road, town, river and lake from OpenStreetMap, 3 Nov 2026), places, protest zones, your own pins, friends' location dots.
- **Places:** rated restaurants, cheap eats, cafés and bars, exchange offices, ATMs, buses, pharmacies, an avoid list, and the group's pins.
- **Info:** getting around, money and exchange, safety and the avoid list, phrasebook, offline tips, sources.
- **Chat:** end-to-end encrypted group chat.

## Privacy: where you're staying is not in this repo

The address and coordinates of the accommodation are deliberately **not** part of the code. After installing, someone unlocks the group and fills in **Home → Where are we staying?** once. It is saved encrypted and every phone that unlocks with the passphrase receives it. For a private offline copy with the address built in, run `GB_TRIP_FILE=path/to/trip.json python3 scripts/build.py` and use `dist/golem-basecamp.html`. Keep that file out of git.

## Sync, encryption and location

- Everyone types the same **group passphrase**. It never leaves the phone. It derives an AES-256 key (PBKDF2, 310k rounds) and a random-looking group ID.
- Chat, pins, the meeting point and location dots travel through two free public MQTT relays (`broker.hivemq.com`, `broker.emqx.io`) as **encrypted** retained messages. The relays only see scrambled data and message times.
- **Each phone keeps the whole ledger.** Messages written without signal wait in an outbox. On every reconnect a phone receives what it missed and republishes anything the relay lacks. "Copy / Paste ledger" in Chat moves it between phones by AirDrop, Quick Share or Bluetooth with no internet at all.
- **Avoid areas:** long-press the map and tick "Area to avoid" to warn the group about a protest or trouble spot for 12 hours. The built-in protest zones are static (as of 3 Nov 2026); Info → Safety links the sources that announce new protests.
- **Live location** is off by default. Friends see a dot with your name. In the **apps** it keeps updating with the app closed or the phone locked until you turn it off (Android shows a notification while it's on); background updates go out through the phone's native networking to [ntfy.sh](https://ntfy.sh), another free public relay, sealed with the group key. On the **website** it only updates while the page is open.
  - It turns itself off after **more than an hour outside Albania**.
  - Turning it on while outside Albania asks first: *"You are about to activate location sharing outside of Albania, which would show your location to the other group members."*
  - Turning it off removes your dot for everyone straight away.

## Build the Android app on Windows

Needs Node.js 22+, Python 3, and Android Studio (for the Android SDK and Java 21).

1. Double-click `build-android.bat`.
2. Wait for `golem-basecamp.apk` to appear in this folder.
3. Send the APK to the Android phones. Opening it installs it, after allowing "Install unknown apps" for the app you opened it from.

Alternative: run `npm install`, `python scripts/build.py` and `npx cap sync android`, then open the `android` folder in Android Studio and choose **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

## Build the iPhone app

Push this repo to GitHub. The **iPhone IPA** action builds `golem-basecamp.ipa` and attaches it to the run (Actions tab → latest run → Artifacts). Then on Windows:

- **Sideloadly:** plug in the iPhone, drop in the .ipa, and sign in with that person's Apple ID. Free Apple IDs expire apps after **7 days**.
- **SideStore:** after a one-time setup on a computer, the iPhone re-signs the app by itself, which matters for a trip longer than a week.
- **AltStore Classic:** also works, but refreshing needs the PC on the same Wi-Fi.

## Host the website

Push to a **public** GitHub repo. Then go to Settings → Pages → Source: **GitHub Actions**. The *Website* action publishes `web/` at `https://<you>.github.io/<repo>/`.

## Change content

Edit `src/data.py` (places, phrases, sources), `src/template.html` (layout) or `src/app.js` (behaviour), then run `python3 scripts/build.py`. To refresh the country map, download `albania-latest.osm.pbf` from Geofabrik and run `python3 scripts/country.py <file>` (needs `pip install osmium shapely`).

Map data © OpenStreetMap contributors (ODbL).
