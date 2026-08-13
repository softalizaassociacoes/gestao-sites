// ============================================================================
// Gestão de Sites — merge das fontes brutas (data.js) + interface do painel.
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

// ---------------------------------------------------------------------------
// Persistência (localStorage)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

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
      mrr: saved.mrr != null ? saved.mrr : a.mrr,
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

const SITE_ATUAL_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "personalizado", label: "Personalizado" },
  { value: "hotsite", label: "Hotsite" },
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
// Estado da interface
// ---------------------------------------------------------------------------

const TAB_KEY = "gestaoSitesTab";
const THEME_KEY = "gestaoSitesTheme";

const STATE = {
  tab: "assoc",
  assoc: { q: "", health: "", site: "", sort: { col: "sigla", dir: "asc" } },
  evento: { q: "", status: "", site: "", sort: { col: "nome", dir: "asc" } },
  remodela: { q: "", nv: "" },
};

// última lista renderizada de cada aba — usada na exportação CSV
const VIEW = { assoc: [], evento: [], remodela: [] };

const PAGES = {
  assoc: {
    title: "Associações",
    sub: "Inventário dos sites institucionais e o estágio de cada migração.",
    add: "Nova associação",
  },
  evento: {
    title: "Sites de eventos",
    sub: "Congressos e eventos, com site próprio ou ainda no WordPress padrão.",
    add: "Novo evento",
  },
  remodela: {
    title: "Fila de remodelação",
    sub: "Ordenada por MRR — quem paga mais entra primeiro na régua.",
    add: "Adicionar à fila",
  },
};

// ---------------------------------------------------------------------------
// Utilidades de apresentação
// ---------------------------------------------------------------------------

function esc(v) {
  return (v == null ? "" : String(v))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function withProto(link) {
  if (!link) return "";
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function displayLink(link) {
  return (link || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

const HEALTH_META = {
  saudavel: { label: "Saudável", cls: "b-ok" },
  atencao: { label: "Atenção", cls: "b-warn" },
  risco: { label: "Risco", cls: "b-risk" },
  cancelado: { label: "Cancelado", cls: "b-off" },
};

const HEALTH_ORDER = { risco: 0, atencao: 1, saudavel: 2, cancelado: 3 };
const STATUS_ORDER = { acontecendo: 0, a_acontecer: 1, realizado: 2 };

function healthBadge(health) {
  const meta = HEALTH_META[health];
  if (!meta) return '<span class="badge b-none">Sem dado</span>';
  return `<span class="badge ${meta.cls}"><i></i>${meta.label}</span>`;
}

function labelOf(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.label : value || "—";
}

const ICON = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z"/></svg>',
};

const AV_HUES = [258, 224, 196, 162, 130, 42, 16, 338];

function avatarHue(text) {
  const s = text || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_HUES[h % AV_HUES.length];
}

function initials(text) {
  return (text || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

function avatar(sigla) {
  return `<span class="avatar" style="--av:${avatarHue(sigla)}" aria-hidden="true">${esc(initials(sigla))}</span>`;
}

function selectField(cls, dataAttr, value, options) {
  const opts = options
    .map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)
    .join("");
  return `<select class="f ${cls}" ${dataAttr}>${opts}</select>`;
}

function linkCell(cls, dataAttr, value) {
  const has = !!(value || "").trim();
  return `<div class="linkcell">
    <input class="f f-mono ${cls}" type="text" ${dataAttr} value="${esc(value)}" placeholder="https://…" spellcheck="false" />
    <button class="mini" type="button" data-act="open" ${dataAttr} ${has ? "" : "disabled"} title="Abrir site" aria-label="Abrir site">${ICON.open}</button>
    <button class="mini" type="button" data-act="copy" ${dataAttr} ${has ? "" : "disabled"} title="Copiar endereço" aria-label="Copiar endereço">${ICON.copy}</button>
  </div>`;
}

function switchField(cls, dataAttr, checked, label) {
  return `<label class="switch">
    <input type="checkbox" class="${cls}" ${dataAttr} ${checked ? "checked" : ""} />
    <span class="track"></span>
    ${label ? `<span class="switch-label">${label}</span>` : ""}
  </label>`;
}

function emptyRow(cols, title, msg) {
  return `<tr class="empty-row"><td colspan="${cols}">
    <div class="empty">
      <div class="empty-icon">${ICON.inbox}</div>
      <h3>${title}</h3>
      <p>${msg}</p>
    </div>
  </td></tr>`;
}

function metricsHtml(items) {
  return items
    .map(
      (m) => `<div class="metric">
        <div class="metric-top">${m.dot ? `<span class="metric-dot ${m.dot}"></span>` : ""}${m.label}</div>
        <div class="metric-value${m.money ? " is-money" : ""}">${m.value}</div>
        ${m.note ? `<div class="metric-note">${m.note}</div>` : ""}
      </div>`
    )
    .join("");
}

function compositionHtml(title, segs) {
  const total = segs.reduce((s, x) => s + x.count, 0);
  const base = total || 1;
  const bar = segs
    .filter((s) => s.count > 0)
    .map((s) => `<div class="comp-seg ${s.cls}" style="flex:${s.count}" title="${s.label}: ${s.count}"></div>`)
    .join("");
  const legend = segs
    .map(
      (s) =>
        `<span class="comp-key"><i class="${s.cls}"></i>${s.label} <b>${s.count}</b><span class="muted">${Math.round(
          (s.count / base) * 100
        )}%</span></span>`
    )
    .join("");
  return `<div class="composition">
    <div class="comp-head"><span class="comp-title">${title}</span><span class="comp-total">${total}</span></div>
    <div class="comp-bar">${bar}</div>
    <div class="comp-legend">${legend}</div>
  </div>`;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ---------------------------------------------------------------------------
// Toasts e diálogos
// ---------------------------------------------------------------------------

function toast(message, kind) {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast${kind ? ` t-${kind}` : ""}`;
  el.innerHTML = `${kind === "warn" ? ICON.alert : kind === "info" ? ICON.info : ICON.check}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

let savedTimer = null;
function toastSaved() {
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => toast("Alterações salvas"), 500);
}

function confirmDialog(title, message, okLabel) {
  const dlg = document.getElementById("dlg-confirm");
  document.getElementById("dlg-confirm-title").textContent = title;
  document.getElementById("dlg-confirm-sub").textContent = message;
  const ok = document.getElementById("dlg-confirm-ok");
  ok.textContent = okLabel || "Excluir";

  return new Promise((resolve) => {
    function done(value) {
      ok.removeEventListener("click", onOk);
      dlg.removeEventListener("close", onClose);
      resolve(value);
      if (dlg.open) dlg.close();
    }
    function onOk() {
      done(true);
    }
    function onClose() {
      done(false);
    }
    ok.addEventListener("click", onOk);
    dlg.addEventListener("close", onClose);
    dlg.showModal();
  });
}

const ADD_FORMS = {
  assoc: {
    title: "Nova associação",
    sub: "Entra no inventário e fica salva neste navegador.",
    fields: [
      { name: "sigla", label: "Sigla", ph: "ex.: ABC", required: true },
      { name: "nome", label: "Nome completo", ph: "Opcional", hint: "Pode preencher depois direto na tabela." },
    ],
    submit: (v) => {
      const existing = ASSOCIACOES.find((a) => norm(a.sigla) === norm(v.sigla));
      if (existing && !existing.removed) return { error: `Já existe uma associação com a sigla "${v.sigla}".` };
      if (existing) {
        existing.removed = false;
        if (v.nome) existing.nome = v.nome;
        saveAssocField(existing.key, v.nome ? { removed: false, nome: v.nome } : { removed: false });
      } else {
        addManualAssoc(v.sigla, v.nome);
      }
      renderAssoc();
      return { message: `"${v.sigla}" adicionada.` };
    },
  },
  evento: {
    title: "Novo evento",
    sub: "Para eventos que ainda não vieram do CS Hub.",
    fields: [
      { name: "nome", label: "Nome do evento", ph: "ex.: Congresso Brasileiro de…", required: true },
      { name: "sigla", label: "Sigla", ph: "Opcional" },
    ],
    submit: (v) => {
      addManualEvento(v.nome, v.sigla);
      renderEvento();
      return { message: "Evento adicionado." };
    },
  },
  remodela: {
    title: "Adicionar à fila",
    sub: "Se a sigla já existir no inventário, ela é reaproveitada.",
    fields: [
      { name: "sigla", label: "Sigla", ph: "ex.: ABC", required: true },
      { name: "nome", label: "Nome completo", ph: "Opcional" },
    ],
    submit: (v) => {
      const existing = ASSOCIACOES.find((a) => norm(a.sigla) === norm(v.sigla));
      if (existing) {
        existing.removed = false;
        existing.remodelacao = true;
        const patch = { removed: false, remodelacao: true };
        if (v.nome) {
          existing.nome = v.nome;
          patch.nome = v.nome;
        }
        saveAssocField(existing.key, patch);
      } else {
        addManualAssoc(v.sigla, v.nome);
        const a = ASSOCIACOES[ASSOCIACOES.length - 1];
        a.remodelacao = true;
        saveAssocField(a.key, { remodelacao: true });
      }
      renderRemodela();
      renderAssoc();
      return { message: `"${v.sigla}" entrou na fila.` };
    },
  },
};

function openAddDialog() {
  const cfg = ADD_FORMS[STATE.tab];
  const dlg = document.getElementById("dlg-add");
  const body = document.getElementById("dlg-add-body");

  document.getElementById("dlg-add-title").textContent = cfg.title;
  document.getElementById("dlg-add-sub").textContent = cfg.sub;
  body.innerHTML =
    cfg.fields
      .map(
        (f) => `<div class="field">
          <label for="add-${f.name}">${f.label}</label>
          <input type="text" id="add-${f.name}" name="${f.name}" placeholder="${esc(f.ph || "")}" autocomplete="off" />
          ${f.hint ? `<div class="hint">${f.hint}</div>` : ""}
        </div>`
      )
      .join("") + '<div class="modal-error" id="dlg-add-error"></div>';

  dlg.showModal();
  const first = body.querySelector("input");
  if (first) first.focus();
}

function submitAddDialog() {
  const cfg = ADD_FORMS[STATE.tab];
  const dlg = document.getElementById("dlg-add");
  const errorBox = document.getElementById("dlg-add-error");
  const values = {};
  cfg.fields.forEach((f) => {
    values[f.name] = (document.getElementById(`add-${f.name}`).value || "").trim();
  });

  const missing = cfg.fields.find((f) => f.required && !values[f.name]);
  if (missing) {
    errorBox.textContent = `Preencha o campo "${missing.label}".`;
    errorBox.classList.add("on");
    document.getElementById(`add-${missing.name}`).focus();
    return;
  }

  const result = cfg.submit(values) || {};
  if (result.error) {
    errorBox.textContent = result.error;
    errorBox.classList.add("on");
    return;
  }
  errorBox.classList.remove("on");
  dlg.close();
  renderNavCounts();
  toast(result.message || "Adicionado.");
}

// ---------------------------------------------------------------------------
// Aba: Associações
// ---------------------------------------------------------------------------

function sortList(list, sort, type) {
  const dir = sort.dir === "desc" ? -1 : 1;
  const col = sort.col;
  return [...list].sort((a, b) => {
    let x;
    let y;
    if (col === "mrr") {
      x = a.mrr == null ? -1 : a.mrr;
      y = b.mrr == null ? -1 : b.mrr;
    } else if (col === "health") {
      x = HEALTH_ORDER[a.health] == null ? 9 : HEALTH_ORDER[a.health];
      y = HEALTH_ORDER[b.health] == null ? 9 : HEALTH_ORDER[b.health];
    } else if (col === "statusManual") {
      x = STATUS_ORDER[a.statusManual] == null ? 9 : STATUS_ORDER[a.statusManual];
      y = STATUS_ORDER[b.statusManual] == null ? 9 : STATUS_ORDER[b.statusManual];
    } else if (col === "nome" && type === "evento") {
      x = (a.shortName || a.nome || "").toLowerCase();
      y = (b.shortName || b.nome || "").toLowerCase();
    } else {
      x = (a[col] || "").toString().toLowerCase();
      y = (b[col] || "").toString().toLowerCase();
    }
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  });
}

function renderAssocMetrics(list) {
  const total = list.length;
  const saudavel = list.filter((a) => a.health === "saudavel").length;
  const atencao = list.filter((a) => a.health === "atencao").length;
  const risco = list.filter((a) => a.health === "risco").length;
  const wordpress = list.filter((a) => a.siteAtual === "wordpress").length;
  const personalizado = list.filter((a) => a.siteAtual === "personalizado").length;
  const hotsite = list.filter((a) => a.siteAtual === "hotsite").length;
  const cancelado = list.filter((a) => a.health === "cancelado").length;
  const semDado = total - saudavel - atencao - risco - cancelado;
  const migrados = personalizado + hotsite;
  const mrr = list.reduce((s, a) => s + (a.mrr || 0), 0);
  const naFila = list.filter((a) => a.remodelacao).length;

  document.getElementById("assoc-metrics").innerHTML = metricsHtml([
    { label: "Associações", value: total, note: `${semDado} sem dado de saúde` },
    { label: "MRR somado", value: currency.format(mrr), money: true, note: "Receita recorrente do recorte" },
    { label: "Fora do WordPress", value: migrados, dot: "d-accent", note: `${pct(migrados, total)}% já migrado` },
    { label: "Na fila", value: naFila, dot: "d-warn", note: "Marcadas para remodelar" },
  ]);

  document.getElementById("assoc-composition").innerHTML =
    compositionHtml("Saúde da carteira", [
      { cls: "s-ok", label: "Saudável", count: saudavel },
      { cls: "s-warn", label: "Atenção", count: atencao },
      { cls: "s-risk", label: "Risco", count: risco },
      { cls: "s-off", label: "Cancelado", count: cancelado },
    ]) +
    compositionHtml("Tipo de site", [
      { cls: "s-off", label: "WordPress", count: wordpress },
      { cls: "s-accent", label: "Personalizado", count: personalizado },
      { cls: "s-ok", label: "Hotsite", count: hotsite },
    ]);
}

function renderAssocTable(list) {
  const tbody = document.getElementById("assoc-table-body");
  if (list.length === 0) {
    tbody.innerHTML = emptyRow(
      7,
      "Nada por aqui",
      "Nenhuma associação bate com esses filtros. Limpe a busca ou escolha outro recorte."
    );
    return;
  }

  tbody.innerHTML = list
    .map((a) => {
      const k = `data-key="${esc(a.key)}"`;
      return `<tr>
        <td class="ident-td" data-l="Associação">
          <div class="ident">
            ${avatar(a.sigla)}
            <div class="ident-fields">
              <input class="f f-strong assoc-sigla" type="text" ${k} value="${esc(a.sigla)}" placeholder="Sigla" />
              <input class="f f-sub assoc-nome" type="text" ${k} value="${esc(a.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td data-l="Saúde">${healthBadge(a.health)}</td>
        <td class="num" data-l="MRR">${a.mrr != null ? currency.format(a.mrr) : '<span class="muted">—</span>'}</td>
        <td data-l="Site atual">${selectField("site-select", k, a.siteAtual, SITE_ATUAL_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("site-link", k, a.link)}</td>
        <td class="center" data-l="Remodelar">${switchField("assoc-remodela", k, a.remodelacao, "")}</td>
        <td class="actions" data-l="">
          <button class="mini danger" type="button" data-act="del" ${k} title="Excluir" aria-label="Excluir">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderAssoc() {
  const s = STATE.assoc;
  const filtered = ASSOCIACOES.filter((a) => {
    if (a.removed) return false;
    if (s.q && !`${a.sigla} ${a.nome || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.health && a.health !== s.health) return false;
    if (s.site && a.siteAtual !== s.site) return false;
    return true;
  });

  const sorted = sortList(filtered, s.sort, "assoc");
  VIEW.assoc = sorted;

  renderAssocMetrics(sorted);
  renderAssocTable(sorted);

  const totalAtivas = ASSOCIACOES.filter((a) => !a.removed).length;
  document.getElementById("assoc-count").textContent =
    sorted.length === totalAtivas ? `${totalAtivas} no total` : `${sorted.length} de ${totalAtivas}`;
  renderNavCounts();
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
    renderAssoc();
  } else if (el.classList.contains("site-link")) {
    assoc.link = el.value;
    saveAssocField(key, { link: el.value });
    refreshLinkButtons(el);
  } else if (el.classList.contains("assoc-sigla")) {
    assoc.sigla = el.value;
    saveAssocField(key, { sigla: el.value });
    renderAssoc();
  } else if (el.classList.contains("assoc-nome")) {
    assoc.nome = el.value;
    saveAssocField(key, { nome: el.value });
  } else if (el.classList.contains("assoc-remodela")) {
    assoc.remodelacao = el.checked;
    saveAssocField(key, { remodelacao: el.checked });
    renderRemodela();
    renderNavCounts();
    toast(el.checked ? `"${assoc.sigla}" entrou na fila de remodelação.` : `"${assoc.sigla}" saiu da fila.`, "info");
    return;
  }
  toastSaved();
}

async function handleAssocClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const key = btn.dataset.key;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;

  if (btn.dataset.act === "open") return openLink(assoc.link);
  if (btn.dataset.act === "copy") return copyLink(assoc.link);

  if (btn.dataset.act === "del") {
    const ok = await confirmDialog(
      "Excluir associação",
      `"${assoc.sigla}" sai do painel. Você pode trazê-la de volta adicionando a mesma sigla novamente.`,
      "Excluir"
    );
    if (!ok) return;
    assoc.removed = true;
    saveAssocField(key, { removed: true });
    renderAssoc();
    renderRemodela();
    toast(`"${assoc.sigla}" excluída.`);
  }
}

// ---------------------------------------------------------------------------
// Aba: Eventos
// ---------------------------------------------------------------------------

function renderEventoMetrics(list) {
  const total = list.length;
  const aAcontecer = list.filter((e) => e.statusManual === "a_acontecer").length;
  const acontecendo = list.filter((e) => e.statusManual === "acontecendo").length;
  const realizado = list.filter((e) => e.statusManual === "realizado").length;
  const comSite = list.filter((e) => e.link).length;
  const wordpress = list.filter((e) => e.siteAtual === "wordpress").length;
  const personalizado = list.filter((e) => e.siteAtual === "personalizado").length;
  const hotsite = list.filter((e) => e.siteAtual === "hotsite").length;

  document.getElementById("evento-metrics").innerHTML = metricsHtml([
    { label: "Eventos", value: total, note: `${total - comSite} sem endereço cadastrado` },
    { label: "Com site no ar", value: comSite, dot: "d-ok", note: `${pct(comSite, total)}% do recorte` },
    { label: "Fora do WordPress", value: personalizado + hotsite, dot: "d-accent", note: `${pct(personalizado + hotsite, total)}% já migrado` },
    { label: "Ainda por acontecer", value: aAcontecer + acontecendo, dot: "d-warn", note: "Janela aberta para migrar" },
  ]);

  document.getElementById("evento-composition").innerHTML =
    compositionHtml("Status", [
      { cls: "s-ok", label: "Acontecendo", count: acontecendo },
      { cls: "s-warn", label: "A acontecer", count: aAcontecer },
      { cls: "s-off", label: "Realizado", count: realizado },
    ]) +
    compositionHtml("Tipo de site", [
      { cls: "s-off", label: "WordPress", count: wordpress },
      { cls: "s-accent", label: "Personalizado", count: personalizado },
      { cls: "s-ok", label: "Hotsite", count: hotsite },
    ]);
}

function renderEventoTable(list) {
  const tbody = document.getElementById("evento-table-body");
  if (list.length === 0) {
    tbody.innerHTML = emptyRow(5, "Nenhum evento", "Nenhum evento bate com esses filtros. Ajuste a busca ou o status.");
    return;
  }

  tbody.innerHTML = list
    .map((e) => {
      const k = `data-id="${esc(e.id)}"`;
      return `<tr>
        <td class="ident-td" data-l="Evento">
          <div class="ident">
            ${avatar(e.sigla || e.shortName || e.nome)}
            <div class="ident-fields">
              <input class="f f-strong evento-shortname" type="text" ${k} value="${esc(e.shortName)}" placeholder="Nome curto" />
              <input class="f f-sub evento-nome" type="text" ${k} value="${esc(e.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td data-l="Status">${selectField("evento-status-select", k, e.statusManual, STATUS_MANUAL_OPTIONS)}</td>
        <td data-l="Tipo de site">${selectField("evento-site-select", k, e.siteAtual, SITE_ATUAL_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("evento-link", k, e.link)}</td>
        <td class="actions" data-l="">
          <button class="mini danger" type="button" data-act="del" ${k} title="Excluir" aria-label="Excluir">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderEvento() {
  const s = STATE.evento;
  const filtered = EVENTOS.filter((e) => {
    if (e.removed) return false;
    if (s.q && !`${e.nome} ${e.shortName || ""} ${e.associacao || ""} ${e.sigla || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.status && e.statusManual !== s.status) return false;
    if (s.site && e.siteAtual !== s.site) return false;
    return true;
  });

  const sorted = sortList(filtered, s.sort, "evento");
  VIEW.evento = sorted;

  renderEventoMetrics(sorted);
  renderEventoTable(sorted);

  const totalAtivos = EVENTOS.filter((e) => !e.removed).length;
  document.getElementById("evento-count").textContent =
    sorted.length === totalAtivos ? `${totalAtivos} no total` : `${sorted.length} de ${totalAtivos}`;
  renderNavCounts();
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
    renderEvento();
  } else if (el.classList.contains("evento-site-select")) {
    evento.siteAtual = el.value;
    saveEventoField(id, { siteAtual: el.value });
    renderEvento();
  } else if (el.classList.contains("evento-link")) {
    evento.link = el.value;
    saveEventoField(id, { link: el.value });
    refreshLinkButtons(el);
  } else if (el.classList.contains("evento-shortname")) {
    evento.shortName = el.value;
    saveEventoField(id, { shortName: el.value });
  } else if (el.classList.contains("evento-nome")) {
    evento.nome = el.value;
    saveEventoField(id, { nome: el.value });
  }
  toastSaved();
}

async function handleEventoClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const evento = EVENTOS.find((e) => e.id === id);
  if (!evento) return;

  if (btn.dataset.act === "open") return openLink(evento.link);
  if (btn.dataset.act === "copy") return copyLink(evento.link);

  if (btn.dataset.act === "del") {
    const nome = evento.shortName || evento.nome;
    const ok = await confirmDialog("Excluir evento", `"${nome}" sai do painel de sites de eventos.`, "Excluir");
    if (!ok) return;
    evento.removed = true;
    saveEventoField(id, { removed: true });
    renderEvento();
    toast(`"${nome}" excluído.`);
  }
}

// ---------------------------------------------------------------------------
// Aba: Fila de remodelação
// ---------------------------------------------------------------------------

function getRemodelaQueue() {
  return ASSOCIACOES.filter((a) => a.remodelacao && !a.removed).sort((x, y) => (y.mrr || 0) - (x.mrr || 0));
}

function rankBadge(rank) {
  let cls = "";
  if (rank <= 3) cls = " r-top";
  else if (rank <= 10) cls = " r-mid";
  return `<span class="rank${cls}">${rank}º</span>`;
}

function renderRemodelaMetrics(queue) {
  const total = queue.length;
  const feitas = queue.filter((a) => a.novaVersao).length;
  const mrr = queue.reduce((s, a) => s + (a.mrr || 0), 0);
  const mrrPendente = queue.filter((a) => !a.novaVersao).reduce((s, a) => s + (a.mrr || 0), 0);

  document.getElementById("remodela-metrics").innerHTML = metricsHtml([
    { label: "Na fila", value: total, dot: "d-accent", note: "Marcadas para remodelar" },
    { label: "Novas versões prontas", value: feitas, dot: "d-ok", note: `${pct(feitas, total)}% concluído` },
    { label: "Pendentes", value: total - feitas, dot: "d-warn", note: "Ainda no modelo antigo" },
    { label: "MRR represado", value: currency.format(mrrPendente), money: true, note: `de ${currency.format(mrr)} na fila` },
  ]);

  const prog = document.getElementById("remodela-progress");
  prog.innerHTML = total
    ? `<div class="progress-track"><div class="progress-fill" style="width:${pct(feitas, total)}%"></div></div>
       <span>${feitas}/${total} concluídas</span>`
    : "";
}

function renderRemodelaTable(list) {
  const tbody = document.getElementById("remodela-table-body");
  if (list.length === 0) {
    tbody.innerHTML = emptyRow(
      7,
      "Fila vazia",
      "Ative a chave <strong>Remodelar</strong> em Associações, ou use o botão “Adicionar à fila” aqui em cima."
    );
    return;
  }

  tbody.innerHTML = list
    .map((a) => {
      const k = `data-key="${esc(a.key)}"`;
      return `<tr class="${a.novaVersao ? "done" : ""}">
        <td data-l="Prioridade">${rankBadge(a._rank)}</td>
        <td class="ident-td" data-l="Associação">
          <div class="ident">
            ${avatar(a.sigla)}
            <div class="ident-fields">
              <input class="f f-strong rmd-sigla-inp" type="text" ${k} value="${esc(a.sigla)}" placeholder="Sigla" />
              <input class="f f-sub rmd-nome" type="text" ${k} value="${esc(a.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td class="num" data-l="MRR"><input class="f f-num rmd-mrr-inp" type="text" inputmode="numeric" ${k} value="${a.mrr != null ? a.mrr : ""}" placeholder="0" /></td>
        <td data-l="Site atual">${linkCell("rmd-site-link", k, a.link)}</td>
        <td class="center" data-l="Nova versão">${switchField("rmd-nv-check", k, a.novaVersao, a.novaVersao ? "Feita" : "Pendente")}</td>
        <td data-l="Endereço novo">${linkCell("rmd-nv-link", k, a.novaVersaoLink)}</td>
        <td class="actions" data-l="">
          <button class="mini danger" type="button" data-act="unqueue" ${k} title="Tirar da fila" aria-label="Tirar da fila">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderRemodela() {
  const s = STATE.remodela;
  const queue = getRemodelaQueue();

  // prioridade fixa por MRR; feitas vão para o fim mantendo a ordem
  const ranked = queue.map((a, i) => ({ ...a, _rank: i + 1 }));
  const ordered = [...ranked].sort((a, b) => (a.novaVersao ? 1 : 0) - (b.novaVersao ? 1 : 0));

  const filtered = ordered.filter((a) => {
    if (s.q && !`${a.sigla || ""} ${a.nome || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.nv === "feita" && !a.novaVersao) return false;
    if (s.nv === "pendente" && a.novaVersao) return false;
    return true;
  });

  VIEW.remodela = filtered;

  renderRemodelaMetrics(queue);
  renderRemodelaTable(filtered);

  document.getElementById("remodela-count").textContent =
    filtered.length === queue.length ? `${queue.length} na fila` : `${filtered.length} de ${queue.length}`;
  renderNavCounts();
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
    renderRemodela();
    toast(el.checked ? `Nova versão de "${assoc.sigla}" marcada como feita.` : `"${assoc.sigla}" voltou para pendente.`, "info");
    return;
  }
  if (el.classList.contains("rmd-nv-link")) {
    assoc.novaVersaoLink = el.value;
    saveAssocField(key, { novaVersaoLink: el.value });
    refreshLinkButtons(el);
  } else if (el.classList.contains("rmd-nome")) {
    assoc.nome = el.value;
    saveAssocField(key, { nome: el.value });
    renderAssoc();
  } else if (el.classList.contains("rmd-sigla-inp")) {
    assoc.sigla = el.value;
    saveAssocField(key, { sigla: el.value });
    renderRemodela();
    renderAssoc();
  } else if (el.classList.contains("rmd-mrr-inp")) {
    const digits = el.value.replace(/[^\d]/g, "");
    const val = digits ? Number(digits) : null;
    assoc.mrr = val;
    saveAssocField(key, { mrr: val });
    renderRemodela();
    renderAssoc();
  } else if (el.classList.contains("rmd-site-link")) {
    assoc.link = el.value;
    saveAssocField(key, { link: el.value });
    refreshLinkButtons(el);
    renderAssoc();
  }
  toastSaved();
}

async function handleRemodelaClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const key = btn.dataset.key;
  const assoc = ASSOCIACOES.find((a) => a.key === key);
  if (!assoc) return;

  if (btn.dataset.act === "open" || btn.dataset.act === "copy") {
    const input = btn.parentElement.querySelector("input");
    const value = input ? input.value : "";
    return btn.dataset.act === "open" ? openLink(value) : copyLink(value);
  }

  if (btn.dataset.act === "unqueue") {
    const ok = await confirmDialog(
      "Tirar da fila",
      `"${assoc.sigla}" sai da fila de remodelação. A associação continua no inventário.`,
      "Tirar da fila"
    );
    if (!ok) return;
    assoc.remodelacao = false;
    saveAssocField(key, { remodelacao: false });
    renderRemodela();
    renderAssoc();
    toast(`"${assoc.sigla}" saiu da fila.`);
  }
}

// ---------------------------------------------------------------------------
// Ações de link
// ---------------------------------------------------------------------------

// mantém os botões de abrir/copiar coerentes sem redesenhar a tabela inteira
function refreshLinkButtons(input) {
  const cell = input.closest(".linkcell");
  if (!cell) return;
  const has = !!input.value.trim();
  cell.querySelectorAll("button[data-act]").forEach((b) => (b.disabled = !has));
}

function openLink(link) {
  const url = withProto(link);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function copyLink(link) {
  const url = withProto(link);
  if (!url) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast(`Copiado: ${displayLink(url)}`, "info"),
      () => toast("Não consegui copiar o endereço.", "warn")
    );
  } else {
    toast("Cópia não suportada neste navegador.", "warn");
  }
}

// ---------------------------------------------------------------------------
// Exportação CSV
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name, text) {
  const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  let head;
  let rows;
  let name;

  if (STATE.tab === "assoc") {
    name = "associacoes.csv";
    head = ["Sigla", "Nome", "Saúde", "MRR", "Site atual", "Endereço", "Na fila"];
    rows = VIEW.assoc.map((a) => [
      a.sigla,
      a.nome || "",
      (HEALTH_META[a.health] || {}).label || "",
      a.mrr != null ? a.mrr : "",
      labelOf(SITE_ATUAL_OPTIONS, a.siteAtual),
      a.link || "",
      a.remodelacao ? "sim" : "não",
    ]);
  } else if (STATE.tab === "evento") {
    name = "eventos.csv";
    head = ["Nome curto", "Nome", "Sigla", "Status", "Tipo de site", "Endereço"];
    rows = VIEW.evento.map((e) => [
      e.shortName || "",
      e.nome || "",
      e.sigla || "",
      labelOf(STATUS_MANUAL_OPTIONS, e.statusManual),
      labelOf(SITE_ATUAL_OPTIONS, e.siteAtual),
      e.link || "",
    ]);
  } else {
    name = "fila-remodelacao.csv";
    head = ["Prioridade", "Sigla", "Nome", "MRR", "Site atual", "Nova versão", "Endereço novo"];
    rows = VIEW.remodela.map((a) => [
      a._rank,
      a.sigla,
      a.nome || "",
      a.mrr != null ? a.mrr : "",
      a.link || "",
      a.novaVersao ? "feita" : "pendente",
      a.novaVersaoLink || "",
    ]);
  }

  if (!rows.length) {
    toast("Não há linhas para exportar nessa visão.", "warn");
    return;
  }

  const csv = [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  download(name, csv);
  toast(`${rows.length} linha(s) exportadas.`);
}

// ---------------------------------------------------------------------------
// Navegação, tema e atalhos
// ---------------------------------------------------------------------------

function renderNavCounts() {
  document.getElementById("count-assoc").textContent = ASSOCIACOES.filter((a) => !a.removed).length;
  document.getElementById("count-evento").textContent = EVENTOS.filter((e) => !e.removed).length;
  document.getElementById("count-remodela").textContent = getRemodelaQueue().length;
}

function setTab(tab) {
  STATE.tab = tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch (e) {}

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`panel-${tab}`).classList.add("active");

  document.getElementById("page-title").textContent = PAGES[tab].title;
  document.getElementById("page-sub").textContent = PAGES[tab].sub;
  document.getElementById("btn-add-text").textContent = PAGES[tab].add;
  document.getElementById("btn-add").title = PAGES[tab].add;

  if (tab === "assoc") renderAssoc();
  else if (tab === "evento") renderEvento();
  else renderRemodela();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function currentTheme() {
  return (
    document.documentElement.dataset.theme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const root = document.documentElement;

  root.classList.add("theme-switching");
  root.dataset.theme = next;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));

  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {}
  toast(next === "dark" ? "Tema escuro" : "Tema claro", "info");
}

function initChips(containerId, onPick) {
  const box = document.getElementById(containerId);
  box.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip) return;
    box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === chip));
    onPick(chip.dataset.value);
  });
}

function initSort(panelId, stateKey, rerender, type) {
  const panel = document.getElementById(panelId);
  panel.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const sort = STATE[stateKey].sort;
      const col = th.dataset.sort;
      if (sort.col === col) sort.dir = sort.dir === "asc" ? "desc" : "asc";
      else {
        sort.col = col;
        sort.dir = col === "mrr" ? "desc" : "asc";
      }
      panel.querySelectorAll("th.sortable").forEach((o) => o.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(sort.dir === "asc" ? "sort-asc" : "sort-desc");
      rerender();
    });
  });
  const first = panel.querySelector(`th.sortable[data-sort="${STATE[stateKey].sort.col}"]`);
  if (first) first.classList.add(STATE[stateKey].sort.dir === "asc" ? "sort-asc" : "sort-desc");
}

// o cabeçalho da tabela gruda exatamente sob a barra do topo, seja qual for a
// altura dela (que muda entre desktop e celular)
function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  const apply = () =>
    document.documentElement.style.setProperty("--topbar-h", `${Math.round(topbar.getBoundingClientRect().height)}px`);

  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(topbar);
  else window.addEventListener("resize", apply);
}

function initDialogs() {
  document.querySelectorAll("dialog.modal").forEach((dlg) => {
    dlg.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => dlg.close()));
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) dlg.close();
    });
  });

  document.getElementById("btn-add").addEventListener("click", openAddDialog);
  document.getElementById("dlg-add-submit").addEventListener("click", submitAddDialog);
  document.getElementById("dlg-add-body").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submitAddDialog();
  });
}

function initShortcuts() {
  document.addEventListener("keydown", (ev) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName);

    if (ev.key === "/" && !typing && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault();
      const input = document.querySelector(`#panel-${STATE.tab} .search input`);
      if (input) input.focus();
      return;
    }

    if (ev.key === "Escape") {
      const input = document.querySelector(`#panel-${STATE.tab} .search input`);
      if (input && document.activeElement === input && input.value) {
        ev.preventDefault();
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-export").addEventListener("click", exportCsv);

  document.getElementById("assoc-search").addEventListener("input", (e) => {
    STATE.assoc.q = e.target.value.trim().toLowerCase();
    renderAssoc();
  });
  document.getElementById("evento-search").addEventListener("input", (e) => {
    STATE.evento.q = e.target.value.trim().toLowerCase();
    renderEvento();
  });
  document.getElementById("remodela-search").addEventListener("input", (e) => {
    STATE.remodela.q = e.target.value.trim().toLowerCase();
    renderRemodela();
  });

  initChips("assoc-chips-health", (v) => {
    STATE.assoc.health = v;
    renderAssoc();
  });
  initChips("assoc-chips-site", (v) => {
    STATE.assoc.site = v;
    renderAssoc();
  });
  initChips("evento-chips-status", (v) => {
    STATE.evento.status = v;
    renderEvento();
  });
  initChips("evento-chips-site", (v) => {
    STATE.evento.site = v;
    renderEvento();
  });
  initChips("remodela-chips-nv", (v) => {
    STATE.remodela.nv = v;
    renderRemodela();
  });

  initSort("panel-assoc", "assoc", renderAssoc, "assoc");
  initSort("panel-evento", "evento", renderEvento, "evento");

  const assocBody = document.getElementById("assoc-table-body");
  assocBody.addEventListener("change", handleAssocEdit);
  assocBody.addEventListener("click", handleAssocClick);

  const eventoBody = document.getElementById("evento-table-body");
  eventoBody.addEventListener("change", handleEventoEdit);
  eventoBody.addEventListener("click", handleEventoClick);

  const remodelaBody = document.getElementById("remodela-table-body");
  remodelaBody.addEventListener("change", handleRemodelaEdit);
  remodelaBody.addEventListener("click", handleRemodelaClick);

  initDialogs();
  initShortcuts();
  syncTopbarHeight();

  renderAssoc();
  renderEvento();
  renderRemodela();

  let saved = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch (e) {}
  setTab(PAGES[saved] ? saved : "assoc");
}

document.addEventListener("DOMContentLoaded", init);
