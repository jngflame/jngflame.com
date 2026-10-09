import { Matrix4, Quaternion, Vector3 } from "three";

// Separate finger shape from palm orientation before filling tracking gaps.
// Interpolate unit directions on a sphere so opposite poses do not shrink bones.
export function interpolateHandShapes(frames, times) {
  const shapes = times.map((_, frame) => {
    const points = frames?.[frame]?.map((point) => new Vector3(...point));
    if (points?.length !== 21) return null;
    const y = points[9].clone().sub(points[0]).normalize();
    const across = points[5].clone().sub(points[17]);
    const x = across.clone().addScaledVector(y, -across.dot(y)).normalize();
    const z = x.clone().cross(y);
    if (z.lengthSq() < 1e-12) return null;
    const inversePalm = new Quaternion()
      .setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
      .invert();
    const directions = [];
    for (const base of [1, 5, 9, 13, 17]) {
      for (let joint = 0; joint < 3; joint++) {
        const direction = points[base + joint + 1]
          .clone()
          .sub(points[base + joint])
          .applyQuaternion(inversePalm);
        if (direction.lengthSq() < 1e-12) return null;
        directions.push(direction.normalize());
      }
    }
    return directions;
  });
  const valid = shapes.flatMap((shape, index) => (shape ? [index] : []));
  if (!valid.length) return shapes;
  for (let frame = 0; frame < valid[0]; frame++)
    shapes[frame] = shapes[valid[0]];
  for (let pair = 1; pair < valid.length; pair++) {
    const left = valid[pair - 1];
    const right = valid[pair];
    for (let frame = left + 1; frame < right; frame++) {
      const alpha = (times[frame] - times[left]) / (times[right] - times[left]);
      shapes[frame] = shapes[left].map((direction, joint) => {
        const turn = new Quaternion().setFromUnitVectors(
          direction,
          shapes[right][joint],
        );
        const blend = new Quaternion().slerp(turn, alpha);
        return direction.clone().applyQuaternion(blend).normalize();
      });
    }
  }
  for (let frame = valid.at(-1) + 1; frame < shapes.length; frame++)
    shapes[frame] = shapes[valid.at(-1)];
  return shapes;
}
