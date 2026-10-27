/** Helpers that work for both direct chats (with `peer`) and groups (with `group`). */

export const isGroup = (conversation) => conversation?.type === 'group';

/** Name shown for the chat: the group's name or the other person's name. */
export const chatTitle = (conversation) => (isGroup(conversation) ? conversation.group.name : (conversation?.peer?.name ?? ''));

/** Object for <Avatar user=…>: groups get their photo/initials and never an online dot. */
export function chatAvatar(conversation) {
  if (!isGroup(conversation)) return conversation?.peer;
  return { id: conversation.id, name: conversation.group.name, avatarUrl: conversation.group.avatarUrl, isOnline: false };
}

export const isGroupAdmin = (conversation) => ['owner', 'admin'].includes(conversation?.group?.myRole);

/** May I post here? (Groups can be set to "only admins can send".) */
export function canSend(conversation) {
  if (!isGroup(conversation)) return !conversation?.peer?.isBlocked;
  return conversation.group.sendPermission === 'all' || isGroupAdmin(conversation);
}

/** "You" for my own messages, else the sender's name. */
export const senderLabel = (message, me) => (message.senderId === me ? 'You' : (message.senderName ?? 'Someone'));

const nameOf = (user, me) => (user?.id === me ? 'you' : (user?.name ?? 'someone'));
const listNames = (users = [], me) => {
  const names = users.map((u) => nameOf(u, me));
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

/** In a group call note: did I take part? (Whoever started it always did.) */
const tookPart = ({ callerId, participantIds }, me) => callerId === me || Boolean(participantIds?.includes(me));

/**
 * "Missed voice call", "Video call · 2:31", "Group video call · 12:04"… (from the viewer's side).
 * A group call I wasn't in counts as missed for me.
 */
export function callText(data, me) {
  const { type, durationSec = 0, callerId, group } = data;
  const kind = `${group ? 'group ' : ''}${type === 'video' ? 'video call' : 'voice call'}`;
  const Kind = kind[0].toUpperCase() + kind.slice(1);
  const outgoing = callerId === me;
  const status = group && data.status === 'ended' && !tookPart(data, me) ? 'missed' : data.status;
  switch (status) {
    case 'ended': {
      const m = Math.floor(durationSec / 60);
      const s = String(durationSec % 60).padStart(2, '0');
      return `${Kind} · ${m}:${s}`;
    }
    case 'missed':
      return outgoing ? `${Kind} · No answer` : `Missed ${kind}`;
    case 'rejected':
      return outgoing ? `${Kind} · Declined` : `Declined ${kind}`;
    case 'busy':
      return outgoing ? `${Kind} · Busy` : `Missed ${kind}`;
    default:
      return `${Kind} · Failed`;
  }
}

/** A call I didn't pick up (shown in red). In a group: one I was rung for and never joined. */
export const isMissedCall = (data, me) => {
  if (data.callerId === me) return false;
  if (data.group) return data.status === 'missed' || !tookPart(data, me);
  return data.status === 'missed' || data.status === 'busy';
};

/** Text of a system message, e.g. "Olivia added Ann and you". */
export function eventText(message, me) {
  const actor = message.senderId === me ? 'You' : (message.senderName ?? 'Someone');
  const { type, data = {} } = message.event ?? {};
  switch (type) {
    case 'call':
      return callText(data, me);
    case 'call_recording': {
      const m = Math.floor((data.durationSec ?? 0) / 60);
      const s = String((data.durationSec ?? 0) % 60).padStart(2, '0');
      return `${actor} recorded the ${data.kind === 'video' ? 'video' : 'voice'} call · ${m}:${s}`;
    }
    case 'group_created':
      return `${actor} created the group "${data.name}"`;
    case 'members_added':
      return `${actor} added ${listNames(data.users, me)}`;
    case 'member_removed':
      return `${actor} removed ${nameOf(data.user, me)}`;
    case 'member_left':
      return `${actor} left`;
    case 'joined_via_link':
      return `${actor} joined using the invite link`;
    case 'group_renamed':
      return `${actor} changed the group name to "${data.name}"`;
    case 'description_changed':
      return `${actor} changed the group description`;
    case 'photo_changed':
      return `${actor} changed the group photo`;
    case 'photo_removed':
      return `${actor} removed the group photo`;
    case 'admin_promoted':
      return `${actor} made ${nameOf(data.user, me)} an admin`;
    case 'admin_dismissed':
      return `${actor} dismissed ${nameOf(data.user, me)} as admin`;
    case 'security_code_changed':
      return data.user?.id === me ? 'Your security code changed (you set up a new device)' : `${data.user?.name ?? 'Someone'}'s security code changed. Tap their name to verify.`;
    case 'owner_changed':
      return `${data.user?.id === me ? 'You are' : `${data.user?.name ?? 'Someone'} is`} now the group owner`;
    case 'send_permission_changed':
      return data.value === 'admins' ? `${actor} allowed only admins to send messages` : `${actor} allowed everyone to send messages`;
    case 'edit_permission_changed':
      return data.value === 'admins' ? `${actor} allowed only admins to edit group info` : `${actor} allowed everyone to edit group info`;
    default:
      return 'Group updated';
  }
}

/** Names of the people typing in a chat ("Ann is typing…", "Ann and Ben are typing…"). */
export function typingText(typers, members) {
  const ids = Object.keys(typers ?? {}).map(Number);
  if (ids.length === 0) return null;
  const recording = ids.some((id) => typers[id] === 'recording');
  const names = ids.map((id) => members?.find((m) => m.id === id)?.name?.split(' ')[0] ?? 'Someone');
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} people`;
  return `${who} ${names.length === 1 ? 'is' : 'are'} ${recording ? 'recording audio' : 'typing'}…`;
}
