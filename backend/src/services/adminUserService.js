/**
 * Admin user management: list, view, create, edit, change role,
 * deactivate, activate and reset password.
 *
 * Rules:
 *  - An admin cannot act on their own account (no locking yourself out).
 *  - Only a super admin can create admins or act on other admins.
 *  - Deactivating, resetting a password or changing a role bumps token_version,
 *    which ends every session the user has.
 *  - A role cannot change once the user has bookings or events.
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

async function assertEmailFree(email, exceptUserId) {
  const existing = await prisma.user.findFirst({
    where: { email, ...(exceptUserId ? { NOT: { user_id: exceptUserId } } : {}) },
    select: { user_id: true },
  });
  if (existing) throw ApiError.conflict('An account with this email already exists', 'EMAIL_EXISTS');
}

async function assertStudentIdFree(studentIdNumber, exceptUserId) {
  const existing = await prisma.user.findFirst({
    where: {
      student_id_number: studentIdNumber,
      ...(exceptUserId ? { NOT: { user_id: exceptUserId } } : {}),
    },
    select: { user_id: true },
  });
  if (existing) {
    throw ApiError.conflict('This student ID is already registered', 'STUDENT_ID_EXISTS');
  }
}

/** The role-specific columns for a role; every column that does not apply is cleared. */
function roleFields(data) {
  const cleared = {
    student_id_number: null,
    programme: null,
    org_name: null,
    verified: false,
    access_level: null,
  };
  switch (data.role) {
    case 'student':
      return {
        ...cleared,
        student_id_number: data.student_id_number,
        programme: data.programme ?? null,
      };
    case 'organizer':
      return { ...cleared, org_name: data.org_name, verified: data.verified ?? true };
    default:
      return { ...cleared, access_level: data.access_level ?? 1 };
  }
}

// --- Reading --------------------------------------------------------------

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

// --- Creating and editing -------------------------------------------------

/**
 * Creates an account with a random temporary password, returned once.
 * The new user should change it with "forgot password".
 */
export async function createUser({ actor, data }) {
  if (data.role === 'admin' && !isSuperAdmin(actor)) {
    throw ApiError.forbidden('Only a super admin can create admin accounts', 'SUPER_ADMIN_ONLY');
  }
  await assertEmailFree(data.email);
  if (data.role === 'student') await assertStudentIdFree(data.student_id_number);

  const temporaryPassword = generateTemporaryPassword();
  const created = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      password_hash: await hashPassword(temporaryPassword),
      ...roleFields(data),
    },
    select: USER_SAFE_SELECT,
  });
  return { user: toPublicUser(created), temporaryPassword };
}

const COMMON_FIELDS = ['name', 'email'];
const FIELDS_BY_ROLE = {
  student: ['student_id_number', 'programme'],
  organizer: ['org_name', 'verified'],
  admin: [],
};

/** Edits a user's details. Fields that do not suit the user's role are refused. */
export async function updateUser({ actor, userId, data }) {
  const target = await loadUser(userId);
  assertCanManage(actor, target);

  for (const key of Object.keys(data)) {
    if (!COMMON_FIELDS.includes(key) && !FIELDS_BY_ROLE[target.role].includes(key)) {
      throw ApiError.badRequest(
        `"${key}" does not apply to a ${target.role}`,
        undefined,
        'FIELD_NOT_FOR_ROLE',
      );
    }
  }
  if (data.email !== undefined) await assertEmailFree(data.email, userId);
  if (data.student_id_number !== undefined) {
    await assertStudentIdFree(data.student_id_number, userId);
  }

  const updated = await prisma.user.update({
    where: { user_id: userId },
    data,
    select: USER_SAFE_SELECT,
  });
  return toPublicUser(updated);
}

/**
 * Changes a user's role. Only possible while the user has no bookings or
 * events, so past records never end up under the wrong kind of user.
 * @returns {Promise<{ user: object, previousRole: string }>}
 */
export async function changeUserRole({ actor, userId, data }) {
  const target = await loadUser(userId);
  assertCanManage(actor, target);

  if (data.role === 'admin' && !isSuperAdmin(actor)) {
    throw ApiError.forbidden('Only a super admin can create admin accounts', 'SUPER_ADMIN_ONLY');
  }
  if (data.role === target.role) {
    throw ApiError.conflict(`This user is already a ${target.role}`, 'SAME_ROLE');
  }

  const [bookings, events] = await prisma.$transaction([
    prisma.booking.count({ where: { student_id: userId } }),
    prisma.event.count({ where: { organizer_id: userId } }),
  ]);
  if (bookings > 0 || events > 0) {
    throw ApiError.conflict(
      'This user already has bookings or events, so their role cannot change. Deactivate the account and create a new one instead.',
      'ROLE_HAS_HISTORY',
    );
  }
  if (data.role === 'student') await assertStudentIdFree(data.student_id_number, userId);

  const updated = await prisma.user.update({
    where: { user_id: userId },
    data: {
      role: data.role,
      ...roleFields(data),
      token_version: { increment: 1 }, // ends their sessions so the new role applies at once
    },
    select: USER_SAFE_SELECT,
  });
  return { user: toPublicUser(updated), previousRole: target.role };
}

// --- Account status and passwords -----------------------------------------

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