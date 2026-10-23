import { useState } from 'react'
import { Check, KeyRound, Bell, LogOut, ShieldCheck, User } from 'lucide-react'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { logout } from '../auth/session.js'
import { useToast } from '../components/ui.jsx'
import { FileUpload } from '../components/FileUpload.jsx'

export default function SharedSettingsPage() {
  const { user, setUserAndProfile, setSession } = useAuthStore()
  const { showToast } = useToast()

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

  // Notification preferences state
  const [emailNotif, setEmailNotif] = useState(user?.notificationPreferences?.email !== false)
  const [pushNotif, setPushNotif] = useState(user?.notificationPreferences?.push !== false)
  const [prefSaved, setPrefSaved] = useState(false)

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMessage('')

    if (!currentPassword) {
      setPasswordMessage('Current password is required.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.')
      return
    }

    setPasswordBusy(true)
    try {
      const res = await api.auth.updatePassword({ currentPassword, newPassword })
      // Server invalidates other sessions and issues fresh tokens
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
    const res = await api.auth.updatePhoto(formData, { onUploadProgress: onProgress })
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
      if (user?.role === 'patient') {
        await api.patients.update({
          notificationPreferences: { email: newEmail, push: newPush },
        })
      }
      setPrefSaved(true)
      setTimeout(() => setPrefSaved(false), 3000)
    } catch {
      // Best effort update
    }
  }

  return (
    <div className="settings-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Account & security.</h1>
          <p className="muted-copy">Manage your clinic login, credentials and communication preferences.</p>
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
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
            <span>{user?.phone}</span>
            <span className="role-tag">{user?.role}</span>
          </div>
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
              <span className="field-label">Current password</span>
              <input
                type="password"
                className="input"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <label className="field">
              <span className="field-label">Confirm new password</span>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <button className="button button-primary" type="submit" disabled={passwordBusy}>
              {passwordBusy ? 'Updating password…' : 'Update password'}
            </button>
          </form>
        </section>

        {/* Notification Preferences Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <Bell size={20} />
            <h2>Notifications</h2>
          </div>
          <div className="preferences-list">
            <label className="preference-item">
              <div>
                <strong>Email notifications</strong>
                <p>Receive appointment confirmations, reminders and clinical updates via email.</p>
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
                <p>Receive real-time alerts on your device for queue updates and schedule changes.</p>
              </div>
              <input
                type="checkbox"
                checked={pushNotif}
                onChange={() => handleToggleNotif('push')}
              />
            </label>
            {prefSaved && <span className="saved-indicator"><Check size={14} /> Saved</span>}
          </div>
        </section>

        {/* Security & Sign Out Card */}
        <section className="settings-card danger-card">
          <div className="settings-card-header">
            <ShieldCheck size={20} />
            <h2>Session & sign out</h2>
          </div>
          <p className="muted-copy">
            Signing out terminates your current authenticated session, clears cached healthcare data from this browser, and revokes access across active windows.
          </p>
          <button className="button button-quiet button-danger" onClick={() => logout({ reason: 'manual' })}>
            <LogOut size={16} /> Sign out of this session
          </button>
        </section>
      </div>
    </div>
  )
}
