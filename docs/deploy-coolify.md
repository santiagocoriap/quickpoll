# Deploying PollForge on Coolify without building on the VPS

If your VPS doesn't have the CPU/RAM to build the Docker image, **don't build on it.**
Build the image once on GitHub's runners, push it to a registry, and have Coolify *pull*
the finished image. The image is fully self-contained — it runs migrations (and can seed)
on startup — so the server only ever needs to pull and run it.

```
  GitHub Actions (builds)  ->  ghcr.io (stores image)  ->  Coolify on your VPS (pulls + runs)
```

> Coolify itself does not host images. It either builds from source (the part that's too heavy
> for your VPS) or pulls a prebuilt image from a registry like GHCR. We use the pull path.

---

## 1. Build & push the image (GitHub Actions)

The repo already includes [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml).
On every push to `main` it builds the image and pushes it to **GitHub Container Registry**:

```
ghcr.io/<your-github-user>/<repo>:latest
ghcr.io/<your-github-user>/<repo>:sha-<short-sha>
```

To enable it:

1. Push this repository to GitHub.
2. Go to the repo's **Actions** tab and let the "Build and publish Docker image" workflow run
   (it uses the built-in `GITHUB_TOKEN`, no extra secrets needed to push to GHCR).
3. After it succeeds, open your profile → **Packages** → the new package. To let Coolify pull it
   without credentials, set **Package settings → Change visibility → Public**. (Private is fine too —
   see step 3 below for credentials.)

> **Architecture note:** the workflow builds `linux/amd64` (standard x86_64 VPS). If your VPS is ARM
> (e.g. some Ampere/Graviton instances), change `platforms:` in the workflow to `linux/arm64`.

### Prefer to build from your own machine instead of CI?

Your laptop already builds this fine. Build for the server's architecture and push:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
docker buildx build --platform linux/amd64 \
  -t ghcr.io/<your-github-user>/quickpoll:latest --push .
```

(`GHCR_TOKEN` = a GitHub Personal Access Token with the `write:packages` scope. `buildx` cross-builds
amd64 even on an Apple-Silicon Mac.)

---

## 2. Point Coolify at the prebuilt image (Docker Compose)

Use the production compose file [`docker-compose.prod.yml`](../docker-compose.prod.yml). Its `web`
service has **`image:` and no `build:`**, so Coolify pulls instead of building. It also keeps the
Postgres database alongside it.

In Coolify:

1. **New Resource → Docker Compose** (Build Pack: *Docker Compose*), connected to your Git repo
   and branch.
2. Set **Docker Compose Location** to `/docker-compose.prod.yml`.
3. Add **Environment Variables**:
   | Variable | Value |
   | --- | --- |
   | `WEB_IMAGE` | `ghcr.io/<your-github-user>/<repo>:latest` |
   | `AUTH_SECRET` | a long random string (`openssl rand -base64 48`) |
   | `NEXT_PUBLIC_APP_URL` | `https://polls.example.com` (your public URL) |
   | `POSTGRES_PASSWORD` | a strong password |
4. Open the **`web` service → Domains**, set your domain (e.g. `polls.example.com`) and **port `3000`**.
   Coolify's reverse proxy (Traefik) terminates TLS and routes to the container — you don't publish
   port 3000 yourself.
5. Click **Deploy**. Coolify pulls `db` (postgres) and your prebuilt `web` image, the entrypoint runs
   `prisma migrate deploy`, and the app starts. No compilation happens on the VPS.

### If the GHCR package is private

Give Coolify pull access one of two ways:

- **Coolify UI:** *Keys & Tokens / Registries* → add a Docker registry: `ghcr.io`, username =
  your GitHub user, password = a PAT with `read:packages`.
- **On the server:** `docker login ghcr.io -u <user> -p <PAT>` once.

---

## 3. First run, seeding, and updates

- **Setup:** open `https://polls.example.com` and create the first Super Admin (the setup screen).
- **Demo data (optional):** Coolify → `web` service → **Terminal/Execute Command** →
  `npm run db:seed`.
- **Updates:** push to `main` → Actions rebuilds and pushes `:latest`. Then either click
  **Redeploy** in Coolify, or wire the automatic redeploy (below).

### Automatic redeploy on every push

1. Coolify → your resource → **Webhooks** → copy the **Deploy** webhook URL.
2. GitHub repo → **Settings → Secrets and variables → Actions** → add secret
   `COOLIFY_DEPLOY_WEBHOOK` = that URL.

The workflow's final step calls the webhook, so a push to `main` builds the image *and* triggers
Coolify to pull and redeploy — all without the VPS ever building anything.

---

## Alternative: single image + Coolify-managed Postgres

If you'd rather not run the database via compose, you can instead:

1. Create a **PostgreSQL** database resource in Coolify (it gives you a connection string).
2. Create an **Application → Docker Image** resource pointing at `ghcr.io/<user>/<repo>:latest`.
3. Set `DATABASE_URL` (from step 1), `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL`; expose port `3000`
   and set the domain.

The container still runs migrations on start, so the schema is created automatically. The compose
approach above is simpler because it keeps the app and its database together.
