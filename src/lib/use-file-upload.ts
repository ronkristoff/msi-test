"use client";

import { useAction } from "convex/react";
import { api } from "./convex";

export type PRDMode = "none" | "text" | "file";

export function useFileUpload() {
  const generateUploadUrl = useAction(api.files.actions.generateUploadUrl);

  async function upload(file: File) {
    const uploadUrl = await generateUploadUrl();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await result.json();
    return storageId as string;
  }

  return { upload };
}
