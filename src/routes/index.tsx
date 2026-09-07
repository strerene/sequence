import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { createRoom } from "~/lib/p2p";

export default function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [joinId, setJoinId] = createSignal("");
  let joinDialog: HTMLDialogElement | undefined;

  const openJoinDialog = () => {
    setJoinId("");
    joinDialog?.showModal();
  };

  const closeJoinDialog = () => {
    joinDialog?.close();
  };

  const handleJoinRoom = (event: SubmitEvent) => {
    event.preventDefault();
    const id = joinId().trim();
    if (!id) return;
    navigate(`/room?id=${encodeURIComponent(id)}`);
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom();
      navigate(`/room?id=${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setCreating(false);
    }
  };

  return (
    <main class="flex min-h-screen items-center justify-center bg-base-300">
      <Title>Sequence</Title>
      <div class="card bg-base-100 w-96 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">Play Sequence</h2>
          <p>
            Play the popular sequence card/board game. Either create a room, or
            join by pasting a shared link
          </p>
          <div class="card-actions justify-end mt-6">
            <button
              class="btn"
              disabled={creating()}
              onClick={openJoinDialog}
              type="button"
            >
              {"Join room"}
            </button>
            <button
              class="btn btn-primary"
              onClick={handleCreateRoom}
              disabled={creating()}
              type="button"
            >
              {creating() ? "Creating room…" : "Create room"}
            </button>
          </div>
        </div>
      </div>

      <dialog class="modal" ref={joinDialog}>
        <div class="modal-box">
          <h3 class="mb-4 text-lg font-bold">Join a room</h3>
          <form class="room-join" onSubmit={handleJoinRoom}>
            <input
              class="input input-bordered w-full"
              onInput={(e) => setJoinId(e.currentTarget.value)}
              placeholder="Room ID"
              type="text"
              value={joinId()}
            />
            <div class="modal-action">
              <button
                class="btn btn-ghost"
                onClick={closeJoinDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                disabled={!joinId().trim()}
                type="submit"
              >
                Join room
              </button>
            </div>
          </form>
        </div>
        <form class="modal-backdrop" method="dialog">
          <button type="button">close</button>
        </form>
      </dialog>

      <Show when={error()}>
        {(message) => <p class="room-error">{message()}</p>}
      </Show>
    </main>
  );
}
