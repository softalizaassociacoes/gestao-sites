// Protege todo o site com autenticação básica (usuário/senha).
// ATENÇÃO: este repositório é público — ver observação de segurança no README.

const BASIC_AUTH_USER = "marcos@softaliza.com.br";
const BASIC_AUTH_PASS = "Supersoftaliza@1234";

export default function middleware(request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return;
    }
  }

  return new Response("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Gestao de Sites Softaliza"' },
  });
}
