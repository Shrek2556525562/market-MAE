# Pharma France

Carte statique des entreprises pharmaceutiques en France. Les données sont
stockées localement dans `data/pharmaceutical-companies-fr.json` et ne sont pas
chargées depuis une API au runtime.

## Utilisation

Publiez les fichiers du site statique, puis ouvrez `index.html` ou
`dataset.html`. La page d'analyse des sources présente les types de variables
et les statistiques de l'instantané local. Le fond de carte utilise les tuiles
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

## Formations utiles aux laboratoires pharmaceutiques

Le fichier `data/formations-pharma-fr.csv` regroupe les offres Parcoursup 2025
liées à la pharmacie, aux sciences du vivant, à la chimie et aux métiers
industriels. Les coordonnées manquantes dans Parcoursup sont recherchées dans
le répertoire SIES des établissements. Le champ `pertinence_pharma` sépare
les formations directement liées des cursus à compétences transférables.

Pour régénérer le fichier à partir des exports locaux, exécutez
`powershell -ExecutionPolicy Bypass -File scripts\build-pharma-training-csv.ps1`.
Les lignes correspondent aux offres d’admission et campus publiés dans
Parcoursup, pas à l’ensemble des formations françaises : les masters, la
formation continue, les formations absentes de Parcoursup et l’offre Onisep
(export inaccessible lors de la collecte) n’y sont pas recensés. Les lignes
sans coordonnées restent dans le CSV mais ne pourront pas être affichées
directement sur une carte.

## Limites des données

L’instantané est construit à partir des recherches de l’API par activité
principale, puis par nom d’entreprise ; les établissements sont rattachés au
SIREN exact. La recherche demande jusqu’à 100 établissements correspondants
par entreprise. Seuls ceux actifs et classés en NAF 21.10Z ou 21.20Z avec des
coordonnées valides sont cartographiés. Les sites classés sous un autre code
NAF ou sans coordonnées ne sont pas affichés. Les données de l’API publique ne
constituent pas un inventaire exhaustif ou certifié des unités de production.
