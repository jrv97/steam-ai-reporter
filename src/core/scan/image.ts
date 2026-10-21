import { isInSarNode } from "./marks";

/**
 * What counts as a capsule image (rq6, S5): an `img`, or an element with an inline
 * `background-image`, which is all the home page's main carousel capsule has. Steam's lazy
 * backgrounds carry `data-background-image-url` before the style is set; they count too, because
 * setting the style later is an attribute change the observer does not see.
 *
 * React store capsules mount their image box empty and add the `img` inside the app link later.
 * That added subtree holds no link, so the box itself counts as the image.
 */
export const IMAGE = [
  "img",
  "[style*='background-image']",
  "[data-background-image-url]",
  ".CapsuleImageCtn",
  ".HeroCapsuleImageContainer",
].join(", ");

/** The first capsule image in `root` (`root` included), skipping anything inside our own nodes. */
export function firstImage(root: Element): Element | undefined {
  if (root.matches(IMAGE)) {
    return root;
  }
  for (const image of root.querySelectorAll(IMAGE)) {
    if (!isInSarNode(image)) {
      return image;
    }
  }
  return undefined;
}

/**
 * The box a capsule image sits in: the image element itself when it paints a background, else
 * the `img`'s parent. This is where a compact badge is overlaid.
 */
export function imageBox(image: Element): Element | undefined {
  return image.localName === "img" ? (image.parentElement ?? undefined) : image;
}
