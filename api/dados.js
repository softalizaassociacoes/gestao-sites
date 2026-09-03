// Dados do painel no Supabase — uma linha por associação e uma por evento.
//
// A chave do Supabase nunca chega ao navegador: fica em variável de ambiente
// no Vercel e só é usada aqui. Esta rota já é protegida pelo middleware, que
// exige a sessão do login.
//
// GET   /api/dados  -> { associacoes: [...], eventos: [...] }
// PUT   /api/dados  <- { associacoes: [...], eventos: [...] }   (semeadura)
// PATCH /api/dados  <- { tipo: "associacao"|"evento", registro: {...} }

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

// --- conversão entre o modelo do painel (camelCase) e as colunas (snake_case)

function assocParaBanco(a) {
  return {
    chave: a.chave,
    sigla: a.sigla || "",
    nome: a.nome,
    saude: a.saude,
    mrr: a.mrr,
    site_atual: a.siteAtual || "wordpress",
    endereco: a.endereco || "",
    site_conosco: !!a.siteConosco,
    nova_versao: a.novaVersao || "pendente",
    endereco_novo: a.enderecoNovo || "",
    removido: !!a.removido,
    atualizado_em: new Date().toISOString(),
  };
}

function assocDoBanco(r) {
  return {
    chave: r.chave,
    sigla: r.sigla || "",
    nome: r.nome,
    saude: r.saude,
    mrr: r.mrr == null ? null : Number(r.mrr),
    siteAtual: r.site_atual || "wordpress",
    endereco: r.endereco || "",
    siteConosco: !!r.site_conosco,
    novaVersao: r.nova_versao || "pendente",
    enderecoNovo: r.endereco_novo || "",
    removido: !!r.removido,
  };
}

function eventoParaBanco(e) {
  return {
    id: e.id,
    nome_curto: e.nomeCurto,
    nome: e.nome || "",
    sigla: e.sigla,
    ano: e.ano == null ? null : Number(e.ano),
    status: e.status || "a_acontecer",
    site_atual: e.siteAtual || "wordpress",
    endereco: e.endereco || "",
    removido: !!e.removido,
    atualizado_em: new Date().toISOString(),
  };
}

function eventoDoBanco(r) {
  return {
    id: r.id,
    nomeCurto: r.nome_curto,
    nome: r.nome || "",
    sigla: r.sigla,
    ano: r.ano == null ? null : Number(r.ano),
    status: r.status || "a_acontecer",
    siteAtual: r.site_atual || "wordpress",
    endereco: r.endereco || "",
    removido: !!r.removido,
  };
}

function seoParaBanco(r) {
  return {
    seo_id: r.seoId,
    chave: r.chave,
    tipo: r.tipo,
    rotulo: r.rotulo,
    sigla: r.sigla,
    url: r.url,
    status_evento: r.statusEvento,
    encontravel: r.encontravel || "provavel",
    indexado: !!r.indexado,
    titulo: r.titulo,
    url_final: r.urlFinal,
    auditado_em: r.auditadoEm,
    dados: {
      // pesquisa, removido e manual moram no JSON para não exigir migração
      // de colunas
      pesquisa: r.pesquisa || "",
      removido: !!r.removido,
      manual: !!r.manual,
      indexavel: r.indexavel,
      siglaNoTitulo: r.siglaNoTitulo,
      nomeNoTitulo: r.nomeNoTitulo,
      descricao: r.descricao,
      h1: r.h1,
      canonical: r.canonical,
      sitemap: r.sitemap,
      https: r.https,
      status: r.status,
      lacunas: r.lacunas || [],
      problemas: r.problemas || [],
      avisos: r.avisos || [],
    },
    atualizado_em: new Date().toISOString(),
  };
}

function seoDoBanco(r) {
  const d = r.dados || {};
  return {
    seoId: r.seo_id,
    chave: r.chave,
    tipo: r.tipo,
    rotulo: r.rotulo,
    sigla: r.sigla,
    url: r.url,
    statusEvento: r.status_evento,
    encontravel: r.encontravel || "provavel",
    indexado: !!r.indexado,
    titulo: r.titulo,
    urlFinal: r.url_final,
    auditadoEm: r.auditado_em,
    pesquisa: d.pesquisa || r.sigla || r.rotulo || "",
    removido: !!d.removido,
    manual: !!d.manual,
    indexavel: d.indexavel,
    siglaNoTitulo: d.siglaNoTitulo,
    nomeNoTitulo: d.nomeNoTitulo,
    descricao: d.descricao,
    h1: d.h1,
    canonical: d.canonical,
    sitemap: d.sitemap,
    https: d.https,
    status: d.status,
    lacunas: d.lacunas || [],
    problemas: d.problemas || [],
    avisos: d.avisos || [],
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
    // sem variáveis o painel continua funcionando com o cache local
    return json(res, 503, { erro: "Supabase não configurado neste ambiente." });
  }

  try {
    if (req.method === "GET") {
      const [ra, re, rs] = await Promise.all([
        fetch(`${cfg.raiz}/${T_ASSOC}?select=*`, { headers: cfg.headers }),
        fetch(`${cfg.raiz}/${T_EVENTO}?select=*`, { headers: cfg.headers }),
        fetch(`${cfg.raiz}/${T_SEO}?select=*`, { headers: cfg.headers }),
      ]);
      if (!ra.ok || !re.ok) {
        const qual = !ra.ok ? T_ASSOC : T_EVENTO;
        const status = !ra.ok ? ra.status : re.status;
        return json(res, 502, { erro: `Supabase respondeu ${status} em ${qual}. A tabela existe?` });
      }
      const [la, le] = await Promise.all([ra.json(), re.json()]);
      // a tabela de SEO pode ainda não existir; o painel funciona sem ela
      const ls = rs.ok ? await rs.json() : [];
      return json(res, 200, {
        associacoes: la.map(assocDoBanco),
        eventos: le.map(eventoDoBanco),
        seo: ls.map(seoDoBanco),
      });
    }

    if (req.method === "PUT") {
      const corpo = await lerCorpo(req);
      const assoc = Array.isArray(corpo.associacoes) ? corpo.associacoes.map(assocParaBanco) : [];
      const eventos = Array.isArray(corpo.eventos) ? corpo.eventos.map(eventoParaBanco) : [];

      const r1 = await upsert(cfg, T_ASSOC, "chave", assoc);
      if (!r1.ok) return json(res, 502, { erro: `Falha ao gravar associações (${r1.status})`, detalhe: r1.detalhe });
      const r2 = await upsert(cfg, T_EVENTO, "id", eventos);
      if (!r2.ok) return json(res, 502, { erro: `Falha ao gravar eventos (${r2.status})`, detalhe: r2.detalhe });

      const seo = Array.isArray(corpo.seo) ? corpo.seo.map(seoParaBanco) : [];
      const r3 = await upsert(cfg, T_SEO, "seo_id", seo);
      if (!r3.ok) return json(res, 502, { erro: `Falha ao gravar SEO (${r3.status})`, detalhe: r3.detalhe });

      return json(res, 200, { ok: true, associacoes: assoc.length, eventos: eventos.length, seo: seo.length });
    }

    if (req.method === "PATCH") {
      const corpo = await lerCorpo(req);
      const { tipo, registro } = corpo || {};
      if (!registro || typeof registro !== "object") {
        return json(res, 400, { erro: "Envie { tipo, registro }." });
      }
      const r =
        tipo === "evento"
          ? await upsert(cfg, T_EVENTO, "id", [eventoParaBanco(registro)])
          : tipo === "seo"
            ? await upsert(cfg, T_SEO, "seo_id", [seoParaBanco(registro)])
            : await upsert(cfg, T_ASSOC, "chave", [assocParaBanco(registro)]);
      if (!r.ok) return json(res, 502, { erro: `Supabase respondeu ${r.status}`, detalhe: r.detalhe });
      return json(res, 200, { ok: true });
    }

    res.setHeader("allow", "GET, PUT, PATCH");
    return json(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return json(res, 500, { erro: "Falha ao falar com o Supabase.", detalhe: String(e).slice(0, 300) });
  }
}
