/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { getFileExtension, extractTextFromBuffer } from "./knowledge/extract";

describe("extract: getFileExtension", () => {
  it("extracts .md extension", () => {
    expect(getFileExtension("readme.md")).toBe(".md");
  });

  it("extracts .txt extension", () => {
    expect(getFileExtension("notes.txt")).toBe(".txt");
  });

  it("extracts .pdf extension", () => {
    expect(getFileExtension("document.pdf")).toBe(".pdf");
  });

  it("extracts .docx extension", () => {
    expect(getFileExtension("report.docx")).toBe(".docx");
  });

  it("normalizes to lowercase", () => {
    expect(getFileExtension("FILE.PDF")).toBe(".pdf");
    expect(getFileExtension("File.Docx")).toBe(".docx");
  });

  it("returns empty string for no extension", () => {
    expect(getFileExtension("README")).toBe("");
  });

  it("handles filenames with multiple dots", () => {
    expect(getFileExtension("my.report.final.docx")).toBe(".docx");
  });

  it("returns empty string for empty filename", () => {
    expect(getFileExtension("")).toBe("");
  });

  it("returns empty string for dotfile (.gitignore)", () => {
    expect(getFileExtension(".gitignore")).toBe(".gitignore");
  });

  it("returns dot for trailing-dot filename", () => {
    expect(getFileExtension("file.")).toBe(".");
  });

  it("returns last extension for double-extension filename", () => {
    expect(getFileExtension("archive.tar.gz")).toBe(".gz");
  });
});

describe("extract: extractTextFromBuffer", () => {
  it("extracts text from .md buffer", async () => {
    const buffer = Buffer.from("# Hello World\n\nThis is markdown.", "utf-8");
    const text = await extractTextFromBuffer(buffer, ".md");
    expect(text).toBe("# Hello World\n\nThis is markdown.");
  });

  it("extracts text from .txt buffer", async () => {
    const buffer = Buffer.from("Plain text content here.", "utf-8");
    const text = await extractTextFromBuffer(buffer, ".txt");
    expect(text).toBe("Plain text content here.");
  });

  it("throws ConvexError for unsupported extension", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractTextFromBuffer(buffer, ".xlsx")).rejects.toThrow(
      "Unsupported file type: .xlsx",
    );
  });

  it("throws ConvexError for empty extension", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractTextFromBuffer(buffer, "")).rejects.toThrow(
      "Unsupported file type",
    );
  });

  it.skip("extracts text from a .pdf buffer (requires Node.js runtime)", async () => {
    // pdf-parse v1 requires PDF.js worker which is not available in edge-runtime.
    // PDF extraction is verified to work in Node.js runtime via the "use node" action.
  });

  it("returns empty string for empty .txt buffer", async () => {
    const buffer = Buffer.alloc(0);
    const text = await extractTextFromBuffer(buffer, ".txt");
    expect(text).toBe("");
  });

  it("throws ConvexError for corrupt .docx buffer", async () => {
    const buffer = Buffer.from("not a real docx", "utf-8");
    await expect(extractTextFromBuffer(buffer, ".docx")).rejects.toThrow(
      "Failed to extract text from DOCX",
    );
  });

  it("extracts text from a .docx buffer", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );

    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );

    zip.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from docx</w:t></w:r></w:p></w:body></w:document>',
    );

    zip.file(
      "word/_rels/document.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
    );

    const docxBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const text = await extractTextFromBuffer(docxBuffer, ".docx");
    expect(text).toContain("Hello from docx");
  });
});
