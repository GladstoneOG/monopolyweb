// src/App.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarConfig, GameRules, MonopolyActionType, RoomState, Ruleset } from './engine/types';
import {
  fetchActiveLobbies,
  RoomSession,
  type LobbySummary,
} from './net/roomSession';
import type { ChatMessage, PeerLinkMode } from './net/protocol';
import { sfx } from './utils/audio';
import { applyMonopolyTheme, getSavedMonopolyThemeKey } from './utils/themeBridge';
import { DEFAULT_AVATAR } from './components/shared/AvatarCreator';
import { ChatDrawer } from './components/shared/ChatDrawer';
import { DevConsoleModal } from './components/shared/DevConsoleModal';
import { ThemeSelectorModal } from './components/shared/ThemeSelectorModal';
import { MenuScreen } from './components/menu/MenuScreen';
import { LobbyScreen } from './components/lobby/LobbyScreen';
import { MonopolyTable } from './components/board/MonopolyTable';

const PROFILE_STORAGE_KEY = 'monopoly_web_profile';

function loadSavedProfile(): { name: string; avatar: AvatarConfig } {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; avatar?: AvatarConfig };
      if (parsed.name && parsed.avatar) {
        return { name: parsed.name, avatar: parsed.avatar };
      }
    }
  } catch {
    // ignore
  }
  return { name: 'Tycoon', avatar: DEFAULT_AVATAR };
}

export function App() {
  const initial = loadSavedProfile();
  const [playerName, setPlayerName] = useState(initial.name);
  const [avatar, setAvatar] = useState<AvatarConfig>(initial.avatar);
  const [selectedRuleset, setSelectedRuleset] = useState<Ruleset>('Get Rich');

  const [room, setRoom] = useState<RoomState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [connectionMode, setConnectionMode] = useState<PeerLinkMode>('p2p-webrtc');
  const [peerModes, setPeerModes] = useState<Record<string, PeerLinkMode>>({});

  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => sfx.getMuted());

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tradeRejectedName, setTradeRejectedName] = useState<string | null>(null);

  const sessionRef = useRef<RoomSession | null>(null);
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;

  useEffect(() => {
    applyMonopolyTheme(getSavedMonopolyThemeKey());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ name: playerName, avatar }));
    } catch {
      // ignore
    }
  }, [playerName, avatar]);

  const refreshLobbies = useCallback(async () => {
    setIsLoadingLobbies(true);
    try {
      const list = await fetchActiveLobbies();
      setLobbies(list);
    } catch {
      // keep previous list quietly on transient network hiccup
    } finally {
      setIsLoadingLobbies(false);
    }
  }, []);

  // Poll live lobbies while on the Main Menu
  useEffect(() => {
    if (room) return;
    void refreshLobbies();
    const timer = setInterval(() => {
      void refreshLobbies();
    }, 5000);
    return () => clearInterval(timer);
  }, [room, refreshLobbies]);

  // Keyboard shortcut (`~`) for Host Dev Console
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' && isHost && room?.gameState === 'playing') {
        e.preventDefault();
        setIsDevConsoleOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isHost, room?.gameState]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const ensureSession = useCallback((): RoomSession => {
    if (sessionRef.current) return sessionRef.current;

    const session = new RoomSession({
      onStateChange: (nextRoom, myId, hostFlag) => {
        setRoom(nextRoom);
        setMyPlayerId(myId);
        setIsHost(hostFlag);
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev.slice(-149), msg]);
        if (!isChatOpenRef.current && !msg.system) {
          setUnreadChat((n) => n + 1);
        }
      },
      onChatHistory: (msgs) => {
        setChatMessages(msgs);
      },
      onConnectionModeChange: (mode, peers) => {
        setConnectionMode(mode);
        setPeerModes(peers);
      },
      onError: (msg) => {
        setErrorMessage(msg);
        showToast(`⚠️ ${msg}`);
      },
      onTradeRejected: (receiverName) => {
        setTradeRejectedName(receiverName);
        setTimeout(() => setTradeRejectedName(null), 3000);
      },
      onKicked: (reason) => {
        sessionRef.current?.dispose();
        sessionRef.current = null;
        setRoom(null);
        setErrorMessage(reason);
      },
      onHostMigrated: (newHostName) => {
        showToast(`👑 Host migrated to ${newHostName}!`);
      },
    });

    sessionRef.current = session;
    return session;
  }, [showToast]);

  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  const cleanName = playerName.trim() || 'Tycoon';

  const handleHostGame = useCallback(
    async (password: string) => {
      setErrorMessage(null);
      setBusyMessage('Hosting room on Cloudflare edge...');
      setChatMessages([]);
      setUnreadChat(0);
      try {
        const session = ensureSession();
        await session.createOnlineRoom({
          name: cleanName,
          avatar,
          rules: { ruleset: selectedRuleset },
          password: password || undefined,
        });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to host room.');
      } finally {
        setBusyMessage(null);
      }
    },
    [ensureSession, cleanName, avatar, selectedRuleset]
  );

  const handleJoinLobby = useCallback(
    async (code: string, password?: string) => {
      setErrorMessage(null);
      setBusyMessage(`Joining lobby #${code}...`);
      setChatMessages([]);
      setUnreadChat(0);
      try {
        const session = ensureSession();
        await session.joinOnlineRoom({ code, name: cleanName, avatar, password });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to join lobby.');
        void refreshLobbies();
      } finally {
        setBusyMessage(null);
      }
    },
    [ensureSession, cleanName, avatar, refreshLobbies]
  );

  const handleLeave = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setRoom(null);
    setChatMessages([]);
    setIsChatOpen(false);
    setIsDevConsoleOpen(false);
    setErrorMessage(null);
  }, []);

  const handleAction = useCallback((action: MonopolyActionType, payload?: unknown) => {
    sessionRef.current?.dispatchGameAction(action, payload);
  }, []);

  const handleUpdateRules = useCallback((partial: Partial<GameRules>) => {
    sessionRef.current?.updateRules(partial);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    sfx.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleChat = useCallback(() => {
    setIsChatOpen((open) => {
      if (!open) setUnreadChat(0);
      return !open;
    });
  }, []);

  return (
    <div className="app-root">
      {!room && (
        <MenuScreen
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          avatar={avatar}
          onAvatarChange={setAvatar}
          selectedRuleset={selectedRuleset}
          onRulesetChange={setSelectedRuleset}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onOpenThemes={() => setIsThemeModalOpen(true)}
          lobbies={lobbies}
          isLoadingLobbies={isLoadingLobbies}
          onRefreshLobbies={() => void refreshLobbies()}
          onHostGame={handleHostGame}
          onJoinLobby={handleJoinLobby}
          busyMessage={busyMessage}
          errorMessage={errorMessage}
        />
      )}

      {room && room.gameState === 'lobby' && (
        <LobbyScreen
          room={room}
          myPlayerId={myPlayerId}
          isHost={isHost}
          isLocalOnly={sessionRef.current?.getIsLocalOnly() ?? false}
          connectionMode={connectionMode}
          peerModes={peerModes}
          onUpdateRules={handleUpdateRules}
          onAddBot={() => sessionRef.current?.addBot()}
          onRemoveBot={(id) => sessionRef.current?.removeBot(id)}
          onKickPlayer={(id) => sessionRef.current?.kickPlayer(id)}
          onToggleReady={() => sessionRef.current?.toggleReady()}
          onStartGame={() => sessionRef.current?.startGame()}
          onLeave={handleLeave}
          onToggleChat={toggleChat}
          onOpenThemes={() => setIsThemeModalOpen(true)}
          unreadChat={unreadChat}
          errorMessage={errorMessage}
        />
      )}

      {room && (room.gameState === 'playing' || room.gameState === 'gameover') && (
        <MonopolyTable
          room={room}
          myPlayerId={myPlayerId}
          isHost={isHost}
          connectionMode={connectionMode}
          unreadChat={unreadChat}
          tradeRejectedName={tradeRejectedName}
          onAction={handleAction}
          onToggleChat={toggleChat}
          onOpenThemes={() => setIsThemeModalOpen(true)}
          onOpenDevConsole={() => setIsDevConsoleOpen(true)}
          onToggleMute={toggleMute}
          isMuted={isMuted}
          onRestartGame={() => sessionRef.current?.restartGame()}
          onReturnToLobby={() => sessionRef.current?.returnToLobby()}
          onLeaveRoom={handleLeave}
        />
      )}

      {room && (
        <ChatDrawer
          isOpen={isChatOpen}
          messages={chatMessages}
          myPlayerId={myPlayerId}
          onClose={() => setIsChatOpen(false)}
          onSendText={(text) => sessionRef.current?.sendChat(text, 'text')}
          onSendSticker={(url) => sessionRef.current?.sendChat('', 'sticker', url)}
        />
      )}

      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      <DevConsoleModal
        isOpen={isDevConsoleOpen}
        onClose={() => setIsDevConsoleOpen(false)}
        onRunCommand={(commandStr) => handleAction('dev-command', { commandStr })}
      />

      {toastMessage && <div className="floating-toast info">{toastMessage}</div>}
    </div>
  );
}

export default App;
