# Análise da Base_Painel.xlsx

Análise integral realizada em 15/10/2026 antes da definição da ingestão. O original de 21.885.853 bytes é preservado fora do código-fonte. O inventário exato de todas as colunas, contagens de ausências, códigos de situação e denominadores zero por aba está em `schema-audit.json`.

## Estrutura confirmada

10 abas: um dicionário e nove abas anuais PQA_VS_2013 a PQA_VS_2021. Cada aba anual possui 86 colunas e 27 UFs. São 5.570 linhas municipais por ano, exceto 2019 e 2021, com 5.561. Total: 50.112 linhas municipais. Não há duplicidade ANO × COD_MUN nem ausências nos identificadores territoriais. COD_MUN é numérico de seis dígitos no arquivo; é preservado como texto, sem inventar dígito verificador.

O dicionário tem 142 registros e sete colunas: ANO, INDICADOR, DESCRICAO, LABEL_NUM, LABEL_DEN, LABEL_RES, LABEL_META. Não possui campos ausentes. Tem definições de 2013 a 2022, mas não há observações municipais de 2022. Portanto, 2022 não é um ano disponível para análise de resultados.

As abas anuais contêm ANO, UF, COD_MUN, NOME_MUN, POP_ANO; grupos IND_01 até IND_15, cada um com NUM, DEN, RES, META, ALCANCE_META; e VL_PQA_VS, METAS_ALCANCADAS, METAS_NAO_ALCANCADAS, QTDE_INDICADORES, QTDE_AUSENCIA_CASOS, PERCENTUAL. A presença física do grupo não significa que o indicador existe no ano. O dicionário define 14 indicadores em 2013–2015, 15 em 2016–2017 e 14 em 2018–2022. Grupos vazios sem definição não entram nas análises.

## Diferenças e inconsistências

- `_META` não é um limiar numérico: contém Sim, Não, zero, vazio e uma referência técnica. O texto do limiar está em LABEL_META.
- Em 2013, indicador 08: há 4.784 divergências entre META e ALCANCE_META. Não se escolhe uma das duas versões silenciosamente.
- Em 2020, indicador 08: resultados e META inteiramente ausentes, embora ALCANCE_META seja zero. Não são classificados como fracassos.
- Em 2021, indicador 08: resultados inteiramente ausentes, mas META=Sim e ALCANCE_META=1 em todos os municípios. A aplicação preserva a classificação explícita, exibindo resultado ausente, sem inventar medidas.
- Em 2021, indicador 09: 78 situações fazem referência a `Ver NT Nº 103/2021-CGIAE`. Sem a nota técnica, são tratadas como informação insuficiente e apresentadas com a observação original.
- Em 2016 o indicador 13 tem classificação negativa em todos os municípios. Isso é relatado, sem tentativa de corrigir a fonte.
- `METAS_ALCANCADAS` diverge da soma dos alcances individuais em 194, 124, 99, 2.650, 30, 14, 14, 5.570 e 22 linhas, respectivamente de 2013 a 2021. Totais analíticos são recalculados a partir da classificação conservadora das observações, não dos totais prontos.
- `PERCENTUAL` não é assumido como percentual de metas cumpridas: em Acrelândia/2013, por exemplo, é 100 enquanto METAS_ALCANCADAS=9 e QTDE_INDICADORES=15. O significado exato exige documentação externa.
- A população está ausente em 152 municípios em 2013, 124 em 2014, 96 em 2015 e 41 em 2016. Isso não invalida os identificadores nem autoriza imputação; filtros populacionais excluem essas observações e totais de população indicam cobertura parcial.
- Há NULL textual e células vazias. Zero é preservado. Denominadores zero não são usados para inferir ausência de casos nem aplicabilidade individual.
- Há proporções em escala 0–1, resultados em escala 0–100, contagens, crescimentos negativos e valores extremos. Exemplo: IND_02_RES de Acrelândia/2013 é 97; em 2014 é 0,9962. Resultados brutos não são reescalados por heurística nem agregados por média indiscriminadamente.
- Em 2018 a numeração muda: o indicador 06 passa de semanas de envio do Sinan para encerramento de DNCI; malária passa de 08 para 07 e outros códigos também mudam. Séries por número não significam continuidade temática. São exibidas advertências e diferenças completas por código/ano.
- O dicionário de 2022 mantém “Meta 50 semanas” para uma descrição de encerramento de DNCI: aparente incompatibilidade que demanda confirmação metodológica.

Faltam em 2019 e 2021 os mesmos nove municípios presentes em 2018: Conde/BA, Fernando de Noronha/PE, Francisco Macedo/PI, Jurema/PI, Palmeirais/PI, Porto/PI, Santo Antônio dos Milagres/PI, São Francisco de Assis do Piauí/PI e São Lourenço do Piauí. Não se preenchem registros inexistentes com fracassos.

## Regras adotadas e limites

Classificação alcançada: META=Sim e ALCANCE=1, mesmo que a medida esteja ausente (origem explicitada). Não alcançada: META=Não e ALCANCE=0 com resultado informado. Divergência, referência técnica ou resultado ausente com classificação negativa: sem informação. Não há codificação individual inequívoca para ausência de casos ou não aplicabilidade nesta fonte; essas situações não são inventadas. QTDE_AUSENCIA_CASOS é apenas um total territorial e não identifica o indicador correspondente.

Percentual por indicador/UF: alcançadas ÷ (alcançadas + não alcançadas), excluindo observações sem classificação resolvida. Com vários indicadores, o denominador são observações município × indicador, não municípios únicos. A interface informa essa distinção. Contagem de municípios avaliados usa códigos únicos com alguma observação classificável. Não existe meta estadual: os estados agregam observações municipais.

Cada série histórica utiliza o dicionário do próprio ano. Toda mudança em descrição, rótulos ou meta é detectada e exibida; variações são descritivas e não chamadas automaticamente de melhora ou piora. Resultado × meta numérica, distância para meta e “melhor/pior resultado” não são calculados quando escala e regra não são inequívocas. O texto original da meta permanece disponível. Essa limitação evita interpretações inventadas e pode ser resolvida com documentação metodológica validada.

## Privacidade

As 86 colunas inspecionadas contêm agregados municipais, população e medidas de indicadores; não foram encontrados nomes individuais, CPF, endereços de pessoas ou linhas individualizadas. Nomes de municípios não são dados pessoais. O arquivo e os bancos derivados ficam ignorados pelo Git. Nenhum dado é enviado a serviços externos. O navegador recebe agregações e páginas limitadas.
