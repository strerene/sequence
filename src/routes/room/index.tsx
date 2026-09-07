import { Title } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import ClientRoom from "~/components/ClientRoom";
import HostRoom from "~/components/HostRoom";
import { createRoom, getRoom, isHostSession } from "~/lib/p2p";

export default function RoomRoute() {
  const [searchParams] = useSearchParams<{ id?: string }>();
  const roomId = () => searchParams.id ?? "";
  const [room, setRoom] = createSignal(getRoom());
  const [restoring, setRestoring] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  // The page is prerendered without search params, so anything derived from
  // `roomId` renders empty on the server. Solid hydration never patches text
  // it claimed from the SSR snapshot, so the room id would stay invisible.
  // Gate the content behind mount to render it fresh on the client.
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));

  onMount(() => {
    // Reloaded host tab: the in-memory room is gone, but it can be
    // reclaimed under the same peer id so clients reconnect seamlessly.
    if (roomId() && !room() && isHostSession(roomId())) {
      setRestoring(true);
      createRoom(roomId())
        .then((r) => {
          if (r.roomId === roomId()) setRoom(r);
          else setFailed(true);
        })
        .catch(() => setFailed(true))
        .finally(() => setRestoring(false));
    }
  });

  return (
    <main class="flex min-h-screen items-center justify-center bg-base-300 p-4">
      <Title>Sequence</Title>
      <Show when={mounted()}>
        <Show
          when={!failed()}
          fallback={
            <div class="alert alert-error">
              <span>
                This room is no longer available.{" "}
                <a class="link" href="/">Create a new room</a>.
              </span>
            </div>
          }
        >
          <Show
            when={room() && room()!.roomId === roomId()}
            fallback={
              <Show
                when={restoring()}
                fallback={<ClientRoom roomId={roomId()} />}
              >
                <p class="flex items-center gap-2">
                  <span class="loading loading-spinner" /> Restoring room…
                </p>
              </Show>
            }
          >
            <HostRoom roomId={roomId()} peer={room()!.peer} />
          </Show>
        </Show>
      </Show>
    </main>
  );
}
