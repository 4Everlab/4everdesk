/**
 * 4EverDesk - Renderer (arayuz + WebRTC mantigi)
 * ----------------------------------------------
 * Roller:
 *  - CONTROLLER (kontrol eden): karsi tarafin ID'sine baglanir,
 *    onun ekranini izler, fare/klavye olaylarini gonderir.
 *  - HOST (kontrol edilen): gelen istegi kabul eder, ekranini paylasir,
 *    gelen girdiyi sisteme uygular.
 *
 * Tek negotiation akisi:
 *  Controller  -> offer (recvonly video + 'input' datachannel) -> Host
 *  Host        -> ekrani yakalar, track ekler -> answer -> Controller
 */

const cfg = window.DESK_CONFIG;
const LS_URL_KEY = "desk_signaling_url";

/* ----------------------- DOM ----------------------- */
const $ = (id) => document.getElementById(id);
const screens = {
  home: $("home"),
  incoming: $("incoming"),
  serving: $("serving"),
  remote: $("remote"),
  settings: $("settings"),
};
function show(name) {
  // settings bir overlay; digerleri tam ekran
  ["home", "incoming", "serving", "remote"].forEach((s) => screens[s].classList.add("hidden"));
  if (screens[name]) screens[name].classList.remove("hidden");
}

/* ----------------------- Toast ----------------------- */
function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

/* ----------------------- Durum ----------------------- */
let ws = null;
let myId = null;
let pc = null;
let inputChannel = null;
let peerId = null;
let role = null; // 'controller' | 'host'
let pendingCandidates = [];
let remoteDescSet = false;

function signalingUrl() {
  return localStorage.getItem(LS_URL_KEY) || cfg.SIGNALING_URL;
}

/* ----------------------- Signaling ----------------------- */
function setConnState(state) {
  const dot = $("conn-dot");
  const text = $("conn-text");
  dot.classList.remove("online", "offline");
  if (state === "online") { dot.classList.add("online"); text.textContent = "Çevrimiçi"; }
  else if (state === "offline") { dot.classList.add("offline"); text.textContent = "Bağlantı yok"; }
  else { text.textContent = "Bağlanıyor..."; }
}

let reconnectTimer = null;
function connectSignaling() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  setConnState("connecting");
  try { if (ws) ws.close(); } catch {}
  ws = new WebSocket(signalingUrl());

  ws.onopen = () => setConnState("online");
  ws.onclose = () => {
    setConnState("offline");
    reconnectTimer = setTimeout(connectSignaling, 3000);
  };
  ws.onerror = () => setConnState("offline");
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleSignal(msg);
  };
}

function sendSignal(to, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "signal", to, data }));
  }
}

async function handleSignal(msg) {
  if (msg.type === "registered") {
    myId = msg.id;
    $("my-id").textContent = formatId(myId);
    return;
  }
  if (msg.type === "peer-unavailable") {
    toast("Bu kimlik çevrimiçi değil veya bulunamadı.", "error");
    resetConnection();
    show("home");
    return;
  }
  if (msg.type === "signal") {
    const { from, data } = msg;
    switch (data.kind) {
      case "offer": await onOffer(from, data.sdp); break;
      case "answer": await onAnswer(data.sdp); break;
      case "candidate": await onCandidate(data.candidate); break;
      case "rejected":
        toast("Bağlantı reddedildi.", "error");
        resetConnection(); show("home"); break;
      case "bye": endSession("Karşı taraf bağlantıyı kesti."); break;
    }
  }
}

/* ----------------------- WebRTC ortak ----------------------- */
function createPeer() {
  pc = new RTCPeerConnection({ iceServers: cfg.ICE_SERVERS });
  pendingCandidates = [];
  remoteDescSet = false;

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(peerId, { kind: "candidate", candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (role === "controller") $("remote-stat").textContent = stateLabel(st);
    if (st === "connected" && role === "controller") $("remote-loading").classList.add("hidden");
    if (st === "failed") endSession("Bağlantı kurulamadı.");
  };
  return pc;
}

function stateLabel(s) {
  return { connecting: "Bağlanıyor...", connected: "Bağlı", failed: "Başarısız", disconnected: "Koptu", closed: "Kapalı" }[s] || s;
}

async function flushCandidates() {
  for (const c of pendingCandidates) { try { await pc.addIceCandidate(c); } catch {} }
  pendingCandidates = [];
}
async function onCandidate(candidate) {
  if (!pc) return;
  if (remoteDescSet) { try { await pc.addIceCandidate(candidate); } catch {} }
  else pendingCandidates.push(candidate);
}

/* ----------------------- CONTROLLER ----------------------- */
async function startControl(targetId) {
  role = "controller";
  peerId = targetId;
  createPeer();
  pc.addTransceiver("video", { direction: "recvonly" });

  inputChannel = pc.createDataChannel("input");
  inputChannel.onopen = () => { $("remote-stat").textContent = "Bağlı"; };

  pc.ontrack = (e) => {
    $("remote-video").srcObject = e.streams[0];
    $("remote-loading").classList.add("hidden");
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal(peerId, { kind: "offer", sdp: pc.localDescription });

  $("remote-id").textContent = formatId(peerId);
  $("remote-stat").textContent = "Bağlanıyor...";
  $("remote-loading").classList.remove("hidden");
  show("remote");
  attachInputCapture();
}
async function onAnswer(sdp) {
  if (!pc) return;
  await pc.setRemoteDescription(sdp);
  remoteDescSet = true;
  await flushCandidates();
}

/* ----------------------- HOST ----------------------- */
let incomingFrom = null;
let incomingOffer = null;

async function onOffer(from, sdp) {
  if (pc) { sendSignal(from, { kind: "rejected" }); return; }
  incomingFrom = from;
  incomingOffer = sdp;
  $("incoming-id").textContent = formatId(from);
  show("incoming");
}

async function acceptIncoming() {
  role = "host";
  peerId = incomingFrom;
  createPeer();

  pc.ondatachannel = (e) => {
    if (e.channel.label === "input") e.channel.onmessage = (m) => applyInput(m.data);
  };

  let stream;
  try {
    const source = await window.desk.getScreenSource();
    if (!source) throw new Error("Ekran kaynağı bulunamadı");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: source.id,
          maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30,
        },
      },
    });
  } catch (err) {
    toast("Ekran yakalanamadı: " + err.message, "error");
    sendSignal(peerId, { kind: "rejected" });
    resetConnection(); show("home");
    return;
  }

  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  await pc.setRemoteDescription(incomingOffer);
  remoteDescSet = true;
  await flushCandidates();

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal(peerId, { kind: "answer", sdp: pc.localDescription });

  $("serving-id").textContent = formatId(peerId);
  show("serving");
  incomingFrom = null; incomingOffer = null;
}

function rejectIncoming() {
  if (incomingFrom) sendSignal(incomingFrom, { kind: "rejected" });
  incomingFrom = null; incomingOffer = null;
  show("home");
}

/* ----------------------- HOST: girdi uygulama ----------------------- */
function applyInput(raw) {
  let ev;
  try { ev = JSON.parse(raw); } catch { return; }
  window.desk.injectInput(ev);
}

/* ----------------------- CONTROLLER: girdi yakalama ----------------------- */
function attachInputCapture() {
  const video = $("remote-video");
  const send = (obj) => {
    if (inputChannel && inputChannel.readyState === "open") inputChannel.send(JSON.stringify(obj));
  };
  const norm = (e) => {
    const r = video.getBoundingClientRect();
    const vw = video.videoWidth || r.width;
    const vh = video.videoHeight || r.height;
    const scale = Math.min(r.width / vw, r.height / vh);
    const dispW = vw * scale, dispH = vh * scale;
    const offX = (r.width - dispW) / 2, offY = (r.height - dispH) / 2;
    let x = (e.clientX - r.left - offX) / dispW;
    let y = (e.clientY - r.top - offY) / dispH;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };
  video.onmousemove = (e) => { const p = norm(e); send({ t: "mm", x: p.x, y: p.y }); };
  video.onmousedown = (e) => { e.preventDefault(); const p = norm(e); send({ t: "mm", x: p.x, y: p.y }); send({ t: "md", b: e.button }); };
  video.onmouseup = (e) => { e.preventDefault(); send({ t: "mu", b: e.button }); };
  video.oncontextmenu = (e) => e.preventDefault();
  video.onwheel = (e) => { e.preventDefault(); send({ t: "sc", dx: e.deltaX, dy: e.deltaY }); };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
}
function detachInputCapture() {
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  const video = $("remote-video");
  video.onmousemove = video.onmousedown = video.onmouseup = video.onwheel = video.oncontextmenu = null;
}
function onKeyDown(e) {
  if (role !== "controller") return;
  e.preventDefault();
  if (inputChannel && inputChannel.readyState === "open") inputChannel.send(JSON.stringify({ t: "kd", code: e.code }));
}
function onKeyUp(e) {
  if (role !== "controller") return;
  e.preventDefault();
  if (inputChannel && inputChannel.readyState === "open") inputChannel.send(JSON.stringify({ t: "ku", code: e.code }));
}

/* ----------------------- Oturum sonlandirma ----------------------- */
function resetConnection() {
  if (inputChannel) { try { inputChannel.close(); } catch {} inputChannel = null; }
  if (pc) { try { pc.close(); } catch {} pc = null; }
  detachInputCapture();
  const video = $("remote-video");
  if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  role = null; peerId = null; remoteDescSet = false; pendingCandidates = [];
}
function endSession(reason) {
  if (peerId) sendSignal(peerId, { kind: "bye" });
  resetConnection();
  show("home");
  if (reason) toast(reason);
}

/* ----------------------- Yardimcilar ----------------------- */
function formatId(id) {
  if (!id) return "— — —";
  return String(id).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

/* ----------------------- Olay baglama ----------------------- */
$("connect-btn").addEventListener("click", () => {
  const val = $("peer-id").value.replace(/\D/g, "");
  if (val.length !== 9) return toast("9 haneli bir kimlik gir.", "error");
  if (val === myId) return toast("Kendine bağlanamazsın.", "error");
  if (!ws || ws.readyState !== WebSocket.OPEN) return toast("Sunucuya bağlanılamıyor.", "error");
  startControl(val);
});
$("peer-id").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 9);
  e.target.value = v.replace(/(\d{3})(\d{0,3})(\d{0,3})/, (m, a, b, c) => [a, b, c].filter(Boolean).join(" "));
});
$("peer-id").addEventListener("keydown", (e) => { if (e.key === "Enter") $("connect-btn").click(); });

$("copy-id").addEventListener("click", async () => {
  if (!myId) return;
  try {
    await navigator.clipboard.writeText(myId);
    $("copy-label").textContent = "Kopyalandı!";
    setTimeout(() => ($("copy-label").textContent = "Kimliği kopyala"), 1500);
  } catch { toast("Kopyalanamadı.", "error"); }
});

$("accept-btn").addEventListener("click", acceptIncoming);
$("reject-btn").addEventListener("click", rejectIncoming);
$("disconnect-btn").addEventListener("click", () => endSession());
$("stop-serving").addEventListener("click", () => endSession());

$("fullscreen-btn").addEventListener("click", () => {
  const wrap = document.querySelector(".video-wrap");
  if (!document.fullscreenElement) wrap.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
});

/* ----------------------- Ayarlar ----------------------- */
$("open-settings").addEventListener("click", () => {
  $("server-url").value = localStorage.getItem(LS_URL_KEY) || "";
  screens.settings.classList.remove("hidden");
});
$("settings-cancel").addEventListener("click", () => screens.settings.classList.add("hidden"));
$("settings-save").addEventListener("click", () => {
  const url = $("server-url").value.trim();
  if (url) localStorage.setItem(LS_URL_KEY, url);
  else localStorage.removeItem(LS_URL_KEY);
  screens.settings.classList.add("hidden");
  toast("Ayarlar kaydedildi, yeniden bağlanılıyor.", "success");
  connectSignaling();
});

/* ----------------------- Otomatik guncelleme ----------------------- */
if (window.desk && window.desk.onUpdate) {
  window.desk.onUpdate((evt) => {
    const bar = $("update-bar");
    const text = $("update-text");
    const action = $("update-action");
    if (evt.status === "available") {
      bar.classList.remove("hidden");
      text.textContent = "Yeni sürüm indiriliyor...";
      action.classList.add("hidden");
    } else if (evt.status === "downloaded") {
      bar.classList.remove("hidden");
      text.textContent = "Güncelleme hazır!";
      action.classList.remove("hidden");
    } else if (evt.status === "error") {
      bar.classList.add("hidden");
    }
  });
  $("update-action").addEventListener("click", () => window.desk.installUpdate());
}

/* ----------------------- Surum bilgisi ----------------------- */
if (window.desk && window.desk.getVersion) {
  window.desk.getVersion().then((v) => { if (v) $("app-version").textContent = "v" + v; });
}

/* ----------------------- Baslat ----------------------- */
show("home");
connectSignaling();
