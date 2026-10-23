import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Settings2,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuthStore } from '../store/auth.js'
import { logout } from '../auth/session.js'
import { api } from '../api/domains.js'
import { useQuery } from '@tanstack/react-query'
import { useIdleLogout, IdleWarningModal } from '../hooks/useIdleLogout.jsx'

const navigation = {
  patient: [
    { to: '/app', label: 'Overview', icon: Home, end: true },
    { to: '/app/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/app/book', label: 'Book appointment', icon: Search },
    { to: '/app/prescriptions', label: 'Prescriptions', icon: FileText },
    { to: '/app/records', label: 'Medical records', icon: ClipboardList },
    { to: '/app/care', label: 'Care & dental chart', icon: HeartPulse },
    { to: '/app/billing', label: 'Invoices & payments', icon: Wallet },
    { to: '/app/family', label: 'Family members', icon: Users },
    { to: '/app/profile', label: 'Profile & settings', icon: Settings2 },
  ],
  dentist: [
    { to: '/dentist', label: 'Overview', icon: Home, end: true },
    { to: '/dentist/appointments', label: 'Schedule', icon: CalendarDays },
    { to: '/dentist/availability', label: 'Availability', icon: Settings2 },
    { to: '/dentist/patients', label: 'Patients', icon: Users },
    { to: '/dentist/reviews', label: 'Reviews', icon: MessageSquareText },
    { to: '/dentist/queue', label: 'Live queue', icon: Activity },
    { to: '/dentist/profile', label: 'My profile', icon: HeartPulse },
    { to: '/dentist/settings', label: 'Settings', icon: Settings2 },
  ],
  receptionist: [
    { to: '/reception', label: 'Overview', icon: Home, end: true },
    { to: '/reception/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/reception/patients', label: 'Patients', icon: Users },
    { to: '/reception/queue', label: 'Live queue', icon: Activity },
    { to: '/reception/invoices', label: 'Invoices', icon: Wallet },
    { to: '/reception/settings', label: 'Settings', icon: Settings2 },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: Home, end: true },
    { to: '/admin/dentists', label: 'Doctor profile', icon: HeartPulse },
    { to: '/admin/staff', label: 'Staff', icon: Users },
    { to: '/admin/patients', label: 'Patients', icon: ClipboardList },
    { to: '/admin/treatments', label: 'Treatment catalog', icon: FileText },
    { to: '/admin/coupons', label: 'Coupons', icon: Wallet },
    { to: '/admin/payments', label: 'Payments & refunds', icon: Wallet },
    { to: '/admin/settings', label: 'Clinic settings', icon: Settings2 },
  ],
}

const roleLabel = {
  patient: 'Patient portal',
  dentist: 'Dentist workspace',
  receptionist: 'Front desk',
  admin: 'Administration',
}

export default function PortalLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuthStore()
  const location = useLocation()
  const role = user?.role || 'patient'
  const items = navigation[role] || navigation.patient
  const isPatient = role === 'patient'

  // Notifications enabled for all roles
  const { data: notificationData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.notifications.mine({ limit: 1 }),
    enabled: !!user,
    refetchInterval: 30000,
  })
  const unreadCount = notificationData?.meta?.unreadCount || 0
  const homePath = { patient: '/app', dentist: '/dentist', receptionist: '/reception', admin: '/admin' }[role]
  const notificationsPath = `/${role === 'patient' ? 'app' : role}/notifications`

  // Shared PC idle logout hook
  const { warningOpen, secondsRemaining, stayLoggedIn, logoutNow } = useIdleLogout()

  const handleLogout = () => {
    logout({ reason: 'manual' })
  }

  return (
    <div className="portal-shell">
      <aside className={`portal-sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link to={homePath} className="brand-lockup" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">
            <img src="/favicon.svg" alt="Nutrident logo" className="brand-logo-img" />
          </span>
          <span>
            Nutrident<span className="brand-sub">Dental &amp; Diet Clinic</span>
          </span>
        </Link>
        <div className="sidebar-caption">{roleLabel[role]}</div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Notifications' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
            </NavLink>
          ))}
          <NavLink
            to={notificationsPath}
            className={`nav-link ${location.pathname === notificationsPath ? 'nav-link-active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <MessageSquareText size={18} />
            <span>Notifications</span>
            {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-pulse" />
            <span>
              <strong>Care team</strong>
              <small>Here when you need us</small>
            </span>
          </div>
          <button className="nav-link logout-link" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      {menuOpen && <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className="portal-main">
        <header className="portal-topbar">
          <button
            className="icon-button mobile-menu-button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className="breadcrumb">
            <span>{roleLabel[role]}</span>
            <i>/</i>
            <strong>{items.find((item) => location.pathname === item.to)?.label || 'Your care'}</strong>
          </div>
          <div className="topbar-profile">
            {user?.profilePhoto?.url ? (
              <img src={user.profilePhoto.url} alt={user.name} className="avatar avatar-img" />
            ) : (
              <span className="avatar">{user?.name?.slice(0, 1)?.toUpperCase() || 'D'}</span>
            )}
            <span>
              <strong>{user?.name || 'Account'}</strong>
              <small>{role}</small>
            </span>
          </div>
        </header>
        <main className="portal-content">
          <Outlet />
        </main>
        {isPatient && (
          <nav className="mobile-tabs" aria-label="Patient navigation">
            {items.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'mobile-tab mobile-tab-active' : 'mobile-tab')}
              >
                <Icon size={19} />
                <span>{label.split(' ')[0]}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <IdleWarningModal
        open={warningOpen}
        secondsRemaining={secondsRemaining}
        onStayLoggedIn={stayLoggedIn}
        onLogout={logoutNow}
      />
    </div>
  )
}