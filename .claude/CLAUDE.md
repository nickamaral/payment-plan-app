# Contexto do projeto — Folha Quinzenal

Sistema web para automatizar a análise quinzenal da folha de pagamento. Deploy alvo: Vercel.

## Stack

- **Next.js 16.2+** (App Router, Turbopack default)
- **React 19.2**
- **TypeScript 5.6** (strict)
- **Tailwind CSS 3.4**
- **xlsx (SheetJS) 0.18.5** — parsing de xlsx no cliente
- **mammoth 1.8** — parsing de .docx no cliente (tanto salários quanto anotações)
- **@anthropic-ai/sdk 0.90+** — usado APENAS para interpretar o texto livre das anotações
- **zod** — validação do JSON retornado pela Claude API

## Arquitetura

```
app/
  page.tsx                  upload dos 3 arquivos + orquestração (client-side)
  api/parse-notes/route.ts  ÚNICA rota de servidor: recebe texto livre, retorna eventos estruturados via Claude
components/
  FileDropzone.tsx          drag-and-drop dos arquivos
  ResultTable.tsx           tabela agrupada por seção + avisos
lib/
  types.ts                  tipos de domínio
  xlsx-parser.ts            parsing xlsx (seções, TOTAL skip, valor negativo → abs)
  docx-parser.ts            parsing .docx via mammoth (tabela 2-col e texto livre)
  payroll-processor.ts      regras de negócio puras (sem I/O)
  normalize.ts              resolveName() em camadas (exato → substring → primeiro-nome-único)
  utils.ts                  cn() + formatBRL()
```

## Formato real dos arquivos (aprendido com exemplo do usuário)

### Folha de Pagamento (.xlsx)
- Sheet com nome = data da quinzena (ex: `10.04.2026`). Não hardcodar.
- Estrutura em SEÇÕES, cada uma com:
  - Linha de título isolado (ex: `PJ SEM NF`, `PJ COM NF`).
  - Linha de cabeçalho: `Data | Descrição | Valor | Cliente/Fornecedor | PIX | (CONTA ITAU)`.
  - Linhas de dados com valor **negativo** (saída financeira). O domínio guarda `Math.abs`.
  - Linhas `TOTAL`, `TOTAL - PJ COM NF`, `TOTAL GERAL` devem ser IGNORADAS.
- Pode haver segunda sheet (ex: "AGUARDANDO EMISSAO NF") que hoje não processamos.
- **Descoberta relevante**: o TOTAL GERAL digitado pode estar desatualizado. O sistema recalcula a partir das linhas individuais, não confia no total escrito.

### Salários Mensais (.docx ou .xlsx)
- Formato visto: docx com tabela 2 colunas (Nome | `R$ 2500`).
- Alguns funcionários vêm com salário em branco → `salarioMensal: null`, UI avisa.
- Pode ser também xlsx simples (colunas Nome/Salário Mensal).

### Informações Adicionais (.docx ou .txt)
- Texto livre em português. Claude API extrai eventos.
- Pode conter eventos antigos (demissões de meses passados) que não estão mais na folha → viram `eventosSemMatch` (normal, só aviso).
- Pode ter ordem invertida (`07/04 e 08/04 Daniel Rodrigues ...`) — o prompt do sistema instrui a extrair mesmo assim.

## Regras de negócio (fonte da verdade: `lib/payroll-processor.ts`)

1. **Demissão** → `salarioAjustado = 0` + notificação "atencao".
2. **Falta** → desconta `(salarioMensal / 22) * dias` (`DIAS_BASE_MENSAL = 22`).
3. **Contratação** → apenas notificação informativa (valor não muda automaticamente).
4. Eventos que não batem com ninguém na folha → `eventosSemMatch` (aviso amarelo na UI).
5. Funcionários na folha sem salário mensal conhecido → `funcionariosSemSalarioMensal` (aviso amarelo); se houver falta, desconto não aplicado e a linha recebe notificação "atencao".

## Invariantes

- **Nunca** sobrescrever os arquivos de entrada. Tudo é derivado em memória.
- Folha (dados sensíveis) fica no browser; apenas o texto livre das anotações vai pra API.
- `payroll-processor.ts` é puro: não faz fetch, não lê arquivo, não depende de `window`. Testável.
- Match de nomes é `resolveName()` em 3 camadas; ambiguidade = órfão (nunca falso positivo silencioso).

## Convenções de código

- TypeScript strict, nunca `any`. Use `unknown` + narrowing.
- Componentes client-side: `"use client"` no topo.
- API routes: `export const runtime = "nodejs"` (Claude SDK precisa).
- Modelo Claude default: `claude-sonnet-4-6` (via env `ANTHROPIC_MODEL`).

## O que NÃO fazer

- Não adicione UI kit pesado (Material, Chakra). Tailwind puro é suficiente.
- Não coloque a chave da Claude API no cliente. Toda chamada ao SDK é via API route.
- Não altere a regra dos 22 dias sem confirmação — política de negócio.
- Não assuma o nome da sheet da folha — é a data da quinzena, muda a cada run.

## Rodando localmente

```bash
npm install
cp .env.example .env.local    # preencher ANTHROPIC_API_KEY
npm run dev
```

## Deploy Vercel

1. Push pra GitHub.
2. Importar projeto em vercel.com.
3. Adicionar env vars `ANTHROPIC_API_KEY` (obrigatória) e `ANTHROPIC_MODEL` (opcional).
4. Deploy.

**Limite Vercel Hobby**: body de serverless function = 4.5MB. O xlsx é processado no cliente, então só o texto das anotações trafega — estouro é improvável.
