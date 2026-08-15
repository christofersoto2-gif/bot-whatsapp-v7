const db = require('../database/manager');
const config = require('../../config');

module.exports = {
  async handleBalance(sock, jid, sender) {
    const user = db.getUser(sender);
    const userNumber = sender.split('@')[0];

    const text = `💰 *CASINO Y ECONOMÍA DEL CLAN* 💰\n\n` +
      `👤 *Jugador:* @${userNumber}\n` +
      `💵 *Efectivo:* ${user.balance} ${config.currencyEmoji}\n` +
      `🏦 *Banco:* ${user.bank} ${config.currencyEmoji}\n` +
      `🏆 *Victorias:* ${user.wins || 0} | 📉 *Derrotas:* ${user.losses || 0}`;

    await sock.sendMessage(jid, { text, mentions: [sender] });
  },

  async handleDaily(sock, jid, sender) {
    const user = db.getUser(sender);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 horas

    if (user.lastDaily && now - user.lastDaily < cooldown) {
      const remainingMs = cooldown - (now - user.lastDaily);
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      return sock.sendMessage(jid, { text: `⏳ Ya reclamaste tu recompensa diaria. Vuelve en *${hours}h ${minutes}m*.` });
    }

    const reward = config.dailyReward || 500;
    db.addBalance(sender, reward);
    db.setLastDaily(sender);

    const text = `🎉 *¡RECOMPENSA DIARIA RECLAMADA!* 🎉\n\n` +
      `Has recibido *+${reward} ${config.currencyEmoji}*.\n` +
      `Nuevo saldo: *${user.balance} ${config.currencyEmoji}*`;

    await sock.sendMessage(jid, { text });
  },

  async handleWork(sock, jid, sender) {
    const user = db.getUser(sender);
    const now = Date.now();
    const cooldown = 2 * 60 * 60 * 1000; // 2 horas

    if (user.lastWork && now - user.lastWork < cooldown) {
      const remainingMs = cooldown - (now - user.lastWork);
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      return sock.sendMessage(jid, { text: `⏳ Estás cansado de trabajar. Descansa *${hours}h ${minutes}m* antes de tu próximo turno.` });
    }

    const works = [
      'Entrenaste a los reclutas del clan',
      'Ganaste una sala personalizada',
      'Lideraste una escuadra victoriosa',
      'Organizaste el torneo del clan',
      'Conquistaste territorio en el mapa'
    ];
    const randomWork = works[Math.floor(Math.random() * works.length)];
    const earned = Math.floor(Math.random() * 300) + 150; // 150 - 450 coins

    db.addBalance(sender, earned);
    db.setLastWork(sender);

    const text = `🛠️ *TRABAJO DEL CLAN* 🛠️\n\n` +
      `*Misión:* ${randomWork}\n` +
      `*Pago:* +${earned} ${config.currencyEmoji}\n` +
      `*Saldo actual:* ${user.balance} ${config.currencyEmoji}`;

    await sock.sendMessage(jid, { text });
  },

  async handleSlot(sock, jid, sender, betAmount) {
    const bet = parseInt(betAmount);
    if (isNaN(bet) || bet <= 0) {
      return sock.sendMessage(jid, { text: `⚠️ Ingresa una apuesta válida. Ejemplo: *${config.prefix}slot 100*` });
    }

    const user = db.getUser(sender);
    if (user.balance < bet) {
      return sock.sendMessage(jid, { text: `❌ No tienes suficientes monedas. Tu saldo actual es de *${user.balance} ${config.currencyEmoji}*.` });
    }

    const items = ['🎰', '💎', '7️⃣', '🍒', '🍋', '🔔'];
    const r1 = items[Math.floor(Math.random() * items.length)];
    const r2 = items[Math.floor(Math.random() * items.length)];
    const r3 = items[Math.floor(Math.random() * items.length)];

    let winMultiplier = 0;

    if (r1 === r2 && r2 === r3) {
      if (r1 === '🎰' || r1 === '7️⃣') winMultiplier = 5;
      else if (r1 === '💎') winMultiplier = 4;
      else winMultiplier = 3;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      winMultiplier = 1.5;
    }

    if (winMultiplier > 0) {
      const prize = Math.floor(bet * winMultiplier);
      const profit = prize - bet;
      db.addBalance(sender, profit);
      db.addWin(sender);

      const text = `🎰 *TRAGAMONEDAS DEL CASINO* 🎰\n\n` +
        `[ ${r1} | ${r2} | ${r3} ]\n\n` +
        `🎉 *¡GANASTE!* (${winMultiplier}x)\n` +
        `➕ Monedas ganadas: *+${prize} ${config.currencyEmoji}*\n` +
        `💰 Saldo actual: *${user.balance} ${config.currencyEmoji}*`;

      await sock.sendMessage(jid, { text });
    } else {
      db.removeBalance(sender, bet);
      db.addLoss(sender);

      const text = `🎰 *TRAGAMONEDAS DEL CASINO* 🎰\n\n` +
        `[ ${r1} | ${r2} | ${r3} ]\n\n` +
        `💥 *¡HAS PERDIDO!*\n` +
        `➖ Monedas perdidas: *-${bet} ${config.currencyEmoji}*\n` +
        `💰 Saldo actual: *${user.balance} ${config.currencyEmoji}*`;

      await sock.sendMessage(jid, { text });
    }
  },

  async handleCoinflip(sock, jid, sender, choice, betAmount) {
    const validChoices = ['cara', 'cruz'];
    if (!choice || !validChoices.includes(choice.toLowerCase()) || isNaN(parseInt(betAmount))) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso correcto:* ${config.prefix}coinflip <cara/cruz> <apuesta>\n*Ejemplo:* ${config.prefix}cf cara 200` });
    }

    const userChoice = choice.toLowerCase();
    const bet = parseInt(betAmount);
    const user = db.getUser(sender);

    if (user.balance < bet) {
      return sock.sendMessage(jid, { text: `❌ No tienes suficientes monedas (${user.balance} disponibles).` });
    }

    const outcome = Math.random() < 0.5 ? 'cara' : 'cruz';
    const coinEmoji = outcome === 'cara' ? '🪙 (CARA)' : '🪙 (CRUZ)';

    if (userChoice === outcome) {
      db.addBalance(sender, bet);
      db.addWin(sender);
      const text = `🪙 *CARA O CRUZ* 🪙\n\n` +
        `La moneda cayó en: *${outcome.toUpperCase()}*\n` +
        `🎉 *¡Felicidades, ganaste +${bet * 2} ${config.currencyEmoji}!*\n` +
        `Saldo total: *${user.balance} ${config.currencyEmoji}*`;
      await sock.sendMessage(jid, { text });
    } else {
      db.removeBalance(sender, bet);
      db.addLoss(sender);
      const text = `🪙 *CARA O CRUZ* 🪙\n\n` +
        `La moneda cayó en: *${outcome.toUpperCase()}*\n` +
        `💥 *Has perdido -${bet} ${config.currencyEmoji}.*\n` +
        `Saldo total: *${user.balance} ${config.currencyEmoji}*`;
      await sock.sendMessage(jid, { text });
    }
  },

  async handleRoulette(sock, jid, sender, betChoice, betAmount) {
    const bet = parseInt(betAmount);
    if (!betChoice || isNaN(bet) || bet <= 0) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso correcto:* ${config.prefix}roulette <rojo/negro/1-36> <apuesta>` });
    }

    const user = db.getUser(sender);
    if (user.balance < bet) {
      return sock.sendMessage(jid, { text: `❌ Saldo insuficiente.` });
    }

    const winningNumber = Math.floor(Math.random() * 37);
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const winningColor = winningNumber === 0 ? 'verde' : (redNumbers.includes(winningNumber) ? 'rojo' : 'negro');

    let won = false;
    let multiplier = 0;

    const choiceLower = betChoice.toLowerCase();
    if (choiceLower === 'rojo' && winningColor === 'rojo') {
      won = true; multiplier = 2;
    } else if (choiceLower === 'negro' && winningColor === 'negro') {
      won = true; multiplier = 2;
    } else if (parseInt(choiceLower) === winningNumber) {
      won = true; multiplier = 36;
    }

    if (won) {
      const prize = bet * multiplier;
      db.addBalance(sender, prize - bet);
      db.addWin(sender);
      const text = `🎡 *RULETA DE CASINO* 🎡\n\n` +
        `La ruleta giró y cayó en: *${winningNumber} (${winningColor.toUpperCase()})*\n\n` +
        `🎉 *¡GANASTE! +${prize} ${config.currencyEmoji}*\n` +
        `Saldo actual: *${user.balance} ${config.currencyEmoji}*`;
      await sock.sendMessage(jid, { text });
    } else {
      db.removeBalance(sender, bet);
      db.addLoss(sender);
      const text = `🎡 *RULETA DE CASINO* 🎡\n\n` +
        `La ruleta giró y cayó en: *${winningNumber} (${winningColor.toUpperCase()})*\n\n` +
        `💥 *HAS PERDIDO -${bet} ${config.currencyEmoji}*\n` +
        `Saldo actual: *${user.balance} ${config.currencyEmoji}*`;
      await sock.sendMessage(jid, { text });
    }
  },

  async handleRob(sock, jid, sender, targetUser) {
    if (!targetUser) return sock.sendMessage(jid, { text: `⚠️ Menciona a quién quieres robar. Ejemplo: *${config.prefix}rob @usuario*` });
    if (targetUser === sender) return sock.sendMessage(jid, { text: '❌ No te puedes robar a ti mismo.' });

    const robber = db.getUser(sender);
    const victim = db.getUser(targetUser);

    if (robber.balance < 200) {
      return sock.sendMessage(jid, { text: `⚠️ Necesitas al menos 200 ${config.currencyEmoji} para intentar un robo.` });
    }
    if (victim.balance < 300) {
      return sock.sendMessage(jid, { text: `⚠️ Tu objetivo es muy pobre, no vale la pena robarle.` });
    }

    const success = Math.random() < 0.45; // 45% probabilidad de exito

    if (success) {
      const stolen = Math.floor(Math.random() * (victim.balance * 0.3)) + 50;
      db.removeBalance(targetUser, stolen);
      db.addBalance(sender, stolen);

      const text = `🥷 *¡ROBO EXITOSO!* 🥷\n\n` +
        `Le has robado *${stolen} ${config.currencyEmoji}* a @${targetUser.split('@')[0]}.\n` +
        `Tu nuevo saldo: *${robber.balance} ${config.currencyEmoji}*`;

      await sock.sendMessage(jid, { text, mentions: [sender, targetUser] });
    } else {
      const fine = Math.min(robber.balance, 150);
      db.removeBalance(sender, fine);

      const text = `🚨 *¡TE ATRAPARON CON LAS MANOS EN LA MASA!* 🚨\n\n` +
        `Intentaste robar a @${targetUser.split('@')[0]} pero la guardia del clan te descubrió.\n` +
        `Has pagado una multa de *-${fine} ${config.currencyEmoji}*.`;

      await sock.sendMessage(jid, { text, mentions: [sender, targetUser] });
    }
  },

  async handlePay(sock, jid, sender, targetUser, amount) {
    const payAmount = parseInt(amount);
    if (!targetUser || isNaN(payAmount) || payAmount <= 0) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso correcto:* ${config.prefix}pay @usuario <monto>` });
    }
    if (targetUser === sender) return sock.sendMessage(jid, { text: '❌ No te puedes pagar a ti mismo.' });

    const senderUser = db.getUser(sender);
    if (senderUser.balance < payAmount) {
      return sock.sendMessage(jid, { text: `❌ No tienes suficientes monedas para realizar esta transferencia.` });
    }

    db.removeBalance(sender, payAmount);
    db.addBalance(targetUser, payAmount);

    const text = `💸 *TRANSFERENCIA EXITOSA* 💸\n\n` +
      `De: @${sender.split('@')[0]}\n` +
      `Para: @${targetUser.split('@')[0]}\n` +
      `Monto: *${payAmount} ${config.currencyEmoji}*`;

    await sock.sendMessage(jid, { text, mentions: [sender, targetUser] });
  },

  async handleLeaderboard(sock, jid) {
    const top = db.getLeaderboard(10);
    let text = `🏆 *RANKING DE LOS MÁS RICOS DEL CLAN* 🏆\n\n`;

    top.forEach((u, idx) => {
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[idx] || `${idx + 1}.`;
      text += `${prefix} @${u.id.split('@')[0]} - *${u.balance} ${config.currencyEmoji}*\n`;
    });

    await sock.sendMessage(jid, { text, mentions: top.map(u => u.id) });
  },

  async handleShip(sock, jid, text, mentions) {
    if (mentions.length < 2) {
      return sock.sendMessage(jid, { text: `⚠️ *Uso:* Menciona a 2 miembros para ver su compatibilidad. Ejemplo: *${config.prefix}ship @usuario1 @usuario2*` });
    }

    const u1 = mentions[0].split('@')[0];
    const u2 = mentions[1].split('@')[0];
    const percent = Math.floor(Math.random() * 101);

    let comment = '';
    if (percent > 85) comment = '💖 ¡Nacieron el uno para el otro!';
    else if (percent > 60) comment = '😍 ¡Hay mucha química aquí!';
    else if (percent > 40) comment = '😊 Podrían intentarlo...';
    else comment = '💔 Mejor quédense como compañeros de clan.';

    const msg = `💘 *CALCULADORA DE AMOR DEL CLAN* 💘\n\n` +
      `👩‍❤️‍👨 *@${u1}*  x  *@${u2}*\n` +
      `📊 *Compatibilidad:* ${percent}%\n` +
      `💬 ${comment}`;

    await sock.sendMessage(jid, { text: msg, mentions });
  }
};
