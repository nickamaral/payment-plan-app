"use client";

import { useState, useRef, useEffect } from "react";
import type {
  LinhaAjustada,
  PeriodoInfo,
  ResultadoProcessamento,
  SecaoFolha,
} from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import {
  type ConfigEmpresa,
  type PagamentoPix,
  gerarCnab240Pix,
  downloadCnab240,
} from "@/lib/cnab240-pix";

function linhaMatchBusca(l: LinhaAjustada, q: string): boolean {
  const campos = [
    l.nome,
    l.pix ?? "",
    l.contaBancaria ?? "",
    l.clienteFornecedor ?? "",
    l.secao,
    l.notificacoes.map((n) => n.mensagem).join(" "),
  ];
  return campos.some((c) => normalizeName(c).includes(q));
}

// ---------------------------------------------------------------------------
// Popover: funcionários ignorados por ausência de chave PIX
// ---------------------------------------------------------------------------

function PopoverSemPix({ linhas }: { linhas: LinhaAjustada[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-xs text-amber-400 underline decoration-dotted underline-offset-2 hover:text-amber-300 transition-colors cursor-pointer"
      >
        {linhas.length} sem chave PIX (ignorados)
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-xs font-semibold text-amber-300">
              Funcionários sem chave PIX
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Não incluídos no arquivo CNAB 240
            </p>
          </div>
          <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto">
            {linhas.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-100">{l.nome}</p>
                  <p className="text-[11px] text-neutral-500">{l.secao}</p>
                  {l.clienteFornecedor && (
                    <p className="text-[11px] text-neutral-600">{l.clienteFornecedor}</p>
                  )}
                </div>
                <span className="shrink-0 tabular-nums text-xs text-neutral-300">
                  {formatBRL(l.salarioAjustado)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de configuração CNAB
// ---------------------------------------------------------------------------

type ConfigForm = {
  cnpj: string;
  nomeEmpresa: string;
  agencia: string;
  conta: string;
  digitoConta: string;
  dataPagamento: string;
};

const CONFIG_STORAGE_KEY = "cnab240_config";

function carregarConfigSalva(): Partial<ConfigForm> {
  try {
    const raw = sessionStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvarConfig(cfg: ConfigForm) {
  try {
    sessionStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function ModalCnab({
  onClose,
  onGerar,
  dataPagamentoSugerida,
  totalPix,
  totalSemPix,
}: {
  onClose: () => void;
  onGerar: (cfg: ConfigEmpresa) => void;
  dataPagamentoSugerida: string;
  totalPix: number;
  totalSemPix: number;
}) {
  const saved = carregarConfigSalva();

  const [form, setForm] = useState<ConfigForm>({
    cnpj: saved.cnpj ?? "",
    nomeEmpresa: saved.nomeEmpresa ?? "",
    agencia: saved.agencia ?? "",
    conta: saved.conta ?? "",
    digitoConta: saved.digitoConta ?? "",
    dataPagamento: saved.dataPagamento ?? dataPagamentoSugerida,
  });
  const [erro, setErro] = useState("");

  function set(field: keyof ConfigForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErro("");
  }

  function validar(): string | null {
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return "CNPJ inválido (deve ter 14 dígitos).";
    if (!form.nomeEmpresa.trim()) return "Nome da empresa é obrigatório.";
    if (!form.agencia.replace(/\D/g, "")) return "Agência é obrigatória.";
    if (!form.conta.replace(/\D/g, "")) return "Conta é obrigatória.";
    if (!form.digitoConta.trim()) return "Dígito da conta é obrigatório.";
    if (!form.dataPagamento.trim()) return "Data de pagamento é obrigatória.";
    return null;
  }

  function handleGerar() {
    const err = validar();
    if (err) { setErro(err); return; }
    salvarConfig(form);
    onGerar({
      cnpj: form.cnpj,
      nomeEmpresa: form.nomeEmpresa,
      agencia: form.agencia.replace(/\D/g, ""),
      conta: form.conta.replace(/\D/g, ""),
      digitoConta: form.digitoConta.trim(),
      dataPagamento: form.dataPagamento,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Gerar arquivo CNAB 240 PIX</h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              {totalPix} pagamento{totalPix !== 1 ? "s" : ""} via PIX
              {totalSemPix > 0 && (
                <span className="ml-1 text-amber-400">
                  · {totalSemPix} sem chave PIX (serão ignorados)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 text-neutral-500 hover:text-neutral-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* CNPJ */}
          <div>
            <label className="mb-1 block text-xs text-neutral-400">CNPJ da empresa</label>
            <input
              type="text"
              placeholder="00.000.000/0001-00"
              value={form.cnpj}
              onChange={(e) => set("cnpj", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          {/* Nome empresa */}
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Nome da empresa (máx 30 chars)</label>
            <input
              type="text"
              placeholder="MINHA EMPRESA LTDA"
              maxLength={30}
              value={form.nomeEmpresa}
              onChange={(e) => set("nomeEmpresa", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          {/* Agência / Conta / Dígito */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-neutral-400">Agência (5 dígitos)</label>
              <input
                type="text"
                placeholder="00000"
                maxLength={5}
                value={form.agencia}
                onChange={(e) => set("agencia", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-neutral-400">Conta</label>
              <input
                type="text"
                placeholder="000000"
                value={form.conta}
                onChange={(e) => set("conta", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
              />
            </div>
            <div className="col-span-1">
              <label className="mb-1 block text-xs text-neutral-400">Dígito</label>
              <input
                type="text"
                placeholder="0"
                maxLength={1}
                value={form.digitoConta}
                onChange={(e) => set("digitoConta", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
              />
            </div>
          </div>

          {/* Data de pagamento */}
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Data de pagamento</label>
            <input
              type="text"
              placeholder="DD/MM/AAAA"
              value={form.dataPagamento}
              onChange={(e) => set("dataPagamento", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
            {dataPagamentoSugerida && form.dataPagamento !== dataPagamentoSugerida && (
              <button
                type="button"
                className="mt-1 text-xs text-orange-400 hover:text-orange-300"
                onClick={() => set("dataPagamento", dataPagamentoSugerida)}
              >
                Usar data da folha: {dataPagamentoSugerida}
              </button>
            )}
          </div>
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleGerar}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-400"
          >
            Gerar e baixar .txt
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botão CNAB
// ---------------------------------------------------------------------------

function BotaoCnab({
  linhas,
  periodoInfo,
}: {
  linhas: LinhaAjustada[];
  periodoInfo: PeriodoInfo | null;
}) {
  const [showModal, setShowModal] = useState(false);
  const [erroGeracao, setErroGeracao] = useState("");

  const linhasComPix = linhas.filter((l) => l.pix && l.pix.trim());
  const linhasSemPix = linhas.filter((l) => !l.pix || !l.pix.trim());

  // Converte data da aba (ex: "10.04.2026") para DD/MM/AAAA
  function normalizarDataFolha(raw: string): string {
    const clean = raw.replace(/\D/g, "");
    if (clean.length === 8) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
    }
    return raw;
  }

  const dataSugerida = periodoInfo
    ? normalizarDataFolha(periodoInfo.dataPagamento)
    : "";

  function handleGerar(cfg: ConfigEmpresa) {
    setErroGeracao("");
    try {
      const pagamentos: PagamentoPix[] = linhasComPix.map((l) => ({
        nomeFavorecido: l.nome,
        chavePix: l.pix!,
        valor: l.salarioAjustado,
        mensagem: `PAGAMENTO ${l.secao}`.slice(0, 65),
      }));

      const conteudo = gerarCnab240Pix(cfg, pagamentos);

      const cnpjLimpo = cfg.cnpj.replace(/\D/g, "");
      const dataLimpa = cfg.dataPagamento.replace(/\D/g, "");
      const nomeArquivo = `PIX_${cnpjLimpo}_${dataLimpa}.txt`;

      downloadCnab240(conteudo, nomeArquivo);
      setShowModal(false);
    } catch (e: unknown) {
      setErroGeracao(e instanceof Error ? e.message : String(e));
    }
  }

  if (linhas.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setErroGeracao(""); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-orange-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-orange-400 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Gerar CNAB 240 PIX
          {linhasComPix.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {linhasComPix.length}
            </span>
          )}
        </button>

        {linhasSemPix.length > 0 && (
          <PopoverSemPix linhas={linhasSemPix} />
        )}
      </div>

      {erroGeracao && (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
          Erro ao gerar arquivo: {erroGeracao}
        </p>
      )}

      {showModal && (
        <ModalCnab
          onClose={() => setShowModal(false)}
          onGerar={handleGerar}
          dataPagamentoSugerida={dataSugerida}
          totalPix={linhasComPix.length}
          totalSemPix={linhasSemPix.length}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ResultTable({
  resultado,
}: {
  resultado: ResultadoProcessamento;
}) {
  const {
    linhas,
    eventosSemMatch,
    funcionariosSemSalarioMensal,
    salariosSemFolha,
    periodoInfo,
    resumo,
  } = resultado;

  const [busca, setBusca] = useState("");
  const q = normalizeName(busca.trim());
  const linhasFiltradas = q ? linhas.filter((l) => linhaMatchBusca(l, q)) : linhas;

  const semDadosPagamento = linhas.filter(
    (l) => !l.pix && !l.contaBancaria,
  );

  const secoes = agruparPorSecao(linhasFiltradas);

  return (
    <div className="space-y-6">
      {periodoInfo && <PeriodoBanner periodoInfo={periodoInfo} />}
      <SummaryCards resumo={resumo} />

      {/* Barra de busca + botão CNAB */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            placeholder="Buscar funcionário, PIX, cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
          />
        </div>
        {busca.trim() && (
          <span className="text-xs text-neutral-500">
            {linhasFiltradas.length} de {linhas.length}
          </span>
        )}

        <BotaoCnab linhas={linhas} periodoInfo={periodoInfo} />
      </div>

      {q && linhasFiltradas.length === 0 && (
        <p className="text-sm text-neutral-500">Nenhum resultado para &ldquo;{busca}&rdquo;.</p>
      )}

      {secoes.map(({ secao, linhas }) => (
        <SecaoBlock key={secao} secao={secao} linhas={linhas} />
      ))}

      {funcionariosSemSalarioMensal.length > 0 && (
        <AvisoBloco
          titulo={`Funcionários sem salário mensal informado (${funcionariosSemSalarioMensal.length})`}
          descricao="Estes funcionários estão na folha quinzenal, mas não foi possível achar o salário mensal — se houver falta, o desconto não é calculado."
          cor="amber"
        >
          <ul className="mt-2 grid grid-cols-1 gap-x-4 text-xs text-amber-300 md:grid-cols-2">
            {funcionariosSemSalarioMensal.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </AvisoBloco>
      )}

      {salariosSemFolha.length > 0 && (
        <AvisoBloco
          titulo={`Cadastros de salário sem correspondência na folha (${salariosSemFolha.length})`}
          descricao="Estes nomes estão no arquivo de salários mensais mas não foram encontrados na planilha quinzenal. Pode ser afastamento, demissão anterior ou diferença de grafia."
          cor="amber"
        >
          <ul className="mt-2 grid grid-cols-1 gap-x-4 text-xs text-amber-300 md:grid-cols-2">
            {salariosSemFolha.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </AvisoBloco>
      )}

      {semDadosPagamento.length > 0 && (
        <AvisoBloco
          titulo={`Funcionários sem dados de pagamento PIX/Conta (${semDadosPagamento.length})`}
          descricao="Estes funcionários estão na folha sem nenhuma chave PIX ou conta bancária informada — não é possível identificar para onde transferir."
          cor="amber"
        >
          <ul className="mt-2 grid grid-cols-1 gap-x-4 text-xs text-amber-300 md:grid-cols-2">
            {semDadosPagamento.map((l) => (
              <li key={l.nome}>• {l.nome}</li>
            ))}
          </ul>
        </AvisoBloco>
      )}

      {eventosSemMatch.length > 0 && (
        <AvisoBloco
          titulo={`Eventos sem correspondência na folha (${eventosSemMatch.length})`}
          descricao="Nomes que apareceram nas anotações mas não foram encontrados (ou são ambíguos) na planilha quinzenal. Verifique grafia ou se a pessoa ainda está ativa."
          cor="amber"
        >
          <ul className="mt-2 space-y-1 text-xs text-amber-300">
            {eventosSemMatch.map((e, i) => (
              <li key={i}>
                <span className="font-mono font-semibold">{e.tipo}</span>
                {" — "}
                <b>{e.nome}</b>
                {e.data ? ` (${e.data})` : ""}: <em>&ldquo;{e.textoOriginal}&rdquo;</em>
              </li>
            ))}
          </ul>
        </AvisoBloco>
      )}
    </div>
  );
}

function PeriodoBanner({ periodoInfo }: { periodoInfo: PeriodoInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
      <span>
        <b className="text-blue-200">Período:</b> {periodoInfo.periodoInicio} → {periodoInfo.periodoFim}
      </span>
      <span className="text-blue-600">·</span>
      <span>
        <b className="text-blue-200">{periodoInfo.diasUteis}</b> dias úteis (seg–sex)
      </span>
      <span className="text-blue-600">·</span>
      <span>Pagamento {periodoInfo.dataPagamento}</span>
    </div>
  );
}

function SecaoBlock({
  secao,
  linhas,
}: {
  secao: SecaoFolha;
  linhas: LinhaAjustada[];
}) {
  const total = linhas.reduce((a, l) => a + l.salarioAjustado, 0);
  const original = linhas.reduce((a, l) => a + l.salarioQuinzenal, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-white">{secao}</h3>
        <div className="text-xs text-neutral-400">
          {linhas.length} funcionário{linhas.length === 1 ? "" : "s"}
          {" · "}
          <span className="tabular-nums">
            original {formatBRL(original)} → ajustado{" "}
            <b className="text-orange-300">{formatBRL(total)}</b>
          </span>
        </div>
      </div>
      <table className="w-full min-w-[960px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr className="border-b border-white/5">
            <th className="px-4 py-2.5">Funcionário</th>
            <th className="px-4 py-2.5">Cliente/Fornec.</th>
            <th className="px-4 py-2.5">PIX / Conta</th>
            <th className="px-4 py-2.5 text-right">Original</th>
            <th className="px-4 py-2.5 text-right">Ajuste</th>
            <th className="px-4 py-2.5 text-right">Ajustado</th>
            <th className="px-4 py-2.5">Notificações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {linhas.map((l, i) => (
            <tr
              key={`${l.nome}-${i}`}
              className={cn(
                "transition-colors hover:bg-white/5",
                l.notificacoes.some((n) => n.severidade === "atencao") &&
                  "bg-red-500/10",
              )}
            >
              <td className="px-4 py-2.5 font-medium text-neutral-100">
                {l.nome}
                {l.dataLinha && (
                  <span className="ml-1 text-xs text-neutral-500">
                    [{l.dataLinha}]
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-neutral-300">
                {l.clienteFornecedor ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-xs text-neutral-400">
                {l.pix ?? l.contaBancaria ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                {formatBRL(l.salarioQuinzenal)}
              </td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right tabular-nums",
                  l.ajuste < 0 && "text-red-400",
                  l.ajuste > 0 && "text-emerald-400",
                  l.ajuste === 0 && "text-neutral-500",
                )}
              >
                {l.ajuste === 0 ? "—" : formatBRL(l.ajuste)}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-white">
                {formatBRL(l.salarioAjustado)}
              </td>
              <td className="px-4 py-2.5">
                {l.notificacoes.length === 0 ? (
                  <span className="text-xs text-neutral-600">—</span>
                ) : (
                  <ul className="space-y-1">
                    {l.notificacoes.map((n, idx) => (
                      <li
                        key={idx}
                        className={cn(
                          "rounded px-2 py-1 text-xs",
                          n.severidade === "atencao"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/15 text-amber-300",
                        )}
                      >
                        {n.severidade === "atencao" && "⚠ "}
                        {n.mensagem}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCards({
  resumo,
}: {
  resumo: ResultadoProcessamento["resumo"];
}) {
  const items = [
    { label: "Funcionários", value: resumo.totalFuncionarios.toString() },
    { label: "Com ajuste", value: resumo.totalComAjuste.toString() },
    { label: "Demitidos", value: resumo.totalDemitidos.toString() },
    { label: "Dias de falta", value: resumo.totalFaltas.toString() },
    {
      label: "Total descontado",
      value: formatBRL(Math.abs(resumo.somaDescontos)),
    },
    { label: "Bruto original", value: formatBRL(resumo.totalBrutoOriginal) },
    { label: "Bruto ajustado", value: formatBRL(resumo.totalBrutoAjustado) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-lg backdrop-blur-sm"
        >
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {it.label}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function AvisoBloco({
  titulo,
  descricao,
  cor,
  children,
}: {
  titulo: string;
  descricao: string;
  cor: "amber";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 backdrop-blur-sm",
        "border-amber-500/30 bg-amber-500/10",
      )}
    >
      <h3 className="text-sm font-semibold text-amber-300">{titulo}</h3>
      <p className="mt-1 text-xs text-amber-400/80">{descricao}</p>
      {children}
    </div>
  );
}

function agruparPorSecao(
  linhas: LinhaAjustada[],
): { secao: SecaoFolha; linhas: LinhaAjustada[] }[] {
  const ordem: SecaoFolha[] = [];
  const mapa = new Map<SecaoFolha, LinhaAjustada[]>();
  for (const l of linhas) {
    if (!mapa.has(l.secao)) {
      ordem.push(l.secao);
      mapa.set(l.secao, []);
    }
    mapa.get(l.secao)!.push(l);
  }
  return ordem.map((s) => ({ secao: s, linhas: mapa.get(s)! }));
}
