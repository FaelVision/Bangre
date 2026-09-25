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

### Rappels automatiques

`POST /api/cron/reminders` (protégé par `CRON_SECRET` en en-tête `Authorization: Bearer`) est le point d'entrée horaire : appelez-le une fois par heure depuis un planificateur externe (Render Cron Job, GitHub Actions, cron-job.org). Pour chaque école abonnée, chaque classe dont les rappels sont activés envoie **à son heure configurée** (`reminderHour`, fuseau UTC+0) :

- un rappel **avant** échéance dès que la date d'une tranche non soldée entre dans la fenêtre `reminderBeforeDays` ;
- un rappel **après** échéance à chaque palier de `reminderAfterDays` (« 3,10 » → à 3 puis 10 jours de retard).

Tout est idempotent (un rappel `(élève, tranche, déclencheur)` n'est envoyé qu'une fois, `Reminder.trancheId`) et borné (jamais plus d'un rappel par élève / 72 h, jamais si la famille est à jour). La logique de sélection est isolée et testée dans `src/lib/reminder-schedule.ts` ; l'envoi passe par `src/lib/reminders-core.ts`, partagé avec les rappels manuels et la file hors ligne.

`GET/POST /api/whatsapp/webhook` reçoit les accusés de livraison Meta (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) et fait passer chaque `Reminder` de `sent` → `delivered` → `read` (ou `failed`) via `providerMessageId`.

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

Ces saisies sont **rejouées sur la copie locale** (`applyPendingOperations`) : un paiement encaissé hors ligne apparaît aussitôt sur la fiche de l'élève, dans le total de la classe, sur le tableau de bord et dans le journal (marqué « Hors ligne », sans numéro de reçu). La barre latérale montre en permanence l'état (« En ligne » / « Hors ligne »), le nombre d'enregistrements en attente et leur libellé.

**Synchroniser.** Au retour du réseau, la file est rejouée dans l'ordre contre `/api/sync` — automatiquement (événement `online`, plus l'API Background Sync quand le navigateur la propose) ou via « Synchroniser maintenant » — puis la copie locale est re-téléchargée : l'appareil voit alors ses propres écritures telles que le serveur les a enregistrées (numéros de reçu, matricules, identifiants) et ce que les autres postes ont fait entre-temps. Le serveur applique exactement les mêmes règles qu'en ligne : les écritures passent par `students-core.ts`, `payments-core.ts` et `reminders-core.ts`, partagés avec les Server Actions.

Une entrée que le serveur refuse définitivement (matricule en double, élève supprimé entre-temps) est retirée de la file avec son motif conservé, pour qu'une seule ligne fautive ne bloque pas indéfiniment les suivantes. Une panne réseau, elle, interrompt la reprise et laisse tout en attente.

**Ce qui reste en ligne** (le shell l'annonce clairement au lieu d'échouer) : les exports PDF / Excel et les reçus, l'import de listes d'élèves, la création et la configuration d'une classe, le passage d'année, l'abonnement et l'administration. Il n'y a pas non plus de résolution de conflits multi-appareils : deux postes qui modifient la même fiche hors ligne appliqueront leurs versions dans l'ordre d'arrivée, la dernière l'emportant.

`experimental.useOffline` (Next 16) n'est **pas** activé volontairement : il ferait attendre indéfiniment une Server Action lancée sans réseau, au lieu de la laisser échouer immédiatement pour tomber dans la file locale.

**Tester.** `npm run build && npx tsx _offline-test.ts` lance un vrai navigateur, se connecte, **arrête le serveur**, consulte des pages jamais visitées, encaisse un paiement, ajoute un élève, relance le serveur et vérifie que tout est arrivé en base.

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
