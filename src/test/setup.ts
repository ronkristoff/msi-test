import "@testing-library/jest-dom/vitest";

if (
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.scrollIntoView !== "function"
) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}
