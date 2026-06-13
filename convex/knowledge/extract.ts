"use node";

import { ConvexError } from "convex/values";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { OLD_RD_ALLOWED_EXTENSIONS } from "../lib/constraints";

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  extension: string,
): Promise<string> {
  switch (extension) {
    case ".md":
    case ".txt":
      return buffer.toString("utf-8");
    case ".pdf": {
      try {
        const result = await pdfParse(buffer);
        return result.text;
      } catch {
        throw new ConvexError(
          "Failed to extract text from PDF. The file may be corrupt or password-protected.",
        );
      }
    }
    case ".docx": {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch {
        throw new ConvexError(
          "Failed to extract text from DOCX. The file may be corrupt.",
        );
      }
    }
    default:
      throw new ConvexError(
        `Unsupported file type: ${extension}. Allowed: ${OLD_RD_ALLOWED_EXTENSIONS.join(", ")}`,
      );
  }
}
