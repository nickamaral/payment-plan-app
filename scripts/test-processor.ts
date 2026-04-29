/**
 * Testes unitários do processPayroll.
 * Rodar: npx tsx scripts/test-processor.ts
 */

import { processPayroll, DIAS_BASE_MENSAL } from "../lib/payroll-processor";
import type { Evento, FolhaRow, SalarioMensalRow } from "../lib/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const folha: FolhaRow[] = [
  { nome: "Ana Paula", salarioQuinzenal: 2000, secao: "PJ SEM NF" },
  { nome: "Bruno Silva", salarioQuinzenal: 3000, secao: "PJ SEM NF" },
  { nome: "Carla Mendes", salarioQuinzenal: 1500, secao: "PJ COM NF" },
  { nome: "Diego Rocha", salarioQuinzenal: 2500, secao: "PJ COM NF" },
  { nome: "Fernanda Lima", salarioQuinzenal: 1800, secao: "PJ SEM NF" }, // sem salário mensal
];

const salarios: SalarioMensalRow[] = [
  { nome: "Ana Paula", salarioMensal: 4400 },       // valorDiario = 200
  { nome: "Bruno Silva", salarioMensal: 6600 },      // valorDiario = 300
  { nome: "Carla Mendes", salarioMensal: 3300 },     // valorDiario = 150
  { nome: "Diego Rocha", salarioMensal: 5500 },      // valorDiario = 250
  // Fernanda Lima: intencionalmente ausente
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? `\n    → ${detail}` : ""}`);
    failed++;
  }
}

function approx(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

console.log("\n=== test-processor ===\n");

// 1. Desconto por falta
{
  console.log("1. Desconto por falta");
  const eventos: Evento[] = [
    {
      nome: "Ana Paula",
      tipo: "falta",
      diasFalta: [3, 7],   // 2 dias
      textoOriginal: "Ana Paula faltou dias 3 e 7",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);
  const ana = res.linhas.find((l) => l.nome === "Ana Paula")!;

  const salarioMensal = 4400;
  const valorDiario = salarioMensal / DIAS_BASE_MENSAL;
  const descontoEsperado = valorDiario * 2;
  const ajustadoEsperado = 2000 - descontoEsperado;

  assert(approx(ana.valorDiario ?? -1, valorDiario), `valorDiario = ${valorDiario.toFixed(2)}`);
  assert(approx(ana.salarioAjustado, ajustadoEsperado), `salarioAjustado = ${ajustadoEsperado.toFixed(2)} (era 2000 - ${descontoEsperado.toFixed(2)})`);
  assert(approx(ana.ajuste, -descontoEsperado), `ajuste = -${descontoEsperado.toFixed(2)}`);
  assert(
    ana.notificacoes.some((n) => n.severidade === "info" && n.mensagem.includes("3, 7")),
    "notificação info menciona dias 3, 7",
    `notificações: ${JSON.stringify(ana.notificacoes)}`
  );
}

// 2. Zeragem por demissão
{
  console.log("\n2. Zeragem por demissão");
  const eventos: Evento[] = [
    {
      nome: "Bruno Silva",
      tipo: "demissao",
      data: "2026-04-10",
      textoOriginal: "Bruno demitido em 10/04",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);
  const bruno = res.linhas.find((l) => l.nome === "Bruno Silva")!;

  assert(bruno.salarioAjustado === 0, "salarioAjustado = 0");
  assert(approx(bruno.ajuste, -3000), "ajuste = -3000");
  assert(
    bruno.notificacoes.some((n) => n.severidade === "atencao" && n.mensagem.includes("DEMITIDO")),
    'notificação "atencao" com DEMITIDO',
    `notificações: ${JSON.stringify(bruno.notificacoes)}`
  );
  assert(res.resumo.totalDemitidos === 1, "resumo.totalDemitidos = 1");
}

// 3. Demissão não acumula desconto de falta
{
  console.log("\n3. Demissão não acumula falta (demissão tem precedência)");
  const eventos: Evento[] = [
    {
      nome: "Carla Mendes",
      tipo: "demissao",
      textoOriginal: "Carla demitida",
    },
    {
      nome: "Carla Mendes",
      tipo: "falta",
      diasFalta: [1],
      textoOriginal: "Carla faltou dia 1",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);
  const carla = res.linhas.find((l) => l.nome === "Carla Mendes")!;

  assert(carla.salarioAjustado === 0, "salarioAjustado = 0 (demissão prevalece)");
  assert(
    !carla.notificacoes.some((n) => n.mensagem.toLowerCase().includes("falt")),
    "sem notificação de falta quando demitido"
  );
}

// 4. Contratação: só notificação, valor inalterado
{
  console.log("\n4. Contratação — só notificação, valor inalterado");
  const eventos: Evento[] = [
    {
      nome: "Diego Rocha",
      tipo: "contratacao",
      data: "2026-04-01",
      textoOriginal: "Diego contratado dia 1",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);
  const diego = res.linhas.find((l) => l.nome === "Diego Rocha")!;

  assert(diego.salarioAjustado === 2500, "salarioAjustado inalterado = 2500");
  assert(diego.ajuste === 0, "ajuste = 0");
  assert(
    diego.notificacoes.some((n) => n.severidade === "info" && n.mensagem.includes("CONTRATADO")),
    'notificação "info" com CONTRATADO'
  );
}

// 5. Evento sem match → eventosSemMatch
{
  console.log("\n5. Evento sem match → eventosSemMatch");
  const eventos: Evento[] = [
    {
      nome: "Zezinho da Silva",
      tipo: "falta",
      diasFalta: [5],
      textoOriginal: "Zezinho faltou dia 5",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);

  assert(res.eventosSemMatch.length === 1, "eventosSemMatch.length = 1");
  assert(res.eventosSemMatch[0].nome === "Zezinho da Silva", 'nome = "Zezinho da Silva"');
  // nenhuma linha foi afetada
  assert(
    res.linhas.every((l) => l.ajuste === 0),
    "nenhuma linha foi afetada",
    `ajustes: ${res.linhas.map((l) => `${l.nome}=${l.ajuste}`).join(", ")}`
  );
}

// 6. Funcionário sem salarioMensal → funcionariosSemSalarioMensal + falta sem desconto
{
  console.log("\n6. Funcionário sem salário mensal: sem desconto + aviso");
  const eventos: Evento[] = [
    {
      nome: "Fernanda Lima",
      tipo: "falta",
      diasFalta: [10],
      textoOriginal: "Fernanda faltou dia 10",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);
  const fernanda = res.linhas.find((l) => l.nome === "Fernanda Lima")!;

  assert(
    res.funcionariosSemSalarioMensal.includes("Fernanda Lima"),
    'funcionariosSemSalarioMensal inclui "Fernanda Lima"'
  );
  assert(fernanda.salarioMensal === null, "salarioMensal = null");
  assert(fernanda.valorDiario === null, "valorDiario = null");
  assert(fernanda.salarioAjustado === 1800, "salarioAjustado = 1800 (sem desconto)");
  assert(
    fernanda.notificacoes.some((n) => n.severidade === "atencao" && n.mensagem.includes("salário mensal")),
    'notificação "atencao" por falta sem salário'
  );
}

// 7. Resumo agregado: totais batem
{
  console.log("\n7. Resumo agregado");
  const eventos: Evento[] = [
    {
      nome: "Ana Paula",
      tipo: "falta",
      diasFalta: [1, 2],
      textoOriginal: "Ana faltou 1 e 2",
    },
    {
      nome: "Bruno Silva",
      tipo: "demissao",
      textoOriginal: "Bruno demitido",
    },
  ];
  const res = processPayroll(folha, salarios, eventos);

  const totalBrutoEsperado = folha.reduce((a, r) => a + r.salarioQuinzenal, 0);
  assert(
    approx(res.resumo.totalBrutoOriginal, totalBrutoEsperado),
    `totalBrutoOriginal = ${totalBrutoEsperado}`
  );
  assert(res.resumo.totalDemitidos === 1, "totalDemitidos = 1");
  assert(res.resumo.totalFaltas === 2, "totalFaltas = 2 dias");
  assert(res.resumo.somaDescontos < 0, "somaDescontos < 0");
  const totalAjustadoCalculado = res.linhas.reduce((a, l) => a + l.salarioAjustado, 0);
  assert(
    approx(res.resumo.totalBrutoAjustado, totalAjustadoCalculado),
    `totalBrutoAjustado bate com soma manual (${totalAjustadoCalculado.toFixed(2)})`
  );
}

// ─── Resultado ───────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Resultado: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  process.exit(1);
}
