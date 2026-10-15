export type Filters = {
  year?: string;
  start?: string;
  end?: string;
  uf?: string;
  municipality?: string;
  indicator?: string;
  status?: string;
  search?: string;
  pop_min?: string;
  pop_max?: string;
};
export type Definition = {
  ANO: number;
  INDICADOR: number;
  DESCRICAO: string;
  LABEL_NUM: string;
  LABEL_DEN: string;
  LABEL_RES: string;
  LABEL_META: string;
};
export type Change = {
  year: number;
  indicator: number;
  previous: Definition;
  current: Definition;
  fields: string[];
};
export type Catalog = {
  years: number[];
  states: string[];
  definitions: Definition[];
  changes: Change[];
  version: string | null;
};
export type Aggregate = {
  population?: number | null;
  missing_population?: number;
  population_year?: number;
  ANO?: number;
  INDICADOR?: number;
  UF?: string;
  COD_MUN?: string;
  NOME_MUN?: string;
  POP_ANO?: number;
  total: number;
  municipalities: number;
  evaluated_municipalities: number;
  reached: number;
  failed: number;
  unknown: number;
  conflicts: number;
  indicators: number;
  percentage: number | null;
};
export type Dashboard = {
  summary: Aggregate;
  indicators: Aggregate[];
  states: Aggregate[];
  heatmap: Aggregate[];
};
export type PageResult = {
  rows: Aggregate[];
  total: number;
  page: number;
  page_size: number;
};
export type Observation = Definition & {
  UF: string;
  COD_MUN: string;
  NOME_MUN: string;
  POP_ANO: number;
  NUMERADOR: number | null;
  DENOMINADOR: number | null;
  RESULTADO: number | null;
  META_FONTE: string | number | null;
  ALCANCE_FONTE: number | null;
  SITUACAO: string;
  OBSERVACAO: string;
};
export type History = {
  persistent: (Aggregate & { years: number })[];
  trends: {
    indicator: number;
    first: Aggregate;
    last: Aggregate;
    delta_pp: number;
    relative_percentage: number | null;
    maximum: Aggregate;
    minimum: Aggregate;
    years_reached: number | null;
    years_failed: number | null;
  }[];
  rank_total: number;
  rank_page: number;
  series: Aggregate[];
  totals: Aggregate[];
  ranking: Aggregate[];
  observations: Observation[];
  changes: Change[];
  highlights: string[];
  first: Aggregate | null;
  last: Aggregate | null;
};
