// --- Sequence Types ---------------------------------------------------------

export type Suit = "S" | "H" | "D" | "C";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

// --- Board ------------------------------------------------------------------

export type ChipColor = "blue" | "green";

export interface Chip {
  color: ChipColor;
  locked: boolean; // part of a completed sequence -> cannot be removed
}

export interface BoardCell {
  card: Card | "FREE"; // 'FREE' = corner space (counts for everyone)
  chip: Chip | null;
}

export interface SequenceLine {
  color: ChipColor;
  cells: number[]; // board indices, ascending (includes corner cells)
}

// --- Game state -------------------------------------------------------------

export type Phase = "lobby" | "playing" | "finished";

/**
 * One turn is a strict machine enforced by the reducer:
 *   'play'   -> PLAY_CARD (or one DECLARE_DEAD_CARD first)
 *   'place'  -> PLACE_CHIP (normal card or two-eyed jack)
 *   'remove' -> REMOVE_CHIP (one-eyed jack)
 *   'draw'   -> DRAW_CARD (card itself stays hidden; only counts change)
 */
export type TurnStep = "play" | "place" | "remove" | "draw";

export interface PlayerInfo {
  name: string;
  color: ChipColor;
}

export interface SequenceState {
  phase: Phase;
  players: Record<string, PlayerInfo>;
  turnOrder: string[]; // seat order; [0] is the host seat
  board: BoardCell[]; // length 100, row-major
  // Public hand sizes. Hand CONTENTS are hidden information: they live
  // host-side (SequenceSecrets) and each peer receives only its own hand via a
  // "hand" message. Never put hands in the public state — it would leak
  // through broadcasts.
  handCounts: Record<string, number>;
  deckCount: number; // public; the deck order itself lives host-side only
  discards: Record<string, Card[]>; // public, like the physical discard piles
  sequences: SequenceLine[]; // claimed sequences (their chips are locked)
  currentPlayerId: string;
  turnNumber: number;
  turnStep: TurnStep;
  pendingCard: Card | null; // card played, awaiting chip placement/removal
  deadCardExchanged: boolean; // one dead-card exchange allowed per turn
  status?: { winner?: string; draw?: boolean };
}

// --- Game constants -----------------------------------------------------------

export const HAND_SIZE = 7; // 2-player game
export const SEQUENCES_TO_WIN = 2; // 2-player game
export const BOARD_SIZE = 10;

// --- Actions ------------------------------------------------------------------
// Only the five turn actions exist. Game setup is host-only code: the host
// composes the initial playing state directly (seats, names and deal counts
// are host facts), so there are no START_GAME / SHUFFLE_AND_DEAL actions.
// All randomness (shuffle/deal results) is generated host-side and kept in
// host-managed secrets — it NEVER appears in a broadcast payload. Actions
// carry only public facts; hidden info (own hand) travels in "hand" messages.

export type SequenceActionType =
  | "PLAY_CARD"
  | "DECLARE_DEAD_CARD"
  | "PLACE_CHIP"
  | "REMOVE_CHIP"
  | "DRAW_CARD";

export interface GameAction {
  type: SequenceActionType;
  playerId: string;
  payload?: unknown;
}
