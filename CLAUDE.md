# Como trabalhar neste repositório

## Fluxo de trabalho

Commite direto na `main` e faça push. Nada de branch de feature nem pull
request — o que o Marcos pedir vai para a `main` assim que estiver pronto e
validado.

Push na `main` dispara o deploy de produção no Vercel automaticamente. Ou
seja: pedido feito é pedido no ar. Não espere aprovação para publicar, só
confirme que o deploy ficou `READY` e avise.

Validar antes de empurrar continua valendo: abra o painel no navegador e
confira a mudança funcionando de verdade, nos temas claro e escuro, antes do
push.

## O projeto

Painel estático de gestão dos sites da Softaliza — HTML, CSS e JavaScript sem
build nem framework. Hospedado no Vercel.

- `index.html` — a página inteira: navegação, painéis das abas e diálogos.
- `script.js` — todo o comportamento: estado, render de cada aba,
  persistência e utilidades de apresentação.
- `style.css` — o design system: tokens de cor, tema claro/escuro, tabelas.
- `data.js` — a semente dos dados, gerada das planilhas. Não editar à mão.
- `tools-auditor-seo.js` — script da varredura de SEO, roda separado.
- `api/dados.js` — leitura e gravação no Supabase, protegida pelo login.
- `middleware.js` — exige a sessão do login nas rotas.

## Dados

O Supabase é a verdade; o `localStorage` é espelho, para o painel abrir
offline. `data.js` completa o que ainda não existe no banco, casando por
chave.

Ao acrescentar um campo a um registro de SEO, prefira guardá-lo dentro do
JSON `dados` da tabela `gestao_sites_seo` — assim o banco não precisa de
coluna nova. É onde já moram `pesquisa`, `removido` e `manual`.

Registros carregados de um deploy anterior podem não ter os campos mais
recentes: normalize na carga, com um padrão sensato, em vez de assumir que
existem.

## Idioma

Tudo em português do Brasil: interface, comentários no código, mensagens de
commit e conversa.
