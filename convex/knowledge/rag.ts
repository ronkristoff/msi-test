import { components } from "../_generated/api";
import { RAG } from "@convex-dev/rag";
import { createOpenAI } from "@ai-sdk/openai";
import {
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  RAG_NAMESPACE_PREFIX,
} from "../lib/constraints";

type FilterTypes = {
  file_path: string;
  chunk_index: number;
  language: string;
  directory: string;
};

export function createProjectRag(aiConfig: {
  endpoint_url: string;
  api_key: string;
}) {
  const openai = createOpenAI({
    baseURL: aiConfig.endpoint_url,
    apiKey: aiConfig.api_key,
  });

  return new RAG<FilterTypes>(components.rag, {
    textEmbeddingModel: openai.embedding(DEFAULT_EMBEDDING_MODEL),
    embeddingDimension: EMBEDDING_DIMENSION,
    filterNames: ["file_path", "chunk_index", "language", "directory"],
  });
}

export function getProjectNamespace(projectId: string): string {
  return `${RAG_NAMESPACE_PREFIX}${projectId}`;
}

export function getChunkKey(filePath: string, chunkIndex: number): string {
  return `${filePath}#${chunkIndex}`;
}

export function buildFilterValues(chunk: {
  file_path: string;
  chunk_index: number;
  language?: string;
  directory: string;
}) {
  return [
    { name: "file_path" as const, value: chunk.file_path },
    { name: "chunk_index" as const, value: chunk.chunk_index },
    { name: "language" as const, value: chunk.language ?? "" },
    { name: "directory" as const, value: chunk.directory },
  ];
}
