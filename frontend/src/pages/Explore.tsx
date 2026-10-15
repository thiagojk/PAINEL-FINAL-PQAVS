import { useState } from "react";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Chart } from "../components/Chart";
import {
  ExportButtons,
  LoadState,
  MethodNote,
  Panel,
  Progress,
  Stats,
  Status,
} from "../components/Common";
import { Button } from "../components/ui/button";
import { number, params, percent, useApi } from "../lib/api";
import type { Dashboard, Observation } from "../lib/types";
import type { ViewProps } from "./Overview";
export function Explore(
  props: ViewProps & {
    mode: "states" | "municipalities" | "indicators" | "table";
  },
) {
  const { filters, catalog, onChange, navigate, mode } = props;
  const { data, loading, error, retry } = useApi<Dashboard>(
    "/api/dashboard?" + params(filters),
  );
  const [detailPage, setDetailPage] = useState(1);
  const detail =
    !!filters.municipality || (mode === "indicators" && !!filters.indicator);
  const observations = useApi<{ rows: Observation[]; total: number }>(
    detail
      ? "/api/observations?" +
          params({ ...filters, page: detailPage, page_size: 25 })
      : null,
  );
  const definition = catalog.definitions.find(
    (d) =>
      d.ANO === Number(filters.year) &&
      d.INDICADOR === Number(filters.indicator),
  );
  const municipality = observations.data?.rows[0];
  return (
    <>
      <LoadState {...{ loading, error, retry }} />
      {data && (
        <>
          <Stats data={data.summary} />
          <MethodNote />
          {filters.uf && (
            <Panel
              title={`Estado · ${filters.uf}`}
              subtitle="Desempenho dos municípios do estado; não representa uma meta estadual."
            >
              <div className="definition-grid">
                <div>
                  <small>Municípios presentes</small>
                  <strong>{number(data.summary.municipalities)}</strong>
                </div>
                <div>
                  <small>
                    População coberta · {data.summary.population_year}
                  </small>
                  <strong>
                    {number(data.summary.population)} habitantes
                    {data.summary.missing_population
                      ? ` · população ausente em ${number(data.summary.missing_population)} municípios`
                      : ""}
                  </strong>
                </div>
              </div>
            </Panel>
          )}
          {filters.municipality && municipality && (
            <Panel>
              <div className="profile-header">
                <div className="profile-icon">
                  <MapPin size={28} />
                </div>
                <div>
                  <span className="eyebrow">PERFIL MUNICIPAL</span>
                  <h2>
                    {municipality.NOME_MUN}{" "}
                    <span className="muted">/ {municipality.UF}</span>
                  </h2>
                  <p>
                    Código {municipality.COD_MUN} · População{" "}
                    {number(municipality.POP_ANO)} · {municipality.ANO}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate("/historico")}
                >
                  Ver trajetória <ArrowRight size={15} />
                </Button>
              </div>
            </Panel>
          )}
          {definition && (
            <Panel
              title={`Indicador ${String(definition.INDICADOR).padStart(2, "0")}`}
              subtitle={definition.DESCRICAO}
            >
              <div className="definition-grid">
                {[
                  ["Meta do ano", definition.LABEL_META],
                  ["Numerador", definition.LABEL_NUM],
                  ["Denominador", definition.LABEL_DEN],
                  ["Resultado", definition.LABEL_RES],
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={() => navigate("/historico")}>
                Analisar histórico <ArrowRight size={15} />
              </Button>
            </Panel>
          )}
          {(mode === "indicators" || filters.uf) && (
            <Panel
              title={
                filters.uf
                  ? `Desempenho por indicador · ${filters.uf}`
                  : "Indicadores"
              }
              subtitle="Definições e metas do ano selecionado"
              action={<ExportButtons filters={filters} kind="indicators" />}
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Indicador e descrição</th>
                      <th>Meta</th>
                      <th>Avaliados</th>
                      <th>Atingiram</th>
                      <th>Não atingiram</th>
                      <th>Sem informação</th>
                      <th>% alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.indicators.map((d) => {
                      const def = catalog.definitions.find(
                        (x) => x.ANO === d.ANO && x.INDICADOR === d.INDICADOR,
                      );
                      return (
                        <tr key={`${d.ANO}-${d.INDICADOR}`}>
                          <td className="description-cell">
                            <button
                              className="table-link"
                              onClick={() =>
                                navigate("/indicadores", {
                                  indicator: String(d.INDICADOR),
                                })
                              }
                            >
                              Indicador {String(d.INDICADOR).padStart(2, "0")}
                            </button>
                            <small>
                              {def?.DESCRICAO.replace(
                                /^Indicador \d+\s*-\s*/,
                                "",
                              )}
                            </small>
                          </td>
                          <td>{def?.LABEL_META}</td>
                          <td>{number(d.evaluated_municipalities)}</td>
                          <td className="green-text">{number(d.reached)}</td>
                          <td>{number(d.failed)}</td>
                          <td>{number(d.unknown)}</td>
                          <td>
                            <Progress value={d.percentage} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {filters.uf && (
            <Panel title={`Alcance por indicador · ${filters.uf}`}>
              <Chart
                label="Percentual de municípios que atingiram cada indicador"
                height={360}
                option={{
                  grid: { left: 70, right: 40, top: 10, bottom: 30 },
                  tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
                  xAxis: {
                    type: "value",
                    max: 100,
                    axisLabel: { formatter: "{value}%" },
                  },
                  yAxis: {
                    type: "category",
                    inverse: true,
                    data: data.indicators.map((d) => `Ind. ${d.INDICADOR}`),
                  },
                  series: [
                    {
                      type: "bar",
                      data: data.indicators.map((d) => d.percentage),
                      itemStyle: {
                        color: "#168b7a",
                        borderRadius: [0, 4, 4, 0],
                      },
                      barMaxWidth: 18,
                      label: {
                        show: true,
                        position: "right",
                        formatter: (p) => percent(p.value as number),
                      },
                    },
                  ],
                }}
                onClick={(e) =>
                  navigate("/indicadores", {
                    indicator: String(data.indicators[e.dataIndex]?.INDICADOR),
                  })
                }
              />
            </Panel>
          )}
          {detail && (
            <Panel
              title="Situação dos indicadores"
              subtitle="Valores originais da fonte; não compare escalas entre indicadores."
              action={<ExportButtons filters={filters} kind="observations" />}
            >
              <LoadState
                {...observations}
                empty={!!observations.data && !observations.data.total}
              />
              {observations.data && (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Município / Indicador</th>
                          <th>Numerador</th>
                          <th>Denominador</th>
                          <th>Resultado original</th>
                          <th>Meta do ano</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observations.data.rows.map((d) => (
                          <tr key={`${d.ANO}-${d.COD_MUN}-${d.INDICADOR}`}>
                            <td className="description-cell">
                              <button
                                className="table-link"
                                onClick={() =>
                                  navigate("/indicadores", {
                                    municipality: d.COD_MUN,
                                    uf: d.UF,
                                    indicator: String(d.INDICADOR),
                                  })
                                }
                              >
                                {d.NOME_MUN} · I
                                {String(d.INDICADOR).padStart(2, "0")}
                              </button>
                              <small>{d.DESCRICAO}</small>
                            </td>
                            <td>{number(d.NUMERADOR, 2)}</td>
                            <td>{number(d.DENOMINADOR, 2)}</td>
                            <td>{number(d.RESULTADO, 4)}</td>
                            <td>{d.LABEL_META}</td>
                            <td>
                              <Status value={d.SITUACAO} />
                              <small className="observation-note">
                                {d.OBSERVACAO}
                                {d.META_FONTE &&
                                String(d.META_FONTE).startsWith("Ver")
                                  ? ` ${d.META_FONTE}`
                                  : ""}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>{number(observations.data.total)} observações</span>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detailPage === 1}
                        onClick={() => setDetailPage(detailPage - 1)}
                      >
                        <ArrowLeft size={14} />
                        Anterior
                      </Button>
                      <span>{detailPage}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detailPage * 25 >= observations.data.total}
                        onClick={() => setDetailPage(detailPage + 1)}
                      >
                        Próxima
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Panel>
          )}
          {mode === "states" && !filters.uf && (
            <DataTable
              filters={filters}
              states
              onSelect={(uf) => onChange({ uf, municipality: undefined })}
            />
          )}
          {(mode === "municipalities" ||
            mode === "table" ||
            (mode === "states" && filters.uf) ||
            (mode === "indicators" && filters.indicator)) &&
            !filters.municipality && (
              <DataTable
                filters={filters}
                onSelect={(municipality, _name, uf) =>
                  navigate("/municipios", { municipality, uf })
                }
              />
            )}
          {filters.municipality && (
            <Button
              variant="outline"
              onClick={() => onChange({ municipality: undefined })}
            >
              <ArrowLeft size={15} />
              Todos os municípios
            </Button>
          )}
        </>
      )}
    </>
  );
}
