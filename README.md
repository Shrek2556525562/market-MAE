# Pharma France

> **Pour les RH des sites pharmaceutiques qui doivent recruter un technicien,
> un ingénieur ou un alternant, Pharma France montre les formations en chimie,
> biologie, procédés et pharmacie à moins de 50 km de chaque site, par niveau
> de sortie, contrairement aux annonces publiées à l’aveugle sur un job board.**

**Utilisateur** : le ou la responsable RH d’un site de production pharmaceutique.

**Sa question** : « Où se forment, près de mon site, les profils Bac+2, Bac+3 ou
Bac+5 dont j’ai besoin ? »

Carte statique des entreprises pharmaceutiques en France. Les données brutes
des cartes sont **écrites directement dans les pages** (`index.html`,
`viviers.html`) par `scripts/embed_data.py` : aucune API ni aucun fichier n’est
appelé à l’ouverture, et les cartes s’affichent aussi en ouvrant le fichier
HTML depuis le disque. Seuls Leaflet, les polices et le fond de carte IGN
restent chargés depuis Internet.

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

## Viviers de formation

La page `viviers.html` croise les 604 sites industriels pharma avec :

- les formations post-bac de **Parcoursup 2025** utiles aux labos (BTS
  Bioanalyses, Métiers de la chimie, Biotechnologie, Bioqualité, Pilotage des
  procédés ; BUT Chimie, Génie chimique, Génie biologique ; licences chimie et
  sciences de la vie ; écoles d’ingénieurs post-bac), avec leur capacité
  d’accueil en 1re année ;
- les inscrits 2024-25 en **chimie, sciences de la vie et pharmacie** des
  universités et écoles publiques (SIES, secteurs disciplinaires SISE 03, 06
  et 09).

Le fichier `data/viviers-formations.json` est produit par :

```powershell
python scripts\build_viviers.py
```

Le script affiche aussi le résumé chiffré et la liste des sites sans aucune
formation utile à moins de 50 km. Les règles de sélection des formations sont
écrites en tête du script ; la page détaille la méthode et les limites (une
place en 1re année n’est pas un diplômé, Parcoursup ne couvre ni les masters
ni les écoles recrutant après une prépa, distances à vol d’oiseau).

## Mettre à jour l’instantané

Pour régénérer le fichier statique, exécutez
`powershell -ExecutionPolicy Bypass -File scripts\build-static-data.ps1` depuis
la racine du dépôt. Cette tâche de maintenance interroge l’API publique et
remplace l’instantané local. Le site publié n’exécute pas ce script. Ensuite,
réintégrez les données dans les pages :

```powershell
python scripts\embed_data.py
```

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
