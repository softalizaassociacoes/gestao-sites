#!/usr/bin/env node
// Servidor MCP do painel de Gestão de Sites.
//
// Expõe o painel como ferramentas, para consultar e mexer nos registros a
// partir de uma conversa, sem abrir o navegador. Fala com a mesma API que o
// painel usa (/api/dados), então tudo que entra por aqui aparece lá e vice-versa.
//
// Sem dependências: JSON-RPC por stdio, uma mensagem por linha. Nada pode ir
// para o stdout além das respostas — avisos vão para o stderr.
//
// Variáveis de ambiente (o token nunca fica no código, que é repositório público):
//   GESTAO_URL    endereço do painel (padrão: produção)
//   GESTAO_TOKEN  valor do cookie de sessão gs_session — obrigatório
//
// Uso: node mcp/servidor.js

const BASE = (process.env.GESTAO_URL || "https://controlesites.softaliza.com.br").replace(/\/$/, "");
const TOKEN = process.env.GESTAO_TOKEN || "";
const UA_NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SITUACAO = { pronto: "Pronto", remodelar: "Remodelar", construcao: "Em construção", desativado: "Desativado" };
const NOVA_VERSAO = { nao: "Não", pendente: "Pendente", validacao: "Em validação", migrado: "Migrado" };
const PLATAFORMA = { wordpress: "WordPress", personalizado: "Personalizado", hotsite: "Hotsite" };
const STATUS_EVENTO = { a_acontecer: "A acontecer", acontecendo: "Acontecendo", realizado: "Realizado" };

const hoje = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Conversa com a API do painel
// ---------------------------------------------------------------------------

async function api(metodo, corpo) {
  if (!TOKEN) {
    throw new Error("Falta a variável GESTAO_TOKEN com o valor do cookie de sessão do painel.");
  }
  const r = await fetch(`${BASE}/api/dados`, {
    method: metodo,
    headers: { cookie: `gs_session=${TOKEN}`, "content-type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: "manual",
  });

  if (r.status === 302 || r.status === 401) {
    throw new Error("O painel recusou a sessão. Confira a variável GESTAO_TOKEN.");
  }
  const texto = await r.text();
  let dados = {};
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new Error(`Resposta inesperada do painel (${r.status}): ${texto.slice(0, 160)}`);
  }
  if (r.status === 503) {
    throw new Error(
      "O painel está sem banco: a API respondeu “Supabase não configurado”. " +
        "Falta criar a tabela gestao_sites_sites e definir SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel. " +
        "Enquanto isso, os dados só existem no navegador de quem abre o painel e não há o que controlar daqui."
    );
  }
  if (!r.ok) throw new Error(dados.erro || `A API respondeu ${r.status}.`);
  return dados;
}

async function carregar() {
  const d = await api("GET");
  return Array.isArray(d.sites) ? d.sites : [];
}

// Grava o registro inteiro: a API guarda o objeto como veio, então mandar
// pedaço apagaria o resto.
async function gravar(site) {
  await api("PATCH", { site });
  return site;
}

function registrar(site, texto) {
  if (!Array.isArray(site.historico)) site.historico = [];
  site.historico.push({ em: hoje(), texto });
}

function acharSite(sites, chave) {
  const alvo = String(chave || "").trim().toLowerCase();
  if (!alvo) return null;
  const porId = sites.find((s) => String(s.id).toLowerCase() === alvo);
  if (porId) return porId;
  const porNome = sites.filter((s) => String(s.nome || "").toLowerCase() === alvo);
  if (porNome.length === 1) return porNome[0];
  if (porNome.length > 1) {
    throw new Error(`"${chave}" é o nome de ${porNome.length} registros: ${porNome.map((s) => s.id).join(", ")}. Use o id.`);
  }
  const parcial = sites.filter((s) => String(s.nome || "").toLowerCase().includes(alvo));
  if (parcial.length === 1) return parcial[0];
  if (parcial.length > 1) {
    throw new Error(
      `"${chave}" bate com ${parcial.length} registros: ${parcial.slice(0, 8).map((s) => `${s.nome} (${s.id})`).join(", ")}${parcial.length > 8 ? "…" : ""}. Seja mais específico.`
    );
  }
  return null;
}

// Mesmas regras do painel.
const ativos = (sites) => sites.filter((s) => !s.removido);
const ehSoftaliza = (u) => /(^|\/\/|\.)softaliza\.com\.br/i.test(u || "");
const emSoftaliza = (s) => ehSoftaliza(s.url) || ehSoftaliza(s.seo && s.seo.urlFinal);
const versaoInicial = (s) => emSoftaliza(s) && !s.linkDefinitivo;
const naFila = (s) =>
  s.tipo === "evento"
    ? !!s.enviadoFila
    : !s.foraDaFila && (s.situacao === "remodelar" || s.novaVersao === "validacao" || s.novaVersao === "migrado");

function linha(s) {
  const partes = [
    s.id,
    s.nome,
    s.tipo === "evento" ? "evento" : "assoc",
    SITUACAO[s.situacao] || s.situacao,
    `nova versão: ${NOVA_VERSAO[s.novaVersao] || s.novaVersao}`,
  ];
  if (s.tipo === "evento") partes.push(STATUS_EVENTO[s.statusEvento] || "sem status", String(s.ano || "sem ano"));
  if (naFila(s)) partes.push("na fila");
  if (versaoInicial(s)) partes.push("versão inicial");
  partes.push(s.url || "sem endereço");
  return partes.join(" | ");
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const FERRAMENTAS = [
  {
    name: "listar_sites",
    description:
      "Lista os sites do painel com filtros. Sem filtro nenhum, traz todos os ativos. " +
      "Use para responder perguntas do tipo “quais estão em validação”, “quais eventos estão na fila”, “quais ainda estão em softaliza.com.br”.",
    inputSchema: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Texto no nome, sigla ou endereço." },
        tipo: { type: "string", enum: ["associacao", "evento"] },
        situacao: { type: "string", enum: ["pronto", "remodelar", "construcao", "desativado"] },
        nova_versao: { type: "string", enum: ["nao", "pendente", "validacao", "migrado"] },
        status_evento: { type: "string", enum: ["a_acontecer", "acontecendo", "realizado"] },
        na_fila: { type: "boolean", description: "true: só os que estão na fila de remodelação." },
        versao_inicial: { type: "boolean", description: "true: só os que ainda estão em softaliza.com.br sem o link ser definitivo." },
        incluir_removidos: { type: "boolean" },
      },
    },
  },
  {
    name: "detalhe_site",
    description: "Mostra um registro inteiro, com checagens, SEO e histórico. Aceita o id ou o nome.",
    inputSchema: {
      type: "object",
      properties: { site: { type: "string", description: "id (ex.: assoc:ABE) ou nome (ex.: ABE)." } },
      required: ["site"],
    },
  },
  {
    name: "atualizar_site",
    description:
      "Muda campos de um site e registra a mudança no histórico, igual ao painel. " +
      "Só manda os campos que quer mudar; o resto do registro fica intacto.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "id ou nome." },
        nome: { type: "string" },
        url: { type: "string", description: "Endereço atual." },
        endereco_novo: { type: "string", description: "Endereço da versão nova." },
        situacao: { type: "string", enum: ["pronto", "remodelar", "construcao", "desativado"] },
        nova_versao: { type: "string", enum: ["nao", "pendente", "validacao", "migrado"] },
        plataforma: { type: "string", enum: ["wordpress", "personalizado", "hotsite"] },
        status_evento: { type: "string", enum: ["a_acontecer", "acontecendo", "realizado"] },
        ano: { type: "number" },
        mrr: { type: "number" },
        link_definitivo: { type: "boolean", description: "O cliente escolheu ficar com o endereço softaliza." },
        nota: { type: "string", description: "Linha extra para o histórico." },
      },
      required: ["site"],
    },
  },
  {
    name: "fila_remodelacao",
    description:
      "Põe ou tira um site da fila de remodelação. Evento só entra na fila por aqui (ou pelo botão do painel); " +
      "site de associação entra sozinho pela situação, e tirar é uma marcação manual.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "id ou nome." },
        acao: { type: "string", enum: ["enviar", "tirar"] },
      },
      required: ["site", "acao"],
    },
  },
  {
    name: "anotar",
    description: "Acrescenta uma linha ao histórico de um site, sem mudar mais nada.",
    inputSchema: {
      type: "object",
      properties: { site: { type: "string" }, texto: { type: "string" } },
      required: ["site", "texto"],
    },
  },
  {
    name: "criar_site",
    description: "Cadastra um site novo no painel.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Sigla ou nome curto, como aparece na tabela." },
        nome_completo: { type: "string" },
        url: { type: "string" },
        tipo: { type: "string", enum: ["associacao", "evento"] },
        plataforma: { type: "string", enum: ["wordpress", "personalizado", "hotsite"] },
        situacao: { type: "string", enum: ["pronto", "remodelar", "construcao", "desativado"] },
        ano: { type: "number", description: "Só para evento." },
      },
      required: ["nome", "tipo"],
    },
  },
  {
    name: "resumo",
    description: "Os números do painel: carteira, fila de remodelação, versões iniciais, checagens com problema.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "varrer",
    description:
      "Abre os sites de verdade e confere: se estão no ar, se têm o rodapé da Softaliza, se têm Analytics ou Tag Manager e se têm o widget do TomTicket. " +
      "Por padrão só relata; com gravar=true, atualiza os campos medidos no painel (no ar, rodapé, analytics, data da varredura).",
    inputSchema: {
      type: "object",
      properties: {
        sites: { type: "array", items: { type: "string" }, description: "ids ou nomes. Vazio: todos os ativos com endereço." },
        tipo: { type: "string", enum: ["associacao", "evento"], description: "Restringe a varredura a um tipo." },
        gravar: { type: "boolean", description: "Grava no painel o que foi medido." },
      },
    },
  },
];

const texto = (t) => ({ content: [{ type: "text", text: t }] });

const EXECUTAR = {
  async listar_sites(a) {
    const todos = await carregar();
    let lista = a.incluir_removidos ? todos : ativos(todos);
    if (a.tipo) lista = lista.filter((s) => s.tipo === a.tipo);
    if (a.situacao) lista = lista.filter((s) => s.situacao === a.situacao);
    if (a.nova_versao) lista = lista.filter((s) => s.novaVersao === a.nova_versao);
    if (a.status_evento) lista = lista.filter((s) => s.statusEvento === a.status_evento);
    if (a.na_fila != null) lista = lista.filter((s) => naFila(s) === a.na_fila);
    if (a.versao_inicial != null) lista = lista.filter((s) => versaoInicial(s) === a.versao_inicial);
    if (a.busca) {
      const q = a.busca.toLowerCase();
      lista = lista.filter((s) => `${s.nome} ${s.nomeCompleto || ""} ${s.url || ""} ${s.enderecoNovo || ""}`.toLowerCase().includes(q));
    }
    if (!lista.length) return texto("Nenhum site bate com esses filtros.");
    return texto(`${lista.length} site(s):\n\n${lista.map(linha).join("\n")}`);
  },

  async detalhe_site(a) {
    const sites = await carregar();
    const s = acharSite(sites, a.site);
    if (!s) return texto(`Não achei "${a.site}" no painel.`);
    const hist = (s.historico || []).slice(-12).map((h) => `  ${h.em} — ${h.texto}`).join("\n");
    const seo = s.seo
      ? `encontrável: ${s.seo.encontravel || "—"} | indexado: ${s.seo.indexado ? "sim" : "não"} | conformidade: ${s.seo.conformidade || "—"} | auditado em ${s.seo.auditadoEm || "—"}`
      : "sem auditoria";
    return texto(
      [
        `${s.nome}${s.nomeCompleto ? ` — ${s.nomeCompleto}` : ""}`,
        `id: ${s.id} | tipo: ${s.tipo} | plataforma: ${PLATAFORMA[s.plataforma] || s.plataforma}`,
        `situação: ${SITUACAO[s.situacao] || s.situacao} | nova versão: ${NOVA_VERSAO[s.novaVersao] || s.novaVersao}`,
        s.tipo === "evento"
          ? `status do evento: ${STATUS_EVENTO[s.statusEvento] || "—"} | ano: ${s.ano || "—"}`
          : `MRR: ${s.mrr != null ? s.mrr : "—"}`,
        `endereço: ${s.url || "—"}`,
        `endereço novo: ${s.enderecoNovo || "—"}`,
        `na fila de remodelação: ${naFila(s) ? "sim" : "não"} | versão inicial: ${versaoInicial(s) ? "sim" : "não"}`,
        `no ar: ${s.noAr == null ? "sem dado" : s.noAr ? "sim" : "não"} | rodapé Softaliza: ${s.rodapeSoftaliza == null ? "sem dado" : s.rodapeSoftaliza ? "sim" : "não"} | varredura: ${s.verificadoEm || "—"}`,
        `SEO: ${seo}`,
        hist ? `\núltimas do histórico:\n${hist}` : "\nsem histórico",
      ].join("\n")
    );
  },

  async atualizar_site(a) {
    const sites = await carregar();
    const s = acharSite(sites, a.site);
    if (!s) return texto(`Não achei "${a.site}" no painel.`);
    const mudancas = [];

    const trocar = (campo, valor, rotulo, dicionario) => {
      if (valor == null || valor === s[campo]) return;
      const de = dicionario ? dicionario[s[campo]] || s[campo] || "—" : s[campo] || "(vazio)";
      const para = dicionario ? dicionario[valor] || valor : valor;
      registrar(s, `${rotulo}: ${de} → ${para}.`);
      mudancas.push(`${rotulo}: ${de} → ${para}`);
      s[campo] = valor;
    };

    trocar("nome", a.nome, "Nome");
    trocar("url", a.url, "Endereço");
    trocar("enderecoNovo", a.endereco_novo, "Endereço novo");
    trocar("plataforma", a.plataforma, "Plataforma", PLATAFORMA);
    trocar("novaVersao", a.nova_versao, "Nova versão", NOVA_VERSAO);
    trocar("statusEvento", a.status_evento, "Status do evento", STATUS_EVENTO);
    trocar("ano", a.ano, "Ano");
    trocar("mrr", a.mrr, "MRR");

    if (a.situacao != null && a.situacao !== s.situacao) {
      trocar("situacao", a.situacao, "Situação", SITUACAO);
      // mesma regra do painel: voltar para Remodelar devolve o site à fila
      if (a.situacao === "remodelar" && s.foraDaFila && s.tipo !== "evento") {
        s.foraDaFila = false;
        registrar(s, "Devolvido à fila, pela situação voltar a Remodelar.");
        mudancas.push("devolvido à fila");
      }
    }

    if (a.link_definitivo != null && !!a.link_definitivo !== !!s.linkDefinitivo) {
      s.linkDefinitivo = !!a.link_definitivo;
      const t = s.linkDefinitivo
        ? "O cliente escolheu ficar com o endereço softaliza."
        : "O endereço softaliza voltou a ser provisório.";
      registrar(s, t);
      mudancas.push(t);
    }

    if (a.nota) {
      registrar(s, a.nota);
      mudancas.push(`nota: ${a.nota}`);
    }

    if (!mudancas.length) return texto(`Nada mudou em "${s.nome}" — os valores enviados já eram esses.`);
    await gravar(s);
    return texto(`"${s.nome}" atualizado:\n${mudancas.map((m) => `  • ${m}`).join("\n")}\n\n${linha(s)}`);
  },

  async fila_remodelacao(a) {
    const sites = await carregar();
    const s = acharSite(sites, a.site);
    if (!s) return texto(`Não achei "${a.site}" no painel.`);
    const evento = s.tipo === "evento";

    if (a.acao === "enviar") {
      if (naFila(s)) return texto(`"${s.nome}" já está na fila.`);
      if (evento) s.enviadoFila = true;
      else s.foraDaFila = false;
      registrar(s, evento ? "Enviado para a fila de remodelação." : "Devolvido à fila de remodelação.");
      await gravar(s);
      return texto(`"${s.nome}" entrou na fila de remodelação.`);
    }

    if (!naFila(s)) return texto(`"${s.nome}" já estava fora da fila.`);
    if (evento) s.enviadoFila = false;
    else s.foraDaFila = true;
    registrar(s, "Tirado da fila de remodelação.");
    await gravar(s);
    return texto(
      `"${s.nome}" saiu da fila de remodelação. O registro continua em ${evento ? "Eventos" : "Sites"}, com histórico e checagens — nada foi excluído.`
    );
  },

  async anotar(a) {
    const sites = await carregar();
    const s = acharSite(sites, a.site);
    if (!s) return texto(`Não achei "${a.site}" no painel.`);
    registrar(s, a.texto);
    await gravar(s);
    return texto(`Anotado em "${s.nome}": ${a.texto}`);
  },

  async criar_site(a) {
    const sites = await carregar();
    const base = (a.nome || "").trim();
    if (!base) throw new Error("O nome é obrigatório.");
    const prefixo = a.tipo === "evento" ? "evento" : "assoc";
    let id = `${prefixo}:${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    if (sites.some((s) => s.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`;

    const novo = {
      id,
      tipo: a.tipo,
      nome: base,
      nomeCompleto: a.nome_completo || null,
      url: a.url || "",
      plataforma: a.plataforma || "wordpress",
      situacao: a.situacao || (!a.plataforma || a.plataforma === "wordpress" ? "remodelar" : "pronto"),
      novaVersao: "pendente",
      enderecoNovo: "",
      mrr: null,
      statusEvento: a.tipo === "evento" ? "a_acontecer" : null,
      ano: a.tipo === "evento" ? a.ano || new Date().getFullYear() : null,
      seo: null,
      rodapeSoftaliza: null,
      noAr: null,
      verificadoEm: null,
      linkDefinitivo: false,
      foraDaFila: false,
      enviadoFila: false,
      checagemManual: { ar: null, rodape: null, seo: null },
      historico: [{ em: hoje(), texto: "Cadastrado pelo MCP." }],
      manual: true,
      removido: false,
    };
    await gravar(novo);
    return texto(`Cadastrado:\n${linha(novo)}`);
  },

  async resumo() {
    const todos = await carregar();
    const vivos = ativos(todos);
    const assoc = vivos.filter((s) => s.tipo === "associacao");
    const eventos = vivos.filter((s) => s.tipo === "evento");
    const fila = vivos.filter(naFila);
    const conta = (lista, campo, valor) => lista.filter((s) => s[campo] === valor).length;
    return texto(
      [
        `Carteira: ${vivos.length} sites — ${assoc.length} associações, ${eventos.length} eventos.`,
        "",
        `Fila de remodelação: ${fila.length} (${fila.filter((s) => s.tipo === "evento").length} eventos)`,
        `  pendentes: ${conta(fila, "novaVersao", "pendente")} | em validação: ${conta(fila, "novaVersao", "validacao")} | migrados: ${conta(fila, "novaVersao", "migrado")} | marcados como “Não”: ${conta(fila, "novaVersao", "nao")}`,
        "",
        `Em versão inicial (softaliza.com.br, sem o link ser definitivo): ${vivos.filter(versaoInicial).length}`,
        `Fora do ar na última varredura: ${vivos.filter((s) => s.noAr === false).length}`,
        `No ar e sem o rodapé da Softaliza: ${vivos.filter((s) => s.noAr && s.rodapeSoftaliza === false).length}`,
        `Eventos acontecendo agora: ${conta(eventos, "statusEvento", "acontecendo")} | a acontecer: ${conta(eventos, "statusEvento", "a_acontecer")}`,
      ].join("\n")
    );
  },

  async varrer(a) {
    const todos = await carregar();
    let alvo;
    if (a.sites && a.sites.length) {
      alvo = a.sites.map((chave) => {
        const s = acharSite(todos, chave);
        if (!s) throw new Error(`Não achei "${chave}" no painel.`);
        return s;
      });
    } else {
      alvo = ativos(todos).filter((s) => s.url);
      if (a.tipo) alvo = alvo.filter((s) => s.tipo === a.tipo);
    }
    if (!alvo.length) return texto("Nenhum site para varrer.");

    const ver = async (s) => {
      const endereco = /^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      try {
        const r = await fetch(endereco, {
          headers: { "user-agent": UA_NAVEGADOR, accept: "text/html" },
          redirect: "follow",
          signal: ctrl.signal,
        });
        const html = await r.text();
        return {
          s,
          status: r.status,
          noAr: r.status >= 200 && r.status < 400,
          rodape: /softaliza/i.test(html),
          analytics: /googletagmanager\.com|google-analytics\.com|gtag\s*\(|["']GTM-[A-Z0-9]{4,}["']|["']G-[A-Z0-9]{6,}["']|["']UA-\d{4,}/i.test(html),
          tomticket: /tomticket/i.test(html),
        };
      } catch (e) {
        return { s, status: "erro", noAr: false, falhou: true, erro: String(e.cause || e.message).slice(0, 50) };
      } finally {
        clearTimeout(t);
      }
    };

    const saida = [];
    for (let i = 0; i < alvo.length; i += 6) {
      saida.push(...(await Promise.all(alvo.slice(i, i + 6).map(ver))));
    }

    let gravados = 0;
    if (a.gravar) {
      for (const r of saida) {
        if (r.falhou) continue; // falha de rede não vira dado
        const antes = `${r.s.noAr}|${r.s.rodapeSoftaliza}|${r.s.analytics}`;
        r.s.noAr = r.noAr;
        r.s.rodapeSoftaliza = r.noAr ? !!r.rodape : r.s.rodapeSoftaliza;
        r.s.analytics = r.noAr ? !!r.analytics : r.s.analytics;
        r.s.verificadoEm = hoje();
        if (antes !== `${r.s.noAr}|${r.s.rodapeSoftaliza}|${r.s.analytics}`) {
          registrar(
            r.s,
            `Varredura: ${r.noAr ? "no ar" : "fora do ar"}, rodapé ${r.rodape ? "encontrado" : "não encontrado"}, analytics ${r.analytics ? "instalado" : "não encontrado"}.`
          );
        }
        await gravar(r.s);
        gravados++;
      }
    }

    const fora = saida.filter((r) => !r.noAr);
    const semRodape = saida.filter((r) => r.noAr && !r.rodape);
    const semAnalytics = saida.filter((r) => r.noAr && !r.analytics);
    const comTom = saida.filter((r) => r.tomticket);
    const bloco = (titulo, lista, formata) =>
      `${titulo}: ${lista.length}${lista.length ? "\n" + lista.map(formata).join("\n") : ""}`;

    return texto(
      [
        `Varri ${saida.length} site(s).`,
        "",
        bloco("Fora do ar ou sem resposta", fora, (r) => `  ${r.s.nome} — ${r.status} ${r.erro || ""} — ${r.s.url}`),
        "",
        bloco("No ar e sem o rodapé da Softaliza", semRodape, (r) => `  ${r.s.nome} — ${r.s.url}`),
        "",
        bloco("No ar e sem Analytics nem Tag Manager", semAnalytics, (r) => `  ${r.s.nome} — ${r.s.url}`),
        "",
        bloco("Com o widget do TomTicket", comTom, (r) => `  ${r.s.nome} — ${r.s.url}`),
        a.gravar ? `\nGravei a medição em ${gravados} registro(s).` : "\nNada foi gravado no painel (use gravar=true para isso).",
      ].join("\n")
    );
  },
};

// ---------------------------------------------------------------------------
// JSON-RPC por stdio
// ---------------------------------------------------------------------------

function enviar(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function tratar(msg) {
  const { id, method, params } = msg;
  const responder = (result) => enviar({ jsonrpc: "2.0", id, result });

  if (method === "initialize") {
    return responder({
      protocolVersion: (params && params.protocolVersion) || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "gestao-sites", version: "1.0.0" },
      instructions:
        "Painel de gestão dos sites da Softaliza. As ferramentas leem e escrevem no mesmo banco do painel: " +
        "o que mudar aqui aparece lá. Mudanças entram no histórico do registro.",
    });
  }

  if (method === "tools/list") return responder({ tools: FERRAMENTAS });

  if (method === "tools/call") {
    const nome = params && params.name;
    const fn = EXECUTAR[nome];
    if (!fn) return enviar({ jsonrpc: "2.0", id, error: { code: -32601, message: `Ferramenta desconhecida: ${nome}` } });
    try {
      return responder(await fn((params && params.arguments) || {}));
    } catch (e) {
      return responder({ content: [{ type: "text", text: `Falhou: ${e.message}` }], isError: true });
    }
  }

  if (method === "ping") return responder({});
  if (method && method.startsWith("notifications/")) return; // notificação não tem resposta
  if (id != null) enviar({ jsonrpc: "2.0", id, error: { code: -32601, message: `Método não suportado: ${method}` } });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (pedaco) => {
  buffer += pedaco;
  let quebra;
  while ((quebra = buffer.indexOf("\n")) >= 0) {
    const linhaTexto = buffer.slice(0, quebra).trim();
    buffer = buffer.slice(quebra + 1);
    if (!linhaTexto) continue;
    let msg;
    try {
      msg = JSON.parse(linhaTexto);
    } catch (e) {
      process.stderr.write(`linha inválida ignorada: ${linhaTexto.slice(0, 120)}\n`);
      continue;
    }
    Promise.resolve(tratar(msg)).catch((e) => {
      process.stderr.write(`erro ao tratar ${msg.method}: ${e.message}\n`);
      if (msg.id != null) enviar({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});
process.stdin.on("end", () => process.exit(0));
