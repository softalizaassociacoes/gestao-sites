# MCP do painel

Servidor MCP que expõe o painel como ferramentas, para consultar e mexer nos
registros direto da conversa, sem abrir o navegador. Ele fala com a mesma API
que o painel usa (`/api/dados`), então o que entra por aqui aparece lá e o que
você faz lá aparece aqui.

Sem dependências e sem build: um arquivo, `servidor.js`, rodando no Node 18+.

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `listar_sites` | Lista com filtros: tipo, situação, nova versão, status do evento, na fila, versão inicial, busca por texto |
| `detalhe_site` | Um registro inteiro, com checagens, SEO e as últimas linhas do histórico |
| `atualizar_site` | Muda campos e registra no histórico, igual ao painel |
| `fila_remodelacao` | Põe ou tira da fila de remodelação |
| `anotar` | Só acrescenta uma linha ao histórico |
| `criar_site` | Cadastra um site novo |
| `resumo` | Os números do dashboard |
| `varrer` | Abre os sites de verdade e confere se estão no ar, se têm o rodapé da Softaliza e se têm o widget do TomTicket |

Em `atualizar_site`, mande só os campos que quer mudar: o servidor lê o
registro atual, mescla e grava inteiro, então nada se perde.

## Configuração

O token **não fica no código** — este repositório é público. Ele vem da
variável de ambiente `GESTAO_TOKEN`, que é o valor do cookie de sessão do
painel (`gs_session`).

No Windows, uma vez só, num PowerShell:

```powershell
setx GESTAO_TOKEN "<valor do cookie gs_session>"
```

Feche e reabra o Claude Code depois, para ele enxergar a variável. O
`.mcp.json` na raiz já aponta para cá e lê essa variável; não precisa editar
nada.

Para apontar para outro ambiente, defina `GESTAO_URL` (padrão:
`https://controlesites.softaliza.com.br`).

## Pré-requisito

O MCP só tem o que ler depois que o painel tiver banco. Enquanto
`/api/dados` responder `503 Supabase não configurado`, os dados existem apenas
no `localStorage` do navegador de cada pessoa, e qualquer ferramenta daqui vai
responder explicando isso. É preciso criar a tabela `gestao_sites_sites` no
Supabase e definir `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no Vercel.

## Testando à mão

```bash
GESTAO_TOKEN=... node mcp/servidor.js
```

e colar, uma por linha:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"resumo","arguments":{}}}
```
