import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from "lucide-react";
import { useMemo } from "react";
import { Chart } from "../components/Chart";
import {
  ExportButtons,
  LoadState,
  MethodNote,
  Panel,
  Progress,
  Stats,
} from "../components/Common";
import { number, params, percent, useApi } from "../lib/api";
import type { Catalog, Dashboard, Filters } from "../lib/types";
export type ViewProps = {
  filters: Filters;
  catalog: Catalog;
  onChange: (patch: Filters, reset?: boolean) => void;
  navigate: (path: string, patch?: Filters) => void;
};
export function Overview({ filters, catalog, navigate }: ViewProps) {
  const { data, error, loading, retry } = useApi<Dashboard>(
    "/api/dashboard?" + params(filters),
  );
  const sorted = useMemo(
    () =>
      [...(data?.states || [])].sort(
        (a, b) => (b.percentage ?? -1) - (a.percentage ?? -1),
      ),
    [data],
  );
  const ids = [...new Set(data?.indicators.map((d) => d.INDICADOR) || [])].sort(
    (a, b) => (a || 0) - (b || 0),
  );
  if (!data) return <LoadState {...{ error, loading, retry }} />;
  if (!data.summary.total)
    return <LoadState {...{ error, loading, retry }} empty />;
  const ordered = [...data.indicators]
    .filter((d) => d.percentage !== null)
    .sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
  return (
    <>
      <Stats data={data.summary} />
      <MethodNote />
      <div className="insight-row">
        {[ordered[0], ordered.at(-1)].map(
          (d, i) =>
            d && (
              <button
                className="insight"
                key={i}
                onClick={() =>
                  navigate("/indicadores", { indicator: String(d.INDICADOR) })
                }
              >
                {i === 0 ? (
                  <ArrowUpRight className="green-text" />
                ) : (
                  <ArrowDownRight className="amber-text" />
                )}
                <span>
                  <small>
                    {i === 0
                      ? "MAIOR PROPORÇÃO DE ALCANCE"
                      : "MENOR PROPORÇÃO DE ALCANCE"}
                  </small>
                  <strong>
                    Indicador {String(d.INDICADOR).padStart(2, "0")}{" "}
                    <b>{percent(d.percentage)}</b>
                  </strong>
                </span>
                <ChevronRight size={16} />
              </button>
            ),
        )}
      </div>
      <div className="two-columns">
        <Panel
          title="Situação das metas"
          subtitle="Alcance por indicador · clique para explorar"
          action={<ExportButtons filters={filters} kind="indicators" />}
        >
          <div className="legend">
            <span>
              <i className="green-bg" />
              Alcançadas
            </span>
            <span>
              <i className="red-bg" />
              Não alcançadas
            </span>
            <span>
              <i className="gray-bg" />
              Sem informação
            </span>
          </div>
          <div className="indicator-grid">
            {data.indicators.map((d) => {
              const def = catalog.definitions.find(
                (x) => x.ANO === d.ANO && x.INDICADOR === d.INDICADOR,
              );
              return (
                <button
                  className="indicator-card"
                  key={`${d.ANO}-${d.INDICADOR}`}
                  onClick={() =>
                    navigate("/indicadores", { indicator: String(d.INDICADOR) })
                  }
                >
                  <div className="indicator-top">
                    <span>
                      INDICADOR {String(d.INDICADOR).padStart(2, "0")}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                  <p title={def?.DESCRICAO}>
                    {def?.DESCRICAO.replace(/^Indicador \d+\s*-\s*/, "")}
                  </p>
                  <small className="target-label">{def?.LABEL_META}</small>
                  <Progress value={d.percentage} />
                  <small>
                    {number(d.reached)} atingiram · {number(d.failed)} não
                    atingiram
                    <br />
                    {number(d.unknown)} sem informação
                  </small>
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel
          title="Desempenho dos estados"
          subtitle="Alcance entre observações municipais avaliadas"
          action={<span className="pill">{sorted.length} UFs</span>}
        >
          <Chart
            label="Ranking dos estados por percentual de alcance"
            height={Math.max(330, sorted.length * 30)}
            option={{
              grid: { left: 40, right: 48, top: 12, bottom: 30 },
              tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
              xAxis: {
                type: "value",
                max: 100,
                axisLabel: { formatter: "{value}%" },
                splitLine: { lineStyle: { color: "#eef2f3" } },
              },
              yAxis: {
                type: "category",
                inverse: true,
                data: sorted.map((d) => d.UF!),
                axisLine: { show: false },
                axisTick: { show: false },
              },
              series: [
                {
                  type: "bar",
                  data: sorted.map((d) => d.percentage),
                  barWidth: 12,
                  itemStyle: { color: "#168b7a", borderRadius: [0, 4, 4, 0] },
                  label: {
                    show: true,
                    position: "right",
                    formatter: (p) => percent(p.value as number),
                  },
                },
              ],
            }}
            onClick={(e) =>
              navigate("/estados", {
                uf: String(e.name),
                municipality: undefined,
              })
            }
          />
          <p className="panel-footnote">
            Selecione uma barra para abrir o estado.
          </p>
        </Panel>
      </div>
      <Panel
        title="Mapa de desempenho das metas"
        subtitle="Estado × indicador · percentual de municípios que atingiram cada meta"
      >
        <Chart
          label="Heatmap de estados e indicadores"
          height={Math.max(420, catalog.states.length * 25)}
          option={{
            tooltip: {
              position: "top",
              formatter: (p) => {
                const item = (Array.isArray(p) ? p[0] : p).data as number[];
                const d = data.heatmap.find(
                  (x) =>
                    x.UF === catalog.states[item[1]] &&
                    x.INDICADOR === ids[item[0]],
                );
                return d
                  ? `${d.UF} · Indicador ${d.INDICADOR}<br/>Avaliados: ${number(d.evaluated_municipalities)}<br/>Atingiram: ${number(d.reached)}<br/>Não atingiram: ${number(d.failed)}<br/>Alcance: ${percent(d.percentage)}`
                  : "";
              },
            },
            grid: { left: 45, right: 20, top: 25, bottom: 70 },
            xAxis: {
              type: "category",
              data: ids.map((id) => `I${String(id).padStart(2, "0")}`),
              splitArea: { show: true },
            },
            yAxis: { type: "category", data: catalog.states, inverse: true },
            visualMap: {
              min: 0,
              max: 100,
              orient: "horizontal",
              left: "center",
              bottom: 0,
              inRange: { color: ["#f8e6d3", "#e3eee5", "#90c9b8", "#147c70"] },
            },
            series: [
              {
                type: "heatmap",
                data: data.heatmap
                  .filter((d) => d.percentage !== null)
                  .map((d) => [
                    ids.indexOf(d.INDICADOR),
                    catalog.states.indexOf(d.UF!),
                    d.percentage!,
                  ]),
                label: {
                  show: true,
                  formatter: (p) => `${Math.round((p.value as number[])[2])}%`,
                  fontSize: 10,
                },
                itemStyle: { borderColor: "#fff", borderWidth: 3 },
              },
            ],
          }}
          onClick={(e) => {
            const value = e.value as number[];
            navigate("/indicadores", {
              uf: catalog.states[value[1]],
              indicator: String(ids[value[0]]),
            });
          }}
        />
      </Panel>
      <div className="notice">
        <Info size={18} />
        <span>
          <b>Dados com contexto.</b> Há mudanças de definição e codificação na
          base. Consulte a Análise Histórica antes de comparar períodos.{" "}
          {number(data.summary.conflicts)} classificações divergentes neste
          recorte.
        </span>
      </div>
    </>
  );
}
