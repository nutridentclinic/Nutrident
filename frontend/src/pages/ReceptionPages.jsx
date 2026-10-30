import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  FileText,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api, downloadPdf } from "../api/domains.js";
import { usePrimaryDentist } from "../hooks/usePrimaryDentist.js";
import { fetchPrimarySlotsWithFallback } from "../api/capabilities.js";
import { clinicDate, isPastSlot } from "../utils/booking.js";
import { PatientDirectory } from "./TeamPages.jsx";
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
import { formatClinicDate } from "../utils/formatDate.js";

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const fmtDate = (date) => (date ? formatClinicDate(date) : "Date not set");

function exportToCsv(filename, headers, rows) {
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReceptionDashboard() {
  const stats = useQuery({
    queryKey: ["dashboard", "receptionist"],
    queryFn: async () => {
      try {
        return await api.dashboard.receptionist();
      } catch (error) {
        if (error.status !== 404) throw error;
        const [patients, dentists] = await Promise.all([
          api.patients.list({ limit: 1 }),
          api.dentists.list({ limit: 100 }),
        ]);
        return {
          data: {
            totalPatients: patients.meta?.total ?? null,
            availableDentists: dentists.data?.length ?? null,
          },
          limited: true,
        };
      }
    },
  });
  const summary = stats.data?.data || {};
  return (
    <div>
      <PageTitle
        eyebrow="Front desk"
        title="Clinic operations"
        description="Patient lookup, queue check-in and invoice tools for today’s work."
      />
      <div className="dashboard-metrics">
        <article>
          <span className="metric-icon metric-teal">
            <Users size={18} />
          </span>
          <small>Patient accounts</small>
          <strong>{summary.totalPatients ?? "—"}</strong>
        </article>
        <article>
          <span className="metric-icon metric-lime">
            <CalendarDays size={18} />
          </span>
          <small>Today’s appointments</small>
          <strong>{summary.appointmentsToday ?? "—"}</strong>
        </article>
        <article>
          <span className="metric-icon metric-blue">
            <Activity size={18} />
          </span>
          <small>Waiting in queue</small>
          <strong>{summary.waitingQueue ?? "—"}</strong>
        </article>
        <article>
          <span className="metric-icon metric-coral">
            <Check size={18} />
          </span>
          <small>Confirmed today</small>
          <strong>{summary.confirmedToday ?? "—"}</strong>
        </article>
      </div>
      <div className="reception-shortcuts">
        <Link to="/reception/queue">
          <span>
            <Activity size={19} />
          </span>
          <strong>Live queue</strong>
          <small>Check in, call and complete visits</small>
          <ArrowRight size={16} />
        </Link>
        <Link to="/reception/patients">
          <span>
            <Users size={19} />
          </span>
          <strong>Patient directory</strong>
          <small>Search existing patient accounts</small>
          <ArrowRight size={16} />
        </Link>
        <Link to="/reception/invoices">
          <span>
            <Wallet size={19} />
          </span>
          <strong>Create an invoice</strong>
          <small>Server-calculated tax and totals</small>
          <ArrowRight size={16} />
        </Link>
      </div>
      {stats.data?.limited && (
        <div className="notice notice-info">
          The receptionist dashboard endpoint is not available; showing only
          counts returned by the existing patient and dentist APIs.
        </div>
      )}
    </div>
  );
}

export function AppointmentLookup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openIdParam = searchParams.get("open") || "";
  const [id, setId] = useState(openIdParam);
  const [lookup, setLookup] = useState(openIdParam);

  // Filters state
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [mode, setMode] = useState("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("-date -startTime");
  const [page, setPage] = useState(1);
  const [activeChip, setActiveChip] = useState("all");

  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const primary = usePrimaryDentist();

  // Sync openParam
  useEffect(() => {
    const openParam = searchParams.get("open");
    if (openParam && openParam !== lookup) {
      setLookup(openParam);
      setId(openParam);
    }
  }, [searchParams]);

  // Staff booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [bookingDate, setBookingDate] = useState(clinicDate());
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingMode, setBookingMode] = useState("in-clinic");
  const [bookingReason, setBookingReason] = useState("");
  const [paymentChoice, setPaymentChoice] = useState("pay-at-clinic");

  // Walk-in patient registration state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [walkInDuplicate, setWalkInDuplicate] = useState(null);
  const [walkInForm, setWalkInForm] = useState({
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "other",
    address: "",
  });

  const query = useQuery({
    queryKey: ["appointment", "lookup", lookup],
    queryFn: () => api.appointments.detail(lookup),
    enabled: !!lookup,
    retry: false,
  });

  const listQuery = useQuery({
    queryKey: ["appointments", "reception", from, to, status, paymentStatus, mode, search, sortOrder, page],
    queryFn: async () => {
      try {
        return await api.appointments.all({
          from: from || undefined,
          to: to || undefined,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          mode: mode || undefined,
          search: search.trim() || undefined,
          sort: sortOrder,
          page,
          limit: 20,
        });
      } catch (error) {
        if (error.status === 404) return { data: [], meta: { total: 0 } };
        throw error;
      }
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: () => api.settings.get(),
  });
  const cancellationHours = settingsQuery.data?.data?.cancellationFullRefundHours ?? 24;
  const refundPolicyText = "Full refund is available up to " + cancellationHours + " hours before the appointment per clinic policy.";

  const applyChip = (chip) => {
    setActiveChip(chip);
    setPage(1);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (chip === "all") {
      setFrom("");
      setTo("");
    } else if (chip === "today") {
      setFrom(todayStr);
      setTo(todayStr);
    } else if (chip === "tomorrow") {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      const tomStr = tom.toISOString().slice(0, 10);
      setFrom(tomStr);
      setTo(tomStr);
    } else if (chip === "this-week") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setFrom(mon.toISOString().slice(0, 10));
      setTo(sun.toISOString().slice(0, 10));
    } else if (chip === "past") {
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      setFrom("");
      setTo(yest.toISOString().slice(0, 10));
    }
  };

  // Slots for staff booking modal
  const staffSlotsQuery = useQuery({
    queryKey: ["staff-booking-slots", bookingDate, primary.dentistId],
    queryFn: () => fetchPrimarySlotsWithFallback(bookingDate, primary.dentistId),
    enabled: showBookingModal && !!bookingDate,
  });
  const availableSlots = (staffSlotsQuery.data || []).filter(
    (slot) => !isPastSlot(bookingDate, slot.startTime),
  );

  const patientSearchResults = useQuery({
    queryKey: ["patient-search", patientSearchTerm],
    queryFn: () => api.patients.list({ search: patientSearchTerm, limit: 8 }),
    enabled: showBookingModal && patientSearchTerm.length >= 2,
  });

  const handleRegisterWalkIn = async (e) => {
    e.preventDefault();
    setWalkInBusy(true);
    setWalkInDuplicate(null);
    try {
      const payload = {
        name: walkInForm.name.trim(),
        phone: walkInForm.phone.trim(),
        email: walkInForm.email.trim() || undefined,
        dateOfBirth: walkInForm.dateOfBirth || undefined,
        gender: walkInForm.gender || "other",
        address: walkInForm.address.trim() || undefined,
      };
      const res = await api.patients.createByStaff(payload);
      notify(res.message || "Walk-in patient registered.");
      const newPatient = res.data?.patient || res.data;
      setSelectedPatient(newPatient);
      setShowWalkInModal(false);
      setWalkInForm({
        name: "",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "other",
        address: "",
      });
      queryClient.invalidateQueries({ queryKey: ["patient-search"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err) {
      if (err.status === 409 && (err.data?.existingUser || err.data?.existingPatient)) {
        setWalkInDuplicate(err.data.existingPatient || err.data.existingUser);
      } else {
        notify(err.message || "Failed to register walk-in patient.", "error");
      }
    } finally {
      setWalkInBusy(false);
    }
  };

  const handleStaffBooking = async (e) => {
    e.preventDefault();
    const patientId = selectedPatient?._id || selectedPatient?.user?._id;
    if (!patientId) {
      notify("Select a patient for the appointment.", "error");
      return;
    }
    if (!bookingSlot) {
      notify("Select an available appointment time slot.", "error");
      return;
    }
    setBookingBusy(true);
    try {
      const payload = {
        patientId,
        dentistId: primary.dentistId || undefined,
        date: bookingDate,
        startTime: bookingSlot,
        mode: bookingMode,
        reasonForVisit: bookingReason,
        paymentChoice,
      };

      const res = await api.appointments.createStaff(payload);
      notify(res.message || "Appointment booked and confirmed.", "success");
      setShowBookingModal(false);
      setSelectedPatient(null);
      setBookingSlot("");
      setBookingReason("");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      listQuery.refetch();
    } catch (err) {
      notify(err.message || "Failed to book staff appointment.", "error");
    } finally {
      setBookingBusy(false);
    }
  };

  const item = query.data?.data;
  const appointments = listQuery.data?.data || [];
  const totalCount = listQuery.data?.meta?.total ?? appointments.length;

  const handleExportFilteredCsv = async () => {
    try {
      const res = await api.appointments.all({
        from: from || undefined,
        to: to || undefined,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        mode: mode || undefined,
        search: search.trim() || undefined,
        sort: sortOrder,
        page: 1,
        limit: 1000,
      });
      const items = res.data || [];
      const headers = [
        "Appointment ID",
        "Date",
        "Time",
        "Patient Name",
        "Phone",
        "Doctor",
        "Mode",
        "Status",
        "Payment",
        "Amount (Rs.)",
        "Reason",
      ];
      const rows = items.map((a) => [
        a._id,
        fmtDate(a.date),
        a.startTime,
        a.patient?.name || "Patient",
        a.patient?.phone || "",
        a.dentist?.user?.name ? ("Dr. " + a.dentist.user.name) : "Clinic Doctor",
        a.mode,
        a.status,
        a.paymentStatus,
        a.fees?.totalAmount || 0,
        a.reasonForVisit || "",
      ]);
      exportToCsv("appointments-" + (new Date().toISOString().slice(0, 10)) + ".csv", headers, rows);
      notify("Exported " + items.length + " appointments to CSV.");
    } catch (err) {
      notify(err.message || "Failed to export CSV.", "error");
    }
  };

  const act = async (name) => {
    if (name === "confirm" && item?.paymentStatus !== "paid") {
      const approved = await confirm({
        title: "Confirm an unpaid appointment?",
        description: "This uses the explicit staff override and does not mark payment as paid.",
        confirmLabel: "Override and confirm",
        cancelLabel: "Keep appointment",
      });
      if (!approved) return;
    }
    if (name === "noShow") {
      const approved = await confirm({
        title: "Mark this visit as no-show?",
        description: "This appointment for " + (item?.patient?.name || "Patient") + " on " + fmtDate(item?.date) + " at " + item?.startTime + " will be recorded as a no-show.",
        confirmLabel: "Mark no-show",
        cancelLabel: "Keep appointment",
        danger: true,
      });
      if (!approved) return;
    }
    if (name === "complete") {
      const approved = await confirm({
        title: "Complete appointment?",
        message: `Mark ${item?.patient?.name || "patient"}'s visit as completed? This will generate the invoice and visit summary.`,
        confirmText: "Yes, complete visit",
        cancelText: "Cancel",
      });
      if (!approved) return;
      try {
        const result = await api.appointments.complete(lookup, { completionConfirmedByDentist: true });
        notify(result.message || "Appointment completed.");
        queryClient.invalidateQueries({ queryKey: ["appointment", "lookup", lookup] });
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        listQuery.refetch();
      } catch (error) {
        notify(error.message, "error");
      }
      return;
    }

    if (name === "cancel") {
      let cancelReason = "Cancelled by clinic staff";
      const approved = await confirm({
        title: "Cancel this appointment?",
        description: "Patient: " + (item?.patient?.name || "Patient") + " · " + fmtDate(item?.date) + " at " + item?.startTime + ". " + refundPolicyText,
        confirmLabel: "Yes, cancel appointment",
        cancelLabel: "Keep appointment",
        danger: true,
        children: (
          <div style={{ marginTop: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
              Cancellation reason (optional)
            </label>
            <textarea
              className="input"
              rows={2}
              defaultValue="Cancelled by clinic staff"
              onChange={(e) => {
                cancelReason = e.target.value;
              }}
              placeholder="Reason for cancellation…"
            />
          </div>
        ),
      });
      if (!approved) return;
      try {
        const result = await api.appointments.cancel(lookup, cancelReason);
        notify(result.message);
        queryClient.invalidateQueries({ queryKey: ["appointment", "lookup", lookup] });
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        listQuery.refetch();
      } catch (error) {
        notify(error.message, "error");
      }
      return;
    }

    try {
      const result = name === "confirm"
        ? await api.appointments.confirm(lookup, { staffOverride: item?.paymentStatus !== "paid" })
        : await api.appointments[name](lookup);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["appointment", "lookup", lookup] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      listQuery.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Front desk support"
        title="Appointments lookup"
        description="Search and manage all clinic visits across all dates, review details, or book staff appointments."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="button button-outline"
              onClick={handleExportFilteredCsv}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowBookingModal(true)}
            >
              <Plus size={15} /> New appointment
            </button>
          </div>
        }
      />

      {/* Unified Search & Quick Filter Chips */}
      <div style={{ marginBottom: "1rem" }}>
        <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.6rem", alignItems: "flex-end" }}>
          <Field label="Unified search">
            <TextInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                const term = event.target.value.trim();
                if (/^[0-9a-fA-F]{24}$/.test(term)) {
                  setLookup(term);
                  setId(term);
                }
              }}
              placeholder="Search by patient name, phone, email, appointment ID, reason, or invoice #…"
            />
          </Field>
          <Field label="Sort order">
            <select
              className="input"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setPage(1);
              }}
            >
              <option value="-date -startTime">Upcoming / Newest first</option>
              <option value="date startTime">Oldest first</option>
            </select>
          </Field>
        </div>

        {/* Date chips */}
        <div className="filter-chips" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
          {[
            { id: "all", label: "All dates" },
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "this-week", label: "This week" },
            { id: "past", label: "Past" },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={"button button-small " + (activeChip === chip.id ? "button-primary" : "button-outline")}
              onClick={() => applyChip(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-parameter Filters */}
      <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem", marginBottom: "1.2rem" }}>
        <Field label="From date">
          <TextInput
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setActiveChip("custom");
              setPage(1);
            }}
          />
        </Field>
        <Field label="To date">
          <TextInput
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setActiveChip("custom");
              setPage(1);
            }}
          />
        </Field>
        <Field label="Status">
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked-in">Checked In</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No-Show</option>
          </select>
        </Field>
        <Field label="Payment">
          <select
            className="input"
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All payment statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </Field>
        <Field label="Mode">
          <select
            className="input"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All modes</option>
            <option value="in-clinic">In-clinic</option>
          </select>
        </Field>
      </div>

      {/* Appointment Detail Panel (if selected) */}
      {lookup && (
        <div style={{ marginBottom: "1.5rem" }}>
          {query.isLoading ? (
            <div className="section-panel" style={{ padding: "1.5rem", textAlign: "center" }}>
              Loading appointment details…
            </div>
          ) : query.isError || !item ? (
            <div className="notice notice-warn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>This appointment ({lookup}) is no longer available or was not found.</div>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => {
                  setLookup("");
                  setId("");
                  setSearchParams({});
                }}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <SectionPanel
              title={"Visit with Dr. " + (item.dentist?.user?.name || "Dentist")}
              description={fmtDate(item.date) + " · " + item.startTime + " · " + (item.patient?.name || "Patient") + " (" + (item.patient?.phone || "No phone") + ")"}
              actions={
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close details"
                  onClick={() => {
                    setLookup("");
                    setId("");
                    setSearchParams({});
                  }}
                >
                  <X size={18} />
                </button>
              }
            >
              <div className="appointment-lookup-details" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", padding: "0.8rem 0" }}>
                <div>
                  <small style={{ color: "#666", display: "block" }}>Visit type</small>
                  <strong>{item.mode}</strong>
                </div>
                <div>
                  <small style={{ color: "#666", display: "block" }}>Payment</small>
                  <StatusBadge value={item.paymentStatus} />
                </div>
                <div>
                  <small style={{ color: "#666", display: "block" }}>Status</small>
                  <StatusBadge value={item.status} />
                </div>
                <div>
                  <small style={{ color: "#666", display: "block" }}>Fee</small>
                  <strong>{rupees(item.fees?.totalAmount)}</strong>
                </div>
                {item.reasonForVisit && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <small style={{ color: "#666", display: "block" }}>Reason for visit</small>
                    <span>{item.reasonForVisit}</span>
                  </div>
                )}
              </div>

              <div className="inline-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                {["confirmed", "checked-in"].includes(item.status) && (
                  <button
                    className="button button-quiet"
                    onClick={() => act("noShow")}
                  >
                    Mark no-show
                  </button>
                )}
                {["confirmed", "checked-in"].includes(item.status) && (
                  <button
                    className="button button-quiet button-danger"
                    onClick={() => act("cancel")}
                  >
                    Cancel appointment
                  </button>
                )}

                {/* Invoice Link */}
                {item.invoice ? (
                  <Link
                    to={"/reception/invoices?open=" + (item.invoice._id || item.invoice.id || item.invoice)}
                    className="button button-outline button-small"
                  >
                    View Invoice #{item.invoice.invoiceNumber || ""} <ArrowRight size={14} />
                  </Link>
                ) : ["confirmed", "checked-in", "completed"].includes(item.status) ? (
                  <Link
                    to={"/reception/invoices?appointmentId=" + item._id}
                    className="button button-primary button-small"
                  >
                    <Plus size={14} /> Create invoice
                  </Link>
                ) : null}
              </div>
            </SectionPanel>
          )}
        </div>
      )}

      {/* Appointments List View */}
      <SectionPanel
        title="Appointments directory"
        description={"Showing " + appointments.length + " of " + totalCount + " appointments"}
      >
        <AsyncView
          query={listQuery}
          empty={!listQuery.isLoading && !listQuery.isError && !appointments.length}
          emptyTitle="No appointments match the current filters"
          emptyDescription="Try clearing your search query or selecting a broader date range."
        >
          <div className="appointment-list">
            {appointments.map((visit) => (
              <button
                type="button"
                className={"appointment-row lookup-row " + (lookup === visit._id ? "appointment-selected" : "")}
                key={visit._id}
                onClick={() => {
                  setId(visit._id);
                  setLookup(visit._id);
                  setSearchParams({ open: visit._id });
                }}
                style={{ textAlign: "left", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.8rem 1rem", borderBottom: "1px solid #eef2f0", background: lookup === visit._id ? "#f0fdf4" : "transparent" }}
              >
                <div className="appointment-date" style={{ minWidth: "120px" }}>
                  <CalendarDays size={17} />
                  <span>
                    <strong>{visit.startTime}</strong>
                    <small style={{ display: "block", color: "#666" }}>{fmtDate(visit.date)}</small>
                  </span>
                </div>
                <div className="appointment-main" style={{ flex: 1, padding: "0 1rem" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>{visit.patient?.name || "Patient"}</h3>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                    {visit.patient?.phone ? (visit.patient.phone + " · ") : ""}
                    Dr. {visit.dentist?.user?.name || "Dentist"} · {visit.reasonForVisit || visit.mode}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                  <StatusBadge value={visit.paymentStatus} />
                  <StatusBadge value={visit.status} />
                  <strong style={{ minWidth: "60px", textAlign: "right" }}>{rupees(visit.fees?.totalAmount)}</strong>
                  <span className="row-arrow">
                    <ArrowRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </AsyncView>

        {/* Server Pagination */}
        {totalCount > 20 && (
          <div className="pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.2rem", padding: "0.5rem 0" }}>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(totalCount / 20)}
            </span>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page >= Math.ceil(totalCount / 20)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </SectionPanel>

      {/* Staff appointment booking modal */}
      {showBookingModal && (
        <div className="modal-backdrop" onClick={() => setShowBookingModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px", width: "90%" }}>
            <div className="modal-header">
              <h2>Book Staff Appointment</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setShowBookingModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleStaffBooking} className="admin-form-grid" style={{ padding: "1.2rem" }}>
              <div className="field-wide">
                <label className="field-label">Patient *</label>
                {selectedPatient ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "#f0f7f5", borderRadius: "6px", border: "1px solid #c2e2dc" }}>
                    <div>
                      <strong>{selectedPatient.name || selectedPatient.user?.name}</strong>
                      <span style={{ fontSize: "0.85rem", color: "#555", marginLeft: "0.5rem" }}>
                        ({selectedPatient.phone || selectedPatient.user?.phone})
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() => setSelectedPatient(null)}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <TextInput
                        placeholder="Search patient by name or phone (min 2 characters)"
                        value={patientSearchTerm}
                        onChange={(e) => setPatientSearchTerm(e.target.value)}
                      />
                      <button
                        type="button"
                        className="button button-outline button-small"
                        style={{ whiteSpace: "nowrap" }}
                        onClick={() => {
                          setWalkInForm((prev) => ({ ...prev, name: patientSearchTerm }));
                          setShowWalkInModal(true);
                          setWalkInDuplicate(null);
                        }}
                      >
                        <Plus size={14} /> Walk-in
                      </button>
                    </div>
                    {patientSearchResults.data?.data?.length > 0 && (
                      <div className="record-list" style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #dbe5e1", borderRadius: "4px", marginTop: "0.3rem" }}>
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
                    {!patientSearchResults.isLoading && patientSearchTerm.length >= 2 && (!patientSearchResults.data?.data || patientSearchResults.data.data.length === 0) && (
                      <div className="notice notice-info" style={{ marginTop: "0.5rem" }}>
                        <p style={{ margin: 0, fontSize: "0.85rem" }}>
                          <strong>No registered patient found.</strong> Register this patient directly as a walk-in to create an account and book.
                        </p>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          style={{ marginTop: "0.4rem" }}
                          onClick={() => {
                            setWalkInForm((prev) => ({ ...prev, name: patientSearchTerm }));
                            setShowWalkInModal(true);
                            setWalkInDuplicate(null);
                          }}
                        >
                          <Plus size={13} /> Register "{patientSearchTerm}" as Walk-in
                        </button>
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

              <Field label="Mode">
                <TextInput
                  as="select"
                  value={bookingMode}
                  onChange={(e) => setBookingMode(e.target.value)}
                >
                  <option value="in-clinic">In-clinic visit</option>
                </TextInput>
              </Field>

              <div className="field-wide">
                <label className="field-label">Available time slot *</label>
                {staffSlotsQuery.isLoading ? (
                  <p className="muted-copy">Loading available slots…</p>
                ) : availableSlots.length === 0 ? (
                  <p className="muted-copy">No available slots for this date. Select another date.</p>
                ) : (
                  <div className="slot-grid" style={{ maxHeight: "140px", overflowY: "auto", marginTop: "0.3rem" }}>
                    {availableSlots.map((slot) => (
                      <button
                        type="button"
                        key={slot.startTime}
                        className={`slot-button ${bookingSlot === slot.startTime ? "slot-selected" : ""}`}
                        onClick={() => setBookingSlot(slot.startTime)}
                      >
                        {slot.startTime}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Payment collection" className="field-wide">
                <TextInput
                  as="select"
                  value={paymentChoice}
                  onChange={(e) => setPaymentChoice(e.target.value)}
                >
                  <option value="pay-at-clinic">Pay at clinic counter (Confirmed, Pending)</option>
                  <option value="online">Online payment via Razorpay</option>
                </TextInput>
              </Field>

              <Field label="Reason for visit" className="field-wide">
                <TextInput
                  value={bookingReason}
                  onChange={(e) => setBookingReason(e.target.value)}
                  placeholder="e.g. Toothache, routine checkup, filling"
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }} className="field-wide">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setShowBookingModal(false)}
                  disabled={bookingBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={bookingBusy || !selectedPatient || !bookingSlot}
                >
                  {bookingBusy ? "Booking…" : "Confirm Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Walk-in patient registration modal */}
      {showWalkInModal && (
        <div className="modal-backdrop" onClick={() => setShowWalkInModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", width: "95%" }}>
            <div className="modal-header">
              <h2>Register Walk-in Patient</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowWalkInModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRegisterWalkIn} className="admin-form-grid" style={{ padding: "1.2rem" }}>
              {walkInDuplicate && (
                <div className="notice notice-warn field-wide" style={{ marginBottom: "0.6rem" }}>
                  <strong>Patient account already exists:</strong>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                    {walkInDuplicate.name || walkInDuplicate.user?.name} · {walkInDuplicate.phone || walkInDuplicate.user?.phone} {walkInDuplicate.email ? `· ${walkInDuplicate.email}` : ""}
                  </div>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => {
                      setSelectedPatient(walkInDuplicate);
                      setShowWalkInModal(false);
                      setWalkInDuplicate(null);
                    }}
                  >
                    Select this Existing Patient
                  </button>
                </div>
              )}

              <Field label="Full Name *">
                <TextInput
                  required
                  value={walkInForm.name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, name: e.target.value })}
                />
              </Field>

              <Field label="Phone Number *">
                <TextInput
                  required
                  placeholder="e.g. 9876543210"
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                />
              </Field>

              <Field label="Email Address (Optional)">
                <TextInput
                  type="email"
                  value={walkInForm.email}
                  onChange={(e) => setWalkInForm({ ...walkInForm, email: e.target.value })}
                />
              </Field>

              <Field label="Date of Birth">
                <TextInput
                  type="date"
                  value={walkInForm.dateOfBirth}
                  onChange={(e) => setWalkInForm({ ...walkInForm, dateOfBirth: e.target.value })}
                />
              </Field>

              <Field label="Gender">
                <TextInput
                  as="select"
                  value={walkInForm.gender}
                  onChange={(e) => setWalkInForm({ ...walkInForm, gender: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </TextInput>
              </Field>

              <Field label="Address" className="field-wide">
                <TextInput
                  value={walkInForm.address}
                  onChange={(e) => setWalkInForm({ ...walkInForm, address: e.target.value })}
                />
              </Field>

              <Field label="Emergency Contact Name">
                <TextInput
                  value={walkInForm.emergencyContactName}
                  onChange={(e) => setWalkInForm({ ...walkInForm, emergencyContactName: e.target.value })}
                />
              </Field>

              <Field label="Emergency Contact Phone">
                <TextInput
                  value={walkInForm.emergencyContactPhone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, emergencyContactPhone: e.target.value })}
                />
              </Field>

              <Field label="Known Allergies (comma-separated)" className="field-wide">
                <TextInput
                  placeholder="e.g. Penicillin, Latex"
                  value={walkInForm.allergies}
                  onChange={(e) => setWalkInForm({ ...walkInForm, allergies: e.target.value })}
                />
              </Field>

              <Field label="Chronic Health Conditions" className="field-wide">
                <TextInput
                  placeholder="e.g. Hypertension, Diabetes"
                  value={walkInForm.chronicConditions}
                  onChange={(e) => setWalkInForm({ ...walkInForm, chronicConditions: e.target.value })}
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }} className="field-wide">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setShowWalkInModal(false)}
                  disabled={walkInBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={walkInBusy || !walkInForm.name.trim() || !walkInForm.phone.trim()}
                >
                  {walkInBusy ? "Registering…" : "Register Patient"}
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

export function InvoiceCreator() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const primary = usePrimaryDentist();
  const [searchParams, setSearchParams] = useSearchParams();

  const openParam = searchParams.get("open") || "";
  const appointmentIdParam = searchParams.get("appointmentId") || "";

  // Filters and table state - DEFAULT STATUS IS ALL ("")
  const [status, setStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Selected invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedInvoiceError, setSelectedInvoiceError] = useState(false);
  const [extraItems, setExtraItems] = useState([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [extraCoupon, setExtraCoupon] = useState("");
  const [updatingItems, setUpdatingItems] = useState(false);

  // Payment recording modal state
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    method: "cash",
    amount: "",
    reference: "",
  });
  const [paymentBusy, setPaymentBusy] = useState(false);

  // Visit invoice modal state (create for completed visit)
  const [showVisitInvoiceModal, setShowVisitInvoiceModal] = useState(!!appointmentIdParam);
  const [creatingVisitInvoice, setCreatingVisitInvoice] = useState(false);

  // Manual non-visit invoice form state
  const [showManualInvoice, setShowManualInvoice] = useState(false);
  const [form, setForm] = useState({
    patientId: "",
    dentistId: "",
    appointmentId: "",
    couponCode: "",
  });
  const [items, setItems] = useState([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [invoice, setInvoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // Invoices list query
  const invoices = useQuery({
    queryKey: ["staff-invoices", status, filterFrom, filterTo, search, page],
    queryFn: () =>
      api.invoices.all({
        status: status || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      }),
  });
  const invoiceRows = invoices.data?.data || [];
  const metaTotal = invoices.data?.meta?.total ?? invoiceRows.length;

  // Query completed / confirmed visits eligible for invoice creation
  const visitsForInvoice = useQuery({
    queryKey: ["visits-for-invoice"],
    queryFn: () =>
      api.appointments.all({
        page: 1,
        limit: 50,
        sort: "-date -startTime",
      }),
    enabled: showVisitInvoiceModal,
  });
  const eligibleVisits = (visitsForInvoice.data?.data || []).filter(
    (v) => ["confirmed", "checked-in", "completed"].includes(v.status) && !v.invoice
  );

  // Load deep linked invoice if ?open=<id>
  useEffect(() => {
    if (openParam) {
      const match = (invoices.data?.data || []).find((i) => i._id === openParam);
      if (match) setSelectedInvoice(match);
      if (typeof api.invoices?.detail === "function") {
        try {
          const promise = api.invoices.detail(openParam);
          if (promise && typeof promise.then === "function") {
            promise
              .then((res) => {
                if (res?.data) setSelectedInvoice(res.data);
                setSelectedInvoiceError(false);
              })
              .catch(() => {
                if (!match) setSelectedInvoiceError(true);
              });
          }
        } catch {
          // ignore
        }
      }
    }
  }, [openParam, invoices.data]);

  const treatmentsQuery = useQuery({
    queryKey: ["treatments"],
    queryFn: api.treatments.list,
  });
  const treatmentCatalog = treatmentsQuery.data?.data || [];

  // Totals bar calculations
  const totalBilled = invoiceRows.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const totalCollected = invoiceRows.reduce((sum, inv) => {
    if (inv.status === "paid") return sum + Number(inv.totalAmount || 0);
    return sum + Number(inv.paidAmount || 0);
  }, 0);
  const totalOutstanding = Math.max(0, totalBilled - totalCollected);

  // Daily collection summary
  const todayIso = new Date().toISOString().slice(0, 10);
  const dailySummary = invoiceRows.reduce(
    (acc, inv) => {
      const isMatchDay = (inv.createdAt || "").startsWith(filterFrom || todayIso);
      if (isMatchDay && (inv.status === "paid" || (inv.paidAmount && inv.paidAmount > 0))) {
        const m = (inv.paymentMethod || "cash").toLowerCase();
        const amt = Number(inv.status === "paid" ? (inv.paidAmount || inv.totalAmount) : (inv.paidAmount || 0));
        acc.total += amt;
        if (m.includes("cash")) acc.cash += amt;
        else if (m.includes("card")) acc.card += amt;
        else if (m.includes("upi")) acc.upi += amt;
        else acc.other += amt;
      }
      return acc;
    },
    { total: 0, cash: 0, card: 0, upi: 0, other: 0 }
  );

  const handleExportDailyCsv = () => {
    const headers = [
      "Invoice #",
      "Patient Name",
      "Patient Phone",
      "Date",
      "Payment Method",
      "Total Amount",
      "Paid Amount",
      "Status",
    ];
    const rows = invoiceRows.map((inv) => [
      inv.invoiceNumber || inv._id,
      inv.patient?.name || "Patient",
      inv.patient?.phone || "",
      fmtDate(inv.createdAt),
      (inv.paymentMethod || "N/A").toUpperCase(),
      inv.totalAmount || 0,
      inv.paidAmount || (inv.status === "paid" ? inv.totalAmount : 0),
      inv.status,
    ]);
    exportToCsv("invoices-" + (filterFrom || todayIso) + ".csv", headers, rows);
    notify("Exported " + rows.length + " invoices to CSV.");
  };

  const subtotal = items.reduce(
    (total, item) =>
      total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setInvoice(null);
    try {
      const result = await api.invoices.create({
        patientId: form.patientId,
        dentistId: form.dentistId || primary.dentistId || undefined,
        appointmentId: form.appointmentId || undefined,
        couponCode: form.couponCode || undefined,
        items: items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      });
      setInvoice(result.data);
      setPreview(null);
      notify(result.message || "Invoice created.");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setShowManualInvoice(false);
    } catch (error) {
      if (error.status === 409 && error.data?.data) {
        notify("An invoice already exists for this appointment.", "error");
        setSelectedInvoice(error.data.data);
      } else {
        notify(error.message, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateForVisit = async (visit) => {
    setCreatingVisitInvoice(true);
    try {
      const consultFee = visit.fees?.consultationFee || 500;
      const res = await api.invoices.create({
        patientId: visit.patient?._id || visit.patient,
        appointmentId: visit._id,
        dentistId: visit.dentist?._id || visit.dentist,
        items: [
          {
            description: "Dental Consultation (" + visit.mode + ")",
            quantity: 1,
            unitPrice: consultFee,
          },
        ],
      });
      notify(res.message || "Invoice created for appointment.", "success");
      setShowVisitInvoiceModal(false);
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSelectedInvoice(res.data);
    } catch (err) {
      if (err.status === 409 && err.data?.data) {
        notify("An invoice already exists for this appointment.", "error");
        setShowVisitInvoiceModal(false);
        setSelectedInvoice(err.data.data);
      } else {
        notify(err.message || "Failed to create invoice for visit.", "error");
      }
    } finally {
      setCreatingVisitInvoice(false);
    }
  };

  const previewCoupon = async () => {
    if (!form.patientId.trim() || !form.couponCode.trim()) {
      notify("Enter the patient account ID and coupon code first.", "error");
      return;
    }
    setPreviewBusy(true);
    try {
      const result = await api.coupons.validate({
        code: form.couponCode,
        orderAmount: subtotal,
        userId: form.patientId,
      });
      setPreview(result.data);
    } catch (error) {
      setPreview(null);
      notify(error.message, "error");
    } finally {
      setPreviewBusy(false);
    }
  };

  const openPaymentModal = (inv) => {
    const outstanding = Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));
    setPaymentModalInvoice(inv);
    setPaymentForm({
      method: "cash",
      amount: outstanding,
      reference: "",
    });
  };

  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;
    const amountNum = Number(paymentForm.amount);
    if (!amountNum || amountNum <= 0) {
      notify("Enter a valid payment amount.", "error");
      return;
    }

    setPaymentBusy(true);
    try {
      const res = await api.invoices.markPaid(paymentModalInvoice._id, {
        method: paymentForm.method,
        amount: amountNum,
        reference: paymentForm.reference,
      });
      notify(res.message || "Payment recorded.");
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      if (selectedInvoice && selectedInvoice._id === paymentModalInvoice._id) {
        setSelectedInvoice(res.data);
      }
      setPaymentModalInvoice(null);
    } catch (err) {
      notify(err.message || "Failed to record payment.", "error");
    } finally {
      setPaymentBusy(false);
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Billing desk"
        title="Invoices & Payments"
        description="Review visit invoices, collect counter payments (Cash, Card, UPI), add extra procedures, or issue manual invoices."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button button-outline"
              onClick={handleExportDailyCsv}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setShowVisitInvoiceModal(true)}
            >
              <Plus size={15} /> Create invoice for a visit
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowManualInvoice(!showManualInvoice)}
            >
              {showManualInvoice ? "Hide manual form" : "+ Create manual invoice"}
            </button>
          </div>
        }
      />

      {/* Totals Summary Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem", marginBottom: "1.2rem" }}>
        <div style={{ background: "#f8faf9", border: "1px solid #dbe5e1", padding: "0.9rem", borderRadius: "8px" }}>
          <small style={{ color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Total Billed</small>
          <strong style={{ display: "block", fontSize: "1.25rem", color: "#1e293b", marginTop: "0.2rem" }}>{rupees(totalBilled)}</strong>
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.9rem", borderRadius: "8px" }}>
          <small style={{ color: "#166534", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Total Collected</small>
          <strong style={{ display: "block", fontSize: "1.25rem", color: "#15803d", marginTop: "0.2rem" }}>{rupees(totalCollected)}</strong>
        </div>
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "0.9rem", borderRadius: "8px" }}>
          <small style={{ color: "#92400e", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Total Outstanding</small>
          <strong style={{ display: "block", fontSize: "1.25rem", color: "#b45309", marginTop: "0.2rem" }}>{rupees(totalOutstanding)}</strong>
        </div>
      </div>

      {selectedInvoiceError && (
        <div className="notice notice-warn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>This invoice is no longer available or was not found.</div>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => {
              setSelectedInvoiceError(false);
              setSearchParams({});
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main invoices list with multi-parameter filter */}
      <SectionPanel
        title="Clinic invoices"
        description="Filter invoices across all payment statuses or search by patient name, phone, or invoice number."
      >
        {/* Status Tabs */}
        <div className="filter-chips" style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
          {[
            { id: "", label: "All invoices" },
            { id: "unpaid", label: "Unpaid" },
            { id: "paid", label: "Paid" },
            { id: "refunded", label: "Refunded" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={"button button-small " + (status === tab.id ? "button-primary" : "button-outline")}
              onClick={() => {
                setStatus(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
          <Field label="From date">
            <TextInput
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To date">
            <TextInput
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Patient / Invoice search">
            <TextInput
              placeholder="Search by patient name, phone, or invoice #…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>

        <AsyncView
          query={invoices}
          empty={false}
        >
          {invoiceRows.length === 0 && !invoices.isLoading ? (
            <div className="section-panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem", border: "1px dashed #cbd5e1" }}>
              <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>No invoices yet</h3>
              <p style={{ color: "#64748b", maxWidth: "520px", margin: "0 auto 1.5rem", lineHeight: 1.5 }}>
                No invoices yet. An invoice is created when a visit is completed. You can also create one now.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setShowVisitInvoiceModal(true)}
                >
                  <Plus size={15} /> Create invoice for a visit
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setShowManualInvoice(true)}
                >
                  <Plus size={15} /> Create manual invoice
                </button>
              </div>
            </div>
          ) : (
            <div className="record-list">
              {invoiceRows.map((entry) => (
                <article className="record-row" key={entry._id}>
                  <span className="record-type-icon">
                    <FileText size={17} />
                  </span>
                  <div className="record-row-content">
                    <strong>
                      {entry.invoiceNumber} · {entry.patient?.name || "Patient"}
                    </strong>
                    <span>
                      {fmtDate(entry.createdAt)} · {entry.items?.length || 0} items
                      {entry.patient?.phone ? (" · " + entry.patient.phone) : ""}
                    </span>
                  </div>
                  <div className="record-row-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <StatusBadge value={entry.status} />
                    <strong>{rupees(entry.totalAmount)}</strong>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() => {
                        setSelectedInvoice(entry);
                        setSearchParams({ open: entry._id });
                      }}
                    >
                      View / Edit
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() =>
                        downloadPdf("/invoices/" + entry._id + "/pdf", entry.invoiceNumber + ".pdf").catch((error) =>
                          notify(error.message, "error")
                        )
                      }
                    >
                      <Download size={14} /> PDF
                    </button>
                    {entry.status === "unpaid" && (
                      <button
                        type="button"
                        className="button button-primary button-small"
                        onClick={() => openPaymentModal(entry)}
                      >
                        Record payment
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </AsyncView>

        {metaTotal > 20 && (
          <div className="pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(metaTotal / 20)}
            </span>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page >= Math.ceil(metaTotal / 20)}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        )}
      </SectionPanel>

      {/* Modal: Create invoice for a visit */}
      {showVisitInvoiceModal && (
        <div className="modal-backdrop" onClick={() => setShowVisitInvoiceModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px", width: "92%" }}>
            <div className="modal-header">
              <h2>Create Invoice for Patient Visit</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setShowVisitInvoiceModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "1.2rem" }}>
              <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "1rem" }}>
                Select a completed or confirmed patient appointment to generate an itemized consultation invoice.
              </p>

              {visitsForInvoice.isLoading ? (
                <div style={{ textAlign: "center", padding: "1.5rem" }}>Loading appointments…</div>
              ) : eligibleVisits.length === 0 ? (
                <div className="notice notice-info">
                  No completed or confirmed visits without invoices were found. You can create a manual invoice instead.
                </div>
              ) : (
                <div className="record-list" style={{ maxHeight: "320px", overflowY: "auto" }}>
                  {eligibleVisits.map((v) => (
                    <div
                      key={v._id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem", borderBottom: "1px solid #eef2f0" }}
                    >
                      <div>
                        <strong>{v.patient?.name || "Patient"}</strong>
                        <div style={{ fontSize: "0.85rem", color: "#666" }}>
                          {fmtDate(v.date)} at {v.startTime} · {v.mode} · Status: {v.status}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                        <strong>{rupees(v.fees?.totalAmount)}</strong>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          disabled={creatingVisitInvoice}
                          onClick={() => handleCreateForVisit(v)}
                        >
                          {creatingVisitInvoice ? "Creating…" : "Generate Invoice"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Payment (supports partial payments) */}
      {paymentModalInvoice && (
        <div className="modal-backdrop" onClick={() => setPaymentModalInvoice(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "90%" }}>
            <div className="modal-header">
              <h2>Record Payment · {paymentModalInvoice.invoiceNumber}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setPaymentModalInvoice(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRecordPaymentSubmit} className="stack-form" style={{ padding: "1.2rem" }}>
              <div style={{ background: "#f8faf9", padding: "0.8rem", borderRadius: "6px", marginBottom: "0.8rem" }}>
                <div>Patient: <strong>{paymentModalInvoice.patient?.name || "Patient"}</strong></div>
                <div>Total invoice amount: <strong>{rupees(paymentModalInvoice.totalAmount)}</strong></div>
                <div>Already paid: <strong>{rupees(paymentModalInvoice.paidAmount || 0)}</strong></div>
                <div style={{ color: "#b45309" }}>
                  Remaining balance: <strong>{rupees(Math.max(0, paymentModalInvoice.totalAmount - (paymentModalInvoice.paidAmount || 0)))}</strong>
                </div>
              </div>

              <Field label="Payment method *">
                <select
                  className="input"
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card (POS Terminal)</option>
                  <option value="upi">UPI / QR Code</option>
                  <option value="bank-transfer">Bank Transfer</option>
                </select>
              </Field>

              <Field label="Amount to collect (Rs.) *">
                <TextInput
                  type="number"
                  min="1"
                  max={paymentModalInvoice.totalAmount}
                  step="any"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </Field>

              <Field label="Payment reference / Note (optional)">
                <TextInput
                  placeholder="e.g. UPI Ref #, POS slip number"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.8rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setPaymentModalInvoice(null)}
                  disabled={paymentBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={paymentBusy}
                >
                  {paymentBusy ? "Recording…" : "Confirm payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail / Edit Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop" onClick={() => { setSelectedInvoice(null); setSearchParams({}); }}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "680px", width: "92%" }}
          >
            <div className="modal-header">
              <div>
                <h2>Invoice {selectedInvoice.invoiceNumber}</h2>
                <span style={{ fontSize: "0.85rem", color: "#666" }}>
                  {fmtDate(selectedInvoice.createdAt)} · Patient: {selectedInvoice.patient?.name || "Patient"} ({selectedInvoice.patient?.phone || "N/A"})
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => { setSelectedInvoice(null); setSearchParams({}); }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "1.2rem", display: "grid", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <StatusBadge value={selectedInvoice.status} />
                  {selectedInvoice.paidAmount > 0 && selectedInvoice.status !== "paid" && (
                    <span style={{ fontSize: "0.85rem", color: "#b45309" }}>
                      (Partial: {rupees(selectedInvoice.paidAmount)} paid)
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() =>
                      downloadPdf(
                        "/invoices/" + selectedInvoice._id + "/pdf",
                        selectedInvoice.invoiceNumber + ".pdf"
                      ).catch((err) => notify(err.message, "error"))
                    }
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  {selectedInvoice.status === "unpaid" && (
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => openPaymentModal(selectedInvoice)}
                    >
                      Record payment
                    </button>
                  )}
                </div>
              </div>

              {/* Line items table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.9rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2ece9", textAlign: "left" }}>
                      <th style={{ padding: "0.5rem" }}>Description</th>
                      <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
                      <th style={{ padding: "0.5rem", textAlign: "right" }}>Unit Price</th>
                      <th style={{ padding: "0.5rem", textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.items || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f0f4f2" }}>
                        <td style={{ padding: "0.5rem" }}>{item.description}</td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>{item.quantity}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>{rupees(item.unitPrice)}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>
                          <strong>{rupees(item.amount || item.quantity * item.unitPrice)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ display: "grid", gap: "0.3rem", textAlign: "right", borderTop: "1px solid #e2ece9", paddingTop: "0.8rem" }}>
                <div>Subtotal: <strong>{rupees(selectedInvoice.subTotal)}</strong></div>
                {selectedInvoice.discount > 0 && (
                  <div style={{ color: "#1b7340" }}>
                    Coupon Discount ({selectedInvoice.couponCode || "Applied"}): <strong>-{rupees(selectedInvoice.discount)}</strong>
                  </div>
                )}
                {selectedInvoice.tax > 0 && <div>Tax: <strong>{rupees(selectedInvoice.tax)}</strong></div>}
                <div style={{ fontSize: "1.1rem" }}>Total Amount: <strong>{rupees(selectedInvoice.totalAmount)}</strong></div>
                {selectedInvoice.paidAmount > 0 && (
                  <div>Paid to date: <strong>{rupees(selectedInvoice.paidAmount)}</strong></div>
                )}
              </div>

              {/* If unpaid, allow editing items */}
              {selectedInvoice.status === "unpaid" && (
                <div style={{ borderTop: "1px solid #e2ece9", paddingTop: "1rem" }}>
                  <div style={{ background: "#fff", border: "1px solid #dbe5e1", borderRadius: "6px", padding: "0.8rem" }}>
                    <strong style={{ display: "block", marginBottom: "0.5rem" }}>
                      Add extra procedure line items or coupon
                    </strong>
                    {extraItems.map((item, idx) => (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: "0.4rem", marginBottom: "0.4rem" }}>
                        <TextInput
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) =>
                            setExtraItems((all) =>
                              all.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it))
                            )
                          }
                        />
                        <TextInput
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) =>
                            setExtraItems((all) =>
                              all.map((it, i) => (i === idx ? { ...it, quantity: Number(e.target.value) } : it))
                            )
                          }
                        />
                        <TextInput
                          type="number"
                          min="0"
                          placeholder="Unit price"
                          value={item.unitPrice}
                          onChange={(e) =>
                            setExtraItems((all) =>
                              all.map((it, i) => (i === idx ? { ...it, unitPrice: Number(e.target.value) } : it))
                            )
                          }
                        />
                        {extraItems.length > 1 && (
                          <button
                            type="button"
                            className="button button-quiet button-small"
                            onClick={() => setExtraItems((all) => all.filter((_, i) => i !== idx))}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", alignItems: "center" }}>
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        onClick={() => setExtraItems((all) => [...all, { description: "", quantity: 1, unitPrice: 0 }])}
                      >
                        + Add custom line
                      </button>
                      {treatmentCatalog.length > 0 && (
                        <select
                          className="input"
                          style={{ maxWidth: "240px", fontSize: "0.85rem", padding: "0.3rem 0.6rem" }}
                          onChange={(e) => {
                            const t = treatmentCatalog.find((x) => x._id === e.target.value);
                            if (t) {
                              setExtraItems((all) => [...all, { description: t.name, quantity: 1, unitPrice: t.defaultCost || 0 }]);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="">+ Add from treatment catalog…</option>
                          {treatmentCatalog.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name} ({rupees(t.defaultCost)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <TextInput
                        placeholder="Coupon code (optional)"
                        value={extraCoupon}
                        onChange={(e) => setExtraCoupon(e.target.value.toUpperCase())}
                        style={{ maxWidth: "200px" }}
                      />
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={updatingItems || (!extraItems.some((i) => i.description.trim()) && !extraCoupon)}
                        onClick={async () => {
                          const approved = await confirm({
                            title: "Save changes to invoice line items?",
                            description: "New procedures and discounts will be added and totals recalculated.",
                            confirmLabel: "Update invoice",
                            cancelLabel: "Keep current items",
                          });
                          if (!approved) return;

                          setUpdatingItems(true);
                          try {
                            const payload = {};
                            const validItems = extraItems.filter((i) => i.description.trim());
                            if (validItems.length) payload.items = validItems;
                            if (extraCoupon.trim()) payload.couponCode = extraCoupon.trim();
                            const res = await api.invoices.updateItems(selectedInvoice._id, payload);
                            notify("Invoice updated with extra items.", "success");
                            setSelectedInvoice(res.data);
                            setExtraItems([{ description: "", quantity: 1, unitPrice: 0 }]);
                            setExtraCoupon("");
                            queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
                          } catch (err) {
                            notify(err.message || "Failed to update invoice items.", "error");
                          } finally {
                            setUpdatingItems(false);
                          }
                        }}
                      >
                        {updatingItems ? "Updating…" : "Apply items & recalculate"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual invoice form */}
      {showManualInvoice && (
        <SectionPanel
          title="Manual invoice for non-visit charges"
          description="Use this form for non-visit charges such as dental hygiene products or external diagnostic services."
        >
          <form className="stack-form" onSubmit={create}>
            <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem" }}>
              <Field label="Patient account ID *">
                <TextInput
                  required
                  value={form.patientId}
                  onChange={(event) =>
                    setForm({ ...form, patientId: event.target.value })
                  }
                  placeholder="Paste patient User ID"
                />
              </Field>
              <Field label="Doctor">
                <TextInput
                  disabled
                  value={
                    primary.dentist
                      ? ("Dr. " + (primary.dentist.user?.name || "Doctor"))
                      : "Clinic Doctor"
                  }
                />
              </Field>
              <Field label="Coupon code (optional)">
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <TextInput
                    value={form.couponCode}
                    onChange={(event) => {
                      setPreview(null);
                      setForm({ ...form, couponCode: event.target.value.toUpperCase() });
                    }}
                  />
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={previewCoupon}
                    disabled={previewBusy || !form.couponCode}
                  >
                    {previewBusy ? "…" : "Preview"}
                  </button>
                </div>
              </Field>
            </div>

            <div className="invoice-items-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "1rem 0 0.5rem" }}>
              <h3>Line items</h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {treatmentCatalog.length > 0 && (
                  <select
                    className="input"
                    style={{ maxWidth: "240px", fontSize: "0.85rem" }}
                    onChange={(e) => {
                      const t = treatmentCatalog.find((x) => x._id === e.target.value);
                      if (t) {
                        setItems((all) => [...all, { description: t.name, quantity: 1, unitPrice: t.defaultCost || 0 }]);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="">+ Add from treatment catalog…</option>
                    {treatmentCatalog.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} ({rupees(t.defaultCost)})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() =>
                    setItems((all) => [
                      ...all,
                      { description: "", quantity: 1, unitPrice: 0 },
                    ])
                  }
                >
                  <Plus size={14} /> Custom item
                </button>
              </div>
            </div>

            {items.map((item, index) => (
              <div key={index} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <TextInput
                  required
                  placeholder="Item description"
                  value={item.description}
                  onChange={(e) =>
                    setItems((all) =>
                      all.map((entry, ix) =>
                        ix === index ? { ...entry, description: e.target.value } : entry
                      )
                    )
                  }
                />
                <TextInput
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((all) =>
                      all.map((entry, ix) =>
                        ix === index ? { ...entry, quantity: Number(e.target.value) } : entry
                      )
                    )
                  }
                />
                <TextInput
                  type="number"
                  min="0"
                  placeholder="Unit price"
                  value={item.unitPrice}
                  onChange={(e) =>
                    setItems((all) =>
                      all.map((entry, ix) =>
                        ix === index ? { ...entry, unitPrice: Number(e.target.value) } : entry
                      )
                    )
                  }
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => setItems((all) => all.filter((_, ix) => ix !== index))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
              <div>Estimated subtotal: <strong>{rupees(subtotal)}</strong></div>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create invoice"}
              </button>
            </div>
          </form>
        </SectionPanel>
      )}
      {dialog}
    </div>
  );
}

export function ReceptionPage({ page }) {
  if (page === "dashboard") return <ReceptionDashboard />;
  if (page === "patients") return <PatientDirectory />;
  if (page === "appointments") return <AppointmentLookup />;
  if (page === "invoices") return <InvoiceCreator />;
  return <EmptyState title="This front-desk view is not available" />;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();

  const [filterMode, setFilterMode] = useState("all"); // 'all' or 'unread'
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);

  const notifications = useQuery({
    queryKey: ["notifications", filterMode, page],
    queryFn: () =>
      api.notifications.mine({
        unreadOnly: filterMode === "unread" ? "true" : undefined,
        page,
        limit: 20,
      }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const rows = notifications.data?.data || [];
  const unread = notifications.data?.meta?.unreadCount || 0;
  const total = notifications.data?.meta?.total ?? rows.length;
  const readCount = Math.max(0, total - unread);

  const markRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const result = await api.notifications.read(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleRowClick = async (entry) => {
    if (!entry.isRead) {
      try {
        await api.notifications.read(entry._id);
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } catch {
        // ignore
      }
    }
    if (entry.link) {
      navigate(entry.link);
    }
  };

  const markAll = async () => {
    try {
      const result = await api.notifications.readAll();
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const result = await api.notifications.remove(id);
      notify(result.message || "Notification deleted.");
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    const ok = await confirm({
      title: "Delete selected notifications?",
      message: `Are you sure you want to delete ${selectedIds.length} notification(s)? This cannot be undone.`,
      confirmText: "Delete selected",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      const result = await api.notifications.removeMany(selectedIds);
      notify(result.message || `${selectedIds.length} notification(s) deleted.`);
      setSelectedIds([]);
      setSelectMode(false);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleClearRead = async () => {
    const ok = await confirm({
      title: "Clear all read notifications?",
      message: "Are you sure you want to delete all read notifications? This cannot be undone.",
      confirmText: "Clear read",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      const result = await api.notifications.clear("read");
      notify(result.message || "Read notifications cleared.");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: "Delete all notifications?",
      message: `Are you sure you want to delete all ${total} notification(s)? This cannot be undone.`,
      confirmText: "Delete all",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      const result = await api.notifications.clear("all");
      notify(result.message || "All notifications deleted.");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const toggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r._id));
    }
  };

  return (
    <div>
      {dialog}
      <PageTitle
        eyebrow="Stay informed"
        title="Notifications"
        description={unread + " unread update" + (unread === 1 ? "" : "s") + " · refreshes automatically every 30 seconds."}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {selectMode ? (
              <>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={toggleSelectAllPage}
                >
                  {selectedIds.length === rows.length && rows.length > 0 ? "Deselect all" : "Select page"}
                </button>
                <button
                  type="button"
                  className="button button-danger button-small"
                  disabled={!selectedIds.length}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={14} /> Delete selected ({selectedIds.length})
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds([]);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {unread > 0 && (
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={markAll}
                  >
                    Mark all read <Check size={14} />
                  </button>
                )}
                {readCount > 0 && (
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={handleClearRead}
                  >
                    Clear read ({readCount})
                  </button>
                )}
                {total > 0 && (
                  <>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => setSelectMode(true)}
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      style={{ color: "var(--color-danger, #ef4444)" }}
                      onClick={handleClearAll}
                    >
                      Clear all
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="filter-chips" style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
        <button
          type="button"
          className={"button button-small " + (filterMode === "all" ? "button-primary" : "button-outline")}
          onClick={() => {
            setFilterMode("all");
            setPage(1);
          }}
        >
          All ({total})
        </button>
        <button
          type="button"
          className={"button button-small " + (filterMode === "unread" ? "button-primary" : "button-outline")}
          onClick={() => {
            setFilterMode("unread");
            setPage(1);
          }}
        >
          Unread only ({unread})
        </button>
      </div>

      <AsyncView
        query={notifications}
        empty={!notifications.isLoading && !notifications.isError && !rows.length}
        emptyTitle={filterMode === "unread" ? "No unread notifications" : "No notifications yet"}
        emptyDescription={
          filterMode === "unread"
            ? "You've read all your recent notifications. Switch to 'All' to review past updates."
            : "You're all caught up with clinic notices and updates."
        }
      >
        <div className="notification-list">
          {rows.map((entry) => {
            const isSelected = selectedIds.includes(entry._id);
            return (
              <article
                className={"notification-row " + (entry.isRead ? "" : "notification-unread")}
                key={entry._id}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(entry._id);
                  } else {
                    handleRowClick(entry);
                  }
                }}
                style={{ cursor: selectMode || entry.link ? "pointer" : "default" }}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => toggleSelect(entry._id, e)}
                    style={{ marginRight: "0.5rem" }}
                  />
                )}
                <span className="notification-dot" />
                <div style={{ flex: 1 }}>
                  <strong>{entry.title}</strong>
                  <p>{entry.message}</p>
                  <small>
                    {new Date(entry.createdAt).toLocaleString("en-IN")}
                    {entry.link ? " · Click to view details →" : ""}
                  </small>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {!entry.isRead && (
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={(e) => markRead(entry._id, e)}
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    style={{ color: "var(--color-danger, #ef4444)" }}
                    title="Delete notification"
                    onClick={(e) => handleDelete(entry._id, e)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </AsyncView>

      {total > 20 && (
        <div className="pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
          <button
            type="button"
            className="button button-outline button-small"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button
            type="button"
            className="button button-outline button-small"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
