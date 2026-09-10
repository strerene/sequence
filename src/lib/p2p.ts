import Peer, { DataConnection } from "peerjs";

const SESSION_ROLE_KEY = "peerRole";
const SESSION_ROOM_KEY = "peerRoomId";

const hostIdKey = (roomId: string) => `hostPeerId:${roomId}`;

const options = {
  key: 'peerjs',
  host: import.meta.env.VITE_PEER_HOST || '0.peerjs.com',
  port: Number(import.meta.env.VITE_PEER_PORT) || 443,
  secure: import.meta.env.VITE_PEER_SECURE !== 'false',
  path: import.meta.env.VITE_PEER_PATH || '/',
  debug: 2,
};

async function initPeer(peerId?: string): Promise<Peer> {
  const peer = peerId ? new Peer(peerId, options) : new Peer(options);

  await new Promise<void>((resolve, reject) => {
    peer.on("open", () => resolve());
    peer.on("error", reject);
  });

  console.log("My peer ID is: " + peer.id);

  return peer;
}

export interface RoomHandle {
  peer: Peer;
  roomId: string;
}

// Module-level singleton so the host peer survives client-side navigation
// between the home route and the room route.
let room: RoomHandle | null = null;

export async function createRoom(roomId?: string): Promise<RoomHandle> {
  if (room) return room;

  // On a reload of the same tab, reclaim the previous host id so clients
  // can reconnect to the room id in the URL. A brand-new room gets a
  // fresh id. All persisted state lives in sessionStorage (per-tab), so
  // multiple tabs can host different rooms independently.
  const storedId =
    (roomId && isHostSession(roomId)
      ? sessionStorage.getItem(hostIdKey(roomId))
      : undefined) ?? undefined;

  const peer = await initPeer(storedId);
  room = { peer, roomId: peer.id };
  sessionStorage.setItem(SESSION_ROLE_KEY, "host");
  sessionStorage.setItem(SESSION_ROOM_KEY, room.roomId);
  sessionStorage.setItem(hostIdKey(room.roomId), peer.id);
  return room;
}

export function getRoom(): RoomHandle | null {
  return room;
}

/**
 * Forget the current room entirely (role, room id, host peer id) and drop the
 * module singleton, so leaving a room is a clean slate: the next "create
 * room" gets a fresh peer instead of a destroyed one.
 */
export function leaveRoom(roomId: string): void {
  sessionStorage.removeItem(SESSION_ROLE_KEY);
  sessionStorage.removeItem(SESSION_ROOM_KEY);
  sessionStorage.removeItem(hostIdKey(roomId));
  room = null;
}

// True if this tab was hosting the given room before a reload.
// sessionStorage survives reloads (but not new tabs), which is exactly
// the scope we want for "same tab, same room".
export function isHostSession(roomId: string): boolean {
  return (
    sessionStorage.getItem(SESSION_ROLE_KEY) === "host" &&
    sessionStorage.getItem(SESSION_ROOM_KEY) === roomId
  );
}

export async function joinRoom(
  hostId: string,
): Promise<{ peer: Peer; connection: DataConnection }> {
  const peer = await initPeer();
  const connection = await connectToHost(peer, hostId);
  sessionStorage.setItem(SESSION_ROLE_KEY, "client");
  sessionStorage.setItem(SESSION_ROOM_KEY, hostId);
  return { peer, connection };
}

async function connectToHost(
  peer: Peer,
  hostId: string,
): Promise<DataConnection> {
  const connection = peer.connect(hostId);

  await new Promise<void>((resolve, reject) => {
    connection.on("open", () => resolve());
    connection.on("error", reject);
    peer.on("error", reject);
  });

  return connection;
}
