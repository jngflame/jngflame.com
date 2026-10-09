// Convert estimated landmarks into model-specific, animation-only GLBs.
// Usage: node scripts/retarget-dance.mjs /path/to/poses.json output-directory
import fs from "node:fs";
import path from "node:path";
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { interpolateHandShapes } from "./interpolate-hand-shapes.mjs";

const poses = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const handShapes =
  poses.hands &&
  Object.fromEntries(
    ["Left", "Right"].map((side) => [
      side,
      interpolateHandShapes(poses.hands[side], poses.times),
    ]),
  );
const destination = process.argv[3] ?? "public/animations";
fs.mkdirSync(destination, { recursive: true });
const vector = (p) => new Vector3(...p);
const mean = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const basis = (side, up) => {
  const y = up.clone().normalize();
  const x = side.clone().addScaledVector(y, -side.dot(y)).normalize();
  const z = x.clone().cross(y).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(x, y, z),
  );
};
const worldPosition = (node) => node.getWorldPosition(new Vector3());
const worldRotation = (node) => node.getWorldQuaternion(new Quaternion());

for (const filename of fs
  .readdirSync("public/glb")
  .filter((name) => name.endsWith(".glb"))) {
  const original = fs.readFileSync(`public/glb/${filename}`);
  const source = JSON.parse(
    original.subarray(20, 20 + original.readUInt32LE(12)),
  );
  const nodes = source.nodes.map((node) => {
    const object = new Object3D();
    object.name = node.name ?? "";
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.matrix) {
      object.matrix.fromArray(node.matrix);
      object.matrix.decompose(object.position, object.quaternion, object.scale);
    }
    return object;
  });
  source.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) nodes[index].add(nodes[child]);
  });
  const root = new Object3D();
  for (const index of source.scenes[source.scene ?? 0].nodes)
    root.add(nodes[index]);
  root.updateMatrixWorld(true);
  const bone = (name) =>
    nodes.find((node) => node.name === `mixamorig:${name}`);
  const hips = bone("Hips");
  if (!hips) throw new Error(`${filename}: Mixamo hips are missing`);
  const restPosition = new Map(
    nodes.map((node) => [node, worldPosition(node)]),
  );
  const restRotation = new Map(
    nodes.map((node) => [node, worldRotation(node)]),
  );
  const hipCenter = restPosition.get(hips);
  const shoulderCenter = mean(
    restPosition.get(bone("LeftArm")),
    restPosition.get(bone("RightArm")),
  );
  const restBody = basis(
    restPosition
      .get(bone("LeftUpLeg"))
      .clone()
      .sub(restPosition.get(bone("RightUpLeg"))),
    shoulderCenter.clone().sub(hipCenter),
  );
  const inverseBody = restBody.clone().invert();
  const initialWorld = poses.world[0].map(vector);
  const initialChest = mean(initialWorld[11], initialWorld[12]);
  const initialUp = initialChest
    .clone()
    .sub(mean(initialWorld[23], initialWorld[24]));
  const initialChestFrame = basis(
    initialWorld[11].clone().sub(initialWorld[12]),
    initialUp,
  );
  // The source camera's elevation is baked into monocular landmark depth.
  // Align the neutral opening torso to the model before retargeting every
  // segment, preserving subsequent body lean and the model's bone lengths.
  const captureAlignment = restBody
    .clone()
    .multiply(initialChestFrame.clone().invert());
  const initialHeadFrame = basis(
    initialWorld[7].clone().sub(initialWorld[8]),
    mean(initialWorld[7], initialWorld[8]).sub(initialChest),
  );
  // Ear-to-chest depth contains an anatomical offset, not just a head nod.
  // Calibrate that offset from the neutral first frame before applying motion.
  const inverseInitialHeadRelative = initialChestFrame
    .clone()
    .invert()
    .multiply(initialHeadFrame)
    .invert();
  const modelHeight =
    restPosition.get(bone("Head")).y -
    Math.min(
      restPosition.get(bone("LeftFoot")).y,
      restPosition.get(bone("RightFoot")).y,
    ) +
    0.12;
  const initialImage = poses.image[0];
  const initialHip = mean(vector(initialImage[23]), vector(initialImage[24]));
  const imageHeight = Math.max(
    0.4,
    (initialImage[27][1] + initialImage[28][1]) / 2 - initialImage[0][1],
  );
  const tracks = new Map();
  const fingers = [
    ["Thumb", 1],
    ["Index", 5],
    ["Middle", 9],
    ["Ring", 13],
    ["Pinky", 17],
  ];
  const names = [
    "Hips",
    "Spine",
    "Spine1",
    "Spine2",
    "Neck",
    "Head",
    "LeftShoulder",
    "RightShoulder",
    "LeftArm",
    "RightArm",
    "LeftForeArm",
    "RightForeArm",
    "LeftHand",
    "RightHand",
    "LeftUpLeg",
    "RightUpLeg",
    "LeftLeg",
    "RightLeg",
    "LeftFoot",
    "RightFoot",
  ];
  if (poses.hands) {
    for (const side of ["Left", "Right"])
      for (const [finger] of fingers)
        for (let joint = 1; joint <= 3; joint++)
          names.push(`${side}Hand${finger}${joint}`);
  }
  for (const name of names) {
    if (!bone(name)) throw new Error(`${filename}: ${name} is missing`);
    tracks.set(bone(name), []);
  }
  const translations = [];
  const lastRotations = new Map();

  for (let frame = 0; frame < poses.times.length; frame++) {
    const p = poses.world[frame].map((point) =>
      vector(point).applyQuaternion(captureAlignment),
    );
    const pelvis = mean(p[23], p[24]);
    const chest = mean(p[11], p[12]);
    const up = chest.clone().sub(pelvis);
    const pelvisDelta = basis(p[23].clone().sub(p[24]), up).multiply(
      inverseBody,
    );
    const chestDelta = basis(p[11].clone().sub(p[12]), up).multiply(
      inverseBody,
    );
    const global = new Map();
    const setBody = (name, delta) =>
      global.set(
        bone(name),
        delta.clone().multiply(restRotation.get(bone(name))),
      );
    setBody("Hips", pelvisDelta);
    for (const [name, blend] of [
      ["Spine", 0.33],
      ["Spine1", 0.66],
      ["Spine2", 1],
    ]) {
      setBody(name, pelvisDelta.clone().slerp(chestDelta, blend));
    }
    setBody("LeftShoulder", chestDelta);
    setBody("RightShoulder", chestDelta);
    setBody("Neck", chestDelta);
    // Head orientation uses the ear axis. Facial landmarks do not animate lips
    // or eyes.
    const earCenter = mean(p[7], p[8]);
    const headUp = earCenter.clone().sub(chest);
    const chestFrame = basis(p[11].clone().sub(p[12]), up);
    const headRelative = chestFrame
      .clone()
      .invert()
      .multiply(basis(p[7].clone().sub(p[8]), headUp))
      .multiply(inverseInitialHeadRelative);
    setBody("Head", chestDelta.clone().multiply(headRelative));
    const aim = (name, childName, direction, delta) => {
      if (direction.lengthSq() < 1e-8) {
        setBody(name, delta);
        return;
      }
      const object = bone(name);
      const restDirection = restPosition
        .get(bone(childName))
        .clone()
        .sub(restPosition.get(object))
        .normalize()
        .applyQuaternion(delta);
      const swing = new Quaternion().setFromUnitVectors(
        restDirection,
        direction.normalize(),
      );
      global.set(
        object,
        swing.multiply(delta).multiply(restRotation.get(object)),
      );
    };
    for (const [side, s, e, w, index, pinky, h, k, a, toe] of [
      ["Left", 11, 13, 15, 19, 17, 23, 25, 27, 31],
      ["Right", 12, 14, 16, 20, 18, 24, 26, 28, 32],
    ]) {
      aim(`${side}Arm`, `${side}ForeArm`, p[e].clone().sub(p[s]), chestDelta);
      aim(`${side}ForeArm`, `${side}Hand`, p[w].clone().sub(p[e]), chestDelta);
      aim(
        `${side}Hand`,
        `${side}HandMiddle1`,
        mean(p[index], p[pinky]).sub(p[w]),
        chestDelta,
      );
      aim(`${side}UpLeg`, `${side}Leg`, p[k].clone().sub(p[h]), pelvisDelta);
      aim(`${side}Leg`, `${side}Foot`, p[a].clone().sub(p[k]), pelvisDelta);
      aim(
        `${side}Foot`,
        `${side}ToeBase`,
        p[toe].clone().sub(p[a]),
        pelvisDelta,
      );
      if (poses.hands) {
        const wrist = bone(`${side}Hand`);
        const handDelta = global
          .get(wrist)
          .clone()
          .multiply(restRotation.get(wrist).clone().invert());
        const shape = handShapes[side][frame];
        const restPalm = basis(
          restPosition
            .get(bone(`${side}HandIndex1`))
            .clone()
            .sub(restPosition.get(bone(`${side}HandPinky1`))),
          restPosition
            .get(bone(`${side}HandMiddle1`))
            .clone()
            .sub(restPosition.get(wrist)),
        );
        const fingerAlignment = handDelta.clone().multiply(restPalm);
        for (const [fingerIndex, [finger]] of fingers.entries()) {
          for (let joint = 1; joint <= 3; joint++) {
            const name = `${side}Hand${finger}${joint}`;
            if (shape) {
              aim(
                name,
                `${side}Hand${finger}${joint + 1}`,
                shape[fingerIndex * 3 + joint - 1]
                  .clone()
                  .applyQuaternion(fingerAlignment),
                handDelta,
              );
            } else {
              setBody(name, handDelta);
            }
          }
        }
      }
    }
    for (const [object, values] of tracks) {
      const parentRotation =
        global.get(object.parent) ??
        restRotation.get(object.parent) ??
        new Quaternion();
      const local = parentRotation
        .clone()
        .invert()
        .multiply(global.get(object))
        .normalize();
      const previous = lastRotations.get(object);
      // q and -q are the same orientation. Keep signs continuous for GLTF's
      // linear rotation interpolation and limit isolated inferred-depth spikes.
      if (previous) {
        if (previous.dot(local) < 0)
          local.set(-local.x, -local.y, -local.z, -local.w);
        const angle = previous.angleTo(local);
        const maxStep = 9.75 * (poses.times[frame] - poses.times[frame - 1]);
        if (angle > maxStep) {
          const target = local.clone();
          local.copy(previous).slerp(target, maxStep / angle);
        }
      }
      values.push(...local.toArray());
      lastRotations.set(object, local.clone());
    }
    const imageHip = mean(
      vector(poses.image[frame][23]),
      vector(poses.image[frame][24]),
    );
    const position = hips.position.clone();
    position.x += ((imageHip.x - initialHip.x) * modelHeight) / imageHeight;
    position.y -= ((imageHip.y - initialHip.y) * modelHeight) / imageHeight;
    translations.push(...position.toArray());
  }

  const chunks = [];
  const views = [];
  const accessors = [];
  let byteLength = 0;
  const accessor = (values, size, type) => {
    const data = Buffer.from(new Float32Array(values).buffer);
    const view = views.length;
    views.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: data.byteLength,
    });
    byteLength += data.byteLength;
    chunks.push(data);
    const index = accessors.length;
    const definition = {
      bufferView: view,
      componentType: 5126,
      count: values.length / size,
      type,
    };
    if (size === 1) {
      definition.min = [values[0]];
      definition.max = [values.at(-1)];
    }
    accessors.push(definition);
    return index;
  };
  const input = accessor(poses.times, 1, "SCALAR");
  const samplers = [];
  const channels = [];
  const addTrack = (object, values, property, size, type) => {
    const sampler = samplers.length;
    samplers.push({
      input,
      output: accessor(values, size, type),
      interpolation: "LINEAR",
    });
    channels.push({
      sampler,
      target: { node: nodes.indexOf(object), path: property },
    });
  };
  for (const [object, values] of tracks)
    addTrack(object, values, "rotation", 4, "VEC4");
  addTrack(hips, translations, "translation", 3, "VEC3");
  const gltf = {
    asset: {
      version: "2.0",
      generator:
        poses.method ?? "jngflame video pose retargeting (estimated motion)",
    },
    scene: source.scene ?? 0,
    scenes: source.scenes,
    nodes: source.nodes.map(
      ({ name, children, translation, rotation, scale, matrix }) => ({
        name,
        children,
        translation,
        rotation,
        scale,
        matrix,
      }),
    ),
    animations: [{ name: "give_it_up", samplers, channels }],
    buffers: [{ byteLength }],
    bufferViews: views,
    accessors,
  };
  const rawJson = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 0x20);
  rawJson.copy(json);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  const output = path.join(destination, `give-it-up-${filename}`);
  fs.writeFileSync(output, Buffer.concat([header, json, binaryHeader, binary]));
  console.log(
    `${output}: ${poses.times.at(-1).toFixed(2)}s, ${channels.length} tracks, ${Math.round(fs.statSync(output).size / 1024)} KB`,
  );
}
