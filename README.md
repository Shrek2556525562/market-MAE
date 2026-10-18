# Pharma France

Carte statique des entreprises pharmaceutiques en France. Les données sont
chargées en direct depuis l’[API Recherche d’entreprises](https://recherche-entreprises.api.gouv.fr/).

## Utilisation

Publiez `index.html`, `app.js` et `styles.css` sur un hébergement statique, puis
ouvrez la page avec une connexion Internet. Le fond de carte utilise les tuiles
IGN / Géoplateforme ; Leaflet et les polices sont chargés depuis des CDN.

La page affiche les sièges sociaux des entreprises actives classées en NAF
21.10Z ou 21.20Z. Le filtre **Sites industriels** ajoute les établissements
actifs portant l’un de ces deux codes, avec leurs coordonnées disponibles. Le
bouton **Afficher plus d’entreprises** charge les pages suivantes de l’API.

## Limites des données

Les établissements sont recherchés par nom d’entreprise, puis rattachés au
SIREN exact avant affichage. La recherche demande jusqu’à 100 établissements
correspondants par entreprise ; seuls ceux actifs et classés en NAF 21.10Z ou
21.20Z avec des coordonnées valides sont cartographiés. Les sites classés sous
un autre code NAF ou sans coordonnées ne sont pas affichés. Les données
proviennent de l’API publique et ne constituent donc pas un inventaire
exhaustif ou certifié des unités de production pharmaceutique.
