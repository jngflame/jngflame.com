import type { AnimationAction, AnimationMixer } from "three";

export function syncMusicAnimation(
  action: AnimationAction,
  mixer: AnimationMixer,
  time: number,
) {
  // Sample the pose at the media clock instead of accumulating frame deltas.
  action.paused = true;
  action.time = Math.min(action.getClip().duration, Math.max(0, time));
  mixer.update(0);
}
