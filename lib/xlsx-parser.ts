"use client";

import * as XLSX from "xlsx";
import type { FolhaRow, PeriodoInfo, SalarioMensalRow, SecaoFolha } from "./types";
import { normalizeName } from "./normalize";

/**
 * Parser tolerante da folha quinzenal.
 *
 * Assume a estrutura hint:da pelo usuário:
 *   - Uma ou mais SEÇÕES (ex: "PJ COM NF", "PJ SEM NF"), cada uma precedida
 *     por uma linha contendo apenas o título.
 *   - Logo após o título, uma linha de CABEÇALHO com colunas tipo:
 *       Data | Descrição | Valor | Cliente/Fornecedor | PIX | (CONTA ITAU)
 *   - Em seguida as linhas de dados, até uma linha "TOTAL" ou linha em branco.
 *   - O nome da sheet (ex: "10.04.2026") é variável — não hardcodar.
 *   - "Valor" vem NEGATIVO na planilha (saída financeira) → convertemos pra abs.
 *
 * Quando a estrutura fugir do esperado (ex: planilha sem seções), o parser
 * cai num modo "flat": tenta achar Descrição + Valor em qualquer linha.
 *
 * Nada é modificado no arquivo original — tudo em memória.
 */
export async function parseFolhaQuinzenal(
  file: File,
): Promise<{ rows: FolhaRow[]; periodoInfo: PeriodoInfo | null }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0] ?? "";
  const sheet = wb.Sheets[sheetName];
  // matriz com strings/números brutos (sem header). null para vazios.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  }) as unknown[][];

  return { rows: parseGrid(grid), periodoInfo: calcularPeriodo(sheetName) };
}

function contarDiasUteis(inicio: Date, fim: Date): number {
  let count = 0;
  const cur = new Date(inicio);
  while (cur <= fim) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatarData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function calcularPeriodo(sheetName: string): PeriodoInfo | null {
  // Esperado: "DD.MM.YYYY"
  const partes = sheetName.split(".");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes.map(Number);
  if (!dia || !mes || !ano || isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  if (dia !== 10 && dia !== 25) return null;

  let inicio: Date;
  let fim: Date;

  if (dia === 10) {
    // 21 do mês anterior até 05 do mês corrente
    inicio = new Date(ano, mes - 2, 21); // mes-2 porque mês é 0-based e queremos o anterior
    fim = new Date(ano, mes - 1, 5);
  } else {
    // 06 do mês corrente até 20 do mês corrente
    inicio = new Date(ano, mes - 1, 6);
    fim = new Date(ano, mes - 1, 20);
  }

  return {
    dataPagamento: sheetName,
    diaReferencia: dia as 10 | 25,
    periodoInicio: formatarData(inicio),
    periodoFim: formatarData(fim),
    diasUteis: contarDiasUteis(inicio, fim),
  };
}

export function parseGrid(grid: unknown[][]): FolhaRow[] {
  const linhas: FolhaRow[] = [];
  let secaoAtual: SecaoFolha = "GERAL";
  let colIdx: ColIndex | null = null;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const nonNull = row.filter((c) => c != null && String(c).trim() !== "");
    if (nonNull.length === 0) {
      // linha em branco → força redetecção de cabeçalho na próxima seção
      colIdx = null;
      continue;
    }

    // 1. Título de seção: linha com 1-2 células preenchidas, sem número
    if (
      nonNull.length <= 2 &&
      !nonNull.some((c) => typeof c === "number")
    ) {
      const tituloCandidato = String(nonNull[0]).trim();
      if (pareceTitulo(tituloCandidato)) {
        secaoAtual = tituloCandidato.toUpperCase();
        colIdx = null;
        continue;
      }
    }

    // 2. Linha TOTAL → ignora
    if (
      nonNull.some(
        (c) =>
          typeof c === "string" &&
          c.trim().toUpperCase().startsWith("TOTAL"),
      )
    ) {
      continue;
    }

    // 3. Cabeçalho ainda não detectado → tenta detectar aqui
    if (!colIdx) {
      const idx = detectarCabecalho(row);
      if (idx) {
        colIdx = idx;
        continue;
      }
      // não é cabeçalho nem dado reconhecível; segue
      continue;
    }

    // 4. Linha de dado: extrai
    const nome = getCell(row, colIdx.descricao);
    const valorBruto = toNumber(getCell(row, colIdx.valor));
    if (!nome || String(nome).trim() === "") continue;
    if (valorBruto === 0 && colIdx.valor != null) continue; // linha sem valor

    linhas.push({
      nome: String(nome).trim(),
      salarioQuinzenal: Math.abs(valorBruto),
      secao: secaoAtual,
      dataLinha:
        colIdx.data != null ? formatCell(getCell(row, colIdx.data)) : null,
      clienteFornecedor:
        colIdx.cliente != null
          ? formatCell(getCell(row, colIdx.cliente))
          : null,
      pix: colIdx.pix != null ? formatCell(getCell(row, colIdx.pix)) : null,
      contaBancaria:
        colIdx.conta != null ? formatCell(getCell(row, colIdx.conta)) : null,
      linhaOriginal: i + 1,
    });
  }

  return linhas;
}

type ColIndex = {
  data?: number;
  descricao: number;
  valor: number;
  cliente?: number;
  pix?: number;
  conta?: number;
};

function detectarCabecalho(row: unknown[]): ColIndex | null {
  const normalized = row.map((c) =>
    c == null ? "" : normalizeName(String(c)),
  );
  const find = (patterns: RegExp[]): number | undefined => {
    for (let i = 0; i < normalized.length; i++) {
      if (patterns.some((p) => p.test(normalized[i]))) return i;
    }
    return undefined;
  };

  const descricao = find([/^descricao/, /^nome/, /funcionario/, /colaborador/]);
  const valor = find([/^valor/, /quinzenal/]);
  if (descricao == null || valor == null) return null;

  return {
    data: find([/^data/]),
    descricao,
    valor,
    cliente: find([/cliente/, /fornecedor/]),
    pix: find([/^pix/, /chave/]),
    conta: find([/^conta/, /banco/, /itau/, /ita\u00fa/]),
  };
}

function pareceTitulo(s: string): boolean {
  // Heurística: curto (≤ 30 chars), sem número, maiúsculas predominantes
  if (s.length > 30) return false;
  if (/\d/.test(s)) return false;
  const letras = s.replace(/[^a-zA-Z]/g, "");
  if (letras.length < 2) return false;
  const maiusc = letras.replace(/[^A-Z]/g, "").length;
  return maiusc / letras.length > 0.5; // 50%+ maiúsculas = título
}

function getCell(row: unknown[], idx: number | undefined): unknown {
  if (idx == null) return null;
  return row[idx] ?? null;
}

function formatCell(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return v.toString();
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    // obs: formato pt-BR "1.234,56" → remove . milhar e troca , por .
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
    // fallback: tenta formato americano
    const n2 = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n2) ? n2 : 0;
  }
  return 0;
}

/**
 * Parser do salarios-mensais (.xlsx). Mais simples: Nome + Salário Mensal.
 * Tolerante a variações de nome de coluna.
 */
export async function parseSalariosMensaisXlsx(
  file: File,
): Promise<SalarioMensalRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  return rows
    .map((r) => {
      const nome = pickField(r, ["nome", "funcionario", "colaborador", "descricao"]);
      const salario = toNumber(
        pickField(r, [
          "salario mensal",
          "salario_mensal",
          "mensal",
          "salario",
          "valor",
        ]),
      );
      return {
        nome: String(nome ?? "").trim(),
        salarioMensal: salario > 0 ? salario : null,
      };
    })
    .filter((r) => r.nome);
}

function pickField(row: Record<string, unknown>, keys: string[]): unknown {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeName(k), v]),
  );
  for (const k of keys) {
    const key = normalizeName(k);
    if (key in normalized && normalized[key] != null) return normalized[key];
  }
  for (const k of keys) {
    const needle = normalizeName(k);
    const hit = Object.entries(normalized).find(
      ([key, v]) => key.includes(needle) && v != null,
    );
    if (hit) return hit[1];
  }
  return null;
}
