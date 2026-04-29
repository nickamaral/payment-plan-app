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

  const podeProcessar = folha && salarios && anotacoes && !loading;

  async function handleProcessar() {
    if (!folha || !salarios || !anotacoes) return;
    setLoading(true);
    setShowLoader(true);
    setErro(null);
    setResultado(null);
    const minDelay = new Promise<void>((res) => setTimeout(res, 4500));
    try {
      const [processResult] = await Promise.all([
        (async () => {
          const [{ rows: folhaRows, periodoInfo }, salariosRows, textoAnotacoes] =
            await Promise.all([
              parseFolhaQuinzenal(folha),
              lerSalariosMensais(salarios),
              lerTextoAnotacoes(anotacoes),
            ]);
          const eventos = await extractEventos(textoAnotacoes);
          return processPayroll(folhaRows, salariosRows, eventos, periodoInfo);
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
          Faça upload dos três arquivos, clique em processar e receba a tabela
          ajustada com as notificações por funcionário. A planilha original{" "}
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
          label="2. Salários Mensais (.docx ou .xlsx)"
          accept=".docx,.xlsx"
          file={salarios}
          onFile={setSalarios}
          hint="Nome + salário mensal. Base para calcular desconto diário (÷ 22 dias)."
        />
        <FileDropzone
          label="3. Informações Adicionais (.docx ou .txt)"
          accept=".docx,.txt"
          file={anotacoes}
          onFile={setAnotacoes}
          hint="Texto livre com faltas, demissões, contratações. Claude interpreta."
        />
      </section>

      <div className="mt-6 flex items-center gap-4">
        <button
          disabled={!podeProcessar}
          onClick={handleProcessar}
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
