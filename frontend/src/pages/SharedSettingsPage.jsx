import { useState, useEffect } from 'react'
import { Check, KeyRound, Bell, LogOut, ShieldCheck, User, Eye, EyeOff, Monitor, Save, Cookie } from 'lucide-react'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { logout } from '../auth/session.js'
import { useToast } from '../components/ui.jsx'
import { FileUpload } from '../components/FileUpload.jsx'
import { openCookiePreferencesModal, getCookieConsent } from '../utils/cookieConsent.js'

export function SharedSettingsPage() {
  const notify = useToast()
  const showToast = typeof notify === 'function' ? notify : () => {}
  const { user, setUserAndProfile, setSession } = useAuthStore()


  // Profile details state
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')

  // Sync state if user changes
  useEffect(() => {
    if (user?.name) setName(user.name)
    if (user?.phone) setPhone(user.phone)
  }, [user?.name, user?.phone])

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [logoutOtherSessions, setLogoutOtherSessions] = useState(true)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

  // Notification preferences state
  const [emailNotif, setEmailNotif] = useState(user?.notificationPreferences?.email !== false)
  const [pushNotif, setPushNotif] = useState(user?.notificationPreferences?.push !== false)
  const [prefSaved, setPrefSaved] = useState(false)

  // Desk preferences (saved to localStorage for staff)
  const [landingPage, setLandingPage] = useState(() => localStorage.getItem('desk_default_landing') || (user?.role === 'receptionist' ? '/reception/appointments' : '/reception'))
  const [refreshInterval, setRefreshInterval] = useState(() => localStorage.getItem('desk_auto_refresh') || '30')
  const [deskSaved, setDeskSaved] = useState(false)

  useEffect(() => {
    api.notifications.preferences?.()
      .then((res) => {
        if (res.data) {
          if (typeof res.data.email === 'boolean') setEmailNotif(res.data.email)
          if (typeof res.data.push === 'boolean') setPushNotif(res.data.push)
        }
      })
      .catch(() => {})
  }, [])

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    setProfileMessage('')
    if (!name.trim()) {
      setProfileMessage('Full name is required.')
      return
    }
    if (!phone.trim()) {
      setProfileMessage('Phone number is required.')
      return
    }

    setProfileBusy(true)
    try {
      const res = await api.auth.updateMe({ name: name.trim(), phone: phone.trim() })
      if (res.data) {
        setUserAndProfile({ ...user, ...res.data })
      }
      showToast('Profile details updated successfully.', 'success')
      setProfileMessage('Profile details saved.')
    } catch (err) {
      setProfileMessage(err.message || 'Failed to update profile.')
      showToast(err.message || 'Failed to update profile.', 'error')
    } finally {
      setProfileBusy(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMessage('')

    if (!currentPassword) {
      setPasswordMessage('Current password is required.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.')
      return
    }

    setPasswordBusy(true)
    try {
      const res = await api.auth.updatePassword({
        currentPassword,
        newPassword,
        logoutOtherSessions,
      })
      if (res.data?.accessToken && res.data?.refreshToken) {
        setSession({
          user,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
        })
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast('Password updated successfully.', 'success')
      setPasswordMessage('Password changed successfully.')
    } catch (err) {
      setPasswordMessage(err.message || 'Failed to update password.')
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleUploadPhoto = async (file, onProgress) => {
    const formData = new FormData()
    formData.append('photo', file)
    // Pass onProgress directly to api.auth.updatePhoto
    const res = await api.auth.updatePhoto(formData, onProgress)
    if (res.data) {
      setUserAndProfile({ ...user, ...res.data })
    }
    return res
  }

  const handleToggleNotif = async (type) => {
    const newEmail = type === 'email' ? !emailNotif : emailNotif
    const newPush = type === 'push' ? !pushNotif : pushNotif

    if (type === 'email') setEmailNotif(newEmail)
    if (type === 'push') setPushNotif(newPush)

    try {
      await api.notifications.updatePreferences({ email: newEmail, push: newPush })
      setPrefSaved(true)
      setTimeout(() => setPrefSaved(false), 3000)
    } catch {
      // Best effort update
    }
  }

  const handleSaveDeskPreferences = (e) => {
    e.preventDefault()
    localStorage.setItem('desk_default_landing', landingPage)
    localStorage.setItem('desk_auto_refresh', refreshInterval)
    setDeskSaved(true)
    showToast('Desk preferences saved to this browser.', 'success')
    setTimeout(() => setDeskSaved(false), 3000)
  }

  return (
    <div className="settings-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Front desk settings</span>
          <h1>Desk settings &amp; account.</h1>
          <p className="muted-copy">Manage your receptionist profile, desk shortcuts, login credentials and alert preferences.</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <User size={20} />
            <h2>Profile information</h2>
          </div>
          <div className="profile-details" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '1.1rem' }}>{user?.name}</strong>
              <span className="role-tag" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#555', display: 'grid', gap: '0.2rem' }}>
              <div>Email: <strong>{user?.email}</strong> <small style={{ color: '#16a34a' }}>(Verified)</small></div>
              <div>Phone: <strong>{user?.phone || 'Not set'}</strong></div>
            </div>
          </div>

          <form className="stack-form" onSubmit={handleProfileUpdate} style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            {profileMessage && (
              <div className={`notice ${profileMessage.includes('saved') ? 'notice-success' : 'notice-warn'}`}>
                {profileMessage}
              </div>
            )}
            <label className="field">
              <span className="field-label">Display name *</span>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Phone number *</span>
              <input
                type="tel"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button className="button button-primary button-small" type="submit" disabled={profileBusy}>
              <Save size={14} /> {profileBusy ? 'Saving…' : 'Save profile details'}
            </button>
          </form>

          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxSizeMB={10}
            previewUrl={user?.profilePhoto?.url}
            onUpload={handleUploadPhoto}
            label="Change profile photo"
            hint="PNG, JPG, or WEBP up to 10 MB"
            submitLabel="Update profile photo"
            onSuccess={() => {
              showToast('Profile photo updated successfully.', 'success')
            }}
          />
        </section>

        {/* Change Password Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <KeyRound size={20} />
            <h2>Change password</h2>
          </div>
          <form className="stack-form" onSubmit={handlePasswordChange}>
            {passwordMessage && (
              <div className={`notice ${passwordMessage.includes('successfully') ? 'notice-success' : 'notice-warn'}`}>
                {passwordMessage}
              </div>
            )}
            <label className="field">
              <span className="field-label">Current password *</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">New password (minimum 8 characters) *</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Confirm new password *</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.85rem' }}>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => setShowPassword(!showPassword)}
                style={{ padding: '0.2rem 0.5rem' }}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />} {showPassword ? 'Hide password' : 'Show password'}
              </button>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={logoutOtherSessions}
                  onChange={(e) => setLogoutOtherSessions(e.target.checked)}
                />
                Log out of other devices
              </label>
            </div>

            <button className="button button-primary" type="submit" disabled={passwordBusy} style={{ marginTop: '0.5rem' }}>
              {passwordBusy ? 'Updating password…' : 'Update password'}
            </button>
          </form>
        </section>

        {/* Desk Preferences Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <Monitor size={20} />
            <h2>Desk preferences</h2>
          </div>
          <form className="stack-form" onSubmit={handleSaveDeskPreferences}>
            <label className="field">
              <span className="field-label">Default landing view</span>
              <select
                className="input"
                value={landingPage}
                onChange={(e) => setLandingPage(e.target.value)}
              >
                <option value="/reception">Reception Overview</option>
                <option value="/reception/appointments">Appointments lookup</option>
                <option value="/reception/queue">Live Queue</option>
                <option value="/reception/invoices">Invoices &amp; Payments</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">Auto-refresh interval</span>
              <select
                className="input"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
              >
                <option value="15">Every 15 seconds (High activity)</option>
                <option value="30">Every 30 seconds (Default)</option>
                <option value="60">Every 60 seconds</option>
                <option value="0">Off (Manual refresh only)</option>
              </select>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <button className="button button-outline button-small" type="submit">
                Save desk preferences
              </button>
              {deskSaved && <span className="saved-indicator"><Check size={14} /> Saved</span>}
            </div>
          </form>
        </section>

        {/* Notification Preferences Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <Bell size={20} />
            <h2>Notification preferences</h2>
          </div>
          <div className="preferences-list">
            <label className="preference-item">
              <div>
                <strong>Email notifications</strong>
                <p>Receive daily visit summaries, clinic reports and high-priority booking notifications.</p>
              </div>
              <input
                type="checkbox"
                checked={emailNotif}
                onChange={() => handleToggleNotif('email')}
              />
            </label>
            <label className="preference-item">
              <div>
                <strong>Push notifications</strong>
                <p>Receive desktop browser alerts for queue check-ins and urgent schedule cancellations.</p>
              </div>
              <input
                type="checkbox"
                checked={pushNotif}
                onChange={() => handleToggleNotif('push')}
              />
            </label>
            {prefSaved && <span className="saved-indicator"><Check size={14} /> Preferences saved</span>}
          </div>
        </section>

        {/* Cookie & Privacy Preferences Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <Cookie size={20} className="text-teal" />
            <h2>Privacy &amp; Cookie Preferences</h2>
          </div>
          <p className="muted-copy">
            NutriDent uses secure HTTP-Only cookies for your clinical session and authentication. You can inspect or update your optional cookie preferences (analytics and functional preferences) at any time.
          </p>
          <div style={{ margin: '14px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge badge-required" style={{ padding: '4px 10px' }}>
              Essential: Always Active
            </span>
            <span className="badge" style={{ padding: '4px 10px', background: 'var(--bg-alt)', border: '1px solid var(--line)' }}>
              Analytics: {getCookieConsent()?.analytics ? 'Allowed' : 'Disabled'}
            </span>
            <span className="badge" style={{ padding: '4px 10px', background: 'var(--bg-alt)', border: '1px solid var(--line)' }}>
              Functional: {getCookieConsent()?.functional ? 'Allowed' : 'Disabled'}
            </span>
          </div>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={openCookiePreferencesModal}
          >
            Manage Cookie Preferences
          </button>
        </section>

        {/* Security & Sign Out Card */}
        <section className="settings-card danger-card">
          <div className="settings-card-header">
            <ShieldCheck size={20} />
            <h2>Active session &amp; sign out</h2>
          </div>
          <p className="muted-copy">
            Signed in as <strong>{user?.name}</strong> ({user?.role}). Sign out closes your authenticated session on this computer and clears cached clinical records.
          </p>
          <button className="button button-quiet button-danger" onClick={() => logout({ reason: 'manual' })}>
            <LogOut size={16} /> Sign out of this device
          </button>
        </section>
      </div>
    </div>
  )
}


export default SharedSettingsPage;
