# État — CoC7 Bascule d'époque

## Fait (v1.0.0)
- Bouton sablier (contrôles de jetons, MJ) → fenêtre BasculeApp (ApplicationV2).
- switchEra(era) : réglage monde currentEra ; flag utilisateur eraFilter (scope coc7-luck-tracker, sinon san/bonds) ; coc7-cartes-chat.forceTheme ; flag dossiers-caches.hidden du MJ (ajoute les dossiers de l'autre époque, retire ceux de l'époque choisie) ; playlist ; scène.activate() ; ChatMessage d'annonce.
- Dossiers rattachés par flag `coc7-bascule-epoque.era` (clic droit), étiquette 1933/2026 dans la barre latérale.
- ConfigApp (formulaire) : nom, sous-titre, scène, playlist, thème du chat, annonce.

## Fait (v1.2.0)
- Personnages par époque : réglage monde `characters` ({userId: {1933, modern}}), CharactersApp (tableau joueur × époque), `applyCharacters(era)` appelé par switchEra (coche `syncCharacters`), bouton « Appliquer maintenant ».
- Testé par simulation de la logique ; pas encore dans Foundry.

## Fait (v1.3.1)
- Correctif : les deux menus de réglages (« Personnages par époque », « Réglages des époques ») utilisaient une classe vide comme `type` ; Foundry v14 exige un ApplicationV2, d'où l'erreur au démarrage (« You must provide a menu type… ») qui empêchait aussi d'enregistrer « showBanner ». Remplacées par `MenuPersonnages` / `MenuReglages` (ApplicationV2 qui ouvrent la fenêtre à onglets).
- Testé par simulation du hook `init` avec la même vérification que Foundry : erreur reproduite sur la v1.3.0, absente en 1.3.1.

## À tester (Foundry 14.368, CoC7 8.16)
- Bascule aller-retour, notifications sans erreur ; suivis ouverts qui se mettent à jour.
- Thème du chat + HUD ; scène et playlist ; dossiers journaux et acteurs (« tous les onglets » activé dans dossiers-caches).
- Menu clic droit des dossiers en v14.

## Points incertains
- Seule la vue du MJ est concernée pour les dossiers (les joueurs ne voient déjà que ce qui leur est permis).
