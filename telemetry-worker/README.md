# AutoTD Telemetry Worker

Cloudflare Worker + D1 backend for AutoTD telemetry.

## What It Stores

- Installation id, first seen time, last seen time, app version, platform, current user count, max user count.
- Plain student ids, latest TD count, first seen time, last seen time, usage days.
- Event records for install/run/stop/user changes/TD count changes/daily midnight snapshots.
- Positive TD count deltas only, so "today TD check-ins" is based on increases rather than raw snapshots.

It does not receive card ids, photo data, photo filenames, TD machine ids, TD server config, or logs.

## Deploy

Use your Cloudflare API token only in the shell environment. Do not commit it.

```bash
export CLOUDFLARE_API_TOKEN="$(cat /Users/denerate/ELSE/cloudfare-api-key.txt)"

npx wrangler d1 create autotd-telemetry
```

Copy the returned `database_id` into `wrangler.toml`, replacing:

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

Apply the schema and set the admin token:

```bash
npx wrangler d1 migrations apply autotd-telemetry --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

After deploy, configure the CLI endpoint:

```bash
autotd telemetry enable --endpoint https://autotd-telemetry.autotd-buaa.workers.dev
autotd telemetry sync
```

Open the private dashboard:

```text
https://autotd-telemetry.autotd-buaa.workers.dev/admin?token=<ADMIN_TOKEN>
```

This Worker page is a small fallback page embedded in the Worker. The primary dashboard is a Cloudflare Pages static frontend in `../telemetry-pages`; it calls the same `/admin/api/*` endpoints with an `Authorization: Bearer <ADMIN_TOKEN>` header.

The local admin token is stored outside the repository at:

```text
/Users/denerate/ELSE/autotd-telemetry-admin-token.txt
```

## Local Test

This repository's Worker tests use Node's built-in test runner and a fake D1 binding, so they do not need npm packages.

```bash
node --test
```
