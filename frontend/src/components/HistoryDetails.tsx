import { useState } from "react";
import { ArrowRight, CalendarRange } from "lucide-react";
import { Panel } from "./Common";
import { Chart } from "./Chart";
import { number, percent } from "../lib/api";
import type { History, Change } from "../lib/types";

export function TrendTable({
  data,
  municipality,
}: {
  data: History;
  municipality: boolean;
}) {
  return (
    <Panel
      title="Tendências por indicador"
      subtitle="Primeiro e último alcance disponível, variações descritivas e extremos. % relativo só é calculado quando o valor inicial é maior que zero."
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Primeiro</th>
              <th>Último</th>
              <th>Variação p.p.</th>
              <th>Variação relativa</th>
              <th>Máximo / ano</th>
              <th>Mínimo / ano</th>
              {municipality && (
                <>
                  <th>Anos atingiu</th>
                  <th>Anos não atingiu</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.trends.map((t) => (
              <tr key={t.indicator}>
                <td>I{String(t.indicator).padStart(2, "0")}</td>
                <td>
                  {percent(t.first.percentage)} / {t.first.ANO}
                </td>
                <td>
                  {percent(t.last.percentage)} / {t.last.ANO}
                </td>
                <td>{number(t.delta_pp, 1)}</td>
                <td>{percent(t.relative_percentage)}</td>
                <td>
                  {percent(t.maximum.percentage)} / {t.maximum.ANO}
                </td>
                <td>
                  {percent(t.minimum.percentage)} / {t.minimum.ANO}
                </td>
                {municipality && (
                  <>
                    <td>{t.years_reached}</td>
                    <td>{t.years_failed}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function YearComparison({ data }: { data: History }) {
  const years = data.totals.map((d) => d.ANO!);
  const ids = [...new Set(data.series.map((d) => d.INDICADOR!))];
  const [firstYear, setFirstYear] = useState(String(years[0]));
  const [lastYear, setLastYear] = useState(String(years.at(-1)));
  return (
    <Panel
      title="Comparar anos"
      subtitle="Variação na proporção de municípios que atingiram cada meta"
    >
      <div className="year-comparison">
        <label>
          Ano inicial
          <select
            value={firstYear}
            onChange={(e) => setFirstYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <ArrowRight size={20} />
        <label>
          Ano final
          <select
            value={lastYear}
            onChange={(e) => setLastYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              <th>{firstYear}</th>
              <th>{lastYear}</th>
              <th>Variação</th>
              <th>Comparabilidade</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const x = data.series.find(
                  (d) => d.ANO === Number(firstYear) && d.INDICADOR === id,
                ),
                y = data.series.find(
                  (d) => d.ANO === Number(lastYear) && d.INDICADOR === id,
                );
              const delta =
                x?.percentage != null && y?.percentage != null
                  ? y.percentage - x.percentage
                  : null;
              const changed = data.changes.some(
                (c) =>
                  c.indicator === id &&
                  c.year > Math.min(Number(firstYear), Number(lastYear)) &&
                  c.year <= Math.max(Number(firstYear), Number(lastYear)),
              );
              return (
                <tr key={id}>
                  <td>Indicador {String(id).padStart(2, "0")}</td>
                  <td>{percent(x?.percentage)}</td>
                  <td>{percent(y?.percentage)}</td>
                  <td>{delta === null ? "—" : `${number(delta, 1)} p.p.`}</td>
                  <td>
                    {changed
                      ? "⚠ Definição/meta alterada"
                      : "Sem alteração registrada"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Chart
        label="Variação do alcance entre os anos"
        height={280}
        option={{
          grid: { left: 70, right: 30, top: 15, bottom: 40 },
          tooltip: { trigger: "axis", valueFormatter: (v) => `${v} p.p.` },
          xAxis: { type: "value", name: "p.p." },
          yAxis: { type: "category", data: ids.map((id) => `Ind. ${id}`) },
          series: [
            {
              type: "bar",
              barMaxWidth: 15,
              data: ids.map((id) => {
                const x = data.series.find(
                  (d) => d.ANO === Number(firstYear) && d.INDICADOR === id,
                )?.percentage;
                const y = data.series.find(
                  (d) => d.ANO === Number(lastYear) && d.INDICADOR === id,
                )?.percentage;
                return x != null && y != null
                  ? Number((y - x).toFixed(2))
                  : null;
              }),
              itemStyle: { color: "#168b7a" },
            },
          ],
        }}
      />
    </Panel>
  );
}

export function MethodChanges({ changes }: { changes: Change[] }) {
  return (
    <Panel
      title="Registro de mudanças metodológicas"
      subtitle="Diferenças encontradas no dicionário por código e ano"
    >
      {changes.length ? (
        changes.map((c) => (
          <details className="change" key={`${c.year}-${c.indicator}`}>
            <summary>
              <CalendarRange size={16} />
              {c.year} · Indicador {String(c.indicator).padStart(2, "0")}
              <span>{c.fields.length} campos alterados</span>
            </summary>
            <div className="change-comparison">
              <div>
                <small>DEFINIÇÃO ANTERIOR · {c.previous.ANO}</small>
                <p>{c.previous.DESCRICAO}</p>
                <b>{c.previous.LABEL_META}</b>
                <p>
                  Numerador: {c.previous.LABEL_NUM}
                  <br />
                  Denominador: {c.previous.LABEL_DEN}
                </p>
              </div>
              <div>
                <small>NOVA DEFINIÇÃO · {c.year}</small>
                <p>{c.current.DESCRICAO}</p>
                <b>{c.current.LABEL_META}</b>
                <p>
                  Numerador: {c.current.LABEL_NUM}
                  <br />
                  Denominador: {c.current.LABEL_DEN}
                </p>
              </div>
            </div>
          </details>
        ))
      ) : (
        <p className="panel-footnote">
          Nenhuma alteração registrada no recorte.
        </p>
      )}
    </Panel>
  );
}
