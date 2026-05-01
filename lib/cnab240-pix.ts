/**
 * Gerador CNAB 240 PIX — Itaú SISPAG Layout v086 (Fevereiro/2024)
 * Forma de Pagamento 45 — PIX via Chave (tipo_pix = "04")
 *
 * Funciona 100% no browser (sem dependências de servidor).
 * Produce registros de exatamente 240 bytes, CRLF entre linhas.
 *
 * Notas aplicadas:
 *   Nota 9  : Segmento B usa o MESMO nº sequencial do Segmento A
 *   Nota 35 : câmara "009" (SPI) para PIX
 *   Nota 36 : tipo transferência "04" em pos. 113-114 Seg A
 *   Nota 37 : tipo chave PIX em pos. 015-016 Seg B
 *   Nota 40 : formatos de chave PIX
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type ConfigEmpresa = {
  cnpj: string;          // apenas dígitos ou formatado
  nomeEmpresa: string;   // máx 30 chars
  agencia: string;       // 5 dígitos (sem dígito verificador separado)
  conta: string;         // até 12 dígitos
  digitoConta: string;   // 1 char (DAC)
  dataPagamento: string; // DD/MM/YYYY ou DD.MM.YYYY
};

export type PagamentoPix = {
  nomeFavorecido: string;
  chavePix: string;
  valor: number;
  cpfCnpjFavorecido?: string; // opcional; zeros se ausente
  mensagem?: string;
  numDocumento?: string;
};

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Campo numérico 9(n): apenas dígitos, zeros à esquerda. */
function num(value: string | number | null | undefined, size: number): string {
  const s = String(value ?? "").replace(/\D/g, "");
  if (s.length >= size) return s.slice(s.length - size);
  return s.padStart(size, "0");
}

/** Campo alfanumérico X(n): maiúsculas ASCII, brancos à direita. */
function alfa(value: string | null | undefined, size: number): string {
  const s = stripAccents(String(value ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-\/]/g, " ");
  return s.slice(0, size).padEnd(size, " ");
}

/** Converte R$ → inteiro implícito (×100), zero-padded. */
function valorCnab(valor: number, size: number): string {
  const cents = Math.round(valor * 100);
  return String(cents).padStart(size, "0");
}

/** Converte data variada → "DDMMAAAA". */
function formatarData(d: string): string {
  // aceita DD/MM/YYYY, DD.MM.YYYY, DDMMYYYY
  const clean = d.replace(/\D/g, "");
  if (clean.length === 8) {
    const possibleYear = parseInt(clean.slice(4), 10);
    if (possibleYear > 1900) return clean; // já é DDMMYYYY
    // pode ser YYYYMMDD
    return clean.slice(6, 8) + clean.slice(4, 6) + clean.slice(0, 4);
  }
  const now = new Date();
  return (
    String(now.getDate()).padStart(2, "0") +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getFullYear())
  );
}

function limparDoc(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

function tipoInscricao(doc: string): string {
  return limparDoc(doc).length === 14 ? "2" : "1";
}

/**
 * Detecta o tipo de chave PIX (Nota 37/40):
 *   01 = CPF  (11 dígitos)
 *   02 = CNPJ (14 dígitos)
 *   03 = Telefone (+55...)
 *   04 = E-mail
 *   05 = Chave aleatória (EVP / UUID)
 */
export function detectarTipoChave(chave: string): string {
  const c = chave.trim();
  if (c.startsWith("+")) return "03";
  if (c.includes("@")) return "04";
  const digits = c.replace(/\D/g, "");
  if (/^\d{11}$/.test(digits) && c === digits) return "01"; // CPF puro
  if (/^\d{14}$/.test(digits) && c === digits) return "02"; // CNPJ puro
  // UUID / chave aleatória
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c))
    return "05";
  return "05"; // fallback: chave aleatória
}

function assertLen(r: string, expected: number, label: string): void {
  if (r.length !== expected) {
    throw new Error(`CNAB ${label}: esperado ${expected} bytes, got ${r.length}`);
  }
}

// ---------------------------------------------------------------------------
// Registros CNAB 240
// ---------------------------------------------------------------------------

function headerArquivo(config: ConfigEmpresa): string {
  const now = new Date();
  const cnpj = num(limparDoc(config.cnpj), 14);
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const r =
    "341" +                                    // 001-003 banco
    "0000" +                                   // 004-007 lote (arquivo = 0000)
    "0" +                                      // 008     tipo registro
    " ".repeat(6) +                            // 009-014 brancos
    "080" +                                    // 015-017 versão layout
    tipoInscricao(config.cnpj) +               // 018     tipo inscrição
    cnpj +                                     // 019-032 CNPJ empresa
    " ".repeat(20) +                           // 033-052 brancos
    num(config.agencia, 5) +                   // 053-057 agência
    " " +                                      // 058
    num(config.conta, 12) +                    // 059-070 conta
    " " +                                      // 071
    alfa(config.digitoConta, 1) +              // 072     DAC
    alfa(config.nomeEmpresa, 30) +             // 073-102 nome empresa
    alfa("ITAU UNIBANCO S.A.", 30) +           // 103-132 nome banco
    " ".repeat(10) +                           // 133-142
    "1" +                                      // 143     remessa
    dd + mm + yyyy +                           // 144-151 data geração
    hh + min + ss +                            // 152-157 hora geração
    "0".repeat(9) +                            // 158-166 zeros (Nota 2)
    "0".repeat(5) +                            // 167-171 densidade = 0
    " ".repeat(69);                            // 172-240 brancos

  assertLen(r, 240, "Header Arquivo");
  return r;
}

function headerLote(config: ConfigEmpresa, numLote: number): string {
  const cnpj = num(limparDoc(config.cnpj), 14);

  const r =
    "341" +                                    // 001-003
    String(numLote).padStart(4, "0") +         // 004-007 nº lote
    "1" +                                      // 008     tipo registro
    "C" +                                      // 009     operação crédito
    "98" +                                     // 010-011 tipo pagamento (Pagtos Diversos)
    "45" +                                     // 012-013 PIX Transferência
    "040" +                                    // 014-016 versão layout lote
    " " +                                      // 017
    tipoInscricao(config.cnpj) +               // 018
    cnpj +                                     // 019-032
    " ".repeat(4) +                            // 033-036 ident. lançamento
    " ".repeat(16) +                           // 037-052
    num(config.agencia, 5) +                   // 053-057
    " " +                                      // 058
    num(config.conta, 12) +                    // 059-070
    " " +                                      // 071
    alfa(config.digitoConta, 1) +              // 072
    alfa(config.nomeEmpresa, 30) +             // 073-102
    " ".repeat(30) +                           // 103-132 finalidade lote
    " ".repeat(10) +                           // 133-142 histórico C/C
    " ".repeat(30) +                           // 143-172 endereço
    "0".repeat(5) +                            // 173-177 número local
    " ".repeat(15) +                           // 178-192 complemento
    " ".repeat(20) +                           // 193-212 cidade
    "0".repeat(8) +                            // 213-220 CEP
    "  " +                                     // 221-222 estado
    " ".repeat(8) +                            // 223-230
    " ".repeat(10);                            // 231-240 ocorrências (remessa = brancos)

  assertLen(r, 240, "Header Lote");
  return r;
}

function segmentoA(
  numLote: number,
  seq: number,
  pag: PagamentoPix,
  dataPagamento: string
): string {
  // Para PIX via chave (tipo 04): banco favorecido = 000, ag/conta = zeros
  const agCc = "0".repeat(20);

  const r =
    "341" +                                            // 001-003
    String(numLote).padStart(4, "0") +                 // 004-007
    "3" +                                              // 008
    String(seq).padStart(5, "0") +                     // 009-013
    "A" +                                              // 014
    "000" +                                            // 015-017 tipo movimento (000=inclusão)
    "009" +                                            // 018-020 câmara SPI (Nota 35)
    "000" +                                            // 021-023 banco favorecido (000 para chave PIX)
    agCc +                                             // 024-043 (20 bytes)
    alfa(pag.nomeFavorecido, 30) +                     // 044-073
    alfa(pag.numDocumento ?? "", 20) +                 // 074-093 Seu Número
    formatarData(dataPagamento) +                      // 094-101 DDMMAAAA
    "REA" +                                            // 102-104 moeda
    " ".repeat(8) +                                    // 105-112 ISPB brancos (Nota 35)
    "04" +                                             // 113-114 tipo PIX chave (Nota 36)
    "00000" +                                          // 115-119
    valorCnab(pag.valor, 15) +                         // 120-134 9(13)V9(02)
    " ".repeat(15) +                                   // 135-149 Nosso Número (remessa = brancos)
    " ".repeat(5) +                                    // 150-154
    "0".repeat(8) +                                    // 155-162 data efetiva (*)
    "0".repeat(15) +                                   // 163-177 valor efetivo (*)
    " ".repeat(20) +                                   // 178-197 finalidade detalhe
    "0".repeat(6) +                                    // 198-203 nº documento (*)
    num(limparDoc(pag.cpfCnpjFavorecido ?? ""), 14) + // 204-217 CPF/CNPJ favorecido
    "  " +                                             // 218-219 finalidade DOC/status
    "00000" +                                          // 220-224 finalidade TED
    " ".repeat(5) +                                    // 225-229
    "0" +                                              // 230     aviso (0=sem aviso)
    " ".repeat(10);                                    // 231-240 ocorrências

  assertLen(r, 240, `Segmento A seq ${seq}`);
  return r;
}

function segmentoB(
  numLote: number,
  seqA: number, // MESMO seq do Segmento A correspondente (Nota 9)
  pag: PagamentoPix
): string {
  const cpfCnpj = limparDoc(pag.cpfCnpjFavorecido ?? "");
  const tipoChave = detectarTipoChave(pag.chavePix);
  // Chave PIX: campo de 100 bytes (pos 128-227)
  const chave = pag.chavePix.trim().slice(0, 100).padEnd(100, " ");
  const mensagem = alfa(pag.mensagem ?? "", 65);

  const r =
    "341" +                                            // 001-003
    String(numLote).padStart(4, "0") +                 // 004-007
    "3" +                                              // 008
    String(seqA).padStart(5, "0") +                    // 009-013 MESMO seq do Seg A (Nota 9)
    "B" +                                              // 014
    tipoChave +                                        // 015-016 tipo chave (Nota 37)
    " " +                                              // 017
    tipoInscricao(cpfCnpj || "00000000000") +          // 018     1=CPF / 2=CNPJ
    num(cpfCnpj, 14) +                                 // 019-032
    " ".repeat(30) +                                   // 033-062 TXID (opcional, brancos)
    mensagem +                                         // 063-127 (65 bytes)
    chave +                                            // 128-227 (100 bytes)
    "   " +                                            // 228-230
    " ".repeat(10);                                    // 231-240 ocorrências

  assertLen(r, 240, `Segmento B seq ${seqA}`);
  return r;
}

function trailerLote(
  numLote: number,
  qtdRegistros: number,
  valorTotal: number
): string {
  const r =
    "341" +
    String(numLote).padStart(4, "0") +
    "5" +
    " ".repeat(9) +                                    // 009-017
    String(qtdRegistros).padStart(6, "0") +            // 018-023 qtde registros (Nota 17)
    valorCnab(valorTotal, 18) +                        // 024-041 valor total 9(16)V9(02)
    "0".repeat(18) +                                   // 042-059 zeros
    " ".repeat(171) +                                  // 060-230
    " ".repeat(10);                                    // 231-240

  assertLen(r, 240, "Trailer Lote");
  return r;
}

function trailerArquivo(qtdLotes: number, qtdRegistrosTotal: number): string {
  const r =
    "341" +
    "9999" +
    "9" +
    " ".repeat(9) +                                    // 009-017
    String(qtdLotes).padStart(6, "0") +                // 018-023 qtde lotes
    String(qtdRegistrosTotal).padStart(6, "0") +       // 024-029 qtde registros total
    " ".repeat(211);                                   // 030-240

  assertLen(r, 240, "Trailer Arquivo");
  return r;
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Gera o conteúdo do arquivo CNAB 240 PIX como string (CRLF).
 * Use com um único lote; todos os pagamentos devem ter chave PIX (tipo 04).
 */
export function gerarCnab240Pix(
  config: ConfigEmpresa,
  pagamentos: PagamentoPix[]
): string {
  if (pagamentos.length === 0) throw new Error("Nenhum pagamento fornecido.");

  const numLote = 1;
  const records: string[] = [];

  records.push(headerArquivo(config));
  records.push(headerLote(config, numLote));

  let seq = 1;
  let valorTotal = 0;
  let qtdDetalhes = 0;

  for (const pag of pagamentos) {
    const seqA = seq;

    records.push(segmentoA(numLote, seqA, pag, config.dataPagamento));
    qtdDetalhes++;
    valorTotal += pag.valor;

    records.push(segmentoB(numLote, seqA, pag)); // MESMO seqA — Nota 9
    qtdDetalhes++;

    seq++; // avança APÓS o par A+B
  }

  // qtde registros no lote = header(1) + detalhes + trailer(1)
  const qtdRegLote = 1 + qtdDetalhes + 1;
  records.push(trailerLote(numLote, qtdRegLote, valorTotal));

  // qtde total = header arquivo(1) + lote completo + trailer arquivo(1)
  const qtdTotal = 1 + qtdRegLote + 1;
  records.push(trailerArquivo(1, qtdTotal));

  return records.join("\r\n") + "\r\n";
}

/**
 * Dispara o download do arquivo CNAB 240 no browser.
 */
export function downloadCnab240(conteudo: string, nomeArquivo: string): void {
  // Encode como Latin-1 / ASCII via Uint8Array para garantir bytes corretos
  const bytes = new Uint8Array(conteudo.length);
  for (let i = 0; i < conteudo.length; i++) {
    bytes[i] = conteudo.charCodeAt(i) & 0xff;
  }
  const blob = new Blob([bytes], { type: "text/plain;charset=ascii" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
