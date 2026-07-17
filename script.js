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

// --- Associações/eventos criados manualmente (não vêm do CS Hub) ---
const MANUAL_ASSOC_KEY = "gestaoSitesManualAssoc";
const MANUAL_EVENT_KEY = "gestaoSitesManualEventos";

function loadManualAssoc() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_ASSOC_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveManualAssoc(list) {
  localStorage.setItem(MANUAL_ASSOC_KEY, JSON.stringify(list));
}

function loadManualEventos() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_EVENT_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveManualEventos(list) {
  localStorage.setItem(MANUAL_EVENT_KEY, JSON.stringify(list));
}

function saveAssocField(key, patch) {
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (assoc && assoc.manual) {
    const manual = loadManualAssoc();
    const idx = manual.findIndex((m) => m.key === key);
    if (idx >= 0) {
      manual[idx] = { ...manual[idx], ...patch };
      saveManualAssoc(manual);
    }
  } else {
    saveOverride(key, patch);
  }
}

function saveEventoField(id, patch) {
  const evento = EVENTOS.find((e) => e.id === id);
  if (evento && evento.manual) {
    const manual = loadManualEventos();
    const idx = manual.findIndex((m) => m.id === id);
    if (idx >= 0) {
      manual[idx] = { ...manual[idx], ...patch };
      saveManualEventos(manual);
    }
  } else {
    saveEventOverride(id, patch);
  }
}

function buildAssociacoes() {
  const fromCrm = ASSOCIATIONS_CRM.map((a) => {
    const key = norm(a.sigla);
    const vercel = VERCEL_ASSOC_N[key] || null;
    const nivel = NIVEL_OVERRIDE_N[key] || null;
    const inventoryRows = SITE_INVENTORY_BY_SIGLA[key] || [];
    const institucional = inventoryRows.find((r) => !r.evento) || null;

    const defaultSiteAtual = vercel ? (nivel === "B" || nivel === "C" ? "hotsite" : "personalizado") : "wordpress";
    const defaultLink = (vercel && vercel.dominio) || (institucional && institucional.site) || "";

    const saved = OVERRIDES[a.sigla] || {};

    return {
      key: a.sigla,
      sigla: saved.sigla != null ? saved.sigla : a.sigla,
      nome: saved.nome != null ? saved.nome : a.nome,
      health: a.health,
      mrr: a.mrr,
      siteAtual: saved.siteAtual || defaultSiteAtual,
      link: saved.link != null ? saved.link : defaultLink,
      removed: !!saved.removed,
      remodelacao: !!saved.remodelacao,
      novaVersao: !!saved.novaVersao,
      novaVersaoLink: saved.novaVersaoLink != null ? saved.novaVersaoLink : "",
      manual: false,
    };
  });

  const manual = loadManualAssoc().map((m) => ({ ...m, manual: true }));
  return [...fromCrm, ...manual];
}

function addManualAssoc(sigla, nome) {
  const manual = loadManualAssoc();
  const record = {
    key: `manual-${Date.now()}`,
    sigla,
    nome: nome || null,
    health: null,
    mrr: null,
    siteAtual: "wordpress",
    link: "",
    removed: false,
    remodelacao: false,
    novaVersao: false,
    novaVersaoLink: "",
  };
  manual.push(record);
  saveManualAssoc(manual);
  ASSOCIACOES.push({ ...record, manual: true });
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
    const defaultSiteAtual = vercel ? "personalizado" : "wordpress";
    const saved = EVENT_OVERRIDES[e.id] || {};

    return {
      id: e.id,
      sigla: saved.sigla != null ? saved.sigla : e.sigla,
      associacao: e.associacao,
      nome: saved.nome != null ? saved.nome : e.nome,
      shortName: saved.shortName != null ? saved.shortName : e.shortName,
      edicao: e.edicao,
      ano: e.ano,
      cidade: e.cidade,
      estado: e.estado,
      statusManual: saved.statusManual || defaultStatusManual,
      siteAtual: saved.siteAtual || defaultSiteAtual,
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
      sigla: saved.sigla != null ? saved.sigla : r.sigla,
      associacao: null,
      nome: saved.nome != null ? saved.nome : r.nome,
      shortName: saved.shortName != null ? saved.shortName : null,
      edicao: null,
      ano: null,
      cidade: null,
      estado: null,
      statusManual: saved.statusManual || "realizado",
      siteAtual: saved.siteAtual || "wordpress",
      link: saved.link != null ? saved.link : r.site,
      removed: !!saved.removed,
      manual: false,
    };
  });

  const manual = loadManualEventos().map((m) => ({ ...m, manual: true }));
  return [...fromCrm.map((e) => ({ ...e, manual: false })), ...fromSheetOnly, ...manual];
}

function addManualEvento(nome, sigla) {
  const id = `manual-${Date.now()}`;
  const manual = loadManualEventos();
  const record = {
    id,
    sigla: sigla || null,
    associacao: null,
    nome,
    shortName: null,
    edicao: null,
    ano: null,
    cidade: null,
    estado: null,
    statusManual: "a_acontecer",
    siteAtual: "wordpress",
    link: "",
    removed: false,
  };
  manual.push(record);
  saveManualEventos(manual);
  EVENTOS.push({ ...record, manual: true });
}

const ASSOCIACOES = buildAssociacoes();
const EVENTOS = buildEventos();

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

const SITE_ATUAL_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "personalizado", label: "Personalizado" },
  { value: "hotsite", label: "Hotsite" },
];

function siteAtualSelect(key, current) {
  const opts = SITE_ATUAL_OPTIONS.map(
    (o) => `<option value="${o.value}" ${o.value === current ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="site-select" data-key="${key}">${opts}</select>`;
}

function statusManualSelect(id, current) {
  const opts = STATUS_MANUAL_OPTIONS.map(
    (o) => `<option value="${o.value}" ${o.value === current ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="evento-status-select" data-id="${id}">${opts}</select>`;
}

function eventoSiteAtualSelect(id, current) {
  const opts = SITE_ATUAL_OPTIONS.map(
    (o) => `<option value="${o.value}" ${o.value === current ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="evento-site-select" data-id="${id}">${opts}</select>`;
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
      (a) => `<tr>
        <td><div class="name-cell">
          <span class="avatar">${initials(a.sigla)}</span>
          <div class="name-cell-fields">
            <input class="assoc-sigla" type="text" data-key="${a.key}" value="${(a.sigla || "").replace(/"/g, "&quot;")}" placeholder="Sigla" />
            <input class="assoc-nome" type="text" data-key="${a.key}" value="${(a.nome || "").replace(/"/g, "&quot;")}" placeholder="Nome completo" />
          </div>
        </div></td>
        <td>${siteAtualSelect(a.key, a.siteAtual)}</td>
        <td><input class="site-link" type="text" data-key="${a.key}" value="${(a.link || "").replace(/"/g, "&quot;")}" placeholder="https://..." /></td>
        <td class="remodela-cell"><label class="remodela-check"><input type="checkbox" class="assoc-remodela" data-key="${a.key}" ${a.remodelacao ? "checked" : ""} /><span>Remodelar</span></label></td>
        <td><button class="btn-remove" data-key="${a.key}">Excluir</button></td>
      </tr>`
    )
    .join("");
}

function applyAssocFilters() {
  const q = document.getElementById("assoc-search").value.trim().toLowerCase();
  const health = document.getElementById("assoc-filter-health").value;
  const site = document.getElementById("assoc-filter-site").value;

  const filtered = ASSOCIACOES.filter((a) => {
    if (a.removed) return false;
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
  const key = el.dataset.key;
  if (!key) return;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;

  if (el.classList.contains("site-select")) {
    assoc.siteAtual = el.value;
    saveAssocField(key, { siteAtual: el.value });
    applyAssocFilters();
  } else if (el.classList.contains("site-link")) {
    assoc.link = el.value;
    saveAssocField(key, { link: el.value });
  } else if (el.classList.contains("assoc-sigla")) {
    assoc.sigla = el.value;
    saveAssocField(key, { sigla: el.value });
    applyAssocFilters();
  } else if (el.classList.contains("assoc-nome")) {
    assoc.nome = el.value;
    saveAssocField(key, { nome: el.value });
  } else if (el.classList.contains("assoc-remodela")) {
    assoc.remodelacao = el.checked;
    saveAssocField(key, { remodelacao: el.checked });
    applyRemodela();
  }
}

function handleAssocClick(ev) {
  const btn = ev.target.closest("button[data-key]");
  if (!btn) return;
  const key = btn.dataset.key;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;

  if (btn.classList.contains("btn-remove")) {
    if (!confirm(`Excluir "${assoc.sigla}" da gestão de sites?`)) return;
    assoc.removed = true;
    saveAssocField(key, { removed: true });
  }
  applyAssocFilters();
}

// ---------------------------------------------------------------------------
// Aba Eventos
// ---------------------------------------------------------------------------

function renderEventoStats(allList) {
  const list = allList.filter((e) => !e.removed);
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
    .map(
      (e) => `<tr>
        <td><div class="name-cell-fields">
          <input class="evento-shortname" type="text" data-id="${e.id}" value="${(e.shortName || "").replace(/"/g, "&quot;")}" placeholder="Nome curto" />
          <input class="evento-nome" type="text" data-id="${e.id}" value="${(e.nome || "").replace(/"/g, "&quot;")}" placeholder="Nome completo" />
        </div></td>
        <td>${statusManualSelect(e.id, e.statusManual)}</td>
        <td>${eventoSiteAtualSelect(e.id, e.siteAtual)}</td>
        <td>${eventoLinkInput(e.id, e.link)}</td>
        <td><button class="btn-remove" data-id="${e.id}">Excluir</button></td>
      </tr>`
    )
    .join("");
}

function applyEventoFilters() {
  const q = document.getElementById("evento-search").value.trim().toLowerCase();
  const status = document.getElementById("evento-filter-status").value;
  const siteAtual = document.getElementById("evento-filter-site").value;

  const filtered = EVENTOS.filter((e) => {
    if (e.removed) return false;
    if (q && !`${e.nome} ${e.shortName || ""} ${e.associacao || ""} ${e.sigla || ""}`.toLowerCase().includes(q)) return false;
    if (status && e.statusManual !== status) return false;
    if (siteAtual && e.siteAtual !== siteAtual) return false;
    return true;
  });

  renderEventoStats(filtered);
  renderEventoTable(filtered);
}

function handleEventoClick(ev) {
  const btn = ev.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;
  const evento = EVENTOS.find((e) => e.id === id);
  if (!evento) return;

  if (btn.classList.contains("btn-remove")) {
    if (!confirm(`Excluir "${evento.shortName || evento.nome}" da gestão de sites?`)) return;
    evento.removed = true;
    saveEventoField(id, { removed: true });
  }
  applyEventoFilters();
}

function handleEventoEdit(ev) {
  const el = ev.target;
  const id = el.dataset.id;
  if (!id) return;
  const evento = EVENTOS.find((e) => e.id === id);
  if (!evento) return;

  if (el.classList.contains("evento-status-select")) {
    evento.statusManual = el.value;
    saveEventoField(id, { statusManual: el.value });
    applyEventoFilters();
  } else if (el.classList.contains("evento-site-select")) {
    evento.siteAtual = el.value;
    saveEventoField(id, { siteAtual: el.value });
    applyEventoFilters();
  } else if (el.classList.contains("evento-link")) {
    evento.link = el.value;
    saveEventoField(id, { link: el.value });
  } else if (el.classList.contains("evento-shortname")) {
    evento.shortName = el.value;
    saveEventoField(id, { shortName: el.value });
  } else if (el.classList.contains("evento-nome")) {
    evento.nome = el.value;
    saveEventoField(id, { nome: el.value });
  }
}

// ---------------------------------------------------------------------------
// Aba Sites em remodelação (fila priorizada por MRR)
// ---------------------------------------------------------------------------

function withProto(link) {
  if (!link) return "#";
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function displayLink(link) {
  return (link || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function getRemodelaQueue() {
  return ASSOCIACOES.filter((a) => a.remodelacao && !a.removed).sort(
    (x, y) => (y.mrr || 0) - (x.mrr || 0)
  );
}

function prioridadeBadge(rank) {
  let cls = "prio-low";
  if (rank <= 3) cls = "prio-high";
  else if (rank <= 10) cls = "prio-mid";
  return `<span class="prio-badge ${cls}">${rank}º</span>`;
}

function renderRemodelaTable(ranked) {
  const tbody = document.getElementById("remodela-table-body");
  if (ranked.length === 0) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="8">Nenhum site na fila. Marque associações em <strong>Remodelar</strong> na aba Associações, ou use <strong>+ Adicionar à fila</strong> acima.</td></tr>';
    return;
  }
  tbody.innerHTML = ranked
    .map(
      (a) => `<tr class="${a.novaVersao ? "rmd-done" : ""}">
        <td>${prioridadeBadge(a._rank)}</td>
        <td><div class="name-cell"><span class="avatar">${initials(a.sigla)}</span><div class="rmd-name">${a.nome || "—"}</div></div></td>
        <td class="rmd-sigla">${a.sigla || "—"}</td>
        <td class="rmd-mrr">${a.mrr != null ? currency.format(a.mrr) : "—"}</td>
        <td>${a.link ? `<a class="rmd-link" href="${withProto(a.link)}" target="_blank" rel="noopener">${displayLink(a.link)}</a>` : '<span class="muted">—</span>'}</td>
        <td class="remodela-cell"><label class="remodela-check"><input type="checkbox" class="rmd-nv-check" data-key="${a.key}" ${a.novaVersao ? "checked" : ""} /><span>Feita</span></label></td>
        <td><input class="rmd-nv-link" type="text" data-key="${a.key}" value="${(a.novaVersaoLink || "").replace(/"/g, "&quot;")}" placeholder="https://..." /></td>
        <td><button class="btn-remove" data-key="${a.key}">Remover</button></td>
      </tr>`
    )
    .join("");
}

function applyRemodela() {
  const searchEl = document.getElementById("remodela-search");
  if (!searchEl) return;
  const q = searchEl.value.trim().toLowerCase();
  const nvFilter = document.getElementById("remodela-filter-nv").value;

  const queue = getRemodelaQueue();
  // Prioridade (nº) fixa por MRR.
  const ranked = queue.map((a, i) => ({ ...a, _rank: i + 1 }));
  // Feitos vão para o final, mantendo a prioridade (sort estável preserva a ordem por MRR dentro de cada grupo).
  const ordered = [...ranked].sort((a, b) => (a.novaVersao ? 1 : 0) - (b.novaVersao ? 1 : 0));

  const filtered = ordered.filter((a) => {
    if (q && !`${a.sigla || ""} ${a.nome || ""}`.toLowerCase().includes(q)) return false;
    if (nvFilter === "feita" && !a.novaVersao) return false;
    if (nvFilter === "pendente" && a.novaVersao) return false;
    return true;
  });

  renderRemodelaTable(filtered);
}

function handleRemodelaClick(ev) {
  const btn = ev.target.closest("button[data-key]");
  if (!btn) return;
  const key = btn.dataset.key;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;
  assoc.remodelacao = false;
  saveAssocField(key, { remodelacao: false });
  applyRemodela();
  applyAssocFilters();
}

function handleRemodelaEdit(ev) {
  const el = ev.target;
  const key = el.dataset.key;
  if (!key) return;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;

  if (el.classList.contains("rmd-nv-check")) {
    assoc.novaVersao = el.checked;
    saveAssocField(key, { novaVersao: el.checked });
  } else if (el.classList.contains("rmd-nv-link")) {
    assoc.novaVersaoLink = el.value;
    saveAssocField(key, { novaVersaoLink: el.value });
  }
}

function handleAddRemodela() {
  const sigla = document.getElementById("new-remodela-sigla").value.trim();
  const nome = document.getElementById("new-remodela-nome").value.trim();

  if (!sigla) {
    alert("Informe a sigla da associação.");
    return false;
  }

  const existing = ASSOCIACOES.find((a) => norm(a.sigla) === norm(sigla));
  if (existing) {
    existing.removed = false;
    existing.remodelacao = true;
    const patch = { removed: false, remodelacao: true };
    if (nome) {
      existing.nome = nome;
      patch.nome = nome;
    }
    saveAssocField(existing.key, patch);
  } else {
    addManualAssoc(sigla, nome);
    const a = ASSOCIACOES[ASSOCIACOES.length - 1];
    a.remodelacao = true;
    saveAssocField(a.key, { remodelacao: true });
  }

  applyRemodela();
  applyAssocFilters();
  return true;
}

// ---------------------------------------------------------------------------
// Formulários de "adicionar"
// ---------------------------------------------------------------------------

function initAddForm(opts) {
  const toggleBtn = document.getElementById(opts.toggleId);
  const form = document.getElementById(opts.formId);
  const cancelBtn = document.getElementById(opts.cancelId);
  const submitBtn = document.getElementById(opts.submitId);

  toggleBtn.addEventListener("click", () => {
    form.classList.toggle("open");
    if (form.classList.contains("open")) document.getElementById(opts.firstFieldId).focus();
  });

  cancelBtn.addEventListener("click", () => {
    form.classList.remove("open");
    opts.fieldIds.forEach((id) => (document.getElementById(id).value = ""));
  });

  submitBtn.addEventListener("click", () => {
    const ok = opts.onSubmit();
    if (ok) {
      opts.fieldIds.forEach((id) => (document.getElementById(id).value = ""));
      form.classList.remove("open");
    }
  });
}

function handleAddAssoc() {
  const siglaInput = document.getElementById("new-assoc-sigla");
  const nomeInput = document.getElementById("new-assoc-nome");
  const sigla = siglaInput.value.trim();
  const nome = nomeInput.value.trim();

  if (!sigla) {
    alert("Informe a sigla da associação.");
    return false;
  }

  const existing = ASSOCIACOES.find((a) => norm(a.sigla) === norm(sigla));
  if (existing) {
    if (!existing.removed) {
      alert(`Já existe uma associação com a sigla "${sigla}".`);
      return false;
    }
    // Recriar uma associação excluída apenas a restaura (não duplica).
    existing.removed = false;
    if (nome) existing.nome = nome;
    saveAssocField(existing.key, nome ? { removed: false, nome } : { removed: false });
    applyAssocFilters();
    return true;
  }

  addManualAssoc(sigla, nome);
  applyAssocFilters();
  return true;
}

function handleAddEvento() {
  const nomeInput = document.getElementById("new-evento-nome");
  const siglaInput = document.getElementById("new-evento-sigla");
  const nome = nomeInput.value.trim();
  const sigla = siglaInput.value.trim();

  if (!nome) {
    alert("Informe o nome do evento.");
    return false;
  }

  addManualEvento(nome, sigla);
  applyEventoFilters();
  return true;
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
      if (btn.dataset.tab === "remodela") applyRemodela();
    });
  });
}

function init() {
  initTabs();

  applyAssocFilters();
  applyEventoFilters();
  applyRemodela();

  ["assoc-search", "assoc-filter-health", "assoc-filter-site"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyAssocFilters);
  });
  ["evento-search", "evento-filter-status", "evento-filter-site"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyEventoFilters);
  });
  ["remodela-search", "remodela-filter-nv"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyRemodela);
  });

  document.getElementById("assoc-table-body").addEventListener("change", handleAssocEdit);
  document.getElementById("assoc-table-body").addEventListener("click", handleAssocClick);
  document.getElementById("evento-table-body").addEventListener("change", handleEventoEdit);
  document.getElementById("evento-table-body").addEventListener("click", handleEventoClick);
  document.getElementById("remodela-table-body").addEventListener("click", handleRemodelaClick);
  document.getElementById("remodela-table-body").addEventListener("change", handleRemodelaEdit);

  initAddForm({
    toggleId: "assoc-add-toggle",
    formId: "assoc-add-form",
    cancelId: "assoc-add-cancel",
    submitId: "assoc-add-submit",
    firstFieldId: "new-assoc-sigla",
    fieldIds: ["new-assoc-sigla", "new-assoc-nome"],
    onSubmit: handleAddAssoc,
  });

  initAddForm({
    toggleId: "evento-add-toggle",
    formId: "evento-add-form",
    cancelId: "evento-add-cancel",
    submitId: "evento-add-submit",
    firstFieldId: "new-evento-nome",
    fieldIds: ["new-evento-nome", "new-evento-sigla"],
    onSubmit: handleAddEvento,
  });

  initAddForm({
    toggleId: "remodela-add-toggle",
    formId: "remodela-add-form",
    cancelId: "remodela-add-cancel",
    submitId: "remodela-add-submit",
    firstFieldId: "new-remodela-sigla",
    fieldIds: ["new-remodela-sigla", "new-remodela-nome"],
    onSubmit: handleAddRemodela,
  });
}

document.addEventListener("DOMContentLoaded", init);
