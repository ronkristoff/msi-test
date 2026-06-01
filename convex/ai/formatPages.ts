interface FormattablePage {
  title: string;
  url: string;
  semantic_description?: string;
  structure_text: string;
  interactive_elements?: Array<{
    selector: string;
    description: string;
    element_type: string;
  }>;
}

export function formatCapturedPagesForPrompt(
  pages: FormattablePage[],
  maxCharsPerPage: number,
): string {
  return pages
    .map((page, i) => {
      const content = page.semantic_description ?? page.structure_text.slice(0, maxCharsPerPage);
      const elements = page.interactive_elements
        ?.map((el) => `  [${el.element_type}] ${el.description} (${el.selector})`)
        .join("\n") ?? "";
      const elementsBlock = elements ? `\nInteractive Elements:\n${elements}` : "";
      return `--- Page ${i + 1}: ${page.title} (${page.url}) ---\n${content}${elementsBlock}`;
    })
    .join("\n\n");
}
