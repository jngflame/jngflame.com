// Add models here to include them in random selection and the model menu.
export const heroModels = [
  "kapadokya.glb",
  "altin-arasan.glb",
  "dog-walking.glb",
] as const;

export type HeroModel = (typeof heroModels)[number];
