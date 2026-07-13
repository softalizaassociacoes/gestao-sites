function label(v, fallback) {
  return v ? v : fallback;
}

function nivelBadge(nivel) {
  if (nivel === "A") return '<span class="badge nivel-a">A · personalizado</span>';
  if (nivel === "B" || nivel === "C") return `<span class="badge nivel-bc">${nivel} · hotsite</span>`;
  return '<span class="badge nivel-none">A definir</span>';
}

function statusBadge(status) {
  if (status === "vercel") return '<span class="badge status-vercel">No Vercel</span>';
  if (status === "wordpress") return '<span class="badge status-wordpress">WordPress</span>';
  return '<span class="badge nivel-none">Indefinido</span>';
}

function tipoLabel(tipo) {
  if (tipo === "associacao") return "Associação";
  if (tipo === "congresso") return "Congresso";
  return "A confirmar";
}

function renderStats(sites) {
  const total = sites.length;
  const nivelA = sites.filter((s) => s.nivel === "A").length;
  const nivelBC = sites.filter((s) => s.nivel === "B" || s.nivel === "C").length;
  const noVercel = sites.filter((s) => s.status === "vercel").length;
  const emWordpress = sites.filter((s) => s.status === "wordpress").length;
  const aClassificar = sites.filter((s) => !s.nivel).length;

  const cards = [
    { value: total, label: "Sites no total" },
    { value: nivelA, label: "Nível A (personalizado)" },
    { value: nivelBC, label: "Nível B/C (hotsite)" },
    { value: noVercel, label: "Já no Vercel" },
    { value: emWordpress, label: "Ainda em WordPress" },
    { value: aClassificar, label: "Sem nível definido" },
  ];

  document.getElementById("stats").innerHTML = cards
    .map(
      (c) => `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`
    )
    .join("");
}

function renderTable(sites) {
  const tbody = document.getElementById("table-body");

  if (sites.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum site encontrado com esses filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = sites
    .map((s) => {
      const dominioCell = s.dominio
        ? `<a class="link" href="https://${s.dominio}" target="_blank" rel="noopener">${s.dominio}</a>`
        : '<span class="muted">—</span>';
      const vercelCell = s.vercelProject
        ? `<span class="muted">${s.vercelProject}</span>`
        : '<span class="muted">—</span>';

      return `<tr>
        <td><strong>${label(s.nome, s.slug)}</strong></td>
        <td>${tipoLabel(s.tipo)}</td>
        <td>${nivelBadge(s.nivel)}</td>
        <td>${statusBadge(s.status)}</td>
        <td>${vercelCell}</td>
        <td>${dominioCell}</td>
        <td class="muted">${s.obs || "—"}</td>
      </tr>`;
    })
    .join("");
}

function applyFilters() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const nivel = document.getElementById("filter-nivel").value;
  const status = document.getElementById("filter-status").value;
  const tipo = document.getElementById("filter-tipo").value;

  const filtered = SITES.filter((s) => {
    if (q && !(`${s.slug} ${s.nome || ""} ${s.dominio || ""}`.toLowerCase().includes(q))) return false;
    if (nivel === "none" && s.nivel) return false;
    if (nivel && nivel !== "none" && s.nivel !== nivel) return false;
    if (status && s.status !== status) return false;
    if (tipo === "none" && s.tipo) return false;
    if (tipo && tipo !== "none" && s.tipo !== tipo) return false;
    return true;
  });

  renderTable(filtered);
}

function init() {
  renderStats(SITES);
  renderTable(SITES);

  ["search", "filter-nivel", "filter-status", "filter-tipo"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyFilters);
  });
}

document.addEventListener("DOMContentLoaded", init);
