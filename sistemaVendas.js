const fs = require("fs");

// ============================================================
// SISTEMA DE VENDAS - LACOSTE AUTO
// Fluxo: BOT -> API -> APP -> SMS -> envio -> API -> BOT
// ============================================================

const DATA = "./data";
const pathPacotes = `${DATA}/pacotes_rcbd.json`;
const pathFila = `${DATA}/fila_envios.json`;
const pathReferencias = `${DATA}/referencias.json`;
const pathComprovantes = `${DATA}/comprovantes.json`;
const pathAutomacao = `${DATA}/automacao.json`;
const pathRanking = `${DATA}/rcbd_ranking.json`;
const pathGrupoConfig = `${DATA}/grupo_config.json`;
const pathCarteiras = `${DATA}/carteiras.json`;

const LIMITE_MB = 10240;
const TEMPO_ENTRE_PARTES = 22000;
const TEMPO_CACHE = 300000;
const MAX_TENTATIVAS = 3;

// O APP usa 35 segundos para verificar o SMS.
// O BOT NÃO usa 35 segundos como timeout.
// O BOT continua consultando a API até completed ou failed.
const INTERVALO_STATUS_PEDIDO = 5000;

const API_URL = "https://lacoste-site.vercel.app";
const API_TOKEN = "lacoste_bot_kyllon_2026_xyz_789";
const API_ATIVA = !!(API_URL && API_TOKEN);


function numeroDoSender(sender) {
    return String(sender || "");
}

// ============================================================
// JSON / ARQUIVOS
// ============================================================

function garantirData() {
    if (!fs.existsSync(DATA)) {
        fs.mkdirSync(DATA, { recursive: true });
    }
}

function lerJSON(caminho, padrao) {
    try {
        garantirData();

        if (!fs.existsSync(caminho)) {
            fs.writeFileSync(
                caminho,
                JSON.stringify(padrao, null, 2)
            );
            return padrao;
        }

        const texto = fs.readFileSync(caminho, "utf8");

        if (!texto.trim()) {
            return padrao;
        }

        return JSON.parse(texto);

    } catch (erro) {
        console.log(
            "ERRO JSON:",
            caminho,
            erro.message
        );

        return padrao;
    }
}

function salvarJSON(caminho, dados) {
    try {
        garantirData();

        const temporario = `${caminho}.tmp`;

        fs.writeFileSync(
            temporario,
            JSON.stringify(dados, null, 2)
        );

        fs.renameSync(
            temporario,
            caminho
        );

    } catch (erro) {
        console.log(
            "ERRO AO SALVAR:",
            caminho,
            erro.message
        );
    }
}

// ============================================================
// API LACOSTE AUTO
// ============================================================

async function apiPost(path, body) {

    if (!API_ATIVA) {
        throw new Error(
            "API LACOSTE AUTO não configurada."
        );
    }

    const resp = await fetch(
        API_URL + path,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "X-Bot-Token": API_TOKEN
            },

            body: JSON.stringify(body || {})
        }
    );

    const data = await resp
        .json()
        .catch(() => ({}));

    if (!resp.ok || !data.ok) {
        throw new Error(
            data.message ||
            `Servidor HTTP ${resp.status}`
        );
    }

    return data;
}

function carregarGrupoConfig(groupId) {
    const dados = lerJSON(pathGrupoConfig, {});
    const c = dados[groupId] || {};
    return { smsVerificationActive: c.smsVerificationActive === true, smsProvider: c.smsProvider || "all", simPreference: Number(c.simPreference || 0) };
}
function salvarGrupoConfig(groupId, config) { const dados=lerJSON(pathGrupoConfig,{}); dados[groupId]={...carregarGrupoConfig(groupId),...config,atualizadoEm:Date.now()}; salvarJSON(pathGrupoConfig,dados); return dados[groupId]; }
async function configurarGrupoServidor(groupId, config) { return apiPost("/api/bot/grupo/config", {groupId,...config}); }
function tipoPagamentoComprovativo(body) { const t=String(body||"").toLowerCase(); if(/\bconfirmado\s+[a-z0-9.]+/.test(t)) return "vodacom"; if(/id\s+da\s+transacao\s+[a-z0-9.]+/.test(t)) return "emola"; return null; }
async function comandoConfig(sock,data,args){ const from=data.from; if(!from||!from.endsWith("@g.us")){await sock.sendMessage(from,{text:"Use este comando dentro do grupo."});return true;} if(!await isAdmin(sock,from,data.sender)){await sock.sendMessage(from,{text:"Sem permissão. Só administradores do grupo."});return true;} const sub=String(args[0]||"").toLowerCase(), valor=String(args[1]||"").toLowerCase(); let cfg=carregarGrupoConfig(from); if(sub==="sim"){if(!["1","2"].includes(valor)){await sock.sendMessage(from,{text:"Use .config sim1 ou .config sim2"});return true;}cfg=salvarGrupoConfig(from,{simPreference:Number(valor)});} else if(sub==="sms"){const map={voda:"vodacom",vodacom:"vodacom",emola:"emola","e-mola":"emola",todos:"all",all:"all",off:"off"};if(!(valor in map)){await sock.sendMessage(from,{text:"Use .config sms voda, .config sms emola, .config sms todos ou .config sms off"});return true;}const provider=map[valor];cfg=salvarGrupoConfig(from,{smsVerificationActive:provider!=="off",smsProvider:provider==="off"?"all":provider});} else {await sock.sendMessage(from,{text:"Use .config sim1 / .config sim2 / .config sms voda / .config sms emola / .config sms todos / .config sms off"});return true;} try{await configurarGrupoServidor(from,cfg);}catch(e){await sock.sendMessage(from,{text:"⚠️ Configuração salva no bot, mas o servidor não confirmou: "+e.message});return true;}await sock.sendMessage(from,{text:`⚙️ *CONFIGURAÇÃO ATUALIZADA*\n\n📡 Envio de MB: *${cfg.simPreference?"SIM "+cfg.simPreference:"automático"}*\n🔐 LC Verification: *${cfg.smsVerificationActive?cfg.smsProvider:"desativado"}*`});return true;}

async function criarPedidoServidor(payload) {

    const body = { ...payload };
    if(body.groupId){ const cfg=carregarGrupoConfig(body.groupId); body.smsVerificationActive=cfg.smsVerificationActive; body.smsProvider=cfg.smsProvider; body.simPreference=cfg.simPreference; }

    delete body.androidId;

    return apiPost(
        "/api/bot/pedido/criar",
        body
    );
}

async function consultarPedidoServidor(
    pedidoId,
    groupId
) {
    return apiPost(
        "/api/bot/pedido/status",
        {
            pedidoId,
            groupId
        }
    );
}

async function listarFilaServidor(groupId) { return apiPost("/api/bot/pedidos/fila", { groupId }); }
async function cancelarPedidoServidor(pedidoId, groupId) { return apiPost("/api/bot/pedido/cancelar", { pedidoId, groupId }); }

async function associarDispositivoGrupo(
    groupId,
    androidId
) {
    return apiPost(
        "/api/bot/grupo/dispositivo/associar",
        {
            groupId,
            androidId
        }
    );
}

async function statusDispositivoGrupo(groupId) {
    return apiPost(
        "/api/bot/grupo/dispositivo/status",
        {
            groupId
        }
    );
}

async function removerDispositivoGrupo(groupId) {
    return apiPost(
        "/api/bot/grupo/dispositivo/remover",
        {
            groupId
        }
    );
}


async function listarDispositivosGestao() {
    return apiPost("/api/bot/dispositivos/listar", {});
}

async function listarLicencasGestao() {
    return apiPost("/api/bot/licencas/listar", {});
}

async function aprovarLicencaGestao(requestId, days = 30) {
    return apiPost("/api/bot/licenca/aprovar", {
        requestId,
        days
    });
}

async function rejeitarLicencaGestao(requestId, reason = "Rejeitado pelo gestor") {
    return apiPost("/api/bot/licenca/rejeitar", {
        requestId,
        reason
    });
}

async function listarGruposDispositivosGestao() {
    return apiPost("/api/bot/grupos/dispositivos", {});
}


// ============================================================
// ACOMPANHAMENTO DO PEDIDO
// ============================================================

function esperar(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function pedidoJaFinalizado(id) {

    global.pedidosFinalizados =
        global.pedidosFinalizados || {};

    return !!global.pedidosFinalizados[id];
}

function marcarPedidoFinalizado(id) {

    global.pedidosFinalizados =
        global.pedidosFinalizados || {};

    global.pedidosFinalizados[id] =
        Date.now();

    const agora = Date.now();

    for (
        const [k, v]
        of Object.entries(global.pedidosFinalizados)
    ) {
        if (
            agora - Number(v) >
            3600000
        ) {
            delete global.pedidosFinalizados[k];
        }
    }
}

async function acompanharPedidoServidor(
    sock,
    dados
) {

    const pedidoId =
        String(dados.pedidoId || "").trim();

    const from = dados.from;

    if (!pedidoId || !API_ATIVA) {
        return;
    }

    if (pedidoJaFinalizado(pedidoId)) {
        return;
    }

    console.log(
        "ACOMPANHANDO PEDIDO:",
        pedidoId
    );

    while (true) {

        try {

            const r =
                await consultarPedidoServidor(
                    pedidoId,
                    from
                );

            const pedido =
                r.pedido || {};

            const status =
                String(
                    pedido.status || ""
                ).toLowerCase();

            // ==================================================
            // PEDIDO CONCLUÍDO
            // ==================================================

            if (status === "completed") {

                marcarPedidoFinalizado(
                    pedidoId
                );

                const tipoFinal = String(
                    dados.tipo ||
                    pedido.tipo ||
                    "megas"
                ).toLowerCase();

                const numeroFinal = String(
                    dados.numero ||
                    pedido.numero ||
                    ""
                ).replace(/\D/g, "");

                const quantidadeMB = Number(
                    dados.quantidadeMB ||
                    pedido.quantidadeMB ||
                    dados.quantidade ||
                    pedido.quantidade ||
                    0
                );

                let textoConcluido =
                    mensagemPedidoConcluido({
                        ...dados,
                        ...pedido,
                        pedidoId,
                        numero: numeroFinal ||
                            dados.numero ||
                            pedido.numero,
                        quantidadeMB:
                            quantidadeMB ||
                            dados.quantidadeMB ||
                            pedido.quantidadeMB,
                        quantidade:
                            quantidadeMB ||
                            dados.quantidade ||
                            pedido.quantidade
                    });

                // Ranking / estatísticas: MESMO sistema do comandos.js
                // (compras.json via registrarCompraAutomatica)
                let mentionId = null;
                if (
                    numeroFinal &&
                    quantidadeMB > 0 &&
                    (tipoFinal === "megas" ||
                        tipoFinal === "venda" ||
                        tipoFinal === "saldo" ||
                        tipoFinal === "credito")
                ) {
                    try {
                        const {
                            registrarCompraAutomatica
                        } = require("./comandos.js");

                        const unidade =
                            tipoFinal === "saldo" ||
                            tipoFinal === "credito"
                                ? "saldo"
                                : "mb";

                        const resultado =
                            await registrarCompraAutomatica(
                                from,
                                numeroFinal,
                                quantidadeMB,
                                unidade
                            );

                        mentionId =
                            resultado.numeroComprador;

                        const stats =
                            formatarEstatisticasDoComandos(
                                resultado
                            );

                        if (stats) {
                            textoConcluido += stats;
                        }
                    } catch (e) {
                        console.log(
                            "ERRO RANKING (comandos):",
                            e.message
                        );
                    }
                }

                const msg = {
                    text: textoConcluido
                };

                if (mentionId) {
                    msg.mentions = [mentionId];
                } else if (
                    numeroFinal &&
                    /^8[4-7]\d{7}$/.test(numeroFinal)
                ) {
                    msg.mentions = [
                        `${numeroFinal}@s.whatsapp.net`
                    ];
                }

                await enviarMensagem(
                    from,
                    msg
                );

                return;
            }

            // ==================================================
            // PEDIDO FALHOU
            // ==================================================

            if (status === "failed" || status === "cancelled") {

                marcarPedidoFinalizado(
                    pedidoId
                );

                await enviarMensagem(
                    from,
                    {
                        text:
                            mensagemPedidoFalhou(
                                {
                                    ...dados,
                                    ...pedido,
                                    pedidoId
                                }
                            )
                    }
                );

                return;
            }

            // ==================================================
            // PENDING
            // ==================================================
            // Não existe timeout aqui.
            //
            // O bot continua esperando até o APP/API informar
            // completed ou failed.
            // ==================================================

        } catch (e) {

            // Uma falha temporária na consulta da API
            // não significa que o pedido falhou.

            console.log(
                "ERRO AO CONSULTAR PEDIDO",
                pedidoId,
                e.message
            );
        }

        await esperar(
            INTERVALO_STATUS_PEDIDO
        );
    }
}

function iniciarAcompanhamentoPedido(
    sock,
    dados
) {

    if (
        !dados ||
        !dados.pedidoId
    ) {
        return;
    }

    global.acompanhamentosPedidos =
        global.acompanhamentosPedidos || {};

    if (
        global.acompanhamentosPedidos[
            dados.pedidoId
        ]
    ) {
        return;
    }

    global.acompanhamentosPedidos[
        dados.pedidoId
    ] = true;

    acompanharPedidoServidor(
        sock,
        dados
    )
    .catch(e => {
        console.log(
            "ERRO NO ACOMPANHAMENTO:",
            e.message
        );
    })
    .finally(() => {

        delete global.acompanhamentosPedidos[
            dados.pedidoId
        ];
    });
}

// ============================================================
// MENSAGENS
// ============================================================

function mensagemPedidoConcluido(p) {

    const tipo = String(p.tipo || "megas").toLowerCase();
    const numero = p.numero || "N/D";
    const id = p.pedidoId || "N/D";
    const ref = p.pagamentoId || p.referencia || "N/D";

    if (tipo === "credito" || tipo === "saldo") {
        return [
            "✅ *PEDIDO CONCLUÍDO*",
            "",
            `📱 *Número:* ${numero}`,
            `💰 *Saldo:* ${p.valorMT || p.quantidade || 0}MT`,
            `📄 *Ref:* ${ref}`,
            `🆔 *Pedido:* ${id}`,
            "",
            "🎉 _O saldo foi enviado com sucesso pelo LACOSTE AUTO._"
        ].join("\n");
    }

    const mb = Number(p.quantidadeMB || p.quantidade || 0);

    return [
        "✅ *PEDIDO CONCLUÍDO*",
        "",
        `📱 *Número:* ${numero}`,
        `📊 *Pacote:* ${mb}MB`,
        `📄 *Ref:* ${ref}`,
        `🆔 *Pedido:* ${id}`,
        "",
        "🎉 _Os MB foram enviados com sucesso pelo LACOSTE AUTO._"
    ].join("\n");
}

function mensagemPedidoFalhou(p) {

    const tipo = String(p.tipo || "megas").toLowerCase();
    const numero = p.numero || "N/D";
    const id = p.pedidoId || "N/D";
    const motivo = p.erro || p.error || p.motivo || p.message ||
        "O aplicativo não conseguiu confirmar ou concluir o envio.";

    return [
        "❌ *PEDIDO NÃO CONCLUÍDO*",
        "",
        `📱 *Número:* ${numero}`,
        tipo === "credito" || tipo === "saldo"
            ? `💰 *Saldo:* ${p.valorMT || p.quantidade || 0}MT`
            : `📊 *Pacote:* ${Number(p.quantidadeMB || p.quantidade || 0)}MB`,
        `🆔 *Pedido:* ${id}`,
        "",
        `⚠️ *Motivo:* ${motivo}`
    ].join("\n");
}

// ============================================================
// MENSAGEM DE PAGAMENTO AGUARDANDO
// ============================================================

function mensagemAguardandoPedido(p) {
    const numero = p.numero || "N/D";
    const pacote = p.quantidadeLabel || (p.quantidadeMB ? `${p.quantidadeMB}MB` : "N/D");
    const ref = p.pagamentoId || p.referencia || "N/D";
    const valor = p.valorPagamento || p.valorMT || 0;

    return [
        "💳 *PAGAMENTO RECEBIDO*",
        "",
        `💵 *Valor:* ${valor}MT`,
        `📦 *Pacote:* ${pacote}`,
        `📱 *Número:* ${numero}`,
        `📄 *Ref:* ${ref}`,
        `🆔 *Pedido:* ${p.pedidoId || "N/D"}`,
        "",
        "⏳ _O LACOSTE AUTO está processando a transferência._",
        "",
        "_O pedido será concluído após o app confirmar o envio dos MB._"
    ].join("\n");
}

// ============================================================
// MENSAGEM DE PEDIDO MANUAL
// ============================================================

function mensagemPedidoManual(p) {
    const n = p.numero || "N/D";
    const q = Number(p.quantidadeMB || 0);
    const partes = Math.ceil(q / LIMITE_MB);

    return [
        "📤 *PEDIDO RECEBIDO*",
        "",
        `📱 *Número:* ${n}`,
        `📊 *Pacote:* ${q}MB`,
        `📦 *Partes:* ${partes}`,
        `🆔 *Pedido:* ${p.pedidoId || "N/D"}`,
        "",
        "⏳ _O LACOSTE AUTO está processando a transferência._"
    ].join("\n");
}

// ============================================================
// ADMIN / LID
// ============================================================
// Usa o mesmo conceito de administrador do sistema de comandos:
// consulta os participantes do grupo e aceita tanto p.id como
// p.lid. Isso evita falhas quando o WhatsApp entrega @lid.
// ============================================================

async function isAdmin(sock, from, sender) {
    if (!String(from || "").endsWith("@g.us")) {
        return false;
    }

    const alvo = normalizarLid(sender);
    if (!alvo) {
        return false;
    }

    try {
        const metadata = await sock.groupMetadata(from);
        const participantes = Array.isArray(metadata?.participants)
            ? metadata.participants
            : [];

        const participante = participantes.find(p =>
            String(p?.id || "") === alvo ||
            String(p?.lid || "") === alvo
        );

        return Boolean(
            participante &&
            participante.admin
        );
    } catch (e) {
        console.log("ERRO VERIFICAR ADMIN:", e.message);
        return false;
    }
}

// ============================================================
// PERMISSÕES
// ============================================================
// Todos os comandos protegidos usam apenas a condição:
// o remetente precisa ser administrador do grupo.
// Não existe sistema de donos neste arquivo.

// ============================================================
// CARTEIRA / CAIXA INTERNO
// ============================================================

function carregarCarteiras() {
    return lerJSON(pathCarteiras, {});
}

function salvarCarteiras(dados) {
    salvarJSON(pathCarteiras, dados);
}

function chaveCarteira(grupo, usuario) {
    return `${String(grupo || "")}:${String(usuario || "")}`;
}

function nomeMencionado(data, usuario) {
    const n = String(usuario || "").split("@")[0];
    return data?.nome || `@${n}`;
}

function saldoCarteira(grupo, usuario) {
    const dados = carregarCarteiras();
    const c = dados[chaveCarteira(grupo, usuario)];
    return Number(c?.saldo || 0);
}

function alterarCarteira(grupo, usuario, valor, movimento, autor) {
    const dados = carregarCarteiras();
    const chave = chaveCarteira(grupo, usuario);
    const atual = dados[chave] || { saldo: 0, movimentos: [] };
    const saldoAnterior = Number(atual.saldo || 0);
    const novoSaldo = saldoAnterior + Number(valor);

    if (novoSaldo < -0.000001) {
        throw new Error("Saldo insuficiente.");
    }

    atual.saldo = Math.round(novoSaldo * 100) / 100;
    atual.movimentos = Array.isArray(atual.movimentos) ? atual.movimentos : [];
    atual.movimentos.unshift({
        tipo: movimento,
        valor: Math.round(Math.abs(Number(valor)) * 100) / 100,
        saldoAnterior: Math.round(saldoAnterior * 100) / 100,
        saldo: atual.saldo,
        autor: autor || null,
        data: new Date().toISOString()
    });
    atual.movimentos = atual.movimentos.slice(0, 10);
    dados[chave] = atual;
    salvarCarteiras(dados);
    return atual;
}

function extrairAlvoCarteira(sock, data, args) {
    const ctx = data?.msg?.message?.extendedTextMessage?.contextInfo ||
        data?.msg?.message?.imageMessage?.contextInfo || {};
    const mentioned = Array.isArray(ctx.mentionedJid) && ctx.mentionedJid[0]
        ? ctx.mentionedJid[0]
        : null;
    if (mentioned) {
        return { usuario: mentioned, valorArg: args?.[0] };
    }
    return { usuario: data.sender, valorArg: args?.[0] };
}

async function comandoCarteira(sock, data) {
    const grupo = data.from;
    const usuario = data.sender;
    const dados = carregarCarteiras();
    const c = dados[chaveCarteira(grupo, usuario)] || { saldo: 0, movimentos: [] };
    const movimentos = Array.isArray(c.movimentos) ? c.movimentos.slice(0, 5) : [];

    let texto = [
        "╭─👛✨ *MINHA CARTEIRA* ✨👛─╮",
        "",
        `👤 @${String(usuario).split("@")[0]}`,
        `💰 Saldo: *${Number(c.saldo || 0).toFixed(2)} MT*`,
        "",
        "🧾 *Últimos movimentos:*"
    ].join("\n");

    if (!movimentos.length) {
        texto += "\n📭 Nenhum movimento ainda.";
    } else {
        texto += "\n" + movimentos.map(m => {
            const sinal = m.tipo === "deposito" ? "+" : "-";
            const nome = m.tipo === "deposito" ? "Depósito" : "Retirada";
            return `${m.tipo === "deposito" ? "➕" : "➖"} ${nome}: *${sinal}${Number(m.valor || 0).toFixed(2)} MT*`;
        }).join("\n");
    }

    texto += "\n\n╰──────────────────────────╯";
    await sock.sendMessage(grupo, { text: texto, mentions: [usuario] });
    return true;
}

async function comandoAlterarCarteira(sock, data, args, tipo) {
    const grupo = data.from;
    if (!String(grupo).endsWith("@g.us")) {
        await sock.sendMessage(grupo, { text: "❌ A carteira só funciona em grupos." });
        return true;
    }

    const admin = await isAdmin(sock, grupo, data.sender);
    const alvoInfo = extrairAlvoCarteira(sock, data, args);
    const alvo = alvoInfo.usuario;
    const valor = Number(String(alvoInfo.valorArg || "").replace(/MT/gi, "").replace(",", "."));

    if (!Number.isFinite(valor) || valor <= 0) {
        await sock.sendMessage(grupo, {
            text: tipo === "deposito"
                ? "❌ Use: .depositar 20\nOu, para gestor: .depositar @pessoa 20"
                : "❌ Use: .retirar 20\nOu, para gestor: .retirar @pessoa 20"
        });
        return true;
    }

    // Cada utilizador pode mexer apenas na própria carteira.
    // Um administrador do grupo pode gerir a carteira de um membro mencionado.
    if (alvo !== data.sender && !admin) {
        await sock.sendMessage(grupo, { text: "❌ Só um administrador pode alterar a carteira de outra pessoa." });
        return true;
    }

    try {
        const c = alterarCarteira(
            grupo,
            alvo,
            tipo === "deposito" ? valor : -valor,
            tipo,
            data.sender
        );

        await sock.sendMessage(grupo, {
            text: tipo === "deposito"
                ? `✅ +${valor.toFixed(2)} MT na carteira de @${String(alvo).split("@")[0]}\n💵 Saldo: ${Number(c.saldo).toFixed(2)} MT`
                : `✅ -${valor.toFixed(2)} MT da carteira de @${String(alvo).split("@")[0]}\n💵 Saldo: ${Number(c.saldo).toFixed(2)} MT`,
            mentions: [alvo]
        });
    } catch (e) {
        await sock.sendMessage(grupo, { text: `❌ ${e.message}` });
    }
    return true;
}

// ============================================================
// AUTOMAÇÃO
// ============================================================

function carregarAutomacao() {

    return lerJSON(
        pathAutomacao,
        {}
    );
}

function salvarAutomacao(dados) {

    salvarJSON(
        pathAutomacao,
        dados
    );
}

function automacaoConfig(grupo) {

    const dados =
        carregarAutomacao();

    const v =
        dados[grupo];

    if (v === true) {
        return {
            ativa: true,
            androidId: ""
        };
    }

    if (
        v &&
        typeof v === "object"
    ) {

        return {
            ativa:
                v.ativa === true,

            androidId:
                String(
                    v.androidId || ""
                )
        };
    }

    return {
        ativa: false,
        androidId: ""
    };
}

function automacaoAtiva(grupo) {

    return automacaoConfig(
        grupo
    ).ativa;
}

function ativarAutomacao(
    grupo,
    androidId
) {

    const dados =
        carregarAutomacao();

    dados[grupo] = {
        ativa: true,
        androidId:
            String(
                androidId || ""
            ),
        atualizadoEm:
            Date.now()
    };

    salvarAutomacao(
        dados
    );
}

function desativarAutomacao(
    grupo
) {

    const dados =
        carregarAutomacao();

    if (
        dados[grupo] &&
        typeof dados[grupo] === "object"
    ) {

        dados[grupo].ativa = false;

        dados[grupo].atualizadoEm =
            Date.now();

    } else {

        dados[grupo] = {
            ativa: false,
            androidId: "",
            atualizadoEm:
                Date.now()
        };
    }

    salvarAutomacao(
        dados
    );
}

// ============================================================
// COMANDO AUTOMAÇÃO
// ============================================================

async function comandoAutomacao(
    sock,
    data,
    args
) {

    const from = data.from;
    const sender = data.sender;

    if (
        !await isAdmin(
            sock,
            from,
            sender
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Sem permissão. Só admin do grupo."
            }
        );

        return true;
    }

    const opcao =
        String(
            args?.[0] || ""
        ).toLowerCase();

    // ========================================================
    // ON
    // ========================================================

    if (opcao === "on") {

        if (!API_ATIVA) {

            await sock.sendMessage(
                from,
                {
                    text:
                        "API LACOSTE AUTO não configurada."
                }
            );

            return true;
        }

        const androidId =
            String(
                args?.[1] || ""
            ).trim();

        if (!androidId) {

            await sock.sendMessage(
                from,
                {
                    text:
                        "FORMATO:\n\n" +
                        ".automacao on ANDROID_ID\n\n" +
                        "No app, copia o Android ID " +
                        "e coloca aqui."
                }
            );

            return true;
        }

        try {

            const r =
                await associarDispositivoGrupo(
                    from,
                    androidId
                );

            ativarAutomacao(
                from,
                androidId
            );

            await sock.sendMessage(
                from,
                {
                    text:
                        "━━━━━━━━━━━━━━━━━━\n" +
                        "AUTOMAÇÃO ATIVADA\n" +
                        "━━━━━━━━━━━━━━━━━━\n\n" +
                        `Grupo: ${from}\n` +
                        `Android ID: ${r.androidId}\n` +
                        `Dispositivo: ${r.slot || "-"}\n\n` +
                        "Este grupo agora criará pedidos " +
                        "para este dispositivo.\n\n" +
                        "━━━━━━━━━━━━━━━━━━"
                }
            );

        } catch (e) {

            await sock.sendMessage(
                from,
                {
                    text:
                        "Não foi possível associar " +
                        "o dispositivo:\n" +
                        e.message
                }
            );
        }

        return true;
    }

    // ========================================================
    // OFF
    // ========================================================

    if (opcao === "off") {

        try {

            if (API_ATIVA) {
                await removerDispositivoGrupo(
                    from
                );
            }

        } catch (e) {}

        desativarAutomacao(
            from
        );

        await sock.sendMessage(
            from,
            {
                text:
                    "━━━━━━━━━━━━━━━━━━\n" +
                    "AUTOMAÇÃO DESATIVADA\n" +
                    "━━━━━━━━━━━━━━━━━━\n\n" +
                    "O grupo não criará novos pedidos " +
                    "automáticos.\n\n" +
                    "━━━━━━━━━━━━━━━━━━"
            }
        );

        return true;
    }

    // ========================================================
    // STATUS
    // ========================================================

    if (opcao === "status") {

        try {

            const r =
                API_ATIVA
                    ? await statusDispositivoGrupo(
                        from
                    )
                    : null;

            const c =
                automacaoConfig(
                    from
                );

            if (
                !r ||
                !r.registado
            ) {

                await sock.sendMessage(
                    from,
                    {
                        text:
                            "━━━━━━━━━━━━━━━━━━\n" +
                            "STATUS DA AUTOMAÇÃO\n" +
                            "━━━━━━━━━━━━━━━━━━\n\n" +
                            "Automação: " +
                            (
                                c.ativa
                                    ? "ON"
                                    : "OFF"
                            ) +
                            "\n" +
                            "Dispositivo: NÃO REGISTADO\n\n" +
                            "━━━━━━━━━━━━━━━━━━"
                    }
                );

                return true;
            }

            const g =
                r.grupo;

            await sock.sendMessage(
                from,
                {
                    text:
                        "━━━━━━━━━━━━━━━━━━\n" +
                        "STATUS DA AUTOMAÇÃO\n" +
                        "━━━━━━━━━━━━━━━━━━\n\n" +
                        "Automação: " +
                        (
                            c.ativa
                                ? "ON"
                                : "OFF"
                        ) +
                        "\n" +
                        `Android ID: ${g.android_id}\n` +
                        `Dispositivo: ${g.slot || "-"}\n` +
                        `Estado: ${g.status}\n` +
                        "Push FCM: " +
                        (
                            g.push_configurado
                                ? "CONFIGURADO"
                                : "AGUARDANDO APP"
                        ) +
                        "\n" +
                        `Último sinal: ${
                            g.last_seen || "N/D"
                        }\n\n` +
                        "━━━━━━━━━━━━━━━━━━"
                }
            );

        } catch (e) {

            await sock.sendMessage(
                from,
                {
                    text:
                        "Erro ao consultar dispositivo:\n" +
                        e.message
                }
            );
        }

        return true;
    }

    await sock.sendMessage(
        from,
        {
            text:
                "FORMATO:\n\n" +
                ".automacao on ANDROID_ID\n" +
                ".automacao off\n" +
                ".automacao status"
        }
    );

    return true;
}

// ============================================================
// PACOTES
// ============================================================

function carregarPacotes() {

    return lerJSON(
        pathPacotes,
        {}
    );
}

function salvarPacotes(dados) {

    salvarJSON(
        pathPacotes,
        dados
    );
}


function pacotesAtivos(grupo) {
    const dados = carregarPacotes();
    const grupoDados = dados[grupo] || {};
    return Object.entries(grupoDados)
        .filter(([, p]) => p && p.tipo === "venda" && p.excluido !== true)
        .sort((a, b) => Number(a[0]) - Number(b[0]));
}

async function comandoPacotes(sock, data) {
    const lista = pacotesAtivos(data.from);
    if (!lista.length) {
        await sock.sendMessage(data.from, {
            text: "📦 *PACOTES DISPONÍVEIS*\n\nNenhum pacote de MB/GB está cadastrado neste grupo."
        });
        return true;
    }
    const texto = "📦 *PACOTES DISPONÍVEIS*\n━━━━━━━━━━━━━━━━━━\n" +
        lista.map(([valor, p], i) => `${i + 1}. 💵 *${valor} MT* → 📊 *${p.pacote}*`).join("\n") +
        "\n━━━━━━━━━━━━━━━━━━";
    await sock.sendMessage(data.from, { text: texto });
    return true;
}

async function comandoEliminarPacote(sock, data, args, restaurar = false) {
    if (!await isAdmin(sock, data.from, data.sender)) {
        await sock.sendMessage(data.from, { text: "❌ Apenas administradores podem alterar os pacotes." });
        return true;
    }
    const valor = Number(String(args?.[0] || "").replace(/MT/gi, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
        await sock.sendMessage(data.from, { text: restaurar ? "❌ Use: .addrestaurar 20" : "❌ Use: .addeliminar 20" });
        return true;
    }
    const dados = carregarPacotes();
    const grupo = dados[data.from] || {};
    const chave = Object.keys(grupo).find(k => Number(k) === valor);
    if (!chave || !grupo[chave] || grupo[chave].tipo !== "venda") {
        await sock.sendMessage(data.from, { text: `❌ Não existe pacote de ${valor} MT neste grupo.` });
        return true;
    }
    if (restaurar) {
        if (grupo[chave].excluido !== true) {
            await sock.sendMessage(data.from, { text: `ℹ️ O pacote ${valor} MT já está ativo.` });
            return true;
        }
        delete grupo[chave].excluido;
        delete grupo[chave].excluidoEm;
        delete grupo[chave].excluidoPor;
        grupo[chave].restauradoEm = Date.now();
    } else {
        if (grupo[chave].excluido === true) {
            await sock.sendMessage(data.from, { text: `ℹ️ O pacote ${valor} MT já está eliminado.` });
            return true;
        }
        grupo[chave].excluido = true;
        grupo[chave].excluidoEm = Date.now();
        grupo[chave].excluidoPor = data.sender;
    }
    dados[data.from] = grupo;
    salvarPacotes(dados);
    await sock.sendMessage(data.from, {
        text: restaurar
            ? `♻️ Pacote restaurado: *${valor} MT → ${grupo[chave].pacote}*`
            : `🗑️ Pacote eliminado: *${valor} MT → ${grupo[chave].pacote}*\n\nUse *.addrestaurar ${valor}* para voltar a ativá-lo.`
    });
    return true;
}

// ============================================================
// ADD PACOTE
// ============================================================

async function comandoAddPacote(
    sock,
    data,
    args
) {

    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, {
            text: "Acesso reservado aos administradores deste grupo."
        });
        return true;
    }

    /*
     * Aceita vários pares de uma vez:
     * .addpacote 20MT 910MB 23MT 1024MB 24MT 1090MB
     */
    if (!Array.isArray(args) || args.length < 2 || args.length % 2 !== 0) {
        await sock.sendMessage(from, {
            text:
                "Formato: .addpacote VALOR PACOTE [VALOR PACOTE ...]\n\n" +
                "Exemplo completo:\n" +
                ".addpacote 95MT 5120MB 180MT 10240MB 360MT 20480MB 540MT 30720MB 720MT 40960MB 900MT 51200MB 1080MT 61440MB 1260MT 71680MB 1440MT 81920MB 1620MT 92160MB 1800MT 102400MB\n\n" +
                "Também podes cadastrar apenas um par."
        });
        return true;
    }

    const dados = carregarPacotes();

    if (!dados[from]) {
        dados[from] = {};
    }

    const adicionados = [];
    const erros = [];

    for (let i = 0; i < args.length; i += 2) {
        const valor = Number(
            String(args[i]).replace(/MT/gi, "").trim()
        );

        const pacote = String(args[i + 1] || "")
            .toUpperCase()
            .trim();

        if (!Number.isFinite(valor) || valor <= 0) {
            erros.push(`${args[i]} ${args[i + 1]} — valor inválido`);
            continue;
        }

        if (!/^(?:\d+(?:\.\d+)?)(?:MB|GB)$/i.test(pacote)) {
            erros.push(`${args[i]} ${args[i + 1]} — pacote inválido`);
            continue;
        }

        dados[from][valor] = {
            tipo: "venda",
            pacote,
            criado: Date.now()
        };

        adicionados.push(`${valor}MT → ${pacote}`);
    }

    if (!adicionados.length) {
        await sock.sendMessage(from, {
            text:
                "Nenhum pacote foi cadastrado.\n\n" +
                "Exemplo: .addpacote 95MT 5120MB 180MT 10240MB 360MT 20480MB 540MT 30720MB 720MT 40960MB 900MT 51200MB 1080MT 61440MB 1260MT 71680MB 1440MT 81920MB 1620MT 92160MB 1800MT 102400MB"
        });
        return true;
    }

    salvarPacotes(dados);

    let resposta =
        "LACOSTE AUTO | PACOTES ATUALIZADOS\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        `Foram gravados ${adicionados.length} pacote(s) de uma vez.\n\n` +
        adicionados.map((x, i) => `${i + 1}. ${x}`).join("\n");

    if (erros.length) {
        resposta +=
            "\n\nItens ignorados:\n" +
            erros.map(x => `• ${x}`).join("\n");
    }

    resposta +=
        "\n━━━━━━━━━━━━━━━━━━━━\n" +
        "Os valores já ficam disponíveis para o reconhecimento automático.";

    await sock.sendMessage(from, { text: resposta });

    return true;
}

// ============================================================
// ADD SALDO
// ============================================================

async function comandoAddSaldo(
    sock,
    data,
    args
) {

    const from = data.from;
    const sender = data.sender;

    if (!await isAdmin(sock, from, sender)) {
        await sock.sendMessage(from, {
            text: "Acesso reservado aos administradores deste grupo."
        });
        return true;
    }

    /*
     * Aceita vários pares de uma vez:
     * .addsaldo 20MT 20 23MT 23 50MT 50
     */
    if (!Array.isArray(args) || args.length < 2 || args.length % 2 !== 0) {
        await sock.sendMessage(from, {
            text:
                "Formato: .addsaldo VALOR SALDO [VALOR SALDO ...]\n\n" +
                "Exemplo:\n" +
                ".addsaldo 20MT 20 23MT 23 50MT 50\n\n" +
                "Também podes cadastrar apenas um par."
        });
        return true;
    }

    const dados = carregarPacotes();

    if (!dados[from]) {
        dados[from] = {};
    }

    const adicionados = [];
    const erros = [];

    for (let i = 0; i < args.length; i += 2) {
        const valor = Number(
            String(args[i]).replace(/MT/gi, "").trim()
        );

        const quantidade = Number(
            String(args[i + 1]).replace(/MT/gi, "").trim()
        );

        if (!Number.isFinite(valor) || valor <= 0) {
            erros.push(`${args[i]} ${args[i + 1]} — valor inválido`);
            continue;
        }

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
            erros.push(`${args[i]} ${args[i + 1]} — saldo inválido`);
            continue;
        }

        dados[from][valor] = {
            tipo: "saldo",
            pacote: String(quantidade),
            criado: Date.now()
        };

        adicionados.push(`${valor}MT → ${quantidade}MT`);
    }

    if (!adicionados.length) {
        await sock.sendMessage(from, {
            text:
                "Nenhum saldo foi cadastrado.\n\n" +
                "Exemplo: .addsaldo 20MT 20"
        });
        return true;
    }

    salvarPacotes(dados);

    let resposta =
        "LACOSTE AUTO | SALDOS ATUALIZADOS\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        `Foram gravados ${adicionados.length} saldo(s) de uma vez.\n\n` +
        adicionados.map((x, i) => `${i + 1}. ${x}`).join("\n");

    if (erros.length) {
        resposta +=
            "\n\nItens ignorados:\n" +
            erros.map(x => `• ${x}`).join("\n");
    }

    resposta +=
        "\n━━━━━━━━━━━━━━━━━━━━\n" +
        "A tabela já está pronta para o reconhecimento automático.";

    await sock.sendMessage(from, { text: resposta });

    return true;
}

// ============================================================
// REFERÊNCIAS
// ============================================================

function carregarReferencias() {

    return lerJSON(
        pathReferencias,
        []
    );
}

function salvarReferencias(dados) {

    salvarJSON(
        pathReferencias,
        dados
    );
}

function referenciaUtilizada(ref) {

    if (
        !ref ||
        ref === "N/D"
    ) {
        return false;
    }

    const referencias =
        carregarReferencias();

    return referencias.includes(
        ref
    );
}

function registrarReferencia(ref) {

    if (
        !ref ||
        ref === "N/D"
    ) {
        return;
    }

    const referencias =
        carregarReferencias();

    if (
        !referencias.includes(ref)
    ) {

        referencias.push(ref);

        salvarReferencias(
            referencias
        );
    }
}

// ============================================================
// CACHE DE COMPROVANTE
// ============================================================

function salvarComprovanteCache(
    id,
    dados
) {

    global.comprovanteCache =
        global.comprovanteCache || {};

    global.comprovanteCache[id] = {
        ...dados,
        criado: Date.now()
    };

    console.log(
        "CACHE COMPROVANTE:",
        id
    );
}

function pegarComprovanteCache(id) {

    const dados =
        global.comprovanteCache?.[id];

    if (!dados) {
        return null;
    }

    if (
        Date.now() -
        dados.criado >
        TEMPO_CACHE
    ) {

        delete global.comprovanteCache[id];

        return null;
    }

    return dados;
}

function apagarComprovanteCache(id) {

    if (
        global.comprovanteCache
    ) {
        delete global.comprovanteCache[id];
    }
}

// ============================================================
// EXTRAIR REFERÊNCIA
// ============================================================

function extrairReferencia(body) {

    const raw =
        body.match(
            /ID da transacao\s+([A-Z0-9.]+)/i
        )?.[1]

        ||

        body.match(
            /Confirmado\s+([A-Z0-9.]+)/i
        )?.[1]

        ||

        body.match(
            /refer[êe]ncia[:\s]*([A-Z0-9.]+)/i
        )?.[1]

        ||

        body.match(
            /referencia[:\s]*([A-Z0-9.]+)/i
        )?.[1]

        ||

        null;

    if (!raw) {
        return null;
    }

    // Remove pontos finais / pontuação no fim (ex: DHU8LE5S6J0.)
    return String(raw)
        .replace(/[.\s]+$/g, "")
        .trim() || null;
}

// ============================================================
// EXTRAIR VALOR
// ============================================================

function extrairValorMT(body) {

    const match =
        body.match(
            /transferiste\s*([\d.]+)\s*mt/i
        )
        ||

        body.match(
            /montante:\s*([\d.]+)\s*mt/i
        )
        ||

        body.match(
            /([\d.]+)\s*mt/i
        );

    if (!match) {
        return null;
    }

    const valor =
        Number(match[1]);

    return Number.isFinite(valor)
        ? valor
        : null;
}

// ============================================================
// EXTRAIR NÚMERO
// ============================================================

function normalizarNumeroMoz(numero) {
    let n = String(numero || "")
        .trim()
        .replace(/[^0-9]/g, "");

    // Número internacional: 258848395255 -> 848395255.
    // Número nacional: 848395255 -> permanece igual.
    if (/^2588[4-7]\d{7}$/.test(n)) {
        n = n.slice(3);
    }

    return /^8[4-7]\d{7}$/.test(n) ? n : null;
}

function linhaESoNumero(linha) {
    const texto = String(linha || "").trim();

    if (!texto) {
        return null;
    }

    // Só aceita se a linha inteira for o número.
    if (!/^(?:\+?258[\s.-]*)?8[4-7][\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d$/.test(texto)) {
        return null;
    }

    return normalizarNumeroMoz(texto);
}

function extrairNumeros(body) {

    if (!body) {
        return [];
    }

    const encontrados = [];
    const linhas = String(body).split(/\r?\n/);

    for (const linha of linhas) {
        const numero = linhaESoNumero(linha);

        if (numero && !encontrados.includes(numero)) {
            encontrados.push(numero);
        }
    }

    return encontrados;
}

function extrairNumero(body) {

    const numeros = extrairNumeros(body);

    return numeros.length
        ? numeros[numeros.length - 1]
        : null;
}

// ============================================================
// CONVERTER PACOTE
// ============================================================

function normalizarPacote(
    registro
) {

    if (
        registro === null ||
        registro === undefined
    ) {
        return null;
    }

    if (
        typeof registro === "string"
    ) {

        const texto =
            registro.toUpperCase();

        if (
            texto.includes("MB") ||
            texto.includes("GB")
        ) {

            return {
                tipo: "venda",
                pacote: texto
            };
        }

        return {
            tipo: "saldo",
            pacote: texto
        };
    }

    if (
        typeof registro === "object"
    ) {

        return {
            tipo:
                registro.tipo ||
                "venda",

            pacote:
                String(
                    registro.pacote ||
                    ""
                ).toUpperCase()
        };
    }

    return null;
}

// ============================================================
// QUANTIDADE DE MEGAS
// ============================================================

function converterParaMB(valor) {

    const texto =
        String(valor)
            .toUpperCase()
            .trim();

    if (
        texto.endsWith("GB")
    ) {

        const numero =
            Number(
                texto.replace(
                    "GB",
                    ""
                )
            );

        return numero * 1024;
    }

    return Number(
        texto.replace(
            "MB",
            ""
        )
    );
}

// ============================================================
// FILA LOCAL
// ============================================================

function carregarFila() {

    const fila =
        lerJSON(
            pathFila,
            []
        );

    return Array.isArray(fila)
        ? fila
        : [];
}

function salvarFila(fila) {

    salvarJSON(
        pathFila,
        fila
    );
}

// ============================================================
// ID PEDIDO LOCAL
// ============================================================

function criarId() {

    return (
        "ENV-" +
        Date.now() +
        "-" +
        Math.floor(
            Math.random() * 9999
        )
    );
}

// ============================================================
// ADICIONAR FILA LOCAL
// ============================================================

function adicionarPedido(
    dados
) {

    const fila =
        carregarFila();

    const existente =
        fila.find(
            p =>
                p.numero ===
                    dados.numero &&
                p.status ===
                    "aguardando"
        );

    if (existente) {

        existente.quantidade +=
            Number(
                dados.quantidade
            );

        existente.restante +=
            Number(
                dados.quantidade
            );

        existente.referencia =
            existente.referencia +
            "," +
            (
                dados.referencia ||
                "N/D"
            );

        salvarFila(
            fila
        );

        global.filaEnvios =
            fila;

        console.log(
            "PEDIDO JUNTADO:",
            dados.numero
        );

        return existente;
    }

    const pedido = {

        id: criarId(),

        from:
            dados.from,

        sender:
            dados.sender,

        numero:
            dados.numero,

        quantidade:
            Number(
                dados.quantidade
            ),

        restante:
            Number(
                dados.quantidade
            ),

        parteAtual: 0,

        tipo:
            dados.tipo,

        referencia:
            dados.referencia ||
            "N/D",

        status:
            "aguardando",

        criado:
            Date.now(),

        tentativas: 0
    };

    fila.push(
        pedido
    );

    salvarFila(
        fila
    );

    global.filaEnvios =
        fila;

    if (!API_ATIVA) {
        iniciarFila();
    }

    return pedido;
}

// ============================================================
// EXECUTAR COMANDO REAL
// ============================================================

async function executarComandoReal(
    sock,
    data,
    comando
) {

    if (
        typeof global.executarComandoInterno !==
        "function"
    ) {

        throw new Error(
            "global.executarComandoInterno não está configurado."
        );
    }

    await global.executarComandoInterno(
        sock,
        {
            ...data,
            internoRCBD: true
        },
        comando
    );
}

// ============================================================
// EXECUTAR PEDIDO LOCAL
// ============================================================

async function executarPedido(
    pedido
) {

    let restante =
        Number(
            pedido.restante
        );

    if (
        !Number.isFinite(restante) ||
        restante <= 0
    ) {

        throw new Error(
            "Quantidade inválida."
        );
    }

    if (
        pedido.tipo ===
        "saldo"
    ) {

        const comando =
            `saldo ${restante} ${pedido.numero}`;

        console.log(
            "EXECUTANDO:",
            comando
        );

        await executarComandoReal(
            global.sockVendas,
            {
                from:
                    pedido.from,

                sender:
                    global.sockVendas.user.id
            },
            comando
        );

        pedido.restante = 0;
        pedido.parteAtual = 1;

        salvarFila(
            atualizarPedidoNaFila(
                pedido
            )
        );

        await finalizarPedido(
            pedido
        );

        return;
    }

    let parte =
        Number(
            pedido.parteAtual || 0
        ) + 1;

    while (
        restante > 0
    ) {

        const quantidade =
            Math.min(
                restante,
                LIMITE_MB
            );

        const comando =
            `enviar ${quantidade} ${pedido.numero}`;

        console.log(
            "EXECUTANDO:",
            comando
        );

        await executarComandoReal(
            global.sockVendas,
            {
                from:
                    pedido.from,

                sender:
                    global.sockVendas.user.id
            },
            comando
        );

        restante -=
            quantidade;

        pedido.restante =
            restante;

        pedido.parteAtual =
            parte;

        salvarFila(
            atualizarPedidoNaFila(
                pedido
            )
        );

        if (
            restante > 0
        ) {

            await enviarMensagem(
                pedido.from,
                {
                    text:
                        "ENVIO EM ANDAMENTO\n\n" +
                        `Número: ${pedido.numero}\n` +
                        `Parte: ${parte}\n` +
                        `Enviado: ${quantidade}MB\n` +
                        `Restante: ${restante}MB\n\n` +
                        "Próxima parte em 22 segundos."
                }
            );

            await esperar(
                TEMPO_ENTRE_PARTES
            );

            parte++;
        }
    }

    await finalizarPedido(
        pedido
    );
}

// ============================================================
// ATUALIZAR PEDIDO NA FILA
// ============================================================

function atualizarPedidoNaFila(
    pedido
) {

    const fila =
        carregarFila();

    const index =
        fila.findIndex(
            item =>
                item.id ===
                pedido.id
        );

    if (
        index !== -1
    ) {

        fila[index] =
            pedido;
    }

    return fila;
}

// ============================================================
// INICIAR FILA
// ============================================================

async function iniciarFila() {

    if (
        global.filaProcessando
    ) {
        return;
    }

    global.filaProcessando =
        true;

    try {

        while (true) {

            const fila =
                carregarFila();

            global.filaEnvios =
                fila;

            if (
                fila.length === 0
            ) {
                break;
            }

            const pedido =
                fila[0];

            if (!pedido) {
                break;
            }

            pedido.status =
                "processando";

            pedido.tentativas =
                Number(
                    pedido.tentativas ||
                    0
                ) + 1;

            salvarFila(
                atualizarPedidoNaFila(
                    pedido
                )
            );

            try {

                await executarPedido(
                    pedido
                );

                await esperar(
                    23000
                );

                const novaFila =
                    carregarFila();

                novaFila.shift();

                salvarFila(
                    novaFila
                );

                global.filaEnvios =
                    novaFila;

            } catch (erro) {

                console.log(
                    "ERRO NO PEDIDO:",
                    pedido.id,
                    erro.message
                );

                const filaErro =
                    carregarFila();

                const index =
                    filaErro.findIndex(
                        item =>
                            item.id ===
                            pedido.id
                    );

                if (
                    index !== -1
                ) {

                    filaErro[index].status =
                        "erro";

                    filaErro[index].erro =
                        erro.message;

                    filaErro[index].tentativas =
                        Number(
                            filaErro[index]
                                .tentativas
                        ) + 1;

                    if (
                        filaErro[index]
                            .tentativas >=
                        MAX_TENTATIVAS
                    ) {

                        filaErro.shift();
                    }

                    salvarFila(
                        filaErro
                    );
                }
            }
        }

    } finally {

        global.filaProcessando =
            false;
    }
}

// ============================================================
// FINALIZAR PEDIDO LOCAL
// ============================================================

async function finalizarPedido(
    pedido
) {

    // O registro de compras pertence ao sistema original de comandos.js.
    // Aqui apenas chamamos esse sistema automaticamente quando o pedido
    // realmente chegou ao estado concluído.
    try {
        const {
            registrarCompraAutomatica
        } = require("./comandos.js");

        const unidade = String(pedido.tipo || "megas").toLowerCase() === "saldo"
            ? "saldo"
            : "mb";

        const resultado = await registrarCompraAutomatica(
            pedido.from,
            pedido.numero,
            Number(pedido.quantidade),
            unidade
        );

        await enviarMensagem(
            pedido.from,
            {
                text: resultado.texto,
                mentions: [resultado.numeroComprador]
            }
        );

    } catch (err) {
        console.error(
            "❌ Erro ao registrar compra concluída pelo sistema de compras:",
            err
        );

        // Não volta para rcbd_ranking.json e não inventa outro ranking.
        // O pedido continua concluído; apenas o registro estatístico falhou.
    }
}

// ============================================================
// ESTATÍSTICAS (mesmo sistema do comandos.js / compras.json)
// ============================================================

/**
 * Formata o bloco de estatísticas a partir do resultado de
 * registrarCompraAutomatica / registrarCompraNoSistema (comandos.js).
 * Ranking e totais vêm de config/compras.json — não de rcbd_ranking.json.
 */
function formatarEstatisticasDoComandos(resultado) {
    if (!resultado) return "";

    const posicao = Number(resultado.posicao) || 0;
    const comprasHoje = Number(resultado.comprasHoje) || 0;
    const unidade = String(resultado.unidade || "mb").toLowerCase();

    // totalCompradoUser já vem como "1234MB" ou "50Saldo"
    let totalTexto = resultado.totalCompradoUser || "0";
    let totalGB = 0;

    if (unidade === "saldo") {
        const n = parseFloat(String(totalTexto).replace(/[^\d.]/g, "")) || 0;
        totalTexto = `${n} Saldo`;
    } else {
        const mb = parseFloat(String(totalTexto).replace(/[^\d.]/g, "")) || 0;
        totalGB = mb / 1024;
        totalTexto = `${totalGB.toFixed(2)}GB`;
    }

    const maiorRaw = Number(resultado.maiorCompradorTotal) || 0;
    const maiorTexto =
        unidade === "saldo"
            ? `${maiorRaw} Saldo`
            : `${(maiorRaw / 1024).toFixed(2)}GB`;

    let medalha = "🏅";
    if (posicao === 1) medalha = "🥇";
    else if (posicao === 2) medalha = "🥈";
    else if (posicao === 3) medalha = "🥉";

    return (
        "\n\n━━━━━━━━━━━━━━━━━━\n" +
        "SUAS ESTATÍSTICAS\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        `Esta é sua ${comprasHoje}ª compra hoje\n` +
        `${medalha} Comprador nº ${posicao} do grupo\n` +
        `Total comprado: ${totalTexto}\n` +
        `Maior comprador do grupo: ${maiorTexto}\n` +
        "━━━━━━━━━━━━━━━━━━"
    );
}

/**
 * Fallback antigo (rcbd_ranking.json) — mantido só se alguém ainda chamar.
 * Preferir sempre formatarEstatisticasDoComandos / registrarCompraAutomatica.
 */
function gerarEstatisticasTexto(from, numero) {
    try {
        const pathCompras = "./config/compras.json";
        if (!fs.existsSync(pathCompras)) return "";

        const compras = JSON.parse(
            fs.readFileSync(pathCompras, "utf-8") || "{}"
        );

        if (!compras[from]) return "";

        const userKey = numero.includes("@")
            ? numero
            : `${numero}@s.whatsapp.net`;

        // tenta várias chaves possíveis
        let user = compras[from][userKey];
        let chaveUsada = userKey;

        if (!user) {
            const numLimpo = String(numero).replace(/\D/g, "");
            const encontrada = Object.keys(compras[from]).find((id) =>
                id.includes(numLimpo)
            );
            if (encontrada) {
                user = compras[from][encontrada];
                chaveUsada = encontrada;
            }
        }

        if (!user) return "";

        const ranking = Object.entries(compras[from])
            .filter(([, d]) => d && typeof d === "object")
            .sort((a, b) => (b[1].Megas || 0) - (a[1].Megas || 0));

        const posicao =
            ranking.findIndex(([id]) => id === chaveUsada) + 1;

        const totalMB = Number(user.Megas) || 0;
        const totalGB = totalMB / 1024;
        const comprasHoje = Number(user.Megashoje) || 0;

        const maiorMB = ranking.length
            ? Number(ranking[0][1].Megas) || 0
            : 0;

        let medalha = "🏅";
        if (posicao === 1) medalha = "🥇";
        else if (posicao === 2) medalha = "🥈";
        else if (posicao === 3) medalha = "🥉";

        return (
            "\n\n━━━━━━━━━━━━━━━━━━\n" +
            "SUAS ESTATÍSTICAS\n" +
            "━━━━━━━━━━━━━━━━━━\n" +
            `Esta é sua ${comprasHoje}ª compra hoje\n` +
            `${medalha} Comprador nº ${posicao} do grupo\n` +
            `Total comprado: ${totalGB.toFixed(2)}GB\n` +
            `Maior comprador do grupo: ${(maiorMB / 1024).toFixed(2)}GB\n` +
            "━━━━━━━━━━━━━━━━━━"
        );
    } catch (e) {
        console.log("ERRO gerarEstatisticasTexto:", e.message);
        return "";
    }
}

// ============================================================
// MENSAGEM
// ============================================================

async function enviarMensagem(
    from,
    mensagem
) {

    if (
        !global.sockVendas ||
        !from
    ) {
        return;
    }

    await global.sockVendas.sendMessage(
        from,
        mensagem
    );
}

// ============================================================
// RANKING
// ============================================================

function atualizarRanking(
    pedido
) {

    const tipoRank = String(
        pedido.tipo || ""
    ).toLowerCase();

    // Aceita "venda" (local) e "megas" (API)
    if (
        tipoRank !== "venda" &&
        tipoRank !== "megas"
    ) {
        return;
    }

    const ranking =
        lerJSON(
            pathRanking,
            {}
        );

    if (
        !ranking[pedido.from]
    ) {

        ranking[pedido.from] =
            {};
    }

    const grupo =
        ranking[pedido.from];

    const numero =
        pedido.numero;

    const hoje =
        new Date()
            .toISOString()
            .split("T")[0];

    if (
        !grupo[numero]
    ) {

        grupo[numero] = {

            numero,

            comprasHoje: 0,

            totalHojeGB: 0,

            totalGB: 0,

            xp: 0,

            maiorCompra: 0,

            comprasTotal: 0,

            ultimaData: hoje
        };
    }

    const cliente =
        grupo[numero];

    if (
        cliente.ultimaData !==
        hoje
    ) {

        cliente.comprasHoje = 0;

        cliente.totalHojeGB = 0;

        cliente.ultimaData =
            hoje;
    }

    const gb =
        Number(
            pedido.quantidade
        ) / 1024;

    cliente.comprasHoje++;

    cliente.comprasTotal++;

    cliente.totalHojeGB +=
        gb;

    cliente.totalGB +=
        gb;

    cliente.xp +=
        gb;

    if (
        !cliente.maiorCompra ||
        cliente.maiorCompra < gb
    ) {

        cliente.maiorCompra =
            gb;
    }

    salvarJSON(
        pathRanking,
        ranking
    );
}

// ============================================================
// .ENVIAR
// ============================================================

async function comandoEnviar(
    sock,
    data,
    args
) {

    const from =
        data.from;

    const sender =
        data.sender;

    if (
        !await isAdmin(
            sock,
            from,
            sender
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text: "Sem permissão. Só administrador do grupo pode usar este comando."
            }
        );

        return true;
    }

    if (
        args.length < 2
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "FORMATO:\n\n" +
                    ".enviar 100 848395255\n\n" +
                    "Também pode usar:\n" +
                    ".enviar 1GB 848395255"
            }
        );

        return true;
    }

    const quantidade =
        converterParaMB(
            args[0]
        );

    const numero =
        String(
            args[1]
        )
            .replace(
                /\D/g,
                ""
            );

    if (
        !Number.isFinite(
            quantidade
        ) ||
        quantidade <= 0
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Quantidade inválida."
            }
        );

        return true;
    }

    if (
        !/^8[4-7]\d{7}$/.test(
            numero
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Número inválido."
            }
        );

        return true;
    }

    try {

        const pedido =
            await criarPedidoServidor(
                {
                    tipo: "megas",

                    quantidadeMB:
                        quantidade,

                    quantidadeLabel:
                        quantidade +
                        "MB",

                    numero,

                    modoPagamento:
                        "manual",

                    origem:
                        "whatsapp",

                    groupId:
                        from,

                    remetente:
                        numeroDoSender(
                            sender
                        )
                }
            );

        const pedidoId =
            pedido.pedidoId;

        await sock.sendMessage(
            from,
            {
                text:
                    mensagemPedidoManual(
                        {
                            pedidoId,
                            numero,
                            quantidadeMB:
                                quantidade
                        }
                    )
            }
        );

        // Não espera aqui.
        // O acompanhamento continua em background
        // até completed ou failed.
        iniciarAcompanhamentoPedido(
            sock,
            {
                pedidoId,
                from,
                numero,
                quantidadeMB:
                    quantidade,
                tipo: "megas",
                origem: "manual"
            }
        );

    } catch (e) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Não foi possível criar o pedido no servidor:\n\n" +
                    e.message
            }
        );
    }

    return true;
}

// ============================================================
// .SALDO
// ============================================================

async function comandoSaldo(
    sock,
    data,
    args
) {

    const from =
        data.from;

    const sender =
        data.sender;

    if (
        !await isAdmin(
            sock,
            from,
            sender
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Sem permissão. Só admin do grupo."
            }
        );

        return true;
    }

    if (
        args.length < 2
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    ".saldo 100 841234567"
            }
        );

        return true;
    }

    const quantidade =
        Number(
            String(args[0])
                .replace(
                    /MT/gi,
                    ""
                )
        );

    const numero =
        String(
            args[1]
        )
            .replace(
                /\D/g,
                ""
            );

    if (
        !Number.isFinite(
            quantidade
        ) ||
        quantidade <= 0
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Saldo inválido."
            }
        );

        return true;
    }

    if (
        !/^8[4-7]\d{7}$/.test(
            numero
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Número inválido."
            }
        );

        return true;
    }

    if (API_ATIVA) {

        try {

            const pedido =
                await criarPedidoServidor(
                    {
                        tipo: "credito",

                        quantidadeMB: 0,

                        quantidadeLabel: "",

                        numero,

                        modoPagamento:
                            "manual",

                        valorMT:
                            quantidade,

                        origem:
                            "whatsapp",

                        groupId:
                            from,

                        remetente:
                            numeroDoSender(
                                sender
                            )
                    }
                );

            await sock.sendMessage(
                from,
                {
                    text:
                        "━━━━━━━━━━━━━━━━━━\n" +
                        "PEDIDO DE SALDO ENVIADO\n" +
                        "━━━━━━━━━━━━━━━━━━\n\n" +
                        `Saldo: ${quantidade}MT\n` +
                        `Número: ${numero}\n` +
                        `Pedido: ${pedido.pedidoId}\n\n` +
                        "Aguardando processamento pelo app.\n\n" +
                        "━━━━━━━━━━━━━━━━━━"
                }
            );

            iniciarAcompanhamentoPedido(
                sock,
                {
                    pedidoId:
                        pedido.pedidoId,

                    from,

                    numero,

                    quantidade,

                    valorMT:
                        quantidade,

                    tipo:
                        "credito",

                    origem:
                        "manual"
                }
            );

        } catch (e) {

            await sock.sendMessage(
                from,
                {
                    text:
                        "Não foi possível criar o pedido no servidor:\n\n" +
                        e.message
                }
            );
        }

        return true;
    }

    const pedido =
        adicionarPedido(
            {
                from,
                sender,
                numero,
                quantidade,
                tipo: "saldo",
                referencia: "MANUAL"
            }
        );

    await sock.sendMessage(
        from,
        {
            text:
                "━━━━━━━━━━━━━━━━━━\n" +
                "PEDIDO SALDO ADICIONADO\n" +
                "━━━━━━━━━━━━━━━━━━\n\n" +
                `Saldo: ${quantidade}MT\n` +
                `Número: ${numero}\n` +
                `ID: ${pedido.id}\n\n` +
                "Adicionado à fila local.\n\n" +
                "━━━━━━━━━━━━━━━━━━"
        }
    );

    return true;
}

// ============================================================
// .PEDIDOS
// ============================================================

async function comandoPedidos(
    sock,
    data
) {

    const from =
        data.from;

    const sender =
        data.sender;

    if (
        !await isAdmin(
            sock,
            from,
            sender
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "Sem permissão. Só admin do grupo."
            }
        );

        return true;
    }

    const fila =
        carregarFila();

    global.filaEnvios =
        fila;

    if (
        fila.length === 0
    ) {

        await sock.sendMessage(
            from,
            {
                text:
                    "PEDIDOS\n\n" +
                    "Não existem pedidos no JSON."
            }
        );

        return true;
    }

    let texto =
        "━━━━━━━━━━━━━━━━━━\n" +
        "PEDIDOS NA FILA\n" +
        "━━━━━━━━━━━━━━━━━━\n\n";

    fila.forEach(
        (pedido, index) => {

            texto +=
                `PEDIDO ${index + 1}\n` +
                `ID: ${pedido.id}\n` +
                `Tipo: ${pedido.tipo}\n` +
                `Número: ${pedido.numero}\n` +
                `Total: ${pedido.quantidade}` +
                (
                    pedido.tipo === "saldo"
                        ? "MT"
                        : "MB"
                ) +
                "\n" +
                `Restante: ${pedido.restante}` +
                (
                    pedido.tipo === "saldo"
                        ? "MT"
                        : "MB"
                ) +
                "\n" +
                `Parte: ${
                    pedido.parteAtual || 0
                }\n` +
                `Status: ${
                    pedido.status
                }\n` +
                `Referência: ${
                    pedido.referencia ||
                    "N/D"
                }\n`;

            if (
                pedido.erro
            ) {

                texto +=
                    `Erro: ${
                        pedido.erro
                    }\n`;
            }

            texto +=
                `Criado: ${
                    new Date(
                        pedido.criado
                    ).toLocaleString(
                        "pt-PT"
                    )
                }\n\n` +
                "--------------------\n\n";
        }
    );

    texto +=
        `TOTAL: ${fila.length}`;

    await sock.sendMessage(
        from,
        {
            text
        }
    );

    return true;
}

// ============================================================
// PROCESSAR NÚMERO PENDENTE
// ============================================================

async function processarNumeroPendente(
    sock,
    data,
    body
) {

    const sender =
        data.sender;

    global.pendentesEnvio =
        global.pendentesEnvio || {};

    const pendente =
        global.pendentesEnvio[
            sender
        ];

    if (!pendente) {
        return false;
    }

    if (
        Date.now() -
        pendente.criado >
        TEMPO_CACHE
    ) {

        delete global.pendentesEnvio[
            sender
        ];

        return false;
    }

    const numero =
        normalizarNumeroMoz(body);

    if (!numero) {
        return false;
    }

    delete global.pendentesEnvio[
        sender
    ];

    if (API_ATIVA) {

        try {

            const pedido =
                await criarPedidoServidor(
                    {
                        tipo:
                            pendente.tipo ===
                            "saldo"
                                ? "credito"
                                : "megas",

                        quantidadeMB:
                            pendente.tipo ===
                            "venda"
                                ? pendente.quantidade
                                : 0,

                        quantidadeLabel:
                            pendente.tipo ===
                            "venda"
                                ? pendente.quantidade +
                                  "MB"
                                : "",

                        numero,

                        modoPagamento:
                            "normal",

                        pagamentoId:
                            pendente.referencia,

                        valorPagamento:
                            Number(
                                pendente.valor ||
                                0
                            ),

                        pagamentoTimestamp:
                            pendente.criado,

                        groupId:
                            data.from,

                        valorMT:
                            pendente.tipo ===
                            "saldo"
                                ? pendente.quantidade
                                : undefined,

                        origem:
                            "comprovativo",

                        remetente:
                            numeroDoSender(
                                sender
                            )
                    }
                );

            await sock.sendMessage(
                data.from,
                {
                    text:
                        mensagemAguardandoPedido(
                            {
                                pedidoId:
                                    pedido.pedidoId,

                                numero,

                                quantidadeMB:
                                    pendente.tipo ===
                                    "venda"
                                        ? pendente.quantidade
                                        : 0,

                                valorPagamento:
                                    pendente.valor,

                                valorMT:
                                    pendente.tipo ===
                                    "saldo"
                                        ? pendente.quantidade
                                        : undefined,

                                pagamentoId:
                                    pendente.referencia,

                                tipo:
                                    pendente.tipo ===
                                    "saldo"
                                        ? "credito"
                                        : "megas"
                            }
                        )
                }
            );

            iniciarAcompanhamentoPedido(
                sock,
                {
                    pedidoId:
                        pedido.pedidoId,

                    from:
                        data.from,

                    numero,

                    quantidadeMB:
                        pendente.tipo ===
                        "venda"
                            ? pendente.quantidade
                            : 0,

                    quantidade:
                        pendente.quantidade,

                    valorMT:
                        pendente.tipo ===
                        "saldo"
                            ? pendente.quantidade
                            : undefined,

                    valorPagamento:
                        pendente.valor,

                    pagamentoId:
                        pendente.referencia,

                    referencia:
                        pendente.referencia,

                    tipo:
                        pendente.tipo ===
                        "saldo"
                            ? "credito"
                            : "megas",

                    origem:
                        "comprovativo"
                }
            );

            return true;

        } catch (e) {

            await sock.sendMessage(
                data.from,
                {
                    text:
                        "Não foi possível criar o pedido no servidor:\n\n" +
                        e.message
                }
            );

            return true;
        }
    }

    const pedido =
        adicionarPedido(
            {
                from:
                    pendente.from,

                sender,

                numero,

                quantidade:
                    pendente.quantidade,

                tipo:
                    pendente.tipo,

                referencia:
                    pendente.referencia
            }
        );

    await sock.sendMessage(
        data.from,
        {
            text:
                "━━━━━━━━━━━━━━━━━━\n" +
                "PEDIDO RECEBIDO\n" +
                "━━━━━━━━━━━━━━━━━━\n\n" +
                `Número: ${numero}\n` +
                `Tipo: ${pendente.tipo}\n` +
                `Quantidade: ${pendente.quantidade}\n` +
                `ID: ${pedido.id}\n\n` +
                "Adicionado à fila.\n\n" +
                "━━━━━━━━━━━━━━━━━━"
        }
    );

    return true;
}

// ============================================================
// CACHE DE PAGAMENTO / PEDIDO
// ============================================================
// VERIFICAR SE É COMPROVATIVO
// ============================================================

function ehComprovativo(body) {

    if (!body) {
        return false;
    }

    return (
        /transferiste.*\d+.*mt/i.test(body) ||
        /montante:\s*\d+.*mt/i.test(body) ||
        /valor:\s*\d+.*mt/i.test(body)
    );
}


// ============================================================
// COMPRA AUTOMÁTICA
// ============================================================

async function processarComprovativo(
    sock,
    data,
    body
) {

    const from =
        data.from;

    const sender =
        data.sender;


    if (!automacaoAtiva(from)) {
        return false;
    }


    if (!ehComprovativo(body)) {
        return false;
    }

    const referencia =
        extrairReferencia(body) ||
        "N/D";


    // --------------------------------------------------------
    // DUPLICADO
    // --------------------------------------------------------

    if (
        referencia !== "N/D" &&
        referenciaUtilizada(
            referencia
        )
    ) {

        await sock.sendMessage(
            from,
            {
                text:
`⚠️ *COMPROVATIVO JÁ UTILIZADO*

📄 Referência:
*${referencia}*

Este pagamento já foi processado anteriormente.`
            }
        );

        return true;
    }


    const valorRecebido =
        extrairValorMT(body);

    const cfgPagamento=carregarGrupoConfig(from);
    const provPagamento=tipoPagamentoComprovativo(body);
    if(cfgPagamento.smsVerificationActive && cfgPagamento.smsProvider!=="all" && provPagamento && provPagamento!==cfgPagamento.smsProvider){
        const nome=provPagamento==="emola"?"E-Mola":"M-Pesa/Vodacom"; const esperado=cfgPagamento.smsProvider==="emola"?"E-Mola":"M-Pesa/Vodacom";
        await sock.sendMessage(from,{text:`⚠️ *PAGAMENTO NÃO VERIFICADO*\n\nO comprovativo recebido é de *${nome}*, mas este grupo está configurado apenas para *${esperado}*.\n\nO pagamento não foi processado automaticamente.`}); return true;
    }


    if (!valorRecebido) {
        return false;
    }

    // --------------------------------------------------------
    // AGRUPAR COMPROVATIVOS PRÓXIMOS
    // --------------------------------------------------------
    // Se dois comprovativos forem enviados em sequência pelo mesmo
    // remetente, os valores podem formar um único pacote.
    // Ex.: 79MT + 101MT = 180MT.
    // Os comprovativos continuam individualmente protegidos por referência.

    global.comprovantesAgrupados =
        global.comprovantesAgrupados || {};

    const chaveAgrupamento =
        `${from}:${sender}`;

    const agoraAgrupamento = Date.now();
    const anterior =
        global.comprovantesAgrupados[chaveAgrupamento];

    if (
        anterior &&
        agoraAgrupamento - Number(anterior.criado || 0) > TEMPO_CACHE
    ) {
        delete global.comprovantesAgrupados[chaveAgrupamento];
    }

    const atualAgrupado =
        global.comprovantesAgrupados[chaveAgrupamento];

    const itensPagamento = [
        ...(Array.isArray(atualAgrupado?.itens) ? atualAgrupado.itens : []),
        { referencia, valor: valorRecebido }
    ];

    const valorTotal = itensPagamento.reduce(
        (total, item) => total + Number(item.valor || 0),
        0
    );

    const referenciasPagamento = itensPagamento
        .map(item => item.referencia)
        .filter(ref => ref && ref !== "N/D");

    // Mantém o cache original para compatibilidade com o restante do sistema.
    salvarComprovanteCache(
        from,
        {
            referencia,
            valor: valorRecebido,
            sender,
            data:
                new Date()
                    .toLocaleDateString(
                        "pt-PT"
                    ),
            hora:
                new Date()
                    .toLocaleTimeString(
                        "pt-PT"
                    )
        }
    );

    // --------------------------------------------------------
    // PROCURAR PACOTE
    // --------------------------------------------------------

    const tabela =
        carregarPacotes();

    // Primeiro tenta o valor deste comprovativo sozinho.
    // Se não existir, tenta a soma dos comprovativos agrupados.
    let valor = valorRecebido;
    let registro = tabela[from]?.[valorRecebido];
    if (registro?.excluido === true) registro = null;

    if (!registro && itensPagamento.length > 1) {
        registro = tabela[from]?.[valorTotal];
            if (registro?.excluido === true) registro = null;

        if (registro) {
            valor = valorTotal;
        }
    }

    // Ainda não existe pacote para este valor. Guardamos o pagamento
    // para que o próximo comprovativo possa completar a soma.
    if (!registro) {
        global.comprovantesAgrupados[chaveAgrupamento] = {
            itens: itensPagamento,
            criado: agoraAgrupamento
        };

        if (itensPagamento.length > 1) {
            await sock.sendMessage(from, {
                text:
`💰 *PAGAMENTOS RECEBIDOS*

━━━━━━━━━━━━━━━━━━
💵 Valores: *${itensPagamento.map(i => `${i.valor}MT`).join(" + ")}*
💰 Total: *${valorTotal}MT*
━━━━━━━━━━━━━━━━━━

⚠️ Nenhum pacote está cadastrado para o total de *${valorTotal}MT*.

Use:
*.addpacote ${valorTotal}MT 400MB*`
            });
        } else {
            await sock.sendMessage(from, {
                text:
`💰 *PAGAMENTO RECEBIDO*

━━━━━━━━━━━━━━━━━━
💵 Valor: *${valorRecebido}MT*
📄 Referência: *${referencia}*
━━━━━━━━━━━━━━━━━━

⏳ Pagamento guardado. Se houver outro comprovativo enviado em seguida, os valores serão somados automaticamente.`
            });
        }

        return true;
    }

    // Pacote encontrado: os comprovativos usados nesta soma passam a ser
    // considerados juntos e o cache de agrupamento é limpo.
    delete global.comprovantesAgrupados[chaveAgrupamento];


    const pacote =
        normalizarPacote(
            registro
        );


    if (!pacote) {
        return false;
    }


    // --------------------------------------------------------
    // REGISTRAR REFERÊNCIA
    // --------------------------------------------------------

    for (const refPagamento of referenciasPagamento) {
        registrarReferencia(refPagamento);
    }


    // --------------------------------------------------------
    // VENDA DE MB
    // --------------------------------------------------------

    if (
        pacote.tipo === "venda"
    ) {

        const quantidade =
            converterParaMB(
                pacote.pacote
            );


        if (
            !Number.isFinite(
                quantidade
            ) ||
            quantidade <= 0
        ) {
            return false;
        }


        const numerosEncontrados = extrairNumeros(body);

        // Regra para dois números:
        // - Até 10240MB: usa apenas o último número informado.
        // - Acima de 10240MB: divide em partes de no máximo 10240MB,
        //   usando os dois últimos números quando existirem.
        const numerosDestino =
            quantidade > LIMITE_MB && numerosEncontrados.length >= 2
                ? numerosEncontrados.slice(-2)
                : (numerosEncontrados.length
                    ? [numerosEncontrados[numerosEncontrados.length - 1]]
                    : []);

        if (numerosDestino.length) {

            try {

                const partes = [];
                let restante = quantidade;

                while (restante > 0) {
                    partes.push(Math.min(restante, LIMITE_MB));
                    restante -= partes[partes.length - 1];
                }

                const pedidosCriados = [];

                for (let i = 0; i < partes.length; i++) {

                    // Se houver só dois números e mais de duas partes,
                    // o último número recebe todas as partes restantes.
                    const numero =
                        numerosDestino[Math.min(i, numerosDestino.length - 1)];

                    const pedido = await criarPedidoServidor({
                        tipo: "megas",
                        quantidadeMB: partes[i],
                        quantidadeLabel: `${partes[i]}MB`,
                        numero,
                        modoPagamento: "normal",
                        // Cada parte precisa de um ID único no servidor,
                        // mas a referência original continua registrada localmente
                        // para impedir reutilização do mesmo comprovativo.
                        pagamentoId: partes.length > 1
                            ? `${referencia}-P${i + 1}`
                            : referencia,
                        valorPagamento: valor,
                        pagamentoTimestamp: Date.now(),
                        origem: "comprovativo",
                        groupId: from,
                        remetente: numeroDoSender(sender)
                    });

                    pedidosCriados.push({ pedido, numero, quantidade: partes[i] });
                }

                const linhasDestinos = pedidosCriados.map((item, i) =>
                    `📱 *${i + 1}º número:* ${item.numero} — *${item.quantidade}MB*`
                );

                await sock.sendMessage(
                    from,
                    {
                        text: [
                            "💳 *PAGAMENTO RECEBIDO*",
                            "",
                            `💵 *Valor:* ${valor}MT`,
                            `📦 *Pacote:* ${pacote.pacote}`,
                            ...linhasDestinos,
                            `📄 *Ref:* ${referencia}`,
                            "",
                            "⏳ _O LACOSTE AUTO está processando a transferência._",
                            "",
                            "_O pedido será concluído após o app confirmar o envio dos MB._"
                        ].join("\n")
                    }
                );

                for (const item of pedidosCriados) {
                    iniciarAcompanhamentoPedido(sock, {
                        pedidoId: item.pedido.pedidoId,
                        from,
                        numero: item.numero,
                        quantidadeMB: item.quantidade,
                        quantidadeLabel: `${item.quantidade}MB`,
                        valorPagamento: valor,
                        pagamentoId: referencia,
                        referencia,
                        tipo: "megas",
                        origem: "comprovativo"
                    });
                }

                return true;

            } catch (e) {

                await sock.sendMessage(
                    from,
                    {
                        text:
`⚠️ *PAGAMENTO IDENTIFICADO*

O pagamento de *${valor}MT* foi reconhecido, mas não foi possível criar o pedido.

Motivo:
${e.message}`
                    }
                );

                return true;
            }
        }

        // ----------------------------------------------------
        // SEM NÚMERO
        // ----------------------------------------------------

        global.pendentesEnvio[
            sender
        ] = {

            from,

            sender,

            quantidade,

            tipo: "venda",

            referencia,

            valor,

            criado:
                Date.now()
        };


        await sock.sendMessage(
            from,
            {
                text:
`💳 *PAGAMENTO RECEBIDO*

━━━━━━━━━━━━━━━━━━
💵 Valor: *${valor}MT*
📦 Pacote: *${pacote.pacote}*
📄 Ref: *${referencia}*
━━━━━━━━━━━━━━━━━━

📱 Não consegui identificar o número.

Envie agora o número que vai receber os MB.

Exemplo:
*841234567*`
            }
        );


        return true;
    }


    // --------------------------------------------------------
    // SALDO
    // --------------------------------------------------------

    const saldo =
        Number(
            pacote.pacote
        );


    if (
        !Number.isFinite(saldo) ||
        saldo <= 0
    ) {
        return false;
    }


    const numero =
        extrairNumero(body);


    if (numero) {

        try {

            const pedido =
                await criarPedidoServidor({

                    tipo: "credito",

                    quantidadeMB: 0,

                    quantidadeLabel: "",

                    numero,

                    modoPagamento:
                        "normal",

                    pagamentoId:
                        referencia,

                    valorPagamento:
                        valor,

                    pagamentoTimestamp:
                        Date.now(),

                    valorMT:
                        saldo,

                    origem:
                        "comprovativo",

                    groupId:
                        from,

                    remetente:
                        numeroDoSender(
                            sender
                        )
                });


            await sock.sendMessage(
                from,
                {
                    text:
`💰 *PAGAMENTO CONFIRMADO*

━━━━━━━━━━━━━━━━━━
💵 Pagamento: *${valor}MT*
💰 Saldo: *${saldo}MT*
📱 Número: *${numero}*
📄 Ref: *${referencia}*
🆔 Pedido: *${pedido.pedidoId}*
━━━━━━━━━━━━━━━━━━

⏳ *Aguardando validação do SMS pelo app.*

O pedido será concluído somente após a confirmação do aplicativo.`
                }
            );

            // Acompanha até completed/failed
            iniciarAcompanhamentoPedido(
                sock,
                {
                    pedidoId:
                        pedido.pedidoId,

                    from,

                    numero,

                    quantidade:
                        saldo,

                    valorMT:
                        saldo,

                    valorPagamento:
                        valor,

                    pagamentoId:
                        referencia,

                    referencia,

                    tipo: "credito",

                    origem:
                        "comprovativo"
                }
            );

            return true;

        } catch (e) {

            await sock.sendMessage(
                from,
                {
                    text:
`⚠️ *PAGAMENTO IDENTIFICADO*

O pagamento foi reconhecido, mas o pedido não pôde ser criado.

Motivo:
${e.message}`
                }
            );

            return true;
        }
    }


    global.pendentesEnvio[
        sender
    ] = {

        from,

        sender,

        quantidade:
            saldo,

        tipo: "saldo",

        referencia,

        valor,

        criado:
            Date.now()
    };


    await sock.sendMessage(
        from,
        {
            text:
`💰 *PAGAMENTO CONFIRMADO*

━━━━━━━━━━━━━━━━━━
💵 Valor: *${valor}MT*
💰 Saldo: *${saldo}MT*
📄 Ref: *${referencia}*
━━━━━━━━━━━━━━━━━━

📱 Não consegui identificar o número.

Envie agora o número que vai receber o saldo.

Exemplo:
*841234567*`
        }
    );


    return true;
}

async function comandoFila(sock,data){const from=data.from;if(!await isAdmin(sock,from,data.sender)){await sock.sendMessage(from,{text:"⛔ Apenas administradores podem consultar a fila."});return true;}try{const r=await listarFilaServidor(from);const ps=r.pedidos||[];if(!ps.length){await sock.sendMessage(from,{text:"📋 *FILA DE PEDIDOS*\n\n✅ Não existem pedidos pendentes neste grupo."});return true;}let t="📋 *FILA DE PEDIDOS*\n\n";ps.forEach((p,i)=>{t+=`${i+1}️⃣ *Pedido*\n📱 ${p.numero}\n📊 ${p.quantidadeMB}MB\n🆔 ${p.pedidoId}\n📌 ${p.status}\n\n`;});t+="🛑 Para cancelar: *.cancelar 1* ou *.cancelar PED-ID*";await sock.sendMessage(from,{text:t});return true;}catch(e){await sock.sendMessage(from,{text:"❌ Não foi possível consultar a fila.\n📝 Motivo: "+e.message});return true;}}
async function comandoCancelar(sock,data,args){const from=data.from;if(!await isAdmin(sock,from,data.sender)){await sock.sendMessage(from,{text:"⛔ Apenas administradores podem cancelar pedidos."});return true;}let alvo=String(args[0]||"");if(!alvo){await sock.sendMessage(from,{text:"Use: *.cancelar 1* ou *.cancelar PED-ID*"});return true;}try{if(/^\d+$/.test(alvo)){const r=await listarFilaServidor(from);const p=(r.pedidos||[])[Number(alvo)-1];if(!p)throw new Error("Número de pedido não encontrado na fila.");alvo=p.pedidoId;}const r=await cancelarPedidoServidor(alvo,from);await sock.sendMessage(from,{text:r.cancelados?`🛑 *PEDIDO CANCELADO*\n\n🆔 ${alvo}\n\nAs partes que ainda não começaram não serão enviadas.`:`⚠️ ${r.message||"Não havia partes pendentes para cancelar."}`});return true;}catch(e){await sock.sendMessage(from,{text:"❌ Não foi possível cancelar.\n📝 Motivo: "+e.message});return true;}}
async function comandoMenuAuto(sock,data){
    await sock.sendMessage(data.from,{text:`🤖 *LACOSTE AUTO — MENU*

📤 *.enviar quantidade número*
💰 *.saldo valor número*
📋 *.fila*
🛑 *.cancelar 1*
⚙️ *.automacao on ANDROID_ID*
⚙️ *.automacao off*
🔎 *.automacao status*
📦 *.addpacote 100MT 400MB*
📦 *.pacotes*
⚙️ *.config sim1* / *.config sim2*
🔐 *.config sms voda* / *.config sms emola* / *.config sms todos* / *.config sms off*
💵 *.addsaldo 100MT 100*
📲 *.qr texto*
🏆 *.ranking*

*GESTÃO DO LACOSTE*
📋 *.licencas*
📱 *.dispositivos*
🔗 *.associar ANDROID_ID*
❌ *.desassociar*
📡 *.statusdispositivo*
🔗 *.gruposdispositivo*
✅ *.aprovar ID 30*
🛑 *.rejeitar ID motivo*

_Use os comandos de gestão apenas como gestor Lacoste._`});
    return true;
}

// ============================================================
// ASSISTENTE IA LOCAL
// ============================================================

function carregarAssistenteIA() {
    return lerJSON(`${DATA}/assistente_ia.json`, {});
}

function assistenteIAAtivo(grupo) {
    const cfg = carregarAssistenteIA();
    return cfg?.[grupo]?.ativo === true;
}

function normalizarTextoIA(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9@+?\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function processarAssistenteIA(sock, data, texto) {
    const from = data?.from;
    if (!from || !assistenteIAAtivo(from) || !texto) return false;

    const t = normalizarTextoIA(texto);
    if (!t || t.startsWith(".")) return false;

    const enviar = async (text) => {
        await sock.sendMessage(from, { text });
        return true;
    };

    if (/^(quero|preciso|manda|quero comprar|comprar|compra).*(mb|mega|megas|gb|internet)/.test(t) ||
        /^(mb|mega|megas)\s*(quero|preciso|manda)/.test(t)) {
        return enviar(
            "LACOSTE AUTO\n\n" +
            "Para comprar MB, faça o pagamento para uma das contas cadastradas e envie o comprovativo aqui.\n\n" +
            "Se o comprovativo tiver o número de destino, o envio pode ser iniciado automaticamente. Se não tiver, mande o número depois."
        );
    }

    if (/^(stock|estoque|precos|precos mb|tens mb|tem mb|tem megas|quais mb)/.test(t)) {
        const tabela = carregarPacotes();
        const grupo = tabela[from] || {};
        const entradas = Object.entries(grupo);
        if (!entradas.length) {
            return enviar("LACOSTE AUTO\n\nNeste momento não há pacotes de MB/GB cadastrados neste grupo.");
        }
        const linhas = entradas.map(([valor, reg]) => {
            if (reg?.excluido === true) return null;
            const p = normalizarPacote(reg);
            return p ? `• ${valor}MT → ${p.pacote}` : null;
        }).filter(Boolean);
        return enviar("LACOSTE AUTO — STOCK\n\n" + linhas.join("\n"));
    }

    if (/^(saldo|saldo on|saldo off|saldo\?)$/.test(t)) {
        const tabela = carregarPacotes();
        const grupo = tabela[from] || {};
        const linhas = Object.entries(grupo).map(([valor, reg]) => {
            const p = normalizarPacote(reg);
            return p?.tipo === "saldo" ? `• ${valor}MT → saldo ${p.pacote}MT` : null;
        }).filter(Boolean);
        return enviar(linhas.length
            ? "LACOSTE AUTO — SALDO DISPONÍVEL\n\n" + linhas.join("\n")
            : "LACOSTE AUTO\n\nNão há saldo cadastrado para venda neste grupo.");
    }

    if (/^(adm|admin|administrador|sou adm|sou admin)\s*(on|status|\?)?$/.test(t)) {
        let admin = false;
        try { admin = await isAdmin(sock, from, data.sender); } catch {}
        return enviar(admin
            ? "LACOSTE AUTO\n\nSim. A tua conta está como administrador deste grupo."
            : "LACOSTE AUTO\n\nA tua conta não está como administrador deste grupo.");
    }

    if (/^(automacao|automacao on|auto|auto on)\s*(status|on|off|\?)?$/.test(t)) {
        const c = automacaoConfig(from);
        return enviar(`LACOSTE AUTO\n\nAutomação: ${c.ativa ? "ON" : "OFF"}`);
    }

    if (/^(pagamento|como pagar|onde pagar|conta|contas|comprovativo|comprovante)$/.test(t)) {
        return enviar("LACOSTE AUTO\n\nPara comprar MB ou saldo, faça o pagamento numa conta cadastrada no grupo e envie o comprovativo. O sistema verifica o pagamento e pode criar o pedido automaticamente.");
    }

    return false;
}

// ============================================================
// PROCESSADOR PRINCIPAL
// ============================================================

async function processar(sock, data, body) {

    global.sockVendas = sock;

    if (!body) {
        return false;
    }

    const texto =
        String(body).trim();

    if (!texto) {
        return false;
    }


    const partes =
        texto.split(/\s+/);

    const comando =
        partes[0]
            .replace(/^\./, "")
            .toLowerCase();

    const args =
        partes.slice(1);


    // ========================================================
    // ID DO GRUPO
    // ========================================================

    if (
        comando === "idgrupo" ||
        comando === "grupo"
    ) {

        if (
            typeof comandoIdGrupo ===
            "function"
        ) {
            return comandoIdGrupo(
                sock,
                data
            );
        }

        return false;
    }


    if (comando === "fila") return comandoFila(sock,data);
    if (comando === "cancelar") return comandoCancelar(sock,data,args);
    if (comando === "menuauto") return comandoMenuAuto(sock,data);
    if (comando === "config") return comandoConfig(sock,data,args);
    if (comando === "carteira") return comandoCarteira(sock,data);
    if (comando === "depositar") return comandoAlterarCarteira(sock,data,args,"deposito");
    if (comando === "retirar") return comandoAlterarCarteira(sock,data,args,"retirada");
    if (comando === "pacotes") return comandoPacotes(sock,data);
    if (comando === "addeliminar") return comandoEliminarPacote(sock,data,args,false);
    if (comando === "addrestaurar") return comandoEliminarPacote(sock,data,args,true);
    // ========================================================
    // AUTOMAÇÃO
    // ========================================================

    if (
        comando === "automacao"
    ) {

        return comandoAutomacao(
            sock,
            data,
            args
        );
    }


    // ========================================================
    // PACOTES
    // ========================================================

    if (
        comando === "addpacote"
    ) {

        return comandoAddPacote(
            sock,
            data,
            args
        );
    }


    // ========================================================
    // SALDO
    // ========================================================

    if (
        comando === "addsaldo"
    ) {

        return comandoAddSaldo(
            sock,
            data,
            args
        );
    }


    // ========================================================
    // ENVIAR
    // ========================================================

    if (
        comando === "enviar"
    ) {

        return comandoEnviar(
            sock,
            data,
            args
        );
    }


    // ========================================================
    // SALDO MANUAL
    // ========================================================

    if (
        comando === "saldo"
    ) {

        return comandoSaldo(
            sock,
            data,
            args
        );
    }


    // ========================================================
    // PEDIDOS
    // ========================================================

    if (
        comando === "pedidos"
    ) {

        return comandoPedidos(
            sock,
            data
        );
    }


    // ========================================================
    // DONOS
    // ========================================================

    // ========================================================
    // MENSAGEM NORMAL
    // ========================================================

    if (
        !texto.startsWith(".")
    ) {

        const pendente =
            await processarNumeroPendente(
                sock,
                data,
                texto
            );

        if (pendente) {
            return true;
        }
    }


    // ========================================================
    // COMPROVATIVO
    // ========================================================

    if (
        !texto.startsWith(".")
    ) {

        const comprovativo =
            await processarComprovativo(
                sock,
                data,
                texto
            );

        if (comprovativo) {
            return true;
        }
    }


    return false;
}


// ============================================================
// INICIALIZAR FILA
// ============================================================

function inicializar() {

    const fila =
        carregarFila();

    let alterou = false;


    for (
        const pedido of fila
    ) {

        if (
            pedido.status ===
            "processando"
        ) {

            pedido.status =
                "aguardando";

            alterou = true;
        }
    }


    if (alterou) {

        salvarFila(
            fila
        );
    }


    global.filaEnvios =
        fila;


    console.log(
        "================================="
    );

    console.log(
        "SISTEMA DE VENDAS INICIADO"
    );

    console.log(
        "Pedidos locais:",
        fila.length
    );

    console.log(
        "API:",
        API_ATIVA
            ? "ATIVA"
            : "DESATIVADA"
    );

    console.log(
    "================================="
);

/*
 * Quando a API está ativa,
 * os pedidos novos são enviados
 * diretamente para o LACOSTE AUTO.
 *
 * A fila JSON antiga não deve ser
 * executada automaticamente para
 * evitar pedidos duplicados.
 */

if (
    fila.length > 0 &&
    !API_ATIVA
) {
    iniciarFila();
}
else if (
    fila.length > 0 &&
    API_ATIVA
) {
    console.log("API LACOSTE AUTO ativa.");
    console.log("Fila local antiga não será executada automaticamente.");
}
}

// ============================================================
// EXPORTS - SÓ 1 VEZ
// ============================================================

module.exports = {

    // PRINCIPAL
    processar,
    processarAssistenteIA,
    assistenteIAAtivo,
    automacaoAtiva,
    inicializar, // <- precisa disso

    // COMANDOS
    comandoEnviar,
    comandoSaldo,
    comandoPedidos,
    comandoAddPacote,
    comandoAddSaldo,
    comandoAutomacao,
    comandoFila,
    comandoCancelar,
    comandoMenuAuto,
    comandoConfig,
    carregarGrupoConfig,
    comandoCarteira,
    comandoAlterarCarteira,
    comandoPacotes,
    comandoEliminarPacote,

    // PERMISSÕES
    isAdmin,

    // FILA
    adicionarPedido,
    iniciarFila,
    carregarFila,
    salvarFila,

    // COMPROVATIVOS
    processarComprovativo,
    processarNumeroPendente,
    salvarComprovanteCache,
    pegarComprovanteCache,

    // PACOTES
    carregarPacotes,
    salvarPacotes,

    // API
    criarPedidoServidor,
    associarDispositivoGrupo,
    statusDispositivoGrupo,
    removerDispositivoGrupo,
    listarDispositivosGestao,
    listarLicencasGestao,
    aprovarLicencaGestao,
    rejeitarLicencaGestao,
    listarGruposDispositivosGestao
};