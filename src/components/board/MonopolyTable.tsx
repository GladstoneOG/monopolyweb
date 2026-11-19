// src/components/board/MonopolyTable.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIRPORT_TILE_INDEX, PROPERTY_COLORS } from '../../engine/boardData';
import type { MonopolyActionType, RoomState } from '../../engine/types';
import type { PeerLinkMode } from '../../net/protocol';
import { sfx } from '../../utils/audio';
import {
  getPlayerColor,
  getPlayerColorTint,
  getPlayerStackCoords,
  getTileLocalCoords,
} from '../../utils/boardGeometry';
import { BottomActionHUD } from '../hud/BottomActionHUD';
import { CornerPlayerCards } from '../hud/CornerPlayerCards';
import { GetRichVictoryTracker } from '../hud/GetRichVictoryTracker';
import { AuctionModal } from '../modals/AuctionModal';
import { BuildManagerModal } from '../modals/BuildManagerModal';
import { CasinoCoinModal } from '../modals/CasinoCoinModal';
import { DeedModal } from '../modals/DeedModal';
import { DiceRollModal } from '../modals/DiceRollModal';
import { PhaseDecisionModals } from '../modals/PhaseDecisionModals';
import { PlayerDetailModal } from '../modals/PlayerDetailModal';
import {
  IncomingTradeModal,
  isTileTradable,
  TradeEditorModal,
  type TradeDraftState,
} from '../modals/TradeModals';
import { BoardCenterDecor, type FlyingCardAnim } from './BoardCenterDecor';
import {
  BoardTile,
  type FloatingTileText,
  type TileHighlightState,
  type TilePointerMarker,
} from './BoardTile';
import { FlyingBillsLayer, type FlyingBillParticle } from './FlyingBillsLayer';
import { PlayerTokensLayer } from './PlayerTokensLayer';
import { TableMoneyStacks } from './TableMoneyStacks';

interface MonopolyTableProps {
  room: RoomState;
  myPlayerId: string;
  isHost: boolean;
  connectionMode: PeerLinkMode;
  unreadChat: number;
  tradeRejectedName: string | null;
  onAction: (action: MonopolyActionType, payload?: unknown) => void;
  onToggleChat: () => void;
  onOpenThemes: () => void;
  onOpenDevConsole: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onRestartGame: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

const MAX_FLYING_BILLS = 18;

export const MonopolyTable: React.FC<MonopolyTableProps> = ({
  room,
  myPlayerId,
  isHost,
  connectionMode,
  unreadChat,
  tradeRejectedName,
  onAction,
  onToggleChat,
  onOpenThemes,
  onOpenDevConsole,
  onToggleMute,
  isMuted,
  onRestartGame,
  onReturnToLobby,
  onLeaveRoom,
}) => {
  const { players, board, turnIndex, dice, rollId, phase, rules } = room;
  const activePlayer = players[turnIndex] ?? null;
  const me = players.find((p) => p.id === myPlayerId) ?? null;
  const isMyTurn = activePlayer?.id === myPlayerId;

  // Modals & Trade UI state
  const [selectedDeedIndex, setSelectedDeedIndex] = useState<number | null>(null);
  const [detailedPlayerId, setDetailedPlayerId] = useState<string | null>(null);
  const [isBuildManagerOpen, setIsBuildManagerOpen] = useState(false);
  const [tradeDraft, setTradeDraft] = useState<TradeDraftState | null>(null);
  const [tradePickMode, setTradePickMode] = useState<'me' | 'them' | null>(null);
  const [viewingIncomingBoard, setViewingIncomingBoard] = useState(false);

  // Board Animation State
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>({});
  const [movingSteps, setMovingSteps] = useState<Record<string, number>>({});
  const [jailAnimActive, setJailAnimActive] = useState(false);
  const [flyingCard, setFlyingCard] = useState<FlyingCardAnim | null>(null);
  const [flyingBills, setFlyingBills] = useState<FlyingBillParticle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingTileText[]>([]);
  const [cameraShake, setCameraShake] = useState(false);
  const [isCameraManual, setIsCameraManual] = useState(false);
  const [introState, setIntroState] = useState<{
    active: boolean;
    curtainOpen: boolean;
    text: '3' | '2' | '1' | 'Roll!' | null;
  }>({ active: false, curtainOpen: true, text: null });

  // Zero-re-render camera refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const baseScaleRef = useRef(0.95);
  const camRef = useRef({ x: 0, y: 0, scale: 0.95, manual: false });
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  }>({ active: false, pointerId: -1, startX: 0, startY: 0, initX: 0, initY: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; initScale: number } | null>(null);

  const hopTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hopTargetsRef = useRef<Record<string, number>>({});
  const prevBoardRef = useRef(board);
  const prevPlayersRef = useRef(players);
  const prevTurnPlayerRef = useRef<string | null>(null);

  const applyCameraVars = useCallback(
    (x: number, y: number, scale: number, transition: string) => {
      camRef.current.x = x;
      camRef.current.y = y;
      camRef.current.scale = scale;
      const el = wrapperRef.current;
      if (!el) return;
      el.style.setProperty('--board-x', `${x}px`);
      el.style.setProperty('--board-y', `${y}px`);
      el.style.setProperty('--board-scale', String(scale));
      el.style.setProperty('--camera-transition', transition);
    },
    []
  );

  // Responsive viewport auto-fit via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const minDim = Math.min(rect.width, rect.height);
      const fit = Math.max(0.55, Math.min(1.12, (minDim / 860) * 0.96));
      baseScaleRef.current = fit;
      if (!camRef.current.manual) {
        applyCameraVars(camRef.current.x, camRef.current.y, fit, '0.4s');
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyCameraVars]);

  // Intro curtain & countdown on round start
  useEffect(() => {
    if (room.gameState !== 'playing') return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    setVisualPositions(
      Object.fromEntries(players.map((p) => [p.id, p.position]))
    );
    setIntroState({ active: true, curtainOpen: false, text: null });
    applyCameraVars(0, 340, 0.18, '0s');

    timers.push(
      setTimeout(() => {
        applyCameraVars(0, 0, baseScaleRef.current, '2.2s cubic-bezier(0.1, 0.85, 0.2, 1)');
        setIntroState({ active: true, curtainOpen: false, text: '3' });
        sfx.playCountdownBeep(false);
      }, 250)
    );
    timers.push(
      setTimeout(() => {
        setIntroState({ active: true, curtainOpen: false, text: '2' });
        sfx.playCountdownBeep(false);
      }, 850)
    );
    timers.push(
      setTimeout(() => {
        setIntroState({ active: true, curtainOpen: false, text: '1' });
        sfx.playCountdownBeep(false);
      }, 1450)
    );
    timers.push(
      setTimeout(() => {
        setIntroState({ active: true, curtainOpen: true, text: 'Roll!' });
        sfx.playCountdownBeep(true);
      }, 2050)
    );
    timers.push(
      setTimeout(() => {
        setIntroState({ active: false, curtainOpen: true, text: null });
      }, 2750)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
    // Run only when a new round starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roundNumber, room.gameState]);

  // Turn ping notification
  useEffect(() => {
    if (room.gameState === 'playing' && activePlayer) {
      if (activePlayer.id === myPlayerId && prevTurnPlayerRef.current !== myPlayerId) {
        sfx.playPing();
      }
      prevTurnPlayerRef.current = activePlayer.id;
    } else {
      prevTurnPlayerRef.current = null;
    }
  }, [activePlayer, myPlayerId, room.gameState]);

  // Sync player managing/trading status badge
  const lastStatusRef = useRef<'managing' | 'trading' | null>(null);
  useEffect(() => {
    if (room.gameState !== 'playing') return;
    const status = isBuildManagerOpen ? 'managing' : tradeDraft ? 'trading' : null;
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status;
      onAction('set-player-status', status);
    }
  }, [isBuildManagerOpen, tradeDraft, room.gameState, onAction]);

  // Floating text helper
  const pushFloatingText = useCallback(
    (tileIndex: number, text: string, type: FloatingTileText['type']) => {
      const id = `${type}_${tileIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setFloatingTexts((prev) => [...prev, { id, tileIndex, text, type }]);
      setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((item) => item.id !== id));
      }, 2200);
    },
    []
  );

  // Token tile-by-tile hop coordinator
  const stepHop = useCallback(
    (pId: string, current: number, target: number, isBackward: boolean, isJail: boolean) => {
      if (isJail) {
        setVisualPositions((prev) => ({ ...prev, [pId]: 10 }));
        setJailAnimActive(true);
        sfx.playJail();
        setCameraShake(true);
        setTimeout(() => setCameraShake(false), 400);
        setTimeout(() => setJailAnimActive(false), 2200);
        setMovingSteps((prev) => {
          const next = { ...prev };
          delete next[pId];
          return next;
        });
        delete hopTimersRef.current[pId];
        delete hopTargetsRef.current[pId];
        return;
      }

      if (current === target) {
        sfx.playCard();
        const coords = getTileLocalCoords(target);
        if (!camRef.current.manual && !dragRef.current.active) {
          applyCameraVars(-coords.x * 1.15, -coords.y * 1.15, baseScaleRef.current * 1.2, '0.45s');
        }
        setMovingSteps((prev) => {
          const next = { ...prev };
          delete next[pId];
          return next;
        });
        delete hopTimersRef.current[pId];
        delete hopTargetsRef.current[pId];
        return;
      }

      const stepsLeft = isBackward
        ? (current - target + 40) % 40
        : (target - current + 40) % 40;
      const nextPos = isBackward ? (current - 1 + 40) % 40 : (current + 1) % 40;

      setMovingSteps((prev) => ({ ...prev, [pId]: stepsLeft }));
      setVisualPositions((prev) => ({ ...prev, [pId]: nextPos }));
      if (nextPos === 0 && !isBackward) {
        pushFloatingText(0, 'Salary +$200!', 'salary');
      }
      sfx.playTick();

      hopTimersRef.current[pId] = setTimeout(() => {
        stepHop(pId, nextPos, target, isBackward, false);
      }, 220);
    },
    [applyCameraVars, pushFloatingText]
  );

  // Trigger hops when player positions advance (after dice modal closes)
  useEffect(() => {
    if (room.gameState !== 'playing' || isDiceRolling) return;

    for (const p of players) {
      const vis = visualPositions[p.id];
      if (vis === undefined) {
        setVisualPositions((prev) => ({ ...prev, [p.id]: p.position }));
        continue;
      }

      if (hopTimersRef.current[p.id] && hopTargetsRef.current[p.id] !== p.position) {
        clearTimeout(hopTimersRef.current[p.id]);
        delete hopTimersRef.current[p.id];
      }

      if (vis !== p.position && !hopTimersRef.current[p.id]) {
        const isJailTeleport = p.inJail && p.position === 10;
        const isAirportFly =
          room.lastActionDetail?.type === 'airport' &&
          room.lastActionDetail.tileIndex === p.position &&
          p.id === activePlayer?.id;

        if (isAirportFly) {
          sfx.playAirportWhoosh();
          setVisualPositions((prev) => ({ ...prev, [p.id]: p.position }));
          pushFloatingText(p.position, '✈️ Arrived!', 'airport');
          continue;
        }

        const isBackward = (vis - p.position + 40) % 40 === 3;
        hopTargetsRef.current[p.id] = p.position;
        stepHop(p.id, vis, p.position, isBackward, isJailTeleport);
      }
    }
  }, [
    players,
    room.gameState,
    room.lastActionDetail,
    isDiceRolling,
    visualPositions,
    activePlayer?.id,
    stepHop,
    pushFloatingText,
  ]);

  // Clean up hop timers on unmount
  useEffect(() => {
    return () => {
      Object.values(hopTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const isAnyoneMoving = players.some(
    (p) => visualPositions[p.id] !== undefined && visualPositions[p.id] !== p.position
  );
  const isAnimating =
    isDiceRolling || isAnyoneMoving || jailAnimActive || introState.active;

  // Dynamic camera focus based on game phase (when not in manual pan)
  useEffect(() => {
    if (introState.active || camRef.current.manual || dragRef.current.active) return;

    if (
      phase === 'roll' ||
      phase === 'rolling_animation' ||
      phase === 'airport_selection' ||
      phase === 'festival_selection' ||
      tradePickMode ||
      viewingIncomingBoard
    ) {
      applyCameraVars(0, 0, baseScaleRef.current, '0.9s');
    } else if (activePlayer) {
      const pos = visualPositions[activePlayer.id] ?? activePlayer.position;
      const coords = getTileLocalCoords(pos);
      applyCameraVars(-coords.x * 1.15, -coords.y * 1.15, baseScaleRef.current * 1.18, '0.8s');
    }
  }, [
    phase,
    activePlayer,
    visualPositions,
    introState.active,
    tradePickMode,
    viewingIncomingBoard,
    applyCameraVars,
  ]);

  // Card flying animation from deck when Chance/Chest is drawn
  useEffect(() => {
    if (phase !== 'card_drawn' || !room.currentCard || !room.cardType) {
      setFlyingCard(null);
      return;
    }
    const isChance = room.cardType === 'chance';
    const startX = isChance ? 110 : -110;
    const startY = isChance ? -120 : 120;
    const startRot = isChance ? -45 : 135;
    const pos = activePlayer ? visualPositions[activePlayer.id] ?? activePlayer.position : 0;
    const end = getTileLocalCoords(pos);

    setFlyingCard({
      x: startX,
      y: startY,
      z: 6,
      rot: startRot,
      scale: 0.8,
      type: room.cardType,
    });
    sfx.playDraw();

    const t1 = setTimeout(() => {
      setFlyingCard({
        x: end.x,
        y: end.y,
        z: 52,
        rot: startRot + 360,
        scale: 1.18,
        type: room.cardType!,
      });
    }, 45);

    const t2 = setTimeout(() => setFlyingCard(null), 950);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase, room.currentCard, room.cardType, activePlayer, visualPositions]);

  // Capped flying bills & floating action text diff watcher
  const spawnFlyingBills = useCallback(
    (fromIdx: number, toIdx: number, fromBank: boolean, toBank: boolean, amount: number) => {
      const startBase = fromBank ? { x: 319, y: 310, z: 75 } : getPlayerStackCoords(fromIdx);
      const endBase = toBank ? { x: 319, y: 310, z: 75 } : getPlayerStackCoords(toIdx);

      let rem = Math.abs(amount);
      const vals: number[] = [];
      for (const denom of [500, 100, 50, 10]) {
        const c = Math.floor(rem / denom);
        rem %= denom;
        for (let i = 0; i < c && vals.length < MAX_FLYING_BILLS; i++) {
          vals.push(denom);
        }
      }
      if (vals.length === 0) vals.push(10);

      const batch: FlyingBillParticle[] = vals.map((val, i) => ({
        id: `bill_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        val,
        startX: startBase.x + (Math.random() - 0.5) * 44,
        startY: startBase.y + (Math.random() - 0.5) * 28,
        startZ: startBase.z + i * 2,
        endX: endBase.x + (Math.random() - 0.5) * 44,
        endY: endBase.y + (Math.random() - 0.5) * 28,
        endZ: endBase.z + i * 2,
        rotStart: Math.random() * 360,
        rotEnd: (Math.random() - 0.5) * 45,
        delay: i * 55,
      }));

      setFlyingBills((prev) => [...prev, ...batch]);
      setTimeout(() => {
        const ids = new Set(batch.map((b) => b.id));
        setFlyingBills((prev) => prev.filter((b) => !ids.has(b.id)));
      }, 1450 + batch.length * 55);
    },
    []
  );

  useEffect(() => {
    if (room.gameState !== 'playing' || isAnyoneMoving) return;

    const prevBoard = prevBoardRef.current;
    const prevPlayers = prevPlayersRef.current;

    if (prevBoard.length === board.length) {
      for (let i = 0; i < board.length; i++) {
        const tile = board[i];
        const prev = prevBoard[i];
        if (!prev) continue;
        if (tile.owner && !prev.owner) pushFloatingText(tile.index, 'Bought!', 'bought');
        else if (tile.owner && prev.owner && tile.owner !== prev.owner) {
          const isForce =
            room.lastActionDetail?.type === 'force-acquire' &&
            room.lastActionDetail.tileIndex === tile.index;
          pushFloatingText(tile.index, isForce ? 'Acquired!' : 'Traded!', isForce ? 'acquired' : 'traded');
        }
        if (tile.houses > prev.houses) {
          pushFloatingText(tile.index, tile.houses === 5 ? 'Hotel!' : 'Built!', 'built');
        } else if (tile.houses < prev.houses) {
          pushFloatingText(tile.index, 'Sold!', 'sold');
        }
        if (tile.mortgaged && !prev.mortgaged) pushFloatingText(tile.index, 'Mortgaged!', 'mortgaged');
        if (tile.festivalTurns > 0 && prev.festivalTurns === 0) {
          pushFloatingText(tile.index, 'Festival! 🎉', 'festival');
          sfx.playFestivalFanfare();
        }
      }
    }

    if (prevPlayers.length === players.length) {
      const senders: Array<{ idx: number; amount: number }> = [];
      const receivers: Array<{ idx: number; amount: number }> = [];
      players.forEach((p, idx) => {
        const prev = prevPlayers.find((pp) => pp.id === p.id);
        if (prev && prev.money !== p.money) {
          const diff = p.money - prev.money;
          if (diff < 0) senders.push({ idx, amount: -diff });
          else receivers.push({ idx, amount: diff });
        }
      });

      if (senders.length > 0 && receivers.length > 0) {
        spawnFlyingBills(senders[0].idx, receivers[0].idx, false, false, Math.max(senders[0].amount, receivers[0].amount));
        sfx.playMoney();
      } else if (senders.length > 0) {
        spawnFlyingBills(senders[0].idx, senders[0].idx, false, true, senders[0].amount);
        sfx.playMoney();
      } else if (receivers.length > 0) {
        spawnFlyingBills(receivers[0].idx, receivers[0].idx, true, false, receivers[0].amount);
        sfx.playMoney();
      }
    }

    prevBoardRef.current = board;
    prevPlayersRef.current = players;
  }, [board, players, room.gameState, room.lastActionDetail, isAnyoneMoving, pushFloatingText, spawnFlyingBills]);

  // Zero-re-render pointer drag & pinch zoom handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('.corner-card') ||
      target.closest('.monopoly-unified-hud-bottom') ||
      target.closest('.modal-backdrop') ||
      target.closest('.drawn-card-popup') ||
      target.closest('.floating-selector-banner') ||
      target.closest('.chat-drawer-panel')
    ) {
      return;
    }

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        initX: camRef.current.x,
        initY: camRef.current.y,
      };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist, initScale: camRef.current.scale };
      dragRef.current.active = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / Math.max(1, pinchRef.current.dist);
      const nextScale = Math.min(2.4, Math.max(0.45, pinchRef.current.initScale * ratio));
      camRef.current.manual = true;
      setIsCameraManual(true);
      applyCameraVars(camRef.current.x, camRef.current.y, nextScale, '0s');
      return;
    }

    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      if (!camRef.current.manual) {
        camRef.current.manual = true;
        setIsCameraManual(true);
      }
    }

    const angle = (-45 * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const adjDy = dy / 0.743;
    const localDx = (dx * cosA - adjDy * sinA) / camRef.current.scale;
    const localDy = (dx * sinA + adjDy * cosA) / camRef.current.scale;

    let nx = dragRef.current.initX + localDx;
    let ny = dragRef.current.initY + localDy;
    const dist = Math.hypot(nx, ny);
    const maxDist = 420;
    if (dist > maxDist) {
      const clamped = maxDist + Math.log(dist - maxDist + 1) * 24;
      nx = (nx / dist) * clamped;
      ny = (ny / dist) * clamped;
    }
    applyCameraVars(nx, ny, camRef.current.scale, '0s');
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
      const dist = Math.hypot(camRef.current.x, camRef.current.y);
      if (dist > 420) {
        applyCameraVars(
          (camRef.current.x / dist) * 420,
          (camRef.current.y / dist) * 420,
          camRef.current.scale,
          '0.35s'
        );
      }
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.modal-backdrop') ||
        target.closest('.chat-drawer-panel')
      ) {
        return;
      }
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const nextScale = Math.min(2.4, Math.max(0.45, camRef.current.scale + dir * 0.06));
      camRef.current.manual = true;
      setIsCameraManual(true);
      applyCameraVars(camRef.current.x, camRef.current.y, nextScale, '0.1s');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyCameraVars]);

  // Monopoly color groups memo
  const monopolyGroups = useMemo(() => {
    const groups: Record<string, string | null> = {};
    for (const color of PROPERTY_COLORS) {
      const list = board.filter((t) => t.type === 'property' && t.color === color);
      const first = list[0]?.owner ?? null;
      groups[color] = first && list.every((t) => t.owner === first) ? first : null;
    }
    return groups;
  }, [board]);

  // Tile pointers map
  const pointersByTile = useMemo(() => {
    const map: Record<number, TilePointerMarker[]> = {};
    for (const p of players) {
      if (p.bankrupt) continue;
      const pos = visualPositions[p.id] ?? p.position;
      if (!map[pos]) map[pos] = [];
      map[pos].push({ playerId: p.id, color: getPlayerColor(players, p.id) });
    }
    return map;
  }, [players, visualPositions]);

  // Floating texts by tile
  const textsByTile = useMemo(() => {
    const map: Record<number, FloatingTileText[]> = {};
    for (const ft of floatingTexts) {
      if (!map[ft.tileIndex]) map[ft.tileIndex] = [];
      map[ft.tileIndex].push(ft);
    }
    return map;
  }, [floatingTexts]);

  const handleTileClick = useCallback(
    (idx: number) => {
      const tile = board[idx];
      if (!tile) return;

      if (tradePickMode && tradeDraft) {
        const tradable = isTileTradable(tile, board, rules.ruleset);
        if (!tradable) return;
        if (tradePickMode === 'me' && tile.owner === myPlayerId) {
          setTradeDraft((d) =>
            d
              ? {
                  ...d,
                  offeredProperties: d.offeredProperties.includes(idx)
                    ? d.offeredProperties.filter((x) => x !== idx)
                    : [...d.offeredProperties, idx],
                }
              : d
          );
          sfx.playTick();
        } else if (tradePickMode === 'them' && tile.owner === tradeDraft.targetId) {
          setTradeDraft((d) =>
            d
              ? {
                  ...d,
                  demandedProperties: d.demandedProperties.includes(idx)
                    ? d.demandedProperties.filter((x) => x !== idx)
                    : [...d.demandedProperties, idx],
                }
              : d
          );
          sfx.playTick();
        }
        return;
      }

      if (viewingIncomingBoard) return;

      if (!isAnimating && phase === 'airport_selection' && isMyTurn && activePlayer) {
        if (idx !== AIRPORT_TILE_INDEX && idx !== activePlayer.position) {
          onAction('airport-fly', { targetIndex: idx });
          sfx.playTick();
        }
        return;
      }

      if (!isAnimating && phase === 'festival_selection' && isMyTurn) {
        const valid =
          (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') &&
          tile.owner === myPlayerId &&
          !tile.mortgaged;
        if (valid) {
          onAction('festival-select', idx);
          sfx.playTick();
        }
        return;
      }

      if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
        setSelectedDeedIndex(idx);
        sfx.playDraw();
      }
    },
    [
      board,
      tradePickMode,
      tradeDraft,
      rules.ruleset,
      myPlayerId,
      viewingIncomingBoard,
      isAnimating,
      phase,
      isMyTurn,
      activePlayer,
      onAction,
    ]
  );

  const openTradeWith = useCallback((targetId: string, initialDemandTile?: number) => {
    setSelectedDeedIndex(null);
    setDetailedPlayerId(null);
    setTradeDraft({
      targetId,
      offeredProperties: [],
      offeredMoney: 0,
      offeredJailCards: 0,
      demandedProperties: initialDemandTile !== undefined ? [initialDemandTile] : [],
      demandedMoney: 0,
      demandedJailCards: 0,
    });
  }, []);

  const handleCounterOffer = useCallback(() => {
    const t = room.activeTrade;
    if (!t) return;
    onAction('trade-counter');
    setTradeDraft({
      targetId: t.senderId,
      offeredProperties: [...t.receiverProperties],
      offeredMoney: t.receiverMoney,
      offeredJailCards: t.receiverJailCards,
      demandedProperties: [...t.senderProperties],
      demandedMoney: t.senderMoney,
      demandedJailCards: t.senderJailCards,
    });
  }, [room.activeTrade, onAction]);

  const handleSendTrade = useCallback(() => {
    if (!tradeDraft) return;
    onAction('trade-propose', {
      receiverId: tradeDraft.targetId,
      senderProperties: tradeDraft.offeredProperties,
      senderMoney: tradeDraft.offeredMoney,
      senderJailCards: tradeDraft.offeredJailCards,
      receiverProperties: tradeDraft.demandedProperties,
      receiverMoney: tradeDraft.demandedMoney,
      receiverJailCards: tradeDraft.demandedJailCards,
    });
    setTradeDraft(null);
    setTradePickMode(null);
  }, [tradeDraft, onAction]);

  const getHighlightForTile = (idx: number): TileHighlightState => {
    const tile = board[idx];
    if (tradePickMode && tradeDraft) {
      const tradable = isTileTradable(tile, board, rules.ruleset);
      if (tradePickMode === 'me') {
        if (tile.owner === myPlayerId && tradable) {
          const sel = tradeDraft.offeredProperties.includes(idx);
          return {
            mode: sel ? 'selected' : 'selectable',
            badge: sel ? '✓' : '+',
            accentColor: '#10b981',
          };
        }
        return { mode: 'dimmed' };
      }
      if (tile.owner === tradeDraft.targetId && tradable) {
        const sel = tradeDraft.demandedProperties.includes(idx);
        return {
          mode: sel ? 'selected' : 'selectable',
          badge: sel ? '✓' : '+',
          accentColor: '#3b82f6',
        };
      }
      return { mode: 'dimmed' };
    }

    if (viewingIncomingBoard && room.activeTrade) {
      if (room.activeTrade.senderProperties.includes(idx)) {
        return { mode: 'trade-get', badge: 'GET', accentColor: '#10b981' };
      }
      if (room.activeTrade.receiverProperties.includes(idx)) {
        return { mode: 'trade-give', badge: 'GIVE', accentColor: '#ef4444' };
      }
      return { mode: 'dimmed' };
    }

    if (!isAnimating && phase === 'airport_selection' && isMyTurn && activePlayer) {
      if (idx !== AIRPORT_TILE_INDEX && idx !== activePlayer.position) {
        return { mode: 'selectable', badge: '✈️', accentColor: '#0284c7' };
      }
      return { mode: 'dimmed' };
    }

    if (!isAnimating && phase === 'festival_selection' && isMyTurn) {
      const own =
        (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') &&
        tile.owner === myPlayerId &&
        !tile.mortgaged;
      return own
        ? { mode: 'selectable', badge: '🎉', accentColor: '#f59e0b' }
        : { mode: 'dimmed' };
    }

    return { mode: 'none' };
  };

  const activeLandedIdx = activePlayer
    ? visualPositions[activePlayer.id] ?? activePlayer.position
    : -1;

  return (
    <div
      ref={containerRef}
      className="monopoly-table-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Intro Curtain */}
      {introState.active && (
        <div className="monopoly-intro-overlay">
          <div className={`monopoly-intro-curtain-left ${introState.curtainOpen ? 'open' : ''}`} />
          <div className={`monopoly-intro-curtain-right ${introState.curtainOpen ? 'open' : ''}`} />
          {introState.text && (
            <div
              className={`monopoly-intro-countdown-text ${
                introState.text === 'Roll!' ? 'roll-text' : ''
              }`}
            >
              {introState.text}
            </div>
          )}
        </div>
      )}

      {/* Ambient Tabletop Rings */}
      <div className="monopoly-ambient-bg">
        <div className="bg-glow-ring" />
        <div className="bg-glow-ring-alt" />
      </div>

      {/* Isometric 3D Camera Rig */}
      <div ref={wrapperRef} className="monopoly-board-wrapper">
        <div className={`monopoly-board-tilt ${cameraShake ? 'camera-shake' : ''}`}>
          <TableMoneyStacks players={players} />
          <FlyingBillsLayer bills={flyingBills} />

          <div className="monopoly-board-grid">
            {board.map((tile) => {
              const monoOwner =
                tile.type === 'property' && tile.color ? monopolyGroups[tile.color] : null;
              return (
                <BoardTile
                  key={tile.index}
                  tile={tile}
                  ruleset={rules.ruleset}
                  ownerColor={getPlayerColor(players, tile.owner)}
                  ownerTint={getPlayerColorTint(players, tile.owner)}
                  monopolyGlowColor={monoOwner ? getPlayerColor(players, monoOwner) : null}
                  isHighlightedActive={activeLandedIdx === tile.index}
                  highlight={getHighlightForTile(tile.index)}
                  pointers={pointersByTile[tile.index] ?? []}
                  floatingTexts={textsByTile[tile.index] ?? []}
                  showJailBars={tile.index === 10 && jailAnimActive}
                  onTileClick={handleTileClick}
                />
              );
            })}

            <BoardCenterDecor
              ruleset={rules.ruleset}
              turnCount={room.turnCount}
              turnLimit={rules.turnLimit}
              isDimmed={Boolean(tradePickMode || viewingIncomingBoard)}
              flyingCard={flyingCard}
            />

            <PlayerTokensLayer
              players={players}
              visualPositions={visualPositions}
              movingSteps={movingSteps}
              activePlayerId={room.gameState === 'playing' ? activePlayer?.id ?? null : null}
              hidden={Boolean(tradePickMode || viewingIncomingBoard)}
            />
          </div>
        </div>
      </div>

      {/* Top Header Bar */}
      <div className="monopoly-top-middle-header">
        <span className="header-mode-pill">
          {connectionMode === 'p2p-webrtc'
            ? `⚡ P2P · ${room.code}`
            : connectionMode === 'ws-relay'
            ? `☁️ Relay · ${room.code}`
            : `🤖 Solo`}
        </span>
        <button type="button" className="top-header-btn" onClick={onToggleChat}>
          💬 Chat {unreadChat > 0 ? `(${unreadChat})` : ''}
        </button>
        <button type="button" className="top-header-btn" onClick={onOpenThemes} title="Themes">
          🎨
        </button>
        <button type="button" className="top-header-btn" onClick={onToggleMute} title="Toggle SFX">
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="top-header-btn-leave" onClick={onLeaveRoom}>
          Leave
        </button>
      </div>

      {rules.ruleset === 'Get Rich' && room.gameState === 'playing' && (
        <GetRichVictoryTracker players={players} board={board} />
      )}

      {/* Corner Player Cards */}
      <CornerPlayerCards
        players={players}
        turnIndex={turnIndex}
        myPlayerId={myPlayerId}
        ruleset={rules.ruleset}
        isFrozen={isAnyoneMoving}
        onSelectPlayer={(id) => {
          setDetailedPlayerId(id);
          sfx.playDraw();
        }}
      />

      {/* Bottom Turn & Property HUD */}
      {room.gameState === 'playing' && (
        <BottomActionHUD
          myPlayerId={myPlayerId}
          activePlayer={activePlayer}
          phase={phase}
          ruleset={rules.ruleset}
          isAnimating={isAnimating}
          isDiceRolling={isDiceRolling}
          isHost={isHost}
          onAction={onAction}
          onOpenManage={() => {
            setIsBuildManagerOpen(true);
            sfx.playDraw();
          }}
          onOpenDevConsole={onOpenDevConsole}
        />
      )}

      {/* Reset Camera Floating Button */}
      {isCameraManual && (
        <button
          type="button"
          className="reset-camera-btn"
          onClick={() => {
            camRef.current.manual = false;
            setIsCameraManual(false);
            applyCameraVars(0, 0, baseScaleRef.current, '0.7s');
          }}
        >
          📷 Reset Camera
        </button>
      )}

      {/* Trade Board Picker Banner */}
      {tradePickMode && tradeDraft && (
        <div className="floating-selector-banner gold">
          <div className="fsb-title">
            🗺️ PICK PROPERTIES ({tradePickMode === 'me' ? 'YOUR OFFER' : 'YOUR REQUEST'})
          </div>
          <div className="fsb-desc">
            Click highlighted properties on the board to toggle selection.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setTradePickMode(null)}
          >
            Done Selecting
          </button>
        </div>
      )}

      {viewingIncomingBoard && room.activeTrade && (
        <div className="floating-selector-banner gold">
          <div className="fsb-title">👁️ VIEWING PROPOSED TRADE</div>
          <div className="fsb-desc">
            Green = Properties you receive · Red = Properties you give.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setViewingIncomingBoard(false)}
          >
            Back to Offer
          </button>
        </div>
      )}

      {/* Isolated Dice Modal */}
      <DiceRollModal
        rollId={rollId}
        dice={dice}
        activePlayerColor={getPlayerColor(players, activePlayer?.id ?? null)}
        activePlayerName={activePlayer?.name ?? 'Player'}
        onAnimationChange={setIsDiceRolling}
      />

      {/* Casino 3D Coin Modal */}
      <CasinoCoinModal
        casinoState={room.casinoState}
        players={players}
        myPlayerId={myPlayerId}
        isAnimatingBoard={isAnimating}
        onAction={onAction}
      />

      {/* Phase Decision Popups & Game Over Podium */}
      <PhaseDecisionModals
        gameState={room.gameState}
        phase={phase}
        ruleset={rules.ruleset}
        myPlayerId={myPlayerId}
        isHost={isHost}
        isAnimating={isAnimating}
        players={players}
        activePlayer={activePlayer}
        board={board}
        currentCard={room.currentCard}
        cardType={room.cardType}
        activeDebt={room.activeDebt}
        pendingRent={room.pendingRent}
        pendingForceAcquire={room.pendingForceAcquire}
        landedBuildMaxHouses={room.landedBuildMaxHouses}
        winReason={room.winReason}
        onAction={onAction}
        onOpenBuildManager={() => {
          setIsBuildManagerOpen(true);
          sfx.playDraw();
        }}
        onRestartGame={onRestartGame}
        onReturnToLobby={onReturnToLobby}
        onLeaveRoom={onLeaveRoom}
      />

      {/* Auction Modal */}
      {phase === 'auction' && (
        <AuctionModal
          auctionState={room.auctionState}
          board={board}
          players={players}
          myPlayerId={myPlayerId}
          onAction={onAction}
        />
      )}

      {/* Title Deed Modal */}
      <DeedModal
        tile={selectedDeedIndex !== null ? board[selectedDeedIndex] ?? null : null}
        board={board}
        players={players}
        dice={dice}
        myPlayerId={myPlayerId}
        isMyTurn={isMyTurn}
        onClose={() => setSelectedDeedIndex(null)}
        onProposeTrade={(ownerId, idx) => openTradeWith(ownerId, idx)}
      />

      {/* Property & Build Manager Modal */}
      <BuildManagerModal
        isOpen={isBuildManagerOpen}
        board={board}
        me={me}
        isMyTurn={isMyTurn}
        ruleset={rules.ruleset}
        onAction={onAction}
        onClose={() => setIsBuildManagerOpen(false)}
      />

      {/* Player Detail Modal */}
      <PlayerDetailModal
        player={detailedPlayerId ? players.find((p) => p.id === detailedPlayerId) ?? null : null}
        players={players}
        board={board}
        dice={dice}
        myPlayerId={myPlayerId}
        activePlayerId={activePlayer?.id ?? null}
        phase={phase}
        ruleset={rules.ruleset}
        onClose={() => setDetailedPlayerId(null)}
        onStartTrade={(targetId) => openTradeWith(targetId)}
      />

      {/* Trade Editor Modal */}
      {tradeDraft && !tradePickMode && me && (() => {
        const target = players.find((p) => p.id === tradeDraft.targetId);
        if (!target) return null;
        return (
          <TradeEditorModal
            draft={tradeDraft}
            onUpdateDraft={(updater) =>
              setTradeDraft((prev) => (prev ? updater(prev) : prev))
            }
            me={me}
            target={target}
            board={board}
            ruleset={rules.ruleset}
            isCounterOffer={
              room.activeTrade?.status === 'countering' &&
              room.activeTrade.receiverId === myPlayerId
            }
            onPickFromBoard={(side) => setTradePickMode(side)}
            onSend={handleSendTrade}
            onCancel={() => {
              setTradeDraft(null);
              setTradePickMode(null);
              if (
                room.activeTrade?.status === 'countering' &&
                room.activeTrade.receiverId === myPlayerId
              ) {
                onAction('trade-decline');
              }
            }}
          />
        );
      })()}

      {/* Incoming Trade Modal */}
      {room.activeTrade &&
        room.activeTrade.receiverId === myPlayerId &&
        room.activeTrade.status === 'pending' &&
        !viewingIncomingBoard &&
        (() => {
          const sender = players.find((p) => p.id === room.activeTrade!.senderId);
          if (!sender) return null;
          return (
            <IncomingTradeModal
              trade={room.activeTrade}
              sender={sender}
              board={board}
              onAction={onAction}
              onCounterOffer={handleCounterOffer}
              onViewBoard={() => setViewingIncomingBoard(true)}
            />
          );
        })()}

      {/* Awaiting Trade Response Banner */}
      {room.activeTrade && room.activeTrade.senderId === myPlayerId && (
        <div className="modal-backdrop light">
          <div className="awaiting-trade-card">
            <div className="awaiting-icon">⏳</div>
            <h4>
              {room.activeTrade.status === 'countering'
                ? 'Opponent Countering!'
                : 'Trade Offer Sent!'}
            </h4>
            <p>
              Waiting for{' '}
              <strong>
                {players.find((p) => p.id === room.activeTrade!.receiverId)?.name ?? 'opponent'}
              </strong>
              ...
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onAction('trade-cancel')}
            >
              Cancel Offer
            </button>
          </div>
        </div>
      )}

      {/* Trade Rejected Toast */}
      {tradeRejectedName && (
        <div className="floating-toast error">
          ❌ <strong>{tradeRejectedName}</strong> declined your trade offer.
        </div>
      )}
    </div>
  );
};
