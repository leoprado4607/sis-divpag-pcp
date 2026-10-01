// Cliente do proxy Gemini. O navegador NÃO conhece a chave de API — ele apenas
// chama o endpoint serverless /api/gemini, que injeta a chave no lado servidor.
export interface GeminiMeta {
  query: string;
  documents: string[];
  userType: string;
}

export interface GeminiPayload {
  model?: string;
  contents: any;
  config?: any;
  _meta?: GeminiMeta;
}

export async function callGemini(payload: GeminiPayload): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = res.status === 413
      ? 'A consulta ficou grande demais para envio. Selecione menos documentos e tente novamente.'
      : `Erro ${res.status} ao consultar a IA.`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* corpo não-JSON */ }
    throw new Error(message);
  }

  const data = await res.json();
  return data?.text || '';
}
