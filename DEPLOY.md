# Deploiement GitHub Pages - export_tdb1

## ⚠️ ACTION REQUISE : Changer la source GitHub Pages

Le widget est déployé sur la branche `gh-pages`, mais GitHub Pages est encore configuré pour lire la branche `main`.

### Va sur : https://github.com/Bigorneau15652/export_tdb1/settings/pages

1. Sous **Build and deployment > Source**, change de **"GitHub Actions"** vers **"Deploy from a branch"**
2. Branche : sélectionne **`gh-pages`**
3. Dossier : **`/` (root)**
4. Clique sur **Save**

> ⏱️ Le site sera disponible dans 1-2 minutes après le changement.

## URL du widget (après changement)

**https://bigorneau15652.github.io/export_tdb1/**

## Ajouter dans Grist (https://grist.numerique.gouv.fr/)

1. **Add New > Add Widget to Page > Custom**
2. URL : `https://bigorneau15652.github.io/export_tdb1/`
3. Accorder l'accès **full** au document
4. Configurer la table source

## Commandes utiles

```bash
# Pousser des mises a jour
git add -A
git commit -m "feat: description du changement"
git push origin main

# Le deploiement se fait automatiquement sur gh-pages

# Verifier le statut
gh api repos/Bigorneau15652/export_tdb1/actions/runs --jq '.workflow_runs[0] | {status, conclusion}'

# Voir le contenu de gh-pages
gh api "repos/Bigorneau15652/export_tdb1/contents?ref=gh-pages" --jq '.[].name'
```

## Structure des branches

| Branche | Contenu |
|---------|---------|
| `main` | Code source (src/, package.json, webpack, etc.) |
| `gh-pages` | Build de production (dist/) — déployé auto par CI |
