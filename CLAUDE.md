# CLAUDE.md — YGO Auto-Battler (Web)

## Project Overview

Port web d'un Auto-Battler inspiré de :

- Yu-Gi-Oh
- Teamfight Tactics
- Auto Chess
- Marvel Snap

Migré depuis Godot 4.5.1. Gameplay-complete pour le premier vertical slice.

**Stack :** Vanilla JS ES modules, Express.js, Railway. Zéro bundler, zéro framework.

La philosophie du projet :

- Data-driven gameplay
- Mobile-first UX
- Simple mais tactiquement profond
- Séparation stricte logique / visuel

---

## Current State

Terminé :

- Phases 1–6 complètes (Foundation → Combat visuel)
- Boucle de jeu complète sur 5 tours
- Tous les systèmes d'invocation
- Système de pouvoirs
- Archetypes
- Pathfinding
- IA ennemie
- DeckBuilder + DeckSelector + MainMenu
- Board UI + Préparation
- Combat animé (requestAnimationFrame)
- Support mobile (Pointer Events)

En cours :

- Phase 7 — Polish mobile (safe areas, PWA, orientation, touch targets)

---

## Déploiement

```
npm start          # port 3742 local
```

Railway auto-deploy sur push `master`.
Repo : `https://github.com/srida/my-auto-battler`

---

## Routes Express

| Route | Accès | Description |
|---|---|---|
| `GET /` | Public | Jeu (SPA) |
| `GET /admin` | Auth basique | Card Manager |
| `GET /api/cards` | Public | 253 cartes |
| `GET /api/archetypes` | Public | Archetypes |
| `GET /api/powers` | Public | Pouvoirs |
| `POST/PUT/DELETE /api/*` | Auth | Écriture admin |
| `GET /illustrations/:id` | Public | Art des cartes (PNG sans extension) |
| `POST /api/cards/import` | Auth | Import en masse (mode skip/replace) |
| `POST /api/cards/:id/illustration` | Auth | Upload illustration (URL ou base64) |
| `POST /api/archetypes/import` | Auth | Import archetypes en masse |
| `POST /api/powers/import` | Auth | Import pouvoirs en masse |
| `GET /api/export` | Auth | Export complet avec checksums illustrations |

---

## Architecture

Principe fondamental : **logique ≠ visuel**. Les classes `logic/` ne touchent jamais le DOM.

```
game/
├── main.js                  ← Router SPA, bootstrap, swap d'écrans
├── game.css                 ← Variables CSS, design system
├── data/
│   ├── CardDatabase.js      ← fetch /api/cards, cache mémoire
│   ├── ArchetypeDatabase.js ← fetch /api/archetypes
│   ├── PowerDatabase.js     ← fetch /api/powers
│   └── DeckRepository.js   ← localStorage (same interface as Godot)
├── logic/
│   ├── Unit.js              ← État runtime d'une unité
│   ├── Board.js             ← Source de vérité des positions (grille 5×8)
│   ├── GameState.js         ← Phases, tours, HP, multiplicateurs
│   ├── CombatManager.js     ← Boucle de combat, step() → events[]
│   ├── InvocationManager.js ← Validation + exécution des 5 types de summon
│   ├── ArchetypeManager.js  ← Comptage archetypes + application des bonus
│   ├── PathFinder.js        ← BFS sur la grille
│   └── EnemyAI.js           ← Placement IA, calcul multiplicateur
└── ui/
    ├── screens/
    │   ├── MainMenu.js
    │   ├── DeckSelector.js
    │   ├── DeckBuilder.js
    │   ├── GameScreen.js
    │   └── TestBench.js      ← Mode développeur
    └── components/
        ├── BoardGrid.js      ← CSS Grid 5×8, gestion des cases
        ├── UnitCard.js       ← Affichage unité, HP bar, power gauge
        ├── HandUI.js         ← Main du joueur, scroll horizontal
        ├── Tooltip.js        ← Instance unique globale, tap-to-show
        └── CombatAnimator.js ← requestAnimationFrame, consomme CombatManager.step()
```

---

## Data Layer

Chaque database expose `init()` async. Les données sont cachées en mémoire après le premier fetch.

```js
await CardDatabase.init()       // charge /api/cards
CardDatabase.getCard(id)
CardDatabase.getCardsByTier(tier)
CardDatabase.getAllCards()
CardDatabase.buildDeckFromIds(ids)

await ArchetypeDatabase.init()
ArchetypeDatabase.getArchetype(id)
ArchetypeDatabase.archetypes    // Dictionary

await PowerDatabase.init()
PowerDatabase.getPower(id)

DeckRepository.saveDeck(name, deck)
DeckRepository.loadDeck(name)
DeckRepository.deleteDeck(name)
DeckRepository.renameDeck(oldName, newName)
DeckRepository.deckExists(name)
DeckRepository.getActiveDeck()
DeckRepository.setActiveDeck(name)
DeckRepository.hasDeck(name)
DeckRepository.listDecks()
DeckRepository.setPendingEdit(name)      // stocke en sessionStorage
DeckRepository.consumePendingEdit()      // lit ET efface le pendingEdit
```

**DeckRepository** persiste en `localStorage`. Structure d'un deck :
```json
{ "1": ["CORE_001", ...], "2": [...], "3": [...], "4": [...], "5": [...] }
```

---

## CombatManager — Pattern headless

`CombatManager` ne contient aucune manipulation DOM.

`step()` retourne un tableau d'événements :

```js
{ type: 'move',        unit, from, to }
{ type: 'attack',      attacker, target, damage }
{ type: 'power',       unit, targets, power_id, extra: {...} }
{ type: 'dot',         unit, damage }               // pulse de poison
{ type: 'stat_change', unit, stat, value }          // effet archetype during_combat
{ type: 'death',       unit }
{ type: 'combat_end',  winner }
```

`CombatAnimator` consomme ces événements via `requestAnimationFrame` et applique les animations CSS.

Le timing est géré par `CombatAnimator`, jamais par `CombatManager`. Pas de `setTimeout` dans la logique.

**Timing :** `BASE_TICK_MS = 180` — intervalle de base entre les steps. Vitesse effective : `BASE_TICK_MS / speed` (speed = 1 | 2 | 4).

---

## Navigation SPA

`main.js` gère le swap d'écrans via un routeur minimaliste :

```
MainMenu → DeckSelector → DeckBuilder → GameScreen
MainMenu → TestBench (dev)
```

Les écrans sont des classes JS qui exposent `mount(container)` et `unmount()`.

Communication inter-écrans via `DeckRepository.setPendingEdit(name)` pour le mode édition du DeckBuilder.

---

## Core Game Loop

Chaque partie dure 5 tours.

Pour chaque tour :

1. Préparation (30 secondes — placement des cartes, Pot de Cupidité, Monster Reborn)
2. Combat (auto-résolu, animé)
3. Fin de combat (dégâts aux HP, nettoyage)
4. Tour suivant

Fin de partie :
- Tour 5 terminé
- OU un joueur atteint 0 HP

**HP des joueurs : 1000.**

À la fin de la phase de combat :
```js
damage = sum(unit.atk for unit of survivingEnemyUnits) × multiplier
```

---

## Draw System

Pioche de 5 cartes au début de chaque tour.

Le pool dépend du tour :

| Tour | Tiers disponibles |
|---|---|
| 1 | Tier 1 |
| 2 | Tier 1, 2 |
| 3 | Tier 1, 2, 3 |
| 4 | Tier 2, 3, 4 |
| 5+ | Tier 3, 4, 5 |

Les cartes non jouées sont défaussées à la fin de la phase de préparation.

**Pioches garanties** (issues des effets d'archetype `guaranteed_draw`) :
Ordre de priorité de résolution : Transformation > Rituel > Fusion > Pioche normale.

---

## Damage Multiplier

Chaque tour commence avec un multiplicateur de 1.0.

```js
multiplier = 1.0 + cards_in_hand / 10.0
```

Appliqué symétriquement. Tension risk/reward : garder des cartes en main booste les dégâts sortants mais affaiblit le board.

Implémenté dans `GameState.js` :
```js
gameState.player_multiplier
gameState.enemy_multiplier
```

Calculé dans `GameScreen.js` (côté joueur) et `EnemyAI.computeMultiplier()`.

---

## Pot de Cupidité

> ⚠️ Non implémenté — prévu Phase 8

Disponible pendant la phase de préparation. Utilisable une fois par tour.

Effet : piocher 2 cartes supplémentaires.

Coût en HP :

| Tour | Coût |
|---|---|
| 1 | 50 PV |
| 2 | 75 PV |
| 3 | 100 PV |
| 4 | 150 PV |
| 5 | 200 PV |

Après utilisation : le bouton devient grisé pour le reste de la préparation.

---

## Monster Reborn

> ⚠️ Non implémenté — prévu Phase 8

Disponible à partir du tour 2. Utilisable une fois par tour.

Effet : ressusciter une unité neutralisée. L'unité revient avec 50% de ses HP maximum.

Coût en HP (identique au Pot de Cupidité par tour).

Flux :
1. Joueur active Monster Reborn
2. Les unités neutralisées sont surlignées en violet
3. Joueur sélectionne l'unité à ressusciter
4. Les cases disponibles s'affichent en vert
5. Joueur sélectionne la case de placement
6. Bouton grisé pour le reste de la préparation

Après utilisation : bouton grisé. L'unité ressuscitée est de nouveau active sur le board.

---

## Board

Taille : 5 colonnes × 8 rangées

Joueur : rangées 0–3
Ennemi : rangées 4–7

Maximum d'unités sur le board : **5** (6 avec certaines synergies d'archetype).

Pendant la préparation :
- Joueur voit uniquement son côté
- Ennemis masqués (classe CSS `.hidden`)

Pendant le combat :
- Board entier visible
- Les deux côtés affichés

**`Board.js` est la source de vérité.**

Ne jamais déduire une position depuis un élément DOM.

Toujours faire confiance à :
```js
unit.position
board.grid
```

**Structure interne :** `grid[col][row]` — stockage en ordre col-major.

```js
board.grid[2][0]  // unité en colonne 2, rangée 0 (milieu haut, côté joueur)
```

---

## Unit Model

Propriétés runtime :

```js
atk
max_hp
current_hp

shield

power_gauge

dot_effects       // []
paralysis_ticks
attack_speed_modifier

position          // { col, row }
initial_position

is_neutralized
```

Les unités persistent entre les tours.

Unités détruites : retirées définitivement.

Survivants : retournent à `initial_position` après le combat.

---

## Graveyard (Cimetière)

Les unités neutralisées entrent dans `graveyard[]` (joueur) ou `enemyGraveyard[]` (ennemi).

Rôle pendant la phase de préparation :
- Disponibles comme matériaux d'invocation (sacrifice, fusion, rituel, transformation)
- Une unité venant du cimetière **ne consomme pas de slot de board** lors d'une transformation (elle est déjà hors jeu)
- Supprimées définitivement au lancement du combat si non consommées

---

## End of Combat Rules

**Fin du combat → fin de la phase de préparation suivante :**

Unités neutralisées :
- Restent sur le board après le combat
- Restent disponibles toute la phase de préparation suivante
- Peuvent être utilisées comme matériaux d'invocation (sacrifice, fusion, rituel)
- Sont définitivement retirées au lancement du combat suivant si non consommées

Survivantes :
- Retournent à `initial_position`
- La grille est reconstruite

**À la fin du combat, les dégâts sont appliqués :**
```js
// winner = 'player' → l'ennemi prend des dégâts
enemy_hp -= round(sum(survivingPlayerUnits.atk) × player_multiplier)

// winner = 'enemy' → le joueur prend des dégâts
player_hp -= round(sum(survivingEnemyUnits.atk) × enemy_multiplier)

// draw → aucun dégât
```

`applyEndOfCombat(winner, playerSurvivorsAtk, enemySurvivorsAtk, archetypeResult)`
— reçoit la somme d'ATK, pas un nombre d'unités.

Effets des pouvoirs : prennent fin à la fin du combat (sauf indication contraire).

Ne jamais modifier un tableau pendant son itération :

```js
for (const unit of [...units]) {
```

---

## Summoning System

### Normal

Placement direct.

---

### Tribute (Sacrifice)

```json
{ "summon_type": "sacrifice" }
```

Consomme des unités alliées.

---

### Fusion

Requiert des matériaux spécifiques.

Consomme les matériaux.

---

### Ritual

Requiert :
- Matériau rituel
- Tributs supplémentaires

---

### Transformation

Requiert une unité spécifique déjà en jeu.

La remplace. Conserve la position du monstre d'origine.

---

**Chaînage :** une invocation peut être immédiatement suivie d'une autre (sacrifice, fusion, rituel, transformation) tant que les conditions sont remplies.

`InvocationManager` expose :
```js
canSummon(cardId, pos, board, hand) → { ok: bool, reason: string }
summon(cardId, pos, board, hand)    → Unit | null
```

---

## Archetypes

Chargés depuis `/api/archetypes`.

Un monstre peut posséder un ou plusieurs archetypes. Un seul palier d'archetype est actif à la fois (le plus élevé atteint).

Effets supportés :

- `stat_bonus`
- `stat_modifier`
- `draw_bonus`
- `guaranteed_draw`
- `revive`
- `shield`
- `board_slot_bonus`

### Timings

Les effets se déclenchent à trois moments précis :

- `start_of_combat` — bonus initiaux (stats, boucliers, slots de board)
- `during_combat` — effets réactifs aux événements (ex: neutralisation)
- `end_of_combat` — effets différés (pioches garanties, réanimation)

### Réinitialisation

Tous les bonus d'archetype sont réinitialisés à la fin de chaque combat.

Les effets `start_of_combat` sont recalculés au prochain combat en fonction des unités présentes au lancement. Le bonus de slot (ex: Yeux Bleus +1) n'est actif que si les unités déclenchant le palier sont toujours en vie.

`ArchetypeManager.computeBonuses(units, archetypeDb)` — appelé au début de chaque combat.

### Détails d'implémentation

- `stat_bonus` avec champ `value_per` : la valeur est multipliée par le nombre d'unités **ennemies** portant cet archetype (bonus contextuel)
- `shield` : la valeur est multipliée par le nombre d'unités **alliées vivantes** au moment du déclenchement
- Les seuils `during_combat` sont **verrouillés au début du combat** — les morts en cours de combat ne désactivent pas les effets déjà actifs
- `reapplyBonuses(unit)` : ré-applique les bonus `start_of_combat` après un `POWER_DEBUFF` (qui réinitialise les stats de la cible)
- `getActiveSynergies(units)` → `[{arch, count, activeThreshold, nextThreshold}]` — utilisé par le panneau d'archetypes de l'UI

---

## Powers

Chargés depuis `/api/powers`.

Une unité peut avoir : zéro ou un pouvoir.

La jauge se charge avec le temps. Quand elle est pleine :
- Le pouvoir s'active
- Remplace l'attaque normale
- La jauge se réinitialise

Pouvoirs implémentés :

`POWER_HEAL` — soigne l'allié avec le moins de HP

`POWER_SHIELD` — applique un bouclier

`POWER_SUPER_ATTACK` — dégâts lourds sur une cible

`POWER_AOE_ATTACK` — dégâts à tous les ennemis en vie

`POWER_POISON` — applique un effet DOT (`dot_effects`)

`POWER_PARALYSIS` — réduit la vitesse d'attaque temporairement (`attack_speed_modifier`, `paralysis_ticks`)

`POWER_PUSH` — pousse la cible de X cases (respecte les limites du board et les cases occupées)

`POWER_DEBUFF` — réinitialise tous les bonus de stats sur la cible (`resetCombatStats` + `recomputeStats`)

`POWER_BLOCK` — empêche l'utilisation du pouvoir

**Règles importantes :**
- Un pouvoir ne se déclenche jamais pendant la phase de préparation
- Les effets de pouvoir prennent fin à la fin du combat (sauf indication contraire dans la définition du pouvoir)

---

## Combat Rules

Chaque unité :

1. Cherche une cible
2. Se déplace si nécessaire
3. Attaque si à portée

### Ciblage

Priorité à la **ligne de front ennemie** : la rangée ennemie la plus avancée vers le joueur (rangée avec la valeur Y la plus basse côté joueur, la plus haute côté ennemi).

Parmi les candidats de cette rangée :
1. Priorité à l'unité la plus proche (distance de Manhattan)
2. En cas d'égalité de distance : priorité à l'unité avec le moins de HP

Aucun hasard. Le combat est entièrement déterministe.

### Portée des attaques

Toutes les unités utilisent la **distance de Manhattan** — `|dx| + |dy|` (4 directions cardinales uniquement, pas de diagonales).

```js
isInAttackRange(attacker, target) → manhattanDistance(pos, target.pos) <= attacker.range
```

---

## Movement

Pathfinding BFS implémenté dans `PathFinder.js`.

Les unités ne peuvent pas se chevaucher.

Exception : les unités neutralisées peuvent temporairement rester jusqu'au nettoyage.

L'occupancy du board doit toujours être mise à jour lors d'un déplacement :

```js
board.moveUnit(unit, to)  // met à jour grid + unit.position ensemble
```

---

## EnemyAI — Stratégie de placement

L'IA place les unités en deux passes :
1. Cartes normales en premier (libèrent les matériaux potentiels)
2. Cartes à invocation spéciale (peuvent consommer les unités posées)

Arrangement post-placement (`rearrangeUnits`) :
- Unités mêlée (range ≤ 1) → rangées 4–5 (front)
- Unités à distance (range > 1) → rangées 6–7 (back)
- Ordre de colonnes : `[2, 1, 3, 0, 4]` (centre vers bords)
- HP le plus élevé → rangée la plus avancée dans chaque groupe
- Maximum 3 unités par rangée, débordement vers la rangée suivante

---

## Combat UI Indicators

Pendant la phase de combat, chaque `UnitCard` affiche des indicateurs visuels :

**Jauges de cooldown circulaires** (au-dessus de la HP bar) :
- Rouge : cooldown d'attaque
- Vert : cooldown de mouvement
- Jaune : jauge de pouvoir
- Masquées si le cooldown est au maximum (pas encore entamé)

**HP bar** : masquée si HP = 100%

**Shield bar** : masquée si shield = 0

**Icônes de statut** (à côté de l'unité) :
- Empoisonnée
- Paralysée
- Pouvoir bloqué

**Panneau d'archetypes** : s'affiche en haut du board dès que des monstres sont présents. Tap sur l'icône d'un archetype → tooltip avec le palier actif et l'effet.

**Indicateur de slots** : en phase de préparation, affiche les emplacements libres sur le terrain. Remplacé par le **multiplicateur de dégâts** au lancement du combat.

---

## Tooltip System

Mobile-first. Pas de dépendance au hover.

Comportement :

- Tap carte → afficher
- Tap unité → afficher
- Tap ailleurs → masquer

Instance globale unique (`Tooltip.js`).

Contenu : nom, stats, pouvoir, archetypes, coût d'invocation.

---

## Drag & Drop

Repositionnement d'unités pendant la préparation.

Implémenté avec Pointer Events API :
- `pointerdown`, `pointermove`, `pointerup`
- Unifie click et touch

Validation `board.isOccupied(pos)` avant le drop.

---

## DeckBuilder

Contrainte : 8 cartes par tier (ou `min(8, pool_size)` si le tier a moins de 8 cartes).

Validation bloquante : le deck ne peut être sauvegardé que si tous les tiers sont complets.

Mode édition : déclenché via `DeckRepository.setPendingEdit(deckName)` avant de naviguer vers DeckBuilder.

---

## TestBench

Écran développeur accessible depuis `MainMenu` (bouton TestBench).

Différences avec `GameScreen` :
- Placement libre pour les deux équipes (pas de règles d'invocation, pas de main, pas de deck)
- Filtre par `summon_type` dans le browser de cartes
- Suppression d'une unité par clic droit (ou long press mobile)
- Pas de tours, pas de HP joueur, pas de multiplicateur
- Board inspector : overlay live avec stats de toutes les unités pendant le combat
- Unités ennemies masquées visuellement en phase de préparation post-combat
- Bouton Pause pour le combat

---

## CSS Rules

- Variables CSS via `var(--*)` — toujours utiliser les variables définies dans `game.css`
- Pas de styles inline dans le JS (exception : `transform: translate()` dans les animations)
- Mobile-first : écrire pour mobile, surcharger pour desktop avec `@media (min-width: ...)`
- Touch targets : **44px minimum** sur tous les éléments interactifs
- Safe areas iOS : `env(safe-area-inset-*)` pour les bords de l'écran

---

## Mobile Rules

- Pointer Events API sur tous les éléments interactifs (pas de `mousedown`/`touchstart` séparés)
- Tester sur Safari iOS en portrait (priorité)
- Portrait recommandé ; afficher un message si l'utilisateur passe en paysage
- `manifest.json` PWA : icône, nom, couleurs de thème
- Bouton plein écran (Fullscreen API)

---

## Important Design Rules

Toujours garder :

**Logique ≠ Visuel**

Les classes `logic/` ne doivent jamais :
- Manipuler le DOM
- Importer des composants UI
- Contenir de `requestAnimationFrame`

Les classes `ui/` ne doivent jamais contenir :
- Logique de combat
- Logique d'archetype
- Logique d'invocation

---

## Known Technical Lessons

Le board est la source de vérité.

Ne jamais déduire une position depuis la position d'un élément DOM.

Des bugs ont déjà découlé de désynchronisations entre :
- `unit.position`
- `board.grid`
- Position DOM

Lors d'un déplacement d'unité :

1. Mettre à jour `board.grid`
2. Mettre à jour `unit.position`
3. Animer visuellement

Dans cet ordre.

---

## Development Philosophy

Préférer :

- Systèmes simples
- Comportement déterministe
- Design data-driven
- UX mobile-friendly
- Zéro bundler tant que la complexité ne l'exige pas

Éviter :

- Hasard caché
- State machines complexes
- Logique visuelle mélangée à la logique de jeu
- Styles inline

Le jeu doit ressembler à :

"Yu-Gi-Oh Auto Chess avec la cadence de Marvel Snap."
