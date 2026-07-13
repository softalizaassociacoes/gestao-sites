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
    };
  });
}

function buildEventos() {
  const fromCrm = EVENTS_CRM.map((e) => {
    const vercel = VERCEL_EVENT[e.id] || null;
    const localFolder = LOCAL_FOLDER_EVENT[e.id] || null;
    const dominio = (vercel && vercel.dominio) || e.siteUrl || null;
    const siteStatus = vercel ? "vercel" : e.temSite ? "site_proprio" : localFolder ? "wordpress" : "sem_site";

    const obsParts = [];
    if (vercel) obsParts.push(`Já migrado (projeto Vercel ${vercel.project})`);
    if (localFolder) obsParts.push(`Ajuste local em curso: ${localFolder}/`);

    return {
      fonte: "cshub",
      sigla: e.sigla,
      associacao: e.associacao,
      nome: e.nome,
      shortName: e.shortName,
      edicao: e.edicao,
      ano: e.ano,
      tipo: e.tipo,
      status: e.status,
      temSite: e.temSite,
      dominio,
      cidade: e.cidade,
      estado: e.estado,
      siteStatus,
      obs: obsParts.join(" · "),
    };
  });

  const crmDominios = new Set(fromCrm.map((e) => e.dominio).filter(Boolean));
  const fromSheetOnly = SITE_INVENTORY.filter((r) => r.evento && !crmDominios.has(r.site)).map((r) => ({
    fonte: "planilha",
    sigla: r.sigla,
    associacao: null,
    nome: r.nome,
    shortName: null,
    edicao: null,
    ano: null,
    tipo: r.area,
    status: null,
    temSite: true,
    dominio: r.site,
    cidade: null,
    estado: null,
    siteStatus: "site_proprio",
    obs: "Fonte: planilha de inventário (sem registro correspondente no CS Hub)",
  }));

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

function siteStatusBadge(status) {
  const map = {
    vercel: ["No Vercel", "site-vercel"],
    wordpress: ["WordPress", "site-wordpress"],
    site_proprio: ["Site próprio", "site-proprio"],
    sem_site: ["Sem site", "site-none"],
  };
  const [label, cls] = map[status] || ["—", "site-none"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function domainLink(dominio) {
  if (!dominio) return '<span class="muted">—</span>';
  const href = dominio.startsWith("http") ? dominio : `https://${dominio}`;
  const label = dominio.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `<a class="link" href="${href}" target="_blank" rel="noopener">${label}</a>`;
}

function initials(text) {
  return (text || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Aba Associações
// ---------------------------------------------------------------------------

function renderAssocStats(list) {
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhuma associação encontrada com esses filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map(
      (a) => `<tr>
        <td><div class="name-cell"><span class="avatar">${initials(a.sigla)}</span><div><strong>${a.sigla}</strong><div class="muted small">${a.nome || "—"}</div></div></div></td>
        <td>${healthBadge(a.health)}</td>
        <td>${siteAtualSelect(a.sigla, a.siteAtual)}</td>
        <td><input class="site-link" type="text" data-sigla="${a.sigla}" value="${(a.link || "").replace(/"/g, "&quot;")}" placeholder="https://..." /></td>
      </tr>`
    )
    .join("");
}

function applyAssocFilters() {
  const q = document.getElementById("assoc-search").value.trim().toLowerCase();
  const health = document.getElementById("assoc-filter-health").value;
  const site = document.getElementById("assoc-filter-site").value;

  const filtered = ASSOCIACOES.filter((a) => {
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

// ---------------------------------------------------------------------------
// Aba Eventos
// ---------------------------------------------------------------------------

function renderEventoStats(list) {
  const total = list.length;
  const comSite = list.filter((e) => e.temSite).length;
  const semSite = total - comSite;
  const noVercel = list.filter((e) => e.siteStatus === "vercel").length;
  const emAjuste = list.filter((e) => e.siteStatus === "wordpress").length;

  const cards = [
    { value: total, label: "Eventos" },
    { value: comSite, label: "Com site" },
    { value: semSite, label: "Sem site" },
    { value: noVercel, label: "Já no Vercel" },
    { value: emAjuste, label: "Em ajuste (WordPress)" },
  ];

  document.getElementById("evento-stats").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`)
    .join("");
}

function renderEventoTable(list) {
  const tbody = document.getElementById("evento-table-body");
  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum evento encontrado com esses filtros.</td></tr>';
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
        <td class="muted">${e.tipo || "—"}</td>
        <td>${siteStatusBadge(e.siteStatus)}<br/>${domainLink(e.dominio)}</td>
        <td class="muted small">${e.obs || (e.fonte === "planilha" ? "Fonte: planilha" : "—")}</td>
      </tr>`;
    })
    .join("");
}

function applyEventoFilters() {
  const q = document.getElementById("evento-search").value.trim().toLowerCase();
  const tipo = document.getElementById("evento-filter-tipo").value;
  const site = document.getElementById("evento-filter-site").value;

  const filtered = EVENTOS.filter((e) => {
    if (q && !`${e.nome} ${e.shortName || ""} ${e.associacao || ""} ${e.sigla || ""}`.toLowerCase().includes(q)) return false;
    if (tipo && e.tipo !== tipo) return false;
    if (site && e.siteStatus !== site) return false;
    return true;
  });

  renderEventoStats(filtered);
  renderEventoTable(filtered);
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

function populateEventoTipoOptions() {
  const tipos = Array.from(new Set(EVENTOS.map((e) => e.tipo).filter(Boolean))).sort();
  const select = document.getElementById("evento-filter-tipo");
  tipos.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    select.appendChild(opt);
  });
}

function init() {
  initTabs();
  populateEventoTipoOptions();

  applyAssocFilters();
  applyEventoFilters();

  ["assoc-search", "assoc-filter-health", "assoc-filter-site"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyAssocFilters);
  });
  ["evento-search", "evento-filter-tipo", "evento-filter-site"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyEventoFilters);
  });

  document.getElementById("assoc-table-body").addEventListener("change", handleAssocEdit);
}

document.addEventListener("DOMContentLoaded", init);
