# Creative Batch Toolkit

Batch image processing for creative production: upload many images, pick a preset or tune the settings, and get
resized / converted / compressed / renamed files back as individual downloads or one ZIP — with per-file status,
retry for failures, and a before/after check. No AI, no database: a deterministic tool that does one job well.

**Stack:** React + TypeScript + Vite + Tailwind (frontend) · FastAPI + Pillow (backend) · Docker (deploy).

## What it does

| | |
|---|---|
| Input | JPG, PNG, WebP — format is detected from the file content, never from the name or MIME type the browser sends |
| Resize | **Fit** (contain), **Fill** (cover, centre crop), **Width**, **Original** — aspect ratio is never distorted |
| Output | WebP, JPEG, PNG · quality 1–100 · background colour for transparency → JPEG |
| Metadata | Strip EXIF/GPS (default) or keep it; camera orientation is applied; ICC → sRGB when stripping |
| Naming | `{prefix} {index} {name} {date} {w} {h}`, zero-padding, collision-safe |
| Processing | 3 images at a time; a failing file is isolated, shows its reason and can be retried |
| Export | Single files or a ZIP with `processed/`, `manifest.json`, `processing_report.csv` |

Not included on purpose (see `design-system/creative-batch-toolkit/MASTER.md` §3): accounts, history, database, AI features, AVIF.

## Run it locally (development)

```bash
# backend  (Python 3.12)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000        # no auth in dev (a warning is logged)

# frontend (Node 20) — in another terminal
cd frontend
npm install
npm run dev                                       # http://localhost:5173, /api is proxied to :8000
```

Try it: `python3 scripts/make_samples.py` generates 12 sample images in `samples/` (and the thumbnails used by the
demo mode). In development, the empty screen has a **Load sample images** button and a bottom bar that jumps to
every UI state; `/?demo&state=partial` opens a state directly.

## Tests

```bash
cd backend && . .venv/bin/activate && pytest      # 85 tests: image maths, naming, API, limits, auth, invites, rate limits, cleanup
cd frontend && npm run typecheck
```

## Deploy (GitHub Actions → GHCR → your server)

```
git push to main ──► GitHub Actions: tests ─► build image ─► smoke test ─► push ghcr.io/<you>/<repo>:latest + :sha-abc1234
                                                                                      │
your server:   ./update.sh   =   docker compose pull  +  docker compose up -d  ◄───────┘      (no build, no source code needed)
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push and pull request: backend tests, frontend
typecheck + build, then it builds the image and boots it through [scripts/smoke_test.sh](scripts/smoke_test.sh) (auth wall,
bundled web app, invite links, non-root). Only pushes to `main` and `v*` tags are published; pull requests never push.

| Tag | When | Use it for |
|---|---|---|
| `latest` | every push to `main` | normal deploys |
| `sha-abc1234` | every push to `main` | pinning / **rolling back** to one exact build |
| `1.2.3`, `1.2` | pushing a git tag `v1.2.3` | named releases |

### One-time setup

1. **GitHub:** create the repo, push `main`. The first run creates the package `ghcr.io/<owner>/<repo>` (private by default, linked to the repo).
2. **Let the server pull a private image:** create a *classic* personal access token with only the `read:packages` scope, then on the server:
   `echo <TOKEN> | docker login ghcr.io -u <github-user> --password-stdin`
   (Or make the package public in GitHub → Packages → Package settings; the image contains no secrets.)
3. **Server files** — only three, no clone needed. In `~/creative-batch-toolkit/`:
   ```bash
   scp docker-compose.yml deploy/update.sh .env.example you@server:~/creative-batch-toolkit/
   ssh you@server
   cd creative-batch-toolkit && mv .env.example .env && chmod 600 .env && chmod +x update.sh
   nano .env      # CBT_IMAGE=ghcr.io/<owner>/<repo> (lowercase), and CBT_BASIC_AUTH_USER / CBT_BASIC_AUTH_PASSWORD (>= 12 chars)
   ```
4. `./update.sh` — pulls the image, starts it, waits until it is healthy.
5. Add the blocks from [deploy/nginx.conf.example](deploy/nginx.conf.example) to your existing nginx (`proxy_pass`, `X-Real-IP`,
   `client_max_body_size 30m`) and `sudo nginx -t && sudo systemctl reload nginx`.

### Every deploy after that

```bash
git push                 # CI publishes the image when it is green (Actions tab -> the run summary shows the tags)
ssh you@server 'cd creative-batch-toolkit && ./update.sh'
```

**Roll back:** `./update.sh sha-<previous>` (list tags in GitHub → Packages). To make it stick, set `CBT_TAG=sha-<previous>` in `.env`.
A restart drops batches that are in progress; invite links and the rest of `/data` are kept.

### Local build instead of pulling

```bash
echo 'CBT_IMAGE=creative-batch-toolkit' >> .env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

The container runs as a non-root user with a read-only filesystem and all capabilities dropped. With
`CBT_REQUIRE_AUTH=true` (set in `docker-compose.yml`) it **refuses to start** without a strong password, so the app can
never be exposed by accident without protection.

### Invite links — letting HR or a company try it without a password

Share a link instead of the password. Guests click it and land in the app; no login prompt.

```bash
docker compose exec app python -m app.invites create --label "ACME HR" --base-url https://tools.example.com
#   Invite created for “ACME HR” (id 3dc76e24, valid until 2026-11-25…)
#   https://tools.example.com/invite/…            <- shown once, send this
docker compose exec app python -m app.invites list              # status, expiry, images used today / in total, last use
docker compose exec app python -m app.invites revoke 3dc76e24   # takes effect immediately, no restart
```

| | Guest (invite link) | Admin (password) |
|---|---|---|
| Valid for | 7 days (`--days 1..90`) | – |
| Files per batch / size per file | 20 / 10 MB | 100 / 25 MB |
| Images per day | 200 | unlimited |
| Sees | only its own batches | only its own batches |

How it works: opening the link exchanges the token for an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (valid until the invite expires) and
redirects to the app. Only a SHA-256 hash of the token is stored (`invites.json` on the data volume), so a leaked volume leaks no working
links. Expired or revoked guests see an explanation page instead of a password prompt. The token is masked in the app's access log, and
`deploy/nginx.conf.example` turns off nginx's access log for `/invite/`. Treat a link like a password: whoever holds it can use the
guest quota until it expires — which is why links are short-lived, limited and revocable.

State-changing requests from other sites are refused (CSRF), for passwords and invite cookies alike.

### Configuration (`CBT_*` environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | – | HTTP Basic auth for everything except `/api/health` |
| `REQUIRE_AUTH` | false | Refuse to start without auth (password ≥ 12 chars) |
| `TRUST_PROXY` | false | Use `X-Real-IP` from nginx for per-IP limits (only when the port is not public) |
| `MAX_FILE_MB` / `MAX_FILES_PER_BATCH` | 25 / 100 | Upload limits |
| `MAX_PIXELS` | 64 000 000 | Per-image pixel limit (protects memory) |
| `CONCURRENCY` | 3 | Images processed at the same time, server-wide |
| `TTL_HOURS` | 24 | Idle batches (files included) are deleted after this |
| `MAX_STORAGE_MB` | 4096 | New uploads are refused above this total |
| `MAX_ACTIVE_BATCHES_PER_IP` | 10 | |
| `RATE_*` | see `app/config.py` | Per-IP rate limits (batches, uploads, process, export, failed logins) |
| `INVITE_TTL_DAYS` / `INVITE_MAX_FILES_PER_BATCH` / `INVITE_MAX_FILE_MB` / `INVITE_IMAGES_PER_DAY` | 7 / 20 / 10 / 200 | Guest defaults |
| `COOKIE_SECURE` | true | Invite cookie only over HTTPS (browsers still allow it on `localhost`) |

## Security notes

- **Untrusted files:** decoded and checked by Pillow (type, pixel limit, structure); stored under random internal ids —
  the user's file name is metadata only and is sanitised again for output names, ZIP entries and the CSV report
  (spreadsheet-formula injection is neutralised).
- **Abuse protection:** basic auth with failed-attempt rate limit, per-IP limits, global concurrency cap, per-file /
  per-batch / total-storage caps, `Content-Length` required on uploads, batch ids are unguessable (128-bit).
- **Headers:** strict CSP (`default-src 'self'`), `nosniff`, `X-Frame-Options: DENY`, `no-store` on the API; API docs are off.
- **Privacy:** files live only on the server volume and are removed after `TTL_HOURS`, when the batch is cleared, when the tab
  is closed, and at every server start.

## Design decisions and known limits

- **One process, in-memory state.** That is what lets the app skip a database; it also means *one* uvicorn worker
  (already the default in the Dockerfile). A restart drops running/active batches (uploaded files are wiped at start).
- **Memory:** about 7 bytes per pixel while processing. Measured in the container: 3 × 56 MP images at once peaked at ≈ 1.25 GB.
  `mem_limit: 2g` with the 64 MP default leaves a safety margin; lower `CONCURRENCY` or `MAX_PIXELS` on a smaller server.
- **Animated PNG/WebP:** only the first frame is processed.
- **No upscaling policy:** Fit/Width follow the maths in the spec (small images can be enlarged); Fill always returns the exact frame.
- **Sizes shown before processing are estimates** and are labelled "estimated"; sizes after processing are exact (read from the file).

## Project layout

```
backend/    FastAPI app (app/routes, app/services: image · naming · batch · export · security) + tests
frontend/   React app (src/components, src/state/useBatch.ts, src/services/api.ts + mockService.ts for demo mode)
deploy/     nginx example + update.sh (runs on the server)     scripts/   sample images, CI smoke test
.github/    CI workflow (tests, image build, publish to GHCR)
design-system/   design tokens (MASTER.md)
resource/        the original spec (.docx) and Stitch design export — local only, not in git
```
`prototype/` is an earlier, discarded design kept only for reference.
