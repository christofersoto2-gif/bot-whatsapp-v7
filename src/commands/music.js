const { searchAndDownloadAudio, convertToM4a } = require('../utils/downloader');
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

function parseDurationToSeconds(durationStr) {
  if (!durationStr) return 180;
  if (typeof durationStr === 'number') return durationStr;
  const parts = String(durationStr).split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseInt(durationStr) || 180;
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

        // 1. Aplicar la Fórmula Mágica Definitiva de FFmpeg (-c:a aac -b:a 128k -map_metadata -1 -movflags +faststart)
        const m4aPath = await convertToM4a(result.filePath);
        const m4aBuffer = await fs.readFile(m4aPath);
        const fileSizeMb = (m4aBuffer.length / (1024 * 1024)).toFixed(2);
        const durationSec = parseDurationToSeconds(result.duration);

        const infoCaption = 
          `┌✦」 Descargando <*${result.title}*>\n` +
          `┆ ✏️ Canal: *${result.author}*\n` +
          `┆ ⌛ Duración: *${result.duration}*\n` +
          `┆ ❒ Tamaño: *${fileSizeMb}MB*\n` +
          `┆ 🔗 URL: ${result.url}`;

        // 2. Enviar tarjeta con imagen de miniatura de YouTube (Thumbnail)
        let imgSent = false;
        if (result.thumbnail) {
          try {
            const imgRes = await fetch(result.thumbnail);
            if (imgRes.ok) {
              const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
              await sock.sendMessage(jid, { 
                image: imgBuffer, 
                caption: infoCaption,
                jpegThumbnail: Buffer.alloc(0)
              });
              imgSent = true;
            }
          } catch (e) {}
        }
        
        if (!imgSent) {
          await sock.sendMessage(jid, { text: infoCaption });
        }

        // 3. Enviar archivo M4A AAC nativo de Apple para iPhone iOS, Android y Web (mimetype: 'audio/mp4', ptt: false)
        await sock.sendMessage(jid, {
          audio: m4aBuffer,
          mimetype: 'audio/mp4',
          seconds: durationSec,
          fileLength: m4aBuffer.length,
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
