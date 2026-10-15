# PQAVS Analytics

Aplicação interna de acompanhamento de indicadores e metas municipais de vigilância em saúde. React + TypeScript + Vite + Tailwind CSS 4, componentes no padrão shadcn/ui (Button com Radix Slot/CVA), Lucide e Apache ECharts; API Python/FastAPI com Pandas, Pydantic e SQLAlchemy/SQLite.

## Dados e metodologia

Leia [a análise completa da planilha](docs/ESQUEMA.md) e [o inventário por aba](docs/schema-audit.json) antes de interpretar os resultados. Foram inspecionadas todas as dez abas, 50.112 linhas municipais, nove anos de observações, 27 UFs e 142 definições de indicadores. O dicionário contém 2022, mas não existem observações desse ano. São 712.708 observações município × indicador normalizadas. O original é preservado sem edição.

A base contém agregados municipais; não foram encontradas linhas individualizadas. Arquivos reais, bancos derivados e chaves administrativas ficam em `data/`, ignorados pelo Git. Os dados não são incorporados ao código nem enviados a serviços externos.

A regra analítica conserva classificações explícitas: Sim/1 → alcançada; Não/0 com resultado → não alcançada. Divergências, referências técnicas e classificação negativa com medida ausente → sem informação. Não se infere ausência de casos de denominador zero. Novos arquivos podem indicar explicitamente “Não aplicável” ou “Ausência de casos”.

O percentual é alcançadas / (alcançadas + não alcançadas). Com um indicador, representa municípios; com vários, observações município × indicador. Municípios avaliados são códigos únicos com pelo menos uma situação classificável. UFs agregam seus municípios, sem inventar meta estadual. População é somada uma vez por município no último ano do recorte; ausências são informadas.

Os códigos mudam de significado, especialmente em 2018. Todo ano usa seu próprio dicionário; mudanças de descrição, rótulos e meta são mostradas na análise histórica. Há escalas heterogêneas em RESULTADO. Não se converte automaticamente 0–1 para 0–100 nem se inventa linha numérica/distância para a meta. Séries de alcance são descritivas, acompanhadas de avisos; “melhor/pior resultado” não é inferido de crescimento da medida bruta. Referências como NT Nº 103/2021-CGIAE continuam pendentes de documentação externa.

## Requisitos e instalação

Python 3.12 e Node.js 24. Linux para o mecanismo de lock de escrita (`fcntl`). Não é necessário banco externo, chave de API nem outro serviço.

```bash
cd /workspace/PAINEL-FINAL-PQAVS
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
npm --prefix frontend ci
```

`requirements.txt` declara dependências diretas; `requirements.lock` congela a instalação validada. O lock npm é versionado. Para instalar fora da nuvem, ajuste apenas o diretório inicial.

## Importação inicial

Se já houver uma versão ativa em `data/registry.sqlite`, ela será reutilizada. Para uma instalação nova, forneça o Excel localmente e faça a primeira análise/importação:

```bash
.venv/bin/python -m backend.app.cli validate /caminho/Base_Painel.xlsx
.venv/bin/python -m backend.app.cli import /caminho/Base_Painel.xlsx
```

A análise/importação pode levar aproximadamente um minuto para a base completa. Os originais ficam em `data/originals/`, bancos imutáveis em `data/versions/` e o registro ativo/histórico em `data/registry.sqlite`. O arquivo original não deve ser adicionado ao Git.

## Execução

No primeiro terminal, a partir da raiz:

```bash
.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

No segundo terminal:

```bash
cd frontend
npm run dev -- --port 5173
```

O Vite encaminha `/api` para o backend na porta 8000. A API possui documentação OpenAPI em `/docs`. Verifique o ambiente internamente com `curl -f http://127.0.0.1:8000/api/health`, a API de catálogo e uma consulta de resumo. Na nuvem, os processos precisam ser reiniciados depois de restaurar um snapshot; as instruções reutilizáveis de startup registram esse procedimento. Cada tarefa já é isolada: utilize o checkout existente, sem criar worktrees.

## Funcionalidades

- Visão Geral com métricas, cards de metas, ranking de UFs e heatmap clicável.
- Estados com população coberta, desempenho por indicador e municípios.
- Perfil municipal com numerador, denominador, resultado original, meta e situação.
- Indicadores com dicionário por ano e navegação para municípios e histórico.
- Histórico nacional, estadual e municipal: linhas de alcance, pequenos múltiplos, trajetória municipal, alterações metodológicas, comparação entre anos, tendências descritivas, heatmaps e ranking histórico. A evolução municipal é paginada no servidor (25 por página).
- Comparação de até cinco municípios no mesmo ano.
- Tabelas ordenáveis, busca por nome/código, paginação, seleção de coluna de população, CSV e XLSX.
- Filtros persistem na URL entre páginas; município depende da UF. Filtros de população excluem registros sem população. Recortes sem informação mostram estado vazio, nunca zero inventado.
- Atualização com autenticação administrativa, validação prévia, confirmação separada, versões e rollback.

## Atualizações e administração

No início, o servidor usa `PQAVS_ADMIN_TOKEN` se fornecido; caso contrário cria uma chave aleatória com permissão 0600 em `data/admin.key`. O administrador deve fornecer essa chave por um canal seguro aos responsáveis. Não publique a chave, não a envie em URLs nem a versione. A tela “Atualizar Dados” solicita a chave em campo de senha e a mantém apenas em memória durante a sessão.

Fluxo: selecionar `.xlsx` → validar → revisar relatório → confirmar importação. A validação não ativa o arquivo. O token de staging é opaco, não contém caminho. O endpoint de importação revalida o arquivo. Um arquivo inválido nunca troca a versão ativa. O upload é limitado a 40 MB e há limite de expansão do ZIP. As exportações neutralizam fórmulas em campos de texto.

**A importação é uma substituição integral do conjunto ativo.** O Excel novo precisa conter todos os anos desejados. Não há mesclagem silenciosa por ano. Um novo ano ou indicador que satisfaça o esquema e possua definição correspondente aparece automaticamente nos filtros e análises. Campos numéricos inválidos, grupos incompletos, duplicidades e identificação territorial inválida bloqueiam a importação; divergências conhecidas geram observações de qualidade.

Antes da ativação, o sistema escreve o banco novo e preserva o original. A mudança do ponteiro ativo e o registro de evento são transacionais. Bases anteriores nunca são sobrescritas. Rollback reativa uma versão já importada sem apagar as outras. Escritas são serializadas por lock de processo. O diretório de dados deve estar em um volume persistente e ter backup institucional; a aplicação não define política de retenção nem apaga versões automaticamente.

A leitura analítica é permitida a quem tenha acesso ao ambiente interno. A chave protege as operações administrativas, mas não substitui autenticação corporativa, TLS e controle de acesso do ambiente de publicação. Use o proxy institucional em produção.

## API

| Endpoint | Conteúdo |
| --- | --- |
| `GET /api/health` | Prontidão do serviço e presença de base |
| `GET /api/catalog` | Anos com observações, UFs, definições e mudanças |
| `GET /api/dashboard` | Resumo, indicadores, ranking e heatmap |
| `GET /api/estados` | Agregações por UF, ordenáveis |
| `GET /api/municipios` | Municípios paginados/ordenáveis |
| `GET /api/observations` | Medidas e dicionário, páginas de até 100 linhas |
| `GET /api/history` | Séries, tendências, mudanças e rankings históricos |
| `GET /api/comparison` | Até cinco códigos no mesmo ano |
| `GET /api/export` | Resultados filtrados em CSV/XLSX |
| `POST /api/admin/validar` | Upload e relatório sem importação |
| `POST /api/admin/importar` | Confirmação por token de validação |
| `GET /api/admin/importacoes` | Versões e eventos |
| `POST /api/admin/rollback` | Reativação de versão |

Filtros: `year`, `start`, `end`, `uf`, `municipality`, `indicator`, `status`, `search`, `pop_min`, `pop_max`. Paginação: `page`, `page_size` (máximo 100); rankings municipais históricos usam `rank_page`. Ordenação de tabelas: `sort`, `direction`. Exportações aceitam `format=csv|xlsx` e `kind=municipalities|indicators|states|observations`; observações detalhadas limitadas a 200 mil por arquivo. API de histórico ignora `year` e usa o período. Atualizações exigem header `X-Admin-Token`.

## Arquitetura

```text
backend/app/ingest.py      leitura, validação, wide → long, situações
backend/app/storage.py     versões, arquivos originais, ativação, locks
backend/app/analytics.py   SQL parametrizado, agregações, cache por versão
backend/app/main.py        rotas FastAPI e modelos Pydantic
backend/app/cli.py         administração local
frontend/src/components/  componentes, filtros, gráficos e tabela
frontend/src/pages/       módulos do dashboard
frontend/src/lib/         tipos, API, formatação pt-BR
frontend/src/styles.css   design responsivo e tokens de interface
frontend/nginx.conf       proxy /api e roteamento SPA para Docker
data/                     arquivos persistentes, ignorados pelo Git
docs/                     esquema real e auditoria
tests/                    fixtures sintéticas e testes da API
```

SQLAlchemy faz a persistência; consultas usam parâmetros, índices em ano/UF/indicador/situação e município. O navegador não recebe o arquivo nem a base completa. Agregações do dashboard são cacheadas pela versão ativa e pelo recorte; uma importação/rollback troca a chave sem reutilizar respostas antigas. Rankings e páginas são produzidos no servidor.

## Qualidade e build

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q backend
.venv/bin/pip check
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run format
```

Os testes usam apenas arquivos sintéticos e um diretório temporário separado. Cobrem classificação conservadora, novos anos/indicadores, normalização, população ausente, zeros, duplicidades, arquivo inválido, filtros, agregação nacional/UF, histórico, paginação, exportações, autorização, validação sem ativação, importação e rollback. Consulte [a validação desta entrega](docs/VALIDACAO.md) para resultados e limites concretos.

## Docker

```bash
docker compose up --build
```

O frontend é servido pelo Nginx na porta local 8080, com proxy interno para o backend. A pasta `data/` persiste por bind mount. Sem base inicial, utilize a tela administrativa ou a CLI no contêiner; não copie dados reais para a imagem. A rede do builder precisa resolver e alcançar os registros oficiais do npm e PyPI. Nesta máquina, o build em contêiner encontrou falha de DNS ao baixar dependências; a execução nativa foi validada. Não foi desativada nenhuma verificação de TLS ou integridade.
