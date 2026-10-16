# Validação da preparação para Render

Executada em 16/10/2026, preservando o frontend e as regras analíticas e administrativas existentes.

## Arquitetura de produção

Um Web Service Python nativo, com frontend compilado pelo Vite e servido pelo FastAPI. O build produz `frontend/dist`, e a API continua em `/api`. A montagem estática vem depois das rotas existentes; não altera seus handlers ou contratos. O servidor disponibiliza somente arquivos do build. As rotas React atuais recebem o mesmo `index.html` em acesso direto, refresh e navegação com query strings. Não há proxy Vite nem chamada fixa para a porta 8000 em produção.

O Blueprint utiliza `$PORT`, `/api/health`, uma instância, disco de 5 GB em `/var/data/pqavs`, `PQAVS_DATA_DIR` no mesmo caminho e `PQAVS_ADMIN_TOKEN` informado como segredo. Python 3.12.14 e Node 24.19.0 correspondem às ferramentas usadas no ambiente atual. A escolha de plano `standard` é paga e precisa ser revisada antes de criar o serviço; não foi criado nenhum recurso faturável.

## Comandos executados e resultados

| Verificação | Resultado |
| --- | --- |
| Instalação de `backend/requirements.lock` | Aprovada no venv |
| `npm ci --include=dev` | Aprovado usando o lockfile existente |
| `python -m pytest -q` | 39 testes aprovados; nenhum pulado |
| `python -m compileall -q backend` | Aprovado |
| `pip check` | Nenhuma dependência quebrada |
| `npm --prefix frontend run lint` | Aprovado |
| `npm --prefix frontend run build` | TypeScript e Vite aprovados; saída em `frontend/dist` |
| YAML do Blueprint | Sintaxe analisada e campos essenciais conferidos localmente |
| `python3 tests/browser_production.py` | Aprovado em Chromium, com FastAPI e build na mesma origem |

Permanecem os avisos já existentes de depreciação no Starlette/AnyIO e de tamanho do chunk ECharts (567 kB antes de gzip). Não houve alteração de dependências para tratá-los, pois isso não é necessário ao deploy.

## Roteamento e segurança

- `/` e todas as sete páginas internas atuais retornam o frontend compilado, inclusive em refresh e com filtros na URL.
- `/api/health`, API e OpenAPI mantêm suas respostas; `/docs` continua disponível.
- JS/CSS são servidos como assets, com respostas HTTP 200. O HTML de entrada exige revalidação de cache.
- Uma API inexistente e assets ausentes retornam 404, sem mascarar erro com HTML da SPA.
- Caminhos de SQLite, chave, originais, backend, `.env`, `.git` e tentativa de travessia de diretórios retornam 404.
- Sem build, o backend mantém o funcionamento de desenvolvimento como API.
- Nenhum arquivo de frontend, estilo, filtro, indicador, histórico, ingestão ou armazenamento foi modificado.

## Instalação vazia, upload e persistência

O teste automatizado iniciou três processos FastAPI sucessivos com o mesmo `PQAVS_DATA_DIR` temporário. O primeiro iniciou sem base e respondeu health HTTP 200 com `dataset: false`; o catálogo estava vazio e as consultas analíticas retornaram a resposta prevista de base ausente. A validação de um Excel sintético não ativou a base. Após reiniciar, o arquivo validado continuava disponível para confirmação. A importação criou a versão e preservou o original. Um terceiro processo reutilizou o catálogo e os dados, sem upload adicional. Registro, chave, staging e versões ficaram no diretório configurado.

O teste de navegador executou todo o caminho de primeira instalação: estado vazio → Atualizar Dados → chave temporária → upload → validação → confirmação → dashboard. Verificou JS/CSS, requisições de API somente na mesma origem e refresh em cada página React. Não houve erros JavaScript não tratados. Depois de reiniciar o servidor, o navegador abriu a tabela municipal com os dados importados; a versão ativa, chave local e arquivos persistidos continuavam presentes.

Os arquivos usados nesses testes são sintéticos, criados e removidos em diretórios temporários. A base real local não foi substituída, e nenhum dado ou segredo foi incluído no commit.

## Limites da verificação

Não houve criação, deploy, teste de disco ou acesso a uma conta Render. O Blueprint foi conferido localmente, sem validação pelo serviço remoto. O ambiente bloqueou a consulta HTTPS à documentação Render; o procedimento e os comandos estão registrados no README para revisão na criação do Blueprint. O teste de processos locais demonstra a persistência no diretório configurado, mas a associação do disco no Render ainda deve ser confirmada após o primeiro deploy e um restart real.

O teste de primeira importação em produção local usa um Excel sintético. A base completa já foi processada pelo projeto, mas consumo de memória, duração do upload/importação e capacidade do plano no Render precisam ser acompanhados ao importar o arquivo real. Não foi alterada a lógica de importação para essa preparação.
