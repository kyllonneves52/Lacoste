/**
 * comandos_novos.js — Lacoste
 * Novos comandos e utilitários pedidos (libertar, resetar, limites, consultar,
 * cancelar operação pendente, fecharlimite, gestores de aluguel).
 * Isolado para não quebrar o núcleo de comandos.js.
 */
const fs = require('fs');
const path = require('path');
const sistemaVendas = require('./sistemaVendas.js');

const DATA = './data';
const CONFIG = './config';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(DATA);
ensureDir(CONFIG);

const pathPendentes = path.join(DATA, 'operacoes_pendentes.json');
const pathFecharLimite = path.join(DATA, 'fechar_limite.json');
const pathGestoresAluguel = path.join(DATA, 'gestores_aluguel.json');
const pathLucrosTabela = path.join(CONFIG, 'lucros_tabela.json');
const pathLucrosDiario = path.join(DATA, 'lucros_diario.json');

function lerJSON(p, def = {}) {
  try {
    if (!fs.existsSync(p)) return def;
    return JSON.parse(fs.readFileSync(p, 'utf8') || JSON.stringify(def));
  } catch {
    return def;
  }
}
function salvarJSON(p, dados) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(dados, null, 2));
}

// ---------- Operações pendentes (pagamento → pedir número) ----------
function carregarPendentes() {
  return lerJSON(pathPendentes, {});
}
function salvarPendentes(d) {
  salvarJSON(pathPendentes, d);
}

/** Grava operação pendente após pagamento detetado sem número */
function registarPendente(groupId, key, dados) {
  const all = carregarPendentes();
  if (!all[groupId]) all[groupId] = {};
  all[groupId][key] = {
    ...dados,
    criadoEm: new Date().toISOString()
  };
  salvarPendentes(all);
}

/** Remove / cancela operação (ex: .cancelar em reply) */
function cancelarPendente(groupId, key) {
  const all = carregarPendentes();
  if (all[groupId] && all[groupId][key]) {
    delete all[groupId][key];
    if (Object.keys(all[groupId]).length === 0) delete all[groupId];
    salvarPendentes(all);
    return true;
  }
  return false;
}

function obterPendente(groupId, key) {
  const all = carregarPendentes();
  return all[groupId]?.[key] || null;
}

// ---------- Fechar limite ----------
function carregarFecharLimite() {
  return lerJSON(pathFecharLimite, {});
}
function salvarFecharLimite(d) {
  salvarJSON(pathFecharLimite, d);
}

// ---------- Gestores aluguel ----------
function carregarGestoresAluguel() {
  return lerJSON(pathGestoresAluguel, { gestores: {} });
}
function salvarGestoresAluguel(d) {
  salvarJSON(pathGestoresAluguel, d);
}

function normalizarNumeroSimples(n) {
  if (!n) return null;
  let s = String(n).replace(/\D/g, '');
  if (s.startsWith('0')) s = '258' + s.slice(1);
  if (!s.startsWith('258') && s.length >= 9) s = '258' + s;
  return s;
}

// ---------- Lucros (base) ----------
function carregarTabelaLucros() {
  return lerJSON(pathLucrosTabela, { itens: [] });
}
function salvarTabelaLucros(d) {
  salvarJSON(pathLucrosTabela, d);
}
function carregarLucrosDiario() {
  return lerJSON(pathLucrosDiario, {});
}
function salvarLucrosDiario(d) {
  salvarJSON(pathLucrosDiario, d);
}

function registarLucroPedido({ mb, grupo, ref, valorMt }) {
  const tabela = carregarTabelaLucros();
  const item = (tabela.itens || []).find((x) => Number(x.mb) === Number(mb));
  const lucro = item ? Number(item.lucroMt || 0) : 0;
  if (!lucro) return null;

  const agora = new Date();
  // Hora Moçambique UTC+2
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const moz = new Date(utc + 2 * 3600000);
  const dia = moz.toISOString().split('T')[0];
  const hora = moz.toTimeString().slice(0, 8);

  const diarios = carregarLucrosDiario();
  if (!diarios[dia]) diarios[dia] = { total: 0, entradas: [] };
  diarios[dia].total = Number(diarios[dia].total || 0) + lucro;
  diarios[dia].entradas.push({
    hora,
    mb: Number(mb),
    lucroMt: lucro,
    grupo: grupo || '',
    ref: ref || '',
    valorMt: valorMt || null
  });
  salvarLucrosDiario(diarios);
  return { lucro, dia, hora, totalDia: diarios[dia].total };
}

/**
 * Processa os novos comandos.
 * Devolve true se tratou o comando (para o caller fazer return).
 */
async function processarComandosNovos(ctx) {
  const {
    sock,
    from,
    sender,
    msg,
    comando,
    args,
    raw,
    isGroup,
    ehGestor,
    ehAdmGrupo
  } = ctx;

  // ---------- .cancelar — cancela SOMENTE o pedido de número deste remetente ----------
  // Se não houver pagamento aguardando número, deixa o comando original do sistema
  // (cancelamento de pedido da fila) tratar .cancelar 1 / .cancelar ID.
  if (comando === 'cancelar' && !(args && args.length)) {
    global.pendentesEnvio = global.pendentesEnvio || {};
    const pendente = global.pendentesEnvio[sender];
    if (pendente && (!pendente.from || pendente.from === from)) {
      delete global.pendentesEnvio[sender];
      let servidor = '';
      if (pendente.pedidoId && typeof sistemaVendas.cancelarPedidoServidor === 'function') {
        try {
          await sistemaVendas.cancelarPedidoServidor(pendente.pedidoId, from);
          servidor = '\n✅ Referência cancelada também no servidor.';
        } catch (e) {
          servidor = `\n⚠️ Não foi possível confirmar cancelamento no servidor: ${e.message}`;
        }
      }
      await sock.sendMessage(from, { text:
        '✅ *OPERAÇÃO CANCELADA*\n━━━━━━━━━━━━━━━━━━\n' +
        `Referência: *${pendente.referencia || pendente.pedidoId || '—'}*\n` +
        'O número enviado depois não será associado a este pagamento.' + servidor
      });
      return true;
    }
    // Não interceptar .cancelar da fila de transferências.
    return false;
  }

  // ---------- .libertar — pede ao sistema para libertar / puxar pedidos da API ----------
  if (comando === 'libertar') {
    if (!ehGestor && !ehAdmGrupo) {
      await sock.sendMessage(from, { text: '❌ Apenas ADM do grupo ou gestor Lacoste.' });
      return true;
    }
    try {
      // Usa endpoints existentes de fila/pedidos quando disponíveis
      let texto = '🔓 *LIBERTAR PEDIDOS*\n━━━━━━━━━━━━━━━━━━\n';
      if (typeof sistemaVendas.listarFilaPedidos === 'function') {
        const r = await sistemaVendas.listarFilaPedidos(from);
        const lista = r?.pedidos || r?.fila || [];
        if (!lista.length) {
          texto += 'Nenhum pedido pendente na API para este contexto.\n';
        } else {
          lista.slice(0, 15).forEach((p, i) => {
            texto += `${i + 1}. ${p.id || p.ref || '—'} | ${p.mb || p.quantidade || ''} | ${p.status || ''}\n`;
          });
        }
      } else if (typeof sistemaVendas.apiPost === 'function') {
        const r = await sistemaVendas.apiPost('/api/bot/pedidos/fila', { grupo: from });
        texto += JSON.stringify(r, null, 2).slice(0, 1500);
      } else {
        texto +=
          'Pedido de libertação registado.\n' +
          'O app deve consultar a fila da API (mesmo fluxo do envio manual).\n' +
          'Se a rota de fila já estiver ativa no hosting, os pedidos aparecerão no app.';
      }
      texto += '\n━━━━━━━━━━━━━━━━━━\nUse no app a secção de pedidos / sincronizar.';
      await sock.sendMessage(from, { text: texto });
    } catch (e) {
      await sock.sendMessage(from, { text: `❌ Erro ao libertar: ${e.message}` });
    }
    return true;
  }

  // ---------- .resetar — reset dos contadores locais dos dois SIMs via FCM ----------
  if (comando === 'resetar') {
    if (!ehGestor) {
      await sock.sendMessage(from, { text: '❌ Exclusivo gestores Lacoste.' });
      return true;
    }
    try {
      const r = await sistemaVendas.resetarLimitesDispositivo(from);
      await sock.sendMessage(from, { text: '✅ *RESET CONFIRMADO PELO DISPOSITIVO*\n━━━━━━━━━━━━━━━━━━\n' + (r.texto || r.message || 'Contadores locais SIM1/SIM2 reiniciados.') });
    } catch (e) {
      await sock.sendMessage(from, { text: `❌ Não foi possível resetar: ${e.message}` });
    }
    return true;
  }

  // ---------- .limites — lê contadores do Lacoste Auto associado ----------
  if (comando === 'limites') {
    if (!ehGestor && !ehAdmGrupo) {
      await sock.sendMessage(from, { text: '❌ Apenas ADM ou gestor.' });
      return true;
    }
    try {
      const r = await sistemaVendas.consultarLimites(from);
      const cards = r?.cartoes || [];
      let t = '📊 *LIMITES DE TRANSFERÊNCIA POR SIM*\n━━━━━━━━━━━━━━━━━━\n';
      if (!cards.length) t += r.texto || 'O dispositivo não devolveu os contadores.';
      else cards.forEach(c => { t += `SIM${c.sim}: ${c.usadas} usadas · ${c.restantes}/${c.maximo} restantes\n`; });
      await sock.sendMessage(from, { text: t });
    } catch (e) {
      await sock.sendMessage(from, { text: `❌ Não foi possível consultar limites: ${e.message}` });
    }
    return true;
  }

  // ---------- .consultar [1|2] — consulta USSD remota ----------
  if (comando === 'consultar') {
    if (!ehGestor && !ehAdmGrupo) {
      await sock.sendMessage(from, { text: '❌ Apenas ADM ou gestor.' });
      return true;
    }
    const sim = Number(args[0] || 0);
    if (![0, 1, 2].includes(sim)) {
      await sock.sendMessage(from, { text: 'Use .consultar (ambos), .consultar 1 ou .consultar 2.' });
      return true;
    }
    try {
      const r = await sistemaVendas.consultarSaldoMb(from, sim);
      await sock.sendMessage(from, { text: '📶 *CONSULTA USSD CONCLUÍDA*\n━━━━━━━━━━━━━━━━━━\n' + (r.texto || JSON.stringify(r, null, 2)) });
    } catch (e) {
      await sock.sendMessage(from, { text: `❌ Consulta falhou: ${e.message}` });
    }
    return true;
  }

  // ---------- .fecharlimite on|off ----------
  if (comando === 'fecharlimite' || comando === 'fechar_limite') {
    if (!ehGestor && !ehAdmGrupo) {
      await sock.sendMessage(from, { text: '❌ Apenas ADM ou gestor.' });
      return true;
    }
    if (!isGroup) {
      await sock.sendMessage(from, { text: '❌ Use dentro do grupo.' });
      return true;
    }
    const opt = (args[0] || '').toLowerCase();
    const cfg = carregarFecharLimite();
    if (opt === 'on' || opt === 'ligar' || opt === '1') {
      cfg[from] = { ativo: true, atualizado: new Date().toISOString(), por: sender };
      salvarFecharLimite(cfg);
      await sock.sendMessage(from, {
        text:
          '✅ *.fecharlimite* ATIVO neste grupo.\n' +
          'Quando o app reportar fim de limite nos cartões, o bot fecha o grupo automaticamente.'
      });
    } else if (opt === 'off' || opt === 'desligar' || opt === '0') {
      cfg[from] = { ativo: false, atualizado: new Date().toISOString(), por: sender };
      salvarFecharLimite(cfg);
      await sock.sendMessage(from, { text: '⛔ *.fecharlimite* DESATIVADO neste grupo.' });
    } else {
      const st = cfg[from]?.ativo ? 'ATIVO ✅' : 'DESATIVADO ⛔';
      await sock.sendMessage(from, {
        text: `⚙️ Fechar por limite: *${st}*\nUse:\n.fecharlimite on\n.fecharlimite off`
      });
    }
    return true;
  }

  // ---------- Gestão de aluguel de gestores ----------
  if (comando === 'adicionargestor' || comando === 'addgestor') {
    if (!ehGestor) {
      await sock.sendMessage(from, { text: '❌ Só o gestor principal Lacoste pode adicionar gestores.' });
      return true;
    }
    const num = normalizarNumeroSimples(args[0]);
    const dias = Number(args[1] || 30);
    const maxPessoas = Number(args[2] || 0);
    if (!num) {
      await sock.sendMessage(from, {
        text:
          '❌ Use:\n.adicionargestor 841234567 30 5\n' +
          '(número, dias de aluguel, máx. pessoas opcional)'
      });
      return true;
    }
    const data = carregarGestoresAluguel();
    const expira = new Date(Date.now() + Math.max(1, dias) * 86400000).toISOString();
    data.gestores[num] = {
      numero: num,
      dias,
      maxPessoas: maxPessoas || null,
      inicio: new Date().toISOString(),
      expira,
      adicionadoPor: sender,
      ativo: true,
      pessoasAlugadas: data.gestores[num]?.pessoasAlugadas || 0
    };
    salvarGestoresAluguel(data);
    await sock.sendMessage(from, {
      text:
        `✅ Gestor de aluguel adicionado\n` +
        `📱 ${num}\n📅 ${dias} dias\n⏳ Expira: ${new Date(expira).toLocaleString('pt-PT')}` +
        (maxPessoas ? `\n👥 Máx. pessoas: ${maxPessoas}` : '')
    });
    return true;
  }

  if (comando === 'removegestor' || comando === 'delgestor') {
    if (!ehGestor) {
      await sock.sendMessage(from, { text: '❌ Só gestor principal.' });
      return true;
    }
    const num = normalizarNumeroSimples(args[0]);
    const data = carregarGestoresAluguel();
    if (!num || !data.gestores[num]) {
      await sock.sendMessage(from, { text: '❌ Número não encontrado. Use .listargestores' });
      return true;
    }
    delete data.gestores[num];
    salvarGestoresAluguel(data);
    await sock.sendMessage(from, { text: `✅ Gestor ${num} removido.` });
    return true;
  }

  if (comando === 'listargestores' || comando === 'gestores') {
    if (!ehGestor) {
      await sock.sendMessage(from, { text: '❌ Só gestor principal.' });
      return true;
    }
    const data = carregarGestoresAluguel();
    const lista = Object.values(data.gestores || {});
    if (!lista.length) {
      await sock.sendMessage(from, { text: '📋 Nenhum gestor de aluguel registado.\n.adicionargestor NUMERO DIAS' });
      return true;
    }
    let t = '📋 *GESTORES ALUGUEL*\n━━━━━━━━━━━━━━━━━━\n';
    lista.forEach((g, i) => {
      const exp = g.expira ? new Date(g.expira) : null;
      const vivo = exp && exp > new Date();
      t += `${i + 1}. ${g.numero} ${vivo ? '✅' : '⛔'}\n`;
      t += `   Dias: ${g.dias} | Expira: ${exp ? exp.toLocaleString('pt-PT') : '—'}\n`;
      t += `   Pessoas: ${g.pessoasAlugadas || 0}${g.maxPessoas ? '/' + g.maxPessoas : ''}\n\n`;
    });
    await sock.sendMessage(from, { text: t });
    return true;
  }

  return false;
}

/**
 * Chamado pelo app/API quando um cartão fica sem limite.
 * Se o grupo tiver .fecharlimite on, fecha o grupo.
 */
async function onLimiteEsgotado(sock, groupId, detalhe = '') {
  const cfg = carregarFecharLimite();
  if (!cfg[groupId]?.ativo) return false;
  try {
    await sock.groupSettingUpdate(groupId, 'announcement');
    await sock.sendMessage(groupId, {
      text:
        '🔒 *GRUPO FECHADO AUTOMATICAMENTE*\n━━━━━━━━━━━━━━━━━━\n' +
        'Limite de transferências esgotado nos cartões.\n' +
        (detalhe ? `Detalhe: ${detalhe}\n` : '') +
        'Configurado com *.fecharlimite on*'
    });
    return true;
  } catch (e) {
    console.error('onLimiteEsgotado', e.message);
    return false;
  }
}

module.exports = {
  processarComandosNovos,
  registarPendente,
  cancelarPendente,
  obterPendente,
  carregarPendentes,
  onLimiteEsgotado,
  registarLucroPedido,
  carregarFecharLimite,
  carregarGestoresAluguel,
  normalizarNumeroSimples
};
