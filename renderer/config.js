/**
 * 4EverDesk - Yapilandirma
 *
 * SIGNALING_URL: signaling sunucusunun adresi.
 *  - Uretim (varsayilan):  wss://signal.4everlabs.com
 *    -> server/server.js dosyasini bu adrese (TLS ile) deploy etmelisin.
 *  - Yerel test:           ws://localhost:9000
 *    -> Uygulama icindeki Ayarlar'dan da gecici olarak degistirebilirsin.
 *
 * Not: Kullanici Ayarlar ekranindan girdigi adres bu varsayilani gecersiz kilar
 *      (localStorage'da saklanir).
 */
window.DESK_CONFIG = {
  SIGNALING_URL: "wss://signal.4everlabs.com",

  // WebRTC ICE sunuculari (NAT gecisi icin).
  // Ucretsiz STUN cogu durumda yeterli; zor aglarda TURN gerekebilir.
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
