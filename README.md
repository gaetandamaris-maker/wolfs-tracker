# Tracker Wolfs

Suivi automatique des matchs Clubs FC 27 du club **X2RUE PLK WOLfS**, sans PC allumé.

- Récupère les matchs chez EA (Ligue, Playoff, Tournoi) et les envoie au Google Sheet de l'équipe.
- Poste sur Discord un résumé de chaque match de tournoi (amicaux EA) et le bilan du tournoi en fin de soirée.
- Soirée (18h-00h, heure de Paris) : vérification toutes les 2 minutes. Le reste du temps : toutes les 30 minutes.

Secrets à renseigner (Settings > Secrets and variables > Actions) : `APPS_SCRIPT_URL`, `CLE_EXTENSION`, `DISCORD_WEBHOOK` (optionnel).
Aucune donnée personnelle n'est stockée dans ce dépôt : l'état est gardé dans le cache GitHub Actions.

## Bot Discord (dossier `bot/`)

Bot des Wolfs hébergé gratuitement sur Cloudflare Workers ; toutes les données sont dans le Google Sheet.

- `/dispo titre date heure [competition]` : session avec boutons Présent / Indécis / Absent (liste mise à jour en direct)
- rappel automatique 1 h avant aux joueurs qui n'ont pas répondu et aux indécis
- compo publiée depuis l'app (onglet Compo › Publier sur Discord) : image du terrain + mentions des joueurs
- `/mvp [minutes]` : vote MVP de la dernière session, avec les stats EA du soir ; résultat posté à la fin
- `/classement [semaine|mois|total]`, `/lier pseudo_ea [postes]`, `/compo`

Déploiement : workflow **Bot Discord** (automatique à chaque modification du dossier `bot/`).
Secrets nécessaires : `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`
(plus `APPS_SCRIPT_URL` et `CLE_EXTENSION`, déjà là pour le tracker).
