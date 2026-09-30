import { cpSync } from "node:fs";

// Keep the source videos with their architecture documentation while shipping
// the same gallery and media files in every production build.
cpSync(new URL("../docs/videos/", import.meta.url), new URL("../dist/videos/", import.meta.url), { recursive: true });
