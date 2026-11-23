# Broken Website Detector

Service NestJS de surveillance de sites clients. L'application ouvre les
pages dans Chromium avec Playwright, collecte les erreurs navigateur et les
métriques DOM, puis applique des règles déterministes pour produire un
résultat `HEALTHY`, `BROKEN`, `DOUBTFUL` ou `BLOCKED`.

Le projet sépare :

- **API** : processus HTTP qui expose actuellement `/health` ;
- **worker** : processus destiné aux traitements Playwright et BullMQ ;
- **PostgreSQL** : sites, contrôles, incidents et profils de bruit ;
- **Redis** : connexion BullMQ et événements temps réel ;
- **règles** : fichier versionné [rules/error-rules.json](./rules/error-rules.json).

## Fonctionnement

### 1. Configuration des sites

Le collecteur appelle `SITES_ENDPOINT_URL` et lit la liste JSON selon
`SITES_FIELD_MAP`. Chaque site est créé ou mis à jour avec son identifiant
externe. Un site absent du dernier retour est désactivé, mais jamais supprimé.

Les statuts source sont traduits par `SOURCE_STATUS_MAP`. Un site en
maintenance ou suspendu devient `MAINTENANCE` et n'est pas contrôlé.

### 2. Inspection dans un vrai navigateur

Pour chaque URL, l'inspecteur :

1. lance ou réutilise un navigateur Chromium ;
2. crée un contexte isolé et écoute les événements **avant** la navigation ;
3. capture les erreurs console, exceptions JavaScript, échecs réseau et
   réponses HTTP à partir de 400 ;
4. mesure le DOM : feuilles CSS, règles CSS accessibles, scripts, texte
   visible, hauteur de page et éléments structurants ;
5. attend le chargement, avec une limite pour `networkidle`, puis une courte
   période pour les erreurs JavaScript tardives ;
6. ferme toujours la page et le contexte.

Les entrées sont normalisées, dédupliquées, tronquées et regroupées par
signature. Le jeton `X-Monitor-Token` est ajouté uniquement aux requêtes
first-party du site surveillé. Il n'est jamais envoyé globalement aux domaines
tiers. Aucune capture d'écran ni comparaison d'images n'est utilisée.

### 3. Analyse déterministe

L'analyse suit cet ordre :

1. navigation impossible ou document HTTP `>= 400` : `BROKEN` ;
2. blocage anti-bot ou challenge : `BLOCKED` ;
3. règles `IGNORE` ;
4. règles `BROKEN` ;
5. filtrage du bruit connu ;
6. règles `DOUBTFUL` et contrôles DOM ;
7. erreurs first-party inconnues : `DOUBTFUL`, avec escalade éventuelle vers
   le juge IA ;
8. aucune erreur retenue : `HEALTHY`.

Une protection anti-bot n'est pas contournée. Elle est classée `BLOCKED` et
doit être résolue par allowlist de l'IP du VPS et du jeton côté client.

### 4. Calibration du bruit

Un profil de bruit peut être construit avec `NOISE_VISITS` visites. Une
calibration est refusée si une visite est `BROKEN` ou `BLOCKED`. Une signature
présente dans au moins deux tiers des visites devient du bruit connu, sauf si
elle correspond à une règle `BROKEN`. Le bruit connu ne peut donc jamais
masquer une panne déterministe.

### 5. Résultat et états

Un contrôle produit notamment :

- le statut de navigation et l'URL finale ;
- les entrées de logs normalisées ;
- les métriques DOM ;
- les règles déclenchées ;
- le verdict et sa raison ;
- le type d'incident éventuel (`CSS_FAILED`, `JS_ERROR`, `BLANK_PAGE`, etc.).

La machine à états applique `FAILURE_THRESHOLD` échecs `BROKEN` consécutifs
avant de confirmer un site cassé. Le premier échec programme une vérification
rapide avec `RECHECK_DELAY_MINUTES`. Un retour `HEALTHY` remet le compteur à
zéro. `DOUBTFUL` reste visible mais ne doit pas ouvrir d'incident.

## Déclenchement automatique

Les paramètres prévus pour la planification sont :

| Variable | Rôle | Valeur par défaut |
|---|---|---:|
| `SYNC_INTERVAL_CRON` | fréquence de synchronisation des sites | `0 * * * *` |
| `BATCH_INTERVAL_CRON` | fréquence de sélection des sites à contrôler | `* * * * *` |
| `BATCH_SIZE` | nombre de sites sélectionnés par tour | `10` |
| `CHECK_INTERVAL_MINUTES` | délai normal entre deux contrôles | `60` |
| `RECHECK_DELAY_MINUTES` | délai après un premier échec | `2` |
| `FAILURE_THRESHOLD` | échecs consécutifs avant confirmation | `2` |

Le worker enregistre deux tâches répétées dans BullMQ et les lance également
au démarrage :

1. synchronisation de `SITES_ENDPOINT_URL` selon `SYNC_INTERVAL_CRON` ;
2. sélection, selon `BATCH_INTERVAL_CRON`, des sites actifs dus au contrôle et
   ajout d'un job d'inspection par site, dans la limite de `BATCH_SIZE`.

Le worker visite chaque site dans les viewports configurés, évalue les entrées
avec `rules/error-rules.json`, enregistre un `Check`, puis met à jour l'état et
les incidents. Les notifications d'incident sont traitées par la file BullMQ ;
avec `MAIL_PROVIDER=console`, elles apparaissent dans les journaux du worker.
Les jobs échoués sont retentés trois fois avec un délai exponentiel.

## Configuration

Copier le modèle :

```powershell
Copy-Item .env.example .env
```

Variables indispensables :

```env
DATABASE_URL=postgresql://monitor:monitor@postgres:5432/monitor?schema=public
REDIS_URL=redis://redis:6379
SITES_ENDPOINT_URL=https://votre-endpoint/sites.json
MONITOR_TOKEN=remplacer-par-un-token-long
API_TOKEN=remplacer-par-un-autre-token-long
ADMIN_ALERT_EMAIL=admin@example.com
```

Les variables complètes sont documentées dans [.env.example](./.env.example).
La configuration est validée au démarrage avec Zod ; une configuration
invalide empêche l'application de démarrer.

## Lancement avec Docker

Prérequis : Docker Desktop, Docker Compose et les ports `3000`, `5432` et
`6379` disponibles.

```powershell
Copy-Item .env.example .env
# Modifier .env avec les valeurs réelles
npm install --legacy-peer-deps
npm run build
docker compose up --build
```

Les migrations Prisma sont appliquées au démarrage des conteneurs. Vérifier
l'API avec :

```text
http://localhost:3000/health
```

Arrêter les services :

```powershell
docker compose down
```

Supprimer également les données PostgreSQL :

```powershell
docker compose down -v
```

## Lancement sans Docker

PostgreSQL et Redis doivent déjà fonctionner localement. Adapter leurs URL
dans `.env`, puis exécuter :

```powershell
npm install --legacy-peer-deps
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run start:api
```

Dans un second terminal :

```powershell
npm run start:worker
```

Commandes utiles :

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run build
npm test
```

## Résultats et limites actuelles

Le endpoint actuellement disponible est :

```text
GET /health
```

Il vérifie la connexion à PostgreSQL et Redis et renvoie un état `ok` ou
`error`.

Les résultats sont enregistrés dans PostgreSQL (`Site`, `Check`, `Incident`).
La seule route HTTP actuelle reste `GET /health` : il n'existe pas encore de
tableau de bord ni de routes REST pour consulter les contrôles. Le juge IA et
la calibration automatique du bruit ne sont pas encore branchés au cycle du
worker.

## Sécurité et limites

- Ne jamais commiter `.env` ni de secrets.
- Remplacer les identifiants PostgreSQL de développement avant la production.
- Utiliser HTTPS et allowlister l'IP fixe du VPS chez chaque client.
- Le worker Playwright peut nécessiter 1,5 à 2 Go de RAM ou davantage.
- Vérifier les dépendances avec `npm audit`.
- Les contrôles partent d'Europe ; une lenteur propre à l'Afrique de l'Ouest
  ne sera pas mesurée.
- Les protections anti-bot ne sont pas contournées.
