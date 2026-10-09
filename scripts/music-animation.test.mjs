import assert from "node:assert/strict";
import test from "node:test";
import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  NumberKeyframeTrack,
  Object3D,
} from "three";
import { syncMusicAnimation } from "../src/lib/musicAnimation.ts";

function fixture() {
  const model = new Object3D();
  const mixer = new AnimationMixer(model);
  const clip = new AnimationClip("give_it_up", 240, [
    new NumberKeyframeTrack(".position[x]", [0, 120, 240], [0, 12, 0]),
  ]);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  action.clampWhenFinished = true;
  return { model, mixer, action };
}

test("forward and backward seeks sample the corresponding Three.js pose", () => {
  const { model, mixer, action } = fixture();
  syncMusicAnimation(action, mixer, 60);
  assert.equal(model.position.x, 6);
  syncMusicAnimation(action, mixer, 180);
  assert.equal(model.position.x, 6);
  syncMusicAnimation(action, mixer, 20);
  assert.equal(model.position.x, 2);
});

test("a paused or buffering media clock keeps the pose fixed without accumulating drift", () => {
  const { model, mixer, action } = fixture();
  for (let frame = 0; frame < 600; frame++) {
    syncMusicAnimation(action, mixer, 70);
  }
  assert.equal(action.time, 70);
  assert.equal(model.position.x, 7);
  syncMusicAnimation(action, mixer, 125);
  assert.equal(action.time, 125);
  assert.equal(model.position.x, 11.5);
});

test("the final pose remains seekable without a mixer finished event", () => {
  const { model, mixer, action } = fixture();
  let finished = 0;
  mixer.addEventListener("finished", () => finished++);
  syncMusicAnimation(action, mixer, 250);
  assert.equal(action.time, 240);
  assert.equal(model.position.x, 0);
  syncMusicAnimation(action, mixer, 60);
  assert.equal(model.position.x, 6);
  syncMusicAnimation(action, mixer, -5);
  assert.equal(action.time, 0);
  assert.equal(finished, 0);
});
