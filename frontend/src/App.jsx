import { Route, Routes } from 'react-router-dom';
import { AppShell, RequireRole } from './components/Layout';

import Home from './pages/public/Home';
import EventDetail from './pages/public/EventDetail';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import { ForgotPassword, ResetPassword } from './pages/public/PasswordPages';
import Help from './pages/public/Help';
import { NotFound, Unauthorized } from './pages/public/ErrorPages';

import MyBookings from './pages/student/MyBookings';
import BookingPage from './pages/student/BookingPage';

import OrganizerDashboard from './pages/organizer/Dashboard';
import EventForm from './pages/organizer/EventForm';
import Scanner from './pages/organizer/Scanner';
import Analytics from './pages/organizer/Analytics';

import AdminDashboard from './pages/admin/Dashboard';
import Approvals from './pages/admin/Approvals';
import Users from './pages/admin/Users';
import Catalog from './pages/admin/Catalog';
import Reports from './pages/admin/Reports';
import AuditLog from './pages/admin/AuditLog';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/help" element={<Help />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Students */}
        <Route element={<RequireRole roles={['student']} />}>
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/bookings/:id" element={<BookingPage />} />
        </Route>

        {/* Organizers */}
        <Route element={<RequireRole roles={['organizer']} />}>
          <Route path="/organizer" element={<OrganizerDashboard />} />
          <Route path="/organizer/events/new" element={<EventForm />} />
          <Route path="/organizer/events/:id/edit" element={<EventForm />} />
          <Route path="/organizer/scan" element={<Scanner />} />
          <Route path="/organizer/analytics" element={<Analytics />} />
        </Route>

        {/* Admins */}
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/approvals" element={<Approvals />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/catalog" element={<Catalog />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/audit" element={<AuditLog />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
