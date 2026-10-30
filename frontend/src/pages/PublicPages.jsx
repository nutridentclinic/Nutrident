import { useMemo, useState } from 'react'
import { Link, Outlet, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  MapPin,
  Maximize2,
  Menu,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  X,
} from 'lucide-react'
import { api } from '../api/domains.js'
import { usePrimaryDentist } from '../hooks/usePrimaryDentist.js'
import { AsyncView, EmptyState, LoadingState, PageTitle } from '../components/ui.jsx'
import { openCookiePreferencesModal } from '../utils/cookieConsent.js'

export function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

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
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Quick Navbar - always visible on phones directly under header */}
      <nav className="public-mobile-nav-bar" aria-label="Mobile quick navigation">
        <Link to="/services">Treatments</Link>
        <Link to="/doctor">Meet the doctor</Link>
        <Link to="/pricing">Fees</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
      </nav>

      {/* Mobile Drawer Dropdown */}
      {mobileOpen && (
        <>
          <div className="mobile-nav-drawer" role="dialog" aria-label="Mobile navigation drawer">
            <div className="mobile-nav-links">
              <Link to="/services" onClick={() => setMobileOpen(false)}>
                Treatments <ChevronRight size={16} />
              </Link>
              <Link to="/doctor" onClick={() => setMobileOpen(false)}>
                Meet the doctor <ChevronRight size={16} />
              </Link>
              <Link to="/pricing" onClick={() => setMobileOpen(false)}>
                Fees <ChevronRight size={16} />
              </Link>
              <Link to="/about" onClick={() => setMobileOpen(false)}>
                About <ChevronRight size={16} />
              </Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)}>
                Contact <ChevronRight size={16} />
              </Link>
            </div>
            <div className="mobile-nav-actions">
              <Link className="button button-outline" to="/login" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link className="button button-primary" to="/app/book" onClick={() => setMobileOpen(false)}>
                Book a visit <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />
        </>
      )}

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
          <button
            type="button"
            className="footer-link-btn"
            onClick={openCookiePreferencesModal}
            aria-label="Manage cookie settings and privacy preferences"
          >
            Cookie Settings
          </button>
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

export const CLINIC_PHOTOS = [
  {
    id: 'reception',
    title: 'Reception & Patient Welcome Lounge',
    category: 'Reception & Lounge',
    src: '/clinic/reception.jpg',
    alt: 'DrNutrident Dental Clinic reception desk and patient lounge',
    badge: 'Front Desk',
    desc: 'Welcoming front-desk area featuring DrNutrident dental branding, comfortable seating, and ambient lighting.',
  },
  {
    id: 'operatory-chair',
    title: 'Modern Ergonomic Dental Suite',
    category: 'Operatory & Treatment',
    src: '/clinic/operatory-chair.jpg',
    alt: 'Modern ergonomic dental chair and sanitized operatory setup',
    badge: 'Operatory 1',
    desc: 'Fully equipped modern dental chair with advanced overhead illumination and precision instruments for gentle treatments.',
  },
  {
    id: 'operatory-view',
    title: 'Sunlit Panoramic Treatment Bay',
    category: 'Operatory & Treatment',
    src: '/clinic/operatory-view.jpg',
    alt: 'Bright dental operatory with natural daylight and relaxing aesthetic',
    badge: 'Operatory 2',
    desc: 'A calming operatory space designed with soothing natural light, air circulation, and modern clinical aesthetics.',
  },
  {
    id: 'operatory-equipment',
    title: 'Precision Clinical Delivery & Hygiene Bay',
    category: 'Advanced Equipment',
    src: '/clinic/operatory-equipment.jpg',
    alt: 'Precision dental instruments, digital operatory, and sterilization units',
    badge: 'Hygiene & Tech',
    desc: 'Multi-tier autoclaved sterilization, digital monitoring, and precision dental instruments adhering to global hygiene standards.',
  },
  {
    id: 'waiting-lounge',
    title: 'Comfortable Family Waiting Area',
    category: 'Reception & Lounge',
    src: '/clinic/waiting-lounge.jpg',
    alt: 'Patient lounge with comfortable seating and family-friendly atmosphere',
    badge: 'Waiting Lounge',
    desc: 'Quiet and comfortable seating area ensuring family members and patients relax comfortably before consultations.',
  },
]

export function ClinicGallery({
  title = 'Tour Our Modern Clinic & Facilities',
  subtitle = 'Experience comfortable, hygienic, and technologically advanced dental care in our clinic.',
}) {
  const [activeCategory, setActiveCategory] = useState('All Spaces')
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null)

  const categories = ['All Spaces', 'Operatory & Treatment', 'Reception & Lounge', 'Advanced Equipment']

  const filteredPhotos = useMemo(() => {
    if (activeCategory === 'All Spaces') return CLINIC_PHOTOS
    return CLINIC_PHOTOS.filter((photo) => photo.category === activeCategory)
  }, [activeCategory])

  const selectedPhoto = selectedPhotoIndex !== null ? filteredPhotos[selectedPhotoIndex] : null

  const handlePrev = (e) => {
    e.stopPropagation()
    setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : filteredPhotos.length - 1))
  }

  const handleNext = (e) => {
    e.stopPropagation()
    setSelectedPhotoIndex((prev) => (prev < filteredPhotos.length - 1 ? prev + 1 : 0))
  }

  return (
    <section className="clinic-gallery-section" aria-label="Clinic Facilities Gallery">
      <div className="clinic-gallery-header">
        <span className="eyebrow">Our Clinic & Facilities</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <div className="clinic-gallery-tabs" role="tablist" aria-label="Facility filter tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              className={`clinic-gallery-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(cat)
                setSelectedPhotoIndex(null)
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="clinic-gallery-grid">
        {filteredPhotos.map((photo, idx) => (
          <article
            key={photo.id}
            className="clinic-gallery-card"
            onClick={() => setSelectedPhotoIndex(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelectedPhotoIndex(idx)
              }
            }}
          >
            <div className="clinic-gallery-image-wrap">
              <img
                src={photo.src}
                alt={photo.alt}
                className="clinic-gallery-image"
                loading="lazy"
              />
              <span className="clinic-gallery-badge">{photo.badge}</span>
              <span className="clinic-gallery-zoom-pill">
                <Maximize2 size={13} /> View Photo
              </span>
            </div>
            <div className="clinic-gallery-card-body">
              <h3>{photo.title}</h3>
              <p>{photo.desc}</p>
            </div>
          </article>
        ))}
      </div>

      {selectedPhoto && (
        <div
          className="clinic-lightbox-backdrop"
          onClick={() => setSelectedPhotoIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selectedPhoto.title}
        >
          <div className="clinic-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="clinic-lightbox-header">
              <h3>{selectedPhoto.title}</h3>
              <button
                type="button"
                className="clinic-lightbox-close"
                onClick={() => setSelectedPhotoIndex(null)}
                aria-label="Close photo preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="clinic-lightbox-media-wrap">
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.alt}
                className="clinic-lightbox-img"
              />
              {filteredPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    className="clinic-lightbox-nav-btn clinic-lightbox-nav-prev"
                    onClick={handlePrev}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    className="clinic-lightbox-nav-btn clinic-lightbox-nav-next"
                    onClick={handleNext}
                    aria-label="Next photo"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>
            <div className="clinic-lightbox-footer">
              <p>{selectedPhoto.desc}</p>
              <span className="clinic-gallery-badge" style={{ position: 'static' }}>
                {selectedPhoto.badge} · {selectedPhotoIndex + 1} of {filteredPhotos.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
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
              '/clinic/reception.jpg'
            }
            alt="Nutrident Dental Clinic reception and welcome lounge"
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
            src="/clinic/operatory-equipment.jpg"
            alt="Advanced dental operatory equipment and hygiene bay at DrNutrident"
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

      <ClinicGallery />

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

      {/* Dedicated Contact Us Section on Landing Page */}
      <section className="public-section home-contact-section" id="contact" aria-label="Contact Nutrident Dental Clinic">
        <div className="section-heading" style={{ marginBottom: '32px' }}>
          <div>
            <span className="eyebrow">Get In Touch</span>
            <h2>
              Visit or contact<br />
              our dental clinic.
            </h2>
          </div>
          <p style={{ maxWidth: '480px', color: 'var(--muted)', fontSize: '15px', lineHeight: 1.6 }}>
            Have questions about dental procedures, appointments, or clinic timings? Contact DrNutrident directly by phone, email, or visit our clinic.
          </p>
        </div>

        <div className="home-contact-grid">
          {/* Card 1: Phone */}
          <div className="home-contact-card">
            <div className="home-contact-icon">
              <Phone size={22} />
            </div>
            <div>
              <span className="home-contact-label">Call or WhatsApp</span>
              <a href="tel:+919420080771" className="home-contact-value">
                +91-9420080771
              </a>
              <p className="home-contact-subtext">Mon – Sat: 9:00 AM – 8:00 PM</p>
            </div>
            <a
              href="https://wa.me/919420080771"
              target="_blank"
              rel="noreferrer"
              className="button button-outline button-small"
              style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <MessageCircle size={15} /> Chat on WhatsApp
            </a>
          </div>

          {/* Card 2: Email */}
          <div className="home-contact-card">
            <div className="home-contact-icon">
              <Mail size={22} />
            </div>
            <div>
              <span className="home-contact-label">Email Us</span>
              <a href="mailto:nutridentclinic01@gmail.com" className="home-contact-value" style={{ wordBreak: 'break-all' }}>
                nutridentclinic01@gmail.com
              </a>
              <p className="home-contact-subtext">Direct inquiries &amp; consultation support</p>
            </div>
            <a
              href="mailto:nutridentclinic01@gmail.com"
              className="button button-outline button-small"
              style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Mail size={15} /> Send an Email
            </a>
          </div>

          {/* Card 3: Address */}
          <div className="home-contact-card">
            <div className="home-contact-icon">
              <MapPin size={22} />
            </div>
            <div>
              <span className="home-contact-label">Clinic Location</span>
              <address className="home-contact-address">
                Takli Rd, Godavari MIDC, Shankar Nagar, Dwarka, Nashik, Maharashtra 422011
              </address>
              <p className="home-contact-subtext">Convenient location in Dwarka, Nashik</p>
            </div>
            <a
              href="https://maps.google.com/?q=Takli+Rd,+Godavari+MIDC,+Shankar+Nagar,+Dwarka,+Nashik,+Maharashtra+422011"
              target="_blank"
              rel="noreferrer"
              className="button button-outline button-small"
              style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <MapPin size={15} /> View on Google Maps
            </a>
          </div>
        </div>

        {/* Clinic Visit Callout Banner */}
        <div className="home-contact-banner">
          <div className="home-contact-banner-image">
            <img
              src="/clinic/reception.jpg"
              alt="DrNutrident Dental Clinic reception desk"
            />
          </div>
          <div className="home-contact-banner-content">
            <span className="home-contact-banner-badge">Welcoming Patients in Nashik</span>
            <h3>Looking for gentle, expert dental care in Nashik?</h3>
            <p>
              Located at Shankar Nagar, Dwarka, Nashik. Book your visit online with instant confirmation or contact our front desk directly.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              <Link to="/app/book" className="button button-primary">
                Book a visit <ArrowRight size={16} />
              </Link>
              <Link to="/contact" className="button button-outline">
                Full clinic details <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
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

      <ClinicGallery
        title="Our Modern Facility & Treatment Environment"
        subtitle="Designed for patient relaxation, impeccable hygiene, and cutting-edge dental care."
      />
    </main>
  )
}

export function ContactPage() {
  const settingsQuery = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = settingsQuery.data?.data

  const clinicAddress = settings?.address || 'Takli Rd, Godavari MIDC, Shankar Nagar, Dwarka, Nashik, Maharashtra 422011'
  const contactPhone = settings?.contactPhone || '+91-9420080771'
  const contactEmail = settings?.contactEmail || 'nutridentclinic01@gmail.com'
  const whatsappNumber = settings?.whatsappNumber || '+91-9420080771'
  const mapUrl = settings?.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(clinicAddress)}`
  const openingHours = settings?.openingHours || 'Mon - Sat: 9:00 AM - 8:00 PM\nSunday: By appointment only'

  return (
    <main className="catalog-page">
      <PageTitle eyebrow="Contact" title="Get in touch with your clinic." />
      {settingsQuery.isLoading ? (
        <LoadingState />
      ) : settingsQuery.isError ? (
        <p className="muted-copy">{settingsQuery.error.message}</p>
      ) : (
        <div className="section-panel">
          <h2>{settings?.clinicName || 'Nutrident Dental & Diet Clinic'}</h2>
          <div className="contact-details" style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}>
            <div>
              <strong>Address:</strong> <p>{clinicAddress}</p>
            </div>
            <div>
              <strong>Clinic Hours:</strong> <p style={{ whiteSpace: 'pre-line' }}>{openingHours}</p>
            </div>
            <div>
              <strong>Phone:</strong>{' '}
              <a href={`tel:${contactPhone}`}>{contactPhone}</a>
            </div>
            <div>
              <strong>Email:</strong>{' '}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </div>
            <div>
              <strong>WhatsApp:</strong>{' '}
              <a
                href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="whatsapp-link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#16847c' }}
              >
                <MessageCircle size={16} /> Chat on WhatsApp ({whatsappNumber})
              </a>
            </div>
            <div>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="button button-outline button-small"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}
              >
                <MapPin size={15} /> View on Google Maps
              </a>
            </div>
          </div>
          <div style={{ marginTop: '2rem', borderTop: '1px solid #e2ede8', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0' }}>Visiting Our Clinic</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2ede8' }}>
                <img
                  src="/clinic/reception.jpg"
                  alt="DrNutrident Dental Clinic reception desk"
                  style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '12px 14px', background: '#fafcfa' }}>
                  <strong style={{ fontSize: '14px', display: 'block', color: 'var(--ink)' }}>
                    Main Reception & Welcome Desk
                  </strong>
                  <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Front desk check-in and patient consultation area
                  </small>
                </div>
              </div>
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2ede8' }}>
                <img
                  src="/clinic/waiting-lounge.jpg"
                  alt="DrNutrident patient waiting lounge"
                  style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '12px 14px', background: '#fafcfa' }}>
                  <strong style={{ fontSize: '14px', display: 'block', color: 'var(--ink)' }}>
                    Patient Waiting Lounge
                  </strong>
                  <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Comfortable seating area for patients and families
                  </small>
                </div>
              </div>
            </div>
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