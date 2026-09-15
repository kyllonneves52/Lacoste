const fs = require("fs");

// ============================================================
// CAMINHOS
// ============================================================

const DATA = "./data";

const pathPacotes = `${DATA}/pacotes_rcbd.json`;
const pathFila = `${DATA}/fila_envios.json`;
const pathReferencias = `${DATA}/referencias.json`;
const pathComprovantes = `${DATA}/comprovantes.json`;
const pathAutomacao = `${DATA}/automacao.json`;
const pathRanking = `${DATA}/rcbd_ranking.json`;

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const LIMITE_MB = 10240;
const TEMPO_ENTRE_PARTES = 22000;
const TEMPO_CACHE = 300000;
const MAX_TENTATIVAS = 3;

// ============================================================
// NOVA ARQUITETURA API LACOSTE AUTO
// ============================================================
const API_URL = String(process.env.LACOSTE_PANEL_URL || "").replace(/\/+$/, "");
const API_TOKEN = String(process.env.LACOSTE_BOT_TOKEN || "");
const DONO = String(process.env.LACOSTE_DONO || "").replace(/\D/g, "");
const AUTORIZADOS = String(process.env.LACOSTE_AUTORIZADOS || "").split(",").map(v => v.replace(/\D/g, "")).filter(Boolean);
const API_ATIVA = !!(API_URL && API_TOKEN);

function numeroDoSender(sender) {
    return String(sender || "").replace(/\D/g, "");
}

function podeUsarEnviar(sender) {
    const n = numeroDoSender(sender);
    if (!n) return false;
    return (DonoValido(n) || AUTORIZADOS.includes(n));
}
function DonoValido(n) {
    return !!Dono && (n.endsWith(DONO) || DONO.endsWith(n));
}

async function criarPedidoServidor(payload) {
    if (!API_ATIVA) {
        throw new Error("API do LACOSTE AUTO não configurada (LACOSTE_PANEL_URL e LACOSTE_BOT_TOKEN).");
    }

    const body = { ...payload };
    delete body.androidId;

    const resp = await fetch(API_URL + "/api/bot/pedido/criar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Bot-Token": API_TOKEN
        },
        body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
        throw new Error(data.message || `Servidor HTTP ${resp.status}`);
    }
    return data;
}

async function associarDispositivoGrupo(groupId, androidId) {
    if (!API_ATIVA) throw new Error("API não configurada.");
    const resp = await fetch(API_URL + "/api/bot/grupo/dispositivo/associar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bot-Token": API_TOKEN },
        body: JSON.stringify({ groupId, androidId })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.message || `Servidor HTTP ${resp.status}`);
    return data;
}

async function statusDispositivoGrupo(groupId) {
    if (!API_ATIVA) throw new Error("API não configurada.");
    const resp = await fetch(API_URL + "/api/bot/grupo/dispositivo/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bot-Token": API_TOKEN },
        body: JSON.stringify({ groupId })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.message || `Servidor HTTP ${resp.status}`);
    return data;
}

async function removerDispositivoGrupo(groupId) {
    if (!API_ATIVA) throw new Error("API não configurada.");
    const resp = await fetch(API_URL + "/api/bot/grupo/dispositivo/remover", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bot-Token": API_TOKEN },
        body: JSON.stringify({ groupId })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.message || `Servidor HTTP ${resp.status}`);
    return data;
}



// ============================================================
// FUNÇÃO ADMIN
// ============================================================

async function isAdmin(sock, from, sender) {
    if (!from.endsWith("@g.us")) return false;
    try {
        const metadata = await sock.groupMetadata(from);
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
        return admins.includes(sender);
    } catch (e) {
        return false;
    }
}

// ============================================================
// GARANTIR DATA
// ============================================================

function garantirData() {
    if (!fs.existsSync(DATA)) {
        fs.mkdirSync(DATA, { recursive: true });
    }
}

// ============================================================
// JSON SEGURO
// ============================================================

function lerJSON(caminho, padrao) {
    try {
        garantirData();
        if (!fs.existsSync(caminho)) {
            fs.writeFileSync(caminho, JSON.stringify(padrao, null, 2));
            return padrao;
        }
        const texto = fs.readFileSync(caminho, "utf8");
        if (!texto.trim()) {
            return padrao;
        }
        return JSON.parse(texto);
    } catch (erro) {
        console.log("ERRO JSON:", caminho, erro.message);
        return padrao;
    }
}

// ============================================================
// SALVAR JSON
// ============================================================

function salvarJSON(caminho, dados) {
    try {
        garantirData();
        const temporario = `${caminho}.tmp`;
        fs.writeFileSync(temporario, JSON.stringify(dados, null, 2));
        fs.renameSync(temporario, caminho);
    } catch (erro) {
        console.log("ERRO AO SALVAR:", caminho, erro.message);
    }
}

// ============================================================
// ESTADO GLOBAL
// ============================================================

global.filaEnvios = global.filaEnvios || [];
global.filaProcessando = global.filaProcessando || false;
global.pendentesEnvio = global.pendentesEnvio || {};
global.comprovanteCache = global.comprovanteCache || {};
global.sockVendas = global.sockVendas || null;

// ============================================================
// AUTOMAÇÃO
// ============================================================

function carregarAutomacao() {
    return lerJSON(pathAutomacao, {});
}

function salvarAutomacao(dados) {
    salvarJSON(pathAutomacao, dados);
}

function automacaoConfig(grupo) {
    const dados = carregarAutomacao();
    const v = dados[grupo];
    if (v === true) return { ativa: true, androidId: "" };
    if (v && typeof v === "object") return { ativa: v.ativa === true, androidId: String(v.androidId || "") };
    return { ativa: false, androidId: "" };
}

function automacaoAtiva(grupo) {
    return automacaoConfig(grupo).ativa;
}

function ativarAutomacao(grupo, androidId) {
    const dados = carregarAutomacao();
    dados[grupo] = { ativa: true, androidId: String(androidId || ""), atualizadoEm: Date.now() };
    salvarAutomacao(dados);
}

function desativarAutomacao(grupo) {
    const dados = carregarAutomacao();
    if (dados[grupo] && typeof dados[grupo] === "object") {
        dados[grupo].ativa = false;
        dados[grupo].atualizadoEm = Date.now();
    } else {
        dados[grupo] = { ativa: false, androidId: "", atualizadoEm: Date.now() };
    }
    salvarAutomacao(dados);
}

// ============================================================
// .IDGRUPO
// ============================================================

async function comandoIdGrupo(sock, data) {
    const from = data.from;
    const sender = data.sender;

    if (!from || !from.endsWith("@g.us")) {
        await sock.sendMessage(from, { text: "Este comando só funciona dentro de um grupo." });
        return true;
    }

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    await sock.sendMessage(from, {
        text:
            "ID DESTE GRUPO\n\n" +
            from +
            "\n\nEnvie este ID ao administrador do serviço para associar o grupo ao dispositivo."
    });

    return true;
}

// ============================================================
// COMANDO AUTOMAÇÃO
// ============================================================

async function comandoAutomacao(sock, data, args) {
    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    const opcao = String(args?.[0] || "").toLowerCase();

    if (opcao === "on") {
        if (!API_ATIVA) {
            await sock.sendMessage(from, { text: "API LACOSTE AUTO não configurada." });
            return true;
        }
        try {
            const r = await statusDispositivoGrupo(from);
            if (!r.registado || !r.grupo || r.grupo.active !== true) {
                await sock.sendMessage(from, { text:
                    "AUTOMAÇÃO NÃO ATIVADA\n\n" +
                    "Este grupo ainda não foi associado a um dispositivo pelo painel LACOSTE AUTO.\n\n" +
                    "O administrador do serviço deve associar este grupo a um Device no painel antes de usar a automação." });
                return true;
            }
            const g = r.grupo;
            ativarAutomacao(from, g.android_id);
            await sock.sendMessage(from, { text:
                "AUTOMAÇÃO ATIVADA\n\n" +
                `Dispositivo: ${g.slot || "-"}\n` +
                `Estado: ${g.status}\n` +
                `FCM: ${g.push_configurado ? "CONFIGURADO" : "AGUARDANDO APP"}\n\n` +
                "O grupo agora está ligado ao dispositivo definido no painel." });
        } catch (e) {
            await sock.sendMessage(from, { text: "Não foi possível verificar o dispositivo do grupo:\n" + e.message });
        }
        return true;
    }

    if (opcao === "off") {
        try { if (API_ATIVA) await removerDispositivoGrupo(from); } catch (e) {}
        desativarAutomacao(from);
        await sock.sendMessage(from, { text: "AUTOMAÇÃO DESATIVADA\n\nO grupo não criará novos pedidos automáticos." });
        return true;
    }

    if (opcao === "status") {
        try {
            const r = API_ATIVA ? await statusDispositivoGrupo(from) : null;
            const c = automacaoConfig(from);
            if (!r || !r.registado) {
                await sock.sendMessage(from, { text: "STATUS DA AUTOMAÇÃO\n\nAutomação: " + (c.ativa ? "ON" : "OFF") + "\nDispositivo: NÃO REGISTADO" });
                return true;
            }
            const g = r.grupo;
            await sock.sendMessage(from, { text:
                "STATUS DA AUTOMAÇÃO\n\n" +
                `Automação: ${c.ativa ? "ON" : "OFF"}\n` +
                `Android ID: ${g.android_id}\n` +
                `Dispositivo: ${g.slot || "-"}\n` +
                `Estado: ${g.status}\n` +
                `Push FCM: ${g.push_configurado ? "CONFIGURADO" : "AGUARDANDO APP"}\n` +
                `Último sinal: ${g.last_seen || "N/D"}` });
        } catch (e) {
            await sock.sendMessage(from, { text: "Erro ao consultar dispositivo:\n" + e.message });
        }
        return true;
    }

    await sock.sendMessage(from, { text:
        "FORMATO:\n\n" +
        ".idgrupo\n" +
        ".automacao on\n" +
        ".automacao off\n" +
        ".automacao status" });
    return true;
}

// ============================================================
// PACOTES
// ============================================================

function carregarPacotes() {
    return lerJSON(pathPacotes, {});
}

function salvarPacotes(dados) {
    salvarJSON(pathPacotes, dados);
}

// ============================================================
// ADD PACOTE
// ============================================================

async function comandoAddPacote(sock, data, args) {
    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    if (args.length < 2) {
        await sock.sendMessage(from, { text: "FORMATO:\n\n.addpacote 100MT 400MB\n\nExemplo:\n.addpacote 100MT 400MB" });
        return true;
    }

    const valor = Number(String(args[0]).replace(/MT/gi, "").trim());
    const pacote = String(args[1]).toUpperCase().trim();

    if (!Number.isFinite(valor) || valor <= 0) {
        await sock.sendMessage(from, { text: "Valor inválido." });
        return true;
    }

    if (!/(MB|GB)/i.test(pacote)) {
        await sock.sendMessage(from, { text: "Pacote inválido.\n\nUse algo como:\n400MB\n2GB" });
        return true;
    }

    const dados = carregarPacotes();
    if (!dados[from]) {
        dados[from] = {};
    }

    dados[from][valor] = { tipo: "venda", pacote: pacote, criado: Date.now() };
    salvarPacotes(dados);

    await sock.sendMessage(from, { text: "PACOTE ADICIONADO\n" + `Valor: ${valor}MT\n` + `Pacote: ${pacote}\n\n` + "O sistema usará este valor automaticamente nos comprovativos." });
    return true;
}

// ============================================================
// ADD SALDO
// ============================================================

async function comandoAddSaldo(sock, data, args) {
    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    if (args.length < 2) {
        await sock.sendMessage(from, { text: "FORMATO:\n\n.addsaldo 100MT 100\nExemplo:\n.addsaldo 100MT 100" });
        return true;
    }

    const valor = Number(String(args[0]).replace(/MT/gi, "").trim());
    const saldo = String(args[1]).replace(/MT/gi, "").trim();
    const quantidade = Number(saldo);

    if (!Number.isFinite(valor) || valor <= 0) {
        await sock.sendMessage(from, { text: "Valor inválido." });
        return true;
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
        await sock.sendMessage(from, { text: "Quantidade de saldo inválida." });
        return true;
    }

    const dados = carregarPacotes();
    if (!dados[from]) {
        dados[from] = {};
    }

    dados[from][valor] = { tipo: "saldo", pacote: String(quantidade), criado: Date.now() };
    salvarPacotes(dados);

    await sock.sendMessage(from, { text: "SALDO CADASTRADO\n" + `Pagamento: ${valor}MT\n` + `Saldo: ${quantidade}MT\n` + "O sistema reconhecerá automaticamente como.saldo." });
    return true;
}

// ============================================================
// REFERÊNCIAS
// ============================================================

function carregarReferencias() {
    return lerJSON(pathReferencias, []);
}

function salvarReferencias(dados) {
    salvarJSON(pathReferencias, dados);
}

function referenciaUtilizada(ref) {
    if (!ref || ref === "N/D") {
        return false;
    }
    const referencias = carregarReferencias();
    return referencias.includes(ref);
}

function registrarReferencia(ref) {
    if (!ref || ref === "N/D") {
        return;
    }
    const referencias = carregarReferencias();
    if (!referencias.includes(ref)) {
        referencias.push(ref);
        salvarReferencias(referencias);
    }
}

// ============================================================
// CACHE DE COMPROVANTE
// ============================================================

function salvarComprovanteCache(id, dados) {
    global.comprovanteCache[id] = {...dados, criado: Date.now() };
    console.log("CACHE COMPROVANTE:", id);
}

function pegarComprovanteCache(id) {
    const dados = global.comprovanteCache[id];
    if (!dados) {
        return null;
    }
    if (Date.now() - dados.criado > TEMPO_CACHE) {
        delete global.comprovanteCache[id];
        return null;
    }
    return dados;
}

function apagarComprovanteCache(id) {
    delete global.comprovanteCache[id];
}

// ============================================================
// EXTRAIR REFERÊNCIA
// ============================================================

function extrairReferencia(body) {
    return (
        body.match(/ID da transacao\s+([A-Z0-9.]+)/i)?.[1]
        ||
        body.match(/Confirmado\s+([A-Z0-9.]+)/i)?.[1]
        ||
        body.match(/refer[êe]ncia[:\s]*([A-Z0-9.]+)/i)?.[1]
        ||
        body.match(/referencia[:\s]*([A-Z0-9.]+)/i)?.[1]
        ||
        null
    );
}

// ============================================================
// EXTRAIR VALOR
// ============================================================

function extrairValorMT(body) {
    const match = body.match(/transferiste\s*([\d.]+)\s*mt/i) || body.match(/montante:\s*([\d.]+)\s*mt/i) || body.match(/([\d.]+)\s*mt/i);
    if (!match) {
        return null;
    }
    const valor = Number(match[1]);
    return Number.isFinite(valor)? valor : null;
}

// ============================================================
// EXTRAIR NÚMERO
// ============================================================

function extrairNumero(body) {
    if (!body) {
        return null;
    }
    const linhas = body.trim().split("\n");
    for (let i = linhas.length - 1; i >= 0; i--) {
        const numero = linhas[i].replace(/\D/g, "");
        if (/^8[4-7]\d{7}$/.test(numero)) {
            return numero;
        }
    }
    return null;
}

// ============================================================
// CONVERTER PACOTE
// ============================================================

function normalizarPacote(registro) {
    if (registro === null || registro === undefined) {
        return null;
    }
    if (typeof registro === "string") {
        const texto = registro.toUpperCase();
        if (texto.includes("MB") || texto.includes("GB")) {
            return { tipo: "venda", pacote: texto };
        }
        return { tipo: "saldo", pacote: texto };
    }
    if (typeof registro === "object") {
        return { tipo: registro.tipo || "venda", pacote: String(registro.pacote || "").toUpperCase() };
    }
    return null;
}

// ============================================================
// QUANTIDADE DE MEGAS
// ============================================================

function converterParaMB(valor) {
    const texto = String(valor).toUpperCase().trim();
    if (texto.endsWith("GB")) {
        const numero = Number(texto.replace("GB", ""));
        return numero * 1024;
    }
    return Number(texto.replace("MB", ""));
}

// ============================================================
// FILA
// ============================================================

function carregarFila() {
    const fila = lerJSON(pathFila, []);
    return Array.isArray(fila)? fila : [];
}

function salvarFila(fila) {
    salvarJSON(pathFila, fila);
}

// ============================================================
// ID PEDIDO
// ============================================================

function criarId() {
    return "ENV-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
}

// ============================================================
// ADICIONAR FILA
// ============================================================

function adicionarPedido(dados) {
    const fila = carregarFila();

    // SISTEMA INTELIGENTE: Se já tem pedido pro mesmo número, junta
    const existente = fila.find(p => p.numero === dados.numero && p.status === "aguardando");

    if (existente) {
        existente.quantidade += Number(dados.quantidade);
        existente.restante += Number(dados.quantidade);
        existente.referencia = existente.referencia + "," + dados.referencia;
        salvarFila(fila);
        global.filaEnvios = fila;
        console.log("PEDIDO JUNTADO:", dados.numero);
        return existente;
    }

    const pedido = {
        id: criarId(),
        from: dados.from,
        sender: dados.sender,
        numero: dados.numero,
        quantidade: Number(dados.quantidade),
        restante: Number(dados.quantidade),
        parteAtual: 0,
        tipo: dados.tipo,
        referencia: dados.referencia || "N/D",
        status: "aguardando",
        criado: Date.now(),
        tentativas: 0
    };

    fila.push(pedido);
    salvarFila(fila);
    global.filaEnvios = fila;
    if (!API_ATIVA) iniciarFila();
    return pedido;
}

// ============================================================
// ESPERAR
// ============================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// EXECUTAR COMANDO REAL
// ============================================================

async function executarComandoReal(sock, data, comando) {
    if (typeof global.executarComandoInterno!== "function") {
        throw new Error("global.executarComandoInterno não está configurado.");
    }
    await global.executarComandoInterno(sock, {...data, internoRCBD: true }, comando);
}

// ============================================================
// EXECUTAR PEDIDO
// ============================================================

async function executarPedido(pedido) {
    let restante = Number(pedido.restante);
    if (!Number.isFinite(restante) || restante <= 0) {
        throw new Error("Quantidade inválida.");
    }

    if (pedido.tipo === "saldo") {
        const comando = `saldo ${restante} ${pedido.numero}`;
        console.log("EXECUTANDO:", comando);
        await executarComandoReal(global.sockVendas, { from: pedido.from, sender: global.sockVendas.user.id }, comando);
        pedido.restante = 0;
        pedido.parteAtual = 1;
        salvarFila(atualizarPedidoNaFila(pedido));
        await finalizarPedido(pedido);
        return;
    }

    let parte = Number(pedido.parteAtual || 0) + 1;
    while (restante > 0) {
        const quantidade = Math.min(restante, LIMITE_MB);
        const comando = `enviar ${quantidade} ${pedido.numero}`;
        console.log("EXECUTANDO:", comando);
        await executarComandoReal(global.sockVendas, { from: pedido.from, sender: global.sockVendas.user.id }, comando);
        restante -= quantidade;
        pedido.restante = restante;
        pedido.parteAtual = parte;
        salvarFila(atualizarPedidoNaFila(pedido));
        if (restante > 0) {
            await enviarMensagem(pedido.from, { text: `ENVIO EM ANDAMENTO\nNúmero: ${pedido.numero}\nParte: ${parte}\nEnviado: ${quantidade}MB\nRestante: ${restante}MB\nPróxima parte em 22 segundos.` });
            await esperar(TEMPO_ENTRE_PARTES);
            parte++;
        }
    }
    await finalizarPedido(pedido);
}

// ============================================================
// ATUALIZAR PEDIDO
// ============================================================

function atualizarPedidoNaFila(pedido) {
    const fila = carregarFila();
    const index = fila.findIndex(item => item.id === pedido.id);
    if (index!== -1) {
        fila[index] = pedido;
    }
    return fila;
}

// ============================================================
// INICIAR FILA
// ============================================================

async function iniciarFila() {
    if (global.filaProcessando) {
        return;
    }
    global.filaProcessando = true;
    try {
        while (true) {
            const fila = carregarFila();
            global.filaEnvios = fila;
            if (fila.length === 0) {
                break;
            }
            const pedido = fila[0];
            if (!pedido) {
                break;
            }
            pedido.status = "processando";
            pedido.tentativas = Number(pedido.tentativas || 0) + 1;
            salvarFila(atualizarPedidoNaFila(pedido));
            try {
                await executarPedido(pedido);

                // ESPERA 23 SEGUNDOS ENTRE PEDIDOS
                await esperar(23000);

                const novaFila = carregarFila();
                novaFila.shift();
                salvarFila(novaFila);
                global.filaEnvios = novaFila;

            } catch (erro) {
                console.log("ERRO NO PEDIDO:", pedido.id, erro.message);
                const filaErro = carregarFila();
                const index = filaErro.findIndex(item => item.id === pedido.id);
                if (index!== -1) {
                    filaErro[index].status = "erro";
                    filaErro[index].erro = erro.message;
                    filaErro[index].tentativas = Number(filaErro[index].tentativas) + 1;
                    // SE ERROU 3 VEZES, TIRA DA FILA
                    if (filaErro[index].tentativas >= MAX_TENTATIVAS) {
                        filaErro.shift();
                    }
                    salvarFila(filaErro);
                }
            }
        }
    } finally {
        global.filaProcessando = false;
    }
}

// ============================================================
// FINALIZAR COM RANKING JUNTO
// ============================================================

async function finalizarPedido(pedido) {
    if (pedido.tipo === "saldo") {
        const estatisticas = gerarEstatisticasTexto(pedido.from, pedido.numero);
        await enviarMensagem(pedido.from, {
            text: `✅ *SALDO ENVIADO COM SUCESSO*\n\n━━━━━━━━━━━\n👤 *Cliente:* @${pedido.numero}\n💵 *Saldo:* ${pedido.quantidade}MT\n📄 *Ref:* ${pedido.referencia}\n━━━━━━━━━━━\n_Transferência concluída_${estatisticas}`,
            mentions: [`${pedido.numero}@s.whatsapp.net`]
        });
        return;
    }
    atualizarRanking(pedido);
    const estatisticas = gerarEstatisticasTexto(pedido.from, pedido.numero);
    await esperar(23000);
    await enviarMensagem(pedido.from, {
        text: `✅ *MEGAS ENVIADOS COM SUCESSO*\n\n━━━━━━━━━━━\n👤 *Cliente:* @${pedido.numero}\n📦 *Pacote:* ${pedido.quantidade}MB\n📄 *Ref:* ${pedido.referencia}\n━━━━━━━━━━━\n_Transferência concluída com sucesso_${estatisticas}`,
        mentions: [`${pedido.numero}@s.whatsapp.net`]
    });
}

// ============================================================
// GERAR ESTATISTICAS
// ============================================================

function gerarEstatisticasTexto(from, numero) {
    const ranking = lerJSON(pathRanking, {});
    const dados = ranking[from]?.[numero];
    if (!dados) return "";

    const todos = Object.values(ranking[from] || {});
    todos.sort((a,b) => b.totalGB - a.totalGB);
    const posicao = todos.findIndex(p => p.numero === numero) + 1;
    const maiorCompra = dados.maiorCompra || (dados.totalGB / Math.max(1, dados.comprasTotal || 1));

    let medalha = "🏅";
    if(posicao === 1) medalha = "🥇";
    if(posicao === 2) medalha = "🥈";
    if(posicao === 3) medalha = "🥉";

    return `\n━━━━━━━━━━━\n📊 *SUAS ESTATÍSTICAS:*\n━━━━━━━━━━━\n📌 Esta é sua *${dados.comprasHoje}ª compra hoje*\n${medalha} *Comprador nº ${posicao}* do grupo\n💾 Total comprado: *${dados.totalGB.toFixed(2)}GB*\n👑 Maior comprado: *${maiorCompra.toFixed(2)}GB*\n━━━━━━━━━━━`;
}

// ============================================================
// MENSAGEM
// ============================================================

async function enviarMensagem(from, mensagem) {
    if (!global.sockVendas ||!from) {
        return;
    }
    await global.sockVendas.sendMessage(from, mensagem);
}

// ============================================================
// RANKING
// ============================================================

function atualizarRanking(pedido) {
    if (pedido.tipo!== "venda") {
        return;
    }
    const ranking = lerJSON(pathRanking, {});
    if (!ranking[pedido.from]) {
        ranking[pedido.from] = {};
    }
    const grupo = ranking[pedido.from];
    const numero = pedido.numero;
    const hoje = new Date().toISOString().split("T")[0];
    if (!grupo[numero]) {
        grupo[numero] = { numero: numero, comprasHoje: 0, totalHojeGB: 0, totalGB: 0, xp: 0, maiorCompra: 0, comprasTotal: 0, ultimaData: hoje };
    }
    const cliente = grupo[numero];
    if (cliente.ultimaData!== hoje) {
        cliente.comprasHoje = 0;
        cliente.totalHojeGB = 0;
        cliente.ultimaData = hoje;
    }
    const gb = Number(pedido.quantidade) / 1024;
    cliente.comprasHoje++;
    cliente.comprasTotal++;
    cliente.totalHojeGB += gb;
    cliente.totalGB += gb;
    cliente.xp += gb;
    if (!cliente.maiorCompra || cliente.maiorCompra < gb) {
        cliente.maiorCompra = gb;
    }
    salvarJSON(pathRanking, ranking);
}

// ============================================================
//.ENVIAR
// ============================================================

async function comandoEnviar(sock, data, args) {
    const from = data.from;
    const sender = data.sender;

    if (!podeUsarEnviar(sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só o dono ou número autorizado pode usar .enviar." });
        return true;
    }
    if (args.length < 2) {
        await sock.sendMessage(from, { text: ".enviar 100 848395255" });
        return true;
    }
    const quantidade = converterParaMB(args[0]);
    const numero = String(args[1]).replace(/\D/g, "");
    if (!Number.isFinite(quantidade) || quantidade <= 0) { await sock.sendMessage(from, { text: "Quantidade inválida." }); return true; }
    if (!/^8[4-7]\d{7}$/.test(numero)) { await sock.sendMessage(from, { text: "Número inválido." }); return true; }

    try {
        const pedido = await criarPedidoServidor({
            tipo: "megas", quantidadeMB: quantidade, quantidadeLabel: quantidade + "MB", numero,
            modoPagamento: "manual", origem: "whatsapp", groupId: from, remetente: numeroDoSender(sender)
        });
        await sock.sendMessage(from, { text: `PEDIDO ENVIADO AO APP\n\nPacote: ${quantidade}MB\nNúmero: ${numero}\nID: ${pedido.pedidoId}\nModo: MANUAL` });
    } catch (e) {
        await sock.sendMessage(from, { text: "Não foi possível criar o pedido no servidor: " + e.message });
    }
    return true;
}

// ============================================================
//.SALDO
// ============================================================

async function comandoSaldo(sock, data, args) {
    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    if (args.length < 2) {
        await sock.sendMessage(from, { text: ".saldo 100 841234567" });
        return true;
    }

    const quantidade = Number(String(args[0]).replace(/MT/gi, ""));
    const numero = String(args[1]).replace(/\D/g, "");

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
        await sock.sendMessage(from, { text: "Saldo inválido." });
        return true;
    }

    if (!/^8[4-7]\d{7}$/.test(numero)) {
        await sock.sendMessage(from, { text: "Número inválido." });
        return true;
    }

    if (API_ATIVA) {
        try {
            const pedido = await criarPedidoServidor({
                tipo: "credito", quantidadeMB: 0, quantidadeLabel: "", numero,
                modoPagamento: "manual", valorMT: quantidade, origem: "whatsapp",
                groupId: from, remetente: numeroDoSender(sender)
            });
            await sock.sendMessage(from, { text: `PEDIDO DE SALDO ENVIADO AO APP\n\nSaldo: ${quantidade}MT\nNúmero: ${numero}\nID: ${pedido.pedidoId}` });
        } catch (e) {
            await sock.sendMessage(from, { text: "Não foi possível criar o pedido no servidor: " + e.message });
        }
        return true;
    }

    const pedido = adicionarPedido({ from, sender, numero, quantidade, tipo: "saldo", referencia: "MANUAL" });
    await sock.sendMessage(from, { text: `PEDIDO SALDO ADICIONADO\nSaldo: ${quantidade}MT\nNúmero: ${numero}\nID: ${pedido.id}` });
    return true;
}

// ============================================================
//.PEDIDOS
// ============================================================

async function comandoPedidos(sock, data) {
    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, { text: "Sem permissão. Só admin do grupo." });
        return true;
    }

    const fila = carregarFila();
    global.filaEnvios = fila;

    if (fila.length === 0) {
        await sock.sendMessage(from, { text: "PEDIDOS\nNão existem pedidos no JSON." });
        return true;
    }

    let texto = "PEDIDOS NA FILA\n";
    fila.forEach((pedido, index) => {
        texto += `PEDIDO ${index + 1}\nID: ${pedido.id}\nTipo: ${pedido.tipo}\nNúmero: ${pedido.numero}\nTotal: ${pedido.quantidade}${pedido.tipo === "saldo"? "MT" : "MB"}\nRestante: ${pedido.restante}${pedido.tipo === "saldo"? "MT" : "MB"}\nParte: ${pedido.parteAtual || 0}\nStatus: ${pedido.status}\nReferência: ${pedido.referencia || "N/D"}\n`;
        if (pedido.erro) {
            texto += `Erro: ${pedido.erro}\n`;
        }
        texto += `Criado: ${new Date(pedido.criado).toLocaleString("pt-PT")}\n\n--------------------\n\n`;
    });
    texto += `TOTAL: ${fila.length}`;
    await sock.sendMessage(from, { text });
    return true;
}

// ============================================================
// PROCESSAR NÚMERO PENDENTE
// ============================================================

async function processarNumeroPendente(sock, data, body) {
    const sender = data.sender;
    const pendente = global.pendentesEnvio[sender];
    if (!pendente) {
        return false;
    }
    if (Date.now() - pendente.criado > TEMPO_CACHE) {
        delete global.pendentesEnvio[sender];
        return false;
    }
    const numero = String(body).replace(/\D/g, "");
    if (!/^8[4-7]\d{7}$/.test(numero)) {
        return false;
    }
    delete global.pendentesEnvio[sender];
    if (API_ATIVA) {
        try {
            const pedido = await criarPedidoServidor({
                tipo: pendente.tipo === "saldo" ? "credito" : "megas",
                quantidadeMB: pendente.tipo === "venda" ? pendente.quantidade : 0,
                quantidadeLabel: pendente.tipo === "venda" ? pendente.quantidade + "MB" : "",
                numero, modoPagamento: "normal", pagamentoId: pendente.referencia,
                valorPagamento: Number(pendente.valor || 0), pagamentoTimestamp: pendente.criado,
                groupId: data.from,
                valorMT: pendente.tipo === "saldo" ? pendente.quantidade : undefined, origem: "comprovativo", remetente: numeroDoSender(sender)
            });
            await sock.sendMessage(data.from, { text: `PEDIDO ENVIADO AO APP\nNúmero: ${numero}\nID: ${pedido.pedidoId}\nAguardando validação do SMS.` });
            return true;
        } catch (e) {
            await sock.sendMessage(data.from, { text: "Não foi possível criar o pedido no servidor: " + e.message });
            return true;
        }
    }
    const pedido = adicionarPedido({ from: pendente.from, sender, numero, quantidade: pendente.quantidade, tipo: pendente.tipo, referencia: pendente.referencia });
    await sock.sendMessage(data.from, { text: `PEDIDO RECEBIDO\nNúmero: ${numero}\nTipo: ${pendente.tipo}\nQuantidade: ${pendente.quantidade}\n\nID: ${pedido.id}\nAdicionado à fila.` });
    return true;
}

// ============================================================
// COMPRA AUTOMÁTICA
// ============================================================

async function processarComprovativo(sock, data, body) {
    const from = data.from;
    const sender = data.sender;
    if (!automacaoAtiva(from)) {
        return false;
    }
    const pareceComprovativo = /transferiste.*\d+.*mt/i.test(body) || /montante:\s*\d+.*mt/i.test(body);
    if (!pareceComprovativo) {
        return false;
    }
    const referencia = extrairReferencia(body) || "N/D";
    if (referencia!== "N/D" && referenciaUtilizada(referencia)) {
        await sock.sendMessage(from, { text: `COMPROVATIVO JÁ UTILIZADO\nReferência: ${referencia}` });
        return true;
    }
    const valor = extrairValorMT(body);
    if (!valor) {
        return false;
    }
    salvarComprovanteCache(from, { referencia, valor, sender, data: new Date().toLocaleDateString("pt-PT"), hora: new Date().toLocaleTimeString("pt-PT") });
    const tabela = carregarPacotes();
    const registro = tabela[from]?.[valor];
    if (!registro) {
        await sock.sendMessage(from, { text: `PAGAMENTO RECEBIDO\nValor: ${valor}MT\nNenhum pacote cadastrado para este valor.` });
        return true;
    }
    const pacote = normalizarPacote(registro);
    if (!pacote) {
        return false;
    }
    let numero = extrairNumero(body);
    if (referencia!== "N/D") {
        registrarReferencia(referencia);
    }
    if (pacote.tipo === "venda") {
        const quantidade = converterParaMB(pacote.pacote);
        if (!Number.isFinite(quantidade) || quantidade <= 0) return false;

        if (numero) {
            try {
                const pedido = await criarPedidoServidor({
                    tipo: "megas", quantidadeMB: quantidade, quantidadeLabel: pacote.pacote, numero,
                    modoPagamento: "normal", pagamentoId: referencia, valorPagamento: valor,
                    pagamentoTimestamp: Date.now(), origem: "comprovativo", groupId: from, remetente: numeroDoSender(sender)
                });
                await sock.sendMessage(from, { text: `PAGAMENTO RECEBIDO\nValor: ${valor}MT\nPacote: ${pacote.pacote}\nNúmero: ${numero}\nRef: ${referencia}\nPedido: ${pedido.pedidoId}\n\nAguardando validação do SMS pelo app.` });
                return true;
            } catch (e) {
                await sock.sendMessage(from, { text: "Pagamento identificado, mas o pedido não foi enviado ao app: " + e.message });
                return true;
            }
        }
        global.pendentesEnvio[sender] = { from, sender, quantidade, tipo: "venda", referencia, valor, criado: Date.now() };
        await sock.sendMessage(from, { text: `PAGAMENTO RECEBIDO\nPacote: ${pacote.pacote}\nRef: ${referencia}\nEnvie agora o número que vai receber os MB.` });
        return true;
    }

    const saldo = Number(pacote.pacote);
    if (!Number.isFinite(saldo) || saldo <= 0) {
        return false;
    }
    if (numero) {
        try {
            const pedido = await criarPedidoServidor({
                tipo: "credito", quantidadeMB: 0, quantidadeLabel: "", numero,
                modoPagamento: "normal", pagamentoId: referencia, valorPagamento: valor,
                pagamentoTimestamp: Date.now(), valorMT: saldo, origem: "comprovativo",
                groupId: from, remetente: numeroDoSender(sender)
            });
            await sock.sendMessage(from, { text: `PAGAMENTO CONFIRMADO\n\nValor: ${valor}MT\nSaldo: ${saldo}MT\nNúmero: ${numero}\nRef: ${referencia}\nPedido: ${pedido.pedidoId}\n\nAguardando validação do SMS pelo app.` });
            return true;
        } catch (e) {
            await sock.sendMessage(from, { text: "Pagamento identificado, mas não foi possível criar o pedido: " + e.message });
            return true;
        }
    }
    global.pendentesEnvio[sender] = { from, sender, quantidade: saldo, tipo: "saldo", referencia, criado: Date.now() };
    await sock.sendMessage(from, { text: `PAGAMENTO CONFIRMADO\nSaldo: ${saldo}MT\nEnvie agora o número que vai receber o saldo.` });
    return true;
}

// ============================================================
// PROCESSADOR DO SISTEMA
// ============================================================

async function processar(sock, data, body) {
    global.sockVendas = sock;
    if (!body) {
        return false;
    }
    const texto = body.trim();
    const partes = texto.split(/\s+/);
    const comando = partes[0].replace(/^\./, "").toLowerCase();
    const args = partes.slice(1);

    if (comando === "automacao") {
        return comandoAutomacao(sock, data, args);
    }
    if (comando === "addpacote") {
        return comandoAddPacote(sock, data, args);
    }
    if (comando === "addsaldo") {
        return comandoAddSaldo(sock, data, args);
    }
    if (comando === "enviar") {
        return comandoEnviar(sock, data, args);
    }
    if (comando === "saldo") {
        return comandoSaldo(sock, data, args);
    }
    if (comando === "pedidos") {
        return comandoPedidos(sock, data);
    }
    if (!texto.startsWith(".")) {
        const processado = await processarNumeroPendente(sock, data, texto);
        if (processado) {
            return true;
        }
    }
    if (!texto.startsWith(".")) {
        const processado = await processarComprovativo(sock, data, texto);
        if (processado) {
            return true;
        }
    }
    return false;
}

// ============================================================
// INICIALIZAR FILA
// ============================================================

function inicializar() {
    const fila = carregarFila();
    let alterou = false;
    for (const pedido of fila) {
        if (pedido.status === "processando") {
            pedido.status = "aguardando";
            alterou = true;
        }
    }
    if (alterou) {
        salvarFila(fila);
    }
    global.filaEnvios = fila;
    console.log("SISTEMA DE VENDAS INICIADO");
    console.log("Pedidos no JSON:", fila.length);
    if (fila.length > 0 && !API_ATIVA) {
        iniciarFila();
    } else if (fila.length > 0 && API_ATIVA) {
        console.log("API LACOSTE AUTO ativa: fila local antiga não será executada automaticamente.");
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    processar,
    inicializar,
    comandoEnviar,
    comandoSaldo,
    comandoPedidos,
    comandoAddPacote,
    comandoAddSaldo,
    comandoAutomacao,
    adicionarPedido,
    iniciarFila,
    processarComprovativo,
    processarNumeroPendente,
    salvarComprovanteCache,
    pegarComprovanteCache,
    carregarPacotes,
    salvarPacotes,
    carregarFila,
    salvarFila,
    criarPedidoServidor,
    associarDispositivoGrupo,
    statusDispositivoGrupo,
    removerDispositivoGrupo
};