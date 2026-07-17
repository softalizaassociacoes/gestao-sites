// Proteção por página de login + sessão em cookie (sem popup nativo do navegador).
// O POST do formulário é tratado por /api/login (função serverless).
// Observação: enquanto o repositório estiver público, credenciais/token ficam
// visíveis no código — mesmo nível de proteção do esquema anterior.

const SESSION_COOKIE = "gs_session";
const SESSION_TOKEN = "gs_2026_softaliza_9f4b1c7e5a2d8e3f0b6a";

function loginPage(hasError) {
  const erro = hasError
    ? '<div class="err">E-mail ou senha incorretos. Tente novamente.</div>'
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Entrar — Gestão de Sites</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg" />
<style>
  :root{--navy:#0e1f45;--navy2:#16306e;--accent:#2f6fed;--accent2:#245fd6;
    --card:#ffffff;--border:#e6e8f0;--text:#101426;--muted:#626a80;--risk:#bf4139;--risk-soft:#fbe8e7;}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    color:var(--text);display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(800px 380px at 80% -10%,rgba(107,155,255,.35),transparent 60%),
      linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);}
  .card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);
    border-radius:18px;padding:34px 30px 28px;
    box-shadow:0 24px 60px -24px rgba(0,0,0,.55),0 2px 6px rgba(14,31,69,.12);}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .brand img{width:44px;height:44px;border-radius:11px;box-shadow:0 4px 14px -6px rgba(14,31,69,.6)}
  .brand h1{font-size:18px;margin:0;font-weight:800;letter-spacing:-.01em;color:var(--navy)}
  .brand p{font-size:12.5px;margin:2px 0 0;color:var(--muted)}
  label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin:14px 0 6px}
  input{width:100%;padding:11px 13px;font-size:14px;font-family:inherit;color:var(--text);
    background:#f7f8fc;border:1px solid var(--border);border-radius:10px;transition:border-color .15s,box-shadow .15s,background .15s}
  input:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px rgba(47,111,237,.22)}
  button{width:100%;margin-top:22px;padding:12px;font-size:14px;font-weight:700;font-family:inherit;
    color:#fff;border:none;border-radius:10px;cursor:pointer;letter-spacing:-.005em;
    background:linear-gradient(180deg,var(--accent),var(--accent2));
    box-shadow:0 8px 18px -8px rgba(47,111,237,.6);transition:filter .15s,transform .05s}
  button:hover{filter:brightness(1.06)}
  button:active{transform:translateY(1px)}
  .err{background:var(--risk-soft);color:var(--risk);border:1px solid rgba(191,65,57,.25);
    border-radius:10px;padding:10px 12px;font-size:12.5px;font-weight:600;margin-bottom:4px}
  .foot{margin-top:18px;text-align:center;font-size:11.5px;color:var(--muted)}
  @media (prefers-color-scheme: dark){
    :root{--card:#131829;--border:#262d42;--text:#eef0fb;--muted:#9aa1b8}
    .brand h1{color:#eef0fb}
    input{background:#1a2032}
    input:focus{background:#131829}
  }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <img src="/logo.svg" alt="Softaliza" />
      <div>
        <h1>Gestão de Sites</h1>
        <p>Acesso restrito — Softaliza</p>
      </div>
    </div>
    ${erro}
    <form method="POST" action="/api/login" autocomplete="on">
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus placeholder="voce@softaliza.com.br" />
      <label for="password">Senha</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
      <button type="submit">Entrar</button>
    </form>
    <div class="foot">Você permanecerá conectado neste navegador.</div>
  </main>
</body>
</html>`;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // O POST de login é tratado pela função serverless /api/login.
  if (path === "/api/login") return;

  const cookie = request.headers.get("cookie") || "";
  const authed = cookie.split(/;\s*/).some((c) => c === `${SESSION_COOKIE}=${SESSION_TOKEN}`);

  // Página de login (autocontida) — acessível sem sessão.
  if (path === "/login" || path === "/login/") {
    if (authed) return new Response(null, { status: 302, headers: { Location: "/" } });
    return new Response(loginPage(url.searchParams.has("error")), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Logo é liberado para a página de login exibir a marca.
  if (path === "/logo.svg") return;

  // Demais rotas exigem sessão válida.
  if (authed) return;

  return new Response(null, {
    status: 302,
    headers: { Location: "/login", "cache-control": "no-store" },
  });
}
