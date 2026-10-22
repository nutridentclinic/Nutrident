import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  FilePlus2,
  FileText,
  MessageSquareText,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { api } from "../api/domains.js";
import { apiBaseUrl } from "../api/client.js";
import { useAuthStore } from "../store/auth.js";
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
const fmtDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : "Date not set";
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
  const stats = useQuery({
    queryKey: ["dashboard", "dentist"],
    queryFn: api.dashboard.dentist,
  });
  const visits = useQuery({
    queryKey: ["appointments", "dentist", dateToday()],
    queryFn: () => api.appointments.dentistMine({ date: dateToday() }),
  });
  const needsAvailability =
    profile &&
    !(profile.weeklyAvailability || []).some((day) => (day.slots || []).length);
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
      {needsAvailability && (
        <div className="notice notice-warn availability-alert">
          <span>
            <strong>Availability is not set yet.</strong> Patients cannot book
            until you publish your weekly hours.
          </span>
          <Link
            className="button button-outline button-small"
            to="/dentist/availability"
          >
            Set availability <ArrowRight size={14} />
          </Link>
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
  const query = useQuery({
    queryKey: ["appointments", "dentist", date, status],
    queryFn: () =>
      api.appointments.dentistMine({ date, ...(status ? { status } : {}) }),
  });
  const items = query.data?.data || [];
  const cancelAppointment = async (item) => {
    const accepted = await confirm({
      title: "Cancel this appointment?",
      description: "The patient will be notified. Refund handling follows the clinic policy.",
      confirmLabel: "Cancel appointment",
      danger: true,
    });
    if (accepted) action.mutate({ action: api.appointments.cancel, args: [item._id, "Cancelled by dentist"] });
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
            {["pending", "confirmed", "completed", "cancelled", "no-show"].map(
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
                </span>
              </div>
              <div className="appointment-status">
                <StatusBadge value={item.status} />
              </div>
              <div className="appointment-actions">
                {item.status === "pending" && (
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
                      className="button button-primary button-small"
                      onClick={() =>
                        action.mutate({
                          action: api.appointments.complete,
                          args: [item._id],
                        })
                      }
                    >
                      Complete
                    </button>
                    <button
                      className="button button-quiet button-small"
                      onClick={() =>
                        action.mutate({
                          action: api.appointments.noShow,
                          args: [item._id],
                        })
                      }
                    >
                      No-show
                    </button>
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
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
      setLeave("");
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
        <div className="chip-list">
          {(profile?.unavailableDates || []).map((item) => (
            <span key={String(item)}>{fmtDate(item)}</span>
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
  const toggle = async () => {
    try {
      const result = await api.dentists.toggleActive();
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] });
    } catch (error) {
      notify(error.message, "error");
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
          <button className="button button-outline" onClick={toggle}>
            {profile?.isActive
              ? "Pause new appointments"
              : "Accept appointments"}{" "}
          </button>
        }
      />
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
  const isDentist = mode === "dentist";
  const [search, setSearch] = useState("");
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
    queryFn: () => api.patients.list({ search, page: 1, limit: 20 }),
    enabled: !isDentist,
  });
  const listQuery = isDentist ? dentistPatients : patients;
  const list = listQuery.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Patient care"
        title="Patients"
        description={
          isDentist
            ? "Patients seen in your appointment schedule."
            : "Find a patient account and open their care details."
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
              to={`${isDentist ? "/dentist" : "/reception"}/patients/${person._id}`}
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
    { name: "", dosage: "", frequency: "", durationDays: "", instructions: "" },
  ]);
  const [diagnosis, setDiagnosis] = useState("");
  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patients.detail(patientId),
  });
  const patient = patientQuery.data?.data?.user || patientQuery.data?.data;
  if (tab === "records" && !readOnly)
    return <ClinicalRecordsWorkspace patientId={patientId} query={records} />;
  const savePrescription = async (event) => {
    event.preventDefault();
    try {
      const result = await api.prescriptions.create({
        patientId,
        diagnosis,
        medicines: medicine.map((item) => ({
          ...item,
          durationDays: Number(item.durationDays),
        })),
      });
      notify(result.message);
      queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
      setDiagnosis("");
      setMedicine([
        {
          name: "",
          dosage: "",
          frequency: "",
          durationDays: "",
          instructions: "",
        },
      ]);
    } catch (error) {
      notify(error.message, "error");
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
            <fieldset className="clinical-fieldset">
              <form className="stack-form" onSubmit={savePrescription}>
                <Field label="Diagnosis">
                  <TextInput
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                  />
                </Field>
                {medicine.map((item, index) => (
                  <div className="medicine-row" key={index}>
                    {[
                      "name",
                      "dosage",
                      "frequency",
                      "durationDays",
                      "instructions",
                    ].map((field) => (
                      <Field
                        key={field}
                        label={field === "durationDays" ? "Days" : field}
                      >
                        <TextInput
                          type={field === "durationDays" ? "number" : "text"}
                          min={field === "durationDays" ? 1 : undefined}
                          required
                          value={item[field]}
                          onChange={(event) =>
                            setMedicine((all) =>
                              all.map((row, ix) =>
                                ix === index
                                  ? { ...row, [field]: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
                  </div>
                ))}
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() =>
                      setMedicine((all) => [
                        ...all,
                        {
                          name: "",
                          dosage: "",
                          frequency: "",
                          durationDays: "",
                          instructions: "",
                        },
                      ])
                    }
                  >
                    <Plus size={15} /> Add medicine
                  </button>
                  <button className="button button-primary">
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
            {(prescriptions.data?.data || []).map((entry) => (
              <div className="record-row" key={entry._id}>
                <FileText size={18} />
                <span>
                  {entry.diagnosis || "Prescription"} ·{" "}
                  {fmtDate(entry.createdAt)}
                </span>
              </div>
            ))}
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
                    rel="noreferrer"
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
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("other");
  const [filterType, setFilterType] = useState("");
  const [busy, setBusy] = useState(false);
  const records = query.data?.data || [];
  const visibleRecords = filterType
    ? records.filter((record) => record.type === filterType)
    : records;
  const upload = async (event) => {
    event.preventDefault();
    if (!file) return notify("Choose a record file first.", "error");
    if (
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        file.type,
      )
    )
      return notify("Choose a JPG, PNG, WEBP, or PDF file.", "error");
    if (file.size > 10 * 1024 * 1024)
      return notify("Medical records must be 10 MB or smaller.", "error");
    const payload = new FormData();
    payload.append("patientId", patientId);
    payload.append("file", file);
    payload.append("title", title || file.name);
    payload.append("type", type);
    setBusy(true);
    try {
      const result = await api.records.upload(payload);
      notify(result.message);
      setFile(null);
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["records", patientId] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
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
        <form className="upload-form" onSubmit={upload}>
          <Field label="Record title">
            <TextInput
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
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
          <Field label="File">
            <TextInput
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </Field>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Uploading…" : "Upload record"} <FilePlus2 size={15} />
          </button>
        </form>
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
                  rel="noreferrer"
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
  const [treatmentId, setTreatmentId] = useState("");
  const notify = useToast();
  const submit = async (event) => {
    event.preventDefault();
    const item = (treatments.data?.data || []).find(
      (entry) => entry._id === treatmentId,
    );
    try {
      const result = await api.plans.create({
        patientId,
        title,
        notes,
        steps: [
          {
            treatment: treatmentId,
            name: item?.name,
            cost: item?.defaultCost || 0,
            status: "planned",
          },
        ],
      });
      notify(result.message);
      setOpen(false);
      onCreated();
    } catch (error) {
      notify(error.message, "error");
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
        <form className="inline-create-form" onSubmit={submit}>
          <Field label="Plan title">
            <TextInput
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Treatment">
            <TextInput
              as="select"
              required
              value={treatmentId}
              onChange={(event) => setTreatmentId(event.target.value)}
            >
              <option value="">Choose from catalog</option>
              {(treatments.data?.data || []).map((item) => (
                <option value={item._id} key={item._id}>
                  {item.name}
                </option>
              ))}
            </TextInput>
          </Field>
          <Field label="Notes">
            <TextInput
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <button className="button button-primary">Create plan</button>
        </form>
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
  const [selectedDentist, setSelectedDentist] = useState("");
  const [date, setDate] = useState(dateToday());
  const [patientId, setPatientId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const queryClient = useQueryClient();
  const notify = useToast();
  const user = useAuthStore((state) => state.user);
  const dentists = useQuery({
    queryKey: ["dentists", "queue"],
    queryFn: () => api.dentists.list({ limit: 100 }),
    enabled: !isDentist,
  });
  const dentistId = isDentist ? dentistProfile.profile?._id : selectedDentist;
  const queue = useQuery({
    queryKey: ["queue", dentistId, date],
    queryFn: () => api.queue.get(dentistId, date),
    enabled: !!dentistId,
    refetchInterval: socketConnected ? false : 8000,
  });
  useEffect(() => {
    if (!dentistId || !user?.role || !useAuthStore.getState().accessToken)
      return undefined;
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL || apiBaseUrl.replace(/\/api\/?$/, "");
    const socket = io(socketUrl, {
      auth: { token: useAuthStore.getState().accessToken },
      reconnection: true,
    });
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("queue:join", dentistId);
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("queue:updated", () =>
      queryClient.invalidateQueries({ queryKey: ["queue", dentistId, date] }),
    );
    return () => {
      socket.emit("queue:leave", dentistId);
      socket.disconnect();
      setSocketConnected(false);
    };
  }, [dentistId, date, user?.role, queryClient]);
  const addToQueue = async (event) => {
    event.preventDefault();
    if (!patientId && !walkInName.trim())
      return notify("Enter a patient account or a walk-in name.", "error");
    try {
      const result = await api.queue.checkIn({
        dentistId,
        ...(patientId ? { patientId } : { walkInName }),
        appointmentId: appointmentId || undefined,
        date,
      });
      notify(result.message);
      setPatientId("");
      setWalkInName("");
      setAppointmentId("");
      queue.refetch();
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const entries = queue.data?.data || [];
  return (
    <div>
      <PageTitle
        eyebrow="Today’s flow"
        title="Live queue"
        description="Queue updates use Socket.IO when connected and refresh every eight seconds otherwise."
        actions={
          <span
            className={`connection-indicator ${socketConnected ? "connected" : ""}`}
          >
            <i />
            {socketConnected ? "Live updates active" : "Live updates paused"}
          </span>
        }
      />
      <div className="filter-bar">
        <Field label="Queue date">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        {!isDentist && (
          <Field label="Dentist">
            <TextInput
              as="select"
              required
              value={selectedDentist}
              onChange={(event) => setSelectedDentist(event.target.value)}
            >
              <option value="">Choose dentist</option>
              {(dentists.data?.data || []).map((item) => (
                <option value={item._id} key={item._id}>
                  Dr. {item.user?.name} · {item.specialization}
                </option>
              ))}
            </TextInput>
          </Field>
        )}
      </div>
      {!isDentist && dentistId && (
        <SectionPanel
          title="Check in a patient"
          description="Use a registered patient ID or add a walk-in visitor."
        >
          <form className="upload-form" onSubmit={addToQueue}>
            <Field label="Patient account ID">
              <TextInput
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                placeholder="Optional if walk-in"
              />
            </Field>
            <Field label="Walk-in name">
              <TextInput
                value={walkInName}
                onChange={(event) => setWalkInName(event.target.value)}
                placeholder="Optional if registered"
              />
            </Field>
            <Field label="Appointment ID">
              <TextInput
                value={appointmentId}
                onChange={(event) => setAppointmentId(event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <button className="button button-primary">
              Check in <Plus size={15} />
            </button>
          </form>
        </SectionPanel>
      )}
      {dentistId && (
        <SectionPanel
          title="Waiting room"
          description={`${entries.filter((entry) => entry.status === "waiting").length} waiting · ${entries.filter((entry) => entry.status === "in-progress").length} in progress`}
        >
          <AsyncView
            query={queue}
            empty={!queue.isLoading && !queue.isError && !entries.length}
            emptyTitle="No one is in the queue"
          >
            <div className="queue-list">
              {entries.map((entry) => (
                <article className="queue-row" key={entry._id}>
                  <span className="queue-token">{entry.tokenNumber}</span>
                  <span className="queue-person">
                    <strong>
                      {entry.patient?.name ||
                        entry.walkInName ||
                        "Walk-in patient"}
                    </strong>
                    <small>
                      {entry.estimatedWaitMinutes
                        ? `Estimated wait ${entry.estimatedWaitMinutes} min`
                        : entry.patient?.phone || ""}
                    </small>
                  </span>
                  <StatusBadge value={entry.status} />
                  <div className="queue-actions">
                    {entry.status === "waiting" && (
                      <button
                        className="button button-primary button-small"
                        onClick={async () => {
                          try {
                            const result = await api.queue.call(entry._id);
                            notify(result.message);
                            queue.refetch();
                          } catch (error) {
                            notify(error.message, "error");
                          }
                        }}
                      >
                        Call next
                      </button>
                    )}
                    {["waiting", "in-progress"].includes(entry.status) && (
                      <>
                        <button
                          className="button button-quiet button-small"
                          onClick={async () => {
                            try {
                              const result = await api.queue.skip(entry._id);
                              notify(result.message);
                              queue.refetch();
                            } catch (error) {
                              notify(error.message, "error");
                            }
                          }}
                        >
                          Skip
                        </button>
                        <button
                          className="button button-outline button-small"
                          onClick={async () => {
                            try {
                              const result = await api.queue.complete(
                                entry._id,
                              );
                              notify(result.message);
                              queue.refetch();
                            } catch (error) {
                              notify(error.message, "error");
                            }
                          }}
                        >
                          Complete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      )}
    </div>
  );
}
