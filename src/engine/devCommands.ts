// src/engine/devCommands.ts
import { getDisplayTileName } from './boardData';
import { refreshAllNetWorths } from './winConditions';
import type { EngineEvent, RoomState } from './types';

export function applyDevCommand(
  state: RoomState,
  commandStr: string,
  events: EngineEvent[]
): boolean {
  const trimmed = commandStr.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const isGetRich = state.rules.ruleset === 'Get Rich';

  const findTarget = (query: string) => {
    const lower = query.toLowerCase();
    return state.players.find(
      (p) => p.id === query || p.name.toLowerCase().includes(lower)
    );
  };

  switch (cmd) {
    case 'setmoney': {
      if (args.length < 2) return false;
      const amount = Number.parseInt(args[1], 10);
      if (!Number.isFinite(amount) || amount < 0) return false;
      const target = findTarget(args[0]);
      if (!target) return false;
      target.money = amount;
      refreshAllNetWorths(state.players, state.board);
      events.push({
        type: 'system-chat',
        text: `Dev Console: Set ${target.name}'s cash to $${amount}.`,
      });
      return true;
    }

    case 'setroll': {
      if (args.length < 2) return false;
      const d1 = Number.parseInt(args[0], 10);
      const d2 = Number.parseInt(args[1], 10);
      if (
        !Number.isInteger(d1) ||
        !Number.isInteger(d2) ||
        d1 < 1 ||
        d1 > 6 ||
        d2 < 1 ||
        d2 > 6
      ) {
        return false;
      }
      state.nextForcedRoll = [d1, d2];
      events.push({
        type: 'system-chat',
        text: `Dev Console: Next dice roll forced to [${d1}, ${d2}].`,
      });
      return true;
    }

    case 'setnextcard': {
      if (args.length < 2) return false;
      const type = args[0].toLowerCase();
      const cardActionOrId = args[1].toLowerCase();
      if (type !== 'chance' && type !== 'chest') return false;
      state.nextForcedCard = { type, cardActionOrId };
      events.push({
        type: 'system-chat',
        text: `Dev Console: Next ${type} card forced to "${cardActionOrId}".`,
      });
      return true;
    }

    case 'teleport': {
      if (args.length < 2) return false;
      const tileIndex = Number.parseInt(args[1], 10);
      if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 39) return false;
      const target = findTarget(args[0]);
      if (!target) return false;
      target.position = tileIndex;
      const tile = state.board[tileIndex];
      events.push({
        type: 'system-chat',
        text: `Dev Console: Teleported ${target.name} to ${getDisplayTileName(tile, isGetRich)} (${tileIndex}).`,
      });
      return true;
    }

    case 'addcard': {
      if (args.length < 2) return false;
      const target = findTarget(args[0]);
      const cardType = args[1].toLowerCase();
      if (!target) return false;
      if (cardType === 'angel') {
        target.angelCards = Math.min(target.angelCards + 1, 1);
        events.push({
          type: 'system-chat',
          text: `Dev Console: Gave 1 Angel card to ${target.name}.`,
        });
        return true;
      }
      if (cardType === 'odd_even' || cardType === 'oddeven') {
        target.oddEvenCards = Math.min(target.oddEvenCards + 1, 1);
        events.push({
          type: 'system-chat',
          text: `Dev Console: Gave 1 Odd/Even card to ${target.name}.`,
        });
        return true;
      }
      if (cardType === 'jail' || cardType === 'jail_free') {
        target.getOutOfJailCards += 1;
        events.push({
          type: 'system-chat',
          text: `Dev Console: Gave 1 Get Out of Jail Free card to ${target.name}.`,
        });
        return true;
      }
      return false;
    }

    case 'bankrupt': {
      if (args.length < 1) return false;
      const target = findTarget(args[0]);
      if (!target || target.bankrupt) return false;
      target.bankrupt = true;
      target.money = 0;
      for (const tile of state.board) {
        if (tile.owner === target.id) {
          tile.owner = null;
          tile.houses = 0;
          tile.mortgaged = false;
          tile.festivalTurns = 0;
        }
      }
      refreshAllNetWorths(state.players, state.board);
      events.push({
        type: 'system-chat',
        text: `Dev Console: Bankrupted ${target.name}. All properties returned to bank.`,
      });

      const active = state.players.filter((p) => !p.bankrupt);
      if (active.length <= 1) {
        const winner = active[0];
        state.gameState = 'gameover';
        state.winReason = 'Last Tycoon Standing';
        if (winner) {
          winner.finishRank = 1;
          winner.score = winner.netWorth;
          events.push({
            type: 'game-over',
            winnerId: winner.id,
            reason: state.winReason,
          });
        }
      } else if (state.players[state.turnIndex]?.id === target.id) {
        let next = state.turnIndex;
        for (let i = 0; i < state.players.length; i++) {
          next = (next + 1) % state.players.length;
          if (!state.players[next].bankrupt) break;
        }
        state.turnIndex = next;
        state.phase = 'roll';
      }
      return true;
    }

    default:
      return false;
  }
}
