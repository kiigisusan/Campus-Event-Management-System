# User manual

CEMS has three kinds of users. Each sees their own menu after logging in.

| Role          | What they do                                                             |
| ------------- | ------------------------------------------------------------------------ |
| **Student**   | Browse events, book a place, pay with M-Pesa, show a QR ticket at the door |
| **Organizer** | Create events, submit them for approval, scan tickets, see attendance     |
| **Admin**     | Approve events, manage users, categories and venues, run reports, read the audit log |

The **Help** page in the app answers common questions, and a short tour runs the first time
you log in.

---

## Getting started

### Create an account

Students and organizers can register themselves from **Register**.

- **Students** give their name, email, a password, their student ID and (optionally) their programme.
- **Organizers** give their name, email, a password and the name of their club or office.

Passwords must be 8 to 72 characters and include at least one letter and one number. Admin
accounts are created only by a super admin.

### Log in and out

Log in with your email and password. Admins then enter the 6-digit code sent to their email;
the code is valid for 10 minutes.

You are logged out automatically after 30 minutes without activity. **Log out** in the menu
ends your session on that device.

### Forgotten password

Choose **Forgot password?** on the login page and enter your email. You will receive a link to
set a new password. The link works once and expires after 30 minutes.

---

## Students

### Find an event

The **Events** page lists every approved upcoming event. Search by name, filter by category,
free or paid, and start date, and sort the list. Each event shows its date, time, venue, price
and how many places are left.

### Book a place

Open an event and choose **Book for free** or **Book and pay**. You need to be logged in.

- **Free events** are confirmed straight away, and your QR ticket is ready.
- **Paid events** hold your place for 10 minutes while you pay. Enter your Safaricom number
  and approve the M-Pesa prompt on your phone. The page updates by itself when the payment
  goes through. If the payment fails or you run out of time, you can try again while places
  remain.

You can book each event once. A confirmation email with your QR ticket is sent when the
booking is confirmed.

### Your tickets

**My bookings** lists everything you have booked and its status: awaiting payment, confirmed,
checked in or cancelled. Open a booking to see its QR ticket, and **Download QR code** to save
it.

### Cancel a booking

Choose **Cancel** next to the booking in **My bookings**. You can cancel until the event
starts. Your place goes back to other students.

### At the event

Show your QR ticket (on your phone or printed) at the entrance. The organizer scans it once;
a ticket that has been used cannot be used again.

---

## Organizers

### Create an event

Choose **New event** and fill in the title, description, date and time, venue, category,
capacity and price (0 for a free event). Capacity cannot be more than the venue holds, and the
event must be in the future.

The event is saved as a **draft**. Only you can see it.

### Get it approved

From your **Dashboard**, choose **Submit** on a draft to send it to the admins. Its status
moves through:

| Status        | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Draft         | Saved, not yet sent for approval                                            |
| Pending       | Waiting for an admin to review it                                          |
| Approved      | Visible to students and open for booking                                   |
| Rejected      | Not approved. The admin's reason is shown. Edit the event to move it back to draft, then submit again |
| Cancelled     | Cancelled by you. Students who booked are emailed                          |

### Edit or cancel

**Edit** an event from your Dashboard until it starts. Once students have booked, the date,
time, venue and price are locked, and capacity cannot go below the number of places already
taken. **Cancel event** stops all bookings and emails everyone who booked.

### Check students in

Open **Scan tickets**, choose the event and allow camera access. Point the camera at a
student's QR ticket. The app shows whether the ticket is valid and marks the student as
checked in. If the camera does not work, type the code printed under the QR image instead.

A ticket is refused if it has already been used, belongs to another event, or the booking was
cancelled.

### See how events are doing

**Analytics** shows how your events are filling up: live events, seats taken or held, average
fill and estimated sales.

---

## Admins

### Dashboard

Shows the number of events waiting for approval, users, bookings and revenue, plus recent
activity.

### Approve events

**Approvals** lists pending events. Open one to check its details and the organizer, then
choose **Approve** or **Reject**. A rejection needs a reason, which the organizer sees.

### Manage users

**Users** lists every account. Search by name, email or student ID, and filter by role or
status. For each user you can:

- **Edit** their name, email and role-specific details (student ID and programme, or
  organisation name and whether the organizer is verified).
- **Change role**, for example from student to organizer. This is only possible while the
  user has no bookings or events, and it logs them out.
- **Deactivate** an account, which logs the user out and blocks logins, or **Reactivate** it.
- **Reset password**, which shows a temporary password once for you to pass on.

**Add user** creates an account and shows its temporary password once.

You cannot change your own account here. Only a **super admin** can create or manage admin
accounts.

### Categories and venues

**Categories & venues** lets you add, edit and delete event categories and venues. A
category or venue that is used by an event cannot be deleted, and a venue cannot be made
smaller than the events booked into it.

### Reports

**Reports** has three views. Filter them by date range and category, sort them, and download
each as a PDF:

| Report        | Shows                                                          |
| ------------- | -------------------------------------------------------------- |
| Attendance    | Per event: places, bookings, check-ins, attendance rate, revenue |
| Categories    | Events, bookings and revenue per category                      |
| Organizers    | Events, bookings, check-ins and revenue per organizer          |

### Audit log

**Audit log** records who did what and when: logins, bookings, payments, check-ins, approvals,
user changes and more. Search by person, filter by action and date range, and download it as
a PDF.
