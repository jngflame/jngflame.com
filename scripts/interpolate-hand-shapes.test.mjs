import assert from "node:assert/strict";
import test from "node:test";
import { interpolateHandShapes } from "./interpolate-hand-shapes.mjs";

function hand(direction) {
  const points = [[0, 0, 0]];
  for (const [finger, base] of [1, 5, 9, 13, 17].entries()) {
    points[base] = [2 - finger, 2, 0];
    for (let joint = 1; joint <= 3; joint++)
      points[base + joint] = points[base].map(
        (value, axis) => value + joint * direction[axis],
      );
  }
  return points;
}

test("fills all gaps by timestamp, preserves detections and holds edges", () => {
  const left = hand([0, 1, 0]);
  const right = hand([1, 0, 0]);
  const times = [0, 1, 2, 4, 5, 6];
  const shapes = interpolateHandShapes(
    [null, left, null, null, right, null],
    times,
  );
  assert.equal(shapes[0], shapes[1]);
  assert.equal(shapes[5], shapes[4]);
  for (const [frame, angle] of [
    [1, 0],
    [2, Math.PI / 8],
    [3, (Math.PI * 3) / 8],
    [4, Math.PI / 2],
  ]) {
    for (const direction of shapes[frame]) {
      assert.ok(Math.abs(direction.x - Math.sin(angle)) < 1e-10);
      assert.ok(Math.abs(direction.y - Math.cos(angle)) < 1e-10);
      assert.ok(Math.abs(direction.length() - 1) < 1e-10);
    }
  }
});

test("opposite finger directions remain finite and unit length", () => {
  const shapes = interpolateHandShapes(
    [hand([0, 1, 0]), null, hand([0, -1, 0])],
    [0, 1, 2],
  );
  for (const direction of shapes[1])
    assert.ok(Math.abs(direction.length() - 1) < 1e-10);
});

test("a hand with no valid detections remains unavailable", () => {
  assert.deepEqual(interpolateHandShapes([null, null], [0, 1]), [null, null]);
});
