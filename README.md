# Tracker Wolfs

Suivi automatique des matchs Clubs FC 27 du club **X2RUE PLK WOLfS**, sans PC allumé.

- Récupère les matchs chez EA (Ligue, Playoff, Tournoi) et les envoie au Google Sheet de l'équipe.
- Poste un résumé de chaque match et un bilan de fin de soirée sur Discord.
- Soirée (18h-00h, heure de Paris) : vérification toutes les 2 minutes. Le reste du temps : toutes les 30 minutes.

Secrets à renseigner (Settings > Secrets and variables > Actions) : `APPS_SCRIPT_URL`, `CLE_EXTENSION`, `DISCORD_WEBHOOK` (optionnel).
Aucune donnée personnelle n'est stockée dans ce dépôt : l'état est gardé dans le cache GitHub Actions.
