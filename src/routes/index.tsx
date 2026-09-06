import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { createRoom } from "~/lib/p2p";
import "~/components/Room.css";

export default function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom();
      navigate(`/sequence/${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setCreating(false);
    }
  };

  return (
    <main>
      <Title>Sequence</Title>
      <h1>Seqence</h1>
      <button onClick={handleCreateRoom} disabled={creating()} type="button">
        {creating() ? "Creating room…" : "Create room"}
      </button>
      <Show when={error()}>
        {(message) => <p class="room-error">{message()}</p>}
      </Show>
    </main>
  );
}
