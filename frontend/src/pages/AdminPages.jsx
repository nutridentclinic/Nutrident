import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CalendarDays,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api, downloadPdf } from "../api/domains.js";
import { useAuthStore } from "../store/auth.js";
import { usePrimaryDentist } from "../hooks/usePrimaryDentist.js";
import {
  AsyncView,
  EmptyState,
  Field,
  PageTitle,
  SectionPanel,
  StatusBadge,
  TextInput,
  useConfirm,
  useToast,
} from "../components/ui.jsx";
import { PatientDirectory } from "./TeamPages.jsx";
import { FileUpload } from "../components/FileUpload.jsx";
import { BackendPendingNotice } from "../components/BackendPendingNotice.jsx";
import { formatClinicDate } from "../utils/formatDate.js";
import { clinicDate, isPastSlot } from "../utils/booking.js";
import { fetchWeeklyAppointmentsWithFallback, fetchPrimarySlotsWithFallback } from "../api/capabilities.js";

export function exportToCsv(filename, headers, rows) {
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const fmtDate = (date) => (date ? formatClinicDate(date) : "Date not set");

export function AdminDashboard() {
  const [range, setRange] = useState("week");
  const stats = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: api.dashboard.admin,
  });
  const weekly = useQuery({
    queryKey: ["dashboard", "appointments-weekly", range],
    queryFn: () => fetchWeeklyAppointmentsWithFallback({ range, startsOn: "mon" }),
  });
  const revenue = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: api.dashboard.revenue,
  });
  const specialties = useQuery({
    queryKey: ["dashboard", "specialties"],
    queryFn: api.dashboard.specialties,
  });

  const chartSeries = useMemo(() => {
    if (weekly.data?.series && Array.isArray(weekly.data.series)) {
      return weekly.data.series;
    }
    return Array.from({ length: 7 }, (_, offset) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6 + offset);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        label: formatClinicDate(dateStr, { weekday: "short" }),
        total: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      };
    });
  }, [weekly.data]);

  const totalAppointments = useMemo(
    () => chartSeries.reduce((acc, cur) => acc + (cur.total || 0), 0),
    [chartSeries],
  );

  const monthData = (Array.isArray(revenue.data?.data) ? revenue.data.data : []).map((entry) => ({
    month: entry._id,
    total: entry.total,
  }));

  const numbers = stats.data?.data || {};

  // Treatment revenue chart data (replaces old specialties chart)
  const treatmentData = useMemo(() => {
    const raw = numbers.treatmentRevenue || specialties.data?.data || [];
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 6).map((item) => ({
      name: item.treatment || item._id || "Treatment",
      revenue: item.revenue || item.total || 0,
      count: item.count || 0,
    }));
  }, [numbers.treatmentRevenue, specialties.data]);

  return (
    <div>
      <PageTitle
        eyebrow="Single-clinic operations"
        title="Administration"
        description="Live operational KPIs, revenue tracking, and system health for DrNutrident."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link to="/admin/appointments" className="button button-quiet">
              <CalendarDays size={15} /> All appointments
            </Link>
            <Link to="/admin/dentists" className="button button-primary">
              Doctor profile <ArrowRight size={15} />
            </Link>
          </div>
        }
      />
      <AsyncView query={stats} empty={false}>
        <div className="dashboard-metrics">
          <Link to="/admin/appointments" style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ cursor: "pointer" }}>
              <span className="metric-icon metric-blue">
                <CalendarDays size={18} />
              </span>
              <small>Today’s visits & queue</small>
              <strong>{numbers.todaysAppointments ?? "0"}</strong>
              <small style={{ color: "var(--text-muted, #64748b)" }}>
                {numbers.todaysQueue ?? 0} waiting in queue
              </small>
            </article>
          </Link>

          <Link to="/admin/patients" style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ cursor: "pointer" }}>
              <span className="metric-icon metric-teal">
                <Users size={18} />
              </span>
              <small>Total patients</small>
              <strong>{numbers.totalPatients ?? "0"}</strong>
              <small style={{ color: "var(--text-muted, #64748b)" }}>
                +{numbers.newPatients7d ?? 0} (7d) · +{numbers.newPatients30d ?? 0} (30d)
              </small>
            </article>
          </Link>

          <Link to="/admin/payments" style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ cursor: "pointer" }}>
              <span className="metric-icon metric-coral">
                <Wallet size={18} />
              </span>
              <small>Month revenue</small>
              <strong>{rupees(numbers.monthRevenue)}</strong>
              <small style={{ color: "var(--text-muted, #64748b)" }}>
                Today: {rupees(numbers.todayRevenue)}
              </small>
            </article>
          </Link>

          <Link to="/admin/payments" style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ cursor: "pointer" }}>
              <span className="metric-icon metric-lime">
                <FileText size={18} />
              </span>
              <small>Outstanding balance</small>
              <strong>{rupees(numbers.outstandingInvoices)}</strong>
              <small style={{ color: "var(--text-muted, #64748b)" }}>
                {numbers.outstandingInvoicesCount ?? 0} unpaid invoices
              </small>
            </article>
          </Link>
        </div>

        {/* Appointment Status Breakdown & Retention KPIs */}
        <SectionPanel
          title="Appointment status breakdown & retention"
          description="Operational visit metrics across confirmed, completed, cancelled and no-show bookings."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
            <div style={{ padding: "0.8rem 1rem", borderRadius: "0.5rem", background: "var(--surface-muted, #f8fafc)", border: "1px solid var(--border, #e2e8f0)" }}>
              <span style={{ fontSize: "0.8125rem", color: "#64748b", display: "block" }}>Confirmed Visits</span>
              <strong style={{ fontSize: "1.25rem", color: "#137a76" }}>{numbers.statusBreakdown?.confirmed ?? 0}</strong>
            </div>
            <div style={{ padding: "0.8rem 1rem", borderRadius: "0.5rem", background: "var(--surface-muted, #f8fafc)", border: "1px solid var(--border, #e2e8f0)" }}>
              <span style={{ fontSize: "0.8125rem", color: "#64748b", display: "block" }}>Completed Visits</span>
              <strong style={{ fontSize: "1.25rem", color: "#2a9d8f" }}>{numbers.statusBreakdown?.completed ?? 0}</strong>
            </div>
            <div style={{ padding: "0.8rem 1rem", borderRadius: "0.5rem", background: "var(--surface-muted, #f8fafc)", border: "1px solid var(--border, #e2e8f0)" }}>
              <span style={{ fontSize: "0.8125rem", color: "#64748b", display: "block" }}>No-Show Rate</span>
              <strong style={{ fontSize: "1.25rem", color: "#e76f51" }}>
                {numbers.noShowRate ?? 0}%
              </strong>
              <small style={{ display: "block", color: "#94a3b8" }}>{numbers.statusBreakdown?.noShow ?? 0} visits</small>
            </div>
            <div style={{ padding: "0.8rem 1rem", borderRadius: "0.5rem", background: "var(--surface-muted, #f8fafc)", border: "1px solid var(--border, #e2e8f0)" }}>
              <span style={{ fontSize: "0.8125rem", color: "#64748b", display: "block" }}>Cancellation Rate</span>
              <strong style={{ fontSize: "1.25rem", color: "#e63946" }}>
                {numbers.cancellationRate ?? 0}%
              </strong>
              <small style={{ display: "block", color: "#94a3b8" }}>{numbers.statusBreakdown?.cancelled ?? 0} visits</small>
            </div>
          </div>
        </SectionPanel>

        {numbers.pendingDentistApprovals > 0 && (
          <div className="notice notice-warn" style={{ marginTop: "1rem" }}>
            <ShieldCheck size={17} />
            Doctor profile is awaiting credential verification. <Link to="/admin/dentists">Review profile</Link>
          </div>
        )}
      </AsyncView>

      <div className="chart-grid" style={{ marginTop: "1.5rem" }}>
        <SectionPanel
          title={`Appointments (${totalAppointments} total)`}
          description="Clinic-time weekly volume categorized by appointment status."
          actions={
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <button
                type="button"
                className={`button button-small ${range === "week" ? "button-primary" : "button-quiet"}`}
                onClick={() => setRange("week")}
              >
                This week
              </button>
              <button
                type="button"
                className={`button button-small ${range === "7d" ? "button-primary" : "button-quiet"}`}
                onClick={() => setRange("7d")}
              >
                Last 7 days
              </button>
            </div>
          }
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSeries}>
                <CartesianGrid vertical={false} stroke="#e7eeeb" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  labelFormatter={(label, items) => {
                    const entry = items?.[0]?.payload;
                    return entry ? `${entry.label} (${entry.date}) · Total: ${entry.total}` : label;
                  }}
                />
                <Bar dataKey="confirmed" name="Confirmed" stackId="a" fill="#137a76" radius={[0, 0, 0, 0]} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#2a9d8f" radius={[0, 0, 0, 0]} />
                <Bar dataKey="noShow" name="No-show" stackId="a" fill="#e76f51" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#e63946" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionPanel>

        <SectionPanel
          title="Revenue by month"
          description="Collected payments, reported in INR."
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid vertical={false} stroke="#e7eeeb" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(value) => rupees(value)} />
                <Bar dataKey="total" fill="#d9a84f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionPanel>

        {/* Revenue by Treatment (single clinic replacement for top specialties) */}
        <SectionPanel
          title="Revenue by treatment"
          description="Collections categorized by catalog treatment procedures."
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={treatmentData}>
                <CartesianGrid vertical={false} stroke="#e7eeeb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(value) => rupees(value)} />
                <Bar dataKey="revenue" fill="#137a76" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionPanel>
      </div>

      {/* Embedded Live System Status */}
      <div style={{ marginTop: "1.5rem" }}>
        <SystemStatusCard />
      </div>
    </div>
  );
}

export function AdminAppointments() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const primary = usePrimaryDentist();

  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Booking modal
  const [showBookModal, setShowBookModal] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [bookingDate, setBookingDate] = useState(clinicDate());
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingMode, setBookingMode] = useState("in-clinic");
  const [bookingReason, setBookingReason] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(clinicDate());
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const query = useQuery({
    queryKey: ["admin-appointments", status, mode, from, to, search, page],
    queryFn: () =>
      api.appointments.all({
        status: status || undefined,
        mode: mode || undefined,
        from: from || undefined,
        to: to || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      }),
  });

  const appointments = query.data?.data || [];
  const meta = query.data?.meta || { total: 0, page: 1, limit: 20 };

  // Slots for booking modal
  const slotsQuery = useQuery({
    queryKey: ["admin-booking-slots", bookingDate, primary.dentistId],
    queryFn: () => fetchPrimarySlotsWithFallback(bookingDate, primary.dentistId),
    enabled: showBookModal && !!bookingDate,
  });
  const availableSlots = (slotsQuery.data || []).filter(
    (slot) => !isPastSlot(bookingDate, slot.startTime)
  );

  // Slots for reschedule modal
  const reschedSlotsQuery = useQuery({
    queryKey: ["admin-resched-slots", rescheduleDate, primary.dentistId],
    queryFn: () => fetchPrimarySlotsWithFallback(rescheduleDate, primary.dentistId),
    enabled: !!rescheduleTarget && !!rescheduleDate,
  });
  const reschedAvailableSlots = (reschedSlotsQuery.data || []).filter(
    (slot) => !isPastSlot(rescheduleDate, slot.startTime)
  );

  // Patient search for staff booking
  const patientSearchResults = useQuery({
    queryKey: ["admin-patient-search", patientSearchTerm],
    queryFn: () => api.patients.list({ search: patientSearchTerm, limit: 8 }),
    enabled: showBookModal && patientSearchTerm.length >= 2,
  });

  const handleBook = async (e) => {
    e.preventDefault();
    const patientId = selectedPatient?._id || selectedPatient?.user?._id;
    if (!patientId) {
      notify("Select a patient.", "error");
      return;
    }
    if (!bookingSlot) {
      notify("Select an available time slot.", "error");
      return;
    }
    setBookingBusy(true);
    try {
      const res = await api.appointments.createStaff({
        patientId,
        dentistId: primary.dentistId || undefined,
        date: bookingDate,
        startTime: bookingSlot,
        mode: bookingMode,
        reasonForVisit: bookingReason,
      });
      notify(res.message || "Appointment booked and confirmed.");
      setShowBookModal(false);
      setSelectedPatient(null);
      setBookingSlot("");
      setBookingReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBookingBusy(false);
    }
  };

  const handleConfirm = async (id) => {
    try {
      const res = await api.appointments.confirm(id, { staffOverride: true });
      notify(res.message || "Appointment confirmed.");
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const handleNoShow = async (id) => {
    const ok = await confirm({
      title: "Mark patient as No-Show?",
      description: "This records that the patient did not attend this scheduled visit.",
      confirmLabel: "Mark No-Show",
    });
    if (!ok) return;
    try {
      const res = await api.appointments.noShow(id);
      notify(res.message || "Marked as no-show.");
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const handleCancel = async (e) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const res = await api.appointments.cancel(cancelTarget._id, cancelReason);
      notify(res.message || "Appointment cancelled.");
      setCancelTarget(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setCancelBusy(false);
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleSlot) {
      notify("Select a new time slot.", "error");
      return;
    }
    setRescheduleBusy(true);
    try {
      const res = await api.appointments.reschedule(rescheduleTarget._id, {
        date: rescheduleDate,
        startTime: rescheduleSlot,
      });
      notify(res.message || "Appointment rescheduled.");
      setRescheduleTarget(null);
      setRescheduleSlot("");
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setRescheduleBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (!appointments.length) {
      notify("No appointments to export.", "error");
      return;
    }
    const headers = [
      "Appointment ID",
      "Patient Name",
      "Phone",
      "Email",
      "Date",
      "Time",
      "Mode",
      "Status",
      "Payment Status",
      "Fee (INR)",
      "Reason",
      "Cancelled By",
      "Cancellation Reason",
    ];
    const rows = appointments.map((a) => [
      a._id,
      a.patient?.name || a.familyMemberName || "Patient",
      a.patient?.phone || "",
      a.patient?.email || "",
      fmtDate(a.date),
      a.startTime,
      a.mode,
      a.status,
      a.paymentStatus,
      a.fees?.totalAmount || 0,
      a.reasonForVisit || "",
      a.cancelledBy || "",
      a.cancellationReason || "",
    ]);
    exportToCsv(`appointments-${clinicDate()}.csv`, headers, rows);
    notify("Exported appointments CSV.");
  };

  return (
    <div>
      <PageTitle
        eyebrow="Clinical schedule"
        title="Appointments"
        description="Search, filter, book on behalf of patients, confirm, reschedule, or cancel clinic visits."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="button button-outline"
              onClick={handleExportCsv}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowBookModal(true)}
            >
              <Plus size={15} /> Book for patient
            </button>
          </div>
        }
      />

      <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem", marginBottom: "1.2rem" }}>
        <Field label="Status">
          <TextInput
            as="select"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="no-show">No-Show</option>
            <option value="cancelled">Cancelled</option>
          </TextInput>
        </Field>

        <Field label="Mode">
          <TextInput
            as="select"
            value={mode}
            onChange={(e) => { setMode(e.target.value); setPage(1); }}
          >
            <option value="">All modes</option>
            <option value="in-clinic">In-Clinic</option>
            <option value="video">Video Consultation</option>
          </TextInput>
        </Field>

        <Field label="From date">
          <TextInput
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          />
        </Field>

        <Field label="To date">
          <TextInput
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
          />
        </Field>

        <Field label="Search patient">
          <TextInput
            placeholder="Name or phone"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </Field>
      </div>

      <SectionPanel title={`Appointments list (${meta.total || appointments.length} records)`}>
        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && !appointments.length}
          emptyTitle="No appointments match your filter criteria"
        >
          <div className="record-list">
            {appointments.map((a) => (
              <article className="record-row" key={a._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <span className="avatar avatar-large">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <strong style={{ fontSize: "1rem" }}>{a.patient?.name || a.familyMemberName || "Patient"}</strong>
                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      {a.patient?.phone} · {fmtDate(a.date)} at {a.startTime} · <span style={{ textTransform: "capitalize" }}>{a.mode}</span>
                    </div>
                    {a.reasonForVisit && (
                      <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "0.2rem" }}>
                        Reason: {a.reasonForVisit}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge value={a.status} />
                  <StatusBadge value={a.paymentStatus} />
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", marginRight: "0.5rem" }}>
                    {rupees(a.fees?.totalAmount)}
                  </span>

                  {a.status === "pending" && (
                    <button
                      type="button"
                      className="button button-small button-primary"
                      onClick={() => handleConfirm(a._id)}
                    >
                      Confirm
                    </button>
                  )}

                  {["pending", "confirmed"].includes(a.status) && (
                    <>
                      <button
                        type="button"
                        className="button button-small button-outline"
                        onClick={() => {
                          setRescheduleTarget(a);
                          setRescheduleDate(clinicDate());
                          setRescheduleSlot("");
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        className="button button-small button-outline"
                        style={{ color: "#e76f51" }}
                        onClick={() => handleNoShow(a._id)}
                      >
                        No-Show
                      </button>
                      <button
                        type="button"
                        className="button button-small button-quiet"
                        style={{ color: "#e63946" }}
                        onClick={() => {
                          setCancelTarget(a);
                          setCancelReason("");
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>

          {meta.pages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.2rem" }}>
              <button
                type="button"
                className="button button-quiet button-small"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Page {page} of {meta.pages}
              </span>
              <button
                type="button"
                className="button button-quiet button-small"
                disabled={page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </AsyncView>
      </SectionPanel>

      {/* Book on behalf of patient modal */}
      {showBookModal && (
        <div className="modal-backdrop" onClick={() => setShowBookModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", width: "95%" }}>
            <div className="modal-header">
              <h2>Book Appointment on Behalf of Patient</h2>
              <button type="button" className="icon-button" onClick={() => setShowBookModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleBook} className="stack-form" style={{ padding: "1.2rem" }}>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Select Patient *</label>
                {selectedPatient ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "#f0f4f2", borderRadius: "6px" }}>
                    <span><strong>{selectedPatient.name || selectedPatient.user?.name}</strong> ({selectedPatient.phone || selectedPatient.user?.phone})</span>
                    <button type="button" className="button button-quiet button-small" onClick={() => setSelectedPatient(null)}>Change</button>
                  </div>
                ) : (
                  <div>
                    <TextInput
                      placeholder="Type patient name or phone"
                      value={patientSearchTerm}
                      onChange={(e) => setPatientSearchTerm(e.target.value)}
                    />
                    {patientSearchResults.data?.data?.length > 0 && (
                      <div className="record-list" style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #dbe5e1", borderRadius: "4px", marginTop: "0.3rem" }}>
                        {patientSearchResults.data.data.map((p) => (
                          <div
                            key={p._id}
                            style={{ padding: "0.5rem 0.8rem", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f4f2" }}
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientSearchTerm("");
                            }}
                          >
                            <strong>{p.name || p.user?.name}</strong>
                            <small>{p.phone || p.user?.phone}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Field label="Appointment date *">
                <TextInput
                  type="date"
                  min={clinicDate()}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    setBookingSlot("");
                  }}
                  required
                />
              </Field>

              <Field label="Available Doctor Slots *">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "130px", overflowY: "auto" }}>
                  {availableSlots.length > 0 ? (
                    availableSlots.map((slot) => (
                      <button
                        key={slot.startTime}
                        type="button"
                        className={`button button-small ${bookingSlot === slot.startTime ? "button-primary" : "button-outline"}`}
                        onClick={() => setBookingSlot(slot.startTime)}
                      >
                        {slot.startTime}
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      {slotsQuery.isLoading ? "Loading doctor availability…" : "No available slots on this date."}
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Consultation mode">
                <TextInput
                  as="select"
                  value={bookingMode}
                  onChange={(e) => setBookingMode(e.target.value)}
                >
                  <option value="in-clinic">In-Clinic Visit</option>
                  <option value="video">Video Consultation</option>
                </TextInput>
              </Field>

              <Field label="Reason for visit">
                <TextInput
                  placeholder="e.g. Toothache, routine checkup, filling"
                  value={bookingReason}
                  onChange={(e) => setBookingReason(e.target.value)}
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setShowBookModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={bookingBusy || !bookingSlot || !selectedPatient}>
                  {bookingBusy ? "Booking…" : "Confirm Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal with auto-refund rule notice */}
      {cancelTarget && (
        <div className="modal-backdrop" onClick={() => setCancelTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="modal-header">
              <h2>Cancel Appointment</h2>
              <button type="button" className="icon-button" onClick={() => setCancelTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCancel} className="stack-form" style={{ padding: "1.2rem" }}>
              <p style={{ color: "#475569", fontSize: "0.9rem" }}>
                Are you sure you want to cancel the appointment for <strong>{cancelTarget.patient?.name || "Patient"}</strong> on {fmtDate(cancelTarget.date)} at {cancelTarget.startTime}?
              </p>
              <div className="notice notice-info" style={{ fontSize: "0.85rem" }}>
                <strong>Refund Policy:</strong> If paid, appointments cancelled 24+ hours before the slot are automatically refunded. Within 24h, refund must be processed manually under Invoices & Payments.
              </div>
              <Field label="Cancellation reason *">
                <TextInput
                  placeholder="e.g. Patient requested cancellation, doctor emergency"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setCancelTarget(null)}>
                  Close
                </button>
                <button type="submit" className="button button-primary" style={{ background: "#e63946" }} disabled={cancelBusy || !cancelReason.trim()}>
                  {cancelBusy ? "Cancelling…" : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="modal-backdrop" onClick={() => setRescheduleTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="modal-header">
              <h2>Reschedule Appointment</h2>
              <button type="button" className="icon-button" onClick={() => setRescheduleTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleReschedule} className="stack-form" style={{ padding: "1.2rem" }}>
              <p style={{ fontSize: "0.9rem", color: "#475569" }}>
                Rescheduling <strong>{rescheduleTarget.patient?.name || "Patient"}</strong> from {fmtDate(rescheduleTarget.date)} at {rescheduleTarget.startTime}.
              </p>
              <Field label="New Appointment Date *">
                <TextInput
                  type="date"
                  min={clinicDate()}
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleSlot("");
                  }}
                  required
                />
              </Field>
              <Field label="Available Time Slots *">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "130px", overflowY: "auto" }}>
                  {reschedAvailableSlots.length > 0 ? (
                    reschedAvailableSlots.map((slot) => (
                      <button
                        key={slot.startTime}
                        type="button"
                        className={`button button-small ${rescheduleSlot === slot.startTime ? "button-primary" : "button-outline"}`}
                        onClick={() => setRescheduleSlot(slot.startTime)}
                      >
                        {slot.startTime}
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      {reschedSlotsQuery.isLoading ? "Loading doctor availability…" : "No available slots on this date."}
                    </span>
                  )}
                </div>
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setRescheduleTarget(null)}>
                  Close
                </button>
                <button type="submit" className="button button-primary" disabled={rescheduleBusy || !rescheduleSlot}>
                  {rescheduleBusy ? "Rescheduling…" : "Confirm Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}

export function AdminReviews() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [filterHidden, setFilterHidden] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin-reviews", filterHidden, page],
    queryFn: () =>
      api.reviews.all({
        page,
        limit: 20,
        isHidden: filterHidden === "" ? undefined : filterHidden === "hidden",
      }),
  });

  const reviews = query.data?.data || [];
  const meta = query.data?.meta || { total: 0, page: 1, limit: 20 };

  const handleToggleHide = async (rev) => {
    try {
      const res = await api.reviews.toggleHide(rev._id);
      notify(res.message || (rev.isHidden ? "Review unhidden." : "Review hidden."));
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      query.refetch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Patient feedback"
        title="Reviews & ratings"
        description="Monitor patient reviews, inspect doctor replies, and moderate visible content."
      />

      <div className="filter-bar" style={{ marginBottom: "1.2rem" }}>
        <Field label="Visibility">
          <TextInput
            as="select"
            value={filterHidden}
            onChange={(e) => { setFilterHidden(e.target.value); setPage(1); }}
          >
            <option value="">All reviews</option>
            <option value="visible">Visible only</option>
            <option value="hidden">Hidden from public</option>
          </TextInput>
        </Field>
      </div>

      <SectionPanel title={`Reviews list (${meta.total || reviews.length} total)`}>
        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && !reviews.length}
          emptyTitle="No reviews found"
        >
          <div className="record-list">
            {reviews.map((rev) => (
              <article className="record-row" key={rev._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "1rem" }}>{rev.patient?.name || "Patient"}</strong>
                    <div style={{ display: "flex", color: "#eab308" }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={15}
                          fill={i < rev.rating ? "#eab308" : "none"}
                          stroke="#eab308"
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {fmtDate(rev.createdAt)}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: "0.9rem", color: "#334155" }}>
                    {rev.comment}
                  </p>

                  {rev.doctorReply?.text && (
                    <div style={{ marginTop: "0.4rem", padding: "0.5rem 0.8rem", background: "#f8fafc", borderRadius: "6px", borderLeft: "3px solid #137a76", fontSize: "0.85rem" }}>
                      <strong style={{ color: "#137a76" }}>Doctor's Reply: </strong>
                      <span>{rev.doctorReply.text}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <StatusBadge value={rev.isHidden ? "inactive" : "active"} />
                  <button
                    type="button"
                    className="button button-small button-outline"
                    onClick={() => handleToggleHide(rev)}
                  >
                    {rev.isHidden ? (
                      <><Eye size={14} /> Unhide</>
                    ) : (
                      <><EyeOff size={14} /> Hide</>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {meta.pages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.2rem" }}>
              <button
                type="button"
                className="button button-quiet button-small"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Page {page} of {meta.pages}
              </span>
              <button
                type="button"
                className="button button-quiet button-small"
                disabled={page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </AsyncView>
      </SectionPanel>
    </div>
  );
}

export function DentistManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { dialog } = useConfirm();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    specialization: "",
    qualifications: "",
    experienceYears: 0,
    consultationFee: 0,
    about: "",
  });
  const [busy, setBusy] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseUntil, setPauseUntil] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [endpointPending, setEndpointPending] = useState(false);

  const query = useQuery({
    queryKey: ["dentists", "admin"],
    queryFn: async () => {
      try {
        return await api.dentists.adminList({ page: 1, limit: 10 });
      } catch (error) {
        if (error.status !== 404) throw error;
        const fallback = await api.dentists.list({ page: 1, limit: 10 });
        return { ...fallback, limited: true };
      }
    },
  });

  const dentists = query.data?.data || [];
  const doctor = dentists[0] || null;

  // Bookable checklist calculation
  const checklist = useMemo(() => {
    if (!doctor) return null;
    const reasons = [];
    if (!doctor.isVerified) reasons.push("Credentials unverified");
    if (doctor.isAcceptingAppointments === false) reasons.push("Appointments are paused");
    const hasHours = (doctor.weeklyAvailability || []).some((d) => (d.slots || []).length > 0);
    if (!hasHours) reasons.push("Weekly schedule hours not configured");
    if (!doctor.slotDuration) reasons.push("Consultation slot duration not set");
    if (!doctor.consultationFee || doctor.consultationFee <= 0) reasons.push("Consultation fee is not set");

    return {
      isBookable: reasons.length === 0,
      reasons,
      verified: !!doctor.isVerified,
      accepting: doctor.isAcceptingAppointments !== false,
      weeklyHours: hasHours,
      slotLength: !!doctor.slotDuration,
      fee: (doctor.consultationFee || 0) > 0,
    };
  }, [doctor]);

  const createDentist = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      experienceYears: Number(form.experienceYears),
      consultationFee: Number(form.consultationFee),
      qualifications: form.qualifications
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    try {
      const result = await api.dentists.create(body);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
      setForm({
        name: "",
        email: "",
        phone: "",
        password: "",
        specialization: "",
        qualifications: "",
        experienceYears: 0,
        consultationFee: 0,
        about: "",
      });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (id) => {
    try {
      const result = await api.dentists.verify(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handlePauseResume = async (e) => {
    e.preventDefault();
    if (!doctor) return;
    setBusy(true);
    const nextActive = doctor.isAcceptingAppointments === false;
    try {
      const result = await api.dentists.toggleActive({
        isActive: nextActive,
        reason: pauseReason || undefined,
        pausedUntil: pauseUntil || undefined,
      });
      notify(result.message || (nextActive ? "Doctor resumed appointments." : "Doctor appointments paused."));
      setShowPauseModal(false);
      setPauseReason("");
      setPauseUntil("");
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
      queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
    } catch (error) {
      if (error.status === 404) setEndpointPending(true);
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDoctor = async (e) => {
    e.preventDefault();
    if (!doctor || !editForm) return;
    setBusy(true);
    try {
      const result = await api.dentists.updateDoctor(doctor._id, editForm);
      notify(result.message || "Doctor profile updated.");
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
      queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
    } catch (error) {
      if (error.status === 404) setEndpointPending(true);
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!doctor || !tempPassword) return;
    setBusy(true);
    try {
      const result = await api.dentists.resetDoctorPassword(doctor._id, { tempPassword });
      notify(result.message || "Temporary password set. Doctor must change password on next sign-in.");
      setShowPasswordModal(false);
      setTempPassword("");
    } catch (error) {
      if (error.status === 404) setEndpointPending(true);
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoUpload = async (file, onProgress) => {
    if (!doctor) return;
    const formData = new FormData();
    formData.append("photo", file);
    const result = await api.dentists.updateDoctorPhoto(doctor._id, formData, onProgress);
    queryClient.invalidateQueries({ queryKey: ["dentists"] });
    queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
    return result;
  };

  return (
    <div>
      <PageTitle
        eyebrow="Clinical lead"
        title="Doctor profile & account"
        description="Comprehensive management of the clinic's dedicated chief dental clinician."
      />

      {endpointPending && (
        <BackendPendingNotice feature="Doctor Profile Management (PATCH /dentists/:id, password reset, photo upload)" />
      )}

      {doctor ? (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {/* Header Card with Photo and Bookable Status */}
          <SectionPanel
            title={`Dr. ${doctor.user?.name || "Doctor Profile"}`}
            description={`${doctor.specialization || "Dental Surgeon"} · ${doctor.experienceYears || 0} years experience · Fee: ${rupees(doctor.consultationFee)}`}
            actions={
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => {
                    setEditForm({
                      name: doctor.user?.name || "",
                      email: doctor.user?.email || "",
                      phone: doctor.user?.phone || "",
                      specialization: doctor.specialization || "",
                      qualifications: (doctor.qualifications || []).join(", "),
                      experienceYears: doctor.experienceYears || 0,
                      consultationFee: doctor.consultationFee || 0,
                      about: doctor.about || "",
                      languages: (doctor.languages || []).join(", "),
                      clinicAddress: doctor.clinicAddress || "",
                      slotDuration: doctor.slotDuration || 30,
                    });
                    setShowEditModal(true);
                  }}
                >
                  <Edit2 size={14} /> Edit profile
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => setShowPasswordModal(true)}
                >
                  <KeyRound size={14} /> Reset password
                </button>
              </div>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "1.5rem", alignItems: "start" }}>
              <div>
                <img
                  src={doctor.user?.photo?.url || "/placeholder-doctor.jpg"}
                  alt={doctor.user?.name || "Doctor"}
                  style={{ width: "110px", height: "110px", borderRadius: "50%", objectFit: "cover", border: "3px solid #137a76" }}
                  onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80"; }}
                />
                <div style={{ marginTop: "0.5rem" }}>
                  <FileUpload
                    accept="image/jpeg,image/png,image/webp"
                    maxSizeMB={5}
                    label="Change photo"
                    onUpload={handlePhotoUpload}
                    onSuccess={() => notify("Doctor photo updated.")}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <div><strong>Email:</strong> {doctor.user?.email} · <strong>Phone:</strong> {doctor.user?.phone}</div>
                <div><strong>Qualifications:</strong> {doctor.qualifications?.join(", ") || "BDS"}</div>
                <div><strong>Languages:</strong> {doctor.languages?.join(", ") || "English, Hindi"}</div>
                <div><strong>Slot duration:</strong> {doctor.slotDuration || 30} minutes</div>
                {doctor.clinicAddress && <div><strong>Clinic address:</strong> {doctor.clinicAddress}</div>}
                <div><strong>Rating:</strong> {doctor.rating || 5} ★ ({doctor.reviewCount || 0} reviews)</div>
                {doctor.about && (
                  <p style={{ marginTop: "0.4rem", color: "#495a55", fontSize: "0.9rem" }}>{doctor.about}</p>
                )}
              </div>
            </div>

            {/* Bookable Checklist Section */}
            {checklist && (
              <div style={{ marginTop: "1.2rem", paddingTop: "1.2rem", borderTop: "1px solid #e7eeeb" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
                  <span style={{ fontWeight: 600 }}>Bookable Status</span>
                  <span
                    className={`status-badge ${checklist.isBookable ? "status-active" : "status-inactive"}`}
                    style={{ fontSize: "0.85rem", padding: "4px 8px" }}
                  >
                    {checklist.isBookable ? "Bookable: YES" : "Bookable: NO"}
                  </span>
                </div>
                {!checklist.isBookable && (
                  <div className="notice notice-warn" style={{ marginBottom: "0.8rem" }}>
                    <strong>Patients cannot book online for the following reasons:</strong>
                    <ul style={{ margin: "0.3rem 0 0 1.2rem", padding: 0 }}>
                      {checklist.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <div>{checklist.verified ? "✓" : "✗"} Verified credentials</div>
                  <div>{checklist.accepting ? "✓" : "✗"} Accepting visits</div>
                  <div>{checklist.weeklyHours ? "✓" : "✗"} Weekly schedule set</div>
                  <div>{checklist.slotLength ? "✓" : "✗"} Slot length set ({doctor.slotDuration || 0}m)</div>
                  <div>{checklist.fee ? "✓" : "✗"} Consultation fee set ({rupees(doctor.consultationFee)})</div>
                </div>
              </div>
            )}

            {/* Status badges and Quick action buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.8rem", marginTop: "1.2rem", paddingTop: "1rem", borderTop: "1px solid #e7eeeb" }}>
              <StatusBadge value={doctor.isVerified ? "verified" : "pending"} />
              <StatusBadge value={doctor.isAcceptingAppointments !== false ? "active" : "inactive"} />
              <span className={`status-badge ${doctor.isAcceptingAppointments !== false ? "status-active" : "status-inactive"}`}>
                {doctor.isAcceptingAppointments !== false ? "Accepting visits" : "Visits paused"}
              </span>

              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                {!doctor.isVerified && (
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() => verify(doctor._id)}
                  >
                    Verify credentials <Check size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className={`button button-small ${doctor.isAcceptingAppointments !== false ? "button-quiet" : "button-primary"}`}
                  onClick={() => setShowPauseModal(true)}
                >
                  {doctor.isAcceptingAppointments !== false ? "Pause appointments" : "Resume appointments"}
                </button>
              </div>
            </div>
          </SectionPanel>

          {/* Edit Profile Modal */}
          {showEditModal && editForm && (
            <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", width: "90%" }}>
                <div className="modal-header">
                  <h2>Edit Doctor Profile</h2>
                  <button type="button" className="icon-button" onClick={() => setShowEditModal(false)}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleUpdateDoctor} className="admin-form-grid" style={{ padding: "1.2rem" }}>
                  <Field label="Full name">
                    <TextInput
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <TextInput
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Phone">
                    <TextInput
                      type="tel"
                      required
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Specialization">
                    <TextInput
                      required
                      value={editForm.specialization}
                      onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                    />
                  </Field>
                  <Field label="Qualifications (comma-separated)">
                    <TextInput
                      value={editForm.qualifications}
                      onChange={(e) => setEditForm({ ...editForm, qualifications: e.target.value })}
                    />
                  </Field>
                  <Field label="Years of experience">
                    <TextInput
                      type="number"
                      min="0"
                      value={editForm.experienceYears}
                      onChange={(e) => setEditForm({ ...editForm, experienceYears: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Consultation fee (INR)">
                    <TextInput
                      type="number"
                      min="0"
                      value={editForm.consultationFee}
                      onChange={(e) => setEditForm({ ...editForm, consultationFee: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Slot duration (minutes)">
                    <TextInput
                      type="number"
                      min="10"
                      step="5"
                      value={editForm.slotDuration}
                      onChange={(e) => setEditForm({ ...editForm, slotDuration: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Languages (comma-separated)">
                    <TextInput
                      value={editForm.languages}
                      onChange={(e) => setEditForm({ ...editForm, languages: e.target.value })}
                    />
                  </Field>
                  <Field label="Clinic address" className="field-wide">
                    <TextInput
                      value={editForm.clinicAddress}
                      onChange={(e) => setEditForm({ ...editForm, clinicAddress: e.target.value })}
                    />
                  </Field>
                  <Field label="About summary" className="field-wide">
                    <TextInput
                      as="textarea"
                      rows={3}
                      value={editForm.about}
                      onChange={(e) => setEditForm({ ...editForm, about: e.target.value })}
                    />
                  </Field>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }} className="field-wide">
                    <button type="button" className="button button-quiet" onClick={() => setShowEditModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="button button-primary" disabled={busy}>
                      {busy ? "Saving…" : "Save Doctor Profile"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Pause / Resume Modal */}
          {showPauseModal && (
            <div className="modal-backdrop" onClick={() => setShowPauseModal(false)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "90%" }}>
                <div className="modal-header">
                  <h2>{doctor.isAcceptingAppointments !== false ? "Pause Doctor Appointments" : "Resume Doctor Appointments"}</h2>
                  <button type="button" className="icon-button" onClick={() => setShowPauseModal(false)}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handlePauseResume} className="stack-form" style={{ padding: "1.2rem" }}>
                  {doctor.isAcceptingAppointments !== false ? (
                    <>
                      <p style={{ color: "#495a55", fontSize: "0.9rem" }}>
                        Pausing will prevent new patient bookings online while allowing existing appointments to proceed.
                      </p>
                      <Field label="Reason (shown to patients)">
                        <TextInput
                          placeholder="e.g. Attending dental conference / Medical leave"
                          value={pauseReason}
                          onChange={(e) => setPauseReason(e.target.value)}
                        />
                      </Field>
                      <Field label="Resume date (optional auto-resume)">
                        <TextInput
                          type="date"
                          min={clinicDate()}
                          value={pauseUntil}
                          onChange={(e) => setPauseUntil(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <p style={{ color: "#495a55", fontSize: "0.9rem" }}>
                      Resuming will re-enable online booking for Dr. {doctor.user?.name || "the doctor"} immediately based on weekly availability hours.
                    </p>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <button type="button" className="button button-quiet" onClick={() => setShowPauseModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="button button-primary" disabled={busy}>
                      {busy ? "Updating…" : doctor.isAcceptingAppointments !== false ? "Confirm Pause" : "Confirm Resume"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reset Password Modal */}
          {showPasswordModal && (
            <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px", width: "90%" }}>
                <div className="modal-header">
                  <h2>Reset Doctor Password</h2>
                  <button type="button" className="icon-button" onClick={() => setShowPasswordModal(false)}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleResetPassword} className="stack-form" style={{ padding: "1.2rem" }}>
                  <p style={{ color: "#495a55", fontSize: "0.9rem" }}>
                    Set a temporary initial password for Dr. {doctor.user?.name}. The doctor will be prompted to change it upon signing in.
                  </p>
                  <Field label="Temporary password" hint="Minimum 6 characters">
                    <TextInput
                      type="password"
                      required
                      minLength={6}
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                    />
                  </Field>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <button type="button" className="button button-quiet" onClick={() => setShowPasswordModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="button button-primary" disabled={busy || tempPassword.length < 6}>
                      {busy ? "Resetting…" : "Reset Password"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <p className="muted-copy">
            Single-Dentist Mode is active. Additional dentist accounts cannot be created while a primary clinician is registered.
          </p>
        </div>
      ) : (
        <SectionPanel
          title="Provision clinic doctor account"
          description="Enter the doctor's details to initialize the single-dentist practice."
        >
          <form className="admin-form-grid" onSubmit={createDentist}>
            {[
              ["name", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["password", "Initial password"],
              ["specialization", "Specialization"],
              ["qualifications", "Qualifications (comma-separated)"],
              ["experienceYears", "Years of experience"],
              ["consultationFee", "Consultation fee (INR)"],
              ["about", "Profile summary"],
            ].map(([key, label]) => (
              <Field
                key={key}
                label={label}
                className={key === "about" ? "field-wide" : ""}
              >
                <TextInput
                  required={[
                    "name",
                    "email",
                    "phone",
                    "password",
                    "specialization",
                  ].includes(key)}
                  type={
                    key === "email"
                      ? "email"
                      : key === "password"
                        ? "password"
                        : ["experienceYears", "consultationFee"].includes(key)
                          ? "number"
                          : "text"
                  }
                  min={
                    ["experienceYears", "consultationFee"].includes(key)
                      ? 0
                      : undefined
                  }
                  as={key === "about" ? "textarea" : "input"}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
            <button className="button button-primary" disabled={busy}>
              {busy ? "Provisioning…" : "Provision Doctor Account"} <Plus size={15} />
            </button>
          </form>
        </SectionPanel>
      )}
      {dialog}
    </div>
  );
}

function StaffManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [resetStaff, setResetStaff] = useState(null);
  const [tempPassword, setTempPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "receptionist",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "receptionist",
  });

  const query = useQuery({
    queryKey: ["staff", search],
    queryFn: () => api.staff.list({ search, page: 1, limit: 50 }),
  });
  const staff = query.data?.data || [];

  const create = async (event) => {
    event.preventDefault();
    try {
      const result = await api.staff.create(form);
      notify(result.message);
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", password: "", role: "receptionist" });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingStaff) return;
    setEditBusy(true);
    try {
      const result = await api.staff.update(editingStaff._id, editForm);
      notify(result.message || "Staff account updated successfully.");
      setEditingStaff(null);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setEditBusy(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!resetStaff) return;
    setResetBusy(true);
    try {
      const result = await api.staff.resetPassword(resetStaff._id, { password: tempPassword });
      notify(result.message || "Password reset. Staff must change it on next login.");
      setResetStaff(null);
      setTempPassword("");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setResetBusy(false);
    }
  };

  const toggle = async (member) => {
    if (member._id === currentUser?._id) {
      notify("You cannot deactivate your own account.", "error");
      return;
    }
    try {
      const result =
        member.active === false
          ? await api.staff.activate(member._id)
          : await api.staff.deactivate(member._id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Team access"
        title="Staff"
        description="Manage receptionist and administrator accounts, update roles, and reset credentials."
        actions={
          <button
            className="button button-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <UserPlus size={16} /> Add staff
          </button>
        }
      />
      {showForm && (
        <SectionPanel title="Create staff account">
          <form className="admin-form-grid" onSubmit={create}>
            {[
              ["name", "Full name"],
              ["email", "Email address"],
              ["phone", "Phone number"],
              ["password", "Temporary password"],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <TextInput
                  required
                  type={
                    key === "email"
                      ? "email"
                      : key === "password"
                        ? "password"
                        : "text"
                  }
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Role">
              <TextInput
                as="select"
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                <option value="receptionist">Receptionist</option>
                <option value="admin">Administrator</option>
              </TextInput>
            </Field>
            <button className="button button-primary">
              Create account <Plus size={15} />
            </button>
          </form>
        </SectionPanel>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="modal-backdrop" onClick={() => setEditingStaff(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="modal-header">
              <h2>Edit Staff Member</h2>
              <button type="button" className="icon-button" onClick={() => setEditingStaff(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="stack-form" style={{ padding: "1.2rem" }}>
              <Field label="Full Name *">
                <TextInput
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </Field>
              <Field label="Phone Number *">
                <TextInput
                  required
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </Field>
              <Field label="Role *">
                <TextInput
                  as="select"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  disabled={editingStaff._id === currentUser?._id}
                >
                  <option value="receptionist">Receptionist</option>
                  <option value="admin">Administrator</option>
                </TextInput>
              </Field>
              {editingStaff._id === currentUser?._id && (
                <small className="muted-copy" style={{ color: "#64748b" }}>
                  You cannot change your own administrator role.
                </small>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setEditingStaff(null)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={editBusy}>
                  {editBusy ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetStaff && (
        <div className="modal-backdrop" onClick={() => setResetStaff(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="modal-header">
              <h2>Reset Staff Password</h2>
              <button type="button" className="icon-button" onClick={() => setResetStaff(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="stack-form" style={{ padding: "1.2rem" }}>
              <p style={{ fontSize: "0.9rem", color: "#475569" }}>
                Assign a temporary password for <strong>{resetStaff.name}</strong> ({resetStaff.email}). They will be required to change it on their next login.
              </p>
              <Field label="New Temporary Password (min 8 chars) *">
                <TextInput
                  type="password"
                  required
                  placeholder="Enter temporary password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setResetStaff(null)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={resetBusy || tempPassword.length < 8}>
                  {resetBusy ? "Resetting…" : "Reset & Require Change"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <label className="search-field compact-search">
        <Search size={17} />
        <input
          placeholder="Search staff"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !staff.length}
        emptyTitle="No staff accounts found"
      >
        <div className="record-list">
          {staff.map((member) => {
            const isSelf = member._id === currentUser?._id;
            return (
              <article className="record-row" key={member._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <span className="avatar avatar-large">
                    <Users size={17} />
                  </span>
                  <div className="record-row-content">
                    <strong>
                      {member.name} {isSelf && <span style={{ fontSize: "0.75rem", color: "#137a76", fontWeight: "normal" }}>(You)</span>}
                    </strong>
                    <span>
                      {member.email} · {member.phone}
                    </span>
                  </div>
                </div>
                <div className="record-row-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <StatusBadge value={member.role} />
                  <StatusBadge
                    value={member.active === false ? "inactive" : "active"}
                  />
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    title="Edit staff details"
                    onClick={() => {
                      setEditingStaff(member);
                      setEditForm({
                        name: member.name,
                        phone: member.phone || "",
                        role: member.role,
                      });
                    }}
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    title="Reset password and require change"
                    onClick={() => {
                      setResetStaff(member);
                      setTempPassword("");
                    }}
                  >
                    <KeyRound size={13} /> Reset PW
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    disabled={isSelf}
                    title={isSelf ? "Cannot deactivate yourself" : undefined}
                    onClick={() => toggle(member)}
                  >
                    {member.active === false ? "Activate" : "Deactivate"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </AsyncView>
    </div>
  );
}

function TreatmentCatalog() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const query = useQuery({
    queryKey: ["treatments"],
    queryFn: api.treatments.list,
  });
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    defaultCost: 0,
    estimatedDurationMinutes: 30,
  });
  const items = query.data?.data || [];
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await api.treatments.create({
        ...form,
        defaultCost: Number(form.defaultCost),
        estimatedDurationMinutes: Number(form.estimatedDurationMinutes),
      });
      notify(result.message);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const update = async (event) => {
    event.preventDefault();
    if (!editingItem) return;
    try {
      const result = await api.treatments.update(editingItem._id, {
        name: editingItem.name,
        category: editingItem.category,
        description: editingItem.description,
        defaultCost: Number(editingItem.defaultCost),
        estimatedDurationMinutes: Number(editingItem.estimatedDurationMinutes),
      });
      notify(result.message || "Treatment updated successfully.");
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const remove = async (item) => {
    if (!(await confirm({ title: `Remove ${item.name}?`, description: "This removes the treatment from the active catalog and new treatment plans.", confirmLabel: "Remove treatment", danger: true }))) return;
    try {
      const result = await api.treatments.remove(item._id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Clinical catalog"
        title="Treatments"
        description="Maintain the treatments clinicians can use in care plans."
        actions={
          <button
            className="button button-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={16} /> Add treatment
          </button>
        }
      />
      {showForm && (
        <SectionPanel title="New treatment">
          <form className="admin-form-grid" onSubmit={save}>
            <Field label="Name">
              <TextInput
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="Category">
              <TextInput
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              />
            </Field>
            <Field label="Default cost (INR)">
              <TextInput
                type="number"
                min="0"
                required
                value={form.defaultCost}
                onChange={(event) =>
                  setForm({ ...form, defaultCost: event.target.value })
                }
              />
            </Field>
            <Field label="Estimated minutes">
              <TextInput
                type="number"
                min="1"
                required
                value={form.estimatedDurationMinutes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    estimatedDurationMinutes: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Description" className="field-wide">
              <TextInput
                as="textarea"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </Field>
            <button className="button button-primary">Save treatment</button>
          </form>
        </SectionPanel>
      )}

      {editingItem && (
        <SectionPanel title={`Edit: ${editingItem.name}`}>
          <form className="admin-form-grid" onSubmit={update}>
            <Field label="Name">
              <TextInput
                required
                value={editingItem.name}
                onChange={(event) =>
                  setEditingItem({ ...editingItem, name: event.target.value })
                }
              />
            </Field>
            <Field label="Category">
              <TextInput
                value={editingItem.category || ""}
                onChange={(event) =>
                  setEditingItem({ ...editingItem, category: event.target.value })
                }
              />
            </Field>
            <Field label="Default cost (INR)">
              <TextInput
                type="number"
                min="0"
                required
                value={editingItem.defaultCost}
                onChange={(event) =>
                  setEditingItem({ ...editingItem, defaultCost: event.target.value })
                }
              />
            </Field>
            <Field label="Estimated minutes">
              <TextInput
                type="number"
                min="1"
                required
                value={editingItem.estimatedDurationMinutes}
                onChange={(event) =>
                  setEditingItem({
                    ...editingItem,
                    estimatedDurationMinutes: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Description" className="field-wide">
              <TextInput
                as="textarea"
                value={editingItem.description || ""}
                onChange={(event) =>
                  setEditingItem({ ...editingItem, description: event.target.value })
                }
              />
            </Field>
            <div style={{ display: "flex", gap: "0.5rem" }} className="field-wide">
              <button type="submit" className="button button-primary">Save changes</button>
              <button type="button" className="button button-quiet" onClick={() => setEditingItem(null)}>Cancel</button>
            </div>
          </form>
        </SectionPanel>
      )}

      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !items.length}
        emptyTitle="No treatments in catalog"
      >
        <div className="record-list">
          {items.map((item) => (
            <article className="record-row" key={item._id}>
              <span className="record-type-icon">
                <ClipboardList size={18} />
              </span>
              <div className="record-row-content">
                <strong>{item.name}</strong>
                <span>
                  {item.category || "Uncategorized"} ·{" "}
                  {item.estimatedDurationMinutes} min ·{" "}
                  {rupees(item.defaultCost)}
                </span>
                <p>{item.description}</p>
              </div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  className="button button-outline button-small"
                  onClick={() => setEditingItem(item)}
                >
                  Edit
                </button>
                <button
                  className="button button-quiet button-small"
                  onClick={() => remove(item)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </AsyncView>
      {dialog}
    </div>
  );
}

function CouponManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const query = useQuery({ queryKey: ["coupons"], queryFn: api.coupons.list });
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "flat",
    discountValue: "",
    maxDiscountAmount: "",
    minOrderAmount: 0,
    validUntil: "",
    usageLimit: "",
    usageLimitPerUser: 1,
  });
  const items = query.data?.data || [];
  const create = async (event) => {
    event.preventDefault();
    const body = {
      ...form,
      discountValue: Number(form.discountValue),
      maxDiscountAmount: form.maxDiscountAmount
        ? Number(form.maxDiscountAmount)
        : null,
      minOrderAmount: Number(form.minOrderAmount),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      usageLimitPerUser: Number(form.usageLimitPerUser),
    };
    try {
      const result = await api.coupons.create(body);
      notify(result.message);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const update = async (event) => {
    event.preventDefault();
    if (!editingCoupon) return;
    try {
      const result = await api.coupons.update(editingCoupon._id, {
        code: editingCoupon.code,
        description: editingCoupon.description,
        discountType: editingCoupon.discountType,
        discountValue: Number(editingCoupon.discountValue),
        minOrderAmount: Number(editingCoupon.minOrderAmount || 0),
        validUntil: editingCoupon.validUntil,
        isActive: editingCoupon.isActive,
      });
      notify(result.message || "Coupon updated successfully.");
      setEditingCoupon(null);
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const remove = async (item) => {
    if (!(await confirm({ title: `Delete coupon ${item.code}?`, description: "This permanently removes the coupon from the active coupon list.", confirmLabel: "Delete coupon", danger: true }))) return;
    try {
      const result = await api.coupons.remove(item._id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Offers & adjustments"
        title="Coupons"
        description="Manage coupon rules used during invoice creation."
        actions={
          <button
            className="button button-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={16} /> Create coupon
          </button>
        }
      />
      {showForm && (
        <SectionPanel title="New coupon">
          <form className="admin-form-grid" onSubmit={create}>
            <Field label="Code">
              <TextInput
                required
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Discount type">
              <TextInput
                as="select"
                value={form.discountType}
                onChange={(event) =>
                  setForm({ ...form, discountType: event.target.value })
                }
              >
                <option value="flat">Flat amount</option>
                <option value="percentage">Percentage</option>
              </TextInput>
            </Field>
            <Field label="Discount value">
              <TextInput
                type="number"
                min="0"
                required
                value={form.discountValue}
                onChange={(event) =>
                  setForm({ ...form, discountValue: event.target.value })
                }
              />
            </Field>
            <Field label="Valid until">
              <TextInput
                type="date"
                required
                value={form.validUntil}
                onChange={(event) =>
                  setForm({ ...form, validUntil: event.target.value })
                }
              />
            </Field>
            <Field label="Minimum order">
              <TextInput
                type="number"
                min="0"
                value={form.minOrderAmount}
                onChange={(event) =>
                  setForm({ ...form, minOrderAmount: event.target.value })
                }
              />
            </Field>
            <Field label="Usage limit">
              <TextInput
                type="number"
                min="1"
                value={form.usageLimit}
                onChange={(event) =>
                  setForm({ ...form, usageLimit: event.target.value })
                }
              />
            </Field>
            <Field label="Description" className="field-wide">
              <TextInput
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </Field>
            <button className="button button-primary">Save coupon</button>
          </form>
        </SectionPanel>
      )}

      {editingCoupon && (
        <SectionPanel title={`Edit Coupon: ${editingCoupon.code}`}>
          <form className="admin-form-grid" onSubmit={update}>
            <Field label="Code">
              <TextInput
                required
                value={editingCoupon.code}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Discount type">
              <TextInput
                as="select"
                value={editingCoupon.discountType}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, discountType: e.target.value })
                }
              >
                <option value="flat">Flat amount</option>
                <option value="percentage">Percentage</option>
              </TextInput>
            </Field>
            <Field label="Discount value">
              <TextInput
                type="number"
                min="0"
                required
                value={editingCoupon.discountValue}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, discountValue: e.target.value })
                }
              />
            </Field>
            <Field label="Valid until">
              <TextInput
                type="date"
                required
                value={editingCoupon.validUntil ? editingCoupon.validUntil.slice(0, 10) : ""}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, validUntil: e.target.value })
                }
              />
            </Field>
            <Field label="Minimum order">
              <TextInput
                type="number"
                min="0"
                value={editingCoupon.minOrderAmount || 0}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, minOrderAmount: e.target.value })
                }
              />
            </Field>
            <Field label="Status">
              <TextInput
                as="select"
                value={editingCoupon.isActive !== false ? "active" : "inactive"}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, isActive: e.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </TextInput>
            </Field>
            <Field label="Description" className="field-wide">
              <TextInput
                value={editingCoupon.description || ""}
                onChange={(e) =>
                  setEditingCoupon({ ...editingCoupon, description: e.target.value })
                }
              />
            </Field>
            <div style={{ display: "flex", gap: "0.5rem" }} className="field-wide">
              <button type="submit" className="button button-primary">Save changes</button>
              <button type="button" className="button button-quiet" onClick={() => setEditingCoupon(null)}>Cancel</button>
            </div>
          </form>
        </SectionPanel>
      )}

      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !items.length}
        emptyTitle="No coupons configured"
      >
        <div className="record-list">
          {items.map((coupon) => (
            <article className="record-row" key={coupon._id}>
              <span className="record-type-icon">
                <Wallet size={18} />
              </span>
              <div className="record-row-content">
                <strong>{coupon.code}</strong>
                <span>
                  {coupon.discountType === "percentage"
                    ? `${coupon.discountValue}%`
                    : rupees(coupon.discountValue)}{" "}
                  off · valid through {fmtDate(coupon.validUntil)}
                </span>
                <small>
                  {coupon.description || "No description"} · used{" "}
                  {coupon.usedCount || 0} times
                </small>
              </div>
              <StatusBadge value={coupon.isActive ? "active" : "inactive"} />
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  className="button button-outline button-small"
                  onClick={() => setEditingCoupon(coupon)}
                >
                  Edit
                </button>
                <button
                  className="button button-quiet button-small"
                  onClick={() => remove(coupon)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </AsyncView>
      <p className="muted-copy">
        Booking coupons are not enabled because the appointment API does not
        accept a coupon code. Coupons can be previewed for invoices only.
      </p>
      {dialog}
    </div>
  );
}

function ClinicManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const query = useQuery({
    queryKey: ["clinics"],
    queryFn: () => api.clinics.list(),
  });
  const [form, setForm] = useState({
    name: "",
    contactPhone: "",
    contactEmail: "",
    city: "",
    state: "",
    addressLine: "",
  });
  const [showForm, setShowForm] = useState(false);
  const clinics = query.data?.data || [];
  const create = async (event) => {
    event.preventDefault();
    try {
      const result = await api.clinics.create({
        name: form.name,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        address: {
          city: form.city,
          state: form.state,
          addressLine: form.addressLine,
        },
      });
      notify(result.message);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const deactivate = async (clinic) => {
    if (!(await confirm({ title: `Deactivate ${clinic.name}?`, description: "The clinic will no longer appear in active public clinic listings.", confirmLabel: "Deactivate clinic", danger: true }))) return;
    try {
      const result = await api.clinics.deactivate(clinic._id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Locations"
        title="Clinics"
        description="Manage active clinic branches and contact details."
        actions={
          <button
            className="button button-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <Building2 size={16} /> Add clinic
          </button>
        }
      />
      {showForm && (
        <SectionPanel title="New clinic">
          <form className="admin-form-grid" onSubmit={create}>
            {[
              ["name", "Name"],
              ["contactPhone", "Phone"],
              ["contactEmail", "Email"],
              ["city", "City"],
              ["state", "State"],
              ["addressLine", "Street address"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <TextInput
                  required={key === "name"}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
            <button className="button button-primary">Create clinic</button>
          </form>
        </SectionPanel>
      )}
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !clinics.length}
        emptyTitle="No active clinic branches"
      >
        <div className="record-list">
          {clinics.map((clinic) => (
            <article className="record-row" key={clinic._id}>
              <span className="record-type-icon">
                <Building2 size={18} />
              </span>
              <div className="record-row-content">
                <strong>{clinic.name}</strong>
                <span>
                  {[
                    clinic.address?.addressLine,
                    clinic.address?.city,
                    clinic.address?.state,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
                <small>
                  {clinic.contactPhone}{" "}
                  {clinic.contactEmail && `· ${clinic.contactEmail}`}
                </small>
              </div>
              <StatusBadge value={clinic.isActive ? "active" : "inactive"} />
              <button
                className="button button-quiet button-small"
                onClick={() => deactivate(clinic)}
              >
                Deactivate
              </button>
            </article>
          ))}
        </div>
      </AsyncView>
      <p className="muted-copy">
        Dentist assignment is available through the clinic assignment endpoint
        when a dentist profile ID is known.
      </p>
      {dialog}
    </div>
  );
}

function SystemStatusCard() {
  const query = useQuery({
    queryKey: ["admin-system-status"],
    queryFn: api.admin.systemStatus,
    retry: false,
    staleTime: 30000,
  });

  if (query.isError && (query.error?.status === 404 || query.error?.cause?.response?.status === 404)) {
    return null;
  }

  const status = query.data?.data;

  return (
    <SectionPanel
      title="System integration status"
      description="Live operational readiness for third-party integrations (Cloudinary, Brevo, Razorpay, Agora)."
      actions={
        <button
          type="button"
          className="button button-quiet button-small"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={14} className={query.isFetching ? "spin" : ""} /> {query.isFetching ? "Testing…" : "Re-test now"}
        </button>
      }
    >
      {query.isLoading ? (
        <p className="muted-copy">Checking server integrations…</p>
      ) : query.isError ? (
        <div className="notice notice-warn">
          System status check unavailable. (Pending backend deployment)
        </div>
      ) : status ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          {/* Uploads (Cloudinary) */}
          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <strong>Uploads (Cloudinary)</strong>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                fontSize: "0.8125rem", fontWeight: 600,
                color: status.uploads ? "#16a34a" : "#dc2626"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: status.uploads ? "#16a34a" : "#dc2626" }} />
                {status.uploads ? "Operational" : "Unavailable"}
              </span>
            </div>
            <small style={{ color: "var(--text-muted, #64748b)", display: "block" }}>
              Ping: <strong>{status.cloudinaryPing || "unknown"}</strong>
            </small>
            <small style={{ color: status.uploads ? "#16a34a" : "#b91c1c", display: "block", marginTop: "0.2rem" }}>
              {status.cloudinaryPing === "ok" && "Cloudinary connected and authenticated."}
              {status.cloudinaryPing === "not_configured" && "Missing required environment configuration."}
              {status.cloudinaryPing === "unauthorized" && "Credentials rejected. Check cloud name, key & secret."}
              {status.cloudinaryPing === "unreachable" && "Connection timed out during ping."}
            </small>
          </div>

          {/* Email (Brevo) */}
          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <strong>Email (Brevo)</strong>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                fontSize: "0.8125rem", fontWeight: 600,
                color: status.email ? "#16a34a" : "#dc2626"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: status.email ? "#16a34a" : "#dc2626" }} />
                {status.email ? "Operational" : "Not configured"}
              </span>
            </div>
            <small style={{ color: "var(--text-muted, #64748b)" }}>
              Transactional OTP & notices · {status.reasonCategory?.email || "ok"}
            </small>
          </div>

          {/* Payments (Razorpay) */}
          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <strong>Payments (Razorpay)</strong>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                fontSize: "0.8125rem", fontWeight: 600,
                color: status.payments ? "#16a34a" : "#dc2626"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: status.payments ? "#16a34a" : "#dc2626" }} />
                {status.payments ? "Operational" : "Not configured"}
              </span>
            </div>
            <small style={{ color: "var(--text-muted, #64748b)" }}>
              Checkout & refunds · {status.reasonCategory?.payments || "ok"}
            </small>
          </div>

          {/* Video (Agora) */}
          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <strong>Video (Agora)</strong>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                fontSize: "0.8125rem", fontWeight: 600,
                color: status.video ? "#16a34a" : "#dc2626"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: status.video ? "#16a34a" : "#dc2626" }} />
                {status.video ? "Operational" : "Not configured"}
              </span>
            </div>
            <small style={{ color: "var(--text-muted, #64748b)" }}>
              Teleconsultations · {status.reasonCategory?.video || "ok"}
            </small>
          </div>
        </div>
      ) : null}

      {status && !status.uploads && (
        <div className="notice notice-warn" style={{ marginTop: "1.2rem" }}>
          <strong>Cloudinary Upload Service Configuration Required:</strong>
          {status.missingCloudinaryVars?.length > 0 && (
            <div style={{ marginTop: "0.4rem", marginBottom: "0.4rem" }}>
              <strong>Missing or unconfigured variables: </strong>
              {status.missingCloudinaryVars.map((v) => (
                <code key={v} style={{ marginRight: "0.4rem", padding: "2px 6px", background: "#fef2f2", color: "#991b1b", borderRadius: "4px" }}>
                  {v}
                </code>
              ))}
            </div>
          )}
          {status.cloudinaryPing === "unauthorized" && (
            <p style={{ margin: "0.4rem 0", color: "#991b1b" }}>
              <strong>Authentication Failure:</strong> Cloudinary rejected the credentials. Verify that the cloud name is lowercase and case-sensitive (not the mixed-case name), and that the key and secret belong to that cloud environment with no surrounding spaces or quotes.
            </p>
          )}
          {status.cloudinaryPing === "unreachable" && (
            <p style={{ margin: "0.4rem 0", color: "#991b1b" }}>
              <strong>Connection Timeout:</strong> The ping timed out after 10 seconds. Click "Re-test now" once Render has fully spun up.
            </p>
          )}
          <ol style={{ margin: "0.4rem 0 0 1.2rem", padding: 0 }}>
            <li>In Render Dashboard → Environment, configure <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code>, and <code>CLOUDINARY_API_SECRET</code> without quotes, spaces, or Windows line endings.</li>
            <li>In Cloudinary Console → Settings → Security, ensure <em>PDF and ZIP files delivery</em> is checked.</li>
            <li>Rotate the previously exposed API credentials in Cloudinary Settings and save new values to Render.</li>
            <li>Click <strong>Re-test now</strong> above to verify that status changes to <strong>Operational</strong>.</li>
          </ol>
        </div>
      )}
    </SectionPanel>
  );
}

function ClinicSettingsPage() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const query = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: api.settings.get,
  });
  const [form, setForm] = useState(null);
  const data = form || query.data?.data || {};

  const save = async (event) => {
    event.preventDefault();
    const payload = {
      ...data,
      platformFee: Number(data.platformFee || 0),
      taxPercentage: Number(data.taxPercentage || 0),
      reminderHoursBefore: Number(data.reminderHoursBefore || 24),
      cancellationFullRefundHours: Number(data.cancellationFullRefundHours || 24),
      allowPayAtClinic: data.allowPayAtClinic !== false,
    };
    try {
      const result = await api.settings.update(payload);
      notify(result.message || "Clinic settings saved successfully.");
      setForm(result.data);
      queryClient.invalidateQueries({ queryKey: ["clinic-settings"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleLogoUpload = async (file, onProgress) => {
    const fd = new FormData();
    fd.append("photo", file);
    const result = await api.auth.updatePhoto(fd, onProgress);
    const newUrl = result.data?.url || result.data?.user?.photo?.url;
    if (newUrl) {
      setForm({ ...data, logoUrl: newUrl });
    }
    return result;
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <PageTitle
        eyebrow="Clinic configuration"
        title="Clinic settings"
        description="Configure public practice details, booking fees, policies, and clinic contact information."
      />
      <SystemStatusCard />
      <AsyncView query={query} empty={false}>
        <form onSubmit={save} style={{ display: "grid", gap: "1.5rem" }}>
          <SectionPanel title="General details & contact">
            <div className="admin-form-grid">
              <Field label="Clinic name">
                <TextInput
                  value={data.clinicName ?? ""}
                  onChange={(e) => setForm({ ...data, clinicName: e.target.value })}
                />
              </Field>
              <Field label="Phone number">
                <TextInput
                  type="tel"
                  value={data.contactPhone ?? ""}
                  onChange={(e) => setForm({ ...data, contactPhone: e.target.value })}
                />
              </Field>
              <Field label="Email address">
                <TextInput
                  type="email"
                  value={data.contactEmail ?? ""}
                  onChange={(e) => setForm({ ...data, contactEmail: e.target.value })}
                />
              </Field>
              <Field label="WhatsApp number">
                <TextInput
                  placeholder="e.g. +91 9876543210"
                  value={data.whatsappNumber ?? ""}
                  onChange={(e) => setForm({ ...data, whatsappNumber: e.target.value })}
                />
              </Field>
              <Field label="Opening hours">
                <TextInput
                  placeholder="e.g. Mon - Sat: 9:00 AM - 7:00 PM (Closed Sundays)"
                  value={data.openingHours ?? ""}
                  onChange={(e) => setForm({ ...data, openingHours: e.target.value })}
                />
              </Field>
              <Field label="Logo image URL">
                <TextInput
                  placeholder="https://…"
                  value={data.logoUrl ?? ""}
                  onChange={(e) => setForm({ ...data, logoUrl: e.target.value })}
                />
              </Field>

              <div className="field-wide" style={{ marginTop: "0.5rem" }}>
                <label className="field-label" style={{ display: "block", marginBottom: "0.4rem" }}>
                  Upload Clinic Logo (PNG/WEBP/JPG up to 5 MB)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                  {data.logoUrl && (
                    <img
                      src={data.logoUrl}
                      alt="Clinic Logo Preview"
                      style={{ height: "48px", maxWidth: "160px", objectFit: "contain", border: "1px solid #dbe5e1", borderRadius: "4px", padding: "4px" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <FileUpload
                      accept="image/jpeg,image/png,image/webp"
                      maxSizeMB={5}
                      label="Upload new clinic logo"
                      onUpload={handleLogoUpload}
                      onSuccess={() => notify("Logo uploaded. Click Save All Settings below.")}
                    />
                  </div>
                </div>
              </div>

              <Field label="Google Maps link" className="field-wide">
                <TextInput
                  placeholder="https://maps.google.com/…"
                  value={data.mapUrl ?? ""}
                  onChange={(e) => setForm({ ...data, mapUrl: e.target.value })}
                />
              </Field>
              <Field label="Clinic address" className="field-wide">
                <TextInput
                  value={data.address ?? ""}
                  onChange={(e) => setForm({ ...data, address: e.target.value })}
                />
              </Field>
            </div>
          </SectionPanel>

          <SectionPanel title="Fees & booking policies">
            <div className="admin-form-grid">
              <Field label="Platform fee (INR)">
                <TextInput
                  type="number"
                  min="0"
                  value={data.platformFee ?? 0}
                  onChange={(e) => setForm({ ...data, platformFee: e.target.value })}
                />
              </Field>
              <Field label="Tax percentage (%)">
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  value={data.taxPercentage ?? 0}
                  onChange={(e) => setForm({ ...data, taxPercentage: e.target.value })}
                />
              </Field>
              <Field label="Reminder lead time (hours before)">
                <TextInput
                  type="number"
                  min="1"
                  value={data.reminderHoursBefore ?? 24}
                  onChange={(e) => setForm({ ...data, reminderHoursBefore: e.target.value })}
                />
              </Field>
              <Field label="Full refund window (hours before)">
                <TextInput
                  type="number"
                  min="0"
                  value={data.cancellationFullRefundHours ?? 24}
                  onChange={(e) => setForm({ ...data, cancellationFullRefundHours: e.target.value })}
                />
              </Field>
              <div className="field-wide" style={{ marginTop: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={data.allowPayAtClinic !== false}
                    onChange={(e) => setForm({ ...data, allowPayAtClinic: e.target.checked })}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <span>
                    <strong>Allow 'Pay at clinic' bookings:</strong> Patients can confirm bookings online and settle fees at reception upon arrival.
                  </span>
                </label>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel title="About practice & patient notices">
            <div className="admin-form-grid">
              <Field label="About the practice summary" className="field-wide">
                <TextInput
                  as="textarea"
                  rows={4}
                  placeholder="Displayed on public homepage and about page"
                  value={data.aboutText ?? ""}
                  onChange={(e) => setForm({ ...data, aboutText: e.target.value })}
                />
              </Field>
              <Field label="Privacy policy" className="field-wide">
                <TextInput
                  as="textarea"
                  rows={4}
                  placeholder="Plain text privacy policy terms"
                  value={data.privacyPolicy ?? ""}
                  onChange={(e) => setForm({ ...data, privacyPolicy: e.target.value })}
                />
              </Field>
              <Field label="Terms of service" className="field-wide">
                <TextInput
                  as="textarea"
                  rows={4}
                  placeholder="Plain text clinic terms of service"
                  value={data.termsOfService ?? ""}
                  onChange={(e) => setForm({ ...data, termsOfService: e.target.value })}
                />
              </Field>
            </div>
          </SectionPanel>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="button button-primary">
              Save all settings <Check size={15} />
            </button>
          </div>
        </form>
      </AsyncView>
    </div>
  );
}

function PaymentManagement() {
  const [activeTab, setActiveTab] = useState("invoices"); // "invoices" | "payments"
  
  // Payment states
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);
  
  // Invoice states
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [markPaidTarget, setMarkPaidTarget] = useState(null);
  const [markPaidMethod, setMarkPaidMethod] = useState("cash");
  const [markPaidBusy, setMarkPaidBusy] = useState(false);

  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();

  const query = useQuery({
    queryKey: ["admin-payments", status, page],
    queryFn: () =>
      api.payments.all({
        status: status || undefined,
        page,
        limit: 20,
      }),
  });

  const invoicesQuery = useQuery({
    queryKey: ["admin-invoices", invoiceStatus, invoiceSearch, invoicePage],
    queryFn: () =>
      api.invoices.all({
        status: invoiceStatus || undefined,
        search: invoiceSearch.trim() || undefined,
        page: invoicePage,
        limit: 20,
      }),
  });

  const payments = query.data?.data || [];
  const meta = query.data?.meta || { total: 0, page: 1, limit: 20 };

  const invoices = invoicesQuery.data?.data || [];
  const invoiceMeta = invoicesQuery.data?.meta || { total: 0, page: 1, limit: 20 };

  const handleRefund = async (event) => {
    event.preventDefault();
    if (!refundTarget) return;

    const remaining = Math.max(
      0,
      refundTarget.amount - Number(refundTarget.refund?.amount || 0)
    );
    const amountNum = refundAmount ? Number(refundAmount) : remaining;

    if (amountNum <= 0 || amountNum > remaining) {
      notify(`Refund amount must be between ₹1 and ₹${remaining}.`, "error");
      return;
    }

    const confirmed = await confirm({
      title: `Process refund of ${rupees(amountNum)}?`,
      description: `This will issue a refund via Razorpay for payment ${refundTarget.razorpayPaymentId || refundTarget._id}. This action cannot be reversed.`,
      confirmLabel: "Confirm refund",
    });

    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await api.payments.refund(refundTarget._id, {
        amount: amountNum,
        reason: refundReason || "Requested by admin",
      });
      notify(result.message || "Refund processed.");
      setRefundTarget(null);
      setRefundAmount("");
      setRefundReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleMarkInvoicePaid = async (event) => {
    event.preventDefault();
    if (!markPaidTarget) return;
    setMarkPaidBusy(true);
    try {
      const res = await api.invoices.markPaid(markPaidTarget._id, markPaidMethod);
      notify(res.message || "Invoice marked as paid.");
      setMarkPaidTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setMarkPaidBusy(false);
    }
  };

  const handleExportInvoicesCsv = () => {
    const headers = [
      "Invoice #",
      "Patient",
      "Phone",
      "Date",
      "Payment Method",
      "Subtotal",
      "Discount",
      "Tax",
      "Total Amount",
      "Paid Amount",
      "Balance Due",
      "Status",
    ];
    const rows = invoices.map((inv) => [
      inv.invoiceNumber || inv._id,
      inv.patient?.name || "Patient",
      inv.patient?.phone || "",
      fmtDate(inv.createdAt),
      inv.paymentMethod || "N/A",
      inv.subtotal || 0,
      inv.discountAmount || 0,
      inv.taxAmount || 0,
      inv.totalAmount || 0,
      inv.paidAmount || 0,
      Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0)),
      inv.status || "issued",
    ]);
    exportToCsv("invoices.csv", headers, rows);
  };

  const handleExportPaymentsCsv = () => {
    const headers = [
      "Date",
      "Patient",
      "Amount",
      "Method",
      "Status",
      "Razorpay Order ID",
      "Razorpay Payment ID",
      "Refund Amount",
      "Refund Reason",
    ];
    const rows = payments.map((p) => [
      fmtDate(p.createdAt),
      p.patient?.name || "Unknown Patient",
      p.amount || 0,
      p.method || "online",
      p.status || "paid",
      p.razorpayOrderId || "",
      p.razorpayPaymentId || "",
      p.refund?.amount || 0,
      p.refund?.reason || "",
    ]);
    exportToCsv("payments.csv", headers, rows);
  };

  return (
    <div>
      <PageTitle
        eyebrow="Financial operations"
        title="Invoices & Payments"
        description="Monitor clinic billing, inspect invoice status, issue refunds, and reconcile revenue."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {activeTab === "invoices" ? (
              <button
                type="button"
                className="button button-outline"
                onClick={handleExportInvoicesCsv}
              >
                <Download size={15} /> Export Invoices CSV
              </button>
            ) : (
              <button
                type="button"
                className="button button-outline"
                onClick={handleExportPaymentsCsv}
              >
                <Download size={15} /> Export Payments CSV
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid #e2e8f0", marginBottom: "1.2rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          style={{
            padding: "0.6rem 1.2rem",
            fontWeight: 600,
            fontSize: "0.9rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "invoices" ? "2px solid #137a76" : "2px solid transparent",
            color: activeTab === "invoices" ? "#137a76" : "#64748b",
          }}
        >
          Invoices ({invoiceMeta.total || invoices.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          style={{
            padding: "0.6rem 1.2rem",
            fontWeight: 600,
            fontSize: "0.9rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "payments" ? "2px solid #137a76" : "2px solid transparent",
            color: activeTab === "payments" ? "#137a76" : "#64748b",
          }}
        >
          Online Payments & Refunds ({meta.total || payments.length})
        </button>
      </div>

      {activeTab === "invoices" && (
        <>
          <div className="filter-bar" style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <Field label="Invoice status">
              <TextInput
                as="select"
                value={invoiceStatus}
                onChange={(e) => {
                  setInvoiceStatus(e.target.value);
                  setInvoicePage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="issued">Issued (Unpaid)</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="void">Void</option>
                <option value="cancelled">Cancelled</option>
              </TextInput>
            </Field>

            <Field label="Search patient or invoice #">
              <TextInput
                placeholder="e.g. INV-1001 or Patient Name"
                value={invoiceSearch}
                onChange={(e) => {
                  setInvoiceSearch(e.target.value);
                  setInvoicePage(1);
                }}
              />
            </Field>
          </div>

          <SectionPanel title="Invoices ledger">
            <AsyncView
              query={invoicesQuery}
              empty={!invoicesQuery.isLoading && !invoicesQuery.isError && !invoices.length}
              emptyTitle="No invoices match your search criteria"
            >
              <div className="record-list">
                {invoices.map((inv) => {
                  const balanceDue = Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0));
                  const isPaid = inv.status === "paid" || balanceDue === 0;
                  return (
                    <article className="record-row" key={inv._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                        <span className="record-type-icon">
                          <FileText size={17} />
                        </span>
                        <div className="record-row-content">
                          <strong>
                            {inv.invoiceNumber || inv._id.slice(-8).toUpperCase()} · {inv.patient?.name || "Patient"}
                          </strong>
                          <span>
                            {fmtDate(inv.createdAt)} · Total: {rupees(inv.totalAmount)}
                            {inv.paidAmount > 0 && ` · Paid: ${rupees(inv.paidAmount)}`}
                            {!isPaid && ` · Due: ${rupees(balanceDue)}`}
                            {inv.paymentMethod && ` · Method: ${inv.paymentMethod.toUpperCase()}`}
                          </span>
                        </div>
                      </div>

                      <div className="record-row-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <StatusBadge value={inv.status} />
                        <button
                          type="button"
                          className="button button-outline button-small"
                          title="Download Invoice PDF"
                          onClick={() => downloadPdf(`/invoices/${inv._id}/pdf`, `invoice-${inv.invoiceNumber || inv._id}.pdf`)}
                        >
                          <Download size={13} /> PDF
                        </button>
                        {!isPaid && (
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={() => {
                              setMarkPaidTarget(inv);
                              setMarkPaidMethod("cash");
                            }}
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </AsyncView>

            {invoiceMeta.total > 20 && (
              <div className="pagination">
                <button
                  className="button button-outline button-small"
                  disabled={invoicePage <= 1}
                  onClick={() => setInvoicePage((val) => val - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {invoicePage} of {Math.ceil(invoiceMeta.total / 20)}
                </span>
                <button
                  className="button button-outline button-small"
                  disabled={invoicePage >= Math.ceil(invoiceMeta.total / 20)}
                  onClick={() => setInvoicePage((val) => val + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </SectionPanel>

          {/* Mark Paid Modal */}
          {markPaidTarget && (
            <div className="modal-backdrop" onClick={() => setMarkPaidTarget(null)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px", width: "95%" }}>
                <div className="modal-header">
                  <h2>Mark Invoice as Paid</h2>
                  <button type="button" className="icon-button" onClick={() => setMarkPaidTarget(null)}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleMarkInvoicePaid} className="stack-form" style={{ padding: "1.2rem" }}>
                  <p style={{ fontSize: "0.9rem", color: "#475569" }}>
                    Record full payment for invoice <strong>{markPaidTarget.invoiceNumber || markPaidTarget._id}</strong> for <strong>{markPaidTarget.patient?.name || "Patient"}</strong>.
                  </p>
                  <div style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "6px", marginBottom: "0.8rem", fontSize: "0.9rem" }}>
                    <div><strong>Total Amount: </strong>{rupees(markPaidTarget.totalAmount)}</div>
                    <div><strong>Balance Due: </strong><span style={{ color: "#e76f51", fontWeight: 600 }}>{rupees(Math.max(0, (markPaidTarget.totalAmount || 0) - (markPaidTarget.paidAmount || 0)))}</span></div>
                  </div>
                  <Field label="Payment Method *">
                    <TextInput
                      as="select"
                      value={markPaidMethod}
                      onChange={(e) => setMarkPaidMethod(e.target.value)}
                    >
                      <option value="cash">Cash at desk</option>
                      <option value="card">Credit/Debit Card (POS)</option>
                      <option value="upi">UPI / QR Code</option>
                      <option value="bank_transfer">Direct Bank Transfer</option>
                    </TextInput>
                  </Field>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <button type="button" className="button button-quiet" onClick={() => setMarkPaidTarget(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="button button-primary" disabled={markPaidBusy}>
                      {markPaidBusy ? "Recording…" : "Confirm Payment"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "payments" && (
        <>
          <div className="filter-bar">
            <Field label="Payment status">
              <TextInput
                as="select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="partially_refunded">Partially refunded</option>
                <option value="created">Created</option>
                <option value="failed">Failed</option>
              </TextInput>
            </Field>
          </div>

          {refundTarget && (
            <SectionPanel
              title={`Issue refund for ${refundTarget.patient?.name || "Patient"}`}
              description={`Payment amount: ${rupees(refundTarget.amount)} · Available to refund: ${rupees(
                Math.max(
                  0,
                  refundTarget.amount - Number(refundTarget.refund?.amount || 0)
                )
              )}`}
              actions={
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => {
                    setRefundTarget(null);
                    setRefundAmount("");
                    setRefundReason("");
                  }}
                >
                  Cancel
                </button>
              }
            >
              <form className="inline-form" onSubmit={handleRefund}>
                <Field label="Refund amount (leave blank for full)">
                  <TextInput
                    type="number"
                    min="1"
                    max={Math.max(
                      0,
                      refundTarget.amount - Number(refundTarget.refund?.amount || 0)
                    )}
                    placeholder={`Max ${Math.max(
                      0,
                      refundTarget.amount - Number(refundTarget.refund?.amount || 0)
                    )}`}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </Field>
                <Field label="Reason">
                  <TextInput
                    placeholder="e.g. Appointment cancelled by patient"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                  />
                </Field>
                <button
                  disabled={busy}
                  type="submit"
                  className="button button-primary"
                >
                  {busy ? "Processing…" : "Submit refund"}
                </button>
              </form>
            </SectionPanel>
          )}

          <SectionPanel title="Payment records">
            <AsyncView
              query={query}
              empty={!query.isLoading && !query.isError && !payments.length}
              emptyTitle="No payments found"
            >
              <div className="record-list">
                {payments.map((payment) => {
                  const remaining = Math.max(
                    0,
                    payment.amount - Number(payment.refund?.amount || 0)
                  );
                  const canRefund =
                    ["paid", "partially_refunded"].includes(payment.status) &&
                    remaining > 0;

                  return (
                    <article className="record-row" key={payment._id}>
                      <span className="record-type-icon">
                        <Wallet size={17} />
                      </span>
                      <div className="record-row-content">
                        <strong>
                          {rupees(payment.amount)} · {payment.patient?.name || "Unknown patient"}
                        </strong>
                        <span>
                          {fmtDate(payment.createdAt)} · {payment.method ? `Method: ${payment.method} · ` : ""}Order: {payment.razorpayOrderId}
                          {payment.razorpayPaymentId ? ` · Ref: ${payment.razorpayPaymentId}` : ""}
                        </span>
                        {payment.refund?.amount > 0 && (
                          <small style={{ color: "var(--color-primary)" }}>
                            Refunded {rupees(payment.refund.amount)} ({payment.refund.reason || "Clinic refund"})
                          </small>
                        )}
                      </div>
                      <div className="record-row-actions">
                        <StatusBadge value={payment.status} />
                        {canRefund && (
                          <button
                            type="button"
                            className="button button-outline button-small"
                            onClick={() => {
                              setRefundTarget(payment);
                              setRefundAmount("");
                              setRefundReason("");
                            }}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </AsyncView>

            {meta.total > 20 && (
              <div className="pagination">
                <button
                  className="button button-outline button-small"
                  disabled={page <= 1}
                  onClick={() => setPage((val) => val - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.ceil(meta.total / 20)}
                </span>
                <button
                  className="button button-outline button-small"
                  disabled={page >= Math.ceil(meta.total / 20)}
                  onClick={() => setPage((val) => val + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </SectionPanel>
        </>
      )}

      {dialog}
    </div>
  );
}

export function AdminPage({ page }) {
  if (page === "dashboard") return <AdminDashboard />;
  if (page === "appointments") return <AdminAppointments />;
  if (page === "dentists") return <DentistManagement />;
  if (page === "staff") return <StaffManagement />;
  if (page === "patients") return <PatientDirectory />;
  if (page === "treatments") return <TreatmentCatalog />;
  if (page === "coupons") return <CouponManagement />;
  if (page === "clinics") return <ClinicManagement />;
  if (page === "settings") return <ClinicSettingsPage />;
  if (page === "payments") return <PaymentManagement />;
  if (page === "reviews") return <AdminReviews />;
  return <EmptyState title="This administration view is not available" />;
}
