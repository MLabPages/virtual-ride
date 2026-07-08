import * as THREE from "three";

// ================= 要素・状態 =================
const $ = (id) => document.getElementById(id);
const video = $("video");
video.muted = true; // 明示的にミュート状態を設定(自動再生ポリシー対策)
const pair = $("pair");
const codeBox = $("codeBox");
const pairStatus = $("pairStatus");
const hud = $("hud");
const spdVal = $("spdVal");
const rpmVal = $("rpmVal");
const rateVal = $("rateVal");
const sceneName = $("sceneName");
const reconnectNote = $("reconnectNote");

const STOP_SPEED = window.VR_TUNING.STOP_SPEED;

let targetSpeed = 0;
let displaySpeed = 0;
let currentRpm = null;
let currentScene = null;
let lastDataAt = 0;
let connected = false;

// ================= シーン =================
function setScene(sceneId) {
  const scene = window.vrSceneById(sceneId);
  if (currentScene && currentScene.id === scene.id) return;
  currentScene = scene;
  sceneName.textContent = scene.title;
  window.vrApplySceneFraming(video, scene);
  video.src = scene.file;
  video.load();
  video.dataset.playPending = "";
  if (displaySpeed >= STOP_SPEED) {
    video.dataset.playPending = "true";
    video.play()
      .then(() => { video.dataset.playPending = ""; })
      .catch((err) => {
        video.dataset.playPending = "";
        console.warn("Playback failed after load:", err);
      });
  }
}
setScene(window.VR_SCENES[0].id);

// 映像が終わったら次の景色へ(旅モード)。
// スマホと接続中は、進行の指揮はスマホに任せる(スマホが次の sceneId を送る)。
// 単独表示のときだけ、この画面自身で次へ進む。
video.addEventListener("ended", () => {
  setScene(window.vrNextSceneId(currentScene.id));
});

// ================= ペア接続(受信側) =================
codeBox.textContent = "····";
const link = window.VRLink.host({
  onStatus: (s, info) => {
    if (s === "waiting") {
      codeBox.textContent = info;
      pairStatus.textContent = "スマホからの接続を待っています…";
    } else if (s === "connected") {
      connected = true;
      pairStatus.textContent = "接続しました!";
      pair.classList.add("hidden");
      hud.classList.remove("hidden");
      reconnectNote.hidden = true;
    } else if (s === "disconnected") {
      connected = false;
      reconnectNote.hidden = false;
      reconnectNote.textContent = "スマホとの接続が切れました。再接続を待っています…";
    } else if (s === "error") {
      pairStatus.textContent = "接続の準備でエラーが発生しました(" + (info || "") + ")。ページを再読み込みしてください。";
    }
  },
  onData: (d) => {
    if (!d || typeof d.speed !== "number") return;
    targetSpeed = d.speed;
    currentRpm = d.rpm || null;
    lastDataAt = performance.now();
    if (d.sceneId) setScene(d.sceneId);
  },
});

// ================= 映像・HUD 更新 =================
let lastTick = performance.now();
function update(now) {
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;

  // データが途切れたら惰性で減速
  if (connected && now - lastDataAt > 1500) targetSpeed *= 0.96;

  const k = 1 - Math.exp(-dt / 0.6);
  displaySpeed += (targetSpeed - displaySpeed) * k;
  if (displaySpeed < 0.05) displaySpeed = 0;

  if (currentScene) {
    if (displaySpeed >= STOP_SPEED) {
      const rate = window.vrRateFor(displaySpeed, currentScene.baseSpeed);
      if (Math.abs(video.playbackRate - rate) > 0.02) video.playbackRate = rate;
      
      if (video.paused && !video.dataset.playPending) {
        video.dataset.playPending = "true";
        video.play()
          .then(() => { video.dataset.playPending = ""; })
          .catch((err) => {
            video.dataset.playPending = "";
            console.warn("Playback failed:", err);
          });
      }
      
      rateVal.textContent = rate.toFixed(1);
    } else {
      video.dataset.playPending = "";
      if (!video.paused) video.pause();
      rateVal.textContent = "0.0";
    }
  }

  spdVal.textContent = displaySpeed.toFixed(1);
  rpmVal.textContent = currentRpm ? currentRpm : "–";
}

// ================= 全画面 =================
$("fsBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

// ================= WebXR(VRで見る) =================
let renderer, xrScene, xrCamera, screenMesh, videoTexture;

async function initXRIfSupported() {
  if (!navigator.xr) return;
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported("immersive-vr"); } catch (_) {}
  if (ok) $("vrBtn").hidden = false;
}

function buildXRScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.style.display = "none";
  document.body.appendChild(renderer.domElement);

  xrScene = new THREE.Scene();
  xrCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  // 目の前に置く大きな湾曲スクリーン(半径6m・幅約60度)
  const geo = new THREE.CylinderGeometry(6, 6, 6.75, 60, 1, true, -Math.PI / 6, Math.PI / 3);
  geo.scale(-1, 1, 1); // 内側から見る
  const mat = new THREE.MeshBasicMaterial({ map: videoTexture });
  screenMesh = new THREE.Mesh(geo, mat);
  screenMesh.position.set(0, 1.5, 0);
  xrScene.add(screenMesh);

  xrScene.add(new THREE.AmbientLight(0xffffff, 1));
}

$("vrBtn").addEventListener("click", async () => {
  if (!renderer) buildXRScene();
  try {
    const session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor"],
    });
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);
    if (video.paused && displaySpeed >= STOP_SPEED && !video.dataset.playPending) {
      video.dataset.playPending = "true";
      video.play()
        .then(() => { video.dataset.playPending = ""; })
        .catch((err) => {
          video.dataset.playPending = "";
          console.warn("Playback failed in VR mode:", err);
        });
    }
    // XR 中は renderer 側のループが毎フレーム loop() を呼ぶ
    renderer.setAnimationLoop(loop);
    session.addEventListener("end", () => {
      renderer.setAnimationLoop(null);
      startRAF(); // 平面画面の更新に戻す
    });
  } catch (err) {
    reconnectNote.hidden = false;
    reconnectNote.textContent = "VRの開始に失敗しました: " + (err.message || err);
  }
});

// ================= メインループ =================
function loop(now) {
  update(now || performance.now());
  if (renderer && renderer.xr.isPresenting) {
    renderer.render(xrScene, xrCamera);
  }
}
// 通常(非VR)は rAF で HUD と映像速度を更新。VR 中は setAnimationLoop に任せる。
function startRAF() {
  requestAnimationFrame(function raf(t) {
    loop(t);
    if (!(renderer && renderer.xr.isPresenting)) requestAnimationFrame(raf);
  });
}
startRAF();

initXRIfSupported();

// ================= 自動再生ブロック解除 =================
function setupUnlock() {
  const unlock = () => {
    if (video.paused) {
      video.play().then(() => {
        if (displaySpeed < STOP_SPEED) video.pause();
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
