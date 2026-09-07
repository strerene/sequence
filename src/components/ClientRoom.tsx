import type { DataConnection } from "peerjs";
import { batch, createSignal, onCleanup, onMount, Show } from "solid-js";
import SequenceGame from "~/components/SequenceGame";
import TeamAvatar from "~/components/ui/TeamAvatar";
import {
  createInitialState,
  type Card,
  type ClientMessage,
  type HostMessage,
  type SequenceState,
} from "~/lib/sequence";
import { joinRoom } from "~/lib/p2p";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export default function ClientRoom(props: { roomId: string }) {
  const [status, setStatus] = createSignal<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [error, setError] = createSignal<string | null>(null);
  const [gameState, setGameState] = createSignal<SequenceState>(createInitialState());
  const [hand, setHand] = createSignal<Card[]>([]);

  let connection: DataConnection | undefined;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    try {
      const room = await joinRoom(props.roomId);
      connection = room.connection;
      retries = 0;
      setStatus("connected");

      room.connection.on("close", () => {
        connection = undefined;
        setStatus("disconnected");
        // The host may have reloaded — try to get back into the room.
        scheduleRetry();
      });
      room.connection.on("data", (raw) => {
        const msg = raw as HostMessage;
        if (msg.type === "start") {
          setGameState(createInitialState());
          setHand([]);
        } else if (msg.type === "state") {
          // State + own hand arrive together, so a turn applies in one batch:
          // the hand never renders in its intermediate (one card short) form.
          // PeerJS callbacks are not Solid event handlers, so the two writes
          // must be batched explicitly — unbatched they cause two full render
          // passes per turn.
          batch(() => {
            setGameState(msg.state);
            setHand(msg.hand);
          });
        }
      });
    } catch (err) {
      if (retries < MAX_RETRIES) {
        scheduleRetry();
      } else {
        setError(err instanceof Error ? err.message : "Failed to join room");
      }
    }
  };

  const scheduleRetry = () => {
    if (retries >= MAX_RETRIES || retryTimer) return;
    retries += 1;
    setStatus("connecting");
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, RETRY_DELAY_MS);
  };

  onMount(() => {
    void connect();
  });

  onCleanup(() => {
    if (retryTimer) clearTimeout(retryTimer);
    // joinRoom's peer is a fresh client peer, not the shared host singleton
    connection?.close();
  });

  // Proposals are validated by the host against the hidden information —
  // the client only ever sees the public state plus its own hand.
  const propose = (type: string, payload?: unknown) => {
    connection?.send({ type: "action", action: { type, payload } } satisfies ClientMessage);
  };

  // Two-phase layout mirrors HostRoom: a lobby card while waiting for the
  // host to start, then the game card. Connection status surfaces inside the
  // lobby card since the client has nothing else to show before the game.
  return (
    <Show
      when={gameState().phase === "lobby"}
      fallback={
        <div class="flex min-h-[calc(100dvh-2rem)] w-full flex-col items-center gap-4">
          <SequenceGame
            roomId={props.roomId}
            state={gameState()}
            seat="green"
            players={[
              {
                seat: "blue",
                name: gameState().players.blue?.name ?? "Host",
                color: "blue",
                connected: status() === "connected",
                you: false,
              },
              {
                seat: "green",
                name: gameState().players.green?.name ?? "Guest",
                color: "green",
                connected: true,
                you: true,
              },
            ]}
            hand={hand()}
            onPropose={propose}
          />
        </div>
      }
    >
      <section class="card bg-base-100 shadow-xl w-full max-w-2xl">
        <div class="card-body">
          <div class="flex justify-between items-center">
            <h2 class="text-3xl font-bold">Game Lobby</h2>
            <span class="badge badge-xs badge-warning">{props.roomId}</span>
          </div>
          {/* Two-player only: the client tab is itself a player, so the
              count is 2 once connected to the host. */}
          <h3 class="card-title mt-6">
            Players ({status() === "connected" ? 2 : 1})
          </h3>
          <ul class="space-y-2 text-sm mt-1.5">
            <li class="flex items-center gap-2">
              <TeamAvatar color="blue" label="B" /> Host
            </li>
            <li class="flex items-center gap-2">
              <TeamAvatar color="green" label="G" /> You (guest)
            </li>
          </ul>
          <div class="flex justify-end mt-6">
            <Show
              when={!error()}
              fallback={
                <div class="alert alert-error w-fit">
                  <span>{error()}</span>
                </div>
              }
            >
              <Show
                when={status() === "connected"}
                fallback={
                  <Show
                    when={status() === "connecting"}
                    fallback={
                      <div class="alert alert-error w-fit">
                        <span>Disconnected from host.</span>
                      </div>
                    }
                  >
                    <div class="flex items-center gap-2">
                      <span class="loading loading-spinner" /> Connecting to host…
                    </div>
                  </Show>
                }
              >
                <div class="flex items-center gap-2">
                  <span class="loading loading-spinner" /> Waiting for host to start…
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </section>
    </Show>
  );
}
