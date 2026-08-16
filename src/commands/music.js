const { searchAndDownloadAudio } = require('../utils/downloader');
const config = require('../../config');
const fs = require('fs-extra');

module.exports = {
  async handleYtAudio(sock, jid, text) {
    const query = text.replace(new RegExp(`^${config.prefix}(ytaudio|play|musica)`, 'i'), '').trim();
    if (!query) {
      return sock.sendMessage(jid, {
        text: `⚠️ *Uso correcto:* ${config.prefix}ytaudio <Nombre de la canción / cantante>\n*Ejemplo:* ${config.prefix}ytaudio Bad Bunny Monaco`
      });
    }

    // Mensaje de estado buscando en YouTube
    await sock.sendMessage(jid, { text: `🔍 *Buscando exclusivamente en YouTube:* _"${query}"_...` });

    try {
      const result = await searchAndDownloadAudio(query);

      const infoHeader = result.cached 
        ? `⚡ *CANCIÓN RECUPERADA DE CACHÉ ULTRARRÁPIDA (0 SEG DELAY)* ⚡` 
        : `🎵 *CANCIÓN ENCONTRADA EN YOUTUBE* 🎵`;

      const infoText = `${infoHeader}\n\n` +
        `📌 *Título:* ${result.title}\n` +
        `👤 *Canal/Artista:* ${result.author}\n` +
        `⏱️ *Duración:* ${result.duration}\n\n` +
        `⏳ *Enviando audio al chat...*`;

      await sock.sendMessage(jid, { text: infoText });

      // Enviar archivo de audio y Documento MP3 para compatibilidad total con iPhone (iOS) y Android
      const audioBuffer = await fs.readFile(result.filePath);

      // 1. Enviar como Documento MP3 (Garantiza 100% de compatibilidad en iPhone / iOS y nunca expira)
      await sock.sendMessage(jid, {
        document: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${result.title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`
      });

      // 2. Enviar reproductor de audio directo para Android / Web
      try {
        await sock.sendMessage(jid, {
          audio: audioBuffer,
          mimetype: 'audio/mp4',
          ptt: false
        });
      } catch (e) {}

    } catch (err) {
      console.error('Error en #ytaudio:', err);
      await sock.sendMessage(jid, { text: `❌ No se pudo procesar la canción en YouTube: ${err.message || 'Error desconocido'}` });
    }
  }
};
