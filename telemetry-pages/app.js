const DEFAULT_ENDPOINT = "https://autotd-telemetry.autotd-buaa.workers.dev";
const STORAGE_KEY = "autotd.telemetry.dashboard";

const elements = {
  form: document.querySelector("#settings-form"),
  endpoint: document.querySelector("#api-endpoint"),
  token: document.querySelector("#admin-token"),
  clearToken: document.querySelector("#clear-token"),
  day: document.querySelector("#day-filter"),
  refresh: document.querySelector("#refresh-now"),
  overview: document.querySelector("#overview"),
  chart: document.querySelector("#chart"),
  usersBody: document.querySelector("#users-body"),
  eventsBody: document.querySelector("#events-body"),
  userSearch: document.querySelector("#user-search"),
  lastUpdated: document.querySelector("#last-updated"),
  toast: document.querySelector("#toast")
};

let state = {
  endpoint: DEFAULT_ENDPOINT,
  token: "",
  users: [],
  events: [],
  daily: [],
  loading: false
};

initialize();

function initialize() {
  state = { ...state, ...loadSettings() };
  elements.endpoint.value = state.endpoint;
  elements.token.value = state.token;
  elements.day.value = todayInShanghai();

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.endpoint = normalizeEndpoint(elements.endpoint.value);
    state.token = elements.token.value.trim();
    saveSettings();
    refreshDashboard();
  });
  elements.refresh.addEventListener("click", refreshDashboard);
  elements.day.addEventListener("change", refreshDashboard);
  elements.clearToken.addEventListener("click", () => {
    state.token = "";
    elements.token.value = "";
    saveSettings();
    showToast("已清除本地 Admin Token");
  });
  elements.userSearch.addEventListener("input", renderUsers);

  renderLoading();
  refreshDashboard();
}

async function refreshDashboard() {
  state.endpoint = normalizeEndpoint(elements.endpoint.value);
  state.token = elements.token.value.trim();
  saveSettings();
  state.loading = true;
  renderLoading();

  try {
    const day = elements.day.value || todayInShanghai();
    const [summary, users, events, daily] = await Promise.all([
      fetchAdminJson(`/admin/api/summary?day=${encodeURIComponent(day)}`),
      fetchAdminJson("/admin/api/users"),
      fetchAdminJson("/admin/api/events"),
      fetchAdminJson("/admin/api/daily")
    ]);

    state.users = Array.isArray(users.users) ? users.users : [];
    state.events = Array.isArray(events.events) ? events.events : [];
    state.daily = Array.isArray(daily.daily) ? daily.daily : [];

    renderOverview(summary);
    renderChart();
    renderUsers();
    renderEvents();
    elements.lastUpdated.textContent = `刷新于 ${formatClock(new Date())}`;
    showToast("数据已刷新");
  } catch (error) {
    renderError(error);
    showToast(error.message, true);
  } finally {
    state.loading = false;
  }
}

async function fetchAdminJson(path) {
  const response = await fetch(`${state.endpoint}${path}`, {
    headers: {
      Authorization: `Bearer ${state.token}`
    }
  });
  if (!response.ok) {
    const body = await safeText(response);
    if (response.status === 401) {
      throw new Error("Admin Token 无效或未填写");
    }
    throw new Error(body || `请求失败：${response.status}`);
  }
  return response.json();
}

function renderLoading() {
  const placeholders = [
    "总安装数",
    "今日新增安装",
    "当前总用户",
    "今日新增用户",
    "历史累计用户",
    "今日 TD 打卡数"
  ];
  elements.overview.innerHTML = placeholders.map((label) => metricCard(label, "…")).join("");
  elements.chart.innerHTML = '<div class="empty-state">加载中</div>';
  elements.usersBody.innerHTML = tableMessage(5, "加载中");
  elements.eventsBody.innerHTML = tableMessage(4, "加载中");
}

function renderOverview(summary) {
  const metrics = [
    ["总安装数", summary.total_installations],
    ["今日新增安装", summary.new_installations_today],
    ["当前总用户", summary.current_total_users],
    ["今日新增用户", summary.todays_new_users],
    ["历史累计用户", summary.historical_users],
    ["今日 TD 打卡数", summary.today_td_delta]
  ];
  elements.overview.innerHTML = metrics.map(([label, value]) => metricCard(label, formatNumber(value))).join("");
}

function renderChart() {
  const rows = [...state.daily].reverse();
  if (rows.length === 0) {
    elements.chart.innerHTML = '<div class="empty-state">暂无趋势数据</div>';
    return;
  }

  const width = 900;
  const height = 280;
  const pad = { top: 20, right: 22, bottom: 38, left: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxStudents = Math.max(1, ...rows.map((row) => Number(row.active_students) || 0));
  const maxDelta = Math.max(1, ...rows.map((row) => Number(row.td_delta) || 0));
  const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;
  const barWidth = Math.max(4, Math.min(18, innerWidth / rows.length - 4));

  const linePoints = rows
    .map((row, index) => {
      const x = pad.left + (rows.length === 1 ? innerWidth / 2 : index * step);
      const y = pad.top + innerHeight - ((Number(row.active_students) || 0) / maxStudents) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const bars = rows.map((row, index) => {
    const x = pad.left + (rows.length === 1 ? innerWidth / 2 : index * step) - barWidth / 2;
    const h = ((Number(row.td_delta) || 0) / maxDelta) * innerHeight;
    const y = pad.top + innerHeight - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3" fill="#f3b562"></rect>`;
  }).join("");

  const labels = chartLabels(rows, pad, innerWidth);
  elements.chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 60 天活跃用户和 TD 增量趋势">
      <line x1="${pad.left}" y1="${pad.top + innerHeight}" x2="${pad.left + innerWidth}" y2="${pad.top + innerHeight}" stroke="#dce4e8"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerHeight}" stroke="#dce4e8"></line>
      ${bars}
      <polyline points="${linePoints}" fill="none" stroke="#0f766e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${rows.map((row, index) => {
        const x = pad.left + (rows.length === 1 ? innerWidth / 2 : index * step);
        const y = pad.top + innerHeight - ((Number(row.active_students) || 0) / maxStudents) * innerHeight;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#0f766e"><title>${escapeHtml(row.day)}：活跃用户 ${formatNumber(row.active_students)}，TD +${formatNumber(row.td_delta)}</title></circle>`;
      }).join("")}
      <text x="${pad.left}" y="15" class="axis-label">活跃用户</text>
      <text x="${pad.left + innerWidth - 110}" y="15" class="axis-label">柱：TD 增量</text>
      ${labels}
    </svg>
  `;
}

function chartLabels(rows, pad, innerWidth) {
  const indexes = new Set([0, rows.length - 1, Math.floor((rows.length - 1) / 2)]);
  const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;
  return [...indexes].sort((a, b) => a - b).map((index) => {
    const x = pad.left + (rows.length === 1 ? innerWidth / 2 : index * step);
    const label = String(rows[index].day || "").slice(5);
    return `<text x="${x.toFixed(1)}" y="266" text-anchor="middle" class="axis-label">${escapeHtml(label)}</text>`;
  }).join("");
}

function renderUsers() {
  const query = elements.userSearch.value.trim();
  const users = query
    ? state.users.filter((row) => String(row.student_id || "").includes(query))
    : state.users;
  if (users.length === 0) {
    elements.usersBody.innerHTML = tableMessage(5, query ? "没有匹配用户" : "暂无用户数据");
    return;
  }
  elements.usersBody.innerHTML = users.map((row) => `
    <tr>
      <td><code>${escapeHtml(row.student_id)}</code></td>
      <td>${formatNumber(row.latest_td_count)}</td>
      <td>${formatNumber(row.usage_days)}</td>
      <td>${formatTime(row.first_seen_at)}</td>
      <td>${formatTime(row.last_seen_at)}</td>
    </tr>
  `).join("");
}

function renderEvents() {
  if (state.events.length === 0) {
    elements.eventsBody.innerHTML = tableMessage(4, "暂无事件数据");
    return;
  }
  elements.eventsBody.innerHTML = state.events.map((row) => `
    <tr>
      <td>${formatTime(row.occurred_at)}</td>
      <td><span class="tag ${eventIsWarning(row.event_type) ? "warn" : ""}">${escapeHtml(row.event_type)}</span></td>
      <td><code>${escapeHtml(shortId(row.installation_id))}</code></td>
      <td>${payloadSummary(row)}</td>
    </tr>
  `).join("");
}

function renderError(error) {
  const message = escapeHtml(error.message);
  elements.overview.innerHTML = [
    "总安装数",
    "今日新增安装",
    "当前总用户",
    "今日新增用户",
    "历史累计用户",
    "今日 TD 打卡数"
  ].map((label) => metricCard(label, "—")).join("");
  elements.chart.innerHTML = `<div class="empty-state">${message}</div>`;
  elements.usersBody.innerHTML = tableMessage(5, message);
  elements.eventsBody.innerHTML = tableMessage(4, message);
}

function metricCard(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function tableMessage(colspan, message) {
  return `<tr><td colspan="${colspan}" class="muted">${escapeHtml(message)}</td></tr>`;
}

function payloadSummary(row) {
  const payload = parsePayload(row.payload);
  const parts = [];
  if (payload.student_id) parts.push(`学号 ${payload.student_id}`);
  if (payload.affected_student_id) parts.push(`学号 ${payload.affected_student_id}`);
  if (payload.change_type) parts.push(payload.change_type);
  if (Number(payload.delta) > 0) parts.push(`TD +${payload.delta}`);
  if (payload.new_count !== undefined && payload.new_count !== null) parts.push(`当前 ${payload.new_count}`);
  if (payload.current_user_count !== undefined && payload.current_user_count !== null) parts.push(`用户 ${payload.current_user_count}`);
  return escapeHtml(parts.join(" · ") || "—");
}

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function eventIsWarning(type) {
  return type === "stop_requested" || type === "daemon_stopped";
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      endpoint: normalizeEndpoint(parsed.endpoint || DEFAULT_ENDPOINT),
      token: String(parsed.token || "")
    };
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    endpoint: state.endpoint,
    token: state.token
  }));
}

function normalizeEndpoint(value) {
  const endpoint = String(value || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
  return endpoint.replace(/\/+$/, "");
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatClock(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("zh-CN").format(number);
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text;
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
