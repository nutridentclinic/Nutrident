import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText,
  Search,
  ArrowRight,
  UserRound,
  Calendar,
  Filter,
  Eye,
  Download,
} from 'lucide-react';
import { api } from '../api/domains.js';
import { AsyncView, PageTitle, SectionPanel, TextInput, Field } from '../components/ui.jsx';
import { RecordViewer } from '../components/RecordViewer.jsx';
import { formatClinicDate } from '../utils/formatDate.js';

const RECORD_TYPES = [
  { value: '', label: 'All types' },
  { value: 'xray', label: 'Dental X-Ray' },
  { value: 'lab-report', label: 'Lab Report' },
  { value: 'scan', label: 'Scan' },
  { value: 'doctor-note', label: 'Doctor Note' },
  { value: 'other', label: 'Other Document' },
];

export function AllRecordsPage({ role = 'receptionist' }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [viewingRecord, setViewingRecord] = useState(null);

  const basePath = role === 'admin' ? '/admin' : role === 'dentist' ? '/dentist' : '/reception';

  const query = useQuery({
    queryKey: ['all-medical-records', filterType, search],
    queryFn: () => api.records.list({ type: filterType || undefined, search: search.trim() || undefined }),
    staleTime: 15000,
  });

  const records = query.data?.data || [];

  return (
    <div className="dashboard-page">
      <PageTitle
        eyebrow="Clinical documents & files"
        title="Medical records"
        description="Inspect dental X-rays, diagnostic reports, and patient health files across the clinic."
      />

      <SectionPanel title="Browse records">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ flex: '1 1 280px' }}>
            <label className="search-field" style={{ width: '100%' }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by title, patient name, phone, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          <div style={{ minWidth: '180px' }}>
            <TextInput
              as="select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </TextInput>
          </div>
        </div>

        <AsyncView
          query={query}
          empty={!query.isLoading && !query.isError && records.length === 0}
          emptyTitle="No medical records found"
          emptyDescription={search || filterType ? 'Try adjusting your search query or type filter.' : 'No medical records have been uploaded yet.'}
        >
          <div className="record-list">
            {records.map((rec) => {
              const patientName = rec.patient?.name || 'Patient';
              const patientId = rec.patient?._id || rec.patient;
              const uploadedByName = rec.uploadedBy?.name || 'Staff';

              return (
                <article className="record-row" key={rec._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: '240px', flex: 1 }}>
                    <span className="record-type-icon">
                      <FileText size={18} />
                    </span>
                    <div className="record-row-content">
                      <strong style={{ fontSize: '1rem' }}>{rec.title}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{rec.type?.replace('-', ' ')}</span>
                        <span>·</span>
                        <span>{formatClinicDate(rec.createdAt)}</span>
                        {patientId && (
                          <>
                            <span>·</span>
                            <Link
                              to={`${basePath}/patients/${patientId}`}
                              style={{ color: '#0d9488', textDecoration: 'underline' }}
                            >
                              {patientName}
                            </Link>
                          </>
                        )}
                        {uploadedByName && (
                          <small style={{ color: '#94a3b8' }}>
                            (Uploaded by {uploadedByName})
                          </small>
                        )}
                      </span>
                      {rec.description && (
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#475569' }}>
                          {rec.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="record-row-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="button button-primary button-small flex items-center gap-1.5"
                      onClick={() => setViewingRecord(rec)}
                    >
                      <Eye size={14} /> View record
                    </button>
                    {rec.file?.url && (
                      <a
                        href={`/api/medical-records/${rec._id}/file?download=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="button button-quiet button-small flex items-center gap-1"
                        download
                        title="Download file"
                      >
                        <Download size={14} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </AsyncView>
      </SectionPanel>

      {viewingRecord && (
        <RecordViewer
          record={viewingRecord}
          onClose={() => setViewingRecord(null)}
        />
      )}
    </div>
  );
}

export default AllRecordsPage;

