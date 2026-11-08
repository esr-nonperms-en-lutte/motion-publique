# Motion des non-permanent·es de l’ESR

Site statique (HTML, CSS, JavaScript, sans base de données) publié avec GitHub Pages.

## Mettre en ligne

1. Créez un dépôt GitHub et déposez-y le contenu de ce dossier.
2. Dans **Settings → Pages**, choisissez **Source : GitHub Actions**.
3. `assets/config.js` contient déjà l'adresse de contact. L'adresse du site est détectée
   automatiquement une fois en ligne ; vous pouvez aussi la renseigner dans `siteUrl`.
4. Chaque `push` sur `main` vérifie les fichiers de `labs/` et republie le site (`.github/workflows/deploy.yml`).

## Recevoir les soutiens par courriel

Aucun service tiers. Quand une structure valide le formulaire, la page :

1. télécharge un fichier `soutien-motion-<structure>-<date>.txt` contenant toutes les informations
   (résumé lisible, modifications, motion votée, et le JSON complet entre deux repères) ;
2. ouvre sa messagerie avec un courriel prêt pour l’adresse de `contactEmail`, objet
   « Ajout de soutien – <nom de la structure> » ;
3. lui demande d’y joindre le fichier .txt et le PDF de la motion votée.

Un site ne peut pas joindre de fichier à un courriel lui-même : c’est la structure qui ajoute la pièce jointe.
Sur les appareils qui le permettent, un bouton « Partager avec la pièce jointe » le fait directement.

## Ajouter une structure (modération manuelle)

1. Ouvrez `admin.html` sur le site et déposez-y le fichier .txt reçu : il est vérifié et affiché (logo, vote, modifications).
2. Si tout est correct, cliquez sur « Télécharger … .json » et ajoutez ce fichier dans `labs/`.
3. Le workflow vérifie le fichier (`tools/validate_labs.py`), génère `labs/index.json` et republie le site.
   Un fichier invalide bloque la publication.

Rien n’est publié sans passer par vous : les visiteurs ne peuvent écrire nulle part sur le site.

## Modifier le texte de la motion

Le texte, les paragraphes et les sources sont dans `content/motion.fr.json`. Après modification :

```
python3 tools/build_docs.py
```

régénère `downloads/motion-fr.pdf`, `.docx` et `.txt` (nécessite pandoc, et xelatex pour le PDF).
Changez aussi `version` dans le JSON : les modifications des structures sont liées à une version du texte.

## Traductions

Les textes de l’interface sont dans `assets/i18n.js` (fr, en, es). Les textes longs (origine, mode d’emploi,
courriel) sont dans `window.LONG` du même fichier ; seul le français est rédigé pour l’instant.

## Voir le site en local

```
python3 -m http.server 8765
```

puis ouvrez http://localhost:8765. Ajoutez `?demo=1` pour afficher les structures d’exemple de `exemples/`.

## Sécurité

- Le site ne contacte aucun autre serveur : police (Atkinson Hyperlegible Next, licence SIL OFL, dans `assets/fonts/`),
  scripts et images sont hébergés avec lui. Les visiteur·ices ne sont donc pas exposé·es à Google ni à un CDN.
- Une règle de sécurité (Content-Security-Policy, en tête de `index.html` et `admin.html`) interdit tout script
  qui ne vient pas du site lui-même, et `no-referrer` évite de signaler aux sites des sources d’où vient le lien.
- Protégez les comptes : double authentification sur GitHub et Proton, deux ou trois personnes avec accès au
  dépôt, et une règle de protection de la branche `main` (Settings → Branches) exigeant une relecture.

- Aucune base de données, donc aucune requête SQL : les textes saisis sont nettoyés (caractères de contrôle
  retirés, longueur limitée), toujours affichés comme du texte (échappés), jamais exécutés.
- Les logos sont ré-encodés en JPEG 256 px par le navigateur avant l’envoi ; seuls les JPEG/PNG en data URI
  de moins de 220 Ko sont acceptés à l’affichage et par le script de vérification.
- Le formulaire ne demande aucune adresse : vous recevez celle de l’expéditeur avec son courriel, et rien de personnel n’est publié.
