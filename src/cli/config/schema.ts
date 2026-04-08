import { z } from "zod";

export const modelEntrySchema = z.object({
  name: z.string().min(1),
  baseURL: z.string().min(1),
  APIKey: z.string().min(1),
});

export const helixentConfigSchema = z.object({
  models: z.array(modelEntrySchema).min(1),
});

export type HelixentConfig = z.infer<typeof helixentConfigSchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
