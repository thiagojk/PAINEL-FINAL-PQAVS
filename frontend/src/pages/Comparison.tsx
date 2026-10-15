import { useState } from "react";
import { X } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { LoadState, Panel, Status } from "../components/Common";
import { number, params, useApi } from "../lib/api";
import type { Observation } from "../lib/types";
import type { ViewProps } from "./Overview";
export function Comparison({ filters }: ViewProps) {
  const [selected, setSelected] = useState<
      { code: string; name: string; uf: string }[]
    >([]),
    [message, setMessage] = useState("");
  const { data, error, loading, retry } = useApi<{ rows: Observation[] }>(
    selected.length
      ? "/api/comparison?" +
          params({
            codes: selected.map((d) => d.code).join(","),
            year: filters.year,
          })
      : null,
  );
  const ids = [...new Set(data?.rows.map((r) => r.INDICADOR) || [])].filter(
    (id) => !filters.indicator || id === Number(filters.indicator),
  );
  return (
    <>
      <Panel
        title="Comparar municípios"
        subtitle="Selecione até cinco municípios. O ano de referência é compartilhado; os municípios escolhidos permanecem nesta comparação."
      >
        <div className="selected-municipalities">
          {selected.map((s) => (
            <button
              key={s.code}
              onClick={() =>
                setSelected(selected.filter((x) => x.code !== s.code))
              }
            >
              {s.name} / {s.uf}
              <X size={14} />
            </button>
          ))}
          {!selected.length && (
            <p className="muted">Adicione municípios na tabela abaixo.</p>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </Panel>
      <LoadState {...{ loading, error, retry }} />
      {data && selected.length > 0 && (
        <Panel
          title="Resultado, meta e situação"
          subtitle="Comparações no mesmo ano e indicador; sem combinar unidades de medida distintas"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Indicador</th>
                  {selected.map((s) => (
                    <th key={s.code}>
                      {s.name}
                      <small className="table-code">
                        {s.uf} · {s.code}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => (
                  <tr key={id}>
                    <td>Indicador {String(id).padStart(2, "0")}</td>
                    {selected.map((s) => {
                      const r = data.rows.find(
                        (d) => d.COD_MUN === s.code && d.INDICADOR === id,
                      );
                      return (
                        <td key={s.code}>
                          {r ? (
                            <div className="comparison-cell">
                              <strong>{number(r.RESULTADO, 4)}</strong>
                              <small>{r.LABEL_META}</small>
                              <Status value={r.SITUACAO} />
                            </div>
                          ) : (
                            "Sem observação no ano"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <DataTable
        filters={{ ...filters, municipality: undefined }}
        selectable
        onSelect={(code, name, uf) => {
          if (selected.some((s) => s.code === code)) {
            setMessage("Este município já foi selecionado.");
            return;
          }
          if (selected.length === 5) {
            setMessage(
              "O limite é de cinco municípios. Remova um para adicionar outro.",
            );
            return;
          }
          setMessage("");
          setSelected([...selected, { code, name, uf }]);
        }}
      />
    </>
  );
}
