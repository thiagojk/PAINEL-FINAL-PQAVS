import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { Catalog, Filters as FilterType, PageResult } from "../lib/types";
import { params, useApi } from "../lib/api";
import { Button } from "./ui/button";
export function Filters({
  catalog,
  filters,
  onChange,
  historical,
}: {
  catalog: Catalog;
  filters: FilterType;
  onChange: (patch: FilterType, reset?: boolean) => void;
  historical: boolean;
}) {
  const [search, setSearch] = useState(""),
    [advanced, setAdvanced] = useState(false);
  const { data } = useApi<PageResult>(
    filters.uf
      ? "/api/municipios?" +
          params({
            uf: filters.uf,
            year: filters.year,
            search,
            page_size: 100,
            sort: "NOME_MUN",
            direction: "asc",
          })
      : null,
  );
  const year = Number(filters.year || catalog.years.at(-1));
  const definitions = catalog.definitions.filter((d) => d.ANO === year);
  return (
    <div className="filter-panel">
      <div className="filter-main">
        <span className="filter-icon">
          <SlidersHorizontal size={18} />
        </span>
        {historical ? (
          <>
            <label>
              De
              <select
                aria-label="Ano inicial"
                value={filters.start || catalog.years[0]}
                onChange={(e) =>
                  onChange({ start: e.target.value, year: undefined })
                }
              >
                {catalog.years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              Até
              <select
                aria-label="Ano final"
                value={filters.end || catalog.years.at(-1)}
                onChange={(e) =>
                  onChange({ end: e.target.value, year: undefined })
                }
              >
                {catalog.years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label>
            Ano de referência
            <select
              aria-label="Ano de referência"
              value={filters.year || catalog.years.at(-1)}
              onChange={(e) => onChange({ year: e.target.value })}
            >
              {catalog.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Estado
          <select
            aria-label="Estado"
            value={filters.uf || ""}
            onChange={(e) => {
              setSearch("");
              onChange({ uf: e.target.value, municipality: undefined });
            }}
          >
            <option value="">Todos os estados</option>
            {catalog.states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="filter-indicator">
          Indicador
          <select
            aria-label="Indicador"
            value={filters.indicator || ""}
            onChange={(e) => onChange({ indicator: e.target.value })}
          >
            <option value="">Todos os indicadores</option>
            {definitions.map((d) => (
              <option key={d.INDICADOR} value={d.INDICADOR}>
                {String(d.INDICADOR).padStart(2, "0")} ·{" "}
                {d.DESCRICAO.replace(/^Indicador \d+\s*-\s*/, "").slice(0, 85)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação da meta
          <select
            aria-label="Situação da meta"
            value={filters.status || ""}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="">Todas as situações</option>
            <option value="alcancada">✓ Meta alcançada</option>
            <option value="nao_alcancada">× Meta não alcançada</option>
            <option value="sem_informacao">? Sem informação</option>
            <option value="nao_aplicavel">Não aplicável</option>
            <option value="ausencia_casos">Ausência de casos</option>
          </select>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          Mais filtros
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            onChange({}, true);
          }}
        >
          <RotateCcw size={14} />
          Limpar
        </Button>
      </div>
      {advanced && (
        <div className="filter-advanced">
          <label>
            Buscar município na UF
            <div className="search-input">
              <Search size={15} />
              <input
                value={search}
                disabled={!filters.uf}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou código"
              />
            </div>
          </label>
          <label>
            Município
            <select
              aria-label="Município"
              disabled={!filters.uf}
              value={filters.municipality || ""}
              onChange={(e) => onChange({ municipality: e.target.value })}
            >
              <option value="">Todos os municípios</option>
              {filters.municipality &&
                !data?.rows.some((d) => d.COD_MUN === filters.municipality) && (
                  <option value={filters.municipality}>
                    Município {filters.municipality}
                  </option>
                )}
              {data?.rows.map((d) => (
                <option key={d.COD_MUN} value={d.COD_MUN}>
                  {d.NOME_MUN} ({d.COD_MUN})
                </option>
              ))}
            </select>
            <small>
              {data && data.total > 100
                ? "Refine a busca para encontrar outros municípios."
                : "Selecione primeiro o estado. Populações ausentes ficam fora dos filtros de faixa."}
            </small>
          </label>
          <label>
            População mínima
            <input
              type="number"
              min="0"
              value={filters.pop_min || ""}
              onChange={(e) => onChange({ pop_min: e.target.value })}
            />
          </label>
          <label>
            População máxima
            <input
              type="number"
              min="0"
              value={filters.pop_max || ""}
              onChange={(e) => onChange({ pop_max: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
