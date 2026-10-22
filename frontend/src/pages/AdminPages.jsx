import { useState } from "react";
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
  Activity,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ClipboardList,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../api/domains.js";
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

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const fmtDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : "Date not set";

function AdminDashboard() {
  const stats = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: api.dashboard.admin,
  });
  const weekly = useQuery({
    queryKey: ["dashboard", "weekly"],
    queryFn: api.dashboard.weekly,
  });
  const revenue = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: api.dashboard.revenue,
  });
  const specialties = useQuery({
    queryKey: ["dashboard", "specialties"],
    queryFn: api.dashboard.specialties,
  });
  const [today] = useState(() => new Date());
  const week = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + offset);
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toLocaleDateString("en-IN", {
        weekday: "short",
        timeZone: "UTC",
      }),
      count:
        (weekly.data?.data || []).find((entry) => entry._id === key)?.count ||
        0,
    };
  });
  const monthData = (revenue.data?.data || []).map((entry) => ({
    month: entry._id,
    total: entry.total,
  }));
  const numbers = stats.data?.data || {};
  return (
    <div>
      <PageTitle
        eyebrow="Clinic operations"
        title="Administration"
        description="A live summary of activity reported by the clinic backend."
        actions={
          <Link to="/admin/dentists" className="button button-primary">
            Manage dentists <ArrowRight size={15} />
          </Link>
        }
      />
      <AsyncView query={stats} empty={false}>
        <div className="dashboard-metrics">
          <article>
            <span className="metric-icon metric-teal">
              <Users size={18} />
            </span>
            <small>Patients</small>
            <strong>{numbers.totalPatients ?? "—"}</strong>
          </article>
          <article>
            <span className="metric-icon metric-lime">
              <BadgeCheck size={18} />
            </span>
            <small>Dentists</small>
            <strong>{numbers.totalDentists ?? "—"}</strong>
          </article>
          <article>
            <span className="metric-icon metric-blue">
              <Activity size={18} />
            </span>
            <small>Today’s appointments</small>
            <strong>{numbers.todaysAppointments ?? "—"}</strong>
          </article>
          <article>
            <span className="metric-icon metric-coral">
              <Wallet size={18} />
            </span>
            <small>Month revenue</small>
            <strong>{rupees(numbers.monthRevenue)}</strong>
          </article>
        </div>
        {numbers.pendingDentistApprovals > 0 && (
          <div className="notice notice-warn">
            <ShieldCheck size={17} />
            {numbers.pendingDentistApprovals} dentist profiles are awaiting
            verification. <Link to="/admin/dentists">Review profiles</Link>
          </div>
        )}
      </AsyncView>
      <div className="chart-grid">
        <SectionPanel
          title="Appointments this week"
          description="Zero-filled from the weekly endpoint."
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week}>
                <CartesianGrid vertical={false} stroke="#e7eeeb" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#16847c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionPanel>
        <SectionPanel
          title="Revenue by month"
          description="Paid payments, reported in INR."
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
      </div>
      <SectionPanel
        title="Common specialties"
        description="Available dentist specialization breakdown."
      >
        <AsyncView
          query={specialties}
          empty={
            !specialties.isLoading &&
            !specialties.isError &&
            !(specialties.data?.data || []).length
          }
          emptyTitle="No specialties to summarize"
        >
          <div className="specialty-bars">
            {(specialties.data?.data || []).map((entry) => (
              <div key={entry._id}>
                <span>{entry._id || "Unspecified"}</span>
                <div>
                  <i style={{ width: `${Math.max(3, entry.count * 8)}%` }} />
                </div>
                <strong>{entry.count}</strong>
              </div>
            ))}
          </div>
        </AsyncView>
      </SectionPanel>
    </div>
  );
}

function DentistManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
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
  const query = useQuery({
    queryKey: ["dentists", "admin", search],
    queryFn: async () => {
      try {
        return await api.dentists.adminList({ search, page: 1, limit: 50 });
      } catch (error) {
        if (error.status !== 404) throw error;
        const fallback = await api.dentists.list({
          search,
          page: 1,
          limit: 50,
        });
        return { ...fallback, limited: true };
      }
    },
  });
  const dentists = query.data?.data || [];
  const createDentist = async (event) => {
    event.preventDefault();
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
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["dentists", "admin"] });
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
    }
  };
  const verify = async (id) => {
    try {
      const result = await api.dentists.verify(id);
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["dentists", "admin"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Credential review"
        title="Dentist management"
        description="Onboard clinicians and verify credentials before public discovery."
        actions={
          <button
            className="button button-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <UserPlus size={16} /> Add dentist
          </button>
        }
      />
      {query.data?.limited && (
        <div className="notice notice-warn">
          The all-dentists admin endpoint is not available yet. Showing
          verified, active public listings only; pending profiles cannot be
          reviewed.
        </div>
      )}
      {showForm && (
        <SectionPanel
          title="Create dentist account"
          description="Dentist accounts are provisioned by an administrator; patients self-register separately."
        >
          <form className="admin-form-grid" onSubmit={createDentist}>
            {[
              ["name", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["password", "Temporary password"],
              ["specialization", "Specialization"],
              ["qualifications", "Qualifications"],
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
            <button className="button button-primary">
              Create dentist <Plus size={15} />
            </button>
          </form>
        </SectionPanel>
      )}
      <label className="search-field compact-search">
        <Search size={17} />
        <input
          placeholder="Search dentists"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <AsyncView
        query={query}
        empty={!query.isLoading && !query.isError && !dentists.length}
        emptyTitle="No dentist profiles found"
      >
        <div className="record-list">
          {dentists.map((dentist) => (
            <article className="record-row" key={dentist._id}>
              <span className="avatar avatar-large">
                <UserPlus size={18} />
              </span>
              <div className="record-row-content">
                <strong>Dr. {dentist.user?.name}</strong>
                <span>
                  {dentist.specialization} ·{" "}
                  {dentist.clinicAddress?.city || "Location not listed"}
                </span>
                <small>
                  {dentist.qualifications?.join(", ") ||
                    "Qualifications not listed"}{" "}
                  · {rupees(dentist.consultationFee)}
                </small>
              </div>
              <div className="record-row-actions">
                <StatusBadge
                  value={dentist.isVerified ? "verified" : "pending"}
                />
                <StatusBadge value={dentist.isActive ? "active" : "inactive"} />
                {!dentist.isVerified && (
                  <button
                    className="button button-outline button-small"
                    onClick={() => verify(dentist._id)}
                  >
                    Verify <Check size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </AsyncView>
    </div>
  );
}

function StaffManagement() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
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
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const toggle = async (member) => {
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
        description="Manage receptionist and administrator accounts."
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
          {staff.map((member) => (
            <article className="record-row" key={member._id}>
              <span className="avatar avatar-large">
                <Users size={17} />
              </span>
              <div className="record-row-content">
                <strong>{member.name}</strong>
                <span>
                  {member.email} · {member.phone}
                </span>
              </div>
              <div className="record-row-actions">
                <StatusBadge value={member.role} />
                <StatusBadge
                  value={member.active === false ? "inactive" : "active"}
                />
                <button
                  className="button button-quiet button-small"
                  onClick={() => toggle(member)}
                >
                  {member.active === false ? "Activate" : "Deactivate"}
                </button>
              </div>
            </article>
          ))}
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
              <button
                className="button button-quiet button-small"
                onClick={() => remove(item)}
              >
                Remove
              </button>
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
              <button
                className="button button-quiet button-small"
                onClick={() => remove(coupon)}
              >
                Delete
              </button>
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

function ClinicSettingsPage() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const query = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: api.settings.get,
  });
  const [form, setForm] = useState(null);
  const data = form || query.data?.data || {};
  const fields = [
    "clinicName",
    "logoUrl",
    "address",
    "contactPhone",
    "contactEmail",
    "platformFee",
    "taxPercentage",
    "reminderHoursBefore",
    "cancellationFullRefundHours",
  ];
  const save = async (event) => {
    event.preventDefault();
    const payload = {
      ...data,
      platformFee: Number(data.platformFee),
      taxPercentage: Number(data.taxPercentage),
      reminderHoursBefore: Number(data.reminderHoursBefore),
      cancellationFullRefundHours: Number(data.cancellationFullRefundHours),
    };
    try {
      const result = await api.settings.update(payload);
      notify(result.message);
      setForm(result.data);
      queryClient.invalidateQueries({ queryKey: ["clinic-settings"] });
    } catch (error) {
      notify(error.message, "error");
    }
  };
  return (
    <div>
      <PageTitle
        eyebrow="Clinic configuration"
        title="Clinic settings"
        description="These values are read by public pages, booking and invoice totals."
      />
      <AsyncView query={query} empty={false}>
        <SectionPanel title="Clinic details & fees">
          <form className="admin-form-grid" onSubmit={save}>
            {fields.map((key) => (
              <Field
                key={key}
                label={key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (s) => s.toUpperCase())}
                className={
                  ["address", "logoUrl"].includes(key) ? "field-wide" : ""
                }
              >
                <TextInput
                  type={
                    [
                      "platformFee",
                      "taxPercentage",
                      "reminderHoursBefore",
                      "cancellationFullRefundHours",
                    ].includes(key)
                      ? "number"
                      : "text"
                  }
                  min="0"
                  value={data[key] ?? ""}
                  onChange={(event) =>
                    setForm({ ...data, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
            <button className="button button-primary">
              Save settings <Check size={15} />
            </button>
          </form>
        </SectionPanel>
      </AsyncView>
    </div>
  );
}

function PaymentManagement() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);
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

  const payments = query.data?.data || [];
  const meta = query.data?.meta || { total: 0, page: 1, limit: 20 };

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

  return (
    <div>
      <PageTitle
        eyebrow="Financial operations"
        title="Payments & refunds"
        description="View real customer payments, check transaction states, and issue refunds."
      />

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
      {dialog}
    </div>
  );
}

export function AdminPage({ page }) {
  if (page === "dashboard") return <AdminDashboard />;
  if (page === "dentists") return <DentistManagement />;
  if (page === "staff") return <StaffManagement />;
  if (page === "patients") return <PatientDirectory />;
  if (page === "treatments") return <TreatmentCatalog />;
  if (page === "coupons") return <CouponManagement />;
  if (page === "clinics") return <ClinicManagement />;
  if (page === "settings") return <ClinicSettingsPage />;
  if (page === "payments") return <PaymentManagement />;
  return <EmptyState title="This administration view is not available" />;
}
