"use strict";

// スマホ側(app.js)と PC/Quest 表示側(display.js)で共有する定義。
//
// 2026-07-11 全面見直し: 全15本を1本ずつ検査し、以下の基準で8本に絞った。
//  - 走行視点(前方を向いたハンドル/車載目線)であること。空撮・固定カメラ・
//    横から海を眺めるだけの映像(旧 seashore-hotel-zone 等)は除外
//  - 「動きの量」(縮小グレー画像の隣接フレーム平均差分)を全編で計測し、
//    等速再生時の体感速度が自転車視点(動き量15前後)に揃うよう baseSpeed を決定。
//    遠景ばかりで動き量が極端に低い空きハイウェイ(1〜3)は補正不能なので除外
//  - 配信が不安定な remote URL(旧 evening-road は接続不能)をやめ、全て同梱
//
// baseSpeed は、その映像が等速(×1.0)に見える想定速度 km/h。
// startSec を指定すると、その秒数から再生を始める(遅い導入のスキップ用)。
window.VR_REFERENCE_SPEED = 18;
window.VR_SCENES = [
  { id: "town", file: "videos/town.mp4", title: "🏘 静かな街並み",
    durationSec: 29, baseSpeed: 15, viewY: "50%", credit: "https://www.pexels.com/video/37681296/" },
  { id: "countryside", file: "videos/countryside.mp4", title: "🌾 黄金の田舎道",
    durationSec: 35, baseSpeed: 18, viewY: "50%", credit: "https://www.pexels.com/video/4986006/" },
  { id: "tree-road", file: "videos/tree-road.mp4", title: "🌳 並木のトンネル",
    durationSec: 6, baseSpeed: 17, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-an-empty-road-covered-in-trees-4852/" },
  { id: "forest", file: "videos/forest.mp4", title: "🌲 森のトレイル",
    durationSec: 19, baseSpeed: 14, viewY: "50%", credit: "https://www.pexels.com/video/5456060/" },
  { id: "openroad", file: "videos/openroad.mp4", title: "🛣 ひらけた道",
    durationSec: 53, baseSpeed: 18, viewY: "50%", credit: "https://www.pexels.com/video/4533593/" },
  { id: "coast", file: "videos/coast.mp4", title: "🌊 海辺の町へ",
    durationSec: 26, baseSpeed: 18, viewY: "48%", credit: "https://mixkit.co/free-stock-video/roading-through-a-small-coastal-town-4165/" },
  { id: "mountain-highway", file: "videos/mountain-highway.mp4", title: "⛰ 山あいの道",
    durationSec: 22, baseSpeed: 16, viewY: "50%", credit: "https://mixkit.co/free-stock-video/highway-in-the-middle-of-a-mountain-range-4633/" },
  { id: "dawn-road", file: "videos/dawn-road.mp4", title: "🌅 朝焼けの帰り道",
    durationSec: 15, startSec: 8, baseSpeed: 16, viewY: "50%", credit: "https://mixkit.co/free-stock-video/gliding-along-a-quiet-asphalt-road-at-dawn-the-soft-52452/" },
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
