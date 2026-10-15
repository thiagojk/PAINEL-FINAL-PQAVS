import { useEffect, useState } from "react";
import type { Filters } from "./types";
export const params = (
  f: Filters | Record<string, string | number | undefined>,
) =>
  new URLSearchParams(
    Object.entries(f)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = "Não foi possível carregar os dados.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      /* Keep friendly fallback. */
    }
    throw new Error(message);
  }
  return response.json();
}
export function useApi<T>(url: string | null, retain = false) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (!retain) setData(null);
    request<T>(url, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, revision, retain]);
  return { data, error, loading, retry: () => setRevision((v) => v + 1) };
}
export const number = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : number(value, 1) + "%";
export const statuses: Record<string, string> = {
  alcancada: "Meta alcançada",
  nao_alcancada: "Meta não alcançada",
  sem_informacao: "Sem informação",
  nao_aplicavel: "Não aplicável",
  ausencia_casos: "Ausência de casos",
};
