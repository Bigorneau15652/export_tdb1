# Instructions pour pousser le code sur GitHub

## Etape 1 : Creer le repository sur GitHub

Va sur https://github.com/new et cree un repository public nomme :
- **Nom** : `grist-dashboard-composer`
- **Description** : `Widget Grist generique - Compositeur de tableaux de bord imprimables/exportables en PDF`
- **Public** : oui
- Ne pas initialiser avec README (on a deja le code)

## Etape 2 : Pousser le code

```bash
cd /workspace/github__Bigorneau15652__grist-dashboard-composer
git remote add origin https://github.com/Bigorneau15652/grist-dashboard-composer.git
git push -u origin main
```

## Etape 3 : Activer GitHub Pages

1. Va dans **Settings > Pages**
2. Source : **GitHub Actions**
3. Le workflow `.github/workflows/deploy.yml` se declenchera automatiquement

## Etape 4 : URL du widget

Le widget sera accessible a :
**https://bigorneau15652.github.io/grist-dashboard-composer/**

## Etape 5 : Ajouter dans Grist

Dans https://grist.numerique.gouv.fr/ :
1. **Add New > Add Widget to Page > Custom**
2. URL : `https://bigorneau15652.github.io/grist-dashboard-composer/`
3. Accorder l'acces **full**
