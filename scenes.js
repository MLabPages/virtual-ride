"use strict";

// スマホ側(app.js)と PC/Quest 表示側(display.js)で共有する定義。
//
// 2026-07-11 全面刷新: 旧素材の速度補正をやめ、実際の自転車から撮影された
// ひと続きの前方視点映像だけで構成した。全区間を開始・中盤・終了まで目視し、
// 目線が下がる、横を眺め続ける、空撮、自動車らしい速度の素材を除外している。
//
// baseSpeed は、その映像が等速(×1.0)に見える想定速度 km/h。
// startSec / endSec は、素材の中で実際に使う前向き区間。
window.VR_REFERENCE_SPEED = 18;
window.VR_SCENES = [
  { id: "rice-lane-a", file: "videos/rice-lane-a.mp4", title: "🌾 田園へ向かう道",
    durationSec: 35, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "rice-lane-b", file: "videos/rice-lane-b.mp4", title: "🌾 水田の細道",
    durationSec: 35, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "greenway", file: "videos/greenway.mp4", title: "🌳 田園の並木道",
    durationSec: 40, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "country-homes", file: "videos/country-homes.mp4", title: "🏡 緑のある集落",
    durationSec: 40, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "garden-lane", file: "videos/garden-lane.mp4", title: "🌿 庭先を抜ける道",
    durationSec: 40, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "residential-green", file: "videos/residential-green.mp4", title: "🍃 高台の住宅路",
    durationSec: 40, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
  { id: "red-cycle-road", file: "videos/red-cycle-road.mp4", title: "🚲 赤い自転車道",
    durationSec: 40, baseSpeed: 16, perspective: "forward-rider-eye", sourceSet: "nagakute-ride-2026", viewY: "50%", credit: "https://commons.wikimedia.org/wiki/File:Japan_Cycling_Tour_-_Bike_Ride_in_Japanese_Countryside_-_Nagoya,_Japan_(4K).webm" },
];

window.VR_TUNING = {
  RATE_MIN: 0.30,   // 停止寸前でも映像がカクつきにくい下限
  RATE_MAX: 1.45,   // 誤検出や急な操作で極端な早送りに見えないよう抑える
  STOP_SPEED: 0.8,  // これ未満は「停止」とみなす km/h
};

// 速度(km/h)→ 再生速度(playbackRate)
window.vrRateFor = function (speed, baseSpeed) {
  const t = window.VR_TUNING;
  return Math.min(t.RATE_MAX, Math.max(t.RATE_MIN, speed / baseSpeed));
};

window.vrSceneIndex = function (id) {
  const index = window.VR_SCENES.findIndex((scene) => scene.id === id);
  return index >= 0 ? index : 0;
};

window.vrSceneById = function (id) {
  return window.VR_SCENES.find((s) => s.id === id) || window.VR_SCENES[0];
};

window.vrChapterSceneId = function (id) {
  const list = window.VR_SCENES;
  const index = list.findIndex((s) => s.id === id);
  for (let i = Math.max(0, index); i >= 0; i--) {
    if (list[i].chip !== false) return list[i].id;
  }
  return list[0].id;
};

window.vrRouteEstimateSec = function (referenceSpeed = window.VR_REFERENCE_SPEED) {
  return window.VR_SCENES.reduce((sum, scene) => {
    return sum + (scene.durationSec || 0) * (scene.baseSpeed / referenceSpeed);
  }, 0);
};

// 各映像を「その映像が自然に見える速度」で進んだ距離に置き換え、
// ルート全体の現在地・残り時間をスマホ側と表示側で同じ計算にする。
window.vrRouteDistanceKm = function () {
  return window.VR_SCENES.reduce((sum, scene) => {
    return sum + ((scene.durationSec || 0) * scene.baseSpeed) / 3600;
  }, 0);
};

// 再生位置(動画の生の秒数)→ シーン内での経過秒。startSec より前は 0 とみなす。
window.vrSceneElapsed = function (scene, currentTime = 0) {
  const raw = Math.max(0, (Number(currentTime) || 0) - (scene.startSec || 0));
  return Math.min(scene.durationSec || 0, raw);
};

window.vrRouteProgress = function (sceneId, currentTime = 0) {
  const list = window.VR_SCENES;
  const index = window.vrSceneIndex(sceneId);
  const completedKm = list.slice(0, index).reduce((sum, scene) => {
    return sum + ((scene.durationSec || 0) * scene.baseSpeed) / 3600;
  }, 0);
  const scene = list[index];
  const elapsed = window.vrSceneElapsed(scene, currentTime);
  const currentKm = (elapsed * scene.baseSpeed) / 3600;
  const totalKm = window.vrRouteDistanceKm();
  return totalKm ? Math.min(1, Math.max(0, (completedKm + currentKm) / totalKm)) : 0;
};

window.vrRouteRemainingSec = function (sceneId, currentTime = 0, speed = window.VR_REFERENCE_SPEED) {
  const list = window.VR_SCENES;
  const index = window.vrSceneIndex(sceneId);
  const safeSpeed = Number.isFinite(speed) && speed >= window.VR_TUNING.STOP_SPEED
    ? speed
    : window.VR_REFERENCE_SPEED;
  return list.slice(index).reduce((sum, scene, offset) => {
    const elapsed = offset === 0 ? window.vrSceneElapsed(scene, currentTime) : 0;
    const remainingVideoSec = Math.max(0, (scene.durationSec || 0) - elapsed);
    return sum + remainingVideoSec / window.vrRateFor(safeSpeed, scene.baseSpeed);
  }, 0);
};

window.vrFormatDuration = function (seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest}秒`;
  return rest ? `${minutes}分${rest}秒` : `${minutes}分`;
};

window.vrRouteMinutesText = function () {
  return `${window.VR_REFERENCE_SPEED}km/h想定で約${Math.round(window.vrRouteEstimateSec() / 60)}分`;
};

window.vrApplySceneFraming = function (video, scene) {
  video.style.objectPosition = `center ${scene.viewY || "42%"}`;
};

// 「旅」モード: 今の映像が終わったら次の映像へ。最後まで行ったら先頭へ戻る。
window.vrNextSceneId = function (id) {
  const list = window.VR_SCENES;
  const i = list.findIndex((s) => s.id === id);
  return list[(i + 1) % list.length].id;
};
