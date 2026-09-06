// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);

// Reveal the page (FOUC guard in entry-server) once stylesheets have loaded.
const reveal = () => {
  document.documentElement.style.visibility = "visible";
};
if (document.readyState === "complete") {
  reveal();
} else {
  window.addEventListener("load", reveal, { once: true });
}
