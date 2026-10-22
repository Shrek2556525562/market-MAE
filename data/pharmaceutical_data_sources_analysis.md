# Analyse des sources de données pharmaceutiques

Analyse générée le 2026-10-22 13:17 UTC.

## Périmètre et méthode

- Catalogue examiné : `pharmaceutical_data_sources_fr.csv` (11 sources, 8 colonnes).
- Instantané local examiné : `data/pharmaceutical-companies-fr.json` (généré le 2026-10-18T16:03:30.3454105Z).
- Les sources listées sont secondaires : elles préexistent à l'étude et ont été produites par des organismes tiers, pour leurs propres objectifs. Aucune collecte primaire (questionnaire, entretien ou observation terrain) n'est fournie.
- Le dépôt ne contient pas les fichiers bruts des 11 jeux externes. Leurs schémas complets, taux de valeurs manquantes, variances et écarts-types ne peuvent donc pas être calculés sans télécharger et contrôler chaque extraction. Les types ci-dessous sont ceux qu'indiquent les descriptions du catalogue, pas un inventaire vérifié de toutes leurs colonnes.
- Variance et écart-type sont calculés comme statistiques de population (`ddof=0`) sur les observations effectivement présentes. Les identifiants numériques et codes sont traités comme qualitatifs et ne reçoivent pas de variance.

## Catalogue : profil de toutes les colonnes

| Colonne | Type de variable | Manquants | Valeurs distinctes |
| --- | --- | --- | --- |
| source | Qualitative nominale | 0/11 (0,0 %) | 11 |
| data_url | Qualitative nominale (URL) | 0/11 (0,0 %) | 11 |
| download_or_query_url | Qualitative nominale (URL) | 0/11 (0,0 %) | 11 |
| description | Qualitative textuelle | 0/11 (0,0 %) | 11 |
| estimated_quality_percent | Quantitative; score entier dans le catalogue (discret), mais estimation subjective | 0/11 (0,0 %) | 9 |
| quality_score_basis | Qualitative textuelle | 0/11 (0,0 %) | 11 |
| update_frequency | Qualitative catégorielle / temporelle | 0/11 (0,0 %) | 11 |
| limitations | Qualitative textuelle | 0/11 (0,0 %) | 11 |

Le catalogue comporte 11 sources; aucune valeur n'est manquante dans ses 8 colonnes. Les URLs et textes sont des variables qualitatives, même si certains champs contiennent des chiffres.

### Score de qualité estimé

Sur les 11 scores (en %), la moyenne est **85,36**, la médiane **87,00**, Q1–Q3 **81,50–91,00**, min–max **72,00–94,00**. Variance de population : **48,96 points²**; écart-type : **7,00 points**.

Ce score est une estimation éditoriale du catalogue, pas une mesure publiée par les producteurs ni une variable des jeux sources; sa dispersion ne doit pas être interprétée comme une qualité objective des données.

## Instantané local : entreprises et établissements

L'instantané contient **789 entreprises** et **604 établissements**; les 789 recherches d'établissements ont trouvé une entreprise correspondante. Les identifiants SIREN/SIRET, codes NAF et codes postaux sont catégoriels, pas des quantités mesurables.

### Métadonnées de premier niveau du JSON

| Champ | Type | Manquants |
| --- | --- | --- |
| generatedAt | Date/heure (temporelle) | 0/1 (0,0 %) |
| source | Qualitative nominale (URL) | 0/1 (0,0 %) |
| activityTotals | Quantitative discrète par code NAF | 0/1 (0,0 %) |
| companyCount | Quantitative discrète (effectif) | 0/1 (0,0 %) |
| companySiteSearchCount | Quantitative discrète (effectif) | 0/1 (0,0 %) |
| siteCount | Quantitative discrète (effectif) | 0/1 (0,0 %) |
| companies | Table imbriquée (entreprise) | 0/1 (0,0 %) |
| sites | Table imbriquée (établissement) | 0/1 (0,0 %) |

Comptages par activité du JSON : 21.10Z : 230, 21.20Z : 559.

Les compteurs JSON sont des totaux agrégés (un seul instantané), pas une série d'observations : leur variance et leur écart-type ne sont donc pas calculés.

### Entreprises (unité : entreprise)

| Colonne | Type de variable | Manquants | Valeurs distinctes |
| --- | --- | --- | --- |
| siren | Identifiant qualitatif nominal | 0/789 (0,0 %) | 789 |
| nom_complet | Qualitative textuelle / nominale | 0/789 (0,0 %) | 788 |
| activityCodes | Qualitative nominale (liste de codes) | 0/789 (0,0 %) | 2 |
| siege.libelle_commune | Qualitative nominale | 328/789 (41,6 %) | 286 |
| siege.code_postal | Qualitative nominale (code) | 257/789 (32,6 %) | 356 |
| siege.coordonnees.latitude | Quantitative continue (latitude) | 333/789 (42,2 %) | 441 |
| siege.coordonnees.longitude | Quantitative continue (longitude) | 333/789 (42,2 %) | 441 |

### Établissements (unité : établissement)

| Colonne | Type de variable | Manquants | Valeurs distinctes |
| --- | --- | --- | --- |
| siret | Identifiant qualitatif nominal | 0/604 (0,0 %) | 604 |
| companySiren | Identifiant qualitatif nominal | 0/604 (0,0 %) | 425 |
| companyName | Qualitative textuelle / nominale | 0/604 (0,0 %) | 425 |
| etablissement.adresse | Qualitative textuelle | 0/604 (0,0 %) | 582 |
| etablissement.libelle_commune | Qualitative nominale | 0/604 (0,0 %) | 351 |
| etablissement.activite_principale | Qualitative nominale (code NAF) | 0/604 (0,0 %) | 2 |
| coordinates.latitude | Quantitative continue (latitude) | 0/604 (0,0 %) | 588 |
| coordinates.longitude | Quantitative continue (longitude) | 0/604 (0,0 %) | 588 |

### Statistiques des coordonnées

| Niveau | Colonne | n | Moyenne | Variance (degrés²) | Écart-type (degrés) | Q1–Q3 | Min–max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sièges sociaux | siege.coordonnees.latitude | 456 | 46,846 | 25,590 | 5,059 | 45,731 – 48,865 | -21,071 – 51,011 |
| Sièges sociaux | siege.coordonnees.longitude | 456 | 2,327 | 56,470 | 7,515 | 1,835 – 4,792 | -61,533 – 55,223 |
| Établissements | coordinates.latitude | 604 | 47,061 | 16,981 | 4,121 | 45,741 – 48,870 | -21,071 – 51,011 |
| Établissements | coordinates.longitude | 604 | 2,583 | 30,646 | 5,536 | 1,438 – 4,792 | -61,533 – 55,223 |

Latitude et longitude sont stockées dans cet ordre pour les sièges sociaux et les établissements. Variance et écart-type en degrés sont descriptifs, mais ne mesurent pas directement une distance géographique. Le nombre de valeurs utilisées et les manquants figurent dans les profils de colonnes.

Cet instantané provient de l'API Recherche d'entreprises et n'est pas l'extrait complet de la base Sirene décrit par le catalogue. Il est filtré sur les codes NAF 21.10Z et 21.20Z; les établissements visibles dépendent aussi des coordonnées disponibles.

## Lecture source par source

| Source | Primaire / secondaire | Unité d'observation (selon le descriptif) | Variables et types indiqués | Statistiques des colonnes |
| --- | --- | --- | --- | --- |
| INSEE Sirene | Secondaire | Unité légale ou établissement | SIREN/SIRET (qualitative nominale), adresse, code NAF (qualitative nominale), état actif/fermé (qualitative nominale). Effectifs, chiffre d'affaires et coordonnées dépendent des champs et de l'extrait téléchargé. | Non calculables : données brutes absentes |
| Base de données publique des médicaments (BDPM) | Secondaire | Médicament ou présentation | Identifiants produit (qualitative nominale), laboratoire/titulaire (qualitative nominale), statut d'autorisation et de commercialisation (qualitative nominale). | Non calculables : données brutes absentes |
| Open Medic (Assurance Maladie) | Secondaire | Agrégat de consommation (la dimension exacte dépend du fichier) | Dépenses/remboursements (quantitative continue), boîtes dispensées (quantitative discrète), âge, sexe, région et spécialité du prescripteur (qualitatives). | Non calculables : données brutes absentes |
| Medic'AM (Assurance Maladie) | Secondaire | Médicament (CIP) × période × type de prescripteur | CIP (qualitative nominale), base et montant remboursés (quantitatives continues), boîtes remboursées (quantitative discrète), prescripteur (qualitative nominale), période (temporelle). | Non calculables : données brutes absentes |
| Eurostat Structural Business Statistics (NACE C21) | Secondaire | Secteur × territoire × année × indicateur | Entreprises et emplois (quantitatives discrètes), ETP, salaires et chiffre d'affaires (quantitatifs, généralement continus), année et indicateur (temporels/catégoriels). | Non calculables : données brutes absentes |
| EMA EudraGMDP | Secondaire | Autorisation, certificat, site ou enregistrement réglementaire | Pays, site, type d'autorisation/certificat et statut (qualitatives nominales); dates de délivrance/validité (temporelles). | Non calculables : données brutes absentes |
| EU Clinical Trials Information System (CTIS) | Secondaire | Essai clinique, pays ou site participant selon l'extraction | Promoteur, médicament, pays et statut (qualitatives nominales); identifiants et dates d'essai (nominales/temporelles). | Non calculables : données brutes absentes |
| Eurostat Comext international trade in goods | Secondaire | Produit × pays partenaire × période | Code produit et pays (qualitatives nominales), période (temporelle), valeur commerciale (quantitative continue), quantité (quantitative dont la nature dépend de l'unité publiée). | Non calculables : données brutes absentes |
| French public procurement data (DECP) | Secondaire | Marché ou contrat public | Acheteur, fournisseur et identifiants (qualitatifs nominaux), date (temporelle), montant (quantitatif continu), description (texte). | Non calculables : données brutes absentes |
| ANSM medicine availability and shortages | Secondaire | Médicament ou présentation | Produit/laboratoire (qualitatifs nominaux), état de disponibilité (qualitatif nominal), dates de mise à jour (temporelles). La source ne fournit pas nécessairement des volumes de pénurie. | Non calculables : données brutes absentes |
| European Patent Office Espacenet | Secondaire | Demande ou famille de brevets | Identifiant, déposant et domaine technologique (qualitatifs nominaux), dates de dépôt/publication (temporelles). Un compte de brevets est quantitatif discret après agrégation. | Non calculables : données brutes absentes |

Les sources secondaires sont pertinentes pour cartographier l'offre, les produits, la consommation, la R&D, les échanges ou les achats publics; elles ne remplacent pas une collecte primaire si la question porte sur les motivations, la notoriété ou les comportements non observés dans ces registres. Les unités d'observation et périodes doivent être alignées avant tout croisement; agréger au bon niveau avant de joindre (par exemple entreprise, établissement, produit, territoire ou année).

## Conclusion

Le taux de valeurs manquantes est calculable et nul pour le catalogue local; il est profilé champ par champ pour l'instantané local. Pour les 11 sources cataloguées, les descriptions permettent de proposer des types de variables, mais pas de calculer les statistiques descriptives de leurs colonnes réelles. Il faut télécharger les extractions précises, fixer leur date/période et unité d'observation, puis relancer un profil sur ces fichiers pour obtenir ces chiffres sans extrapolation.

### Références pédagogiques

- Cours Smart Data Marketing, CM 2, « De la source à la preuve : les statistiques » : [mae.iae-mod.fr/seances/seance-cm-2.html](https://mae.iae-mod.fr/seances/seance-cm-2.html). Définitions mobilisées : source primaire/secondaire, unité d'observation, types de variables, moyenne/médiane, variance/écart-type et dispersion.
- Catalogue de sources du dépôt : [`pharmaceutical_data_sources_fr.csv`](../pharmaceutical_data_sources_fr.csv).
