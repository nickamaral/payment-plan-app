# Folha Quinzenal — Análise Automática

Mini-sistema web que recebe três arquivos (folha quinzenal em xlsx, salários mensais em docx/xlsx e informações adicionais em docx/txt), aplica as regras de negócio e exibe uma tabela agrupada por seção com salários ajustados e notificações por funcionário.

A planilha original **nunca é modificada**. Tudo é derivado em memória.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · SheetJS (xlsx) · mammoth (docx) · Claude API (@anthropic-ai/sdk).

O parsing dos arquivos acontece **no navegador**. Apenas o texto livre das informações adicionais vai para a API, onde a Claude API extrai eventos estruturados (faltas, demissões, contratações).

## Como rodar

```bash
npm install
cp .env.example .env.local
# edite .env.local e coloque sua chave ANTHROPIC_API_KEY
npm run dev
```

Abra <http://localhost:3000>.

## Deploy (Vercel)

1. Push do repositório pro GitHub.
2. [vercel.com/new](https://vercel.com/new) → importe o repo.
3. Em **Environment Variables**, adicione:
   - `ANTHROPIC_API_KEY` (obrigatório)
   - `ANTHROPIC_MODEL` (opcional; default `claude-sonnet-4-6`)
4. Deploy.

## Regras de negócio

| Evento | Ação |
|---|---|
| Demissão | Zera salário + notificação ⚠ "atencao" |
| Falta | Desconta `(salário mensal / 22) × dias de falta` |
| Contratação | Apenas notificação informativa |

Todas em `lib/payroll-processor.ts`. A constante `DIAS_BASE_MENSAL = 22`.

## Formato esperado dos arquivos

Documentado em detalhe em [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — "Formato real dos arquivos".

Resumo:
- **Folha (.xlsx)**: seções com título ("PJ COM NF", "PJ SEM NF"), cabeçalho "Data|Descrição|Valor|Cliente/Fornecedor|PIX|[CONTA]", valores negativos, linhas TOTAL ignoradas.
- **Salários mensais (.docx)**: tabela 2 colunas Nome → `R$ xxxx`. Também aceita .xlsx.
- **Anotações (.docx ou .txt)**: texto livre (o modelo interpreta).

## Estrutura

```
app/
  page.tsx                  página única de upload + resultado
  api/parse-notes/route.ts  endpoint Claude (texto livre → eventos JSON)
  layout.tsx
  globals.css
components/
  FileDropzone.tsx
  ResultTable.tsx
lib/
  types.ts                  domínio
  xlsx-parser.ts            parsing da folha com seções
  docx-parser.ts            parsing de .docx via mammoth
  payroll-processor.ts      regras de negócio (puras, testáveis)
  normalize.ts              match tolerante de nomes
  utils.ts
.claude/CLAUDE.md           contexto para Claude Code
PROMPT_INICIAL.md           prompt para colar no Claude Code ao iniciar
```

## Desenvolvimento

Contexto detalhado para agentes (Claude Code) está em [`.claude/CLAUDE.md`](.claude/CLAUDE.md). Prompt inicial em [`PROMPT_INICIAL.md`](PROMPT_INICIAL.md).
