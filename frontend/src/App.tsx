import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronsUpDown,
  Database,
  GitCompareArrows,
  HeartPulse,
  LayoutDashboard,
  MapPinned,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  Upload,
  Clock3,
} from "lucide-react";
import {
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Filters as FilterBar } from "./components/Filters";
import { Breadcrumb, LoadState } from "./components/Common";
import { Button } from "./components/ui/button";
import { useApi, params } from "./lib/api";
import type { Catalog, Filters, PageResult } from "./lib/types";
import { Overview } from "./pages/Overview";
import { Explore } from "./pages/Explore";
import { Historical } from "./pages/Historical";
import { Comparison } from "./pages/Comparison";
import { Update } from "./pages/Update";
const pages = [
  [
    "/",
    "Visão Geral",
    LayoutDashboard,
    "O panorama das metas de vigilância em saúde.",
  ],
  [
    "/estados",
    "Estados",
    MapPinned,
    "Entenda o desempenho dos municípios de cada estado.",
  ],
  [
    "/municipios",
    "Municípios",
    Building2,
    "Explore os territórios e acompanhe cada meta.",
  ],
  [
    "/indicadores",
    "Indicadores",
    Activity,
    "Definições, metas e resultados em um só lugar.",
  ],
  [
    "/historico",
    "Análise Histórica",
    ChartNoAxesCombined,
    "A trajetória das metas, com contexto metodológico.",
  ],
  [
    "/comparacoes",
    "Comparações",
    GitCompareArrows,
    "Municípios lado a lado, com a mesma referência.",
  ],
  [
    "/dados",
    "Tabela de Dados",
    Database,
    "Consulte, explore e exporte os dados filtrados.",
  ],
  [
    "/atualizar",
    "Atualizar Dados",
    Upload,
    "Uma base atualizada, com validação e rastreabilidade.",
  ],
] as const;
export default function App() {
  const location = useLocation(),
    nav = useNavigate(),
    [search, setSearch] = useSearchParams(),
    [collapsed, setCollapsed] = useState(false);
  const catalog = useApi<Catalog>("/api/catalog", true);
  const data = catalog.data;
  const current = pages.find((p) => p[0] === location.pathname) || pages[0];
  const historical = location.pathname === "/historico",
    admin = location.pathname === "/atualizar";
  const filters: Filters = Object.fromEntries(search.entries());
  if (data?.years.length && !historical && !filters.year)
    filters.year = String(data.years.at(-1));
  if (historical) filters.year = undefined;
  const municipalityMeta = useApi<PageResult>(
    filters.municipality
      ? "/api/municipios?" +
          params({
            year: filters.year,
            municipality: filters.municipality,
            page_size: 1,
          })
      : null,
  );
  const onChange = (patch: Filters, reset = false) => {
    const next = reset ? {} : { ...filters, ...patch };
    setSearch(params(next));
  };
  const navigate = (path: string, patch: Filters = {}) =>
    nav({ pathname: path, search: params({ ...filters, ...patch }) });
  const props = data ? { filters, catalog: data, onChange, navigate } : null;
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-icon">
            <HeartPulse size={25} />
          </span>
          <span className="brand-copy">
            <strong>
              PQAVS<span> / </span>Analytics
            </strong>
            <small>VIGILÂNCIA EM SAÚDE</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-mark">BR</span>
          <div>
            <strong>Painel nacional</strong>
            <small>Indicadores e metas</small>
          </div>
          <ChevronsUpDown size={14} />
        </div>
        <span className="nav-label">ÁREA DE ANÁLISE</span>
        <nav aria-label="Navegação principal">
          {pages.map(([path, label, Icon], i) => (
            <NavLink
              key={path}
              to={{ pathname: path, search: params(filters) }}
              end={path === "/"}
              className={({ isActive }) =>
                `${isActive ? "active" : ""} ${i === 7 ? "admin-nav" : ""}`
              }
              title={collapsed ? label : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {i === 4 && <span className="nav-new">SÉRIES</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="data-source">
            <span className="live-dot" />
            <div>
              <b>Base municipal PQA-VS</b>
              <small>
                {data?.years[0]} — {data?.years.at(-1)} · dados agregados
              </small>
            </div>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
          >
            <PanelLeftClose size={18} />
            <span>Recolher menu</span>
          </button>
          <div className="sidebar-footer">
            <span className="avatar">VS</span>
            <div>
              <strong>Vigilância em Saúde</strong>
              <small>Ambiente de análise interna</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronLeft size={13} className="breadcrumb-slash" />
            <b>Painel de indicadores</b>
          </div>
          <div className="topbar-right">
            <span className="internal-badge">
              <ShieldCheck size={13} />
              Uso interno
            </span>
            <span className="avatar light">VS</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MONITORAMENTO · PQA-VS</div>
              <h1>{current[1]}</h1>
              <p>{current[3]}</p>
            </div>
            <div className="page-meta">
              <span className="updated">
                <span className="live-dot" />
                Dados atualizados até: <b>{data?.years.at(-1) || "—"}</b>
              </span>
              <Button variant="outline" onClick={() => navigate("/atualizar")}>
                <Upload size={15} />
                Atualizar base
                <ArrowUpRight size={13} />
              </Button>
            </div>
          </div>
          <div className="product-title">
            Painel de Indicadores e Metas — Vigilância em Saúde
          </div>
          <LoadState
            loading={catalog.loading}
            error={catalog.error}
            retry={catalog.retry}
          />
          {data && props && (
            <>
              {!admin && data.years.length > 0 && (
                <>
                  <FilterBar
                    catalog={data}
                    filters={filters}
                    onChange={onChange}
                    historical={historical}
                  />
                  <Breadcrumb
                    uf={filters.uf}
                    municipality={
                      municipalityMeta.data?.rows[0]?.NOME_MUN ||
                      filters.municipality
                    }
                    indicator={filters.indicator}
                    onReset={() =>
                      onChange({
                        uf: undefined,
                        municipality: undefined,
                        indicator: undefined,
                      })
                    }
                  />
                </>
              )}
              {admin ? (
                <Update onImported={catalog.retry} />
              ) : !data.years.length ? (
                <div className="empty">
                  <Database size={32} />
                  <h2>Seu painel começa com uma base validada</h2>
                  <p>
                    Importe o arquivo Excel para disponibilizar os anos e
                    indicadores.
                  </p>
                  <Button onClick={() => navigate("/atualizar")}>
                    Atualizar Dados
                  </Button>
                </div>
              ) : location.pathname === "/historico" ? (
                <Historical {...props} />
              ) : location.pathname === "/comparacoes" ? (
                <Comparison {...props} />
              ) : location.pathname === "/estados" ? (
                <Explore
                  key={location.pathname + params(filters)}
                  {...props}
                  mode="states"
                />
              ) : location.pathname === "/municipios" ? (
                <Explore
                  key={location.pathname + params(filters)}
                  {...props}
                  mode="municipalities"
                />
              ) : location.pathname === "/indicadores" ? (
                <Explore
                  key={location.pathname + params(filters)}
                  {...props}
                  mode="indicators"
                />
              ) : location.pathname === "/dados" ? (
                <Explore
                  key={location.pathname + params(filters)}
                  {...props}
                  mode="table"
                />
              ) : (
                <Overview {...props} />
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              <HeartPulse size={14} />
              PQAVS Analytics · Indicadores para decisões em saúde
            </span>
            <span>
              <Clock3 size={13} />
              Fonte: Base_Painel.xlsx
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
