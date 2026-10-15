import { useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  History,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Panel } from "../components/Common";
import { number, request } from "../lib/api";
type Report = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  years: number[];
  rows: number;
  municipalities?: number;
  states?: number;
  indicators?: number;
  conflicts?: number;
  sheets: { name: string; rows: number; columns: string[] }[];
};
type Validation = { token: string | null; report: Report; mode: string };
type Imports = {
  active: string;
  versions: { id: string; created: string; filename: string; report: Report }[];
  events: { id: number; created: string; action: string; version: string }[];
};
export function Update({ onImported }: { onImported: () => void }) {
  const [key, setKey] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [validation, setValidation] = useState<Validation | null>(null),
    [history, setHistory] = useState<Imports | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const headers = { "X-Admin-Token": key };
  async function loadHistory() {
    setBusy("history");
    setError("");
    try {
      setHistory(await request<Imports>("/api/admin/importacoes", { headers }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function validate() {
    if (!file) return;
    setBusy("validate");
    setError("");
    setSuccess("");
    setValidation(null);
    const form = new FormData();
    form.append("file", file);
    try {
      setValidation(
        await request<Validation>("/api/admin/validar", {
          method: "POST",
          headers,
          body: form,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function doImport() {
    if (!validation?.token) return;
    setBusy("import");
    setError("");
    try {
      await request("/api/admin/importar", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: validation.token }),
      });
      setSuccess(
        "Base importada. A versão anterior foi preservada e os filtros já incluem os novos anos e indicadores.",
      );
      setValidation(null);
      setFile(null);
      onImported();
      setHistory(await request<Imports>("/api/admin/importacoes", { headers }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function rollback(version: string) {
    setBusy("rollback");
    setError("");
    try {
      await request("/api/admin/rollback", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      setSuccess("Versão anterior reativada. Nenhum arquivo foi apagado.");
      onImported();
      setHistory(await request<Imports>("/api/admin/importacoes", { headers }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="notice">
        <ShieldCheck size={21} />
        <div>
          <b>Atualizações seguras, com histórico</b>
          <p>
            A validação não altera a base ativa. A importação substitui
            integralmente o conjunto de dados: inclua no arquivo todos os anos
            que devem permanecer disponíveis. Versões anteriores e originais são
            preservados para rollback.
          </p>
        </div>
      </div>
      <Panel
        title="Acesso administrativo"
        subtitle="A chave é usada somente nesta sessão; não fica salva no navegador."
      >
        <div className="admin-key">
          <KeyRound size={19} />
          <label>
            Chave administrativa
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Informe a chave fornecida pelo administrador"
            />
          </label>
          <Button
            variant="outline"
            disabled={!key || !!busy}
            onClick={loadHistory}
          >
            Consultar histórico
          </Button>
        </div>
        <p className="panel-footnote">
          O administrador configura o acesso no servidor. Consulte o README para
          o procedimento seguro de provisionamento.
        </p>
      </Panel>
      <Panel title="Importar nova base" subtitle="Excel (.xlsx) · até 40 MB">
        <div className="import-steps">
          <span className="active">1. Selecionar arquivo</span>
          <span className={validation ? "active" : ""}>
            2. Validar estrutura
          </span>
          <span className={validation?.report.valid ? "active" : ""}>
            3. Revisar relatório
          </span>
          <span>4. Importar</span>
        </div>
        <label className="upload-area">
          <UploadCloud size={36} />
          <strong>{file?.name || "Selecione o arquivo Excel"}</strong>
          <span>
            Todos os anos e indicadores são descobertos a partir do conteúdo.
          </span>
          <input
            aria-label="Arquivo Excel"
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setValidation(null);
              setSuccess("");
            }}
          />
        </label>
        <div className="button-row">
          <Button disabled={!file || !key || !!busy} onClick={validate}>
            {busy === "validate" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            Validar arquivo
          </Button>
          {validation?.report.valid && (
            <Button disabled={!!busy} onClick={doImport}>
              {busy === "import" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Confirmar importação
            </Button>
          )}
        </div>
        {busy && (
          <p className="muted" role="status">
            Processando no servidor. Arquivos completos podem levar alguns
            minutos.
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="notice" role="status">
            <CheckCircle2 size={18} />
            {success}
          </div>
        )}
      </Panel>
      {validation && (
        <Panel
          title={
            validation.report.valid
              ? "✓ Arquivo válido com observações"
              : "Arquivo inválido"
          }
          subtitle="Revise o relatório antes de confirmar a importação"
        >
          <div className="definition-grid">
            {[
              ["Anos", validation.report.years.join(", ")],
              ["Municípios", number(validation.report.municipalities)],
              ["Estados", number(validation.report.states)],
              ["Indicadores", number(validation.report.indicators)],
              ["Observações normalizadas", number(validation.report.rows)],
              ["Divergências", number(validation.report.conflicts)],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {validation.report.errors.map((e, i) => (
            <p className="error-text" key={i}>
              {e}
            </p>
          ))}
          <details open>
            <summary>
              Observações da validação ({validation.report.warnings.length})
            </summary>
            <ul className="validation-warnings">
              {validation.report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Abas e colunas encontradas</summary>
            {validation.report.sheets.map((s) => (
              <div key={s.name} className="sheet-description">
                <b>
                  {s.name} · {number(s.rows)} linhas
                </b>
                <p>{s.columns.join(", ")}</p>
              </div>
            ))}
          </details>
        </Panel>
      )}
      {history && (
        <Panel
          title="Histórico de importações"
          subtitle="Rollback reativa uma versão completa e preserva as demais."
        >
          <div className="version-list">
            {history.versions.map((v) => (
              <div key={v.id}>
                <History size={20} />
                <div>
                  <strong>{v.filename}</strong>
                  <small>
                    {new Date(v.created).toLocaleString("pt-BR")} ·{" "}
                    {v.report.years.join(", ")} · {number(v.report.rows)}{" "}
                    observações
                  </small>
                  <code>{v.id.slice(0, 12)}</code>
                </div>
                {history.active === v.id ? (
                  <span className="pill">Versão ativa</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => rollback(v.id)}
                  >
                    Reativar versão
                  </Button>
                )}
              </div>
            ))}
          </div>
          <details>
            <summary>Registro de operações</summary>
            {history.events.map((e) => (
              <p key={e.id}>
                {new Date(e.created).toLocaleString("pt-BR")} · {e.action} ·{" "}
                {e.version.slice(0, 12)}
              </p>
            ))}
          </details>
        </Panel>
      )}
    </>
  );
}
