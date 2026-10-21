/**
 * The only shape in which a user is ever sent to the client.
 * Never return a raw Prisma user: it contains password_hash, token hashes and 2FA codes.
 */

/** Prisma `select` for loading exactly the safe fields (plus what auth checks need). */
export const USER_SAFE_SELECT = Object.freeze({
  user_id: true,
  name: true,
  email: true,
  role: true,
  student_id_number: true,
  programme: true,
  org_name: true,
  verified: true,
  access_level: true,
  is_active: true,
  created_at: true,
});

/** Super admin = an admin with access_level 2. */
export const isSuperAdmin = (user) => user?.role === 'admin' && user?.access_level === 2;

/**
 * @param {import('@prisma/client').User} user
 */
export function toPublicUser(user) {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_super_admin: isSuperAdmin(user),
    student_id_number: user.student_id_number,
    programme: user.programme,
    org_name: user.org_name,
    verified: user.verified,
    access_level: user.access_level,
    is_active: user.is_active,
    created_at: user.created_at,
  };
}
