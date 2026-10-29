import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  FileText,
  MessageSquareText,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api, downloadPdf } from "../api/domains.js";
import { apiBaseUrl, executeTokenRefresh } from "../api/client.js";
import { useAuthStore } from "../store/auth.js";
import { usePrimaryDentist } from "../hooks/usePrimaryDentist.js";
import { fetchPrimarySlotsWithFallback } from "../api/capabilities.js";
import { clinicDate, isPastSlot } from "../utils/booking.js";
import { FileUpload } from "../components/FileUpload.jsx";
import {
  AsyncView,
  Field,
  PageTitle,
  SectionPanel,
  StatusBadge,
  TextInput,
  useConfirm,
  useToast,
} from "../components/ui.jsx";
import { FDI_TEETH } from "../utils/teeth.js";
import { formatClinicDate } from "../utils/formatDate.js";

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const dateToday = () => new Date().toISOString().slice(0, 10);
const fmtDate = (date) => (date ? formatClinicDate(date) : "Date not set");
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

function useDentistProfile() {
  const profile = useAuthStore((state) => state.profile);
  const query = useQuery({
    queryKey: ["auth-profile"],
    queryFn: api.auth.me,
    enabled: !profile,
    retry: 1,
  });
  return { profile: profile || query.data?.data?.profile, query };
}

function useAction() {
  const queryClient = useQueryClient();
  const notify = useToast();
  return useMutation({
    mutationFn: ({ action, args = [] }) => action(...args),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      notify(result?.message || "Changes saved.");
    },
    onError: (error) => notify(error.message, "error"),
  });
}

export function DentistDashboard() {
  const user = useAuthStore((state) => state.user);
  const { profile } = useDentistProfile();
  const queryClient = useQueryClient();
  const notify = useToast();
  const stats = useQuery({
    queryKey: ["dashboard", "dentist"],
    queryFn: api.dashboard.dentist,
  });
  const visits = useQuery({
    queryKey: ["appointments", "dentist", dateToday()],
    queryFn: () => api.appointments.dentistMine({ date: dateToday() }),
  });
  const primary = usePrimaryDentist();
  const docProfile = profile || primary.dentist;
  const isVerified = Boolean(docProfile?.isVerified);
  const isAccepting = Boolean(docProfile?.isActive && (!docProfile?.pausedUntil || new Date(docProfile.pausedUntil) <= new Date()));
  const hasWeeklyHours = Boolean(docProfile?.weeklyAvailability?.some((day) => (day.slots || []).length > 0));
  const hasSlotLength = Boolean((docProfile?.slotDurationMinutes || docProfile?.slotDuration) > 0);
  const hasFee = Boolean(docProfile?.consultationFee > 0);
  const isReady = isVerified && isAccepting && hasWeeklyHours && hasSlotLength && hasFee;

  return (
    <div>
      <PageTitle
        eyebrow="Dentist workspace"
        title={`Good day, Dr. ${user?.name?.split(" ").at(-1) || ""}.`}
        description="Your schedule, patients and practice at a glance."
        actions={
          <Link to="/dentist/appointments" className="button button-primary">
            Open schedule <ArrowRight size={16} />
          </Link>
        }
      />
      {!isReady && (
        <div className="notice notice-warn" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <strong>Booking Readiness Checklist: Appointments are currently not fully bookable online.</strong>
            <span className="status-badge status-inactive">Not Bookable</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0.6rem", background: isVerified ? "#f0f8f6" : "#fff2f0", borderRadius: "6px" }}>
              <span>{isVerified ? "✓" : "✗"} Credentials verified</span>
              {!isVerified && <span style={{ fontSize: "0.75rem", color: "#d32f2f" }}>Awaiting admin</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0.6rem", background: isAccepting ? "#f0f8f6" : "#fff2f0", borderRadius: "6px" }}>
              <span>{isAccepting ? "✓" : "✗"} Accepting visits</span>
              {!isAccepting && (
                <button
                  type="button"
                  className="button button-primary button-small"
                  style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                  onClick={async () => {
                    try {
                      await api.dentists.toggleActive({ isActive: true });
                      notify("Resumed accepting appointments.");
                      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
                      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
                      queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
                    } catch (err) {
                      notify(err.message, "error");
                    }
                  }}
                >
                  Resume
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0.6rem", background: hasWeeklyHours ? "#f0f8f6" : "#fff2f0", borderRadius: "6px" }}>
              <span>{hasWeeklyHours ? "✓" : "✗"} Weekly schedule</span>
              {!hasWeeklyHours && (
                <Link to="/dentist/availability" className="button button-outline button-small" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  Set hours
                </Link>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0.6rem", background: hasSlotLength ? "#f0f8f6" : "#fff2f0", borderRadius: "6px" }}>
              <span>{hasSlotLength ? "✓" : "✗"} Slot length ({docProfile?.slotDurationMinutes || docProfile?.slotDuration || 0}m)</span>
              {!hasSlotLength && (
                <Link to="/dentist/availability" className="button button-outline button-small" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  Set slot
                </Link>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0.6rem", background: hasFee ? "#f0f8f6" : "#fff2f0", borderRadius: "6px" }}>
              <span>{hasFee ? "✓" : "✗"} Consultation fee ({rupees(docProfile?.consultationFee)})</span>
              {!hasFee && (
                <Link to="/dentist/profile" className="button button-outline button-small" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  Set fee
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="dashboard-metrics">
        <article>
          <span className="metric-icon metric-teal">
            <CalendarDays size={18} />
          </span>
          <small>All appointments</small>
          <strong>{stats.data?.data?.totalAppointments ?? "—"}</strong>
        </article>
        <article>
          <span className="metric-icon metric-lime">
            <Check size={18} />
          </span>
          <small>Completed visits</small>
          <strong>{stats.data?.data?.completedAppointments ?? "—"}</strong>
        </article>
        <article>
          <span className="metric-icon metric-blue">
            <MessageSquareText size={18} />
          </span>
          <small>Patient rating</small>
          <strong>
            {Number(stats.data?.data?.ratingAverage || 0).toFixed(1)}{" "}
            <small>/ 5</small>
          </strong>
        </article>
        <article>
          <span className="metric-icon metric-coral">
            <Activity size={18} />
          </span>
          <small>Month earnings</small>
          <strong>{rupees(stats.data?.data?.monthEarnings)}</strong>
        </article>
      </div>
      <SectionPanel
        title="Today’s schedule"
        description={dateToday()}
        actions={
          <Link className="text-link" to="/dentist/appointments">
            Full schedule <ArrowRight size={14} />
          </Link>
        }
      >
        <AsyncView
          query={visits}
          empty={
            !visits.isLoading &&
            !visits.isError &&
            !(visits.data?.data || []).length
          }
          emptyTitle="No visits scheduled today"
        >
          <div className="schedule-list">
            {(visits.data?.data || []).map((visit) => (
              <div className="schedule-row" key={visit._id}>
                <strong>{visit.startTime}</strong>
                <span>
                  <b>{visit.patient?.name || "Patient"}</b>
                  <small>{visit.reasonForVisit || visit.mode}</small>
                </span>
                <StatusBadge value={visit.status} />
                <Link
                  className="round-link"
                  to={`/dentist/appointments`}
                  aria-label="Open schedule"
                >
                  <ArrowRight size={15} />
                </Link>
              </div>
            ))}
          </div>
        </AsyncView>
      </SectionPanel>
    </div>
  );
}

export function DentistSchedule() {
  const [date, setDate] = useState(dateToday());
  const [status, setStatus] = useState("");
  const action = useAction();
  const { confirm, dialog } = useConfirm();
  const notify = useToast();
  const queryClient = useQueryClient();
  const primary = usePrimaryDentist();

  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(dateToday());
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const query = useQuery({
    queryKey: ["appointments", "dentist", date, status],
    queryFn: () =>
      api.appointments.dentistMine({ date, ...(status ? { status } : {}) }),
  });
  const items = query.data?.data || [];

  // Slots for reschedule modal
  const dentistId = rescheduleTarget?.dentist?._id || rescheduleTarget?.dentist || primary.dentistId;
  const reschedSlotsQuery = useQuery({
    queryKey: ["dentist-resched-slots", rescheduleDate, dentistId],
    queryFn: () => fetchPrimarySlotsWithFallback(rescheduleDate, dentistId),
    enabled: !!rescheduleTarget && !!rescheduleDate,
  });
  const reschedAvailableSlots = (reschedSlotsQuery.data || []).filter(
    (slot) => !isPastSlot(rescheduleDate, slot.startTime)
  );

  const cancelAppointment = async (item) => {
    const accepted = await confirm({
      title: "Cancel this appointment?",
      message: "The patient will be notified. Refund handling follows the clinic policy.",
      confirmText: "Cancel appointment",
      cancelText: "Keep appointment",
      danger: true,
    });
    if (accepted) action.mutate({ action: api.appointments.cancel, args: [item._id, "Cancelled by dentist"] });
  };

  const handleComplete = async (item) => {
    const accepted = await confirm({
      title: "Complete this visit?",
      message: `Are you sure you want to mark ${item.patient?.name || "patient"}'s visit as completed?`,
      confirmText: "Complete visit",
      cancelText: "Cancel",
    });
    if (accepted) {
      action.mutate({
        action: api.appointments.complete,
        args: [item._id],
      });
    }
  };

  const handleNoShow = async (item) => {
    const accepted = await confirm({
      title: "Mark as no-show?",
      message: `Mark ${item.patient?.name || "patient"} as a no-show? This records the absence.`,
      confirmText: "Yes, mark no-show",
      cancelText: "Cancel",
      danger: true,
    });
    if (accepted) {
      action.mutate({
        action: api.appointments.noShow,
        args: [item._id],
      });
    }
  };

  const openRescheduleModal = (item) => {
    setRescheduleTarget(item);
    setRescheduleDate(item.date >= dateToday() ? item.date : dateToday());
    setRescheduleSlot("");
    setRescheduleReason("");
  };

  const handleRescheduleSubmit = async (e) => {
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
        reason: rescheduleReason.trim() || undefined,
      });
      notify(res.message || "Appointment rescheduled successfully.");
      setRescheduleTarget(null);
      setRescheduleSlot("");
      setRescheduleReason("");
      queryClient.invalidateQueries({ queryKey: ["appointments", "dentist"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      setDate(rescheduleDate);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setRescheduleBusy(false);
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Patient visits"
        title="Schedule"
        description="Review appointments and take the actions available to your role."
      />
      <div className="filter-bar">
        <Field label="Date">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <TextInput
            as="select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {["pending", "confirmed", "completed", "cancelled", "no-show", "rescheduled"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </TextInput>
        </Field>
      </div>
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !items.length}
        emptyTitle="No appointments for this filter"
      >
        <div className="appointment-list">
          {items.map((item) => (
            <article className="appointment-row" key={item._id}>
              <div className="appointment-date">
                <CalendarDays size={17} />
                <span>
                  {fmtDate(item.date)}
                  <small>
                    {item.startTime} – {item.endTime}
                  </small>
                </span>
              </div>
              <div className="appointment-main">
                <h3>{item.patient?.name || "Patient"}</h3>
                <p>
                  {item.patient?.phone || ""} ·{" "}
                  {item.reasonForVisit || item.mode}
                </p>
                <span className="appointment-fees">
                  {item.mode} · payment {item.paymentStatus}
                  {item.status === "rescheduled" && item.rescheduledTo && (
                    <span style={{ marginLeft: "0.5rem", color: "#6366f1" }}>
                      · Rescheduled to {fmtDate(item.rescheduledTo?.date || item.rescheduledTo)}
                    </span>
                  )}
                </span>
              </div>
              <div className="appointment-status">
                <StatusBadge value={item.status} />
              </div>
              <div className="appointment-actions">
                {item.status === "pending" && (
                  <>
                    <button
                      className="button button-outline button-small"
                      disabled={item.paymentStatus !== "paid"}
                      title={
                        item.paymentStatus !== "paid"
                          ? "Payment is required before confirming."
                          : undefined
                      }
                      onClick={() =>
                        action.mutate({
                          action: api.appointments.confirm,
                          args: [item._id],
                        })
                      }
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => openRescheduleModal(item)}
                    >
                      Reschedule
                    </button>
                  </>
                )}
                {item.status === "confirmed" && (
                  <>
                    <Link
                      className="button button-quiet button-small"
                      to={`/dentist/patients/${item.patient?._id}`}
                    >
                      Patient record
                    </Link>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => openRescheduleModal(item)}
                    >
                      Reschedule
                    </button>
                    <button
                      className="button button-primary button-small"
                      onClick={() => handleComplete(item)}
                    >
                      Complete
                    </button>
                    <button
                      className="button button-quiet button-small"
                      onClick={() => handleNoShow(item)}
                    >
                      No-show
                    </button>
                    <Link
                      className="button button-outline button-small"
                      to={`/dentist/patients/${item.patient?._id || item.patient}?tab=prescriptions&appointmentId=${item._id}`}
                    >
                      Write Rx
                    </Link>
                    {item.mode === "video" && (
                      <Link
                        className="button button-outline button-small"
                        to={`/consultation/${item._id}/lobby`}
                      >
                        Join video
                      </Link>
                    )}
                  </>
                )}
                {["pending", "confirmed"].includes(item.status) && (
                  <button className="button button-quiet button-small" onClick={() => cancelAppointment(item)}>
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </AsyncView>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="modal-backdrop" onClick={() => setRescheduleTarget(null)}>
          <div className="modal-dialog modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.2rem", borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Reschedule Appointment</h2>
              <button type="button" className="icon-button" onClick={() => setRescheduleTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="stack-form" style={{ padding: "1.2rem" }}>
              <p style={{ fontSize: "0.9rem", color: "#475569", marginTop: 0 }}>
                Rescheduling <strong>{rescheduleTarget.patient?.name || "Patient"}</strong> from {fmtDate(rescheduleTarget.date)} at {rescheduleTarget.startTime} ({rescheduleTarget.mode}).
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "140px", overflowY: "auto", padding: "0.4rem 0" }}>
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
              <Field label="Reason / Message to patient (optional)">
                <textarea
                  className="input"
                  rows={2}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g. Schedule adjustment or doctor requested alternate time…"
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setRescheduleTarget(null)}>
                  Keep current time
                </button>
                <button type="submit" className="button button-primary" disabled={rescheduleBusy || !rescheduleSlot}>
                  {rescheduleBusy ? "Saving…" : "Save new time"}
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

export function DentistAvailability() {
  const { profile, query: authQuery } = useDentistProfile();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [schedule, setSchedule] = useState(null);
  const [userDuration, setUserDuration] = useState(null);
  const duration = userDuration ?? profile?.slotDurationMinutes ?? 30;
  const setDuration = setUserDuration;
  const [leave, setLeave] = useState("");
  const source = schedule || profile?.weeklyAvailability || [];
  const currentDay = (day) =>
    source.find((entry) => entry.day === day)?.slots || [];
  const setDay = (day, slots) =>
    setSchedule((old) => {
      const next = [...(old || profile?.weeklyAvailability || [])].filter(
        (entry) => entry.day !== day,
      );
      if (slots.length) next.push({ day, slots });
      return next.sort((a, b) => a.day - b.day);
    });
  const save = async () => {
    for (const day of source) {
      const ranges = day.slots || [];
      const sorted = [...ranges].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      if (
        sorted.some(
          (slot) =>
            !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime,
        ) ||
        sorted.some(
          (slot, index) =>
            index > 0 && sorted[index - 1].endTime > slot.startTime,
        )
      ) {
        notify(
          "Availability times must be valid, ordered and non-overlapping.",
          "error",
        );
        return;
      }
    }
    try {
      const result = await api.dentists.updateMe({
        weeklyAvailability: source,
        slotDurationMinutes: Number(duration),
      });
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const addLeave = async () => {
    if (!leave) return;
    const dates = [
      ...(profile?.unavailableDates || []).map((item) =>
        new Date(item).toISOString().slice(0, 10),
      ),
      leave,
    ];
    try {
      const result = await api.dentists.setUnavailableDates([
        ...new Set(dates),
      ]);
      notify(result.message || "Leave date added.");
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
      setLeave("");
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const removeLeave = async (dateToRemove) => {
    const dateStr = new Date(dateToRemove).toISOString().slice(0, 10);
    const dates = (profile?.unavailableDates || [])
      .map((item) => new Date(item).toISOString().slice(0, 10))
      .filter((d) => d !== dateStr);
    try {
      const result = await api.dentists.setUnavailableDates(dates);
      notify(result.message || "Leave date removed.");
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  if (authQuery.isLoading && !profile)
    return <div className="state-view">Loading your schedule…</div>;
  return (
    <div>
      <PageTitle
        eyebrow="Practice settings"
        title="Availability"
        description="Publish weekly windows and one-off leave dates. Times are clinic-local."
        actions={
          <button className="button button-primary" onClick={save}>
            Save availability <Check size={15} />
          </button>
        }
      />
      <SectionPanel
        title="Weekly hours"
        description="Overlapping or invalid time windows cannot be saved."
      >
        <Field label="Appointment length">
          <TextInput
            as="select"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            {[15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </TextInput>
        </Field>
        <div className="availability-list">
          {dayNames.map((name, day) => {
            const slots = currentDay(day);
            return (
              <div className="availability-day" key={day}>
                <div className="availability-day-head">
                  <strong>{name}</strong>
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={slots.length > 0}
                      onChange={(event) =>
                        setDay(
                          day,
                          event.target.checked
                            ? [{ startTime: "09:00", endTime: "17:00" }]
                            : [],
                        )
                      }
                    />
                    <span>{slots.length ? "Available" : "Off"}</span>
                  </label>
                </div>
                {slots.map((slot, index) => (
                  <div className="time-range" key={`${day}-${index}`}>
                    <TextInput
                      aria-label={`${name} start time`}
                      type="time"
                      value={slot.startTime}
                      onChange={(event) =>
                        setDay(
                          day,
                          slots.map((item, ix) =>
                            ix === index
                              ? { ...item, startTime: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>to</span>
                    <TextInput
                      aria-label={`${name} end time`}
                      type="time"
                      value={slot.endTime}
                      onChange={(event) =>
                        setDay(
                          day,
                          slots.map((item, ix) =>
                            ix === index
                              ? { ...item, endTime: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      className="button button-quiet button-small"
                      type="button"
                      onClick={() =>
                        setDay(
                          day,
                          slots.filter((_, ix) => ix !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {slots.length > 0 && (
                  <button
                    className="text-link add-window"
                    type="button"
                    onClick={() =>
                      setDay(day, [
                        ...slots,
                        { startTime: "09:00", endTime: "12:00" },
                      ])
                    }
                  >
                    <Plus size={14} /> Add time window
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionPanel>
      <SectionPanel
        title="Time off"
        description="Unavailable dates are excluded from published appointment slots."
      >
        <div className="inline-form">
          <Field label="Date">
            <TextInput
              type="date"
              min={dateToday()}
              value={leave}
              onChange={(event) => setLeave(event.target.value)}
            />
          </Field>
          <button className="button button-outline" onClick={addLeave}>
            Add leave date <Plus size={15} />
          </button>
        </div>
        <div className="chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          {(profile?.unavailableDates || []).map((item) => (
            <span key={String(item)} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', background: 'var(--color-surface-subtle, #f1f5f9)', borderRadius: '4px', fontSize: '0.85rem' }}>
              {fmtDate(item)}
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#64748b' }}
                onClick={() => removeLeave(item)}
                title="Remove leave date"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}

export function DentistProfilePage() {
  const { profile, query } = useDentistProfile();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [form, setForm] = useState(null);
  const values = form || {
    about: profile?.about || "",
    qualifications: (profile?.qualifications || []).join(", "),
    experienceYears: profile?.experienceYears || 0,
    consultationFee: profile?.consultationFee || 0,
    languages: (profile?.languages || []).join(", "),
    city: profile?.clinicAddress?.city || "",
    state: profile?.clinicAddress?.state || "",
    addressLine: profile?.clinicAddress?.addressLine || "",
    pincode: profile?.clinicAddress?.pincode || "",
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await api.dentists.updateMe({
        about: values.about,
        qualifications: values.qualifications
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        experienceYears: Number(values.experienceYears),
        consultationFee: Number(values.consultationFee),
        languages: values.languages
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        clinicAddress: {
          ...profile?.clinicAddress,
          city: values.city,
          state: values.state,
          addressLine: values.addressLine,
          pincode: values.pincode,
        },
      });
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseUntil, setPauseUntil] = useState("");
  const [pausingBusy, setPausingBusy] = useState(false);

  const handleToggle = async () => {
    if (profile?.isActive) {
      setPauseReason("");
      setPauseUntil("");
      setShowPauseModal(true);
    } else {
      try {
        const result = await api.dentists.toggleActive({ isActive: true });
        notify(result.message || "Resumed accepting appointments.");
        queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
        queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
        queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
      } catch (error) {
        notify(error.message, "error");
      }
    }
  };

  const confirmPause = async (e) => {
    if (e) e.preventDefault();
    setPausingBusy(true);
    try {
      const result = await api.dentists.toggleActive({
        isActive: false,
        reason: pauseReason || undefined,
        pausedUntil: pauseUntil || undefined,
      });
      notify(result.message || "Appointments paused.");
      setShowPauseModal(false);
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dentist-profile"] });
      queryClient.invalidateQueries({ queryKey: ["primary-dentist"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setPausingBusy(false);
    }
  };

  if (!profile && query.isLoading)
    return <div className="state-view">Loading your dentist profile…</div>;
  return (
    <div>
      <PageTitle
        eyebrow="Your public profile"
        title="Dentist profile"
        description="These details are shown to patients in public dentist discovery."
        actions={
          <button className="button button-outline" onClick={handleToggle}>
            {profile?.isActive
              ? "Pause new appointments"
              : "Accept appointments"}{" "}
          </button>
        }
      />
      {showPauseModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Pause new patient appointments</h3>
              <p>Patients will not be able to book new appointments while paused. Existing bookings remain unaffected.</p>
            </div>
            <form onSubmit={confirmPause}>
              <Field label="Reason for pausing (optional)" hint="E.g., Conference, personal leave, or clinic maintenance">
                <TextInput
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="e.g. Attending dental conference"
                />
              </Field>
              <Field label="Auto-resume date (optional)" hint="Appointments will automatically resume on this date">
                <TextInput
                  type="date"
                  min={dateToday()}
                  value={pauseUntil}
                  onChange={(e) => setPauseUntil(e.target.value)}
                />
              </Field>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={pausingBusy}
                  onClick={() => setShowPauseModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-danger"
                  disabled={pausingBusy}
                >
                  {pausingBusy ? "Pausing…" : "Confirm Pause"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <SectionPanel title="Professional details">
        <form className="admin-form-grid" onSubmit={save}>
          <Field label="Specialization">
            <TextInput disabled value={profile?.specialization || ""} />
          </Field>
          <Field label="Experience years">
            <TextInput
              type="number"
              min="0"
              value={values.experienceYears}
              onChange={(event) =>
                setForm({ ...values, experienceYears: event.target.value })
              }
            />
          </Field>
          <Field label="Consultation fee (INR)">
            <TextInput
              type="number"
              min="0"
              value={values.consultationFee}
              onChange={(event) =>
                setForm({ ...values, consultationFee: event.target.value })
              }
            />
          </Field>
          <Field label="Qualifications" hint="Separate values with commas">
            <TextInput
              value={values.qualifications}
              onChange={(event) =>
                setForm({ ...values, qualifications: event.target.value })
              }
            />
          </Field>
          <Field label="Languages" hint="Separate values with commas">
            <TextInput
              value={values.languages}
              onChange={(event) =>
                setForm({ ...values, languages: event.target.value })
              }
            />
          </Field>
          <Field label="About" className="field-wide">
            <TextInput
              as="textarea"
              rows={5}
              value={values.about}
              onChange={(event) =>
                setForm({ ...values, about: event.target.value })
              }
            />
          </Field>
          <Field label="Street address" className="field-wide">
            <TextInput
              value={values.addressLine}
              onChange={(event) =>
                setForm({ ...values, addressLine: event.target.value })
              }
            />
          </Field>
          <Field label="City">
            <TextInput
              value={values.city}
              onChange={(event) =>
                setForm({ ...values, city: event.target.value })
              }
            />
          </Field>
          <Field label="State">
            <TextInput
              value={values.state}
              onChange={(event) =>
                setForm({ ...values, state: event.target.value })
              }
            />
          </Field>
          <Field label="Postal code">
            <TextInput
              value={values.pincode}
              onChange={(event) =>
                setForm({ ...values, pincode: event.target.value })
              }
            />
          </Field>
          <button className="button button-primary">
            Save profile <Check size={15} />
          </button>
        </form>
      </SectionPanel>
      <div className="notice notice-info">
        Profile photo and contact details are not editable through the current
        dentist API.
      </div>
    </div>
  );
}

export function PatientDirectory({ mode = "staff" }) {
  const location = useLocation();
  const isAdmin = mode === "admin" || location.pathname.startsWith("/admin");
  const isDentist = mode === "dentist";
  const basePath = isDentist ? "/dentist" : isAdmin ? "/admin" : "/reception";

  const queryClient = useQueryClient();
  const notify = useToast();
  const [search, setSearch] = useState("");

  // Walk-in registration modal state
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
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "Family",
    allergies: "",
    chronicConditions: "",
  });

  const dentistPatients = useQuery({
    queryKey: ["patients", "dentist"],
    queryFn: async () => {
      try {
        return await api.dentists.myPatients();
      } catch (error) {
        if (error.status !== 404) throw error;
        const fallback = await api.appointments.dentistMine({});
        const patients = [
          ...new Map(
            (fallback.data || [])
              .filter((item) => item.patient?._id)
              .map((item) => [item.patient._id, item.patient]),
          ).values(),
        ];
        return { data: patients, limited: true };
      }
    },
    enabled: isDentist,
  });

  const patients = useQuery({
    queryKey: ["patients", search],
    queryFn: () => api.patients.list({ search, page: 1, limit: 50 }),
    enabled: !isDentist,
  });

  const listQuery = isDentist ? dentistPatients : patients;
  const list = listQuery.data?.data || [];

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
        emergencyContact: walkInForm.emergencyContactName ? {
          name: walkInForm.emergencyContactName.trim(),
          phone: walkInForm.emergencyContactPhone.trim(),
          relation: walkInForm.emergencyContactRelation.trim(),
        } : undefined,
        allergies: walkInForm.allergies ? walkInForm.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
        chronicConditions: walkInForm.chronicConditions ? walkInForm.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      const res = await api.patients.createByStaff(payload);
      notify(res.message || "Patient registered successfully.");
      setShowWalkInModal(false);
      setWalkInForm({
        name: "",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "other",
        address: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        emergencyContactRelation: "Family",
        allergies: "",
        chronicConditions: "",
      });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err) {
      if (err.status === 409 && (err.data?.existingUser || err.data?.existingPatient)) {
        setWalkInDuplicate(err.data.existingPatient || err.data.existingUser);
      } else {
        notify(err.message || "Failed to register patient.", "error");
      }
    } finally {
      setWalkInBusy(false);
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Patient care"
        title="Patients"
        description={
          isDentist
            ? "Patients seen in your appointment schedule."
            : "Find a patient account, register new walk-in patients, and inspect Patient 360 records."
        }
        actions={
          !isDentist && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setShowWalkInModal(true);
                setWalkInDuplicate(null);
              }}
            >
              <Plus size={16} /> Register patient
            </button>
          )
        }
      />
      {isDentist && dentistPatients.data?.limited && (
        <div className="notice notice-warn">
          Showing unique patients from your appointment schedule because the
          patient-list endpoint is not available.
        </div>
      )}
      {!isDentist && (
        <label className="search-field compact-search">
          <Search size={17} />
          <input
            placeholder="Search by name, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}

      <AsyncView
        query={listQuery}
        empty={!listQuery.isLoading && !listQuery.isError && !list.length}
        emptyTitle="No patients found"
      >
        <div className="people-list">
          {list.map((person) => (
            <Link
              className="people-row people-row-link"
              key={person._id}
              to={`${basePath}/patients/${person._id}`}
            >
              <span className="avatar avatar-large">
                <UserRound size={18} />
              </span>
              <span>
                <strong>{person.name}</strong>
                <small>
                  {person.email || person.phone || "Patient account"}
                </small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </AsyncView>

      {/* Walk-in patient registration modal */}
      {showWalkInModal && (
        <div className="modal-backdrop" onClick={() => setShowWalkInModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", width: "95%" }}>
            <div className="modal-header">
              <h2>Register New Patient</h2>
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
                  <Link
                    to={`${basePath}/patients/${walkInDuplicate._id || walkInDuplicate.patientId}`}
                    className="button button-primary button-small"
                    style={{ marginTop: "0.5rem", display: "inline-block" }}
                    onClick={() => setShowWalkInModal(false)}
                  >
                    Open Existing Patient Profile
                  </Link>
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
    </div>
  );
}

export function ClinicalRecord({ readOnly = false }) {
  const { patientId } = useParams();
  const [tab, setTab] = useState("plans");
  const [tooth, setTooth] = useState(null);
  const queryClient = useQueryClient();
  const notify = useToast();
  const plans = useQuery({
    queryKey: ["plans", patientId],
    queryFn: () => api.plans.forPatient(patientId),
    enabled: tab === "plans",
  });
  const records = useQuery({
    queryKey: ["records", patientId],
    queryFn: () => api.records.forPatient(patientId),
    enabled: tab === "records",
  });
  const prescriptions = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: () => api.prescriptions.forPatient(patientId),
    enabled: tab === "prescriptions",
  });
  const chart = useQuery({
    queryKey: ["chart", patientId],
    queryFn: () => api.charts.get(patientId),
    enabled: tab === "chart",
  });
  const [medicine, setMedicine] = useState([
    { name: "", dosage: "", frequency: "1-0-1", durationDays: "5", instructions: "After food" },
  ]);
  const [diagnosis, setDiagnosis] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patients.detail(patientId),
  });
  const patient = patientQuery.data?.data?.user || patientQuery.data?.data;
  if (tab === "records" && !readOnly)
    return <ClinicalRecordsWorkspace patientId={patientId} query={records} />;
  const searchParams = new URLSearchParams(location.search);
  const appointmentIdFromUrl = searchParams.get("appointmentId");

  const savePrescription = async (event) => {
    event.preventDefault();
    if (!medicine.length || !medicine[0].name.trim()) {
      notify("Please add at least one medicine.", "error");
      return;
    }
    try {
      const result = await api.prescriptions.create({
        patientId,
        appointmentId: appointmentIdFromUrl || undefined,
        diagnosis,
        additionalNotes,
        followUpDate: followUpDate || undefined,
        medicines: medicine.map((item) => ({
          ...item,
          durationDays: Number(item.durationDays) || 1,
        })),
      });
      notify(result.message || "Prescription issued successfully.");
      queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
      setDiagnosis("");
      setAdditionalNotes("");
      setFollowUpDate("");
      setMedicine([
        {
          name: "",
          dosage: "",
          frequency: "1-0-1",
          durationDays: "5",
          instructions: "After food",
        },
      ]);
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleVoidPrescription = async (prescriptionId) => {
    let voidReason = "Voided by prescriber";
    const ok = await confirm({
      title: "Void this prescription?",
      message: "Are you sure you want to void this prescription? A voided prescription cannot be used and will be marked as invalid.",
      confirmText: "Yes, void prescription",
      cancelText: "Cancel",
      danger: true,
      children: (
        <div style={{ marginTop: "0.8rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
            Reason for voiding
          </label>
          <input
            className="input"
            defaultValue={voidReason}
            onChange={(e) => {
              voidReason = e.target.value;
            }}
            placeholder="e.g. Dose correction or patient intolerance..."
          />
        </div>
      ),
    });
    if (!ok) return;

    try {
      const res = await api.prescriptions.void(prescriptionId, voidReason);
      notify(res.message || "Prescription voided.");
      queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
    } catch (err) {
      notify(err.message, "error");
    }
  };
  const saveTooth = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.charts.updateTooth(patientId, tooth, {
        condition: data.get("condition"),
        notes: data.get("notes"),
      });
      notify(result.message);
      setTooth(null);
      queryClient.invalidateQueries({ queryKey: ["chart", patientId] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow={readOnly ? "Clinical record / view only" : "Clinical view"}
        title={patient?.name || "Patient record"}
        description={`${patient?.email || ""}${patient?.phone ? ` · ${patient.phone}` : ""}`}
      />
      <div className="tabs" role="tablist" aria-label="Patient clinical tabs">
        {[
          ["plans", "Treatment plans"],
          ["prescriptions", "Prescriptions"],
          ["records", "Records"],
          ["chart", "Dental chart"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "tab tab-active" : "tab"}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "plans" && (
        <SectionPanel
          title="Treatment plans"
          actions={
            !readOnly && (
              <CreatePlan
                patientId={patientId}
                onCreated={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["plans", patientId],
                  })
                }
              />
            )
          }
        >
          <AsyncView
            query={plans}
            empty={
              !plans.isLoading &&
              !plans.isError &&
              !(plans.data?.data || []).length
            }
            emptyTitle="No treatment plans yet"
          >
            {(plans.data?.data || []).map((plan) => (
              <div className="plan-card" key={plan._id}>
                <div className="section-panel-heading">
                  <h3>{plan.title}</h3>
                  <StatusBadge value={plan.status} />
                </div>
                {(plan.steps || []).map((step) => (
                  <div className="plan-step" key={step._id}>
                    <span>{step.treatment?.name || "Treatment"}</span>
                    {readOnly ? (
                      <StatusBadge value={step.status} />
                    ) : (
                      <select
                        aria-label="Update step status"
                        value={step.status}
                        onChange={async (event) => {
                          try {
                            const result = await api.plans.updateStep(
                              plan._id,
                              step._id,
                              { status: event.target.value },
                            );
                            notify(result.message);
                            queryClient.invalidateQueries({
                              queryKey: ["plans", patientId],
                            });
                          } catch (error) {
                            notify(error.message, "error");
                          }
                        }}
                      >
                        <option value="planned">Planned</option>
                        <option value="in-progress">In progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </AsyncView>
        </SectionPanel>
      )}
      {tab === "prescriptions" && (
        <SectionPanel
          title={readOnly ? "Prescriptions" : "Issue a prescription"}
        >
          {!readOnly && (
            <fieldset className="clinical-fieldset" style={{ border: "1px solid var(--border-color, #e2e8f0)", padding: "1.2rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
              <form className="stack-form" onSubmit={savePrescription}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <Field label="Diagnosis / Condition">
                    <TextInput
                      value={diagnosis}
                      placeholder="e.g. Acute pulpitis, Post-extraction care"
                      onChange={(event) => setDiagnosis(event.target.value)}
                    />
                  </Field>
                  <Field label="Follow-up Date (optional)">
                    <TextInput
                      type="date"
                      value={followUpDate}
                      onChange={(event) => setFollowUpDate(event.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    Prescribed Medicines *
                  </label>
                  {medicine.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 2fr auto",
                        gap: "0.5rem",
                        alignItems: "flex-end",
                        marginBottom: "0.8rem",
                        background: "var(--color-surface-subtle, #f8fafc)",
                        padding: "0.8rem",
                        borderRadius: "6px",
                      }}
                    >
                      <Field label="Medicine Name *">
                        <TextInput
                          required
                          placeholder="e.g. Amoxicillin"
                          value={item.name}
                          onChange={(e) =>
                            setMedicine((all) =>
                              all.map((r, ix) => (ix === index ? { ...r, name: e.target.value } : r))
                            )
                          }
                        />
                      </Field>
                      <Field label="Dosage *">
                        <TextInput
                          required
                          placeholder="e.g. 500mg"
                          value={item.dosage}
                          onChange={(e) =>
                            setMedicine((all) =>
                              all.map((r, ix) => (ix === index ? { ...r, dosage: e.target.value } : r))
                            )
                          }
                        />
                      </Field>
                      <Field label="Frequency *">
                        <TextInput
                          as="select"
                          value={item.frequency}
                          onChange={(e) =>
                            setMedicine((all) =>
                              all.map((r, ix) => (ix === index ? { ...r, frequency: e.target.value } : r))
                            )
                          }
                        >
                          <option value="1-0-1">1-0-1 (Twice daily)</option>
                          <option value="1-1-1">1-1-1 (Thrice daily)</option>
                          <option value="1-0-0">1-0-0 (Morning only)</option>
                          <option value="0-0-1">0-0-1 (Night only)</option>
                          <option value="1-1-1-1">1-1-1-1 (Four times daily)</option>
                          <option value="SOS">SOS (As needed)</option>
                          <option value="Once a week">Once a week</option>
                        </TextInput>
                      </Field>
                      <Field label="Days *">
                        <TextInput
                          type="number"
                          min={1}
                          max={365}
                          required
                          value={item.durationDays}
                          onChange={(e) =>
                            setMedicine((all) =>
                              all.map((r, ix) => (ix === index ? { ...r, durationDays: e.target.value } : r))
                            )
                          }
                        />
                      </Field>
                      <Field label="Instructions">
                        <TextInput
                          placeholder="e.g. After food"
                          value={item.instructions}
                          onChange={(e) =>
                            setMedicine((all) =>
                              all.map((r, ix) => (ix === index ? { ...r, instructions: e.target.value } : r))
                            )
                          }
                        />
                      </Field>
                      {medicine.length > 1 && (
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ color: "var(--color-danger, #ef4444)", height: "38px" }}
                          title="Remove medicine"
                          onClick={() => setMedicine((all) => all.filter((_, ix) => ix !== index))}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Field label="Additional Notes / Advice (optional)">
                  <textarea
                    className="input"
                    rows={2}
                    value={additionalNotes}
                    placeholder="e.g. Warm saline rinses, avoid hard food on right side..."
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                  />
                </Field>

                <div className="inline-actions" style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() =>
                      setMedicine((all) => [
                        ...all,
                        {
                          name: "",
                          dosage: "",
                          frequency: "1-0-1",
                          durationDays: "5",
                          instructions: "After food",
                        },
                      ])
                    }
                  >
                    <Plus size={15} /> Add another medicine
                  </button>
                  <button className="button button-primary" type="submit">
                    Issue prescription <ArrowRight size={15} />
                  </button>
                </div>
              </form>
            </fieldset>
          )}

          <AsyncView
            query={prescriptions}
            empty={
              !prescriptions.isLoading &&
              !prescriptions.isError &&
              !(prescriptions.data?.data || []).length
            }
            emptyTitle="No prescriptions issued"
          >
            {(prescriptions.data?.data || []).map((entry) => {
              const isVoided = entry.status === "voided";
              return (
                <div
                  className="record-row"
                  key={entry._id}
                  style={{
                    opacity: isVoided ? 0.75 : 1,
                    background: isVoided ? "#fef2f2" : undefined,
                    border: isVoided ? "1px solid #fecaca" : undefined,
                  }}
                >
                  <FileText size={18} color={isVoided ? "#dc2626" : undefined} />
                  <div className="record-row-content">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong>{entry.diagnosis || "Prescription"}</strong>
                      {isVoided && (
                        <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.4rem", background: "#fee2e2", color: "#dc2626", borderRadius: "4px", fontWeight: 700 }}>
                          VOIDED
                        </span>
                      )}
                    </div>
                    <span>
                      {fmtDate(entry.createdAt)} · {(entry.medicines || []).length} medicines
                      {isVoided && entry.voidReason ? ` · Reason: ${entry.voidReason}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    {!readOnly && !isVoided && (
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        style={{ color: "var(--color-danger, #ef4444)" }}
                        onClick={() => handleVoidPrescription(entry._id)}
                      >
                        Void
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() =>
                        downloadPdf(`/prescriptions/${entry._id}/pdf`, `prescription-${entry._id}.pdf`)
                      }
                    >
                      Download PDF <Download size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </AsyncView>
        </SectionPanel>
      )}
      {tab === "records" && (
        <SectionPanel title="Medical records">
          <AsyncView
            query={records}
            empty={
              !records.isLoading &&
              !records.isError &&
              !(records.data?.data || []).length
            }
            emptyTitle="No medical records"
          >
            <div className="record-list">
              {(records.data?.data || []).map((entry) => (
                <div className="record-row" key={entry._id}>
                  <FileText size={18} />
                  <div className="record-row-content">
                    <strong>{entry.title}</strong>
                    <span>
                      {entry.type} · {fmtDate(entry.createdAt)}
                    </span>
                  </div>
                  <a
                    className="button button-quiet button-small"
                    href={entry.file?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open file <ArrowRight size={14} />
                  </a>
                </div>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      )}
      {tab === "chart" && (
        <SectionPanel
          title="Dental chart"
          description={
            readOnly
              ? "Read-only chart details."
              : "Select a tooth to add a clinical note."
          }
        >
          <div className="tooth-chart">
            {[0, 1].map((row) => (
              <div className={`tooth-row tooth-row-${row}`} key={row}>
                {FDI_TEETH
                  .slice(row * 16, row * 16 + 16)
                  .map((number) => {
                    const entry = chart.data?.data?.teeth?.find(
                      (item) => item.toothNumber === number,
                    );
                    return (
                      <button
                        disabled={readOnly}
                        className={`tooth-cell ${entry ? "tooth-recorded" : ""}`}
                        key={number}
                        onClick={() => setTooth(number)}
                      >
                        <span>{number}</span>
                        <strong>
                          {entry?.condition?.slice(0, 1)?.toUpperCase() || "✓"}
                        </strong>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <AsyncView query={chart} empty={false}>
            {tooth && !readOnly && (
              <form className="inline-form tooth-editor" onSubmit={saveTooth}>
                <strong>Tooth {tooth}</strong>
                <Field label="Condition">
                  <TextInput
                    name="condition"
                    required
                    placeholder="e.g. filling, caries, healthy"
                  />
                </Field>
                <Field label="Notes">
                  <TextInput name="notes" placeholder="Clinical notes" />
                </Field>
                <button className="button button-primary">
                  Save tooth <Check size={14} />
                </button>
              </form>
            )}
          </AsyncView>
        </SectionPanel>
      )}
    </div>
  );
}

function ClinicalRecordsWorkspace({ patientId, query }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("other");
  const [filterType, setFilterType] = useState("");
  const records = query.data?.data || [];
  const visibleRecords = filterType
    ? records.filter((record) => record.type === filterType)
    : records;

  const handleUpload = async (file, onProgress) => {
    const payload = new FormData();
    payload.append("patientId", patientId);
    payload.append("file", file);
    payload.append("title", title || file.name);
    payload.append("type", type);
    const result = await api.records.upload(payload, { onUploadProgress: onProgress });
    setTitle("");
    await queryClient.invalidateQueries({ queryKey: ["records", patientId] });
    return result;
  };
  return (
    <div>
      <PageTitle
        eyebrow="Clinical records"
        title="Patient records"
        actions={
          <Link
            className="button button-quiet"
            to={`/dentist/patients/${patientId}`}
          >
            Back to clinical view
          </Link>
        }
      />
      <SectionPanel
        title="Upload a record"
        description="The file is sent to the backend's configured storage provider."
      >
        <FileUpload
          accept="image/jpeg,image/png,image/webp,application/pdf"
          maxSizeMB={10}
          onUpload={handleUpload}
          label="Choose or drop a medical document"
          hint="JPG, PNG, WEBP, or PDF file up to 10 MB"
          submitLabel="Upload record"
          extraFields={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Field label="Record title">
                <TextInput
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Treatment X-ray"
                />
              </Field>
              <Field label="Type">
                <TextInput
                  as="select"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {["xray", "lab-report", "scan", "doctor-note", "other"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value.replace("-", " ")}
                      </option>
                    ),
                  )}
                </TextInput>
              </Field>
            </div>
          }
          onSuccess={(result) => {
            notify(result?.message || "Record uploaded successfully.");
          }}
        />
      </SectionPanel>
      <SectionPanel title="Records">
        <div className="filter-bar">
          <Field label="Filter by type">
            <TextInput
              as="select"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
            >
              <option value="">All records</option>
              {["xray", "lab-report", "scan", "doctor-note", "other"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.replace("-", " ")}
                  </option>
                ),
              )}
            </TextInput>
          </Field>
        </div>
        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && !visibleRecords.length}
          emptyTitle="No records match this filter"
        >
          <div className="record-list">
            {visibleRecords.map((record) => (
              <article className="record-row" key={record._id}>
                <span className="record-type-icon">
                  <FileText size={17} />
                </span>
                <div className="record-row-content">
                  <strong>{record.title}</strong>
                  <span>
                    {record.type} · {fmtDate(record.createdAt)}
                  </span>
                </div>
                <a
                  className="button button-quiet button-small"
                  href={record.file?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open file <ArrowRight size={14} />
                </a>
              </article>
            ))}
          </div>
        </AsyncView>
      </SectionPanel>
    </div>
  );
}

function CreatePlan({ patientId, onCreated }) {
  const treatments = useQuery({
    queryKey: ["treatments"],
    queryFn: api.treatments.list,
  });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState([
    { treatment: "", name: "", cost: 0, toothNumbers: [], status: "planned" },
  ]);
  const notify = useToast();

  const handleTreatmentChange = (index, trId) => {
    const catalogItem = (treatments.data?.data || []).find((t) => t._id === trId);
    setSteps((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              treatment: trId,
              name: catalogItem?.name || s.name,
              cost: catalogItem?.defaultCost ?? s.cost ?? 0,
            }
          : s
      )
    );
  };

  const handleStepFieldChange = (index, field, value) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const toggleTooth = (index, toothNum) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const current = s.toothNumbers || [];
        const exists = current.includes(toothNum);
        const updated = exists
          ? current.filter((n) => n !== toothNum)
          : [...current, toothNum].sort((a, b) => a - b);
        return { ...s, toothNumbers: updated };
      })
    );
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { treatment: "", name: "", cost: 0, toothNumbers: [], status: "planned" },
    ]);
  };

  const removeStep = (index) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCost = steps.reduce((sum, s) => sum + Number(s.cost || 0), 0);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      notify("Please provide a plan title.", "error");
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].name && !steps[i].treatment) {
        notify(`Please select or enter a treatment procedure for step ${i + 1}.`, "error");
        return;
      }
    }

    setBusy(true);
    try {
      const payload = {
        patientId,
        title,
        notes,
        followUpRequired,
        followUpDate: followUpRequired && followUpDate ? followUpDate : undefined,
        steps: steps.map((s) => ({
          treatment: s.treatment || undefined,
          name: s.name || "Dental Procedure",
          cost: Number(s.cost || 0),
          toothNumbers: s.toothNumbers || [],
          status: s.status || "planned",
        })),
      };

      const result = await api.plans.create(payload);
      notify(result.message || "Treatment plan created.");
      setOpen(false);
      setTitle("");
      setNotes("");
      setFollowUpRequired(false);
      setFollowUpDate("");
      setSteps([{ treatment: "", name: "", cost: 0, toothNumbers: [], status: "planned" }]);
      onCreated();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="button button-outline button-small"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={15} /> New plan
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "700px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header">
              <h2>Create Treatment Plan</h2>
              <button type="button" className="icon-button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="stack-form" style={{ padding: "1.2rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Field label="Plan title *" className="field-wide">
                  <TextInput
                    required
                    placeholder="e.g. Root Canal Therapy & Crown"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field label="Clinical notes" className="field-wide">
                  <TextInput
                    as="textarea"
                    rows={2}
                    placeholder="Clinical diagnosis, patient preferences or notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
              </div>

              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                  <label className="field-label" style={{ fontWeight: 600 }}>Treatment Steps ({steps.length})</label>
                  <button type="button" className="button button-quiet button-small" onClick={addStep}>
                    <Plus size={14} /> Add step
                  </button>
                </div>

                <div style={{ display: "grid", gap: "1rem" }}>
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "0.8rem",
                        borderRadius: "8px",
                        border: "1px solid #dbe5e1",
                        background: "#fafcfb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <strong>Step {idx + 1}</strong>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            className="button button-quiet button-small"
                            style={{ color: "#d32f2f", padding: "2px 6px" }}
                            onClick={() => removeStep(idx)}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                        <Field label="Treatment catalog item">
                          <TextInput
                            as="select"
                            value={step.treatment}
                            onChange={(e) => handleTreatmentChange(idx, e.target.value)}
                          >
                            <option value="">Custom / Choose procedure</option>
                            {(treatments.data?.data || []).map((item) => (
                              <option value={item._id} key={item._id}>
                                {item.name} ({rupees(item.defaultCost)})
                              </option>
                            ))}
                          </TextInput>
                        </Field>

                        <Field label="Procedure step name *">
                          <TextInput
                            required
                            placeholder="e.g. Molar Access & Canal Cleaning"
                            value={step.name}
                            onChange={(e) => handleStepFieldChange(idx, "name", e.target.value)}
                          />
                        </Field>

                        <Field label="Estimated cost (INR) *">
                          <TextInput
                            type="number"
                            min="0"
                            required
                            value={step.cost}
                            onChange={(e) => handleStepFieldChange(idx, "cost", e.target.value)}
                          />
                        </Field>

                        <Field label="Initial step status">
                          <TextInput
                            as="select"
                            value={step.status}
                            onChange={(e) => handleStepFieldChange(idx, "status", e.target.value)}
                          >
                            <option value="planned">Planned</option>
                            <option value="in-progress">In progress</option>
                            <option value="completed">Completed</option>
                          </TextInput>
                        </Field>
                      </div>

                      {/* FDI Tooth picker */}
                      <div style={{ marginTop: "0.6rem" }}>
                        <label style={{ fontSize: "0.8rem", color: "#5d6e69", display: "block", marginBottom: "0.3rem" }}>
                          Tooth Numbers (FDI): {step.toothNumbers?.length ? step.toothNumbers.join(", ") : "General / All"}
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", maxHeight: "80px", overflowY: "auto" }}>
                          {FDI_TEETH.map((num) => {
                            const isSelected = (step.toothNumbers || []).includes(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  border: isSelected ? "1px solid #137a76" : "1px solid #cbd5e1",
                                  background: isSelected ? "#137a76" : "#fff",
                                  color: isSelected ? "#fff" : "#334155",
                                  cursor: "pointer",
                                }}
                                onClick={() => toggleTooth(idx, num)}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Follow-up section */}
              <div style={{ marginTop: "1rem", paddingTop: "0.8rem", borderTop: "1px solid #e7eeeb" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginBottom: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={followUpRequired}
                    onChange={(e) => setFollowUpRequired(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Follow-up consultation required</span>
                </label>
                {followUpRequired && (
                  <Field label="Recommended follow-up date">
                    <TextInput
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </Field>
                )}
              </div>

              {/* Total & Submit */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.2rem", paddingTop: "0.8rem", borderTop: "1px solid #e7eeeb" }}>
                <div>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Total Estimated Cost: </span>
                  <strong style={{ fontSize: "1.1rem", color: "#137a76" }}>{rupees(totalCost)}</strong>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" className="button button-quiet" onClick={() => setOpen(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={busy}>
                    {busy ? "Saving Plan…" : "Create Treatment Plan"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function DentistReviews() {
  const { profile } = useDentistProfile();
  const query = useQuery({
    queryKey: ["reviews", profile?._id],
    queryFn: () => api.reviews.forDentist(profile._id),
    enabled: !!profile?._id,
  });
  const [replies, setReplies] = useState({});
  const notify = useToast();
  const submitReply = async (id) => {
    try {
      const result = await api.reviews.reply(id, replies[id] || "");
      notify(result.message);
      query.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const reviews = query.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Patient feedback"
        title="Reviews"
        description="Read patient feedback and reply to reviews about your care."
      />
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !reviews.length}
        emptyTitle="No reviews yet"
      >
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review._id}>
              <div className="section-panel-heading">
                <span>
                  <strong>{review.patient?.name || "Patient"}</strong>
                  <small>{fmtDate(review.createdAt)}</small>
                </span>
                <span className="review-stars">
                  {"★".repeat(review.rating || 0)}
                </span>
              </div>
              <p>{review.comment || "No written comment."}</p>
              {review.reply?.text ? (
                <div className="review-reply">
                  <strong>Your reply</strong>
                  <p>{review.reply.text}</p>
                </div>
              ) : (
                <div className="inline-form">
                  <Field label="Reply">
                    <TextInput
                      value={replies[review._id] || ""}
                      onChange={(event) =>
                        setReplies({
                          ...replies,
                          [review._id]: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <button
                    className="button button-outline button-small"
                    onClick={() => submitReply(review._id)}
                  >
                    Reply <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </AsyncView>
    </div>
  );
}

export function QueuePage({ role = "dentist" }) {
  const isDentist = role === "dentist";
  const dentistProfile = useDentistProfile();
  const primaryDoctor = usePrimaryDentist();
  const [date, setDate] = useState(dateToday());
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'waiting', 'in-progress', 'done'
  const [lastCompletedVisit, setLastCompletedVisit] = useState(null);

  // Walk-in modal state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    name: "",
    phone: "",
    email: "",
    gender: "other",
    address: "",
  });

  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const user = useAuthStore((state) => state.user);

  const dentistId = isDentist ? dentistProfile.profile?._id : primaryDoctor.dentistId;

  const queue = useQuery({
    queryKey: ["queue", dentistId, date],
    queryFn: () => api.queue.get(dentistId, date),
    enabled: !!dentistId,
    refetchInterval: socketConnected ? false : 8000,
    refetchIntervalInBackground: false,
  });

  const todayAppointments = useQuery({
    queryKey: ["queue-today-appointments", date],
    queryFn: () => api.appointments.all({ date, page: 1, limit: 50 }),
    enabled: !isDentist,
  });

  const patientSearchResults = useQuery({
    queryKey: ["patient-search-queue", patientSearch],
    queryFn: () => api.patients.list({ search: patientSearch, limit: 6 }),
    enabled: !isDentist && patientSearch.length >= 2,
  });

  useEffect(() => {
    if (!dentistId || !user?.role || !useAuthStore.getState().accessToken)
      return undefined;
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL || apiBaseUrl.replace(/\/api\/?$/, "");

    const socket = io(socketUrl, {
      auth: (cb) => {
        cb({ token: useAuthStore.getState().accessToken });
      },
      reconnection: true,
    });

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("queue:join", dentistId);
    });

    socket.on("connect_error", async (err) => {
      if (err.message && (err.message.includes("Invalid or expired") || err.message.includes("token"))) {
        try {
          const { refreshToken } = useAuthStore.getState();
          if (refreshToken) {
            await executeTokenRefresh(refreshToken);
            socket.auth = { token: useAuthStore.getState().accessToken };
            socket.connect();
          }
        } catch {
          setSocketConnected(false);
        }
      } else {
        setSocketConnected(false);
      }
    });

    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("queue:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["queue", dentistId, date] });
      queryClient.invalidateQueries({ queryKey: ["queue-today-appointments", date] });
    });

    return () => {
      socket.emit("queue:leave", dentistId);
      socket.disconnect();
      setSocketConnected(false);
    };
  }, [dentistId, date, user?.role, queryClient]);

  const addToQueue = async (patientToQueue, apptId) => {
    const targetPatientId = patientToQueue?._id || patientToQueue?.user?._id;
    if (!targetPatientId && !apptId) {
      notify("Select a registered patient account or an appointment to check in.", "error");
      return;
    }
    try {
      const result = await api.queue.checkIn({
        dentistId,
        patientId: targetPatientId || undefined,
        appointmentId: apptId || undefined,
        date,
      });
      notify(result.message);
      setSelectedPatient(null);
      setPatientSearch("");
      queue.refetch();
      todayAppointments.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleRegisterAndCheckIn = async (e) => {
    e.preventDefault();
    if (!walkInForm.name.trim() || !walkInForm.phone.trim()) {
      notify("Patient name and phone are required.", "error");
      return;
    }
    setWalkInBusy(true);
    try {
      const patientRes = await api.patients.createByStaff({
        name: walkInForm.name.trim(),
        phone: walkInForm.phone.trim(),
        email: walkInForm.email.trim() || undefined,
        gender: walkInForm.gender || "other",
        address: walkInForm.address.trim() || undefined,
      });
      const createdPatient = patientRes.data?.patient || patientRes.data;
      const patientId = createdPatient?._id || createdPatient?.user?._id;

      const checkInRes = await api.queue.checkIn({
        dentistId,
        patientId,
        date,
      });
      notify(checkInRes.message || "Walk-in patient registered and checked into queue.", "success");
      setShowWalkInModal(false);
      setWalkInForm({ name: "", phone: "", email: "", gender: "other", address: "" });
      queue.refetch();
    } catch (err) {
      notify(err.message || "Failed to register and check in walk-in patient.", "error");
    } finally {
      setWalkInBusy(false);
    }
  };

  const handleCallNext = async (entry) => {
    try {
      const result = await api.queue.call(entry._id);
      notify(result.message);
      queue.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleComplete = async (entry) => {
    const approved = await confirm({
      title: `Mark Token #${entry.tokenNumber} as completed?`,
      description: `Patient: ${entry.patient?.name || entry.walkInName || "Patient"}. This marks their clinical visit as completed.`,
      confirmLabel: "Complete visit",
      cancelLabel: "Keep in queue",
    });
    if (!approved) return;
    try {
      const result = await api.queue.complete(entry._id);
      notify(result.message || "Visit marked as completed.", "success");
      setLastCompletedVisit(result.data || { entry });
      queue.refetch();
      todayAppointments.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleSkip = async (entry) => {
    const approved = await confirm({
      title: `Skip Token #${entry.tokenNumber}?`,
      description: `Patient: ${entry.patient?.name || entry.walkInName || "Patient"}. They will be marked as skipped.`,
      confirmLabel: "Skip patient",
      cancelLabel: "Keep in queue",
      danger: true,
    });
    if (!approved) return;
    try {
      const result = await api.queue.skip(entry._id);
      notify(result.message);
      queue.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const handleRemove = async (entry) => {
    const approved = await confirm({
      title: `Remove Token #${entry.tokenNumber} from queue?`,
      description: `Patient: ${entry.patient?.name || entry.walkInName || "Patient"}. This removes their active waiting entry.`,
      confirmLabel: "Remove from queue",
      cancelLabel: "Keep in queue",
      danger: true,
    });
    if (!approved) return;
    try {
      const result = await api.queue.remove(entry._id);
      notify(result.message);
      queue.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const entries = queue.data?.data || [];
  const waitingEntries = entries.filter((e) => e.status === "waiting");
  const inProgressEntries = entries.filter((e) => e.status === "in-progress");
  const doneEntries = entries.filter((e) => ["completed", "skipped", "cancelled"].includes(e.status));

  const filteredEntries =
    activeTab === "waiting"
      ? waitingEntries
      : activeTab === "in-progress"
      ? inProgressEntries
      : activeTab === "done"
      ? doneEntries
      : entries;

  const registeredAppts = (todayAppointments.data?.data || []).filter(
    (a) => ["pending", "confirmed"].includes(a.status) && !entries.some((e) => (e.appointment?._id || e.appointment) === a._id)
  );

  return (
    <div>
      {dialog}
      <PageTitle
        eyebrow="Clinic waiting room"
        title="Live queue"
        description="Single-dentist live clinic waiting room with real-time socket updates."
        actions={
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            {!isDentist && (
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => setShowWalkInModal(true)}
              >
                <Plus size={14} /> Walk-in patient + check in
              </button>
            )}
            <span
              className={`connection-indicator ${socketConnected ? "connected" : ""}`}
            >
              <i />
              {socketConnected ? "Live updates active" : "Live updates paused (polling 8s)"}
            </span>
          </div>
        }
      />

      <div className="filter-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem" }}>
        <Field label="Queue date">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        {/* Tab filters */}
        <div className="filter-chips" style={{ display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            className={`button button-small ${activeTab === "all" ? "button-primary" : "button-outline"}`}
            onClick={() => setActiveTab("all")}
          >
            All ({entries.length})
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "waiting" ? "button-primary" : "button-outline"}`}
            onClick={() => setActiveTab("waiting")}
          >
            Waiting ({waitingEntries.length})
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "in-progress" ? "button-primary" : "button-outline"}`}
            onClick={() => setActiveTab("in-progress")}
          >
            In-Progress ({inProgressEntries.length})
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "done" ? "button-primary" : "button-outline"}`}
            onClick={() => setActiveTab("done")}
          >
            Done ({doneEntries.length})
          </button>
        </div>
      </div>

      {lastCompletedVisit && (
        <div className="notice notice-success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Check size={16} /> Token #{lastCompletedVisit.entry?.tokenNumber} marked as completed.
          </div>
          {lastCompletedVisit.invoice?._id ? (
            <Link
              to={`/reception/invoices?open=${lastCompletedVisit.invoice._id}`}
              className="button button-small button-outline"
            >
              View Invoice #{lastCompletedVisit.invoice.invoiceNumber} <ArrowRight size={14} />
            </Link>
          ) : lastCompletedVisit.entry?.appointment ? (
            <Link
              to={`/reception/invoices?appointmentId=${lastCompletedVisit.entry.appointment}`}
              className="button button-small button-primary"
            >
              Create invoice for visit <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
      )}

      {!isDentist && dentistId && (
        <SectionPanel
          title="Check in a registered patient"
          description="Check in scheduled patients or search registered accounts."
        >
          <div style={{ padding: "0.6rem 0.8rem", background: "#f8faf9", borderRadius: "6px", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", border: "1px solid #e2ece8" }}>
            <div>
              Ask the patient to self-register at: <code>{typeof window !== "undefined" ? window.location.origin : ""}/register</code>
            </div>
            <button
              type="button"
              className="button button-small button-outline"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(`${window.location.origin}/register`);
                }
                notify("Registration link copied to clipboard", "success");
              }}
            >
              Copy registration link
            </button>
          </div>
          {registeredAppts.length > 0 && (
            <div style={{ marginBottom: "1.2rem" }}>
              <span className="field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                Scheduled appointments ready for check-in:
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.6rem" }}>
                {registeredAppts.map((appt) => (
                  <div
                    key={appt._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "6px",
                      border: "1px solid #dbe5e1",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <strong>{appt.patient?.name || "Patient"}</strong>
                      <div style={{ fontSize: "0.8rem", color: "#6b7d78" }}>
                        {appt.startTime} · {appt.mode} · payment: {appt.paymentStatus}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => addToQueue(appt.patient, appt._id)}
                    >
                      Check in
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: "0.8rem" }}>
            <span className="field-label">Search registered patient:</span>
            {selectedPatient ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "#f0f7f5", borderRadius: "6px", border: "1px solid #c2e2dc" }}>
                <div>
                  <strong>{selectedPatient.name || selectedPatient.user?.name}</strong>
                  <span style={{ fontSize: "0.85rem", color: "#555", marginLeft: "0.5rem" }}>
                    ({selectedPatient.phone || selectedPatient.user?.phone || selectedPatient.email})
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => setSelectedPatient(null)}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => addToQueue(selectedPatient, null)}
                  >
                    Check in now <Plus size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <TextInput
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Type patient name, phone, or email to search…"
                />
                {patientSearchResults.data?.data?.length > 0 && (
                  <div className="record-list" style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #dbe5e1", borderRadius: "4px", marginTop: "0.3rem" }}>
                    {patientSearchResults.data.data.map((p) => (
                      <div
                        key={p._id}
                        style={{ padding: "0.5rem 0.8rem", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f4f2" }}
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatientSearch("");
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
        </SectionPanel>
      )}

      {dentistId ? (
        <SectionPanel
          title="Waiting room flow"
          description={`${waitingEntries.length} waiting · ${inProgressEntries.length} in progress · ${doneEntries.length} done`}
        >
          <AsyncView
            query={queue}
            empty={!queue.isLoading && !queue.isError && !filteredEntries.length}
            emptyTitle="No patients in the queue"
            emptyDescription="Check in arriving patients or register walk-ins above."
          >
            <div className="queue-list">
              {filteredEntries.map((entry) => (
                <article className="queue-row" key={entry._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.8rem 1rem", borderBottom: "1px solid #eef2f0" }}>
                  <span className="queue-token" style={{ minWidth: "40px", fontSize: "1.1rem", fontWeight: 700, color: "#166534" }}>
                    #{entry.tokenNumber}
                  </span>
                  <span className="queue-person" style={{ flex: 1, padding: "0 1rem" }}>
                    <strong>
                      {entry.patient?.name || entry.walkInName || "Walk-in patient"}
                    </strong>
                    <div style={{ fontSize: "0.8rem", color: "#6b7d78" }}>
                      {entry.patient?.phone ? `${entry.patient.phone} · ` : ""}
                      {entry.status === "waiting"
                        ? (entry.estimatedWaitMinutes ? `Est. wait ~${entry.estimatedWaitMinutes} min` : "Waiting")
                        : `Status: ${entry.status}`}
                    </div>
                  </span>
                  <StatusBadge value={entry.status} />

                  <div className="queue-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginLeft: "1rem" }}>
                    {entry.status === "waiting" && (
                      <button
                        type="button"
                        className="button button-primary button-small"
                        onClick={() => handleCallNext(entry)}
                      >
                        Call next
                      </button>
                    )}
                    {["waiting", "in-progress"].includes(entry.status) && (
                      <>
                        <button
                          type="button"
                          className="button button-outline button-small"
                          onClick={() => handleComplete(entry)}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          className="button button-quiet button-small"
                          onClick={() => handleSkip(entry)}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          className="button button-quiet button-small"
                          style={{ color: "#b91c1c" }}
                          onClick={() => handleRemove(entry)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {entry.status === "completed" && entry.appointment && (
                      <Link
                        to={`/reception/invoices?appointmentId=${entry.appointment._id || entry.appointment}`}
                        className="button button-quiet button-small"
                      >
                        Invoice
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      ) : (
        <div className="notice notice-warn">
          No primary clinic doctor is configured or verified. Set up the doctor profile first.
        </div>
      )}

      {/* Walk-in patient registration modal */}
      {showWalkInModal && (
        <div className="modal-backdrop" onClick={() => setShowWalkInModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px", width: "90%" }}>
            <div className="modal-header">
              <h2>Register walk-in patient + Check in</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setShowWalkInModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRegisterAndCheckIn} className="stack-form" style={{ padding: "1.2rem" }}>
              <Field label="Full name *">
                <TextInput
                  required
                  value={walkInForm.name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, name: e.target.value })}
                  placeholder="Patient's legal name"
                />
              </Field>
              <Field label="Phone number *">
                <TextInput
                  type="tel"
                  required
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                  placeholder="10-digit mobile number"
                />
              </Field>
              <Field label="Email (optional)">
                <TextInput
                  type="email"
                  value={walkInForm.email}
                  onChange={(e) => setWalkInForm({ ...walkInForm, email: e.target.value })}
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Gender">
                <select
                  className="input"
                  value={walkInForm.gender}
                  onChange={(e) => setWalkInForm({ ...walkInForm, gender: e.target.value })}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.8rem", marginTop: "1rem" }}>
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
                  disabled={walkInBusy}
                >
                  {walkInBusy ? "Registering & Checking in…" : "Register + Check in"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
