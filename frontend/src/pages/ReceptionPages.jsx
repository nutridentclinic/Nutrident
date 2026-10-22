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
} from "lucide-react";
import { api, downloadPdf } from "../api/domains.js";
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

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const fmtDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : "Date not set";

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
      {dialog}
    </div>
  );
}

export function InvoiceCreator() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { confirm, dialog } = useConfirm();
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
  const [status, setStatus] = useState("unpaid");
  const [page, setPage] = useState(1);
  const [paidMethod, setPaidMethod] = useState("cash");
  const invoices = useQuery({
    queryKey: ["staff-invoices", status, page],
    queryFn: () => api.invoices.all({ status, page, limit: 20 }),
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
        dentistId: form.dentistId || undefined,
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
      description: "Only use this after confirming that payment was collected by the clinic.",
      confirmLabel: "Record payment",
    });
    if (!accepted) return;
    try {
      const result = await api.invoices.markPaid(entry._id, paidMethod);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Billing desk"
        title="Create an invoice"
        description="Enter the clinic’s charge items; tax, discount and final totals are calculated by the server."
      />
      {invoice && (
        <div className="notice notice-success">
          <Check size={17} /> Invoice {invoice.invoiceNumber} created. Server
          total:{" "}
          <strong>{` ₹${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`}</strong>
        </div>
      )}
      <SectionPanel title="Invoice details">
        <form className="stack-form" onSubmit={create}>
          <div className="admin-form-grid">
            <Field label="Patient account ID">
              <TextInput
                required
                value={form.patientId}
                onChange={(event) =>
                  setForm({ ...form, patientId: event.target.value })
                }
              />
            </Field>
            <Field label="Dentist ID (optional)">
              <TextInput
                value={form.dentistId}
                onChange={(event) =>
                  setForm({ ...form, dentistId: event.target.value })
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
                <button type="button" className="button button-quiet button-small" onClick={previewCoupon} disabled={previewBusy || !form.couponCode}>
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
            {preview && <span>Coupon estimate <strong>-{rupees(preview.discount)}</strong></span>}
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
      </SectionPanel>
      <SectionPanel title="Existing invoices" description="Final totals and payment status are returned by the clinic server.">
        <div className="filter-bar">
          <Field label="Status"><TextInput as="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option></TextInput></Field>
          <Field label="Record payment by"><TextInput as="select" value={paidMethod} onChange={(event) => setPaidMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank-transfer">Bank transfer</option></TextInput></Field>
        </div>
        <AsyncView query={invoices} empty={!invoices.isLoading && !invoices.isError && !invoiceRows.length} emptyTitle="No invoices for this status">
          <div className="record-list">{invoiceRows.map((entry) => <article className="record-row" key={entry._id}><span className="record-type-icon"><FileText size={17} /></span><div className="record-row-content"><strong>{entry.invoiceNumber} · {entry.patient?.name || "Patient"}</strong><span>{fmtDate(entry.createdAt)} · {entry.items?.length || 0} items</span></div><div className="record-row-actions"><StatusBadge value={entry.status} /><strong>{rupees(entry.totalAmount)}</strong><button className="button button-quiet button-small" onClick={() => downloadPdf(`/invoices/${entry._id}/pdf`, `${entry.invoiceNumber}.pdf`).catch((error) => notify(error.message, "error"))}><Download size={14} /> PDF</button>{entry.status === "unpaid" && <button className="button button-outline button-small" onClick={() => markPaid(entry)}>Mark paid</button>}</div></article>)}</div>
        </AsyncView>
        {invoices.data?.meta?.total > 20 && <div className="pagination"><button className="button button-outline button-small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(invoices.data.meta.total / 20)}</span><button className="button button-outline button-small" disabled={page >= Math.ceil(invoices.data.meta.total / 20)} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
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
