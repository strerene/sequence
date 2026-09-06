// --- Sequence Cards & Board Layout -------------------------------------------
// Pure data + geometry helpers. Everything here is deterministic.
// (shuffle() is the one exception — host-side only, never used in the reducer.)
import type { BoardCell, Card, ChipColor, Rank, Suit } from "./types";
import { BOARD_SIZE } from "./types";

export const SUITS: Suit[] = ["S", "H", "D", "C"];

export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export function cardToString(card: Card): string {
  return card.rank + card.suit;
}

export function parseCard(token: string): Card {
  const suit = token.slice(-1) as Suit;
  const rank = token.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
    throw new Error(`Invalid card token: ${token}`);
  }
  return { rank, suit };
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Full 104-card double deck (two standard 52-card decks, no Jokers). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
  }
  return deck;
}

/** One-eyed jacks (hearts & spades) remove an opponent's chip. */
export function isOneEyedJack(card: Card): boolean {
  return card.rank === "J" && (card.suit === "S" || card.suit === "H");
}

/** Two-eyed jacks (clubs & diamonds) are wild. */
export function isTwoEyedJack(card: Card): boolean {
  return card.rank === "J" && (card.suit === "D" || card.suit === "C");
}

// --- Board layout ---------------------------------------------------------------
// Canonical 10x10 Sequence board (Jax layout). Each non-jack card appears
// exactly twice; the four corners are FREE spaces. Row-major order.
const LAYOUT_TOKENS: string[] = [
  "FREE", "6D", "7D", "8D", "9D", "10D", "QD", "KD", "AD", "FREE",
  "5D", "3H", "2H", "2S", "3S", "4S", "5S", "6S", "7S", "AC",
  "4D", "4H", "KD", "AD", "AC", "KC", "QC", "10C", "8S", "KC",
  "3D", "5H", "QD", "QH", "10H", "9H", "8H", "9C", "9S", "QC",
  "2D", "6H", "10D", "KH", "3H", "2H", "7H", "8C", "10S", "10C",
  "AS", "7H", "9D", "AH", "4H", "5H", "6H", "7C", "QS", "9C",
  "KS", "8H", "8D", "2C", "3C", "4C", "5C", "6C", "KS", "8C",
  "QS", "9H", "7D", "6D", "5D", "4D", "3D", "2D", "AS", "7C",
  "10S", "10H", "QH", "KH", "AH", "2C", "3C", "4C", "5C", "6C",
  "FREE", "9S", "8S", "7S", "6S", "5S", "4S", "3S", "2S", "FREE",
];

export function createBoard(): BoardCell[] {
  return LAYOUT_TOKENS.map((token) => ({
    card: token === "FREE" ? ("FREE" as const) : parseCard(token),
    chip: null,
  }));
}

/** The (up to) two board cells a normal card can be played on. */
export function cardCellIndices(card: Card): number[] {
  const target = cardToString(card);
  const cells: number[] = [];
  LAYOUT_TOKENS.forEach((token, idx) => {
    if (token === target) cells.push(idx);
  });
  return cells;
}

// --- Sequence windows -------------------------------------------------------------
// Every possible 5-in-a-row window: horizontal, vertical, and both diagonals.
// Corner (FREE) cells count for every player. 192 windows total.
function buildWindows(): number[][] {
  const windows: number[][] = [];
  const idx = (r: number, c: number) => r * BOARD_SIZE + c;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c + 4 < BOARD_SIZE; c++) {
      windows.push([0, 1, 2, 3, 4].map((n) => idx(r, c + n))); // horizontal
    }
  }
  for (let r = 0; r + 4 < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      windows.push([0, 1, 2, 3, 4].map((n) => idx(r + n, c))); // vertical
    }
  }
  for (let r = 0; r + 4 < BOARD_SIZE; r++) {
    for (let c = 0; c + 4 < BOARD_SIZE; c++) {
      windows.push([0, 1, 2, 3, 4].map((n) => idx(r + n, c + n))); // diagonal ↘
    }
  }
  for (let r = 4; r < BOARD_SIZE; r++) {
    for (let c = 0; c + 4 < BOARD_SIZE; c++) {
      const cells = [0, 1, 2, 3, 4].map((n) => idx(r - n, c + n)); // diagonal ↗
      windows.push(cells.sort((a, b) => a - b));
    }
  }
  return windows;
}

export const SEQUENCE_WINDOWS: readonly number[][] = buildWindows();

// --- Card state helpers -----------------------------------------------------------

/**
 * A card is "dead" when it has no legal use right now:
 * - normal card: both matching board spaces are occupied
 * - two-eyed jack: no open space anywhere on the board
 * - one-eyed jack: no removable (unlocked) opponent chip on the board
 */
export function isDeadCard(
  board: BoardCell[],
  card: Card,
  color: ChipColor,
): boolean {
  if (isTwoEyedJack(card)) {
    return board.every((cell) => cell.card === "FREE" || cell.chip !== null);
  }
  if (isOneEyedJack(card)) {
    return !board.some(
      (cell) =>
        cell.chip !== null && !cell.chip.locked && cell.chip.color !== color,
    );
  }
  return cardCellIndices(card).every((idx) => board[idx].chip !== null);
}

// --- Host-side helpers (NOT pure — used by the host when dealing) -----------------

/** Fisher-Yates shuffle. Host-side only; results never enter broadcasts. */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
