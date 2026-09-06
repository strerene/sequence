import type { DataConnection } from "peerjs";
import { batch, createSignal, onCleanup, onMount, Show } from "solid-js";
import SequenceGame from "~/components/SequenceGame";
import {
  createInitialState,
  type Card,
  type ClientMessage,
  type HostMessage,
  type SequenceState,
} from "~/lib/sequence";
import { joinRoom } from "~/lib/p2p";
import "./Room.css";

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

  return (
    <section class="room room--wide">
      <Show when={gameState().phase === "lobby"}>
        <div class="room-code-row">
          <span class="room-code-label">Room code:</span>
          <code class="room-code">{props.roomId}</code>
        </div>
      </Show>
      <Show when={!error()} fallback={<p class="room-error">{error()}</p>}>
        <Show
          when={status() === "connected"}
          fallback={
            <Show
              when={status() === "connecting"}
              fallback={<p class="room-error">Disconnected from host.</p>}
            >
              <p class="room-loading">Connecting to host…</p>
            </Show>
          }
        >
          <Show
            when={gameState().phase !== "lobby"}
            fallback={<p class="room-loading">Waiting for host to start…</p>}
          >
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
          </Show>
        </Show>
      </Show>
    </section>
  );
}
