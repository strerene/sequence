// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href={`${import.meta.env.BASE_URL}/favicon.ico`} />
          {/* FOUC guard: hide the page until stylesheets finish loading. The
              animation auto-reveals after 1s so the page never stays hidden
              if JS is blocked or slow. */}
          <style>{`html{visibility:hidden;animation:fouc-guard 0s 1s forwards}@keyframes fouc-guard{to{visibility:visible}}`}</style>
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
