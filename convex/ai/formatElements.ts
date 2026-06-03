export type FormattableElement = {
  element_type: string;
  role?: string;
  type?: string;
  aria_label?: string;
  label_text?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  data_testid?: string;
  href?: string;
  suggested_locator?: string;
};

export function formatElementLine(el: FormattableElement): string {
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
}
