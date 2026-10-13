// ============================================================================
// Gestão de Sites — painel centrado em site.
//
// Um registro por site da Softaliza, de associação ou de evento. A base em
// data.js é semente; a verdade é o banco no Supabase, por /api/dados. O
// localStorage espelha o banco para o painel abrir offline.
// ============================================================================

const API = "/api/dados";
const CACHE_SITES = "gestaoSitesCacheSites";
const TAB_KEY = "gestaoSitesTab";
const THEME_KEY = "gestaoSitesTheme";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

let SITES = [];
const PROSPECTOS = typeof PROSPECTOS_BASE !== "undefined" ? PROSPECTOS_BASE : [];

const BANCO = { ativo: false, fila: new Map(), timer: null, enviando: false };

const hoje = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Semente, normalização e mesclagem
// ---------------------------------------------------------------------------

function semearSites() {
  const base = typeof SITES_BASE !== "undefined" ? SITES_BASE : [];
  return base.map(normalizarSite);
}

// registro de deploy anterior pode não ter campo novo: tudo ganha padrão aqui
function normalizarSite(s) {
  const seo = s.seo
    ? {
        encontravel: s.seo.encontravel || "fraco",
        conformidade: s.seo.conformidade || "ok",
        dominioSoftaliza: !!s.seo.dominioSoftaliza,
        indexavel: s.seo.indexavel !== false,
        siglaNoTitulo: !!s.seo.siglaNoTitulo,
        titulo: s.seo.titulo || null,
        urlFinal: s.seo.urlFinal || null,
        problemas: s.seo.problemas || [],
        lacunas: s.seo.lacunas || [],
        auditadoEm: s.seo.auditadoEm || null,
        indexado: !!s.seo.indexado,
        pesquisa: s.seo.pesquisa || s.nome || "",
        encontravelManual: !!s.seo.encontravelManual,
      }
    : null;
  return {
    id: s.id,
    tipo: s.tipo === "evento" ? "evento" : "associacao",
    nome: s.nome || "",
    nomeCompleto: s.nomeCompleto || null,
    url: s.url || "",
    plataforma: s.plataforma || "wordpress",
    situacao: s.situacao || (s.plataforma === "wordpress" ? "remodelar" : "pronto"),
    // "feita" era o estado único de conclusão; virou "em validação", que é o
    // que ele de fato significava: site novo pronto, ainda não no ar definitivo
    novaVersao: s.novaVersao === "feita" ? "validacao" : s.novaVersao || "pendente",
    enderecoNovo: s.enderecoNovo || "",
    saude: s.saude || null,
    mrr: s.mrr == null ? null : Number(s.mrr),
    statusEvento: s.statusEvento || null,
    ano: s.ano == null ? null : Number(s.ano),
    seo,
    rodapeSoftaliza: s.rodapeSoftaliza == null ? null : !!s.rodapeSoftaliza,
    noAr: s.noAr == null ? null : !!s.noAr,
    verificadoEm: s.verificadoEm || null,
    // decisão do cliente de ficar com o endereço softaliza como definitivo
    linkDefinitivo: !!s.linkDefinitivo,
    // tirado da fila de remodelação à mão; o site continua nas outras abas
    foraDaFila: !!s.foraDaFila,
    // marcações manuais por cima da varredura; null = vale o automático
    checagemManual: {
      ar: s.checagemManual && s.checagemManual.ar != null ? !!s.checagemManual.ar : null,
      rodape: s.checagemManual && s.checagemManual.rodape != null ? !!s.checagemManual.rodape : null,
      seo: s.checagemManual && s.checagemManual.seo != null ? !!s.checagemManual.seo : null,
    },
    historico: Array.isArray(s.historico) ? s.historico : [],
    manual: !!s.manual,
    removido: !!s.removido,
  };
}

// A varredura é refeita de tempos em tempos e a semente chega com data nova.
// Os campos medidos atualizam; o que é seu (situação, nova versão, marcações
// de SEO, histórico) permanece. Quem não está na semente entra como novo.
function mesclarComBase(lista, base) {
  const porId = new Map(base.map((b) => [b.id, b]));
  let atualizados = 0;

  const mesclada = lista.map((r) => {
    const b = porId.get(r.id);
    if (!b || !b.verificadoEm || b.verificadoEm <= (r.verificadoEm || "")) return r;
    atualizados++;
    const seo = b.seo
      ? {
          ...b.seo,
          indexado: !!(r.seo && r.seo.indexado),
          pesquisa: (r.seo && r.seo.pesquisa) || b.seo.pesquisa,
          encontravelManual: !!(r.seo && r.seo.encontravelManual),
          encontravel: r.seo && r.seo.encontravelManual ? r.seo.encontravel : b.seo.encontravel,
        }
      : r.seo;
    return { ...r, seo, rodapeSoftaliza: b.rodapeSoftaliza, noAr: b.noAr, verificadoEm: b.verificadoEm };
  });

  const vistos = new Set(lista.map((r) => r.id));
  const novos = base.filter((b) => !vistos.has(b.id));
  return { lista: [...mesclada, ...novos], novos, atualizados };
}

// Tabelas antigas (associações, eventos, seo) viram sites. Roda uma vez, quando
// a tabela de sites ainda está vazia, para não perder o que já foi editado.
function migrarLegado(legado) {
  const seoPor = new Map((legado.seo || []).map((r) => [r.seo_id, r]));
  const sites = [];

  (legado.associacoes || [])
    .filter((a) => a.site_conosco && !a.removido)
    .forEach((a) => {
      const s = seoPor.get(`associacao:${a.chave}`);
      sites.push(
        normalizarSite({
          id: `assoc:${a.chave}`,
          tipo: "associacao",
          nome: a.sigla || a.chave,
          nomeCompleto: a.nome,
          url: a.endereco,
          plataforma: a.site_atual,
          situacao: a.nova_versao === "feita" ? "pronto" : a.site_atual === "wordpress" ? "remodelar" : "pronto",
          novaVersao: a.nova_versao,
          enderecoNovo: a.endereco_novo,
          saude: a.saude,
          mrr: a.mrr,
          seo: s ? seoLegado(s) : null,
          historico: [{ em: hoje(), texto: "Migrado das tabelas antigas do painel." }],
        })
      );
    });

  (legado.eventos || [])
    .filter((e) => !e.removido)
    .forEach((e) => {
      const s = seoPor.get(`evento:${e.id}`);
      sites.push(
        normalizarSite({
          id: `evento:${e.id}`,
          tipo: "evento",
          nome: e.nome_curto || e.nome,
          nomeCompleto: e.nome,
          url: e.endereco,
          plataforma: e.site_atual,
          statusEvento: e.status,
          ano: e.ano,
          seo: s ? seoLegado(s) : null,
          historico: [{ em: hoje(), texto: "Migrado das tabelas antigas do painel." }],
        })
      );
    });

  // registros de SEO criados à mão, sem associação nem evento por trás
  (legado.seo || [])
    .filter((s) => s.dados && s.dados.manual && !(s.dados.removido))
    .forEach((s) => {
      sites.push(
        normalizarSite({
          id: `manual:${s.seo_id}`,
          tipo: s.tipo,
          nome: s.rotulo,
          url: s.url,
          plataforma: "wordpress",
          seo: seoLegado(s),
          manual: true,
          historico: [{ em: hoje(), texto: "Migrado da aba SEOs." }],
        })
      );
    });

  return sites;
}

function seoLegado(s) {
  const d = s.dados || {};
  return {
    encontravel: s.encontravel,
    conformidade: d.conformidade,
    dominioSoftaliza: d.dominioSoftaliza,
    indexavel: d.indexavel,
    siglaNoTitulo: d.siglaNoTitulo,
    titulo: s.titulo,
    urlFinal: s.url_final,
    problemas: d.problemas,
    lacunas: d.lacunas,
    auditadoEm: s.auditado_em,
    indexado: s.indexado,
    pesquisa: d.pesquisa,
    encontravelManual: d.encontravelManual,
  };
}

function lerCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_SITES));
    return Array.isArray(v) && v.length ? v.map(normalizarSite) : null;
  } catch (e) {
    return null;
  }
}

function gravarCache() {
  try {
    localStorage.setItem(CACHE_SITES, JSON.stringify(SITES));
  } catch (e) {
    /* cota ou modo privado — o banco continua sendo a verdade */
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

function salvarSite(s) {
  gravarCache();
  if (!BANCO.ativo) return;
  BANCO.fila.set(s.id, s);
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
  for (const site of lote) {
    try {
      const r = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site }),
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

async function enviarLote(sites) {
  if (!BANCO.ativo || !sites.length) return;
  marcarSincronia("Gravando…", "s-sync");
  try {
    const r = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sites }),
    });
    marcarSincronia(r.ok ? "Salvo no banco" : "Falha ao gravar", r.ok ? "s-ok" : "s-erro");
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
    if (!corpo || !Array.isArray(corpo.sites)) return null;
    BANCO.ativo = true;
    return corpo;
  } catch (e) {
    return null;
  }
}

async function carregarModelo() {
  const remoto = await carregarDoBanco();
  const base = semearSites();

  if (remoto && remoto.sites.length) {
    const m = mesclarComBase(remoto.sites.map(normalizarSite), base);
    SITES = m.lista;
    gravarCache();
    marcarSincronia("Salvo no banco", "s-ok");
    if (m.novos.length || m.atualizados) await enviarLote(m.atualizados ? SITES : m.novos);
    return;
  }

  if (remoto && remoto.legado) {
    // tabela nova vazia: migra o que as antigas tinham e completa com a semente
    const migrados = migrarLegado(remoto.legado);
    const m = mesclarComBase(migrados, base);
    SITES = m.lista;
    gravarCache();
    await enviarLote(SITES);
    return;
  }

  // banco indisponível: espelho local, completado pela semente
  const cache = lerCache();
  SITES = cache ? mesclarComBase(cache, base).lista : base;
  gravarCache();
  if (BANCO.ativo) await enviarLote(SITES);
  else marcarSincronia("Só neste navegador", "s-off");
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

function registrar(site, texto) {
  site.historico = [...(site.historico || []), { em: hoje(), texto }];
}

// ---------------------------------------------------------------------------
// Estado da interface
// ---------------------------------------------------------------------------

const STATE = {
  tab: "painel",
  painel: {},
  sites: { q: "", situacao: "", saude: "", versao: "", sort: { col: "nome", dir: "asc" } },
  eventos: { q: "", status: "", plataforma: "", checagem: "", versao: "", sort: { col: "ano", dir: "desc" } },
  remodelar: { q: "", tipo: "", nv: "" },
  prospectos: { q: "", saude: "", sort: { col: "mrr", dir: "desc" } },
};

const VIEW = { sites: [], eventos: [], remodelar: [], prospectos: [] };

const PAGES = {
  painel: {
    title: "Dashboard",
    sub: "A carteira de sites num relance: o que está no ar, o que falta migrar e o que precisa de atenção.",
    add: "Novo site",
  },
  sites: {
    title: "Sites",
    sub: "Os sites de associação da Softaliza, com situação, saúde e histórico.",
    add: "Novo site",
  },
  eventos: {
    title: "Eventos",
    sub: "Os sites de congressos e eventos, com ano e status de cada um.",
    add: "Novo site",
  },
  remodelar: {
    title: "Remodelar",
    sub: "Os sites marcados para remodelar, ordenados por MRR — quem paga mais entra primeiro.",
    add: "Novo site",
  },
  prospectos: {
    title: "Sem site conosco",
    sub: "Associações do SoftaHub que ainda não têm site com a Softaliza — e poderiam ter.",
    add: "Novo site",
  },
};

// ---------------------------------------------------------------------------
// Opções e rótulos
// ---------------------------------------------------------------------------

const PLATAFORMA_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "personalizado", label: "Personalizado" },
  { value: "hotsite", label: "Hotsite" },
];

const SITUACAO_OPTIONS = [
  { value: "pronto", label: "Pronto" },
  { value: "remodelar", label: "Remodelar" },
  { value: "construcao", label: "Em construção" },
  { value: "desativado", label: "Desativado" },
];
const SITUACAO_META = {
  pronto: { label: "Pronto", cls: "b-ok" },
  remodelar: { label: "Remodelar", cls: "b-warn" },
  construcao: { label: "Em construção", cls: "b-accent" },
  desativado: { label: "Desativado", cls: "b-off" },
};
const SITUACAO_ORDER = { remodelar: 0, construcao: 1, pronto: 2, desativado: 3 };

const TIPO_OPTIONS = [
  { value: "associacao", label: "Associação" },
  { value: "evento", label: "Evento" },
];

const NV_OPTIONS = [
  { value: "nao", label: "Não" },
  { value: "pendente", label: "Pendente" },
  { value: "validacao", label: "Em validação" },
  { value: "migrado", label: "Migrado" },
];
const NV_ORDER = { pendente: 0, validacao: 1, migrado: 2, nao: 3 };

const STATUS_EVENTO_OPTIONS = [
  { value: "a_acontecer", label: "A acontecer" },
  { value: "acontecendo", label: "Acontecendo" },
  { value: "realizado", label: "Realizado" },
];
const STATUS_EVENTO_LABEL = { a_acontecer: "a acontecer", acontecendo: "acontecendo", realizado: "realizado" };

const SAUDE_META = {
  saudavel: { label: "Saudável", cls: "b-ok" },
  atencao: { label: "Atenção", cls: "b-warn" },
  risco: { label: "Risco", cls: "b-risk" },
  cancelado: { label: "Cancelado", cls: "b-off" },
};
const SAUDE_ORDER = { risco: 0, atencao: 1, saudavel: 2, cancelado: 3 };

const ENCONTRAVEL_META = {
  forte: { label: "SEO Pronto", cls: "b-ok", ordem: 0 },
  provavel: { label: "SEO Bom", cls: "b-accent", ordem: 1 },
  fraco: { label: "SEO Configurando", cls: "b-warn", ordem: 2 },
  nao: { label: "Sem SEO", cls: "b-risk", ordem: 3 },
};
const ENCONTRAVEL_OPTIONS = [
  { value: "forte", label: "SEO Pronto" },
  { value: "provavel", label: "SEO Bom" },
  { value: "fraco", label: "SEO Configurando" },
  { value: "nao", label: "Sem SEO" },
];

// endereço em softaliza.com.br deve pedir noindex; domínio próprio, o contrário
const CONFORMIDADE_META = {
  ok: { label: "Correto", cls: "b-ok" },
  fechar: { label: "Fechar", cls: "b-warn", dica: "endereço softaliza aberto — deveria pedir noindex" },
  abrir: { label: "Liberar", cls: "b-risk", dica: "domínio próprio bloqueado — deveria indexar" },
  "fora-do-ar": { label: "Fora do ar", cls: "b-none", dica: "não dá para avaliar" },
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

function badge(meta, extra) {
  if (!meta) return '<span class="badge b-none">—</span>';
  return `<span class="badge ${meta.cls}"${extra ? ` title="${esc(extra)}"` : ""}><i></i>${meta.label}</span>`;
}

const ICON = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/></svg>',
  tirar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  detail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z"/></svg>',
};

const AV_HUES = [172, 196, 224, 258, 130, 42, 16, 338];

function avatarHue(text) {
  const s = text || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_HUES[h % AV_HUES.length];
}

function initials(text) {
  return (text || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

function avatar(nome) {
  return `<span class="avatar" style="--av:${avatarHue(nome)}" aria-hidden="true">${esc(initials(nome))}</span>`;
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
  return `<label class="switch"><input type="checkbox" class="${cls}" ${dataAttr} ${checked ? "checked" : ""} /><span class="track"></span></label>`;
}

function emptyRow(cols, title, msg) {
  return `<tr class="empty-row"><td colspan="${cols}"><div class="empty"><div class="empty-icon">${ICON.inbox}</div><h3>${title}</h3><p>${msg}</p></div></td></tr>`;
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
    .map((s) => `<span class="comp-key"><i class="${s.cls}"></i>${s.label} <b>${s.count}</b><span class="muted">${Math.round((s.count / base) * 100)}%</span></span>`)
    .join("");
  return `<div class="composition">
    <div class="comp-head"><span class="comp-title">${title}</span><span class="comp-total">${total}</span></div>
    <div class="comp-bar">${bar}</div>
    <div class="comp-legend">${legend}</div>
  </div>`;
}

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);
const moeda = (v) => currency.format(Math.round(v || 0));

function estagioMeta(s) {
  if (!emSoftaliza(s)) return { label: "Domínio próprio", cls: "b-ok" };
  return s.linkDefinitivo ? { label: "Link definitivo", cls: "b-accent" } : { label: "Versão inicial", cls: "b-warn" };
}

// Endereço em softaliza.com.br é a versão inicial: o site ainda não foi migrado
// para domínio próprio. A exceção é o cliente ter escolhido ficar com o link —
// aí o endereço continua softaliza, mas a migração está encerrada.
const ehSoftaliza = (u) => /(^|\/\/|\.)softaliza\.com\.br/i.test(u || "");
const emSoftaliza = (s) => ehSoftaliza(s.url) || ehSoftaliza(s.seo && s.seo.urlFinal);
const versaoInicial = (s) => emSoftaliza(s) && !s.linkDefinitivo;

// cada checagem vale o que foi marcado à mão; na ausência, o que a varredura viu
function checagem(s, qual) {
  const manual = s.checagemManual && s.checagemManual[qual];
  if (manual != null) return { valor: manual, manual: true };
  if (qual === "ar") return { valor: s.noAr, manual: false };
  if (qual === "rodape") return { valor: s.noAr === false ? null : s.rodapeSoftaliza, manual: false };
  return { valor: s.seo ? s.seo.encontravel !== "nao" && s.seo.encontravel !== "fraco" : null, manual: false };
}

// As três checagens, clicáveis: cada clique cicla automático → sim → não.
// Marcado à mão ganha ponto, para distinguir do que veio da varredura.
const CHECK_ROTULO = {
  ar: { sim: "No ar", nao: "Fora do ar", vazio: "Ar ?" },
  rodape: { sim: "Rodapé", nao: "Sem rodapé", vazio: "Rodapé ?" },
  seo: { sim: "SEO ok", nao: "SEO ruim", vazio: "SEO ?" },
};

function checkHtml(s, qual, k) {
  const { valor, manual } = checagem(s, qual);
  const r = CHECK_ROTULO[qual];
  const cls = valor == null ? "c-unk" : valor ? "c-ok" : qual === "rodape" ? "c-warn" : "c-bad";
  const texto = valor == null ? r.vazio : valor ? r.sim : r.nao;
  const origem = manual ? "marcado à mão" : s.verificadoEm ? `da varredura de ${s.verificadoEm}` : "sem checagem";
  return `<button type="button" class="check ${cls}${manual ? " c-man" : ""}" data-check="${qual}" ${k}
    title="${esc(`${texto} · ${origem} · clique para alternar`)}"><i></i>${texto}</button>`;
}

function checksHtml(s, k) {
  return `<div class="checks">${checkHtml(s, "ar", k)}${checkHtml(s, "rodape", k)}${checkHtml(s, "seo", k)}</div>`;
}

// automático → sim → não → automático
function ciclarChecagem(s, qual) {
  const atual = s.checagemManual[qual];
  const proximo = atual == null ? true : atual === true ? false : null;
  s.checagemManual[qual] = proximo;
  const nome = { ar: "Disponibilidade", rodape: "Rodapé", seo: "SEO" }[qual];
  registrar(s, proximo == null ? `${nome}: voltou a seguir a varredura.` : `${nome}: marcado à mão como ${proximo ? "ok" : "problema"}.`);
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

const ADD_FIELDS = [
  { name: "nome", label: "Nome ou sigla", ph: "ex.: ABC ou Congresso Brasileiro de…", required: true },
  { name: "nomeCompleto", label: "Nome completo", ph: "Opcional" },
  { name: "url", label: "Endereço", ph: "ex.: abc.org.br", required: true },
  { name: "tipo", label: "Tipo", options: TIPO_OPTIONS },
  { name: "plataforma", label: "Plataforma", options: PLATAFORMA_OPTIONS },
];

function criarSite(v) {
  const url = v.url.trim();
  const repetido = SITES.find((s) => !s.removido && displayLink(s.url).toLowerCase() === displayLink(url).toLowerCase());
  if (repetido) return { error: `"${repetido.nome}" já usa esse endereço.` };

  const s = normalizarSite({
    id: `manual:${Date.now().toString(36)}`,
    tipo: v.tipo,
    nome: v.nome.trim(),
    nomeCompleto: v.nomeCompleto.trim() || null,
    url,
    plataforma: v.plataforma,
    situacao: v.plataforma === "wordpress" ? "remodelar" : "construcao",
    statusEvento: v.tipo === "evento" ? "a_acontecer" : null,
    ano: v.tipo === "evento" ? ANO_ATUAL : null,
    manual: true,
    historico: [{ em: hoje(), texto: "Cadastrado à mão no painel." }],
  });
  SITES.push(s);
  salvarSite(s);
  renderTudo();
  return { message: `"${s.nome}" entrou nos sites.`, id: s.id };
}

let ADD_PREFILL = null;

function openAddDialog(prefill) {
  ADD_PREFILL = prefill || null;
  const dlg = document.getElementById("dlg-add");
  const body = document.getElementById("dlg-add-body");
  body.innerHTML =
    ADD_FIELDS.map((f) => {
      const val = (prefill && prefill[f.name]) || "";
      const controle = f.options
        ? `<select id="add-${f.name}" name="${f.name}">${f.options.map((o) => `<option value="${o.value}" ${o.value === val ? "selected" : ""}>${o.label}</option>`).join("")}</select>`
        : `<input type="text" id="add-${f.name}" name="${f.name}" value="${esc(val)}" placeholder="${esc(f.ph || "")}" autocomplete="off" />`;
      return `<div class="field"><label for="add-${f.name}">${f.label}</label>${controle}</div>`;
    }).join("") + '<div class="modal-error" id="dlg-add-error"></div>';
  dlg.showModal();
  const first = body.querySelector("input");
  if (first) first.focus();
}

function submitAddDialog() {
  const dlg = document.getElementById("dlg-add");
  const errorBox = document.getElementById("dlg-add-error");
  const values = {};
  ADD_FIELDS.forEach((f) => (values[f.name] = (document.getElementById(`add-${f.name}`).value || "").trim()));

  const missing = ADD_FIELDS.find((f) => f.required && !values[f.name]);
  if (missing) {
    errorBox.textContent = `Preencha o campo "${missing.label}".`;
    errorBox.classList.add("on");
    document.getElementById(`add-${missing.name}`).focus();
    return;
  }
  const result = criarSite(values);
  if (result.error) {
    errorBox.textContent = result.error;
    errorBox.classList.add("on");
    return;
  }
  errorBox.classList.remove("on");
  dlg.close();
  toast(result.message);
  // leva para a aba Sites, com o novo já visível e aberto no detalhe
  setTab("sites");
  openDrawer(result.id);
}

// ---------------------------------------------------------------------------
// Ordenação
// ---------------------------------------------------------------------------

function ordenar(list, sort) {
  const dir = sort.dir === "desc" ? -1 : 1;
  const col = sort.col;
  return [...list].sort((a, b) => {
    let x;
    let y;
    if (col === "mrr") {
      x = a.mrr == null ? -1 : a.mrr;
      y = b.mrr == null ? -1 : b.mrr;
    } else if (col === "saude") {
      x = SAUDE_ORDER[a.saude] ?? 9;
      y = SAUDE_ORDER[b.saude] ?? 9;
    } else if (col === "statusEvento") {
      const ORD = { acontecendo: 0, a_acontecer: 1, realizado: 2 };
      x = ORD[a.statusEvento] ?? 9;
      y = ORD[b.statusEvento] ?? 9;
    } else if (col === "ano") {
      x = a.ano == null ? -1 : a.ano;
      y = b.ano == null ? -1 : b.ano;
    } else if (col === "situacao") {
      x = SITUACAO_ORDER[a.situacao] ?? 9;
      y = SITUACAO_ORDER[b.situacao] ?? 9;
    } else if (col === "seo") {
      x = a.seo ? ENCONTRAVEL_META[a.seo.encontravel].ordem : 9;
      y = b.seo ? ENCONTRAVEL_META[b.seo.encontravel].ordem : 9;
      // pior primeiro quando ascendente, que é o que se quer olhar
      x = -x;
      y = -y;
    } else {
      x = (a[col] || "").toString().toLowerCase();
      y = (b[col] || "").toString().toLowerCase();
    }
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return (a.nome || a.sigla || "").localeCompare(b.nome || b.sigla || "", "pt-BR");
  });
}

const ativos = () => SITES.filter((s) => !s.removido);
// as abas são recortes por tipo: Sites é associação, Eventos é evento
const associacoes = () => ativos().filter((s) => s.tipo === "associacao");
const buscaBate = (s, q) => !q || `${s.nome} ${s.nomeCompleto || ""} ${s.url}`.toLowerCase().includes(q);

// ---------------------------------------------------------------------------
// Dashboard
//
// Cada recorte é um cartão que leva para a aba correspondente já filtrada —
// o número é sempre clicável, nunca um beco sem saída.
// ---------------------------------------------------------------------------

// leva para uma aba com os filtros já postos
function irPara(tab, filtros) {
  Object.assign(STATE[tab], filtros);
  setTab(tab);
  // reflete nos chips para a tela não mentir sobre o que está filtrando
  document.querySelectorAll(`#panel-${tab} .chips`).forEach((box) => {
    const chips = [...box.querySelectorAll(".chip")];
    const alvo = chips.find((c) => Object.values(filtros).includes(c.dataset.value) && c.dataset.value !== "");
    const vazio = chips.find((c) => c.dataset.value === "");
    const escolhido = alvo || vazio;
    chips.forEach((c) => c.classList.toggle("on", c === escolhido));
  });
}

function cartao(c) {
  return `<button type="button" class="cartao${c.tom ? ` t-${c.tom}` : ""}" data-ir="${esc(JSON.stringify(c.ir))}">
    <span class="cartao-num">${c.valor}</span>
    <span class="cartao-rot">${c.rotulo}</span>
    <span class="cartao-sub">${c.sub}</span>
  </button>`;
}

function renderPainel() {
  const lista = ativos();
  const total = lista.length;
  const assoc = lista.filter((s) => s.tipo === "associacao");
  const eventos = lista.filter((s) => s.tipo === "evento");
  const inicial = lista.filter(versaoInicial);
  const definitivo = lista.filter((s) => emSoftaliza(s) && s.linkDefinitivo);
  const proprio = lista.filter((s) => !emSoftaliza(s));

  const foraDoAr = lista.filter((s) => checagem(s, "ar").valor === false);
  const semRodape = lista.filter((s) => checagem(s, "ar").valor !== false && checagem(s, "rodape").valor === false);
  const semSeo = lista.filter((s) => checagem(s, "seo").valor === false);
  const comProblema = lista.filter(
    (s) => checagem(s, "ar").valor === false || checagem(s, "rodape").valor === false || checagem(s, "seo").valor === false
  );
  const indexacaoFora = lista.filter((s) => s.seo && (s.seo.conformidade === "fechar" || s.seo.conformidade === "abrir"));

  document.getElementById("painel-metrics").innerHTML = metricsHtml([
    { label: "Sites no total", value: total, note: `${assoc.length} de associações · ${eventos.length} de eventos` },
    { label: "Com algum problema", value: comProblema.length, dot: "d-risk", note: `${pct(comProblema.length, total)}% da carteira` },
    { label: "Em versão inicial", value: inicial.length, dot: "d-warn", note: "Ainda em softaliza.com.br" },
    { label: "Já migrados", value: proprio.length, dot: "d-ok", note: `${definitivo.length} ficaram com o link por escolha` },
  ]);

  document.getElementById("painel-composition").innerHTML =
    compositionHtml("Estágio da migração", [
      { cls: "s-ok", label: "Domínio próprio", count: proprio.length },
      { cls: "s-accent", label: "Link definitivo", count: definitivo.length },
      { cls: "s-warn", label: "Versão inicial", count: inicial.length },
    ]) +
    compositionHtml("Situação", [
      { cls: "s-ok", label: "Pronto", count: lista.filter((s) => s.situacao === "pronto").length },
      { cls: "s-warn", label: "Remodelar", count: lista.filter((s) => s.situacao === "remodelar").length },
      { cls: "s-accent", label: "Em construção", count: lista.filter((s) => s.situacao === "construcao").length },
      { cls: "s-off", label: "Desativado", count: lista.filter((s) => s.situacao === "desativado").length },
    ]);

  // Sem uma aba que liste os dois tipos juntos, cada cartão conta o que a aba
  // de destino mostra, e o subtítulo diz quanto do mesmo problema está do
  // outro lado — assim o número nunca mente sobre o que vem na tela.
  const zeraSites = { saude: "", situacao: "", versao: "", q: "" };
  const zeraEventos = { status: "", plataforma: "", checagem: "", versao: "", q: "" };
  const porTipo = (fn) => [assoc.filter(fn).length, eventos.filter(fn).length];

  const [arA, arE] = porTipo((s) => checagem(s, "ar").valor === false);
  const [seoA, seoE] = porTipo((s) => checagem(s, "seo").valor === false);
  const [rodA, rodE] = porTipo((s) => checagem(s, "ar").valor !== false && checagem(s, "rodape").valor === false);
  const [idxA, idxE] = porTipo((s) => s.seo && (s.seo.conformidade === "fechar" || s.seo.conformidade === "abrir"));

  document.getElementById("painel-alertas").innerHTML = [
    { valor: arA, rotulo: "Associações fora do ar", sub: `${arE} eventos também fora do ar`, tom: "risco", ir: ["sites", { ...zeraSites, saude: "fora-do-ar" }] },
    { valor: seoA, rotulo: "Associações sem SEO", sub: `${seoE} eventos também sem SEO`, tom: "risco", ir: ["sites", { ...zeraSites, saude: "sem-seo" }] },
    { valor: rodA, rotulo: "Associações sem rodapé", sub: `${rodE} eventos também sem o crédito`, tom: "aviso", ir: ["sites", { ...zeraSites, saude: "sem-rodape" }] },
    { valor: idxA, rotulo: "Indexação fora da regra", sub: `${idxE} eventos também fora da regra`, tom: "aviso", ir: ["sites", { ...zeraSites, saude: "indexacao" }] },
  ]
    .map(cartao)
    .join("");

  document.getElementById("painel-recortes").innerHTML = [
    { valor: assoc.length, rotulo: "Sites de associações", sub: `${assoc.filter(versaoInicial).length} em versão inicial`, ir: ["sites", zeraSites] },
    { valor: eventos.length, rotulo: "Sites de eventos", sub: `${eventos.filter(versaoInicial).length} em versão inicial`, ir: ["eventos", zeraEventos] },
    { valor: assoc.filter(versaoInicial).length, rotulo: "Associações em versão inicial", sub: `${eventos.filter(versaoInicial).length} eventos também`, tom: "aviso", ir: ["sites", { ...zeraSites, versao: "inicial" }] },
    { valor: definitivo.length, rotulo: "Link definitivo", sub: "Cliente escolheu ficar no softaliza", tom: "accent", ir: ["sites", { ...zeraSites, versao: "definitivo" }] },
    { valor: fila().filter((s) => s.novaVersao === "pendente").length, rotulo: "Para remodelar", sub: `${fila().filter((s) => s.novaVersao === "validacao").length} em validação`, tom: "aviso", ir: ["remodelar", { nv: "pendente", tipo: "", q: "" }] },
    { valor: assoc.filter((s) => s.situacao === "pronto").length, rotulo: "Associações prontas", sub: `${eventos.filter((s) => s.situacao === "pronto").length} eventos também prontos`, tom: "ok", ir: ["sites", { ...zeraSites, situacao: "pronto" }] },
    { valor: prospectosAtuais().length, rotulo: "Sem site conosco", sub: "Associações que poderiam ter", ir: ["prospectos", { saude: "", q: "" }] },
  ]
    .map(cartao)
    .join("");

  renderNavCounts();
}

function handlePainelClick(ev) {
  const b = ev.target.closest("button[data-ir]");
  if (!b) return;
  const [tab, filtros] = JSON.parse(b.dataset.ir);
  irPara(tab, filtros);
}

// ---------------------------------------------------------------------------
// Aba: Sites
// ---------------------------------------------------------------------------

function renderSitesMetrics(list) {
  const total = list.length;
  const prontos = list.filter((s) => s.situacao === "pronto").length;
  const remodelar = list.filter((s) => s.situacao === "remodelar").length;
  const foraDoAr = list.filter((s) => s.noAr === false).length;
  const semRodape = list.filter((s) => s.noAr && s.rodapeSoftaliza === false).length;
  const mrr = list.reduce((a, s) => a + (s.mrr || 0), 0);

  document.getElementById("sites-metrics").innerHTML = metricsHtml([
    { label: "Sites", value: total, note: `${list.filter(versaoInicial).length} ainda em versão inicial` },
    { label: "Prontos", value: prontos, dot: "d-ok", note: `${pct(prontos, total)}% do recorte` },
    { label: "Para remodelar", value: remodelar, dot: "d-warn", note: `${moeda(mrr)} de MRR no recorte` },
    { label: "Fora do ar", value: foraDoAr, dot: "d-risk", note: `${semRodape} no ar sem o rodapé` },
  ]);

  document.getElementById("sites-composition").innerHTML =
    compositionHtml("Situação", [
      { cls: "s-ok", label: "Pronto", count: prontos },
      { cls: "s-warn", label: "Remodelar", count: remodelar },
      { cls: "s-accent", label: "Em construção", count: list.filter((s) => s.situacao === "construcao").length },
      { cls: "s-off", label: "Desativado", count: list.filter((s) => s.situacao === "desativado").length },
    ]) +
    compositionHtml("Plataforma", [
      { cls: "s-off", label: "WordPress", count: list.filter((s) => s.plataforma === "wordpress").length },
      { cls: "s-accent", label: "Personalizado", count: list.filter((s) => s.plataforma === "personalizado").length },
      { cls: "s-ok", label: "Hotsite", count: list.filter((s) => s.plataforma === "hotsite").length },
    ]);
}

function identCell(s) {
  const sub = s.tipo === "evento" ? `evento${s.statusEvento ? ` · ${STATUS_EVENTO_LABEL[s.statusEvento]}` : ""}${s.ano ? ` · ${s.ano}` : ""}` : "associação";
  return `<div class="ident">
    ${avatar(s.nome)}
    <div class="ident-fields">
      <span class="seo-nome">${esc(s.nome)}</span>
      <span class="f-sub" style="padding:0 1px">${esc(s.nomeCompleto || "")}</span>
      <span class="tipo-tag">${sub}</span>
    </div>
  </div>`;
}

function renderSitesTable(list) {
  const tbody = document.getElementById("sites-table-body");
  if (!list.length) {
    tbody.innerHTML = emptyRow(7, "Nada por aqui", "Nenhum site bate com esses filtros. Use “Novo site” para cadastrar.");
    return;
  }
  tbody.innerHTML = list
    .map((s) => {
      const k = `data-id="${esc(s.id)}"`;
      return `<tr class="abre" ${k}>
        <td class="ident-td" data-l="Site">${identCell(s)}</td>
        <td data-l="Plataforma">${selectField("s-plataforma", k, s.plataforma, PLATAFORMA_OPTIONS)}</td>
        <td data-l="Situação">${selectField(`nv-select sit-${s.situacao} s-situacao`, k, s.situacao, SITUACAO_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("s-url", k, s.url)}</td>
        <td data-l="Checagens">${checksHtml(s, k)}</td>
        <td class="num" data-l="MRR">${s.mrr != null ? moeda(s.mrr) : '<span class="muted">—</span>'}</td>
        <td class="actions" data-l="">
          <button class="mini" type="button" data-act="detail" ${k} title="Detalhes e histórico" aria-label="Detalhes">${ICON.detail}</button>
          <button class="mini danger" type="button" data-act="del" ${k} title="Excluir" aria-label="Excluir">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderSites() {
  const st = STATE.sites;
  const filtered = associacoes().filter((s) => {
    if (!buscaBate(s, st.q)) return false;
    if (st.situacao && s.situacao !== st.situacao) return false;
    if (st.saude === "fora-do-ar" && checagem(s, "ar").valor !== false) return false;
    if (st.saude === "sem-rodape" && !(checagem(s, "ar").valor !== false && checagem(s, "rodape").valor === false)) return false;
    if (st.saude === "sem-seo" && checagem(s, "seo").valor !== false) return false;
    if (st.saude === "indexacao" && !(s.seo && (s.seo.conformidade === "fechar" || s.seo.conformidade === "abrir"))) return false;
    if (st.versao === "inicial" && !versaoInicial(s)) return false;
    if (st.versao === "definitivo" && !(emSoftaliza(s) && s.linkDefinitivo)) return false;
    if (st.versao === "proprio" && emSoftaliza(s)) return false;
    return true;
  });
  const sorted = ordenar(filtered, st.sort);
  VIEW.sites = sorted;
  renderSitesMetrics(sorted);
  renderSitesTable(sorted);
  syncTableFit();
  const total = associacoes().length;
  document.getElementById("sites-count").textContent = sorted.length === total ? `${total} no total` : `${sorted.length} de ${total}`;
  renderNavCounts();
}

function siteDe(el) {
  const id = el.dataset.id;
  return id ? SITES.find((s) => s.id === id) : null;
}

function handleSitesEdit(ev) {
  const el = ev.target;
  const s = siteDe(el);
  if (!s) return;
  if (el.classList.contains("s-plataforma")) {
    registrar(s, `Plataforma: ${labelOf(PLATAFORMA_OPTIONS, s.plataforma)} → ${labelOf(PLATAFORMA_OPTIONS, el.value)}.`);
    s.plataforma = el.value;
  } else if (el.classList.contains("s-situacao")) {
    registrar(s, `Situação: ${SITUACAO_META[s.situacao].label} → ${SITUACAO_META[el.value].label}.`);
    s.situacao = el.value;
    if (el.value === "remodelar" && s.foraDaFila) {
      s.foraDaFila = false;
      registrar(s, "Devolvido à fila, pela situação voltar a Remodelar.");
    }
  } else if (el.classList.contains("s-url")) {
    registrar(s, `Endereço: ${s.url || "(vazio)"} → ${el.value || "(vazio)"}.`);
    s.url = el.value;
    salvarSite(s);
    refreshLinkButtons(el);
    return;
  } else return;
  salvarSite(s);
  renderTudo();
}

async function handleSitesClick(ev) {
  const chk = ev.target.closest("button[data-check]");
  if (chk) {
    const s = siteDe(chk);
    if (!s) return;
    ciclarChecagem(s, chk.dataset.check);
    salvarSite(s);
    renderTudo();
    if (DRAWER_ID === s.id) renderDrawer(s);
    return;
  }
  const btn = ev.target.closest("button[data-act]");
  if (btn) {
    const s = siteDe(btn);
    if (!s) return;
    if (btn.dataset.act === "open") return openLink(s.url);
    if (btn.dataset.act === "copy") return copyLink(s.url);
    if (btn.dataset.act === "detail") return openDrawer(s.id);
    if (btn.dataset.act === "del") return excluirSite(s);
    return;
  }
  // clique na linha, fora de campo, abre o detalhe
  if (ev.target.closest("input, select, a, label, button")) return;
  const tr = ev.target.closest("tr[data-id]");
  if (tr) openDrawer(tr.dataset.id);
}

async function excluirSite(s) {
  const ok = await confirmDialog("Excluir site", `"${s.nome}" sai do painel. O registro continua no banco, marcado como removido.`, "Excluir");
  if (!ok) return;
  s.removido = true;
  registrar(s, "Removido do painel.");
  salvarSite(s);
  closeDrawer();
  renderTudo();
  toast(`"${s.nome}" excluído.`);
}

// ---------------------------------------------------------------------------
// Aba: Eventos
//
// O mesmo registro de site, numa visão só dos eventos — com ano e status, que
// é o que distingue um site de evento dos demais.
// ---------------------------------------------------------------------------

const eventos = () => ativos().filter((s) => s.tipo === "evento");

function renderEventosMetrics(list) {
  const total = list.length;
  const aAcontecer = list.filter((s) => s.statusEvento === "a_acontecer").length;
  const acontecendo = list.filter((s) => s.statusEvento === "acontecendo").length;
  const realizado = list.filter((s) => s.statusEvento === "realizado").length;
  const noAr = list.filter((s) => checagem(s, "ar").valor).length;
  const inicial = list.filter(versaoInicial).length;

  document.getElementById("eventos-metrics").innerHTML = metricsHtml([
    { label: "Sites de eventos", value: total, note: `${new Set(list.map((s) => s.ano).filter(Boolean)).size} anos diferentes` },
    { label: "Ativos", value: aAcontecer + acontecendo, dot: "d-warn", note: `${acontecendo} acontecendo agora` },
    { label: "No ar", value: noAr, dot: "d-ok", note: `${total - noAr} fora do ar ou sem checagem` },
    { label: "Em versão inicial", value: inicial, dot: "d-accent", note: "Ainda em softaliza.com.br" },
  ]);

  const porAno = {};
  list.forEach((s) => {
    const a = s.ano || "sem ano";
    porAno[a] = (porAno[a] || 0) + 1;
  });
  const cores = ["s-ok", "s-accent", "s-warn", "s-off", "s-risk"];

  document.getElementById("eventos-composition").innerHTML =
    compositionHtml("Status", [
      { cls: "s-ok", label: "Acontecendo", count: acontecendo },
      { cls: "s-warn", label: "A acontecer", count: aAcontecer },
      { cls: "s-off", label: "Realizado", count: realizado },
    ]) +
    compositionHtml(
      "Por ano",
      Object.keys(porAno)
        .sort()
        .map((a, i) => ({ cls: cores[i % cores.length], label: String(a), count: porAno[a] }))
    );
}

function renderEventosTable(list) {
  const tbody = document.getElementById("eventos-table-body");
  if (!list.length) {
    tbody.innerHTML = emptyRow(7, "Nenhum evento", "Nenhum site de evento bate com esses filtros.");
    return;
  }
  tbody.innerHTML = list
    .map((s) => {
      const k = `data-id="${esc(s.id)}"`;
      return `<tr class="abre" ${k}>
        <td class="ident-td" data-l="Evento">${identCell(s)}</td>
        <td class="num" data-l="Ano"><input class="f f-num e-ano" type="text" inputmode="numeric" maxlength="4" ${k} value="${esc(s.ano)}" placeholder="${ANO_ATUAL}" /></td>
        <td data-l="Status">${selectField("e-status", k, s.statusEvento || "a_acontecer", STATUS_EVENTO_OPTIONS)}</td>
        <td data-l="Plataforma">${selectField("e-plataforma", k, s.plataforma, PLATAFORMA_OPTIONS)}</td>
        <td data-l="Endereço">${linkCell("e-url", k, s.url)}</td>
        <td data-l="Checagens">${checksHtml(s, k)}</td>
        <td class="actions" data-l="">
          <button class="mini" type="button" data-act="detail" ${k} title="Detalhes e histórico" aria-label="Detalhes">${ICON.detail}</button>
          <button class="mini danger" type="button" data-act="del" ${k} title="Excluir" aria-label="Excluir">${ICON.trash}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderEventos() {
  const st = STATE.eventos;
  const todos = eventos();
  const filtered = todos.filter((s) => {
    if (!buscaBate(s, st.q) && !String(s.ano || "").includes(st.q)) return false;
    if (st.status && s.statusEvento !== st.status) return false;
    if (st.plataforma && s.plataforma !== st.plataforma) return false;
    if (st.checagem === "fora-do-ar" && checagem(s, "ar").valor !== false) return false;
    if (st.checagem === "sem-rodape" && !(checagem(s, "ar").valor !== false && checagem(s, "rodape").valor === false)) return false;
    if (st.checagem === "sem-seo" && checagem(s, "seo").valor !== false) return false;
    if (st.checagem === "indexacao" && !(s.seo && (s.seo.conformidade === "fechar" || s.seo.conformidade === "abrir"))) return false;
    if (st.versao === "inicial" && !versaoInicial(s)) return false;
    if (st.versao === "definitivo" && !(emSoftaliza(s) && s.linkDefinitivo)) return false;
    if (st.versao === "proprio" && emSoftaliza(s)) return false;
    return true;
  });
  const sorted = ordenar(filtered, st.sort);
  VIEW.eventos = sorted;
  renderEventosMetrics(sorted);
  renderEventosTable(sorted);
  syncTableFit();
  document.getElementById("eventos-count").textContent = sorted.length === todos.length ? `${todos.length} no total` : `${sorted.length} de ${todos.length}`;
  renderNavCounts();
}

function handleEventosEdit(ev) {
  const el = ev.target;
  const s = siteDe(el);
  if (!s) return;
  if (el.classList.contains("e-ano")) {
    const d = el.value.replace(/[^\d]/g, "").slice(0, 4);
    s.ano = d ? Number(d) : ANO_ATUAL;
  } else if (el.classList.contains("e-status")) {
    registrar(s, `Status do evento: ${STATUS_EVENTO_LABEL[s.statusEvento] || "—"} → ${STATUS_EVENTO_LABEL[el.value]}.`);
    s.statusEvento = el.value;
  } else if (el.classList.contains("e-plataforma")) {
    registrar(s, `Plataforma: ${labelOf(PLATAFORMA_OPTIONS, s.plataforma)} → ${labelOf(PLATAFORMA_OPTIONS, el.value)}.`);
    s.plataforma = el.value;
  } else if (el.classList.contains("e-url")) {
    registrar(s, `Endereço: ${s.url || "(vazio)"} → ${el.value || "(vazio)"}.`);
    s.url = el.value;
    salvarSite(s);
    refreshLinkButtons(el);
    return;
  } else return;
  salvarSite(s);
  renderTudo();
}

async function handleEventosClick(ev) {
  const chk = ev.target.closest("button[data-check]");
  if (chk) {
    const s = siteDe(chk);
    if (!s) return;
    ciclarChecagem(s, chk.dataset.check);
    salvarSite(s);
    renderTudo();
    if (DRAWER_ID === s.id) renderDrawer(s);
    return;
  }
  const btn = ev.target.closest("button[data-act]");
  if (btn) {
    const s = siteDe(btn);
    if (!s) return;
    if (btn.dataset.act === "open") return openLink(s.url);
    if (btn.dataset.act === "copy") return copyLink(s.url);
    if (btn.dataset.act === "detail") return openDrawer(s.id);
    if (btn.dataset.act === "del") return excluirSite(s);
    return;
  }
  if (ev.target.closest("input, select, a, label, button")) return;
  const tr = ev.target.closest("tr[data-id]");
  if (tr) openDrawer(tr.dataset.id);
}

// ---------------------------------------------------------------------------
// Aba: Remodelar
// ---------------------------------------------------------------------------

const fila = () => ativos().filter((s) => !s.foraDaFila && (s.situacao === "remodelar" || s.novaVersao === "validacao" || s.novaVersao === "migrado"));

function rankBadge(rank) {
  const cls = rank <= 3 ? " r-top" : rank <= 10 ? " r-mid" : "";
  return `<span class="rank${cls}">${rank}º</span>`;
}

function renderRemodelarMetrics(lista) {
  const total = lista.length;
  const migrados = lista.filter((s) => s.novaVersao === "migrado").length;
  const validacao = lista.filter((s) => s.novaVersao === "validacao").length;
  const pendentes = lista.filter((s) => s.novaVersao === "pendente").length;
  const nao = lista.filter((s) => s.novaVersao === "nao").length;
  const previstas = total - nao;
  const mrrPendente = lista.filter((s) => s.novaVersao === "pendente").reduce((a, s) => a + (s.mrr || 0), 0);

  document.getElementById("remodelar-metrics").innerHTML = metricsHtml([
    { label: "Na fila", value: total, dot: "d-warn", note: `${lista.filter((s) => s.tipo === "evento").length} eventos` },
    { label: "Pendentes", value: pendentes, dot: "d-warn", note: nao ? `${nao} marcada(s) como “Não”` : "Ainda no modelo antigo" },
    { label: "Em validação", value: validacao, dot: "d-accent", note: "Nova versão pronta, conferindo" },
    { label: "Migrados", value: migrados, dot: "d-ok", note: `${pct(migrados, previstas)}% do previsto` },
  ]);
  const prog = document.getElementById("remodelar-progress");
  prog.innerHTML = previstas
    ? `<div class="progress-track"><div class="progress-fill" style="width:${pct(migrados, previstas)}%"></div></div><span>${migrados}/${previstas} migrados${validacao ? ` · ${validacao} em validação` : ""}</span>`
    : "";
}

function renderRemodelarTable(list) {
  const tbody = document.getElementById("remodelar-table-body");
  if (!list.length) {
    tbody.innerHTML = emptyRow(7, "Fila vazia", "Nenhum site marcado para remodelar bate com esses filtros.");
    return;
  }
  tbody.innerHTML = list
    .map((s) => {
      const k = `data-id="${esc(s.id)}"`;
      const cls = s.novaVersao === "migrado" ? "done" : s.novaVersao === "nao" ? "skip" : "";
      return `<tr class="abre ${cls}" ${k}>
        <td data-l="Prioridade">${rankBadge(s._rank)}</td>
        <td class="ident-td" data-l="Site">${identCell(s)}</td>
        <td class="num" data-l="MRR"><input class="f f-num r-mrr" type="text" inputmode="decimal" ${k} value="${s.mrr != null ? s.mrr : ""}" placeholder="0" /></td>
        <td data-l="Endereço atual">${linkCell("r-url", k, s.url)}</td>
        <td data-l="Nova versão">${selectField(`nv-select nv-${s.novaVersao} r-nv`, k, s.novaVersao, NV_OPTIONS)}</td>
        <td data-l="Endereço novo">${linkCell("r-novo", k, s.enderecoNovo)}</td>
        <td class="actions" data-l="">
          <button class="mini" type="button" data-act="detail" ${k} title="Detalhes" aria-label="Detalhes">${ICON.detail}</button>
          <button class="mini danger" type="button" data-act="tirar" ${k} title="Tirar da fila de remodelação" aria-label="Tirar da fila">${ICON.tirar}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderRemodelar() {
  const st = STATE.remodelar;
  const lista = fila().sort((x, y) => (y.mrr || 0) - (x.mrr || 0));
  const ranked = lista.map((s, i) => ({ ...s, _rank: i + 1 }));
  const ordered = [...ranked].sort((a, b) => NV_ORDER[a.novaVersao] - NV_ORDER[b.novaVersao]);
  const filtered = ordered.filter((s) => buscaBate(s, st.q) && (!st.tipo || s.tipo === st.tipo) && (!st.nv || s.novaVersao === st.nv));
  VIEW.remodelar = filtered;
  renderRemodelarMetrics(lista);
  renderRemodelarTable(filtered);
  syncTableFit();
  document.getElementById("remodelar-count").textContent = filtered.length === lista.length ? `${lista.length} na fila` : `${filtered.length} de ${lista.length}`;
  renderNavCounts();
}

function handleRemodelarEdit(ev) {
  const el = ev.target;
  const s = siteDe(el);
  if (!s) return;
  if (el.classList.contains("r-nv")) {
    registrar(s, `Nova versão: ${labelOf(NV_OPTIONS, s.novaVersao)} → ${labelOf(NV_OPTIONS, el.value)}.`);
    s.novaVersao = el.value;
    if (el.value === "migrado" && s.situacao === "remodelar") {
      s.situacao = "pronto";
      registrar(s, "Situação: Remodelar → Pronto, pela migração concluída.");
    }
    salvarSite(s);
    renderTudo();
    toast({ feita: `Nova versão de "${s.nome}" feita.`, pendente: `"${s.nome}" voltou para pendente.`, nao: `"${s.nome}" marcada como “Não”.` }[el.value], "info");
    return;
  }
  if (el.classList.contains("r-novo")) {
    s.enderecoNovo = el.value;
    registrar(s, `Endereço novo: ${el.value || "(vazio)"}.`);
    salvarSite(s);
    refreshLinkButtons(el);
    return;
  }
  if (el.classList.contains("r-url")) {
    s.url = el.value;
    salvarSite(s);
    refreshLinkButtons(el);
    return;
  }
  if (el.classList.contains("r-mrr")) {
    const n = parseFloat(el.value.replace(/[^\d.,]/g, "").replace(",", "."));
    s.mrr = Number.isFinite(n) ? n : null;
    salvarSite(s);
    renderTudo();
  }
}

// Sai só da fila: o site continua em Sites ou Eventos, com tudo que tem.
async function tirarDaFila(s) {
  const onde = s.tipo === "evento" ? "Eventos" : "Sites";
  const ok = await confirmDialog(
    "Tirar da fila de remodelação",
    `"${s.nome}" sai desta aba e para de contar na fila. O site continua em ${onde}, com histórico e checagens — isto não exclui nada.`,
    "Tirar da fila"
  );
  if (!ok) return;
  s.foraDaFila = true;
  registrar(s, "Tirado da fila de remodelação.");
  salvarSite(s);
  if (DRAWER_ID === s.id) renderDrawer(s);
  renderTudo();
  toast(`"${s.nome}" saiu da fila.`);
}

function handleRemodelarClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (btn) {
    const s = siteDe(btn);
    if (!s) return;
    if (btn.dataset.act === "detail") return openDrawer(s.id);
    if (btn.dataset.act === "tirar") return tirarDaFila(s);
    const input = btn.parentElement.querySelector("input");
    const v = input ? input.value : "";
    if (btn.dataset.act === "open") return openLink(v);
    if (btn.dataset.act === "copy") return copyLink(v);
    return;
  }
  if (ev.target.closest("input, select, a, label")) return;
  const tr = ev.target.closest("tr[data-id]");
  if (tr) openDrawer(tr.dataset.id);
}

// ---------------------------------------------------------------------------
// Aba: Sem site conosco (prospecção)
// ---------------------------------------------------------------------------

// quem já virou site sai do quadro — casa pela sigla
function prospectosAtuais() {
  const siglasComSite = new Set(ativos().map((s) => (s.nome || "").toUpperCase()));
  return PROSPECTOS.filter((p) => !siglasComSite.has((p.sigla || "").toUpperCase()));
}

function renderProspectos() {
  const st = STATE.prospectos;
  const todos = prospectosAtuais();
  const filtered = todos.filter((p) => (!st.q || `${p.sigla} ${p.nome || ""}`.toLowerCase().includes(st.q)) && (!st.saude || p.saude === st.saude));
  const sorted = ordenar(filtered, st.sort);
  VIEW.prospectos = sorted;

  const mrr = sorted.reduce((a, p) => a + (p.mrr || 0), 0);
  document.getElementById("prospectos-metrics").innerHTML = metricsHtml([
    { label: "Sem site conosco", value: sorted.length, dot: "d-accent", note: `de ${todos.length} no quadro` },
    { label: "MRR dessas associações", value: moeda(mrr), money: true, note: "O que já pagam à Softaliza" },
    { label: "Saudáveis", value: sorted.filter((p) => p.saude === "saudavel").length, dot: "d-ok", note: "Melhor momento para oferecer" },
    { label: "Com site próprio", value: sorted.filter((p) => p.siteAtual).length, dot: "d-off", note: "Têm site, só não é conosco" },
  ]);

  const tbody = document.getElementById("prospectos-table-body");
  tbody.innerHTML = sorted.length
    ? sorted
        .map(
          (p) => `<tr>
        <td class="ident-td" data-l="Associação"><div class="ident">${avatar(p.sigla)}<div class="ident-fields"><span class="seo-nome">${esc(p.sigla)}</span><span class="f-sub" style="padding:0 1px">${esc(p.nome || "")}</span></div></div></td>
        <td data-l="Saúde">${badge(SAUDE_META[p.saude])}</td>
        <td class="num" data-l="MRR">${p.mrr != null ? moeda(p.mrr) : '<span class="muted">—</span>'}</td>
        <td data-l="Site atual deles">${p.siteAtual ? `<a class="seo-url" href="${esc(withProto(p.siteAtual))}" target="_blank" rel="noopener noreferrer">${esc(displayLink(p.siteAtual))}</a>` : '<span class="muted">nenhum</span>'}</td>
        <td class="actions" data-l=""><button class="btn-mini" type="button" data-sigla="${esc(p.sigla)}">${ICON.plus} Cadastrar site</button></td>
      </tr>`
        )
        .join("")
    : emptyRow(5, "Nada por aqui", "Nenhuma associação bate com esses filtros.");
  syncTableFit();
  document.getElementById("prospectos-count").textContent = sorted.length === todos.length ? `${todos.length} no total` : `${sorted.length} de ${todos.length}`;
  renderNavCounts();
}

function handleProspectosClick(ev) {
  const btn = ev.target.closest("button[data-sigla]");
  if (!btn) return;
  const p = PROSPECTOS.find((x) => x.sigla === btn.dataset.sigla);
  if (!p) return;
  openAddDialog({ nome: p.sigla, nomeCompleto: p.nome || "", url: p.siteAtual || "", tipo: "associacao", plataforma: "wordpress" });
}

// ---------------------------------------------------------------------------
// Painel de detalhe
// ---------------------------------------------------------------------------

let DRAWER_ID = null;

function openDrawer(id) {
  const s = SITES.find((x) => x.id === id);
  if (!s) return;
  DRAWER_ID = id;
  renderDrawer(s);
  document.getElementById("drawer-backdrop").hidden = false;
  const d = document.getElementById("drawer");
  d.classList.add("open");
  d.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  DRAWER_ID = null;
  document.getElementById("drawer-backdrop").hidden = true;
  const d = document.getElementById("drawer");
  d.classList.remove("open");
  d.setAttribute("aria-hidden", "true");
}

function campo(label, controle, full) {
  return `<div class="dfield${full ? " full" : ""}"><label>${label}</label>${controle}</div>`;
}

function renderDrawer(s) {
  const k = `data-id="${esc(s.id)}"`;
  const seo = s.seo;
  document.getElementById("drawer-ident").innerHTML = `${avatar(s.nome)}<div>
    <div class="drawer-title">${esc(s.nome)}</div>
    <div class="drawer-sub">${esc(s.nomeCompleto || displayLink(s.url) || "")}</div>
    <div class="drawer-badges">${badge(SITUACAO_META[s.situacao])}${badge({ label: labelOf(PLATAFORMA_OPTIONS, s.plataforma), cls: "b-none" })}${s.saude ? badge(SAUDE_META[s.saude]) : ""}</div>
  </div>`;

  const auditoria = seo
    ? `<div class="dgrid">
        ${campo("Na busca", selectField(`nv-select enc-${seo.encontravel} d-enc`, k, seo.encontravel, ENCONTRAVEL_OPTIONS))}
        ${campo("Indexação", `<div class="val">${badge(CONFORMIDADE_META[seo.conformidade])} <span class="muted">· ${seo.dominioSoftaliza ? "softaliza.com.br" : "domínio próprio"}</span></div>`)}
        ${campo("Título da página", `<div class="val${seo.titulo ? "" : " muted"}">${esc(seo.titulo || "sem título")}</div>`, true)}
        ${seo.urlFinal ? campo("Redireciona para", `<div class="val"><a class="seo-url" href="${esc(seo.urlFinal)}" target="_blank" rel="noopener noreferrer">${esc(displayLink(seo.urlFinal))}</a></div>`, true) : ""}
        ${campo("Termo de pesquisa", `<input class="f d-pesq" type="text" ${k} value="${esc(seo.pesquisa)}" />`)}
        ${campo("Conferido como indexado", `<div class="val">${switchField("d-idx", k, seo.indexado)}</div>`)}
      </div>
      ${seo.problemas.length || seo.lacunas.length ? `<div class="dlist" style="margin-top:10px">${seo.problemas.map((p) => `<span class="achado a-erro">${esc(p)}</span>`).join("")}${seo.lacunas.map((p) => `<span class="achado a-aviso">${esc(p)}</span>`).join("")}</div>` : ""}`
    : `<div class="val muted">Este site ainda não passou pela varredura. Rode <code>tools-auditor-seo.js</code> para incluí-lo.</div>`;

  const ar = s.noAr == null ? "sem checagem" : s.noAr ? "no ar" : "fora do ar";
  const rod = s.noAr === false || s.rodapeSoftaliza == null ? "sem checagem" : s.rodapeSoftaliza ? "credita a Softaliza" : "sem o crédito da Softaliza";

  document.getElementById("drawer-body").innerHTML = `
    <section class="dsec"><h3>Cadastro</h3>
      <div class="dgrid">
        ${campo("Nome ou sigla", `<input class="f d-nome" type="text" ${k} value="${esc(s.nome)}" />`)}
        ${campo("Tipo", selectField("d-tipo", k, s.tipo, TIPO_OPTIONS))}
        ${campo("Nome completo", `<input class="f d-nomec" type="text" ${k} value="${esc(s.nomeCompleto || "")}" />`, true)}
        ${campo("Endereço", `<input class="f f-mono d-url" type="text" ${k} value="${esc(s.url)}" spellcheck="false" />`, true)}
        ${campo("Plataforma", selectField("d-plat", k, s.plataforma, PLATAFORMA_OPTIONS))}
        ${campo("Situação", selectField(`nv-select sit-${s.situacao} d-sit`, k, s.situacao, SITUACAO_OPTIONS))}
        ${s.tipo === "evento" ? campo("Status do evento", selectField("d-stev", k, s.statusEvento || "a_acontecer", STATUS_EVENTO_OPTIONS)) : campo("MRR", `<input class="f f-num d-mrr" type="text" inputmode="decimal" ${k} value="${s.mrr != null ? s.mrr : ""}" />`)}
        ${s.tipo === "evento" ? campo("Ano", `<input class="f f-num d-ano" type="text" inputmode="numeric" maxlength="4" ${k} value="${esc(s.ano)}" />`) : campo("Saúde no SoftaHub", `<div class="val">${s.saude ? badge(SAUDE_META[s.saude]) : '<span class="muted">sem dado</span>'}</div>`)}
      </div>
    </section>
    <section class="dsec"><h3>Migração</h3>
      <div class="val" style="margin-bottom:10px">${badge(estagioMeta(s))}${emSoftaliza(s) ? "" : ' <span class="muted">· já em domínio próprio</span>'}</div>
      ${
        emSoftaliza(s)
          ? `<label class="switch" style="margin-bottom:4px"><input type="checkbox" class="d-linkdef" ${k} ${s.linkDefinitivo ? "checked" : ""} /><span class="track"></span><span class="switch-label">O cliente escolheu ficar com este link</span></label>
             <div class="dica">Marcado, o site sai da conta de “versão inicial” mas continua no endereço softaliza.</div>`
          : ""
      }
      <div class="dgrid" style="margin-top:12px">
        ${campo("Nova versão", selectField(`nv-select nv-${s.novaVersao} d-nv`, k, s.novaVersao, NV_OPTIONS))}
        ${campo("Endereço novo", `<input class="f f-mono d-novo" type="text" ${k} value="${esc(s.enderecoNovo)}" spellcheck="false" />`)}
      </div>
      ${
        s.foraDaFila
          ? `<div class="dica" style="margin-top:12px">Este site está <strong>fora da fila de remodelação</strong> por marcação manual.
             <button type="button" class="btn-mini d-voltar" ${k} style="margin-top:6px">${ICON.plus} Devolver à fila</button></div>`
          : ""
      }
    </section>
    <section class="dsec"><h3>Checagens${s.verificadoEm ? ` · varredura de ${s.verificadoEm}` : ""}</h3>
      ${checksHtml(s, k)}
      <div class="dica">Clique em cada uma para marcar à mão: automático → ok → problema. Com ponto, é marcação sua.</div>
      <div class="dgrid" style="margin-top:12px">
        ${campo("Disponibilidade", `<div class="val">${ar}</div>`)}
        ${campo("Rodapé", `<div class="val">${rod}</div>`)}
      </div>
    </section>
    <section class="dsec"><h3>SEO</h3>${auditoria}</section>
    <section class="dsec"><h3>Histórico</h3>
      <div class="hist">${[...(s.historico || [])]
        .reverse()
        .map((h) => `<div class="hist-item"><time>${esc(h.em)}</time>${esc(h.texto)}</div>`)
        .join("") || '<div class="val muted">Sem registros.</div>'}</div>
      <form class="note-form" id="note-form" ${k}><input class="f" type="text" id="note-text" placeholder="Anotar algo neste site…" autocomplete="off" /><button class="btn btn-ghost" type="submit">Anotar</button></form>
    </section>`;
}

function handleDrawerEdit(ev) {
  const el = ev.target;
  const s = siteDe(el);
  if (!s) return;
  const c = el.classList;
  if (c.contains("d-nome")) s.nome = el.value;
  else if (c.contains("d-nomec")) s.nomeCompleto = el.value || null;
  else if (c.contains("d-url")) {
    registrar(s, `Endereço: ${s.url || "(vazio)"} → ${el.value || "(vazio)"}.`);
    s.url = el.value;
  } else if (c.contains("d-tipo")) s.tipo = el.value;
  else if (c.contains("d-plat")) {
    registrar(s, `Plataforma: ${labelOf(PLATAFORMA_OPTIONS, s.plataforma)} → ${labelOf(PLATAFORMA_OPTIONS, el.value)}.`);
    s.plataforma = el.value;
  } else if (c.contains("d-sit")) {
    registrar(s, `Situação: ${SITUACAO_META[s.situacao].label} → ${SITUACAO_META[el.value].label}.`);
    s.situacao = el.value;
    if (el.value === "remodelar" && s.foraDaFila) {
      s.foraDaFila = false;
      registrar(s, "Devolvido à fila, pela situação voltar a Remodelar.");
    }
  } else if (c.contains("d-stev")) s.statusEvento = el.value;
  else if (c.contains("d-mrr")) {
    const n = parseFloat(el.value.replace(/[^\d.,]/g, "").replace(",", "."));
    s.mrr = Number.isFinite(n) ? n : null;
  } else if (c.contains("d-ano")) {
    const d = el.value.replace(/[^\d]/g, "").slice(0, 4);
    s.ano = d ? Number(d) : ANO_ATUAL;
  } else if (c.contains("d-nv")) {
    registrar(s, `Nova versão: ${labelOf(NV_OPTIONS, s.novaVersao)} → ${labelOf(NV_OPTIONS, el.value)}.`);
    s.novaVersao = el.value;
    if (el.value === "migrado" && s.situacao === "remodelar") {
      s.situacao = "pronto";
      registrar(s, "Situação: Remodelar → Pronto, pela migração concluída.");
    }
  } else if (c.contains("d-linkdef")) {
    s.linkDefinitivo = el.checked;
    registrar(s, el.checked ? "Cliente escolheu ficar com o endereço softaliza: sai da versão inicial." : "Voltou a contar como versão inicial.");
  } else if (c.contains("d-novo")) {
    registrar(s, `Endereço novo: ${el.value || "(vazio)"}.`);
    s.enderecoNovo = el.value;
  } else if (c.contains("d-enc") && s.seo) {
    registrar(s, `Na busca: ${ENCONTRAVEL_META[s.seo.encontravel].label} → ${ENCONTRAVEL_META[el.value].label} (manual).`);
    s.seo.encontravel = el.value;
    s.seo.encontravelManual = true;
  } else if (c.contains("d-pesq") && s.seo) s.seo.pesquisa = el.value;
  else if (c.contains("d-idx") && s.seo) {
    s.seo.indexado = el.checked;
    registrar(s, el.checked ? "Conferido como indexado na busca." : "Desmarcado como indexado.");
  } else return;
  salvarSite(s);
  renderDrawer(s);
  renderTudo();
}

function handleNote(ev) {
  ev.preventDefault();
  const s = SITES.find((x) => x.id === DRAWER_ID);
  const input = document.getElementById("note-text");
  if (!s || !input || !input.value.trim()) return;
  registrar(s, input.value.trim());
  salvarSite(s);
  renderDrawer(s);
  toast("Anotado.");
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
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function copyLink(link) {
  const url = withProto(link);
  if (!url) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast(`Copiado: ${displayLink(url)}`, "info"),
      () => toast("Não consegui copiar o endereço.", "warn")
    );
  } else toast("Cópia não suportada neste navegador.", "warn");
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
  const sim = (v) => (v == null ? "" : v ? "sim" : "não");

  if (STATE.tab === "prospectos") {
    name = "sem-site-conosco.csv";
    head = ["Sigla", "Nome", "Saúde", "MRR", "Site atual deles"];
    rows = VIEW.prospectos.map((p) => [p.sigla, p.nome || "", (SAUDE_META[p.saude] || {}).label || "", p.mrr ?? "", p.siteAtual || ""]);
  } else {
    const lista = VIEW[STATE.tab] || VIEW.sites;
    name = `${STATE.tab}.csv`;
    head = ["Site", "Nome completo", "Tipo", "Status do evento", "Ano", "Endereço", "Plataforma", "Situação", "Nova versão", "Endereço novo", "MRR", "Saúde", "No ar", "Rodapé Softaliza", "Na busca", "Indexação", "Indexado", "Pesquisa", "Verificado em"];
    rows = lista.map((s) => [
      s.nome, s.nomeCompleto || "", s.tipo, s.statusEvento || "", s.ano ?? "", s.url, labelOf(PLATAFORMA_OPTIONS, s.plataforma), SITUACAO_META[s.situacao].label,
      labelOf(NV_OPTIONS, s.novaVersao), s.enderecoNovo || "", s.mrr ?? "", (SAUDE_META[s.saude] || {}).label || "", sim(s.noAr), sim(s.rodapeSoftaliza),
      s.seo ? ENCONTRAVEL_META[s.seo.encontravel].label : "", s.seo ? CONFORMIDADE_META[s.seo.conformidade].label : "", s.seo ? sim(s.seo.indexado) : "", s.seo ? s.seo.pesquisa : "", s.verificadoEm || "",
    ]);
  }
  if (!rows.length) return toast("Não há linhas para exportar nessa visão.", "warn");
  download(name, [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n"));
  toast(`${rows.length} linha(s) exportadas.`);
}

// ---------------------------------------------------------------------------
// Navegação, tema e atalhos
// ---------------------------------------------------------------------------

function renderNavCounts() {
  document.getElementById("count-sites").textContent = associacoes().length;
  document.getElementById("count-eventos").textContent = eventos().length;
  document.getElementById("count-remodelar").textContent = fila().filter((s) => s.novaVersao !== "migrado" && s.novaVersao !== "nao").length;
  document.getElementById("count-prospectos").textContent = prospectosAtuais().length;
}

const RENDER = { painel: renderPainel, sites: renderSites, eventos: renderEventos, remodelar: renderRemodelar, prospectos: renderProspectos };

function renderTudo() {
  RENDER[STATE.tab]();
  renderNavCounts();
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
  RENDER[tab]();
  syncTableFit();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function currentTheme() {
  return document.documentElement.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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

// só libera o overflow (e o thead sticky) na tabela que cabe na largura
function syncTableFit() {
  document.querySelectorAll(".panel.active .table-scroll").forEach((box) => {
    const table = box.querySelector("table");
    if (!table) return;
    box.classList.remove("fits");
    if (table.scrollWidth <= box.clientWidth + 1) box.classList.add("fits");
  });
}

function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  const apply = () => document.documentElement.style.setProperty("--topbar-h", `${Math.round(topbar.getBoundingClientRect().height)}px`);
  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(topbar);
  window.addEventListener("resize", apply);
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
      if (DRAWER_ID) return closeDrawer();
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

async function init() {
  await carregarModelo();

  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-add").addEventListener("click", () => openAddDialog());
  document.getElementById("dlg-add-submit").addEventListener("click", submitAddDialog);
  document.getElementById("dlg-add-body").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submitAddDialog();
  });
  document.querySelectorAll("dialog.modal").forEach((dlg) => {
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) dlg.close();
    });
  });

  const busca = (id, key, render) =>
    document.getElementById(id).addEventListener("input", (e) => {
      STATE[key].q = e.target.value.trim().toLowerCase();
      render();
    });
  busca("sites-search", "sites", renderSites);
  busca("eventos-search", "eventos", renderEventos);
  busca("remodelar-search", "remodelar", renderRemodelar);
  busca("prospectos-search", "prospectos", renderProspectos);

  initChips("sites-chips-situacao", (v) => ((STATE.sites.situacao = v), renderSites()));
  initChips("sites-chips-saude", (v) => ((STATE.sites.saude = v), renderSites()));
  initChips("sites-chips-versao", (v) => ((STATE.sites.versao = v), renderSites()));
  initChips("eventos-chips-status", (v) => ((STATE.eventos.status = v), renderEventos()));
  initChips("eventos-chips-plataforma", (v) => ((STATE.eventos.plataforma = v), renderEventos()));
  initChips("eventos-chips-checagem", (v) => ((STATE.eventos.checagem = v), renderEventos()));
  initChips("eventos-chips-versao", (v) => ((STATE.eventos.versao = v), renderEventos()));
  initChips("remodelar-chips-tipo", (v) => ((STATE.remodelar.tipo = v), renderRemodelar()));
  initChips("remodelar-chips-nv", (v) => ((STATE.remodelar.nv = v), renderRemodelar()));
  initChips("prospectos-chips-saude", (v) => ((STATE.prospectos.saude = v), renderProspectos()));

  initSort("panel-sites", "sites", renderSites);
  initSort("panel-eventos", "eventos", renderEventos);
  initSort("panel-prospectos", "prospectos", renderProspectos);

  const liga = (id, change, click) => {
    const el = document.getElementById(id);
    if (change) el.addEventListener("change", change);
    if (click) el.addEventListener("click", click);
  };
  liga("painel-alertas", null, handlePainelClick);
  liga("painel-recortes", null, handlePainelClick);
  liga("sites-table-body", handleSitesEdit, handleSitesClick);
  liga("eventos-table-body", handleEventosEdit, handleEventosClick);
  liga("remodelar-table-body", handleRemodelarEdit, handleRemodelarClick);
  liga("prospectos-table-body", null, handleProspectosClick);

  const drawer = document.getElementById("drawer");
  drawer.addEventListener("change", handleDrawerEdit);
  drawer.addEventListener("submit", (ev) => {
    if (ev.target.id === "note-form") handleNote(ev);
  });
  drawer.addEventListener("click", (ev) => {
    const b = ev.target.closest(".d-voltar");
    if (!b) return;
    const s = siteDe(b);
    if (!s) return;
    s.foraDaFila = false;
    registrar(s, "Devolvido à fila de remodelação.");
    salvarSite(s);
    renderDrawer(s);
    renderTudo();
    toast(`"${s.nome}" voltou para a fila.`);
  });
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

  initShortcuts();
  syncTopbarHeight();

  let saved = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch (e) {}
  setTab(PAGES[saved] ? saved : "painel");
}

document.addEventListener("DOMContentLoaded", init);
