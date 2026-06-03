import { describe, expect, it } from "vitest";
import { formatSnapshotForPrompt, extractUrlsFromText } from "./snapshotFormatter";

describe("formatSnapshotForPrompt", () => {
  it("formats a complete snapshot with title, aria, and interactive elements", () => {
    const snapshot = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Dashboard", children: [{ role: "heading", name: "Welcome" }] }),
      page_title: "My App — Dashboard",
      url: "https://myapp.com/dashboard",
      interactive_elements: [
        {
          element_type: "button",
          role: "button",
          aria_label: "Submit",
          suggested_locator: "page.getByRole('button', { name: 'Submit' })",
        },
        {
          element_type: "link",
          role: "link",
          aria_label: "Settings",
          href: "/settings",
          suggested_locator: "page.getByRole('link', { name: 'Settings' })",
        },
      ],
    };

    const result = formatSnapshotForPrompt(snapshot);

    expect(result).toContain("My App — Dashboard");
    expect(result).toContain("https://myapp.com/dashboard");
    expect(result).toContain("button");
    expect(result).toContain("Submit");
    expect(result).toContain("page.getByRole('button', { name: 'Submit' })");
    expect(result).toContain("link");
    expect(result).toContain("Settings");
    expect(result).toContain("page.getByRole('link', { name: 'Settings' })");
    expect(result).toContain("WebArea");
  });

  it("handles snapshot without interactive elements", () => {
    const snapshot = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Login" }),
      page_title: "Login",
      url: "https://myapp.com/login",
    };

    const result = formatSnapshotForPrompt(snapshot);

    expect(result).toContain("Login");
    expect(result).toContain("https://myapp.com/login");
    expect(result).not.toContain("Interactive Elements");
  });

  it("handles empty interactive elements array", () => {
    const snapshot = {
      aria_snapshot: "",
      page_title: "Empty Page",
      url: "https://myapp.com/empty",
      interactive_elements: [],
    };

    const result = formatSnapshotForPrompt(snapshot);

    expect(result).toContain("Empty Page");
    expect(result).not.toContain("Interactive Elements");
  });

  it("handles malformed aria_snapshot gracefully", () => {
    const snapshot = {
      aria_snapshot: "not valid json {{{",
      page_title: "Test",
      url: "https://example.com",
    };

    const result = formatSnapshotForPrompt(snapshot);

    expect(result).toContain("Test");
    expect(result).toContain("not valid json {{{");
  });

  it("includes element attributes in output", () => {
    const snapshot = {
      aria_snapshot: "",
      page_title: "Form",
      url: "https://example.com/form",
      interactive_elements: [
        {
          element_type: "textbox",
          role: "textbox",
          aria_label: "Email",
          placeholder: "Enter email",
          suggested_locator: "page.getByLabel('Email')",
        },
      ],
    };

    const result = formatSnapshotForPrompt(snapshot);

    expect(result).toContain("aria-label=\"Email\"");
    expect(result).toContain("placeholder=\"Enter email\"");
    expect(result).toContain("page.getByLabel('Email')");
  });
});

describe("extractUrlsFromText", () => {
  it("extracts absolute URLs", () => {
    const text = "Visit https://example.com and http://another.com/page for details.";
    const urls = extractUrlsFromText(text);

    expect(urls).toContain("https://example.com");
    expect(urls).toContain("http://another.com/page");
    expect(urls).toHaveLength(2);
  });

  it("extracts relative paths starting with /", () => {
    const text = "Navigate to /dashboard and /settings/profile";
    const urls = extractUrlsFromText(text);

    expect(urls).toContain("/dashboard");
    expect(urls).toContain("/settings/profile");
    expect(urls).toHaveLength(2);
  });

  it("deduplicates URLs", () => {
    const text = "Go to https://example.com then back to https://example.com";
    const urls = extractUrlsFromText(text);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://example.com");
  });

  it("returns empty array for text with no URLs", () => {
    const text = "This is just some plain text without any links.";
    const urls = extractUrlsFromText(text);

    expect(urls).toHaveLength(0);
  });

  it("handles mixed absolute and relative URLs", () => {
    const text = "Start at https://app.com/login then go to /dashboard";
    const urls = extractUrlsFromText(text);

    expect(urls).toContain("https://app.com/login");
    expect(urls).toContain("/dashboard");
    expect(urls).toHaveLength(2);
  });

  it("extracts URLs from PRD-style text", () => {
    const text = `
      The app has these pages:
      - Landing: https://myapp.com
      - Login: https://myapp.com/login
      - Dashboard: /dashboard
      - Settings: /settings
    `;
    const urls = extractUrlsFromText(text);

    expect(urls).toHaveLength(4);
    expect(urls).toContain("https://myapp.com");
    expect(urls).toContain("https://myapp.com/login");
    expect(urls).toContain("/dashboard");
    expect(urls).toContain("/settings");
  });

  it("does not extract file extensions as paths", () => {
    const text = "The file.css and file.js are not paths";
    const urls = extractUrlsFromText(text);

    expect(urls).toHaveLength(0);
  });

  it("extracts URLs with query strings and fragments", () => {
    const text = "Go to https://example.com/search?q=test#results";
    const urls = extractUrlsFromText(text);

    expect(urls).toContain("https://example.com/search?q=test#results");
  });
});
