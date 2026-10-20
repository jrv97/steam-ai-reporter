// @ts-check
// Our own oxlint JS plugin. oxlint has no `no-restricted-syntax`, so each rule here turns ESQuery
// selectors into reports; oxlint does the matching. Lint configuration only: run by Node at lint
// time, never bundled.

/**
 * @typedef {object} RuleContext
 * @property {(descriptor: { readonly node: unknown, readonly message: string }) => void} report
 */

/** A string literal with content, or a template literal. */
const LITERAL = ":matches(Literal[value=/./], TemplateLiteral)";

/** DOM properties and attributes that users see or hear. */
const COPY_PROPERTIES = [
  "textContent",
  "innerText",
  "outerText",
  "innerHTML",
  "outerHTML",
  "title",
  "placeholder",
  "alt",
  "label",
  "ariaLabel",
  "ariaDescription",
  "ariaPlaceholder",
  "ariaRoleDescription",
  "ariaValueText",
].join("|");
const COPY_ATTRIBUTES = "^(aria-|title$|placeholder$|alt$|label$)";
const SET_COPY_ATTRIBUTE = "CallExpression[callee.property.name='setAttribute']"
  + `[arguments.0.value=/${COPY_ATTRIBUTES}/] > ${LITERAL}.arguments:nth-child(2)`;

const COPY = "Copy comes from the message catalog (rule 9): use t(key), not a string literal.";
const LOG = "Log through the logger with a catalog key (rule 9), not a string literal.";
const ERROR = "Errors carry a catalog key, new SarError(key, params), not prose (rule 9).";
const JSON_PARSE_CALL = "CallExpression[callee.object.name='JSON'][callee.property.name='parse']";
const JSON_PARSE = "Use parseJson from src/core/json.ts (returns unknown) instead of JSON.parse.";

/**
 * A rule that reports every node matching one of the selectors with its message.
 * @param {Readonly<Record<string, string>>} restrictions selector to message
 */
const restrict = (restrictions) => ({
  /**
   * @param {RuleContext} context
   * @returns {Readonly<Record<string, (node: unknown) => void>>}
   */
  create(context) {
    /** @type {Record<string, (node: unknown) => void>} */
    const visitors = {};
    for (const [selector, message] of Object.entries(restrictions)) {
      visitors[selector] = (node) => {
        context.report({ node, message });
      };
    }
    return visitors;
  },
});

export default {
  meta: { name: "sar" },
  rules: {
    // Rule 9: string literals must not flow into user-visible or logged text.
    "no-hardcoded-copy": restrict({
      [`AssignmentExpression[left.property.name=/^(${COPY_PROPERTIES})$/] > ${LITERAL}.right`]:
        COPY,
      [SET_COPY_ATTRIBUTE]: COPY,
      [`CallExpression[callee.name=/^(alert|confirm|prompt)$/] > ${LITERAL}`]: COPY,
      [`CallExpression[callee.object.name='console'] > ${LITERAL}`]: LOG,
      // SarError takes a typed catalog key, so only the other error classes are checked.
      [`NewExpression[callee.name=/Error$/][callee.name!='SarError'] > ${LITERAL}`]: ERROR,
    }),
    // Untrusted JSON stays unknown: JSON.parse is wrapped once, in src/core/json.ts.
    "no-json-parse": restrict({
      [JSON_PARSE_CALL]: JSON_PARSE,
    }),
  },
};
