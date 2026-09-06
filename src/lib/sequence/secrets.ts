// --- Host-side secrets (deck order + hands) ------------------------------------
// IMPURE BY DESIGN: this module holds the hidden game information. It runs
// ONLY on the host, is never part of the public state, and never appears in a
// broadcast payload. The reducer (pure) and the clients (via "hand" messages)
// only ever see public facts or a player's own hand.
import type { Card, SequenceState } from "./types";
import { HAND_SIZE } from "./types";
import { createDeck, isDeadCard, shuffle } from "./cards";

export interface SerializedSecrets {
  deck: Card[];
  hands: Record<string, Card[]>;
}

export class SequenceSecrets {
  private deck: Card[] = [];
  private hands: Record<string, Card[]> = {};

  /** Shuffle the double deck and deal the initial hands. Returns public facts. */
  deal(
    playerIds: string[],
    perPlayer = HAND_SIZE,
  ): { handCounts: Record<string, number>; deckCount: number } {
    this.deck = shuffle(createDeck());
    this.hands = {};
    for (const id of playerIds) {
      this.hands[id] = this.deck.splice(0, perPlayer);
    }
    return {
      handCounts: Object.fromEntries(
        playerIds.map((id) => [id, this.hands[id].length]),
      ),
      deckCount: this.deck.length,
    };
  }

  handOf(playerId: string): Card[] {
    return this.hands[playerId] ?? [];
  }

  /** True when the card is genuinely in the player's hand (host validation). */
  holdsCard(playerId: string, card: Card, handIndex?: number): boolean {
    const hand = this.hands[playerId];
    if (!hand) return false;
    return hand.some(
      (c, i) =>
        c.rank === card.rank &&
        c.suit === card.suit &&
        (handIndex === undefined || i === handIndex),
    );
  }

  /** Pop the top deck card into the player's hand. Null when the deck is empty. */
  drawInto(playerId: string): Card | null {
    if (this.deck.length === 0) return null;
    const card = this.deck.pop()!;
    this.hands[playerId] = [...(this.hands[playerId] ?? []), card];
    return card;
  }

  /** Remove the played card from the player's hand (already validated). */
  removeCard(playerId: string, card: Card, handIndex?: number): void {
    const hand = this.hands[playerId];
    if (!hand) return;
    const idx =
      handIndex !== undefined &&
      hand[handIndex] &&
      hand[handIndex].rank === card.rank &&
      hand[handIndex].suit === card.suit
        ? handIndex
        : hand.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
    if (idx !== -1) {
      const copy = [...hand];
      copy.splice(idx, 1);
      this.hands[playerId] = copy;
    }
  }

  /** Dead-card exchange: discard + replacement off the deck (may be null). */
  exchangeDeadCard(playerId: string, deadCard: Card, handIndex?: number): void {
    this.removeCard(playerId, deadCard, handIndex);
    this.drawInto(playerId);
  }

  /** Rebuild the deck from all public discard piles. Returns the new size. */
  reshuffle(discards: Record<string, Card[]>): number {
    const all: Card[] = [];
    for (const pile of Object.values(discards)) all.push(...pile);
    this.deck = shuffle(all);
    return this.deck.length;
  }

  /** True when a dead-card replacement is possible right now. */
  canReplaceCard(): boolean {
    return this.deck.length > 0;
  }

  /**
   * Host validation of a proposal. Returns the (unchanged or enriched)
   * payload to commit, or null to reject. Hidden results (drawn card,
   * replacement) are applied to the secrets, NOT to the payload.
   *
   * Mutates secrets ONLY after mirroring every public precondition the
   * reducer will check, so an accepted proposal is guaranteed to commit.
   */
  prepareProposal(
    state: SequenceState,
    playerId: string,
    type: string,
    payload: unknown,
  ): { payload: unknown } | null {
    // Secret-mutating proposals must mirror the reducer's public preconditions
    // exactly (acting player, phase, turn step), so an accepted proposal is
    // guaranteed to commit and secrets can never drift from the public state.
    const secretMutating =
      type === "PLAY_CARD" || type === "DECLARE_DEAD_CARD" || type === "DRAW_CARD";
    if (secretMutating) {
      const acting =
        state.phase === "playing" &&
        !state.status &&
        playerId === state.currentPlayerId;
      if (!acting) return null;
    }
    switch (type) {
      case "PLAY_CARD": {
        const { card, handIndex } = payload as { card: Card; handIndex: number };
        if (state.turnStep !== "play") return null;
        if (!this.holdsCard(playerId, card, handIndex)) return null;
        const color = state.players[playerId]?.color;
        if (color && isDeadCard(state.board, card, color)) return null;
        this.removeCard(playerId, card, handIndex);
        return { payload };
      }
      case "DECLARE_DEAD_CARD": {
        const { card, handIndex } = payload as { card: Card; handIndex: number };
        if (state.turnStep !== "play" || state.deadCardExchanged) return null;
        if (!this.holdsCard(playerId, card, handIndex)) return null;
        const color = state.players[playerId]?.color;
        if (!color || !isDeadCard(state.board, card, color)) return null;
        const replacementDrawn = this.canReplaceCard();
        if (replacementDrawn) {
          this.exchangeDeadCard(playerId, card, handIndex);
        } else {
          this.removeCard(playerId, card, handIndex);
        }
        return { payload: { card, handIndex, replacementDrawn } };
      }
      case "DRAW_CARD": {
        if (state.turnStep !== "draw") return null;
        // Mirror the reducer's public auto-reshuffle exactly: when the deck is
        // exhausted, the deck is rebuilt from the public discard piles.
        if (state.deckCount <= 0) {
          const discardTotal = Object.values(state.discards).reduce(
            (n, p) => n + p.length,
            0,
          );
          if (discardTotal === 0) return null;
          this.reshuffle(state.discards);
        }
        const card = this.drawInto(playerId);
        if (!card) return null; // unreachable: reshuffle guarantees a card
        return { payload: {} };
      }
      default:
        // Public-only actions need no secret handling.
        return { payload };
    }
  }

  /** Snapshot of the hidden information (for host-side persistence). */
  serialize(): SerializedSecrets {
    const hands: Record<string, Card[]> = {};
    for (const [id, hand] of Object.entries(this.hands)) hands[id] = [...hand];
    return { deck: [...this.deck], hands };
  }

  /** Restore hidden information from a persisted snapshot. */
  restore(data: SerializedSecrets): void {
    this.deck = [...data.deck];
    this.hands = {};
    for (const [id, hand] of Object.entries(data.hands)) {
      this.hands[id] = [...hand];
    }
  }
}
