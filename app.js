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
  manualSpeed: 18,
  autoHideControls: true,
  windSound: false,
};
const settings = normalizeSettings({ ...defaultSettings, ...loadSettings() });

function normalizeSettings(value) {
  const normalized = { ...value };
  normalized.mPerRev = Math.min(8, Math.max(2, Number(normalized.mPerRev) || defaultSettings.mPerRev));
  normalized.legMode = ["both", "single"].includes(normalized.legMode) ? normalized.legMode : defaultSettings.legMode;
  normalized.sensitivity = ["high", "mid", "low"].includes(normalized.sensitivity)
    ? normalized.sensitivity
    : defaultSettings.sensitivity;
  normalized.sceneId = SCENES.some((scene) => scene.id === normalized.sceneId)
    ? normalized.sceneId
    : defaultSettings.sceneId;
  normalized.manualSpeed = Math.min(40, Math.max(1, Number(normalized.manualSpeed) || defaultSettings.manualSpeed));
  normalized.autoHideControls = normalized.autoHideControls !== false;
  normalized.windSound = normalized.windSound === true;
  return normalized;
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem("virtual-ride:settings")) || {}; }
  catch { return {}; }
}
function saveSettings() {
  try { localStorage.setItem("virtual-ride:settings", JSON.stringify(settings)); } catch (_) {}
}

// ================= 要素 =================
const $ = (id) => document.getElementById(id);
const stage = $("stage");
const sceneVideo = $("sceneVideo");
const sceneFade = $("sceneFade");
sceneVideo.crossOrigin = "anonymous";
sceneVideo.muted = true; // 明示的にミュート状態を設定(自動再生ポリシー対策)
const pausedOverlay = $("pausedOverlay");
const pausedSub = $("pausedSub");
const speedValue = $("speedValue");
const rpmValue = $("rpmValue");
const distValue = $("distValue");
const timeValue = $("timeValue");
const rateValue = $("rateValue");
const sceneTitle = $("sceneTitle");
const routePercent = $("routePercent");
const routeProgress = $("routeProgress");
const routeTrack = $("routeTrack");
const nextScene = $("nextScene");
const routeEta = $("routeEta");
const cameraPanel = $("cameraPanel");
const camPreview = $("camPreview");
const motionBar = $("motionBar");
const camStatus = $("camStatus");
const cameraAnnouncement = $("cameraAnnouncement");
const manualSlider = $("manualSlider");
const manualSpeedOutput = $("manualSpeedOutput");
const manualWrap = $("manualWrap");
const quickStartBtn = $("quickStartBtn");
const rideToast = $("rideToast");

// ================= 走行状態 =================
const SESSION_KEY = "virtual-ride:session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const restoredSession = loadSession();
let mode = "manual";        // "manual" | "camera"
let targetSpeed = 0;        // 計測から得た速度 km/h
let displaySpeed = 0;       // なめらかに追従する表示用速度
let currentRpm = null;
let distanceM = restoredSession?.distanceM || 0;
let movingSec = restoredSession?.movingSec || 0;
let maxSpeed = restoredSession?.maxSpeed || 0;
let routeLaps = restoredSession?.routeLaps || 0;
let currentScene = null;
let rideWasMoving = false;
let pendingResumeTime = restoredSession?.sceneTime || 0;
let resumeSceneId = restoredSession?.sceneId || null;
let lastSessionSavedAt = 0;

function loadSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!value || Date.now() - Number(value.updatedAt) > SESSION_MAX_AGE_MS) return null;
    return {
      distanceM: Math.max(0, Number(value.distanceM) || 0),
      movingSec: Math.max(0, Number(value.movingSec) || 0),
      maxSpeed: Math.min(40, Math.max(0, Number(value.maxSpeed) || 0)),
      routeLaps: Math.max(0, Math.floor(Number(value.routeLaps) || 0)),
      sceneId: SCENES.some((scene) => scene.id === value.sceneId) ? value.sceneId : null,
      sceneTime: Math.max(0, Number(value.sceneTime) || 0),
    };
  } catch (_) {
    return null;
  }
}

function saveSession(force = false) {
  const now = Date.now();
  if (!force && now - lastSessionSavedAt < 2000) return;
  lastSessionSavedAt = now;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      distanceM,
      movingSec,
      maxSpeed,
      routeLaps,
      sceneId: pendingSceneId || currentScene?.id || settings.sceneId,
      sceneTime: pendingSceneId ? 0 : (Number.isFinite(sceneVideo.currentTime) ? sceneVideo.currentTime : 0),
      updatedAt: now,
    }));
  } catch (_) {}
}

let toastTimer = null;
function showToast(message, duration = 2800, kind = "info") {
  clearTimeout(toastTimer);
  rideToast.textContent = message;
  rideToast.dataset.kind = kind;
  if (duration > 0) toastTimer = setTimeout(hideToast, duration);
}
function hideToast() {
  clearTimeout(toastTimer);
  rideToast.textContent = "";
  rideToast.dataset.kind = "";
}

// ================= シーン =================
function buildSceneChips() {
  const wrap = $("sceneChips");
  SCENES.filter((scene) => scene.chip !== false).forEach((scene) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sceneChip";
    btn.textContent = scene.title;
    btn.dataset.sceneId = scene.id;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", `${scene.title}から走る`);
    btn.addEventListener("click", () => setScene(scene.id, true, true));
    wrap.appendChild(btn);
  });
}

let sceneTransitionTimer = null;
let pendingSceneId = null;
let sceneLoadToken = 0;
let handledFailureToken = -1;
let sceneLoadTimer = null;
let waitingToastTimer = null;
let allScenesUnavailable = false;
const failedScenes = new Map();
const nextPreloader = document.createElement("video");
nextPreloader.muted = true;
nextPreloader.preload = "metadata";
nextPreloader.crossOrigin = "anonymous";

function updateSceneChips(sceneId) {
  const activeChipId = window.vrChapterSceneId(sceneId);
  document.querySelectorAll(".sceneChip").forEach((el) => {
    const active = el.dataset.sceneId === activeChipId;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
}

function preloadNextScene() {
  if (!currentScene || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || "")) return;
  const next = window.vrSceneById(window.vrNextSceneId(currentScene.id));
  if (nextPreloader.dataset.sceneId === next.id) return;
  nextPreloader.dataset.sceneId = next.id;
  nextPreloader.src = next.file;
  nextPreloader.load();
}

function applyScene(sceneId, persist = true) {
  const scene = window.vrSceneById(sceneId);
  sceneLoadToken += 1;
  const loadToken = sceneLoadToken;
  pendingSceneId = null;
  currentScene = scene;
  if (persist) { settings.sceneId = scene.id; saveSettings(); }
  updateSceneChips(scene.id);
  sceneTitle.textContent = scene.title;
  window.vrApplySceneFraming(sceneVideo, scene);
  sceneVideo.src = scene.file;
  sceneVideo.load();
  clearTimeout(sceneLoadTimer);
  sceneLoadTimer = setTimeout(() => {
    if (sceneLoadToken === loadToken && sceneVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      handleSceneFailure("timeout");
    }
  }, 12000);
  if (resumeSceneId === scene.id && pendingResumeTime > 0) {
    const resumeAtSavedTime = () => {
      if (currentScene?.id === scene.id && Number.isFinite(sceneVideo.duration)) {
        sceneVideo.currentTime = Math.min(pendingResumeTime, Math.max(0, sceneVideo.duration - 0.25));
      }
      pendingResumeTime = 0;
      resumeSceneId = null;
    };
    sceneVideo.addEventListener("loadedmetadata", resumeAtSavedTime, { once: true });
  }
  sceneVideo.dataset.playPending = "";
  if (displaySpeed >= STOP_SPEED) {
    sceneVideo.dataset.playPending = "true";
    sceneVideo.play()
      .then(() => { sceneVideo.dataset.playPending = ""; })
      .catch((err) => {
        sceneVideo.dataset.playPending = "";
        console.warn("Playback failed after load:", err);
      });
  }
}

function setScene(sceneId, persist = true, transition = false) {
  const scene = window.vrSceneById(sceneId);
  if (currentScene?.id === scene.id) {
    if (pendingSceneId && pendingSceneId !== scene.id) {
      clearTimeout(sceneTransitionTimer);
      pendingSceneId = null;
      if (sceneFade) sceneFade.classList.remove("visible");
    }
    return;
  }
  if (pendingSceneId === scene.id) return;
  if (transition && currentScene && sceneFade) {
    pendingSceneId = scene.id;
    sceneFade.classList.add("visible");
    clearTimeout(sceneTransitionTimer);
    sceneTransitionTimer = setTimeout(() => {
      applyScene(scene.id, persist);
      requestAnimationFrame(() => sceneFade.classList.remove("visible"));
    }, 260);
    return;
  }
  applyScene(scene.id, persist);
  if (sceneFade) sceneFade.classList.remove("visible");
}

function cueSceneFade() {
  if (!sceneFade || !currentScene || !Number.isFinite(sceneVideo.duration)) return;
  const remaining = sceneVideo.duration - sceneVideo.currentTime;
  if (remaining > 0 && remaining < 0.75 && displaySpeed >= STOP_SPEED) {
    sceneFade.classList.add("visible");
  }
}
sceneVideo.addEventListener("timeupdate", cueSceneFade);

// 映像が最後まで再生されたら、次の景色へ自動で進む(旅モード)
sceneVideo.addEventListener("ended", () => {
  const nextId = window.vrNextSceneId(currentScene.id);
  if (nextId === SCENES[0].id) {
    routeLaps += 1;
    showToast(`ルート完走！ ${routeLaps + 1}周目へ`, 4200);
  }
  setScene(nextId, false, true);
  saveSession(true);
});

function handleSceneFailure() {
  if (!currentScene || handledFailureToken === sceneLoadToken) return;
  handledFailureToken = sceneLoadToken;
  clearTimeout(sceneLoadTimer);
  failedScenes.set(currentScene.id, Date.now());
  const now = Date.now();
  let candidateId = currentScene.id;
  for (let i = 0; i < SCENES.length; i++) {
    candidateId = window.vrNextSceneId(candidateId);
    const failedAt = failedScenes.get(candidateId) || 0;
    if (now - failedAt > 60000) {
      showToast("別の景色へ切り替えています…", 2200, "media");
      setScene(candidateId, false, true);
      return;
    }
  }
  allScenesUnavailable = true;
  targetSpeed = 0;
  showToast("景観動画を読み込めません。通信を確認し、画面をタップして再試行してください。", 0, "media");
}

function retryRideMedia() {
  if (!allScenesUnavailable) return;
  allScenesUnavailable = false;
  failedScenes.clear();
  handledFailureToken = -1;
  hideToast();
  applyScene(currentScene?.id || SCENES[0].id, false);
}

sceneVideo.addEventListener("error", handleSceneFailure);
sceneVideo.addEventListener("canplay", () => {
  clearTimeout(sceneLoadTimer);
  failedScenes.delete(currentScene?.id);
  preloadNextScene();
});
sceneVideo.addEventListener("waiting", () => {
  clearTimeout(waitingToastTimer);
  waitingToastTimer = setTimeout(() => {
    if (displaySpeed >= STOP_SPEED) showToast("景色を読み込み中…", 0, "media");
  }, 700);
});
sceneVideo.addEventListener("playing", () => {
  clearTimeout(waitingToastTimer);
  if (rideToast.dataset.kind === "media" && !allScenesUnavailable) hideToast();
});
window.addEventListener("online", retryRideMedia);

// ================= 計測モード =================
function setManualSpeed(value, remember = true) {
  const speed = Math.min(40, Math.max(0, Number(value) || 0));
  manualSlider.value = String(speed);
  manualSpeedOutput.textContent = Number.isInteger(speed) ? String(speed) : speed.toFixed(1);
  manualSlider.setAttribute("aria-valuetext", `${speed} km/h`);
  if (mode === "manual") targetSpeed = speed;
  if (remember && speed >= STOP_SPEED) {
    settings.manualSpeed = speed;
    saveSettings();
  }
}

function toggleManualRide() {
  if (mode !== "manual") setMode("manual");
  const shouldStop = targetSpeed >= STOP_SPEED || displaySpeed >= STOP_SPEED;
  setManualSpeed(shouldStop ? 0 : settings.manualSpeed, false);
  if (!shouldStop) {
    requestWakeLock();
    if (settings.windSound) ensureWindAudio();
  }
}

function setMode(newMode) {
  mode = newMode;
  const cameraActive = mode === "camera";
  stage.classList.toggle("cameraMode", cameraActive);
  $("modeCameraBtn").classList.toggle("active", cameraActive);
  $("modeManualBtn").classList.toggle("active", !cameraActive);
  $("modeCameraBtn").setAttribute("aria-pressed", String(cameraActive));
  $("modeManualBtn").setAttribute("aria-pressed", String(!cameraActive));
  manualWrap.hidden = mode !== "manual";
  cameraPanel.hidden = mode !== "camera";
  quickStartBtn.hidden = mode !== "manual";
  if (mode === "camera") {
    targetSpeed = 0;
    currentRpm = null;
    resetCadenceCandidate();
    lastGoodTime = performance.now();
    startCamera();
    pausedSub.textContent = "ペダル(足元)がカメラに映るようにスマホを置いてください";
  } else {
    stopCamera();
    targetSpeed = Number(manualSlider.value);
    pausedSub.textContent = `下のスライダーで速度を上げると出発します(${window.vrRouteMinutesText()})`;
  }
}

// ================= カメラによるケイデンス検出 =================
// 仕組み: カメラ映像を粗い白黒画像に縮小し、前のコマとの差(動きの量)を
// 時系列で記録。ペダリングは周期運動なので、自己相関でその周期を求めて
// 回転数(rpm)に換算する。
let camStream = null;
let camTimer = null;
let analyzeTimer = null;
let cameraRequestId = 0;
let cameraStarting = false;
let currentCameraState = "";
let lastCameraAnnouncementAt = 0;
let cameraAnnouncementTimer = null;
let cameraAnnouncementToken = 0;
let prevGray = null;
let lastGoodTime = 0;
const motionSamples = [];   // { t: 秒, m: 動き量 }
const SAMPLE_HZ = 30;
const ANA_W = 64, ANA_H = 48;
const GRID_COLS = 8, GRID_ROWS = 6;
const RPM_MIN = 35, RPM_MAX = 115;
const anaCanvas = document.createElement("canvas");
anaCanvas.width = ANA_W;
anaCanvas.height = ANA_H;
const anaCtx = anaCanvas.getContext("2d", { willReadFrequently: true });

const SENS = {
  high: { minMotion: 1.0, minCorr: 0.30, minFocus: 1.35, maxGlobal: 0.86 },
  mid:  { minMotion: 1.8, minCorr: 0.38, minFocus: 1.55, maxGlobal: 0.78 },
  low:  { minMotion: 2.8, minCorr: 0.48, minFocus: 1.80, maxGlobal: 0.68 },
};
let cadenceCandidate = null;

function setCameraStatus(state, message, announcement = message) {
  camStatus.textContent = message;
  if (currentCameraState === state) return;
  currentCameraState = state;
  clearTimeout(cameraAnnouncementTimer);
  const token = ++cameraAnnouncementToken;
  const elapsed = performance.now() - lastCameraAnnouncementAt;
  const delay = Math.max(900, 4500 - elapsed);
  cameraAnnouncementTimer = setTimeout(() => {
    if (token !== cameraAnnouncementToken || currentCameraState !== state) return;
    cameraAnnouncement.textContent = "";
    requestAnimationFrame(() => {
      if (token !== cameraAnnouncementToken || currentCameraState !== state) return;
      cameraAnnouncement.textContent = announcement;
      lastCameraAnnouncementAt = performance.now();
    });
  }, delay);
}

function resetCadenceCandidate() {
  cadenceCandidate = null;
}

async function startCamera() {
  if (camStream || cameraStarting) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("このブラウザではカメラ計測を利用できません。手動モードに戻しました。", 4800);
    setMode("manual");
    return;
  }
  cameraStarting = true;
  const requestId = ++cameraRequestId;
  currentCameraState = "";
  setCameraStatus("preparing", "カメラ準備中…");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
  } catch (err) {
    if (requestId !== cameraRequestId) return;
    cameraStarting = false;
    setCameraStatus("error", "カメラを使えませんでした。ブラウザの許可設定を確認してください。");
    console.error(err);
    showToast("カメラを開始できませんでした。手動モードに戻しました。", 4800);
    setMode("manual");
    return;
  }
  if (requestId !== cameraRequestId || mode !== "camera") {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  cameraStarting = false;
  camStream = stream;
  camPreview.srcObject = camStream;
  camPreview.play().catch(() => {});
  setCameraStatus("searching", "ペダルの動きを探しています…", "ペダルの動きを探しています。一定のペースで漕いでください。");
  showToast("カメラの準備ができました。一定のペースで漕いでください。", 3600);
  prevGray = null;
  motionSamples.length = 0;
  camTimer = setInterval(sampleMotion, 1000 / SAMPLE_HZ);
  analyzeTimer = setInterval(analyzeCadence, 400);
}

function stopCamera() {
  cameraRequestId += 1;
  cameraStarting = false;
  clearTimeout(cameraAnnouncementTimer);
  cameraAnnouncementToken += 1;
  currentCameraState = "";
  cameraAnnouncement.textContent = "";
  clearInterval(camTimer);
  clearInterval(analyzeTimer);
  camTimer = analyzeTimer = null;
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  camPreview.srcObject = null;
  currentRpm = null;
  resetCadenceCandidate();
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
    const cellSums = new Float32Array(GRID_COLS * GRID_ROWS);
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(gray[i] - prevGray[i]);
      sum += diff;
      const x = i % ANA_W;
      const y = Math.floor(i / ANA_W);
      const gx = Math.min(GRID_COLS - 1, Math.floor(x * GRID_COLS / ANA_W));
      const gy = Math.min(GRID_ROWS - 1, Math.floor(y * GRID_ROWS / ANA_H));
      cellSums[gy * GRID_COLS + gx] += diff;
    }
    const m = sum / n; // 0〜255 スケールの平均差分
    const avgCell = sum / cellSums.length;
    let maxCell = 0;
    for (const v of cellSums) maxCell = Math.max(maxCell, v);
    let activeCells = 0;
    for (const v of cellSums) {
      if (maxCell > 0 && v > maxCell * 0.35) activeCells++;
    }
    const focus = maxCell / Math.max(1, avgCell);
    const globalness = activeCells / cellSums.length;
    const t = performance.now() / 1000;
    motionSamples.push({ t, m, focus, globalness });
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
    setCameraStatus("no-motion", "動きが見えません。ペダルが映る位置にスマホを置いてください。");
    resetCadenceCandidate();
    return;
  }

  const meanFocus = motionSamples.reduce((a, s) => a + s.focus, 0) / motionSamples.length;
  const meanGlobal = motionSamples.reduce((a, s) => a + s.globalness, 0) / motionSamples.length;
  if (meanFocus < sens.minFocus || meanGlobal > sens.maxGlobal) {
    setCameraStatus("camera-shake", "画面全体の揺れを拾っています。スマホを固定し、ペダルだけが動く構図にしてください。");
    resetCadenceCandidate();
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
    setCameraStatus("searching-rhythm", "リズムを探しています…(一定のペースで漕いでみてください)", "ペダルのリズムを探しています。一定のペースで漕いでください。");
    resetCadenceCandidate();
    return;
  }

  const periodSec = bestLag / SAMPLE_HZ;
  // 両足が映る場合、動きのピークは半回転ごとに来るので 1 回転 = 周期×2
  const revSec = settings.legMode === "both" ? periodSec * 2 : periodSec;
  const rpm = 60 / revSec;
  if (rpm < RPM_MIN || rpm > RPM_MAX) {
    setCameraStatus("invalid-rhythm", "ペダルらしい速さではありません。カメラ位置と感度を調整してください。");
    resetCadenceCandidate();
    return;
  }
  const kmh = (rpm * settings.mPerRev * 60) / 1000;

  const now = performance.now();
  if (!cadenceCandidate || now - cadenceCandidate.t > 1800 ||
      Math.abs(rpm - cadenceCandidate.rpm) > Math.max(10, cadenceCandidate.rpm * 0.18)) {
    cadenceCandidate = { rpm, kmh, t: now, seen: 1 };
    setCameraStatus("confirming", "リズム確認中…");
    return;
  }

  cadenceCandidate.rpm = cadenceCandidate.rpm * 0.65 + rpm * 0.35;
  cadenceCandidate.kmh = cadenceCandidate.kmh * 0.65 + kmh * 0.35;
  cadenceCandidate.t = now;
  cadenceCandidate.seen += 1;
  if (cadenceCandidate.seen < 2) {
    setCameraStatus("confirming", "リズム確認中…");
    return;
  }

  if (currentRpm === null) showToast("ペダルのリズムを検出しました。", 2600);
  currentRpm = Math.round(cadenceCandidate.rpm);
  const maxStep = 3.2;
  targetSpeed += Math.max(-maxStep, Math.min(maxStep, cadenceCandidate.kmh - targetSpeed));
  lastGoodTime = performance.now();
  setCameraStatus("detected", `検出中: ${currentRpm} rpm`, "ペダルのリズムを検出しています。");
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

// ================= 旅の進捗・没入表示 =================
let lastJourneyUpdateAt = 0;
let lastInteractionAt = performance.now();

function updateJourneyUI(now = performance.now()) {
  if (!currentScene || now - lastJourneyUpdateAt < 200) return;
  lastJourneyUpdateAt = now;
  const progress = window.vrRouteProgress(currentScene.id, sceneVideo.currentTime);
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  routeProgress.style.width = `${percent}%`;
  routePercent.textContent = `${percent}%`;
  routeTrack.setAttribute("aria-valuenow", String(percent));
  const next = window.vrSceneById(window.vrNextSceneId(currentScene.id));
  nextScene.textContent = `次: ${next.title}`;
  const etaSpeed = displaySpeed >= STOP_SPEED ? displaySpeed : window.VR_REFERENCE_SPEED;
  const remaining = window.vrRouteRemainingSec(currentScene.id, sceneVideo.currentTime, etaSpeed);
  routeEta.textContent = displaySpeed >= STOP_SPEED
    ? `残り ${window.vrFormatDuration(remaining)}`
    : `${window.VR_REFERENCE_SPEED}km/hで ${window.vrFormatDuration(remaining)}`;
}

function noteInteraction() {
  lastInteractionAt = performance.now();
  stage.classList.remove("controlsQuiet");
  retryRideMedia();
}

stage.addEventListener("pointerdown", noteInteraction);
stage.addEventListener("pointermove", noteInteraction, { passive: true });
document.addEventListener("keydown", noteInteraction);

function updateImmersiveUi(now) {
  const shouldHide = settings.autoHideControls &&
    displaySpeed >= STOP_SPEED &&
    now - lastInteractionAt > 4200 &&
    !document.querySelector("dialog[open]") &&
    !$("controls").matches(":focus-within");
  stage.classList.toggle("controlsQuiet", shouldHide);
}

// ================= 速度連動の風音(端末内で生成・初期値OFF) =================
let audioContext = null;
let windGain = null;
let windFilter = null;

async function ensureWindAudio() {
  if (!settings.windSound) return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    settings.windSound = false;
    saveSettings();
    showToast("このブラウザでは風音を利用できません。", 3600);
    return false;
  }
  if (!audioContext) {
    audioContext = new AudioContextClass();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    windFilter = audioContext.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 900;
    windGain = audioContext.createGain();
    windGain.gain.value = 0;
    source.buffer = buffer;
    source.loop = true;
    source.connect(windFilter).connect(windGain).connect(audioContext.destination);
    source.start();
  }
  if (audioContext.state === "suspended") await audioContext.resume().catch(() => {});
  return true;
}

function updateWindAudio(speed) {
  if (!windGain || !audioContext) return;
  const enabledSpeed = settings.windSound && speed >= STOP_SPEED ? speed : 0;
  const level = Math.min(0.055, Math.max(0, (enabledSpeed / 40) * 0.055));
  windGain.gain.setTargetAtTime(level, audioContext.currentTime, 0.18);
  if (windFilter) windFilter.frequency.setTargetAtTime(650 + enabledSpeed * 28, audioContext.currentTime, 0.25);
}

// ================= メインループ =================
let lastTick = performance.now();
function tick(now) {
  const rawDt = Math.max(0, (now - lastTick) / 1000);
  const dt = Math.min(0.2, rawDt);
  const recordDt = document.visibilityState === "visible" ? Math.min(1, rawDt) : 0;
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
      
      if (sceneVideo.paused && !sceneVideo.dataset.playPending) {
        sceneVideo.dataset.playPending = "true";
        sceneVideo.play()
          .then(() => { sceneVideo.dataset.playPending = ""; })
          .catch((err) => {
            sceneVideo.dataset.playPending = "";
            console.warn("Playback failed:", err);
          });
      }
      
      pausedOverlay.classList.add("hidden");
      pausedOverlay.setAttribute("aria-hidden", "true");
      rateValue.textContent = rate.toFixed(1);
    } else {
      sceneVideo.dataset.playPending = "";
      if (!sceneVideo.paused) sceneVideo.pause();
      pausedOverlay.classList.remove("hidden");
      pausedOverlay.setAttribute("aria-hidden", "false");
      if (sceneFade) sceneFade.classList.remove("visible");
      rateValue.textContent = "0.0";
    }
  }

  // 走行記録
  if (displaySpeed >= STOP_SPEED) {
    distanceM += (displaySpeed / 3.6) * recordDt;
    movingSec += recordDt;
    maxSpeed = Math.max(maxSpeed, displaySpeed);
    saveSession();
  }

  speedValue.textContent = displaySpeed.toFixed(1);
  quickStartBtn.textContent = displaySpeed >= STOP_SPEED
    ? "一時停止"
    : `${settings.manualSpeed} km/hで出発`;
  rpmValue.textContent = mode === "camera" && currentRpm ? currentRpm : "–";
  distValue.textContent = (distanceM / 1000).toFixed(2);
  const min = Math.floor(movingSec / 60);
  const sec = Math.floor(movingSec % 60);
  timeValue.textContent = `${min}:${String(sec).padStart(2, "0")}`;
  const movingNow = displaySpeed >= STOP_SPEED;
  pausedOverlay.inert = movingNow;
  quickStartBtn.tabIndex = movingNow ? -1 : 0;
  if (movingNow) stage.classList.remove("freshStart");
  if (movingNow && !rideWasMoving && document.activeElement === quickStartBtn) {
    manualSlider.focus({ preventScroll: true });
  }
  rideWasMoving = movingNow;
  updateJourneyUI(now);
  updateImmersiveUi(now);
  updateWindAudio(displaySpeed);

  // Quest へ速度を送信(約8Hz)
  if (questLink && questLink.connected && now - lastSentAt > 120) {
    lastSentAt = now;
    questLink.send({
      speed: Number(displaySpeed.toFixed(2)),
      rpm: currentRpm || null,
      sceneId: currentScene ? currentScene.id : null,
      sceneTime: Number.isFinite(sceneVideo.currentTime) ? Number(sceneVideo.currentTime.toFixed(2)) : 0,
      distanceKm: Number((distanceM / 1000).toFixed(3)),
      movingSec: Math.round(movingSec),
      routeProgress: currentScene ? window.vrRouteProgress(currentScene.id, sceneVideo.currentTime) : 0,
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
  else saveSession(true);
});
window.addEventListener("pagehide", () => saveSession(true));

// ================= UI イベント =================
$("modeCameraBtn").addEventListener("click", () => { setMode("camera"); requestWakeLock(); });
$("modeManualBtn").addEventListener("click", () => setMode("manual"));
manualSlider.addEventListener("input", () => {
  setManualSpeed(manualSlider.value);
  requestWakeLock();
});
$("speedDownBtn").addEventListener("click", () => setManualSpeed(Number(manualSlider.value) - 1));
$("speedUpBtn").addEventListener("click", () => setManualSpeed(Number(manualSlider.value) + 1));
quickStartBtn.addEventListener("click", toggleManualRide);

const sessionDialog = $("sessionDialog");
function formatClock(totalSec) {
  const total = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function openSessionSummary() {
  const average = movingSec > 0 ? (distanceM / 1000) / (movingSec / 3600) : 0;
  const progress = currentScene ? window.vrRouteProgress(currentScene.id, sceneVideo.currentTime) : 0;
  $("summaryDistance").textContent = (distanceM / 1000).toFixed(2);
  $("summaryTime").textContent = formatClock(movingSec);
  $("summaryAverage").textContent = average.toFixed(1);
  $("summaryMax").textContent = maxSpeed.toFixed(1);
  $("summaryRoute").textContent = routeLaps
    ? `ルート${routeLaps}周完走・現在の周を${Math.round(progress * 100)}%走行`
    : `海から夕暮れへのルートを${Math.round(progress * 100)}%走行`;
  sessionDialog.showModal();
}
$("resetBtn").addEventListener("click", openSessionSummary);
$("clearSessionBtn").addEventListener("click", () => {
  distanceM = 0;
  movingSec = 0;
  maxSpeed = 0;
  routeLaps = 0;
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  sessionDialog.close();
  showToast("走行記録をリセットしました。", 2600);
});

$("fullscreenBtn").addEventListener("click", () => {
  if (!document.documentElement.requestFullscreen) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen().catch(() => {});
});
if (!document.documentElement.requestFullscreen) $("fullscreenBtn").hidden = true;

// 設定ダイアログ
const settingsDialog = $("settingsDialog");
$("settingsBtn").addEventListener("click", () => {
  $("mPerRevInput").value = settings.mPerRev;
  $("legModeSelect").value = settings.legMode;
  $("sensitivitySelect").value = settings.sensitivity;
  $("autoHideInput").checked = settings.autoHideControls;
  $("windSoundInput").checked = settings.windSound;
  settingsDialog.showModal();
});
settingsDialog.addEventListener("close", () => {
  settings.mPerRev = Math.min(8, Math.max(2, Number($("mPerRevInput").value) || defaultSettings.mPerRev));
  settings.legMode = $("legModeSelect").value;
  settings.sensitivity = $("sensitivitySelect").value;
  settings.autoHideControls = $("autoHideInput").checked;
  saveSettings();
});
$("autoHideInput").addEventListener("change", () => {
  settings.autoHideControls = $("autoHideInput").checked;
  if (!settings.autoHideControls) stage.classList.remove("controlsQuiet");
  saveSettings();
});
$("windSoundInput").addEventListener("change", async () => {
  settings.windSound = $("windSoundInput").checked;
  saveSettings();
  if (settings.windSound) {
    const started = await ensureWindAudio();
    if (!started) $("windSoundInput").checked = false;
    else showToast("風音をオンにしました。", 2200);
  } else {
    updateWindAudio(0);
  }
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
  questStatus.textContent = "表示画面に出ている4桁コードを入力してください";
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
        questStatus.textContent = "つながりました。スマホはペダル撮影用として固定してください。";
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

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest("button, a, input, select, textarea, [role='button'], [role='slider'], [contenteditable='true']")) return;
  if (document.querySelector("dialog[open]")) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggleManualRide();
  } else if (mode === "manual" && ["ArrowRight", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    setManualSpeed(Number(manualSlider.value) + 1);
  } else if (mode === "manual" && ["ArrowLeft", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    setManualSpeed(Number(manualSlider.value) - 1);
  } else if (event.key.toLowerCase() === "f") {
    $("fullscreenBtn").click();
  } else if (event.key.toLowerCase() === "r") {
    openSessionSummary();
  }
});

// ================= 起動 =================
buildSceneChips();
setManualSpeed(0, false);
setScene(restoredSession?.sceneId || settings.sceneId, false);
setMode("manual");
if (restoredSession && (movingSec > 0 || distanceM > 0)) stage.classList.remove("freshStart");
requestAnimationFrame(tick);
if (restoredSession && (movingSec > 0 || distanceM > 0)) {
  setTimeout(() => showToast("前回の走行記録を再開しました。", 3200), 650);
}

// ================= 自動再生ブロック解除 =================
function setupUnlock() {
  const unlock = () => {
    if (sceneVideo.paused) {
      sceneVideo.play().then(() => {
        if (displaySpeed < STOP_SPEED) sceneVideo.pause();
      }).catch(() => {});
    }
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
    document.removeEventListener("touchstart", unlock);
  };
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
  document.addEventListener("touchstart", unlock);
}
setupUnlock();
