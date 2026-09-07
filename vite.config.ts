// vite.config.ts
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    tailwindcss(),
    solidStart(),
    // Pass Nitro v3 settings directly into the plugin initialization call
    nitro({
      baseURL: basePath,
      preset: "static",
      prerender: {
        crawlLinks: true,
        routes: ["/", "/about", "/room"]
      }
    })
  ],
});
