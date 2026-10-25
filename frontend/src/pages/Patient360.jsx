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
} from 'lucide-react'
import { api, downloadPdf } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { formatClinicDate } from '../utils/formatDate.js'
import { FileUpload } from '../components/FileUpload.jsx'
import BackendPendingNotice from '../components/BackendPendingNotice.jsx'
import { AsyncView, EmptyState, SectionPanel, StatusBadge, useToast } from '../components/ui.jsx'

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
        return res?.data || []
      } catch (err) {
        if (err.status === 404) return []
        throw err
      }
    },
    enabled: activeTab === 'appointments',
  })

  // 3. Fetch Records
  const recordsQuery = useQuery({
    queryKey: ['patient-360-records', id],
    queryFn: async () => {
      const res = await api.records.forPatient(id)
      return res?.data || []
    },
    enabled: activeTab === 'records',
  })

  // 4. Fetch Prescriptions
  const presQuery = useQuery({
    queryKey: ['patient-360-prescriptions', id],
    queryFn: async () => {
      const res = await api.prescriptions.forPatient(id)
      return res?.data || []
    },
    enabled: activeTab === 'prescriptions',
  })

  // 5. Fetch Treatment Plans
  const plansQuery = useQuery({
    queryKey: ['patient-plans', id],
    queryFn: async () => {
      const res = await api.plans.forPatient(id)
      return res?.data || []
    },
    enabled: activeTab === 'plans',
  })

  // 6. Fetch Invoices & Payments
  const invoicesQuery = useQuery({
    queryKey: ['patient-360-invoices', id],
    queryFn: async () => {
      const res = await api.invoices.all({ patientId: id })
      return res?.data || []
    },
    enabled: activeTab === 'billing',
  })

  const paymentsQuery = useQuery({
    queryKey: ['patient-360-payments', id],
    queryFn: async () => {
      try {
        const res = await api.payments.all({ patientId: id })
        return res?.data || []
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

  return (
    <div className="patient-360-page">
      {summary.isPendingDeploy && (
        <BackendPendingNotice
          featureName="Patient 360 Profile Summary"
          endpoint={`GET /api/patients/${id}/summary`}
          description="Showing patient basic profile. Advanced summary metrics and history will become live when backend is redeployed."
        />
      )}

      {/* Header */}
      <div className="patient-360-header bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-2xl overflow-hidden shrink-0">
              {patientUser.profilePhoto?.url ? (
                <img src={patientUser.profilePhoto.url} alt={patientUser.name} className="w-full h-full object-cover" />
              ) : (
                (patientUser.name || 'P').slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{patientUser.name || 'Patient'}</h2>
                {patientUser.isEmailVerified ? (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle size={12} /> Verified
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    Unverified
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mt-1">
                {age !== null && <span>{age} yrs / {patientProfile.gender || 'Not specified'}</span>}
                {patientProfile.bloodGroup && <span className="bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded text-xs">{patientProfile.bloodGroup}</span>}
                <span className="flex items-center gap-1"><Phone size={13} /> {patientUser.phone}</span>
                <span className="flex items-center gap-1"><Mail size={13} /> {patientUser.email}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6 w-full md:w-auto">
            <div>
              <small className="text-slate-400 text-xs block">Last Visit</small>
              <strong className="text-white text-sm">
                {stats.lastVisit ? formatClinicDate(stats.lastVisit.date) : 'None'}
              </strong>
            </div>
            <div>
              <small className="text-slate-400 text-xs block">Next Appointment</small>
              <strong className="text-teal-400 text-sm">
                {stats.nextAppointment ? `${formatClinicDate(stats.nextAppointment.date)} (${stats.nextAppointment.startTime})` : 'None'}
              </strong>
            </div>
            <div>
              <small className="text-slate-400 text-xs block">Outstanding Balance</small>
              <strong className={stats.outstandingBalance > 0 ? 'text-amber-400 text-sm' : 'text-emerald-400 text-sm'}>
                {rupees(stats.outstandingBalance)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6 gap-2 overflow-x-auto pb-1">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'appointments', label: 'Appointments' },
          { key: 'records', label: 'Medical Records' },
          { key: 'prescriptions', label: 'Prescriptions' },
          { key: 'plans', label: 'Treatment Plans' },
          { key: 'billing', label: 'Invoices & Billing' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === tab.key
                ? 'bg-teal-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SectionPanel title="Personal Information" description="Demographics and contact info">
            <dl className="divide-y divide-slate-800 text-sm">
              <div className="py-2 flex justify-between">
                <dt className="text-slate-400">Date of Birth</dt>
                <dd className="text-white">{patientProfile.dateOfBirth ? formatClinicDate(patientProfile.dateOfBirth) : 'Not provided'}</dd>
              </div>
              <div className="py-2 flex justify-between">
                <dt className="text-slate-400">Gender</dt>
                <dd className="text-white capitalize">{patientProfile.gender || 'Not provided'}</dd>
              </div>
              <div className="py-2 flex justify-between">
                <dt className="text-slate-400">Blood Group</dt>
                <dd className="text-white">{patientProfile.bloodGroup || 'Not provided'}</dd>
              </div>
              <div className="py-2 flex justify-between">
                <dt className="text-slate-400">Address</dt>
                <dd className="text-white">{patientProfile.address || 'Not provided'}</dd>
              </div>
            </dl>
          </SectionPanel>

          <SectionPanel title="Medical Conditions & Emergency" description="Allergies and health alerts">
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-slate-400 block mb-1">Emergency Contact</span>
                <p className="text-white bg-slate-800/40 p-3 rounded border border-slate-700/50">
                  {patientProfile.emergencyContact?.name
                    ? `${patientProfile.emergencyContact.name} (${patientProfile.emergencyContact.relation || 'Contact'}): ${patientProfile.emergencyContact.phone}`
                    : 'None on file'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Known Allergies</span>
                <p className="text-white bg-slate-800/40 p-3 rounded border border-slate-700/50">
                  {Array.isArray(patientProfile.allergies) && patientProfile.allergies.length > 0
                    ? patientProfile.allergies.join(', ')
                    : 'No allergies reported'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Chronic Conditions</span>
                <p className="text-white bg-slate-800/40 p-3 rounded border border-slate-700/50">
                  {Array.isArray(patientProfile.chronicConditions) && patientProfile.chronicConditions.length > 0
                    ? patientProfile.chronicConditions.join(', ')
                    : 'None reported'}
                </p>
              </div>
            </div>
          </SectionPanel>

          {patientProfile.familyMembers?.length > 0 && (
            <div className="col-span-full">
              <SectionPanel title="Family Members" description="Dependents covered under this patient">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {patientProfile.familyMembers.map((member, i) => (
                    <div key={i} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                      <strong className="text-white block">{member.name}</strong>
                      <span className="text-xs text-teal-400 block">{member.relation}</span>
                      <small className="text-xs text-slate-400 block mt-1">
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

      {activeTab === 'appointments' && (
        <SectionPanel title="Appointment History" description="All visits and consultations">
          <AsyncView query={apptsQuery} empty={apptsQuery.data?.length === 0} emptyTitle="No appointments found">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-xs">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Time</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Fee</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(apptsQuery.data || []).map((appt) => (
                    <tr key={appt._id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">{formatClinicDate(appt.date)}</td>
                      <td className="p-3">{appt.startTime}</td>
                      <td className="p-3 capitalize">{appt.mode}</td>
                      <td className="p-3 max-w-xs truncate">{appt.reasonForVisit || '—'}</td>
                      <td className="p-3">{rupees(appt.fees?.totalAmount)}</td>
                      <td className="p-3"><StatusBadge value={appt.status} /></td>
                      <td className="p-3"><StatusBadge value={appt.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {activeTab === 'records' && (
        <SectionPanel
          title="Medical Records"
          description="Dental X-rays, diagnostic scans and documents"
          actions={
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="button button-small button-outline flex items-center gap-1.5"
            >
              <Upload size={14} /> {showUpload ? 'Close' : 'Upload Record'}
            </button>
          }
        >
          {showUpload && (
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 mb-6">
              <h4 className="font-semibold text-white mb-3">Upload Medical Record on Behalf of Patient</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Title</label>
                  <input
                    type="text"
                    placeholder="e.g. OPG Panorex X-Ray"
                    value={recordTitle}
                    onChange={(e) => setRecordTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Record Type</label>
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                  >
                    <option value="xray">Dental X-Ray</option>
                    <option value="prescription">Prescription Scan</option>
                    <option value="lab-report">Lab Report</option>
                    <option value="other">Other Clinical Document</option>
                  </select>
                </div>
              </div>
              <FileUpload
                endpoint="/medical-records"
                fileField="file"
                extraData={{ title: recordTitle || 'Medical Record', recordType, patientId: id }}
                label="Choose or drop document (PDF, JPG, PNG up to 10MB)"
                onSuccess={handleRecordUploaded}
              />
            </div>
          )}

          <AsyncView query={recordsQuery} empty={recordsQuery.data?.length === 0} emptyTitle="No records on file">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(recordsQuery.data || []).map((rec) => (
                <div key={rec._id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <strong className="text-white block">{rec.title}</strong>
                    <span className="text-xs text-slate-400 uppercase">{rec.recordType} · {formatClinicDate(rec.createdAt)}</span>
                  </div>
                  {rec.file?.url && (
                    <a
                      href={rec.file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-teal-400 transition"
                      title="Open Record"
                    >
                      <Eye size={16} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {activeTab === 'prescriptions' && (
        <SectionPanel title="Prescriptions" description="Medication orders issued by the clinic">
          <AsyncView query={presQuery} empty={presQuery.data?.length === 0} emptyTitle="No prescriptions issued">
            <div className="space-y-4">
              {(presQuery.data || []).map((pres) => (
                <div key={pres._id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <strong className="text-white block">{pres.diagnosis || 'Clinical Prescription'}</strong>
                      <small className="text-xs text-slate-400">Date: {formatClinicDate(pres.createdAt)}</small>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-700/40 mt-3">
                    {(pres.medicines || []).map((med, idx) => (
                      <div key={idx} className="py-2 text-sm flex justify-between">
                        <span className="text-white font-medium">{med.name} ({med.dosage || 'Standard'})</span>
                        <span className="text-slate-400">{med.frequency} · {med.duration}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {activeTab === 'plans' && (
        <SectionPanel title="Treatment Plans" description="Multi-step procedures and care plans">
          <AsyncView query={plansQuery} empty={plansQuery.data?.length === 0} emptyTitle="No treatment plans on file">
            <div className="space-y-6">
              {(plansQuery.data || []).map((plan) => {
                const completedSteps = (plan.steps || []).filter((s) => s.status === 'completed').length
                const totalSteps = (plan.steps || []).length
                const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
                return (
                  <div key={plan._id} className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/60">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-white font-bold text-base">{plan.title}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Created {formatClinicDate(plan.createdAt)}</p>
                      </div>
                      <span className="text-sm font-semibold text-teal-400">
                        {rupees(plan.totalEstimatedCost)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="my-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Progress: {completedSteps} of {totalSteps} steps completed</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    <div className="divide-y divide-slate-700/40 mt-4">
                      {(plan.steps || []).map((step, idx) => (
                        <div key={idx} className="py-2 flex items-center justify-between text-sm">
                          <div>
                            <span className="text-white font-medium">{step.name || step.treatment?.name || 'Procedure Step'}</span>
                            {step.toothNumbers?.length > 0 && (
                              <span className="text-xs text-slate-400 block">Teeth: {step.toothNumbers.join(', ')}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300">{rupees(step.cost)}</span>
                            <StatusBadge value={step.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </AsyncView>
        </SectionPanel>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          <SectionPanel title="Invoices" description="Issued invoices and payment receipts">
            <AsyncView query={invoicesQuery} empty={invoicesQuery.data?.length === 0} emptyTitle="No invoices found">
              <div className="divide-y divide-slate-800">
                {(invoicesQuery.data || []).map((inv) => (
                  <div key={inv._id} className="py-3 flex items-center justify-between">
                    <div>
                      <strong className="text-white block">{inv.invoiceNumber}</strong>
                      <small className="text-xs text-slate-400">
                        {formatClinicDate(inv.createdAt)} · Total: {rupees(inv.totalAmount)}
                      </small>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge value={inv.status} />
                      <button
                        onClick={() => downloadPdf(`/invoices/${inv._id}/pdf`, `${inv.invoiceNumber}.pdf`)}
                        className="p-1.5 bg-slate-700/50 hover:bg-slate-700 rounded text-slate-300 transition"
                        title="Download PDF"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncView>
          </SectionPanel>

          <SectionPanel title="Payments" description="Payment transactions">
            <AsyncView query={paymentsQuery} empty={paymentsQuery.data?.length === 0} emptyTitle="No payments recorded">
              <div className="divide-y divide-slate-800">
                {(paymentsQuery.data || []).map((pay) => (
                  <div key={pay._id} className="py-3 flex items-center justify-between">
                    <div>
                      <strong className="text-white block">{rupees(pay.amount)}</strong>
                      <small className="text-xs text-slate-400">
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
    </div>
  )
}

export default Patient360
