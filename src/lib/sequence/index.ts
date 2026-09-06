// --- Sequence game module -------------------------------------------------------
// Seat ids double as chip colors: the host seat is 'blue', the client seat is
// 'green'. This maps 1:1 onto the app shell's two roles (host / client).
import type { Card, PlayerInfo, SequenceState } from "./types";
import { createBoard } from "./cards";

export const SEQUENCE_SEATS = ["blue", "green"] as const;
export type SequenceSeat = (typeof SEQUENCE_SEATS)[number];

const PLAYER_NAMES: Record<SequenceSeat, string> = {
  blue: "Host",
  green: "Guest",
};

export function createInitialState(): SequenceState {
  return {
    currentPlayerId: SEQUENCE_SEATS[0],
    phase: "lobby",
    players: Object.fromEntries(
      SEQUENCE_SEATS.map((seat) => [
        seat,
        { name: PLAYER_NAMES[seat], color: seat } satisfies PlayerInfo,
      ]),
    ) as SequenceState["players"],
    turnOrder: [...SEQUENCE_SEATS],
    board: createBoard(),
    handCounts: {},
    deckCount: 0,
    discards: {},
    sequences: [],
    turnNumber: 0,
    turnStep: "play",
    pendingCard: null,
    deadCardExchanged: false,
    status: undefined,
  };
}

// --- P2P message protocol -----------------------------------------------------
// Host -> clients: "start" (game (re)started), "state" (public state + the
// recipient's own hand, so a turn applies in a single paint).
// Clients -> host: "action" (a proposal, validated host-side).

export type HostMessage =
  | { type: "start" }
  | { type: "state"; state: SequenceState; hand: Card[] };

export type ClientMessage = {
  type: "action";
  // Loose on the wire; the host validates the action type before applying it.
  action: { type: string; payload?: unknown };
};

export { reducer } from "./reducer";
export { SequenceSecrets, type SerializedSecrets } from "./secrets";
export {
  cardToString,
  cardCellIndices,
  isDeadCard,
  isOneEyedJack,
  isTwoEyedJack,
} from "./cards";
export { SEQUENCES_TO_WIN } from "./types";
export type {
  Card,
  ChipColor,
  BoardCell,
  SequenceState,
  GameAction,
} from "./types";
