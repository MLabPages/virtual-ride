"use strict";

// スマホ側(app.js)と Quest 表示側(display.js)で共有する定義。
// すべて一人称視点(ハンドル目線)のサイクリング映像。baseSpeed は
// その映像が「等速(×1.0)」に見える想定の走行速度 km/h。
// この並び順が、そのまま連続再生される「旅」のルートになる。
window.VR_SCENES = [
  { id: "countryside", file: "videos/countryside.mp4", title: "🌾 黄金の田舎道",
    baseSpeed: 22, credit: "https://www.pexels.com/video/4986006/" },
  { id: "town", file: "videos/town.mp4", title: "🏘 静かな街並み",
    baseSpeed: 16, credit: "https://www.pexels.com/video/37681296/" },
  { id: "forest", file: "videos/forest.mp4", title: "🌲 森のトレイル",
    baseSpeed: 16, credit: "https://www.pexels.com/video/5456060/" },
  { id: "openroad", file: "videos/openroad.mp4", title: "🛣 見晴らしの道",
    baseSpeed: 26, credit: "https://www.pexels.com/video/4533593/" },
];

window.VR_TUNING = {
  RATE_MIN: 0.25,   // ブラウザが安定して再生できる下限あたり
  RATE_MAX: 3.0,
  STOP_SPEED: 0.8,  // これ未満は「停止」とみなす km/h
};

// 速度(km/h)→ 再生速度(playbackRate)
window.vrRateFor = function (speed, baseSpeed) {
  const t = window.VR_TUNING;
  return Math.min(t.RATE_MAX, Math.max(t.RATE_MIN, speed / baseSpeed));
};

window.vrSceneById = function (id) {
  return window.VR_SCENES.find((s) => s.id === id) || window.VR_SCENES[0];
};

// 「旅」モード: 今の映像が終わったら次の映像へ。最後まで行ったら先頭へ戻る。
// 1本をループさせず、景色が移り変わっていくので飽きにくい。
window.vrNextSceneId = function (id) {
  const list = window.VR_SCENES;
  const i = list.findIndex((s) => s.id === id);
  return list[(i + 1) % list.length].id;
};
