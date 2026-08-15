const config = require('../../config');

module.exports = {
  async handleTagAll(sock, jid, text, isGroup, groupMetadata, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores o líderes del clan pueden usar este comando.' });

    const messageText = text.replace(new RegExp(`^${config.prefix}(tag|todos|everyone)`, 'i'), '').trim();
    const participants = groupMetadata.participants.map(p => p.id);

    let tagMsg = `📢 *MENCIÓN DE CLAN (@everyone)* 📢\n\n`;
    if (messageText) {
      tagMsg += `💬 *Mensaje:* ${messageText}\n\n`;
    }
    tagMsg += `👥 *Integrantes del Clan (${participants.length}):*\n`;

    participants.forEach((p, index) => {
      tagMsg += `${index + 1}. @${p.split('@')[0]}\n`;
    });

    await sock.sendMessage(jid, { text: tagMsg, mentions: participants });
  },

  async handleHideTag(sock, jid, text, isGroup, groupMetadata, isAdmin) {
    if (!isGroup) return sock.sendMessage(jid, { text: '❌ Este comando solo se puede usar en grupos.' });
    if (!isAdmin) return sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar #hidetag.' });

    const messageText = text.replace(new RegExp(`^${config.prefix}hidetag`, 'i'), '').trim();
    if (!messageText) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso correcto:* ${config.prefix}hidetag <Mensaje>` });
    }

    const participants = groupMetadata.participants.map(p => p.id);
    const tagMsg = `📢 *COMUNICADO DEL CLAN* 📢\n\n${messageText}`;

    await sock.sendMessage(jid, { text: tagMsg, mentions: participants });
  }
};
