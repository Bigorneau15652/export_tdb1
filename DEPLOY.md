# Deploiement GitHub Pages - export_tdb1

## Etape 1 : Activer GitHub Pages

Va sur : **https://github.com/Bigorneau15652/export_tdb1/settings/pages**

1. Sous **Source**, selectionne **GitHub Actions**
2. Clique sur **Save**

## Etape 2 : Relancer le deploiement

Apres activation, le workflow se relancera automatiquement au prochain push.
Ou va dans **Actions** > **Deploy to GitHub Pages** > **Run workflow**

## Etape 3 : Verifier l'URL

Le widget sera disponible a :
**https://bigorneau15652.github.io/export_tdb1/**

## Etape 4 : Ajouter dans Grist (https://grist.numerique.gouv.fr/)

1. **Add New > Add Widget to Page > Custom**
2. URL : `https://bigorneau15652.github.io/export_tdb1/`
3. Accorder l'acces **full** au document
4. Configurer la table source

## Commandes utiles

```bash
# Pousser des mises a jour
git add -A
git commit -m "feat: description du changement"
git push origin main

# Verifier le statut du deploiement
gh api repos/Bigorneau15652/export_tdb1/actions/runs --jq '.workflow_runs[0] | {status, conclusion, created_at}'

# Voir les logs en cas d'erreur
gh api repos/Bigorneau15652/export_tdb1/actions/runs --jq '.workflow_runs[0].id'
```
