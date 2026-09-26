# Bangre — gestion de la scolarité

Application SaaS pour la gestion de la scolarité des établissements scolaires au Burkina Faso : classes, élèves, tranches de paiement, reçus, rappels WhatsApp aux parents, et passage d'année.

Implémentation fonctionnelle (Next.js + base de données réelle) du design produit dans `../project/Bangre App.dc.html`.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + TypeScript + Tailwind CSS v4
- **Prisma 6** + SQLite (fichier local `prisma/dev.db`) — changer le `datasource` dans `prisma/schema.prisma` pour Postgres/MySQL en production
- **Auth** maison : session JWT (`jose`) dans un cookie httpOnly, mots de passe hachés (`bcryptjs`)
- **@react-pdf/renderer** pour les reçus, le journal de caisse et l'export PDF des retards
- **IndexedDB** (`idb`) + un service worker minimal (`public/sw.js`) pour la file de paiements hors ligne

## Démarrage

```bash
npm install
cp .env.example .env      # ajuster SESSION_SECRET au minimum
npx prisma db push        # crée prisma/dev.db à partir du schéma
npm run db:seed           # jeu de données de démonstration
npm run dev
```

Connexion de démonstration :

- Téléphone : `+226 70 11 22 33`
- Mot de passe : `password123`

## Intégrations WhatsApp / Mobile Money

Aucune des deux ne passe par une API métier — volontairement, pour ne dépendre d'aucun compte marchand ni d'API Business :

- **WhatsApp** (`src/lib/whatsapp.ts`) : rappels et confirmations de paiement sont des liens `wa.me` pré-remplis, ouverts et envoyés manuellement par l'utilisateur depuis son propre WhatsApp.
- **Mobile Money (abonnement)** : l'établissement envoie lui-même la cotisation (Orange Money / Moov Money) vers le numéro Bangre affiché sur `/abonnement` — le bouton « Composer » ouvre le clavier d'appel avec le code USSD pré-rempli. Le paiement est enregistré comme **en attente**, et un administrateur le confirme manuellement depuis `/admin` une fois la réception vérifiée sur le compte Mobile Money (`src/lib/subscription-core.ts` : `recordSubscriptionPayment` / `confirmSubscriptionPayment` / `rejectSubscriptionPayment`) — c'est seulement cette confirmation qui active ou prolonge l'abonnement.

### Messages de rappel

Le rappel ne dit pas la même chose selon la situation de l'élève (`src/lib/reminder-message.ts`, partagé entre le serveur et l'appareil hors ligne) :

- **échéance à venir** — « la 2e tranche … est attendue le 15/01/2027 » ;
- **une tranche en retard** — « la 1re tranche … était attendue le 15/10/2026. Elle a maintenant 12 jours de retard » ;
- **plusieurs tranches en retard** — le message les liste toutes (montant restant, échéance, jours de retard de chacune) et donne le total à régulariser. Les frais d'inscription impayés comptent parmi ces retards.

Chaque classe peut reformuler les trois messages dans sa configuration, avec un aperçu du message reçu par le parent. Variables : `{parent}`, `{eleve}`, `{classe}`, `{tranche}`, `{montant}`, `{echeance}`, `{ecole}`, plus `{retard}` (« 12 jours »), `{nombre}` (tranches en retard) et `{detail}` (une ligne par tranche en retard). Les trois textes sont stockés en JSON dans `SchoolClass.reminderMessageTemplate` (`null` = messages par défaut) ; un ancien modèle unique y reste lu comme le message « à venir », les deux autres prenant leur valeur par défaut.

## Compte de démonstration

Un établissement complet et crédible, à montrer aux clients potentiels, qui vit à côté des vraies écoles et n'expire jamais.

| | |
| --- | --- |
| Établissement | Groupe scolaire La Réussite |
| E-mail | `demo@bangre.bf` |
| Téléphone | `+226 00 11 22 33` |
| Mot de passe | `Bangre2026` |

Il contient 8 classes et 120 élèves (du CP1 à la 2nde), des tranches et des frais d'inscription, ~300 reçus dont quelques-uns **du jour même**, une trentaine d'élèves en retard, des parents injoignables sur WhatsApp à rappeler par téléphone, des rappels déjà envoyés, et une classe volontairement laissée sans montant de scolarité pour montrer l'invite de configuration. Les échéances sont calculées par rapport à la date du jour : la démo ne vieillit pas.

**Le créer ou le remettre à neuf :**

- **en ligne** — panneau `/admin`, carte « Compte de démonstration », bouton « Réinitialiser la démo ». C'est la façon recommandée : elle s'exécute contre la vraie base de production et n'a aucun effet sur les autres établissements ;
- **en local** — `npm run demo:reset` (à ne pas confondre avec `npm run db:seed`, qui vide toute la base).

Le jeu de données est déterministe (`src/lib/demo-dataset.ts`) : deux réinitialisations donnent la même école, donc une présentation répétée une fois se déroule pareil la fois suivante. Réinitialiser efface tout ce qui a été saisi pendant les démonstrations précédentes.

**Parcours suggéré (≈ 10 minutes) :**

1. **Tableau de bord** — « voilà où en est la scolarité de l'école » : total attendu, encaissé, reste à recouvrer, élèves en retard.
2. **Retards de paiement** — filtrer « + de 15 jours », puis « WhatsApp : injoignables » pour montrer la liste d'appels ; exporter en PDF.
3. **Envoyer un rappel** — sélectionner quelques familles, « Envoyer les rappels » : le message est pré-rempli, l'utilisateur l'ouvre dans son propre WhatsApp.
4. **Encaisser** — « Enregistrer un paiement », choisir un élève, cocher une tranche : le reçu se remplit à l'écran, le PDF est imprimable.
5. **Fiche élève** — tranches payées / en retard, historique des reçus, rappels envoyés.
6. **Mode avion** — couper le réseau du téléphone ou du portable, puis continuer à naviguer et encaisser un paiement : tout reste disponible et la barre latérale affiche « Hors ligne · 1 enregistrement en attente ».
7. **Réseau rétabli** — le paiement part tout seul, reçoit son numéro de reçu et apparaît dans le journal de caisse.

## Fonctionnement hors ligne

Bangre est utilisable **entièrement sans réseau** : la connexion sert à synchroniser, pas à travailler. Trois pièces :

**1. Une copie de l'école sur l'appareil.** `GET /api/offline/snapshot` renvoie tout l'établissement (école, année, classes et tranches, élèves, paiements et affectations, rappels) ; le navigateur la range dans IndexedDB (`src/lib/offline-mirror.ts`). Elle est re-téléchargée après chaque écriture acceptée par le serveur, à chaque reconnexion, au démarrage de l'app et au retour au premier plan si elle a plus de 5 minutes, et sinon toutes les 15 minutes tant que l'onglet est visible — une école entière représente un vrai téléchargement sur une connexion mobile. La barre latérale indique son âge (« Copie locale des données : il y a 3 min ») et permet de la rafraîchir à la main.

**2. Une application hors ligne qui lit cette copie.** `public/sw.js` sert `/hors-ligne` — le shell `src/components/offline-app.tsx` — pour **n'importe quelle page de l'app demandée sans réseau, y compris jamais visitée sur cet appareil**. Le shell lit l'URL, rend l'écran correspondant depuis IndexedDB et intercepte les liens pour naviguer localement : tableau de bord, classes, élèves d'une classe, liste des élèves, fiche élève, ajout et modification d'un élève, retards, paiements & reçus. Les chiffres sont calculés par `src/lib/offline-queries.ts`, qui applique les mêmes règles que `src/lib/queries.ts` côté serveur — l'égalité des deux est vérifiée sur la base de démonstration par `tests/integration/offline-parity.test.ts`.

Le service worker précharge le shell **et les fichiers dont il a besoin pour démarrer** (ses scripts, ses feuilles de style et les polices qu'elles référencent) : sans cela le document sortirait du cache sans pouvoir charger son propre JavaScript. Les pages visitées restent mises en cache (network-first) et servent de repli pour les écrans que le shell ne rend pas. Les redirections ne sont jamais mises en cache — sinon une session expirée ferait servir l'écran de connexion à la place du tableau de bord.

**3. Une file de sortie pour les saisies.** Fonctionnent sans réseau et sont mises en file dans IndexedDB (`src/lib/offline-queue.ts`) :

- enregistrer un paiement — avec le **détail réel des tranches** pour n'importe quel élève, reconstruit depuis la copie locale, pas seulement un montant libre ;
- ajouter un élève (le matricule proposé suit ceux déjà connus de l'appareil) ;
- modifier une fiche élève ;
- envoyer un rappel WhatsApp : le message est composé localement par `src/lib/reminder-message.ts` (le même code que le serveur), le lien `wa.me` s'ouvre, et l'envoi est enregistré à la synchronisation.

Ces saisies sont **rejouées sur la copie locale** (`applyPendingOperations`) : un paiement encaissé hors ligne apparaît aussitôt sur la fiche de l'élève, dans le total de la classe, sur le tableau de bord et dans le journal (marqué « Hors ligne », sans numéro de reçu). Un élève ajouté hors ligne peut aussitôt être ouvert, corrigé, encaissé et relancé : à la synchronisation, les saisies qui le visent reprennent l'identifiant que le serveur vient de lui donner. La confirmation WhatsApp d'un paiement hors ligne est proposée tout de suite, composée depuis la copie locale (le numéro de reçu n'y figure pas, il est attribué à la synchronisation). La barre latérale montre en permanence l'état (« En ligne » / « Hors ligne »), le nombre d'enregistrements en attente et leur libellé.

**Synchroniser.** Au retour du réseau, la file est rejouée dans l'ordre contre `/api/sync` — automatiquement (événement `online`, plus l'API Background Sync quand le navigateur la propose) ou via « Synchroniser maintenant » — puis la copie locale est re-téléchargée : l'appareil voit alors ses propres écritures telles que le serveur les a enregistrées (numéros de reçu, matricules, identifiants) et ce que les autres postes ont fait entre-temps. Le serveur applique exactement les mêmes règles qu'en ligne : les écritures passent par `students-core.ts`, `payments-core.ts` et `reminders-core.ts`, partagés avec les Server Actions.

Chaque entrée peut arriver deux fois sans effet de bord — sur une connexion faible, le serveur peut l'appliquer sans que sa réponse n'atteigne l'appareil : un paiement rejoué renvoie le paiement déjà enregistré (repère `sync:<id>` dans `Payment.note`, pas de second reçu), un élève ou un rappel déjà créé est reconnu. Si le matricule proposé hors ligne a été pris entre-temps par un autre poste, l'élève reçoit le suivant libre plutôt que d'être refusé.

Une entrée que le serveur refuse définitivement (classe supprimée, élève supprimé entre-temps…) est mise de côté avec son motif, **affichée dans la barre latérale jusqu'à ce que l'utilisateur la retire** — elle ne bloque pas les suivantes et ne disparaît pas en silence. Une panne réseau, elle, interrompt la reprise et laisse tout en attente. Chaque saisie retient l'établissement pour lequel elle a été faite : sur un poste partagé, elle attend la reconnexion de ce compte au lieu d'être appliquée à un autre.

L'export Excel des retards se fait aussi hors ligne, écrit par l'appareil à partir des lignes affichées.

**Ce qui reste en ligne** (le shell l'annonce clairement au lieu d'échouer) : les exports PDF et les reçus PDF, l'import de listes d'élèves, la création et la configuration d'une classe, le passage d'année, l'abonnement et l'administration. Il n'y a pas non plus de résolution de conflits multi-appareils : deux postes qui modifient la même fiche hors ligne appliqueront leurs versions dans l'ordre d'arrivée, la dernière l'emportant.

`experimental.useOffline` (Next 16) n'est **pas** activé volontairement : il ferait attendre indéfiniment une Server Action lancée sans réseau, au lieu de la laisser échouer immédiatement pour tomber dans la file locale.

**Tester.** `npm run build && npx tsx _offline-test.ts` lance un vrai navigateur, se connecte, **arrête le serveur**, consulte des pages jamais visitées, encaisse un paiement, ajoute un élève puis l'encaisse aussitôt, prépare un rappel, relance le serveur et vérifie que tout est arrivé en base, sur le bon élève. `tests/integration/sync.test.ts` vérifie qu'une entrée rejouée deux fois ne crée ni doublon ni second numéro de reçu.

## Simplifications par rapport à la maquette

- La liste des retards n'est pas paginée (défilement simple) — la maquette montrait une pagination.
- L'import des élèves accepte les fichiers Excel `.xlsx` natifs (lecture via `fflate`, `src/lib/xlsx.ts`) et tout fichier texte délimité (CSV/TSV/point-virgule). Les colonnes sont reconnues automatiquement dans n'importe quel ordre et sous n'importe quel intitulé (`src/lib/student-import.ts`), puis une grille de correspondance permet à l'utilisateur de corriger chaque colonne avant l'import. Non couvert : `.xls` binaire ancien, classeurs protégés par mot de passe, feuilles multiples (seule la première est lue).
- Le passage d'année implémente l'écran « cocher = passe, décocher = redouble » avec persistance réelle (nouvelle année scolaire, nouvelles classes, déplacement des élèves) ; les autres étapes du parcours à 4 étapes de la maquette sont regroupées dans cet unique écran plutôt que reproduites une à une.

## Structure

```
prisma/schema.prisma       modèle de données (école, classes, tranches, élèves, paiements…)
prisma/seed.ts             jeu de données de démonstration
src/lib/                   logique métier (tuition.ts, payments-core.ts…), accès aux données, actions serveur
src/lib/offline-*.ts       copie locale de l'école : snapshot, file de sortie, requêtes hors ligne
src/components/            composants partagés (UI, modale de paiement, tableau élèves…)
src/components/views/      écrans partagés entre les pages serveur et l'application hors ligne
src/app/(auth)/            connexion, inscription, abonnement
src/app/(app)/             application principale (sidebar + toutes les pages protégées)
src/app/api/                endpoints PDF/CSV, snapshot hors ligne et synchronisation
src/app/hors-ligne/        l'application rendue depuis la copie locale (servie par le service worker)
```
