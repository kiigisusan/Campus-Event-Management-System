/**
 * Categories and venues: the reference data events are built from.
 */
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

// --- Categories -----------------------------------------------------------

export const listCategories = () => prisma.category.findMany({ orderBy: { name: 'asc' } });

async function assertCategoryNameFree(name, exceptId) {
  const existing = await prisma.category.findFirst({
    where: { name, ...(exceptId ? { NOT: { category_id: exceptId } } : {}) },
  });
  if (existing) {
    throw ApiError.conflict('A category with this name already exists', 'CATEGORY_EXISTS');
  }
}

export async function createCategory({ name, description }) {
  await assertCategoryNameFree(name);
  return prisma.category.create({ data: { name, description: description ?? null } });
}

export async function updateCategory(categoryId, data) {
  const category = await prisma.category.findUnique({ where: { category_id: categoryId } });
  if (!category) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  if (data.name !== undefined) await assertCategoryNameFree(data.name, categoryId);
  return prisma.category.update({
    where: { category_id: categoryId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    },
  });
}

export async function deleteCategory(categoryId) {
  const category = await prisma.category.findUnique({ where: { category_id: categoryId } });
  if (!category) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const inUse = await prisma.event.count({ where: { category_id: categoryId } });
  if (inUse > 0) {
    throw ApiError.conflict(
      `This category is used by ${inUse} event(s) and cannot be deleted`,
      'CATEGORY_IN_USE',
    );
  }
  await prisma.category.delete({ where: { category_id: categoryId } });
}

// --- Venues ---------------------------------------------------------------

export const listVenues = () => prisma.venue.findMany({ orderBy: { name: 'asc' } });

export const createVenue = (data) => prisma.venue.create({ data });

export async function updateVenue(venueId, data) {
  const venue = await prisma.venue.findUnique({ where: { venue_id: venueId } });
  if (!venue) throw ApiError.notFound('Venue not found', 'VENUE_NOT_FOUND');

  // A venue cannot become smaller than an event that already uses it.
  if (data.capacity !== undefined) {
    const { _max: biggest } = await prisma.event.aggregate({
      where: { venue_id: venueId, status: { in: ['draft', 'pending', 'approved'] } },
      _max: { capacity: true },
    });
    if (biggest.capacity !== null && data.capacity < biggest.capacity) {
      throw ApiError.conflict(
        `An event at this venue has capacity ${biggest.capacity}, so the venue cannot hold fewer`,
        'VENUE_TOO_SMALL',
      );
    }
  }
  return prisma.venue.update({ where: { venue_id: venueId }, data });
}

export async function deleteVenue(venueId) {
  const venue = await prisma.venue.findUnique({ where: { venue_id: venueId } });
  if (!venue) throw ApiError.notFound('Venue not found', 'VENUE_NOT_FOUND');

  const inUse = await prisma.event.count({ where: { venue_id: venueId } });
  if (inUse > 0) {
    throw ApiError.conflict(
      `This venue is used by ${inUse} event(s) and cannot be deleted`,
      'VENUE_IN_USE',
    );
  }
  await prisma.venue.delete({ where: { venue_id: venueId } });
}