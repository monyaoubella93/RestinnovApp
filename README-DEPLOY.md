# RestinnovApp — Déploiement en production

Ce document couvre `docker-compose.prod.yml`, la configuration Docker pour
un vrai déploiement public (nom de domaine, HTTPS automatique). Pour le
développement local, voir [README-DOCKER.md](README-DOCKER.md) et
`docker-compose.yml` — les deux stacks sont indépendantes et ne doivent
jamais être lancées en même temps sur la même machine (mêmes noms de
conteneurs, mêmes ports internes).

## Ce qui change par rapport au développement

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` (prod) |
|---|---|---|
| Frontend | Serveur Vite avec hot reload, exposé sur `:5173` | Construit une fois (`npm run build`) et servi comme fichiers statiques par `nginx` — aucun conteneur `frontend` séparé |
| `nginx` | Exposé sur `localhost:8000` | Aucun port publié — uniquement joignable depuis `caddy` sur le réseau interne |
| Accès public | — | `caddy` expose les ports 80/443 et obtient un certificat HTTPS automatique (Let's Encrypt) |
| `db` (MySQL) | Exposé sur `localhost:3306` pour un client GUI | Aucun port publié |
| Variables d'environnement | `.env` copié de `.env.example`, valeurs de test | `.env` copié de `.env.production.example`, `APP_ENV=production`, `APP_DEBUG=false`, mots de passe à définir soi-même |

## Prérequis

- Un serveur avec [Docker](https://docs.docker.com/get-docker/) et le
  plugin `docker compose`, exposé publiquement (ports 80 et 443 ouverts).
- Un nom de domaine dont l'enregistrement DNS (A et/ou AAAA) pointe déjà
  vers l'IP publique de ce serveur — Caddy en a besoin pour obtenir le
  certificat Let's Encrypt.

## Étapes de déploiement

**1. Cloner le dépôt sur le serveur.**

```bash
git clone <repo-url> RestinnovApp
cd RestinnovApp
```

**2. Configurer l'environnement.** Copier `.env.production.example` vers
`.env` (pas `.env.production` — Laravel lit directement `.env`, voir les
commentaires en tête du fichier) puis remplir chaque valeur marquée
`CHANGE_ME_...` avec un vrai mot de passe généré (`DB_PASSWORD`,
`DB_ROOT_PASSWORD`, `MANAGER_DEFAULT_PASSWORD`, etc.) :

```bash
cp .env.production.example .env
nano .env   # ou l'éditeur de votre choix
```

Mettre aussi à jour `APP_URL` dans `.env` avec le vrai domaine.

**3. Configurer le domaine dans le Caddyfile.** Remplacer le placeholder
`ton-domaine.com` par le vrai nom de domaine (même valeur que `APP_URL`
sans le `https://`) :

```bash
sed -i 's/ton-domaine.com/votre-domaine.com/' Caddyfile
```

**4. Lancer la stack.**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Au premier lancement, cela va :

1. Construire l'image `app`/`scheduler` (PHP-FPM), installer les
   dépendances Composer, générer `APP_KEY`, attendre que MySQL soit prêt,
   lancer les migrations et créer le compte manager par défaut (mêmes
   étapes automatiques que `docker-compose.yml`, voir
   [README-DOCKER.md](README-DOCKER.md) pour le détail).
2. Construire l'image `nginx` en deux temps : compiler le frontend
   (`npm run build`) puis copier le résultat dans l'image nginx finale, qui
   sert ces fichiers statiques et proxifie `/api`, `/sanctum`, `/storage` et
   `/up` vers `app`.
3. Démarrer `caddy`, qui obtient automatiquement un certificat HTTPS pour
   le domaine configuré et proxifie tout le trafic vers `nginx` en interne.

Le premier démarrage prend quelques minutes (installation des dépendances,
build du frontend, obtention du certificat). Une fois prêt, le site est
accessible sur `https://votre-domaine.com`.

**5. Vérifier.**

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy
```

Se connecter avec le compte manager défini dans `.env`
(`MANAGER_DEFAULT_TELEPHONE`/`MANAGER_DEFAULT_PASSWORD`), puis changer ce
mot de passe depuis l'application dès que possible — il n'y a pas encore
d'écran "changer le mot de passe", voir la section correspondante dans
[README-DOCKER.md](README-DOCKER.md).

## Commandes utiles

Toutes les commandes `docker compose` habituelles s'appliquent, avec
`-f docker-compose.prod.yml` :

```bash
# Artisan
docker compose -f docker-compose.prod.yml exec app php artisan migrate
docker compose -f docker-compose.prod.yml exec app php artisan tinker

# Logs
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f nginx

# Mettre à jour après un git pull (reconstruit les images si le code a changé)
git pull
docker compose -f docker-compose.prod.yml up --build -d

# Arrêter
docker compose -f docker-compose.prod.yml down
```

`docker compose -f docker-compose.prod.yml down` conserve les données
(volume `dbdata`, certificats Let's Encrypt dans `caddy_data`) — n'ajoutez
`-v` que si vous voulez vraiment tout effacer.

## Fichiers uploadés (photos, audio) invisibles en production

Les photos et audios envoyés par les agents (signalement, résolution de
ticket, preuve de travail...) sont stockés par Laravel dans
`storage/app/public`, et servis publiquement via `/storage/...` grâce à
`storage:link` (le lien symbolique `public/storage -> ../storage/app/public`,
créé automatiquement au démarrage du conteneur `app` — voir
`docker/php/entrypoint.sh`).

**Piège à connaître** : ce lien est *relatif*. Il ne fonctionne que si
`storage/app/public` est atteignable au même chemin relatif depuis
`public/`, **à l'intérieur du conteneur qui essaie de le lire**. Le
conteneur `app` monte tout le dépôt (`.:/var/www`), donc ça marche toujours
de son côté. Mais si le montage du conteneur `nginx` — celui qui sert
réellement les requêtes `/storage/...` — ne couvre un jour que `public/`
seul (ex. `./public:/var/www/public:ro`, pour éviter d'exposer `.env`,
`vendor/`, etc. à ce conteneur), le lien pointe alors vers un chemin qui
n'existe tout simplement pas dans son propre système de fichiers : chaque
fichier uploadé renvoie un 404, silencieusement, sans rien casser d'autre.

**Correctif appliqué (déjà en place dans ce dépôt)** : `docker-compose.prod.yml`
monte pour `nginx` exactement les deux dossiers dont il a besoin, jamais le
dépôt entier :

```yaml
volumes:
  - ./public:/var/www/public:ro
  - ./storage/app/public:/var/www/storage/app/public:ro
```

Et `docker/nginx/conf.d/default.prod.conf` sert `/storage/...` directement
depuis `storage/app/public` via un `alias` nginx, **sans passer par le lien
symbolique** :

```nginx
location /storage/ {
    alias /var/www/storage/app/public/;
}
```

Résultat : le lien symbolique reste créé (utile en développement, où
`nginx` monte tout le dépôt) mais la production n'en dépend plus du tout —
même s'il n'existait pas, ou si `storage:link` échouait silencieusement
(l'entrypoint l'exécute avec `|| true`), les fichiers uploadés restent
servis correctement.

**Si le problème revient malgré tout** (après une modification future de
la config Docker, par exemple), diagnostiquer dans cet ordre :

```bash
# 1. Le fichier existe-t-il vraiment sur le disque, côté app ?
docker compose -f docker-compose.prod.yml exec app \
  ls -la storage/app/public/

# 2. nginx a-t-il accès à ce même dossier (peu importe le lien symbolique) ?
docker compose -f docker-compose.prod.yml exec nginx \
  ls -la /var/www/storage/app/public/

# 3. Le lien symbolique lui-même (utile pour le dev, plus pour nginx en prod) :
docker compose -f docker-compose.prod.yml exec app \
  readlink -f public/storage
```

Si (1) est vide, le problème est côté upload (permissions d'écriture sur
`storage/`, voir `chmod -R ugo+rwX storage` dans `entrypoint.sh`). Si (1)
contient le fichier mais (2) échoue ou renvoie un dossier différent, c'est
que le montage `nginx` dans `docker-compose.prod.yml` a changé et ne couvre
plus `storage/app/public` — corriger le montage plutôt que de recréer le
lien symbolique, qui ne réglera pas le vrai problème.

## Vérifier la configuration sans rien démarrer

```bash
docker compose -f docker-compose.prod.yml config
```

Affiche la configuration résolue (variables substituées) et échoue si le
fichier contient une erreur de syntaxe — utile après toute modification du
compose file, avant de redéployer.
