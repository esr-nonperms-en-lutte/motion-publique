/* Réglages du site. Seul fichier à modifier pour la mise en ligne. */
window.CONFIG = {
  /* Adresse qui reçoit les motions (affichée sur le site et utilisée dans les courriels). */
  contactEmail: "esr-nonperms-en-lutte@proton.me",

  /* Adresse publique du site, utilisée dans le courriel à l'équipe et le mode d'emploi.
     À remplir une fois le site publié, par ex. "https://mon-compte.github.io/motion-esr/".
     Tant qu'elle est vide, le site écrit simplement « notre site ». */
  siteUrl: "https://esr-nonperms-en-lutte.github.io/motion-publique/",

  /* Le bouton d'envoi télécharge un fichier .txt (toutes les informations + le JSON) et ouvre la
     messagerie du visiteur avec un courriel prêt pour contactEmail. Aucun service tiers. */

  /* Dépôt GitHub : sert de secours pour lister le dossier labs/ si labs/index.json est absent.
     À remplir une fois le dépôt créé (facultatif : le workflow génère labs/index.json). */
  github: { owner: "esr-nonperms-en-lutte", repo: "motion-publique", branch: "main" }
};
