// Auditoria de SEO dos sites da Softaliza.
// Busca cada endereço, extrai os sinais de SEO da página e checa robots.txt e
// sitemap. Não mede indexação real no Google — isso exige Search Console.

const fs = require("fs");

const ALVOS = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const SAIDA = process.argv[3];
const CONCORRENCIA = 8;
const TIMEOUT = 25000;

const comProto = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

async function buscar(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // UA de navegador: com UA de robô vários hosts devolvem 403 ou penduram
        // a conexão, o que geraria falso positivo de "site fora do ar"
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      ...opts,
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

function texto(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function metaConteudo(html, nome) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nome}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nome}["']`,
    "i"
  );
  return texto(html, re) || texto(html, alt);
}

async function auditar(alvo) {
  const url = comProto(alvo.url);
  const base = new URL(url).origin;
  const r = { ...alvo, url };
  const t0 = Date.now();

  try {
    const resp = await buscar(url);
    r.status = resp.status;
    r.urlFinal = resp.url;
    r.https = resp.url.startsWith("https://");
    r.tempoMs = Date.now() - t0;

    r.atrasDeLogin = /\/(login|wp-login|entrar|signin)/i.test(resp.url);
    const tipo = resp.headers.get("content-type") || "";
    if (!resp.ok || !tipo.includes("html")) {
      r.erro = !resp.ok ? `HTTP ${resp.status}` : `content-type ${tipo}`;
      if (resp.status === 403) r.bloqueadoPorWaf = true;
    } else {
      const html = (await resp.text()).slice(0, 400000);
      r.titulo = texto(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
      r.descricao = metaConteudo(html, "description");
      const h1s = html.match(/<h1[\s>]/gi) || [];
      r.h1 = h1s.length;
      r.h1Texto = texto(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const robotsMeta = (metaConteudo(html, "robots") || "").toLowerCase();
      r.robotsMeta = robotsMeta || null;
      r.noindex = /noindex/.test(robotsMeta);
      r.canonical = texto(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
      r.ogTitulo = metaConteudo(html, "og:title");
      r.ogImagem = metaConteudo(html, "og:image");
      r.lang = texto(html, /<html[^>]+lang=["']([^"']*)["']/i);
      r.viewport = !!metaConteudo(html, "viewport");
      r.temGA = /googletagmanager\.com|google-analytics\.com|gtag\(/i.test(html);
    }
  } catch (e) {
    r.erro = e.name === "AbortError" ? "tempo esgotado" : e.message;
    r.tempoMs = Date.now() - t0;
  }

  // robots.txt
  try {
    const resp = await buscar(`${base}/robots.txt`);
    r.robotsStatus = resp.status;
    if (resp.ok) {
      const txt = (await resp.text()).slice(0, 20000);
      r.robotsBloqueiaTudo = /^\s*disallow:\s*\/\s*$/im.test(txt) && !/^\s*allow:/im.test(txt);
      r.robotsTemSitemap = /^\s*sitemap:/im.test(txt);
    }
  } catch (e) {
    r.robotsStatus = 0;
  }

  // sitemap
  for (const caminho of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]) {
    try {
      const resp = await buscar(`${base}${caminho}`, { method: "GET" });
      if (resp.ok) {
        const txt = (await resp.text()).slice(0, 200000);
        if (/<(urlset|sitemapindex)/i.test(txt)) {
          r.sitemap = caminho;
          r.sitemapUrls = (txt.match(/<loc>/gi) || []).length;
          break;
        }
      }
    } catch (e) {
      /* tenta o próximo */
    }
  }

  return r;
}

// --- veredito ------------------------------------------------------------

function avaliar(r) {
  const problemas = [];
  const avisos = [];

  if (r.bloqueadoPorWaf) {
    avisos.push("servidor devolve 403 para robôs — verificar se o Google também é bloqueado");
  } else if (r.erro) {
    problemas.push(`fora do ar ou inacessível (${r.erro})`);
  }
  if (!r.erro) {
    if (r.atrasDeLogin) problemas.push("redireciona para tela de login — buscador não vê o conteúdo");
    if (r.noindex) problemas.push("meta robots com noindex — pede para não indexar");
    if (!r.titulo) problemas.push("sem <title>");
    if (r.robotsBloqueiaTudo) problemas.push("robots.txt bloqueia o site inteiro");

    if (!r.https) problemas.push("não resolve em HTTPS");
    if (!r.descricao) avisos.push("sem meta description");
    else if (r.descricao.length < 50) avisos.push(`meta description curta (${r.descricao.length})`);
    else if (r.descricao.length > 170) avisos.push(`meta description longa (${r.descricao.length})`);

    if (r.titulo && r.titulo.length < 10) avisos.push(`title curto (${r.titulo.length})`);
    if (r.titulo && r.titulo.length > 65) avisos.push(`title longo (${r.titulo.length})`);

    if (r.h1 === 0) avisos.push("sem H1");
    else if (r.h1 > 1) avisos.push(`${r.h1} H1 na mesma página`);

    if (!r.canonical) avisos.push("sem canonical");
    if (!r.sitemap) avisos.push("sem sitemap.xml");
    if (r.robotsStatus !== 200) avisos.push("sem robots.txt");
    if (!r.ogTitulo || !r.ogImagem) avisos.push("Open Graph incompleto");
    if (!r.lang) avisos.push("sem lang no <html>");
    if (!r.viewport) avisos.push("sem meta viewport");
    if (r.tempoMs > 4000) avisos.push(`resposta lenta (${(r.tempoMs / 1000).toFixed(1)}s)`);
  }

  r.problemas = problemas;
  r.avisos = avisos;
  r.veredito = problemas.length ? "problema" : avisos.length > 3 ? "atencao" : avisos.length ? "aviso" : "ok";
  return r;
}

// --- execução em lotes ---------------------------------------------------

(async () => {
  const resultados = [];
  for (let i = 0; i < ALVOS.length; i += CONCORRENCIA) {
    const lote = ALVOS.slice(i, i + CONCORRENCIA);
    const feitos = await Promise.all(lote.map((a) => auditar(a).then(avaliar).catch((e) => ({ ...a, erro: String(e), veredito: "problema", problemas: [String(e)], avisos: [] }))));
    resultados.push(...feitos);
    process.stderr.write(`auditados ${resultados.length}/${ALVOS.length}\n`);
  }

  fs.writeFileSync(SAIDA, JSON.stringify(resultados, null, 1));

  const cont = resultados.reduce((a, r) => ((a[r.veredito] = (a[r.veredito] || 0) + 1), a), {});
  console.log("\n=== RESUMO ===");
  console.log(JSON.stringify(cont, null, 1));
  console.log("\n=== PROBLEMAS ===");
  resultados.filter((r) => r.veredito === "problema").forEach((r) => console.log(` ${r.rotulo.padEnd(24)} ${r.url}\n   ${r.problemas.join("; ")}`));
})();
