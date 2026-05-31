import "playwright";

declare module "playwright" {
  interface Page {
    ariaSnapshot(options?: { mode?: string; timeout?: number }): Promise<string>;
  }
}
