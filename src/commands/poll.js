const db = require('../database/manager');
const config = require('../../config');

module.exports = {
  /**
   * Crea una encuesta nativa de WhatsApp o con opciones personalizadas
   * Sintaxis: #votacion Título de la reunión | Opción 1 | Opción 2 | Opción 3
   */
  async handleCreatePoll(sock, jid, text, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos del clan.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores o líderes pueden iniciar una votación de evento.' });

    // Quitar el prefijo y el nombre del comando (#votacion, #poll, #encuesta)
    const rawInput = text.replace(new RegExp(`^${config.prefix}(votacion|poll|encuesta|voto)`, 'i'), '').trim();

    if (!rawInput) {
      return sock.sendMessage(jid, {
        text: `⚠️ *Uso correcto:* ${config.prefix}votacion <Título del evento> | <Opción 1> | <Opción 2> ...\n\n` +
              `*Ejemplo:* ${config.prefix}votacion ¿Quiénes van a la convivencia del Sábado? | Yo voy 🙋‍♂️ | No puedo 🙅‍♂️ | Llego tarde ⏰`
      });
    }

    // Separar título y opciones por la tubería "|"
    const parts = rawInput.split('|').map(p => p.trim()).filter(Boolean);
    const title = parts[0];

    // Opciones por defecto si no se especifican opciones con "|"
    let options = parts.slice(1);
    if (options.length === 0) {
      options = ['1. Yo voy 🙋‍♂️', '2. No puedo 🙅‍♂️', '3. En duda / Tal vez 🤔'];
    }

    if (options.length < 2) {
      return sock.sendMessage(jid, { text: '⚠️ Una votación debe tener al menos 2 opciones de respuesta.' });
    }

    // Enviar encuesta nativa de WhatsApp a través del socket
    const pollMessage = await sock.sendMessage(jid, {
      poll: {
        name: `📊 VOTACIÓN DE CLAN: ${title}`,
        values: options,
        selectableCount: 1
      }
    });

    const pollId = pollMessage.key.id;
    db.createPoll(jid, pollId, title, options);

    await sock.sendMessage(jid, {
      text: `📢 *¡NUEVA VOTACIÓN OFICIAL PUBLICADA!*\n\n` +
            `📌 *Evento:* ${title}\n` +
            `👥 *Opciones:* ${options.length}\n\n` +
            `💡 _Usa ${config.prefix}resultados para ver la lista de votantes e integrantes que faltan por votar._`
    });
  },

  /**
   * Muestra los resultados detallados de la votación actual y la lista de inactivos/pendientes por votar
   */
  async handlePollResults(sock, jid, isGroup, groupMetadata) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const poll = db.getActivePoll(jid);
    if (!poll) {
      return sock.sendMessage(jid, { text: `ℹ️ No hay ninguna votación activa en este momento. Usa *${config.prefix}votacion* para crear una.` });
    }

    const participants = groupMetadata.participants.map(p => p.id);
    const votes = poll.votes || {}; // { userId: optionIndex }
    const votedUsers = Object.keys(votes);

    let text = `📊 *RESULTADOS DE LA VOTACIÓN OFICIAL* 📊\n\n` +
               `📌 *Evento:* ${poll.title}\n` +
               `👥 *Total de votos recibidos:* ${votedUsers.length}/${participants.length}\n\n`;

    const mentions = [];

    // Desglosar votos por cada opción
    poll.options.forEach((optText, optIdx) => {
      const usersForOpt = votedUsers.filter(uId => votes[uId] === optIdx);
      text += `🔹 *${optText}* (${usersForOpt.length} votos):\n`;

      if (usersForOpt.length === 0) {
        text += `   _Ningún voto aún_\n\n`;
      } else {
        usersForOpt.forEach(uId => {
          text += `   • @${uId.split('@')[0]}\n`;
          mentions.push(uId);
        });
        text += `\n`;
      }
    });

    // Detectar miembros que NO han votado aún
    const cleanNum = (id) => id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    const votedNums = votedUsers.map(u => cleanNum(u));

    const pendingUsers = participants.filter(pId => {
      const pNum = cleanNum(pId);
      return !votedNums.includes(pNum);
    });

    text += `-----------------------------------\n` +
            `👻 *PENDIENTES POR VOTAR (${pendingUsers.length} sin responder):*\n`;

    if (pendingUsers.length === 0) {
      text += `🎉 ¡Increíble! El 100% de los integrantes del clan ya votó.`;
    } else {
      pendingUsers.forEach((pId, idx) => {
        text += `${idx + 1}. @${pId.split('@')[0]}\n`;
        mentions.push(pId);
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

  /**
   * Permite votar por texto usando #votar <número> como alternativa
   */
  async handleVotarText(sock, jid, args, sender, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const poll = db.getActivePoll(jid);
    if (!poll) {
      return sock.sendMessage(jid, { text: 'ℹ️ No hay ninguna votación activa en este momento.' });
    }

    const optNum = parseInt(args[0]);
    if (isNaN(optNum) || optNum < 1 || optNum > poll.options.length) {
      return sock.sendMessage(jid, {
        text: `⚠️ Opción inválida. Elige un número del 1 al ${poll.options.length}.\n*Ejemplo:* ${config.prefix}votar 1`
      });
    }

    const optionIndex = optNum - 1;
    db.recordPollVote(jid, sender, optionIndex);

    const userNumber = sender.split('@')[0];
    await sock.sendMessage(jid, {
      text: `✅ @${userNumber} has registrado tu voto por la opción: *${poll.options[optionIndex]}*`,
      mentions: [sender]
    });
  }
};
