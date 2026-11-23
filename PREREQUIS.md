# Prérequis et lancement

## Prérequis

- Docker Desktop démarré avec Docker Compose
- Git
- Node.js 22+ et npm, pour lancer hors Docker
- Ports disponibles : `3000`, `5432`, `6379`
- Un endpoint JSON de sites clients
- Un `MONITOR_TOKEN` configuré chez les clients

## Lancement recommandé avec Docker

Depuis le dossier du projet :

```powershell
Copy-Item .env.example .env
notepad .env
```

Modifier au minimum :

```env
MONITOR_TOKEN=une-valeur-secrete-longue
API_TOKEN=une-autre-valeur-secrete-longue
SITES_ENDPOINT_URL=https://votre-endpoint/sites.json
ADMIN_ALERT_EMAIL=votre-email@example.com
```

Puis :

```powershell
npm install --legacy-peer-deps
npm run build
docker compose up --build
```

L'API est disponible sur :

```text
http://localhost:3000/health
```

Pour arrêter :

```powershell
docker compose down
```

Pour supprimer également les données PostgreSQL :

```powershell
docker compose down -v
```

## Lancement sans Docker

Installer PostgreSQL et Redis localement, puis adapter `DATABASE_URL` et
`REDIS_URL` dans `.env`.

```powershell
npm install --legacy-peer-deps
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run start:api
```

Dans un autre terminal :

```powershell
npm run start:worker
```

## Risques importants

1. Les valeurs de `.env.example` sont uniquement des exemples. Les remplacer
   impérativement en production.
2. PostgreSQL utilise actuellement `monitor/monitor` dans
   `docker-compose.yml`. Changer ces identifiants pour un déploiement public.
3. L'API est encore limitée : le endpoint principal disponible est `/health`.
   L'authentification `API_TOKEN` et les routes REST complètes restent à
   implémenter dans les phases suivantes.
4. `X-Monitor-Token` ne doit être envoyé qu'aux domaines first-party. Ne jamais
   partager ce token et utiliser HTTPS.
5. Le worker Playwright peut consommer beaucoup de mémoire. Prévoir au moins
   1,5 à 2 Go de RAM pour un usage réel.
6. Le système ne contourne pas les protections anti-bot. Un site bloqué est
   classé `BLOCKED`, pas `BROKEN`.
7. Vérifier les vulnérabilités npm avant la production :

   ```powershell
   npm audit
   ```

8. Les contrôles partent d'Europe. Une lenteur spécifique à l'Afrique de
   l'Ouest ne sera pas mesurée.
