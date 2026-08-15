const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const config = require('../../config');

module.exports = {
  async handleSticker(sock, jid, msg) {
    try {
      // Verificar si el mensaje directo es una imagen o video, o si es una respuesta (quoted message) a una imagen
      let targetMessage = msg;
      const messageType = Object.keys(msg.message)[0];
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo;

      if (contextInfo && contextInfo.quotedMessage) {
        const quoted = contextInfo.quotedMessage;
        const quotedType = Object.keys(quoted)[0];

        if (quotedType === 'imageMessage' || quotedType === 'videoMessage') {
          targetMessage = {
            key: {
              remoteJid: jid,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant
            },
            message: quoted
          };
        }
      }

      const finalType = Object.keys(targetMessage.message)[0];

      if (finalType !== 'imageMessage' && finalType !== 'videoMessage') {
        return sock.sendMessage(jid, {
          text: `⚠️ *Uso correcto:* Responde a una imagen/video escribiendo *${config.prefix}s* o envía una imagen con la leyenda *${config.prefix}s*.`
        });
      }

      // Descargar el buffer multimedia
      const mediaBuffer = await downloadMediaMessage(targetMessage, 'buffer', {});

      if (!mediaBuffer) {
        return sock.sendMessage(jid, { text: '❌ No se pudo descargar la imagen para convertirla en sticker.' });
      }

      // Crear el sticker usando wa-sticker-formatter
      const sticker = new Sticker(mediaBuffer, {
        pack: config.botName || 'Clan Bot',
        author: 'Sticker Bot',
        type: StickerTypes.FULL,
        quality: 70
      });

      const stickerBuffer = await sticker.toBuffer();

      // Enviar el sticker al chat
      await sock.sendMessage(jid, { sticker: stickerBuffer });

    } catch (err) {
      console.error('Error creando sticker (#s):', err);
      await sock.sendMessage(jid, { text: '❌ Ocurrió un error al convertir la imagen en sticker.' });
    }
  }
};
