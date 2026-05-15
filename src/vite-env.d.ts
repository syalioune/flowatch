/// <reference types="vite/client" />

// Vite `define` injections — see vite.config.ts.
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string | undefined;

// Vite `?raw` query — text contents of a file imported at build time.
declare module "*?raw" {
  const content: string;
  export default content;
}
