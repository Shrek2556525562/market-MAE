# Pharma France

Carte statique des entreprises pharmaceutiques en France. Les données sont
stockées localement dans `data/pharmaceutical-companies-fr.json` et regroupées
dans `data/pharma-static-data.js` pour être affichées sans requête au runtime.

## Utilisation

Ouvrez `panorama.html`, `index.html`, `formations.html` ou `dataset.html`, ou
publiez les fichiers du site statique. Les données et les bibliothèques sont
servies localement, sans CDN ni requête d’API. Les pages `index.html` et
`formations.html` utilisent un fond SVG local et fonctionnent hors ligne. Le
panorama conserve le fond de carte IGN, qui nécessite une connexion Internet ;
le SVG local reste visible si les tuiles ne peuvent pas être chargées.

Le workflow `.github/workflows/pages.yml` publie automatiquement le site sur
GitHub Pages après chaque mise à jour de `main` et peut aussi être lancé
manuellement depuis l’onglet **Actions**.

La liste répertorie toutes les entreprises actives classées en NAF 21.10Z ou
21.20Z ; les sièges sociaux sont cartographiés lorsque leurs coordonnées sont
disponibles. Le filtre **Sites industriels** ajoute les établissements actifs
portant l’un de ces deux codes, avec leurs coordonnées disponibles. Les
entreprises et sites sont filtrés localement dans l’instantané complet ; aucun
bouton de pagination ni requête vers l’API n’est nécessaire.

La page `formations.html` ajoute une carte des formations ciblées en pharmacie,
biotechnologies et sciences biomédicales, ainsi que des couches optionnelles
pour les entreprises et les sites industriels. Son instantané est construit
depuis l’export Parcoursup 2025 avec `python scripts/build-pharma-training-data.py`
et contient actuellement 331 formations géolocalisées en métropole. Après mise
à jour des instantanés, générez le bundle lu directement par les pages avec
`python scripts/build-browser-data.py`. Les contours métropolitains
proviennent du dépôt [france-geojson](https://github.com/gregoiredavid/france-geojson),
lui-même fondé sur les tracés IGN Admin Express sous Licence Ouverte. Le fichier
SVG local est reproductible avec `python scripts/build-france-map.py`.
Les forums ne sont pas livrés dans les jeux de données locaux : la page renvoie
vers les agendas de L'Étudiant et de France Travail au lieu d'afficher des
événements sans dates ou lieux vérifiables. La sélection des formations par
intitulé est indicative et n'est pas exhaustive.

La page `panorama.html` réunit les formations, les entreprises et les sites
industriels dans une carte IGN, avec recherche commune, filtres et résultats
sélectionnables. Elle utilise Leaflet 1.9.4 et Leaflet.markercluster 1.5.3,
hébergés avec leurs licences dans `assets/leaflet/`.

## Mettre à jour l’instantané

Pour régénérer les données d’entreprise, exécutez
`powershell -ExecutionPolicy Bypass -File scripts\build-static-data.ps1` depuis
la racine du dépôt. Cette tâche de maintenance interroge l’API publique et
remplace l’instantané local. Après toute mise à jour, reconstruisez les fichiers
de formation puis le bundle statique avec `python scripts/build-pharma-training-data.py`
et `python scripts/build-browser-data.py`. Le site publié n’exécute aucun de ces
scripts.

## Analyser les sources

Pour profiler le catalogue des sources et l’instantané local avec Python,
installez les dépendances puis exécutez :

```powershell
python -m pip install -r requirements-analysis.txt
python scripts\analyze_data_sources.py
```

Le rapport est généré dans `data\pharmaceutical_data_sources_analysis.md`.
La page `dataset.html` est pré-rendue par le même script Python : ses fiches
et statistiques sont intégrées au HTML, sans requête réseau ni JavaScript au
chargement. Elle peut être publiée comme fichier statique avec `dataset.css`.
Les exports directs du catalogue `pharmaceutical_data_sources_fr.csv` sont
téléchargés dans `data/downloads/`. Le manifeste `data/downloads/manifest.json`
indique les sources, URL de téléchargement, empreintes SHA-256 et nombres de
lignes pour les CSV. Treize exports ont été récupérés le 23 octobre 2026
(environ 936 Mo). Neuf autres sources nécessitent une extraction spécifique
depuis leur portail ou API ; l’export Onisep renvoie actuellement HTTP 403.

## Limites des données

L’instantané est construit à partir des recherches de l’API par activité
principale, puis par nom d’entreprise ; les établissements sont rattachés au
SIREN exact. La recherche demande jusqu’à 100 établissements correspondants
par entreprise. Seuls ceux actifs et classés en NAF 21.10Z ou 21.20Z avec des
coordonnées valides sont cartographiés. Les sites classés sous un autre code
NAF ou sans coordonnées ne sont pas affichés. Les données de l’API publique ne
constituent pas un inventaire exhaustif ou certifié des unités de production.
