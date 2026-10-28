/**
 * HTTP layer for /categories and /venues.
 */
import * as referenceService from '../services/referenceDataService.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

// --- Categories -----------------------------------------------------------

export async function listCategories(_req, res) {
  sendSuccess(res, { categories: await referenceService.listCategories() });
}

export async function createCategory(req, res) {
  const category = await referenceService.createCategory(req.validated.body);
  res.locals.auditTargetId = category.category_id;
  sendCreated(res, { category });
}

export async function updateCategory(req, res) {
  const category = await referenceService.updateCategory(
    req.validated.params.id,
    req.validated.body,
  );
  sendSuccess(res, { category });
}

export async function deleteCategory(req, res) {
  await referenceService.deleteCategory(req.validated.params.id);
  sendSuccess(res, { message: 'Category deleted.' });
}

// --- Venues ---------------------------------------------------------------

export async function listVenues(_req, res) {
  sendSuccess(res, { venues: await referenceService.listVenues() });
}

export async function createVenue(req, res) {
  const venue = await referenceService.createVenue(req.validated.body);
  res.locals.auditTargetId = venue.venue_id;
  sendCreated(res, { venue });
}

export async function updateVenue(req, res) {
  const venue = await referenceService.updateVenue(req.validated.params.id, req.validated.body);
  sendSuccess(res, { venue });
}

export async function deleteVenue(req, res) {
  await referenceService.deleteVenue(req.validated.params.id);
  sendSuccess(res, { message: 'Venue deleted.' });
}