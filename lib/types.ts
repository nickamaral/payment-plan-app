/**
 * Tipos de domínio do sistema de análise quinzenal de folha de pagamento.
 *
 * Fluxo:
 *   1. folha_quinzenal.xlsx       → linhas agrupadas por seção (FolhaRow)
 *   2. salarios-mensais (docx/xlsx) → salário mensal por funcionário (SalarioMensalRow)
 *   3. informacoes-adicionais (docx/txt) → eventos estruturados via Claude API (Evento[])
 *   4. processPayroll()           → linhas ajustadas (LinhaAjustada[])
 *
 * IMPORTANTE — formato real da folha (baseado nos exemplos em docs/exemplos/):
 *   - A planilha tem múltiplas SEÇÕES separadas (ex: "PJ SEM NF", "PJ COM NF").
 *   - Cada seção começa com seu título isolado, seguido de uma linha de cabeçalho
 *     (Data | Descrição | Valor | Cliente/Fornecedor | PIX | [CONTA extra]) e
 *     depois as linhas de dados. Entre seções há linhas em branco e uma linha
 *     "TOTAL" que deve ser IGNORADA pelo parser.
 *   - "Descrição" é o nome do funcionário.
 *   - "Valor" vem como NÚMERO NEGATIVO (saída financeira). O domínio armazena
 *     o valor absoluto em salarioQuinzenal.
 *   - A aba/sheet tem nome variável (ex: "10.04.2026"). Não hardcodar.
 */

export type SecaoFolha = string; // ex: "PJ COM NF", "PJ SEM NF"

export type PeriodoInfo = {
  /** Nome da aba da planilha, ex: "10.04.2026" */
  dataPagamento: string;
  /** Dia de referência do pagamento */
  diaReferencia: 10 | 25;
  /** Início do período coberto, ex: "21/03/2026" */
  periodoInicio: string;
  /** Fim do período coberto, ex: "05/04/2026" */
  periodoFim: string;
  /** Quantidade de dias úteis (seg–sex) no período */
  diasUteis: number;
};

export type FolhaRow = {
  /** Nome completo do funcionário (coluna "Descrição"). Chave de join com anotações e salários mensais. */
  nome: string;
  /** Valor quinzenal bruto (positivo) antes de ajustes. Convertido de Math.abs(valor_na_planilha). */
  salarioQuinzenal: number;
  /** Seção da planilha ("PJ COM NF", "PJ SEM NF", etc.). Preserva agrupamento. */
  secao: SecaoFolha;
  /** Data que aparece na linha (ex: "10.04"). Texto livre; não tentamos interpretar. */
  dataLinha?: string | null;
  /** Coluna "Cliente/Fornecedor" (ex: "ITAÚ", "ZURICH", "BOXSU", "DXC / VALE"). */
  clienteFornecedor?: string | null;
  /** Coluna "PIX" ou chave de pagamento. */
  pix?: string | null;
  /** Coluna opcional "CONTA ITAU" quando não há PIX. */
  contaBancaria?: string | null;
  /** Índice original da linha na planilha (para auditoria). */
  linhaOriginal?: number;
};

export type SalarioMensalRow = {
  nome: string;
  /** Salário mensal em reais (positivo). null quando a fonte não informou. */
  salarioMensal: number | null;
};

export type TipoEvento = "falta" | "demissao" | "contratacao";

export type Evento = {
  /** Nome como escrito nas anotações. Match com a folha é feito via resolveName(). */
  nome: string;
  tipo: TipoEvento;
  /** Dias do mês em que houve falta (apenas para tipo="falta"). Ex: [2, 7]. */
  diasFalta?: number[];
  /** Data ISO do evento (para demissão/contratação), se disponível (YYYY-MM-DD). */
  data?: string;
  /** Linha/trecho original do documento para auditoria. */
  textoOriginal: string;
};

export type Notificacao = {
  severidade: "atencao" | "info";
  mensagem: string;
};

export type LinhaAjustada = FolhaRow & {
  /** Valor após aplicação das regras de negócio. */
  salarioAjustado: number;
  /** Diferença entre salarioAjustado e salarioQuinzenal (negativo = desconto). */
  ajuste: number;
  /** Valor diário calculado a partir do salário mensal (salarioMensal / 22). */
  valorDiario: number | null;
  /** Salário mensal usado (ou null se não encontrado). */
  salarioMensal: number | null;
  /** Lista de notificações geradas (ex: "atencao: funcionário demitido"). */
  notificacoes: Notificacao[];
};

export type ResultadoProcessamento = {
  linhas: LinhaAjustada[];
  /** Eventos extraídos que não bateram com nenhum funcionário da folha. */
  eventosSemMatch: Evento[];
  /** Funcionários que estão na folha mas sem salário mensal informado (aviso). */
  funcionariosSemSalarioMensal: string[];
  /** Nomes no cadastro de salários que não foram encontrados na folha quinzenal. */
  salariosSemFolha: string[];
  /** Informações do período de pagamento (extraídas do nome da aba). */
  periodoInfo: PeriodoInfo | null;
  /** Resumo agregado pra UI. */
  resumo: {
    totalFuncionarios: number;
    totalComAjuste: number;
    totalDemitidos: number;
    totalFaltas: number;
    somaDescontos: number;
    totalBrutoOriginal: number;
    totalBrutoAjustado: number;
  };
};
