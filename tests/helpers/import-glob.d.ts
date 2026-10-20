/** Vite's `import.meta.glob`, as far as the tests use it; vitest resolves it at transform time. */
interface ImportMeta {
  glob(
    pattern: string,
    options: { readonly eager: true; readonly import: "default"; },
  ): Readonly<Record<string, unknown>>;
}
