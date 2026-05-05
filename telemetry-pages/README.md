# AutoTD Telemetry Pages

Static Cloudflare Pages dashboard for the AutoTD telemetry Worker.

Production URL:

```text
https://autotd-telemetry-dashboard.pages.dev/
```

The page stores the Worker API URL and admin token in the browser's localStorage, then calls:

- `GET /admin/api/summary`
- `GET /admin/api/users`
- `GET /admin/api/events`
- `GET /admin/api/daily`

The token is sent through `Authorization: Bearer <ADMIN_TOKEN>` and is not written into the deployed static files.

## Local Test

```bash
npm test
```

## Deploy

```bash
npx wrangler pages project create autotd-telemetry-dashboard --production-branch main
npx wrangler pages deploy . --project-name autotd-telemetry-dashboard --branch main
```
