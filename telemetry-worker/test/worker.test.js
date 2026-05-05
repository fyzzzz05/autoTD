import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleRequest, signPayload } from "../src/index.js";

class FakeD1 {
  constructor() {
    this.installations = new Map();
    this.students = new Map();
    this.installationStudents = new Map();
    this.events = new Map();
    this.tdDeltas = [];
    this.dailyInstallationSnapshots = new Map();
    this.dailyStudentSnapshots = new Map();
  }

  prepare(sql) {
    const op = sql.match(/op:\s*([a-z_]+)/)?.[1];
    if (!op) {
      throw new Error(`missing fake op: ${sql}`);
    }
    return new FakeStatement(this, op);
  }
}

class FakeStatement {
  constructor(db, op) {
    this.db = db;
    this.op = op;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const v = this.values;
    switch (this.op) {
      case "upsert_installation": {
        const [id, secret, firstSeen, lastSeen, version, platform, userCount] = v;
        const existing = this.db.installations.get(id);
        this.db.installations.set(id, {
          installation_id: id,
          installation_secret: secret,
          first_seen_at: existing?.first_seen_at ?? firstSeen,
          last_seen_at: lastSeen,
          app_version: version,
          platform,
          current_user_count: userCount,
          max_user_count: Math.max(existing?.max_user_count ?? 0, userCount)
        });
        return { success: true };
      }
      case "mark_installation_absent": {
        for (const record of this.db.installationStudents.values()) {
          if (record.installation_id === v[0]) record.present = 0;
        }
        return { success: true };
      }
      case "upsert_student": {
        const [studentId, firstSeen, lastSeen, tdCount] = v;
        const existing = this.db.students.get(studentId);
        this.db.students.set(studentId, {
          student_id: studentId,
          first_seen_at: existing?.first_seen_at ?? firstSeen,
          last_seen_at: lastSeen,
          latest_td_count: tdCount ?? existing?.latest_td_count ?? null
        });
        return { success: true };
      }
      case "upsert_installation_student": {
        const [installationId, studentId, firstSeen, lastSeen, tdCount] = v;
        const key = `${installationId}:${studentId}`;
        const existing = this.db.installationStudents.get(key);
        this.db.installationStudents.set(key, {
          installation_id: installationId,
          student_id: studentId,
          first_seen_at: existing?.first_seen_at ?? firstSeen,
          last_seen_at: lastSeen,
          latest_td_count: tdCount ?? existing?.latest_td_count ?? null,
          present: 1
        });
        return { success: true };
      }
      case "insert_daily_installation_snapshot": {
        this.db.dailyInstallationSnapshots.set(`${v[0]}:${v[1]}`, {
          installation_id: v[0],
          day: v[1],
          user_count: v[2]
        });
        return { success: true };
      }
      case "insert_daily_student_snapshot": {
        this.db.dailyStudentSnapshots.set(`${v[0]}:${v[1]}`, {
          student_id: v[0],
          day: v[1],
          td_count: v[2]
        });
        return { success: true };
      }
      case "insert_event": {
        const [eventId, installationId, type, day, occurredAt, payload] = v;
        if (this.db.events.has(eventId)) {
          return { success: true, meta: { duplicate: true } };
        }
        this.db.events.set(eventId, {
          event_id: eventId,
          installation_id: installationId,
          event_type: type,
          event_day: day,
          occurred_at: occurredAt,
          payload
        });
        return { success: true };
      }
      case "insert_td_delta": {
        this.db.tdDeltas.push({
          event_id: v[0],
          installation_id: v[1],
          student_id: v[2],
          day: v[3],
          delta: v[4],
          new_count: v[5],
          occurred_at: v[6]
        });
        return { success: true };
      }
      default:
        throw new Error(`unknown run op ${this.op}`);
    }
  }

  async first() {
    const v = this.values;
    switch (this.op) {
      case "get_installation_secret":
        return this.db.installations.get(v[0]) ?? null;
      case "get_event":
        return this.db.events.get(v[0]) ?? null;
      case "summary":
        return {
          total_installations: this.db.installations.size,
          new_installations_today: [...this.db.installations.values()].filter((row) => row.first_seen_at.startsWith(v[0])).length,
          current_total_users: new Set([...this.db.installationStudents.values()].filter((row) => row.present).map((row) => row.student_id)).size,
          todays_new_users: [...this.db.students.values()].filter((row) => row.first_seen_at.startsWith(v[0])).length,
          historical_users: this.db.students.size,
          today_td_delta: this.db.tdDeltas.filter((row) => row.day === v[0]).reduce((sum, row) => sum + row.delta, 0)
        };
      default:
        throw new Error(`unknown first op ${this.op}`);
    }
  }

  async all() {
    switch (this.op) {
      case "list_users":
        return {
          results: [...this.db.students.values()].map((row) => ({
            ...row,
            usage_days: new Set(
              [...this.db.dailyStudentSnapshots.values()]
                .filter((snapshot) => snapshot.student_id === row.student_id)
                .map((snapshot) => snapshot.day)
            ).size
          }))
        };
      case "list_events":
        return { results: [...this.db.events.values()] };
      case "daily":
        return {
          results: [...new Set([
            ...[...this.db.dailyInstallationSnapshots.values()].map((row) => row.day),
            ...[...this.db.dailyStudentSnapshots.values()].map((row) => row.day),
            ...this.db.tdDeltas.map((row) => row.day)
          ])]
            .sort()
            .map((day) => ({
              day,
              active_installations: new Set(
                [...this.db.dailyInstallationSnapshots.values()]
                  .filter((row) => row.day === day)
                  .map((row) => row.installation_id)
              ).size,
              active_students: new Set(
                [...this.db.dailyStudentSnapshots.values()]
                  .filter((row) => row.day === day)
                  .map((row) => row.student_id)
              ).size,
              td_delta: this.db.tdDeltas.filter((row) => row.day === day).reduce((sum, row) => sum + row.delta, 0)
            }))
        };
      default:
        throw new Error(`unknown all op ${this.op}`);
    }
  }
}

function env() {
  return { DB: new FakeD1(), ADMIN_TOKEN: "admin-token" };
}

function jsonRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

async function register(testEnv, installationId = "install-1", users = []) {
  return handleRequest(
    jsonRequest("https://example.test/v1/installations/register", {
      installation_id: installationId,
      installation_secret: "secret-1",
      app_version: "0.1.8",
      platform: "test",
      registered_at: "2026-05-05T08:00:00+08:00",
      current_user_count: users.length,
      users
    }),
    testEnv
  );
}

function eventBody(overrides = {}) {
  return {
    event: {
      event_id: "event-1",
      event_type: "td_count_changed",
      installation_id: "install-1",
      app_version: "0.1.8",
      platform: "test",
      occurred_at: "2026-05-05T08:01:00+08:00",
      event_day: "2026-05-05",
      payload: {
        student_id: "1001",
        previous_count: 5,
        new_count: 8,
        delta: 3,
        initial_observation: false,
        count_decreased: false,
        current_user_count: 1,
        users: [{ student_id: "1001", td_count: 8 }]
      },
      ...overrides
    }
  };
}

describe("autotd telemetry worker", () => {
  it("registers an installation and applies the current user snapshot", async () => {
    const testEnv = env();
    const response = await register(testEnv, "install-1", [{ student_id: "1001", td_count: 5 }]);

    assert.equal(response.status, 200);
    assert.equal(testEnv.DB.installations.get("install-1").current_user_count, 1);
    assert.equal(testEnv.DB.students.get("1001").latest_td_count, 5);
    assert.equal(testEnv.DB.installationStudents.get("install-1:1001").present, 1);
  });

  it("rejects unsigned events and accepts signed events", async () => {
    const testEnv = env();
    await register(testEnv);
    const body = eventBody();

    const rejected = await handleRequest(jsonRequest("https://example.test/v1/events", body), testEnv);
    assert.equal(rejected.status, 401);

    const signature = await signPayload("secret-1", body);
    const accepted = await handleRequest(
      jsonRequest("https://example.test/v1/events", body, {
        "X-AutoTD-Installation": "install-1",
        "X-AutoTD-Signature": signature
      }),
      testEnv
    );

    assert.equal(accepted.status, 200);
    assert.equal(testEnv.DB.tdDeltas.length, 1);
    assert.equal(testEnv.DB.tdDeltas[0].delta, 3);
  });

  it("deduplicates repeated event IDs", async () => {
    const testEnv = env();
    await register(testEnv);
    const body = eventBody();
    const signature = await signPayload("secret-1", body);
    const headers = { "X-AutoTD-Installation": "install-1", "X-AutoTD-Signature": signature };

    await handleRequest(jsonRequest("https://example.test/v1/events", body, headers), testEnv);
    const duplicate = await handleRequest(jsonRequest("https://example.test/v1/events", body, headers), testEnv);

    assert.equal(duplicate.status, 200);
    assert.equal(testEnv.DB.events.size, 1);
    assert.equal(testEnv.DB.tdDeltas.length, 1);
  });

  it("updates user presence when users are deleted and reappear", async () => {
    const testEnv = env();
    await register(testEnv, "install-1", [
      { student_id: "1001", td_count: 5 },
      { student_id: "1002", td_count: 2 }
    ]);
    const body = eventBody({
      event_id: "event-delete",
      event_type: "user_changed",
      payload: {
        change_type: "delete",
        affected_student_id: "1002",
        current_user_count: 1,
        users: [{ student_id: "1001", td_count: 5 }]
      }
    });
    const signature = await signPayload("secret-1", body);

    await handleRequest(
      jsonRequest("https://example.test/v1/events", body, {
        "X-AutoTD-Installation": "install-1",
        "X-AutoTD-Signature": signature
      }),
      testEnv
    );

    assert.equal(testEnv.DB.installationStudents.get("install-1:1002").present, 0);
    assert.equal(testEnv.DB.students.size, 2);
  });

  it("applies added users from user_changed snapshots immediately", async () => {
    const testEnv = env();
    await register(testEnv, "install-1", [{ student_id: "1001", td_count: 5 }]);
    const body = eventBody({
      event_id: "event-add-user",
      event_type: "user_changed",
      payload: {
        change_type: "add",
        affected_student_id: "1002",
        current_user_count: 2,
        users: [
          { student_id: "1001", td_count: 5 },
          { student_id: "1002", td_count: null }
        ]
      }
    });
    const signature = await signPayload("secret-1", body);

    await handleRequest(
      jsonRequest("https://example.test/v1/events", body, {
        "X-AutoTD-Installation": "install-1",
        "X-AutoTD-Signature": signature
      }),
      testEnv
    );

    const summaryResponse = await handleRequest(
      new Request("https://example.test/admin/api/summary?token=admin-token&day=2026-05-05"),
      testEnv
    );
    const summary = await summaryResponse.json();

    assert.equal(summary.historical_users, 2);
    assert.equal(summary.todays_new_users, 2);
    assert.equal(testEnv.DB.installations.get("install-1").current_user_count, 2);
    assert.equal(testEnv.DB.dailyStudentSnapshots.has("1002:2026-05-05"), true);
  });

  it("protects admin APIs and returns summary metrics", async () => {
    const testEnv = env();
    await register(testEnv, "install-1", [{ student_id: "1001", td_count: 5 }]);
    const body = eventBody();
    const signature = await signPayload("secret-1", body);
    await handleRequest(
      jsonRequest("https://example.test/v1/events", body, {
        "X-AutoTD-Installation": "install-1",
        "X-AutoTD-Signature": signature
      }),
      testEnv
    );

    const rejected = await handleRequest(new Request("https://example.test/admin/api/summary"), testEnv);
    assert.equal(rejected.status, 401);

    const accepted = await handleRequest(new Request("https://example.test/admin/api/summary?token=admin-token&day=2026-05-05"), testEnv);
    const summary = await accepted.json();
    assert.equal(summary.total_installations, 1);
    assert.equal(summary.current_total_users, 1);
    assert.equal(summary.historical_users, 1);
    assert.equal(summary.today_td_delta, 3);
  });

  it("allows Pages frontend CORS access to admin APIs", async () => {
    const testEnv = env();
    const preflight = await handleRequest(
      new Request("https://example.test/admin/api/summary", {
        method: "OPTIONS",
        headers: { Origin: "https://autotd-telemetry-dashboard.pages.dev" }
      }),
      testEnv
    );

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");

    const rejected = await handleRequest(new Request("https://example.test/admin/api/summary"), testEnv);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), "*");
  });

  it("returns daily series for dashboard charts", async () => {
    const testEnv = env();
    await register(testEnv, "install-1", [{ student_id: "1001", td_count: 5 }]);
    const body = eventBody();
    const signature = await signPayload("secret-1", body);
    await handleRequest(
      jsonRequest("https://example.test/v1/events", body, {
        "X-AutoTD-Installation": "install-1",
        "X-AutoTD-Signature": signature
      }),
      testEnv
    );

    const response = await handleRequest(new Request("https://example.test/admin/api/daily?token=admin-token"), testEnv);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.daily[0].day, "2026-05-05");
    assert.equal(payload.daily[0].active_installations, 1);
    assert.equal(payload.daily[0].active_students, 1);
    assert.equal(payload.daily[0].td_delta, 3);
  });
});
