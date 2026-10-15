import { useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Chart } from "../components/Chart";
import { LoadState, MethodNote, Panel, Status } from "../components/Common";
import { number, params, percent, useApi } from "../lib/api";
import type { History } from "../lib/types";
import type { ViewProps } from "./Overview";
import {
  TrendTable,
  YearComparison,
  MethodChanges,
} from "../components/HistoryDetails";
const colors = [
  "#168b7a",
  "#577ec4",
  "#d19e48",
  "#9b73bc",
  "#d67f7f",
  "#5ba5b7",
];
export function Historical({ filters, catalog, navigate }: ViewProps) {
  const [rankPage, setRankPage] = useState(1);
  const [level, setLevel] = useState("state"),
    [order, setOrder] = useState<"average" | "variation" | "latest">("average");
  const effective = {
    ...filters,
    year: undefined,
    start: filters.start || String(catalog.years[0]),
    end: filters.end || String(catalog.years.at(-1)),
  };
  const rankKey = params({ ...effective, level });
  const [previousRankKey, setPreviousRankKey] = useState(rankKey);
  if (previousRankKey !== rankKey) {
    setPreviousRankKey(rankKey);
    setRankPage(1);
  }
  const { data, loading, error, retry } = useApi<History>(
    "/api/history?" + params({ ...effective, level, rank_page: rankPage }),
  );
  if (!data) return <LoadState {...{ loading, error, retry }} />;
  if (!data.totals.length)
    return <LoadState {...{ loading, error, retry }} empty />;
  const ids = [...new Set(data.series.map((d) => d.INDICADOR!))],
    years = data.totals.map((d) => d.ANO!);
  const changes = data.changes.filter(
    (c) =>
      years.includes(c.year) &&
      (!filters.indicator || c.indicator === Number(filters.indicator)),
  );
  const relevant = data.series.filter((d) => d.percentage !== null);
  const best = [...relevant].sort((a, b) => b.percentage! - a.percentage!)[0],
    worst = [...relevant].sort((a, b) => a.percentage! - b.percentage!)[0];
  const unique = [
    ...new Set(
      data.ranking.map((d) => (level === "municipality" ? d.COD_MUN! : d.UF!)),
    ),
  ];
  const rankings = unique
    .map((code) => {
      const rows = data.ranking.filter(
        (d) => (level === "municipality" ? d.COD_MUN : d.UF) === code,
      );
      const values = rows.filter((d) => d.percentage !== null);
      const avg = values.length
        ? values.reduce((s, r) => s + r.percentage!, 0) / values.length
        : null;
      return {
        code,
        rows,
        avg,
        variation:
          values.length > 1
            ? values.at(-1)!.percentage! - values[0].percentage!
            : null,
        latest: values.at(-1)?.percentage ?? null,
      };
    })
    .sort(
      (a, b) =>
        (b[order === "average" ? "avg" : order] ?? -Infinity) -
        (a[order === "average" ? "avg" : order] ?? -Infinity),
    );
  const periodDelta =
    data.first?.percentage != null && data.last?.percentage != null
      ? data.last.percentage - data.first.percentage
      : null;
  const chartOption = (id?: number) => ({
    tooltip: {
      trigger: "axis" as const,
      valueFormatter: (v: unknown) =>
        typeof v === "number" ? percent(v) : "Sem informação",
    },
    grid: { left: 52, right: 25, top: 35, bottom: 55 },
    legend: { show: !id, type: "scroll" as const, bottom: 0 },
    xAxis: { type: "category" as const, data: years },
    yAxis: {
      type: "value" as const,
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#edf1f2" } },
    },
    series: (id ? [id] : ids).map((ind, i) => ({
      name: `Indicador ${String(ind).padStart(2, "0")}`,
      type: "line" as const,
      smooth: false,
      connectNulls: false,
      symbolSize: 6,
      lineStyle: { width: 2 },
      itemStyle: { color: colors[i % colors.length] },
      data: years.map(
        (y) =>
          data.series.find((d) => d.ANO === y && d.INDICADOR === ind)
            ?.percentage ?? null,
      ),
      markLine: changes.filter((c) => c.indicator === ind).length
        ? {
            silent: true,
            symbol: ["none", "none"],
            label: { show: false },
            lineStyle: { color: "#be8d42", type: "dashed" as const },
            data: changes
              .filter((c) => c.indicator === ind)
              .map((c) => ({ xAxis: String(c.year) })),
          }
        : undefined,
    })),
  });
  return (
    <>
      <div className="segmented">
        <button
          onClick={() =>
            navigate("/historico", { uf: undefined, municipality: undefined })
          }
          className={!filters.uf ? "active" : ""}
        >
          Brasil
        </button>
        <button
          onClick={() => setLevel("state")}
          className={level === "state" && filters.uf ? "active" : ""}
        >
          Estados
        </button>
        <button
          onClick={() => setLevel("municipality")}
          className={level === "municipality" ? "active" : ""}
        >
          Municípios
        </button>
        <span>Use os filtros para escolher o território.</span>
      </div>
      <div className="stats history-stats">
        {[
          ["Ano inicial", data.first?.ANO],
          ["Ano final", data.last?.ANO],
          ["Alcance no início", percent(data.first?.percentage)],
          ["Alcance no final", percent(data.last?.percentage)],
          [
            "Variação no período",
            periodDelta === null ? "—" : `${number(periodDelta, 1)} p.p.`,
          ],
        ].map(([k, v]) => (
          <div className="stat" key={k}>
            <span className="stat-label">{k}</span>
            <strong>{v ?? "—"}</strong>
            <small>Observações classificadas no recorte</small>
          </div>
        ))}
      </div>
      <MethodNote />
      {changes.length > 0 && (
        <div className="notice warning">
          <AlertTriangle size={20} />
          <div>
            <b>Alteração de meta/metodologia</b>
            <p>
              A definição ou meta deste indicador foi alterada ao longo do
              período. A série deve ser interpretada considerando essas
              mudanças. A numeração também pode passar a representar outro tema;
              variação não implica melhora ou piora.
            </p>
          </div>
        </div>
      )}
      <Panel
        title="Evolução do cumprimento das metas"
        subtitle="% de municípios por indicador que atingiram a meta · linhas tracejadas indicam alterações"
      >
        <Chart
          label="Série histórica do alcance das metas"
          height={370}
          option={chartOption()}
        />
      </Panel>
      <div className="two-columns">
        <Panel
          title="Destaques do período"
          subtitle="Calculados diretamente das observações classificadas"
        >
          <div className="highlights">
            {data.highlights.slice(0, 6).map((h, i) => (
              <p key={i}>
                <TrendingUp size={16} />
                {h}
              </p>
            ))}
          </div>
        </Panel>
        <Panel
          title="Extremos observados"
          subtitle="Comparações descritivas do alcance; não indicam efeito causal"
        >
          <div className="definition-grid">
            {[
              [
                "Maior alcance",
                `${percent(best?.percentage)} · I${best?.INDICADOR} / ${best?.ANO}`,
              ],
              [
                "Menor alcance",
                `${percent(worst?.percentage)} · I${worst?.INDICADOR} / ${worst?.ANO}`,
              ],
              ["Anos com informação", String(years.length)],
              ["Unidade", "Município × indicador"],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p className="panel-footnote">
            Variações de proporção são expressas em pontos percentuais.
            Resultados originais com escala ambígua não recebem interpretação
            direcional automática.
          </p>
        </Panel>
      </div>
      {filters.municipality && (
        <Panel
          title="Trajetória municipal"
          subtitle="Resultado original e meta de cada ano; escalas da fonte preservadas"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ano</th>
                  <th>Indicador</th>
                  <th>Resultado observado</th>
                  <th>Meta do ano</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.observations.map((d) => (
                  <tr key={`${d.ANO}-${d.INDICADOR}`}>
                    <td>{d.ANO}</td>
                    <td title={d.DESCRICAO}>
                      I{String(d.INDICADOR).padStart(2, "0")}
                    </td>
                    <td>{number(d.RESULTADO, 4)}</td>
                    <td>{d.LABEL_META}</td>
                    <td>
                      <Status value={d.SITUACAO} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="notice">
            A escala do resultado não está normalizada no arquivo. A linha
            numérica da meta e a distância para a meta exigem validação
            metodológica; os textos e resultados originais são apresentados sem
            conversão presumida.
          </p>
        </Panel>
      )}
      {data.persistent?.length > 0 && (
        <Panel
          title="Persistência de dificuldades"
          subtitle="Até 25 municípios com observações negativas e nenhuma alcançada no recorte, presentes em pelo menos dois anos. Sem informação não é fracasso."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Município</th>
                  <th>UF</th>
                  <th>Anos presentes</th>
                  <th>Não alcançadas</th>
                  <th>Sem informação</th>
                </tr>
              </thead>
              <tbody>
                {data.persistent.map((d) => (
                  <tr key={d.COD_MUN}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() =>
                          navigate("/historico", {
                            municipality: d.COD_MUN,
                            uf: d.UF,
                          })
                        }
                      >
                        {d.NOME_MUN}
                      </button>
                    </td>
                    <td>{d.UF}</td>
                    <td>{d.years}</td>
                    <td>{number(d.failed)}</td>
                    <td>{number(d.unknown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <TrendTable data={data} municipality={!!filters.municipality} />
      <YearComparison data={data} />
      {data.ranking.length > 0 && (
        <Panel
          title={
            level === "municipality"
              ? "Evolução municipal"
              : "Estados ao longo do tempo"
          }
          subtitle={
            level === "municipality"
              ? "Até 25 municípios por página · média simples dos percentuais anuais"
              : "Média histórica simples dos percentuais anuais"
          }
          action={
            <select
              aria-label="Ordenar ranking histórico"
              value={order}
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="average">Média histórica</option>
              <option value="variation">Variação</option>
              <option value="latest">Último ano</option>
            </select>
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Território</th>
                  {years.map((y) => (
                    <th key={y}>{y}</th>
                  ))}
                  <th>Média</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => (
                  <tr key={r.code}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() =>
                          navigate(
                            "/historico",
                            level === "municipality"
                              ? { municipality: r.code, uf: r.rows[0].UF }
                              : { uf: r.code, municipality: undefined },
                          )
                        }
                      >
                        {level === "municipality" ? r.rows[0].NOME_MUN : r.code}
                      </button>
                    </td>
                    {years.map((y) => {
                      const value = r.rows.find((d) => d.ANO === y)?.percentage;
                      return (
                        <td
                          key={y}
                          className="heat-cell"
                          style={{
                            background:
                              value == null
                                ? "#f4f6f7"
                                : `rgba(22,139,122,${0.05 + value / 450})`,
                          }}
                        >
                          {percent(value)}
                        </td>
                      );
                    })}
                    <td>
                      <b>{percent(r.avg)}</b>
                    </td>
                    <td>
                      {r.variation === null
                        ? "—"
                        : `${number(r.variation, 1)} p.p.`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {level === "municipality" && (
            <div className="pagination">
              <span>
                {number(data.rank_total)} municípios · página {rankPage}
              </span>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={rankPage === 1}
                  onClick={() => setRankPage(rankPage - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={rankPage * 25 >= data.rank_total}
                  onClick={() => setRankPage(rankPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}
      {filters.uf && (
        <Panel title={`Indicadores × anos · ${filters.uf}`}>
          <Chart
            label="Heatmap histórico dos indicadores"
            height={Math.max(250, ids.length * 30)}
            option={{
              tooltip: { position: "top" },
              grid: { left: 75, right: 20, top: 15, bottom: 65 },
              xAxis: { type: "category", data: years.map(String) },
              yAxis: {
                type: "category",
                data: ids.map((id) => `Ind. ${id}`),
                inverse: true,
              },
              visualMap: {
                min: 0,
                max: 100,
                orient: "horizontal",
                bottom: 0,
                left: "center",
                inRange: { color: ["#f6e5d6", "#deeee4", "#168b7a"] },
              },
              series: [
                {
                  type: "heatmap",
                  data: data.series
                    .filter((d) => d.percentage !== null)
                    .map((d) => [
                      years.indexOf(d.ANO!),
                      ids.indexOf(d.INDICADOR!),
                      d.percentage!,
                    ]),
                  label: {
                    show: true,
                    formatter: (p) => percent((p.value as number[])[2]),
                  },
                  itemStyle: { borderWidth: 3, borderColor: "#fff" },
                },
              ],
            }}
          />
        </Panel>
      )}
      <Panel
        title="Todos os indicadores"
        subtitle="Pequenos múltiplos · selecione para abrir a análise completa"
      >
        <div className="small-multiples">
          {ids.map((id) => (
            <button
              key={id}
              className="mini-chart"
              onClick={() => navigate("/historico", { indicator: String(id) })}
            >
              <strong>Indicador {String(id).padStart(2, "0")}</strong>
              <Chart
                label={`Evolução do indicador ${id}`}
                height={190}
                option={chartOption(id)}
              />
            </button>
          ))}
        </div>
      </Panel>
      <MethodChanges changes={changes} />
    </>
  );
}
