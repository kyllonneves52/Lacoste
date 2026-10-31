// ================= IMPORTS =================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');

const P = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const readline = require('readline');

// ================= CONFIG =================
const SESSIONS_DIR = './sessions';
const activeSockets = new Map();
const pairingSessions = new Map();

// ================= TERMINAL =================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const question = (q) => new Promise(resolve => rl.question(q, resolve));

// ================= MARCA =================
function mostrarMarca() {
  console.log('\n=============================================');
  console.log(' 👨‍💻⚙️ BY: LACOSTE BOT V7 🍷💸 - QR + CODE');
  console.log('=============================================\n');
}

// ================= UTIL =================
function garantirPastaSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}
function getNextSessionName() {
  garantirPastaSessions();
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => d.startsWith('session-'));
  let maior = 0;
  for (const dir of dirs) {
    const numero = parseInt(dir.replace('session-', ''), 10);
    if (!isNaN(numero) && numero > maior) maior = numero;
  }
  return `session-${maior + 1}`;
}
function destruirSocket(sessionPath) {
  const antigo = activeSockets.get(sessionPath);
  if (!antigo) return;
  try { antigo.ev.removeAllListeners(); if (antigo.ws) antigo.ws.close(); } catch {}
  activeSockets.delete(sessionPath);
}

function apagarSessao(sessionPath) {
  const caminho = path.resolve(String(sessionPath || ''));
  const raiz = path.resolve(SESSIONS_DIR);
  if (!caminho.startsWith(raiz + path.sep)) {
    throw new Error('Caminho de sessão inválido.');
  }
  destruirSocket(sessionPath);
  if (fs.existsSync(caminho)) fs.rmSync(caminho, { recursive: true, force: true });
  return true;
}

// ============================================================
// CONECTAR - COM QR E PAIRING
// ============================================================
async function connect(sessionPath, numeroPairing = null, onQR = null) {
  console.log(`Iniciando conexão: ${sessionPath}`);
  garantirPastaSessions();
  destruirSocket(sessionPath);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    keepAliveIntervalMs: 30000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false
  });

  activeSockets.set(sessionPath, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBuffer = await QRCode.toBuffer(qr, { width: 400, margin: 2 });
        sock.qrCodeBuffer = qrBuffer;
        sock.qrCodeRaw = qr;
        if (onQR) await onQR(qrBuffer, qr);
        else console.log(`📷 QR gerado para ${sessionPath} - escaneia no terminal ou espera.qr`);
      } catch (e) { console.log('Erro QR:', e.message); }
    }

    if (!state.creds.registered &&!numeroPairing &&!pairingSessions.get(sessionPath) &&!onQR) {
      pairingSessions.set(sessionPath, true);
      try {
        const Pergunta = await question('\n📱 Digite seu número com DDI (258...)\n> ');
        const Numero = Pergunta.replace(/[^0-9]/g, '');
        if (!Numero) { console.log('❌ Número inválido.'); pairingSessions.delete(sessionPath); return; }
        console.log(`📱 Solicitando código para: ${Numero}`);
        await new Promise(r => setTimeout(r, 2000));
        let codigo = await sock.requestPairingCode(Numero);
        codigo = codigo?.match(/.{1,4}/g)?.join('-') || codigo;
        sock.codigoPareamento = codigo;
        console.log('\n=============================================');
        console.log(`✅ CÓDIGO: ${codigo}`);
        console.log('=============================================\n');
      } catch (error) { console.log('❌ Erro ao gerar código:', error.message); pairingSessions.delete(sessionPath); }
    }

    if (!state.creds.registered && numeroPairing &&!pairingSessions.get(sessionPath)) {
      pairingSessions.set(sessionPath, true);
      try {
        await new Promise(r => setTimeout(r, 2000));
        let codigo = await sock.requestPairingCode(numeroPairing);
        codigo = codigo?.match(/.{1,4}/g)?.join('-') || codigo;
        sock.codigoPareamento = codigo;
        console.log(`✅ Código de parelhamento: ${codigo}`);
      } catch (error) { console.log('❌ Erro ao gerar código:', error.message); pairingSessions.delete(sessionPath); }
    }

    if (connection === 'open') {
      console.log(`✅ Conectado: ${sessionPath}`);
      pairingSessions.delete(sessionPath);
      try {
        const { processarMensagem } = require('./mensagens');
        const { handleGroupEvents } = require('./groupEvents');
        sock.ev.on('group-participants.update', async (u) => { try { await handleGroupEvents(sock, u); } catch(e){ console.error(e); } });
        sock.ev.on('messages.upsert', async ({ messages }) => {
          // Um evento pode trazer várias mensagens. Processar só messages[0]
          // fazia o bot parecer "calado" quando chegavam várias de uma vez.
          for (const msg of (messages || [])) {
            try {
              if (!msg || msg.key?.remoteJid === 'status@broadcast') continue;
              await processarMensagem(sock, msg);
            } catch(err){
              console.error('❌ Erro isolado ao processar mensagem:', err?.stack || err);
            }
          }
        });
        console.log('Módulos carregados. Bot online!');
      } catch(error){ console.error('Erro ao carregar módulos:', error); }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log('DEBUG CLOSE:', lastDisconnect?.error?.message);
      destruirSocket(sessionPath);
      pairingSessions.delete(sessionPath);
      if (statusCode === DisconnectReason.loggedOut || statusCode === 405) {
        console.log(`❌ Sessão inválida (${sessionPath}). Apaga e conecta de novo.`);
      } else {
        console.log(`🔁 Reconectando (${sessionPath})...`);
        setTimeout(() => { connect(sessionPath, numeroPairing, onQR).catch(console.error); }, 4000);
      }
    }
  });
  return sock;
}

async function conectarNovoNumero(numero) {
  try {
    garantirPastaSessions();
    numero = String(numero || '').replace(/[^0-9]/g, '');
    if (!numero ||!numero.startsWith('258') || numero.length < 11) return { ok: false, erro: 'Número inválido. Use com DDI 258...' };
    const nome = getNextSessionName();
    const caminho = `${SESSIONS_DIR}/${nome}`;
    console.log(`📱 Criando nova sessão: ${nome}`);
    const sock = await connect(caminho, numero);
    let tentativas = 0;
    while (!sock.codigoPareamento && tentativas < 30) { await new Promise(r => setTimeout(r, 500)); tentativas++; }
    if (!sock.codigoPareamento) return { ok: false, erro: 'Não foi possível gerar o código.' };
    return { ok: true, codigo: sock.codigoPareamento, numero, sessao: nome };
  } catch (error) { return { ok: false, erro: error.message }; }
}

async function conectarViaQR(sockPrincipal, grupoAlvo, sender) {
  try {
    garantirPastaSessions();
    const nome = `session-${Date.now()}_qr`;
    const caminho = `${SESSIONS_DIR}/${nome}`;
    let qrEnviado = false;

    const onQR = async (qrBuffer) => {
      if (qrEnviado) return;
      qrEnviado = true;
      await sockPrincipal.sendMessage(grupoAlvo, {
        image: qrBuffer,
        caption: `🐊 *BOT LACOSTE - QR CODE*\n\n💎 Escaneia para conectar\n⏰ Expira em 20s\n\nObrigado por confiar @${sender.split('@')[0]} 🍷🗿`,
        mentions: [sender]
      });
    };

    const sock = await connect(caminho, null, onQR);
    sock.ev.on('connection.update', async (u) => {
      if (u.connection === 'open') {
        await sockPrincipal.sendMessage(grupoAlvo, {
          text: `✅ *Conectado com sucesso via QR!*\n📁 Sessão: ${nome}\n\nObrigado @${sender.split('@')[0]} 🍷`,
          mentions: [sender]
        });
      }
    });
    return { ok: true, sessao: nome };
  } catch (e) { return { ok: false, erro: e.message }; }
}

async function iniciar() {
  garantirPastaSessions();
  mostrarMarca();
  const sessoesExistentes = fs.readdirSync(SESSIONS_DIR).filter(d => d.startsWith('session-'));
  let socks = [];
  if (sessoesExistentes.length === 0) {
    console.log('Nenhuma sessão encontrada.');
    const nome = getNextSessionName();
    const sock = await connect(`${SESSIONS_DIR}/${nome}`);
    if (sock) socks.push(sock);
  } else {
    console.log(`Encontradas ${sessoesExistentes.length} sessão(ões).`);
    for (const s of sessoesExistentes) {
      try { const sock = await connect(`${SESSIONS_DIR}/${s}`); if (sock) socks.push(sock); } catch(e){ console.error(e); }
    }
  }
  return socks;
}

module.exports = { iniciar, connect, conectarNovoNumero, conectarViaQR, activeSockets, destruirSocket, apagarSessao };