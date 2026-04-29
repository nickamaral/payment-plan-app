import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Evento } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const EventoSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["falta", "demissao", "contratacao"]),
  diasFalta: z.array(z.number().int().min(1).max(31)).optional(),
  data: z.string().optional(),
  textoOriginal: z.string(),
});

const ResponseSchema = z.object({
  eventos: z.array(EventoSchema),
});

const SYSTEM_PROMPT = `Você extrai eventos de RH de anotações livres em português brasileiro.

Regras:
- Retorne APENAS JSON válido, sem markdown, sem explicação.
- Formato: {"eventos": [ {...}, {...} ]}
- Cada evento tem: nome (string), tipo ("falta"|"demissao"|"contratacao"), textoOriginal (string com a linha/trecho que originou o evento).
- Para faltas: inclua "diasFalta" como array de inteiros (dias do mês).
- Para demissão/contratação: inclua "data" em formato ISO (YYYY-MM-DD) se a data aparecer, senão omita.
- Se a mesma pessoa aparecer com múltiplos tipos (ex: falta e demissão), emita um evento por tipo.
- Ignore linhas que não sejam falta, demissão ou contratação.
- Preserve o nome exatamente como escrito pelo usuário (não normalize).

Exemplo de entrada:
"O João Silva faltou dia 2 e 7. A Maria foi demitida em 15/03. Contratamos o Pedro dia 1."

Exemplo de saída:
{"eventos":[
  {"nome":"João Silva","tipo":"falta","diasFalta":[2,7],"textoOriginal":"O João Silva faltou dia 2 e 7."},
  {"nome":"Maria","tipo":"demissao","data":"2026-03-15","textoOriginal":"A Maria foi demitida em 15/03."},
  {"nome":"Pedro","tipo":"contratacao","data":"2026-03-01","textoOriginal":"Contratamos o Pedro dia 1."}
]}`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY não configurada no servidor." },
        { status: 500 },
      );
    }

    const { texto } = (await req.json()) as { texto?: string };
    if (!texto || typeof texto !== "string") {
      return NextResponse.json(
        { error: "Campo 'texto' obrigatório." },
        { status: 400 },
      );
    }
    if (Buffer.byteLength(texto, "utf8") > 50_000) {
      return NextResponse.json(
        { error: "Texto de anotações excede o tamanho máximo permitido." },
        { status: 413 },
      );
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: texto }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Tenta extrair JSON mesmo se o modelo incluir fence (defesa em profundidade)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Resposta do modelo não pôde ser processada." },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = ResponseSchema.parse(parsed);

    return NextResponse.json({
      eventos: validated.eventos as Evento[],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro desconhecido no parsing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
