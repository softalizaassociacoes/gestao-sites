// Dados do painel no Supabase — uma linha por site.
//
// A chave do Supabase nunca chega ao navegador: fica em variável de ambiente
// no Vercel e só é usada aqui. A rota é protegida pelo middleware, que exige
// a sessão do login.
//
// GET   /api/dados  -> { sites: [...], legado?: {...} }
//        legado só vem quando a tabela de sites está vazia, para o painel
//        migrar o que as tabelas antigas (associações, eventos, seo) já tinham.
// PUT   /api/dados  <- { sites: [...] }                 (semeadura / lote)
// PATCH /api/dados  <- { site: {...} }                  (uma linha)
//
// Colunas fixas só para o que se filtra; o resto do registro vai no jsonb
// `dados`, então campo novo não pede coluna nova.

const T_SITES = "gestao_sites_sites";
const T_ASSOC = "gestao_sites_associacoes";
const T_EVENTO = "gestao_sites_eventos";
const T_SEO = "gestao_sites_seo";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    raiz: `${url.replace(/\/$/, "")}/rest/v1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

function siteParaBanco(s) {
  const { id, tipo, nome, url, plataforma, situacao, removido, ...resto } = s;
  return {
    id,
    tipo: tipo || "associacao",
    nome: nome || "",
    url: url || "",
    plataforma: plataforma || "wordpress",
    situacao: situacao || "remodelar",
    removido: !!removido,
    dados: resto,
    atualizado_em: new Date().toISOString(),
  };
}

function siteDoBanco(r) {
  return {
    ...(r.dados || {}),
    id: r.id,
    tipo: r.tipo || "associacao",
    nome: r.nome || "",
    url: r.url || "",
    plataforma: r.plataforma || "wordpress",
    situacao: r.situacao || "remodelar",
    removido: !!r.removido,
  };
}

function json(res, status, corpo) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  return res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  let bruto = "";
  try {
    for await (const parte of req) bruto += parte;
  } catch (e) {
    return {};
  }
  try {
    return JSON.parse(bruto || "{}");
  } catch (e) {
    return {};
  }
}

async function ler(cfg, tabela) {
  const r = await fetch(`${cfg.raiz}/${tabela}?select=*`, { headers: cfg.headers });
  if (!r.ok) return null;
  return r.json();
}

async function upsert(cfg, tabela, conflito, linhas) {
  if (!linhas.length) return { ok: true };
  const r = await fetch(`${cfg.raiz}/${tabela}?on_conflict=${conflito}`, {
    method: "POST",
    headers: { ...cfg.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(linhas),
  });
  if (!r.ok) return { ok: false, status: r.status, detalhe: (await r.text()).slice(0, 300) };
  return { ok: true };
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) {
    return json(res, 503, { erro: "Supabase não configurado neste ambiente." });
  }

  try {
    if (req.method === "GET") {
      const linhas = await ler(cfg, T_SITES);
      if (linhas === null) {
        return json(res, 502, { erro: `A tabela ${T_SITES} não respondeu. Ela existe?` });
      }
      const sites = linhas.map(siteDoBanco);
      if (sites.length) return json(res, 200, { sites });

      // tabela nova vazia: entrega o que as antigas tinham, para o painel migrar
      const [assoc, eventos, seo] = await Promise.all([ler(cfg, T_ASSOC), ler(cfg, T_EVENTO), ler(cfg, T_SEO)]);
      return json(res, 200, {
        sites: [],
        legado: { associacoes: assoc || [], eventos: eventos || [], seo: seo || [] },
      });
    }

    if (req.method === "PUT") {
      const corpo = await lerCorpo(req);
      const sites = Array.isArray(corpo.sites) ? corpo.sites.map(siteParaBanco) : [];
      const r = await upsert(cfg, T_SITES, "id", sites);
      if (!r.ok) return json(res, 502, { erro: `Falha ao gravar sites (${r.status})`, detalhe: r.detalhe });
      return json(res, 200, { ok: true, sites: sites.length });
    }

    if (req.method === "PATCH") {
      const corpo = await lerCorpo(req);
      const site = corpo && corpo.site;
      if (!site || typeof site !== "object" || !site.id) {
        return json(res, 400, { erro: "Envie { site: { id, ... } }." });
      }
      const r = await upsert(cfg, T_SITES, "id", [siteParaBanco(site)]);
      if (!r.ok) return json(res, 502, { erro: `Supabase respondeu ${r.status}`, detalhe: r.detalhe });
      return json(res, 200, { ok: true });
    }

    res.setHeader("allow", "GET, PUT, PATCH");
    return json(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return json(res, 500, { erro: "Falha ao falar com o Supabase.", detalhe: String(e).slice(0, 300) });
  }
}
