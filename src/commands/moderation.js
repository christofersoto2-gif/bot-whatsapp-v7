const db = require('../database/manager');
const config = require('../../config');

module.exports = {
  async handleCloseGroup(sock, jid, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #close.' });
    if (!isBotAdmin) return sock.sendMessage(jid, { text: '❌ Necesito ser Administrador del grupo para cerrar el chat.' });

    try {
      await sock.groupSettingUpdate(jid, 'announcement');
      await sock.sendMessage(jid, { text: '🔒 *EL CHAT HA SIDO CERRADO*\n\nAhora solo los administradores pueden enviar mensajes.' });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(jid, { text: '❌ Ocurrió un error al intentar cerrar el grupo.' });
    }
  },

  async handleOpenGroup(sock, jid, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #open.' });
    if (!isBotAdmin) return sock.sendMessage(jid, { text: '❌ Necesito ser Administrador del grupo para abrir el chat.' });

    try {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await sock.sendMessage(jid, { text: '🔓 *EL CHAT HA SIDO ABIERTO*\n\nTodos los miembros del clan pueden volver a enviar mensajes.' });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(jid, { text: '❌ Ocurrió un error al intentar abrir el grupo.' });
    }
  },

  async handleWarn(sock, jid, targetUser, reason, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden dar advertencias.' });
    if (!targetUser) return sock.sendMessage(jid, { text: `⚠️ Debes mencionar al usuario a advertir. Ejemplo: *${config.prefix}warn @usuario Spaming*` });

    const warnResult = db.addWarn(jid, targetUser, reason);
    const targetNumber = targetUser.split('@')[0];

    if (warnResult.count >= config.maxWarns) {
      // EXPULSAR USUARIO AL LLEGAR A 3 WARNS
      let text = `🚨 *ADVERTENCIA MÁXIMA (${warnResult.count}/${config.maxWarns})* 🚨\n\n` +
        `El usuario @${targetNumber} ha alcanzado el límite de 3 advertencias.\n` +
        `❌ *Motivo final:* ${reason}\n` +
        `🚪 *Acción:* Expulsando automáticamente del clan...`;

      await sock.sendMessage(jid, { text, mentions: [targetUser] });

      if (isBotAdmin) {
        try {
          await sock.groupParticipantsUpdate(jid, [targetUser], 'remove');
        } catch (err) {
          console.error('Error expulsando usuario por warns:', err);
          await sock.sendMessage(jid, { text: '⚠️ No pude expulsar al usuario porque me faltan permisos de Admin.' });
        }
      } else {
        await sock.sendMessage(jid, { text: '⚠️ Asigna rango de Administrador al bot para que pueda efectuar la expulsión automática.' });
      }
    } else {
      let text = `⚠️ *ADVERTENCIA APLICADA* ⚠️\n\n` +
        `👤 *Usuario:* @${targetNumber}\n` +
        `📄 *Motivo:* ${reason}\n` +
        `📊 *Advertencias acumuladas:* ${warnResult.count}/${config.maxWarns}\n\n` +
        `_Al llegar a ${config.maxWarns} advertencias serás expulsado del clan automáticamente._`;

      await sock.sendMessage(jid, { text, mentions: [targetUser] });
    }
  },

  async handleDelWarn(sock, jid, targetUser, isGroup, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden remover advertencias.' });
    if (!targetUser) return sock.sendMessage(jid, { text: `⚠️ Debes mencionar al usuario. Ejemplo: *${config.prefix}delwarn @usuario*` });

    const warnResult = db.removeWarn(jid, targetUser);
    const targetNumber = targetUser.split('@')[0];

    const text = `✅ *ADVERTENCIA REMOVIDA*\n\n` +
      `👤 *Usuario:* @${targetNumber}\n` +
      `📊 *Advertencias actuales:* ${warnResult.count}/${config.maxWarns}`;

    await sock.sendMessage(jid, { text, mentions: [targetUser] });
  },

  async handleWarns(sock, jid, targetUser, isGroup) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!targetUser) return sock.sendMessage(jid, { text: `⚠️ Debes mencionar al usuario. Ejemplo: *${config.prefix}warns @usuario*` });

    const warns = db.getWarns(jid, targetUser);
    const targetNumber = targetUser.split('@')[0];

    let text = `📋 *HISTORIAL DE ADVERTENCIAS* 📋\n\n` +
      `👤 *Usuario:* @${targetNumber}\n` +
      `📊 *Total:* ${warns.count}/${config.maxWarns}\n\n`;

    if (warns.reasons.length === 0) {
      text += `_El usuario no posee ninguna advertencia registrada._`;
    } else {
      warns.reasons.forEach((r, idx) => {
        text += `${idx + 1}. ${r.reason} (${new Date(r.date).toLocaleDateString()})\n`;
      });
    }

    await sock.sendMessage(jid, { text, mentions: [targetUser] });
  },

  async handleKick(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden expulsar.' });
    if (!isBotAdmin) return sock.sendMessage(jid, { text: '❌ Necesito ser Administrador para expulsar usuarios.' });
    if (!targetUser) return sock.sendMessage(jid, { text: `⚠️ Menciona al usuario que deseas expulsar. Ejemplo: *${config.prefix}kick @usuario*` });

    try {
      await sock.groupParticipantsUpdate(jid, [targetUser], 'remove');
      await sock.sendMessage(jid, { text: `🚪 El usuario @${targetUser.split('@')[0]} ha sido expulsado del clan.`, mentions: [targetUser] });
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ No se pudo expulsar al usuario.' });
    }
  },

  async handlePromote(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo admins pueden promover usuarios.' });
    if (!isBotAdmin) return sock.sendMessage(jid, { text: '❌ El bot debe ser admin.' });
    if (!targetUser) return sock.sendMessage(jid, { text: '⚠️ Menciona al usuario a promover.' });

    try {
      await sock.groupParticipantsUpdate(jid, [targetUser], 'promote');
      await sock.sendMessage(jid, { text: `⭐ @${targetUser.split('@')[0]} ahora es Administrador del grupo.`, mentions: [targetUser] });
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error al promover usuario.' });
    }
  },

  async handleDemote(sock, jid, targetUser, isGroup, isAdmin, isBotAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Comando solo para grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo admins pueden degradar usuarios.' });
    if (!isBotAdmin) return sock.sendMessage(jid, { text: '❌ El bot debe ser admin.' });
    if (!targetUser) return sock.sendMessage(jid, { text: '⚠️ Menciona al usuario a degradar.' });

    try {
      await sock.groupParticipantsUpdate(jid, [targetUser], 'demote');
      await sock.sendMessage(jid, { text: `🔻 @${targetUser.split('@')[0]} ya no es Administrador del grupo.`, mentions: [targetUser] });
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error al degradar usuario.' });
    }
  }
};
