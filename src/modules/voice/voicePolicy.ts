import {
  ChannelType,
  PermissionFlagsBits,
  type GuildMember,
  type OverwriteResolvable,
  type PermissionResolvable,
  type VoiceChannel,
} from "discord.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";

type VoiceRoleConfig = Pick<GuildConfig, "support_role_id" | "developer_role_id" | "administrator_role_id" | "founder_role_id">;
import type { PrivacyMode, VoiceGenerator } from "../../repositories/voiceGeneratorRepository.js";

export const limitChoices = [0, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25] as const;

export function normalizeLimit(value: number, maxUserLimit: number): number {
  const bounded = Math.max(0, Math.min(99, Math.floor(value)));
  return maxUserLimit > 0 ? Math.min(bounded, maxUserLimit) : bounded;
}

export function defaultNameTemplate(type: VoiceGenerator["type"]): string {
  if (type === "SUPPORT") return "🆘・soporte-{displayname}";
  if (type === "STAFF") return "🛡️・staff-{displayname}";
  return "🔊・{displayname}";
}

export function defaultPrivacy(type: VoiceGenerator["type"]): PrivacyMode {
  return type === "PUBLIC" ? "PUBLIC" : "PRIVATE";
}

export function generatorStaffRoleIds(generator: VoiceGenerator, config: VoiceRoleConfig, explicitRoles: string[]): string[] {
  if (explicitRoles.length > 0) return explicitRoles;
  const ids = new Set<string>();
  if (generator.type === "SUPPORT") {
    if (config.support_role_id) ids.add(config.support_role_id);
    if (config.administrator_role_id) ids.add(config.administrator_role_id);
    if (config.founder_role_id) ids.add(config.founder_role_id);
  }
  if (generator.type === "STAFF") {
    if (config.support_role_id) ids.add(config.support_role_id);
    if (config.developer_role_id) ids.add(config.developer_role_id);
    if (config.administrator_role_id) ids.add(config.administrator_role_id);
    if (config.founder_role_id) ids.add(config.founder_role_id);
  }
  return [...ids];
}

export function canUseGenerator(generator: VoiceGenerator, member: GuildMember, config: VoiceRoleConfig, explicitRoles: string[]): boolean {
  if (generator.type === "PUBLIC") return true;
  const allowed = new Set(generatorStaffRoleIds(generator, config, explicitRoles));
  return member.roles.cache.some((role) => allowed.has(role.id));
}

export type PermissionOverwriteLike = {
  id: string;
  type?: number;
  allow?: PermissionResolvable | { bitfield: bigint | number | string } | bigint | number | string | null;
  deny?: PermissionResolvable | { bitfield: bigint | number | string } | bigint | number | string | null;
};

export type StoredVoicePermission = {
  user_id: string;
  permission_type: "ALLOW" | "BLOCK";
};

type NormalizedOverwrite = {
  id: string;
  type?: number;
  allow: bigint;
  deny: bigint;
};

const roomMemberPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
] as const;
const roomTextPermissions = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] as const;
const botVoicePermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

function toPermissionBits(value: PermissionOverwriteLike["allow"]): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value)) return value.reduce((bits, item) => bits | toPermissionBits(item as PermissionOverwriteLike["allow"]), 0n);
  if (typeof value === "object" && "bitfield" in value) return toPermissionBits(value.bitfield);
  return 0n;
}

function normalizeOverwrites(overwrites: PermissionOverwriteLike[] = []): NormalizedOverwrite[] {
  const byId = new Map<string, NormalizedOverwrite>();
  for (const overwrite of overwrites) {
    if (!overwrite?.id) continue;
    const key = `${overwrite.type ?? "unknown"}:${overwrite.id}`;
    const current = byId.get(key) ?? { id: overwrite.id, type: overwrite.type, allow: 0n, deny: 0n };
    current.type = overwrite.type ?? current.type;
    current.allow |= toPermissionBits(overwrite.allow);
    current.deny |= toPermissionBits(overwrite.deny);
    byId.set(key, current);
  }
  return [...byId.values()];
}

function permissionPatch(input: {
  overwrites: NormalizedOverwrite[];
  id: string;
  type: number;
  allow?: readonly bigint[];
  deny?: readonly bigint[];
  neutral?: readonly bigint[];
}): void {
  let overwrite = input.overwrites.find((entry) => entry.id === input.id && (entry.type === input.type || entry.type === undefined));
  if (!overwrite) {
    overwrite = { id: input.id, type: input.type, allow: 0n, deny: 0n };
    input.overwrites.push(overwrite);
  }
  overwrite.type = input.type;

  const allow = toPermissionBits(input.allow as PermissionResolvable | undefined);
  const deny = toPermissionBits(input.deny as PermissionResolvable | undefined);
  const neutral = toPermissionBits(input.neutral as PermissionResolvable | undefined);

  overwrite.allow = (overwrite.allow | allow) & ~deny & ~neutral;
  overwrite.deny = (overwrite.deny | deny) & ~allow & ~neutral;
}

function toDiscordOverwrites(overwrites: NormalizedOverwrite[]): OverwriteResolvable[] {
  return overwrites.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

export function buildCreateOverwrites(input: {
  guildId: string;
  botUserId: string;
  ownerUserId: string;
  privacyMode: PrivacyMode;
  staffRoleIds: string[];
  baseOverwrites?: PermissionOverwriteLike[];
  storedPermissions?: StoredVoicePermission[];
}): OverwriteResolvable[] {
  const overwrites = normalizeOverwrites(input.baseOverwrites);
  permissionPatch({ overwrites, id: input.botUserId, type: 1, allow: botVoicePermissions });

  if (input.privacyMode === "LOCKED") {
    permissionPatch({
      overwrites,
      id: input.guildId,
      type: 0,
      allow: [PermissionFlagsBits.ViewChannel, ...roomTextPermissions],
      deny: [PermissionFlagsBits.Connect],
    });
  }
  if (input.privacyMode === "PRIVATE") {
    permissionPatch({ overwrites, id: input.guildId, type: 0, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] });
  }
  if (input.privacyMode === "PUBLIC") {
    permissionPatch({ overwrites, id: input.guildId, type: 0, allow: roomTextPermissions });
  }

  permissionPatch({ overwrites, id: input.ownerUserId, type: 1, allow: roomMemberPermissions });
  for (const roleId of input.staffRoleIds) {
    permissionPatch({ overwrites, id: roleId, type: 0, allow: roomMemberPermissions });
  }

  for (const permission of input.storedPermissions ?? []) {
    permissionPatch({
      overwrites,
      id: permission.user_id,
      type: 1,
      allow: permission.permission_type === "ALLOW" ? roomMemberPermissions : undefined,
      deny: permission.permission_type === "BLOCK" ? roomMemberPermissions : undefined,
    });
  }

  return toDiscordOverwrites(overwrites);
}

function baseVoiceOption(baseOverwrite: PermissionOverwriteLike | null | undefined, bit: bigint): boolean | null {
  const allow = toPermissionBits(baseOverwrite?.allow);
  const deny = toPermissionBits(baseOverwrite?.deny);
  if ((allow & bit) === bit) return true;
  if ((deny & bit) === bit) return false;
  return null;
}

export function privacyOverwriteForEveryone(
  privacyMode: PrivacyMode,
  baseEveryoneOverwrite?: PermissionOverwriteLike | null,
): Record<string, boolean | null> {
  if (privacyMode === "PUBLIC") {
    return {
      ViewChannel: baseVoiceOption(baseEveryoneOverwrite, PermissionFlagsBits.ViewChannel),
      Connect: baseVoiceOption(baseEveryoneOverwrite, PermissionFlagsBits.Connect),
      SendMessages: true,
      ReadMessageHistory: true,
    };
  }
  if (privacyMode === "LOCKED") return { ViewChannel: true, Connect: false, SendMessages: true, ReadMessageHistory: true };
  return {
    ViewChannel: false,
    Connect: false,
    SendMessages: baseVoiceOption(baseEveryoneOverwrite, PermissionFlagsBits.SendMessages),
    ReadMessageHistory: baseVoiceOption(baseEveryoneOverwrite, PermissionFlagsBits.ReadMessageHistory),
  };
}

export function chooseAutoTransferOwner(channel: VoiceChannel, previousOwnerId: string): string | null {
  const humans = channel.members
    .filter((member) => !member.user.bot && member.id !== previousOwnerId)
    .sort((a, b) => {
      const aJoined = a.voice.channel?.members.has(a.id) ? (a.joinedTimestamp ?? 0) : 0;
      const bJoined = b.voice.channel?.members.has(b.id) ? (b.joinedTimestamp ?? 0) : 0;
      return aJoined - bJoined;
    });
  return humans.first()?.id ?? null;
}

export function isVoiceTextCapable(channel: unknown): channel is VoiceChannel & { send: (payload: unknown) => Promise<any> } {
  return Boolean(channel && typeof channel === "object" && "type" in channel && (channel as any).type === ChannelType.GuildVoice);
}
