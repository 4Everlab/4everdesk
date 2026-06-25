/**
 * 4EverDesk - Signaling Server
 * --------------------------------
 * Cok basit bir WebSocket signaling sunucusu.
 * Her istemciye 9 haneli benzersiz bir ID verir ve
 * iki istemci arasinda WebRTC mesajlarini (offer/answer/candidate) iletir.
 *
 * Calistirma:  node server/server.js   (veya: npm run server)
 * Port:        PORT ortam degiskeni ile degistirilebilir (varsayilan 9000)
 */

const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 9000;

// id -> websocket eslemesi
const clients = new Map();

function generateId() {
  let id;
  do {
    // 100000000 - 999999999 arasi (her zaman 9 haneli)
    id = String(Math.floor(100000000 + Math.random() * 900000000));
  } while (clients.has(id));
  return id;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const id = generateId();
  ws.id = id;
  clients.set(id, ws);

  console.log(`[+] Baglandi: ${id} (toplam: ${clients.size})`);
  send(ws, { type: "registered", id });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Sinyal iletimi: { type:'signal', to:'<id>', data:{...} }
    if (msg.type === "signal" && msg.to) {
      const target = clients.get(String(msg.to));
      if (!target) {
        send(ws, { type: "peer-unavailable", to: msg.to });
        return;
      }
      send(target, { type: "signal", from: id, data: msg.data });
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    console.log(`[-] Ayrildi: ${id} (toplam: ${clients.size})`);
    // Karsi taraflara bilgi vermek istersek burada yayilabilir.
  });

  ws.on("error", () => {});
});

// Basit keep-alive (proxy/timeout durumlari icin)
setInterval(() => {
  for (const ws of clients.values()) {
    if (ws.readyState === ws.OPEN) ws.ping();
  }
}, 30000);

console.log(`4EverDesk signaling sunucusu calisiyor: ws://0.0.0.0:${PORT}`);
