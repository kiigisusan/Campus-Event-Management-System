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