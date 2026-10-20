// @ts-check
// Our own oxlint JS plugin. oxlint has no `no-restricted-syntax`, so `sar/restricted-syntax`
// reports every node that matches an ESQuery selector from its options. oxlint does the matching.
// Lint configuration only: run by Node at lint time, never bundled.

/** @typedef {{ readonly selector: string, readonly message: string }} Restriction */
/**
 * @typedef {object} RuleContext
 * @property {readonly unknown[]} options
 * @property {(descriptor: { readonly node: unknown, readonly message: string }) => void} report
 */

/**
 * @param {unknown} option
 * @returns {Restriction}
 */
const toRestriction = (option) => {
  if (
    typeof option === "object" && option !== null && "selector" in option && "message" in option
    && typeof option.selector === "string" && typeof option.message === "string"
  ) {
    return { selector: option.selector, message: option.message };
  }
  throw new TypeError("sar/restricted-syntax: every option needs a string selector and message");
};

export default {
  meta: { name: "sar" },
  rules: {
    "restricted-syntax": {
      meta: {
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: { selector: { type: "string" }, message: { type: "string" } },
            required: ["selector", "message"],
            additionalProperties: false,
          },
        },
      },
      /**
       * @param {RuleContext} context
       * @returns {Readonly<Record<string, (node: unknown) => void>>}
       */
      create(context) {
        /** @type {Record<string, (node: unknown) => void>} */
        const visitors = {};
        for (const { selector, message } of context.options.map(toRestriction)) {
          visitors[selector] = (node) => {
            context.report({ node, message });
          };
        }
        return visitors;
      },
    },
  },
};
