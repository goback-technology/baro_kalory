import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("control status spans camera pages and discards responses from a departed camera", async () => {
  const app = await readFile(new URL("../src/app/app.jsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../src/camera/control-status.jsx", import.meta.url), "utf8");
  assert.match(app, /page\?\.camera && <CameraControlStatus/);
  assert.match(panel, /<ControlStatus key=\{activeId\} cameraId=\{activeId\}/);
  assert.match(panel, /!switching/);
  assert.match(panel, /alive\.current = false/);
  assert.match(panel, /token !== generation\.current/);
  assert.match(panel, /request\.abort\(\)/);
  assert.match(panel, /AbortSignal\.timeout\(5000\)/);
});

test("recovery is explicit, serial and followed by a read even on failure", async () => {
  const panel = await readFile(new URL("../src/camera/control-status.jsx", import.meta.url), "utf8");
  assert.match(panel, /useJobPoll\(refresh, \{ intervalMs: 2000, enabled: !unsupported/);
  assert.match(panel, /if \(recovering\.current\) return/);
  assert.match(panel, /summary\?\.canRetry && !error && <button onClick=\{recover\}/);
  assert.match(panel, /disabled=\{retrying\}/);
  const recover = panel.slice(panel.indexOf("async function recover()"), panel.indexOf("const summary ="));
  assert.equal(recover.match(/retryCameraRecovery\(/g)?.length, 1);
  assert.match(recover, /finally \{[\s\S]*await refresh\(\)/);
  assert.doesNotMatch(panel, /setEnabled\(|setActive|cctv\/active|cameraId\s*=\s*control\./);
});
