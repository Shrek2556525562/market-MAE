# Pharma France

Carte statique des entreprises pharmaceutiques en France. Les données sont
stockées localement dans `data/pharmaceutical-companies-fr.json` et ne sont pas
chargées depuis une API au runtime.

## Utilisation

Publiez `index.html`, `app.js` et `styles.css` sur un hébergement statique, puis
ouvrez la page avec une connexion Internet. Le fond de carte utilise les tuiles
IGN / Géoplateforme ; Leaflet et les polices sont chargés depuis des CDN.

Le workflow `.github/workflows/pages.yml` publie automatiquement le site sur
GitHub Pages après chaque mise à jour de `main` et peut aussi être lancé
manuellement depuis l’onglet **Actions**.

La liste répertorie toutes les entreprises actives classées en NAF 21.10Z ou
21.20Z ; les sièges sociaux sont cartographiés lorsque leurs coordonnées sont
disponibles. Le filtre **Sites industriels** ajoute les établissements actifs
portant l’un de ces deux codes, avec leurs coordonnées disponibles. Les
entreprises et sites sont filtrés localement dans l’instantané complet ; aucun
bouton de pagination ni requête vers l’API n’est nécessaire.

## Mettre à jour l’instantané

Pour régénérer le fichier statique, exécutez
`powershell -ExecutionPolicy Bypass -File scripts\build-static-data.ps1` depuis
la racine du dépôt. Cette tâche de maintenance interroge l’API publique et
remplace l’instantané local. Le site publié n’exécute pas ce script.

## Limites des données

L’instantané est construit à partir des recherches de l’API par activité
principale, puis par nom d’entreprise ; les établissements sont rattachés au
SIREN exact. La recherche demande jusqu’à 100 établissements correspondants
par entreprise. Seuls ceux actifs et classés en NAF 21.10Z ou 21.20Z avec des
coordonnées valides sont cartographiés. Les sites classés sous un autre code
NAF ou sans coordonnées ne sont pas affichés. Les données de l’API publique ne
constituent pas un inventaire exhaustif ou certifié des unités de production.
