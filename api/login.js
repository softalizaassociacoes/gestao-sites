// Trata o POST do formulário de login: valida credenciais e grava a sessão em cookie.
// Cookie de 1 ano => uma vez logado, permanece logado neste navegador.

const USER = "marcos@softaliza.com.br";
const PASS = "Supersoftaliza@1234";
const SESSION_COOKIE = "gs_session";
const SESSION_TOKEN = "gs_2026_softaliza_9f4b1c7e5a2d8e3f0b6a";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

async function readForm(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  if (typeof b === "string") return Object.fromEntries(new URLSearchParams(b));
  let raw = "";
  try {
    for await (const chunk of req) raw += chunk;
  } catch (e) {
    raw = "";
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 303;
    res.setHeader("Location", "/login");
    return res.end();
  }

  const form = await readForm(req);
  const email = String(form.email || "").trim();
  const password = String(form.password || "");

  if (email === USER && password === PASS) {
    res.statusCode = 303;
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
    );
    res.setHeader("Location", "/");
    return res.end();
  }

  res.statusCode = 303;
  res.setHeader("Location", "/login?error=1");
  return res.end();
}
