import { Show } from "solid-js";
import type { ChipColor } from "~/lib/sequence";

// Team colors are the chip colors, not daisyUI theme colors, so they are
// pinned to the same values as the board chips in SequenceGame.css.
const TEAM_BG: Record<ChipColor, string> = {
  blue: "bg-[#2b5f9e]",
  green: "bg-[#3d8b4f]",
};

export default function TeamAvatar(props: {
  color: ChipColor;
  /** Single letter/initial shown inside the avatar (optional). */
  label?: string;
}) {
  return (
    <div class="avatar avatar-placeholder">
      <div
        class={`w-7 rounded-full text-white ${TEAM_BG[props.color] ?? "bg-neutral"}`}
      >
        <Show when={props.label}>
          {(label) => <span class="text-xs font-bold uppercase">{label()}</span>}
        </Show>
      </div>
    </div>
  );
}
