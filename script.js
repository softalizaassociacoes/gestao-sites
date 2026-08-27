// ============================================================================
// Gestão de Sites — painel.
//
// A base fica em data.js e serve de semente. A fonte de verdade é o banco no
// Supabase, alcançado por /api/dados. O localStorage guarda só um espelho do
// que veio do banco, para o painel abrir mesmo offline.
// ============================================================================

const API = "/api/dados";
const CACHE_ASSOC = "gestaoSitesCacheAssoc";
const CACHE_EVENTO = "gestaoSitesCacheEventos";
const TAB_KEY = "gestaoSitesTab";
const THEME_KEY = "gestaoSitesTheme";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

let ASSOCIACOES = [];
let EVENTOS = [];

const BANCO = { ativo: false, fila: new Map(), timer: null, enviando: false };

// ---------------------------------------------------------------------------
// Semente e espelho local
// ---------------------------------------------------------------------------

function semearAssociacoes() {
  return ASSOCIACOES_BASE.map((a) => ({ chave: a.sigla, ...a, removido: false }));
}

function semearEventos() {
  return EVENTOS_BASE.map((e) => ({ ...e, removido: false }));
}

function lerCache(chave) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return Array.isArray(v) && v.length ? v : null;
  } catch (e) {
    return null;
  }
}

function gravarCache() {
  try {
    localStorage.setItem(CACHE_ASSOC, JSON.stringify(ASSOCIACOES));
    localStorage.setItem(CACHE_EVENTO, JSON.stringify(EVENTOS));
  } catch (e) {
    /* cota estourada ou modo privado — o banco continua sendo a verdade */
  }
}

// ---------------------------------------------------------------------------
// Sincronia com o banco
// ---------------------------------------------------------------------------

function marcarSincronia(texto, classe) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = texto;
  el.className = `sync-status ${classe}`;
}

// grava linha a linha, juntando rajadas de edição num envio só
function enfileirar(tipo, registro) {
  gravarCache();
  if (!BANCO.ativo) return;
  BANCO.fila.set(`${tipo}:${registro.chave || registro.id}`, { tipo, registro });
  clearTimeout(BANCO.timer);
  BANCO.timer = setTimeout(descarregarFila, 900);
}

async function descarregarFila() {
  if (!BANCO.ativo || BANCO.enviando || !BANCO.fila.size) return;
  BANCO.enviando = true;
  const lote = [...BANCO.fila.values()];
  BANCO.fila.clear();
  marcarSincronia("Salvando…", "s-sync");

  let falhou = false;
  for (const item of lote) {
    try {
      const r = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!r.ok) falhou = true;
    } catch (e) {
      falhou = true;
    }
  }

  marcarSincronia(falhou ? "Falha ao salvar" : "Salvo no banco", falhou ? "s-erro" : "s-ok");
  BANCO.enviando = false;
  if (BANCO.fila.size) descarregarFila();
}

async function semearBanco() {
  marcarSincronia("Preparando banco…", "s-sync");
  try {
    const r = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ associacoes: ASSOCIACOES, eventos: EVENTOS }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      marcarSincronia("Falha ao semear", "s-erro");
      console.warn("Semeadura falhou:", corpo);
      return;
    }
    marcarSincronia("Salvo no banco", "s-ok");
  } catch (e) {
    marcarSincronia("Sem conexão", "s-erro");
  }
}

async function carregarDoBanco() {
  let r;
  try {
    r = await fetch(API, { headers: { Accept: "application/json" } });
  } catch (e) {
    return null;
  }
  if (!r.ok) return null;
  try {
    const corpo = await r.json();
    if (!corpo || !Array.isArray(corpo.associacoes)) return null;
    BANCO.ativo = true;
    return corpo;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Escrita no modelo
// ---------------------------------------------------------------------------

function salvarAssoc(a) {
  enfileirar("associacao", a);
}

function salvarEvento(e) {
  enfileirar("evento", e);
}

function novaChave(prefixo) {
  return `${prefixo}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Estado da interface
// ---------------------------------------------------------------------------

const STATE = {
  tab: "assoc",
  assoc: { q: "", saude: "", site: "", sort: { col: "sigla", dir: "asc" } },
  evento: { q: "", status: "", site: "", sort: { col: "nome", dir: "asc" } },
  remodela: { q: "", nv: "", origem: "" },
};

const VIEW = { assoc: [], evento: [], remodela: [] };

const PAGES = {
  assoc: {
    title: "Sites",
    sub: "Todas as associações, com e sem site conosco.",
    add: "Nova associação",
  },
  evento: {
    title: "Sites de eventos",
    sub: "Congressos e eventos, com site próprio ou ainda no WordPress padrão.",
    add: "Novo evento",
  },
  remodela: {
    title: "Remodelar",
    sub: "Os sites conosco, ordenados por MRR — quem paga mais entra primeiro na régua.",
    add: "Adicionar à remodelação",
  },
};

// ---------------------------------------------------------------------------
// Opções e rótulos
// ---------------------------------------------------------------------------

const SITE_ATUAL_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "personalizado", label: "Personalizado" },
  { value: "hotsite", label: "Hotsite" },
];

const STATUS_OPTIONS = [
  { value: "a_acontecer", label: "A acontecer" },
  { value: "acontecendo", label: "Acontecendo" },
  { value: "realizado", label: "Realizado" },
];

// "não" marca o que não será remodelado: sai da conta de progresso e vai para
// o fim da lista
const NOVA_VERSAO_OPTIONS = [
  { value: "feita", label: "Feito" },
  { value: "pendente", label: "Pendente" },
  { value: "nao", label: "Não" },
];

const NV_ORDER = { pendente: 0, feita: 1, nao: 2 };
const SAUDE_ORDER = { risco: 0, atencao: 1, saudavel: 2, cancelado: 3 };
const STATUS_ORDER = { acontecendo: 0, a_acontecer: 1, realizado: 2 };

const SAUDE_META = {
  saudavel: { label: "Saudável", cls: "b-ok" },
  atencao: { label: "Atenção", cls: "b-warn" },
  risco: { label: "Risco", cls: "b-risk" },
  cancelado: { label: "Cancelado", cls: "b-off" },
};

const SITE_TIPO_BADGE = {
  personalizado: { label: "Personalizado", cls: "b-accent" },
  hotsite: { label: "Hotsite", cls: "b-ok" },
};

const ANO_ATUAL = new Date().getFullYear();

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

function labelOf(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.label : value || "—";
}

function saudeBadge(saude) {
  const meta = SAUDE_META[saude];
  if (!meta) return '<span class="badge b-none">Sem dado</span>';
  return `<span class="badge ${meta.cls}"><i></i>${meta.label}</span>`;
}

// WordPress é a regra na aba Remodelar; repetir o selo em toda linha não informa
// nada, então marcamos só a exceção
function siteTipoBadge(tipo) {
  const meta = SITE_TIPO_BADGE[tipo];
  if (!meta) return "";
  return `<span class="badge ${meta.cls} badge-sm"><i></i>${meta.label}</span>`;
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

function switchField(cls, dataAttr, checked) {
  return `<label class="switch">
    <input type="checkbox" class="${cls}" ${dataAttr} ${checked ? "checked" : ""} />
    <span class="track"></span>
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

function moeda(v) {
  return currency.format(Math.round(v || 0));
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
    const onOk = () => done(true);
    const onClose = () => done(false);
    ok.addEventListener("click", onOk);
    dlg.addEventListener("close", onClose);
    dlg.showModal();
  });
}

const ADD_FORMS = {
  assoc: {
    title: "Nova associação",
    sub: "Entra na lista e é gravada no banco.",
    fields: [
      { name: "sigla", label: "Sigla", ph: "ex.: ABC", required: true },
      { name: "nome", label: "Nome completo", ph: "Opcional", hint: "Pode preencher depois direto na tabela." },
    ],
    submit: (v) => criarAssociacao(v, false),
  },
  evento: {
    title: "Novo evento",
    sub: "Para eventos que ainda não estão na base.",
    fields: [
      { name: "nome", label: "Nome do evento", ph: "ex.: Congresso Brasileiro de…", required: true },
      { name: "sigla", label: "Sigla", ph: "Opcional" },
    ],
    submit: (v) => {
      const e = {
        id: novaChave("evento"),
        nomeCurto: null,
        nome: v.nome,
        sigla: v.sigla || null,
        ano: ANO_ATUAL,
        status: "a_acontecer",
        siteAtual: "wordpress",
        endereco: "",
        removido: false,
      };
      EVENTOS.push(e);
      salvarEvento(e);
      renderEvento();
      return { message: "Evento adicionado." };
    },
  },
  remodela: {
    title: "Adicionar à remodelação",
    sub: "Marca a associação como site conosco. Se a sigla já existir, ela é reaproveitada.",
    fields: [
      { name: "sigla", label: "Sigla", ph: "ex.: ABC", required: true },
      { name: "nome", label: "Nome completo", ph: "Opcional" },
    ],
    submit: (v) => criarAssociacao(v, true),
  },
};

function criarAssociacao(v, comoSite) {
  const alvo = v.sigla.trim().toUpperCase();
  const existente = ASSOCIACOES.find((a) => (a.sigla || "").toUpperCase() === alvo);

  if (existente) {
    if (!existente.removido && !comoSite) {
      return { error: `Já existe uma associação com a sigla "${v.sigla}".` };
    }
    existente.removido = false;
    if (comoSite) existente.siteConosco = true;
    if (v.nome) existente.nome = v.nome;
    salvarAssoc(existente);
  } else {
    const a = {
      chave: novaChave("assoc"),
      sigla: v.sigla,
      nome: v.nome || null,
      saude: null,
      mrr: null,
      siteAtual: "wordpress",
      endereco: "",
      siteConosco: comoSite,
      novaVersao: "pendente",
      enderecoNovo: "",
      removido: false,
    };
    ASSOCIACOES.push(a);
    salvarAssoc(a);
  }

  renderAssoc();
  renderRemodela();
  return { message: comoSite ? `"${v.sigla}" entrou na aba Remodelar.` : `"${v.sigla}" adicionada.` };
}

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
// Ordenação
// ---------------------------------------------------------------------------

function sortList(list, sort, tipo) {
  const dir = sort.dir === "desc" ? -1 : 1;
  const col = sort.col;
  return [...list].sort((a, b) => {
    let x;
    let y;
    if (col === "mrr" || col === "ano") {
      x = a[col] == null ? -1 : a[col];
      y = b[col] == null ? -1 : b[col];
    } else if (col === "saude") {
      x = SAUDE_ORDER[a.saude] == null ? 9 : SAUDE_ORDER[a.saude];
      y = SAUDE_ORDER[b.saude] == null ? 9 : SAUDE_ORDER[b.saude];
    } else if (col === "status") {
      x = STATUS_ORDER[a.status] == null ? 9 : STATUS_ORDER[a.status];
      y = STATUS_ORDER[b.status] == null ? 9 : STATUS_ORDER[b.status];
    } else if (col === "nome" && tipo === "evento") {
      x = (a.nomeCurto || a.nome || "").toLowerCase();
      y = (b.nomeCurto || b.nome || "").toLowerCase();
    } else {
      x = (a[col] || "").toString().toLowerCase();
      y = (b[col] || "").toString().toLowerCase();
    }
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Aba: Sites (todas as associações)
// ---------------------------------------------------------------------------

function renderAssocMetrics(list) {
  const total = list.length;
  const saudavel = list.filter((a) => a.saude === "saudavel").length;
  const atencao = list.filter((a) => a.saude === "atencao").length;
  const risco = list.filter((a) => a.saude === "risco").length;
  const cancelado = list.filter((a) => a.saude === "cancelado").length;
  const wordpress = list.filter((a) => a.siteAtual === "wordpress").length;
  const personalizado = list.filter((a) => a.siteAtual === "personalizado").length;
  const hotsite = list.filter((a) => a.siteAtual === "hotsite").length;
  const conosco = list.filter((a) => a.siteConosco).length;
  const mrr = list.reduce((s, a) => s + (a.mrr || 0), 0);

  document.getElementById("assoc-metrics").innerHTML = metricsHtml([
    { label: "Associações", value: total, note: `${total - conosco} sem site conosco` },
    { label: "MRR somado", value: moeda(mrr), money: true, note: "Receita recorrente do recorte" },
    { label: "Site conosco", value: conosco, dot: "d-accent", note: `${pct(conosco, total)}% do recorte` },
    { label: "Fora do WordPress", value: personalizado + hotsite, dot: "d-ok", note: `${pct(personalizado + hotsite, total)}% já migrado` },
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
  if (!list.length) {
    tbody.innerHTML = emptyRow(7, "Nada por aqui", "Nenhuma associação bate com esses filtros.");
    return;
  }

  tbody.innerHTML = list
    .map((a) => {
      const k = `data-key="${esc(a.chave)}"`;
      return `<tr>
        <td class="ident-td" data-l="Associação">
          <div class="ident">
            ${avatar(a.sigla)}
            <div class="ident-fields">
              <input class="f f-strong a-sigla" type="text" ${k} value="${esc(a.sigla)}" placeholder="Sigla" />
              <input class="f f-sub a-nome" type="text" ${k} value="${esc(a.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td data-l="Saúde">${saudeBadge(a.saude)}</td>
        <td class="num" data-l="MRR">${a.mrr != null ? moeda(a.mrr) : '<span class="muted">—</span>'}</td>
        <td data-l="Site atual">${selectField("a-tipo", k, a.siteAtual, SITE_ATUAL_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("a-endereco", k, a.endereco)}</td>
        <td class="center" data-l="Site conosco">${switchField("a-conosco", k, a.siteConosco)}</td>
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
    if (a.removido) return false;
    if (s.q && !`${a.sigla} ${a.nome || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.saude && a.saude !== s.saude) return false;
    if (s.site && a.siteAtual !== s.site) return false;
    return true;
  });

  const sorted = sortList(filtered, s.sort, "assoc");
  VIEW.assoc = sorted;

  renderAssocMetrics(sorted);
  renderAssocTable(sorted);
  syncTableFit();

  const totalAtivas = ASSOCIACOES.filter((a) => !a.removido).length;
  document.getElementById("assoc-count").textContent =
    sorted.length === totalAtivas ? `${totalAtivas} no total` : `${sorted.length} de ${totalAtivas}`;
  renderNavCounts();
}

function handleAssocEdit(ev) {
  const el = ev.target;
  const chave = el.dataset.key;
  if (!chave) return;
  const a = ASSOCIACOES.find((x) => x.chave === chave);
  if (!a) return;

  if (el.classList.contains("a-tipo")) {
    a.siteAtual = el.value;
    renderAssoc();
    renderRemodela();
  } else if (el.classList.contains("a-endereco")) {
    a.endereco = el.value;
    refreshLinkButtons(el);
  } else if (el.classList.contains("a-sigla")) {
    a.sigla = el.value;
    renderAssoc();
    renderRemodela();
  } else if (el.classList.contains("a-nome")) {
    a.nome = el.value;
  } else if (el.classList.contains("a-conosco")) {
    a.siteConosco = el.checked;
    salvarAssoc(a);
    renderAssoc();
    renderRemodela();
    toast(el.checked ? `"${a.sigla}" entrou na aba Remodelar.` : `"${a.sigla}" saiu da aba Remodelar.`, "info");
    return;
  } else {
    return;
  }
  salvarAssoc(a);
}

async function handleAssocClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const a = ASSOCIACOES.find((x) => x.chave === btn.dataset.key);
  if (!a) return;

  if (btn.dataset.act === "open") return openLink(a.endereco);
  if (btn.dataset.act === "copy") return copyLink(a.endereco);

  if (btn.dataset.act === "del") {
    const ok = await confirmDialog(
      "Excluir associação",
      `"${a.sigla}" sai do painel. O registro continua no banco, marcado como removido.`,
      "Excluir"
    );
    if (!ok) return;
    a.removido = true;
    salvarAssoc(a);
    renderAssoc();
    renderRemodela();
    toast(`"${a.sigla}" excluída.`);
  }
}

// ---------------------------------------------------------------------------
// Aba: Eventos
// ---------------------------------------------------------------------------

function renderEventoMetrics(list) {
  const total = list.length;
  const aAcontecer = list.filter((e) => e.status === "a_acontecer").length;
  const acontecendo = list.filter((e) => e.status === "acontecendo").length;
  const realizado = list.filter((e) => e.status === "realizado").length;
  const comSite = list.filter((e) => e.endereco).length;
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
  if (!list.length) {
    tbody.innerHTML = emptyRow(6, "Nenhum evento", "Nenhum evento bate com esses filtros. Ajuste a busca, o ano ou o status.");
    return;
  }

  tbody.innerHTML = list
    .map((e) => {
      const k = `data-id="${esc(e.id)}"`;
      return `<tr>
        <td class="ident-td" data-l="Evento">
          <div class="ident">
            ${avatar(e.sigla || e.nomeCurto || e.nome)}
            <div class="ident-fields">
              <input class="f f-strong e-curto" type="text" ${k} value="${esc(e.nomeCurto)}" placeholder="Nome curto" />
              <input class="f f-sub e-nome" type="text" ${k} value="${esc(e.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td class="num" data-l="Ano"><input class="f f-num e-ano" type="text" inputmode="numeric" maxlength="4" ${k} value="${esc(e.ano)}" placeholder="${ANO_ATUAL}" /></td>
        <td data-l="Status">${selectField("e-status", k, e.status, STATUS_OPTIONS)}</td>
        <td data-l="Tipo de site">${selectField("e-tipo", k, e.siteAtual, SITE_ATUAL_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("e-endereco", k, e.endereco)}</td>
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
    if (e.removido) return false;
    if (s.q && !`${e.nome} ${e.nomeCurto || ""} ${e.sigla || ""} ${e.ano || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.status && e.status !== s.status) return false;
    if (s.site && e.siteAtual !== s.site) return false;
    return true;
  });

  const sorted = sortList(filtered, s.sort, "evento");
  VIEW.evento = sorted;

  renderEventoMetrics(sorted);
  renderEventoTable(sorted);
  syncTableFit();

  const totalAtivos = EVENTOS.filter((e) => !e.removido).length;
  document.getElementById("evento-count").textContent =
    sorted.length === totalAtivos ? `${totalAtivos} no total` : `${sorted.length} de ${totalAtivos}`;
  renderNavCounts();
}

function handleEventoEdit(ev) {
  const el = ev.target;
  const id = el.dataset.id;
  if (!id) return;
  const e = EVENTOS.find((x) => x.id === id);
  if (!e) return;

  if (el.classList.contains("e-status")) {
    e.status = el.value;
    renderEvento();
  } else if (el.classList.contains("e-tipo")) {
    e.siteAtual = el.value;
    renderEvento();
  } else if (el.classList.contains("e-endereco")) {
    e.endereco = el.value;
    refreshLinkButtons(el);
  } else if (el.classList.contains("e-ano")) {
    // campo vazio volta para o ano corrente, que é o padrão da coluna
    const digits = el.value.replace(/[^\d]/g, "").slice(0, 4);
    e.ano = digits ? Number(digits) : ANO_ATUAL;
    renderEvento();
  } else if (el.classList.contains("e-curto")) {
    e.nomeCurto = el.value;
  } else if (el.classList.contains("e-nome")) {
    e.nome = el.value;
  } else {
    return;
  }
  salvarEvento(e);
}

async function handleEventoClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const e = EVENTOS.find((x) => x.id === btn.dataset.id);
  if (!e) return;

  if (btn.dataset.act === "open") return openLink(e.endereco);
  if (btn.dataset.act === "copy") return copyLink(e.endereco);

  if (btn.dataset.act === "del") {
    const nome = e.nomeCurto || e.nome;
    const ok = await confirmDialog("Excluir evento", `"${nome}" sai do painel de sites de eventos.`, "Excluir");
    if (!ok) return;
    e.removido = true;
    salvarEvento(e);
    renderEvento();
    toast(`"${nome}" excluído.`);
  }
}

// ---------------------------------------------------------------------------
// Aba: Remodelar (os sites conosco)
// ---------------------------------------------------------------------------

function naAbaSites(a) {
  return !a.removido && a.siteConosco;
}

function getSites() {
  return ASSOCIACOES.filter(naAbaSites).sort((x, y) => (y.mrr || 0) - (x.mrr || 0));
}

function rankBadge(rank) {
  let cls = "";
  if (rank <= 3) cls = " r-top";
  else if (rank <= 10) cls = " r-mid";
  return `<span class="rank${cls}">${rank}º</span>`;
}

function renderRemodelaMetrics(lista) {
  const total = lista.length;
  const feitas = lista.filter((a) => a.novaVersao === "feita").length;
  const pendentes = lista.filter((a) => a.novaVersao === "pendente").length;
  const nao = lista.filter((a) => a.novaVersao === "nao").length;
  const wordpress = lista.filter((a) => a.siteAtual === "wordpress").length;

  // "não" sai da conta: não é trabalho que ainda vá acontecer
  const previstas = total - nao;
  const mrr = lista.reduce((s, a) => s + (a.mrr || 0), 0);
  const mrrPendente = lista.filter((a) => a.novaVersao === "pendente").reduce((s, a) => s + (a.mrr || 0), 0);

  document.getElementById("remodela-metrics").innerHTML = metricsHtml([
    { label: "Sites conosco", value: total, dot: "d-accent", note: `${total - wordpress} já fora do WordPress` },
    { label: "Novas versões prontas", value: feitas, dot: "d-ok", note: `${pct(feitas, previstas)}% do que está previsto` },
    { label: "Pendentes", value: pendentes, dot: "d-warn", note: nao ? `${nao} marcada(s) como “Não”` : "Ainda no modelo antigo" },
    { label: "MRR represado", value: moeda(mrrPendente), money: true, note: `de ${moeda(mrr)} no total` },
  ]);

  const prog = document.getElementById("remodela-progress");
  prog.innerHTML = previstas
    ? `<div class="progress-track"><div class="progress-fill" style="width:${pct(feitas, previstas)}%"></div></div>
       <span>${feitas}/${previstas} concluídas</span>`
    : "";
}

function renderRemodelaTable(list) {
  const tbody = document.getElementById("remodela-table-body");
  if (!list.length) {
    tbody.innerHTML = emptyRow(
      9,
      "Nenhum site aqui",
      "Nenhum site bate com esses filtros. Marque a chave <strong>Site conosco</strong> na aba Sites, ou use “Adicionar à remodelação”."
    );
    return;
  }

  tbody.innerHTML = list
    .map((a) => {
      const k = `data-key="${esc(a.chave)}"`;
      const cls = a.novaVersao === "feita" ? "done" : a.novaVersao === "nao" ? "skip" : "";
      return `<tr class="${cls}">
        <td data-l="Prioridade">${rankBadge(a._rank)}</td>
        <td class="ident-td" data-l="Associação">
          <div class="ident">
            ${avatar(a.sigla)}
            <div class="ident-fields">
              <input class="f f-strong s-sigla" type="text" ${k} value="${esc(a.sigla)}" placeholder="Sigla" />
              <input class="f f-sub s-nome" type="text" ${k} value="${esc(a.nome)}" placeholder="Nome completo" />
            </div>
          </div>
        </td>
        <td data-l="Saúde">${saudeBadge(a.saude)}</td>
        <td class="num" data-l="MRR"><input class="f f-num s-mrr" type="text" inputmode="decimal" ${k} value="${a.mrr != null ? a.mrr : ""}" placeholder="0" /></td>
        <td data-l="Site atual">
          <div class="stack">
            ${siteTipoBadge(a.siteAtual)}
            ${selectField("s-tipo", k, a.siteAtual, SITE_ATUAL_OPTIONS)}
          </div>
        </td>
        <td data-l="Endereço">${linkCell("s-endereco", k, a.endereco)}</td>
        <td data-l="Nova versão">${selectField(`nv-select nv-${a.novaVersao} s-nv`, k, a.novaVersao, NOVA_VERSAO_OPTIONS)}</td>
        <td data-l="Endereço novo">${linkCell("s-endereco-novo", k, a.enderecoNovo)}</td>
        <td class="actions" data-l="">
          <button class="mini danger" type="button" data-act="unqueue" ${k} title="Marcar que o site não é conosco" aria-label="Tirar da remodelação">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderRemodela() {
  const s = STATE.remodela;
  const lista = getSites();
  // cópia só para carregar o número da prioridade; as edições vão no original
  const ranked = lista.map((a, i) => ({ ...a, _rank: i + 1 }));

  // pendentes primeiro, feitas depois, "não" no fim
  const ordered = [...ranked].sort((a, b) => NV_ORDER[a.novaVersao] - NV_ORDER[b.novaVersao]);

  const filtered = ordered.filter((a) => {
    if (s.q && !`${a.sigla || ""} ${a.nome || ""}`.toLowerCase().includes(s.q)) return false;
    if (s.nv && a.novaVersao !== s.nv) return false;
    if (s.origem && a.siteAtual !== s.origem) return false;
    return true;
  });

  VIEW.remodela = filtered;

  renderRemodelaMetrics(lista);
  renderRemodelaTable(filtered);
  syncTableFit();

  document.getElementById("remodela-count").textContent =
    filtered.length === lista.length ? `${lista.length} no total` : `${filtered.length} de ${lista.length}`;
  renderNavCounts();
}

function handleRemodelaEdit(ev) {
  const el = ev.target;
  const chave = el.dataset.key;
  if (!chave) return;
  const a = ASSOCIACOES.find((x) => x.chave === chave);
  if (!a) return;

  if (el.classList.contains("s-nv")) {
    a.novaVersao = el.value;
    salvarAssoc(a);
    renderRemodela();
    const msg = {
      feita: `Nova versão de "${a.sigla}" marcada como feita.`,
      pendente: `"${a.sigla}" voltou para pendente.`,
      nao: `"${a.sigla}" marcada como “Não” e foi para o fim da lista.`,
    };
    toast(msg[el.value], "info");
    return;
  }

  if (el.classList.contains("s-endereco-novo")) {
    a.enderecoNovo = el.value;
    refreshLinkButtons(el);
  } else if (el.classList.contains("s-endereco")) {
    a.endereco = el.value;
    refreshLinkButtons(el);
    renderAssoc();
  } else if (el.classList.contains("s-nome")) {
    a.nome = el.value;
    renderAssoc();
  } else if (el.classList.contains("s-sigla")) {
    a.sigla = el.value;
    renderRemodela();
    renderAssoc();
  } else if (el.classList.contains("s-tipo")) {
    a.siteAtual = el.value;
    renderRemodela();
    renderAssoc();
  } else if (el.classList.contains("s-mrr")) {
    const limpo = el.value.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = parseFloat(limpo);
    a.mrr = Number.isFinite(n) ? n : null;
    renderRemodela();
    renderAssoc();
  } else {
    return;
  }
  salvarAssoc(a);
}

async function handleRemodelaClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const a = ASSOCIACOES.find((x) => x.chave === btn.dataset.key);
  if (!a) return;

  if (btn.dataset.act === "open" || btn.dataset.act === "copy") {
    const input = btn.parentElement.querySelector("input");
    const valor = input ? input.value : "";
    return btn.dataset.act === "open" ? openLink(valor) : copyLink(valor);
  }

  if (btn.dataset.act === "unqueue") {
    const ok = await confirmDialog(
      "Tirar da remodelação",
      `"${a.sigla}" deixa de ser marcada como site conosco e sai desta aba. A associação continua na aba Sites.`,
      "Tirar da lista"
    );
    if (!ok) return;
    a.siteConosco = false;
    salvarAssoc(a);
    renderRemodela();
    renderAssoc();
    toast(`"${a.sigla}" saiu da remodelação.`);
  }
}

// ---------------------------------------------------------------------------
// Ações de link
// ---------------------------------------------------------------------------

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
    head = ["Sigla", "Nome", "Saúde", "MRR", "Site atual", "Endereço", "Site conosco"];
    rows = VIEW.assoc.map((a) => [
      a.sigla,
      a.nome || "",
      (SAUDE_META[a.saude] || {}).label || "",
      a.mrr != null ? a.mrr : "",
      labelOf(SITE_ATUAL_OPTIONS, a.siteAtual),
      a.endereco || "",
      a.siteConosco ? "sim" : "não",
    ]);
  } else if (STATE.tab === "evento") {
    name = "eventos.csv";
    head = ["Nome curto", "Nome", "Sigla", "Ano", "Status", "Tipo de site", "Endereço"];
    rows = VIEW.evento.map((e) => [
      e.nomeCurto || "",
      e.nome || "",
      e.sigla || "",
      e.ano != null ? e.ano : "",
      labelOf(STATUS_OPTIONS, e.status),
      labelOf(SITE_ATUAL_OPTIONS, e.siteAtual),
      e.endereco || "",
    ]);
  } else {
    name = "sites.csv";
    head = ["Prioridade", "Sigla", "Nome", "MRR", "Site atual", "Endereço", "Nova versão", "Endereço novo"];
    rows = VIEW.remodela.map((a) => [
      a._rank,
      a.sigla,
      a.nome || "",
      a.mrr != null ? a.mrr : "",
      labelOf(SITE_ATUAL_OPTIONS, a.siteAtual),
      a.endereco || "",
      labelOf(NOVA_VERSAO_OPTIONS, a.novaVersao),
      a.enderecoNovo || "",
    ]);
  }

  if (!rows.length) {
    toast("Não há linhas para exportar nessa visão.", "warn");
    return;
  }

  download(name, [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n"));
  toast(`${rows.length} linha(s) exportadas.`);
}

// ---------------------------------------------------------------------------
// Navegação, tema e atalhos
// ---------------------------------------------------------------------------

function renderNavCounts() {
  document.getElementById("count-assoc").textContent = ASSOCIACOES.filter((a) => !a.removido).length;
  document.getElementById("count-evento").textContent = EVENTOS.filter((e) => !e.removido).length;
  document.getElementById("count-remodela").textContent = getSites().length;
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

  // medir o encaixe só faz sentido com o painel já visível
  syncTableFit();
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

// Só liberamos o overflow (e com ele o thead sticky) na tabela que realmente
// cabe na largura disponível; se não coubesse, a página rolaria na horizontal.
function syncTableFit() {
  document.querySelectorAll(".panel.active .table-scroll").forEach((box) => {
    const table = box.querySelector("table");
    if (!table) return;
    box.classList.remove("fits");
    if (table.scrollWidth <= box.clientWidth + 1) box.classList.add("fits");
  });
}

// o thead gruda exatamente sob a barra do topo, seja qual for a altura dela
function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  const apply = () =>
    document.documentElement.style.setProperty("--topbar-h", `${Math.round(topbar.getBoundingClientRect().height)}px`);

  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(topbar);
  else window.addEventListener("resize", apply);
  window.addEventListener("resize", syncTableFit);
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

function initSort(panelId, stateKey, rerender) {
  const panel = document.getElementById(panelId);
  panel.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const sort = STATE[stateKey].sort;
      const col = th.dataset.sort;
      if (sort.col === col) sort.dir = sort.dir === "asc" ? "desc" : "asc";
      else {
        sort.col = col;
        sort.dir = col === "mrr" || col === "ano" ? "desc" : "asc";
      }
      panel.querySelectorAll("th.sortable").forEach((o) => o.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(sort.dir === "asc" ? "sort-asc" : "sort-desc");
      rerender();
    });
  });
  const first = panel.querySelector(`th.sortable[data-sort="${STATE[stateKey].sort.col}"]`);
  if (first) first.classList.add(STATE[stateKey].sort.dir === "asc" ? "sort-asc" : "sort-desc");
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

async function carregarModelo() {
  const remoto = await carregarDoBanco();

  if (remoto && remoto.associacoes.length) {
    ASSOCIACOES = remoto.associacoes;
    EVENTOS = remoto.eventos;
    gravarCache();
    marcarSincronia("Salvo no banco", "s-ok");
    return;
  }

  // banco vazio ou indisponível: parte do espelho local, senão da semente
  ASSOCIACOES = lerCache(CACHE_ASSOC) || semearAssociacoes();
  EVENTOS = lerCache(CACHE_EVENTO) || semearEventos();
  gravarCache();

  if (BANCO.ativo) await semearBanco();
  else marcarSincronia("Só neste navegador", "s-off");
}

async function init() {
  await carregarModelo();

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
    STATE.assoc.saude = v;
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
  initChips("remodela-chips-origem", (v) => {
    STATE.remodela.origem = v;
    renderRemodela();
  });

  initSort("panel-assoc", "assoc", renderAssoc);
  initSort("panel-evento", "evento", renderEvento);

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
