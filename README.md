# ⚔️ BOT DE WHATSAPP PARA CLANES & MODERACIÓN ⚔️

Bot completo para grupos de clanes de WhatsApp con características avanzadas de moderación estilo Discord, organización de batallas/scrims, casino con economía integrada y descargador instantáneo de audio de YouTube (`#play`).

---

## 🚀 GUÍA DE INICIO RÁPIDO

### 1. Requisitos Previos
- **Node.js** (versión 18 o superior) instalado en tu equipo.
- Teléfono móvil con **WhatsApp**.

### 2. Cómo Iniciar el Bot
Abre una terminal o consola de comandos en esta carpeta y ejecuta:
```bash
npm start
```

### 3. Vincular tu Número de WhatsApp
1. Al ejecutar `npm start`, aparecerá un **Código QR** en la consola.
2. Abre **WhatsApp** en tu teléfono celular.
3. Dirígete a **Menú (tres puntos)** o **Configuración** -> **Dispositivos vinculados**.
4. Selecciona **Vincular un dispositivo** y escanea el código QR que se muestra en la pantalla de la computadora.
5. ¡Listo! El bot estará conectado a tu número de WhatsApp y responderá automáticamente en tus chats y grupos de clan.

---

## 📜 LISTA DE COMANDOS DEL BOT

### 🛡️ ORGANIZACIÓN Y GESTIÓN DE CLAN
- `#vs <Clan Rival> <Hora> [Cupos]` : Crea un aviso oficial de Guerra de Clanes / VS.
- `#anotar` : Te inscribe en la alineación titular del VS.
- `#salirse` : Te remueve de la alineación titular.
- `#lineup` / `#escuadra` : Muestra la lista de jugadores anotados para la batalla.
- `#reglas` : Muestra el reglamento oficial del clan.
- `#setrules <texto>` : Establece o edita las reglas del clan (Solo Admins).
- `#perfil [@usuario]` : Muestra las estadísticas, rango, saldo y advertencias del jugador.

### 👮 MODERACIÓN DE GRUPOS (ESTILO DISCORD)
- `#close` / `#cerrar` : Cierra el grupo para que solo los líderes/admins puedan enviar mensajes.
- `#open` / `#abrir` : Abre el grupo para que todo el clan vuelva a chatear.
- `#warn @usuario [motivo]` : Da una advertencia a un miembro. **Al acumular 3 advertencias, el bot lo expulsa automáticamente del clan**.
- `#delwarn @usuario` : Quita 1 advertencia a un integrante.
- `#warns @usuario` : Consulta el historial de advertencias registradas.
- `#kick @usuario` : Expulsa inmediatamente a un miembro del grupo.
- `#promover @usuario` : Otorga rango de Administrador a un miembro.
- `#demote @usuario` : Quita rango de Administrador.

### 📢 MENCIONES Y DIFUSIÓN
- `#tag <mensaje>` / `#todos <mensaje>` : Menciona a **todos los miembros del clan** (formato estilo `@everyone`).
- `#hidetag <mensaje>` : Notificación oculta para comunicados importantes.

### 🎰 CASINO Y ECONOMÍA
- `#balance` / `#bal` : Consulta tus monedas y estadísticas de juego.
- `#daily` : Reclama tu premio diario de 500 monedas.
- `#work` : Trabaja en misiones del clan para ganar monedas extra.
- `#slot <apuesta>` : Tragamonedas de casino (🎰 💎 7️⃣ 🍒) con premios multiplicadores.
- `#cf <cara/cruz> <apuesta>` : Apuesta en el lanzamiento de moneda cara o cruz.
- `#roulette <rojo/negro/1-36> <apuesta>` : Juega a la ruleta de casino.
- `#rob @usuario` : Intenta robar monedas a un compañero (con riesgo de multa).
- `#pay @usuario <monto>` : Transfiere monedas a otro integrante del clan.
- `#top` : Muestra el ranking de los 10 integrantes más ricos del clan.
- `#ship @usuario1 @usuario2` : Calcula el porcentaje de compatibilidad amorosa entre dos miembros.

### 🎵 REPRODUCTOR DE MÚSICA
- `#play <nombre de canción / artista>` : Busca la canción en YouTube en tiempo real, descarga el audio y lo envía al chat inmediatamente.

---

## ⚙️ NOTAS DE ADMINISTRACIÓN
- Para que el bot pueda **Cerrar (`#close`)**, **Abrir (`#open`)**, **Expulsar (`#kick`)** o **Expulsar por 3 Advertencias (`#warn`)**, es necesario que **el bot tenga permisos de Administrador en el grupo de WhatsApp**.
