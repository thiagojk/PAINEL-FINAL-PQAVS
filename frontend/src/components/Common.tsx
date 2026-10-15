import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  HelpCircle,
  MinusCircle,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { number, params, percent, statuses } from "../lib/api";
import type { Aggregate, Filters } from "../lib/types";
export function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Status({ value }: { value: string }) {
  const Icon =
    value === "alcancada"
      ? CheckCircle2
      : value === "nao_alcancada"
        ? XCircle
        : value === "nao_aplicavel"
          ? MinusCircle
          : HelpCircle;
  return (
    <span className={`status ${value}`}>
      <Icon size={13} />
      {statuses[value] || value}
    </span>
  );
}
export function LoadState({
  loading,
  error,
  retry,
  empty = false,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  empty?: boolean;
}) {
  if (error)
    return (
      <div className="empty">
        <AlertCircle />
        <h3>Não foi possível carregar</h3>
        <p>{error}</p>
        <Button variant="outline" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    );
  if (loading)
    return (
      <div
        className="skeleton-grid"
        aria-label="Carregando dados"
        aria-busy="true"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="empty">
        <Database />
        <h3>Nenhum dado neste recorte</h3>
        <p>Altere os filtros para consultar outros territórios ou anos.</p>
      </div>
    );
  return null;
}
export function Stats({ data }: { data: Aggregate }) {
  return (
    <div className="stats">
      {[
        [
          "Municípios avaliados",
          number(data.evaluated_municipalities),
          "Com ao menos uma situação resolvida",
          "neutral",
        ],
        [
          "Metas alcançadas",
          number(data.reached),
          "Observações município × indicador",
          "green",
        ],
        [
          "Metas não alcançadas",
          number(data.failed),
          "Observações município × indicador",
          "red",
        ],
        [
          "Percentual de alcance",
          percent(data.percentage),
          "Entre observações classificadas",
          "teal",
        ],
        [
          "Indicadores avaliados",
          number(data.indicators),
          "Indicadores presentes no recorte",
          "neutral",
        ],
        [
          "Sem informação",
          number(data.unknown),
          "Excluídas do percentual de alcance",
          "amber",
        ],
      ].map(([label, value, help, tone]) => (
        <div className={`stat ${tone}`} key={label}>
          <div className="stat-label">
            {label}
            <span className="stat-dot" />
          </div>
          <strong>{value}</strong>
          <small>{help}</small>
        </div>
      ))}
    </div>
  );
}
export function Progress({ value }: { value: number | null }) {
  return (
    <div className="progress-row">
      <div className="progress-track">
        <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
      </div>
      <b>{percent(value)}</b>
    </div>
  );
}
export function ExportButtons({
  filters,
  kind = "municipalities",
}: {
  filters: Filters;
  kind?: string;
}) {
  const download = async (format: string) => {
    try {
      const r = await fetch(
        "/api/export?" + params({ ...filters, kind, format }),
      );
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.detail || "Falha na exportação.");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pqavs-${kind}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Não foi possível exportar.",
      );
    }
  };
  return (
    <div className="button-row">
      <Button variant="outline" size="sm" onClick={() => download("csv")}>
        <Download size={14} />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => download("xlsx")}>
        XLSX
      </Button>
    </div>
  );
}
export function Breadcrumb({
  uf,
  municipality,
  indicator,
  onReset,
}: {
  uf?: string;
  municipality?: string;
  indicator?: string;
  onReset: () => void;
}) {
  return (
    <div className="breadcrumb">
      <button onClick={onReset}>Brasil</button>
      {[uf, municipality, indicator && `Indicador ${indicator}`]
        .filter(Boolean)
        .map((s, i) => (
          <span key={i}>
            <ChevronRight size={12} />
            {s}
          </span>
        ))}
    </div>
  );
}
export function MethodNote() {
  return (
    <p className="method-note">
      <HelpCircle size={15} />
      <span>
        Um indicador: % de municípios avaliados que atingiram a meta. Vários
        indicadores: % de observações município × indicador. Sem informação fica
        fora do denominador. Os estados representam o desempenho dos seus
        municípios.
      </span>
    </p>
  );
}
