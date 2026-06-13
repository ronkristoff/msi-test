export const NAME_MIN = 1;
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;

export const TEST_DATA_MAX_KEYS = 50;
export const TEST_DATA_MAX_KEY_LEN = 100;
export const TEST_DATA_MAX_VALUE_LEN = 1000;

export const PAT_MIN_LENGTH = 8;
export const PAT_MAX_LENGTH = 200;
export const REPO_URL_MAX_LENGTH = 500;

export const OLD_RD_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const OLD_RD_PREVIEW_LENGTH = 500;
export const OLD_RD_ALLOWED_EXTENSIONS = [".docx", ".pdf", ".md", ".txt"];

export const GITHUB_DEFAULT_BRANCH = "main";
export const INGESTION_INCLUDE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".yaml", ".yml",
  ".css", ".html", ".sql", ".go", ".rs", ".java", ".md",
];
export const INGESTION_EXCLUDE_DIRS = [
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".next", "vendor", "target", ".cache",
];
export const MAX_FILE_SIZE_BYTES = 100 * 1024;
export const CHUNK_SIZE = 2000;
export const GITHUB_FILE_BATCH_SIZE = 10;

export const EMBEDDING_BATCH_SIZE = 50;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;
export const RAG_NAMESPACE_PREFIX = "project_";
export const EMBEDDING_RATE_LIMIT_BACKOFF_MS = 30000;
export const MAX_EMBEDDING_CHUNKS = 10000;
export const EMBEDDING_MAX_QUERY_LENGTH = 8000;
export const EMBEDDING_SEARCH_MIN_LIMIT = 1;
export const EMBEDDING_SEARCH_MAX_LIMIT = 50;

export const EXTRACTION_MAX_CONTEXT_CHARS = 80000;
export const EXTRACTION_MAX_MODULES = 50;

export function prependScheme(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function parseUrlOrNull(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
