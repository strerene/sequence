import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import ClientRoom from "~/components/ClientRoom";
import HostRoom from "~/components/HostRoom";
import { createRoom, getRoom, isHostSession } from "~/lib/p2p";

export default function RoomRoute() {
  const params = useParams<{ roomId: string }>();
  const [room, setRoom] = createSignal(getRoom());
  const [restoring, setRestoring] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  onMount(() => {
    // Reloaded host tab: the in-memory room is gone, but it can be
    // reclaimed under the same peer id so clients reconnect seamlessly.
    if (!room() && isHostSession(params.roomId)) {
      setRestoring(true);
      createRoom(params.roomId)
        .then((r) => {
          if (r.roomId === params.roomId) setRoom(r);
          else setFailed(true);
        })
        .catch(() => setFailed(true))
        .finally(() => setRestoring(false));
    }
  });

  return (
    <main>
      <Title>Sequence</Title>
      <Show
        when={!failed()}
        fallback={
          <p class="room-error">
            This room is no longer available.{" "}
            <a href="/">Create a new room</a>.
          </p>
        }
      >
        <Show
          when={room() && room()!.roomId === params.roomId}
          fallback={
            <Show
              when={restoring()}
              fallback={<ClientRoom roomId={params.roomId} />}
            >
              <p class="room-loading">Restoring room…</p>
            </Show>
          }
        >
          <HostRoom roomId={params.roomId} peer={room()!.peer} />
        </Show>
      </Show>
    </main>
  );
}
