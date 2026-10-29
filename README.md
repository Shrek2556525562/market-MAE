# Pharma France

Carte statique des entreprises pharmaceutiques en France. Les données sont
stockées localement dans `data/pharmaceutical-companies-fr.json` et regroupées
dans `data/pharma-static-data.js` pour être affichées sans requête au runtime.

## Utilisation

Ouvrez `index.html` pour choisir entre les parcours recruteur et étudiant/diplômé,
ou accédez directement à `panorama.html`, `formations.html`, `recruteur.html` ou
`dataset.html`, puis publiez les fichiers du site statique. Les données et les bibliothèques sont
servies localement, sans CDN ni requête d’API. Les pages `index.html` et
`formations.html` utilisent un fond SVG local et fonctionnent hors ligne. Le
panorama conserve le fond de carte IGN, qui nécessite une connexion Internet ;
le SVG local reste visible si les tuiles ne peuvent pas être chargées.

La page `recruteur.html` aide à repérer des formations correspondant à un profil
métier et à un territoire. Elle ne publie pas d’offres d’emploi et ses
rapprochements de métiers et de niveaux sont indicatifs ; vérifiez les modalités
auprès des établissements.

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

La page `repartition.html` compare les concentrations de formations avec les
sièges d’entreprise ou les sites industriels, par région ou département. Les
comptages sont calculés à l’avance depuis les coordonnées des instantanés et
les limites départementales ; ils sont embarqués localement, sans requête au
chargement. Après régénération du bundle statique, actualisez les résultats
avec `python scripts/build-pharma-geographic-analysis.py`.

La page `carte-repartition.html` met cette comparaison en carte : deux cartes
choroplèthes côte à côte, avec zoom synchronisé, survol croisé et découpage
par département ou région. Les formations proviennent du catalogue
multi-sources `data/formations-pharma-fr.csv` (offres Parcoursup, Campus France,
CPF, InterCarif-Oref et La bonne alternance). Le générateur
`python scripts/build-pharma-geographic-analysis.py` produit les comptages
géographiques et le bundle de points `data/pharma-training-map.js`, pour un
affichage statique sans téléchargement des données au chargement. Seul le fond
de carte IGN nécessite une connexion réseau.

La page `domaines-sciences-vivant.html` se concentre sur le catalogue des
formations et classe les offres géolocalisées par domaines scientifiques
(microbiologie, chimie, biologie, biotechnologies, pharmacie, qualité et
procédés industriels). Filtres, recherche, marqueurs et fiches utilisent le
bundle local `data/pharma-training-map.js` ; seul le fond IGN nécessite le
réseau. Reconstruisez les offres et leur classification avec
`python scripts/build-pharma-geographic-analysis.py`.

## Mettre à jour l’instantané

Pour régénérer les données d’entreprise, exécutez
`powershell -ExecutionPolicy Bypass -File scripts\build-static-data.ps1` depuis
la racine du dépôt. Cette tâche de maintenance interroge l’API publique et
remplace l’instantané local. Après toute mise à jour, reconstruisez les fichiers
de formation puis le bundle statique avec `python scripts/build-pharma-training-data.py`
et `python scripts/build-browser-data.py`, puis la répartition avec
`python scripts/build-pharma-geographic-analysis.py`. Cette dernière commande
lit également le catalogue `data/formations-pharma-fr.csv`. Le site publié
n’exécute aucun de ces scripts.

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
continuent à présenter séparément chaque catalogue. La fusion reclasse les
sources officielles à partir des seuls intitulés de formation et écarte les
cursus manifestement hors périmètre (par exemple nutrition, agroalimentaire et
environnement). La chimie générale est signalée comme compétence transférable,
et non comme spécialisation pharmaceutique directe. Les collecteurs CPF
interrogent uniquement les résultats filtrés et les champs nécessaires ; ils
ne téléchargent pas l’export complet d’environ 0,84 Go. Les instantanés et
leurs métadonnées (date, volume,
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

La page `formations.html` rassemble le panorama statique des formations,
entreprises et sites industriels. La carte détaillée `carte-formations.html`
filtre les offres géolocalisées par domaine, source, lien avec la pharmacie,
région ou texte. Le total inclut aussi les lignes du CSV qui ne peuvent pas
être positionnées ; le lien de téléchargement permet de consulter l’inventaire
complet.

## Limites des données

L’instantané est construit à partir des recherches de l’API par activité
principale, puis par nom d’entreprise ; les établissements sont rattachés au
SIREN exact. La recherche demande jusqu’à 100 établissements correspondants
par entreprise. Seuls ceux actifs et classés en NAF 21.10Z ou 21.20Z avec des
coordonnées valides sont cartographiés. Les sites classés sous un autre code
NAF ou sans coordonnées ne sont pas affichés. Les données de l’API publique ne
constituent pas un inventaire exhaustif ou certifié des unités de production.
