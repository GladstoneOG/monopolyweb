// worker/index.ts
import { LOBBY_DIRECTORY_ID, SignalRoomDO, type SignalRoomEnv } from './SignalRoomDO';

export { SignalRoomDO };
export type Env = SignalRoomEnv;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        service: 'monopolyweb',
        architecture: 'host-and-peer-webrtc',
      });
    }

    if (url.pathname === '/api/lobbies' && request.method === 'GET') {
      const dirId = env.SIGNAL_ROOM.idFromName(LOBBY_DIRECTORY_ID);
      const dirStub = env.SIGNAL_ROOM.get(dirId);
      return dirStub.fetch('https://directory.internal/directory/list');
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const code = generateRoomCode();
      return Response.json({ code });
    }

    const wsMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{4})\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1].toUpperCase();
      const id = env.SIGNAL_ROOM.idFromName(code);
      const stub = env.SIGNAL_ROOM.get(id);
      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set('code', code);
      return stub.fetch(new Request(forwardUrl.toString(), request));
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
