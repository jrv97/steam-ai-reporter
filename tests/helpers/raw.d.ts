/** Vite's `?raw` imports give a file's text; vitest resolves them, the type check needs this. */
declare module "*.html?raw" {
  const text: string;
  export default text;
}
