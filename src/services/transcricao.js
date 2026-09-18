// Transcrição de áudio (fala -> texto) para a secretária entender áudios de voz
// do WhatsApp. O Claude não processa áudio direto, então usamos o Whisper via
// Groq (API compatível com a da OpenAI): barato e rápido.
//
// Config: GROQ_API_KEY (obrigatória) e, opcional, GROQ_WHISPER_MODEL
// (padrão whisper-large-v3). Sem a chave, transcrever() devolve null e o webhook
// pede o texto ao cliente.
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
const MAX_BYTES = 20 * 1024 * 1024; // guarda-chuva: áudio de voz é pequeno

function habilitada() {
  return !!process.env.GROQ_API_KEY;
}

// Extensão do arquivo a partir do mime (o Whisper decide o decoder pela extensão).
function extDe(mimeType) {
  const sub = String(mimeType || '').split('/')[1] || 'ogg';
  const clean = sub.split(';')[0].trim(); // "ogg; codecs=opus" -> "ogg"
  const mapa = { mpeg: 'mp3', mp3: 'mp3', mp4: 'm4a', 'x-m4a': 'm4a', m4a: 'm4a', ogg: 'ogg', oga: 'ogg', webm: 'webm', wav: 'wav', 'x-wav': 'wav', amr: 'amr' };
  return mapa[clean] || 'ogg';
}

// Transcreve um Buffer de áudio para texto (pt-BR). Retorna a string ou null.
async function transcrever(buffer, mimeType) {
  if (!habilitada()) {
    console.log('[transcricao] sem GROQ_API_KEY — pulando transcrição.');
    return null;
  }
  if (!buffer || !buffer.length) return null;
  if (buffer.length > MAX_BYTES) {
    console.log('[transcricao] áudio grande demais:', buffer.length, 'bytes');
    return null;
  }
  try {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), `audio.${extDe(mimeType)}`);
    fd.append('model', MODELO);
    fd.append('language', 'pt');
    fd.append('response_format', 'json');
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: fd,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.log('[transcricao] Groq falhou', r.status, t.slice(0, 200));
      return null;
    }
    const j = await r.json();
    const txt = (j && j.text ? String(j.text) : '').trim();
    return txt || null;
  } catch (e) {
    console.log('[transcricao] erro:', e.message);
    return null;
  }
}

module.exports = { transcrever, habilitada };
