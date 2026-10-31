// groupEvents.js - versão robusta Lacoste V7
const fs = require('fs');

const pathConcorrentes = './config/concorrentes.json';
const pathAnticoncorrencia = './config/anticoncorrencia.json';
const pathBemvindo = './config/bemvindo.json';
const pathPersonalizar = './config/personalizar.json';

function readJSON(path, fallback = {}) {
  try {
    if (!fs.existsSync(path)) return fallback;
    const raw = fs.readFileSync(path, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error(`[GROUP] JSON inválido ${path}:`, e.message);
    return fallback;
  }
}

function getParticipantId(participant) {
  if (typeof participant === 'string') return participant;
  return participant?.id || participant?.jid || participant?.phoneNumber || participant?.lid || null;
}

function getNumberLabel(id) {
  return String(id || '').split('@')[0] || 'membro';
}

async function handleWelcome(sock, groupId, participantId, customMessage) {
  try {
    if (!participantId || participantId === sock.user?.id) return;

    // Boas-vindas com foto de perfil, mas com proteção total: se a foto falhar,
    // o bot envia a mensagem em texto e o erro nunca interrompe o evento.
    let mensagem = customMessage ||
      '👋 Seja bem-vindo(a) ao grupo, @user!\n\nEsperamos que aproveite 🚀';

    mensagem = String(mensagem).replace(/@user/gi, `@${getNumberLabel(participantId)}`);

    let fotoEnviada = false;
    try {
      if (typeof sock.profilePictureUrl === 'function') {
        // Tenta LID, JID e outros identificadores conhecidos. Em algumas
        // versões do WhatsApp a foto não responde ao primeiro formato.
        const candidatos = [
          participantId,
          participantId?.lid,
          participantId?.id,
          participantId?.jid,
          participantId?.phoneNumber
        ].filter(Boolean).map(String);

        for (const alvo of [...new Set(candidatos)]) {
          try {
            const fotoUrl = await sock.profilePictureUrl(alvo, 'image').catch(() => null);
            if (!fotoUrl) continue;
            await sock.sendMessage(groupId, {
              image: { url: fotoUrl },
              caption: mensagem,
              mentions: [participantId]
            });
            fotoEnviada = true;
            break;
          } catch (tentativaErro) {
            console.warn(`⚠️ Tentativa de foto falhou para ${alvo}:`, tentativaErro?.message || tentativaErro);
          }
        }
      }
    } catch (fotoError) {
      console.error(`⚠️ Foto de boas-vindas indisponível para ${participantId}:`, fotoError?.message || fotoError);
    }

    // Se não houver foto, continua normalmente com texto.
    if (!fotoEnviada) {
      await sock.sendMessage(groupId, {
        text: mensagem,
        mentions: [participantId]
      });
    }

    console.log(`🎉 Boas-vindas enviadas para @${getNumberLabel(participantId)}${fotoEnviada ? ' com foto' : ' sem foto'}`);
  } catch (e) {
    // Falha de boas-vindas nunca pode derrubar/reiniciar o bot.
    console.error(`❌ Falha nas boas-vindas (${groupId} / ${participantId}):`, e?.stack || e?.message || e);
  }
}

async function handleGroupEvents(sock, update) {
  if (!update?.participants || !update?.action || !update?.id) return;

  const action = String(update.action);
  const participants = Array.isArray(update.participants) ? update.participants : [];
  const groupId = update.id;

  try {
    console.log('--------------------------------------------------');
    console.log(`📌 Evento de participante: ${action.toUpperCase()}`);
    console.log(`📂 Grupo ID: ${groupId}`);
    if (update.author) console.log(`✍️ Autor da ação: ${update.author}`);
    console.log('--------------------------------------------------');

    const anticoncorrenciaData = readJSON(pathAnticoncorrencia);
    const bemvindoData = readJSON(pathBemvindo);
    const concorrentes = readJSON(pathConcorrentes);
    const mensagensPersonalizadas = readJSON(pathPersonalizar);

    const anticoncorrenciaStatus = anticoncorrenciaData[groupId] === 'on';
    const bemvindoStatus = bemvindoData[groupId] === 'on';

    for (const participant of participants) {
      try {
        const id = getParticipantId(participant);
        if (!id) {
          console.warn('[GROUP] Participante sem ID, ignorado.');
          continue;
        }

        const isBot =
          id === sock.user?.id ||
          id === sock.user?.lid ||
          String(id).split('@')[0] === String(sock.user?.id || '').split('@')[0];

        console.log(`➤ PARTICIPANTE ${action === 'add' ? 'ADICIONADO' : 'REMOVIDO'}: ${id}`);
        console.log(`   É o BOT?: ${isBot ? 'SIM' : 'NÃO'}`);

        if (action === 'add' && anticoncorrenciaStatus && concorrentes[id]) {
          const numero = getNumberLabel(id);
          try {
            await sock.sendMessage(groupId, {
              text:
                `🚫 Concorrente detectado 🚫\n\n` +
                `O número @${numero} está na nossa lista de concorrentes e será removido.`,
              mentions: [id]
            });
          } catch (e) {
            console.error('[GROUP] Erro ao avisar concorrente:', e.message);
          }

          try {
            await sock.groupParticipantsUpdate(groupId, [id], 'remove');
          } catch (e) {
            console.error('❌ Erro ao remover concorrente:', e.message);
          }
          continue;
        }

        if (action === 'add' && bemvindoStatus && !isBot) {
          await handleWelcome(sock, groupId, id, mensagensPersonalizadas[groupId]);
        }
      } catch (e) {
        // Um participante problemático nunca interrompe os outros.
        console.error('[GROUP] Erro isolado no participante:', e?.stack || e?.message || e);
      }
    }

    // Apenas informação; não faz operações pesadas quando o bot entra.
    if (action === 'add' && participants.some(p => getParticipantId(p) === sock.user?.id)) {
      try {
        const metadata = await sock.groupMetadata(groupId);
        console.log('🤖 FUI ADICIONADO A UM GRUPO!');
        console.log(`   Nome: ${metadata?.subject || '—'}`);
        console.log(`   ID: ${metadata?.id || groupId}`);
        console.log(`   Total de participantes: ${metadata?.participants?.length || 0}`);
      } catch (e) {
        console.error('[GROUP] Não foi possível ler metadata após entrada:', e.message);
      }
    }
  } catch (error) {
    // Segurança final: evento de grupo jamais propaga erro para o processo.
    console.error('❌ Erro geral no evento de grupo:', error?.stack || error?.message || error);
  }
}

module.exports = { handleGroupEvents };
