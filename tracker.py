"""Tracker Wolfs : récupère les matchs Clubs FC 27 chez EA depuis les serveurs GitHub,
les envoie au Google Sheet (via le script Apps Script) et poste les résumés sur Discord.

Variables (secrets GitHub) :
  APPS_SCRIPT_URL  adresse /exec du script Google (celle de l'extension)
  CLE_EXTENSION    clé secrète du script (celle de l'extension)
  DISCORD_WEBHOOK  (optionnel) webhook du salon Discord
Options :
  --test           vérifie seulement qu'EA répond depuis ce serveur
  --boucle MIN     reste actif MIN minutes et vérifie toutes les 2 minutes
"""
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

CLUB_ID = "1769531"
PLATEFORME = "common-gen5"
BASE = "https://proclubs.ea.com/api/fc/"
ETAT = "etat.json"
FIN_SESSION_MIN = 45          # pas de match depuis 45 min = fin de soirée
HEADERS = {
    "accept": "application/json",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "referer": "https://proclubs.ea.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
}
TYPES = {"leagueMatch": "Ligue", "playoffMatch": "Playoff", "friendlyMatch": "Tournoi"}
ARCH = {1: "Shot Stopper", 2: "Sweeper Keeper", 3: "Progressor", 4: "Boss", 5: "Marauder", 6: "Disruptor", 7: "Recycler",
        8: "Maestro", 9: "Creator", 10: "Spark", 11: "Magician", 12: "Finisher", 13: "Target"}
from zoneinfo import ZoneInfo
PARIS = ZoneInfo("Europe/Paris")


def ea(chemin):
    req = urllib.request.Request(BASE + chemin, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        t = r.read().decode("utf-8")
    return json.loads(t) if t and t != "null" else []


def n(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def alleger(m):
    clubs = {cid: {"goals": c.get("goals"), "winnerByDnf": c.get("winnerByDnf"), "details": {"name": (c.get("details") or {}).get("name")}}
             for cid, c in (m.get("clubs") or {}).items()}
    agg = {cid: (a if cid == CLUB_ID else {"goals": a.get("goals")}) for cid, a in (m.get("aggregate") or {}).items()}
    return {"matchId": m["matchId"], "timestamp": m["timestamp"], "clubs": clubs,
            "players": {CLUB_ID: (m.get("players") or {}).get(CLUB_ID, {})}, "aggregate": agg}


def recuperer():
    donnees = {}
    for t in TYPES:
        liste = ea(f"clubs/matches?platform={PLATEFORME}&clubIds={CLUB_ID}&matchType={t}&maxResultCount=10")
        donnees[t] = [alleger(m) for m in liste] if isinstance(liste, list) else []
        time.sleep(1)
    donnees["members"] = ea(f"members/stats?platform={PLATEFORME}&clubId={CLUB_ID}")
    return donnees


def envoyer_sheet(donnees):
    url, cle = os.environ.get("APPS_SCRIPT_URL"), os.environ.get("CLE_EXTENSION")
    if not url or not cle:
        print("Sheet : secrets APPS_SCRIPT_URL / CLE_EXTENSION absents, envoi ignoré")
        return None
    corps = json.dumps({"cle": cle, "clubId": CLUB_ID, **donnees}).encode("utf-8")
    req = urllib.request.Request(url, data=corps, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rep = json.loads(r.read().decode("utf-8"))
    print("Sheet :", rep)
    return rep


# ---------------------------------------------------------------- résumés
def score_reel(m):
    me = m["clubs"].get(CLUB_ID, {})
    adv_id = next((k for k in m["clubs"] if k != CLUB_ID), "")
    adv = m["clubs"].get(adv_id, {})
    bp, bc = int(n(me.get("goals"))), int(n(adv.get("goals")))
    forfait = ""
    a1, a2 = m["aggregate"].get(CLUB_ID), m["aggregate"].get(adv_id)
    if a1 and a2 and (bp, bc) in ((3, 0), (0, 3)) and (int(n(a1.get("goals"))), int(n(a2.get("goals")))) != (bp, bc):
        forfait = f"Forfait (score EA {bp}-{bc})"
        bp, bc = int(n(a1.get("goals"))), int(n(a2.get("goals")))
    return bp, bc, (adv.get("details") or {}).get("name") or adv_id, forfait


def joueurs(m):
    out = []
    for p in m["players"].get(CLUB_ID, {}).values():
        out.append({"n": p.get("playername", "?"), "note": n(p.get("rating")), "b": int(n(p.get("goals"))), "pd": int(n(p.get("assists"))),
                    "mom": p.get("mom") == "1", "arch": ARCH.get(int(n(p.get("archetypeid"))), "")})
    return sorted(out, key=lambda x: -x["note"])


def embed_match(m, typ):
    bp, bc, adv, forfait = score_reel(m)
    res = "Victoire" if bp > bc else "Défaite" if bp < bc else "Nul"
    couleur = 0x2F9E6C if bp > bc else 0xC7363B if bp < bc else 0xC9A227
    js = joueurs(m)
    hdm = next((j for j in js if j["mom"]), None)
    buteurs = ", ".join(f'{j["n"]} ×{j["b"]}' if j["b"] > 1 else j["n"] for j in js if j["b"]) or "—"
    passeurs = ", ".join(f'{j["n"]} ×{j["pd"]}' if j["pd"] > 1 else j["n"] for j in js if j["pd"]) or "—"
    top = "\n".join(f'`{j["note"]:.1f}` {j["n"]}' + (f' · {j["arch"]}' if j["arch"] else "") for j in js[:3]) or "—"
    champs = [{"name": "Buteurs", "value": buteurs, "inline": True}, {"name": "Passeurs", "value": passeurs, "inline": True},
              {"name": "Top 3 des notes", "value": top, "inline": False}]
    if hdm:
        champs.insert(0, {"name": "Homme du match", "value": f'⭐ {hdm["n"]} ({hdm["note"]:.1f})', "inline": False})
    if forfait:
        champs.append({"name": "Attention", "value": forfait, "inline": False})
    return {"title": f"{res} {bp}-{bc} contre {adv}", "description": f"{typ} · X2RUE PLK WOLfS", "color": couleur,
            "fields": champs, "timestamp": datetime.fromtimestamp(m["timestamp"], timezone.utc).isoformat()}


def embed_bilan(session):
    session = sorted(session, key=lambda x: x[1]["timestamp"])
    v = d = nu = bp_t = bc_t = 0
    perf = {}
    for typ, m in session:
        bp, bc, _, _ = score_reel(m)
        bp_t += bp; bc_t += bc
        v += bp > bc; d += bp < bc; nu += bp == bc
        for j in joueurs(m):
            s = perf.setdefault(j["n"], {"mj": 0, "note": 0, "b": 0, "pd": 0, "mom": 0})
            s["mj"] += 1; s["note"] += j["note"]; s["b"] += j["b"]; s["pd"] += j["pd"]; s["mom"] += j["mom"]
    classes = sorted(perf.items(), key=lambda kv: -(kv[1]["note"] / kv[1]["mj"]))
    joueur_soir = classes[0] if classes else None
    lignes = "\n".join(f'`{s["note"]/s["mj"]:.2f}` {nom} · {s["mj"]} MJ · {s["b"]} B · {s["pd"]} PD' for nom, s in classes[:5])
    debut = datetime.fromtimestamp(session[0][1]["timestamp"], PARIS).strftime("%d/%m %Hh%M")
    fin = datetime.fromtimestamp(session[-1][1]["timestamp"], PARIS).strftime("%Hh%M")
    champs = [{"name": "Bilan", "value": f"**{v}V {nu}N {d}D** · {bp_t} buts marqués, {bc_t} encaissés", "inline": False}]
    if joueur_soir:
        nom, s = joueur_soir
        champs.append({"name": "Joueur de la soirée", "value": f'🏆 {nom} : {s["note"]/s["mj"]:.2f} de moyenne, {s["b"]} but(s), {s["pd"]} passe(s) D', "inline": False})
    champs.append({"name": "Classement de la soirée (note moyenne)", "value": lignes or "—", "inline": False})
    return {"title": f"Bilan de la session · {len(session)} match(s)", "description": f"Du {debut} à {fin}",
            "color": 0xFEA40B, "fields": champs}


def discord(embeds):
    url = os.environ.get("DISCORD_WEBHOOK")
    if not url or not embeds:
        return
    for i in range(0, len(embeds), 10):
        req = urllib.request.Request(url, data=json.dumps({"username": "Tracker Wolfs", "embeds": embeds[i:i + 10]}).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "TrackerWolfs/1.0"})
        urllib.request.urlopen(req, timeout=20).read()
        time.sleep(1)


def charger_etat():
    try:
        return json.load(open(ETAT))
    except Exception:
        return {"vus": [], "session": [], "init": False}


def un_tour(etat):
    donnees = recuperer()
    tous = [(TYPES[t], m) for t in TYPES for m in donnees[t]]
    tous.sort(key=lambda x: x[1]["timestamp"])
    nouveaux = [(t, m) for t, m in tous if m["matchId"] not in etat["vus"]]
    print(f"EA : {len(tous)} matchs lus, {len(nouveaux)} nouveau(x)")
    if nouveaux:
        envoyer_sheet(donnees)
    embeds = []
    if etat["init"]:
        embeds += [embed_match(m, t) for t, m in nouveaux]
    for t, m in nouveaux:
        etat["vus"].append(m["matchId"])
        etat["session"].append({"t": t, "m": m})
    etat["vus"] = etat["vus"][-300:]
    # fin de soirée : plus de match depuis FIN_SESSION_MIN minutes
    if etat["session"]:
        dernier = etat["session"][-1]["m"]["timestamp"]
        if time.time() - dernier > FIN_SESSION_MIN * 60:
            if etat["init"]:
                embeds.append(embed_bilan([(s["t"], s["m"]) for s in etat["session"]]))
            etat["session"] = []
    if not etat["init"]:
        etat["init"] = True
        etat["session"] = []
        print("Première exécution : matchs existants mémorisés, pas de message Discord.")
    discord(embeds)
    return bool(nouveaux)


def main():
    if "--test" in sys.argv:
        for t in TYPES:
            try:
                liste = ea(f"clubs/matches?platform={PLATEFORME}&clubIds={CLUB_ID}&matchType={t}&maxResultCount=10")
                print(f"OK {t} : {len(liste)} match(s)")
            except urllib.error.HTTPError as e:
                print(f"BLOQUÉ {t} : HTTP {e.code}"); sys.exit(1)
            except Exception as e:
                print(f"BLOQUÉ {t} : {e}"); sys.exit(1)
        return
    minutes = int(sys.argv[sys.argv.index("--boucle") + 1]) if "--boucle" in sys.argv else 0
    fin = time.time() + minutes * 60
    etat = charger_etat()
    while True:
        try:
            un_tour(etat)
        except Exception as e:
            print("Erreur :", e)
        json.dump(etat, open(ETAT, "w"))
        if time.time() + 120 > fin:
            break
        time.sleep(120)


if __name__ == "__main__":
    main()
