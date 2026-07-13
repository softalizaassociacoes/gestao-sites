// ============================================================================
// Merge das fontes brutas (data.js) + renderização das duas abas.
// ============================================================================

function norm(s) {
  return (s || "").toString().trim().toUpperCase();
}

function buildNormMap(obj) {
  const out = {};
  Object.keys(obj).forEach((k) => (out[norm(k)] = obj[k]));
  return out;
}

const VERCEL_ASSOC_N = buildNormMap(VERCEL_ASSOC);
const LOCAL_FOLDER_ASSOC_N = buildNormMap(LOCAL_FOLDER_ASSOC);
const NIVEL_OVERRIDE_N = buildNormMap(NIVEL_OVERRIDE);

const SITE_INVENTORY_BY_SIGLA = {};
SITE_INVENTORY.forEach((row) => {
  const k = norm(row.sigla);
  if (!SITE_INVENTORY_BY_SIGLA[k]) SITE_INVENTORY_BY_SIGLA[k] = [];
  SITE_INVENTORY_BY_SIGLA[k].push(row);
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// --- Edições manuais persistidas no navegador (localStorage) ---
const OVERRIDES_KEY = "gestaoSitesOverrides";

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveOverride(sigla, patch) {
  const all = loadOverrides();
  all[sigla] = { ...all[sigla], ...patch };
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
}

const OVERRIDES = loadOverrides();

// --- Edições manuais de eventos (chave própria, indexada por id do evento) ---
const EVENT_OVERRIDES_KEY = "gestaoSitesEventOverrides";

function loadEventOverrides() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_OVERRIDES_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveEventOverride(id, patch) {
  const all = loadEventOverrides();
  all[id] = { ...all[id], ...patch };
  localStorage.setItem(EVENT_OVERRIDES_KEY, JSON.stringify(all));
}

const EVENT_OVERRIDES = loadEventOverrides();

function buildAssociacoes() {
  return ASSOCIATIONS_CRM.map((a) => {
    const key = norm(a.sigla);
    const vercel = VERCEL_ASSOC_N[key] || null;
    const nivel = NIVEL_OVERRIDE_N[key] || null;
    const inventoryRows = SITE_INVENTORY_BY_SIGLA[key] || [];
    const institucional = inventoryRows.find((r) => !r.evento) || null;

    const defaultSiteAtual = vercel ? (nivel === "B" || nivel === "C" ? "hotsite" : "personalizado") : "wordpress";
    const defaultLink = (vercel && vercel.dominio) || (institucional && institucional.site) || "";

    const saved = OVERRIDES[a.sigla] || {};

    return {
      sigla: a.sigla,
      nome: a.nome,
      health: a.health,
      siteAtual: saved.siteAtual || defaultSiteAtual,
      link: saved.link != null ? saved.link : defaultLink,
      removed: !!saved.removed,
    };
  });
}

const STATUS_MANUAL_OPTIONS = [
  { value: "a_acontecer", label: "A acontecer" },
  { value: "acontecendo", label: "Acontecendo" },
  { value: "realizado", label: "Realizado" },
];

function buildEventos() {
  const fromCrm = EVENTS_CRM.map((e) => {
    const vercel = VERCEL_EVENT[e.id] || null;
    const link = (vercel && vercel.dominio) || e.siteUrl || "";
    const defaultStatusManual = e.status === "encerrado" ? "realizado" : "a_acontecer";
    const saved = EVENT_OVERRIDES[e.id] || {};

    return {
      id: e.id,
      sigla: e.sigla,
      associacao: e.associacao,
      nome: e.nome,
      shortName: e.shortName,
      edicao: e.edicao,
      ano: e.ano,
      cidade: e.cidade,
      estado: e.estado,
      statusManual: saved.statusManual || defaultStatusManual,
      link: saved.link != null ? saved.link : link,
      removed: !!saved.removed,
    };
  });

  const crmLinks = new Set(fromCrm.map((e) => e.link).filter(Boolean));
  const fromSheetOnly = SITE_INVENTORY.filter((r) => r.evento && !crmLinks.has(r.site)).map((r, i) => {
    const id = `sheet-${i}`;
    const saved = EVENT_OVERRIDES[id] || {};
    return {
      id,
      sigla: r.sigla,
      associacao: null,
      nome: r.nome,
      shortName: null,
      edicao: null,
      ano: null,
      cidade: null,
      estado: null,
      statusManual: saved.statusManual || "realizado",
      link: saved.link != null ? saved.link : r.site,
      removed: !!saved.removed,
    };
  });

  return [...fromCrm, ...fromSheetOnly];
}

const ASSOCIACOES = buildAssociacoes();
const EVENTOS = buildEventos();

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function healthBadge(health) {
  const map = {
    saudavel: ["Saudável", "health-ok"],
    atencao: ["Atenção", "health-warn"],
    risco: ["Risco", "health-risk"],
    cancelado: ["Cancelado", "health-off"],
  };
  const [label, cls] = map[health] || ["—", "health-off"];
  return `<span class="badge ${cls}">${label}</span>`;
}

const SITE_ATUAL_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "personalizado", label: "Personalizado" },
  { value: "hotsite", label: "Hotsite" },
];

function siteAtualSelect(sigla, current) {
  const opts = SITE_ATUAL_OPTIONS.map(
    (o) => `<option value="${o.value}" ${o.value === current ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="site-select" data-sigla="${sigla}">${opts}</select>`;
}

function statusManualSelect(id, current) {
  const opts = STATUS_MANUAL_OPTIONS.map(
    (o) => `<option value="${o.value}" ${o.value === current ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="evento-status-select" data-id="${id}">${opts}</select>`;
}

function eventoLinkInput(id, value) {
  return `<input class="evento-link" type="text" data-id="${id}" value="${(value || "").replace(/"/g, "&quot;")}" placeholder="https://..." />`;
}

function initials(text) {
  return (text || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Aba Associações
// ---------------------------------------------------------------------------

function renderAssocStats(allList) {
  const list = allList.filter((a) => !a.removed);
  const total = list.length;
  const saudavel = list.filter((a) => a.health === "saudavel").length;
  const atencaoRisco = list.filter((a) => a.health === "atencao" || a.health === "risco").length;
  const wordpress = list.filter((a) => a.siteAtual === "wordpress").length;
  const personalizado = list.filter((a) => a.siteAtual === "personalizado").length;
  const hotsite = list.filter((a) => a.siteAtual === "hotsite").length;

  const cards = [
    { value: total, label: "Associações" },
    { value: saudavel, label: "Saudáveis" },
    { value: atencaoRisco, label: "Atenção / risco" },
    { value: wordpress, label: "WordPress" },
    { value: personalizado, label: "Personalizado" },
    { value: hotsite, label: "Hotsite" },
  ];

  document.getElementById("assoc-stats").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`)
    .join("");

  const cancelado = list.filter((a) => a.health === "cancelado").length;
  const healthBar = [
    { key: "saudavel", cls: "bar-ok", count: saudavel },
    { key: "atencao", cls: "bar-warn", count: list.filter((a) => a.health === "atencao").length },
    { key: "risco", cls: "bar-risk", count: list.filter((a) => a.health === "risco").length },
    { key: "cancelado", cls: "bar-off", count: cancelado },
  ];
  document.getElementById("assoc-health-bar").innerHTML = healthBar
    .map((seg) => `<div class="bar-seg ${seg.cls}" style="flex:${Math.max(seg.count, 0.0001)}" title="${seg.key}: ${seg.count}"></div>`)
    .join("");
}

function renderAssocTable(list) {
  const tbody = document.getElementById("assoc-table-body");
  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhuma associação encontrada com esses filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map(
      (a) => `<tr class="${a.removed ? "row-removed" : ""}">
        <td><div class="name-cell"><span class="avatar">${initials(a.sigla)}</span><div><strong>${a.sigla}</strong><div class="muted small">${a.nome || "—"}</div></div></div></td>
        <td>${healthBadge(a.health)}</td>
        <td>${siteAtualSelect(a.sigla, a.siteAtual)}</td>
        <td><input class="site-link" type="text" data-sigla="${a.sigla}" value="${(a.link || "").replace(/"/g, "&quot;")}" placeholder="https://..." /></td>
        <td>${a.removed
          ? `<button class="btn-restore" data-sigla="${a.sigla}">Restaurar</button>`
          : `<button class="btn-remove" data-sigla="${a.sigla}">Excluir</button>`}</td>
      </tr>`
    )
    .join("");
}

function applyAssocFilters() {
  const q = document.getElementById("assoc-search").value.trim().toLowerCase();
  const health = document.getElementById("assoc-filter-health").value;
  const site = document.getElementById("assoc-filter-site").value;
  const showRemoved = document.getElementById("assoc-show-removed").checked;

  const filtered = ASSOCIACOES.filter((a) => {
    if (!showRemoved && a.removed) return false;
    if (q && !`${a.sigla} ${a.nome || ""}`.toLowerCase().includes(q)) return false;
    if (health && a.health !== health) return false;
    if (site && a.siteAtual !== site) return false;
    return true;
  });

  renderAssocStats(filtered);
  renderAssocTable(filtered);
}

function handleAssocEdit(ev) {
  const el = ev.target;
  const sigla = el.dataset.sigla;
  if (!sigla) return;
  const assoc = ASSOCIACOES.find((a) => a.sigla === sigla);
  if (!assoc) return;

  if (el.classList.contains("site-select")) {
    assoc.siteAtual = el.value;
    saveOverride(sigla, { siteAtual: el.value });
    applyAssocFilters();
  } else if (el.classList.contains("site-link")) {
    assoc.link = el.value;
    saveOverride(sigla, { link: el.value });
  }
}

function handleAssocClick(ev) {
  const btn = ev.target.closest("button[data-sigla]");
  if (!btn) return;
  const sigla = btn.dataset.sigla;
  const assoc = ASSOCIACOES.find((a) => a.sigla === sigla);
  if (!assoc) return;

  if (btn.classList.contains("btn-remove")) {
    if (!confirm(`Excluir "${sigla}" da gestão de sites? Ela pode ser restaurada depois em "Mostrar excluídas".`)) return;
    assoc.removed = true;
    saveOverride(sigla, { removed: true });
  } else if (btn.classList.contains("btn-restore")) {
    assoc.removed = false;
    saveOverride(sigla, { removed: false });
  }
  applyAssocFilters();
}

// ---------------------------------------------------------------------------
// Aba Eventos
// ---------------------------------------------------------------------------

function renderEventoStats(list) {
  const total = list.length;
  const aAcontecer = list.filter((e) => e.statusManual === "a_acontecer").length;
  const acontecendo = list.filter((e) => e.statusManual === "acontecendo").length;
  const realizado = list.filter((e) => e.statusManual === "realizado").length;
  const comSite = list.filter((e) => e.link).length;

  const cards = [
    { value: total, label: "Eventos" },
    { value: aAcontecer, label: "A acontecer" },
    { value: acontecendo, label: "Acontecendo" },
    { value: realizado, label: "Realizados" },
    { value: comSite, label: "Com site" },
  ];

  document.getElementById("evento-stats").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`)
    .join("");
}

function renderEventoTable(list) {
  const tbody = document.getElementById("evento-table-body");
  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum evento encontrado com esses filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map((e) => {
      const edicaoAno = [e.edicao, e.ano].filter(Boolean).join(" · ") || "—";
      const local = [e.cidade, e.estado].filter(Boolean).join("/");
      return `<tr>
        <td><strong>${e.shortName || e.nome}</strong><div class="muted small">${e.nome}</div></td>
        <td class="muted">${e.associacao || e.sigla || "—"}</td>
        <td class="muted">${edicaoAno}${local ? `<div class="small">${local}</div>` : ""}</td>
        <td>${statusManualSelect(e.id, e.statusManual)}</td>
        <td>${eventoLinkInput(e.id, e.link)}</td>
      </tr>`;
    })
    .join("");
}

function applyEventoFilters() {
  const q = document.getElementById("evento-search").value.trim().toLowerCase();
  const status = document.getElementById("evento-filter-status").value;

  const filtered = EVENTOS.filter((e) => {
    if (q && !`${e.nome} ${e.shortName || ""} ${e.associacao || ""} ${e.sigla || ""}`.toLowerCase().includes(q)) return false;
    if (status && e.statusManual !== status) return false;
    return true;
  });

  renderEventoStats(filtered);
  renderEventoTable(filtered);
}

function handleEventoEdit(ev) {
  const el = ev.target;
  const id = el.dataset.id;
  if (!id) return;
  const evento = EVENTOS.find((e) => e.id === id);
  if (!evento) return;

  if (el.classList.contains("evento-status-select")) {
    evento.statusManual = el.value;
    saveEventOverride(id, { statusManual: el.value });
    applyEventoFilters();
  } else if (el.classList.contains("evento-link")) {
    evento.link = el.value;
    saveEventOverride(id, { link: el.value });
  }
}

// ---------------------------------------------------------------------------
// Tabs + init
// ---------------------------------------------------------------------------

function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function init() {
  initTabs();

  applyAssocFilters();
  applyEventoFilters();

  ["assoc-search", "assoc-filter-health", "assoc-filter-site", "assoc-show-removed"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyAssocFilters);
  });
  ["evento-search", "evento-filter-status"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyEventoFilters);
  });

  document.getElementById("assoc-table-body").addEventListener("change", handleAssocEdit);
  document.getElementById("assoc-table-body").addEventListener("click", handleAssocClick);
  document.getElementById("evento-table-body").addEventListener("change", handleEventoEdit);
}

document.addEventListener("DOMContentLoaded", init);
