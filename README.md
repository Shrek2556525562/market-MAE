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

Le fichier `data/formations-pharma-fr.csv` rassemble des formations initiales,
des offres d’apprentissage et de la formation continue pertinentes pour les
entreprises pharmaceutiques. Il combine Parcoursup, La bonne alternance,
InterCarif-Oref, les catalogues Licence/Master de Campus France et le catalogue
Mon Compte Formation (CPF). La colonne `type_offre` identifie le catalogue ;
`source`, `url_source`, `url_formation` et `date_collecte` assurent la
traçabilité. Le champ `pertinence_pharma` distingue les formations directement
liées des cursus à compétences transférables.

Actualisez les sources puis reconstruisez le fichier fusionné depuis la racine
du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-lba-pharma-training.ps1
powershell -ExecutionPolicy Bypass -File scripts\refresh-official-pharma-training.ps1
powershell -ExecutionPolicy Bypass -File scripts\build-pharma-training-csv.ps1
```

Le collecteur officiel utilise des requêtes thématiques paginées et déduplique
les résultats par identifiant à l’intérieur de chaque catalogue. Lors de la
fusion, les lignes dont les détails du cursus et du lieu sont identiques sont
rassemblées en une seule entrée ; identifiants, catalogues et liens source sont
conservés ensemble dans les champs de provenance. Les filtres de la carte
continuent à présenter séparément chaque catalogue. La fusion reclasse les sources officielles à partir des seuls
intitulés de formation et écarte les cursus manifestement hors périmètre
(par exemple nutrition, agroalimentaire et environnement). La chimie générale
est signalée comme compétence transférable, et non comme spécialisation
pharmaceutique directe. Les collecteurs CPF interrogent uniquement les
résultats filtrés et les champs nécessaires ; ils ne téléchargent pas l’export
complet d’environ 0,84 Go. Les instantanés et leurs métadonnées (date, volume,
empreinte et requêtes) sont conservés dans `data/downloads/` et
`data/downloads/manifest.json`.

Cet inventaire est aussi large que le permettent les catalogues publics
accessibles, mais il ne peut pas être qualifié d’exhaustif au sens strict :
les recherches par mots-clés peuvent manquer des intitulés inattendus, les
catalogues ont des périmètres et calendriers différents. Campus France cible
notamment les candidats internationaux et ne constitue pas un registre
national complet. InterCarif-Oref et La bonne alternance couvrent des offres
d’apprentissage publiées. Le CPF fournit des formations continues, mais
seulement le département et la région du prestataire : faute de lieu de session
fiable, ces lignes restent dans le CSV et ne sont pas placées sur la carte.
Pour InterCarif-Oref, les coordonnées de formation ne sont affichées que si
l’adresse est recoupée avec la Base Adresse Nationale dans le même département.
Les autres lignes sans coordonnées fiables sont conservées de la même manière.

Mon Master n’est pas intégré comme offre actuelle : les jeux ouverts retrouvés
ne couvrent que les campagnes 2019 à 2021. Le portail France Travail agrège des
offres déjà présentes dans les catalogues de formation ; il n’est pas fusionné
séparément afin d’éviter les doublons et les résultats de recherche non
exhaustifs. Le domaine `repertoire-formations.fr` redirige vers un annuaire
privé ; le registre officiel des organismes répertorie des organismes, pas
leurs formations ou lieux de session, et ne peut donc pas alimenter cette carte.
L’export Onisep était inaccessible (HTTP 403) lors de la recherche.

La carte `formations.html` filtre les offres géolocalisées par domaine, source,
lien avec la pharmacie, région ou texte. Le total inclut aussi les lignes du
CSV qui ne peuvent pas être positionnées ; le lien de téléchargement permet de
consulter l’inventaire complet.

## Limites des données

L’instantané est construit à partir des recherches de l’API par activité
principale, puis par nom d’entreprise ; les établissements sont rattachés au
SIREN exact. La recherche demande jusqu’à 100 établissements correspondants
par entreprise. Seuls ceux actifs et classés en NAF 21.10Z ou 21.20Z avec des
coordonnées valides sont cartographiés. Les sites classés sous un autre code
NAF ou sans coordonnées ne sont pas affichés. Les données de l’API publique ne
constituent pas un inventaire exhaustif ou certifié des unités de production.
