// Ambient declarations for non-TS assets imported through Vite.
// Required so `tsc -p src/electron/renderer/tsconfig.json --noEmit`
// accepts the side-effect stylesheet imports in `hud/main.ts`.

declare module '*.css' {
  const stylesheet: string;
  export default stylesheet;
}
