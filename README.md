<div align="center">

# 4EverDesk

**Basit, hızlı uzaktan masaüstü.** 9 haneli bir kimlik (ID) ile karşı bilgisayara bağlan, ekranını gör ve **fare/klavye ile tam kontrol** et.

[İndir](https://4everlabs.com/4everdesk) · [4Ever Labs](https://4everlabs.com)

</div>

---

## Nasıl çalışır?

```
[Kontrol eden]  ── WebRTC ekran akışı + girdi ──▶  [Kontrol edilen]
        \                                              /
         \────  Signaling sunucusu (9 haneli ID)  ────/
```

- **WebRTC** ile ekran canlı olarak P2P (uçtan uca) aktarılır.
- **DataChannel** ile fare/klavye olayları gönderilir.
- **nut.js** karşı bilgisayarda bu olayları gerçek sisteme uygular.
- **Signaling sunucusu** yalnızca iki tarafı 9 haneli ID üzerinden buluşturur.

## Kullanıcı için

1. [4everlabs.com/4everdesk](https://4everlabs.com/4everdesk) adresinden Windows (`.exe`) veya macOS (`.dmg`) kurulumunu indir.
2. Uygulamayı aç → sana **9 haneli bir kimlik** verilir.
3. Kontrol etmek istediğin bilgisayarın kimliğini gir → **Bağlan**.
4. Karşı taraf **Kabul Et** dediğinde ekranı görür ve kontrol edersin.

> macOS'ta ilk kullanımda **Sistem Ayarları → Gizlilik ve Güvenlik** altından
> *Ekran Kaydı* ve *Erişilebilirlik* izinlerini vermen gerekir.

## Geliştirme

```bash
npm install        # bağımlılıklar + nut.js'in Electron için yeniden derlenmesi
npm run server     # signaling sunucusu (ws://localhost:9000)
npm start          # uygulama
```

Yerel test için uygulama içi **Ayarlar**'dan sunucu adresini `ws://localhost:9000` yapabilirsin.

## Build (kurulum dosyası üretme)

```bash
npm run dist:win   # Windows  -> release/4EverDesk-Setup-<sürüm>.exe
npm run dist:mac   # macOS    -> release/4EverDesk-<sürüm>-<arch>.dmg  (yalnızca macOS'ta)
```

> macOS kurulumu yalnızca bir Mac'te veya CI'da (GitHub Actions) üretilebilir.

## Sürüm yayınlama (otomatik)

1. `package.json` içindeki `version` değerini yükselt (örn. `1.0.1`).
2. Etiketle ve push'la:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. [GitHub Actions](.github/workflows/release.yml) hem **macOS** hem **Windows** kurulumlarını
   üretip **GitHub Releases**'e yükler. Yüklü uygulamalar bu release'i görüp
   **otomatik güncellenir** (electron-updater).

### İmzalama secret'ları (GitHub repo → Settings → Secrets)

| Secret | Açıklama |
|--------|----------|
| `WIN_CSC_LINK` | Windows code-signing `.pfx` sertifikası (base64) |
| `WIN_CSC_KEY_PASSWORD` | `.pfx` parolası |
| `MAC_CSC_LINK` | Apple `Developer ID Application` `.p12` (base64) |
| `MAC_CSC_KEY_PASSWORD` | `.p12` parolası |
| `APPLE_ID` | Apple ID e-postası (notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | Uygulamaya özel parola |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

> Secret'lar tanımlı değilse build **imzasız** üretilir (çalışır ama kullanıcı
> SmartScreen/Gatekeeper uyarısı görür; macOS oto-güncelleme imza ister).
>
> `.pfx`/`.p12` dosyasını base64'e çevirmek için:
> `base64 -w0 cert.pfx` (Linux/mac) veya
> `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))` (PowerShell).

## Signaling sunucusunu deploy etme

İnternet üzerinden çalışması için `server/server.js` bir sunucuda (TLS ile) çalışmalı.
Varsayılan adres `wss://signal.4everlabs.com` ([renderer/config.js](renderer/config.js)).

```bash
# sunucuda
PORT=9000 node server/server.js
# önüne TLS sonlandıran bir reverse proxy (Nginx/Caddy) koy -> wss://
```

Zor ağlarda (çift NAT) bağlantı kurulamazsa `config.js` içindeki `ICE_SERVERS`
listesine bir **TURN** sunucusu eklemen gerekebilir.

## Dosya yapısı

| Dosya | Görev |
|-------|-------|
| `main.js` | Electron ana süreç: ekran kaynağı, nut.js girdi enjeksiyonu, oto-güncelleme |
| `preload.js` | Renderer ↔ ana süreç güvenli köprü |
| `keymap.js` | Tarayıcı tuş kodları → nut.js tuşları |
| `renderer/` | Arayüz + WebRTC mantığı |
| `server/server.js` | 9 haneli ID veren WebSocket signaling sunucusu |
| `.github/workflows/release.yml` | mac + Windows build & release otomasyonu |

## Güvenlik

- Bağlantı her zaman karşı tarafın **onayı** ile başlar (Kabul Et / Reddet).
- Bu sürüm sade tutulmuştur: kalıcı şifre, dosya transferi, çoklu ekran seçimi yoktur.

## Lisans

[MIT](LICENSE) © 4Ever Labs
