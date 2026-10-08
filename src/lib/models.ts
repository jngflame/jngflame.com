import { type Group, Mesh, SkinnedMesh, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
