import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    order: z.number(),
    lastUpdated: z.coerce.date(),
    keywords: z.array(z.string()).default([]),
    schema: z.enum(['TechArticle', 'HowTo', 'Article', 'WebApplication']).default('TechArticle'),
    interactive: z.boolean().default(false),
  }),
});

export const collections = { docs };
