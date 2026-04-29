# Prompt inicial para Claude Code

> Copie o conteúdo entre `---` abaixo e cole como primeira mensagem no Claude Code, com esta pasta (`folha-quinzenal/`) aberta.

---

Olá Claude. Este projeto é um mini-sistema web que automatiza a análise quinzenal da folha de pagamento da minha empresa. O scaffold já está montado: Next.js 16 (App Router) + TypeScript + Tailwind, com parsing de xlsx e docx no cliente, e uma API route que usa a Claude API apenas para interpretar o texto livre das anotações.

**Leia ANTES de tocar em código:**

1. `.claude/CLAUDE.md` — arquitetura, invariantes, convenções e o formato real dos arquivos de entrada.
2. `README.md` — visão geral e instruções de execução.
3. `lib/types.ts` — contrato de domínio (`FolhaRow`, `Evento`, `LinhaAjustada`, `ResultadoProcessamento`).
4. `lib/payroll-processor.ts` — regras de negócio (fonte da verdade).
5. `lib/xlsx-parser.ts` — parsing da planilha com seções.
6. `lib/docx-parser.ts` — parsing dos .docx via mammoth.
7. `app/api/parse-notes/route.ts` — prompt do sistema e formato esperado da resposta da Claude API.

**Entradas do sistema (cada run do usuário traz arquivos novos):**

- `Folha de Pagamento <CLIENTE> <DD.MM.AAAA>.xlsx` — sheet com data, seções ("PJ COM NF", "PJ SEM NF"), cabeçalho `Data|Descrição|Valor|Cliente/Fornecedor|PIX|[CONTA]`, valores negativos, linhas `TOTAL` a ignorar.
- `INFORMAÇÕE_salario_mes.docx` (ou .xlsx) — nome do funcionário + salário mensal. Pode vir com alguns em branco.
- `INFORMAÇÕES_adcionais.docx` (ou .txt) — texto livre com demissões, faltas e contratações (pode ter meses inteiros acumulados).

**O que eu quero nesta sessão (nesta ordem):**

1. **Sanity check do scaffold.** Rode `npm install` e depois `npm run typecheck`. Me mostre qualquer erro. Se houver import quebrado ou type errado, conserte antes de seguir.
2. **Teste unitário do processor.** Crie `scripts/test-processor.ts` (rodável via `tsx`) que usa fixtures mockadas (não precisa de arquivo real ainda) e valida:
   - desconto por falta (`salarioMensal / 22 * dias`),
   - zeragem por demissão,
   - contratação só notificando,
   - evento sem match indo pra `eventosSemMatch`,
   - funcionário sem salarioMensal indo pra `funcionariosSemSalarioMensal`.
3. **Suba o dev server** com `npm run dev` e confirme que a página carrega em `localhost:3000`. Se houver erro de Tailwind, mammoth ou xlsx, resolva.
4. **Teste end-to-end real.** Eu vou te passar os arquivos reais na sessão. Rode o fluxo completo com `ANTHROPIC_API_KEY` configurada em `.env.local` e me reporte:
   - quantas linhas o parser do xlsx extraiu (e se bate com o número de pessoas na planilha);
   - se a soma `totalBrutoOriginal` bate com a soma das linhas na planilha (os TOTAIS digitados na planilha podem estar errados — confie no recalculado e me avise);
   - quais eventos a Claude API extraiu das anotações;
   - se algum nome foi órfão (`eventosSemMatch`) ou ambíguo;
   - se algum funcionário ficou sem salário mensal.
5. **Só depois** discuta comigo qualquer melhoria (UI, validação, export). Não adicione features sem alinhar.

**Regras gerais:**

- TypeScript strict, zero `any`.
- Se encontrar um bug enquanto resolve outro, conserte agora — não deixe pra depois.
- Se uma escolha minha parecer ruim (regra de 22 dias, match de nomes, heurística de detectar título de seção), fala. Quero crítica, não validação.
- Documenta o que verificou: arquivo + linha ao citar código.
- Nunca sobrescrever os arquivos de entrada. Tudo em memória.
- Modelo Claude default: `claude-sonnet-4-6` (via env `ANTHROPIC_MODEL`).

**Objetivo final:** deploy na Vercel funcionando. Eu subo os 3 arquivos, vejo a tabela agrupada por seção com os salários ajustados, descontos, notificações e avisos de órfãos. Simples assim.

Comece pela etapa 1.

---

## Resumo do que você vai receber ao colar este prompt

Claude Code vai:
1. Rodar `npm install` + `npm run typecheck` e corrigir qualquer erro que aparecer.
2. Criar o primeiro teste do processor.
3. Subir o dev server.
4. Te pedir pra enviar os arquivos reais (ou você pode já arrastá-los na mesma mensagem) e fazer o teste E2E.
5. Relatar achados concretos (linhas extraídas, totais que batem ou divergem, eventos interpretados) antes de sugerir qualquer mudança.
