import { ArrowDownUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { ExportButtons, LoadState, Panel, Progress } from "./Common";
import { number, params, useApi } from "../lib/api";
import type { Filters, PageResult } from "../lib/types";
export function DataTable({
  filters,
  states = false,
  onSelect,
  selectable = false,
}: {
  filters: Filters;
  states?: boolean;
  onSelect: (code: string, name: string, uf: string) => void;
  selectable?: boolean;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("percentage"),
    [direction, setDirection] = useState("desc"),
    [columns, setColumns] = useState(false),
    [showPopulation, setShowPopulation] = useState(true);
  const key = params(filters);
  const [oldKey, setOldKey] = useState(key);
  if (oldKey !== key) {
    setOldKey(key);
    setPage(1);
  }
  const effective = { ...filters, search: search || filters.search };
  const { data, loading, error, retry } = useApi<PageResult>(
    `/api/${states ? "estados" : "municipios"}?` +
      params({ ...effective, page, page_size: 25, sort, direction }),
  );
  const order = (key: string) => {
    setSort(key);
    setDirection(sort === key && direction === "desc" ? "asc" : "desc");
    setPage(1);
  };
  const heading = (label: string, key: string) => (
    <button className="table-sort" onClick={() => order(key)}>
      {label}
      <ArrowDownUp size={12} />
    </button>
  );
  return (
    <Panel
      title={states ? "Estados" : "Municípios"}
      subtitle={
        states
          ? "Agregação das observações municipais; não representa meta estadual."
          : "Selecione um município para consultar todos os seus indicadores."
      }
      action={
        <ExportButtons
          filters={effective}
          kind={states ? "states" : "municipalities"}
        />
      }
    >
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Buscar na tabela"
            placeholder={states ? "Buscar UF" : "Buscar município ou código"}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {!states && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setColumns(!columns)}
          >
            Colunas
          </Button>
        )}
      </div>
      {columns && (
        <label className="column-picker">
          <input
            type="checkbox"
            checked={showPopulation}
            onChange={(e) => setShowPopulation(e.target.checked)}
          />{" "}
          Mostrar população
        </label>
      )}
      <LoadState {...{ loading, error, retry }} empty={!!data && !data.total} />
      {data && data.total > 0 && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    {heading(
                      states ? "UF" : "Município",
                      states ? "UF" : "NOME_MUN",
                    )}
                  </th>
                  {!states && <th>UF</th>}
                  {!states && showPopulation && (
                    <th>{heading("População", "POP_ANO")}</th>
                  )}
                  {states && <th>{heading("Municípios", "municipalities")}</th>}
                  <th>{heading("Alcançadas", "reached")}</th>
                  <th>{heading("Não alcançadas", "failed")}</th>
                  <th>{heading("Sem informação", "unknown")}</th>
                  <th>{heading("% de alcance", "percentage")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((d) => (
                  <tr key={states ? d.UF : `${d.ANO}-${d.COD_MUN}`}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() =>
                          onSelect(
                            d.COD_MUN || d.UF!,
                            d.NOME_MUN || d.UF!,
                            d.UF!,
                          )
                        }
                      >
                        {d.NOME_MUN || d.UF}
                      </button>
                      {!states && (
                        <small className="table-code">
                          {d.COD_MUN} · {d.ANO}
                        </small>
                      )}
                    </td>
                    {!states && (
                      <td>
                        <span className="uf-badge">{d.UF}</span>
                      </td>
                    )}
                    {!states && showPopulation && <td>{number(d.POP_ANO)}</td>}
                    {states && <td>{number(d.evaluated_municipalities)}</td>}
                    <td className="green-text">{number(d.reached)}</td>
                    <td className="red-text">{number(d.failed)}</td>
                    <td>{number(d.unknown)}</td>
                    <td style={{ minWidth: 150 }}>
                      <Progress value={d.percentage} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onSelect(
                            d.COD_MUN || d.UF!,
                            d.NOME_MUN || d.UF!,
                            d.UF!,
                          )
                        }
                      >
                        {selectable ? "Adicionar" : <ChevronRight size={16} />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {number(data.total)} {states ? "estados" : "registros"} · Página{" "}
              {page} de {Math.max(1, Math.ceil(data.total / 25))}
            </span>
            {!states && (
              <div className="button-row">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page * 25 >= data.total}
                  onClick={() => setPage(page + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
