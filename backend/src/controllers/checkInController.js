import * as checkInService from '../services/checkInService.js';
import { sendSuccess } from '../utils/response.js';

/** POST /check-in - validate a scanned ticket and mark the student present. */
export async function checkIn(req, res) {
  const result = await checkInService.checkIn(
    {
      scannedText: req.validated.body.qr_code,
      eventId: req.validated.body.event_id,
      staff: req.user,
    },
    { ipAddress: req.ip },
  );
  sendSuccess(res, { checkIn: result, message: `${result.student.name} checked in` });
}
