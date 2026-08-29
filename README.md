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

## Fonctionnement hors ligne

- `public/sw.js` met en cache les pages déjà visitées et les assets statiques (stratégie network-first) pour permettre de continuer à naviguer sans réseau.
- La modale « Enregistrer un paiement » bascule automatiquement en mode réduit (montant libre, sans détail des tranches) dès que le réseau est indisponible, et met le paiement en file dans IndexedDB.
- Au retour du réseau, la file est synchronisée automatiquement (`/api/payments/sync`) et le reçu numéroté est généré côté serveur.

C'est une implémentation pragmatique — elle couvre le cas d'usage principal (saisir un paiement au guichet sans connexion), pas une architecture offline-first complète (pas de résolution de conflits multi-appareils, par exemple).

## Simplifications par rapport à la maquette

- La liste des retards n'est pas paginée (défilement simple) — la maquette montrait une pagination.
- L'import Excel/CSV des élèves accepte un CSV à colonnes fixes (`Matricule,Nom,Prenom,DateNaissance,NumeroParent`), sans interface de correspondance des colonnes (explicitement listé comme non couvert dans le brief de conception).
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
