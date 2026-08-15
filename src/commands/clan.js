const db = require('../database/manager');
const config = require('../../config');

module.exports = {
  async handleVS(sock, jid, args, sender, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos del clan.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores o líderes del clan pueden crear un aviso de VS.' });

    if (args.length < 2) {
      return sock.sendMessage(jid, {
        text: `⚠️ *Uso correcto:* ${config.prefix}vs <Clan Rival> <Hora/Fecha> [cupos]\n*Ejemplo:* ${config.prefix}vs Clan Alpha Hoy 8PM 4`
      });
    }

    const opponent = args[0];
    const datetime = args[1];
    const slots = args[2] || 4;

    const vsInfo = db.createVS(jid, opponent, datetime, slots);

    const msg = `⚔️ *NUEVA GUERRA DE CLANES / VS* ⚔️\n\n` +
      `🛡️ *Rival:* ${vsInfo.opponent}\n` +
      `⏰ *Hora:* ${vsInfo.datetime}\n` +
      `👥 *Cupos:* ${vsInfo.slots}\n\n` +
      `✍️ Para anotarte a la alineación escribe: *${config.prefix}anotar*\n` +
      `📜 Para ver la lista de jugadores escribe: *${config.prefix}lineup*`;

    await sock.sendMessage(jid, { text: msg });
  },

  async handleAnotar(sock, jid, sender, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const result = db.joinVS(jid, sender);
    if (!result.success) {
      return sock.sendMessage(jid, { text: `⚠️ ${result.msg}` });
    }

    const userNumber = sender.split('@')[0];
    const vs = result.vs;

    let text = `✅ @${userNumber} te has anotado para el VS contra *${vs.opponent}*!\n\n` +
      `📊 *Alineación actual (${vs.lineup.length}/${vs.slots}):*\n`;

    vs.lineup.forEach((id, index) => {
      text += `${index + 1}. @${id.split('@')[0]}\n`;
    });

    await sock.sendMessage(jid, { text, mentions: vs.lineup });
  },

  async handleSalirse(sock, jid, sender, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const removed = db.leaveVS(jid, sender);
    if (removed) {
      await sock.sendMessage(jid, { text: `✅ Te has salido de la alineación para el VS.` });
    } else {
      await sock.sendMessage(jid, { text: `⚠️ No estás anotado en la lista actual.` });
    }
  },

  async handleLineup(sock, jid, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const group = db.getGroup(jid);
    if (!group.vs) {
      return sock.sendMessage(jid, { text: `ℹ️ No hay ningún VS programado en este momento. Usa *${config.prefix}vs* para programar uno.` });
    }

    const vs = group.vs;
    let text = `📋 *ALINEACIÓN DEL CLAN PARA EL VS* 📋\n\n` +
      `🛡️ *Rival:* ${vs.opponent}\n` +
      `⏰ *Hora:* ${vs.datetime}\n` +
      `👥 *Jugadores (${vs.lineup.length}/${vs.slots}):*\n\n`;

    if (vs.lineup.length === 0) {
      text += `_Aún no hay nadie anotado. ¡Sé el primero con *${config.prefix}anotar*!_`;
    } else {
      vs.lineup.forEach((id, index) => {
        text += `${index + 1}. @${id.split('@')[0]}\n`;
      });
    }

    await sock.sendMessage(jid, { text, mentions: vs.lineup });
  },

  async handleReglas(sock, jid, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    const group = db.getGroup(jid);
    await sock.sendMessage(jid, { text: `📜 *REGLAMENTO DEL CLAN* 📜\n\n${group.rules}` });
  },

  async handleSetRules(sock, jid, text, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden cambiar las reglas del clan.' });

    const rulesText = text.replace(`${config.prefix}setrules`, '').trim();
    if (!rulesText) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso correcto:* ${config.prefix}setrules <Escribe aquí las reglas del clan>` });
    }

    db.setRules(jid, rulesText);
    await sock.sendMessage(jid, { text: '✅ *¡Reglas del clan actualizadas con éxito!*' });
  },

  async handlePerfil(sock, jid, targetUser, isGroup) {
    const user = db.getUser(targetUser);
    const warns = db.getWarns(jid, targetUser);
    const targetNumber = targetUser.split('@')[0];

    const text = `👤 *PERFIL DEL INTEGRANTE DE CLAN* 👤\n\n` +
      `📱 *Jugador:* @${targetNumber}\n` +
      `🪙 *Monedas:* ${user.balance} ${config.currencyEmoji}\n` +
      `⚠️ *Advertencias:* ${warns.count}/${config.maxWarns}\n` +
      `🏆 *Victorias Casino:* ${user.wins || 0}\n` +
      `📉 *Derrotas Casino:* ${user.losses || 0}`;

    await sock.sendMessage(jid, { text, mentions: [targetUser] });
  },

  async handleTopActive(sock, jid, isGroup, groupMetadata) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const participants = groupMetadata.participants.map(p => p.id);
    const topActive = db.getTopActive(jid, participants, 10);

    let text = `🔥 *TOP 10 INTEGRANTES MÁS ACTIVOS* 🔥\n\n`;
    topActive.forEach((u, idx) => {
      const number = u.id.split('@')[0];
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[idx] || `${idx + 1}.`;
      text += `${prefix} @${number} - *${u.count} mensajes*\n`;
    });

    await sock.sendMessage(jid, { text, mentions: topActive.map(u => u.id) });
  },

  async handleTopInactive(sock, jid, isGroup, groupMetadata) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });

    const participants = groupMetadata.participants.map(p => p.id);
    const topInactive = db.getTopInactive(jid, participants, 10);

    let text = `💤 *TOP 10 INTEGRANTES MÁS INACTIVOS* 💤\n\n`;
    topInactive.forEach((u, idx) => {
      const number = u.id.split('@')[0];
      const status = u.count === 0 ? '❌ *0 mensajes*' : `⚠️ *${u.count} mensajes*`;
      text += `${idx + 1}. @${number} - ${status}\n`;
    });

    await sock.sendMessage(jid, { text, mentions: topInactive.map(u => u.id) });
  },

  async handleInactivosList(sock, jid, isGroup, groupMetadata, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden ver la lista completa de inactivos.' });

    const participants = groupMetadata.participants.map(p => p.id);
    const allActivity = db.getGroupActivity(jid, participants);

    // Filtrar usuarios con 0 mensajes o menos de 3 mensajes
    const ghostUsers = allActivity.filter(u => u.count <= 2);

    let text = `👻 *LISTA DE FANTASMAS / INACTIVOS DEL CLAN* 👻\n\n` +
      `Total de integrantes inactivos (<= 2 mensajes): *${ghostUsers.length}*\n\n`;

    if (ghostUsers.length === 0) {
      text += `🎉 ¡Excelente! Todo el clan está participando activamente.`;
    } else {
      ghostUsers.forEach((u, idx) => {
        text += `${idx + 1}. @${u.id.split('@')[0]} (Mensajes: ${u.count})\n`;
      });
      text += `\n💡 _Usa ${config.prefix}warn @usuario Inactividad para advertir a los fantasmas._`;
    }

    await sock.sendMessage(jid, { text, mentions: ghostUsers.map(u => u.id) });
  }
};
