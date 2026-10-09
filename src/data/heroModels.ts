// Add models here to include them in random selection and the model menu.
export const heroModels = [
  "kapadokya.glb",
  "altin-arasan.glb",
  "dog-walking.glb",
] as const;

export type HeroModel = (typeof heroModels)[number];

export const heroDanceAnimations: Partial<Record<HeroModel, string>> = {
  "kapadokya.glb": "give-it-up-kapadokya.glb",
  "altin-arasan.glb": "give-it-up-altin-arasan.glb",
  "dog-walking.glb": "give-it-up-dog-walking.glb",
};
