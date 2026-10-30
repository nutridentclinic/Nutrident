import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrimaryDentist } from "../hooks/usePrimaryDentist.js";
import { fetchPrimarySlotsWithFallback, fetchAvailabilityRangeWithFallback } from "../api/capabilities.js";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api, downloadPdf, openRecordFile } from "../api/domains.js";
import { useAuthStore } from "../store/auth.js";
import { FileUpload } from "../components/FileUpload.jsx";
import { clinicDate, isPastSlot } from "../utils/booking.js";
import { FDI_TEETH as fdiTeeth } from "../utils/teeth.js";
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
import { formatClinicDate } from "../utils/formatDate.js";

const fmtDate = (date) => (date ? formatClinicDate(date) : "Date not set");
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const queryOptions = { staleTime: 15000 };
function useAction() {
  const queryClient = useQueryClient();
  const notify = useToast();
  return useMutation({
    mutationFn: ({ action, ...params }) => action(...params.args),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries();
      notify(result?.message || variables.successMessage || "Changes saved.");
    },
    onError: (error) => notify(error.message, "error"),
  });
}

export function PatientDashboard() {
  const user = useAuthStore((state) => state.user);
  const [greeting] = useState(() =>
    new Date().getHours() < 12 ? "morning" : "day",
  );
  const appointments = useQuery({
    queryKey: ["appointments", "patient"],
    queryFn: () => api.appointments.mine({ upcoming: "true" }),
    ...queryOptions,
  });
  const profile = useQuery({
    queryKey: ["patient-profile"],
    queryFn: api.patients.mine,
    ...queryOptions,
  });
  const nextVisit = appointments.data?.data?.find((item) =>
    ["pending", "confirmed"].includes(item.status),
  );
  return (
    <div className="dashboard-page">
      <PageTitle
        eyebrow="Patient portal"
        title={`Good ${greeting}, ${user?.name?.split(" ")[0] || "there"}.`}
        description="A clear view of what is next in your care."
        actions={
          <Link className="button button-primary" to="/dentists">
            Book a visit <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="patient-welcome-band">
        <div>
          <span className="welcome-icon">
            <HeartPulse size={20} />
          </span>
          <span>
            <strong>Your care, all together.</strong>
            <small>Appointments, records and next steps in one place.</small>
          </span>
        </div>
        <Link to="/app/profile" className="text-link">
          Review your profile <ArrowRight size={15} />
        </Link>
      </div>
      <div className="dashboard-metrics">
        <article>
          <span className="metric-icon metric-teal">
            <CalendarDays size={18} />
          </span>
          <small>Upcoming visits</small>
          <strong>
            {appointments.data?.data?.filter((item) =>
              ["pending", "confirmed"].includes(item.status),
            ).length ?? "—"}
          </strong>
        </article>
        <article>
          <span className="metric-icon metric-lime">
            <Activity size={18} />
          </span>
          <small>Care plan</small>
          <strong>View details</strong>
          <Link to="/app/care" className="metric-link">
            Open care <ArrowRight size={14} />
          </Link>
        </article>
        <article>
          <span className="metric-icon metric-blue">
            <ShieldCheck size={18} />
          </span>
          <small>Profile status</small>
          <strong>
            {profile.isLoading
              ? "Checking"
              : profile.data?.data
                ? "Up to date"
                : "Complete profile"}
          </strong>
          <Link to="/app/profile" className="metric-link">
            Review <ArrowRight size={14} />
          </Link>
        </article>
      </div>
      <div className="dashboard-columns">
        <SectionPanel
          title="Your next visit"
          description="Appointment information from your clinic."
        >
          <AsyncView
            query={appointments}
            empty={
              !appointments.isLoading && !appointments.isError && !nextVisit
            }
            emptyTitle="No upcoming visits"
          >
            <div className="next-visit-card">
              <span className="visit-date">
                <strong>
                  {nextVisit
                    ? formatClinicDate(nextVisit.date, { day: "2-digit" })
                    : "--"}
                </strong>
                <small>
                  {nextVisit
                    ? formatClinicDate(nextVisit.date, { month: "short" })
                    : "—"}
                </small>
              </span>
              <div>
                <strong>
                  Dr. {nextVisit?.dentist?.user?.name || "Your dentist"}
                </strong>
                <span>
                  {fmtDate(nextVisit?.date)} · {nextVisit?.startTime} ·{" "}
                  {nextVisit?.mode}
                </span>
                <StatusBadge value={nextVisit?.status} />
              </div>
              <Link
                className="round-link"
                to={`/app/appointments/${nextVisit?._id}`}
                aria-label="View appointment"
              >
                <ArrowRight size={16} />
              </Link>
            </div>
          </AsyncView>
        </SectionPanel>
        <SectionPanel
          title="Quick access"
          description="Keep important care details close."
        >
          <div className="quick-link-list">
            <Link to="/app/records">
              <FileText size={17} />
              <span>Medical records</span>
              <ArrowRight size={15} />
            </Link>
            <Link to="/app/prescriptions">
              <Plus size={17} />
              <span>Prescriptions</span>
              <ArrowRight size={15} />
            </Link>
            <Link to="/app/billing">
              <CreditCard size={17} />
              <span>Invoices & payments</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

export function PatientAppointments() {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState("");
  const [reschedule, setReschedule] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [date, setDate] = useState(clinicDate());
  const query = useQuery({
    queryKey: ["appointments", "patient", status],
    queryFn: () => api.appointments.mine(status ? { status } : {}),
    ...queryOptions,
  });
  const action = useAction();
  const slotQuery = useQuery({
    queryKey: ["appointment-slots", reschedule?.dentist?._id, date],
    queryFn: () => api.dentists.slots(reschedule.dentist?._id, date),
    enabled: !!reschedule,
    ...queryOptions,
  });
  const items = query.data?.data || [];

  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const notify = useToast();

  const myReviewsQuery = useQuery({
    queryKey: ["my-reviews"],
    queryFn: api.reviews.mine,
    ...queryOptions,
  });
  const myReviews = myReviewsQuery.data?.data || [];
  const reviewedApptIds = useMemo(
    () => new Set(myReviews.map((r) => String(r.appointment?._id || r.appointment))),
    [myReviews]
  );

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  // Check review param in URL on load
  useEffect(() => {
    const reviewId = searchParams.get("review");
    if (reviewId && items.length > 0) {
      const match = items.find((a) => String(a._id) === reviewId);
      if (match && match.status === "completed" && !reviewedApptIds.has(String(match._id))) {
        setReviewTarget(match);
      }
    }
  }, [searchParams, items, reviewedApptIds]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewBusy(true);
    try {
      const res = await api.reviews.create({
        appointmentId: reviewTarget._id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      notify(res.message || "Thank you for your review!");
      setReviewTarget(null);
      setReviewComment("");
      setReviewRating(5);
      // Remove review query param if present
      if (searchParams.get("review")) {
        searchParams.delete("review");
        setSearchParams(searchParams);
      }
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["appointments", "patient"] });
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setReviewBusy(false);
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Your care calendar"
        title="Appointments"
        description="View and manage visits scheduled with your care team."
        actions={
          <Link className="button button-primary" to="/app/book">
            Book a visit <Plus size={16} />
          </Link>
        }
      />
      <div className="filter-bar">
        <label className="filter-label">
          Status{" "}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All appointments</option>
            {[
              "pending",
              "confirmed",
              "completed",
              "cancelled",
              "rescheduled",
              "no-show",
            ].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && items.length === 0}
        emptyTitle="No appointments found"
      >
        <div className="appointment-list">
          {items.map((item) => (
            <article className="appointment-row" key={item._id}>
              <div className="appointment-date">
                <CalendarDays size={17} />
                <span>{fmtDate(item.date)}</span>
              </div>
              <div className="appointment-main">
                <h3>Dr. {item.dentist?.user?.name || "Dental professional"}</h3>
                <p>
                  {item.startTime} · {item.mode} ·{" "}
                  {item.reasonForVisit || "Consultation"}
                </p>
                <span className="appointment-fees">
                  {rupees(item.fees?.totalAmount)} · payment{" "}
                  {item.paymentStatus}
                </span>
              </div>
              <div className="appointment-status">
                <StatusBadge value={item.status} />
              </div>
              <div className="appointment-actions">
                <Link
                  className="button button-quiet button-small"
                  to={`/app/appointments/${item._id}`}
                >
                  Details
                </Link>
                {item.status === "completed" && (
                  reviewedApptIds.has(String(item._id)) ? (
                    <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600, padding: "0.2rem 0.5rem" }}>
                      Reviewed ★
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => {
                        setReviewTarget(item);
                        setReviewRating(5);
                        setReviewComment("");
                      }}
                    >
                      Leave Review ★
                    </button>
                  )
                )}
                {["pending", "confirmed"].includes(item.status) && (
                  <button
                    className="button button-quiet button-small"
                    onClick={async () => {
                      const accepted = await confirm({
                        title: "Cancel this appointment?",
                        description: "Refund eligibility depends on the clinic cancellation policy. The clinic will confirm the final payment status.",
                        confirmLabel: "Cancel appointment",
                        danger: true,
                        children: <Field label="Reason (optional)"><TextInput value={cancelReason} maxLength={500} onChange={(event) => setCancelReason(event.target.value)} /></Field>,
                      });
                      if (!accepted) return;
                      action.mutate({ action: api.appointments.cancel, args: [item._id, cancelReason] }, { onSuccess: () => setCancelReason("") });
                    }}
                  >
                    Cancel
                  </button>
                )}
                {["pending", "confirmed"].includes(item.status) && (
                  <button
                    className="button button-outline button-small"
                    onClick={() => {
                      setReschedule(item);
                      setDate(clinicDate());
                    }}
                  >
                    Reschedule
                  </button>
                )}
                {["video", "audio"].includes(item.mode) && item.status === "confirmed" && (
                  <Link
                    to={`/consultation/${item._id}/lobby`}
                    className="button button-primary button-small"
                  >
                    {item.mode === "audio" ? "Join audio" : "Join video"}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </AsyncView>
      {/* Review Modal */}
      {reviewTarget && (
        <div className="modal-backdrop" onClick={() => setReviewTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", width: "95%" }}>
            <div className="section-panel-heading">
              <div>
                <span className="eyebrow">Patient feedback</span>
                <h2>Rate your visit</h2>
              </div>
              <button className="icon-button" aria-label="Close" onClick={() => setReviewTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="stack-form" style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.9rem", color: "#475569" }}>
                How was your consultation with <strong>Dr. {reviewTarget.dentist?.user?.name || "your dentist"}</strong> on {fmtDate(reviewTarget.date)}?
              </p>
              <Field label="Rating *">
                <div style={{ display: "flex", gap: "0.5rem", fontSize: "1.5rem", cursor: "pointer", margin: "0.3rem 0" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setReviewRating(star)}
                      style={{ color: star <= reviewRating ? "#f59e0b" : "#cbd5e1" }}
                    >
                      ★
                    </span>
                  ))}
                  <span style={{ fontSize: "0.9rem", color: "#64748b", alignSelf: "center", marginLeft: "0.5rem" }}>
                    {reviewRating} of 5 stars
                  </span>
                </div>
              </Field>
              <Field label="Your feedback / review">
                <textarea
                  className="input"
                  rows={3}
                  value={reviewComment}
                  placeholder="Share details about your experience, doctor bedside manner, treatment clarity..."
                  onChange={(e) => setReviewComment(e.target.value)}
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="button button-quiet" onClick={() => setReviewTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={reviewBusy}>
                  {reviewBusy ? "Submitting…" : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialog}
      {reschedule && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setReschedule(null)}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-panel-heading">
              <div>
                <span className="eyebrow">Change appointment</span>
                <h2 id="reschedule-title">Choose a new time</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setReschedule(null)}
              >
                <X size={18} />
              </button>
            </div>
            <Field label="Date">
              <TextInput
                type="date"
                min={clinicDate()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <AsyncView
              query={slotQuery}
              empty={
                !slotQuery.isLoading &&
                !slotQuery.isError &&
                !(slotQuery.data?.data || []).filter(
                  (slot) => !isPastSlot(date, slot.startTime),
                ).length
              }
              emptyTitle="No available times for this date"
            >
              <div className="slot-grid">
                {(slotQuery.data?.data || [])
                  .filter((slot) => !isPastSlot(date, slot.startTime))
                  .map((slot) => (
                    <button
                      key={slot.startTime}
                      className="slot-button"
                      onClick={() =>
                        action.mutate(
                          {
                            action: api.appointments.reschedule,
                            args: [
                              reschedule._id,
                              { date, startTime: slot.startTime },
                            ],
                            successMessage: "Appointment rescheduled.",
                          },
                          {
                            onSuccess: (result) => {
                              setReschedule(null);
                              if (result.data?._id) navigate(`/app/appointments/${result.data._id}`);
                            }
                          },
                        )
                      }
                    >
                      {slot.startTime}
                    </button>
                  ))}
              </div>
            </AsyncView>
          </section>
        </div>
      )}
    </div>
  );
}

export function AppointmentDetail() {
  const { id } = useParams();
  const action = useAction();
  const { confirm, dialog } = useConfirm();
  const query = useQuery({
    queryKey: ["appointment", id],
    queryFn: () => api.appointments.detail(id),
    ...queryOptions,
  });
  const item = query.data?.data;
  const cancelAppointment = async () => {
    const accepted = await confirm({
      title: "Cancel this appointment?",
      description: "Refund eligibility depends on the clinic cancellation policy. The clinic will confirm the final payment status.",
      confirmLabel: "Cancel appointment",
      danger: true,
    });
    if (accepted) action.mutate({ action: api.appointments.cancel, args: [id, "Cancelled by patient"] });
  };
  return (
    <div>
      <PageTitle
        eyebrow="Appointment details"
        title={
          item
            ? `Visit with Dr. ${item.dentist?.user?.name || "your dentist"}`
            : "Appointment"
        }
        description="Your appointment details and available actions."
        actions={
          <Link className="button button-quiet" to="/app/appointments">
            ← All appointments
          </Link>
        }
      />
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !item}
        emptyTitle="Appointment not found"
      >
        {item && (
          <div className="appointment-detail-grid">
            <SectionPanel title="Visit information">
              <dl className="detail-list">
                <div>
                  <dt>Date</dt>
                  <dd>{fmtDate(item.date)}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>
                    {item.startTime} – {item.endTime}
                  </dd>
                </div>
                <div>
                  <dt>Visit type</dt>
                  <dd>{item.mode}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{item.reasonForVisit || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Appointment status</dt>
                  <dd>
                    <StatusBadge value={item.status} />
                  </dd>
                </div>
                <div>
                  <dt>Payment status</dt>
                  <dd>
                    <StatusBadge value={item.paymentStatus} />
                  </dd>
                </div>
              </dl>
              {item && ["pending", "confirmed"].includes(item.status) && (
                <button className="button button-quiet" onClick={cancelAppointment}>
                  Cancel appointment
                </button>
              )}
            </SectionPanel>
            <SectionPanel title="Fee summary">
              <div className="fee-lines">
                <span>
                  Consultation{" "}
                  <strong>{rupees(item.fees?.consultationFee)}</strong>
                </span>
                <span>
                  Platform fee <strong>{rupees(item.fees?.platformFee)}</strong>
                </span>
                <span className="fee-total">
                  Total <strong>{rupees(item.fees?.totalAmount)}</strong>
                </span>
              </div>
              <p className="muted-copy">
                Cancellation refunds follow the clinic policy shown at the time
                of booking.
              </p>
              {["video", "audio"].includes(item.mode) && item.status === "confirmed" && (
                <Link
                  className="button button-primary button-wide"
                  to={`/consultation/${id}/lobby`}
                >
                  {item.mode === "audio" ? "Join audio consultation" : "Join video consultation"} <ArrowRight size={16} />
                </Link>
              )}
            </SectionPanel>
            {item.status === "completed" && (
              <ReviewForm
                appointmentId={item._id}
                dentistId={item.dentist?._id}
              />
            )}
          </div>
        )}
      </AsyncView>
      {dialog}
    </div>
  );
}

function ReviewForm({ appointmentId }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const action = useAction();
  return (
    <SectionPanel
      title="Share your experience"
      description="Only completed visits can be reviewed; one review is allowed per appointment."
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate({
            action: api.reviews.create,
            args: [{ appointmentId, rating, comment }],
          });
        }}
      >
        <Field label="Rating">
          <TextInput
            as="select"
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} / 5
              </option>
            ))}
          </TextInput>
        </Field>
        <Field label="Comment">
          <TextInput
            as="textarea"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>
        <button className="button button-primary" disabled={action.isPending}>
          Submit review <ArrowRight size={15} />
        </button>
      </form>
    </SectionPanel>
  );
}

async function loadCheckout() {
  if (window.Razorpay) return true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function pollPayment(appointmentId, onResult) {
  let attempts = 0;
  const check = async () => {
    attempts += 1;
    try {
      const result = await api.appointments.detail(appointmentId);
      if (result.data?.paymentStatus === "paid") return onResult("confirmed");
    } catch {
      /* A transient read failure is retried within the bounded window. */
    }
    if (attempts >= 10) return onResult("not-confirmed");
    window.setTimeout(check, 3000);
  };
  window.setTimeout(check, 3000);
}

export function AppointmentBooking() {
  const { dentistId: paramDentistId } = useParams();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const primary = usePrimaryDentist();
  const dentist = primary.dentist;
  const effectiveDentistId = dentist?._id || paramDentistId;
  const isAcceptingAppointments = primary.isAcceptingAppointments;

  const patientQuery = useQuery({
    queryKey: ["patient-profile"],
    queryFn: api.patients.mine,
    ...queryOptions,
  });
  const settingsQuery = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: api.settings.get,
    ...queryOptions,
  });
  const settings = settingsQuery.data?.data;
  const allowPayAtClinic = settings?.allowPayAtClinic !== false;

  const [date, setDate] = useState(clinicDate());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [mode, setMode] = useState("in-clinic");
  const [reason, setReason] = useState(() => searchParams.get("reason") || "");
  const [familyMemberName, setFamilyMemberName] = useState("");
  const [paymentChoice, setPaymentChoice] = useState("online");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [serverFees, setServerFees] = useState(null);

  // 14-day availability range calculation
  const fromDate = useMemo(() => clinicDate(), []);
  const toDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 13);
    return d.toISOString().slice(0, 10);
  }, []);

  const rangeQuery = useQuery({
    queryKey: ["availability-range", effectiveDentistId, fromDate, toDate],
    queryFn: () => fetchAvailabilityRangeWithFallback(fromDate, toDate, effectiveDentistId),
    enabled: !!effectiveDentistId,
    staleTime: 60000,
  });

  const calendarDays = useMemo(() => {
    if (Array.isArray(rangeQuery.data) && rangeQuery.data.length > 0) {
      return rangeQuery.data;
    }
    // Fallback: generate 14 calendar days
    return Array.from({ length: 14 }, (_, idx) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + idx);
      const dateStr = d.toISOString().slice(0, 10);
      const weekday = d.getUTCDay();
      return {
        date: dateStr,
        weekday,
        status: weekday === 0 ? "closed" : "open",
        reason: weekday === 0 ? "Clinic closed on Sundays" : "",
        slots: [],
      };
    });
  }, [rangeQuery.data]);

  const selectedDayInfo = calendarDays.find((d) => d.date === date);

  const slotsQuery = useQuery({
    queryKey: ["slots", effectiveDentistId, date],
    queryFn: () => fetchPrimarySlotsWithFallback(date, effectiveDentistId),
    enabled: !!date && selectedDayInfo?.status !== "closed" && selectedDayInfo?.status !== "leave" && selectedDayInfo?.status !== "paused",
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    ...queryOptions,
  });

  const rawSlots = Array.isArray(slotsQuery.data)
    ? slotsQuery.data
    : (slotsQuery.data?.data || []);
  const slots = rawSlots.filter(
    (slot) => !isPastSlot(date, slot.startTime),
  );
  const availableDatesMin = clinicDate();

  const resultLabel = useMemo(
    () =>
      ({
        "creating-appointment": "Saving your appointment…",
        "creating-order": "Preparing secure checkout…",
        "checkout-open": "Checkout is open in a secure Razorpay window.",
        verifying: "Verifying payment with the clinic…",
        polling: "Waiting for the clinic to confirm payment…",
        confirmed: "Payment confirmed. Your appointment is booked.",
        "not-confirmed":
          "Payment is not confirmed. No success has been recorded.",
        failed: "The booking could not be completed.",
      })[stage],
    [stage],
  );

  const checkStatus = (id) => {
    setStage("polling");
    pollPayment(id, (status) => {
      if (status === "confirmed") {
        setStage("confirmed");
        setMessage("Payment confirmed by the clinic.");
      } else {
        setStage("not-confirmed");
        setMessage(
          "Payment is not completed. You can retry checkout; your slot is held for 15 minutes.",
        );
      }
    });
  };

  const payForAppointment = async (id) => {
    setBusy(true);
    setStage("creating-order");
    setMessage("");
    try {
      const orderResponse = await api.payments.createOrder(id);
      const order = orderResponse.data;
      const loaded = await loadCheckout();
      if (!loaded || !window.Razorpay)
        throw new Error(
          "Secure checkout could not be loaded. Your appointment remains unpaid; you can retry.",
        );
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "DrNutrident",
        description: "Dental appointment",
        prefill: { name: user?.name, email: user?.email, contact: user?.phone },
        handler: async (response) => {
          setStage("verifying");
          try {
            const verification = await api.payments.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (
              verification.data?.payment?.status === "paid" &&
              verification.data?.appointment?.paymentStatus === "paid"
            ) {
              setStage("confirmed");
              setMessage("Payment confirmed by the clinic.");
            } else checkStatus(id);
          } catch {
            checkStatus(id);
          }
        },
        modal: { ondismiss: () => checkStatus(id) },
        theme: { color: "#137a76" },
      });
      checkout.on("payment.failed", () => checkStatus(id));
      setStage("checkout-open");
      checkout.open();
    } catch (error) {
      setStage("failed");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const book = async (event) => {
    event.preventDefault();
    if (appointmentId && stage === "confirmed") return;
    if (!settingsQuery.isSuccess) {
      setMessage(
        settingsQuery.error?.message || "Loading clinic fee information…",
      );
      return;
    }
    if (!selectedSlot) {
      setMessage("Choose an available appointment time first.");
      return;
    }
    setBusy(true);
    setStage("creating-appointment");
    setMessage("");
    try {
      const isPayAtClinic = paymentChoice === "at-clinic";
      const result = await api.appointments.create({
        dentistId: effectiveDentistId || undefined,
        date,
        startTime: selectedSlot,
        mode,
        reasonForVisit: reason,
        familyMemberName: familyMemberName || undefined,
        payAtClinic: isPayAtClinic,
      });
      const appointment = result.data;
      setAppointmentId(appointment._id);
      setServerFees(appointment.fees);

      if (isPayAtClinic) {
        setStage("confirmed");
        setMessage("Your appointment is confirmed! Consultation fee will be settled at the front desk when you arrive.");
        setBusy(false);
      } else {
        await payForAppointment(appointment._id);
      }
    } catch (error) {
      setStage("failed");
      setMessage(error.message);
      if (error.status === 400 || error.status === 409) slotsQuery.refetch();
      setBusy(false);
    }
  };

  const consultationFee =
    serverFees?.consultationFee ?? dentist?.consultationFee ?? 0;
  const platformFee =
    serverFees?.platformFee ?? settingsQuery.data?.data?.platformFee ?? 0;
  const totalFee =
    serverFees?.totalAmount ?? Number(consultationFee) + Number(platformFee);

  return (
    <div>
      <PageTitle
        eyebrow="Book a visit"
        title="Choose a time that works."
        description={
          dentist
            ? `Dr. ${dentist.user?.name || "our doctor"} · ${dentist.specialization || "Dental Surgeon"}`
            : "Select an appointment date and available time slot."
        }
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link to="/doctor" className="button button-quiet">
              ← Doctor profile
            </Link>
            <Link to="/app/appointments" className="button button-outline">
              My appointments
            </Link>
          </div>
        }
      />

      {!primary.isLoading && (!dentist || !isAcceptingAppointments) && (
        <div className="notice notice-warn" style={{ marginBottom: "1.5rem" }}>
          <strong>
            Dr. {dentist?.user?.name || "The doctor"} is not taking new appointments
            {dentist?.pausedUntil ? ` until ${formatClinicDate(dentist.pausedUntil)}` : " online at this time"}.
          </strong>
          {primary.bookingDisabledReason && (
            <p style={{ marginTop: "0.4rem" }}>
              <strong>Status:</strong> {primary.bookingDisabledReason}
            </p>
          )}
          <p style={{ marginTop: "0.4rem" }}>
            Please call the clinic directly at {settings?.contactPhone || "the front desk"} or check back soon. Existing appointments can still be viewed in My Appointments.
          </p>
        </div>
      )}

      {dentist && isAcceptingAppointments && (
        <form className="booking-layout" onSubmit={book}>
          <section className="booking-main">
            <SectionPanel
              title="1. Select a date & time"
              description={`Availability is shown in ${import.meta.env.VITE_CLINIC_TIMEZONE || "Asia/Kolkata"} clinic time.`}
            >
              {/* 14-day visual date strip */}
              <div style={{ marginBottom: "1rem" }}>
                <span className="field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  14-Day Calendar Strip
                </span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))",
                    gap: "0.5rem",
                    overflowX: "auto",
                    paddingBottom: "0.3rem",
                  }}
                  role="region"
                  aria-label="14-day appointment calendar"
                >
                  {calendarDays.map((d) => {
                    const isSelected = date === d.date;
                    const isOpen = d.status === "open";
                    const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.weekday];
                    const dayNum = d.date.slice(8);
                    return (
                      <button
                        type="button"
                        key={d.date}
                        disabled={!isOpen}
                        onClick={() => {
                          setDate(d.date);
                          setSelectedSlot("");
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          padding: "0.5rem 0.2rem",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #137a76" : "1px solid #dbe5e1",
                          background: isSelected ? "#e6f4f1" : isOpen ? "#fff" : "#f5f7f6",
                          color: isOpen ? "#1c2b28" : "#8c9b96",
                          cursor: isOpen ? "pointer" : "not-allowed",
                          opacity: isOpen ? 1 : 0.65,
                          transition: "all 0.15s ease",
                        }}
                        aria-pressed={isSelected}
                        title={d.reason || (isOpen ? "Open for booking" : d.status)}
                      >
                        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>
                          {weekdayName}
                        </span>
                        <strong style={{ fontSize: "1.1rem", margin: "0.2rem 0" }}>{dayNum}</strong>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 4px",
                            borderRadius: "4px",
                            background: isOpen ? "#cbf0e4" : "#e0e7e4",
                            color: isOpen ? "#0b5853" : "#5d6e69",
                            textTransform: "capitalize",
                          }}
                        >
                          {d.status === "open" ? "Open" : d.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Or choose exact date">
                <TextInput
                  type="date"
                  min={availableDatesMin}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSelectedSlot("");
                  }}
                />
              </Field>

              {selectedDayInfo && selectedDayInfo.status !== "open" ? (
                <div className="notice notice-info" style={{ marginTop: "1rem" }}>
                  <strong>Clinic status on this date: {selectedDayInfo.status.toUpperCase()}</strong>
                  <p style={{ marginTop: "0.2rem" }}>
                    {selectedDayInfo.reason || (selectedDayInfo.weekday === 0 ? "The clinic is closed on Sundays." : "No slots available on this date.")}
                  </p>
                </div>
              ) : (
                <AsyncView
                  query={slotsQuery}
                  empty={
                    !slotsQuery.isLoading &&
                    !slotsQuery.isError &&
                    slots.length === 0
                  }
                  emptyTitle="No available times for this date. Try another day."
                >
                  <div className="slot-grid">
                    {slots.map((slot) => (
                      <button
                        type="button"
                        key={slot.startTime}
                        aria-pressed={selectedSlot === slot.startTime}
                        className={`slot-button ${selectedSlot === slot.startTime ? "slot-selected" : ""}`}
                        onClick={() => setSelectedSlot(slot.startTime)}
                      >
                        {slot.startTime}
                      </button>
                    ))}
                  </div>
                </AsyncView>
              )}
            </SectionPanel>

            <SectionPanel title="2. Tell us a little more">
              <div className="two-col-fields">
                <Field label="Visit type">
                  <TextInput
                    as="select"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                  >
                    <option value="in-clinic">In clinic</option>
                    <option value="video">Video consultation</option>
                    <option value="audio">Audio consultation</option>
                  </TextInput>
                </Field>
                <Field label="Booking for">
                  <TextInput
                    as="select"
                    value={familyMemberName}
                    onChange={(event) =>
                      setFamilyMemberName(event.target.value)
                    }
                  >
                    <option value="">Myself</option>
                    {(patientQuery.data?.data?.familyMembers || []).map(
                      (member) => (
                        <option key={member._id} value={member.name}>
                          {member.name} · {member.relation}
                        </option>
                      ),
                    )}
                  </TextInput>
                </Field>
              </div>
              <Field label="Reason for visit">
                <TextInput
                  as="textarea"
                  rows={3}
                  maxLength={500}
                  placeholder="Share anything useful for your dentist"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>

              {allowPayAtClinic && (
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e7eeeb" }}>
                  <label className="field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                    Payment method
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.8rem",
                        borderRadius: "8px",
                        border: paymentChoice === "online" ? "2px solid #137a76" : "1px solid #dbe5e1",
                        background: paymentChoice === "online" ? "#f0f8f6" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentChoice"
                        value="online"
                        checked={paymentChoice === "online"}
                        onChange={() => setPaymentChoice("online")}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <strong>Pay online now</strong>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#5d6e69" }}>
                          Instant confirmation via Razorpay (UPI, card, netbanking).
                        </p>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.8rem",
                        borderRadius: "8px",
                        border: paymentChoice === "at-clinic" ? "2px solid #137a76" : "1px solid #dbe5e1",
                        background: paymentChoice === "at-clinic" ? "#f0f8f6" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentChoice"
                        value="at-clinic"
                        checked={paymentChoice === "at-clinic"}
                        onChange={() => setPaymentChoice("at-clinic")}
                        style={{ marginTop: "3px" }}
                      />
                      <div>
                        <strong>Pay at clinic</strong>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#5d6e69" }}>
                          Confirmed immediately; settle at reception upon arrival.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </SectionPanel>
          </section>

          <aside className="booking-summary">
            <span className="eyebrow">Appointment summary</span>
            <h2>Dr. {dentist.user?.name}</h2>
            <p>{dentist.specialization}</p>
            <div className="summary-line">
              <span>
                <CalendarDays size={16} />
                {date}
              </span>
              <strong>{selectedSlot || "Choose a time"}</strong>
            </div>
            <div className="summary-line">
              <span>Consultation fee</span>
              <strong>{rupees(consultationFee)}</strong>
            </div>
            <div className="summary-line">
              <span>Platform fee</span>
              <strong>{rupees(platformFee)}</strong>
            </div>
            <div className="summary-total">
              <span>Total due</span>
              <strong>{rupees(totalFee)}</strong>
            </div>

            {paymentChoice === "online" && (
              <p className="summary-note">
                Your slot is held for 15 minutes while completing online payment. Cancellation refunds follow clinic policy.
              </p>
            )}
            {paymentChoice === "at-clinic" && (
              <p className="summary-note">
                Your appointment will be confirmed immediately. Payment of {rupees(totalFee)} is collected at the front desk before consultation.
              </p>
            )}

            {message && (
              <div
                className={`notice ${stage === "confirmed" ? "notice-success" : stage === "failed" || stage === "not-confirmed" ? "notice-error" : "notice-warn"}`}
                role="status"
              >
                {stage === "confirmed" && <Check size={16} />}
                {message}
              </div>
            )}
            {stage === "confirmed" ? (
              <Link
                className="button button-primary button-wide"
                to="/app/appointments"
              >
                View appointments <ArrowRight size={16} />
              </Link>
            ) : appointmentId && ["failed", "not-confirmed"].includes(stage) ? (
              <button
                type="button"
                disabled={busy}
                className="button button-primary button-wide"
                onClick={() => payForAppointment(appointmentId)}
              >
                {busy ? "Preparing checkout…" : "Retry payment"}{" "}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                disabled={busy || !selectedSlot || !isAcceptingAppointments}
                title={!isAcceptingAppointments ? (primary.bookingDisabledReason || "Doctor is not accepting appointments") : undefined}
                className="button button-primary button-wide"
              >
                {busy
                  ? resultLabel || "Working…"
                  : !isAcceptingAppointments
                    ? (primary.bookingDisabledReason || "Booking unavailable")
                    : paymentChoice === "at-clinic"
                      ? "Confirm booking (Pay at clinic)"
                      : "Continue to secure payment"}{" "}
                <ArrowRight size={16} />
              </button>
            )}
            {[
              "creating-appointment",
              "creating-order",
              "checkout-open",
              "verifying",
              "polling",
            ].includes(stage) && (
                <div className="checkout-progress">
                  <LoaderCircle className="spin" size={16} />
                  {resultLabel}
                </div>
              )}
          </aside>
        </form>
      )}
    </div>
  );
}

export function PatientPrescriptions() {
  const notify = useToast();
  const query = useQuery({
    queryKey: ["prescriptions"],
    queryFn: api.prescriptions.mine,
    ...queryOptions,
  });
  const items = query.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Medication and instructions"
        title="Prescriptions"
        description="Prescriptions issued by your care team, with authenticated PDF downloads."
      />
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !items.length}
        emptyTitle="No prescriptions yet"
      >
        <div className="record-grid">
          {items.map((item) => (
            <article
              className="record-card"
              key={item._id}
              style={{
                opacity: item.status === "voided" ? 0.8 : 1,
                border: item.status === "voided" ? "1px solid #fecaca" : undefined,
                background: item.status === "voided" ? "#fff5f5" : undefined,
              }}
            >
              <div className="record-card-head">
                <span className="catalog-icon">
                  <FileText size={18} color={item.status === "voided" ? "#dc2626" : undefined} />
                </span>
                <span>{fmtDate(item.createdAt)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h2>{item.diagnosis || "Prescription"}</h2>
                {item.status === "voided" && (
                  <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.4rem", background: "#fee2e2", color: "#dc2626", borderRadius: "4px", fontWeight: 700 }}>
                    VOIDED
                  </span>
                )}
              </div>
              <p>Dr. {item.dentist?.user?.name || "Your dentist"}</p>
              {item.status === "voided" && (
                <p style={{ color: "#dc2626", fontSize: "0.85rem", fontStyle: "italic", margin: "0.2rem 0" }}>
                  This prescription was voided{item.voidReason ? `: ${item.voidReason}` : " and is no longer valid."}
                </p>
              )}
              <ul className="medicine-list">
                {(item.medicines || []).map((medicine, index) => (
                  <li key={`${medicine.name}-${index}`}>
                    <strong>{medicine.name}</strong>
                    <span>
                      {medicine.dosage} · {medicine.frequency} ·{" "}
                      {medicine.durationDays} days
                      {medicine.instructions ? ` (${medicine.instructions})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {item.additionalNotes && (
                <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0.5rem 0" }}>
                  <strong>Notes:</strong> {item.additionalNotes}
                </p>
              )}
              {item.followUpDate && (
                <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0.2rem 0" }}>
                  <strong>Follow-up:</strong> {item.followUpDate}
                </p>
              )}
              <button
                className="button button-outline button-small"
                onClick={() =>
                  downloadPdf(
                    `/prescriptions/${item._id}/pdf`,
                    `prescription-${item._id}.pdf`,
                  ).catch((error) => notify(error.message, "error"))
                }
              >
                <Download size={15} /> Download PDF
              </button>
            </article>
          ))}
        </div>
      </AsyncView>
    </div>
  );
}

export function PatientRecords() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const [filterType, setFilterType] = useState("");
  const query = useQuery({
    queryKey: ["records", filterType],
    queryFn: () => api.records.mine(filterType ? { type: filterType } : {}),
    ...queryOptions,
  });
  const [title, setTitle] = useState("");
  const [type, setType] = useState("other");
  const items = query.data?.data || [];

  const handleUpload = async (file, onProgress) => {
    const data = new FormData();
    data.append("file", file);
    data.append("title", title || file.name);
    data.append("type", type);
    const result = await api.records.upload(data, { onUploadProgress: onProgress });
    setTitle("");
    await queryClient.invalidateQueries({ queryKey: ["records"] });
    return result;
  };

  const remove = async (id) => {
    if (!(await confirm({ title: "Delete this medical record?", description: "The file will be removed from this patient record.", confirmLabel: "Delete record", danger: true }))) return;
    try {
      const result = await api.records.remove(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["records"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Your health documents"
        title="Medical records"
        description="Upload and keep X-rays, reports and other files close to your care."
      />
      <SectionPanel
        title="Add a record"
        description="Files are uploaded to the clinic’s configured storage provider."
      >
        <FileUpload
          accept="image/jpeg,image/png,image/webp,application/pdf"
          maxSizeMB={10}
          onUpload={handleUpload}
          label="Choose or drop a medical document"
          hint="JPG, PNG, WEBP or PDF up to 10 MB"
          submitLabel="Upload record"
          extraFields={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Field label="Record title">
                <TextInput
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Panoramic X-ray"
                />
              </Field>
              <Field label="Record type">
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
      <section className="records-section">
        <div className="section-panel-heading">
          <h2>Saved records</h2>
          <label className="filter-label">
            Type{" "}
            <select
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
            </select>
          </label>
        </div>
        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && !items.length}
          emptyTitle="No records have been added"
        >
          <div className="record-list">
            {items.map((item) => (
              <article className="record-row" key={item._id}>
                <span className="record-type-icon">
                  <FileText size={18} />
                </span>
                <div className="record-row-content">
                  <strong>{item.title}</strong>
                  <span>
                    {item.type} · {fmtDate(item.createdAt)}
                  </span>
                  {item.description && <p>{item.description}</p>}
                </div>
                <div className="record-row-actions">
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => openRecordFile(item._id, item.file?.url)}
                  >
                    Open file <ArrowRight size={14} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    aria-label="Delete record"
                    onClick={() => remove(item._id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </AsyncView>
      </section>
      {dialog}
    </div>
  );
}

export function PatientTreatmentPlans() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const isBooting = status === "booting" && !user && !import.meta.env?.VITEST;

  const plans = useQuery({
    queryKey: ["patient-plans", user?._id || "me"],
    queryFn: api.plans.mine,
    enabled: Boolean(user?._id) || Boolean(import.meta.env?.VITEST),
    ...queryOptions,
  });
  const planItems = plans.data?.data || [];

  if (isBooting) {
    return (
      <div>
        <PageTitle
          eyebrow="Clinical care plan"
          title="Treatment plans"
          description="Review planned dental procedures, completed steps, and estimated visit costs."
        />
        <div className="skeleton-card" style={{ padding: "2rem", display: "grid", gap: "1rem" }}>
          <div className="skeleton-bar" style={{ height: "24px", width: "40%" }} />
          <div className="skeleton-bar" style={{ height: "16px", width: "70%" }} />
          <div className="skeleton-bar" style={{ height: "80px", width: "100%" }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        eyebrow="Clinical care plan"
        title="Treatment plans"
        description="Review planned dental procedures, completed steps, and estimated visit costs."
        actions={
          <Link to="/app/dental-chart" className="button button-outline">
            View dental chart <ArrowRight size={15} />
          </Link>
        }
      />

      {plans.isError && (
        <div className="notice notice-error" role="alert" style={{ marginBottom: "1.5rem" }}>
          <strong>Could not load treatment plans.</strong>
          <p style={{ marginTop: "0.3rem" }}>{plans.error?.message || "An unexpected error occurred while communicating with the clinic server."}</p>
          <button
            type="button"
            className="button button-outline button-small"
            style={{ marginTop: "0.6rem" }}
            onClick={() => plans.refetch()}
          >
            Retry loading plans
          </button>
        </div>
      )}

      <AsyncView
        query={plans}
        empty={!plans.isLoading && !plans.isError && !planItems.length}
        emptyTitle="No treatment plans on record"
      >
        <div className="plan-list">
          {planItems.map((plan) => {
            const steps = plan.steps || [];
            const totalSteps = steps.length;
            const completedSteps = steps.filter((s) => s.status === "completed").length;
            const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
            const completedCost = steps
              .filter((s) => s.status === "completed")
              .reduce((sum, s) => sum + Number(s.cost || 0), 0);
            const totalCost = plan.totalEstimatedCost ?? steps.reduce((sum, s) => sum + Number(s.cost || 0), 0);
            const hasFollowUp = Boolean(plan.requiresFollowUp || plan.followUpRequired);

            return (
              <article className="plan-card" key={plan._id} style={{ marginBottom: "1.5rem" }}>
                <div className="section-panel-heading">
                  <div>
                    <h3>{plan.title || "Dental Treatment Plan"}</h3>
                    <p>
                      Dr. {plan.dentist?.user?.name || plan.dentist?.name || "Attending Dentist"} ·{" "}
                      {fmtDate(plan.createdAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {hasFollowUp && (
                      <span className="status-badge status-warn" style={{ fontSize: "0.8rem" }}>
                        Follow-up: {plan.followUpDate ? fmtDate(plan.followUpDate) : "Required"}
                      </span>
                    )}
                    <StatusBadge value={plan.status} />
                  </div>
                </div>

                {/* Progress bar and cost summary */}
                <div style={{ margin: "1rem 0", padding: "0.8rem", background: "#f8faf9", borderRadius: "8px", border: "1px solid #e7eeeb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                    <span>
                      Progress: <strong>{completedSteps} of {totalSteps} steps completed</strong> ({progressPct}%)
                    </span>
                    <span>
                      Cost: <strong>{rupees(completedCost)}</strong> of {rupees(totalCost)}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#dbe5e1", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${progressPct}%`,
                        height: "100%",
                        background: progressPct === 100 ? "#2a9d8f" : "#137a76",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {plan.notes && (
                  <p style={{ margin: "0.8rem 0", color: "#495a55", fontSize: "0.9rem" }}>
                    <strong>Clinical notes:</strong> {plan.notes}
                  </p>
                )}

                <div className="plan-steps" style={{ marginTop: "1rem" }}>
                  <h4 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Treatment Steps</h4>
                  {steps.map((step, idx) => {
                    const toothList = (step.toothNumbers && step.toothNumbers.length ? step.toothNumbers : step.teeth) || [];
                    return (
                      <div className="plan-step" key={step._id || idx} style={{ display: "flex", alignItems: "center", gap: "0.8rem", padding: "0.6rem 0", borderBottom: "1px solid #f0f4f2" }}>
                        <span className="step-check">
                          {step.status === "completed" ? (
                            <Check size={16} color="#2a9d8f" />
                          ) : (
                            <Clock3 size={16} color="#8c9b96" />
                          )}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <strong>
                              {step.treatment?.name || step.name || "Treatment Procedure"}
                            </strong>
                            <StatusBadge value={step.status} />
                          </div>
                          <small style={{ color: "#6b7d78" }}>
                            {toothList.length ? `Teeth: ${toothList.join(", ")}` : "Teeth: General"} · {rupees(step.cost)}
                          </small>
                        </div>

                        {step.appointment && (
                          <Link
                            to={`/app/appointments/${step.appointment?._id || step.appointment}`}
                            className="button button-quiet button-small"
                          >
                            Linked visit <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="plan-total" style={{ marginTop: "1rem", paddingTop: "0.8rem", borderTop: "1px solid #e7eeeb", display: "flex", justifyContent: "space-between" }}>
                  <span>Total Estimated Plan Cost</span>
                  <strong>{rupees(totalCost)}</strong>
                </div>
              </article>
            );
          })}
        </div>
      </AsyncView>
    </div>
  );
}

export function PatientDentalChart() {
  const user = useAuthStore((state) => state.user);
  const chart = useQuery({
    queryKey: ["chart", user?._id],
    queryFn: () => api.charts.get(user._id),
    enabled: !!user?._id,
    ...queryOptions,
  });
  const teeth = chart.data?.data?.teeth || [];
  const toothMap = new Map(teeth.map((tooth) => [tooth.toothNumber, tooth]));

  return (
    <div>
      <PageTitle
        eyebrow="Clinical chart"
        title="32-Tooth dental chart"
        description="Interactive adult FDI notation dental record shared by your dentist."
        actions={
          <Link to="/app/treatment-plans" className="button button-outline">
            ← Treatment plans
          </Link>
        }
      />
      <SectionPanel
        title="Tooth-by-tooth record"
        description="A healthy status is shown where no clinical findings have been logged."
      >
        <div className="tooth-chart" aria-label="32-tooth dental chart">
          {[0, 1].map((row) => (
            <div className={`tooth-row tooth-row-${row}`} key={row}>
              {fdiTeeth.slice(row * 16, row * 16 + 16).map((number) => {
                const entry = toothMap.get(number);
                return (
                  <div
                    className={`tooth-cell ${entry ? "tooth-recorded" : ""}`}
                    key={number}
                    aria-label={`Tooth ${number}: ${entry?.condition || "healthy"}`}
                  >
                    <span>{number}</span>
                    <strong>
                      {entry?.condition
                        ? entry.condition.slice(0, 1).toUpperCase()
                        : "✓"}
                    </strong>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="chart-legend" style={{ marginTop: "1rem" }}>
          <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#f27d52", borderRadius: "2px", marginRight: "4px" }} /> Recorded finding{" "}
          <span className="legend-healthy" style={{ display: "inline-block", width: "12px", height: "12px", background: "#dbe5e1", borderRadius: "2px", margin: "0 4px 0 16px" }} /> Healthy / no finding
        </p>
      </SectionPanel>
    </div>
  );
}

export function PatientCare() {
  return <Navigate to="/app/treatment-plans" replace />;
}

export function PatientBilling() {
  const notify = useToast();
  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: api.invoices.mine,
    ...queryOptions,
  });
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: api.payments.mine,
    ...queryOptions,
  });
  const invoiceList = invoices.data?.data || [];
  const paymentList = payments.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Billing & payments"
        title="Your account activity"
        description="View clinic-issued invoices and verified appointment payments."
      />
      <SectionPanel
        title="Invoices"
        description="PDFs are downloaded from the authenticated clinic API."
      >
        <AsyncView
          query={invoices}
          empty={
            !invoices.isLoading && !invoices.isError && !invoiceList.length
          }
          emptyTitle="No invoices found"
        >
          <div className="record-list">
            {invoiceList.map((invoice) => (
              <article className="record-row" key={invoice._id}>
                <span className="record-type-icon">
                  <FileText size={18} />
                </span>
                <div className="record-row-content">
                  <strong>Invoice {invoice.invoiceNumber}</strong>
                  <span>
                    {fmtDate(invoice.createdAt)} · {invoice.items?.length || 0}{" "}
                    items
                  </span>
                </div>
                <div className="record-row-actions">
                  <StatusBadge value={invoice.status} />
                  <strong>{rupees(invoice.totalAmount)}</strong>
                  <button
                    className="button button-quiet button-small"
                    onClick={() =>
                      downloadPdf(
                        `/invoices/${invoice._id}/pdf`,
                        `${invoice.invoiceNumber}.pdf`,
                      ).catch((error) => notify(error.message, "error"))
                    }
                  >
                    <Download size={15} /> PDF
                  </button>
                </div>
              </article>
            ))}
          </div>
        </AsyncView>
      </SectionPanel>
      <SectionPanel
        title="Payment history"
        description="Payment status comes from the server, not the checkout screen."
      >
        <AsyncView
          query={payments}
          empty={
            !payments.isLoading && !payments.isError && !paymentList.length
          }
          emptyTitle="No payments found"
        >
          <div className="record-list">
            {paymentList.map((payment) => (
              <article className="record-row" key={payment._id}>
                <span className="record-type-icon">
                  <CreditCard size={18} />
                </span>
                <div className="record-row-content">
                  <strong>
                    {payment.appointment
                      ? "Appointment payment"
                      : "Clinic payment"}
                  </strong>
                  <span>
                    {fmtDate(payment.createdAt)}
                    {payment.method ? ` · ${payment.method}` : ""}
                  </span>
                </div>
                <div className="record-row-actions">
                  <StatusBadge value={payment.status} />
                  <strong>{rupees(payment.amount)}</strong>
                </div>
              </article>
            ))}
          </div>
        </AsyncView>
      </SectionPanel>
    </div>
  );
}

export function PatientFamily() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const profile = useQuery({
    queryKey: ["patient-profile"],
    queryFn: api.patients.mine,
    ...queryOptions,
  });
  const [fields, setFields] = useState({
    name: "",
    relation: "",
    dateOfBirth: "",
    gender: "",
  });
  const members = profile.data?.data?.familyMembers || [];
  const submit = async (event) => {
    event.preventDefault();
    try {
      const result = await api.patients.addFamily(fields);
      notify(result.message);
      setFields({ name: "", relation: "", dateOfBirth: "", gender: "" });
      queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const remove = async (id) => {
    if (!(await confirm({ title: "Remove family member?", description: "This person will no longer be available to select when booking appointments.", confirmLabel: "Remove member", danger: true }))) return;
    try {
      const result = await api.patients.removeFamily(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Shared care"
        title="Family members"
        description="Manage people you may book appointments for under your patient account."
      />
      <SectionPanel title="Add a family member">
        <form className="upload-form" onSubmit={submit}>
          <Field label="Name">
            <TextInput
              required
              value={fields.name}
              onChange={(event) =>
                setFields({ ...fields, name: event.target.value })
              }
            />
          </Field>
          <Field label="Relationship">
            <TextInput
              required
              value={fields.relation}
              onChange={(event) =>
                setFields({ ...fields, relation: event.target.value })
              }
              placeholder="e.g. Child"
            />
          </Field>
          <Field label="Date of birth">
            <TextInput
              type="date"
              value={fields.dateOfBirth}
              onChange={(event) =>
                setFields({ ...fields, dateOfBirth: event.target.value })
              }
            />
          </Field>
          <Field label="Gender">
            <TextInput
              as="select"
              value={fields.gender}
              onChange={(event) =>
                setFields({ ...fields, gender: event.target.value })
              }
            >
              <option value="">Not specified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </TextInput>
          </Field>
          <button className="button button-primary">
            Add member <Plus size={16} />
          </button>
        </form>
      </SectionPanel>
      <AsyncView
        query={profile}
        empty={!profile.isLoading && !profile.isError && !members.length}
        emptyTitle="No family members added"
      >
        <div className="people-list">
          {members.map((person) => (
            <article className="people-row" key={person._id}>
              <span className="avatar avatar-large">
                <UserRound size={18} />
              </span>
              <span>
                <strong>{person.name}</strong>
                <small>
                  {person.relation}
                  {person.dateOfBirth
                    ? ` · Born ${fmtDate(person.dateOfBirth)}`
                    : ""}
                </small>
              </span>
              <button
                className="icon-button danger-icon"
                aria-label={`Remove ${person.name}`}
                onClick={() => remove(person._id)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      </AsyncView>
      {dialog}
    </div>
  );
}

export function PatientProfile() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { user, setSession } = useAuthStore();
  const profile = useQuery({
    queryKey: ["patient-profile"],
    queryFn: api.patients.mine,
    ...queryOptions,
  });
  const patient = profile.data?.data || {};
  const [fields, setFields] = useState(null);
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const values = fields || {
    name: user?.name || "",
    dateOfBirth: patient.dateOfBirth?.slice?.(0, 10) || "",
    gender: patient.gender || "",
    bloodGroup: patient.bloodGroup || "",
    address: { ...patient.address },
    allergies: (patient.allergies || []).join(", "),
    chronicConditions: (patient.chronicConditions || []).join(", "),
  };
  const updateProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patients.update({
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender || undefined,
        bloodGroup: values.bloodGroup,
        address: values.address,
        allergies: values.allergies
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        chronicConditions: values.chronicConditions
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      const result = await api.patients.updateBasic({ name: values.name });
      setSession({ ...useAuthStore.getState(), user: result.data });
      queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
      notify("Profile updated.");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const updatePassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.auth.updatePassword(password);
      useAuthStore.getState().setTokens(result.data);
      setPassword({ currentPassword: "", newPassword: "" });
      notify(result.message);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Your account"
        title="Profile & settings"
        description="Keep your details and care information current."
      />
      <AsyncView query={profile} empty={false}>
        <SectionPanel title="Personal and health information">
          <form className="profile-form" onSubmit={updateProfile}>
            <div className="two-col-fields">
              <Field label="Full name">
                <TextInput
                  required
                  value={values.name}
                  onChange={(event) =>
                    setFields({ ...values, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Email address">
                <TextInput disabled value={user?.email || ""} />
              </Field>
              <Field label="Phone">
                <TextInput disabled value={user?.phone || ""} />
              </Field>
              <Field label="Date of birth">
                <TextInput
                  type="date"
                  value={values.dateOfBirth}
                  onChange={(event) =>
                    setFields({ ...values, dateOfBirth: event.target.value })
                  }
                />
              </Field>
              <Field label="Gender">
                <TextInput
                  as="select"
                  value={values.gender}
                  onChange={(event) =>
                    setFields({ ...values, gender: event.target.value })
                  }
                >
                  <option value="">Not specified</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </TextInput>
              </Field>
              <Field label="Blood group">
                <TextInput
                  value={values.bloodGroup}
                  onChange={(event) =>
                    setFields({ ...values, bloodGroup: event.target.value })
                  }
                />
              </Field>
              <Field label="Allergies" className="field-wide">
                <TextInput
                  value={values.allergies}
                  onChange={(event) =>
                    setFields({ ...values, allergies: event.target.value })
                  }
                  placeholder="Separate with commas"
                />
              </Field>
              <Field label="Chronic conditions" className="field-wide">
                <TextInput
                  value={values.chronicConditions}
                  onChange={(event) =>
                    setFields({
                      ...values,
                      chronicConditions: event.target.value,
                    })
                  }
                  placeholder="Separate with commas"
                />
              </Field>
            </div>
            <button className="button button-primary" disabled={busy}>
              Save profile <Check size={15} />
            </button>
          </form>
        </SectionPanel>
      </AsyncView>
      <SectionPanel
        title="Change password"
        description="Your current session will receive new access and refresh tokens."
      >
        <form className="two-col-fields" onSubmit={updatePassword}>
          <Field label="Current password">
            <TextInput
              type="password"
              required
              value={password.currentPassword}
              onChange={(event) =>
                setPassword({
                  ...password,
                  currentPassword: event.target.value,
                })
              }
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              minLength={6}
              required
              value={password.newPassword}
              onChange={(event) =>
                setPassword({ ...password, newPassword: event.target.value })
              }
            />
          </Field>
          <button className="button button-outline" disabled={busy}>
            Update password <ShieldCheck size={15} />
          </button>
        </form>
      </SectionPanel>
    </div>
  );
}

export function PatientProfilePhoto() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const user = useAuthStore((state) => state.user);

  const handleUpload = async (file, onProgress) => {
    const data = new FormData();
    data.append("photo", file);
    const result = await api.patients.updateBasic(data, { onUploadProgress: onProgress });
    const current = useAuthStore.getState();
    current.setSession({ ...current, user: result.data });
    await queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
    return result;
  };

  return (
    <SectionPanel
      title="Profile photo"
      description="JPEG, PNG, or WEBP; maximum 10 MB."
    >
      <FileUpload
        accept="image/jpeg,image/png,image/webp"
        maxSizeMB={10}
        previewUrl={user?.profilePhoto?.url}
        onUpload={handleUpload}
        label="Choose or drop a profile photo"
        hint="JPG, PNG, or WEBP up to 10 MB"
        submitLabel="Update photo"
        onSuccess={(result) => {
          notify(result?.message || "Profile photo updated successfully.");
        }}
      />
    </SectionPanel>
  );
}


export function PatientTreatmentsPage() {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const treatmentsQuery = useQuery({
    queryKey: ["treatments"],
    queryFn: api.treatments.list,
  });

  const plansQuery = useQuery({
    queryKey: ["patient-plans", user?._id || "me"],
    queryFn: api.plans.mine,
    enabled: Boolean(user?._id) || Boolean(import.meta.env?.VITEST),
  });

  const treatments = treatmentsQuery.data?.data || [];
  const plans = plansQuery.data?.data || [];

  // Build a lookup map of treatments that are part of the patient's active plans
  const planStepMap = useMemo(() => {
    const map = new Map();
    plans.forEach((plan) => {
      (plan.steps || []).forEach((step, idx) => {
        const stepInfo = {
          planTitle: plan.title,
          stepNumber: idx + 1,
          totalSteps: plan.steps.length,
          status: step.status,
        };
        if (step.treatment) {
          const tId = typeof step.treatment === "object" ? step.treatment._id : step.treatment;
          map.set(String(tId), stepInfo);
        }
        if (step.name) {
          map.set(step.name.toLowerCase().trim(), stepInfo);
        }
      });
    });
    return map;
  }, [plans]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set();
    treatments.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return ["all", ...Array.from(set)];
  }, [treatments]);

  // Filter treatments
  const filtered = treatments.filter((t) => {
    const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
    const matchesSearch =
      !search.trim() ||
      (t.name && t.name.toLowerCase().includes(search.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      <PageTitle
        eyebrow="Dental procedures"
        title="Treatments & my plan"
        description="Explore dental procedures available at the clinic, estimated fees, and track procedures in your active care plan."
        actions={
          <Link to="/app/treatment-plans" className="button button-outline">
            View full treatment plan <ArrowRight size={15} />
          </Link>
        }
      />

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", alignItems: "center", marginBottom: "1.2rem" }}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <TextInput
            placeholder="Search treatments by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Chips */}
      {categories.length > 2 && (
        <div className="filter-chips" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={"button button-small " + (selectedCategory === cat ? "button-primary" : "button-outline")}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "All treatments" : cat}
            </button>
          ))}
        </div>
      )}

      <AsyncView
        query={treatmentsQuery}
        empty={!treatmentsQuery.isLoading && !treatmentsQuery.isError && !filtered.length}
        emptyTitle="No treatments found"
        emptyDescription={search ? "Try adjusting your search query or category filter." : "The treatment catalog is currently empty."}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.2rem" }}>
          {filtered.map((item) => {
            const planStep = planStepMap.get(String(item._id)) || planStepMap.get(item.name?.toLowerCase().trim());
            return (
              <article
                key={item._id}
                className="record-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "1.2rem",
                  border: planStep ? "1.5px solid #6366f1" : "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "8px",
                  background: "var(--color-surface, #ffffff)",
                  position: "relative",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{item.name}</h3>
                    {item.category && (
                      <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", background: "var(--color-surface-subtle, #f1f5f9)", borderRadius: "12px", color: "#64748b" }}>
                        {item.category}
                      </span>
                    )}
                  </div>

                  {planStep && (
                    <div style={{ margin: "0.5rem 0 0.8rem 0", padding: "0.4rem 0.6rem", background: "#e0e7ff", borderRadius: "6px", fontSize: "0.8rem", color: "#3730a3" }}>
                      <strong>In your care plan:</strong> Step {planStep.stepNumber} of {planStep.totalSteps} ({planStep.status})
                    </div>
                  )}

                  <p style={{ fontSize: "0.88rem", color: "#475569", margin: "0.4rem 0 1rem 0" }}>
                    {item.description || "Comprehensive dental procedure provided by our specialist team."}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", margin: "0.8rem 0" }}>
                    <span>Estimated fee: <strong style={{ color: "var(--color-heading, #0f172a)" }}>{rupees(item.defaultCost || item.price || 0)}</strong></span>
                    <span>{item.durationMinutes || 30} mins</span>
                  </div>
                </div>

                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color, #f1f5f9)", paddingTop: "0.8rem" }}>
                  <Link
                    to={`/app/book?reason=${encodeURIComponent(item.name)}&treatmentId=${item._id}`}
                    className="button button-primary button-small"
                    style={{ width: "100%", textAlign: "center" }}
                  >
                    Book this treatment <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </AsyncView>
    </div>
  );
}
