const fs = require('fs');
const path = require('path');
const CONTAS_PATH = './data/contas.json';

function garantirArquivo() {
  const dir = path.dirname(CONTAS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONTAS_PATH)) {
    fs.writeFileSync(CONTAS_PATH, JSON.stringify({}, null, 2));
  }
}

const carregarContas = () => {
  garantirArquivo();
  try {
    const raw = fs.readFileSync(CONTAS_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Erro a ler contas.json:', e.message);
    return {};
  }
};

const salvarContas = (data) => {
  garantirArquivo();
  fs.writeFileSync(CONTAS_PATH, JSON.stringify(data, null, 2));
};

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

function idsIguais(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const da = soDigitos(a);
  const db = soDigitos(b);
  if (da && db && (da === db || da.endsWith(db) || db.endsWith(da))) return true;
  return false;
}

const isAdmin = async (sock, from, sender) => {
  try {
    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
    return admins.some(id => idsIguais(id, sender));
  } catch (e) {
    console.error('Erro isAdmin contas:', e.message);
    return false;
  }
};

function parseConta(args) {
  const bruto = (args || []).join(' ').trim();
  if (!bruto) return null;

  let numero = '';
  let nome = '';

  if (bruto.includes('-')) {
    const idx = bruto.search(/[-–—]/);
    numero = soDigitos(bruto.slice(0, idx));
    nome = bruto.slice(idx + 1).trim();
  } else {
    const m = bruto.match(/(\d[\d\s]{6,})\s+(.+)/);
    if (m) {
      numero = soDigitos(m[1]);
      nome = m[2].trim();
    }
  }

  if (!numero || numero.length < 8 || !nome) return null;
  return { numero, nome };
}

module.exports = async (sock, msg, cmd, args) => {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const ctx = { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message };

  if (!from || !String(from).endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '❌ Este comando só funciona em grupos.', mentions: [sender], contextInfo: ctx });
  }

  if (!(await isAdmin(sock, from, sender))) {
    return sock.sendMessage(from, { text: '❌ Só administradores do grupo podem gerir as contas.', mentions: [sender], contextInfo: ctx });
  }

  const contas = carregarContas();
  if (!contas[from]) contas[from] = { mpesa: [], emola: [] };
  if (!Array.isArray(contas[from].mpesa)) contas[from].mpesa = [];
  if (!Array.isArray(contas[from].emola)) contas[from].emola = [];

  console.log('SISTEMA CONTAS:', cmd, args);

  if (cmd === 'addmpesa') {
    const dados = parseConta(args);
    if (!dados) {
      return sock.sendMessage(from, {
        text: '📌 Formato:\n`.addmpesa 852800194-Nome Completo`\nou\n`.addmpesa 852800194 Nome Completo`',
        mentions: [sender],
        contextInfo: ctx
      });
    }
    const jaExiste = contas[from].mpesa.some(c => soDigitos(c.numero) === dados.numero);
    if (jaExiste) {
      return sock.sendMessage(from, { text: `⚠️ Essa M-Pesa já está na lista:\n📱 ${dados.numero}`, mentions: [sender], contextInfo: ctx });
    }
    contas[from].mpesa.push({ numero: dados.numero, nome: dados.nome });
    salvarContas(contas);
    return sock.sendMessage(from, {
      text: `🐊 *LACOSTE* — conta M-Pesa guardada\n📱 *Número:* ${dados.numero}\n👤 *Nome:* ${dados.nome}\n\nAgora os comprovativos para esta conta passam na verificação.`,
      mentions: [sender],
      contextInfo: ctx
    });
  }

  if (cmd === 'addmola') {
    const dados = parseConta(args);
    if (!dados) {
      return sock.sendMessage(from, {
        text: '📌 Formato:\n`.addmola 878339182-Nome Completo`\nou\n`.addmola 878339182 Nome Completo`',
        mentions: [sender],
        contextInfo: ctx
      });
    }
    const jaExiste = contas[from].emola.some(c => soDigitos(c.numero) === dados.numero);
    if (jaExiste) {
      return sock.sendMessage(from, { text: `⚠️ Essa E-Mola já está na lista:\n📱 ${dados.numero}`, mentions: [sender], contextInfo: ctx });
    }
    contas[from].emola.push({ numero: dados.numero, nome: dados.nome });
    salvarContas(contas);
    return sock.sendMessage(from, {
      text: `🐊 *LACOSTE* — conta E-Mola guardada\n📱 *Número:* ${dados.numero}\n👤 *Nome:* ${dados.nome}\n\nAgora os comprovativos para esta conta passam na verificação.`,
      mentions: [sender],
      contextInfo: ctx
    });
  }

  if (cmd === 'contas') {
    if (contas[from].mpesa.length === 0 && contas[from].emola.length === 0) {
      return sock.sendMessage(from, {
        text: '📭 Ainda não há contas neste grupo.\nUsa `.addmpesa` ou `.addmola` para cadastrar.',
        mentions: [sender],
        contextInfo: ctx
      });
    }
    let texto = '🐊 *Contas do grupo — LACOSTE*\n\n';
    if (contas[from].mpesa.length) {
      texto += '📲 *M-PESA*\n' + contas[from].mpesa.map((c, i) => `${i + 1}. ${c.numero} — ${c.nome}`).join('\n') + '\n\n';
    }
    if (contas[from].emola.length) {
      texto += '📲 *E-MOLA*\n' + contas[from].emola.map((c, i) => `${i + 1}. ${c.numero} — ${c.nome}`).join('\n');
    }
    return sock.sendMessage(from, { text: texto.trim(), mentions: [sender], contextInfo: ctx });
  }

  if (cmd === 'delmpesa') {
    const i = parseInt(args[0], 10) - 1;
    if (!contas[from].mpesa[i]) {
      return sock.sendMessage(from, { text: '❌ Conta M-Pesa não encontrada. Vê a lista com `.contas`.', mentions: [sender], contextInfo: ctx });
    }
    const removida = contas[from].mpesa.splice(i, 1)[0];
    salvarContas(contas);
    return sock.sendMessage(from, { text: `🗑️ M-Pesa removida: ${removida.numero} — ${removida.nome}`, mentions: [sender], contextInfo: ctx });
  }

  if (cmd === 'delmola') {
    const i = parseInt(args[0], 10) - 1;
    if (!contas[from].emola[i]) {
      return sock.sendMessage(from, { text: '❌ Conta E-Mola não encontrada. Vê a lista com `.contas`.', mentions: [sender], contextInfo: ctx });
    }
    const removida = contas[from].emola.splice(i, 1)[0];
    salvarContas(contas);
    return sock.sendMessage(from, { text: `🗑️ E-Mola removida: ${removida.numero} — ${removida.nome}`, mentions: [sender], contextInfo: ctx });
  }
};
