const db = require('../database/manager');
const config = require('../../config');

module.exports = {
  /**
   * Crea una votación oficial de evento
   * Sintaxis: #votacion Título de la reunión | Opción 1 | Opción 2 | Opción 3
   */
  async handleCreatePoll(sock, jid, text, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos del clan.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores o líderes pueden iniciar una votación de evento.' });

    const rawInput = text.replace(new RegExp(`^${config.prefix}(votacion|poll|encuesta|voto)`, 'i'), '').trim();

    if (!rawInput) {
      return sock.sendMessage(jid, {
        text: `⚠️ *Uso correcto:* ${config.prefix}votacion <Título del evento> | <Opción 1> | <Opción 2> ...\n\n` +
              `*Ejemplo:* ${config.prefix}votacion ¿Quiénes van a la convivencia del Sábado? | Yo voy 🙋‍♂️ | No puedo 🙅‍♂️ | Llego tarde ⏰`
      });
    }

    const parts = rawInput.split('|').map(p => p.trim()).filter(Boolean);
    const title = parts[0];

    let options = parts.slice(1);
    if (options.length === 0) {
      options = ['Yo voy 🙋‍♂️', 'No puedo 🙅‍♂️', 'En duda / Tal vez 🤔'];
    }

    if (options.length < 2) {
      return sock.sendMessage(jid, { text: '⚠️ Una votación debe tener al menos 2 opciones de respuesta.' });
    }

    // 1. Enviar encuesta nativa de WhatsApp
    let pollMessage = null;
    try {
      pollMessage = await sock.sendMessage(jid, {
        poll: {
          name: `📊 VOTACIÓN DE CLAN: ${title}`,
          values: options,
          selectableCount: 1
        }
      });
    } catch (e) {}

    const pollId = pollMessage?.key?.id || `VOT-${Date.now()}`;
    db.createPoll(jid, pollId, title, options, pollMessage?.message);

    // 2. Enviar tarjeta informativa de la votación
    let cardText = `📢 *¡NUEVA VOTACIÓN OFICIAL DE CLAN!* 📢\n\n` +
                   `📌 *Evento:* ${title}\n\n`;

    options.forEach((opt, idx) => {
      cardText += `🔹 *${idx + 1}. ${opt}*\n`;
    });

    cardText += `\n-----------------------------------\n` +
                `💡 *Toca tu opción directamente en la encuesta de arriba para votar.*\n\n` +
                `📊 _Usa *${config.prefix}resultados* para ver los votantes y los pendientes._`;

    await sock.sendMessage(jid, { text: cardText });
  },

  /**
   * Muestra los resultados detallados de la votación actual y la lista de inactivos/pendientes por votar
   */
  async handlePollResults(sock, jid, isGroup, groupMetadata) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const poll = db.getActivePoll(jid);
    if (!poll) {
      return sock.sendMessage(jid, { text: `ℹ️ No hay ninguna votación activa en ningún grupo en este momento. Usa *${config.prefix}votacion* para crear una.` });
    }

    const pollGroupId = poll.sourceGroupId || jid;
    let participants = groupMetadata.participants;

    if (pollGroupId !== jid) {
      try {
        const sourceMeta = await sock.groupMetadata(pollGroupId);
        if (sourceMeta && sourceMeta.participants) {
          participants = sourceMeta.participants;
        }
      } catch (e) {}
    }

    const cleanNum = (id) => (id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    const botNum = cleanNum(sock.user?.id || '');

    // Miembros reales del clan utilizando los JIDs originales de WhatsApp para que las menciones muestren el apodo
    const memberMap = new Map();
    participants.forEach(p => {
      const num = cleanNum(p.id);
      if (num && num !== botNum && !memberMap.has(num)) {
        memberMap.set(num, p.id);
      }
    });

    // Cargar votos de la encuesta nativa (vía Baileys)
    const votesSummary = poll.options.map(opt => ({ name: opt, voters: [] }));
    const votedNumsSet = new Set();

    if (poll.votesSummary) {
      poll.votesSummary.forEach((vOpt, idx) => {
        if (votesSummary[idx] && vOpt.voters) {
          vOpt.voters.forEach(vJid => {
            const num = cleanNum(vJid);
            if (num && !votedNumsSet.has(num)) {
              votedNumsSet.add(num);
              const origJid = memberMap.get(num) || `${num}@s.whatsapp.net`;
              votesSummary[idx].voters.push(origJid);
            }
          });
        }
      });
    }

    // Calcular pendientes
    const pendingJids = [];
    memberMap.forEach((origJid, num) => {
      if (!votedNumsSet.has(num)) {
        pendingJids.push(origJid);
      }
    });

    let totalVotos = votedNumsSet.size;
    let totalMembers = memberMap.size;

    let text = `📊 *RESULTADOS DE LA VOTACIÓN OFICIAL* 📊\n\n` +
               `📌 *Evento:* ${poll.title}\n` +
               `👥 *Total de votos recibidos:* ${totalVotos}/${totalMembers}\n\n`;

    const mentions = [];

    // Desglosar votos por cada opción
    votesSummary.forEach((vOpt, idx) => {
      text += `🔹 *${idx + 1}. ${vOpt.name}* (${vOpt.voters.length} votos):\n`;

      if (vOpt.voters.length === 0) {
        text += `   _Ningún voto aún_\n\n`;
      } else {
        vOpt.voters.forEach(vJid => {
          const num = cleanNum(vJid);
          text += `   • @${num}\n`;
          mentions.push(vJid);
        });
        text += `\n`;
      }
    });

    text += `-----------------------------------\n` +
            `👻 *PENDIENTES POR VOTAR (${pendingJids.length} sin responder):*\n`;

    if (pendingJids.length === 0) {
      text += `🎉 ¡Increíble! El 100% de los integrantes del clan ya votó.`;
    } else {
      pendingJids.forEach((pJid, idx) => {
        const num = cleanNum(pJid);
        text += `${idx + 1}. @${num}\n`;
        mentions.push(pJid);
      });
    }

    await sock.sendMessage(jid, { text, mentions });
  },

  /**
   * Cierra la votación activa
   */
  async handleClosePoll(sock, jid, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden cerrar una votación.' });

    const closed = db.closePoll(jid);
    if (!closed) {
      return sock.sendMessage(jid, { text: '⚠️ No había ninguna votación activa para cerrar.' });
    }

    await sock.sendMessage(jid, {
      text: `✅ *¡Votación cerrada con éxito!* Ya no se aceptarán más respuestas para el evento: *${closed.title}*`
    });
  },

};
