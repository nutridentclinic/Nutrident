import { useState } from "react";
import { Link } from "react-router-dom";
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
  const [id, setId] = useState("");
  const [lookup, setLookup] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();

  const primary = usePrimaryDentist();

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

  const query = useQuery({
    queryKey: ["appointment", "lookup", lookup],
    queryFn: () => api.appointments.detail(lookup),
    enabled: !!lookup,
  });
  const listQuery = useQuery({
    queryKey: ["appointments", "reception", date, search],
    queryFn: async () => {
      try {
        return await api.appointments.all({ date, search, page: 1, limit: 50 });
      } catch (error) {
        if (error.status === 404) return { data: [], limited: true };
        throw error;
      }
    },
  });

  // Slots for staff booking modal
  const staffSlotsQuery = useQuery({
    queryKey: ["staff-booking-slots", bookingDate, primary.dentistId],
    queryFn: () => fetchPrimarySlotsWithFallback(bookingDate, primary.dentistId),
    enabled: showBookingModal && !!bookingDate,
  });
  const availableSlots = (staffSlotsQuery.data || []).filter(
    (slot) => !isPastSlot(bookingDate, slot.startTime),
  );

  // Patient search for staff booking
  const patientSearchResults = useQuery({
    queryKey: ["patient-search", patientSearchTerm],
    queryFn: () => api.patients.list({ search: patientSearchTerm, limit: 8 }),
    enabled: showBookingModal && patientSearchTerm.length >= 2,
  });

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

      try {
        const res = await api.appointments.createStaff(payload);
        notify(res.message || "Appointment booked and confirmed.", "success");
      } catch (err) {
        if (err.status === 404) {
          // Graceful fallback on live backend before redeployment
          const created = await api.appointments.create({
            dentistId: primary.dentistId || undefined,
            date: bookingDate,
            startTime: bookingSlot,
            mode: bookingMode,
            reasonForVisit: bookingReason,
          });
          if (created.data?._id) {
            await api.appointments.confirm(created.data._id, { staffOverride: true });
          }
          notify("Appointment booked and confirmed by staff override.", "success");
        } else {
          throw err;
        }
      }
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
  const act = async (name) => {
    if (name === "confirm" && item?.paymentStatus !== "paid") {
      const approved = await confirm({
        title: "Confirm an unpaid appointment?",
        description: "This uses the explicit staff override and does not mark payment as paid.",
        confirmLabel: "Override and confirm",
      });
      if (!approved) return;
    }
    if (name === "noShow" || name === "cancel") {
      const approved = await confirm({
        title: name === "noShow" ? "Mark this visit as no-show?" : "Cancel this appointment?",
        description: name === "noShow" ? "This appointment will be recorded as a no-show." : "Refund eligibility depends on the clinic cancellation policy.",
        confirmLabel: name === "noShow" ? "Mark no-show" : "Cancel appointment",
        danger: true,
      });
      if (!approved) return;
    }
    try {
      const result = name === "confirm"
        ? await api.appointments.confirm(lookup, { staffOverride: item?.paymentStatus !== "paid" })
        : name === "cancel"
          ? await api.appointments.cancel(lookup, "Cancelled by clinic staff")
          : await api.appointments[name](lookup);
      notify(result.message);
      queryClient.invalidateQueries({
        queryKey: ["appointment", "lookup", lookup],
      });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Appointment support"
        title="Appointment lookup"
        description="Review appointments for a clinic date or open a specific visit by ID."
        actions={
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowBookingModal(true)}
          >
            <Plus size={15} /> New appointment
          </button>
        }
      />
      <div className="filter-bar">
        <Field label="Date">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Patient search">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email or phone"
          />
        </Field>
      </div>
      {listQuery.data?.limited && (
        <div className="notice notice-warn">
          The appointment-list endpoint is unavailable. Use the appointment ID
          lookup below.
        </div>
      )}
      <AsyncView
        query={listQuery}
        empty={
          !listQuery.isLoading &&
          !listQuery.isError &&
          !appointments.length &&
          !listQuery.data?.limited
        }
        emptyTitle="No appointments for this date"
      >
        <div className="appointment-list">
          {appointments.map((visit) => (
            <button
              type="button"
              className="appointment-row lookup-row"
              key={visit._id}
              onClick={() => {
                setId(visit._id);
                setLookup(visit._id);
              }}
            >
              <div className="appointment-date">
                <CalendarDays size={17} />
                <span>
                  {visit.startTime}
                  <small>{fmtDate(visit.date)}</small>
                </span>
              </div>
              <div className="appointment-main">
                <h3>{visit.patient?.name || "Patient"}</h3>
                <p>
                  Dr. {visit.dentist?.user?.name || "Dentist"} ·{" "}
                  {visit.reasonForVisit || visit.mode}
                </p>
              </div>
              <StatusBadge value={visit.status} />
              <span className="row-arrow">
                <ArrowRight size={15} />
              </span>
            </button>
          ))}
        </div>
      </AsyncView>
      <form
        className="lookup-form"
        onSubmit={(event) => {
          event.preventDefault();
          setLookup(id.trim());
        }}
      >
        <Field label="Appointment ID">
          <TextInput
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder="Paste the appointment ID"
            required
          />
        </Field>
        <button className="button button-primary">
          Look up <Search size={15} />
        </button>
      </form>
      {lookup && (
        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && !item}
          emptyTitle="Appointment not found"
        >
          {item && (
            <SectionPanel
              title={`Visit with Dr. ${item.dentist?.user?.name || "dentist"}`}
              description={`${fmtDate(item.date)} · ${item.startTime} · ${item.patient?.name || "Patient"}`}
            >
              <div className="appointment-lookup-details">
                <span>
                  Visit type <strong>{item.mode}</strong>
                </span>
                <span>
                  Payment <StatusBadge value={item.paymentStatus} />
                </span>
                <span>
                  Status <StatusBadge value={item.status} />
                </span>
                <span>
                  Total <strong>{rupees(item.fees?.totalAmount)}</strong>
                </span>
              </div>
              <div className="inline-actions">
                {item.status === "pending" && (
                  <button
                    className="button button-outline"
                    onClick={() => act("confirm")}
                  >
                    {item.paymentStatus === "paid" ? "Confirm visit" : "Staff override"} <Check size={15} />
                  </button>
                )}
                {["pending", "confirmed"].includes(item.status) && (
                  <button
                    className="button button-quiet"
                      onClick={() => act("noShow")}
                  >
                    Mark no-show
                  </button>
                )}
                {["pending", "confirmed"].includes(item.status) && (
                  <button
                    className="button button-quiet"
                      onClick={() => act("cancel")}
                  >
                    Cancel appointment
                  </button>
                )}
              </div>
            </SectionPanel>
          )}
        </AsyncView>
      )}

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
                    <TextInput
                      placeholder="Search patient by name or phone (min 2 characters)"
                      value={patientSearchTerm}
                      onChange={(e) => setPatientSearchTerm(e.target.value)}
                    />
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
                          <strong>No registered patient found.</strong> Walk-in registration is disabled to ensure verified patient accounts.
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem" }}>
                          <span style={{ fontSize: "0.8rem" }}>Ask patient to register at: <code>{typeof window !== "undefined" ? window.location.origin : ""}/register</code></span>
                          <button
                            type="button"
                            className="button button-outline button-small"
                            onClick={() => {
                              navigator.clipboard?.writeText(`${window.location.origin}/register`);
                              notify("Registration link copied to clipboard.");
                            }}
                          >
                            Copy link
                          </button>
                        </div>
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
                  <option value="video">Video consultation</option>
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

      {dialog}
    </div>
  );
}

export function InvoiceCreator() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
  const primary = usePrimaryDentist();

  // Filters and table state
  const [status, setStatus] = useState("unpaid");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [paidMethod, setPaidMethod] = useState("cash");

  // Selected invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [extraItems, setExtraItems] = useState([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [extraCoupon, setExtraCoupon] = useState("");
  const [updatingItems, setUpdatingItems] = useState(false);

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

  const invoices = useQuery({
    queryKey: ["staff-invoices", status, filterDate, search, page],
    queryFn: () =>
      api.invoices.all({
        status: status || undefined,
        from: filterDate || undefined,
        to: filterDate || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      }),
  });
  const invoiceRows = invoices.data?.data || [];
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
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
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

  const markPaid = async (entry) => {
    const accepted = await confirm({
      title: `Mark invoice ${entry.invoiceNumber} as paid?`,
      description: "Only use this after confirming that payment was collected by the clinic counter.",
      confirmLabel: "Record payment",
    });
    if (!accepted) return;
    try {
      const result = await api.invoices.markPaid(entry._id, paidMethod);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      if (selectedInvoice && selectedInvoice._id === entry._id) {
        setSelectedInvoice({ ...selectedInvoice, status: "paid", paymentMethod: paidMethod });
      }
    } catch (error) {
      notify(error.message, "error");
    }
  };

  return (
    <div>
      <PageTitle
        eyebrow="Billing desk"
        title="Invoices & Payments"
        description="Review auto-generated visit invoices, collect payments at counter, add extra procedure items, or issue manual invoices for non-visit charges."
      />

      {invoice && (
        <div className="notice notice-success">
          <Check size={17} /> Invoice {invoice.invoiceNumber} created. Server
          total:{" "}
          <strong>{` ₹${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`}</strong>
        </div>
      )}

      {/* Main invoices list with multi-parameter filter */}
      <SectionPanel
        title="Clinic invoices"
        description="Consultation invoices are auto-created when appointments are completed. Filter by payment status, date, or patient."
      >
        <div className="filter-bar">
          <Field label="Status">
            <TextInput
              as="select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
            </TextInput>
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={filterDate}
              onChange={(event) => {
                setFilterDate(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Patient / Invoice search">
            <TextInput
              placeholder="Search by patient name, phone, or invoice #"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Counter payment method">
            <TextInput
              as="select"
              value={paidMethod}
              onChange={(event) => setPaidMethod(event.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank-transfer">Bank transfer</option>
            </TextInput>
          </Field>
        </div>

        <AsyncView
          query={invoices}
          empty={!invoices.isLoading && !invoices.isError && !invoiceRows.length}
          emptyTitle="No invoices found for this filter"
        >
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
                    {entry.patient?.phone ? ` · ${entry.patient.phone}` : ""}
                  </span>
                </div>
                <div className="record-row-actions">
                  <StatusBadge value={entry.status} />
                  <strong>{rupees(entry.totalAmount)}</strong>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => setSelectedInvoice(entry)}
                  >
                    View / Edit
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() =>
                      downloadPdf(`/invoices/${entry._id}/pdf`, `${entry.invoiceNumber}.pdf`).catch((error) =>
                        notify(error.message, "error")
                      )
                    }
                  >
                    <Download size={14} /> PDF
                  </button>
                  {entry.status === "unpaid" && (
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => markPaid(entry)}
                    >
                      Collect payment
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </AsyncView>

        {invoices.data?.meta?.total > 20 && (
          <div className="pagination">
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(invoices.data.meta.total / 20)}
            </span>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={page >= Math.ceil(invoices.data.meta.total / 20)}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        )}
      </SectionPanel>

      {/* Invoice Detail / Edit Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop" onClick={() => setSelectedInvoice(null)}>
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
                onClick={() => setSelectedInvoice(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "1.2rem", display: "grid", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <StatusBadge value={selectedInvoice.status} />
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() =>
                    downloadPdf(
                      `/invoices/${selectedInvoice._id}/pdf`,
                      `${selectedInvoice.invoiceNumber}.pdf`
                    ).catch((err) => notify(err.message, "error"))
                  }
                >
                  <Download size={14} /> Download PDF
                </button>
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
              </div>

              {/* If unpaid, allow payment collection or adding extra items */}
              {selectedInvoice.status === "unpaid" && (
                <div style={{ borderTop: "1px solid #e2ece9", paddingTop: "1rem", display: "grid", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8faf9", padding: "0.8rem", borderRadius: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Collect via:</label>
                      <TextInput
                        as="select"
                        value={paidMethod}
                        onChange={(e) => setPaidMethod(e.target.value)}
                        style={{ width: "auto" }}
                      >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="upi">UPI</option>
                        <option value="bank-transfer">Bank transfer</option>
                      </TextInput>
                    </div>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={async () => {
                        await markPaid(selectedInvoice);
                        setSelectedInvoice(null);
                      }}
                    >
                      Record payment
                    </button>
                  </div>

                  <div style={{ background: "#fff", border: "1px solid #dbe5e1", borderRadius: "6px", padding: "0.8rem" }}>
                    <strong style={{ display: "block", marginBottom: "0.5rem" }}>
                      Add extra procedure line items or coupon (PATCH /invoices/:id/items)
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
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        onClick={() => setExtraItems((all) => [...all, { description: "", quantity: 1, unitPrice: 0 }])}
                      >
                        + Add item line
                      </button>
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

      {/* Manual invoice creation for non-visit charges */}
      <SectionPanel
        title="Manual invoice for non-visit charges"
        description="Visit consultations and procedures are automatically invoiced when completed. Use this form only for manual, non-appointment charges such as dental hygiene products or external diagnostic services."
        actions={
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => setShowManualInvoice(!showManualInvoice)}
          >
            {showManualInvoice ? "Hide form" : "Create non-visit invoice"}
          </button>
        }
      >
        {showManualInvoice && (
          <form className="stack-form" onSubmit={create}>
            <div className="admin-form-grid">
              <Field label="Patient account ID">
                <TextInput
                  required
                  value={form.patientId}
                  onChange={(event) =>
                    setForm({ ...form, patientId: event.target.value })
                  }
                  placeholder="Patient user ID"
                />
              </Field>
              <Field label="Doctor">
                <TextInput
                  disabled
                  value={
                    primary.dentist
                      ? `Dr. ${primary.dentist.user?.name || "Doctor"} (${primary.dentist.specialization || "Dental Care"})`
                      : "Primary Clinic Doctor"
                  }
                />
              </Field>
              <Field label="Appointment ID (optional)">
                <TextInput
                  value={form.appointmentId}
                  onChange={(event) =>
                    setForm({ ...form, appointmentId: event.target.value })
                  }
                />
              </Field>
              <Field label="Coupon code (optional)">
                <div className="inline-form">
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
                    {previewBusy ? "Checking…" : "Preview"}
                  </button>
                </div>
              </Field>
            </div>
            <div className="invoice-items-head">
              <h3>Line items</h3>
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
                <Plus size={14} /> Add item
              </button>
            </div>
            {items.map((item, index) => (
              <div className="invoice-item-row" key={index}>
                <Field label="Description">
                  <TextInput
                    required
                    value={item.description}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((entry, ix) =>
                          ix === index
                            ? { ...entry, description: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Quantity">
                  <TextInput
                    type="number"
                    min="1"
                    required
                    value={item.quantity}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((entry, ix) =>
                          ix === index
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Unit price (INR)">
                  <TextInput
                    type="number"
                    min="0"
                    required
                    value={item.unitPrice}
                    onChange={(event) =>
                      setItems((all) =>
                        all.map((entry, ix) =>
                          ix === index
                            ? { ...entry, unitPrice: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <strong>
                  {rupees(Number(item.quantity) * Number(item.unitPrice))}
                </strong>
                {items.length > 1 && (
                  <button
                    className="button button-quiet button-small"
                    type="button"
                    onClick={() =>
                      setItems((all) => all.filter((_, ix) => ix !== index))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div className="invoice-preview">
              <span>
                Line-item estimate <strong>{rupees(subtotal)}</strong>
              </span>
              {preview && (
                <span>
                  Coupon estimate <strong>-{rupees(preview.discount)}</strong>
                </span>
              )}
              <small>
                Final tax, coupon discount and invoice amount will be calculated
                by the clinic server.
              </small>
            </div>
            <button disabled={busy} className="button button-primary">
              {busy ? "Creating invoice…" : "Create invoice"}{" "}
              <FileText size={16} />
            </button>
          </form>
        )}
      </SectionPanel>

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
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.mine({ limit: 50 }),
    refetchInterval: 30000,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: api.notifications.preferences,
  });
  const rows = notifications.data?.data || [];
  const unread = notifications.data?.meta?.unreadCount || 0;
  const markRead = async (id) => {
    try {
      const result = await api.notifications.read(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      notify(error.message, "error");
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
  const updateEmail = async (value) => {
    try {
      const result = await api.notifications.updatePreferences({
        email: value,
      });
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Stay informed"
        title="Notifications"
        description={`${unread} unread update${unread === 1 ? "" : "s"} · refreshes every 30 seconds.`}
        actions={
          unread > 0 && (
            <button
              className="button button-outline button-small"
              onClick={markAll}
            >
              Mark all read <Check size={14} />
            </button>
          )
        }
      />
      <SectionPanel title="Preferences">
        <div className="preference-row">
          <span>
            <strong>Email notifications</strong>
            <small>
              Email preference is saved by the backend but email delivery
              preference is not enforced yet.
            </small>
          </span>
          <input
            aria-label="Email notifications"
            type="checkbox"
            checked={preferences.data?.data?.email ?? true}
            onChange={(event) => updateEmail(event.target.checked)}
          />
        </div>
      </SectionPanel>
      <AsyncView
        query={notifications}
        empty={
          !notifications.isLoading && !notifications.isError && !rows.length
        }
        emptyTitle="No notifications"
      >
        <div className="notification-list">
          {rows.map((entry) => (
            <article
              className={`notification-row ${entry.isRead ? "" : "notification-unread"}`}
              key={entry._id}
            >
              <span className="notification-dot" />
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.message}</p>
                <small>
                  {new Date(entry.createdAt).toLocaleString("en-IN")}
                </small>
              </div>
              {!entry.isRead && (
                <button
                  className="button button-quiet button-small"
                  onClick={() => markRead(entry._id)}
                >
                  Mark read
                </button>
              )}
            </article>
          ))}
        </div>
      </AsyncView>
    </div>
  );
}
