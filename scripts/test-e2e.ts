/**
 * Diagnóstico E2E com os arquivos reais em docs/.
 * Rodar: npx tsx scripts/test-e2e.ts
 *
 * Não usa DOMParser (browser-only) — faz o parse de HTML do mammoth via regex.
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import Anthropic from "@anthropic-ai/sdk";
import { parseGrid } from "../lib/xlsx-parser";
import { processPayroll } from "../lib/payroll-processor";
import type { SalarioMensalRow } from "../lib/types";

async function main() {
  // Carrega .env.local manualmente (tsx não lê .env automaticamente)
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }

  const DOCS = path.resolve(__dirname, "../docs");

  // ─── 1. Folha quinzenal ───────────────────────────────────────────────────────

  console.log("\n=== 1. Folha de Pagamento (xlsx) ===\n");

  const xlsxFile = fs.readdirSync(DOCS).find((f) => f.startsWith("Folha de Pagamento") && f.endsWith(".xlsx"));
  if (!xlsxFile) throw new Error("Arquivo xlsx não encontrado em docs/");

  console.log(`Arquivo: ${xlsxFile}`);

  const buf = fs.readFileSync(path.join(DOCS, xlsxFile));
  const wb = XLSX.read(buf, { type: "buffer" });
  console.log(`Sheets: ${wb.SheetNames.join(", ")}`);

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  }) as unknown[][];

  const folhaRows = parseGrid(grid);
  console.log(`\nLinhas extraídas: ${folhaRows.length}`);

  const porSecao = new Map<string, typeof folhaRows>();
  for (const r of folhaRows) {
    if (!porSecao.has(r.secao)) porSecao.set(r.secao, []);
    porSecao.get(r.secao)!.push(r);
  }
  for (const [secao, rows] of porSecao) {
    const soma = rows.reduce((a, r) => a + r.salarioQuinzenal, 0);
    console.log(`  Seção "${secao}": ${rows.length} funcionário(s), soma = R$ ${soma.toFixed(2)}`);
    for (const r of rows) {
      console.log(`    • ${r.nome.padEnd(35)} R$ ${r.salarioQuinzenal.toFixed(2)}`);
    }
  }
  const totalBruto = folhaRows.reduce((a, r) => a + r.salarioQuinzenal, 0);
  console.log(`\nTotal bruto recalculado: R$ ${totalBruto.toFixed(2)}`);

  // ─── 2. Salários mensais (docx) ───────────────────────────────────────────────

  console.log("\n=== 2. Salários Mensais (docx) ===\n");

  const salarioFile = fs.readdirSync(DOCS).find((f) =>
    f.toLowerCase().includes("salario") && (f.endsWith(".docx") || f.endsWith(".xlsx"))
  );
  if (!salarioFile) throw new Error("Arquivo de salários não encontrado em docs/");

  console.log(`Arquivo: ${salarioFile}`);

  const salarioBuf = fs.readFileSync(path.join(DOCS, salarioFile));
  const { value: salarioHtml } = await mammoth.convertToHtml({ buffer: salarioBuf });
  const { value: salarioTexto } = await mammoth.extractRawText({ buffer: salarioBuf });

  // Parse HTML via regex (Node não tem DOMParser)
  const salarios: SalarioMensalRow[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(salarioHtml)) !== null) {
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length < 2) continue;
    const nome = cells[0];
    if (!nome || /valores?/i.test(nome)) continue;
    const salarioMensal = parseValorBR(cells[1]);
    salarios.push({ nome, salarioMensal: salarioMensal && salarioMensal > 0 ? salarioMensal : null });
  }

  // Fallback: texto cru se HTML não extraiu nada
  if (salarios.length === 0) {
    console.log("(fallback para texto cru)");
    for (const linha of salarioTexto.split(/\r?\n/)) {
      const t = linha.trim();
      if (!t || /^valores?$/i.test(t)) continue;
      const m = t.match(/^(.+?)\s{2,}(R\$\s*[\d.,]+)\s*$/) ?? t.match(/^(.+?)\t+(R\$\s*[\d.,]+)\s*$/);
      if (m) {
        salarios.push({ nome: m[1].trim(), salarioMensal: parseValorBR(m[2]) });
      }
    }
  }

  console.log(`Registros extraídos: ${salarios.length}`);
  for (const s of salarios) {
    const val = s.salarioMensal != null ? `R$ ${s.salarioMensal.toFixed(2)}` : "(em branco)";
    console.log(`  • ${s.nome.padEnd(35)} ${val}`);
  }
  const semSalario = salarios.filter((s) => s.salarioMensal == null);
  if (semSalario.length > 0) {
    console.log(`\n⚠ Sem salário: ${semSalario.map((s) => s.nome).join(", ")}`);
  }

  // ─── 3. Informações adicionais (docx) ─────────────────────────────────────────

  console.log("\n=== 3. Informações Adicionais (docx) ===\n");

  const anotacoesFile = fs.readdirSync(DOCS).find((f) =>
    (f.toLowerCase().includes("adcion") || f.toLowerCase().includes("adicional")) &&
    (f.endsWith(".docx") || f.endsWith(".txt"))
  );
  if (!anotacoesFile) throw new Error("Arquivo de anotações não encontrado em docs/");

  console.log(`Arquivo: ${anotacoesFile}`);

  const anotacoesBuf = fs.readFileSync(path.join(DOCS, anotacoesFile));
  const { value: textoAnotacoes } = await mammoth.extractRawText({ buffer: anotacoesBuf });

  console.log("\nTexto extraído:");
  console.log("─".repeat(60));
  console.log(textoAnotacoes.trim());
  console.log("─".repeat(60));

  // ─── 4. Claude API → eventos ──────────────────────────────────────────────────

  console.log("\n=== 4. Chamada à Claude API ===\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não configurada. Pulando chamada à API.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  console.log(`Modelo: ${MODEL}`);

  const SYSTEM_PROMPT = `Você extrai eventos de RH de anotações livres em português brasileiro.

Regras:
- Retorne APENAS JSON válido, sem markdown, sem explicação.
- Formato: {"eventos": [ {...}, {...} ]}
- Cada evento tem: nome (string), tipo ("falta"|"demissao"|"contratacao"), textoOriginal (string com a linha/trecho que originou o evento).
- Para faltas: inclua "diasFalta" como array de inteiros (dias do mês).
- Para demissão/contratação: inclua "data" em formato ISO (YYYY-MM-DD) se a data aparecer, senão omita.
- Se a mesma pessoa aparecer com múltiplos tipos (ex: falta e demissão), emita um evento por tipo.
- Ignore linhas que não sejam falta, demissão ou contratação.
- Preserve o nome exatamente como escrito pelo usuário (não normalize).`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: textoAnotacoes }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Resposta não contém JSON:", raw);
    process.exit(1);
  }

  const { eventos } = JSON.parse(jsonMatch[0]) as {
    eventos: Array<{
      nome: string;
      tipo: string;
      diasFalta?: number[];
      data?: string;
      textoOriginal: string;
    }>
  };

  console.log(`\nEventos extraídos: ${eventos.length}`);
  for (const e of eventos) {
    const extra = e.tipo === "falta"
      ? ` (dias: ${e.diasFalta?.join(", ")})`
      : e.data ? ` (data: ${e.data})` : "";
    console.log(`  • [${e.tipo}] ${e.nome}${extra}`);
    console.log(`    → "${e.textoOriginal}"`);
  }

  // ─── 5. processPayroll ────────────────────────────────────────────────────────

  console.log("\n=== 5. Resultado processPayroll ===\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultado = processPayroll(folhaRows, salarios, eventos as any);

  const { resumo, eventosSemMatch, funcionariosSemSalarioMensal } = resultado;

  console.log("Resumo:");
  console.log(`  Funcionários:       ${resumo.totalFuncionarios}`);
  console.log(`  Com ajuste:         ${resumo.totalComAjuste}`);
  console.log(`  Demitidos:          ${resumo.totalDemitidos}`);
  console.log(`  Dias de falta:      ${resumo.totalFaltas}`);
  console.log(`  Soma descontos:     R$ ${Math.abs(resumo.somaDescontos).toFixed(2)}`);
  console.log(`  Total bruto orig:   R$ ${resumo.totalBrutoOriginal.toFixed(2)}`);
  console.log(`  Total bruto ajust:  R$ ${resumo.totalBrutoAjustado.toFixed(2)}`);

  if (funcionariosSemSalarioMensal.length > 0) {
    console.log(`\n⚠ Sem salário mensal (${funcionariosSemSalarioMensal.length}):`);
    for (const n of funcionariosSemSalarioMensal) console.log(`  • ${n}`);
  }

  if (eventosSemMatch.length > 0) {
    console.log(`\n⚠ Eventos sem match na folha (${eventosSemMatch.length}):`);
    for (const e of eventosSemMatch) {
      console.log(`  • [${e.tipo}] "${e.nome}" → "${e.textoOriginal}"`);
    }
  }

  if (resultado.linhas.some((l) => l.notificacoes.length > 0)) {
    console.log("\nNotificações por funcionário:");
    for (const l of resultado.linhas) {
      if (l.notificacoes.length === 0) continue;
      console.log(`  ${l.nome}:`);
      for (const n of l.notificacoes) console.log(`    [${n.severidade}] ${n.mensagem}`);
    }
  }

  console.log("\n✓ E2E concluído.\n");

} // end main

main().catch((e) => { console.error(e); process.exit(1); });

// ─── Utils ────────────────────────────────────────────────────────────────────

function parseValorBR(s: string): number | null {
  if (!s) return null;
  const cleaned = s
    .replace(/R\$/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
