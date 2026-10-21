// Composition root of the userscript: binds the `GM` globals the header grants and hands them to
// `startUserscript`. This file and the extension's content script are the only shipped roots.
import { startUserscript } from "./userscript";

void startUserscript({
  document,
  storage: {
    getValue: (name) => GM.getValue(name),
    setValue: (name, value) => GM.setValue(name, value),
    deleteValue: (name) => GM.deleteValue(name),
    listValues: () => GM.listValues(),
  },
  fetch: (url, init) => fetch(url, init),
  console,
  browserLang: navigator.language,
  addStyle: typeof GM_addStyle === "function" ? (css) => GM_addStyle(css) : undefined,
  watchValue: typeof GM_addValueChangeListener === "function"
    ? (key, onChange) => {
      GM_addValueChangeListener(key, (_name, _oldValue, newValue) => {
        onChange(newValue);
      });
    }
    : undefined,
  registerMenuCommand: typeof GM.registerMenuCommand === "function"
    ? (caption, run) => {
      void GM.registerMenuCommand?.(caption, run);
    }
    : undefined,
});
