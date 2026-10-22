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
