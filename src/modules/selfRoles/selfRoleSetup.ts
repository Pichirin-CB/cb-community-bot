import { PermissionFlagsBits, type Guild, type GuildMember, type Role } from "discord.js";
import { logger } from "../../logger.js";
import { UserFacingError } from "../../permissions/guards.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";
import type { SelfRoleRepository } from "../../repositories/selfRoleRepository.js";
import {
  classicColorNames,
  darkColorNames,
  isProtectedSelfRole,
  normalizeSelfRoleName,
  pastelColorNames,
  preferenceRoleNames,
  selfRoleGroups,
  type SelfRoleGroupKey,
} from "./selfRolePresentation.js";

export interface SelfRoleSeedResult {
  included: Array<{ groupKey: SelfRoleGroupKey; roleId: string; label: string }>;
  excluded: Array<{ roleId: string; label: string; reason: string }>;
  missing: Array<{ groupKey: SelfRoleGroupKey; label: string }>;
}

const seedDefinitions: Record<SelfRoleGroupKey, string[]> = {
  COLOR_CLASSIC: classicColorNames,
  COLOR_PASTEL: pastelColorNames,
  COLOR_DARK: darkColorNames,
  PREFERENCES: preferenceRoleNames,
};

export function botManagedRoleId(botMember: GuildMember): string | null {
  return botMember.roles.cache.find((role) => role.tags?.botId === botMember.id)?.id ?? null;
}

export function validateSelfRole(role: Role, config: GuildConfig, botMember: GuildMember): string | null {
  if (role.id === role.guild.roles.everyone.id) return "No se puede usar @everyone.";
  if (role.managed) return "Rol managed o de integracion.";
  if (
    isProtectedSelfRole({
      roleId: role.id,
      roleName: role.name,
      config,
      botRoleId: botManagedRoleId(botMember),
      managed: role.managed,
    })
  ) {
    return "Rol protegido por CB Community.";
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "El bot no tiene Manage Roles.";
  }
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return "Rol por encima o al mismo nivel que CB Studios Core.";
  }
  return null;
}

export function ensureSelfRoleGroups(repo: SelfRoleRepository, guildId: string): void {
  for (const group of Object.values(selfRoleGroups)) {
    repo.ensureGroup({
      guildId,
      groupKey: group.key,
      groupType: group.type,
      label: group.label,
      sortOrder: group.sortOrder,
    });
  }
}

function roleByNormalizedName(guild: Guild, label: string): Role | null {
  const normalized = normalizeSelfRoleName(label);
  return guild.roles.cache.find((role) => normalizeSelfRoleName(role.name) === normalized) ?? null;
}

export function detectSelfRoles(guild: Guild, config: GuildConfig, botMember: GuildMember): SelfRoleSeedResult {
  const result: SelfRoleSeedResult = { included: [], excluded: [], missing: [] };
  for (const [groupKey, labels] of Object.entries(seedDefinitions) as Array<[SelfRoleGroupKey, string[]]>) {
    for (const label of labels) {
      const role = roleByNormalizedName(guild, label);
      if (!role) {
        result.missing.push({ groupKey, label });
        continue;
      }
      const reason = validateSelfRole(role, config, botMember);
      if (reason) {
        result.excluded.push({ roleId: role.id, label: role.name, reason });
        continue;
      }
      result.included.push({ groupKey, roleId: role.id, label: role.name });
    }
  }
  return result;
}

export function seedSelfRoles(repo: SelfRoleRepository, guild: Guild, config: GuildConfig, botMember: GuildMember): SelfRoleSeedResult {
  ensureSelfRoleGroups(repo, guild.id);
  const detected = detectSelfRoles(guild, config, botMember);
  const orderByGroup = new Map<SelfRoleGroupKey, number>();
  for (const option of detected.included) {
    const current = orderByGroup.get(option.groupKey) ?? 0;
    repo.upsertOption({
      guildId: guild.id,
      groupKey: option.groupKey,
      roleId: option.roleId,
      label: option.label,
      sortOrder: current + 1,
      enabled: true,
    });
    orderByGroup.set(option.groupKey, current + 1);
  }
  for (const excluded of detected.excluded) {
    logger.warn({ guildId: guild.id, roleId: excluded.roleId, reason: excluded.reason }, "Self-role excluido durante seed");
  }
  return detected;
}

export function assertValidSelfRoleGroup(groupKey: string): asserts groupKey is SelfRoleGroupKey {
  if (!(groupKey in selfRoleGroups)) {
    throw new UserFacingError("Grupo de autoroles no valido.");
  }
}
