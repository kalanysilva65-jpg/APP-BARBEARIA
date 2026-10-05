// Perfil comercial do WhatsApp (foto, sobre, descrição, endereço, e-mail, site)
// editado PELO PAINEL do Cortavo — o número da barbearia vive na conta da Cortavo,
// então o dono não entra no app do WhatsApp nem no Gerenciador da Meta.
//
// Foto, "sobre", descrição etc. NÃO dependem da aprovação do nome de exibição:
// se o nome for recusado, o perfil e a secretária continuam funcionando.
//
// Graph API: GET/POST /{phone_number_id}/whatsapp_business_profile; a foto vai
// pelo Resumable Upload (POST /{app_id}/uploads -> POST /{upload_id} -> handle).
const whatsapp = require('./whatsapp');

const GRAPH = 'https://graph.facebook.com';
const versao = () => process.env.WHATSAPP_API_VERSION || 'v21.0';
const CAMPOS = 'about,address,description,email,profile_picture_url,websites,vertical';

async function contexto(barbeariaId) {
  const { phoneNumberId, token } = await whatsapp.credenciais(barbeariaId);
  if (!phoneNumberId || !token) throw new Error('Conecte o número do WhatsApp primeiro.');
  return { phoneNumberId, token };
}

function erroMeta(j, status) {
  const e = (j && j.error) || {};
  return new Error(String(e.error_user_msg || e.message || 'erro ' + status).slice(0, 200));
}

async function pedir(token, url, opcoes) {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: 'Bearer ' + token, ...((opcoes && opcoes.headers) || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw erroMeta(j, r.status);
  return j;
}

// Perfil atual + situação do nome de exibição.
async function obter(barbeariaId) {
  const { phoneNumberId, token } = await contexto(barbeariaId);
  const base = GRAPH + '/' + versao() + '/' + phoneNumberId;
  const [perfil, numero] = await Promise.all([
    pedir(token, base + '/whatsapp_business_profile?fields=' + CAMPOS),
    pedir(token, base + '?fields=verified_name,name_status,display_phone_number').catch(() => ({})),
  ]);
  const p = (perfil.data && perfil.data[0]) || {};
  return {
    sobre: p.about || '',
    descricao: p.description || '',
    endereco: p.address || '',
    email: p.email || '',
    sites: p.websites || [],
    fotoUrl: p.profile_picture_url || null,
    nome: numero.verified_name || '',
    nomeStatus: numero.name_status || '', // APPROVED | PENDING_REVIEW | DECLINED | NONE...
  };
}

// Confere que é JPEG ou PNG de verdade (a Meta não aceita WebP no perfil).
function tipoDaImagem(buf) {
  if (buf && buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', nome: 'perfil.jpg' };
  if (buf && buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', nome: 'perfil.png' };
  return null;
}

// Envia a foto e devolve o "handle" que o perfil usa.
async function subirFoto(token, buf) {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error('META_APP_ID não configurado no servidor.');
  const t = tipoDaImagem(buf);
  if (!t) throw new Error('Use uma foto JPG ou PNG.');
  if (buf.length > 5 * 1024 * 1024) throw new Error('A foto do perfil pode ter no máximo 5 MB.');
  const sessao = await pedir(token, GRAPH + '/' + versao() + '/' + appId + '/uploads?file_length=' + buf.length + '&file_type=' + encodeURIComponent(t.mime) + '&file_name=' + t.nome, { method: 'POST' });
  if (!sessao.id) throw new Error('A Meta não abriu o envio da foto.');
  const r = await fetch(GRAPH + '/' + versao() + '/' + sessao.id, {
    method: 'POST',
    headers: { Authorization: 'OAuth ' + token, file_offset: '0', 'Content-Type': t.mime },
    body: buf,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.h) throw erroMeta(j, r.status);
  return j.h;
}

const corta = (v, n) => String(v || '').trim().slice(0, n);

// Salva os campos enviados (e a foto, se veio). Campo vazio limpa na Meta.
async function salvar(barbeariaId, campos, fotoBuffer) {
  const { phoneNumberId, token } = await contexto(barbeariaId);
  const corpo = { messaging_product: 'whatsapp' };
  if (campos.sobre !== undefined) corpo.about = corta(campos.sobre, 139) || ' ';
  if (campos.descricao !== undefined) corpo.description = corta(campos.descricao, 512);
  if (campos.endereco !== undefined) corpo.address = corta(campos.endereco, 256);
  if (campos.email !== undefined) {
    const e = corta(campos.email, 128);
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido.');
    corpo.email = e;
  }
  if (campos.site !== undefined) {
    const s = corta(campos.site, 256);
    if (s && !/^https?:\/\//i.test(s)) throw new Error('O site precisa começar com http:// ou https://');
    corpo.websites = s ? [s] : [];
  }
  if (fotoBuffer && fotoBuffer.length) corpo.profile_picture_handle = await subirFoto(token, fotoBuffer);
  await pedir(token, GRAPH + '/' + versao() + '/' + phoneNumberId + '/whatsapp_business_profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return { ok: true };
}

module.exports = { obter, salvar, tipoDaImagem };
