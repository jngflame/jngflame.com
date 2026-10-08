// Add models here to include them in random selection and the model menu.
export const heroModels = [
  "outdoor.glb",
  "outdoor2.glb",
  "dog-walking.glb",
] as const;

export type HeroModel = (typeof heroModels)[number];
