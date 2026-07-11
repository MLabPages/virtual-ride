// ================= 要素・状態 =================
const $ = (id) => document.getElementById(id);
const videos = [$('videoA'), $('videoB')];
let video = videos[0];
let standbyVideo = videos[1];
const sceneFade = $('sceneFade');

for (const element of videos) {
  element.crossOrigin = 'anonymous';
  element.muted = true;
  element.playsInline = true;
}

const pair = $('pair');
const codeBox = $('codeBox');
const pairStatus = $('pairStatus');
const hud = $('hud');
const spdVal = $('spdVal');
const rpmVal = $('rpmVal');
const rateVal = $('rateVal');
const sceneName = $('sceneName');
const routePct = $('routePct');
const routeBar = $('routeBar');
const displayRouteTrack = $('displayRouteTrack');
const nextName = $('nextName');
const routeRemaining = $('routeRemaining');
const sessionMeta = $('sessionMeta');
const rideState = $('rideState');
const reconnectNote = $('reconnectNote');
const STOP_SPEED = window.VR_TUNING.STOP_SPEED;

let targetSpeed = 0;
let displaySpeed = 0;
let currentRpm = null;
let currentScene = null;
let lastDataAt = 0;
let connected = false;
let demoMode = false;
let remoteDistanceKm = 0;
let remoteMovingSec = 0;
let remoteRouteProgress = null;
let desiredRemoteSceneId = null;
let desiredRemoteSceneTime = 0;
let usingFallback = false;
let lastDisplayInteractionAt = performance.now();

function noteDisplayInteraction() {
  lastDisplayInteractionAt = performance.now();
  document.body.classList.remove('displayFocus');
}
document.addEventListener('pointerdown', noteDisplayInteraction);
document.addEventListener('pointermove', noteDisplayInteraction, { passive: true });
document.addEventListener('keydown', noteDisplayInteraction);

// ================= シーン（二重バッファ） =================
let pendingSceneId = null;
let sceneLoadToken = 0;
let handledFailureToken = -1;
let preloadSerial = 0;
let preloadedSceneId = null;
let preloadPromise = null;
const failedScenes = new Map();

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function sceneUrl(scene) {
  return new URL(scene.file, document.baseURI).href;
}

function isReadyFor(target, scene) {
  return target.dataset.sceneId === scene.id &&
    target.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
}

function loadSceneInto(target, scene, timeoutMs = 15000) {
  if (isReadyFor(target, scene)) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    let settled = false;
    const expectedUrl = sceneUrl(scene);

    const cleanup = () => {
      target.removeEventListener('canplay', onReady);
      target.removeEventListener('loadeddata', onReady);
      target.removeEventListener('error', onError);
      window.clearTimeout(timer);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onReady = () => {
      if (target.src !== expectedUrl || target.dataset.sceneId !== scene.id) return;
      finish(resolve, true);
    };
    const onError = () => finish(reject, new Error(`動画を読み込めません: ${scene.file}`));
    const timer = window.setTimeout(() => {
      finish(reject, new Error(`動画の読み込みがタイムアウトしました: ${scene.file}`));
    }, timeoutMs);

    target.addEventListener('canplay', onReady);
    target.addEventListener('loadeddata', onReady);
    target.addEventListener('error', onError);
    target.dataset.sceneId = scene.id;
    target.dataset.playPending = '';
    target.dataset.segmentEnded = '';
    window.vrApplySceneFraming(target, scene);

    if (target.src !== expectedUrl) {
      target.src = scene.file;
      target.load();
    } else if (target.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      onReady();
    } else {
      // 同じURLの先読みが一度失敗していた場合も、明示的に再読み込みする。
      target.load();
    }
  });
}

function seekForScene(target, scene) {
  if (target.readyState < HTMLMediaElement.HAVE_METADATA) return;

  const remoteControls = connected && scene.id === desiredRemoteSceneId &&
    Number.isFinite(desiredRemoteSceneTime);
  const requestedTime = remoteControls ? desiredRemoteSceneTime : (scene.startSec || 0);
  const duration = Number.isFinite(target.duration) ? target.duration : null;
  const configuredEnd = Number.isFinite(scene.endSec) ? scene.endSec : duration;
  const endAt = duration && configuredEnd ? Math.min(configuredEnd, duration) : configuredEnd;
  const maxTime = Number.isFinite(endAt)
    ? Math.max(scene.startSec || 0, endAt - 0.2)
    : requestedTime;
  const safeTime = Math.min(Math.max(scene.startSec || 0, requestedTime), maxTime);

  if (Number.isFinite(safeTime) && Math.abs(target.currentTime - safeTime) > 0.15) {
    try { target.currentTime = safeTime; } catch (_) {}
  }
}

function requestPlay(target) {
  if (displaySpeed < STOP_SPEED || target.dataset.segmentEnded) return;
  if (!target.paused || target.dataset.playPending) return;

  target.dataset.playPending = 'true';
  target.play()
    .catch((err) => console.warn('Playback failed:', err))
    .finally(() => { target.dataset.playPending = ''; });
}

async function preloadNextScene() {
  if (!currentScene || pendingSceneId) return;
  const next = window.vrSceneById(window.vrNextSceneId(currentScene.id));
  if (preloadedSceneId === next.id && preloadPromise) return preloadPromise;

  const serial = ++preloadSerial;
  const target = standbyVideo;
  preloadedSceneId = next.id;
  preloadPromise = loadSceneInto(target, next, 20000)
    .then(() => {
      if (serial !== preloadSerial || target !== standbyVideo) return false;
      seekForScene(target, next);
      return true;
    })
    .catch((err) => {
      if (serial === preloadSerial) {
        preloadedSceneId = null;
        preloadPromise = null;
      }
      console.warn('Preload failed:', err);
      return false;
    });
  return preloadPromise;
}

async function activateScene(scene, transition) {
  const incoming = standbyVideo;
  const outgoing = video;

  seekForScene(incoming, scene);
  incoming.playbackRate = window.vrRateFor(
    Math.max(displaySpeed, window.VR_REFERENCE_SPEED),
    scene.baseSpeed
  );
  if (displaySpeed >= STOP_SPEED) requestPlay(incoming);

  if (transition && sceneFade) {
    sceneFade.classList.add('visible');
    await sleep(120);
  }

  currentScene = scene;
  sceneName.textContent = scene.title;
  incoming.classList.add('active');
  outgoing.classList.remove('active');
  video = incoming;
  standbyVideo = outgoing;
  window.dispatchEvent(new CustomEvent('vr-active-video-changed', { detail: { video } }));

  await nextFrame();
  if (sceneFade) sceneFade.classList.remove('visible');

  window.setTimeout(() => {
    if (standbyVideo !== outgoing) return;
    outgoing.pause();
    outgoing.dataset.playPending = '';
    outgoing.dataset.segmentEnded = '';
  }, 500);

  pendingSceneId = null;
  preloadedSceneId = null;
  preloadPromise = null;
  failedScenes.delete(scene.id);
  if ((connected || demoMode) && reconnectNote.textContent.includes('景色')) {
    reconnectNote.hidden = true;
  }

  syncRemotePlayback();
  window.setTimeout(() => { void preloadNextScene(); }, 700);
}

async function applyScene(sceneId, transition = false) {
  const scene = window.vrSceneById(sceneId);
  if (currentScene?.id === scene.id) {
    if (pendingSceneId && pendingSceneId !== scene.id) {
      sceneLoadToken += 1;
      pendingSceneId = null;
      if (sceneFade) sceneFade.classList.remove('visible');
    }
    return;
  }
  if (pendingSceneId === scene.id) return;

  const token = ++sceneLoadToken;
  pendingSceneId = scene.id;
  const initialLoad = !currentScene;
  const target = initialLoad ? video : standbyVideo;
  const hasMatchingPreload = !initialLoad && preloadedSceneId === scene.id && preloadPromise;

  const loadingNotice = window.setTimeout(() => {
    if (token !== sceneLoadToken) return;
    reconnectNote.hidden = false;
    reconnectNote.textContent = '次の景色を準備しています…';
  }, 700);

  try {
    let ready = false;
    if (hasMatchingPreload) ready = await preloadPromise;
    if (!ready) {
      ++preloadSerial;
      preloadedSceneId = null;
      preloadPromise = null;
      await loadSceneInto(target, scene);
    }
    if (token !== sceneLoadToken || pendingSceneId !== scene.id) return;

    if (initialLoad) {
      currentScene = scene;
      sceneName.textContent = scene.title;
      seekForScene(video, scene);
      video.classList.add('active');
      video.dataset.segmentEnded = '';
      if (displaySpeed >= STOP_SPEED) requestPlay(video);
      pendingSceneId = null;
      window.setTimeout(() => { void preloadNextScene(); }, 700);
    } else {
      await activateScene(scene, transition);
    }
  } catch (err) {
    if (token !== sceneLoadToken) return;
    console.warn(err);
    pendingSceneId = null;
    handleSceneFailure(scene.id);
  } finally {
    window.clearTimeout(loadingNotice);
  }
}

function setScene(sceneId, transition = false) {
  void applyScene(sceneId, transition);
}

function cueSceneFade() {
  if (!sceneFade || !currentScene || !Number.isFinite(video.duration)) return;
  const endAt = Number.isFinite(currentScene.endSec)
    ? Math.min(currentScene.endSec, video.duration)
    : video.duration;
  const remaining = endAt - video.currentTime;

  if (remaining > 0 && remaining < 10) void preloadNextScene();

  if (remaining <= 0.05 && displaySpeed >= STOP_SPEED) {
    video.dataset.segmentEnded = 'true';
    if (!video.paused) video.pause();
    sceneFade.classList.add('visible');
    if (!connected || usingFallback) advanceDisplayRoute();
    return;
  }
  if (remaining > 0 && remaining < 0.75 && displaySpeed >= STOP_SPEED) {
    sceneFade.classList.add('visible');
  }
}

function advanceDisplayRoute() {
  if (!currentScene || pendingSceneId) return;
  setScene(window.vrNextSceneId(currentScene.id), true);
}

function handleSceneFailure(failedSceneId = currentScene?.id) {
  if (!failedSceneId || handledFailureToken === sceneLoadToken) return;
  handledFailureToken = sceneLoadToken;
  usingFallback = connected;
  failedScenes.set(failedSceneId, Date.now());

  const now = Date.now();
  let candidateId = failedSceneId;
  for (let i = 0; i < window.VR_SCENES.length; i++) {
    candidateId = window.vrNextSceneId(candidateId);
    if (now - (failedScenes.get(candidateId) || 0) > 60000) {
      reconnectNote.hidden = false;
      reconnectNote.textContent = '別の景色へ切り替えています…';
      setScene(candidateId, true);
      return;
    }
  }

  targetSpeed = 0;
  reconnectNote.hidden = false;
  reconnectNote.textContent = '景観動画を読み込めません。通信を確認してページを再読み込みしてください。';
}

function syncRemotePlayback() {
  if (!connected || !currentScene || currentScene.id !== desiredRemoteSceneId) return;
  if (video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(desiredRemoteSceneTime)) return;
  seekForScene(video, currentScene);
}

for (const element of videos) {
  element.addEventListener('timeupdate', (event) => {
    if (event.currentTarget === video) cueSceneFade();
  });
  element.addEventListener('ended', (event) => {
    if (event.currentTarget === video && (!connected || usingFallback)) advanceDisplayRoute();
  });
  element.addEventListener('error', (event) => {
    if (event.currentTarget === video) handleSceneFailure(currentScene?.id);
  });
  element.addEventListener('canplay', (event) => {
    if (event.currentTarget !== video) return;
    failedScenes.delete(currentScene?.id);
    if ((connected || demoMode) && reconnectNote.textContent.includes('景色')) {
      reconnectNote.hidden = true;
    }
    void preloadNextScene();
  });
  element.addEventListener('loadedmetadata', (event) => {
    if (event.currentTarget !== video || !currentScene) return;
    seekForScene(video, currentScene);
    syncRemotePlayback();
  });
}

setScene(window.VR_SCENES[0].id);

// ================= ペア接続(受信側) =================
codeBox.textContent = "····";
let link = null;
try {
  link = window.VRLink.host({
    onStatus: (s, info) => {
      if (s === "waiting") {
        codeBox.textContent = info;
        pairStatus.textContent = "スマホからの接続を待っています…";
      } else if (s === "connected") {
        connected = true;
        demoMode = false;
        pairStatus.textContent = "接続しました!";
        pair.classList.add("hidden");
        hud.classList.remove("hidden");
        $("pairBtn").hidden = true;
        reconnectNote.hidden = true;
      } else if (s === "disconnected") {
        connected = false;
        targetSpeed = 0;
        reconnectNote.hidden = false;
        reconnectNote.textContent = "スマホとの接続が切れました。再接続を待っています…";
      } else if (s === "error") {
        pairStatus.textContent = "接続の準備でエラーが発生しました(" + (info || "") + ")。試運転はそのまま使えます。";
      }
    },
    onData: (d) => {
      if (!d || !Number.isFinite(d.speed)) return;
      targetSpeed = Math.min(40, Math.max(0, d.speed));
      currentRpm = Number.isFinite(d.rpm) && d.rpm >= 0 && d.rpm <= 200 ? Math.round(d.rpm) : null;
      if (Number.isFinite(d.distanceKm)) remoteDistanceKm = Math.min(10000, Math.max(0, d.distanceKm));
      if (Number.isFinite(d.movingSec)) remoteMovingSec = Math.min(365 * 86400, Math.max(0, d.movingSec));
      remoteRouteProgress = Number.isFinite(d.routeProgress)
        ? Math.min(1, Math.max(0, d.routeProgress))
        : null;
      lastDataAt = performance.now();
      if (d.sceneId && window.VR_SCENES.some((scene) => scene.id === d.sceneId)) {
        desiredRemoteSceneId = d.sceneId;
        desiredRemoteSceneTime = Number.isFinite(d.sceneTime) ? Math.max(0, d.sceneTime) : 0;
        const failedAt = failedScenes.get(d.sceneId) || 0;
        if (Date.now() - failedAt > 60000) {
          usingFallback = false;
          setScene(d.sceneId, true);
          syncRemotePlayback();
        }
      }
    },
  });
} catch (err) {
  codeBox.textContent = "----";
  pairStatus.textContent = "接続サービスを読み込めませんでした。通信を確認するか、下の試運転をお使いください。";
  console.error(err);
}

// ================= 映像・HUD 更新 =================
let lastTick = performance.now();
function update(now) {
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;

  // データが途切れたら惰性で減速
  if (connected && now - lastDataAt > 1500) targetSpeed *= Math.exp(-dt / 0.8);

  const k = 1 - Math.exp(-dt / 0.6);
  displaySpeed += (targetSpeed - displaySpeed) * k;
  if (displaySpeed < 0.05) displaySpeed = 0;

  if (currentScene) {
    if (displaySpeed >= STOP_SPEED) {
      const rate = window.vrRateFor(displaySpeed, currentScene.baseSpeed);
      if (Math.abs(video.playbackRate - rate) > 0.02) video.playbackRate = rate;
      
      if (video.paused && !video.dataset.playPending && !video.dataset.segmentEnded) {
        video.dataset.playPending = "true";
        video.play()
          .then(() => { video.dataset.playPending = ""; })
          .catch((err) => {
            video.dataset.playPending = "";
            console.warn("Playback failed:", err);
          });
      }
      
      rateVal.textContent = rate.toFixed(1);
      rideState.classList.add("hidden");
      rideState.setAttribute("aria-hidden", "true");
    } else {
      video.dataset.playPending = "";
      if (!video.paused) video.pause();
      if (sceneFade) sceneFade.classList.remove("visible");
      rateVal.textContent = "0.0";
      rideState.classList.remove("hidden");
      rideState.setAttribute("aria-hidden", "false");
    }
  }

  if (demoMode && displaySpeed >= STOP_SPEED) {
    remoteDistanceKm += (displaySpeed / 3600) * dt;
    remoteMovingSec += dt;
  }

  spdVal.textContent = displaySpeed.toFixed(1);
  rpmVal.textContent = currentRpm ? currentRpm : "–";
  const totalSec = Math.max(0, Math.floor(remoteMovingSec));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  sessionMeta.textContent = `${remoteDistanceKm.toFixed(2)} km / ${minutes}:${String(seconds).padStart(2, "0")}`;

  if (currentScene) {
    const localProgress = window.vrRouteProgress(currentScene.id, video.currentTime);
    const progress = connected && remoteRouteProgress !== null ? remoteRouteProgress : localProgress;
    const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
    routeBar.style.width = `${percent}%`;
    routePct.textContent = `${percent}%`;
    displayRouteTrack.setAttribute("aria-valuenow", String(percent));
    const next = window.vrSceneById(window.vrNextSceneId(currentScene.id));
    nextName.textContent = `次: ${next.title}`;
    const etaSpeed = displaySpeed >= STOP_SPEED ? displaySpeed : window.VR_REFERENCE_SPEED;
    const remaining = window.vrRouteRemainingSec(currentScene.id, video.currentTime, etaSpeed);
    routeRemaining.textContent = displaySpeed >= STOP_SPEED
      ? `残り ${window.vrFormatDuration(remaining)}`
      : `${window.VR_REFERENCE_SPEED}km/hで ${window.vrFormatDuration(remaining)}`;
  }
  document.body.classList.toggle(
    "displayFocus",
    displaySpeed >= STOP_SPEED && now - lastDisplayInteractionAt > 4200
  );
}

// ================= 全画面 =================
$("fsBtn").addEventListener("click", () => {
  if (!document.documentElement.requestFullscreen) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen().catch(() => {});
});
if (!document.documentElement.requestFullscreen) $("fsBtn").hidden = true;

// 接続機器がなくても大画面表示を確認できる試運転。
$("demoBtn").addEventListener("click", () => {
  demoMode = true;
  connected = false;
  targetSpeed = window.VR_REFERENCE_SPEED;
  currentRpm = null;
  remoteDistanceKm = 0;
  remoteMovingSec = 0;
  remoteRouteProgress = null;
  pair.classList.add("hidden");
  hud.classList.remove("hidden");
  $("pairBtn").hidden = false;
  reconnectNote.hidden = false;
  reconnectNote.textContent = "試運転中: スマホ接続時は自動で切り替わります";
});

$("pairBtn").addEventListener("click", () => {
  demoMode = false;
  targetSpeed = 0;
  pair.classList.remove("hidden");
  hud.classList.add("hidden");
  $("pairBtn").hidden = true;
  reconnectNote.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") $("fsBtn").click();
});

// ================= WebXR(VRで見る) =================
let THREE = null;
let renderer, xrScene, xrCamera, screenMesh, videoTexture;
window.addEventListener('vr-active-video-changed', (event) => {
  if (!videoTexture || !event.detail?.video) return;
  videoTexture.image = event.detail.video;
  videoTexture.needsUpdate = true;
});

async function initXRIfSupported() {
  if (!navigator.xr) return;
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported("immersive-vr"); } catch (_) {}
  if (ok) $("vrBtn").hidden = false;
}

async function buildXRScene() {
  if (!THREE) {
    THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
  }
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
  try {
    if (!renderer) {
      reconnectNote.hidden = false;
      reconnectNote.textContent = "VR表示を準備しています…";
      await buildXRScene();
      reconnectNote.hidden = true;
    }
    const session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor"],
    });
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);
    if (video.paused && displaySpeed >= STOP_SPEED && !video.dataset.playPending && !video.dataset.segmentEnded) {
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
    if (video.paused && !video.dataset.segmentEnded) {
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
