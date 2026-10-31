/**
 * HTTP layer for /admin/users.
 */
import * as adminUserService from '../services/adminUserService.js';
import { paginationMeta, sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const query = req.validated.query;
  const { users, total } = await adminUserService.listUsers(query);
  sendSuccess(
    res,
    { users },
    { meta: paginationMeta({ page: query.page, pageSize: query.pageSize, total }) },
  );
}

export async function getById(req, res) {
  sendSuccess(res, { user: await adminUserService.getUser(req.validated.params.id) });
}

export async function create(req, res) {
  const { user, temporaryPassword } = await adminUserService.createUser({
    actor: req.user,
    data: req.validated.body,
  });
  res.locals.auditTargetId = user.user_id; // the audit log records the new account
  res.locals.auditDetails = { role: user.role };
  res.set('Cache-Control', 'no-store'); // the password must never be cached
  sendSuccess(
    res,
    {
      user,
      temporaryPassword,
      message: 'Account created. Give the temporary password to the user; it is shown only once.',
    },
    { status: 201 },
  );
}

export async function update(req, res) {
  const user = await adminUserService.updateUser({
    actor: req.user,
    userId: req.validated.params.id,
    data: req.validated.body,
  });
  res.locals.auditDetails = { fields: Object.keys(req.validated.body) };
  sendSuccess(res, { user });
}

export async function changeRole(req, res) {
  const { user, previousRole } = await adminUserService.changeUserRole({
    actor: req.user,
    userId: req.validated.params.id,
    data: req.validated.body,
  });
  res.locals.auditDetails = { from: previousRole, to: user.role };
  sendSuccess(res, { user, message: 'Role changed. The user has been logged out.' });
}

export async function deactivate(req, res) {
  const user = await adminUserService.setUserActive({
    actor: req.user,
    userId: req.validated.params.id,
    active: false,
  });
  sendSuccess(res, { user, message: 'Account deactivated. The user has been logged out.' });
}

export async function activate(req, res) {
  const user = await adminUserService.setUserActive({
    actor: req.user,
    userId: req.validated.params.id,
    active: true,
  });
  sendSuccess(res, { user, message: 'Account reactivated.' });
}

export async function resetPassword(req, res) {
  const { user, temporaryPassword } = await adminUserService.resetUserPassword({
    actor: req.user,
    userId: req.validated.params.id,
  });
  res.set('Cache-Control', 'no-store'); // the password must never be cached
  sendSuccess(res, {
    user,
    temporaryPassword,
    message: 'Password reset. Give the temporary password to the user; it is shown only once.',
  });
}