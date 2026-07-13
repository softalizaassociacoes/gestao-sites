# gestao-sites

Painel interno de acompanhamento da migração dos sites de associações e congressos da Softaliza, saindo do modelo padrão WordPress para sites com identidade própria (Git + Vercel).

## Níveis

- **A** — site totalmente personalizado
- **B / C** — hotsite padrão (modelo de referência: [aatp.softaliza.com.br](https://aatp.softaliza.com.br/))

## Atualizando os dados

Os dados ficam em `data.js`, um array simples de objetos. Edite os campos `nome`, `tipo`, `nivel`, `status`, `dominio` e `obs` conforme a classificação avançar. Não requer build — é HTML/CSS/JS estático, pronto para deploy direto no Vercel.
