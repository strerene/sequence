import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { BoardCell, Card, ChipColor, SequenceState } from "~/lib/sequence";
import { cardToString, cardCellIndices, isDeadCard, isOneEyedJack, isTwoEyedJack } from "~/lib/sequence";
import TeamAvatar from "~/components/ui/TeamAvatar";
import "./SequenceGame.css";

const SUIT_GLYPH: Record<Card["suit"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_RED: Record<Card["suit"], boolean> = { S: false, H: true, D: true, C: false };

function cardTitle(card: Card): string {
  if (isTwoEyedJack(card)) return "Two-eyed jack — place a chip on ANY open space";
  if (isOneEyedJack(card)) return "One-eyed jack — remove an opponent chip (locked chips are safe)";
  return cardToString(card);
}

// --- Board cell ----------------------------------------------------------------

function CellView(props: {
  cell: BoardCell;
  index: number;
  legal: boolean;
  sequenceFlash: boolean;
  lastMoveFlash: boolean;
  interactive: boolean;
  onCellClick: (index: number) => void;
}) {
  const click = () => props.interactive && props.onCellClick(props.index);
  const ariaLabel = () => {
    const cell = props.cell;
    const place = cell.card === "FREE" ? "Free corner space" : `Card ${cardToString(cell.card)}`;
    if (!cell.chip) return `${place}, empty${props.legal ? ", legal move" : ""}`;
    return `${place}, ${cell.chip.color} chip${cell.chip.locked ? " (locked)" : ""}`;
  };
  return (
    <div
      class={`seq-cell ${props.cell.card === "FREE" ? "free" : SUIT_RED[props.cell.card.suit] ? "red" : "black"}`}
      classList={{
        legal: props.legal,
        "sequence-flash": props.sequenceFlash,
        "last-move": props.lastMoveFlash,
        interactive: props.interactive,
      }}
      role={props.interactive ? "button" : undefined}
      tabIndex={props.interactive ? 0 : -1}
      aria-label={ariaLabel()}
      aria-disabled={props.interactive ? undefined : "true"}
      onClick={click}
      onKeyDown={(e) => {
        if (props.interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          click();
        }
      }}
    >
      <Show
        when={props.cell.card !== "FREE" ? props.cell.card : null}
        keyed
        fallback={<span class="seq-free-glyph">✦</span>}
      >
        {(card) => (
          <span class="seq-cell-card">
            {card.rank}
            {SUIT_GLYPH[card.suit]}
          </span>
        )}
      </Show>
      <Show when={props.cell.chip} keyed>
        {(chip) => <span class={`seq-chip ${chip.color}`} classList={{ locked: chip.locked }} />}
      </Show>
    </div>
  );
}

// --- Hand card -------------------------------------------------------------------

function HandCardView(props: {
  card: Card;
  index: number;
  selected: boolean;
  dead: boolean;
  clickable: boolean;
  canExchange: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      class={`seq-hand-card ${SUIT_RED[props.card.suit] ? "red" : "black"}`}
      classList={{ selected: props.selected, dead: props.dead, playable: props.clickable }}
      disabled={!props.clickable}
      title={
        props.dead
          ? props.canExchange
            ? "Dead card (no legal use) — select it, then confirm to discard & draw a replacement"
            : "Dead card (no legal use right now)"
          : props.selected
            ? "Selected — click a highlighted board space (or pick another card)"
            : cardTitle(props.card)
      }
      onClick={() => props.onSelect(props.index)}
    >
      <span class="seq-hand-rank">{props.card.rank}</span>
      <span class="seq-hand-suit">
        {isTwoEyedJack(props.card) ? "👀" : isOneEyedJack(props.card) ? "👁" : SUIT_GLYPH[props.card.suit]}
      </span>
      <Show when={props.dead}>
        <span class="seq-dead-tag">dead</span>
      </Show>
    </button>
  );
}

// --- Game -------------------------------------------------------------------------

export interface PlayerStatus {
  seat: string;
  name: string;
  color: ChipColor;
  connected: boolean;
  you: boolean;
}

export default function SequenceGame(props: {
  roomId: string;
  state: SequenceState;
  /** Local seat id: 'blue' (host) or 'green' (client). */
  seat: string;
  players: PlayerStatus[];
  hand: Card[];
  /** Propose a game action (sent to the host, which validates and applies it). */
  onPropose: (type: string, payload?: unknown) => void;
}) {
  const s = () => props.state;
  const [selected, setSelected] = createSignal<number | null>(null);
  const [sequenceFlash, setSequenceFlash] = createSignal<ReadonlySet<number>>(new Set());
  const [lastMoveFlash, setLastMoveFlash] = createSignal<number | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let lastMoveTimer: ReturnType<typeof setTimeout> | undefined;

  const myColor = createMemo<ChipColor>(
    () => s().players[props.seat]?.color ?? (props.seat === "blue" ? "blue" : "green"),
  );
  const myTurn = () =>
    s().phase === "playing" && !s().status && s().currentPlayerId === props.seat;
  const inPlayStep = () => myTurn() && s().turnStep === "play";
  const canExchangeDead = () => inPlayStep() && !s().deadCardExchanged;

  const name = (seat: string) => s().players[seat]?.name ?? seat;
  const currentPlayer = () => s().players[s().currentPlayerId];
  const turnColor = () =>
    currentPlayer()?.color ?? (s().currentPlayerId === "blue" ? "blue" : "green");
  const winnerName = () => {
    const w = s().status?.winner;
    return w ? name(w) : undefined;
  };

  // Clear the card selection when the turn moves on (back to 'play').
  createEffect(
    on(
      () => s().turnStep,
      (step) => {
        if (step === "play") setSelected(null);
      },
    ),
  );

  // Flash the chips of newly claimed sequences for a moment.
  createEffect(
    on(
      () => s().sequences.length,
      (count, prev) => {
        if (prev === undefined || count <= prev) return;
        const cells = new Set<number>();
        for (let i = prev; i < count; i++) {
          for (const c of s().sequences[i].cells) cells.add(c);
        }
        setSequenceFlash(cells);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setSequenceFlash(new Set<number>()), 2500);
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    clearTimeout(flashTimer);
    clearTimeout(lastMoveTimer);
  });

  // Briefly highlight the cell of the most recent chip placement/removal so
  // the opponent gets a visual hint of where the last move happened. Inferred
  // by diffing the board (same UI-side pattern as the sequence flash): each
  // chip action changes exactly one cell, so a single-cell diff IS the last
  // move. Anything else (rematch reset, restored state, multi-cell change)
  // is ignored rather than guessed at.
  // Chips are compared by VALUE, not reference: on clients each received
  // state is freshly deserialized, so unchanged cells get new chip objects
  // and a reference diff would see the whole board as changed.
  const chipChanged = (a: BoardCell["chip"], b: BoardCell["chip"]) =>
    !!a !== !!b || (a !== null && b !== null && a!.color !== b!.color);
  createEffect(
    on(
      () => s().board,
      (board, prev) => {
        if (!prev) return;
        let changed = -1;
        for (let i = 0; i < board.length; i++) {
          if (chipChanged(board[i].chip, prev[i].chip)) {
            if (changed >= 0) return; // more than one cell changed: not a move
            changed = i;
          }
        }
        if (changed < 0) return;
        setLastMoveFlash(changed);
        clearTimeout(lastMoveTimer);
        lastMoveTimer = setTimeout(() => setLastMoveFlash(null), 900);
      },
      { defer: true },
    ),
  );

  // Note: the mandatory draw step is advanced host-side automatically, so no
  // client-side auto-draw is needed here.

  // Local, frontend-only selection: the chosen card stays switchable until the
  // player commits to a board space, and the highlights below are computed
  // from it (never from public state — the opponent sees nothing until the
  // chip is actually placed).
  const selectedCard = createMemo(() => {
    const idx = selected();
    return idx === null ? undefined : props.hand[idx];
  });

  // Legal target cells for the locally selected card (own board only).
  const highlightCells = createMemo(() => {
    const targets = new Set<number>();
    const card = selectedCard();
    if (!card || !myTurn() || s().turnStep !== "play") return targets;
    if (isDeadCard(s().board, card, myColor())) return targets;
    const board = s().board;
    if (isTwoEyedJack(card)) {
      board.forEach((cell, i) => {
        if (cell.card !== "FREE" && !cell.chip) targets.add(i);
      });
    } else if (isOneEyedJack(card)) {
      board.forEach((cell, i) => {
        if (
          cell.card !== "FREE" &&
          cell.chip &&
          !cell.chip.locked &&
          cell.chip.color !== myColor()
        ) {
          targets.add(i);
        }
      });
    } else {
      for (const i of cardCellIndices(card)) {
        if (!board[i].chip) targets.add(i);
      }
    }
    return targets;
  });

  const prompt = () => {
    const st = s();
    if (st.status) return "";
    if (st.currentPlayerId === props.seat) {
      if (st.turnStep === "play") {
        return selectedCard()
          ? "Click a highlighted space (or pick another card)"
          : "Your turn — play a card";
      }
      if (st.turnStep === "place") return "Placing your chip…";
      if (st.turnStep === "remove") return "Removing an opponent chip…";
      if (st.turnStep === "draw") return "Drawing a card…";
    }
    const steps: Record<string, string> = {
      play: "play a card",
      place: "place a chip",
      remove: "remove an opponent chip",
      draw: "draw a card",
    };
    const step = steps[st.turnStep] ?? st.turnStep;
    return `Waiting for ${name(st.currentPlayerId)} to ${step}…`;
  };

  function selectCard(index: number) {
    if (!inPlayStep()) return;
    const card = props.hand[index];
    if (!card) return;
    // Frontend-only selection: click again to deselect, click another card to
    // switch. Nothing is proposed until the player commits (board space click
    // for normal cards, the discard button for dead cards).
    setSelected(selected() === index ? null : index);
  }

  const selectedIsDead = () => {
    const card = selectedCard();
    return !!card && isDeadCard(s().board, card, myColor());
  };

  /** Discard the selected dead card for a replacement (once per turn). */
  function exchangeSelectedDead() {
    const index = selected();
    if (index === null || !inPlayStep() || !canExchangeDead()) return;
    const card = props.hand[index];
    if (!card || !isDeadCard(s().board, card, myColor())) return;
    props.onPropose("DECLARE_DEAD_CARD", { card, handIndex: index });
    setSelected(null);
  }

  function cellClick(index: number) {
    const card = selectedCard();
    if (!card || !myTurn() || !highlightCells().has(index)) return;
    // Commit the card and the chip action together — the turn machine
    // (play → place/remove → draw) processes the two proposals in order.
    props.onPropose("PLAY_CARD", { card, handIndex: selected() });
    if (isOneEyedJack(card)) props.onPropose("REMOVE_CHIP", { cell: index });
    else props.onPropose("PLACE_CHIP", { cell: index });
    setSelected(null);
  }

  return (
    <div class="seq">
      {/* --- Header: players left, room badge right (like the lobby) --- */}
      <header class="seq-header">
        <div class="seq-players">
          <For each={props.players}>
            {(player) => (
              <span class="seq-player" classList={{ offline: !player.connected }}>
                <TeamAvatar color={player.color} label={player.name.charAt(0)} />
                {player.name}
                <Show when={player.you}> (you)</Show>
                <span class="seq-player-status">
                  {player.connected ? "connected" : "disconnected"}
                </span>
              </span>
            )}
          </For>
        </div>
        <span class="badge badge-warning badge-sm font-mono">{props.roomId}</span>
      </header>

      {/* --- Board --- */}
      <div class="seq-board" role="grid" aria-label="Sequence board">
        <For each={s().board}>
          {(cell, i) => (
            <CellView
              cell={cell}
              index={i()}
              legal={highlightCells().has(i())}
              sequenceFlash={sequenceFlash().has(i())}
              lastMoveFlash={lastMoveFlash() === i()}
              interactive={myTurn() && highlightCells().has(i())}
              onCellClick={cellClick}
            />
          )}
        </For>
      </div>

      {/* --- Hand + turn info (secondary area) --- */}
      <div class="seq-hand-area">
        <div class="seq-status">
          <Show
            when={s().status}
            fallback={
              <div class="seq-turn">
                <span class="seq-turn-label">Current turn:</span>
                <TeamAvatar color={turnColor()} label={name(s().currentPlayerId).charAt(0)} />
                <span>{name(s().currentPlayerId)}</span>
                <span class="seq-turn-hint">{prompt()}</span>
              </div>
            }
          >
            <Show when={!s().status?.draw} fallback="Board full — draw!">
              {winnerName() === props.seat ? "You win!" : `${winnerName()} wins!`}
            </Show>
          </Show>
        </div>
        <div class="seq-hand">
          <For each={props.hand}>
            {(card, i) => (
              <HandCardView
                card={card}
                index={i()}
                selected={selected() === i()}
                dead={isDeadCard(s().board, card, myColor())}
                clickable={inPlayStep()}
                canExchange={canExchangeDead()}
                onSelect={selectCard}
              />
            )}
          </For>
        </div>
        <Show when={selectedIsDead()}>
          <button
            type="button"
            class="seq-button"
            disabled={!canExchangeDead()}
            title={
              canExchangeDead()
                ? "Discard the selected dead card and draw a replacement"
                : "You already exchanged a dead card this turn"
            }
            onClick={exchangeSelectedDead}
          >
            Discard dead card &amp; draw replacement
          </button>
        </Show>
      </div>
    </div>
  );
}
