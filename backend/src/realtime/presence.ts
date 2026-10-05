import type { Server as SocketIOServer, Socket } from 'socket.io';
import Call from '../models/Call';
import User from '../models/User';
import Role from '../models/Role';
import { currentCompanyId } from '../tenancy/context';
import logger from '../utils/logger';

// Live team status plumbing. Anyone with the CRM open holds a socket, which
// joins `company:<id>`; that's how we know who is online, across every server
// instance thanks to the Redis adapter. Managers (users:read) also join
// `presence:<id>` and get a `presence:changed` nudge whenever someone comes
// online, goes offline or a call changes, then re-read GET /api/team/presence.

let io: SocketIOServer | null = null;

const companyRoom = (companyId: number) => `company:${companyId}`;
const watchersRoom = (companyId: number) => `presence:${companyId}`;

const canWatch = (user: any) => {
  if (user.isSuperAdmin) return true;
  let perms: string[] = [];
  try {
    const raw = user.role?.permissions;
    perms = typeof raw === 'string' ? JSON.parse(raw) : raw || [];
  } catch {
    perms = [];
  }
  return perms.includes('*') || perms.includes('users:read');
};

// Calls and connections can change many times a second; one nudge per
// company per half second is plenty.
const pending = new Map<number, NodeJS.Timeout>();
export const notifyPresenceChanged = (companyId: number | null | undefined) => {
  if (!io || !companyId || pending.has(companyId)) return;
  pending.set(
    companyId,
    setTimeout(() => {
      pending.delete(companyId);
      io?.to(watchersRoom(companyId)).emit('presence:changed');
    }, 500)
  );
};

/** Ids of this company's users with the CRM open right now, on any server instance. */
export const getOnlineUserIds = async (companyId: number): Promise<Set<number>> => {
  if (!io) return new Set();
  try {
    const sockets = await io.in(companyRoom(companyId)).fetchSockets();
    return new Set(sockets.map((s) => Number(s.data?.userId)).filter(Boolean));
  } catch (err) {
    // Another instance didn't answer in time; fall back to this one's sockets.
    logger.warn(`[presence] Could not list sockets across instances: ${err}`);
    const ids = io.of('/').adapter.rooms.get(companyRoom(companyId)) || new Set<string>();
    return new Set([...ids].map((id) => Number(io!.of('/').sockets.get(id)?.data?.userId)).filter(Boolean));
  }
};

/** Called for every authenticated socket from realtime/socket.ts. */
export const trackPresence = async (socket: Socket, userId: number) => {
  try {
    // No tenant context on a socket, so this reads the user directly by id.
    const user = await User.findByPk(userId, { include: [{ model: Role, as: 'role' }] });
    const companyId = user?.companyId;
    if (!user || !user.isActive || !companyId || socket.disconnected) return;

    socket.data.userId = userId;
    socket.data.companyId = companyId;
    socket.join(companyRoom(companyId));
    if (canWatch(user)) socket.join(watchersRoom(companyId));

    notifyPresenceChanged(companyId);
    socket.on('disconnect', () => notifyPresenceChanged(companyId));
  } catch (err) {
    logger.warn(`[presence] Could not track socket for user #${userId}: ${err}`);
  }
};

let hooksRegistered = false;

export const initPresence = (server: SocketIOServer) => {
  io = server;
  if (hooksRegistered) return;
  hooksRegistered = true;

  // Any change to a call (placed, ringing, answered, ended) can change its
  // agent's state. Hooks keep this out of the calling code itself.
  Call.addHook('afterSave', 'presence', (call: any) => {
    notifyPresenceChanged((call.get('companyId') as number | null) ?? currentCompanyId());
  });
  // The status flip to "ended" is a bulk update (see callService.applyUpdate),
  // which always runs inside the call's company context.
  Call.addHook('afterBulkUpdate', 'presence', () => notifyPresenceChanged(currentCompanyId()));
};
