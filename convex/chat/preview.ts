type ContentPart = { type: string; text?: string };

type MessageDocLike = {
  text?: string;
  message?: {
    role?: string;
    content?: string | ContentPart[];
  };
};

export function extractMessageText(doc: MessageDocLike): string | null {
  const raw = pickText(doc);
  if (raw == null) return null;
  return raw.trim().length > 0 ? raw : null;
}

function pickText(doc: MessageDocLike): string | null {
  if (doc.text && doc.text.length > 0) return doc.text;
  const content = doc.message?.content;
  if (content == null) return null;
  if (typeof content === "string") return content;
  const textPart = content.find(
    (p) => p.type === "text" && typeof p.text === "string",
  );
  return textPart?.text ?? null;
}

export function truncatePreview(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= 120) return text;
  return chars.slice(0, 120).join("") + "…";
}
