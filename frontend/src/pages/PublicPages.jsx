import { useMemo, useState } from 'react'
import { Link, Outlet, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
} from 'lucide-react'
import { api } from '../api/domains.js'
import { usePrimaryDentist } from '../hooks/usePrimaryDentist.js'
import { AsyncView, EmptyState, LoadingState, PageTitle } from '../components/ui.jsx'

export function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">
            <img src="/favicon.svg" alt="Nutrident logo" className="brand-logo-img" />
          </span>
          <span>
            Nutrident<span className="brand-sub">Dental &amp; Diet Clinic</span>
          </span>
        </Link>
        <nav className="public-nav">
          <Link to="/services">Treatments</Link>
          <Link to="/doctor">Meet the doctor</Link>
          <Link to="/pricing">Fees</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <div className="header-actions">
          <Link className="button button-quiet button-small" to="/login">
            Sign in
          </Link>
          <Link className="button button-primary button-small" to="/app/book">
            Book a visit <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <Outlet />
      <footer className="public-footer">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">
            <img src="/favicon.svg" alt="Nutrident logo" className="brand-logo-img" />
          </span>
          <span>
            Nutrident<span className="brand-sub">Dental &amp; Diet Clinic</span>
          </span>
        </Link>
        <span>Thoughtful dental and diet care, with precision and clarity.</span>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  )
}

export function DoctorCard({ dentist, isAccepting = true }) {
  if (!dentist) return null
  const name = dentist.user?.name || 'Dental professional'
  const photo = dentist.user?.profilePhoto?.url

  return (
    <article className="dentist-card single-doctor-card">
      <div className="dentist-card-top">
        <div className="dentist-avatar">
          {photo ? (
            <img src={photo} alt={name} />
          ) : (
            <span>
              {name
                .split(' ')
                .map((word) => word[0])
                .slice(0, 2)
                .join('')}
            </span>
          )}
        </div>
        <span className="verified-mark">
          <ShieldCheck size={14} /> Verified Doctor
        </span>
      </div>
      <h3>Dr. {name}</h3>
      <p className="specialty-line">{dentist.specialization || 'Dental Surgeon'}</p>
      <div className="dentist-meta">
        <span>
          <Star size={14} fill="currentColor" /> {Number(dentist.ratingAverage || 0).toFixed(1)}{' '}
          <small>({dentist.ratingCount || 0} reviews)</small>
        </span>
        <span>
          <MapPin size={14} />
          {dentist.clinicAddress?.city || 'Clinic location'}
        </span>
      </div>
      <div className="dentist-card-bottom">
        <strong>
          ₹{Number(dentist.consultationFee || 0).toLocaleString('en-IN')}
          <small> / visit</small>
        </strong>
        {isAccepting ? (
          <Link to="/app/book" className="button button-primary button-small">
            Book appointment <ArrowRight size={14} />
          </Link>
        ) : (
          <span className="status-badge status-inactive">Not accepting visits</span>
        )}
      </div>
    </article>
  )
}

export function DoctorProfilePage() {
  const { dentist, reviews, isLoading, isError, error, isAcceptingAppointments } = usePrimaryDentist()
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data

  if (isLoading) {
    return (
      <main className="profile-page">
        <LoadingState label="Loading doctor profile…" />
      </main>
    )
  }

  if (isError || !dentist) {
    return (
      <main className="profile-page">
        <EmptyState
          title="Doctor profile is currently unavailable"
          description={error?.message || 'Please contact the clinic directly.'}
        />
      </main>
    )
  }

  const name = dentist.user?.name || 'Care Specialist'
  const photo = dentist.user?.profilePhoto?.url

  return (
    <main className="profile-page">
      {!isAcceptingAppointments && (
        <div className="notice notice-warn">
          The doctor is currently not accepting new appointments online. Please call the clinic directly at{' '}
          {settings?.contactPhone || 'the clinic'} or check back soon.
        </div>
      )}
      <div className="dentist-profile-head">
        <div className="profile-photo">
          {photo ? (
            <img src={photo} alt={`Dr. ${name}`} />
          ) : (
            <span>{name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <span className="verified-mark">
            <ShieldCheck size={14} /> Chief Dental Practitioner
          </span>
          <h1>Dr. {name}</h1>
          <p>
            {dentist.specialization || 'General Dentistry'} · {dentist.experienceYears || 0} years experience
          </p>
          <span className="dentist-meta">
            <Star size={15} fill="currentColor" /> {Number(dentist.ratingAverage || 0).toFixed(1)} from{' '}
            {dentist.ratingCount || 0} reviews
          </span>
        </div>
        <div className="profile-fee">
          <small>Consultation fee</small>
          <strong>₹{Number(dentist.consultationFee || 0).toLocaleString('en-IN')}</strong>
          {isAcceptingAppointments ? (
            <Link className="button button-primary" to="/app/book">
              Book appointment <ArrowRight size={16} />
            </Link>
          ) : (
            <span className="button button-disabled">Appointments paused</span>
          )}
        </div>
      </div>

      <div className="profile-columns">
        <section className="section-panel">
          <span className="eyebrow">About the doctor</span>
          <h2>Thoughtful, personalized care.</h2>
          <p>{dentist.about || settings?.aboutText || 'Dedicated to providing high quality, gentle dental care.'}</p>
          <div className="profile-facts">
            <span>
              <Stethoscope size={16} />
              {dentist.qualifications?.join(', ') || 'BDS / Dental Surgeon'}
            </span>
            <span>
              <MapPin size={16} />
              {[dentist.clinicAddress?.addressLine, dentist.clinicAddress?.city, dentist.clinicAddress?.state]
                .filter(Boolean)
                .join(', ') || settings?.address || 'Clinic location'}
            </span>
            <span>
              <Clock3 size={16} />
              {dentist.languages?.join(', ') || 'English, Hindi'}
            </span>
          </div>
        </section>

        <section className="section-panel">
          <div className="section-panel-heading">
            <div>
              <span className="eyebrow">Patient experiences</span>
              <h2>Verified reviews</h2>
            </div>
          </div>
          {reviews && reviews.length > 0 ? (
            reviews.map((review) => (
              <article className="review-row" key={review._id}>
                <div>
                  <strong>{review.patient?.name || 'Verified Patient'}</strong>
                  <span className="review-stars">{'★'.repeat(review.rating || 5)}</span>
                </div>
                <p>{review.comment}</p>
                {review.reply?.text && (
                  <div className="review-reply">
                    <small>Doctor’s response:</small>
                    <p>{review.reply.text}</p>
                  </div>
                )}
              </article>
            ))
          ) : (
            <p className="muted-copy">No public reviews have been submitted yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}

export function PublicHome() {
  const { dentist, isAcceptingAppointments } = usePrimaryDentist()
  const treatments = useQuery({ queryKey: ['treatments'], queryFn: api.treatments.list })
  const settings = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })

  return (
    <main>
      <section className="home-hero">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> Personalized dental care you can trust
          </span>
          <h1>
            Healthy teeth.<br />
            <em>Clear choices.</em>
          </h1>
          <p>
            Welcome to {settings.data?.data?.clinicName || 'Nutrident Dental Clinic'}. Meet Dr.{' '}
            {dentist?.user?.name || 'our doctor'}, check convenient appointment hours, and book your visit online.
          </p>
          <div className="hero-actions">
            <Link to="/app/book" className="button button-primary">
              Book your visit <ArrowRight size={17} />
            </Link>
            <Link to="/doctor" className="button button-outline">
              Meet Dr. {dentist?.user?.name || 'the Doctor'} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-points">
            <span>
              <Check size={15} /> Single dedicated clinician
            </span>
            <span>
              <Check size={15} /> Transparent upfront fees
            </span>
          </div>
        </div>
        <div className="hero-image-wrap">
          <img
            className="hero-image"
            src={
              dentist?.user?.profilePhoto?.url ||
              'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=1100&q=85'
            }
            alt="Dentist preparing for patient visit"
          />
          <div className="hero-image-caption">
            <span className="caption-icon">
              <CalendarDays size={18} />
            </span>
            <span>
              <strong>Care that fits your day</strong>
              <small>Instant slot confirmation online</small>
            </span>
            <ArrowRight size={18} />
          </div>
          <div className="hero-index">
            <span>01</span>
            <i /> A better visit begins
          </div>
        </div>
        <span className="hero-orbit hero-orbit-one" />
        <span className="hero-orbit hero-orbit-two" />
      </section>

      <section className="trust-strip">
        <div>
          <strong>Personal clinician</strong>
          <span>One doctor dedicated to your family</span>
        </div>
        <div>
          <strong>Real-time availability</strong>
          <span>Instant live appointment booking</span>
        </div>
        <div>
          <strong>Connected care</strong>
          <span>From digital records to aftercare</span>
        </div>
      </section>

      {dentist && (
        <section className="public-section section-dentists">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Your clinician</span>
              <h2>
                Good care begins<br />
                with the right doctor.
              </h2>
            </div>
            <Link to="/doctor" className="text-link">
              Read doctor profile <ArrowRight size={16} />
            </Link>
          </div>
          <div className="single-doctor-spotlight">
            <DoctorCard dentist={dentist} isAccepting={isAcceptingAppointments} />
          </div>
        </section>
      )}

      <section className="public-section care-section">
        <div className="care-image">
          <img
            src="https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=1000&q=85"
            alt="Dental instruments prepared for a patient visit"
          />
          <div className="care-note">
            <Sparkles size={17} />
            <span>
              <strong>Care, connected</strong>
              <small>From first visit to follow-up</small>
            </span>
          </div>
        </div>
        <div className="care-copy">
          <span className="eyebrow">Your next step, made simpler</span>
          <h2>
            More time for care.<br />
            <em>Less time figuring it out.</em>
          </h2>
          <p>Book visits, keep dental records close and understand what comes next, all in one place.</p>
          <div className="care-list">
            <span>
              <i>01</i>
              <strong>Pick your preferred slot</strong>
              <ChevronRight size={16} />
            </span>
            <span>
              <i>02</i>
              <strong>Keep treatment records together</strong>
              <ChevronRight size={16} />
            </span>
            <span>
              <i>03</i>
              <strong>Stay in touch with your clinic</strong>
              <ChevronRight size={16} />
            </span>
          </div>
          <Link to="/app/book" className="button button-outline">
            Schedule an appointment <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="treatment-band">
        <div>
          <span className="eyebrow">Our treatment catalog</span>
          <h2>
            Care for every kind<br />
            of smile.
          </h2>
        </div>
        <AsyncView
          query={treatments}
          empty={!treatments.isLoading && !treatments.isError && !(treatments.data?.data || []).length}
          emptyTitle="Treatment details are not available yet"
        >
          <div className="treatment-chips">
            {(treatments.data?.data || []).slice(0, 6).map((item) => (
              <Link to="/services" key={item._id}>
                {item.name}
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </AsyncView>
      </section>

      <section className="booking-callout">
        <div>
          <span className="eyebrow">Your care, at your pace</span>
          <h2>
            A small step today can<br />
            make tomorrow easier.
          </h2>
        </div>
        <Link className="button button-dark" to="/app/book">
          Book a visit <ArrowRight size={17} />
        </Link>
        <span className="callout-number">DN / 01</span>
      </section>

      {settings.data?.data?.clinicName && (
        <div className="clinic-name-footnote">
          {settings.data.data.clinicName}
          {settings.data.data.contactPhone ? ` · ${settings.data.data.contactPhone}` : ''}
          {settings.data.data.address ? ` · ${settings.data.data.address}` : ''}
        </div>
      )}
    </main>
  )
}

export function DentistDirectory() {
  return <Navigate to="/doctor" replace />
}

export function DentistProfile() {
  return <Navigate to="/doctor" replace />
}

function CatalogPage({ title, eyebrow, description, queryKey, queryFn, renderItem, emptyTitle }) {
  const query = useQuery({ queryKey: [queryKey], queryFn })
  const data = query.data?.data || []
  return (
    <main className="catalog-page">
      <PageTitle eyebrow={eyebrow} title={title} description={description} />
      <AsyncView query={query} empty={!query.isLoading && !query.isError && data.length === 0} emptyTitle={emptyTitle}>
        <div className="catalog-grid">{data.map(renderItem)}</div>
      </AsyncView>
    </main>
  )
}

export function ServicesPage() {
  return (
    <CatalogPage
      eyebrow="Treatment catalog"
      title="Care that meets you where you are."
      description="Explore the treatments currently offered by the clinic. Your doctor will tailor every step to your needs."
      queryKey="treatments"
      queryFn={api.treatments.list}
      emptyTitle="Treatments are not listed yet"
      renderItem={(item) => (
        <article className="catalog-item" key={item._id}>
          <span className="catalog-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h2>{item.name}</h2>
            <p>{item.description || 'Treatment information will be provided by your doctor.'}</p>
            {item.category && <small>{item.category}</small>}
            {item.defaultCost > 0 && <strong>From ₹{Number(item.defaultCost).toLocaleString('en-IN')}</strong>}
          </div>
        </article>
      )}
    />
  )
}

export function PricingPage() {
  const { dentist } = usePrimaryDentist()
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data

  const consultationFee = Number(dentist?.consultationFee || 0)
  const refundHours = Number(settings?.cancellationFullRefundHours || 24)

  return (
    <main className="catalog-page">
      <PageTitle
        eyebrow="Fees, in the open"
        title="Know what to expect."
        description="Our fees are straightforward with no hidden consultation costs."
      />
      <section className="pricing-panel">
        <div>
          <span className="eyebrow">Doctor consultation</span>
          <strong>{consultationFee > 0 ? `₹${consultationFee.toLocaleString('en-IN')}` : 'Fee on appointment'}</strong>
          <p>Standard consultation fee with Dr. {dentist?.user?.name || 'our doctor'}.</p>
        </div>
        <div>
          <span className="eyebrow">Cancellation policy</span>
          <strong>{refundHours} hours</strong>
          <p>Full refund when cancelled at least {refundHours} hours before your visit.</p>
        </div>
        <Link to="/app/book" className="button button-primary">
          Book appointment <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  )
}

export function AboutPage() {
  const { dentist } = usePrimaryDentist()
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data

  return (
    <main className="catalog-page">
      <PageTitle eyebrow="About the practice" title="A more considered dental visit." />
      <div className="section-panel">
        <h2>{settings?.clinicName || 'Nutrident Dental Clinic'}</h2>
        <p style={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
          {settings?.aboutText ||
            'Nutrident is dedicated to providing high-quality, gentle dental and nutritional guidance under one roof. Our focus is long-term oral health through thoughtful examinations and transparent treatment.'}
        </p>
        {dentist && (
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/doctor" className="button button-outline">
              Meet Dr. {dentist.user?.name || 'the Doctor'} <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

export function ContactPage() {
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data

  return (
    <main className="catalog-page">
      <PageTitle eyebrow="Contact" title="Get in touch with your clinic." />
      {settingsQuery.isLoading ? (
        <LoadingState />
      ) : settingsQuery.isError ? (
        <p className="muted-copy">{settingsQuery.error.message}</p>
      ) : (
        <div className="section-panel">
          <h2>{settings?.clinicName || 'Nutrident Dental Clinic'}</h2>
          <div className="contact-details" style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}>
            {settings?.address && (
              <div>
                <strong>Address:</strong> <p>{settings.address}</p>
              </div>
            )}
            {settings?.openingHours && (
              <div>
                <strong>Clinic Hours:</strong> <p>{settings.openingHours}</p>
              </div>
            )}
            {settings?.contactPhone && (
              <div>
                <strong>Phone:</strong>{' '}
                <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a>
              </div>
            )}
            {settings?.contactEmail && (
              <div>
                <strong>Email:</strong>{' '}
                <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
              </div>
            )}
            {settings?.whatsappNumber && (
              <div>
                <strong>WhatsApp:</strong>{' '}
                <a
                  href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="whatsapp-link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#16847c' }}
                >
                  <MessageCircle size={16} /> Chat on WhatsApp ({settings.whatsappNumber})
                </a>
              </div>
            )}
            {settings?.mapUrl && (
              <div>
                <a
                  href={settings.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button button-outline button-small"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}
                >
                  <MapPin size={15} /> View on Google Maps
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export function LegalPage({ type = 'privacy' }) {
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data
  const isPrivacy = type === 'privacy'

  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service'
  const customText = isPrivacy ? settings?.privacyPolicy : settings?.termsOfService

  return (
    <main className="catalog-page">
      <PageTitle eyebrow="Legal information" title={title} />
      <div className="section-panel">
        {customText ? (
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>{customText}</div>
        ) : (
          <p className="muted-copy">
            {isPrivacy
              ? 'Nutrident Dental Clinic respects your privacy. All patient medical data and consultation records are handled confidentially in compliance with standard clinical data privacy practices.'
              : 'By booking an appointment or using services at Nutrident Dental Clinic, you agree to adhere to clinic attendance and cancellation policies.'}
          </p>
        )}
      </div>
    </main>
  )
}

export function SimplePublicPage({ title, eyebrow, children }) {
  return (
    <main className="catalog-page">
      <PageTitle eyebrow={eyebrow} title={title} />
      {children}
    </main>
  )
}