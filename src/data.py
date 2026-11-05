# cat: eat | cheap | cafe | shop | money | atm | bus | health | sight | avoid | protest | transport
# area: golem | durres | tirana | airport
P = []
def add(name, cat, area, lat=None, lon=None, **kw):
    d = {"name": name, "cat": cat, "area": area, "lat": lat, "lon": lon}
    d.update(kw); P.append(d)

# ---- Golem: restaurants with TripAdvisor ratings (fetched 4 Nov 2026)
add("Rohana Seaside Restaurant", "eat", "golem", 41.24574, 19.51941, rating=4.9, reviews=231, price="€€–€€€",
    note="Seafood and Mediterranean on the promenade (Bulevardi i Pishave). Top-rated in Golem.", src="ta")
add("Flower Restaurant", "eat", "golem", 41.24813, 19.51939, rating=4.8, reviews=436, price="€€€€",
    note="Hotel Flower on the promenade. Fine dining; the splurge night.", src="ta")
add("Ristorante Valledoria", "eat", "golem", 41.24917, 19.52050, rating=4.6, reviews=25, price="€",
    note="Italian and seafood, listed under cheap eats. Good value pick.", src="ta")
add("Alto Mare Restaurant", "eat", "golem", 41.24860, 19.52005, rating=4.4, reviews=185, price="€€–€€€",
    note="Italian and seafood on the promenade.", src="ta")
add("El Sabor Restaurant & Lounge", "eat", "golem", 41.23887, 19.51669, rating=4.5, reviews=67, price="€€–€€€",
    note="South end of Golem (Mali i Robit). Italian and seafood.", src="ta")
add("Aroma Bay Restaurant", "eat", "golem", 41.24894, 19.51982, rating=4.2, reviews=39, price="€€–€€€",
    note="Pizza and Italian on the promenade.", src="ta")
add("Duna Restaurant", "eat", "golem", 41.25863, 19.52259, rating=4.8, reviews=19, price="€€–€€€",
    note="North Golem, Rruga Gjuzeve. Seafood and Mediterranean.", src="ta")
add("Avra Restaurant", "eat", "golem", 41.26520, 19.51938, rating=4.8, reviews=198, price="€€–€€€",
    note="Far north of Golem (about 2 km). Italian and French.", src="ta")
add("Pampas (bar, pizzeria)", "eat", "golem", 41.26727, 19.51891, rating=4.4, reviews=72, price="€€–€€€",
    note="Arapaj beach path, about 2.3 km north. Pizza and seafood.", src="ta")
add("Acqua Pazza Restaurant", "eat", "golem", rating=4.9, reviews=83, price="€€–€€€",
    note="Italian and seafood. Not pinned: search the name in your map app.", src="ta")
add("Kapri Restaurant", "eat", "golem", rating=4.9, reviews=55, price="€€–€€€",
    note="Seafood. Not pinned: search the name in your map app.", src="ta")
add("Due Fratelli Bar & Ristorante", "eat", "golem", rating=4.8, reviews=34, price="€",
    note="Italian and pizza, cheap eats. Not pinned: search the name.", src="ta")
add("Peshk i Freskët Xeni", "eat", "golem", rating=4.6, reviews=9, price="€",
    note="'Fresh fish Xeni'. Cheap seafood. Not pinned: search the name.", src="ta")
add("Emaà Modern Tavern", "eat", "golem", rating=4.6, reviews=25, price="€€–€€€",
    note="Mediterranean and European. Not pinned: search the name.", src="ta")

# ---- Golem: cheap & everyday (OpenStreetMap, unrated)
add("Byrektore (byrek bakery)", "cheap", "golem", 41.25028, 19.52152,
    note="Byrek = flaky savoury pie. The cheapest proper breakfast in Albania.", src="osm")
add("Burger Station", "cheap", "golem", 41.24831, 19.51966, note="Burgers on the promenade.", src="osm")

# ---- Golem: cafes & bars (OSM, unrated — local spots)
add("Bar Armando", "cafe", "golem", 41.24763, 19.53232, note="Local bar on Bulevardi i Palmave, east of the main road.", src="osm")
add("Ulpiana (cafe)", "cafe", "golem", 41.24735, 19.53230, note="Local cafe on Bulevardi i Palmave.", src="osm")
add("I Fratelli (cafe)", "cafe", "golem", 41.25030, 19.52197, note="Cafe near the promenade, north side.", src="osm")
add("Chloé (cafe)", "cafe", "golem", 41.25159, 19.52110, note="Cafe near the promenade, north side.", src="osm")
add("Rohana's (beach bar)", "cafe", "golem", 41.24578, 19.51924, note="Bar beside the top-rated restaurant.", src="osm")

# ---- Golem: shops
add("Conad supermarket", "shop", "golem", 41.24230, 19.52166, note="Italian chain, south side of Golem.", src="osm")
add("Market Golemi", "shop", "golem", 41.24994, 19.52089, note="Supermarket on the promenade.", src="osm")
add("Golem post office", "shop", "golem", 41.24576, 19.53159, hours="Mon–Fri 07:30–14:30, Sat 07:30–12:30", note="Zyra Postare Golem, Bulevardi i Palmave.", src="osm")

# ---- Golem: money
add("Western Union / exchange", "money", "golem", 41.24738, 19.52342, hours="Not published — ask in person",
    note="Exchange office on Rruga e Detit. Ask the rate and 'pa komision?' before handing over cash.", src="osm")
add("Lika (exchange office)", "money", "golem", 41.24773, 19.52203, hours="Not published — ask in person",
    note="On Rruga e Detit towards the beach. Compare its buy rate with Western Union; pick the better one.", src="osm")
add("ATM, promenade", "atm", "golem", 41.24797, 19.51950, note="On Bulevardi i Pishave.", src="osm")
add("Union Bank + MoneyGet ATMs", "atm", "golem", 41.23513, 19.51604, hours="24/7",
    note="At Fafa hotel, south Golem. A r/tirana user found Union Bank had the lowest fee (about 500 lek).", src="reddit")

# ---- Golem: transport & health
add("Bus stop: to Durrës", "bus", "golem", 41.24764, 19.52529,
    note="Main road through Golem. Red city bus to Durrës about every 30 min from ~06:15, 100 lek. Intercity buses north to Tirana also stop here.", src="bus")
add("Bus stop: Kavajë–Golem line", "bus", "golem", 41.24723, 19.52484, note="Buses south to Kavajë.", src="osm")
add("Kela 2 pharmacy", "health", "golem", 41.24986, 19.52087, note="Farmaci on the promenade.", src="osm")
add("Pharmacy, north promenade", "health", "golem", 41.25183, 19.52112, src="osm")
add("Pharmacy Lola Anila 3", "health", "golem", 41.23516, 19.51601, note="South Golem, by Fafa hotel.", src="osm")

# ---- Durrës
add("Durrës bus station", "bus", "durres", 41.31783, 19.45375,
    note="Airport bus ends here (600 lek). Golem buses leave from the roadside by the station, sign 'Durres–Golem'.", src="bus")
add("Roman Amphitheatre", "sight", "durres", 41.31212, 19.44500, note="2nd-century amphitheatre in the old town. The main sight.", src="osm")
add("Venetian Tower", "sight", "durres", 41.30968, 19.44685, note="Old-town landmark by the seafront.", src="osm")
add("Rooftop XV", "cafe", "durres", 41.30975, 19.44700, approx=True, price="€€",
    note="15th-floor bar near the Venetian Tower. Sunset views; go before sunset for a seat. Pin is approximate.", src="tom")
add("Restaurant 4 Stinet", "eat", "durres", 41.31080, 19.43686, price="€€", hours="Daily 08:00–23:30 (per guide)",
    note="Seafood on the beach promenade: sea bass, shrimp pasta.", src="tom")
add("Flair bakery & cafe", "cheap", "durres", 41.31421, 19.44925, price="€", hours="Daily 06:00–19:00, Sun to 13:00 (per guide)",
    note="Coffee and croissants before sightseeing.", src="tom")
add("Pizza Benvenuto", "cheap", "durres", price="€", hours="Daily 11:00–22:00 (per guide)",
    note="Thin crispy pizza, very good value, few seats. Not pinned: search the name.", src="tom")
add("Exchange office, Rruga Fetah Bllaca", "money", "durres", 41.31413, 19.44944, note="City-centre exchange near Flair.", src="osm")
add("Exchange office, Rruga Kristaq Rama", "money", "durres", 41.31735, 19.44967, note="City-centre exchange.", src="osm")
add("Regional Hospital Durrës", "health", "durres", 41.32627, 19.44450, note="Spitali Rajonal Durrës, Rruga Eqerem Shijaku. Nearest hospital to Golem (~20 km).", src="osm")
add("American Hospital Durrës", "health", "durres", 41.32577, 19.44586, note="Private hospital, Rruga Maliq Muço.", src="osm")

# ---- Tirana (day trip; protests in the centre)
add("Tek Zgara e Tironës", "cheap", "tirana", 41.32814, 19.81056, price="€",
    note="Cheap grill: qofte, suxhuk, stuffed peppers. Close to the Ministry of Education protest spot: go at lunchtime.", near_protest=True, src="guide")
add("Oda", "eat", "tirana", 41.33154, 19.82461, price="€€",
    note="Traditional Albanian dishes (fërgesë, tavë kosi) near the New Bazaar.", src="guide")
add("Mullixhiu", "eat", "tirana", 41.31348, 19.81666, price="€€€",
    note="Upscale farm-to-table Albanian cooking by the Grand Park.", src="guide")
add("Era (Blloku)", "eat", "tirana", price="€",
    note="Cheap classic: tavë Elbasani and pizza, Rruga Ismail Qemali. Not pinned: search 'Restaurant Era Blloku'.", src="guide")
add("Pazari i Ri (New Bazaar)", "sight", "tirana", 41.33025, 19.82435, note="Market square with food stalls and cafes. Watch quoted prices (old-lek confusion).", src="osm")
add("Komiteti", "cafe", "tirana", 41.30992, 19.79938, note="Café-museum full of communist-era objects; known for raki.", src="guide")
add("Hemingway Bar", "cafe", "tirana", 41.32956, 19.81230, note="Cocktail bar. Very close to the Ministry of Education protest spot: avoid on protest evenings.", near_protest=True, src="guide")
add("Iliria'98 exchange, Rruga e Kavajës", "money", "tirana", 41.32794, 19.81390, hours="Check before going",
    note="The exchange chain r/tirana recommends most. City branches beat the airport ones. Near the protest zone: go by day.", near_protest=True, src="reddit")
add("Iliria'98 exchange, Blloku", "money", "tirana", 41.32241, 19.81759, hours="Check before going",
    note="Rruga Ibrahim Rugova. Close to the PM's office: go by day.", near_protest=True, src="reddit")
add("Iliria'98 exchange, Rruga e Elbasanit", "money", "tirana", 41.32481, 19.82540, hours="Check before going",
    note="East of the centre, a little further from the protest spots.", src="reddit")
add("Airport bus stop (behind the Opera)", "bus", "tirana", 41.32900, 19.81931,
    note="Airport bus every hour, 400 lek. This stop is on Skanderbeg Square, inside the protest zone.", near_protest=True, src="bus")

# ---- Protest hotspots (draw as zones)
add("Skanderbeg Square", "protest", "tirana", 41.32814, 19.81843, radius=380,
    note="Gathering point for the student protests. Avoid late afternoon and evening.", src="news")
add("Prime Minister's Office & Parliament", "protest", "tirana", 41.32150, 19.82070, radius=380,
    note="Main target of the protests on Dëshmorët e Kombit Boulevard. Tear gas and water cannon used here.", src="news")
add("Ministry of Education", "protest", "tirana", 41.33001, 19.81209, radius=250,
    note="Rruga e Durrësit. Site of the 18 Oct clashes.", src="news")

# ---- Airport
add("Tirana Airport (TIA)", "transport", "airport", 41.41402, 19.71965,
    note="Airport → Golem by car is ~45–60 min via Vorë and Durrës, and does not pass through central Tirana.", src="bus")

# ---- Avoid (named, with pins where known)
add("Ujvara Hotel restaurant", "avoid", "golem", 41.23595, 19.51724, rating=3.9, reviews=84,
    note="One of the lower-rated places in Golem on TripAdvisor.", src="ta")
add("Sea Zone", "avoid", "golem", rating=3.3, reviews=16, note="Lowest-rated seafood place in Golem on TripAdvisor.", src="ta")
add("Arome Deti (Golem)", "avoid", "golem", rating=3.7, reviews=55, note="Mixed reviews. Not the well-reviewed '2 Kitarat Aromë Deti' in Durrës.", src="ta")
add("Airport exchange counters & ATMs", "avoid", "airport", 41.41402, 19.71965,
    note="r/tirana users report clearly worse rates than city offices. Change only what you need, if anything.", src="reddit")

PHRASES = [
 ["Basics", [
  ["Hello", "Përshëndetje", "per-shen-DET-yeh"],
  ["Hi (casual)", "Ç'kemi", "ch-KEH-mee"],
  ["Good morning", "Mirëmëngjes", "meer-men-JES"],
  ["Good evening", "Mirëmbrëma", "meer-em-BRUH-ma"],
  ["Good night", "Natën e mirë", "NA-ten eh MEER"],
  ["Please", "Ju lutem", "yoo LOO-tem"],
  ["Thank you", "Faleminderit", "fa-le-min-DE-reet"],
  ["Yes / No", "Po / Jo", "po / yo"],
  ["Excuse me / Sorry", "Më falni", "muh FAL-nee"],
  ["I don't understand", "Nuk kuptoj", "nook koop-TOY"],
  ["Do you speak English?", "Flisni anglisht?", "FLEES-nee ang-LEESHT"],
 ]],
 ["Getting around", [
  ["Where is …?", "Ku është …?", "koo UH-shtuh"],
  ["Take me to this address, please", "Më çoni te kjo adresë, ju lutem", "muh CHO-nee teh kyo a-DRE-suh"],
  ["How much to Golem?", "Sa kushton deri në Golem?", "sa koosh-TON DE-ree nuh GO-lem"],
  ["Stop here, please", "Ndaloni këtu, ju lutem", "n-da-LO-nee kuh-TOO"],
  ["Does this bus go to Durrës?", "A shkon ky autobus në Durrës?", "a shkon kee ow-to-BOOS nuh DOO-ruhs"],
  ["When is the last bus?", "Kur nis autobusi i fundit?", "koor nees ow-to-BOO-see ee FOON-deet"],
  ["Bus stop", "Stacioni i autobusit", "sta-tsee-O-nee ee ow-to-BOO-seet"],
 ]],
 ["Money & food", [
  ["How much is it?", "Sa kushton?", "sa koosh-TON"],
  ["Is that new lek?", "Në lekë të rinj?", "nuh LEK tuh REEN"],
  ["Without commission?", "Pa komision?", "pa ko-mee-see-ON"],
  ["The bill, please", "Llogarinë, ju lutem", "lo-ga-REE-nuh yoo LOO-tem"],
  ["Is it per portion or per kilo?", "Për racion apo për kilogram?", "pur ra-tsee-ON A-po pur kee-lo-GRAM"],
  ["Water / Beer / Coffee", "Ujë / Birrë / Kafe", "OO-yuh / BEER-ruh / ka-FEH"],
  ["Without meat", "Pa mish", "pa meesh"],
  ["Very tasty!", "Shumë e shijshme!", "SHOO-muh eh SHEESH-meh"],
  ["Cheers!", "Gëzuar!", "guh-ZOO-ar"],
 ]],
 ["Help", [
  ["Help!", "Ndihmë!", "n-DEEM-uh"],
  ["Call the police", "Thirrni policinë", "THEER-nee po-lee-TSEE-nuh"],
  ["Call an ambulance", "Thirrni ambulancën", "THEER-nee am-boo-LAN-tsuhn"],
  ["I need a doctor", "Më duhet një mjek", "muh DOO-het nyuh myek"],
  ["Where is the pharmacy?", "Ku është farmacia?", "koo UH-shtuh far-ma-TSEE-a"],
  ["I'm lost", "Kam humbur rrugën", "kam HOOM-boor ROO-guhn"],
 ]],
]

SOURCES = [
 ["Al Jazeera, 18 Oct 2026 — sixth day of protests in Tirana", "https://www.aljazeera.com/news/2026/10/18/chaos-in-tirana-demonstrators-determined-to-not-give-up-so-easily"],
 ["Euronews Albania, 3 Nov 2026 — protests in their 22nd day", "https://euronews.al/en/pm-rama-on-student-protests-they-dont-want-to-talk-they-just-want-me-gone-they-didnt-give-me-this-job/"],
 ["GOV.UK Albania travel advice (updated 15 Oct 2026)", "https://www.gov.uk/foreign-travel-advice/albania"],
 ["The Traveler — embassy warnings and areas to avoid", "https://www.thetraveler.org/tirana-protests-intensify-as-embassies-warn-travelers/"],
 ["Wonder Albania — October 2026 protest update", "https://wonderalbania.com/article/is-albania-safe-to-visit-october-2026"],
 ["TripAdvisor — Golem seafood restaurants", "https://www.tripadvisor.com/Restaurants-g1159556-c33-Golem_Tirana_County.html"],
 ["r/tirana — tourist currency exchange & cash", "https://reddit.birdcat.cafe/r/tirana/comments/1lqj62b/tourist_currency_exchange_cash_withdrawal"],
 ["ATM Fee Saver — ATMs in Albania", "https://atmfeesaver.com/cash-currency-exchange-atms-in-albania/"],
 ["Pound Sterling Live — EUR/ALL history 2026", "https://www.poundsterlinglive.com/history/EUR-ALL-2026"],
 ["Albania Tour Guide — Tirana Airport to Golem", "https://albaniatourguide.com/how-to-get-from-tirana-airport-to-golem-bus-taxi-car-transfer-shuttle-train-prices/"],
 ["Albania Blog — Durrës to Golem bus", "https://albania-blog.com/en/how-to-get-from-durres-to-golem/"],
 ["Durrës by Bus — stations and lines", "https://www.durresbybus.com/en/bus-stations/"],
 ["Gjirafa Travel — Golem to Durrës timetable", "https://travel.gjirafa.com/en/bus/golem-ne-durres"],
 ["Gjirafa Travel — Golem to Tirana timetable", "https://travel.gjirafa.com/en/bus/golem-ne-tirane"],
 ["Love Albania — airport bus and taxi prices", "https://lovealbania.al/tirana-airport-to-city-center/"],
 ["Explorer Tom — best restaurants in Durrës", "https://explorertom.com/en/best-restaurants-durres/"],
 ["My Global Viewpoint — traditional food in Tirana", "https://www.myglobalviewpoint.com/restaurants-in-tirana-for-traditional-albanian-food/"],
 ["Tabiji — common Tirana scams", "https://tabiji.ai/scams/tirana/"],
 ["Map data © OpenStreetMap contributors (ODbL)", "https://www.openstreetmap.org/copyright"],
]
