import type {
  Evento,
  FolhaRow,
  LinhaAjustada,
  Notificacao,
  PeriodoInfo,
  ResultadoProcessamento,
  SalarioMensalRow,
} from "./types";
import { resolveName } from "./normalize";

/** Dias base para cálculo do valor diário. Regra do usuário: salário mensal / 22. */
export const DIAS_BASE_MENSAL = 22;

/**
 * Aplica as regras de negócio:
 *   - Demissão → zera salário, adiciona notificação "atencao".
 *   - Falta    → subtrai (salarioMensal / 22) * diasFalta.
 *   - Contratação → apenas notificação informativa (não altera valor).
 *
 * Match de nomes: usa `resolveName` (exato → substring → primeiro-nome único).
 * Eventos sem match ou ambíguos vão pra `eventosSemMatch`.
 * Funcionários sem salarioMensal conhecido: aparecem em `funcionariosSemSalarioMensal`.
 *
 * Não modifica os inputs.
 */
export function processPayroll(
  folha: FolhaRow[],
  salariosMensais: SalarioMensalRow[],
  eventos: Evento[],
  periodoInfo: PeriodoInfo | null = null,
): ResultadoProcessamento {
  const eventoParaLinha = new Map<Evento, number>();
  eventos.forEach((evento) => {
    const linha = resolveName(evento.nome, folha);
    eventoParaLinha.set(evento, linha ? folha.indexOf(linha) : -1);
  });

  const funcionariosSemSalarioMensal: string[] = [];

  const linhas: LinhaAjustada[] = folha.map((row, idx) => {
    const notificacoes: Notificacao[] = [];
    const salarioMensalRow = resolveName(row.nome, salariosMensais);
    const salarioMensal = salarioMensalRow?.salarioMensal ?? null;
    const valorDiario =
      salarioMensal != null ? salarioMensal / DIAS_BASE_MENSAL : null;

    if (salarioMensal == null) {
      funcionariosSemSalarioMensal.push(row.nome);
    }

    const eventosDaPessoa = eventos.filter(
      (e) => eventoParaLinha.get(e) === idx,
    );

    let salarioAjustado = row.salarioQuinzenal;

    const demissao = eventosDaPessoa.find((e) => e.tipo === "demissao");
    if (demissao) {
      salarioAjustado = 0;
      notificacoes.push({
        severidade: "atencao",
        mensagem: `DEMITIDO${demissao.data ? ` em ${demissao.data}` : ""} — pagamento zerado.`,
      });
    }

    if (!demissao) {
      const faltas = eventosDaPessoa.filter((e) => e.tipo === "falta");
      const totalDias = faltas.reduce(
        (acc, e) => acc + (e.diasFalta?.length ?? 0),
        0,
      );
      if (totalDias > 0) {
        if (valorDiario == null) {
          notificacoes.push({
            severidade: "atencao",
            mensagem: `Faltou ${totalDias} dia(s) mas não foi encontrado salário mensal — desconto não aplicado.`,
          });
        } else {
          const desconto = valorDiario * totalDias;
          salarioAjustado = Math.max(0, salarioAjustado - desconto);
          const diasStr = faltas
            .flatMap((f) => f.diasFalta ?? [])
            .sort((a, b) => a - b)
            .join(", ");
          notificacoes.push({
            severidade: "info",
            mensagem: `Faltas nos dias ${diasStr} — desconto de R$ ${desconto.toFixed(2)} (${totalDias} × R$ ${valorDiario.toFixed(2)}).`,
          });
        }
      }
    }

    const contratacao = eventosDaPessoa.find((e) => e.tipo === "contratacao");
    if (contratacao) {
      notificacoes.push({
        severidade: "info",
        mensagem: `CONTRATADO${contratacao.data ? ` em ${contratacao.data}` : ""} — conferir se o valor quinzenal está proporcional.`,
      });
    }

    return {
      ...row,
      salarioAjustado,
      ajuste: salarioAjustado - row.salarioQuinzenal,
      valorDiario,
      salarioMensal,
      notificacoes,
    };
  });

  const eventosSemMatch = eventos.filter((e) => eventoParaLinha.get(e) === -1);

  const salariosSemFolha = salariosMensais
    .filter((s) => s.nome && resolveName(s.nome, folha) == null)
    .map((s) => s.nome);

  const totalBrutoOriginal = linhas.reduce(
    (a, l) => a + l.salarioQuinzenal,
    0,
  );
  const totalBrutoAjustado = linhas.reduce(
    (a, l) => a + l.salarioAjustado,
    0,
  );

  const resumo = {
    totalFuncionarios: linhas.length,
    totalComAjuste: linhas.filter((l) => l.ajuste !== 0).length,
    totalDemitidos: linhas.filter((l) =>
      l.notificacoes.some((n) => n.mensagem.startsWith("DEMITIDO")),
    ).length,
    totalFaltas: eventos
      .filter((e) => e.tipo === "falta")
      .reduce((acc, e) => acc + (e.diasFalta?.length ?? 0), 0),
    somaDescontos: linhas.reduce((acc, l) => acc + Math.min(0, l.ajuste), 0),
    totalBrutoOriginal,
    totalBrutoAjustado,
  };

  return {
    linhas,
    eventosSemMatch,
    funcionariosSemSalarioMensal,
    salariosSemFolha,
    periodoInfo,
    resumo,
  };
}
