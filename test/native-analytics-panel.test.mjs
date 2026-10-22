import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("native panel is scoped to FlexWATCH identity and keeps its own matching image stage", async () => {
  const page = await readFile(new URL("../src/pages/cctv/page.jsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../src/pages/cctv/native-analytics-panel.jsx", import.meta.url), "utf8");
  assert.match(page, /device\.id === cam\.activeId\)\?\.type === "flexwatch"/);
  assert.match(page, /<NativeAnalyticsPanel key=\{cam\.activeId\} cameraId=\{cam\.activeId\}/);
  assert.match(panel, /<img key=\{frameKey\} src=\{pair\.url\}/);
  assert.match(panel, /loadedFrame === frameKey && <svg/);
  assert.match(panel, /naturalWidth === detection\.image\.width && event\.currentTarget\.naturalHeight === detection\.image\.height/);
  assert.doesNotMatch(panel, /api\("\/(snapshot|stream|cctv\/active)"\)/);
});

test("panel releases subscription on leave and freezes before explicit ONI analysis", async () => {
  const panel = await readFile(new URL("../src/pages/cctv/native-analytics-panel.jsx", import.meta.url), "utf8");
  assert.match(panel, /abort\.abort\(\); analysis\.current\?\.abort\(\); client\.destroy\(\)/);
  assert.match(panel, /document\.removeEventListener\("visibilitychange", pause\)/);
  const analyze = panel.slice(panel.indexOf("async function analyze()"), panel.indexOf("const detection ="));
  assert.ok(analyze.indexOf("stop();") < analyze.indexOf("analyzeDisplayedFrame(selected"));
  assert.match(analyze, /if \(!abort\.signal\.aborted\) setOni\(result\)/);
  assert.match(panel, /setAnalyzing\(false\); setOni\(null\)/);
  assert.match(panel, /status\.stale \|\| detection\.stale/);
  assert.match(panel, /status\.streamEpoch !== detection\.streamEpoch/);
});
