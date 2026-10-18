<p align="center"><img src=".github/banner.png" alt="coc7-bascule-epoque" width="100%"></p>

# CoC7 – Bascule d'époque

Pour les campagnes à deux époques (1933 / 2025-2026) sur Foundry VTT v13/v14 avec L'Appel de Cthulhu 7e.
Un bouton **sablier** dans les contrôles de jetons (Gardien) ouvre la fenêtre de bascule : un clic sur **1933** ou **2025-2026** et toute la table change d'époque.

## Ce que fait la bascule
- **Suivis Chance / Santé Mentale / Bonds** : n'affichent plus que l'époque choisie.
- **Thème du chat** (module Cartes de chat thématiques) imposé à la table ; le HUD de combat, Token Action HUD et les fiches réglées « comme le chat » suivent.
- **Scène** activée pour tout le monde (facultatif).
- **Musique** : arrêt de ce qui joue et lancement de la playlist de l'époque (facultatif).
- **Dossiers** : ceux de l'autre époque sont masqués dans la barre latérale (module Masquer les dossiers de journaux).
- **Annonce** « La partie se poursuit en … » dans le chat (désactivable).
- **Bandeau animé** plein écran chez tous les joueurs : Art Déco noir et or pour 1933, écran polaire bleu glacier pour 2025-2026 (désactivable par époque, et par chaque joueur dans ses réglages). Bouton « Aperçu » dans les réglages des époques.

Les fiches thématiques changent toutes seules : elles suivent déjà l'époque de chaque investigateur.

## Réglages
- Fenêtre de bascule → **Réglages des époques…** (ou Paramètres → Bascule d'époque → Configurer) : nom, sous-titre, scène, playlist, thème du chat, annonce, pour chaque époque.
- **Rattacher un dossier à une époque** : clic droit sur le dossier → *Époque : 1933*, *Époque : 2025-2026* ou *Époque : les deux*. Une petite étiquette apparaît à côté du nom (visible du Gardien seulement).
- Pour masquer aussi les dossiers d'**acteurs**, activer « tous les onglets » dans les réglages de *Masquer les dossiers de journaux*.

## Macro
`game.modules.get("coc7-bascule-epoque").api.switchEra("1933")` ou `("modern")`.

## Installation
Manifeste : `https://github.com/magisterphamtom/coc7-bascule-epoque/releases/latest/download/module.json`
