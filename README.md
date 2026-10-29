# Mon carnet de dessin

Appli web personnelle (PWA) pour suivre un parcours de dessin cozy : une leçon par jour, la photo de chaque dessin, une galerie avec avant/après, des fiches mémo et des nuanciers.

- **Aucun serveur, aucun compte** : les photos et la progression restent sur le téléphone (IndexedDB). On les sauvegarde avec **Réglages → Exporter ma sauvegarde**.
- **Fonctionne hors connexion** une fois ouverte une première fois (service worker `sw.js`).
- **Contenu modifiable sans toucher au code** : le parcours vient de `contenu/programme-30-jours.md` et les fiches de `contenu/fiches-memo.md`.
  - Chaque `### Jour N — Titre` devient une leçon.
  - Chaque ligne `- 📄 Titre : URL` ou `- ▶️ Titre : URL` devient une carte de ressource.

## Installer sur l'iPhone

1. Ouvrir l'adresse du site dans **Safari**.
2. Bouton **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Toujours ouvrir le carnet depuis cette icône : c'est là que les dessins sont enregistrés.

## Tester en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Après une modification de l'appli, changer `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Structure

- `index.html`, `css/style.css` : coquille et style « cozy papier »
- `js/app.js` : vues et navigation
- `js/db.js` : stockage local, export et import
- `js/markdown.js` : lecture du programme et des fiches
- `js/images.js` : réduction des photos
- `contenu/` : programme et fiches mémo
- `recherches/` : notes de recherche des tutos (sources, statut de vérification)
