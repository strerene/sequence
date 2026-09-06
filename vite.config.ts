// vite.config.ts
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    solidStart(),
    // Pass Nitro v3 settings directly into the plugin initialization call
    nitro({
      preset: "static",
      prerender: {
        crawlLinks: true,
        routes: ["/", "/sequence"]
      }
    })
  ],
});
