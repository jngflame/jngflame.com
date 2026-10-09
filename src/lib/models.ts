import { type Group, Mesh, SkinnedMesh, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { type HeroModel, heroDanceAnimations } from "../data/heroModels";

export async function loadModel(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status}`);
  }
  const resourcePath = new URL(".", new URL(url, window.location.href)).href;
  return new GLTFLoader().parseAsync(
    await response.arrayBuffer(),
    resourcePath,
  );
}

export async function loadHeroModel(url: string, signal: AbortSignal) {
  const model = await loadModel(url, signal);
  const modelUrl = new URL(url, window.location.href);
  const filename = modelUrl.pathname.split("/").at(-1) as HeroModel;
  const animationFile = heroDanceAnimations[filename];
  if (!animationFile) return model;

  try {
    const dance = await loadModel(
      new URL(`../animations/${animationFile}`, modelUrl).href,
      signal,
    );
    model.animations.push(...dance.animations);
    disposeModel(dance.scene);
  } catch (error) {
    if (signal.aborted) {
      disposeModel(model.scene);
      throw error;
    }
    // A missing optional dance must not prevent the model's built-in actions.
    console.warn("Give it up animation could not be loaded", error);
  }
  return model;
}

export function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
      material.dispose();
    }
  });
  for (const texture of textures) {
    texture.dispose();
    if (texture.image instanceof ImageBitmap) texture.image.close();
  }
}
