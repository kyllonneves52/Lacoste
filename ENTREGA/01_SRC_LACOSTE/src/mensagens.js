const fs = require('fs');
const prefix = '.';
const { handleCommand } = require('./comandos');
const sistemaVendas = require('./sistemaVendas.js'); // <- ADICIONA ESSA

// ====== CONFIG ======
const pathNano         = './config/nanoativar.json';
const pathGatilhos     = './config/gatilhos.json';
const pathAntilink     = './config/antilink.json';
const pathAntifoto     = './config/antifoto.json';
const pathDetector     = './config/detector.json';
const pathComprovantes = './config/comprovantes.json';

// ====== DATA ======
const pathContas       = './data/contas.json';
const pathAntivideo    = './data/antivideo.json';
const pathAntiaudio    = './data/antiaudio.json';
const pathAntistatus   = './data/antistatus.json';
const pathDias         = './data/dias.json';

// Garante que as pastas existam
if (!fs.existsSync('./config')) fs.mkdirSync('./config', { recursive: true });
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });


// Função para carregar os dados do participante
function ctx(msg, sender) {
  return msg?.key?.id && msg?.message
    ? {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    : undefined;
}

// Função para carregar horas do bot
function getDataHoraBot() {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Maputo" })
  );

  return {
    data: agora.toLocaleDateString("pt-PT"),
    hora: agora.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
}

//  Função para carregar dias 
function carregarDias() {
  if (!fs.existsSync(pathDias)) {
    fs.writeFileSync(pathDias, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(pathDias));
}

function salvarDias(data) {
  fs.writeFileSync(pathDias, JSON.stringify(data, null, 2));
}

// Função para carregar antistatus
function carregarAntistatus() {
  if (!fs.existsSync(pathAntistatus)) {
    fs.writeFileSync(pathAntistatus, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(pathAntistatus));
}

function salvarAntistatus(data) {
  fs.writeFileSync(pathAntistatus, JSON.stringify(data, null, 2));
}

// Função para carregar antiaudio
function carregarAntiaudio() {
  if (!fs.existsSync(pathAntiaudio)) {
    fs.writeFileSync(pathAntiaudio, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(pathAntiaudio));
}

function salvarAntiaudio(data) {
  fs.writeFileSync(pathAntiaudio, JSON.stringify(data, null, 2));
}

// Carregar antivideo 
function carregarAntivideo() {
  if (!fs.existsSync(pathAntivideo)) return {};
  return JSON.parse(fs.readFileSync(pathAntivideo));
}

function salvarAntivideo(dados) {
  fs.writeFileSync(pathAntivideo, JSON.stringify(dados, null, 2));
}

// Carregar contas
function carregarContas() {
  if (!fs.existsSync(pathContas)) {
    fs.writeFileSync(pathContas, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(pathContas));
}

// Carrega JSON genérico
function carregarJSON(path) {
  try {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

// Função para salvar comprovantes 
function carregarComprovantes() {
  try {
    if (!fs.existsSync(pathComprovantes)) return {};
    return JSON.parse(fs.readFileSync(pathComprovantes, 'utf-8'));
  } catch {
    return {};
  }
}

function salvarComprovantes(dados) {
  fs.writeFileSync(
    pathComprovantes,
    JSON.stringify(dados, null, 2),
    'utf-8'
  );
}


// Carrega o detector.json
function carregarDetector() {
  try {
    if (!fs.existsSync(pathDetector)) return {};
    return JSON.parse(fs.readFileSync(pathDetector, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Detecta links
 */
function contemLink(texto) {
  const regex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me)/i;
  return regex.test(texto);
}

function getDataHoraBot(msg) {
  let ts;

  if (msg && msg.messageTimestamp) {
    ts = Number(msg.messageTimestamp) * 1000;
  } else {
    ts = Date.now();
  }

  const d = new Date(ts);

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();

  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return {
    data: `${dia}/${mes}/${ano}`,
    hora: `${hora}:${min}`
  };
}

/**
 * Processa mensagens
 */
async function processarMensagem(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  const sender = msg.key.participant || from;
  const isGroup = from.endsWith('@g.us');

// ========= VERIFICAÇÃO DE DIAS ============
  const comandoGestaoLivre =
    isGroup &&
    /^\.?\s*(ativar|meuid|broadcast|dispositivos?|licencas?(?:pendentes)?|aprovar|rejeitar|associar(?:dispositivo)?|desassociar(?:dispositivo)?|statusdispositivo|gruposdispositivo)\b/i.test(
      String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || '')
    );

if (isGroup) {
  const diasData = carregarDias();
  const grupoAtivo = diasData[from];

  const agora = Date.now();
  // A validade verdadeira vem sempre do timestamp fim + dias positivos.
  // Não confiamos num contador antigo/stale de diasRestantes.
  const expirado = !grupoAtivo ||
    Number(grupoAtivo.fim || 0) <= agora ||
    Number(grupoAtivo.dias || 0) <= 0;

  if (expirado && !comandoGestaoLivre) {
    await sock.sendMessage(from, {
      text:
`⚠️ *PLANO DO BOT ACABADO!* 🚫
Este grupo não tem plano ou expirou🍷🐊.

📞 contacte o gestor do bot para renovar o plano, obrigado 🔍.`,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key?.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

    return;
  }
}

  // ===== TEXTO =====
  let texto = '';
  if (msg.message.conversation) {
    texto = msg.message.conversation;
  } else if (msg.message.extendedTextMessage?.text) {
    texto = msg.message.extendedTextMessage.text;
  } else if (msg.message.imageMessage?.caption) {
    texto = msg.message.imageMessage.caption;
  }

  const detector = carregarDetector();
  const filtroAtivo = detector[from] === true;
  let imagemComprovante = false;

  // ================= COMPROVATIVO POR FOTO =================
  // Fotos não são processadas como comprovativos.
  // O comprovativo deve ser enviado em texto.
  if (msg.message.imageMessage) {
    imagemComprovante = true;
    if (filtroAtivo) {
      await sock.sendMessage(from, {
        text: `🐊 *LACOSTE*\nNão verifico comprovativo por foto.\nManda o comprovativo em *texto* para o pagamento ser confirmado.`,
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    }
  }

// ============== COMPROVATIVOS =================

if (filtroAtivo && texto) {

    const reMpesa =
    /Confirmado\s+([A-Za-z0-9]+).*?Transferiste\s+([\d.,]+)MT.*?para\s+(\d+)\s*-\s*([A-Za-z\s]+).*?aos\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*as\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i;

  const reEmola =
    /ID da transac(?:a|ã)o\s+([A-Za-z0-9.\-]+).*?Transferiste\s+([\d.,]+)MT.*?conta\s+(\d+),?\s*nome[:\s]*([A-Za-z\s]+).*?as\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*de\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;


  let resultado = null;

  let m = texto.match(reMpesa);
  if (m) {
    resultado = {
      codigo: m[1],
      valor: m[2],
      numeroDestinatario: m[3],
      nome: m[4].trim()
    };
  } else {
    m = texto.match(reEmola);
    if (m) {
      resultado = {
        codigo: m[1],
        valor: m[2],
        numeroDestinatario: m[3],
        nome: m[4].trim()
      };
    }
  }

  if (resultado) {

    const contas = carregarContas();

    if (!contas[from] || (
      (!contas[from].mpesa || contas[from].mpesa.length === 0) &&
      (!contas[from].emola || contas[from].emola.length === 0)
    )) {

      const msgSemContas =
`🐊 *LACOSTE* recusou o comprovativo

Ainda não há contas M-Pesa / E-Mola neste grupo.

Admin, cadastra primeiro:
• \`.addmpesa 84xxxxxxx-Nome\`
• \`.addmola 87xxxxxxx-Nome\`

Depois manda o comprovativo outra vez em *texto*.`;

      await sock.sendMessage(from, {
        text: msgSemContas,
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });

      return;
    }

    const contasGrupo = [
      ...(contas[from].mpesa || []),
      ...(contas[from].emola || [])
    ];

    const normalizaNum = (n) => String(n || '').replace(/\D/g, '');
    const normalizaNome = (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const contaExiste = contasGrupo.find(c => {
      const numOk = normalizaNum(c.numero) === normalizaNum(resultado.numeroDestinatario)
        || normalizaNum(c.numero).endsWith(normalizaNum(resultado.numeroDestinatario))
        || normalizaNum(resultado.numeroDestinatario).endsWith(normalizaNum(c.numero));
      const nomeOk = normalizaNome(c.nome) === normalizaNome(resultado.nome)
        || normalizaNome(c.nome).includes(normalizaNome(resultado.nome))
        || normalizaNome(resultado.nome).includes(normalizaNome(c.nome));
      return numOk && nomeOk;
    });

    if (!contaExiste) {

      const msgContaInvalida =
`🐊 *LACOSTE* recusou o comprovativo

Os dados não batem com as contas deste grupo.
☎️ Número no comprovativo: ${resultado.numeroDestinatario}
👤 Nome no comprovativo: ${resultado.nome}

Só passam pagamentos feitos para contas já registadas com \`.addmpesa\` / \`.addmola\`.
Confere a lista com \`.contas\`.`;

      await sock.sendMessage(from, {
        text: msgContaInvalida,
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });

      return;
    }

    let numeroReceber = null;
    const linhas = texto.split("\n").map(l => l.trim());

    for (let i = linhas.length - 1; i >= 0; i--) {
      if (/^(84|85)\d{6,7}$/.test(linhas[i])) {
        numeroReceber = linhas[i];
        break;
      }
    }

    const { data, hora } = getDataHoraBot();

    const comprovantes = carregarComprovantes();
    if (!comprovantes[from]) comprovantes[from] = [];

const comprovanteExistente = comprovantes[from].find(
  c => c.codigo === resultado.codigo
);

if (comprovanteExistente) {
  const remetenteOriginal = comprovanteExistente.enviado_por;
const dataOriginal = comprovanteExistente.data_recebido;
const horaOriginal = comprovanteExistente.hora_recebido;

  const mensagemDuplicado =
`❌ *Comprovante já registrado!* 🚫

🔑 *Chave:* \`${resultado.codigo}\`
📅 *Registrado em:* ${dataOriginal} às ${horaOriginal}
👤 *Remetente:* @${remetenteOriginal.split("@")[0]}

⚠️ Este comprovante já foi utilizado e não pode ser processado novamente.`;

  await sock.sendMessage(from, {
    text: mensagemDuplicado,
    mentions: [remetenteOriginal],
    contextInfo: {
      stanzaId: msg.key.id,
      participant: sender,
      quotedMessage: msg.message
    }
  });

  return;
}

    comprovantes[from].push({
      codigo: resultado.codigo,
      valor: resultado.valor,
      nome_destinatario: resultado.nome,
      numero_destinatario: resultado.numeroDestinatario,
      numero_receber: numeroReceber || null,
      enviado_por: sender,
      data_recebido: data,
      hora_recebido: hora,
      timestamp: Date.now()
    });

    salvarComprovantes(comprovantes);

    let mensagem =
`🐊 *Pagamento confirmado — LACOSTE* ✅

🔑 Chave: \`${resultado.codigo}\`
💰 Valor: *${resultado.valor} MT*
👤 Destino: ${resultado.nome}
📱 Conta: ${resultado.numeroDestinatario}
🕒 ${data} às ${hora}`;

    if (numeroReceber) {
      mensagem += `\n🧿 *Número a receber:* ${numeroReceber}`;
    }

    mensagem += `

Obrigado. O comprovativo ficou registado neste grupo.`;

    await sock.sendMessage(from, {
      text: mensagem,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

    return;
  }
}

  console.log(`
📩 Mensagem recebida de: ${from}
🔑 id: ${from}
👤 Remetente: ${sender}
✉️ Conteúdo: ${texto || '[MÍDIA]'}
───────────────────────────────
`);

  const nano = carregarJSON(pathNano);
  const gatilhos = carregarJSON(pathGatilhos);
  const antilink = carregarJSON(pathAntilink);
  const antifoto = carregarJSON(pathAntifoto);

  const nanoStatus = nano[from] === 'on';
  const antilinkStatus = antilink[from] === true;
  const antifotoStatus = antifoto[from] === true;

  // ================= ANTIFOTO =================
  if (isGroup && antifotoStatus && msg.message.imageMessage) {
    console.log(`
🖼️ ANTIFOTO DETECTADO 
📍 Grupo: ${from}
👤 Usuário: ${sender}
───────────────────────────────
`);

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      try {
        await sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            fromMe: false,
            id: msg.key.id,
            participant: sender
          }
        });

        await sock.sendMessage(from, {
          text: `🐊 @${sender.split("@")[0]}, fotos estão bloqueadas neste grupo.\nManda comprovativo em *texto*.`,
          mentions: [sender]
        });

        return;
      } catch (err) {
        console.error('Erro no antifoto:', err);
      }
    }
  }

// ================= ANTIVIDEO =================
if (isGroup) {
  try {
    const antivideoData = carregarAntivideo();
    const antivideoStatus = antivideoData[from] === true;

    if (
      antivideoStatus &&
      (
        msg.message?.videoMessage ||
        (msg.message?.documentMessage &&
         msg.message.documentMessage.mimetype?.startsWith('video/'))
      )
    ) {

      console.log(`
🎥 ANTIVIDEO DETECTADO
📍 Grupo: ${from}
👤 Usuário: ${sender}
───────────────────────────────
`);

      const metadata = await sock.groupMetadata(from);
      const admins = metadata.participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);

      const senderLid = msg.key.participant || msg.key.remoteJid;

      if (admins.includes(senderLid)) return;

      await sock.sendMessage(from, {
        delete: {
          remoteJid: from,
          fromMe: false,
          id: msg.key.id,
          participant: senderLid
        }
      });

      await sock.sendMessage(from, {
        text:
`🚫 *VÍDEO BLOQUEADO* 📵

👤 @${senderLid.split('@')[0]}
❌ O envio de *vídeos* não é permitido neste grupo.

⚠️ Caso precise enviar um vídeo,
entre em contacto com um *administrador*.

🤖 Sistema de segurança ativo.`,
        mentions: [senderLid]
      });

      return;
    }

  } catch (err) {
    console.error('Erro no antivideo:', err);
  }
}

// ================= ANTIAUDIO =================
if (isGroup) {
  try {
    const antiaudioData = carregarAntiaudio();
    const antiaudioStatus = antiaudioData[from] === true;

    if (antiaudioStatus && msg.message?.audioMessage) {

      console.log(`
🔊 ANTIAUDIO DETECTADO
📍 Grupo: ${from}
👤 Usuário: ${sender}
───────────────────────────────
`);

      const metadata = await sock.groupMetadata(from);
      const admins = metadata.participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);

      const senderLid = msg.key.participant || msg.key.remoteJid;

       if (admins.includes(senderLid)) return;

      await sock.sendMessage(from, {
        delete: {
          remoteJid: from,
          fromMe: false,
          id: msg.key.id,
          participant: senderLid
        }
      });

      await sock.sendMessage(from, {
        text:
`🔊🚫 *ÁUDIO BLOQUEADO*

👤 @${senderLid.split('@')[0]}
❌ O envio de *áudios* não é permitido neste grupo.

⚠️ Caso precise enviar um áudio,
fale com um *administrador*.

🤖 Sistema de segurança ativo.`,
        mentions: [senderLid]
      });

      return;
    }

  } catch (err) {
    console.error('Erro no antiaudio:', err);
  }
}

// ================= ANTISTATUS =================
// Só age em menções/divulgação de status do grupo.
// NÃO faz return em mensagens normais — senão o bot deixa de responder
// a TODOS os comandos (incluindo .antistatus off) e fica "preso".
if (isGroup) {
  try {
    const antistatusData = carregarAntistatus();
    const antistatusStatus = antistatusData[from] === true;

    if (antistatusStatus) {
      const textoStatus =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '';

      const textoLower = String(textoStatus || '').toLowerCase();
      const contemGrupo =
        textoLower.includes('grupo') ||
        textoLower.includes('whatsapp.com/chat') ||
        textoLower.includes('wa.me') ||
        textoLower.includes('chat.whatsapp.com');

      // Só processa se parecer menção de status; senão continua o fluxo normal
      if (textoStatus && contemGrupo) {
        const metadata = await sock.groupMetadata(from);
        const admins = metadata.participants
          .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
          .flatMap(p => [p?.id, p?.lid, p?.jid, p?.phoneNumber, p?.pn, p?.phone, p?.user])
          .filter(Boolean)
          .map(String);

        const senderLid = msg.key.participant || msg.key.remoteJid || sender;
        const senderBase = String(senderLid || '').split('@')[0];
        const isAdmin = admins.some(
          id => id === senderLid || String(id).split('@')[0] === senderBase
        );

        if (!isAdmin) {
          console.log(`
📵 ANTISTATUS DETECTADO
📍 Grupo: ${from}
👤 Usuário: ${senderLid}
───────────────────────────────
`);

          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: msg.key.id,
              participant: senderLid
            }
          });

          await sock.sendMessage(from, {
            text:
`🚫📵 *MENÇÃO DE STATUS BLOQUEADA*

👤 @${senderBase}
❌ Não é permitido mencionar ou divulgar *status* relacionados a este grupo.

⚠️ Respeite as regras do grupo.
🤖 Sistema de proteção ativo.`,
            mentions: [senderLid]
          });

          return; // só aqui: status apagado, não processar mais esta mensagem
        }
      }
    }

  } catch (err) {
    console.error('Erro no antistatus:', err);
  }
}

  // ================= ANTILINK =================
  if (isGroup && antilinkStatus && texto && contemLink(texto)) {
    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin)
      .flatMap(p => [p?.id, p?.lid, p?.jid, p?.phoneNumber, p?.pn, p?.phone, p?.user])
      .filter(Boolean)
      .map(String);
    const senderBase = String(sender || '').split('@')[0];
    const senderIsAdmin = admins.some(id => id === sender || id.split('@')[0] === senderBase);

    if (!senderIsAdmin) {
      try {
        await sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            fromMe: false,
            id: msg.key.id,
            participant: sender
          }
        });

        await sock.sendMessage(from, {
          text: `🚫 Membro @${sender.split('@')[0]} removido por enviar link.\n\n💡 *Links não são permitidos neste grupo.*`,
          mentions: [sender]
        });

        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        return;
      } catch (err) {
        console.error('Erro no antilink:', err);
      }
    }
  }

  // ================= COMANDOS =================

const ehComprovativo =
  texto &&
  (
    texto.toLowerCase().includes('transferiste') ||
    texto.toLowerCase().includes('montante')
  );

const ehNumero =
  texto &&
  /^\.?8\d{8}$/.test(texto.trim());

if (
  texto &&
  (
    texto.startsWith(prefix) ||
    ehComprovativo ||
    ehNumero
  )
) {

  let commandBody = texto;

  // remove ponto só dos comandos
  if (texto.startsWith(prefix)) {
    commandBody =
      texto.slice(prefix.length).trim();
  }

  await handleCommand(
    sock,
    {
      from,
      sender,
      msg,
      texto,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key?.id,
        participant: sender,
        quotedMessage: msg.message
      }
    },
    commandBody
  );
}

// ================= ASSISTENTE IA =================
else if (texto && !texto.startsWith('.') && !imagemComprovante) {
  const iaRespondeu = await sistemaVendas.processarAssistenteIA(
    sock, { from, sender, msg, texto }, texto
  );

  if (iaRespondeu) return;

  // ================= GATILHOS =================
  if (gatilhos[from]?.[texto.toLowerCase()] && nanoStatus) {

    let resposta = gatilhos[from][texto.toLowerCase()];
    let mentions = [];

    if (resposta.includes('@user')) {
      resposta = resposta.replace(/@user/gi, `@${sender.split('@')[0]}`);
      mentions.push(sender);
    }

    await sock.sendMessage(from, {
      text: resposta,
      mentions,
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }
}
}

module.exports = { processarMensagem };