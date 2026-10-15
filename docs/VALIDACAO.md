# Validação da entrega

Executada em 15/10/2026 no ambiente de nuvem, com Python 3.12.14 e Node 24.19.0.

## Dados reais

- Dez abas lidas integralmente e esquema registrado em `ESQUEMA.md` e `schema-audit.json`.
- Base inicial importada: 2013–2021, 27 UFs, 5.570 municípios distintos, 50.112 linhas territoriais e 712.708 observações normalizadas.
- 304.256 observações alcançadas, 381.832 não alcançadas e 26.620 sem informação, segundo a política conservadora documentada. Esses totais acumulam anos e indicadores; não representam municípios distintos.
- 4.784 divergências de classificação mantidas como informação insuficiente, todas no indicador 08/2013.
- Consulta real indicador 08/2020: 5.570 observações sem informação, nenhuma classificada como fracasso e percentual nulo; ausência não foi convertida em meta não alcançada.
- Populações ausentes preservadas. Consulta AC/2013 informa cinco municípios sem população e soma somente valores conhecidos.
- Consulta histórica municipal nacional retorna séries de 25 municípios por página (225 linhas anuais na primeira página), sem transmitir a base inteira.

## Comandos e verificações aprovados

| Verificação | Resultado |
| --- | --- |
| Instalação Python em venv isolado, usando requirements.lock | Aprovada |
| npm ci usando package-lock.json | Aprovada |
| Execução integral do install_script salvo | Aprovada |
| pip check | Nenhuma dependência quebrada |
| pytest | 15 testes aprovados, nenhum pulado |
| compileall backend e testes | Aprovado |
| ESLint | Aprovado sem erros |
| TypeScript e Vite build | Aprovados |
| Backend iniciado e requisições funcionais | Aprovados |
| Frontend iniciado, proxy para backend e consultas reais | Aprovados |
| CSV e XLSX via API | Aprovados |
| Importação, novo ano/indicador e rollback via API | Aprovados com arquivos sintéticos em diretório isolado |

O pytest emite um aviso de depreciação interno do Starlette/AnyIO, sem falha. O build emite aviso de tamanho do chunk ECharts (567 kB antes de gzip, 189 kB comprimido); a biblioteca já usa registro dos tipos de gráfico necessários e chunk separado. O aviso não impediu o build.

## Verificação no navegador

Chromium em modo headless, com inspeção visual das capturas:

- Visão Geral renderizada com dados reais e ECharts.
- Cliques no ranking de estados e no heatmap abrem, respectivamente, a UF e o indicador na UF. Rótulos acessíveis dos gráficos preservados.
- Ordenação da tabela e seleção da coluna de população verificadas no navegador.
- Filtro de UF e persistência durante navegação.
- Drill-down UF → município → trajetória histórica.
- Detalhes de indicadores, séries, registro de mudanças metodológicas e comparação de anos.
- Comparação de dois municípios, com resultado, texto da meta e situação.
- Paginação e download CSV pelo navegador.
- Chave administrativa, histórico de importações e relatório de arquivo inválido.
- Upload da Base_Painel.xlsx original e relatório de arquivo válido, sem ativação automática; botão de confirmação exibido separadamente. Importação/rollback foram exercitados pela API em base temporária para preservar a base real ativa.
- Layouts de 1.024, 768 e 390 pixels sem overflow horizontal da página. Tabelas largas possuem rolagem interna.
- Nenhum erro JavaScript não tratado na execução final.

O script opcional `tests/browser_smoke.py` permite repetir a navegação em uma instância já iniciada, com Playwright e Chromium instalados. Ele descobre o ano e o território nos dados e não importa nem reativa versões. O upload real foi verificado separadamente, além desse smoke test. Para rodar: `python3 tests/browser_smoke.py` em um Python com Playwright. `PQAVS_BROWSER_URL` e `PQAVS_CHROMIUM` permitem ajustar a origem local e o executável. O teste pressupõe a base completa já importada e lê a chave administrativa do arquivo local sem imprimi-la.

## Limitações explícitas

- Escalas heterogêneas e mudanças semânticas impedem calcular automaticamente uma meta numérica comparável, a distância para a meta e direção de melhora/piora do resultado bruto. Valores originais, classificação e texto da meta são apresentados. Esse refinamento exige documentação metodológica validada, incluindo as notas técnicas referidas na fonte.
- Não se deduz ausência de casos ou não aplicabilidade individual de totais agregados territoriais. A fonte atual não fornece uma codificação individual inequívoca para essas situações.
- Dockerfiles, Compose e configuração Nginx foram escritos e a construção foi tentada. O builder falhou ao resolver os destinos de dependências, inclusive após reutilizar os proxies já fornecidos ao ambiente. Não houve desativação de TLS. Execução em contêiner e `docker compose up` não foram validados; o fluxo nativo está operacional.
- A configuração reutilizável `install_script` e `start_skill` foi salva como rascunho. Publicação e restauração em uma nova tarefa dependem das ações da interface de ambientes e não foram afirmadas como realizadas.
