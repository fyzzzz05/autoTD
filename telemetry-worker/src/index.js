const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  try {
    if (request.method === "POST" && url.pathname === "/v1/installations/register") {
      return json(await registerInstallation(request, env));
    }
    if (request.method === "POST" && url.pathname === "/v1/events") {
      return json(await acceptEvent(request, env));
    }
    if (request.method === "GET" && url.pathname === "/admin") {
      if (!isAdmin(request, env)) return unauthorized();
      return new Response(adminHtml(url.searchParams.get("token") || ""), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (request.method === "GET" && url.pathname === "/admin/api/summary") {
      if (!isAdmin(request, env)) return unauthorized();
      const day = url.searchParams.get("day") || todayDay();
      return json(await env.DB.prepare(summarySql()).bind(day, day, day).first());
    }
    if (request.method === "GET" && url.pathname === "/admin/api/users") {
      if (!isAdmin(request, env)) return unauthorized();
      const { results } = await env.DB.prepare(listUsersSql()).all();
      return json({ users: results });
    }
    if (request.method === "GET" && url.pathname === "/admin/api/events") {
      if (!isAdmin(request, env)) return unauthorized();
      const { results } = await env.DB.prepare(listEventsSql()).all();
      return json({ events: results });
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    return json({ error: "internal_error", message: String(error?.message || error) }, 500);
  }
}

async function registerInstallation(request, env) {
  const body = await request.json();
  requireString(body.installation_id, "installation_id");
  requireString(body.installation_secret, "installation_secret");
  const now = body.registered_at || new Date().toISOString();
  const users = normalizeUsers(body.users);
  await env.DB.prepare(upsertInstallationSql())
    .bind(
      body.installation_id,
      body.installation_secret,
      now,
      now,
      body.app_version || "",
      body.platform || "",
      users.length,
      users.length
    )
    .run();
  await applySnapshot(env.DB, body.installation_id, users, dayFrom(body.registered_at), now);
  return { ok: true };
}

async function acceptEvent(request, env) {
  const raw = await request.text();
  const installationId = request.headers.get("X-AutoTD-Installation") || "";
  const signature = request.headers.get("X-AutoTD-Signature") || "";
  const installation = await env.DB.prepare(getInstallationSecretSql()).bind(installationId).first();
  if (!installation) {
    return responseError("unknown_installation", 401);
  }
  const expected = await signText(installation.installation_secret, raw);
  if (!timingSafeEqual(signature, expected)) {
    return responseError("invalid_signature", 401);
  }

  const body = JSON.parse(raw);
  const event = body.event;
  requireString(event?.event_id, "event.event_id");
  requireString(event?.event_type, "event.event_type");
  requireString(event?.installation_id, "event.installation_id");
  if (event.installation_id !== installationId) {
    return responseError("installation_mismatch", 400);
  }

  const existing = await env.DB.prepare(getEventSql()).bind(event.event_id).first();
  if (existing) {
    return { ok: true, duplicate: true };
  }

  const eventDay = event.event_day || dayFrom(event.occurred_at);
  await env.DB.prepare(insertEventSql())
    .bind(event.event_id, event.installation_id, event.event_type, eventDay, event.occurred_at || new Date().toISOString(), JSON.stringify(event.payload || {}))
    .run();

  await applyEvent(env.DB, installation, event, eventDay);
  return { ok: true };
}

async function applyEvent(db, installation, event, eventDay) {
  const payload = event.payload || {};
  const users = normalizeUsers(payload.users);
  if (Array.isArray(payload.users)) {
    await db.prepare(upsertInstallationSql())
      .bind(
        event.installation_id,
        installation.installation_secret,
        installation.first_seen_at || event.occurred_at,
        event.occurred_at,
        event.app_version || "",
        event.platform || "",
        users.length,
        users.length
      )
      .run();
    await applySnapshot(db, event.installation_id, users, eventDay, event.occurred_at);
  }

  if (event.event_type === "td_count_changed" && Number(payload.delta) > 0) {
    await db.prepare(insertTdDeltaSql())
      .bind(
        event.event_id,
        event.installation_id,
        String(payload.student_id),
        eventDay,
        Number(payload.delta),
        Number(payload.new_count),
        event.occurred_at
      )
      .run();
  }
}

async function applySnapshot(db, installationId, users, day, seenAt) {
  await db.prepare(markInstallationAbsentSql()).bind(installationId).run();
  await db.prepare(insertDailyInstallationSnapshotSql()).bind(installationId, day, users.length).run();
  for (const user of users) {
    await db.prepare(upsertStudentSql()).bind(user.student_id, seenAt, seenAt, user.td_count ?? null).run();
    await db.prepare(upsertInstallationStudentSql())
      .bind(installationId, user.student_id, seenAt, seenAt, user.td_count ?? null)
      .run();
    await db.prepare(insertDailyStudentSnapshotSql()).bind(user.student_id, day, user.td_count ?? null).run();
  }
}

function normalizeUsers(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter((user) => user && user.student_id !== undefined && user.student_id !== null)
    .map((user) => ({
      student_id: String(user.student_id),
      td_count: user.td_count === undefined || user.td_count === null ? null : Number(user.td_count)
    }));
}

function isAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  const auth = request.headers.get("Authorization") || "";
  const fromHeader = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return fromQuery === expected || fromHeader === expected;
}

function unauthorized() {
  return json({ error: "unauthorized" }, 401);
}

function responseError(error, status) {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
}

function json(payload, status = 200) {
  if (payload instanceof Response) return payload;
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
}

export async function signPayload(secret, payload) {
  return signText(secret, JSON.stringify(payload));
}

async function signText(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function dayFrom(value) {
  return String(value || new Date().toISOString()).slice(0, 10);
}

function todayDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function adminHtml(token) {
  const safeToken = token.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AutoTD Telemetry</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #1f2937; background: #f8fafc; }
    header { padding: 24px 32px 12px; background: #fff; border-bottom: 1px solid #e5e7eb; }
    main { padding: 24px 32px; display: grid; gap: 20px; }
    h1 { margin: 0; font-size: 24px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric, section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
    .metric strong { display: block; font-size: 28px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px; }
  </style>
</head>
<body>
  <header><h1>AutoTD Telemetry</h1></header>
  <main>
    <div id="metrics" class="grid"></div>
    <section><h2>用户</h2><table id="users"></table></section>
    <section><h2>最近事件</h2><table id="events"></table></section>
  </main>
  <script>
    const token = '${safeToken}';
    async function loadJson(path) {
      const response = await fetch(path + '?token=' + encodeURIComponent(token));
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }
    function cell(text) { return '<td>' + (text ?? '') + '</td>'; }
    Promise.all([loadJson('/admin/api/summary'), loadJson('/admin/api/users'), loadJson('/admin/api/events')]).then(([summary, users, events]) => {
      const labels = [
        ['总安装数', summary.total_installations],
        ['今日新增安装', summary.new_installations_today],
        ['当前总用户', summary.current_total_users],
        ['今日新增用户', summary.todays_new_users],
        ['历史累计用户', summary.historical_users],
        ['今日 TD 打卡数', summary.today_td_delta]
      ];
      document.querySelector('#metrics').innerHTML = labels.map(([label, value]) => '<div class="metric">' + label + '<strong>' + (value ?? 0) + '</strong></div>').join('');
      document.querySelector('#users').innerHTML = '<tr><th>学号</th><th>TD 数</th><th>使用天数</th><th>首次出现</th><th>最后出现</th></tr>' +
        users.users.map((row) => '<tr>' + [row.student_id, row.latest_td_count, row.usage_days, row.first_seen_at, row.last_seen_at].map(cell).join('') + '</tr>').join('');
      document.querySelector('#events').innerHTML = '<tr><th>时间</th><th>类型</th><th>安装</th></tr>' +
        events.events.map((row) => '<tr>' + [row.occurred_at, row.event_type, row.installation_id].map(cell).join('') + '</tr>').join('');
    }).catch((error) => {
      document.body.innerHTML = '<pre>' + error.message + '</pre>';
    });
  </script>
</body>
</html>`;
}

function upsertInstallationSql() {
  return `/* op: upsert_installation */
INSERT INTO installations (installation_id, installation_secret, first_seen_at, last_seen_at, app_version, platform, current_user_count, max_user_count)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(installation_id) DO UPDATE SET
  installation_secret = excluded.installation_secret,
  last_seen_at = excluded.last_seen_at,
  app_version = excluded.app_version,
  platform = excluded.platform,
  current_user_count = excluded.current_user_count,
  max_user_count = MAX(installations.max_user_count, excluded.current_user_count)`;
}

function markInstallationAbsentSql() {
  return "/* op: mark_installation_absent */ UPDATE installation_students SET present = 0 WHERE installation_id = ?";
}

function upsertStudentSql() {
  return `/* op: upsert_student */
INSERT INTO students (student_id, first_seen_at, last_seen_at, latest_td_count)
VALUES (?, ?, ?, ?)
ON CONFLICT(student_id) DO UPDATE SET
  last_seen_at = excluded.last_seen_at,
  latest_td_count = COALESCE(excluded.latest_td_count, students.latest_td_count)`;
}

function upsertInstallationStudentSql() {
  return `/* op: upsert_installation_student */
INSERT INTO installation_students (installation_id, student_id, first_seen_at, last_seen_at, latest_td_count, present)
VALUES (?, ?, ?, ?, ?, 1)
ON CONFLICT(installation_id, student_id) DO UPDATE SET
  last_seen_at = excluded.last_seen_at,
  latest_td_count = COALESCE(excluded.latest_td_count, installation_students.latest_td_count),
  present = 1`;
}

function insertDailyInstallationSnapshotSql() {
  return `/* op: insert_daily_installation_snapshot */
INSERT OR REPLACE INTO daily_installation_snapshots (installation_id, day, user_count)
VALUES (?, ?, ?)`;
}

function insertDailyStudentSnapshotSql() {
  return `/* op: insert_daily_student_snapshot */
INSERT OR REPLACE INTO daily_student_snapshots (student_id, day, td_count)
VALUES (?, ?, ?)`;
}

function getInstallationSecretSql() {
  return "/* op: get_installation_secret */ SELECT * FROM installations WHERE installation_id = ?";
}

function getEventSql() {
  return "/* op: get_event */ SELECT event_id FROM events WHERE event_id = ?";
}

function insertEventSql() {
  return `/* op: insert_event */
INSERT OR IGNORE INTO events (event_id, installation_id, event_type, event_day, occurred_at, payload)
VALUES (?, ?, ?, ?, ?, ?)`;
}

function insertTdDeltaSql() {
  return `/* op: insert_td_delta */
INSERT OR IGNORE INTO td_count_deltas (event_id, installation_id, student_id, day, delta, new_count, occurred_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`;
}

function summarySql() {
  return `/* op: summary */
SELECT
  (SELECT COUNT(*) FROM installations) AS total_installations,
  (SELECT COUNT(*) FROM installations WHERE substr(first_seen_at, 1, 10) = ?) AS new_installations_today,
  (SELECT COUNT(DISTINCT student_id) FROM installation_students WHERE present = 1) AS current_total_users,
  (SELECT COUNT(*) FROM students WHERE substr(first_seen_at, 1, 10) = ?) AS todays_new_users,
  (SELECT COUNT(*) FROM students) AS historical_users,
  (SELECT COALESCE(SUM(delta), 0) FROM td_count_deltas WHERE day = ?) AS today_td_delta`;
}

function listUsersSql() {
  return `/* op: list_users */
SELECT
  s.student_id,
  s.first_seen_at,
  s.last_seen_at,
  s.latest_td_count,
  COUNT(DISTINCT d.day) AS usage_days
FROM students s
LEFT JOIN daily_student_snapshots d ON d.student_id = s.student_id
GROUP BY s.student_id, s.first_seen_at, s.last_seen_at, s.latest_td_count
ORDER BY s.student_id`;
}

function listEventsSql() {
  return `/* op: list_events */
SELECT event_id, installation_id, event_type, event_day, occurred_at, payload
FROM events
ORDER BY occurred_at DESC
LIMIT 100`;
}
