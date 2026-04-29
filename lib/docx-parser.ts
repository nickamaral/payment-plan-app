"use client";

import mammoth from "mammoth";
import type { SalarioMensalRow } from "./types";

/**
 * Extrai texto plano de um .docx usando mammoth no browser.
 * Para o arquivo de ANOTAÇÕES (informacoes_adicionais.docx), o texto vai
 * direto para a API /api/parse-notes (Claude interpreta).
 */
export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

/**
 * Parser do INFORMAÇÕE_salario_mes.docx.
 *
 * Formato observado:
 *   - Documento com título "VALORES" seguido de uma tabela 2-colunas:
 *     Nome | "R$ 2500"
 *   - Algumas linhas têm o valor em branco (pessoa sem salário definido).
 *   - Depois há um parágrafo com a regra de cálculo (22 dias base).
 *
 * Estratégia: usa mammoth.convertToHtml para preservar estrutura de tabela,
 * extrai as linhas <tr><td>nome</td><td>R$ 2500</td></tr>, e faz fallback
 * para parsing de texto linha-a-linha se a estrutura não for tabular.
 */
export async function parseSalariosMensaisDocx(
  file: File,
): Promise<SalarioMensalRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  // Primeira tentativa: extrair de <table>
  const viaTabela = parseHtmlTable(html);
  if (viaTabela.length > 0) return viaTabela;

  // Fallback: texto cru, linha a linha
  const { value: texto } = await mammoth.extractRawText({ arrayBuffer });
  return parseTextoLinhas(texto);
}

function parseHtmlTable(html: string): SalarioMensalRow[] {
  const rows: SalarioMensalRow[] = [];
  // Usa DOMParser no browser; no SSR seria indefinido, mas este módulo é "use client"
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const trs = doc.querySelectorAll("tr");
  trs.forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td, th")).map((c) =>
      (c.textContent ?? "").trim(),
    );
    if (cells.length < 2) return;
    const nome = cells[0];
    const valorStr = cells[1];
    if (!nome || /valores?/i.test(nome)) return; // pula cabeçalho
    const salario = parseValorBR(valorStr);
    rows.push({
      nome,
      salarioMensal: salario != null && salario > 0 ? salario : null,
    });
  });
  return rows;
}

function parseTextoLinhas(texto: string): SalarioMensalRow[] {
  const rows: SalarioMensalRow[] = [];
  const linhas = texto.split(/\r?\n/);
  for (const linha of linhas) {
    const t = linha.trim();
    if (!t || /^valores?$/i.test(t)) continue;
    // Match "Nome Completo    R$ 2500" (espaços largos ou tab entre nome e valor)
    const m = t.match(/^(.+?)\s{2,}(R\$\s*[\d.,]+)\s*$/) || t.match(/^(.+?)\t+(R\$\s*[\d.,]+)\s*$/);
    if (m) {
      rows.push({
        nome: m[1].trim(),
        salarioMensal: parseValorBR(m[2]),
      });
      continue;
    }
    // Linha com nome mas sem valor explícito
    if (/^[A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]+$/.test(t) && t.length < 80) {
      rows.push({ nome: t, salarioMensal: null });
    }
  }
  return rows;
}

function parseValorBR(s: string): number | null {
  if (!s) return null;
  const cleaned = s
    .replace(/R\$/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "") // remove separador de milhar pt-BR
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
