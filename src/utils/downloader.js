const yts = require('yt-search');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * Busca en YouTube y descarga el audio MP3 usando adonix-scraper + yt-search
 * @param {string} query Nombre de la canción o cantante
 * @returns {Promise<{ filePath: string, title: string, duration: string, author: string, thumbnail: string, url: string }>}
 */
async function searchAndDownloadAudio(query) {
  try {
    const adonix = await import('adonix-scraper');
    let videoUrl = query;
    let videoInfo = null;

    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const searchResult = await yts(query);
      if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
        throw new Error('No se encontraron canciones en YouTube con ese nombre.');
      }
      videoInfo = searchResult.videos[0];
      videoUrl = videoInfo.url;
    }

    // Obtener enlace directo de descarga MP3 vía adonix-scraper
    const dlData = await adonix.adonixytdl(videoUrl);
    if (!dlData || !dlData.mp3) {
      throw new Error('No se pudo obtener el enlace de descarga de audio.');
    }

    const title = videoInfo ? videoInfo.title : (dlData.title || 'Audio de YouTube');
    const duration = videoInfo ? videoInfo.timestamp : 'Audio';
    const author = videoInfo ? videoInfo.author.name : 'YouTube';
    const thumbnail = videoInfo ? videoInfo.thumbnail : '';

    // Descargar el archivo MP3 al directorio temporal local
    const tmpDir = os.tmpdir();
    const fileName = `yt_audio_${Date.now()}.mp3`;
    const filePath = path.join(tmpDir, fileName);

    const response = await fetch(dlData.mp3);
    if (!response.ok) {
      throw new Error(`Error en el servidor de música (Código HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    return {
      filePath,
      title,
      duration,
      author,
      thumbnail,
      url: videoUrl
    };
  } catch (err) {
    console.error('Error en downloader.js:', err);
    throw err;
  }
}

module.exports = {
  searchAndDownloadAudio
};
