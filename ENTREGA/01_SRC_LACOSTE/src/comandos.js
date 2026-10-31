const fs = require('fs');
// comandos_extra.js removido conforme pedido do usuário
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sistemaContas = require('./sistema-contas.js');
const sistemaVendas = require('./sistemaVendas.js');
const comandosNovos = require('./comandos_novos.js');
const {
    conectarNovoNumero,
    conectarViaQR,
    activeSockets,
    destruirSocket,
    apagarSessao
} = require('./connect.js');

global.normalizarLid = function(lid) {
    let id = String(lid || "").trim();
    if (id.endsWith("@s.whatsapp.net")) {
        id = id.replace("@s.whatsapp.net", "@lid");
    }
    return id;
}

// =========================
// NORMALIZAR NÚMERO LACOSTE
// =========================
function normalizarNumeroLacoste(numero) {
    if (!numero) return null;

    // se já for JID tipo 25884xxx@c.us ou @lid
    if (typeof numero === 'string' && numero.includes('@')) {
        numero = numero.split('@')[0];
    }

    // tira tudo que não é número
    numero = String(numero).replace(/\D/g, "");

    // 084xxxxxxx -> 25884xxxxxxx
    if (numero.startsWith("0")) numero = "258" + numero.slice(1);

    // 84xxxxxxx -> 25884xxxxxxx
    if (!numero.startsWith("258") && numero.length >= 9) numero = "258" + numero;

    return numero + "@c.us";
}

// =========================
// VERIFICAR SE É GESTOR LACOSTE
// =========================
const NUMEROS_GESTAO = [
    "258833552729@c.us", // troca pelos teus números
    "258848395255@c.us"
];

function gestaoPermitida(data) {
    // pega o sender de vários formatos possíveis
    const sender = data?.sender || data?.numero || data?.msg?.key?.participant || data?.msg?.key?.remoteJid || "";
    const numeroNormalizado = normalizarNumeroLacoste(sender);
    return NUMEROS_GESTAO.includes(numeroNormalizado);
}
// =========================
// PASTAS
// =========================

if (!fs.existsSync('./config')) {
    fs.mkdirSync('./config', { recursive: true });
}

if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
}

// =========================
// CAMINHOS CONFIG
// =========================

// ============================================================
// AUTORIZAÇÕES - PRA NÃO DAR ERRO
// ============================================================

const DATA = "./data"; // ADICIONA ESSA LINHA
const pathAutorizacoes = `${DATA}/autorizacoes.json`;

function carregarAutorizacoes() {
    return lerJSON(pathAutorizacoes, {});
}

function salvarAutorizacoes(dados) {
    salvarJSON(pathAutorizacoes, dados);
}

const pathAutomacao = './data/automacao.json';
const pathComprovantes = './data/comprovantes.json';

const pathNano = './config/nanoativar.json';
const pathGatilhos = './config/gatilhos.json';
const pathAnticoncorrencia = './config/anticoncorrencia.json';
const pathConcorrentes = './config/concorrentes.json';
const pathBemvindo = './config/bemvindo.json';
const pathPersonalizar = './config/personalizar.json';
const pathSistema = './config/sistema.json';

function carregarSistema() {
    return lerJSON(pathSistema, {});
}

function salvarSistema(dados) {
    salvarJSON(pathSistema, dados);
}
const pathCompras = './config/compras.json';
const pathAntilink = './config/antilink.json';
const pathAntifoto = './config/antifoto.json';
const pathDetector = './config/detector.json';

// =========================
// CAMINHOS DATA
// =========================

const pathContas = './data/contas.json';
const pathAntivideo = './data/antivideo.json';
const pathAntiaudio = './data/antiaudio.json';
const pathAntistatus = './data/antistatus.json';
const pathAutorizacao = './data/autorizacao.json';
const pathDias = './data/dias.json';
const pathdadoscompras = './data/dadoscompras.json';
const pathAlarmes = './data/alarmes.json';
const pathRCBDRanking = './data/rcbd_ranking.json';

const pathReferencias = './config/referencias.json';

// =========================
// DIAS
// =========================

function carregarDias() {
    return lerJSON(pathDias, {});
}

function salvarDias(data) {
    salvarJSON(pathDias, data);
}


// ============================================================
// LICENÇA / ATIVAÇÃO LACOSTE
// Somente estes números podem ativar um grupo.
// Enquanto não houver validade ativa, nenhum comando normal
// é processado. O único comando liberado é .ativar.
// ============================================================

const pathDonosRCBD = './data/donos_rcbd.json';

function carregarIDsGestoresLacoste() {
    try {
        if (!fs.existsSync(pathDonosRCBD)) return [];
        const dados = JSON.parse(fs.readFileSync(pathDonosRCBD, 'utf8') || '{}');
        const ids = [];

        const adicionar = (valor) => {
            if (!valor) return;
            if (Array.isArray(valor)) {
                valor.forEach(adicionar);
                return;
            }
            if (typeof valor === 'object') {
                Object.values(valor).forEach(adicionar);
                return;
            }
            ids.push(String(valor).trim());
        };

        adicionar(dados);
        return [...new Set(ids.filter(Boolean))];
    } catch (e) {
        console.log('ERRO AO LER GESTORES LACOSTE:', e.message);
        return [];
    }
}

function ehDonoLacoste(data) {
    const candidatos = [
        data?.sender,
        data?.numero,
        data?.senderNumber,
        data?.phone,
        data?.msg?.key?.participant,
        data?.msg?.key?.remoteJid
    ].filter(Boolean);

    const gestores = carregarIDsGestoresLacoste();

    return candidatos.some(candidato => {
        const valor = String(candidato).trim();
        const numero = normalizarNumeroLacoste(valor);

        return gestores.some(gestor => {
            const g = String(gestor).trim();
            return g === valor ||
                normalizarNumeroLacoste(g) === numero;
        });
    });
}

async function ehGestorLacosteRobusto(sock, data) {
    // Primeiro aceita qualquer formato que esteja explicitamente cadastrado
    // em data/donos_rcbd.json: número, @c.us, @s.whatsapp.net ou @lid.
    if (ehDonoLacoste(data)) return true;

    const candidatos = new Set();
    const adicionar = (v) => {
        if (!v) return;
        const bruto = String(v).trim();
        candidatos.add(bruto);
        const numero = normalizarNumeroLacoste(bruto);
        if (numero) candidatos.add(numero);

        // Também guarda a parte antes do @ para comparar LID/PN sem depender
        // do domínio que o WhatsApp entregou.
        if (bruto.includes('@')) candidatos.add(bruto.split('@')[0]);
    };

    [
        data?.sender,
        data?.numero,
        data?.senderNumber,
        data?.phone,
        data?.msg?.key?.participant,
        data?.msg?.key?.senderPn,
        data?.msg?.key?.participantPn,
        data?.msg?.key?.remoteJid
    ].forEach(adicionar);

    // Resolve o participante real do grupo usando todos os identificadores
    // que versões recentes do Baileys podem entregar.
    try {
        if (String(data?.from || '').endsWith('@g.us')) {
            const meta = await sock.groupMetadata(data.from);
            const alvo = String(data?.sender || data?.msg?.key?.participant || '');

            const p = (meta.participants || []).find(x => {
                const ids = [
                    x?.id, x?.lid, x?.jid, x?.phoneNumber,
                    x?.pn, x?.phone, x?.user
                ].filter(Boolean).map(String);

                return ids.some(id =>
                    id === alvo ||
                    id.split('@')[0] === alvo.split('@')[0]
                );
            });

            if (p) {
                [
                    p.id, p.lid, p.jid, p.phoneNumber,
                    p.pn, p.phone, p.user
                ].forEach(adicionar);
            }
        }
    } catch (e) {
        console.log('ERRO AO RESOLVER GESTOR POR LID:', e.message);
    }

    const gestores = carregarIDsGestoresLacoste();

    return gestores.some(g => {
        const gs = String(g || '').trim();
        const gn = normalizarNumeroLacoste(gs);
        const gl = gs.includes('@') ? gs.split('@')[0] : gs;

        return candidatos.has(gs) ||
               candidatos.has(gl) ||
               (gn && candidatos.has(gn)) ||
               candidatos.has(gs.split('@')[0]);
    });
}

function grupoComValidadeAtiva(grupoId) {
    if (!grupoId || !grupoId.endsWith('@g.us')) return false;

    const diasData = carregarDias();
    const info = diasData[grupoId];

    if (!info) return false;

    const fim = Number(info.fim) || 0;
    return fim > Date.now() && Number(info.dias || 0) > 0;
}

// =========================
// FUNÇÃO JSON SEGURA
// =========================

function lerJSON(path, padrao = {}) {
    try {
        if (!fs.existsSync(path)) {
            fs.writeFileSync(
                path,
                JSON.stringify(padrao, null, 2)
            );

            return padrao;
        }

        const dados = fs.readFileSync(path, 'utf8');

        if (!dados.trim()) {
            return padrao;
        }

        return JSON.parse(dados);

    } catch (e) {
        console.log(
            'Erro JSON:',
            path,
            e.message
        );

        return padrao;
    }
}

function salvarJSON(path, dados) {
    try {
        fs.writeFileSync(
            path,
            JSON.stringify(dados, null, 2)
        );

    } catch (e) {
        console.log(
            'Erro salvar:',
            path,
            e.message
        );
    }
}

function garantirPastaDoArquivo(filePath) {
    const dir = require('path').dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function carregarAntifoto() {
    return lerJSON(pathAntifoto, {});
}

function salvarAntifoto(data) {
    garantirPastaDoArquivo(pathAntifoto);
    salvarJSON(pathAntifoto, data);
}

function carregarAntivideo() {
    return lerJSON(pathAntivideo, {});
}

function salvarAntivideo(data) {
    garantirPastaDoArquivo(pathAntivideo);
    salvarJSON(pathAntivideo, data);
}

function carregarAntiaudio() {
    return lerJSON(pathAntiaudio, {});
}

function salvarAntiaudio(data) {
    garantirPastaDoArquivo(pathAntiaudio);
    salvarJSON(pathAntiaudio, data);
}

function carregarAntistatus() {
    return lerJSON(pathAntistatus, {});
}

function salvarAntistatus(data) {
    garantirPastaDoArquivo(pathAntistatus);
    salvarJSON(pathAntistatus, data);
}

function carregarContas() {
    return lerJSON(pathContas, {});
}

function salvarContas(data) {
    garantirPastaDoArquivo(pathContas);
    salvarJSON(pathContas, data);
}

// =========================
// AUTOMAÇÃO
// =========================

function carregarAutomacao() {
    return lerJSON(
        pathAutomacao,
        {}
    );
}

function salvarAutomacao(data) {
    salvarJSON(
        pathAutomacao,
        data
    );
}

// Função pra formatar o uptime em horas, minutos e segundos
function formatarUptimeLacoste(segundos) {
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = Math.floor(segundos % 60);

    let resposta = "";
    if (dias > 0) resposta += `${dias}d `;
    if (horas > 0) resposta += `${horas}h `;
    if (minutos > 0) resposta += `${minutos}m `;
    resposta += `${segs}s`;

    return resposta.trim();
}

// =========================
// SISTEMA GLOBAL
// =========================

global.automacao = carregarAutomacao();

global.pendentes =
    global.pendentes || {};

// =========================
// REFERÊNCIAS ANTI DUPLICADO
// =========================

function carregarReferencias() {
    return lerJSON(
        pathReferencias,
        []
    );
}

function salvarReferencias(data) {
    salvarJSON(
        pathReferencias,
        data
    );
}

// =========================
// COMPROVANTES
// =========================

function carregarComprovantes() {
    return lerJSON(
        pathComprovantes,
        {}
    );
}

function salvarComprovantes(data) {
    salvarJSON(
        pathComprovantes,
        data
    );
}

// =========================
// SISTEMAS DE GRUPO
// =========================

function carregarArquivo(path) {
    return lerJSON(
        path,
        {}
    );
}

function salvarArquivo(path, data) {
    salvarJSON(
        path,
        data
    );
}

// =========================
// NANO
// =========================

function carregarNano() {
    return carregarArquivo(
        pathNano
    );
}

function salvarNano(data) {
    salvarArquivo(
        pathNano,
        data
    );
}

// =========================
// GATILHOS
// =========================

function carregarGatilhos() {
    return carregarArquivo(
        pathGatilhos
    );
}

function salvarGatilhos(data) {
    salvarArquivo(
        pathGatilhos,
        data
    );
}

// =========================
// ANTICONCORRÊNCIA
// =========================

function carregarAnticoncorrencia() {
    return carregarArquivo(
        pathAnticoncorrencia
    );
}

function salvarAnticoncorrencia(data) {
    salvarArquivo(
        pathAnticoncorrencia,
        data
    );
}

// =========================
// CONCORRENTES
// =========================

function carregarConcorrentes() {
    return carregarArquivo(
        pathConcorrentes
    );
}

function salvarConcorrentes(data) {
    salvarArquivo(
        pathConcorrentes,
        data
    );
}

// =========================
// STATUS DE SISTEMAS
// =========================

function lerStatus(path, grupo) {
    const dados = lerJSON(
        path,
        {}
    );

    return (
        dados[grupo] === true ||
        dados[grupo] === 'on'
    );
}

// =========================
// RESET DIÁRIO COMPRAS
// =========================

function verificarMudancaDeDia(compras) {
    // Dia civil em Moçambique (UTC+2) — reset a cada 24h / meia-noite CAT
    const agora = new Date();
    const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
    const moz = new Date(utc + 2 * 3600000);
    const hoje = moz.toISOString().slice(0, 10);

    if (!compras._dataAtual) {
        compras._dataAtual = hoje;
        return;
    }

    if (compras._dataAtual !== hoje) {

        for (const grupo in compras) {

            if (grupo === '_dataAtual') {
                continue;
            }

            if (
                !compras[grupo] ||
                typeof compras[grupo] !== 'object'
            ) {
                continue;
            }

            for (const user in compras[grupo]) {

                if (!compras[grupo][user]) {
                    continue;
                }

                compras[grupo][user].Megashoje = 0;
                compras[grupo][user].Saldohoje = 0;
                compras[grupo][user].MegashojeMB = 0;
            }
        }

        compras._dataAtual = hoje;
    }
}

// REGISTRO CENTRAL DE COMPRAS
// Usa exatamente a mesma estrutura de config/compras.json usada pelo .compra.
// O modo automático não depende de um administrador digitando o comando.
function registrarCompraNoSistema(from, numeroComprador, quantidadeStr, unidadeForcada = null) {
  if (!from || !from.endsWith('@g.us')) {
    throw new Error('Compra automática só pode ser registrada em grupos.');
  }

  const textoQuantidade = String(quantidadeStr || '').trim();
  const match = textoQuantidade.match(/^([\d.,]+)\s*(mb|gb|saldo)$/i);
  if (!match) {
    throw new Error(`Quantidade inválida: ${textoQuantidade}`);
  }

  const valor = parseFloat(match[1].replace(',', '.'));
  const unidade = (unidadeForcada || match[2]).toLowerCase();

  if (!['mb', 'gb', 'saldo'].includes(unidade) || !Number.isFinite(valor)) {
    throw new Error('Tipo ou quantidade de compra inválido.');
  }

  let quantidadeMB = 0;
  if (unidade === 'mb') quantidadeMB = Math.round(valor);
  else if (unidade === 'gb') quantidadeMB = Math.round(valor * 1024);
  else quantidadeMB = Math.round(valor);

  let compras = {};
  if (fs.existsSync(pathCompras)) {
    compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
  }

  function getMozTimeISOString() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const moz = new Date(utc + 2 * 3600000);
    return moz.toISOString();
  }

  function getMozDateOnly() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const moz = new Date(utc + 2 * 3600000);
    return moz.toISOString().split('T')[0];
  }

  verificarMudancaDeDia(compras);

  // NÃO converter @lid em número de telefone.
  // LID tipo 43456...@lid virava @+43 3456... no WhatsApp.
  function jidMencaoCompra(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    if (texto.includes('@lid') || texto.includes('@s.whatsapp.net') || texto.includes('@c.us')) {
      return texto.split(':')[0];
    }
    return '';
  }

  function normalizarNumeroComprador(valor) {
    const texto = String(valor || '').trim();
    if (texto.includes('@lid')) return '';
    const jid = texto.includes('@') ? texto.split('@')[0] : texto;
    let n = jid.replace(/\D/g, '');

    if (n.startsWith('258') && n.length >= 11) {
      n = n.slice(3);
    }

    if (n.startsWith('0') && n.length >= 10) {
      n = n.slice(1);
    }

    if (/^8[4-7]\d{7}$/.test(n)) return n;
    return n;
  }

  const mentionReal = jidMencaoCompra(numeroComprador);
  const numeroCanonico = normalizarNumeroComprador(numeroComprador);
  const userKey = mentionReal || (numeroCanonico ? `${numeroCanonico}@s.whatsapp.net` : String(numeroComprador));

  if (!compras[from]) compras[from] = {};
  if (!compras[from][userKey]) {
    compras[from][userKey] = {
      Megas: 0,
      Megashoje: 0,
      MegashojeMB: 0,
      Saldo: 0,
      Saldohoje: 0,
      comprasTotal: 0,
      data: getMozTimeISOString()
    };
  }

  const user = compras[from][userKey];
  if (!Number.isFinite(Number(user.MegashojeMB))) user.MegashojeMB = 0;

  const hoje = getMozDateOnly();
  const ultimaData = user.data ? user.data.split('T')[0] : null;
  const novoDia = hoje !== ultimaData;

  if (novoDia) {
    user.Megashoje = 0;
    user.Saldohoje = 0;
    user.MegashojeMB = 0;
  }

  if (!Number.isFinite(Number(user.comprasTotal))) {
    user.comprasTotal = 0;
  }

  user.comprasTotal += 1;

  if (unidade === 'mb' || unidade === 'gb') {
    user.Megas += quantidadeMB;
    user.Megashoje = novoDia ? 1 : user.Megashoje + 1;
    user.MegashojeMB = novoDia ? quantidadeMB : (Number(user.MegashojeMB) || 0) + quantidadeMB;
  } else {
    user.Saldo += quantidadeMB;
    user.Saldohoje = novoDia ? 1 : user.Saldohoje + 1;
  }

  user.data = getMozTimeISOString();
  fs.writeFileSync(pathCompras, JSON.stringify(compras, null, 2));

  const comprasHoje = unidade === 'saldo' ? user.Saldohoje : user.Megashoje;
  const totalCompradoUser = unidade === 'saldo' ? user.Saldo + 'Saldo' : user.Megas + 'MB';

  const ranking = Object.entries(compras[from])
    .filter(([, dados]) => dados && typeof dados === 'object')
    .sort((a, b) => {
      const totalA = unidade === 'saldo' ? a[1].Saldo : a[1].Megas;
      const totalB = unidade === 'saldo' ? b[1].Saldo : b[1].Megas;
      return totalB - totalA;
    });

  const posicao = ranking.findIndex(([id]) => id === userKey) + 1;
  const maiorCompradorTotal = ranking.length
    ? ranking[0][1][unidade === 'saldo' ? 'Saldo' : 'Megas']
    : 0;

  const mentionJid = userKey;
  const numeroLimpo = String(mentionJid).split('@')[0].split(':')[0];
  const texto =
`✅ *Concluído Com Sucesso* 🇲🇿
_╔════════════════════╗_
Obrigado @${numeroLimpo} por comprar *${textoQuantidade}${unidade === 'saldo' ? ' Saldo' : ''}*!
Essa é a sua *${comprasHoje}ª compra hoje!*
Você é o comprador nº *${posicao}* do grupo, com um total acumulado de *${totalCompradoUser}*!
O maior comprador do grupo acumulou *${maiorCompradorTotal}${unidade === 'saldo' ? ' Saldo' : 'MB'}*.
_╚════════════════════╝_`;

  return {
    texto,
    numeroComprador: mentionJid,
    mentionJid,
    quantidadeMB,
    unidade,
    comprasHoje,
    posicao,
    totalCompradoUser,
    maiorCompradorTotal
  };
}

// Permite ao sistemaVendas usar o MESMO registro do .compra sem simular comando.
async function registrarCompraAutomatica(from, numero, quantidade, unidade = 'mb', mentionJid = null) {
  const quantidadeStr = `${quantidade}${unidade}`;
  const quem = mentionJid || numero;
  return registrarCompraNoSistema(from, String(quem), quantidadeStr, unidade);
}


// =========================
// PROCESSADOR PRINCIPAL
// =========================

async function handleCommand(sock, data, command) {

    try {

        const from = data.from;
        const sender = data.sender;
        const msg = data.msg;

        if (data.executandoRCBD) {
            return;
        }

        const automacaoAtiva =
            global.automacao?.[from] === true;

        if (!msg || !msg.message) {
            return;
        }

        const isGroup =
            from.endsWith('@g.us');

        const isFromMe =
            msg.key?.fromMe || false;

        const isOwner =
            sender === global.owner;

        // =========================
        // TEXTO DA MENSAGEM
        // =========================

        const body =
            command ||
            data.texto ||
            data.text ||
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '';

        if (!body.trim()) {
            return;
        }

        const lower =
            body.toLowerCase();

        console.log(
            'BODY:',
            body
        );

        // =========================
        // PREPARAR COMANDO
        // =========================

        const raw =
            body.trim();

        // O prefixo oficial dos comandos é o mesmo método já usado pelo
        // comandos.js: somente uma mensagem que começa por "." é comando.
        const temPrefixo = raw.startsWith('.');

        const cmd =
            temPrefixo
                ? raw.slice(1).toLowerCase()
                : raw.toLowerCase();

        const partesComando = cmd.trim().split(/\s+/);
        let args = partesComando.slice(1);

        let comando = partesComando[0] || '';

        // Comandos complementares do menu Lacoste V7.
        // Ficam isolados para que um erro em uma função nova não derrube o núcleo.


        // Permite colar vários .addpacote, um em cada linha:
        // .addpacote 5MT 225MB
        // .addpacote 10MT 455MB
        // .addpacote 15MT 680MB
        if (comando === 'addpacote') {
            args = cmd
                .replace(/(?:^|\s)\.?addpacote\b/gi, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
        }

        // Mesmo comportamento para vários .addsaldo colados em sequência.
        if (comando === 'addsaldo') {
            args = cmd
                .replace(/(?:^|\s)\.?addsaldo\b/gi, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
        }

        // Aliases compatíveis com a nomenclatura Lacoste.
        // A lógica original continua sendo usada.

        if (comando === 'nano') comando = 'nanoativar';

        // ---- Novos comandos (comandos_novos.js) ----
        try {
            const ehGestorN = await ehGestorLacosteRobusto(sock, data);
            let ehAdmGrupoN = false;
            if (isGroup) {
                try {
                    const metaN = await sock.groupMetadata(from);
                    const adminsN = (metaN.participants || [])
                        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                        .map(p => p.id);
                    const sid = msg.key.participant || msg.key.remoteJid || sender;
                    ehAdmGrupoN = adminsN.includes(sid) || adminsN.includes(sender);
                } catch (_) {}
            }
            const tratadoNovo = await comandosNovos.processarComandosNovos({
                sock, from, sender, msg, comando, args, raw, isGroup,
                ehGestor: ehGestorN, ehAdmGrupo: ehAdmGrupoN
            });
            if (tratadoNovo) return;
        } catch (eNovo) {
            console.error('comandos_novos erro:', eNovo.message);
        }

        if (comando === 'nanolist') comando = 'listanano';
        if (comando === 'grupoa') {
            comando = 'grupo';
            command = 'grupo a';
        }
        if (comando === 'grupof') {
            comando = 'grupo';
            command = 'grupo f';
        }

        // ============================================================
        // .ATIVAR — única exceção à validade
        // (comandos_extra.js removido)
        // ============================================================

        if (comando === 'ativar') {
            if (!(await ehGestorLacosteRobusto(sock, data))) {
                await sock.sendMessage(from, {
                    text: '❌ Acesso recusado.\nEste comando é exclusivo dos gestores Lacoste.'
                });
                return;
            }

            if (!isGroup) {
                await sock.sendMessage(from, {
                    text: '❌ Use .ativar 8D dentro do grupo que deseja ativar.'
                });
                return;
            }

            const valor = args[1] || args[0] || '';
            const diasAtivar = parseInt(String(valor).replace(/D/gi, ''), 10);

            if (!Number.isFinite(diasAtivar) || diasAtivar <= 0) {
                await sock.sendMessage(from, {
                    text: '❌ Formato: .ativar 8D\n\nExemplo: .ativar 8D'
                });
                return;
            }

            const diasData = carregarDias();
            const agora = Date.now();
            const atual = diasData[from] || {};
            const fimAtual = Number(atual.fim) > agora ? Number(atual.fim) : agora;
            const fimNovo = fimAtual + diasAtivar * 24 * 60 * 60 * 1000;
            const diasRestantes = Math.ceil((fimNovo - agora) / (24 * 60 * 60 * 1000));

            diasData[from] = {
                ...atual,
                dias: Math.max(0, Number(atual.dias) || 0) + diasAtivar,
                diasRestantes,
                fim: fimNovo,
                ativadoPor: data.sender,
                ativadoEm: agora
            };

            salvarDias(diasData);

            await sock.sendMessage(from, {
                text:
                    '✅ *Lacoste ativado com sucesso*\n\n' +
                    `+${diasAtivar} dia(s)\n` +
                    `Total restante: ${diasRestantes} dia(s)\n` +
                    `Expira em: ${new Date(fimNovo).toLocaleString()}`
            });
            return;
        }


        // ============================================================
        // GESTÃO PELO BOT — NÃO DEPENDE DA LICENÇA DO GRUPO
        // Apenas os gestores Lacoste podem usar estes comandos.
        // ============================================================

        if (['dispositivos', 'dispositivo', 'licencas', 'licencaspendentes',
     'aprovar', 'rejeitar',
     'desassociar', 'desassociardispositivo',
     'statusdispositivo', 'gruposdispositivo'].includes(comando)) {

    if (!(await ehGestorLacosteRobusto(sock, data))) { // mesma lista de gestores, com suporte a @lid
        await sock.sendMessage(from, {
            text: '❌ Este comando é exclusivo dos gestores Lacoste.'
        });
        return;
    }

            // ---------- LISTA DE DISPOSITIVOS ----------
            if (['dispositivos', 'dispositivo'].includes(comando)) {
                try {
                    const r = await sistemaVendas.listarDispositivosGestao();
                    const ds = Array.isArray(r.dispositivos) ? r.dispositivos : [];

                    if (!ds.length) {
                        await sock.sendMessage(from, {
                            text: '📱 *DISPOSITIVOS LACOSTE*\n\nNenhum dispositivo encontrado.'
                        });
                        return;
                    }

                    let texto = '📱 *DISPOSITIVOS LACOSTE*\n━━━━━━━━━━━━━━━━━━\n';
                    ds.forEach((d, i) => {
                        texto +=
                            `${i + 1}. ${d.model || 'Sem modelo'}\n` +
                            `🆔 ${d.android_id}\n` +
                            `🔑 Licença: ${d.license_key || '—'}\n` +
                            `📌 Estado: ${d.status || '—'}\n` +
                            `📦 Slot: ${d.slot ? `${d.slot}/2` : 'aguardando'}\n` +
                            `📡 FCM: ${d.push_configurado ? 'OK' : 'não configurado'}\n` +
                            `🕒 Último sinal: ${d.last_seen ? new Date(d.last_seen).toLocaleString('pt-PT') : 'N/D'}\n\n`;
                    });

                    texto += '━━━━━━━━━━━━━━━━━━\n';
                    texto += 'Associar o grupo atual:\n.associar ANDROID_ID\n\n';
                    texto += 'Desassociar:\n.desassociar';
                    await sock.sendMessage(from, { text: texto });
                } catch (e) {
                    await sock.sendMessage(from, {
                        text: `❌ Não foi possível listar os dispositivos.\n📝 ${e.message}`
                    });
                }
                return;
            }

            // ---------- LICENÇAS ----------
            if (['licencas', 'licencaspendentes'].includes(comando)) {
                try {
                    const r = await sistemaVendas.listarLicencasGestao();
                    const lista = Array.isArray(r.licenses) ? r.licenses : [];

                    if (!lista.length) {
                        await sock.sendMessage(from, {
                            text: '📋 *PEDIDOS DE LICENÇA*\n\nNenhum pedido encontrado.'
                        });
                        return;
                    }

                    let texto = '📋 *PEDIDOS DE LICENÇA*\n━━━━━━━━━━━━━━━━━━\n';
                    lista.forEach((x, i) => {
                        texto +=
                            `${i + 1}. ${x.status === 'pending' ? '🟡' : x.status === 'approved' ? '🟢' : '🔴'} ${x.id}\n` +
                            `🔑 ${x.license_key}\n` +
                            `🆔 ${x.android_id}\n` +
                            `📱 ${x.model || 'Sem modelo'}\n` +
                            `📌 ${x.status}\n` +
                            `📦 Slot: ${x.slot ? `${x.slot}/2` : '—'}\n` +
                            `🕒 ${x.requested_at ? new Date(x.requested_at).toLocaleString('pt-PT') : 'N/D'}\n\n`;
                    });

                    texto += '━━━━━━━━━━━━━━━━━━\n';
                    texto += '.aprovar ID 30\n.rejeitar ID motivo';
                    await sock.sendMessage(from, { text: texto });
                } catch (e) {
                    await sock.sendMessage(from, {
                        text: `❌ Não foi possível consultar as licenças.\n📝 ${e.message}`
                    });
                }
                return;
            }

            // ---------- APROVAR ----------
            if (comando === 'aprovar') {
                const id = args[0];
                const dias = Number(args[1] || 30);

                if (!id || !Number.isFinite(dias) || dias <= 0) {
                    await sock.sendMessage(from, {
                        text: '❌ Use: .aprovar ID 30'
                    });
                    return;
                }

                try {
                    const r = await sistemaVendas.aprovarLicencaGestao(id, dias);
                    await sock.sendMessage(from, {
                        text:
                            `✅ *LICENÇA APROVADA*\n\n` +
                            `🆔 Pedido: ${id}\n` +
                            `📅 Dias: ${r.days}\n` +
                            `📦 Slot: ${r.slot}/2\n` +
                            `⏳ Expira: ${new Date(r.expiresAt).toLocaleString('pt-PT')}\n\n` +
                            `O dispositivo já pode continuar o registo no APK.`
                    });
                } catch (e) {
                    let extra = '';
                    try {
                        const lista = await sistemaVendas.listarLicencasGestao();
                        const pend = (lista.licenses || []).filter(x => x.status === 'pending').slice(0, 8);
                        if (pend.length) {
                            extra = '\n\n📋 *Pendentes (use o ID exacto):*\n' +
                                pend.map(x => `• ${x.id} | ${x.model || x.android_id || ''} | ${x.license_key || ''}`).join('\n');
                        }
                    } catch (_) {}
                    await sock.sendMessage(from, {
                        text: `❌ Não foi possível aprovar.\n📝 ${e.message}${extra}\n\nDica: copie o ID da lista .licencas (não a license_key).`
                    });
                }
                return;
            }

            // ---------- REJEITAR ----------
if (comando === 'rejeitar') {
    const id = args[0];
    const motivo = args.slice(1).join(' ') || 'Rejeitado pelo gestor';

    if (!id) {
        await sock.sendMessage(from, {
            text: '❌ Use:.rejeitar ID motivo'
        });
        return;
    }

    try {
        await sistemaVendas.rejeitarLicencaGestao(id, motivo);
        await sock.sendMessage(from, {
            text: `🛑 *PEDIDO REJEITADO*\n\n🆔 ${id}\n📝 Motivo: ${motivo}`
        });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Não foi possível rejeitar.\n📝 ${e.message}`
        });
    }
    return;
}

// ---------- ASSOCIAR (ADM do grupo OU gestor Lacoste) ----------
if (['associar', 'associardispositivo'].includes(comando)) {
    const androidId = args[0];

    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ Use este comando dentro do grupo que será associado.'
        });
        return;
    }

    // Permissão inteligente: gestor Lacoste OU administrador do grupo
    let podeAssociar = await ehGestorLacosteRobusto(sock, data);
    if (!podeAssociar) {
        try {
            const metaA = await sock.groupMetadata(from);
            const adminsA = (metaA.participants || [])
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);
            const sidA = msg.key.participant || msg.key.remoteJid || sender;
            podeAssociar = adminsA.includes(sidA) || adminsA.includes(sender);
        } catch (_) {}
    }
    if (!podeAssociar) {
        await sock.sendMessage(from, {
            text: '❌ Apenas administradores do grupo ou gestores Lacoste podem associar dispositivo.'
        });
        return;
    }

    if (!androidId) {
        await sock.sendMessage(from, {
            text: '❌ Use: .associar ANDROID_ID\nPrimeiro veja a lista com .dispositivos'
        });
        return;
    }

    try {
        const r = await sistemaVendas.associarDispositivoGrupo(from, androidId);
        await sock.sendMessage(from, {
            text:
                `✅ *GRUPO ASSOCIADO*\n\n` +
                `📱 Dispositivo: ${r.androidId}\n` +
                `📦 Slot: ${r.slot || '—'}\n` +
                `🔗 Grupo: ${from}\n\n` +
                `A automação deste grupo agora aponta para este dispositivo.`
        });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Não foi possível associar.\n📝 ${e.message}`
        });
    }
    return;
}

// ---------- DESASSOCIAR ----------
if (['desassociar', 'desassociardispositivo'].includes(comando)) {
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ Use este comando dentro do grupo.'
        });
        return;
    }

    try {
        await sistemaVendas.removerDispositivoGrupo(from);
        await sock.sendMessage(from, {
            text: '✅ Associação removida deste grupo.'
        });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Não foi possível desassociar.\n📝 ${e.message}`
        });
    }
    return;
}

// ---------- STATUS ----------
if (comando === 'statusdispositivo') {
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ Use este comando dentro do grupo.'
        });
        return;
    }

    try {
        const r = await sistemaVendas.statusDispositivoGrupo(from);
        if (!r.registado) {
            await sock.sendMessage(from, {
                text: '📱 *STATUS DO DISPOSITIVO*\n\nNenhum dispositivo está associado a este grupo.'
            });
            return;
        }

        const g = r.grupo || {};
        await sock.sendMessage(from, {
            text:
                `📱 *STATUS DO DISPOSITIVO*\n━━━━━━━━━━━━━━━━━━\n` +
                `🆔 Android ID: ${g.android_id}\n` +
                `📦 Slot: ${g.slot || '—'}/2\n` +
                `📌 Estado: ${g.status || '—'}\n` +
                `📡 FCM: ${g.push_configurado? 'CONFIGURADO' : 'NÃO CONFIGURADO'}\n` +
                `🕒 Último sinal: ${g.last_seen? new Date(g.last_seen).toLocaleString('pt-PT') : 'N/D'}\n` +
                `⏳ Expira: ${g.license_expires_at? new Date(g.license_expires_at).toLocaleString('pt-PT') : '—'}\n` +
                `━━━━━━━━━━━━━━━━━━`
        });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Não foi possível consultar o dispositivo.\n📝 ${e.message}`
        });
    }
    return;
}

// Comando .play / YouTube removido (não usado)


// ---------- GRUPOS ASSOCIADOS ----------
if (comando === 'gruposdispositivo') {
    try {
        const r = await sistemaVendas.listarGruposDispositivosGestao();
        const lista = Array.isArray(r.groups)? r.groups : [];
        const texto = lista.length
           ? '🔗 *GRUPOS → DISPOSITIVOS*\n━━━━━━━━━━\n' +
              lista.map((g, i) =>
                  `${i + 1}. ${g.group_id}\n🆔 ${g.android_id}\n📦 Slot: ${g.slot || '—'}/2\n📌 ${g.status || '—'}\n`
              ).join('\n')
            : '🔗 *GRUPOS → DISPOSITIVOS*\n\nNenhum grupo associado.';
        await sock.sendMessage(from, { text: texto });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Não foi possível listar as associações.\n📝 ${e.message}`
        });
    }
    return;
}

// ============================================================
// VALIDADE GLOBAL
// Grupo sem validade: somente.ativar é permitido.
// ============================================================
if (isGroup &&!grupoComValidadeAtiva(from)) {
    await sock.sendMessage(from, {
        text: '⚠️ Este grupo não possui uma ativação válida.\n\nSomente um gestor Lacoste pode usar.ativar 8D.'
    });
    return;
}

if (comando === "dono") {
    await sock.sendMessage(from, {
        text: "GESTÃO LACOSTE\n" +
            "Responsáveis pelo sistema:\n" +
            "• +258 83 355 2729\n" +
            "• +258 84 839 5255"
    });
    return;
}

if (comando === "botinfo") {
    await sock.sendMessage(from, {
        text: "LACOSTE AUTO\n" +
            "Sistema de gestão de grupos, vendas e automação.\n" +
            "Versão: Lacoste V7\n" +
            "Motor: Baileys / Node.js\n" +
            "Use .menu para abrir a central."
    });
    return;
}

if (comando === "statusbot") {
    const memoria = process.memoryUsage();
    await sock.sendMessage(from, {
        text: "STATUS DO BOT\n\n" +
            `Processo: online\n` +
            `Uptime: ${formatarUptimeLacoste(process.uptime())}\n` +
            `Memória: ${Math.round(memoria.rss / 1024 / 1024)} MB`
    });
    return;
}

if (comando === "uptime") {
    await sock.sendMessage(from, {
        text: `Lacoste está online há ${formatarUptimeLacoste(process.uptime())}.`
    });
    return;
}

if (comando === "hora") {
    await sock.sendMessage(from, {
        text: `Hora do servidor: ${new Date().toLocaleTimeString("pt-PT")}`
    });
    return;
}

if (comando === "data") {
    await sock.sendMessage(from, {
        text: `Data atual: ${new Date().toLocaleDateString("pt-PT")}`
    });
    return;
}

if (comando === "admins") {
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: "Este comando é exclusivo de grupos."
        });
        return;
    }

    const meta = await sock.groupMetadata(from);
    const adminsGrupo = meta.participants.filter(p => p.admin);

    const linhas = adminsGrupo.map((p, i) => {
        const id = p.id || "";
        return `${i + 1}. @${id.split("@")[0].split(":")[0]}`;
    });

    await sock.sendMessage(from, {
        text: `ADMINISTRADORES — ${meta.subject}\n\n${linhas.join("\n") || "Nenhum encontrado."}`,
        mentions: adminsGrupo.map(p => p.id)
    });
    return;
}

    const meta = await sock.groupMetadata(from);
    await sock.sendMessage(from, {
        text: `GRUPO\n\nNome: ${meta.subject}\nMembros: ${meta.participants.length}\nID: ${from}`
    });
    return;
}

if (comando === "info") {
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: `Conversa atual:\n${from}`
        });
        return;
    }

    const meta = await sock.groupMetadata(from);
    const adminsGrupo = meta.participants.filter(p => p.admin).length;

    await sock.sendMessage(from, {
        text: `INFORMAÇÕES\n` +
            `Grupo: ${meta.subject}\n` +
            `Membros: ${meta.participants.length}\n` +
            `Administradores: ${adminsGrupo}`
    });
    return;
}

if (comando === "link") {
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: "O link de convite só pode ser obtido em grupos."
        });
        return;
    }

    try {
        const codigo = await sock.groupInviteCode(from);
        await sock.sendMessage(from, {
            text: `LINK DO GRUPO\nhttps://chat.whatsapp.com/${codigo}`
        });
    } catch (e) {
        await sock.sendMessage(from, {
            text: "Não consegui obter o convite. Verifique se o bot é administrador."
        });
    }
    return;
}

if (comando === "regras") {
    await sock.sendMessage(from, {
        text: "REGRAS SUGERIDAS\n" +
            "1. Respeitar todos os membros.\n" +
            "2. Evitar spam e conteúdo fora do objetivo do grupo.\n" +
            "3. Não enviar links sem autorização.\n" +
            "4. Seguir as orientações dos administradores."
    });
    return;
}

if (comando === "suporte") {
    await sock.sendMessage(from, {
        text: "SUPORTE LACOSTE\n\n" +
            "Gestão: +258 83 355 2729\n" +
            "Alternativo: +258 84 839 5255\n\n" +
            "Explique o problema e envie o erro completo."
    });
    return;
}

if (comando === "comandos") {
    await sock.sendMessage(from, {
        text: "CENTRAL RÁPIDA\n" +
            ".menu — painel principal\n" +
            ".dono — gestores\n" +
            ".statusbot — estado do bot\n" +
            ".uptime — tempo online\n" +
            ".info — dados do grupo\n" +
            ".admins — administradores\n" +
            ".link — convite\n" +
            ".regras — regras\n" +
            ".suporte — atendimento\n" +
            ".ativar 8D — ativação do gestor"
    });
    return;
}

// ============================================================
// SISTEMA DE VENDAS / RCBD
// ============================================================

const vendasProcessado =
    await sistemaVendas.processar(
        sock,
        data,
        body
    );

if (vendasProcessado) {
    return;
}

if (comando === 'auto') {
    const from = data.from;
    const sender = data.sender;

    // VERIFICAR SE É ADMIN
    if (from.endsWith('@g.us')) {
        const metadata = await sock.groupMetadata(from);
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
        if (!admins.includes(sender)) {
            await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
            return;
        }
    }

    // PEGAR STATUS DA AUTOMACAO DIRETO DO JSON
    const fs = require('fs');
    const pathAutomacao = "./data/automacao.json";
    let ativa = "OFF ❌";
    try {
        if (fs.existsSync(pathAutomacao)) {
            const dados = JSON.parse(fs.readFileSync(pathAutomacao, "utf8"));
            if (dados[from] === true) ativa = "ON ✅";
        }
    } catch(e){}

    const menu = `━━━━━━━━━━━
🤖 *MENU SISTEMA Lacoste Auto*
━━━━━━━━━━━

*1. PACOTES E SALDO*

.addpacote 100MT 400MB - Cadastrar pacote
.addsaldo 100MT 100 - Cadastrar saldo

*2. ENVIO MANUAL*

.enviar 400 848237040 - Enviar MB
.saldo 100 848237040 - Enviar saldo

*3. AUTOMAÇÃO*

.auto - Mostrar este menu
.automacao on - Ligar auto
.automacao off - Desligar auto
.automacao status - Ver status
*Status atual:* ${ativa}

*4. FILA*

.pedidos - Ver pedidos na fila

━━━━━━━━━━━
_Qualquer dúvida fala com o admin_`;

    await sock.sendMessage(from, { text: menu });
    return;
}

        // =========================
        // COMANDO MEUID
        // =========================

        if (cmd.toLowerCase() === 'meuid') {

            const grupo =
                from.endsWith('@g.us');

            if (!grupo) {

                await sock.sendMessage(
                    from,
                    {
                        text:
                            '❌ Este comando funciona apenas em grupos.',
                        mentions: [sender],
                        contextInfo: {
                            stanzaId: msg.key.id,
                            participant: sender,
                            quotedMessage: msg.message
                        }
                    }
                );

                return;
            }

            const metadata =
                await sock.groupMetadata(from);

            const admins =
                metadata.participants
                    .filter(
                        p =>
                            p.admin === 'admin' ||
                            p.admin === 'superadmin'
                    )
                    .map(
                        p =>
                            p.id.split(':')[0]
                    );

            const senderId =
                (
                    msg.key.participant ||
                    msg.key.remoteJid
                )?.split(':')[0];

            if (!admins.includes(senderId)) {

                await sock.sendMessage(
                    from,
                    {
                        text:
                            '❌ Apenas administradores podem usar este comando!',
                        mentions: [sender],
                        contextInfo: {
                            stanzaId: msg.key.id,
                            participant: sender,
                            quotedMessage: msg.message
                        }
                    }
                );

                return;
            }

            await sock.sendMessage(
                from,
                {
                    text:
                        `🆔 ID do grupo:\n${from}`,
                    mentions: [sender],
                    contextInfo: {
                        stanzaId: msg.key.id,
                        participant: sender,
                        quotedMessage: msg.message
                    }
                }
            );

            return;
        }

        console.log('2');

        // =========================
        // CARREGAR SISTEMAS
        // =========================

        const nano =
            carregarNano();

        console.log('nano OK');

        const gatilhos =
            carregarGatilhos();

        console.log('gatilhos OK');

        const anticoncorrencia =
            carregarAnticoncorrencia();

        console.log(
            'anticoncorrencia OK'
        );

        const concorrentes =
            carregarConcorrentes();

        console.log(
            'concorrentes OK'
        );

        console.log('3');

        const nanoStatus =
            nano[from] === 'on';

        const anticoncorrenciaStatus =
            anticoncorrencia[from] === 'on';

        console.log('3');

        // =========================
        // PING
        // =========================

        if (cmd.toLowerCase() === 'ping') {

            await sock.sendMessage(
                from,
                {
                    react: {
                        text: '🐊',
                        key: msg.key
                    }
                }
            );

            return;
        }

        // =========================
        // CONFIG GERAL
        // =========================

        let avisosDB = {};
        let modoBot = 'publico';

        // =========================
        // PEGA ID SEJA POR @
        // OU COLANDO ID
        // =========================

        function getTargetIid(msg, body) {

            if (
                msg.mentionedJid &&
                msg.mentionedJid[0]
            ) {
                return msg.mentionedJid[0];
            }

            const match =
                body.match(/(\d+@lid)/);

            return match
                ? match[1]
                : null;
        }

// COMANDO:.adicionar - versão final que pega multilinha
  switch (true) {

case ['addmpesa', 'addmola', 'contas', 'delmpesa', 'delmola'].includes(comando): {
  try {
    await sistemaContas(sock, msg, comando, args);
  } catch (err) {
    console.error('Erro no sistema de contas:', err);
    await sock.sendMessage(from, {
      text: '❌ Falhou ao processar a conta. Tenta outra vez no formato:\n`.addmpesa 84xxxxxxx-Nome`\n`.addmola 87xxxxxxx-Nome`',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

case cmd.toLowerCase().split('\n')[0] === 'adicionar': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, { text: '❌ Só funciona em grupos.', mentions: [sender], contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message } });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants.filter(p => p.admin === "admin" || p.admin === "superadmin").map(p => p.id);
  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, { text: '❌ Só admin pode usar.', mentions: [sender], contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message } });
    break;
  }

  const args = body.split('\n').slice(1).map(l => l.trim()).filter(l => l);

  if (!args.length) {
    await sock.sendMessage(from, { text: '❌ Use:\n.adicionar\n+258 84 916 7852', mentions: [sender], contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message } });
    break;
  }

  let adicionados = [];
  let falhou = [];

  for (let num of args) {
    num = num.replace(/[^0-9]/g, '');
    if (!num.startsWith('258')) num = '258' + num;
    const jid = num + '@s.whatsapp.net';

    try {
      await sock.groupParticipantsUpdate(from, [jid], 'add');
      adicionados.push(num);
    } catch (e) {
      falhou.push(num);
    }
  }

  let texto = '';
  if (adicionados.length) texto += `✅ Adicionados: ${adicionados.length}\n${adicionados.map(n => `✅ ${n}`).join('\n')}\n\n`;
  if (falhou.length) texto += `❌ Falhou: ${falhou.length}\n${falhou.map(n => `❌ ${n}`).join('\n')}`;

  await sock.sendMessage(from, { text: texto || 'Nenhum número processado', mentions: [sender], contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message } });
  break;
}

// =========================
// COMANDOS DONOS LACOSTE AUTO
// =========================

case 'adddono':
case 'adicionar_dono': {
    await sistemaVendas.comandoAdicionarDono(sock, data, args); // <- troquei aqui
    return;
}

case 'removerdono':
case 'remdono': {
    await sistemaVendas.comandoRemoverDono(sock, data, args);
    return;
}

case 'donos':
case 'listdonos': {
    await sistemaVendas.comandoDonos(sock, data);
    return;
}

// ============================================================
// COMANDO.CONECTAR
// Exemplo:
//.conectar 258841234567
// ============================================================
case comando === 'conectar': {

    const numero = args[0];

    if (!numero) {
        await sock.sendMessage(
            from,
            {
                text:
`❌ *NÚMERO NÃO INFORMADO*

Use assim:

.conectar 258XXXXXXXXX

Exemplo:

.conectar 258841234567`
            }
        );
        break;
    }

    const numeroLimpo = String(numero).replace(/[^0-9]/g, '');

    if (!numeroLimpo.startsWith('258')) {
        await sock.sendMessage(
            from,
            {
                text:
`❌ *NÚMERO INVÁLIDO*

Use o número com DDI 258.

Exemplo:

.conectar 258841234567`
            }
        );
        break;
    }

    await sock.sendMessage(
        from,
        {
            text:
`🔄 *A CONECTAR...*

Número:
${numeroLimpo}

Aguarde enquanto gero o código de parelhamento...`
        }
    );

    try {

        const resultado = await conectarNovoNumero(numeroLimpo);

        if (!resultado.ok) {
            await sock.sendMessage(
                from,
                {
                    text:
`❌ *ERRO AO GERAR CÓDIGO*

${resultado.erro}`
                }
            );
            break;
        }

        try {
          if (sistemaVendas.publicarCodigoPareamento) {
            await sistemaVendas.publicarCodigoPareamento({
              numero: resultado.numero,
              codigo: resultado.codigo,
              sessao: resultado.sessao
            });
          }
        } catch (e) { console.log('pub codigo', e.message); }

        await sock.sendMessage(
            from,
            {
                text:
`✅ *CÓDIGO DE PARELHAMENTO*

📱 Número:
${resultado.numero}

🔐 Código:
*${resultado.codigo}*

━━━━━━━━━━━━━━━━━━
Para conectar:
1. Abra o WhatsApp
2. Vá em *Aparelhos conectados*
3. Clique em *Conectar aparelho*
4. Escolha conectar usando número
5. Digite o código acima
━━━━━━━━━━━━━━━━━━
📂 Sessão:
${resultado.sessao}`
            }
        );

    } catch (error) {
        console.error('Erro comando conectar:', error);
        await sock.sendMessage(
            from,
            {
                text:
`❌ Ocorreu um erro ao criar a conexão.

${error.message}`
            }
        );
    }

    break;
}

// ============================================================
// COMANDO.QR - GERAR QR CODE NO GRUPO
// Exemplo:.qr
// ============================================================
case comando === 'qr': {

    await sock.sendMessage(
        from,
        {
            text:
`📷 *GERANDO QR CODE...*

Aguarde @${sender.split('@')[0]} 🍷
O QR vai aparecer em imagem aqui no grupo`,
            mentions: [sender]
        }
    );

    try {

        const resultadoQR = await conectarViaQR(sock, from, sender);

        if (!resultadoQR.ok) {
            await sock.sendMessage(
                from,
                {
                    text:
`❌ *ERRO AO GERAR QR*

${resultadoQR.erro}`
                }
            );
        }

    } catch (error) {
        console.error('Erro comando qr:', error);
        await sock.sendMessage(
            from,
            {
                text:
`❌ Ocorreu um erro ao gerar QR.

${error.message}`
            }
        );
    }

    break;
}

// ============================================================
// COMANDO .SESSOES
// ============================================================

case comando === 'sessoes': {

    const SESSIONS_DIR =
        './sessions';


    if (!fs.existsSync(SESSIONS_DIR)) {

        await sock.sendMessage(
            from,
            {
                text:
                    '📱 Nenhuma sessão encontrada.'
            }
        );

        break;

    }


    const sessoes =
        fs.readdirSync(SESSIONS_DIR)
            .filter(
                s =>
                    s.startsWith('session-')
            );


    if (!sessoes.length) {

        await sock.sendMessage(
            from,
            {
                text:
                    '📱 Nenhuma sessão encontrada.'
            }
        );

        break;

    }


    let texto =
        '📱 *SESSÕES DO BOT*\n\n';


    for (const sessao of sessoes) {

        const caminho =
            `${SESSIONS_DIR}/${sessao}`;


        const status =
            activeSockets.has(caminho)
                ? '🟢 Online'
                : '🔴 Offline';


        texto +=
            `▪️ ${sessao}\n${status}\n\n`;

    }


    await sock.sendMessage(
        from,
        {
            text: texto
        }
    );


    break;

}

// ============================================================
// COMANDO .DESCONectar — remove uma sessão QR/PAIRING
// ============================================================
case comando === 'desconectar': {
    if (!(await ehGestorLacosteRobusto(sock, data))) {
        await sock.sendMessage(from, { text: '❌ Este comando é exclusivo dos gestores Lacoste.' });
        break;
    }

    let alvo = String(args?.[0] || '').trim();
    if (alvo && /^\d+$/.test(alvo)) alvo = `session-${alvo}`;

    if (!alvo || !alvo.startsWith('session-') || alvo.includes('/') || alvo.includes('\\') || alvo.includes('..')) {
        await sock.sendMessage(from, {
            text: '❌ Use: .desconectar session-1\n\nTambém pode usar: .desconectar 1\n\nVeja primeiro com .sessoes.'
        });
        break;
    }

    const caminho = `./sessions/${alvo}`;
    if (!fs.existsSync(caminho)) {
        await sock.sendMessage(from, { text: `❌ Sessão não encontrada: ${alvo}` });
        break;
    }

    try {
        apagarSessao(caminho);
        await sock.sendMessage(from, {
            text: `🗑️ *SESSÃO ELIMINADA*\n\n📁 ${alvo}\n🔴 A sessão foi removida do armazenamento.\n\nPara ligar novamente, crie uma nova sessão com QR/código.`
        });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Não foi possível eliminar ${alvo}.\n📝 ${e.message}` });
    }
    break;
}

// COMANDO: .menu
case comando === 'menu': {
  const textoMenu = `
╭═══✦「 🐊 *LACOSTE V7*   ✦═══╮
│  🤖 *O bot mais brabo de Moz* 🇲🇿. │
╰═══════════════════════╯

┏━━━👑 *ADMINISTRAÇÃO* ━━━┓
┃
┣ 🔨 .ban @user / 258xxx
┣ 🔓 .grupo a → Abre o grupo
┣ 🔒 .grupo f → Fecha o grupo  
┣ 🧹 .limpar → Limpa o chat
┣ 🛡️ .antilink on/off
┣ 🖼️ .antifoto on/off
┣ 🎬 .antivideo on/off
┣ 🎵 .antiaudio on/off
┣ 📱 .antistatus on/off
┣ 🔍 .detector on/off → Anti-fake
┣ 📊 .status → Status do grupo
┣ ⬆️ .promover → Dá admin
┣ ⬇️ .demote → Tira admin
┣ 🆔 .pp → Ver cargo de admin
┣ 👤 .p → Ver tua posição
┣ ⏰ .alarme → Abrir/fechar auto
┣ ➕ .adicionar → Add vários números
┃
┣━━━💰 *CONTAS E-MOLA / M-PESA* ━━━┫
┃
┣ ➕ .addmpesa → Add conta M-Pesa
┣ ➕ .addmola → Add conta E-Mola
┣ 📋 .contas → Ver contas do grupo
┣ ➖ .delmpesa 1 → Remove M-Pesa
┣ ➖ .delmola 1 → Remove E-Mola
┃
┣━━━🚫 *ANTI-CONCORRÊNCIA* ━━━┫
┃
┣ 🛡️ .anticoncorrencia on/off
┣ ➕ .addconcorrente 123@lid
┣ ➖ .removeconcorrente 123@lid
┣ 🔎 .certificarconcorencia
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━🎉 *BOAS-VINDAS* ━━━┓
┃
┣ ✍️ .bsvindo <msg> → Define texto
┣ 🔔 .bemvindo on/off → Ativa/desativa
┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━🧠 *SISTEMA NANO* ━━━┓
┃
┣ 🤖 .nanoativar on/off
┣ ➕ .nanoadd gatilho,resposta
┣ ➖ .nanodel gatilho
┣ 📜 .listanano → Ver todos
┣ 🗑️ .limparnanos → Apaga tudo
┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━🛒 *VENDAS MB/GB/SALDO* ━━━┓
┃
┣ 🛍️ .compras on mb,gb,saldo
┣ 👥 .clientes → Lista clientes
┣ ✅ .compra 620mb → Registra venda
┣ ❌ .anular → Anula compra
┣ 📦 .pacotes → Ver pacotes
┣ 🗑️ .addeliminar 20 → Desativar pacote
┣ ♻️ .addrestaurar 20 → Restaurar pacote
┣ 👛 .carteira → Ver carteira
┣ ➕ .depositar 20 → Creditar (responde à pessoa)
┣ ➕ .depositar @user 20
┣ ➖ .retirar 20 / .retirar @user 20
┣ 🗑️ .remover → Anula pendente + tira MT
┣ 🔄 .resetcompras → Zera tudo
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━👻 *CONTROLE MEMBROS* ━━━┓
┃
┣ 📢 .todos → Marca geral
┣ 💤 .rentanas → Sem compras
┣ 👻 .fantasmas 10 → Remove inativos
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━💡 *EXEMPLOS RÁPIDOS* ━━━┓
┃
┣ 📌 .compra 620mb *resp. cliente*
┣ 📌 .fantasmas 10
┣ 📌 .ban @usuario
┣ 📌 .nanoadd oi,Olá 👋
┣ 📌 .todos promoção hoje 🔥
┣ 📌 .delmpesa 1
┣ 📌 .addconcorrente 123@lid
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛

👑 *GESTÃO LACOSTE*
┣ 📢 .broadcast mensagem → Envia aviso para todos os grupos
┣ 📋 .licencas
┣ 📱 .dispositivos
┣ 🔗 .associar ANDROID_ID
┣ ❌ .desassociar
┣ 📡 .statusdispositivo
┣ 🔗 .gruposdispositivo
┣ 📱 .sessoes → Ver sessões
┣ 🗑️ .desconectar 1 → Eliminar sessão
┣ ✅ .aprovar ID 30
┣ 🛑 .rejeitar ID motivo

⚙️ *LACOSTE V7 ATIVO* 🐊
*COMANDOS PRINCIPAIS*
⏳ Dias restantes: .bot pra ver
🇲🇿 *Feito pra Moz, por Moz*
`;

  await sock.sendMessage(from, {
    text: textoMenu,
    mentions: [sender],
    contextInfo: {
      stanzaId: msg.key.id,
      participant: sender,
      quotedMessage: msg.message
    }
  });

  break;
}

// COMANDO: .nanoativar
case cmd.toLowerCase().startsWith('nanoativar'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const arg = cmd.split(' ')[1]?.toLowerCase();
  if (arg === 'on') {
    nano[from] = 'on';
    salvarNano(nano);
    await sock.sendMessage(from, {
      text: '🤖 ✅ Sistema de nano Lacoste *ATIVADO* neste grupo!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else if (arg === 'off') {
    nano[from] = 'off';
    salvarNano(nano);
    await sock.sendMessage(from, {
      text: '🤖 ❌ Sistema de nanocomandos *DESATIVADO* neste grupo!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else {
    await sock.sendMessage(from, {
      text: '❌ Use .nanoativar on ou .nanoativar off',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .nanoadd
case cmd.toLowerCase().startsWith('nanoadd'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = (msg.key.participant || msg.key.remoteJid);

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

if (!nanoStatus) {
    await sock.sendMessage(from, {
      text: '❌ O filtro de nano comandos não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

// IMPORTANTE: usar 'raw' (texto original) para a RESPOSTA manter maiúsculas/minúsculas
  // 'cmd' já vem em minúsculas e estava a destruir a capitalização.
  const rawSemPonto = (typeof raw === 'string' ? raw : body || '').replace(/^\./, '');
  const addArgsRaw = rawSemPonto.replace(/^nanoadd\s*/i, '').trim();
  const splitAdd = addArgsRaw.split(',');
  if (splitAdd.length < 2) {
    await sock.sendMessage(from, {
      text: '❌ Formato incorreto. Use: .nanoadd gatilho,resposta',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
   }

  const gatilho = splitAdd[0].trim().toLowerCase(); // gatilho em minúsculas só para match

  const resposta = splitAdd.slice(1).join(',').trim(); // RESPOSTA com capitalização original

  if (!gatilhos[from]) gatilhos[from] = {};
  gatilhos[from][gatilho] = resposta;
  salvarGatilhos(gatilhos);

  await sock.sendMessage(from, {
    text: `🤖 ✅ Nano comando criado/atualizado:\nGatilho: *${gatilho}*\nResposta: *${resposta}*`,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}
// COMANDO: .nanodel
case cmd.toLowerCase().startsWith('nanodel'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = (msg.key.participant || msg.key.remoteJid);

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!nanoStatus) {
    await sock.sendMessage(from, {
      text: '❌ O filtro de nano comandos não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const delGatilho = cmd.slice('nanodel'.length).trim().toLowerCase();

  if (gatilhos[from]?.[delGatilho]) {
    delete gatilhos[from][delGatilho];
    salvarGatilhos(gatilhos);
    await sock.sendMessage(from, {
      text: `🤖 ✅ Nano comando removido: *${delGatilho}*`,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else {
    await sock.sendMessage(from, {
      text: `❌ O gatilho *${delGatilho}* não foi encontrado neste grupo.`,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .listanano
case cmd.toLowerCase() === 'listanano': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = (msg.key.participant || msg.key.remoteJid);

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!nanoStatus) {
    await sock.sendMessage(from, {
      text: '❌ O filtro de nano comandos não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const lista = gatilhos[from] ? Object.keys(gatilhos[from]) : [];
  if (lista.length === 0) {
    await sock.sendMessage(from, {
      text: '❌ Nenhum nano comando registrado neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else {
    await sock.sendMessage(from, {
      text: `🤖 ✅ Lista de nano comandos deste grupo:\n- ${lista.join('\n- ')}`,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .limparnanos
case cmd.toLowerCase() === 'limparnanos': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = (msg.key.participant || msg.key.remoteJid);

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!nanoStatus) {
    await sock.sendMessage(from, {
      text: '❌ O filtro de nano comandos não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (gatilhos[from]) {
    delete gatilhos[from];
    salvarGatilhos(gatilhos);
    await sock.sendMessage(from, {
      text: '🤖 ✅ Todos os nano comandos deste grupo foram apagados.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else {
    await sock.sendMessage(from, {
      text: '❌ Não há nano comandos para apagar neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}
  
// COMANDO: .anticoncorrencia
case cmd.toLowerCase().startsWith('anticoncorrencia'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const adminsAC = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderAC = (msg.key.participant || msg.key.remoteJid);

  if (!adminsAC.includes(senderAC)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const argAC = cmd.split(' ')[1]?.toLowerCase();
  if (argAC === 'on') {
    anticoncorrencia[from] = 'on';
    salvarAnticoncorrencia(anticoncorrencia);
    await sock.sendMessage(from, {
      text: '🤖 ✅ anticoncorrencia *ativado* neste grupo!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else if (argAC === 'off') {
    anticoncorrencia[from] = 'off';
    salvarAnticoncorrencia(anticoncorrencia);
    await sock.sendMessage(from, {
      text: '🤖 ❌ anticoncorrencia *desativada* neste grupo!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  } else {
    await sock.sendMessage(from, {
      text: '❌ Use .anticoncorrencia on ou .anticoncorrencia off',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .addconcorrente
case cmd.toLowerCase().startsWith('addconcorrente'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

  if (!admins.includes(sender)) {
    await sock.sendMessage(from, {
      text: '❌ Este comando só pode ser usado por administradores.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!anticoncorrenciaStatus) {
    await sock.sendMessage(from, {
      text: '🤖 ❌ o filtro anticoncorrência não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const listaRaw = cmd.replace('addconcorrente', '').trim();

  if (!listaRaw) {
    await sock.sendMessage(from, {
      text: '🤖 ❌ informe os lids dos concorrentes separados por vírgula.\n\nexemplo:\n.addconcorrente 49362159841324,203744927047837,174126597689350',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const lista = listaRaw
    .split(',')
    .map((x) => x.replace(/[^0-9]/g, '').trim())
    .filter((x) => x.length > 6);

  if (lista.length === 0) {
    await sock.sendMessage(from, {
      text: '🤖 ❌ nenhum número válido de concorrente foi detectado.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!concorrentes || typeof concorrentes !== 'object') {
    concorrentes = {};
  }

  let adicionados = 0;
  let repetidos = 0;

  for (const lid of lista) {
    const jidFinal = `${lid}@lid`;

    if (concorrentes[jidFinal]) {
      repetidos++;
    } else {
      concorrentes[jidFinal] = true;
      adicionados++;
    }
  }

  salvarConcorrentes(concorrentes);

  try {
    await sock.sendMessage(from, {
      delete: {
        remoteJid: from,
        id: msg.key.id,
        participant: msg.key.participant
      }
    });
    console.log('🗑 mensagem do usuário apagada (comando addconcorrente).');
  } catch (err) {
    console.log('⚠️ não foi possível apagar a mensagem do usuário:', err?.message || err);
  }

  await sock.sendMessage(from, {
    text:
      `🤖 ✅ processo concluído.\n\n` +
      `📥 total de números enviados:  *${lista.length}*\n` +
      `🟢 concorrentes adicionados: *${adicionados}*\n` +
      `🟡 já estavam na lista: *${repetidos}*\n\n` +
      `✔️ todos os números válidos foram registrados como concorrentes no sistema `,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}


// COMANDO: removeconcorrente
case cmd.toLowerCase().startsWith('removeconcorrente'): {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ Este comando funciona apenas em grupos.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const metadata = await sock.groupMetadata(from).catch(() => null);
    const admins = metadata?.participants
        .filter(p => p.admin !== null)
        .map(p => p.id);

    if (!admins.includes(sender)) {
        await sock.sendMessage(from, {
            text: '❌ Este comando só pode ser usado por administradores.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    if (!anticoncorrenciaStatus) {
        await sock.sendMessage(from, {
            text: '❌ Filtro anticoncorrencia não está ativo neste grupo.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    try {
        let concorrentes = {};
        if (fs.existsSync(pathConcorrentes)) {
            concorrentes = JSON.parse(fs.readFileSync(pathConcorrentes, "utf-8"));
        }

        const args = cmd.split(" ")[1];

        if (!args) {
            const adminsGrupo = metadata.participants
                .filter(p => p.admin === "admin" || p.admin === "superadmin")
                .map(p => p.id);

            let removidos = 0;

            for (const admin of adminsGrupo) {
                if (concorrentes[admin]) {
                    delete concorrentes[admin];
                    removidos++;
                }
            }

            salvarConcorrentes(concorrentes);

            await sock.sendMessage(from, {
                text:
                    `🤖 ✅ Remoção concluída!\n\n` +
                    `🧹 Administradores removidos da lista: *${removidos}*`,
                mentions: [sender],
                contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
            });
            break;
        }

        // 🔹 SE FOR ID DE GRUPO
        if (args.endsWith('@g.us')) {
            const grupoId = args.trim();
            const grupoInfo = await sock.groupMetadata(grupoId).catch(() => null);

            if (!grupoInfo) {
                await sock.sendMessage(from, {
                    text: '❌ Grupo não encontrado ou bot não está nele.',
                    mentions: [sender],
                    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
                });
                break;
            }

            let removidos = 0;

            for (const membro of grupoInfo.participants) {
                const lid = membro.id.endsWith('@lid')
                    ? membro.id
                    : membro.id.replace(/@s\.whatsapp\.net$/, '') + '@lid';

                if (concorrentes[lid]) {
                    delete concorrentes[lid];
                    removidos++;
                }
            }

            salvarConcorrentes(concorrentes);

            await sock.sendMessage(from, {
                text:
                    `🤖 ✅ Remoção por grupo concluída!\n\n` +
                    `🧹 Concorrentes removidos: *${removidos}*`,
                mentions: [sender],
                contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
            });
            break;
        }

        // 🔹 REMOÇÃO INDIVIDUAL (LID)
        const numeroRaw = args.trim();
        const numeroLimpo = numeroRaw.replace(/[^0-9]/g, '');
        const formatoLid = numeroRaw.endsWith("@lid")
            ? numeroRaw
            : `${numeroLimpo}@lid`;

        if (concorrentes[formatoLid]) {
            delete concorrentes[formatoLid];
            salvarConcorrentes(concorrentes);

            await sock.sendMessage(from, {
                text: `🤖 ✅ Concorrente removido da lista de concorrentes.`,
                mentions: [sender],
                contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
            });
        } else {
            await sock.sendMessage(from, {
                text: `❌ O número não está na lista de concorrentes.`,
                mentions: [sender],
                contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
            });
        }

    } catch (err) {
        console.error("❌ Erro ao remover concorrente:", err);
        await sock.sendMessage(from, {
            text: `❌ Erro ao executar o comando.`,
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
    }

    break;
}
// COMANDO: .certificarconcorencia
case cmd.toLowerCase().startsWith('certificarconcorencia'): {
    console.log("\n------------------ CERTIFICARCONCORRENCIA ------------------");
    console.log("📌 Grupo (from):", from);

    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ Este comando funciona apenas em grupos.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const metadata = await sock.groupMetadata(from).catch(() => null);
    const admins = metadata?.participants
        .filter(p => p.admin !== null)
        .map(p => p.id);

    if (!admins.includes(sender)) {
        await sock.sendMessage(from, {
            text: '❌ Este comando só pode ser usado por administradores.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    if (!anticoncorrenciaStatus) {
        await sock.sendMessage(from, {
            text: '❌ O filtro anticoncorrência não está ativo neste grupo.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    try {
        const lista = concorrentes; 
        console.log("📂 Concorrentes registrados no arquivo:", lista);

        if (Object.keys(lista).length === 0) {
            await sock.sendMessage(from, {
                text: '🤖 ✅ Nenhum número registrado como concorrente no JSON.',
                mentions: [sender],
                contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
            });
            console.log("⚠️ Nenhum concorrente registrado no JSON.");
            break;
        }

        const participantes = metadata.participants.map(p => p.id);
        console.log("👥 Participantes do grupo:", participantes);

        const encontrados = [];

        for (const membro of participantes) {
            console.log(`\n🔍 Verificando membro: ${membro}`);

            const match = lista[membro] === true;
            console.log("🔎 Achou concorrente?", match);

            if (match) {
                encontrados.push(membro);
            }
        }

        console.log("\n📌 Concorrentes encontrados no grupo:", encontrados);

        if (encontrados.length === 0) {
            await sock.sendMessage(from, {
                text: '🤖 ✅ Não há concorrentes presentes neste grupo no momento.',
                mentions: [sender],
                contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
            });
            break;
        }

        const texto =
            '⚠️ *Concorrentes detectados neste grupo!* ⚠️\n\n' +
            encontrados.map((id, i) => `🔹 ${i + 1}. @${id.split('@')[0]}`).join('\n') +
            '\n\n🔍 *Ação necessária!*';

        await sock.sendMessage(from, {
            text: texto,
            mentions: encontrados,
            contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
        });

    } catch (err) {
        console.error("🔥 Erro ao verificar os concorrentes:", err);
        await sock.sendMessage(from, {
            text: `❌ Ocorreu um erro ao verificar concorrentes: ${err.message}`,
            mentions: [sender],
            contextInfo: { stanzaId: msg.key?.id, participant: sender, quotedMessage: msg.message }
        });
    }

    console.log("------------------ certificarconcorencia concluído ✅️ ------------------\n");
    break;
}

// FUNÇÃO AUXILIAR
function getUserJid(p) {
    if (!p) return null;
    return p.id || p.jid || p.lid || null;
}

// COMANDO: .capturaconcorencia
case cmd.toLowerCase().startsWith("capturaconcorencia"): {
    console.log("\n---------------- CAPTURACONCORRENCIA ----------------");

    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ ESTE COMANDO FUNCIONA APENAS EM GRUPOS.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const metadata = await sock.groupMetadata(from).catch(() => null);
    const admins = metadata?.participants
        .filter(p => p.admin !== null)
        .map(p => getUserJid(p));

    if (!admins.includes(sender)) {
        await sock.sendMessage(from, {
            text: '❌ ESTE COMANDO SÓ PODE SER USADO POR ADMINISTRADORES.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const anticoncorrenciaStatus = JSON.parse(
        fs.existsSync(pathAnticoncorrencia)
            ? fs.readFileSync(pathAnticoncorrencia, "utf-8")
            : "{}"
    )[from] === "on";

    if (!anticoncorrenciaStatus) {
        await sock.sendMessage(from, {
            text: '❌ FILTRO ANTICORRENCIA NÃO ESTÁ ATIVO NESTE GRUPO.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const args = cmd.split(" ")[1];
    if (!args) {
        await sock.sendMessage(from, {
            text: '❌ INFORME O ID DO GRUPO E O MODO (GERAL/ADMIN). EXEMPLO:\n.capturaconcorencia 120363421228229250@g.us,admin',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const [groupId, modo] = args.split(",");
    if (!groupId || !modo || !["geral", "admin"].includes(modo.toLowerCase())) {
        await sock.sendMessage(from, {
            text: '❌ MODO INVÁLIDO. USE "GERAL" OU "ADMIN". EXEMPLO:\n.capturaconcorencia 120363421228229250@g.us,admin',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    console.log(`🔍 Capturando participantes do grupo: ${groupId} no modo: ${modo}`);

    try {
    const groupMeta = await sock.groupMetadata(groupId);
    if (!groupMeta) {
        await sock.sendMessage(from, {
            text: '❌ NÃO FOI POSSÍVEL OBTER INFORMAÇÕES DO GRUPO.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    const nomeGrupo = groupMeta.subject;
    const totalMembros = groupMeta.participants.length;

    let lids = [];
    if (modo.toLowerCase() === "admin") {
        lids = groupMeta.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => getUserJid(p));
    } else {
        lids = groupMeta.participants.map(p => getUserJid(p));
    }

    if (!lids.length) {
        await sock.sendMessage(from, {
            text: '❌ NENHUM PARTICIPANTE ENCONTRADO PARA O MODO SELECIONADO.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }

    let concorrentes = {};
    if (fs.existsSync(pathConcorrentes)) {
        concorrentes = JSON.parse(fs.readFileSync(pathConcorrentes, "utf-8"));
    }

    let adicionados = 0;
    let jaExistiam = 0;

    for (const lid of lids) {
        if (!concorrentes[lid]) {
            concorrentes[lid] = true;
            adicionados++;
        } else {
            jaExistiam++;
        }
    }

    fs.writeFileSync(pathConcorrentes, JSON.stringify(concorrentes, null, 2));

    const totalGlobal = Object.keys(concorrentes).length;

    await sock.sendMessage(from, {
        text:
`✅ *CAPTURA CONCLUÍDA*

📌 *Grupo:* ${nomeGrupo}
🆔 *ID:* ${groupId}
👥 *Total de membros:* ${totalMembros}

➕ *Adicionados agora:* ${adicionados}
♻️ *Já existiam:* ${jaExistiam}

🌍 *Base global:* ${totalGlobal} concorrentes`,
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

} catch (err) {
    console.error("❌ Erro ao capturar participantes:", err);
    await sock.sendMessage(from, {
        text: '❌ OCORREU UM ERRO AO CAPTURAR PARTICIPANTES.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
}

    break;
}

// COMANDO .BEMVINDO
case cmd.toLowerCase().startsWith('bemvindo'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

  if (!admins.includes(sender)) {
    await sock.sendMessage(from, {
      text: '❌ Este comando só pode ser usado por administradores.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  const opcao = cmd.split(' ')[1];

  if (!opcao || !['on', 'off'].includes(opcao.toLowerCase())) {
    await sock.sendMessage(from, {
      text: '❌ Use corretamente:\n\n.bemvindo on\n.bemvindo off',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  let bemvindoData = {};
  if (fs.existsSync(pathBemvindo)) {
    bemvindoData = JSON.parse(fs.readFileSync(pathBemvindo, 'utf-8') || '{}');
  }

  bemvindoData[from] = opcao.toLowerCase();

  fs.writeFileSync(pathBemvindo, JSON.stringify(bemvindoData, null, 2));

  await sock.sendMessage(from, {
    text:
      opcao.toLowerCase() === 'on'
        ? '🤖 ✅ Sistema de boas-vindas *Ativado* neste grupo.'
        : '🤖 ❌ Sistema de boas-vindas *Desativado* neste grupo.',
    mentions: [sender],
    contextInfo: {
      stanzaId: msg.key.id,
      participant: sender,
      quotedMessage: msg.message
    }
  });

  break;
}

// comando .bsvindo
case cmd.toLowerCase().startsWith('bsvindo'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

  if (!admins.includes(sender)) {
    await sock.sendMessage(from, {
      text: '❌ Este comando só pode ser usado por administradores.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const texto = cmd.replace(/^bsvindo/i, '').trim();

  if (!texto) {
    await sock.sendMessage(from, {
      text: '❌ Informe a mensagem de boas-vindas.\n\nExemplo:\n.bsvindo seja bem-vindo ao grupo @user',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  let data = {};
  if (fs.existsSync(pathPersonalizar)) {
    data = JSON.parse(fs.readFileSync(pathPersonalizar, 'utf-8') || '{}');
  }

  data[from] = texto;

  fs.writeFileSync(pathPersonalizar, JSON.stringify(data, null, 2));

  await sock.sendMessage(from, {
    text: '✅ Mensagem de boas-vindas personalizada com sucesso para este grupo.',
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}

// comando .ban
case cmd.toLowerCase().startsWith('ban'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    try {
      await sock.sendMessage(from, {
        text: '❌ este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    } catch {}
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  if (!metadata) break;

  const admins = metadata.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

  if (!admins.includes(sender)) {
    try {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado por administradores.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    } catch {}
    break;
  }

  let alvo = null;

  const quotedParticipant =
    msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (quotedParticipant) {
    alvo = quotedParticipant;
  } else {
    const mentioned =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

    if (mentioned?.length) {
      alvo = mentioned[0];
    } else {
      const num = cmd.split(' ')[1];
      if (num) {
        const limpo = num.replace(/\D/g, '');
        if (limpo.length > 5) {
          alvo = `${limpo}@s.whatsapp.net`;
        }
      }
    }
  }

  if (!alvo) {
    try {
      await sock.sendMessage(from, {
        text:
        '❌ Informe o número, mencione o usuário ou responda à mensagem.\n\n' +
        'Exemplos:\n' +
        '.ban @usuario\n' +
        '.ban 258852800194\n' +
        '(ou responda a mensagem)',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    } catch {}
    break;
  }

  try {
    await sock.groupParticipantsUpdate(from, [alvo], 'remove');

    try {
      await sock.sendMessage(from, {
        text: '🚫 Usuário removido do grupo.',
        mentions: [alvo],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    } catch {}

  } catch (err) {
    console.error('Erro no comando ban:', err);

    try {
      await sock.sendMessage(from, {
        text: '❌ Erro ao remover membro. Verifique se o bot é administrador.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    } catch {}
  }

  break;
}

// Comando grupo a/f
case cmd.toLowerCase().startsWith('grupo'): {
  const partes = cmd.split(',');
  const base = partes[0].trim();
  const motivo = partes.slice(1).join(',').trim();

  const arg = base.split(' ')[1]?.toLowerCase();
  if (!arg || !['a', 'f'].includes(arg)) {
    await sock.sendMessage(from, {
      text: '❌ Use corretamente:\n\n.grupo a -> Abre o grupo\n.grupo f -> Fecha o grupo',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const isGroup = from.endsWith('@g.us');
  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from);
  const admins = metadata.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = (msg.key.participant || msg.key.remoteJid);
  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  try {
    if (arg === 'a') {
      await sock.groupSettingUpdate(from, 'not_announcement');

      await sock.sendMessage(from, {
        text:
          `🤖 🔑 *Grupo aberto!*\n` +
          (motivo ? `📝 Motivo: ${motivo}` : ''),
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });

    } else if (arg === 'f') {
      await sock.groupSettingUpdate(from, 'announcement');

      await sock.sendMessage(from, {
        text:
          `🤖 🔐 *Grupo fechado!*\n` +
          (motivo ? `📝 Motivo: ${motivo}` : ''),
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
    }

  } catch (err) {
    console.error('Erro ao atualizar o grupo:', err);
    await sock.sendMessage(from, {
      text: '❌ Não foi possível atualizar as configurações do grupo. Verifique se o bot é admin.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .compras
case cmd.toLowerCase().startsWith('compras'): {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const sistema = carregarSistema();
    const args = cmd.split(' ').slice(1);

    if (!args[0]) {
      await sock.sendMessage(from, {
        text:
          '❌ Use:\n' +
          '.compras on (mb)\n' +
          '.compras on (gb)\n' +
          '.compras on (saldo)\n' +
          '.compras on (mb,gb,saldo)\n' +
          '.compras off',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    if (args[0].toLowerCase() === 'off') {
      delete sistema[from];
      salvarSistema(sistema);

      await sock.sendMessage(from, {
        text: '🤖 ❌ Sistema de compras *desativado* neste grupo.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    if (args[0].toLowerCase() === 'on') {
      const tipoRaw = args.slice(1).join(' ').trim();

      if (!tipoRaw.startsWith('(') || !tipoRaw.endsWith(')')) {
        await sock.sendMessage(from, {
          text:
            '❌ Especifique o tipo entre parênteses!\n\n' +
            'Exemplos:\n' +
            '.compras on (mb)\n' +
            '.compras on (gb)\n' +
            '.compras on (saldo)\n' +
            '.compras on (mb,gb,saldo)',
          mentions: [sender],
          contextInfo: {
            stanzaId: msg.key.id,
            participant: sender,
            quotedMessage: msg.message
          }
        });
        break;
      }

      const tipos = tipoRaw
        .replace(/[()]/g, '')
        .toLowerCase()
        .split(',')
        .map(t => t.trim());

      const tiposValidos = ['mb', 'gb', 'saldo'];
      const invalidos = tipos.filter(t => !tiposValidos.includes(t));

      if (invalidos.length > 0) {
        await sock.sendMessage(from, {
          text:
            '❌ Tipo(s) inválido(s): ' + invalidos.join(', ') + '\n\n' +
            'Use apenas:\n' +
            '(mb), (gb), (saldo) ou (mb,gb,saldo)',
          mentions: [sender],
          contextInfo: {
            stanzaId: msg.key.id,
            participant: sender,
            quotedMessage: msg.message
          }
        });
        break;
      }

      if (!sistema[from]) {
        sistema[from] = {
          status: 'on',
          tipos: {}
        };
      }

      sistema[from].status = 'on';

      let ativados = [];

      for (const tipo of tipos) {
        if (!sistema[from].tipos[tipo]) {
          sistema[from].tipos[tipo] = true;
          ativados.push(tipo.toUpperCase());
        }
      }

      salvarSistema(sistema);

      await sock.sendMessage(from, {
        text:
          ativados.length > 0
            ? `✅ Sistema de compras ativado para: *${ativados.join(', ')}*`
            : '⚠️ Todos os tipos informados já estavam ativos neste grupo.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });

      break;
    }

  } catch (err) {
    console.error('❌ Erro no comando compras:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao configurar o sistema de compras.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }

  break;
}


// COMANDO: .compra
case cmd.toLowerCase().startsWith('compra'): {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem registrar compras.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const sistema = carregarSistema();

    if (!sistema[from] || sistema[from].status !== 'on') {
      await sock.sendMessage(from, {
        text:
          '❌ O sistema de compras está desativado neste grupo.\n\n' +
          'Para ativar, envie:\n' +
          '.compras on (mb)\n' +
          '.compras on (gb)\n' +
          '.compras on (saldo)\n\n' +
          '*Apenas administradores podem ativar.*',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    let numeroComprador = null;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) numeroComprador = quoted;

    const argsRaw = cmd.replace(/^compra/i, '').trim();
    let quantidadeStr = null;

    if (argsRaw.includes(',')) {
      const partes = argsRaw.split(',');
      quantidadeStr = partes[0].trim();
      numeroComprador = partes[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    } else {
      quantidadeStr = argsRaw;
    }

    if (!numeroComprador || !quantidadeStr) {
      await sock.sendMessage(from, {
        text:
          '❌ Você precisa responder à mensagem do comprador ou informar o número.\n\n' +
          'Exemplos:\n' +
          '.compra 500MB (respondendo a mensagem)\n' +
          '.compra 620MB,258852800194',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const match = quantidadeStr.match(/^([\d.,]+)\s*(mb|gb|saldo)$/i);
    if (!match) {
      await sock.sendMessage(from, {
        text:
          '❌ Formato inválido.\n\n' +
          'Use:\n' +
          '.compra 500MB\n' +
          '.compra 1GB\n' +
          '.compra 50saldo',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const unidade = match[2].toLowerCase();

    if (!sistema[from].tipos?.[unidade]) {
      await sock.sendMessage(from, {
        text: `❌ O sistema de compras para (${unidade.toUpperCase()}) não está ativo neste grupo.`,
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const resultado = registrarCompraNoSistema(
      from,
      numeroComprador,
      quantidadeStr
    );

    await sock.sendMessage(from, {
      text: resultado.texto,
      mentions: [resultado.numeroComprador]
    });

  } catch (err) {
    console.error('❌ Erro no comando compra:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao registrar a compra.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .anular
case cmd.toLowerCase().startsWith('anular'): {
  try {
    // só em grupos
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    // verifica admin
    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem anular compras.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    // --- identificar comprador ---
    let comprador = null;

    // respondeu mensagem
    const quoted =
      msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) comprador = quoted;

    // argumentos
    const argsRaw = cmd.replace(/^anular/i, '').trim();
    let quantidadeStr = null;

    if (argsRaw.includes(',')) {
      const partes = argsRaw.split(',');
      quantidadeStr = partes[0].trim();

      const numLimpo = partes[1].replace(/[^0-9]/g, '');
      if (numLimpo) comprador = numLimpo;
    } else {
      quantidadeStr = argsRaw;
    }

    if (!comprador || !quantidadeStr) {
      await sock.sendMessage(from, {
        text:
          '❌ Use:\n' +
          '.anular 500MB (respondendo a mensagem)\n' +
          '.anular 1GB,258852800194\n' +
          '.anular 100saldo',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    // --- parse quantidade ---
    const match = quantidadeStr.match(/^([\d.,]+)\s*(mb|gb|saldo)$/i);
    if (!match) {
      await sock.sendMessage(from, {
        text: '❌ Formato inválido. Ex: .anular 1GB | .anular 100saldo',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const valor = parseFloat(match[1].replace(',', '.'));
    const unidade = match[2].toLowerCase();

    let quantidadeMB = 0;
    if (unidade === 'mb') quantidadeMB = Math.round(valor);
    if (unidade === 'gb') quantidadeMB = Math.round(valor * 1024);
    if (unidade === 'saldo') quantidadeMB = Math.round(valor);

    // --- ler compras ---
    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
    }

    if (!compras[from]) {
      await sock.sendMessage(from, {
        text: '❌ Este grupo não possui compras registradas.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    let compradorId = comprador;

    if (!compradorId.includes('@')) {
      const tentativas = [
        `${compradorId}@s.whatsapp.net`,
        `${compradorId}@lid`
      ];

      compradorId = tentativas.find(id => compras[from][id]);

      if (!compradorId) {
        compradorId = Object.keys(compras[from]).find(id =>
          id.endsWith('@lid') && id.includes(comprador)
        );
      }
    }

    if (!compradorId || !compras[from][compradorId]) {
      await sock.sendMessage(from, {
        text: '❌ Este usuário não possui compras registradas.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const user = compras[from][compradorId];

    if (unidade === 'mb' || unidade === 'gb') {
      if (user.Megas < quantidadeMB) {
        await sock.sendMessage(from, {
          text: '❌ O usuário não possui essa quantidade de MB para anular.',
          mentions: [sender],
          contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
      }
      user.Megas -= quantidadeMB;
    }

    if (unidade === 'saldo') {
      if (user.Saldo < quantidadeMB) {
        await sock.sendMessage(from, {
          text: '❌ O usuário não possui esse saldo para anular.',
          mentions: [sender],
          contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
      }
      user.Saldo -= quantidadeMB;
    }

    fs.writeFileSync(pathCompras, JSON.stringify(compras, null, 2));

    const numeroLimpo = compradorId.split('@')[0];

    await sock.sendMessage(from, {
      text:
`🤖 ✅ *Compra Anulada com Sucesso*
👤 Cliente: @${numeroLimpo}
➖ Valor removido: *${quantidadeStr.toUpperCase()}*
📊 Saldo atual:
• Megas: *${user.Megas}MB*
• Saldo: *${user.Saldo}*`,
      mentions: [compradorId, sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('❌ Erro no comando anular:', err);
    try {
      await sock.sendMessage(from, {
        text: '❌ Erro ao anular a compra.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
    } catch (_) {}
  }

  break;
}

// COMANDO: .clientes
case cmd.toLowerCase().startsWith('clientes'): {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem visualizar os clientes.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
    }

    if (!compras[from]) {
      await sock.sendMessage(from, {
        text: '❌ Não há clientes registrados neste grupo.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const converterMB = (mb) => {
      const gb = (mb / 1024).toFixed(2);
      const tb = (mb / 1048576).toFixed(2);
      return `• ${mb}MB\n• Convertido: ${gb}GB, ${tb}TB`;
    };

    const mentionIds = Object.keys(compras[from]);

    const rankingMB = Object.entries(compras[from])
      .filter(([_, data]) => Number(data.Megas) > 0)
      .sort((a, b) => b[1].Megas - a[1].Megas)
      .map(([id, data], index) =>
        `${index + 1}) @${id.split('@')[0]}\n${converterMB(Number(data.Megas))}`
      );

    const rankingSaldo = Object.entries(compras[from])
      .filter(([_, data]) => Number(data.Saldo) > 0)
      .sort((a, b) => b[1].Saldo - a[1].Saldo)
      .map(([id, data], index) =>
        `${index + 1}) @${id.split('@')[0]}\n• ${data.Saldo} Saldo`
      );

    let mensagem = "🛒 *Clientes — Ranking por Produto*\n\n";

    mensagem += "?? *MB*\n";
    mensagem += rankingMB.length
      ? rankingMB.join('\n\n')
      : "Nenhum cliente comprou MB.";

    mensagem += "\n\n💰 *Saldo*\n";
    mensagem += rankingSaldo.length
      ? rankingSaldo.join('\n\n')
      : "Nenhum cliente comprou Saldo.";

    await sock.sendMessage(from, {
      text: `✅ @${senderId.split('@')[0]} estou enviando a lista de clientes no seu privado...`,
      mentions: [senderId],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

    await sock.sendMessage(senderId, {
      text: mensagem,
      mentions: mentionIds
    });

  } catch (err) {
    console.error('❌ Erro no comando clientes:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao gerar lista de clientes.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .resetcompras
case cmd.toLowerCase() === 'resetcompras': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem resetar as compras do grupo.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
    }

    if (!compras[from]) {
      await sock.sendMessage(from, {
        text: '❌ Não há compras registradas neste grupo para apagar.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    delete compras[from];

    // Salva arquivo
    fs.writeFileSync(pathCompras, JSON.stringify(compras, null, 2));

    await sock.sendMessage(from, {
      text: `✅ @${senderId.split('@')[0]} todas as compras deste grupo foram apagadas com sucesso!`,
      mentions: [senderId],
      contextInfo: { stanzaId: msg.key.id, participant: sender }
    });

  } catch (err) {
    console.error('❌ Erro no comando resetcompras:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao resetar as compras do grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .antilink on/off
case cmd.toLowerCase().startsWith('antilink'): {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar o comando antilink.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const args = cmd.split(' ');
    if (!args[1] || !['on', 'off'].includes(args[1].toLowerCase())) {
      await sock.sendMessage(from, {
        text: '❌ Uso correto:\n.antilink on\n.antilink off',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

if (!fs.existsSync('./config')) {
  fs.mkdirSync('./config', { recursive: true });
}

let antilinkData = {};
if (fs.existsSync(pathAntilink)) {
  antilinkData = JSON.parse(
    fs.readFileSync(pathAntilink, 'utf-8') || '{}'
  );
}

    const status = args[1].toLowerCase() === 'on';
    antilinkData[from] = status;

    fs.writeFileSync(pathAntilink, JSON.stringify(antilinkData, null, 2));

    await sock.sendMessage(from, {
      text: status
        ? '✅ Antilink *ativado* neste grupo.'
        : '❌ Antilink *desativado* neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('❌ Erro no comando antilink:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao configurar o antilink.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .antifoto
case cmd.toLowerCase().startsWith('antifoto'): {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só roda em grupo.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const groupMeta = await sock.groupMetadata(from);
    const admins = groupMeta.participants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;

    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Só admin do grupo pode ligar ou desligar o bloqueio de fotos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const antifoto = carregarAntifoto();
    const arg = (cmd.split(/\s+/)[1] || '').toLowerCase();

    if (arg === 'on') {
      antifoto[from] = true;
      salvarAntifoto(antifoto);

      await sock.sendMessage(from, {
        text: '🐊 *LACOSTE* — bloqueio de fotos *LIGADO*.\nQualquer imagem neste grupo vai ser apagada (comprovativos em texto continuam a passar).',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });

    } else if (arg === 'off') {
      antifoto[from] = false;
      salvarAntifoto(antifoto);

      await sock.sendMessage(from, {
        text: '🐊 *LACOSTE* — bloqueio de fotos *DESLIGADO*.\nImagens voltaram a ser permitidas neste grupo.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });

    } else {
      await sock.sendMessage(from, {
        text: '📌 Uso: `.antifoto on` ou `.antifoto off`',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
    }
  } catch (err) {
    console.error('Erro no comando .antifoto:', err);
    await sock.sendMessage(from, {
      text: '❌ Não deu para configurar o antifoto. Confirma se a pasta config existe e tenta de novo.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }

  break;
}

// COMANDO: .limpar
case cmd.toLowerCase() === 'limpar': {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    if (!admins.includes(sender)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
      break;
    }

    const linhas = 4000;
    let texto = '🤖\n💨💨\n';

    for (let i = 0; i < linhas; i++) {
      texto += '\n';
    }

    texto += '❲❗❳ Lɪᴍᴘᴇᴢᴀ ᴅᴇ Cʜᴀᴛ Cᴏɴᴄʟᴜɪ́ᴅᴀ ✅';

    await sock.sendMessage(from, {
      text: texto,
      mentions: data.mentions,
      contextInfo: data.contextInfo
    });

  } catch (err) {
    console.error('Erro no comando .limpar:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao executar a limpeza.',
      mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
  }
  break;
}

// COMANDO: .rentanas
case cmd.toLowerCase() === 'rentanas': {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const metadata = await sock.groupMetadata(from);

    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    if (!admins.includes(sender)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8'));
    }

    const comprasGrupo = compras[from] || {};

    const membrosNormais = metadata.participants
      .map(p => p.id)
      .filter(id => !admins.includes(id));

    if (membrosNormais.length === 0) {
      await sock.sendMessage(from, {
        text: '⚠️ Este grupo possui apenas administradores.\nNão existem membros para verificar compras.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const semCompras = membrosNormais
      .filter(id => !comprasGrupo[id]);

    if (semCompras.length === 0) {
      await sock.sendMessage(from, {
        text: '✅ Todos os membros já têm compras registradas.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    let texto = '🤖 *Membros sem compras*\n\n';

    semCompras.forEach((id, i) => {
      texto += `${i + 1}. @${id.split('@')[0]}\n`;
    });

    texto += `\n📌 Total: *${semCompras.length}* membros`;

    await sock.sendMessage(from, {
      text: texto,
      mentions: semCompras,
      contextInfo: data.contextInfo
    });

  } catch (err) {
    console.error('Erro no comando .rentanas:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao verificar membros sem compras.',
      mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
  }
  break;
}

// COMANDO: .fantasmas
case cmd.toLowerCase().startsWith('fantasmas'): {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    if (!admins.includes(sender)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const qtd = parseInt(cmd.split(' ')[1]);

    if (!qtd || qtd <= 0) {
      await sock.sendMessage(from, {
        text: '❌ Use: .fantasmas 10',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    if (qtd > 20) {
      await sock.sendMessage(from, {
        text: '⚠️ Limite máximo permitido é *20 membros* por comando, use: fantasmas 20.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8'));
    }

    const comprasGrupo = compras[from] || {};

    const fantasmas = metadata.participants
      .map(p => p.id)
      .filter(id => !comprasGrupo[id] && !admins.includes(id));

    if (fantasmas.length === 0) {
      await sock.sendMessage(from, {
        text: '✅ Nenhum membro sem compras encontrado.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    const remover = fantasmas
      .slice(0, qtd);

    if (remover.length === 0) {
      await sock.sendMessage(from, {
        text: '⚠️ Apenas administradores encontrados. Nenhuma remoção foi feita.',
        mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
      break;
    }

    await sock.groupParticipantsUpdate(from, remover, 'remove');

    let texto = '🤖 *Fantasmas removidos*\n\n';

    remover.forEach((id, i) => {
      texto += `${i + 1}. @${id.split('@')[0]}\n`;
    });

    texto += `\n🗑️ Total removido: *${remover.length}*`;

    await sock.sendMessage(from, {
      text: texto,
      mentions: remover,
      contextInfo: data.contextInfo
    });

  } catch (err) {
    console.error('Erro no comando .fantasmas:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao remover membros sem compras.',
      mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });
  }
  break;
}

// COMANDO: .detector
case cmd.toLowerCase().startsWith('detector'): {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    if (!admins.includes(sender)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
      break;
    }

    let detector = {};
    if (fs.existsSync(pathDetector)) {
      detector = JSON.parse(fs.readFileSync(pathDetector, 'utf-8'));
    }

    const arg = cmd.split(' ')[1]?.toLowerCase();
    if (arg === 'on') {
      detector[from] = true;
      fs.writeFileSync(pathDetector, JSON.stringify(detector, null, 2));
      await sock.sendMessage(from, {
        text: '🤖 🔍 Filtro de detector de comprovativos *ativado* neste grupo!',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
    } else if (arg === 'off') {
      detector[from] = false;
      fs.writeFileSync(pathDetector, JSON.stringify(detector, null, 2));
      await sock.sendMessage(from, {
        text: '🤖 ✅️ Filtro de detector de comprovativos *desativado* neste grupo!',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
    } else {
      await sock.sendMessage(from, {
        text: '❌ Use: .detector on ou .detector off',
        mentions: data.mentions,
        contextInfo: data.contextInfo
      });
    }

  } catch (err) {
    console.error('Erro no comando .detector:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao configurar o detector de comprovativos.',
      mentions: data.mentions,
      contextInfo: data.contextInfo
    });
  }
  break;
}

// COMANDO: .status
case cmd.toLowerCase() === 'status': {
  try {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);

    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderLid = (msg.key.participant || msg.key.remoteJid);
    const botLid = sock.user.id;

    if (!admins.includes(senderLid)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }
    
    const statusDetector = lerStatus(pathDetector, from) ? '🟢 On' : '🔴 Off';
    const statusAntilink = lerStatus(pathAntilink, from) ? '🟢 On' : '🔴 Off';
    const statusAntifoto = lerStatus(pathAntifoto, from) ? '🟢 On' : '🔴 Off';
    const statusBemvindo = lerStatus(pathBemvindo, from) ? '🟢 On' : '🔴 Off';
    const statusNano = lerStatus(pathNano, from) ? '🟢 On' : '🔴 Off';
    const statusAnticon = lerStatus(pathAnticoncorrencia, from) ? '🟢 On' : '🔴 Off';

    const mensagem =
`🤖 ✅ *Status dos sistemas*

🧾 *Detector de comprovativos:* ${statusDetector}
🔗 *Antilink:* ${statusAntilink}
🖼️ *Antifoto:* ${statusAntifoto}
👋 *Boas-vindas:* ${statusBemvindo}
🧩 *Nano comandos:* ${statusNano}
🚫 *Anticoncorrência:* ${statusAnticon}

👑 *Solicitado por:* @${sender.split('@')[0]}`;

    await sock.sendMessage(from, {
      text: mensagem,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

  } catch (err) {
    console.error('Erro no comando status:', err);

    await sock.sendMessage(from, {
      text: '❌ Erro ao verificar o status dos sistemas.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}


// COMANDO: .todos
case cmd.toLowerCase().startsWith('todos'): {
  try {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderLid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderLid)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const texto = cmd.slice(5).trim();
    if (!texto) {
      await sock.sendMessage(from, {
        text: '❌ Use: .todos sua mensagem',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const membros = metadata.participants
      .map(p => p.id)
      .filter(id => !admins.includes(id));

    if (membros.length === 0) {
      await sock.sendMessage(from, {
        text: '❌ Não há membros para mencionar.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    await sock.sendMessage(from, {
      delete: msg.key
    }).catch(() => {});
    
    await sock.sendMessage(from, {
      text: texto,
      mentions: membros
    });

  } catch (err) {
    console.error('Erro no comando .todos:', err);
    await sock.sendMessage(from, {
      text: '❌ Ocorreu um erro ao executar o comando.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .antivideo
case cmd.toLowerCase().startsWith('antivideo'): {
  try {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderLid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderLid)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const estadoArg = cmd.split(' ')[1];
    if (!estadoArg || !['on', 'off'].includes(estadoArg.toLowerCase())) {
      await sock.sendMessage(from, {
        text: '❌ Use:\n\n👉 `.antivideo on`\n👉 `.antivideo off`',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const antivideo = carregarAntivideo();
    const estado = estadoArg.toLowerCase() === 'on';

    antivideo[from] = estado;
    salvarAntivideo(antivideo);

    const resposta = estado
      ? '🐊 *LACOSTE* — antivídeo *LIGADO*.\nVídeos enviados neste grupo vão ser removidos.'
      : '🐊 *LACOSTE* — antivídeo *DESLIGADO*.\nVídeos voltaram a ser aceites neste grupo.';

    await sock.sendMessage(from, {
      text: resposta,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

  } catch (err) {
    console.error('Erro no comando .antivideo:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao executar o comando antivideo.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }

  break;
}

// COMANDO: .antiaudios
case cmd.toLowerCase().startsWith('antiaudio'): {
  try {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderLid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderLid)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const arg = cmd.split(' ')[1];
    if (!arg || !['on', 'off'].includes(arg.toLowerCase())) {
      await sock.sendMessage(from, {
        text: '❌ Use:\n\n👉 `.antiaudio on`\n👉 `.antiaudio off`',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const antiaudio = carregarAntiaudio();
    const estado = arg.toLowerCase() === 'on';

    antiaudio[from] = estado;
    salvarAntiaudio(antiaudio);

    const resposta = estado
      ? '🐊 *LACOSTE* — antiáudio *LIGADO*.\nNotas de voz e áudios neste grupo vão ser apagados.'
      : '🐊 *LACOSTE* — antiáudio *DESLIGADO*.\nÁudios voltaram a ser permitidos neste grupo.';

    await sock.sendMessage(from, {
      text: resposta,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('Erro no comando .antiaudios:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao configurar o antiaudios.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .antistatus
case cmd.toLowerCase().startsWith('antistatus'): {
  try {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

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
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const arg = cmd.split(' ')[1];
    if (!arg || !['on', 'off'].includes(arg.toLowerCase())) {
      await sock.sendMessage(from, {
        text: '❌ Use:\n\n👉 `.antistatus on`\n👉 `.antistatus off`',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const antistatus = carregarAntistatus();
    const estado = arg.toLowerCase() === 'on';

    antistatus[from] = estado;
    salvarAntistatus(antistatus);

    const resposta = estado
      ? '🟢🚫 antistatus *ativado*\n\nMenções do grupo em status serão bloqueadas.\n\n_Comandos do bot continuam a funcionar normalmente._'
      : '🔴✅ antistatus *desativado*\n\nMenções em status estão permitidas.';

    await sock.sendMessage(from, {
      text: resposta,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('Erro no comando antistatus:', err);
  }

  break;
}

// COMANDO: .automação
case cmd.toLowerCase().startsWith('automação'): {
  try {

    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender]
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderLid = msg.key.participant || msg.key.remoteJid;

    if (!admins.includes(senderLid)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender]
      });
      break;
    }

    const arg = cmd.split(' ')[1];

    if (!arg || !['on', 'off'].includes(arg.toLowerCase())) {
      await sock.sendMessage(from, {
        text: '❌ Use:\n\n👉 `.automação on`\n👉 `.automação off`',
        mentions: [sender]
      });
      break;
    }

    const estado = arg.toLowerCase() === 'on';

// =========================
// GLOBALS
// =========================

global.automacao = global.automacao || {};
global.automacao[from] = estado;
salvarAutomacao(global.automacao);

    const resposta = estado
      ? '🤖 Automação *ATIVADA* neste grupo.'
      : '⛔ Automação *DESATIVADA* neste grupo.';

    await sock.sendMessage(from, {
      text: resposta,
      mentions: [sender]
    });

  } catch (err) {
    console.error('Erro no comando automação:', err);
  }

  break;
}

// COMANDO: .sair
case cmd.toLowerCase().startsWith('sair'): {
  try {
    // usa o commandBody igual no seu .sabes
    const args = cmd.split(' ').slice(1); 
    const targetGroup = args[0];

    if (!targetGroup || !targetGroup.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ ID do grupo inválido. Use: .sair <id_do_grupo>',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const mensagens = [
      '🤖 ✅ O bot vai sair do grupo agora!',
      '👋 Até mais!',
      '👨‍💻⚙️'
    ];

    // Obtem todos participantes para mencionar
    let mentions = [];
    try {
      const meta = await sock.groupMetadata(targetGroup);
      mentions = meta.participants.map(p => p.id);
    } catch {}

    function gerarMensagemFixa(texto, mentions, remoteJid) {
      return {
        requestPaymentMessage: {
          currencyCodeIso4217: "MZN",
          amount1000: 0,
          requestFrom: remoteJid,
          noteMessage: {
            extendedTextMessage: {
              text: texto,
              contextInfo: { mentionedJid: mentions }
            }
          }
        }
      };
    }

    let sentMsg = await sock.relayMessage(targetGroup, gerarMensagemFixa(mensagens[0], mentions, targetGroup), { messageId: Date.now().toString() });

    for (let i = 1; i < mensagens.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await sock.relayMessage(targetGroup, gerarMensagemFixa(mensagens[i], mentions, targetGroup), { messageId: sentMsg.key.id });
    }

    await sock.groupLeave(targetGroup);

  } catch (err) {
    console.error('Erro no comando .sair:', err);
    await sock.sendMessage(from, {
      text: '❌ Ocorreu um erro ao executar o comando. Verifique se o bot está nesse grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .ivannet
case cmd.toLowerCase() === 'lacoste': {
  try {
    // verifica se é grupo
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '🤖 ❌ ESTE COMANDO FUNCIONA APENAS EM GRUPOS.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    // verifica se é admin
    const groupMetadata = await sock.groupMetadata(from);
    const admins = groupMetadata.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      await sock.sendMessage(from, {
        text: '🤖 ❌ APENAS ADMINISTRADORES PODEM USAR ESTE COMANDO.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    // carrega arquivo dias.json
    const fs = await import('fs');
    let diasData = {};

    if (fs.existsSync(pathDias)) {
      diasData = JSON.parse(fs.readFileSync(pathDias, 'utf-8'));
    }

    // busca todos os grupos do bot
    const chats = await sock.groupFetchAllParticipating();
    const grupos = Object.values(chats);

    if (!grupos.length) {
      await sock.sendMessage(from, {
        text: '?? ❌ O BOT NÃO ESTÁ EM NENHUM GRUPO.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key?.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    let texto = `🤖 ✅ GRUPOS DO BOT (${grupos.length})\n\n`;
    const agora = Date.now();

    grupos.forEach((g, i) => {
      texto += `${i + 1}️⃣ GRUPO: ${g.subject}\n`;
      texto += `🆔 ID: ${g.id}\n`;

      const infoDias = diasData[g.id];

      if (infoDias) {
        const diasTotais = infoDias.dias ?? 0;
        const fim = infoDias.fim ?? 0;

        let diasRestantes = Math.ceil((fim - agora) / (1000 * 60 * 60 * 24));
        if (diasRestantes < 0) diasRestantes = 0;

        texto += `📆 DIAS TOTAIS: ${diasTotais}\n`;
        texto += `⏳ DIAS RESTANTES: ${diasRestantes}\n`;
      } else {
        texto += `📆 DIAS: SEM REGISTRO\n`;
      }

      texto += `\n`;
    });

    await sock.sendMessage(from, {
      text: texto,
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key?.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

  } catch (err) {
    console.error('Erro no comando .ivannet:', err);
    await sock.sendMessage(from, {
      text: '🤖 ❌ ERRO AO LISTAR OS GRUPOS.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key?.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }
  break;
}

// COMANDO: .gpcomandos
case cmd.toLowerCase() === 'kyllon': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  function getDataHora() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const data = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return { data, hora };
  }

  const { data, hora } = getDataHora();

  const autorizacoes = carregarAutorizacoes();

  if (autorizacoes[from]) {
    await sock.sendMessage(from, {
      text:
`⚠️ Este grupo JÁ é um *Grupo de comandos*

👤 Ativado por: @${autorizacoes[from].ativado_por.split('@')[0]}
📅 Data: ${autorizacoes[from].data}
⏰ Hora: ${autorizacoes[from].hora}`,
      mentions: [autorizacoes[from].ativado_por],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
    break;
  }

  autorizacoes[from] = {
    ativado_por: sender,
    data,
    hora,
    timestamp: Date.now()
  };

  salvarAutorizacoes(autorizacoes);

  await sock.sendMessage(from, {
    text:
`🤖 ✅ *Grupo de comandos!*

🔐 Este grupo agora pode:
• Autorizar outros grupos
• Gerenciar aluguer do bot
• reduzir dias e muito mas

👤 Ativado por: @${sender.split('@')[0]}
📅 Em: ${data} às ${hora}`,
    mentions: [sender],
    contextInfo: {
      stanzaId: msg.key.id,
      participant: sender,
      quotedMessage: msg.message
    }
  });

  break;
}

// COMANDO: .on
case cmd.toLowerCase().startsWith('on'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const autorizacoes = carregarAutorizacoes();
  if (!autorizacoes[from]) {
    await sock.sendMessage(from, {
      text: '⚠️ Este grupo não é autorizado para usar comandos de dias!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const args = cmd.split(' ').slice(1).join(''); // remove ".on "
  const partes = args.split(',');
  const diasAdicionar = parseInt(partes[0]);
  const grupoAlvo = partes[1]?.trim() || from; 

  if (!diasAdicionar || diasAdicionar <= 0) {
    await sock.sendMessage(from, {
      text: '❌ Use: .on <dias> [,idDoGrupo]',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const diasData = carregarDias();

  const agora = Date.now();
  let diasExistentes = diasData[grupoAlvo] || { dias: 0, fim: agora };

  if (diasExistentes.fim < agora) {
    diasExistentes.dias = 0;
    diasExistentes.fim = agora;
  }

  diasExistentes.dias += diasAdicionar;
  diasExistentes.fim = agora + diasExistentes.dias * 24 * 60 * 60 * 1000;

  diasData[grupoAlvo] = diasExistentes;
  salvarDias(diasData);

  const diasRestantes = Math.ceil((diasExistentes.fim - agora) / (1000 * 60 * 60 * 24));

  await sock.sendMessage(from, {
    text:
`✅ *Dias atualizados com sucesso* 🌟

📌 Grupo: ${grupoAlvo}
⏳ Dias adicionados: ${diasAdicionar}
🗓️ Total de dias restantes: ${diasRestantes} dia(s)
📅 Expira em: ${new Date(diasExistentes.fim).toLocaleString()}

👤 Comando executado por: @${sender.split('@')[0]}`,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}

// COMANDO: .bot
case cmd.toLowerCase() === 'bot': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
  .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
  .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const diasData = carregarDias();

  if (!diasData[from] || diasData[from].dias <= 0 || diasData[from].fim < Date.now()) {
    await sock.sendMessage(from, {
      text: '⚠️ Este grupo não tem dias ativos ou já expiraram!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const agora = Date.now();
  const fim = diasData[from].fim;
  let diff = fim - agora;
  if (diff < 0) diff = 0;

  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const segundos = Math.floor((diff % (1000 * 60)) / 1000);

  const dataExpira = new Date(fim).toLocaleDateString('pt-MZ');
  const horaExpira = new Date(fim).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });

  await sock.sendMessage(from, {
    text:
`🐊 *BOT LACOSTE*

💎 Plano Ativo: SIM
⏰ Validade: ${dias} dias, ${horas}h ${minutos}m ${segundos}s
📆 Expira: ${dataExpira} às ${horaExpira}
✅ Status: Online, rápido e confiável

Obrigado por confiar @${sender.split('@')[0]} 🍷🗿`,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}

// COMANDO: .off
case cmd.toLowerCase().startsWith('off'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from);
  const admins = metadata.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;
  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const autorizacoes = carregarAutorizacoes();
  if (!autorizacoes[from]) {
    await sock.sendMessage(from, {
      text: '⚠️ Este grupo não é autorizado para usar comandos de dias!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  // 🔹 OBRIGATÓRIO: dias,grupoId
  const argsRaw = cmd.split(' ')[1];
  if (!argsRaw || !argsRaw.includes(',')) {
    await sock.sendMessage(from, {
      text:
        '❌ Uso incorreto!\n\n' +
        'Use exatamente assim:\n' +
        '.off 3,120363419232463692@g.us',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const [diasStr, grupoId] = argsRaw.split(',');
  const diasRemover = parseInt(diasStr);

  if (!diasRemover || diasRemover <= 0 || !grupoId.endsWith('@g.us')) {
    await sock.sendMessage(from, {
      text: '❌ Dias ou ID do grupo inválidos!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const diasData = carregarDias();

  if (!diasData[grupoId]) {
    await sock.sendMessage(from, {
      text: '⚠️ O grupo informado não possui dias ativos!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const agora = Date.now();
  const msPorDia = 24 * 60 * 60 * 1000;

  // Não usar diasRestantes salvo no JSON: ele pode estar antigo ou ausente.
  // Calcula sempre a validade real a partir de fim.
  const fimAtual = Number(diasData[grupoId].fim) || 0;
  const restantesAtuais = Math.max(
    0,
    Math.ceil((fimAtual - agora) / msPorDia)
  );

  const restantesNovos = Math.max(0, restantesAtuais - diasRemover);
  diasData[grupoId].diasRestantes = restantesNovos;
  diasData[grupoId].fim = agora + (restantesNovos * msPorDia);

  // Mantém "dias" coerente com a validade restante.
  diasData[grupoId].dias = restantesNovos;

  salvarDias(diasData);

  await sock.sendMessage(from, {
    text:
`✅ *Dias removidos com sucesso!*

📍 Grupo alvo: ${grupoId}
➖ Dias removidos: ${diasRemover}
🗓️ Dias restantes: ${diasData[grupoId].diasRestantes}
📅 Expira em: ${new Date(diasData[grupoId].fim).toLocaleString()}`,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}
// COMANDO: .entrar
case cmd.toLowerCase().startsWith('entrar'): {
  try {
    const args = cmd.split(' ').slice(1);
    let link = args[0]? args[0].trim() : '';

    if (!link ||!link.includes('chat.whatsapp.com/')) {
      await sock.sendMessage(from, {
        text: '❌ Envie o link do grupo.\n\nExemplo:\n.entrar https://chat.whatsapp.com/XXXXXXXXXXX',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    // LIMPA O CÓDIGO - remove? e espaços que fazem falhar
    let codigo = link.split('chat.whatsapp.com/')[1].trim();
    codigo = codigo.split('?')[0].split('/')[0].split(' ')[0].trim();

    console.log('TENTANDO ENTRAR CODIGO:', codigo);

    if (!codigo || codigo.length < 10) {
      await sock.sendMessage(from, {
        text: '❌ Código inválido extraído: ' + codigo,
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    // Tenta obter info do convite (melhora diagnóstico) e depois entrar
    console.log('TENTANDO ENTRAR CODIGO:', codigo);
    try {
      if (typeof sock.groupGetInviteInfo === 'function') {
        const info = await sock.groupGetInviteInfo(codigo);
        console.log('INVITE INFO:', JSON.stringify(info || {}).slice(0, 300));
      }
    } catch (infoErr) {
      console.log('groupGetInviteInfo aviso:', infoErr.message);
    }

    const result = await sock.groupAcceptInvite(codigo);
    console.log('RESULTADO ENTRAR:', result);

    await sock.sendMessage(from, {
      text: `✅ Entrei no grupo!\nID: ${result}`,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('Erro no comando entrar:', err);
    console.log('ERRO COMPLETO:', err.message, err?.data || err?.output || '');

    let motivo = err.message || String(err);
    const low = motivo.toLowerCase();
    if (low.includes('not-authorized')) motivo = 'Link expirado ou revogado pelo adm';
    else if (low.includes('forbidden')) motivo = 'Fui removido/banido desse grupo antes; WhatsApp bloqueou a reentrada';
    else if (low.includes('conflict')) motivo = 'Já estou no grupo';
    else if (low.includes('gone')) motivo = 'Link expirado';
    else if (low.includes('bad-request') || low.includes('bad request')) {
      motivo = 'bad-request — código inválido, link incompleto, ou limitação do WhatsApp/Baileys.\n' +
        'Tente: (1) copiar o link outra vez sem espaços (2) abrir o link no telemóvel e confirmar que ainda é válido (3) usar outro link de convite gerado pelo ADM.';
    }

    await sock.sendMessage(from, {
      text: `❌ Não foi possível entrar.\n\n*Motivo:* ${motivo}\n\n*Original:* ${err.message}`,
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .promover
case cmd.toLowerCase().startsWith('promover'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;
  if (!admins?.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem promover membros.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, {
      text: '❌ Mencione o membro que deseja promover.\n\nExemplo:\n.promover @usuario',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const alvo = mentioned[0];
  const alvoData = metadata.participants.find(p => p.id === alvo);

  if (!alvoData) {
    await sock.sendMessage(from, {
      text: '❌ Usuário não encontrado neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (alvoData.admin === 'admin' || alvoData.admin === 'superadmin') {
    await sock.sendMessage(from, {
      text: '⚠️ Este membro já é administrador.',
      mentions: [alvo],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  try {
    await sock.groupParticipantsUpdate(from, [alvo], 'promote');

    await sock.sendMessage(from, {
      text: '✅ Membro promovido a administrador.',
      mentions: [alvo],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('Erro no comando promover:', err);

    await sock.sendMessage(from, {
      text: '❌ Erro ao promover membro. Verifique se o bot é administrador.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .demote
case cmd.toLowerCase().startsWith('demote'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;
  if (!admins?.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem rebaixar membros.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, {
      text: '❌ Mencione o administrador que deseja rebaixar.\n\nExemplo:\n.demote @admin',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const alvo = mentioned[0];
  const alvoData = metadata.participants.find(p => p.id === alvo);

  if (!alvoData) {
    await sock.sendMessage(from, {
      text: '❌ Usuário não encontrado neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!alvoData.admin) {
    await sock.sendMessage(from, {
      text: '⚠️ Este membro não é administrador.',
      mentions: [alvo],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  try {
    await sock.groupParticipantsUpdate(from, [alvo], 'demote');

    await sock.sendMessage(from, {
      text: '🔻 Administrador rebaixado com sucesso.',
      mentions: [alvo],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('Erro no comando demote:', err);

    await sock.sendMessage(from, {
      text: '❌ Erro ao rebaixar administrador. Verifique se o bot é administrador.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .pp
case cmd.toLowerCase() === 'pp': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, { text: '❌ Este comando funciona apenas em grupos.' });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const alvo =
      msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!alvo) {
      await sock.sendMessage(from, {
        text: '❌ Use este comando respondendo à mensagem do usuário.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
    }

    if (!compras[from] || !compras[from][alvo]) {
      await sock.sendMessage(from, {
        text: '❌ Este usuário não possui compras registradas.',
        mentions: [alvo],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const user = compras[from][alvo];

    const rankingMegas = Object.entries(compras[from])
      .filter(([, d]) => (d.Megas || 0) > 0)
      .sort((a, b) => (b[1].Megas || 0) - (a[1].Megas || 0));

    const rankingSaldo = Object.entries(compras[from])
      .filter(([, d]) => (d.Saldo || 0) > 0)
      .sort((a, b) => (b[1].Saldo || 0) - (a[1].Saldo || 0));

    const posMegas = rankingMegas.findIndex(([id]) => id === alvo) + 1;
    const posSaldo = rankingSaldo.findIndex(([id]) => id === alvo) + 1;

    const numero = alvo.split('@')[0];

    let texto = `✅ *Concluído Ranking Membro* 🇲🇿\n_╔════════════════════╗_\n`;

    if (user.Megas > 0) {
      texto += `📶 *Megas:* *${user.Megas}MB*\n🏆 *Posição em Megas:* *${posMegas}º lugar*\n`;
    }

    if (user.Saldo > 0) {
      texto += `💰 *Saldo:* *${user.Saldo}*\n🏆 *Posição em Saldo:* *${posSaldo}º lugar*\n`;
    }

    texto += `_╚════════════════════╝_`;

    await sock.sendMessage(from, {
      text: texto,
      mentions: [alvo],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('❌ Erro no comando .pp:', err);
    await sock.sendMessage(from, { text: '❌ Erro ao consultar posição.' });
  }

  break;
}

// COMANDO: .p
case cmd.toLowerCase() === 'p': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, { 
        text: '❌ Este comando funciona apenas em grupos.' 
      });
      break;
    }

    let compras = {};
    if (fs.existsSync(pathCompras)) {
      compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');
    }

    if (!compras[from] || !compras[from][sender]) {
      await sock.sendMessage(from, {
        text: '❌ Você ainda não possui compras registradas.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const user = compras[from][sender];

    // ranking megas
    const rankingMegas = Object.entries(compras[from])
      .filter(([, d]) => (d.Megas || 0) > 0)
      .sort((a, b) => (b[1].Megas || 0) - (a[1].Megas || 0));

    // ranking saldo
    const rankingSaldo = Object.entries(compras[from])
      .filter(([, d]) => (d.Saldo || 0) > 0)
      .sort((a, b) => (b[1].Saldo || 0) - (a[1].Saldo || 0));

    const posMegas = user.Megas ? rankingMegas.findIndex(([id]) => id === sender) + 1 : null;
    const posSaldo = user.Saldo ? rankingSaldo.findIndex(([id]) => id === sender) + 1 : null;

    // --- montar mensagem estilizada ---
    let texto = '✅ *Concluído Ranking sua posição🇲🇿*\n_╔════════════════════════╗_\n';

    if (user.Megas) {
      texto += `📶 *Megabytes Comprados:* ${user.Megas}MB\n`;
      texto += `🏆 *Posição em Megas:* ${posMegas}º lugar\n`;
    }

    if (user.Saldo) {
      texto += `💰 *Saldo:* ${user.Saldo} MT\n`;
      texto += `🏆 *Posição em saldo:* ${posSaldo}º lugar\n`;
    }

    texto += '📊 *Status:* Ativo ✅\n';
    texto += '🥇 *Ranking entre membros*\n_╚════════════════════════╝_';

    await sock.sendMessage(from, {
      text: texto.trim(),
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });

  } catch (err) {
    console.error('❌ Erro no comando .p:', err);
    await sock.sendMessage(from, { 
      text: '❌ Erro ao consultar sua posição.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }

  break;
}

// COMANDO: .x
case cmd.toLowerCase() === 'x': {
  try {
    const context = msg.message?.extendedTextMessage?.contextInfo;

    if (!context || !context.quotedMessage) {
      await sock.sendMessage(from, {
        text: '❌ Use o comando respondendo a uma foto, vídeo ou áudio em visualização única.',
        mentions: [sender]
      });
      break;
    }

const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

    const quoted = context.quotedMessage;

    const media =
      quoted.imageMessage ||
      quoted.videoMessage ||
      quoted.audioMessage;

    if (!media) {
      await sock.sendMessage(from, {
        text: '❌ A mensagem respondida não contém mídia.',
        mentions: [sender]
      });
      break;
    }

    if (media.viewOnce !== true) {
      await sock.sendMessage(from, {
        text: '❌ Essa mídia não está em visualização única.',
        mentions: [sender]
      });
      break;
    }

    const buffer = await downloadMediaMessage(
      {
        key: {
          remoteJid: from,
          id: context.stanzaId,
          participant: context.participant
        },
        message: quoted
      },
      'buffer',
      {},
      { logger: console }
    );

    let envio = {};

    if (quoted.imageMessage) {
      envio = {
        image: buffer,
        caption: '📸 Visualização única removida'
      };
    } else if (quoted.videoMessage) {
      envio = {
        video: buffer,
        caption: '🎥 Visualização única removida'
      };
    } else if (quoted.audioMessage) {
      envio = {
        audio: buffer,
        mimetype: quoted.audioMessage.mimetype,
        ptt: false
      };
    }

    await sock.sendMessage(from, envio);

  } catch (err) {
    console.error('❌ Erro no comando .x:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao remover visualização única. verifique se o bot é administrador.',
      mentions: [sender]
    });
  }
  break;
}

// COMANDO: .carregar
case cmd.toLowerCase() === 'carregar': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, { text: '❌ este comando só pode ser usado em grupos.' });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, { text: '❌ apenas administradores podem usar este comando.' });
      break;
    }

    if (!fs.existsSync(pathCompras)) {
      await sock.sendMessage(from, { text: '❌ Não encontrei o arquivo de compras, contacte o suporte.' });
      break;
    }

    const compras = JSON.parse(fs.readFileSync(pathCompras, 'utf-8') || '{}');

    let backup = {};
    if (fs.existsSync(pathdadoscompras)) {
      backup = JSON.parse(fs.readFileSync(pathdadoscompras, 'utf-8') || '{}');
    }

    // 🔹 CARREGA TODOS OS GRUPOS
    for (const [groupId, usuarios] of Object.entries(compras)) {
      backup[groupId] = {};

      for (const [userId, dados] of Object.entries(usuarios)) {
        backup[groupId][userId] = {
          Megas: dados.Megas || 0,
          Megashoje: dados.Megashoje || 0,
          Saldo: dados.Saldo || 0,
          Saldohoje: dados.Saldohoje || 0,
          data: dados.data || new Date().toISOString()
        };
      }
    }

    fs.writeFileSync(pathdadoscompras, JSON.stringify(backup, null, 2));

    await sock.sendMessage(from, {
      text: '🤖 ✅ todas as compras de todos os grupos foram carregadas!\n📦 backup completo salvo.'
    });

  } catch (err) {
    console.error('Erro no .carregar:', err);
    await sock.sendMessage(from, { text: '❌ erro ao fazer backup.' });
  }
  break;
}

// COMANDO: .restaurar
case cmd.toLowerCase() === 'restaurar': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, { text: '❌ este comando só pode ser usado em grupos.' });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, { text: '❌ apenas administradores podem usar este comando.' });
      break;
    }

    if (!fs.existsSync(pathdadoscompras)) {
      await sock.sendMessage(from, { text: '❌ nenhum backup encontrado.' });
      break;
    }

    const backup = JSON.parse(fs.readFileSync(pathdadoscompras, 'utf-8') || '{}');

    let compras = {};

    // 🔹 RESTAURA TODOS OS GRUPOS
    for (const [groupId, usuarios] of Object.entries(backup)) {
      compras[groupId] = {};

      for (const [userId, dados] of Object.entries(usuarios)) {
        compras[groupId][userId] = {
          Megas: dados.Megas || 0,
          Megashoje: dados.Megashoje || 0,
          Saldo: dados.Saldo || 0,
          Saldohoje: dados.Saldohoje || 0,
          data: dados.data || new Date().toISOString()
        };
      }
    }

    fs.writeFileSync(pathCompras, JSON.stringify(compras, null, 2));

    await sock.sendMessage(from, {
      text: '🤖 ✅ compras de todos os grupos restauradas!\n♻️ dados totalmente recuperados.'
    });

  } catch (err) {
    console.error('Erro no .restaurar:', err);
    await sock.sendMessage(from, { text: '❌ erro ao restaurar compras.' });
  }
  break;
}

// COMANDO: .resetglobal
case cmd.toLowerCase() === 'resetglobal': {
  try {
    if (!from.endsWith('@g.us')) {
      await sock.sendMessage(from, {
        text: '❌ Este comando só pode ser usado em grupos.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem resetar todas as compras.',
        mentions: [sender],
        contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
      });
      break;
    }

    fs.writeFileSync(pathCompras, JSON.stringify({}, null, 2));

    await sock.sendMessage(from, {
      text: `🤖 ✅ @${senderId.split('@')[0]} todas as compras foram apagadas com sucesso!\n🧹 arquivo limpo.`,
      mentions: [senderId],
      contextInfo: { stanzaId: msg.key.id, participant: sender }
    });

  } catch (err) {
    console.error('❌ Erro no comando resetglobal:', err);
    await sock.sendMessage(from, {
      text: '❌ Erro ao resetar todas as compras. Verifique permissões do bot.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  }
  break;
}

// COMANDO: .alarme
case cmd.toLowerCase().startsWith('alarme'): {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const arg = cmd.split(' ')[1];

  if (arg && arg.toLowerCase() === 'off') {
    const alarmes = carregarAlarmes();

    if (!alarmes[from]) {
      await sock.sendMessage(from, {
        text: '⚠️ Não existe nenhum alarme ativo neste grupo.',
        mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
      break;
    }

    delete alarmes[from];
    salvarAlarmes(alarmes);

    await sock.sendMessage(from, {
      text:
        '⏹️ *Alarme desativado com sucesso!*\n\n' +
        '🔕 Abertura e fechamento automático foram removidos.\n' +
        '📍 Horário: Moçambique 🇲🇿',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!arg || !arg.includes(',')) {
    await sock.sendMessage(from, {
      text:
        '❌ Uso incorreto.\n\n' +
        '📌 Exemplo correto:\n' +
        '.alarme 11:30,12:30\n\n' +
        '⏹️ Para desligar:\n' +
        '.alarme off',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const [horaAbrir, horaFechar] = arg.split(',');

  const regexHora = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (!regexHora.test(horaAbrir) || !regexHora.test(horaFechar)) {
    await sock.sendMessage(from, {
      text:
        '❌ Horário inválido.\n\n' +
        '⏰ Formato correto: HH:MM\n' +
        '📌 Exemplo: 11:30,12:30',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const alarmes = carregarAlarmes();

  alarmes[from] = {
    abrir: horaAbrir,
    fechar: horaFechar,
    ativo: true
  };

  salvarAlarmes(alarmes);

  await sock.sendMessage(from, {
    text:
      '⏰ *Alarme configurado com sucesso!*\n\n' +
      `🔓 Abrir grupo: ${horaAbrir}\n` +
      `🔒 Fechar grupo: ${horaFechar}\n\n` +
      '📍 Horário: Moçambique 🇲🇿',
    mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  break;
}

// COMANDO: .limparconcorrentes
case cmd.toLowerCase() === 'limparconcorrentes': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

 if (!anticoncorrenciaStatus) {
        await sock.sendMessage(from, {
            text: '❌ Filtro anticoncorrencia não está ativo neste grupo.',
            mentions: [sender],
            contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
        });
        break;
    }
      
  const groupMeta = await sock.groupMetadata(from);
  const admins = groupMeta.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);

  const senderId = msg.key.participant || msg.key.remoteJid;

  if (!admins.includes(senderId)) {
    await sock.sendMessage(from, {
      text: '❌ Apenas administradores podem usar este comando!',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  let concorrentesRaw = {};
  if (fs.existsSync(pathConcorrentes)) {
    concorrentesRaw = JSON.parse(fs.readFileSync(pathConcorrentes, 'utf-8'));
  }

  let totalAntes = 0;
  let totalDepois = 0;
  let removidos = 0;

  if (Array.isArray(concorrentesRaw)) {
    totalAntes = concorrentesRaw.length;

    const unico = [...new Set(concorrentesRaw)];
    totalDepois = unico.length;
    removidos = totalAntes - totalDepois;

    const novoObjeto = {};
    for (const id of unico) {
      novoObjeto[id] = true;
    }

    fs.writeFileSync(pathConcorrentes, JSON.stringify(novoObjeto, null, 2));
  }

  else if (typeof concorrentesRaw === 'object' && concorrentesRaw !== null) {
    const keys = Object.keys(concorrentesRaw);
    totalAntes = keys.length;

    const unico = [...new Set(keys)];
    totalDepois = unico.length;
    removidos = totalAntes - totalDepois;

    const novoObjeto = {};
    for (const id of unico) {
      novoObjeto[id] = true;
    }

    fs.writeFileSync(pathConcorrentes, JSON.stringify(novoObjeto, null, 2));
  }

  await sock.sendMessage(from, {
    text:
      `🧹 *LIMPEZA DE CONCORRENTES CONCLUÍDA*\n\n` +
      `📂 Base: concorrentes.json\n` +
      `📊 Total antes: ${totalAntes}\n` +
      `🗑️ Duplicados removidos: ${removidos}\n` +
      `✅ Total final: ${totalDepois}`,
    mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
  break;
}

// COMANDO: .banconcorrentes
case cmd.toLowerCase() === 'banconcorrentes': {
  const isGroup = from.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, {
      text: '❌ Este comando funciona apenas em grupos.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const metadata = await sock.groupMetadata(from).catch(() => null);
  const admins = metadata?.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

  if (!admins.includes(sender)) {
    await sock.sendMessage(from, {
      text: '❌ Este comando só pode ser usado por administradores.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }


  if (!anticoncorrenciaStatus) {
    await sock.sendMessage(from, {
      text: '🤖 ❌ o filtro anticoncorrência não está ativo neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  if (!concorrentes || typeof concorrentes !== 'object') {
    await sock.sendMessage(from, {
      text: '⚠️ Base de concorrentes não carregada.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  const participantes = metadata.participants;

  let removidos = 0;
  let ignorados = 0;
  const remover = [];

  for (const p of participantes) {
    const jid = p.id;

    if (p.admin) {
      ignorados++;
      continue;
    }

    if (concorrentes[jid]) {
      remover.push(jid);
      removidos++;
    }
  }

  if (remover.length === 0) {
    await sock.sendMessage(from, {
      text: '✅ Nenhum concorrente encontrado neste grupo.',
      mentions: [sender],
      contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
    });
    break;
  }

  await sock.groupParticipantsUpdate(from, remover, 'remove');

  await sock.sendMessage(from, {
    text:
      `🤖 🚫 *BANIMENTO DE CONCORRENTES CONCLUÍDO*\n\n` +
      `👥 Total no grupo: *${participantes.length}*\n` +
      `🚷 Concorrentes removidos: *${removidos}*\n` +
      `🛡️ Admins ignorados: *${ignorados}*\n\n` +
      `✔️ Nenhum concorrente foi removido da base`,
    mentions: [sender],
    contextInfo: { stanzaId: msg.key.id, participant: sender, quotedMessage: msg.message }
  });

  break;
}
// COMANDO: .repor 
case cmd.toLowerCase() === 'repor': {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;

    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    // 🔄 Revogar e gerar novo link
    const novoLink = await sock.groupRevokeInvite(from);

    await sock.sendMessage(from, {
      text:
        `🤖 ✅ *link do grupo atualizado!*\n\n` +
        `🔗 Novo link:\nhttps://chat.whatsapp.com/${novoLink}`,
      mentions: [senderId],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

  } catch (err) {
    console.error('❌ Erro no comando .repor:', err);

    await sock.sendMessage(from, {
      text: '❌ Erro ao atualizar o link do grupo. Verifique se o bot é administrador.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }
  break;
}

// COMANDO: .gestores
case cmd.toLowerCase() === 'gestores': {
  try {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(from, {
        text: '❌ Este comando funciona apenas em grupos.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const metadata = await sock.groupMetadata(from);
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);

    const senderId = msg.key.participant || msg.key.remoteJid;

    if (!admins.includes(senderId)) {
      await sock.sendMessage(from, {
        text: '❌ Apenas administradores podem usar este comando.',
        mentions: [sender],
        contextInfo: {
          stanzaId: msg.key.id,
          participant: sender,
          quotedMessage: msg.message
        }
      });
      break;
    }

    const texto =
`🤖 📊 *PAINEL DE GESTORES*

📌 *ATIVAÇÃO DO BOT*
Antes de começares a usar um grupo como grupo de comando, contacte o gestor:

📞 848395255

Para ativar os dias no teu grupo.

━━━━━━━━━━━━━━━━━━━

⚙️ *TRANSFORMAR EM GRUPO DE COMANDOS*
Use:
.gpcomandos

━━━━━━━━━━━━━━━━━━━

📋 *VER LISTA DE GRUPOS*
Use:
.ivannet

📌 O bot vai enviar todos os grupos com ID.

━━━━━━━━━━━━━━━━━━━

💰 *ALUGAR BOT PARA GRUPOS*

Use:
.on dias,id

📌 Exemplo:
.on 1,120363401139765241@g.us

✔️ O bot ficará ativo por 1 dia no grupo.

━━━━━━━━━━━━━━━━━━━

📚 *VER MENU COMPLETO*
Use:
.menu

━━━━━━━━━━━━━━━━━━━

🤖 *NanoBot — Sistema profissional de gestão*`;

    await sock.sendMessage(from, {
      text: texto,
      mentions: [senderId],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });

  } catch (err) {
    console.error('❌ Erro no comando .gestores:', err);

    await sock.sendMessage(from, {
      text: '❌ Erro ao abrir painel de gestores.',
      mentions: [sender],
      contextInfo: {
        stanzaId: msg.key.id,
        participant: sender,
        quotedMessage: msg.message
      }
    });
  }
  break;
}

}

  }

catch(e){

console.log(
"ERRO HANDLE:",
e.message
);

}

}

global.executarComandoInterno = async function(sock, data, comando) {
    return await handleCommand(sock, data, comando);
};

module.exports = { handleCommand, registrarCompraAutomatica };