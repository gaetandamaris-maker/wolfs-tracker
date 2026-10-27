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
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
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


CHAMPS_ADV = ["playername", "pos", "archetypeid", "rating", "secondsPlayed", "goals", "assists", "shots",
              "passesmade", "passattempts", "tacklesmade", "tackleattempts", "saves", "mom"]


def alleger(m):
    clubs = {cid: {"goals": c.get("goals"), "winnerByDnf": c.get("winnerByDnf"), "TEAM": c.get("TEAM"), "details": {"name": (c.get("details") or {}).get("name")}}
             for cid, c in (m.get("clubs") or {}).items()}
    agg = {cid: (a if cid == CLUB_ID else {"goals": a.get("goals")}) for cid, a in (m.get("aggregate") or {}).items()}
    joueurs = {}
    for cid, js in (m.get("players") or {}).items():
        # nos joueurs : tout ; adversaires : l'essentiel pour la feuille de match
        joueurs[cid] = js if cid == CLUB_ID else {pid: {k: p.get(k) for k in CHAMPS_ADV} for pid, p in js.items()}
    return {"matchId": m["matchId"], "timestamp": m["timestamp"], "clubs": clubs, "players": joueurs, "aggregate": agg}


def recuperer():
    donnees = {}
    for t in TYPES:
        liste = ea(f"clubs/matches?platform={PLATEFORME}&clubIds={CLUB_ID}&matchType={t}&maxResultCount=10")
        donnees[t] = [alleger(m) for m in liste] if isinstance(liste, list) else []
        time.sleep(1)
    donnees["members"] = ea(f"members/stats?platform={PLATEFORME}&clubId={CLUB_ID}")
    return donnees


# ---------------------------------------------------------------- scouting
NOM_CLUB = "X2RUE PLK WOLfS"
POSTE = {"forward": "Attaquant", "midfielder": "Milieu", "defender": "Défenseur", "goalkeeper": "Gardien"}


def division_de(club_id, nom):
    for scope in ("currentSeasonLeaderboard", "allTimeLeaderboard"):
        try:
            for c in ea(f"{scope}/search?platform={PLATEFORME}&clubName=" + urllib.parse.quote(nom)) or []:
                if str(c.get("clubId")) == str(club_id):
                    return int(n(c.get("currentDivision"))), int(n(c.get("bestDivision")))
        except Exception:
            pass
    return 0, 0


def scouter(club_id):
    """Ligne de l'onglet Scouting pour un club (format partagé avec l'app)."""
    info = (ea(f"clubs/info?platform={PLATEFORME}&clubIds={club_id}") or {}).get(str(club_id), {})
    nom = info.get("name") or str(club_id)
    kit = info.get("customKit") or {}
    ecusson = kit.get("crestAssetId") if kit.get("selectedKitType") == "1" else info.get("teamId")
    o = (ea(f"clubs/overallStats?platform={PLATEFORME}&clubIds={club_id}") or [{}])[0]
    mem = (ea(f"members/stats?platform={PLATEFORME}&clubId={club_id}") or {}).get("members", [])
    div, best = division_de(club_id, nom)
    forme = "".join({"1": "V", "2": "D", "3": "N"}.get(str(o.get(f"lastMatch{i}")), "") for i in range(10))
    joueurs = sorted([m for m in mem if n(m.get("gamesPlayed")) > 0], key=lambda m: -n(m.get("gamesPlayed")))[:12]
    js = [[m.get("name"), POSTE.get(m.get("favoritePosition"), ""), int(n(m.get("gamesPlayed"))), int(n(m.get("goals"))), int(n(m.get("assists"))),
           n(m.get("ratingAve")), int(n(m.get("proOverall"))), int(n(m.get("manOfTheMatch"))), int(n(m.get("passSuccessRate"))), int(n(m.get("proHeight")))] for m in joueurs]
    return [str(club_id), nom, "", div, int(n(o.get("skillRating"))), int(n(o.get("gamesPlayed"))), int(n(o.get("wins"))), int(n(o.get("ties"))),
            int(n(o.get("losses"))), int(n(o.get("goals"))), int(n(o.get("goalsAgainst"))), forme, json.dumps(js, ensure_ascii=False), str(ecusson or ""), best]


def instantane_club():
    o = (ea(f"clubs/overallStats?platform={PLATEFORME}&clubIds={CLUB_ID}") or [{}])[0]
    div, _ = division_de(CLUB_ID, NOM_CLUB)
    return {"skill": n(o.get("skillRating")), "division": div, "rep": n(o.get("reputationtier")), "mj": n(o.get("gamesPlayed")),
            "v": n(o.get("wins")), "n": n(o.get("ties")), "d": n(o.get("losses")), "buts": n(o.get("goals")), "encaisses": n(o.get("goalsAgainst"))}


def envoyer_sheet(donnees):
    url, cle = os.environ.get("APPS_SCRIPT_URL"), os.environ.get("CLE_EXTENSION")
    if not url or not cle:
        print("Sheet : secrets APPS_SCRIPT_URL / CLE_EXTENSION absents, envoi ignoré")
        return None
    corps = json.dumps({"cle": cle, "clubId": CLUB_ID, "source": "GitHub", **donnees}).encode("utf-8")
    req = urllib.request.Request(url, data=corps, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rep = json.loads(r.read().decode("utf-8"))
    print("Sheet :", rep)
    return rep


# ---------------------------------------------------------------- résumés
DISCORD_TYPES = {"Tournoi"}   # seuls les tournois (amicaux EA) sont postés sur Discord
CREST = "https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l{}.png"
NOTRE_ECUSSON = CREST.format("99160204")
JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
VERT, ROUGE, OR, AMBRE = 0x2F9E6C, 0xDB1012, 0xC9A227, 0xFEA40B


def quand(ts, avec_jour=True):
    d = datetime.fromtimestamp(ts, PARIS)
    return (f"{JOURS[d.weekday()]} {d:%d/%m} · " if avec_jour else "") + f"{d:%Hh%M}"


def score_reel(m):
    me = m["clubs"].get(CLUB_ID, {})
    adv_id = next((k for k in m["clubs"] if k != CLUB_ID), "")
    adv = m["clubs"].get(adv_id, {})
    bp, bc = int(n(me.get("goals"))), int(n(adv.get("goals")))
    forfait = ""
    a1, a2 = m["aggregate"].get(CLUB_ID), m["aggregate"].get(adv_id)
    if a1 and a2 and (bp, bc) in ((3, 0), (0, 3)) and (int(n(a1.get("goals"))), int(n(a2.get("goals")))) != (bp, bc):
        forfait = f"EA a inscrit {bp}-{bc} après un abandon : score réel affiché"
        bp, bc = int(n(a1.get("goals"))), int(n(a2.get("goals")))
    return bp, bc, (adv.get("details") or {}).get("name") or adv_id, forfait


def ecusson_adv(m):
    adv_id = next((k for k in m["clubs"] if k != CLUB_ID), "")
    team = m["clubs"].get(adv_id, {}).get("TEAM")
    return CREST.format(team) if team else None


def joueurs(m):
    out = []
    for p in m["players"].get(CLUB_ID, {}).values():
        out.append({"n": p.get("playername", "?"), "note": n(p.get("rating")), "b": int(n(p.get("goals"))), "pd": int(n(p.get("assists"))),
                    "pt": int(n(p.get("passattempts"))), "pr": int(n(p.get("passesmade"))),
                    "tt": int(n(p.get("tackleattempts"))), "tr": int(n(p.get("tacklesmade"))),
                    "mom": p.get("mom") == "1", "arch": ARCH.get(int(n(p.get("archetypeid"))), "")})
    return sorted(out, key=lambda x: -x["note"])


def pastille(bp, bc):
    return "🟩" if bp > bc else "🟥" if bp < bc else "🟨"


def liste_noms(js, cle):
    l = [f'{j["n"]}' + (f' ({j[cle]})' if j[cle] > 1 else "") for j in js if j[cle]]
    return ", ".join(l) if l else "—"


def tableau(lignes, entete):
    return "```\n" + entete + "\n" + "\n".join(lignes) + "\n```"


def embed_match(m, typ):
    bp, bc, adv, forfait = score_reel(m)
    res, couleur = ("VICTOIRE", VERT) if bp > bc else ("DÉFAITE", ROUGE) if bp < bc else ("MATCH NUL", OR)
    js = joueurs(m)
    hdm = next((j for j in js if j["mom"]), None)
    pt = sum(j["pt"] for j in js); pr = sum(j["pr"] for j in js); tt = sum(j["tt"] for j in js); tr = sum(j["tr"] for j in js)
    desc = f"## {pastille(bp, bc)} {res}\n# WOLfS  {bp} - {bc}  {adv}\n-# {typ} · {quand(m['timestamp'])}"
    if forfait:
        desc += f"\n> ⚠️ {forfait}"
    champs = []
    if hdm:
        champs.append({"name": "⭐ Homme du match", "value": f'**{hdm["n"]}** · note **{hdm["note"]:.1f}**' + (f' · {hdm["b"]} but(s)' if hdm["b"] else "") + (f' · {hdm["pd"]} passe(s) D' if hdm["pd"] else ""), "inline": False})
    champs += [{"name": "⚽ Buteurs", "value": liste_noms(js, "b"), "inline": True},
               {"name": "🎯 Passeurs", "value": liste_noms(js, "pd"), "inline": True}]
    lignes = [f'{j["note"]:>4.1f}  {j["n"][:15]:<15} {j["b"]:>1} {j["pd"]:>2}  {j["pr"]:>2}/{j["pt"]:<2}' + (" ★" if j["mom"] else "") for j in js]
    if lignes:
        champs.append({"name": "📋 Feuille de match", "value": tableau(lignes, "NOTE  JOUEUR          B PD  PASSES"), "inline": False})
    champs.append({"name": "📊 Équipe", "value": f"Passes **{pr}/{pt}**" + (f" ({round(pr / pt * 100)} %)" if pt else "") + f" · Tacles **{tr}/{tt}**", "inline": False})
    e = {"author": {"name": "X2RUE PLK WOLfS", "icon_url": NOTRE_ECUSSON}, "description": desc, "color": couleur, "fields": champs,
         "footer": {"text": "Tracker Wolfs · stats officielles EA", "icon_url": NOTRE_ECUSSON},
         "timestamp": datetime.fromtimestamp(m["timestamp"], timezone.utc).isoformat()}
    ec = ecusson_adv(m)
    if ec:
        e["thumbnail"] = {"url": ec}
    return e


def embed_bilan(session):
    session = sorted(session, key=lambda x: x[1]["timestamp"])
    v = d = nu = bp_t = bc_t = cs = 0
    perf, resultats, serie = {}, [], ""
    for typ, m in session:
        bp, bc, adv, forfait = score_reel(m)
        bp_t += bp; bc_t += bc; cs += bc == 0
        v += bp > bc; d += bp < bc; nu += bp == bc
        serie += pastille(bp, bc)
        resultats.append(f"{pastille(bp, bc)} `{bp}-{bc}` {adv}" + (" · *forfait*" if forfait else ""))
        for j in joueurs(m):
            s = perf.setdefault(j["n"], {"mj": 0, "note": 0, "b": 0, "pd": 0, "mom": 0})
            s["mj"] += 1; s["note"] += j["note"]; s["b"] += j["b"]; s["pd"] += j["pd"]; s["mom"] += j["mom"]
    classes = sorted(perf.items(), key=lambda kv: -(kv[1]["note"] / kv[1]["mj"]))
    couleur = VERT if v > d else ROUGE if d > v else AMBRE
    debut, fin = quand(session[0][1]["timestamp"]), quand(session[-1][1]["timestamp"], False)
    desc = f"## 🏁 BILAN DU TOURNOI\n# {v}V · {nu}N · {d}D\n{serie}\n-# {debut} → {fin} · {len(session)} match(s)"
    champs = [{"name": "📅 Résultats", "value": "\n".join(resultats)[:1024], "inline": False}]
    if classes:
        nom, s = classes[0]
        champs.append({"name": "🏆 Joueur du tournoi", "value": f'**{nom}** · **{s["note"]/s["mj"]:.2f}** de moyenne sur {s["mj"]} match(s)'
                       + (f' · {s["b"]} but(s)' if s["b"] else "") + (f' · {s["pd"]} passe(s) D' if s["pd"] else "") + (f' · {s["mom"]}× homme du match' if s["mom"] else ""), "inline": False})
        lignes = [f'{i+1:>2}. {nm[:15]:<15} {st["note"]/st["mj"]:>4.2f} {st["mj"]:>2} {st["b"]:>2} {st["pd"]:>2}' for i, (nm, st) in enumerate(classes[:8])]
        champs.append({"name": "📋 Classement (note moyenne)", "value": tableau(lignes, "    JOUEUR          NOTE MJ  B PD"), "inline": False})
    champs.append({"name": "📊 Totaux", "value": f"**{bp_t}** buts marqués · **{bc_t}** encaissés · **{cs}** clean sheet(s)", "inline": False})
    return {"author": {"name": "X2RUE PLK WOLfS", "icon_url": NOTRE_ECUSSON}, "description": desc, "color": couleur, "fields": champs,
            "footer": {"text": "Tracker Wolfs · stats officielles EA", "icon_url": NOTRE_ECUSSON},
            "thumbnail": {"url": NOTRE_ECUSSON}}


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
        extras = {}
        try:
            extras["club"] = instantane_club()
        except Exception as e:
            print("Instantané club impossible :", e)
        adv_ids = {next((k for k in m["clubs"] if k != CLUB_ID), "") for _, m in nouveaux}
        scoutes = etat.setdefault("scoutes", {})
        lignes = []
        for cid in adv_ids:
            if not cid or time.time() - scoutes.get(cid, 0) < 6 * 3600:
                continue
            try:
                lignes.append(scouter(cid)); scoutes[cid] = time.time(); time.sleep(1)
            except Exception as e:
                print("Scouting impossible pour", cid, ":", e)
        if lignes:
            extras["scouting"] = lignes
        envoyer_sheet({**donnees, **extras})
    embeds = []
    if etat["init"]:
        embeds += [embed_match(m, t) for t, m in nouveaux if t in DISCORD_TYPES]
    for t, m in nouveaux:
        etat["vus"].append(m["matchId"])
        if t in DISCORD_TYPES:
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
    if "--test-discord" in sys.argv:
        if not os.environ.get("DISCORD_WEBHOOK"):
            print("Secret DISCORD_WEBHOOK absent"); sys.exit(1)
        donnees = recuperer()
        tous = sorted([(TYPES[t], m) for t in TYPES for m in donnees[t] if TYPES[t] in DISCORD_TYPES], key=lambda x: x[1]["timestamp"])
        # dernière soirée : matchs séparés de moins de 45 min du précédent
        soiree = [tous[-1]]
        for t, m in reversed(tous[:-1]):
            if soiree[0][1]["timestamp"] - m["timestamp"] > FIN_SESSION_MIN * 60:
                break
            soiree.insert(0, (t, m))
        e1 = embed_match(tous[-1][1], tous[-1][0]); e1["title"] = "🧪 Message de test"
        e2 = embed_bilan(soiree); e2["title"] = "🧪 Message de test"
        discord([e1, e2])
        print(f"Discord : 2 messages de test envoyés (soirée de {len(soiree)} matchs)")
        return
    if "--scout" in sys.argv:
        nom = sys.argv[sys.argv.index("--scout") + 1].strip()
        trouves = []
        for scope in ("currentSeasonLeaderboard", "allTimeLeaderboard"):
            for c in ea(f"{scope}/search?platform={PLATEFORME}&clubName=" + urllib.parse.quote(nom)) or []:
                if all(str(c.get("clubId")) != str(t.get("clubId")) for t in trouves):
                    trouves.append(c)
        if not trouves:
            print(f"Aucun club trouvé pour « {nom} »"); sys.exit(1)
        exact = [c for c in trouves if (c.get("clubName") or "").lower() == nom.lower()]
        choix = (exact or trouves)[0]
        print("Clubs trouvés :", ", ".join(f'{c.get("clubName")} ({c.get("clubId")})' for c in trouves[:8]))
        print("Club scouté :", choix.get("clubName"), choix.get("clubId"))
        envoyer_sheet({"scouting": [scouter(choix["clubId"])]})
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
