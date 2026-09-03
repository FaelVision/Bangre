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

`src/lib/whatsapp.ts` et `src/lib/mobilemoney.ts` implémentent l'appel réel à l'API (WhatsApp Cloud API pour les rappels, Orange Money / Moov Money pour l'abonnement), mais **tombent en mode simulation** tant que les identifiants correspondants ne sont pas renseignés dans `.env` :

- Sans `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` : les rappels et confirmations de paiement sont enregistrés en base et journalisés dans la console, sans appel réseau.
- Sans les identifiants Orange/Moov Money : le paiement de l'abonnement (5000 CFA/mois) est auto-approuvé, comme si l'USSD avait été validé.

Cela permet de faire fonctionner tout le flux de bout en bout sans compte marchand, et de brancher les vrais identifiants plus tard sans changer le reste du code.

### Rappels automatiques

`POST /api/cron/reminders` (protégé par `CRON_SECRET` en en-tête `Authorization: Bearer`) est le point d'entrée horaire : appelez-le une fois par heure depuis un planificateur externe (Render Cron Job, GitHub Actions, cron-job.org). Pour chaque école abonnée, chaque classe dont les rappels sont activés envoie **à son heure configurée** (`reminderHour`, fuseau UTC+0) :

- un rappel **avant** échéance dès que la date d'une tranche non soldée entre dans la fenêtre `reminderBeforeDays` ;
- un rappel **après** échéance à chaque palier de `reminderAfterDays` (« 3,10 » → à 3 puis 10 jours de retard).

Tout est idempotent (un rappel `(élève, tranche, déclencheur)` n'est envoyé qu'une fois, `Reminder.trancheId`) et borné (jamais plus d'un rappel par élève / 72 h, jamais si la famille est à jour). La logique de sélection est isolée et testée dans `src/lib/reminder-schedule.ts` ; l'envoi passe par `src/lib/reminders-core.ts`, partagé avec les rappels manuels et la file hors ligne.

`GET/POST /api/whatsapp/webhook` reçoit les accusés de livraison Meta (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) et fait passer chaque `Reminder` de `sent` → `delivered` → `read` (ou `failed`) via `providerMessageId`.

## Fonctionnement hors ligne

**Consulter.** `public/sw.js` précharge à l'installation le tableau de bord, les classes, les élèves, les retards et les paiements, puis met en cache chaque page visitée (network-first : le réseau d'abord, le cache seulement en repli). Une page jamais consultée affiche `/hors-ligne` plutôt qu'une erreur du navigateur. Les redirections ne sont jamais mises en cache — sinon une session expirée ferait servir l'écran de connexion à la place du tableau de bord.

**Saisir.** Ces opérations fonctionnent sans réseau et sont placées dans une file IndexedDB (`src/lib/offline-queue.ts`) :

- enregistrer un paiement (si l'élève a déjà été consulté en ligne, la modale garde le détail des tranches, mis en cache localement ; sinon elle bascule en montant libre) ;
- ajouter un élève ;
- modifier une fiche élève ;
- envoyer un rappel WhatsApp (mis en file, ré-vérifié puis envoyé à la reconnexion).

La barre latérale montre en permanence l'état (« En ligne » / « Hors ligne »), le nombre d'enregistrements en attente et leur libellé.

**Synchroniser.** Au retour du réseau, la file est rejouée dans l'ordre contre `/api/sync`, automatiquement (événement `online`, plus l'API Background Sync quand le navigateur la propose) ou via « Synchroniser maintenant ». Le serveur applique exactement les mêmes règles qu'en ligne — les écritures passent par `students-core.ts`, `payments-core.ts` et `reminders-core.ts`, partagés avec les Server Actions — et les reçus sont numérotés côté serveur au moment de la synchronisation.

Une entrée que le serveur refuse définitivement (matricule en double, élève supprimé entre-temps) est retirée de la file avec son motif conservé, pour qu'une seule ligne fautive ne bloque pas indéfiniment les suivantes. Une panne réseau, elle, interrompt la reprise et laisse tout en attente.

C'est une implémentation pragmatique : elle couvre la saisie au guichet sans connexion, pas une architecture offline-first complète. En particulier, il n'y a pas de résolution de conflits multi-appareils — deux postes qui modifient la même fiche hors ligne appliqueront leurs versions dans l'ordre d'arrivée, la dernière l'emportant. La consultation hors ligne se limite aux pages déjà visitées ; les exports PDF, le passage d'année et l'administration restent indisponibles hors ligne.

## Simplifications par rapport à la maquette

- La liste des retards n'est pas paginée (défilement simple) — la maquette montrait une pagination.
- L'import des élèves accepte les fichiers Excel `.xlsx` natifs (lecture via `fflate`, `src/lib/xlsx.ts`) et tout fichier texte délimité (CSV/TSV/point-virgule). Les colonnes sont reconnues automatiquement dans n'importe quel ordre et sous n'importe quel intitulé (`src/lib/student-import.ts`), puis une grille de correspondance permet à l'utilisateur de corriger chaque colonne avant l'import. Non couvert : `.xls` binaire ancien, classeurs protégés par mot de passe, feuilles multiples (seule la première est lue).
- Le passage d'année implémente l'écran « cocher = passe, décocher = redouble » avec persistance réelle (nouvelle année scolaire, nouvelles classes, déplacement des élèves) ; les autres étapes du parcours à 4 étapes de la maquette sont regroupées dans cet unique écran plutôt que reproduites une à une.

## Structure

```
prisma/schema.prisma       modèle de données (école, classes, tranches, élèves, paiements…)
prisma/seed.ts             jeu de données de démonstration
src/lib/                   logique métier (tuition.ts, payments-core.ts…), accès aux données, actions serveur
src/components/            composants partagés (UI, modale de paiement, tableau élèves…)
src/app/(auth)/            connexion, inscription, abonnement
src/app/(app)/             application principale (sidebar + toutes les pages protégées)
src/app/api/                endpoints PDF/CSV et synchronisation hors ligne
```
