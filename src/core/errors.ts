import type { MessageKey, MessageParams } from "./i18n/keys.gen";

/**
 * The project's error type. It carries a catalog key and that message's typed params, never
 * prose (rule 9); the logger turns it into catalog text. `message` holds the key.
 */
export class SarError<K extends MessageKey = MessageKey> extends Error {
  override readonly name = "SarError";
  readonly code: K;
  readonly params: MessageParams[K];

  constructor(code: K, params: MessageParams[K], options?: ErrorOptions) {
    super(code, options);
    this.code = code;
    this.params = params;
  }
}
