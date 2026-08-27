// Estado do painel (edições manuais) guardado no Supabase.
//
// O navegador nunca vê a chave do Supabase: ela fica em variável de ambiente
// no Vercel e só é usada aqui. O acesso a esta rota já é protegido pelo
// middleware, que exige a sessão do login.
//
// GET  /api/estado  -> { dados: {...} }
// PUT  /api/estado  <- { dados: {...} }

const TABELA = "gestao_sites_estado";
const LINHA = "painel";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    base: `${url.replace(/\/$/, "")}/rest/v1/${TABELA}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
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

function json(res, status, corpo) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  return res.end(JSON.stringify(corpo));
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) {
    // sem variáveis configuradas o painel segue funcionando só com localStorage
    return json(res, 503, { erro: "Supabase não configurado neste ambiente." });
  }

  try {
    if (req.method === "GET") {
      const r = await fetch(`${cfg.base}?id=eq.${LINHA}&select=dados,atualizado_em`, {
        headers: cfg.headers,
      });
      if (!r.ok) return json(res, 502, { erro: `Supabase respondeu ${r.status}` });
      const linhas = await r.json();
      const linha = Array.isArray(linhas) ? linhas[0] : null;
      return json(res, 200, { dados: (linha && linha.dados) || {}, atualizadoEm: linha && linha.atualizado_em });
    }

    if (req.method === "PUT") {
      const corpo = await lerCorpo(req);
      if (!corpo || typeof corpo.dados !== "object" || corpo.dados === null) {
        return json(res, 400, { erro: "Envie { dados: { ... } }." });
      }

      const r = await fetch(`${cfg.base}?on_conflict=id`, {
        method: "POST",
        headers: { ...cfg.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: LINHA, dados: corpo.dados, atualizado_em: new Date().toISOString() }),
      });
      if (!r.ok) {
        const texto = await r.text();
        return json(res, 502, { erro: `Supabase respondeu ${r.status}`, detalhe: texto.slice(0, 300) });
      }
      return json(res, 200, { ok: true });
    }

    res.setHeader("allow", "GET, PUT");
    return json(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return json(res, 500, { erro: "Falha ao falar com o Supabase.", detalhe: String(e).slice(0, 300) });
  }
}
