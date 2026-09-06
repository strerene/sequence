// --- Sequence Reducer ----------------------------------------------------------
// PURE, deterministic: NO Date.now(), NO Math.random(), NO network calls.
// The reducer sees ONLY public facts. Hand contents, the deck order, and all
// shuffling live host-side (see secrets.ts); each peer's own hand arrives via a
// "hand" message and never enters the public state.
import type { BoardCell, Card, ChipColor, GameAction, SequenceLine, SequenceState } from "./types";
import { SEQUENCES_TO_WIN } from "./types";
import {
  SEQUENCE_WINDOWS,
  cardsEqual,
  isDeadCard,
  isOneEyedJack,
  isTwoEyedJack,
} from "./cards";

export function reducer(
  state: SequenceState,
  action: GameAction,
): SequenceState {
  switch (action.type) {
    case "PLAY_CARD":
      return playCard(state, action);
    case "DECLARE_DEAD_CARD":
      return declareDeadCard(state, action);
    case "PLACE_CHIP":
      return placeChip(state, action);
    case "REMOVE_CHIP":
      return removeChip(state, action);
    case "DRAW_CARD":
      return drawCard(state, action);
    default:
      return state;
  }
}

// --- Turn actions ---------------------------------------------------------------

function isActingPlayer(state: SequenceState, action: GameAction): boolean {
  return (
    state.phase === "playing" &&
    !state.status &&
    action.playerId === state.currentPlayerId
  );
}

function playerColor(state: SequenceState, playerId: string): ChipColor {
  return state.players[playerId]?.color ?? "blue";
}

function bumpHandCount(
  state: SequenceState,
  playerId: string,
  delta: number,
): SequenceState["handCounts"] {
  return {
    ...state.handCounts,
    [playerId]: (state.handCounts[playerId] ?? 0) + delta,
  };
}

function playCard(state: SequenceState, action: GameAction): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.turnStep !== "play") return state;
  const { card } = (action.payload ?? {}) as { card: Card };
  if (!card) return state;
  // Hand-content validation ("is that card really in their hand?") is the
  // host's job (it sees the hands); the reducer enforces the public rules.
  if (isDeadCard(state.board, card, playerColor(state, action.playerId))) {
    return state; // a dead card must be declared dead instead
  }
  return {
    ...state,
    handCounts: bumpHandCount(state, action.playerId, -1),
    pendingCard: card,
    turnStep: isOneEyedJack(card) ? "remove" : "place",
  };
}

function declareDeadCard(
  state: SequenceState,
  action: GameAction,
): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.turnStep !== "play") return state;
  if (state.deadCardExchanged) return state; // one exchange per turn
  const { card, replacementDrawn } = (action.payload ?? {}) as {
    card: Card;
    replacementDrawn: boolean;
  };
  if (!card) return state;
  if (!isDeadCard(state.board, card, playerColor(state, action.playerId))) {
    return state; // not actually dead
  }
  const discards = { ...state.discards };
  discards[action.playerId] = [...discards[action.playerId], card];
  return {
    ...state,
    discards,
    // discard (-1) + replacement (+1 when drawn) -> net 0 or -1
    handCounts: bumpHandCount(state, action.playerId, replacementDrawn ? 0 : -1),
    deckCount: replacementDrawn ? state.deckCount - 1 : state.deckCount,
    deadCardExchanged: true,
  };
}

function placeChip(state: SequenceState, action: GameAction): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.turnStep !== "place" || !state.pendingCard) return state;
  const { cell } = (action.payload ?? {}) as { cell: number };
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length) {
    return state;
  }
  const boardCell = state.board[cell];
  if (boardCell.card === "FREE" || boardCell.chip !== null) return state;
  if (isOneEyedJack(state.pendingCard)) return state;
  if (
    !isTwoEyedJack(state.pendingCard) &&
    !cardsEqual(boardCell.card, state.pendingCard)
  ) {
    return state;
  }

  const color = playerColor(state, action.playerId);
  const board = [...state.board];
  board[cell] = { ...boardCell, chip: { color, locked: false } };

  // Claim any newly completed sequences (overlap rule: a new sequence may
  // share at most one chip with the already-claimed ones).
  const sequences = claimNewSequences(board, color, state.sequences);
  if (sequences.length > state.sequences.length) {
    lockSequenceChips(board, sequences, state.sequences.length);
  }

  return endTurnStep({
    ...state,
    board,
    sequences,
    status: resolveStatus(state, board, sequences, action.playerId),
  });
}

function removeChip(state: SequenceState, action: GameAction): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.turnStep !== "remove" || !state.pendingCard) return state;
  if (!isOneEyedJack(state.pendingCard)) return state;
  const { cell } = (action.payload ?? {}) as { cell: number };
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length) {
    return state;
  }
  const boardCell = state.board[cell];
  if (boardCell.card === "FREE" || !boardCell.chip) return state;
  const color = playerColor(state, action.playerId);
  if (boardCell.chip.color === color) return state; // cannot remove own chip
  if (boardCell.chip.locked) return state; // protected by a completed sequence

  const board = [...state.board];
  board[cell] = { ...boardCell, chip: null };
  // Removing a chip can never complete a sequence, and never fills the board.
  return endTurnStep({ ...state, board });
}

function drawCard(state: SequenceState, action: GameAction): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.turnStep !== "draw") return state;
  // The drawn card itself stays hidden: only public counts change here, and
  // the drawing player's hand is updated via a "hand" message.
  let next = {
    ...state,
    handCounts: bumpHandCount(state, action.playerId, 1),
    deckCount: state.deckCount - 1,
  };
  if (state.deckCount <= 0) {
    // Deck exhausted: rebuild it from the PUBLIC discard piles (deterministic
    // for every replica — only the shuffled ORDER is host-side, in secrets).
    // With nothing left to draw, the turn simply advances ("loss of card").
    const discardTotal = Object.values(state.discards).reduce(
      (n, p) => n + p.length,
      0,
    );
    if (discardTotal === 0) return state;
    const discards: SequenceState["discards"] = {};
    for (const seat of state.turnOrder) discards[seat] = [];
    next = {
      ...next,
      deckCount: discardTotal - 1,
      discards,
    };
  }
  return advanceTurn(next);
}

// --- Turn / step transitions ------------------------------------------------------

function advanceTurn(state: SequenceState): SequenceState {
  const idx = state.turnOrder.indexOf(state.currentPlayerId);
  const nextId = state.turnOrder[(idx + 1) % state.turnOrder.length];
  return {
    ...state,
    currentPlayerId: nextId,
    turnStep: "play",
    pendingCard: null,
    deadCardExchanged: false,
    turnNumber: state.turnNumber + 1,
  };
}

/** Clears the pending card and moves to the draw step of the same turn. */
function endTurnStep(state: SequenceState): SequenceState {
  return { ...state, turnStep: "draw", pendingCard: null };
}

// --- Sequence claiming & win detection --------------------------------------------

/**
 * Find every 5-window that is fully occupied by `color` chips / corners and is
 * not already claimed. A new sequence may share at most ONE chip with the
 * union of already-claimed chips (the overlap rule; a 9-in-a-row line is
 * therefore two sequences). Returns the updated sequence list.
 */
function claimNewSequences(
  board: BoardCell[],
  color: ChipColor,
  existing: SequenceLine[],
): SequenceLine[] {
  const claimed = new Set<number>();
  for (const seq of existing) {
    if (seq.color === color) {
      for (const c of seq.cells) claimed.add(c);
    }
  }

  const result = [...existing];
  for (const window of SEQUENCE_WINDOWS) {
    let complete = true;
    let shared = 0;
    for (const idx of window) {
      const cell = board[idx];
      if (cell.card === "FREE") continue; // corner: counts for everyone
      if (!cell.chip || cell.chip.color !== color) {
        complete = false;
        break;
      }
      if (claimed.has(idx)) shared++;
    }
    if (!complete || shared > 1) continue;
    result.push({ color, cells: [...window] });
    for (const idx of window) {
      if (board[idx].card !== "FREE") claimed.add(idx);
    }
  }
  return result;
}

/** Mark the chips of all newly claimed sequences as locked (remove-proof). */
function lockSequenceChips(
  board: BoardCell[],
  sequences: SequenceLine[],
  firstNewIndex: number,
): void {
  for (let i = firstNewIndex; i < sequences.length; i++) {
    for (const idx of sequences[i].cells) {
      const cell = board[idx];
      if (cell.chip) {
        board[idx] = { ...cell, chip: { ...cell.chip, locked: true } };
      }
    }
  }
}

function resolveStatus(
  state: SequenceState,
  board: BoardCell[],
  sequences: SequenceLine[],
  playerId: string,
): SequenceState["status"] {
  const myCount = sequences.filter(
    (s) => s.color === playerColor(state, playerId),
  ).length;
  if (myCount >= SEQUENCES_TO_WIN) {
    return { winner: playerId };
  }
  if (board.every((cell) => cell.card === "FREE" || cell.chip !== null)) {
    return { draw: true };
  }
  return undefined;
}
