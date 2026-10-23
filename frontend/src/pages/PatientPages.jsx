import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrimaryDentist } from "../hooks/usePrimaryDentist.js";
import { fetchPrimarySlotsWithFallback } from "../api/capabilities.js";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Download,
  FilePlus2,
  FileText,
  HeartPulse,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api, downloadPdf } from "../api/domains.js";
import { useAuthStore } from "../store/auth.js";
import { clinicDate, isPastSlot } from "../utils/booking.js";
import { FDI_TEETH as fdiTeeth } from "../utils/teeth.js";
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

const fmtDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : "Date not set";
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const queryOptions = { staleTime: 15000, retry: 1 };
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
                    ? new Date(nextVisit.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        timeZone: "UTC",
                      })
                    : "--"}
                </strong>
                <small>
                  {nextVisit
                    ? new Date(nextVisit.date).toLocaleDateString("en-IN", {
                        month: "short",
                        timeZone: "UTC",
                      })
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
                {item.mode === "video" && item.status === "confirmed" && (
                  <Link
                    to={`/consultation/${item._id}/lobby`}
                    className="button button-primary button-small"
                  >
                    Join video
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </AsyncView>
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
                          { onSuccess: (result) => {
                            setReschedule(null);
                            if (result.data?._id) navigate(`/app/appointments/${result.data._id}`);
                          } },
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
              {item.mode === "video" && item.status === "confirmed" && (
                <Link
                  className="button button-primary button-wide"
                  to={`/consultation/${id}/lobby`}
                >
                  Join video consultation <ArrowRight size={16} />
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
  const [date, setDate] = useState(clinicDate());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [mode, setMode] = useState("in-clinic");
  const [reason, setReason] = useState("");
  const [familyMemberName, setFamilyMemberName] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [serverFees, setServerFees] = useState(null);
  const slotsQuery = useQuery({
    queryKey: ["slots", effectiveDentistId, date],
    queryFn: () => fetchPrimarySlotsWithFallback(date, effectiveDentistId),
    enabled: !!date,
    refetchInterval: 30000,
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
          "Payment is not completed. You can retry checkout; no charge is considered successful until the clinic confirms it.",
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
    if (appointmentId) return;
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
      const result = await api.appointments.create({
        dentistId: effectiveDentistId || undefined,
        date,
        startTime: selectedSlot,
        mode,
        reasonForVisit: reason,
        familyMemberName: familyMemberName || undefined,
      });
      const appointment = result.data;
      setAppointmentId(appointment._id);
      setServerFees(appointment.fees);
      await payForAppointment(appointment._id);
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
          <Link to="/doctor" className="button button-quiet">
            ← Doctor profile
          </Link>
        }
      />
      {!primary.isLoading && (!dentist || !isAcceptingAppointments) && (
        <div className="notice notice-warn">
          The doctor is currently not accepting new appointments online. Please call the clinic directly at{" "}
          {settings?.contactPhone || "the front desk"} or check back soon.
        </div>
      )}
      {dentist && isAcceptingAppointments && (
        <form className="booking-layout" onSubmit={book}>
          <section className="booking-main">
            <SectionPanel
              title="1. Select a date"
              description={`Availability is shown in ${import.meta.env.VITE_CLINIC_TIMEZONE || "Asia/Kolkata"} clinic time.`}
            >
              <Field label="Appointment date">
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
              <AsyncView
                query={slotsQuery}
                empty={
                  !slotsQuery.isLoading &&
                  !slotsQuery.isError &&
                  slots.length === 0
                }
                emptyTitle="No available times. Try another date."
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
            <p className="summary-note">
              The server-set appointment fees are used for payment; the order
              amount comes directly from Razorpay configuration. Appointment
              coupons are not available for this booking.
            </p>
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
                disabled={busy || !selectedSlot}
                className="button button-primary button-wide"
              >
                {busy
                  ? resultLabel || "Working…"
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
            <article className="record-card" key={item._id}>
              <div className="record-card-head">
                <span className="catalog-icon">
                  <FileText size={18} />
                </span>
                <span>{fmtDate(item.createdAt)}</span>
              </div>
              <h2>{item.diagnosis || "Prescription"}</h2>
              <p>Dr. {item.dentist?.user?.name || "Your dentist"}</p>
              <ul className="medicine-list">
                {(item.medicines || []).map((medicine, index) => (
                  <li key={`${medicine.name}-${index}`}>
                    <strong>{medicine.name}</strong>
                    <span>
                      {medicine.dosage} · {medicine.frequency} ·{" "}
                      {medicine.durationDays} days
                    </span>
                  </li>
                ))}
              </ul>
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
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("other");
  const [busy, setBusy] = useState(false);
  const items = query.data?.data || [];
  const upload = async (event) => {
    event.preventDefault();
    if (!file) return notify("Choose a file to upload.", "error");
    const data = new FormData();
    data.append("file", file);
    data.append("title", title || file.name);
    data.append("type", type);
    setBusy(true);
    try {
      const result = await api.records.upload(data);
      notify(result.message);
      setTitle("");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["records"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
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
        <form className="upload-form" onSubmit={upload}>
          <Field label="Record title">
            <TextInput
              required
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
          <Field label="File">
            <TextInput
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </Field>
          <button disabled={busy} className="button button-primary">
            {busy ? "Uploading…" : "Upload record"} <FilePlus2 size={16} />
          </button>
        </form>
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
                  <a
                    className="button button-quiet button-small"
                    href={item.file?.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open file <ArrowRight size={14} />
                  </a>
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

export function PatientCare() {
  const user = useAuthStore((state) => state.user);
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: api.plans.mine,
    ...queryOptions,
  });
  const chart = useQuery({
    queryKey: ["chart", user?._id],
    queryFn: () => api.charts.get(user._id),
    enabled: !!user?._id,
    ...queryOptions,
  });
  const teeth = chart.data?.data?.teeth || [];
  const toothMap = new Map(teeth.map((tooth) => [tooth.toothNumber, tooth]));
  const planItems = plans.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Your clinical overview"
        title="Care & dental chart"
        description="Review treatment plans and see the current chart shared by your dentist."
      />
      <SectionPanel
        title="Dental chart"
        description="A healthy state is shown where no condition has been recorded."
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
        <p className="chart-legend">
          <span /> Recorded finding <span className="legend-healthy" /> No
          finding recorded
        </p>
      </SectionPanel>
      <section className="records-section">
        <h2>Treatment plans</h2>
        <AsyncView
          query={plans}
          empty={!plans.isLoading && !plans.isError && !planItems.length}
          emptyTitle="No treatment plans yet"
        >
          <div className="plan-list">
            {planItems.map((plan) => (
              <article className="plan-card" key={plan._id}>
                <div className="section-panel-heading">
                  <div>
                    <h3>{plan.title}</h3>
                    <p>
                      Dr. {plan.dentist?.user?.name || "Your dentist"} ·{" "}
                      {fmtDate(plan.createdAt)}
                    </p>
                  </div>
                  <StatusBadge value={plan.status} />
                </div>
                {plan.notes && <p>{plan.notes}</p>}
                <div className="plan-steps">
                  {(plan.steps || []).map((step) => (
                    <div className="plan-step" key={step._id}>
                      <span className="step-check">
                        {step.status === "completed" ? (
                          <Check size={14} />
                        ) : (
                          <Clock3 size={14} />
                        )}
                      </span>
                      <span>
                        <strong>
                          {step.treatment?.name ||
                            step.name ||
                            "Treatment step"}
                        </strong>
                        <small>
                          {step.status} · {rupees(step.cost)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="plan-total">
                  Estimated plan cost{" "}
                  <strong>{rupees(plan.totalEstimatedCost)}</strong>
                </div>
              </article>
            ))}
          </div>
        </AsyncView>
      </section>
    </div>
  );
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
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async (event) => {
    event.preventDefault();
    if (!file) return notify("Choose a photo first.", "error");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return notify("Choose a JPG, PNG, or WEBP image.", "error");
    if (file.size > 10 * 1024 * 1024)
      return notify("Profile photos must be 10 MB or smaller.", "error");
    const data = new FormData();
    data.append("photo", file);
    setBusy(true);
    try {
      const result = await api.patients.updateBasic(data);
      const current = useAuthStore.getState();
      current.setSession({ ...current, user: result.data });
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
      notify(result.message);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionPanel
      title="Profile photo"
      description="JPEG, PNG, or WEBP; maximum 10 MB."
    >
      <form className="inline-form" onSubmit={upload}>
        {user?.profilePhoto?.url && (
          <img
            className="profile-photo-preview"
            src={user.profilePhoto.url}
            alt="Current profile"
          />
        )}
        <Field label="Choose a photo">
          <TextInput
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </Field>
        <button className="button button-outline" disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload photo"} <FilePlus2 size={15} />
        </button>
      </form>
    </SectionPanel>
  );
}
