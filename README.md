# 🤖 Brawl Stars Match Tracker — Bot Discord

Bot qui surveille un (ou plusieurs) joueur(s) Brawl Stars et poste automatiquement
un embed Discord à chaque nouvelle game, dans le style :

```
⚔️ Brawl Stars Match
🗺️ Map
🔍 Target Player
🏆 Result
🎯 Mode
👤 Team
⚔️ Enemies
```

---

## 1. Récupérer les accès nécessaires

### a) Clé API Brawl Stars
1. Va sur https://developer.brawlstars.com/ et connecte-toi (compte Supercell).
2. Crée une clé API ("Create New Key").
3. **Important** : l'API officielle exige de whitelister l'IP du serveur qui
   appelle l'API. Comme la plupart des hébergeurs gratuits ont une IP
   dynamique (elle change à chaque redéploiement), le bot est configuré par
   défaut pour passer par le **proxy RoyaleAPI**
   (`bsproxy.royaleapi.dev`), qui n'exige pas d'IP fixe.
   → Dans ce cas, mets n'importe quelle IP valide lors de la création de la
   clé (ex : `0.0.0.0`) et laisse `USE_DIRECT_API=false` dans `.env`.
   Si un jour tu héberges sur un serveur à IP fixe, whiteliste-la et passe
   `USE_DIRECT_API=true` pour utiliser l'API officielle directement.

### b) Bot Discord
1. Va sur https://discord.com/developers/applications → "New Application".
2. Onglet **Bot** → "Add Bot" → copie le **Token** (à mettre dans `.env`).
3. Onglet **OAuth2 > URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Embed Links`, `View Channel`
   - Copie l'URL générée et ouvre-la pour inviter le bot sur ton serveur.
4. Récupère l'ID du salon où poster les games (active le mode développeur
   dans Discord : Réglages > Avancés > Mode développeur, puis clic droit sur
   le salon > "Copier l'identifiant").

### c) Tag(s) du/des joueur(s)
Le tag Brawl Stars du joueur, avec le `#` (ex: `#2QLPQL22Y`), visible dans
son profil en jeu.

---

## 2. Configuration

1. Copie `.env.example` en `.env` :
   ```
   cp .env.example .env
   ```
2. Remplis toutes les valeurs (token Discord, ID salon, clé API, tag(s)).
3. Tu peux suivre plusieurs joueurs en séparant les tags par une virgule :
   `TARGET_TAGS=#2QLPQL22Y,#8QJVUY`

---

## 3. Lancer en local (pour tester)

```
npm install
npm start
```

Le bot se connecte, marque l'historique existant comme "déjà vu" (pour ne
pas spammer au démarrage), puis vérifie toutes les `POLL_INTERVAL_SECONDS`
secondes s'il y a une nouvelle game.

---

## 4. Hébergement gratuit — options recommandées

Un bot comme celui-ci doit tourner **24/7** (process qui ne s'arrête jamais),
donc il faut un hébergeur qui supporte les "workers"/process en continu, pas
juste un serveur web classique. Voici les meilleures options gratuites en 2026 :

| Hébergeur | Type | Points clés |
|---|---|---|
| **Railway** | Cloud (worker) | Offre un crédit gratuit mensuel limité, largement suffisant pour un petit bot. Déploiement direct depuis GitHub, IP dynamique (donc utilise le proxy RoyaleAPI). |
| **Render** | Cloud (background worker) | Plan gratuit dispo pour les "Background Workers" (contrairement aux web services gratuits qui s'endorment). Déploiement Git simple. |
| **Fly.io** | Cloud (VM légère) | Petit quota gratuit (machines partagées), bon pour un bot léger, CLI un peu plus technique. |
| **Un vieux PC / Raspberry Pi chez toi** | Auto-hébergé | 100% gratuit et IP que tu peux whitelister toi-même si tu veux utiliser l'API directe, mais nécessite de laisser la machine allumée en continu. |

Étapes générales (valables pour Railway/Render) :
1. Pousse ce dossier sur un repo GitHub.
2. Connecte le repo sur la plateforme choisie.
3. Renseigne les variables d'environnement (`DISCORD_TOKEN`, `CHANNEL_ID`,
   `BRAWL_API_KEY`, `TARGET_TAGS`, etc.) dans les "Environment Variables" de
   la plateforme — ne pousse JAMAIS ton `.env` sur GitHub (déjà exclu ici,
   pense à garder un `.gitignore`).
4. Commande de démarrage : `npm install && npm start`.

⚠️ Les offres gratuites changent régulièrement (quotas, conditions). Vérifie
toujours les conditions actuelles sur le site de l'hébergeur avant de choisir.

---

## 5. Limites de l'API Brawl Stars à connaître

- Le battle log de l'API ne renvoie que les **25 dernières games maximum**
  et il arrive qu'il ait quelques minutes de retard par rapport à la partie
  réelle. Un `POLL_INTERVAL_SECONDS` entre 30 et 60 est un bon compromis.
- Respecte le rate-limit (évite de descendre sous 10-15s d'intervalle,
  surtout si tu suis plusieurs tags).

---

## 6. Aller plus loin (idées d'amélioration)

- Ajouter les icônes des brawlers / de la map via l'API `brawlify.com`
  (fournit des images pour les maps et brawlers, pratique pour un
  `setThumbnail`/`setImage` sur l'embed).
- Stocker les stats cumulées (victoires/défaites) dans une petite base
  SQLite pour afficher un résumé quotidien.
- Ajouter une commande slash `/track <tag>` pour ajouter un joueur sans
  toucher au `.env`.

Dis-moi si tu veux que j'ajoute une de ces fonctionnalités, je peux te la coder directement.
