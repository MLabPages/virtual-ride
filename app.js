"use strict";

// ================= シーン定義(scenes.js から共有) =================
const SCENES = window.VR_SCENES;
const STOP_SPEED = window.VR_TUNING.STOP_SPEED;

// ================= 設定(localStorage に保存) =================
const defaultSettings = {
  mPerRev: 4.2,          // ひと漕ぎ(1回転)で進む距離 m
  legMode: "both",       // both: 両足が映る / single: 片足だけ映る
  sensitivity: "mid",
  sceneId: SCENES[0].id,
};
const settings = { ...defaultSettings, ...loadSettings() };

function loadSettings() {
  try { return JSON.parse(localStorage.getItem("virtual-ride:settings")) || {}; }
  catch { return {}; }
}
function saveSettings() {
  localStorage.setItem("virtual-ride:settings", JSON.stringify(settings));
}

// ================= 要素 =================
const $ = (id) => document.getElementById(id);
const sceneVideo = $("sceneVideo");
const pausedOverlay = $("pausedOverlay");
const pausedSub = $("pausedSub");
const speedValue = $("speedValue");
const rpmValue = $("rpmValue");
const distValue = $("distValue");
const timeValue = $("timeValue");
const rateValue = $("rateValue");
const cameraPanel = $("cameraPanel");
const camPreview = $("camPreview");
const motionBar = $("motionBar");
const camStatus = $("camStatus");
const manualSlider = $("manualSlider");
const manualWrap = $("manualWrap");

// ================= 走行状態 =================
let mode = "manual";        // "manual" | "camera"
let targetSpeed = 0;        // 計測から得た速度 km/h
let displaySpeed = 0;       // なめらかに追従する表示用速度
let currentRpm = null;
let distanceM = 0;
let movingSec = 0;
let currentScene = null;

// ================= シーン =================
function buildSceneChips() {
  const wrap = $("sceneChips");
  SCENES.forEach((scene) => {
    const btn = document.createElement("button");
    btn.className = "sceneChip";
    btn.textContent = scene.title;
    btn.dataset.sceneId = scene.id;
    btn.addEventListener("click", () => setScene(scene.id));
    wrap.appendChild(btn);
  });
}

function setScene(sceneId, persist = true) {
  const scene = window.vrSceneById(sceneId);
  currentScene = scene;
  if (persist) { settings.sceneId = scene.id; saveSettings(); }
  document.querySelectorAll(".sceneChip").forEach((el) => {
    el.classList.toggle("active", el.dataset.sceneId === scene.id);
  });
  sceneVideo.src = scene.file;
  sceneVideo.load();
  if (displaySpeed >= STOP_SPEED) sceneVideo.play().catch(() => {});
}

// 映像が最後まで再生されたら、次の景色へ自動で進む(旅モード)
sceneVideo.addEventListener("ended", () => {
  setScene(window.vrNextSceneId(currentScene.id), false);
});

// ================= 計測モード =================
function setMode(newMode) {
  mode = newMode;
  $("modeCameraBtn").classList.toggle("active", mode === "camera");
  $("modeManualBtn").classList.toggle("active", mode === "manual");
  manualWrap.hidden = mode !== "manual";
  cameraPanel.hidden = mode !== "camera";
  if (mode === "camera") {
    startCamera();
    pausedSub.textContent = "ペダル(足元)がカメラに映るようにスマホを置いてください";
  } else {
    stopCamera();
    targetSpeed = Number(manualSlider.value);
    pausedSub.textContent = "下のスライダーで速度を上げると出発します";
  }
}

// ================= カメラによるケイデンス検出 =================
// 仕組み: カメラ映像を粗い白黒画像に縮小し、前のコマとの差(動きの量)を
// 時系列で記録。ペダリングは周期運動なので、自己相関でその周期を求めて
// 回転数(rpm)に換算する。
let camStream = null;
let camTimer = null;
let analyzeTimer = null;
let prevGray = null;
let lastGoodTime = 0;
const motionSamples = [];   // { t: 秒, m: 動き量 }
const SAMPLE_HZ = 30;
const ANA_W = 64, ANA_H = 48;
const anaCanvas = document.createElement("canvas");
anaCanvas.width = ANA_W;
anaCanvas.height = ANA_H;
const anaCtx = anaCanvas.getContext("2d", { willReadFrequently: true });

const SENS = {
  high: { minMotion: 0.8, minCorr: 0.25 },
  mid:  { minMotion: 1.5, minCorr: 0.32 },
  low:  { minMotion: 2.5, minCorr: 0.42 },
};

async function startCamera() {
  if (camStream) return;
  camStatus.textContent = "カメラ準備中…";
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
  } catch (err) {
    camStatus.textContent = "カメラを使えませんでした。ブラウザの許可設定を確認してください。";
    console.error(err);
    return;
  }
  camPreview.srcObject = camStream;
  camPreview.play().catch(() => {});
  camStatus.textContent = "ペダルの動きを探しています…";
  prevGray = null;
  motionSamples.length = 0;
  camTimer = setInterval(sampleMotion, 1000 / SAMPLE_HZ);
  analyzeTimer = setInterval(analyzeCadence, 400);
}

function stopCamera() {
  clearInterval(camTimer);
  clearInterval(analyzeTimer);
  camTimer = analyzeTimer = null;
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  camPreview.srcObject = null;
  currentRpm = null;
}

function sampleMotion() {
  if (!camPreview.videoWidth) return;
  anaCtx.drawImage(camPreview, 0, 0, ANA_W, ANA_H);
  const data = anaCtx.getImageData(0, 0, ANA_W, ANA_H).data;
  const n = ANA_W * ANA_H;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  if (prevGray) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.abs(gray[i] - prevGray[i]);
    const m = sum / n; // 0〜255 スケールの平均差分
    const t = performance.now() / 1000;
    motionSamples.push({ t, m });
    while (motionSamples.length && t - motionSamples[0].t > 6) motionSamples.shift();
    motionBar.style.width = Math.min(100, m * 12) + "%";
  }
  prevGray = gray;
}

function analyzeCadence() {
  const sens = SENS[settings.sensitivity] || SENS.mid;
  if (motionSamples.length < SAMPLE_HZ * 3) return;

  const values = motionSamples.map((s) => s.m);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean < sens.minMotion) {
    camStatus.textContent = "動きが見えません。ペダルが映る位置にスマホを置いてください。";
    return;
  }

  // 平均を引いて自己相関を計算(周期 0.25〜1.6 秒を探す)
  const x = values.map((v) => v - mean);
  const n = x.length;
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += x[i] * x[i];
  if (r0 <= 0) return;

  const minLag = Math.round(0.25 * SAMPLE_HZ);
  const maxLag = Math.min(Math.round(1.6 * SAMPLE_HZ), n - 10);
  let bestLag = -1, bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < n - lag; i++) r += x[i] * x[i + lag];
    r /= r0;
    if (r > bestCorr) { bestCorr = r; bestLag = lag; }
  }

  if (bestLag < 0 || bestCorr < sens.minCorr) {
    camStatus.textContent = "リズムを探しています…(一定のペースで漕いでみてください)";
    return;
  }

  const periodSec = bestLag / SAMPLE_HZ;
  // 両足が映る場合、動きのピークは半回転ごとに来るので 1 回転 = 周期×2
  const revSec = settings.legMode === "both" ? periodSec * 2 : periodSec;
  const rpm = 60 / revSec;
  const kmh = (rpm * settings.mPerRev * 60) / 1000;

  currentRpm = Math.round(rpm);
  targetSpeed = kmh;
  lastGoodTime = performance.now();
  camStatus.textContent = `検出中: ${currentRpm} rpm`;
}

// 漕ぐのをやめたら、惰性で走るようにゆっくり減速させる
setInterval(() => {
  if (mode !== "camera") return;
  if (performance.now() - lastGoodTime > 1500) {
    targetSpeed *= 0.93;
    if (targetSpeed < 0.5) targetSpeed = 0;
    if (targetSpeed === 0) currentRpm = null;
  }
}, 200);

// ================= メインループ =================
let lastTick = performance.now();
function tick(now) {
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;

  // 表示速度をなめらかに追従させる
  const k = 1 - Math.exp(-dt / 0.6);
  displaySpeed += (targetSpeed - displaySpeed) * k;
  if (displaySpeed < 0.05 && targetSpeed === 0) displaySpeed = 0;

  // 再生速度に反映
  if (currentScene) {
    if (displaySpeed >= STOP_SPEED) {
      const rate = window.vrRateFor(displaySpeed, currentScene.baseSpeed);
      if (Math.abs(sceneVideo.playbackRate - rate) > 0.02) sceneVideo.playbackRate = rate;
      if (sceneVideo.paused) sceneVideo.play().catch(() => {});
      pausedOverlay.classList.add("hidden");
      rateValue.textContent = rate.toFixed(1);
    } else {
      if (!sceneVideo.paused) sceneVideo.pause();
      pausedOverlay.classList.remove("hidden");
      rateValue.textContent = "0.0";
    }
  }

  // 走行記録
  if (displaySpeed >= STOP_SPEED) {
    distanceM += (displaySpeed / 3.6) * dt;
    movingSec += dt;
  }

  speedValue.textContent = displaySpeed.toFixed(1);
  rpmValue.textContent = mode === "camera" && currentRpm ? currentRpm : "–";
  distValue.textContent = (distanceM / 1000).toFixed(2);
  const min = Math.floor(movingSec / 60);
  const sec = Math.floor(movingSec % 60);
  timeValue.textContent = `${min}:${String(sec).padStart(2, "0")}`;

  // Quest へ速度を送信(約8Hz)
  if (questLink && questLink.connected && now - lastSentAt > 120) {
    lastSentAt = now;
    questLink.send({
      speed: Number(displaySpeed.toFixed(2)),
      rpm: currentRpm || null,
      sceneId: currentScene ? currentScene.id : null,
    });
  }

  requestAnimationFrame(tick);
}

// ================= 画面を消灯させない =================
let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestWakeLock();
});

// ================= UI イベント =================
$("modeCameraBtn").addEventListener("click", () => { setMode("camera"); requestWakeLock(); });
$("modeManualBtn").addEventListener("click", () => setMode("manual"));
manualSlider.addEventListener("input", () => {
  if (mode === "manual") targetSpeed = Number(manualSlider.value);
  requestWakeLock();
});
$("resetBtn").addEventListener("click", () => { distanceM = 0; movingSec = 0; });
$("fullscreenBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

// 設定ダイアログ
const settingsDialog = $("settingsDialog");
$("settingsBtn").addEventListener("click", () => {
  $("mPerRevInput").value = settings.mPerRev;
  $("legModeSelect").value = settings.legMode;
  $("sensitivitySelect").value = settings.sensitivity;
  settingsDialog.showModal();
});
settingsDialog.addEventListener("close", () => {
  settings.mPerRev = Math.min(8, Math.max(2, Number($("mPerRevInput").value) || defaultSettings.mPerRev));
  settings.legMode = $("legModeSelect").value;
  settings.sensitivity = $("sensitivitySelect").value;
  saveSettings();
});
$("creditLink").addEventListener("click", (e) => {
  e.preventDefault();
  const list = $("creditList");
  if (list.hidden) {
    list.innerHTML = SCENES.map(
      (s) => `${s.title}: <a href="${s.credit}" target="_blank" rel="noopener">${s.credit}</a>`
    ).join("<br>");
  }
  list.hidden = !list.hidden;
});

// ================= Quest へ送信(ペア接続) =================
let questLink = null;
let lastSentAt = 0;
const questDialog = $("questDialog");
const questCodeInput = $("questCodeInput");
const questStatus = $("questStatus");
const questConnectBtn = $("questConnectBtn");
const questBadge = $("questBadge");

$("questBtn").addEventListener("click", () => {
  questCodeInput.value = "";
  questStatus.textContent = "Quest の画面に出ている4桁コードを入力してください";
  questDialog.showModal();
  setTimeout(() => questCodeInput.focus(), 100);
});

questConnectBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const code = (questCodeInput.value || "").trim();
  if (!/^\d{4}$/.test(code)) {
    questStatus.textContent = "4桁の数字を入力してください";
    return;
  }
  if (questLink) { try { questLink.peer.destroy(); } catch (_) {} questLink = null; }
  questStatus.textContent = "接続中…";
  try {
    questLink = window.VRLink.join(code, {
      onOpen: () => {
        questStatus.textContent = "つながりました。この画面のまま漕いでください。";
        questBadge.hidden = false;
        requestWakeLock();
        setTimeout(() => { if (questDialog.open) questDialog.close(); }, 900);
      },
      onStatus: (s, info) => {
        if (s === "disconnected") { questStatus.textContent = "切断されました"; questBadge.hidden = true; }
        else if (s === "error") { questStatus.textContent = "接続エラー: " + (info || "") + "(コードとネットワークを確認)"; }
      },
    });
  } catch (err) {
    questStatus.textContent = err.message || "接続に失敗しました";
  }
});

$("questDisconnect").addEventListener("click", () => {
  if (questLink) { try { questLink.peer.destroy(); } catch (_) {} questLink = null; }
  questBadge.hidden = true;
});

// ================= 起動 =================
buildSceneChips();
setScene(settings.sceneId);
setMode("manual");
requestAnimationFrame(tick);
