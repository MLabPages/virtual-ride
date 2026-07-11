import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scenesSource = read("./scenes.js");
const appSource = read("./app.js");
const displaySource = read("./display.js");
const indexHtml = read("./index.html");
const displayHtml = read("./display.html");

const context = { window: {} };
vm.runInNewContext(scenesSource, context, { filename: "scenes.js" });
const vr = context.window;

assert.ok(Array.isArray(vr.VR_SCENES), "VR_SCENES must be an array");
assert.ok(vr.VR_SCENES.length >= 8, "route should contain at least 8 scenes");
assert.equal(new Set(vr.VR_SCENES.map((scene) => scene.id)).size, vr.VR_SCENES.length, "scene ids must be unique");
const blockedSceneIds = new Set(["countryside", "forest", "seashore-hotel-zone", "green-hill-road"]);
const blockedFiles = new Set(["videos/countryside.mp4", "videos/forest.mp4"]);

for (const scene of vr.VR_SCENES) {
  assert.match(scene.id, /^[a-z0-9-]+$/, `invalid scene id: ${scene.id}`);
  assert.ok(scene.title && typeof scene.title === "string", `missing title: ${scene.id}`);
  assert.ok(Number.isFinite(scene.durationSec) && scene.durationSec > 0, `invalid duration: ${scene.id}`);
  assert.ok(Number.isFinite(scene.baseSpeed) && scene.baseSpeed > 0, `invalid base speed: ${scene.id}`);
  assert.equal(scene.perspective, "forward-rider-eye", `scene is not approved rider-eye perspective: ${scene.id}`);
  assert.ok(!blockedSceneIds.has(scene.id), `previously rejected scene was restored: ${scene.id}`);
  assert.ok(!blockedFiles.has(scene.file), `low rider-eye video was restored: ${scene.file}`);
  // 走行の体感が自転車から離れすぎないよう、基準速度は自転車レンジに収める
  assert.ok(scene.baseSpeed >= 10 && scene.baseSpeed <= 30, `base speed out of cycling range: ${scene.id}`);
  if (scene.startSec != null) {
    assert.ok(Number.isFinite(scene.startSec) && scene.startSec >= 0, `invalid startSec: ${scene.id}`);
  }
  if (scene.endSec != null) {
    assert.ok(Number.isFinite(scene.endSec) && scene.endSec > (scene.startSec || 0), `invalid endSec: ${scene.id}`);
    assert.ok(
      Math.abs(scene.endSec - (scene.startSec || 0) - scene.durationSec) < 0.01,
      `durationSec must match startSec/endSec: ${scene.id}`
    );
  }
  assert.match(scene.credit, /^https:\/\/(mixkit\.co\/free-stock-video|www\.pexels\.com\/video)\//, `invalid credit: ${scene.id}`);
  // 配信の安定のため、映像はすべてローカル同梱とする(remote URL は不可)
  assert.ok(!/^https:\/\//.test(scene.file), `scene must use a bundled local file: ${scene.id}`);
  assert.ok(existsSync(new URL(`./${scene.file}`, import.meta.url)), `missing local video: ${scene.file}`);
}

const routeMinutes = vr.vrRouteEstimateSec() / 60;
assert.ok(routeMinutes >= 2.5 && routeMinutes <= 15, `unexpected route length: ${routeMinutes.toFixed(1)} min`);
assert.equal(vr.vrNextSceneId(vr.VR_SCENES.at(-1).id), vr.VR_SCENES[0].id, "route must loop to the first scene");
assert.equal(vr.vrRouteProgress(vr.VR_SCENES[0].id, 0), 0, "route should start at 0%");
const lastScene = vr.VR_SCENES.at(-1);
assert.ok(
  vr.vrRouteProgress(lastScene.id, (lastScene.startSec || 0) + lastScene.durationSec) > 0.99,
  "route should finish near 100%"
);

function assertReferencedIdsExist(source, html, label) {
  const ids = [...source.matchAll(/\$\("([A-Za-z][A-Za-z0-9_-]*)"\)/g)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    assert.ok(html.includes(`id="${id}"`), `${label} references missing #${id}`);
  }
}

function assertUniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([A-Za-z][A-Za-z0-9_-]*)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${label} contains duplicate ids`);
}

assertReferencedIdsExist(appSource, indexHtml, "app.js");
assertReferencedIdsExist(displaySource, displayHtml, "display.js");
assertUniqueIds(indexHtml, "index.html");
assertUniqueIds(displayHtml, "display.html");
assert.ok(!indexHtml.includes("通信は一切行いません"), "privacy copy must not deny required network access");
assert.ok(displaySource.includes("await import(\"https://unpkg.com/three@0.160.0/"), "Three.js must remain lazy-loaded for optional VR");
assert.ok(appSource.includes("cameraRequestId"), "camera permission race guard is required");
assert.ok(displaySource.includes("pendingSceneId"), "display scene transition de-duplication is required");
assert.ok(appSource.includes("sceneTime:"), "sender must include the current scene time");
assert.ok(displaySource.includes("syncRemotePlayback"), "display must correct remote playback drift");
assert.ok(appSource.includes("dataset.segmentEnded"), "controller must stop at curated segment boundaries");
assert.ok(displaySource.includes("dataset.segmentEnded"), "display must stop at curated segment boundaries");

const town = vr.vrSceneById("town");
const dawn = vr.vrSceneById("dawn-road");
assert.ok(vr.vrRateFor(16, town.baseSpeed) <= 0.7, "town must remain slowed at 16km/h");
assert.ok(vr.vrRateFor(16, dawn.baseSpeed) >= 1.2, "dawn introduction must remain brisk at 16km/h");

console.log(`Verified ${vr.VR_SCENES.length} scenes / ${routeMinutes.toFixed(1)} min / ${vr.vrRouteDistanceKm().toFixed(2)} km`);
