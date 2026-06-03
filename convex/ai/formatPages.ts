export interface FormattablePage {
  title: string;
  url: string;
  semantic_description?: string;
  structure_text?: string;
  interactive_elements?: Array<{
    selector: string;
    description: string;
    element_type: string;
    role?: string;
    aria_label?: string;
    label_text?: string;
    placeholder?: string;
    name?: string;
    id?: string;
    type?: string;
    href?: string;
    data_testid?: string;
    suggested_locator?: string;
  }>;
}

type FormatMode = "summary" | "detailed";

export function formatCapturedPagesForPrompt(
  pages: FormattablePage[],
  maxCharsPerPage: number,
  mode: FormatMode = "summary",
): string {
  return pages
    .map((page, i) => {
      let content: string;
      if (mode === "detailed" && page.structure_text) {
        content = page.structure_text.slice(0, maxCharsPerPage);
      } else {
        content = page.semantic_description ?? page.structure_text?.slice(0, maxCharsPerPage) ?? "";
      }

      let elementsBlock = "";
      if (mode === "detailed" && page.interactive_elements && page.interactive_elements.length > 0) {
        const elements = page.interactive_elements
          .map((el) => {
            const attrs = [
              el.role ? `role="${el.role}"` : "",
              el.type ? `type="${el.type}"` : "",
              el.aria_label ? `aria-label="${el.aria_label}"` : "",
              el.label_text ? `label="${el.label_text}"` : "",
              el.placeholder ? `placeholder="${el.placeholder}"` : "",
              el.name ? `name="${el.name}"` : "",
              el.id ? `id="${el.id}"` : "",
              el.data_testid ? `data-testid="${el.data_testid}"` : "",
              el.href ? `href="${el.href}"` : "",
            ].filter(Boolean).join(" ");
            const locator = el.suggested_locator
              ? `\n    → ${el.suggested_locator}`
              : "";
            return `  [${el.element_type}] ${attrs}${locator}`;
          })
          .join("\n");
        elementsBlock = `\nInteractive Elements:\n${elements}`;
      } else if (page.interactive_elements && page.interactive_elements.length > 0) {
        const elements = page.interactive_elements
          .map((el) => `  [${el.element_type}] ${el.description} (${el.selector})`)
          .join("\n");
        elementsBlock = `\nInteractive Elements:\n${elements}`;
      }

      return `--- Page ${i + 1}: ${page.title} (${page.url}) ---\n${content}${elementsBlock}`;
    })
    .join("\n\n");
}
