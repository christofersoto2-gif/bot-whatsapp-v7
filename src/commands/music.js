const { searchAndDownloadAudio, convertToOpusOgg } = require('../utils/downloader');
const config = require('../../config');
const fs = require('fs-extra');

// Cola Global de Envío de Música (Evita saturación de socket y corrupción cuando se solicitan varias canciones a la vez)
const musicQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || musicQueue.length === 0) return;
  isProcessingQueue = true;

  while (musicQueue.length > 0) {
    const task = musicQueue.shift();
    try {
      await task();
    } catch (err) {
      console.error('Error en tarea de cola de música:', err);
    }
    // Pausa de seguridad de 1.5 segundos entre envíos pesados para que el servidor de WhatsApp procese cada paquete limpiamente
    await new Promise(res => setTimeout(res, 1500));
  }

  isProcessingQueue = false;
}

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

    // Agregar la descarga y envío a la cola secuencial sin saturar el canal
    musicQueue.push(async () => {
      try {
        const result = await searchAndDownloadAudio(query);

        const infoHeader = result.cached 
          ? `⚡ *CANCIÓN RECUPERADA DE CACHÉ ULTRARRÁPIDA (0 SEG DELAY)* ⚡` 
          : `🎵 *CANCIÓN ENCONTRADA EN YOUTUBE* 🎵`;

        const infoText = `${infoHeader}\n\n` +
          `📌 *Título:* ${result.title}\n` +
          `👤 *Canal/Artista:* ${result.author}\n` +
          `⏱️ *Duración:* ${result.duration}\n\n` +
          `⏳ *Generando reproductor de audio directo...*`;

        await sock.sendMessage(jid, { text: infoText });

        // Convertir a Opus OGG nativo de WhatsApp (Universal para iPhone, Android, Xiaomi, Motorola, Samsung, Web)
        const opusPath = await convertToOpusOgg(result.filePath);
        const audioBuffer = await fs.readFile(opusPath);

        // Enviar reproductor de audio directo nativo en el chat
        await sock.sendMessage(jid, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: false
        });

      } catch (err) {
        console.error('Error en #ytaudio:', err);
        await sock.sendMessage(jid, { text: `❌ No se pudo procesar la canción en YouTube: ${err.message || 'Error desconocido'}` });
      }
    });

    processQueue();
  }
};
