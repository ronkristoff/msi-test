const AI_DELAY_MS = 1500;
const AI_MAX_RETRIES = 5;

export async function aiDelay(): Promise<void> {
  await new Promise((r) => setTimeout(r, AI_DELAY_MS));
}

export const aiMaxRetries = AI_MAX_RETRIES;
