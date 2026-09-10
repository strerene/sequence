import { Show } from "solid-js";
import type { SequenceState } from "~/lib/sequence";
import TeamAvatar from "~/components/ui/TeamAvatar";

/**
 * End-of-game dialog shared by host and client. Rendered only while the
 * public state carries a `status`, so it disappears by itself once the host
 * publishes a fresh (rematch) state. The rematch button is host-only: the
 * client just waits, since the host is the authority for game setup.
 */
export default function GameResultDialog(props: {
  state: SequenceState;
  isHost: boolean;
  onRematch?: () => void;
  onLeave: () => void;
}) {
  const status = () => props.state.status;
  const winner = () => {
    const seat = status()?.winner;
    return seat ? props.state.players[seat] : undefined;
  };
  const teamLabel = () => {
    const color = winner()?.color;
    return color === "blue" ? "Blue team" : "Green team";
  };

  return (
    <Show when={status()}>
      <div class="modal modal-open">
        <div class="modal-box text-center">
          <h3 class="text-lg font-bold">Game over</h3>
          <Show
            when={!status()!.draw}
            fallback={<p class="mt-4 text-xl font-semibold">Board full — it's a draw!</p>}
          >
            <div class="mt-4 flex flex-col items-center gap-2">
              <TeamAvatar
                color={winner()?.color ?? "blue"}
                label={winner()?.name.charAt(0) ?? "?"}
              />
              <p class="text-xl font-semibold">{winner()?.name} wins!</p>
              <p class="text-sm opacity-70">{teamLabel()} victory</p>
            </div>
          </Show>
          <div class="modal-action justify-center">
            <Show
              when={props.isHost}
              fallback={
                <span class="flex items-center gap-2 text-sm opacity-70">
                  <span class="loading loading-spinner loading-xs" />
                  Waiting for host to initiate a rematch…
                </span>
              }
            >
              <button class="btn btn-primary" onClick={props.onRematch} type="button">
                Start new game (rematch)
              </button>
            </Show>
            <button class="btn btn-ghost" onClick={props.onLeave} type="button">
              Leave room
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
