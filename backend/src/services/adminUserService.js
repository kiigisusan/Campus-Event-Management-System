/**
 * Admin user management: list, view, deactivate, activate, reset password.
 *
 * Rules:
 *  - An admin cannot act on their own account (no locking yourself out).
 *  - Only a super admin can act on other admins.
 *  - Deactivating or resetting a password bumps token_version, which ends
 *    every session the user has.
 */
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_SAFE_SELECT, isSuperAdmin, toPublicUser } from '../utils/publicUser.js';
import { hashPassword } from './authService.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';

const pick = (chars) => chars[crypto.randomInt(chars.length)];

/** A 12-character password with at least one letter and one digit. */
function generateTemporaryPassword() {
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < 12) chars.push(pick(LETTERS + DIGITS));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function loadUser(userId) {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: USER_SAFE_SELECT,
  });
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  return user;
}

function assertCanManage(actor, target) {
  if (target.user_id === actor.user_id) {
    throw ApiError.forbidden('You cannot do this to your own account', 'SELF_ACTION');
  }
  if (target.role === 'admin' && !isSuperAdmin(actor)) {
    throw ApiError.forbidden('Only a super admin can manage admin accounts', 'SUPER_ADMIN_ONLY');
  }
}

/** Searchable, filterable list of all users, newest first. */
export async function listUsers({ page, pageSize, search, role, is_active: isActive }) {
  const where = {
    ...(role ? { role } : {}),
    ...(isActive ? { is_active: isActive === 'true' } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { student_id_number: { contains: search } },
            { org_name: { contains: search } },
          ],
        }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_SAFE_SELECT,
      orderBy: [{ created_at: 'desc' }, { user_id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(toPublicUser), total };
}

export async function getUser(userId) {
  return toPublicUser(await loadUser(userId));
}

/** Blocks (active = false) or allows (active = true) an account to log in. */
export async function setUserActive({ actor, userId, active }) {
  const target = await loadUser(userId);
  assertCanManage(actor, target);

  if (target.is_active === active) {
    throw ApiError.conflict(
      active ? 'This account is already active' : 'This account is already deactivated',
      active ? 'ALREADY_ACTIVE' : 'ALREADY_DEACTIVATED',
    );
  }

  const updated = await prisma.user.update({
    where: { user_id: userId },
    data: {
      is_active: active,
      ...(active ? {} : { token_version: { increment: 1 } }), // ends their sessions
    },
    select: USER_SAFE_SELECT,
  });
  return toPublicUser(updated);
}

/**
 * Sets a random temporary password and ends all of the user's sessions.
 * The password is returned once and is never stored in plain text or logged.
 */
export async function resetUserPassword({ actor, userId }) {
  const target = await loadUser(userId);
  assertCanManage(actor, target);

  const temporaryPassword = generateTemporaryPassword();
  const updated = await prisma.user.update({
    where: { user_id: userId },
    data: {
      password_hash: await hashPassword(temporaryPassword),
      token_version: { increment: 1 },
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
    select: USER_SAFE_SELECT,
  });
  return { user: toPublicUser(updated), temporaryPassword };
}