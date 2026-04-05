import { HydraDBClient } from '@hydra_db/node';
import type { Article } from '../types/article.js';

const TENANT_ID = 'llm-wiki';
const KNOWLEDGE_SUB_TENANT = 'articles';
const MEMORY_SUB_TENANT = 'user';

let clientInstance: HydraDBClient | null = null;

/**
 * Get or create the HydraDB client singleton.
 * Returns null if HYDRADB_API_KEY is not set (graceful degradation).
 */
export function getHydraClient(): HydraDBClient | null {
  if (clientInstance) return clientInstance;

  const token = process.env['HYDRADB_API_KEY'];
  if (!token) return null;

  clientInstance = new HydraDBClient({ token });
  return clientInstance;
}

/**
 * Ensure the llm-wiki tenant exists in HydraDB.
 */
export async function ensureTenant(): Promise<void> {
  const client = getHydraClient();
  if (!client) return;

  try {
    await client.tenant.create({ tenant_id: TENANT_ID });
  } catch {
    // Tenant already exists — safe to ignore
  }
}

/**
 * Sync a single article to HydraDB as a memory item.
 * Called after every saveArticle() to keep HydraDB in sync.
 */
export async function syncArticle(article: Article): Promise<void> {
  const client = getHydraClient();
  if (!client) return;

  const content = `# ${article.frontmatter.title}\n\n${article.frontmatter.summary}\n\n${article.body}`;

  try {
    await client.upload.addMemory({
      memories: [
        {
          source_id: article.slug,
          title: article.frontmatter.title,
          text: content,
          is_markdown: true,
          infer: true,
          document_metadata: JSON.stringify({
            slug: article.slug,
            type: article.frontmatter.type,
            categories: article.frontmatter.categories.join(', '),
          }),
        },
      ],
      tenant_id: TENANT_ID,
      sub_tenant_id: KNOWLEDGE_SUB_TENANT,
      upsert: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[HYDRA] Warning: sync failed for ${article.slug} — ${msg}\n`);
  }
}

/**
 * Sync all articles to HydraDB (bulk).
 */
export async function syncAllArticles(articles: Article[]): Promise<number> {
  const client = getHydraClient();
  if (!client) return 0;

  await ensureTenant();

  let synced = 0;
  for (const article of articles) {
    await syncArticle(article);
    synced++;
  }
  return synced;
}

/**
 * Semantic recall — query HydraDB for relevant context.
 * Returns ranked chunks with content and scores.
 */
export interface HydraRecallResult {
  text: string;
  score: number;
  sourceTitle: string;
  sourceId: string;
}

export async function semanticRecall(
  query: string,
  limit: number = 5
): Promise<HydraRecallResult[]> {
  const client = getHydraClient();
  if (!client) return [];

  try {
    const response = await client.recall.fullRecall({
      tenant_id: TENANT_ID,
      sub_tenant_id: KNOWLEDGE_SUB_TENANT,
      query,
      max_results: limit,
      alpha: 0.7, // Blend semantic (0.7) + keyword (0.3)
      recency_bias: 0.2,
    });

    const chunks = (response as { chunks?: Array<{ chunk_content: string; relevancy_score?: number; source_title?: string; source_id: string }> }).chunks ?? [];
    return chunks.slice(0, limit).map((c) => ({
      text: c.chunk_content,
      score: c.relevancy_score ?? 0,
      sourceTitle: c.source_title ?? '',
      sourceId: c.source_id,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[HYDRA] Warning: recall failed — ${msg}\n`);
    return [];
  }
}

/**
 * Store a user interaction as a memory — what they asked, what they got.
 * Enables personalization over time.
 */
export async function addUserMemory(
  question: string,
  answerQuality: 'wiki' | 'web' | 'filed',
  articleTitles: string[]
): Promise<void> {
  const client = getHydraClient();
  if (!client) return;

  const memoryText = `User asked: "${question}". ` +
    `Answered from: ${answerQuality}. ` +
    `Articles involved: ${articleTitles.join(', ')}.`;

  try {
    await client.upload.addMemory({
      memories: [
        {
          text: memoryText,
          infer: true,
          user_name: 'default',
        },
      ],
      tenant_id: TENANT_ID,
      sub_tenant_id: MEMORY_SUB_TENANT,
    });
  } catch {
    // Non-critical — don't interrupt the main flow
  }
}

/**
 * Recall user context for personalized responses.
 */
export async function recallUserContext(query: string): Promise<string[]> {
  const client = getHydraClient();
  if (!client) return [];

  try {
    const response = await client.recall.fullRecall({
      tenant_id: TENANT_ID,
      sub_tenant_id: MEMORY_SUB_TENANT,
      query,
      max_results: 3,
      alpha: 0.8,
      recency_bias: 0.5,
    });

    const chunks = (response as { chunks?: Array<{ chunk_content: string; relevancy_score?: number; source_title?: string; source_id: string }> }).chunks ?? [];
    return chunks.map((c) => c.chunk_content);
  } catch {
    return [];
  }
}
