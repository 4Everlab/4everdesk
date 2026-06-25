/**
 * 4EverDesk - Yapilandirma
 *
 * SIGNALING_URL: signaling sunucusunun adresi.
 *  - Uretim (varsayilan):  wss://4everlabs.com/signal
 *    -> 4EverLabs web sitesine entegre (Next.js ozel sunucu + WebSocket).
 *  - Yerel test:           ws://localhost:9000
 *    -> server/server.js calistir, Ayarlar'dan adresi gecici degistir.
 *
 * Not: Kullanici Ayarlar ekranindan girdigi adres bu varsayilani gecersiz kilar
 *      (localStorage'da saklanir).
 */
window.DESK_CONFIG = {
  SIGNALING_URL: "wss://4everlabs.com/signal",

  // WebRTC ICE sunuculari (NAT gecisi icin).
  // Ucretsiz STUN cogu durumda yeterli; zor aglarda TURN gerekebilir.
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
