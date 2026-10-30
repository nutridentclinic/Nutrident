import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Activity,
  Heart,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Shield,
  Upload,
  Download,
  Eye,
  RefreshCw,
  Plus,
  Edit2,
  X,
  Check,
} from 'lucide-react'
import { api, downloadPdf, openRecordFile } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { formatClinicDate } from '../utils/formatDate.js'
import { FDI_TEETH } from '../utils/teeth.js'
import { FileUpload } from '../components/FileUpload.jsx'
import { RecordViewer } from '../components/RecordViewer.jsx'
import BackendPendingNotice from '../components/BackendPendingNotice.jsx'
import { AsyncView, EmptyState, Field, SectionPanel, StatusBadge, TextInput, useToast } from '../components/ui.jsx'

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`

export function Patient360({ readOnly = false } = {}) {
  const params = useParams()
  const id = params.id || params.patientId
  const user = useAuthStore((state) => state.user)
  const role = user?.role || 'staff'
  const isClinician = role === 'dentist' && !readOnly
  const queryClient = useQueryClient()
  const notify = useToast()

  const [activeTab, setActiveTab] = useState('overview')
  const [showUpload, setShowUpload] = useState(false)
  const [recordTitle, setRecordTitle] = useState('')
  const [recordType, setRecordType] = useState('xray')
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  // Dental Chart State
  const [selectedTooth, setSelectedTooth] = useState(null)
  const [toothBusy, setToothBusy] = useState(false)

  // Edit Patient Info State
  const [showEditModal, setShowEditModal] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: 'other',
    bloodGroup: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: 'Family',
  })

  // 1. Fetch Patient 360 summary
  const summaryQuery = useQuery({
    queryKey: ['patient-360-summary', id],
    queryFn: async () => {
      try {
        const res = await api.patients.summary(id)
        return res?.data || res
      } catch (err) {
        if (err.status === 404) {
          // Fallback to basic patient detail if summary endpoint is pending deploy
          const basic = await api.patients.detail(id)
          return { user: basic?.data?.user || basic?.data, patient: basic?.data, stats: {}, isPendingDeploy: true }
        }
        throw err
      }
    },
  })

  // 2. Fetch Appointments for this patient
  const apptsQuery = useQuery({
    queryKey: ['patient-360-appts', id],
    queryFn: async () => {
      try {
        const res = await api.patients.appointments(id, { limit: 50 })
        return Array.isArray(res) ? res : res?.data || []
      } catch (err) {
        if (err.status === 404) return []
        throw err
      }
    },
    enabled: activeTab === 'appointments' || activeTab === 'notes',
  })

  // 3. Fetch Records
  const recordsQuery = useQuery({
    queryKey: ['patient-360-records', id],
    queryFn: async () => {
      const res = await api.records.forPatient(id)
      return Array.isArray(res) ? res : res?.data || []
    },
    enabled: activeTab === 'records',
  })

  // 4. Fetch Dental Chart
  const chartQuery = useQuery({
    queryKey: ['patient-chart', id],
    queryFn: async () => {
      try {
        const res = await api.charts.get(id)
        return res?.data || res || { teeth: [] }
      } catch {
        return { teeth: [] }
      }
    },
    enabled: activeTab === 'chart',
  })

  // 5. Fetch Treatment Plans
  const plansQuery = useQuery({
    queryKey: ['patient-plans', id],
    queryFn: async () => {
      const res = await api.plans.forPatient(id)
      return Array.isArray(res) ? res : res?.data || []
    },
    enabled: activeTab === 'plans',
  })

  // 6. Fetch Invoices & Payments
  const invoicesQuery = useQuery({
    queryKey: ['patient-360-invoices', id],
    queryFn: async () => {
      const res = await api.invoices.all({ patientId: id })
      return Array.isArray(res) ? res : res?.data || []
    },
    enabled: activeTab === 'billing',
  })

  const paymentsQuery = useQuery({
    queryKey: ['patient-360-payments', id],
    queryFn: async () => {
      try {
        const res = await api.payments.all({ patientId: id })
        return Array.isArray(res) ? res : res?.data || []
      } catch {
        return []
      }
    },
    enabled: activeTab === 'billing',
  })

  const summary = summaryQuery.data || {}
  const patientUser = summary.user || summary.patient?.user || summary.patient || {}
  const patientProfile = summary.patient || summary
  const stats = summary.stats || {
    lastVisit: summary.lastVisit,
    nextAppointment: summary.nextAppointment,
    outstandingBalance: summary.outstandingBalance || 0,
  }

  // Calculate age from DOB
  const calculateAge = (dob) => {
    if (!dob) return null
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }
  const age = calculateAge(patientProfile.dateOfBirth)

  const handleRecordUploaded = () => {
    queryClient.invalidateQueries({ queryKey: ['patient-360-records', id] })
    setShowUpload(false)
    setRecordTitle('')
    notify('Medical record uploaded successfully.')
  }

  const handleToggleActive = async () => {
    try {
      const res = patientUser.active === false
        ? await api.patients.activate(id)
        : await api.patients.deactivate(id)
      notify(res.message || 'Patient account status updated.')
      queryClient.invalidateQueries({ queryKey: ['patient-360-summary', id] })
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditBusy(true)
    try {
      const payload = {
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email || undefined,
        dateOfBirth: editForm.dateOfBirth || undefined,
        gender: editForm.gender,
        bloodGroup: editForm.bloodGroup || undefined,
        address: editForm.address || undefined,
        emergencyContact: editForm.emergencyContactName ? {
          name: editForm.emergencyContactName,
          phone: editForm.emergencyContactPhone,
          relation: editForm.emergencyContactRelation,
        } : undefined,
      }
      const res = await api.patients.update(id, payload)
      notify(res.message || 'Patient information updated.')
      setShowEditModal(false)
      queryClient.invalidateQueries({ queryKey: ['patient-360-summary', id] })
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setEditBusy(false)
    }
  }

  const handleSaveTooth = async (e) => {
    e.preventDefault()
    if (!selectedTooth) return
    setToothBusy(true)
    const formData = new FormData(e.currentTarget)
    const condition = formData.get('condition')
    const notes = formData.get('notes')
    try {
      await api.charts.updateTooth(id, selectedTooth, { condition, notes })
      notify(`Tooth ${selectedTooth} updated successfully.`)
      queryClient.invalidateQueries({ queryKey: ['patient-chart', id] })
      setSelectedTooth(null)
    } catch (err) {
      notify(err.message || 'Failed to update tooth', 'error')
    } finally {
      setToothBusy(false)
    }
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'plans', label: 'Treatment Plans' },
    { key: 'chart', label: 'Dental Chart' },
    { key: 'records', label: 'Medical Records' },
    { key: 'billing', label: 'Invoices & Billing' },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <div className="patient-360-page">
      {summary.isPendingDeploy && (
        <BackendPendingNotice
          featureName="Patient 360 Profile Summary"
          endpoint={`GET /api/patients/${id}/summary`}
          description="Showing patient basic profile. Advanced summary metrics and history will become live when backend is redeployed."
        />
      )}

      {/* Patient Summary Hero Card */}
      <div className="patient-summary-hero">
        <div className="patient-summary-left">
          <div className="patient-avatar-circle">
            {patientUser.profilePhoto?.url ? (
              <img src={patientUser.profilePhoto.url} alt={patientUser.name} />
            ) : (
              (patientUser.name || 'P').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="patient-identity">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2>{patientUser.name || 'Patient'}</h2>
              <StatusBadge value={patientUser.isEmailVerified ? 'verified' : 'unverified'} />
            </div>
            <div className="patient-meta-tags">
              {age !== null && <span>{age} yrs · {patientProfile.gender || 'Not specified'}</span>}
              {patientProfile.bloodGroup && (
                <span className="blood-badge">{patientProfile.bloodGroup}</span>
              )}
              <span><Phone size={13} /> {patientUser.phone}</span>
              <span><Mail size={13} /> {patientUser.email}</span>
            </div>
          </div>
        </div>

        <div className="patient-summary-stats">
          <div className="patient-stat-pill">
            <small>Last Visit</small>
            <strong>
              {stats.lastVisit ? formatClinicDate(stats.lastVisit.date) : 'None'}
            </strong>
          </div>
          <div className="patient-stat-pill">
            <small>Next Appointment</small>
            <strong className="highlight-teal">
              {stats.nextAppointment
                ? `${formatClinicDate(stats.nextAppointment.date)} (${stats.nextAppointment.startTime})`
                : 'None'}
            </strong>
          </div>
          <div className="patient-stat-pill">
            <small>Outstanding Balance</small>
            <strong className={stats.outstandingBalance > 0 ? 'highlight-coral' : 'highlight-teal'}>
              {rupees(stats.outstandingBalance)}
            </strong>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="patient-360-tabs" role="tablist" aria-label="Patient details tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={activeTab === tab.key ? 'active' : ''}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          <SectionPanel
            title="Personal Information"
            description="Demographics and contact details"
            actions={
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => {
                    setEditForm({
                      name: patientUser.name || '',
                      phone: patientUser.phone || '',
                      email: patientUser.email || '',
                      dateOfBirth: patientProfile.dateOfBirth ? patientProfile.dateOfBirth.slice(0, 10) : '',
                      gender: patientProfile.gender || 'other',
                      bloodGroup: patientProfile.bloodGroup || '',
                      address: patientProfile.address || '',
                      emergencyContactName: patientProfile.emergencyContact?.name || '',
                      emergencyContactPhone: patientProfile.emergencyContact?.phone || '',
                      emergencyContactRelation: patientProfile.emergencyContact?.relation || 'Family',
                    })
                    setShowEditModal(true)
                  }}
                >
                  <Edit2 size={13} /> Edit Info
                </button>
                {role === 'admin' && (
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={handleToggleActive}
                  >
                    {patientUser.active === false ? 'Activate' : 'Deactivate'}
                  </button>
                )}
              </div>
            }
          >
            <dl className="detail-list">
              <div>
                <dt>Date of Birth</dt>
                <dd>{patientProfile.dateOfBirth ? formatClinicDate(patientProfile.dateOfBirth) : 'Not provided'}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd style={{ textTransform: 'capitalize' }}>{patientProfile.gender || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Blood Group</dt>
                <dd>{patientProfile.bloodGroup || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Residential Address</dt>
                <dd>{patientProfile.address || 'Not provided'}</dd>
              </div>
            </dl>
          </SectionPanel>

          <SectionPanel title="Medical Conditions & Emergency" description="Allergies and health alerts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Emergency Contact
                </small>
                <div className="condition-alert-box">
                  {patientProfile.emergencyContact?.name
                    ? `${patientProfile.emergencyContact.name} (${patientProfile.emergencyContact.relation || 'Contact'}): ${patientProfile.emergencyContact.phone}`
                    : 'None on file'}
                </div>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Known Allergies
                </small>
                <div className="condition-alert-box">
                  {Array.isArray(patientProfile.allergies) && patientProfile.allergies.length > 0
                    ? patientProfile.allergies.join(', ')
                    : 'No allergies reported'}
                </div>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Chronic Conditions
                </small>
                <div className="condition-alert-box">
                  {Array.isArray(patientProfile.chronicConditions) && patientProfile.chronicConditions.length > 0
                    ? patientProfile.chronicConditions.join(', ')
                    : 'None reported'}
                </div>
              </div>
            </div>
          </SectionPanel>

          {patientProfile.familyMembers?.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <SectionPanel title="Family Members" description="Dependents covered under this primary patient">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  {patientProfile.familyMembers.map((member, i) => (
                    <div key={i} style={{ background: '#f7faf8', padding: '14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <strong style={{ color: 'var(--ink)', display: 'block', fontSize: '14px' }}>{member.name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--teal)', display: 'block', marginTop: '2px' }}>
                        {member.relation}
                      </span>
                      <small style={{ color: 'var(--muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                        DOB: {member.dateOfBirth ? formatClinicDate(member.dateOfBirth) : '—'}
                      </small>
                    </div>
                  ))}
                </div>
              </SectionPanel>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Appointments */}
      {activeTab === 'appointments' && (
        <SectionPanel title="Appointment History" description="All visits and consultations">
          <AsyncView query={apptsQuery} empty={apptsQuery.data?.length === 0} emptyTitle="No appointments found">
            <div style={{ overflowX: 'auto' }}>
              <table className="clinic-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Mode</th>
                    <th>Reason</th>
                    <th>Fee</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {(apptsQuery.data || []).map((appt) => (
                    <tr key={appt._id}>
                      <td><strong>{formatClinicDate(appt.date)}</strong></td>
                      <td>{appt.startTime}</td>
                      <td style={{ textTransform: 'capitalize' }}>{appt.mode}</td>
                      <td>{appt.reasonForVisit || '—'}</td>
                      <td>{rupees(appt.fees?.totalAmount)}</td>
                      <td><StatusBadge value={appt.status} /></td>
                      <td><StatusBadge value={appt.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {/* Tab 3: Treatment Plans */}
      {activeTab === 'plans' && (
        <SectionPanel title="Treatment Plans" description="Multi-step procedures and care plans">
          <AsyncView query={plansQuery} empty={plansQuery.data?.length === 0} emptyTitle="No treatment plans on file">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(plansQuery.data || []).map((plan) => {
                const completedSteps = (plan.steps || []).filter((s) => s.status === 'completed').length
                const totalSteps = (plan.steps || []).length
                const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
                return (
                  <div key={plan._id} style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: '8px', padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--ink)', fontSize: '16px', fontWeight: 700 }}>{plan.title}</h4>
                        <small style={{ color: 'var(--muted)', fontSize: '12px' }}>Created {formatClinicDate(plan.createdAt)}</small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {(plan.followUpRequired || plan.requiresFollowUp) && (
                          <span className="status-badge status-pending">
                            Follow-up: {plan.followUpDate ? formatClinicDate(plan.followUpDate) : 'Required'}
                          </span>
                        )}
                        <strong style={{ color: 'var(--teal)', fontSize: '15px' }}>
                          {rupees(plan.totalEstimatedCost)}
                        </strong>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="plan-progress-bar">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                        <span>Progress: {completedSteps} of {totalSteps} steps completed</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="plan-progress-track">
                        <div className="plan-progress-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--line)', marginTop: '12px', paddingTop: '8px' }}>
                      {(plan.steps || []).map((step, idx) => {
                        const toothList = (step.toothNumbers && step.toothNumbers.length ? step.toothNumbers : step.teeth) || []
                        return (
                          <div key={idx} style={{ padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: idx < (plan.steps.length - 1) ? '1px solid #f0f4f2' : 'none' }}>
                            <div>
                              <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '13.5px' }}>
                                {step.name || step.treatment?.name || 'Procedure Step'}
                              </span>
                              {toothList.length > 0 && (
                                <small style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>
                                  Teeth: {toothList.join(', ')}
                                </small>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '13px', color: 'var(--body)' }}>{rupees(step.cost)}</span>
                              <StatusBadge value={step.status} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {/* Tab 4: Dental Chart */}
      {activeTab === 'chart' && (
        <SectionPanel
          title="Dental Chart"
          description={
            isClinician
              ? 'Click any tooth to inspect status or record a clinical note.'
              : 'Read-only dental anatomy and recorded tooth conditions.'
          }
        >
          <div className="tooth-chart" style={{ overflowX: 'auto', padding: '16px 0' }}>
            {[0, 1].map((row) => (
              <div className={`tooth-row tooth-row-${row}`} key={row} style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '8px' }}>
                {FDI_TEETH.slice(row * 16, row * 16 + 16).map((number) => {
                  const entry = chartQuery.data?.teeth?.find((item) => item.toothNumber === number)
                  const isSelected = selectedTooth === number
                  return (
                    <button
                      type="button"
                      disabled={!isClinician}
                      className={`tooth-cell ${entry ? 'tooth-recorded' : ''}`}
                      key={number}
                      onClick={() => setSelectedTooth(number)}
                      style={{
                        outline: isSelected ? '2px solid var(--teal)' : undefined,
                        background: isSelected ? 'var(--teal-soft)' : undefined,
                      }}
                      title={`Tooth ${number}: ${entry?.condition || 'Healthy'}`}
                    >
                      <span>{number}</span>
                      <strong>
                        {entry?.condition?.slice(0, 1)?.toUpperCase() || '✓'}
                      </strong>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {selectedTooth && isClinician && (
            <form className="inline-form tooth-editor" onSubmit={handleSaveTooth} style={{ marginTop: '16px', background: '#f3f8f5', padding: '16px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
                <strong style={{ color: 'var(--ink)' }}>Tooth {selectedTooth}</strong>
                <Field label="Condition">
                  <TextInput
                    name="condition"
                    required
                    placeholder="e.g. filling, caries, crown, healthy"
                    defaultValue={chartQuery.data?.teeth?.find((t) => t.toothNumber === selectedTooth)?.condition || ''}
                  />
                </Field>
                <Field label="Notes">
                  <TextInput
                    name="notes"
                    placeholder="Clinical diagnosis notes"
                    defaultValue={chartQuery.data?.teeth?.find((t) => t.toothNumber === selectedTooth)?.notes || ''}
                  />
                </Field>
                <button type="submit" className="button button-primary" disabled={toothBusy}>
                  Save tooth <Check size={14} />
                </button>
                <button type="button" className="button button-quiet" onClick={() => setSelectedTooth(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f7faf8', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12.5px', color: 'var(--muted)' }}>
            <strong>Legend:</strong> ✓ Healthy/Untreated · C = Caries/Cavity · F = Filling · R = Root Canal · X = Extracted · M = Missing
          </div>
        </SectionPanel>
      )}

      {/* Tab 5: Medical Records */}
      {activeTab === 'records' && (
        <SectionPanel
          title="Medical Records"
          description="Dental X-rays, diagnostic scans and uploaded documents"
          actions={
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="button button-small button-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} /> {showUpload ? 'Close' : 'Upload Record'}
            </button>
          }
        >
          {showUpload && (
            <div style={{ background: '#f7faf8', padding: '18px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--ink)', margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700 }}>
                Upload Medical Record on Behalf of Patient
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <Field label="Title">
                  <TextInput
                    placeholder="e.g. OPG Panorex X-Ray"
                    value={recordTitle}
                    onChange={(e) => setRecordTitle(e.target.value)}
                  />
                </Field>
                <Field label="Record Type">
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    style={{ width: '100%', minHeight: '40px', padding: '0 10px', border: '1px solid var(--line)', borderRadius: '4px', background: '#fff' }}
                  >
                    <option value="xray">Dental X-Ray</option>
                    <option value="lab-report">Lab Report</option>
                    <option value="other">Other Clinical Document</option>
                  </select>
                </Field>
              </div>
              <FileUpload
                endpoint="/medical-records"
                fileField="file"
                extraData={{ title: recordTitle || 'Medical Record', type: recordType, recordType, patientId: id }}
                label="Choose or drop document (PDF, JPG, PNG up to 10MB)"
                onSuccess={handleRecordUploaded}
              />
            </div>
          )}

          <AsyncView query={recordsQuery} empty={recordsQuery.data?.length === 0} emptyTitle="No records on file">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {(recordsQuery.data || []).map((rec) => {
                const rawType = rec.type || rec.recordType
                const displayType = rawType === 'prescription' ? 'Other document' : rawType
                return (
                  <div key={rec._id} style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <strong style={{ color: 'var(--ink)', display: 'block', fontSize: '14px' }}>{rec.title}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        {displayType} · {formatClinicDate(rec.createdAt)}
                      </span>
                    </div>
                    {rec.file?.url && (
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(rec)}
                        className="button button-quiet button-small"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title="View Record"
                      >
                        <Eye size={14} /> Open file
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {/* Tab 6: Invoices & Billing */}
      {activeTab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <SectionPanel title="Invoices" description="Issued invoices and payment receipts">
            <AsyncView query={invoicesQuery} empty={invoicesQuery.data?.length === 0} emptyTitle="No invoices found">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(invoicesQuery.data || []).map((inv) => (
                  <div key={inv._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <strong style={{ color: 'var(--ink)', display: 'block', fontSize: '14px' }}>{inv.invoiceNumber}</strong>
                      <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
                        {formatClinicDate(inv.createdAt)} · Total: {rupees(inv.totalAmount)}
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusBadge value={inv.status} />
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(inv)}
                        className="button button-quiet button-small"
                        title="View PDF"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPdf(`/invoices/${inv._id}/pdf`, `${inv.invoiceNumber}.pdf`)}
                        className="button button-outline button-small"
                        title="Download PDF"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Download size={14} /> Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncView>
          </SectionPanel>

          <SectionPanel title="Payments" description="Payment transactions">
            <AsyncView query={paymentsQuery} empty={paymentsQuery.data?.length === 0} emptyTitle="No payments recorded">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(paymentsQuery.data || []).map((pay) => (
                  <div key={pay._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ color: 'var(--ink)', display: 'block', fontSize: '14px' }}>{rupees(pay.amount)}</strong>
                      <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
                        Method: {pay.method || 'Online'} · {formatClinicDate(pay.createdAt)}
                      </small>
                    </div>
                    <StatusBadge value={pay.status} />
                  </div>
                ))}
              </div>
            </AsyncView>
          </SectionPanel>
        </div>
      )}

      {/* Tab 7: Clinical & Consultation Notes */}
      {activeTab === 'notes' && (
        <SectionPanel title="Clinical Notes & Observations" description="Appointment clinical notes and doctor observations">
          <AsyncView query={apptsQuery} empty={apptsQuery.data?.length === 0} emptyTitle="No consultation notes recorded">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(apptsQuery.data || []).filter((a) => a.reasonForVisit || a.clinicalNotes).map((appt) => (
                <div key={appt._id} style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: '6px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--ink)' }}>Visit on {formatClinicDate(appt.date)} ({appt.startTime})</strong>
                    <StatusBadge value={appt.status} />
                  </div>
                  {appt.reasonForVisit && (
                    <p style={{ fontSize: '13.5px', color: 'var(--body)', margin: '4px 0' }}>
                      <strong>Reason:</strong> {appt.reasonForVisit}
                    </p>
                  )}
                  {appt.clinicalNotes && (
                    <div style={{ background: '#f7faf8', padding: '10px 12px', borderRadius: '4px', borderLeft: '3px solid var(--teal)', marginTop: '8px' }}>
                      <small style={{ color: 'var(--muted)', display: 'block' }}>Clinical Diagnosis / Notes:</small>
                      <p style={{ fontSize: '13px', color: 'var(--ink)', margin: '2px 0' }}>{appt.clinicalNotes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {/* Edit Patient Demographics Modal */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: '560px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={18} style={{ color: 'var(--teal)' }} /> Edit Patient Demographics
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="button button-quiet button-small"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Full Name *">
                <TextInput
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <Field label="Phone *">
                  <TextInput
                    type="tel"
                    required
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </Field>
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
                <Field label="Date of Birth">
                  <TextInput
                    type="date"
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </Field>
                <Field label="Gender">
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                    style={{ width: '100%', minHeight: '40px', padding: '0 10px', border: '1px solid var(--line)', borderRadius: '4px', background: '#fff' }}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Blood Group">
                  <TextInput
                    placeholder="e.g. O+, A+"
                    value={editForm.bloodGroup}
                    onChange={(e) => setEditForm((f) => ({ ...f, bloodGroup: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Residential Address">
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  style={{ width: '100%', padding: '10px', border: '1px solid var(--line)', borderRadius: '4px', fontFamily: 'inherit' }}
                />
              </Field>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: '8px' }}>
                  Emergency Contact
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <Field label="Name">
                    <TextInput
                      value={editForm.emergencyContactName}
                      onChange={(e) => setEditForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                    />
                  </Field>
                  <Field label="Phone">
                    <TextInput
                      type="tel"
                      value={editForm.emergencyContactPhone}
                      onChange={(e) => setEditForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))}
                    />
                  </Field>
                  <Field label="Relation">
                    <TextInput
                      value={editForm.emergencyContactRelation}
                      onChange={(e) => setEditForm((f) => ({ ...f, emergencyContactRelation: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="button button-quiet button-small"
                  disabled={editBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary button-small"
                  disabled={editBusy}
                >
                  {editBusy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRecord && (
        <RecordViewer
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {selectedInvoice && (
        <RecordViewer
          fileUrl={`/invoices/${selectedInvoice._id}/pdf`}
          title={`Invoice ${selectedInvoice.invoiceNumber}`}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  )
}

export default Patient360
