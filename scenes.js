"use strict";

// スマホ側(app.js)と PC/Quest 表示側(display.js)で共有する定義。
// 実験で使う「漕いで前に進む感覚」を優先し、横移動・空撮・徒歩・水辺だけの映像は除外。
// baseSpeed は、その映像が等速(×1.0)に見える想定速度 km/h。
// 車載に近い素材は自転車速度で自然に見えるよう高めに置き、18km/h前後で約10分半のルートにしている。
const MIXKIT = "https://assets.mixkit.co";

window.VR_REFERENCE_SPEED = 18;
window.VR_SCENES = [
  { id: "coast", file: "videos/coast.mp4", title: "🌊 海沿いの道路",
    durationSec: 27, baseSpeed: 24, viewY: "48%", credit: "https://mixkit.co/free-stock-video/roading-through-a-small-coastal-town-4165/" },
  { id: "beach-town-streets", file: `${MIXKIT}/videos/2592/2592-720.mp4`, title: "🌊 海辺の町道",
    durationSec: 11, baseSpeed: 22, viewY: "50%", credit: "https://mixkit.co/free-stock-video/streets-of-a-beach-town-2592/", chip: false },
  { id: "seashore-hotel-zone", file: `${MIXKIT}/videos/4077/4077-720.mp4`, title: "🌊 海岸沿いのホテル街",
    durationSec: 29, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/hotel-zone-near-the-seashore-4077/", chip: false },

  { id: "mountain-open-road", file: `${MIXKIT}/active_storage/video_items/100341/1723061354/100341-video-720.mp4`, title: "⛰ 山道へ",
    durationSec: 21, baseSpeed: 38, viewY: "48%", credit: "https://mixkit.co/free-stock-video/scenic-highway-with-mountains-and-open-sky-100341/" },
  { id: "mountain-highway", file: `${MIXKIT}/videos/4633/4633-720.mp4`, title: "⛰ 山あいの道",
    durationSec: 22, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/highway-in-the-middle-of-a-mountain-range-4633/", chip: false },
  { id: "green-hill-road", file: `${MIXKIT}/videos/41537/41537-720.mp4`, title: "⛰ 丘のカーブ道",
    durationSec: 29, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/curvy-road-on-a-tree-covered-hill-41537/", chip: false },
  { id: "curved-mountain-road", file: `${MIXKIT}/videos/41576/41576-720.mp4`, title: "⛰ 山の連続カーブ",
    durationSec: 50, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/going-down-a-curved-highway-through-a-mountain-range-41576/", chip: false },

  { id: "tree-road", file: `${MIXKIT}/videos/4852/4852-720.mp4`, title: "🌲 木々に包まれた道路",
    durationSec: 7, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-an-empty-road-covered-in-trees-4852/" },
  { id: "dawn-road", file: `${MIXKIT}/videos/52452/52452-720.mp4`, title: "🌲 夜明けの一本道",
    durationSec: 24, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/gliding-along-a-quiet-asphalt-road-at-dawn-the-soft-52452/", chip: false },
  { id: "black-road-sun", file: `${MIXKIT}/videos/52454/52454-720.mp4`, title: "🌲 陽の差す道",
    durationSec: 31, baseSpeed: 30, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-along-from-the-driver-point-of-view-over-an-52454/", chip: false },

  { id: "evening-road", file: `${MIXKIT}/videos/41575/41575-720.mp4`, title: "🌄 夕方の道",
    durationSec: 20, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-a-nature-road-at-dusk-41575/" },
  { id: "driver-asphalt", file: `${MIXKIT}/videos/52453/52453-720.mp4`, title: "🌄 アスファルトの直線路",
    durationSec: 18, baseSpeed: 34, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-along-from-the-driver-point-of-view-on-an-52453/", chip: false },
  { id: "sunny-highway", file: `${MIXKIT}/videos/42368/42368-720.mp4`, title: "🌄 晴れた直線路",
    durationSec: 12, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-the-highway-on-a-sunny-day-42368/", chip: false },
  { id: "fast-open-road", file: `${MIXKIT}/videos/44651/44651-720.mp4`, title: "🌄 ひらけた道",
    durationSec: 13, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-fast-by-car-on-a-road-in-point-of-44651/", chip: false },
  { id: "straight-highway", file: `${MIXKIT}/videos/44655/44655-720.mp4`, title: "🌄 まっすぐ続く道",
    durationSec: 20, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/speedy-point-of-view-tour-of-a-highway-44655/", chip: false },
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

window.vrRouteProgress = function (sceneId, currentTime = 0) {
  const list = window.VR_SCENES;
  const index = window.vrSceneIndex(sceneId);
  const completedKm = list.slice(0, index).reduce((sum, scene) => {
    return sum + ((scene.durationSec || 0) * scene.baseSpeed) / 3600;
  }, 0);
  const scene = list[index];
  const elapsed = Math.min(
    scene.durationSec || 0,
    Math.max(0, Number(currentTime) || 0)
  );
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
    const elapsed = offset === 0 ? Math.max(0, Number(currentTime) || 0) : 0;
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
