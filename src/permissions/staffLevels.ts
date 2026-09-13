import { PermissionFlagsBits, type GuildMember, type Role } from "discord.js";
import type { GuildConfig } from "../repositories/guildConfigRepository.js";

export enum StaffLevel { Member = 0, Customer = 1, Support = 2, Developer = 3, Administrator = 4, Founder = 5 }
export const staffLevelNames: Record<StaffLevel, string> = { [StaffLevel.Member]: "Member", [StaffLevel.Customer]: "Customer", [StaffLevel.Support]: "Support", [StaffLevel.Developer]: "Developer", [StaffLevel.Administrator]: "Administrator", [StaffLevel.Founder]: "Founder" };
export const permissionMatrix = {
  info: [StaffLevel.Member, StaffLevel.Customer, StaffLevel.Support, StaffLevel.Developer, StaffLevel.Administrator, StaffLevel.Founder],
  support: [StaffLevel.Support, StaffLevel.Administrator, StaffLevel.Founder], tickets: [StaffLevel.Support, StaffLevel.Administrator, StaffLevel.Founder],
  developer: [StaffLevel.Developer, StaffLevel.Administrator, StaffLevel.Founder],
  warn: [StaffLevel.Administrator, StaffLevel.Founder], timeout: [StaffLevel.Administrator, StaffLevel.Founder], kick: [StaffLevel.Administrator, StaffLevel.Founder], ban: [StaffLevel.Administrator, StaffLevel.Founder], purge: [StaffLevel.Administrator, StaffLevel.Founder], roles: [StaffLevel.Administrator, StaffLevel.Founder], config: [StaffLevel.Administrator, StaffLevel.Founder], announcements: [StaffLevel.Administrator, StaffLevel.Founder], generator: [StaffLevel.Administrator, StaffLevel.Founder], moderation: [StaffLevel.Administrator, StaffLevel.Founder], admin: [StaffLevel.Administrator, StaffLevel.Founder], monitoring_admin: [StaffLevel.Administrator, StaffLevel.Founder],
  security: [StaffLevel.Founder], founder: [StaffLevel.Founder],
  monitoring: [StaffLevel.Member, StaffLevel.Customer, StaffLevel.Support, StaffLevel.Developer, StaffLevel.Administrator, StaffLevel.Founder],
} as const;
export type PermissionKey = keyof typeof permissionMatrix;
type StaffRoleConfig = Pick<GuildConfig, "founder_role_id" | "administrator_role_id" | "developer_role_id" | "support_role_id"> & { customer_role_id?: string | null };
export function isProtectedAdministrativeRole(roleId: string, config: Partial<GuildConfig>): boolean {
  return [
    config.founder_role_id,
    config.administrator_role_id,
    config.developer_role_id,
    config.support_role_id,
    config.customer_role_id,
    config.member_role_id,
    config.server_booster_role_id,
    config.bots_role_id,
  ].some((configuredId) => configuredId === roleId);
}
export function resolveStaffLevel(member: GuildMember, config: StaffRoleConfig, ownerId?: string | null): StaffLevel {
  if (ownerId && member.id === ownerId) return StaffLevel.Founder;
  const ids = new Set(member.roles.cache.map((role) => role.id));
  if (config.founder_role_id && ids.has(config.founder_role_id)) return StaffLevel.Founder;
  if (config.administrator_role_id && ids.has(config.administrator_role_id)) return StaffLevel.Administrator;
  if (config.developer_role_id && ids.has(config.developer_role_id)) return StaffLevel.Developer;
  if (config.support_role_id && ids.has(config.support_role_id)) return StaffLevel.Support;
  if (config.customer_role_id && ids.has(config.customer_role_id)) return StaffLevel.Customer;
  return StaffLevel.Member;
}
export function hasInternalPermission(member: GuildMember, config: StaffRoleConfig, permission: PermissionKey, ownerId?: string | null): boolean {
  const level = resolveStaffLevel(member, config, ownerId);
  if ((permissionMatrix[permission] as readonly StaffLevel[]).includes(level)) return true;
  return level === StaffLevel.Administrator && member.permissions.has(PermissionFlagsBits.Administrator);
}
export interface HierarchySubject { id: string; highestRolePosition: number; isOwner?: boolean }
export function canActOnMember(input: { actor: HierarchySubject; bot: HierarchySubject; target: HierarchySubject }): { ok: true } | { ok: false; reason: string } {
  if (input.actor.id === input.target.id) return { ok: false, reason: "No puedes ejecutar esta accion sobre ti mismo." };
  if (input.target.isOwner) return { ok: false, reason: "No se puede actuar sobre el propietario del servidor." };
  if (input.actor.highestRolePosition <= input.target.highestRolePosition) return { ok: false, reason: "Tu rol no esta por encima del usuario objetivo." };
  if (input.bot.highestRolePosition <= input.target.highestRolePosition) return { ok: false, reason: "El rol del bot no esta por encima del usuario objetivo." };
  return { ok: true };
}
export function canManageRole(input: { actorHighestRolePosition: number; botHighestRolePosition: number; role: Pick<Role, "managed" | "position"> }): { ok: true } | { ok: false; reason: string } {
  if (input.role.managed) return { ok: false, reason: "Ese rol esta administrado por una integracion." };
  if (input.actorHighestRolePosition <= input.role.position) return { ok: false, reason: "Tu rol debe estar por encima del rol que quieres gestionar." };
  if (input.botHighestRolePosition <= input.role.position) return { ok: false, reason: "El rol del bot debe estar por encima del rol que quieres gestionar." };
  return { ok: true };
}
