"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileDropzone } from "@/components/FileDropzone";
import { ResultTable } from "@/components/ResultTable";
import { AiLoader } from "@/components/AiLoader";
import { parseFolhaQuinzenal, parseSalariosMensaisXlsx } from "@/lib/xlsx-parser";
import {
  extractDocxText,
  parseSalariosMensaisDocx,
} from "@/lib/docx-parser";
import { processPayroll } from "@/lib/payroll-processor";
import type {
  Evento,
  ResultadoProcessamento,
  SalarioMensalRow,
} from "@/lib/types";

export default function Home() {
  const [folha, setFolha] = useState<File | null>(null);
  const [salarios, setSalarios] = useState<File | null>(null);
  const [anotacoes, setAnotacoes] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoProcessamento | null>(
    null,
  );
  const [aguardandoConfirmacaoSemSalarios, setAguardandoConfirmacaoSemSalarios] = useState(false);

  const podeProcessar = folha !== null && !loading;

  async function handleProcessar(confirmarSemSalarios = false) {
    if (!folha) return;

    if (!salarios && !confirmarSemSalarios) {
      setAguardandoConfirmacaoSemSalarios(true);
      return;
    }

    setAguardandoConfirmacaoSemSalarios(false);
    setLoading(true);
    setShowLoader(true);
    setErro(null);
    setResultado(null);
    const salariosDisponivel = salarios !== null;
    const minDelay = new Promise<void>((res) => setTimeout(res, 4500));
    try {
      const [processResult] = await Promise.all([
        (async () => {
          const [{ rows: folhaRows, periodoInfo }, salariosRows, textoAnotacoes] =
            await Promise.all([
              parseFolhaQuinzenal(folha),
              salarios ? lerSalariosMensais(salarios) : Promise.resolve([]),
              anotacoes ? lerTextoAnotacoes(anotacoes) : Promise.resolve(null),
            ]);
          const eventos = textoAnotacoes !== null ? await extractEventos(textoAnotacoes) : [];
          return processPayroll(folhaRows, salariosRows, eventos, periodoInfo, salariosDisponivel);
        })(),
        minDelay,
      ]);
      setResultado(processResult);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      setShowLoader(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Análise Quinzenal da Folha
        </h1>
        <p className="mt-2 text-neutral-400">
          Faça upload da folha de pagamento (obrigatória) e, opcionalmente, dos
          arquivos de salários e anotações. A planilha original{" "}
          <b className="text-neutral-300">não é modificada</b>.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <FileDropzone
          label="1. Folha de Pagamento (.xlsx)"
          accept=".xlsx"
          file={folha}
          onFile={setFolha}
          hint="Planilha com seções (PJ COM NF, PJ SEM NF), Data | Descrição | Valor | Cliente/Fornecedor | PIX."
        />
        <FileDropzone
          label="2. Salários Mensais (.docx ou .xlsx) — opcional"
          accept=".docx,.xlsx"
          file={salarios}
          onFile={setSalarios}
          hint="Nome + salário mensal. Base para calcular desconto diário (÷ 22 dias). Sem este arquivo, a taxa é estimada pelo valor quinzenal."
        />
        <FileDropzone
          label="3. Informações Adicionais (.docx ou .txt) — opcional"
          accept=".docx,.txt"
          file={anotacoes}
          onFile={setAnotacoes}
          hint="Texto livre com faltas, demissões, contratações. Claude interpreta. Sem este arquivo, nenhum evento é processado."
        />
      </section>

      <div className="mt-6 flex items-center gap-4">
        <button
          disabled={!podeProcessar}
          onClick={() => handleProcessar()}
          className="rounded-md bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500 disabled:shadow-none"
        >
          {loading ? "Processando…" : "Processar folha"}
        </button>
        {erro && (
          <span className="text-sm text-red-400">
            <b>Erro:</b> {erro}
          </span>
        )}
      </div>

      {resultado && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Resultado
          </h2>
          <ResultTable resultado={resultado} />
        </section>
      )}

      {aguardandoConfirmacaoSemSalarios && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-amber-300">
              Nenhuma base de salários carregada
            </h2>
            <p className="mt-3 text-sm text-neutral-300">
              O sistema irá <strong>estimar</strong> o salário diário de cada
              funcionário com base no valor da folha quinzenal (valor quinzenal
              ÷ dias úteis do período). Os resultados são{" "}
              <strong>aproximados</strong> e não devem ser usados como
              referência definitiva.
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              Deseja continuar mesmo assim?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setAguardandoConfirmacaoSemSalarios(false)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleProcessar(true)}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
              >
                Continuar assim mesmo
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showLoader && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <AiLoader />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

async function lerSalariosMensais(file: File): Promise<SalarioMensalRow[]> {
  if (file.name.toLowerCase().endsWith(".docx")) {
    return parseSalariosMensaisDocx(file);
  }
  return parseSalariosMensaisXlsx(file);
}

async function lerTextoAnotacoes(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".docx")) {
    return extractDocxText(file);
  }
  return file.text();
}

async function extractEventos(texto: string): Promise<Evento[]> {
  const res = await fetch("/api/parse-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ?? `API retornou ${res.status} ao parsear anotações.`,
    );
  }
  const data = (await res.json()) as { eventos: Evento[] };
  return data.eventos;
}
