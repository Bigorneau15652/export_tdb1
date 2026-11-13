# Grist Dashboard Composer

Widget Grist générique — Compositeur universel de tableaux de bord imprimables/exportables en PDF.

## 🎯 Fonctionnalités

- **4 types de blocs** : Texte (Markdown), Tableau (avec agrégations), Graphique (13 types via ECharts), Image
- **Canvas paginé** : formats A3, A4, A5, Écran, Carré — orientation portrait/paysage
- **Drag & drop libre** avec détection de collision (pas de superposition)
- **Resize** avec maintien des proportions (Shift)
- **Multi-pages** automatique quand le contenu déborde
- **Dynamique** : mise à jour en temps réel selon la ligne sélectionnée dans Grist
- **Export PDF / Impression** avec CSS `@media print` optimisé
- **Universel** : s'adapte à n'importe quelle table Grist et ses tables liées

## 🚀 Installation dans Grist

1. Dans votre document Grist (https://grist.numerique.gouv.fr/), cliquez sur **Add New → Add Widget to Page**
2. Choisissez **Custom**
3. Collez l'URL : `https://bigorneau15652.github.io/export_tdb1/`
4. Accordez l'accès **full** au document

## Export et import de la mise en page

Le bouton « Exporter / Importer » de la barre d'outils ouvre une fenêtre. « Exporter » affiche la mise en page actuelle (format de page, pages, blocs avec leur position, leur taille et leurs réglages) sous forme de texte JSON, que l'on peut copier ou télécharger. Les données des tables ne sont pas exportées. Pour importer, collez un texte JSON ou choisissez un fichier, cliquez sur « Vérifier l'import » (un compte rendu indique ce qui a été corrigé ou ignoré), puis sur « Remplacer la mise en page actuelle ». Exportez l'ancienne mise en page avant si vous voulez la garder.

Le texte commence par un en-tête `format` (toujours `grist-dashboard-composer`) et `version` (actuellement 1). Chaque bloc a un `type` (`text`, `table`, `chart` ou `image`), une position `x` et `y` et une taille `width` et `height` en pixels de page, et un objet `config` dont les champs sont ceux de la fenêtre de réglage du bloc. L'import contrôle chaque champ : un type inconnu, un champ inconnu, un identifiant non conforme ou une valeur hors limites sont écartés ou remplacés, jamais exécutés. Exemple minimal :

```json
{
  "format": "grist-dashboard-composer",
  "version": 1,
  "config": {
    "pageFormat": "A4",
    "pageOrientation": "landscape",
    "pages": [
      {
        "id": "page-1",
        "blocks": [
          { "id": "titre", "type": "text", "x": 40, "y": 40, "width": 600, "height": 60,
            "config": { "markdown": "# Titre" } },
          { "id": "liste", "type": "table", "x": 40, "y": 120, "width": 600, "height": 250,
            "config": { "sourceTable": "MaTable", "columns": ["Colonne1", "Colonne2"],
                        "dynamicFilter": true, "dynamicFilterColumn": "id", "footerFunc": "sum" } }
        ]
      }
    ]
  }
}
```

Réglages ajoutés pour suivre la ligne active de Grist et regrouper des lignes :
- Tableau et graphique : `dynamicFilter` (true) avec `dynamicFilterColumn` (colonne de la table source) et `dynamicSourceColumn` (champ de la ligne active comparé à cette colonne ; `id` désigne le numéro de la ligne). Exemple : une table d'étages qui a une colonne `Batiment` pointant vers la table des bâtiments, dont une ligne est active : `dynamicFilterColumn: "Batiment"` et `dynamicSourceColumn: "id"`. Sans `dynamicSourceColumn`, la colonne de même nom de la ligne active est utilisée (anciennes mises en page). Tant qu'aucune ligne n'est active, le bloc reste vide.
- Tableau : `groupBy` (colonne dont les valeurs identiques deviennent une seule ligne) et `groupFunc` (`sum`, `avg`, `min`, `max` ou `count`, pour les autres colonnes). Une colonne peut avoir sa propre fonction : `{ "id": "id", "label": "Nombre", "func": "count" }` donne le nombre de lignes du groupe. Le total du bas additionne les lignes regroupées.
- Graphique : `groupFunc` regroupe les lignes qui ont la même valeur dans la colonne X (`xColumn`).
- Colonne de tableau : `format` vaut `date` (date Grist affichée JJ/MM/AAAA) ou `plain` (nombre sans séparateur de milliers, utile pour une année).
- Image : la cellule peut contenir plusieurs adresses, une par ligne ; la première ligne est la première image (`imageIndex` choisit une autre). `captionColumn` désigne une colonne dont la ligne de même rang donne la légende.

Dans `columns`, une colonne peut s'écrire simplement par son identifiant, ou `{ "id": "...", "label": "..." }` pour changer son titre. Formats de page : `A3`, `A4`, `A5`, `screen`, `square`, `custom`.

Tests : `npm test` vérifie la lecture et le contrôle du JSON ainsi que le regroupement. Après `npm run build`, `node tests/e2e-io.mjs` vérifie la fenêtre d'export et d'import, et `node tests/e2e-blocks.mjs` vérifie les blocs avec un Grist simulé, dans un navigateur (variable `PLAYWRIGHT_PATH` pour indiquer l'emplacement de Playwright).

## 🛠️ Développement local

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement (port 8585)
npm start

# Build de production
npm run build
```

Pour tester dans Grist local :
```bash
# Lancer Grist avec le widget list
GRIST_WIDGET_LIST_URL=http://localhost:8585/manifest.json npm run grist
```

## 📁 Structure du projet

```
src/
├── index.js              # Point d'entrée
├── grist-api.js          # Wrapper API Grist
├── store.js              # État global + persistence
├── page-manager.js       # Gestion des pages
├── block-manager.js      # Drag & resize (interact.js)
├── toolbar.js            # Barre d'outils
├── editor.js             # Panneau de configuration des blocs
├── print.js              # Export PDF / impression
├── palettes.js           # 4 palettes de 10 couleurs
├── page-formats.js       # Dimensions A3/A4/A5/écran/carré
├── utils.js              # Utilitaires
├── block-types/
│   ├── text-block.js     # Bloc texte (Markdown)
│   ├── table-block.js    # Bloc tableau (agrégations)
│   ├── chart-block.js    # Bloc graphique (ECharts)
│   └── image-block.js    # Bloc image
└── styles/
    └── main.css          # Styles complets
```

## 🔒 Sécurité

- **DOMPurify** pour la sanitization de tout le HTML généré (Markdown)
- **Échappement SQL** systématique dans les requêtes `executeSQL`
- **CSP** (Content Security Policy) restrictive
- Pas d'accès à `window.parent` / `window.top`
- Pas de transmission de données vers des serveurs externes

## ⚡ Performance

- Debounce (300ms) sur les appels API Grist
- Requêtes SQL côté serveur (filtres, tris, limit)
- Lazy rendering des blocs
- `chart.dispose()` systématique pour éviter les fuites mémoire

## 📄 Licence

Apache-2.0
