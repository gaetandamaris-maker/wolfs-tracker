"""Tracker Wolfs : récupère les matchs Clubs FC 27 chez EA depuis les serveurs GitHub,
les envoie au Google Sheet (via le script Apps Script) et poste les résumés sur Discord.

Variables (secrets GitHub) :
  APPS_SCRIPT_URL  adresse /exec du script Google (celle de l'extension)
  CLE_EXTENSION    clé secrète du script (celle de l'extension)
  DISCORD_WEBHOOK  (optionnel) webhook du salon Discord
Options :
  --test           vérifie seulement qu'EA répond depuis ce serveur
  --envoi          renvoie au Sheet tous les matchs encore disponibles chez EA
  --bulletin       poste le bulletin de la semaine passée sur Discord
  --meta           calcule la méta du jour (archétypes, tailles, OVR des meilleurs clubs croisés)
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
# Noms d'archétypes en français (comme dans l'app)
ARCH = {1: "Dernier rempart", 2: "Gardien libéro", 3: "Facilitateur", 4: "Boss", 5: "Traqueur", 6: "Trouble-fête", 7: "Récupérateur",
        8: "Maestro", 9: "Créateur", 10: "Étincelle", 11: "Magicien", 12: "Finisseur", 13: "Point d'appui"}
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


def embed_bulletin(b):
    """Bulletin de la semaine (lundi matin) à partir du calcul fait par le script du Sheet."""
    v, nu, d = b.get("v", 0), b.get("n", 0), b.get("d", 0)
    couleur = VERT if v > d else ROUGE if d > v else AMBRE
    desc = (f"## 📰 BULLETIN DE LA SEMAINE\n-# du {b['debut']} au {b['fin']}\n"
            f"# {v}V · {nu}N · {d}D\n**{b['matchs']}** match(s) · **{b.get('bp', 0)}** buts marqués · **{b.get('bc', 0)}** encaissés")
    types = " · ".join(f"{t} {x['v']}/{x['m']}" for t, x in (b.get("parType") or {}).items())
    if types:
        desc += f"\n-# Victoires par type : {types}"
    champs = []
    sk = b.get("skill")
    if sk:
        dl = sk["fin"] - sk["debut"]
        fl = "📈" if dl > 0 else "📉" if dl < 0 else "➖"
        div = f"D{sk['divFin']}" + (f" (était D{sk['divDebut']})" if sk["divFin"] != sk["divDebut"] else "")
        champs.append({"name": f"{fl} Skill rating", "value": f"**{sk['debut']} → {sk['fin']}** ({dl:+d}) · {div}", "inline": False})
    j = b.get("joueur")
    if j:
        champs.append({"name": "🏆 Joueur de la semaine", "value": f"**{j['n']}** · **{j['note']:.2f}** de moyenne sur {j['mj']} match(s)"
                       + (f" · {j['b']} but(s)" if j["b"] else "") + (f" · {j['pd']} passe(s) D" if j["pd"] else "") + (f" · {j['hdm']}× HDM" if j.get("hdm") else ""), "inline": False})
    eq = b.get("equipe") or []
    if eq:
        ab = {"Gardien": "GB ", "Défenseur": "DEF", "Milieu": "MIL", "Attaquant": "ATT"}
        lignes = [f"{ab.get(l['ligne'], l['ligne'][:3])}  " + " · ".join(f"{x['n'][:13]} {x['note']:.1f}" for x in l["joueurs"]) for l in eq]
        champs.append({"name": "🧩 Équipe type de la semaine", "value": ("```\n" + "\n".join(lignes) + "\n```")[:1024], "inline": False})
    if b.get("buteurs"):
        champs.append({"name": "⚽ Les plus décisifs", "value": "\n".join(f"**{x['n']}** · {x['b']} B · {x['pd']} PD" for x in b["buteurs"]), "inline": True})
    forme = [f"📈 **{x['n']}** {x['note']:.2f} (+{x['delta']:.2f})" for x in b.get("enForme") or []] + [f"📉 **{x['n']}** {x['note']:.2f} ({x['delta']:.2f})" for x in b.get("enBaisse") or []]
    if forme:
        champs.append({"name": "🌡️ Forme", "value": "\n".join(forme), "inline": True})
    recs = [f"**{r['lib']}** : {r['val']}" + (f" par **{r['n']}**" if r["n"] else "") + (f" contre {r['adv']}" if r["adv"] else "") + f" *(ancien : {r['ancien']})*" for r in b.get("records") or []]
    if b.get("serieV"):
        recs.append(f"**{b['serieV']} victoires d'affilée** 🔥")
    if recs:
        champs.append({"name": "🔥 Records battus", "value": "\n".join(recs)[:1024], "inline": False})
    if b.get("mvp"):
        champs.append({"name": "🗳️ MVP votés par l'équipe", "value": " · ".join(f"<@{x['id']}> ×{x['nb']}" for x in b["mvp"]), "inline": False})
    return {"author": {"name": "X2RUE PLK WOLfS", "icon_url": NOTRE_ECUSSON}, "description": desc, "color": couleur, "fields": champs,
            "footer": {"text": "Bulletin automatique · Tracker Wolfs", "icon_url": NOTRE_ECUSSON}, "thumbnail": {"url": NOTRE_ECUSSON}}


def bulletin():
    url, cle = os.environ.get("APPS_SCRIPT_URL"), os.environ.get("CLE_EXTENSION")
    req = urllib.request.Request(url, data=json.dumps({"cle": cle, "bot": {"action": "bulletin"}}).encode("utf-8"), headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=90) as r:
        rep = json.loads(r.read().decode("utf-8"))
    if not rep.get("ok") or "bulletin" not in rep:
        print("::error::Bulletin indisponible (script du Sheet à jour ?) :", str(rep)[:300]); sys.exit(1)
    b = rep["bulletin"]
    if b.get("matchs") and os.environ.get("DISCORD_TOKEN") and os.environ.get("DISCORD_SALON"):
        try:  # version illustrée : image + mise en page Discord, générée par le bot Wolfs
            res = bulletin_par_bot()
            if res.get("ok") and res.get("message"):
                print(f"::notice::Bulletin illustré posté par le bot ({res.get('matchs')} matchs)"); return
            print("::warning::Bulletin illustré impossible :", str(res)[:300])
        except Exception as e:
            print("::warning::Bulletin illustré impossible, envoi en version simple :", str(e)[:300])
    if not b.get("matchs"):
        print(f"::notice::Aucun match du {b['debut']} au {b['fin']} : pas de bulletin. Diagnostic : {b.get('diag', 'script du Sheet sans diagnostic')}"); return
    if os.environ.get("DISCORD_TOKEN") and os.environ.get("DISCORD_SALON"):
        poster_bot(os.environ["DISCORD_SALON"], [embed_bulletin(b)])
        print(f"::notice::Bulletin posté par le bot dans le salon {os.environ['DISCORD_SALON']} ({b['matchs']} matchs)")
    elif os.environ.get("DISCORD_WEBHOOK"):
        discord([embed_bulletin(b)]); print("::notice::Bulletin posté via le webhook DISCORD_WEBHOOK (DISCORD_TOKEN absent)")
    else:
        print("::error::Ni bot ni webhook configuré : bulletin non posté."); sys.exit(1)
    print(f"Bulletin posté : {b['matchs']} match(s) du {b['debut']} au {b['fin']}")


# ---------------------------------------------------------------- méta (chaque jour)
def profil_brut(p):
    """Actions d'un joueur sur un match : champs EA + événements (même découpage que l'app)."""
    e = {}
    for i in range(4):
        for pr in (p.get(f"match_event_aggregate_{i}") or "").split(","):
            if ":" in pr:
                k, v = pr.split(":"); e[int(k)] = e.get(int(k), 0) + n(v)
    return {"tirs": n(p.get("shots")), "b": n(p.get("goals")), "pd": n(p.get("assists")), "pt": n(p.get("passattempts")), "pr": n(p.get("passesmade")),
            "tt": n(p.get("tackleattempts")), "tr": n(p.get("tacklesmade")), "drb": e.get(174, 0), "int": e.get(6, 0), "aer": e.get(265, 0) + e.get(266, 0),
            "cent": e.get(36, 0), "prof": e.get(152, 0), "uneT": e.get(143, 0), "recup": e.get(108, 0) + e.get(109, 0) + e.get(110, 0),
            "longR": e.get(28, 0), "pav": e.get(30, 0), "elim": e.get(112, 0)}


def meta(max_clubs=70, elite=25):
    """Ce que jouent les meilleurs clubs croisés autour de nous : archétype, taille, OVR, note et victoires par ligne.
    On part de nos adversaires, puis de leurs adversaires (les mieux classés d'abord), et on garde les clubs au meilleur skill rating."""
    vus, file, infos, matchs_club = set(), [], {}, {}
    def note_club(cid):
        o = (ea(f"clubs/overallStats?platform={PLATEFORME}&clubIds={cid}") or [{}])[0]
        return n(o.get("skillRating"))
    def matchs_de(cid):
        out = []
        for t in ("leagueMatch", "playoffMatch"):
            try:
                out += ea(f"clubs/matches?platform={PLATEFORME}&clubIds={cid}&matchType={t}&maxResultCount=10") or []
            except Exception as e:
                print("matchs", cid, e)
            time.sleep(0.6)
        return out
    for m in matchs_de(CLUB_ID):
        for k in m.get("clubs", {}):
            if k != CLUB_ID and k not in vus:
                vus.add(k); file.append(k)
    vus.add(CLUB_ID)
    while file and len(infos) < max_clubs:
        # on explore d'abord les clubs les mieux notés déjà connus
        file.sort(key=lambda c: -infos.get(c, {}).get("skill", 0))
        cid = file.pop(0)
        try:
            skill = note_club(cid); time.sleep(0.5)
            ms = matchs_de(cid)
        except Exception as e:
            print("club", cid, e); continue
        infos[cid] = {"skill": skill}
        matchs_club[cid] = ms
        for m in ms:
            for k, c in m.get("clubs", {}).items():
                if k not in vus:
                    vus.add(k); file.append(k)
    top = sorted(infos, key=lambda c: -infos[c]["skill"])[:elite]
    print(f"Méta : {len(infos)} clubs explorés, élite = {len(top)} clubs (skill {infos[top[-1]]['skill'] if top else 0} à {infos[top[0]]['skill'] if top else 0})")
    stats, nb_matchs = {}, 0
    for cid in top:
        tailles = {}
        try:
            for mb in (ea(f"members/stats?platform={PLATEFORME}&clubId={cid}") or {}).get("members", []):
                tailles[mb.get("name")] = (n(mb.get("proHeight")), n(mb.get("proOverall")))
            time.sleep(0.5)
        except Exception as e:
            print("membres", cid, e)
        for m in matchs_club.get(cid, []):
            js = (m.get("players") or {}).get(cid) or {}
            adv = next((k for k in m.get("clubs", {}) if k != cid), None)
            if not js or not adv:
                continue
            nb_matchs += 1
            g, ga = n(m["clubs"][cid].get("goals")), n(m["clubs"][adv].get("goals"))
            for p in js.values():
                ligne, arch = POSTE.get(p.get("pos"), ""), int(n(p.get("archetypeid")))
                if not ligne or not arch:
                    continue
                s = stats.setdefault((ligne, arch), {"u": 0, "note": 0.0, "v": 0, "t": [], "o": [], "clubs": set(), "noms": {}, "min": 0.0, "f": {}})
                s["u"] += 1; s["note"] += n(p.get("rating")); s["v"] += g > ga; s["clubs"].add(cid)
                mins = n(p.get("secondsPlayed")) / 60
                if mins >= 30:
                    s["min"] += mins
                    for k, val in profil_brut(p).items():
                        s["f"][k] = s["f"].get(k, 0) + val
                t, o = tailles.get(p.get("playername"), (0, 0))
                if t: s["t"].append(t)
                if o: s["o"].append(o)
                s["noms"][p.get("playername")] = s["noms"].get(p.get("playername"), 0) + 1
    tot = {}
    for (ligne, arch), s in stats.items():
        tot[ligne] = tot.get(ligne, 0) + s["u"]
    date = datetime.now(PARIS).strftime("%d/%m/%Y %H:%M")
    lignes = []
    for (ligne, arch), s in sorted(stats.items(), key=lambda kv: (kv[0][0], -kv[1]["u"])):
        moy = lambda l: round(sum(l) / len(l), 1) if l else ""
        ex = ", ".join(k for k, _ in sorted(s["noms"].items(), key=lambda kv: -kv[1])[:3])
        prof = {k: round(v / s["min"] * 90, 2) for k, v in s["f"].items()} if s["min"] >= 90 else {}
        if prof:
            prof["pPass"] = round(100 * s["f"].get("pr", 0) / max(1, s["f"].get("pt", 0)))
            prof["pTacl"] = round(100 * s["f"].get("tr", 0) / max(1, s["f"].get("tt", 0)))
            prof["min"] = round(s["min"])
        lignes.append([date, ligne, arch, ARCH.get(arch, str(arch)), s["u"], round(100 * s["u"] / tot[ligne]), round(s["note"] / s["u"], 2),
                       round(100 * s["v"] / s["u"]), moy(s["t"]), moy(s["o"]), len(s["clubs"]), ex, json.dumps(prof, separators=(",", ":"))])
    resume = {"date": date, "clubs": len(top), "explores": len(infos), "matchs": nb_matchs,
              "skillMin": infos[top[-1]]["skill"] if top else 0, "skillMax": infos[top[0]]["skill"] if top else 0}
    return lignes, resume


def discord(embeds):
    url = os.environ.get("DISCORD_WEBHOOK")
    if not url or not embeds:
        return
    for i in range(0, len(embeds), 10):
        req = urllib.request.Request(url, data=json.dumps({"username": "Tracker Wolfs", "embeds": embeds[i:i + 10]}).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "TrackerWolfs/1.0"})
        urllib.request.urlopen(req, timeout=20).read()
        time.sleep(1)


def bulletin_par_bot():
    """Demande au bot (Cloudflare) de dessiner et poster le bulletin. Son adresse est lue chez Discord."""
    h = {"Authorization": "Bot " + os.environ["DISCORD_TOKEN"], "User-Agent": "DiscordBot (https://github.com/gaetandamaris-maker/wolfs-tracker, 1.0)"}
    with urllib.request.urlopen(urllib.request.Request("https://discord.com/api/v10/applications/@me", headers=h), timeout=20) as r:
        app = json.loads(r.read().decode())
    base = (app.get("interactions_endpoint_url") or "").rsplit("/interactions", 1)[0]
    if not base:
        raise RuntimeError("adresse du bot inconnue")
    req = urllib.request.Request(base + "/bulletin", data=json.dumps({"salon": os.environ["DISCORD_SALON"]}).encode(),
                                 headers={"Content-Type": "application/json", "x-cle": os.environ.get("CLE_EXTENSION", ""), "User-Agent": "TrackerWolfs/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "erreur": e.read().decode("utf-8", "replace")[:300]}


def poster_bot(salon, embeds):
    """Poste avec le bot Wolfs (même bot que les dispos) dans un salon donné."""
    req = urllib.request.Request(f"https://discord.com/api/v10/channels/{salon}/messages", data=json.dumps({"embeds": embeds[:10]}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bot " + os.environ["DISCORD_TOKEN"],
                                          "User-Agent": "DiscordBot (https://github.com/gaetandamaris-maker/wolfs-tracker, 1.0)"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except urllib.error.HTTPError as e:
        print(f"::error::Discord a refusé le bulletin ({e.code}) : {e.read().decode('utf-8', 'replace')[:300]}"); sys.exit(1)


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
    if "--meta" in sys.argv:
        lignes, resume = meta()
        if not lignes:
            print("Méta : aucune donnée"); sys.exit(1)
        json.dump({"lignes": lignes, "resume": resume}, open("meta.json", "w"), ensure_ascii=False, indent=1)
        rep = envoyer_sheet({"meta": {"lignes": lignes, "resume": resume}})
        print(f"Méta envoyée : {len(lignes)} lignes, {resume}")
        if not rep or not rep.get("ok"):
            sys.exit(1)
        return
    if "--bulletin" in sys.argv:
        bulletin(); return
    if "--envoi" in sys.argv:
        # renvoie au Sheet tous les matchs encore chez EA (10 par type) : complète les colonnes ajoutées après coup
        rep = envoyer_sheet(recuperer())
        if not rep or not rep.get("ok"):
            print("Envoi refusé :", rep); sys.exit(1)
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
