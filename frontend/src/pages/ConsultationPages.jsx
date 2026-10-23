import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { fromZonedTime } from 'date-fns-tz'
import { ArrowLeft, Camera, CameraOff, Check, Clock3, LoaderCircle, Mic, MicOff, PhoneOff, RefreshCw, ShieldAlert, Volume2 } from 'lucide-react'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { AsyncView, useToast } from '../components/ui.jsx'

const timeZone = import.meta.env.VITE_CLINIC_TIMEZONE || 'Asia/Kolkata'
const fmtDate = (date) => new Date(date).toLocaleDateString('en-IN', { dateStyle: 'full', timeZone: 'UTC' })

function appointmentWindow(appointment) {
  if (!appointment) return null
  const day = new Date(appointment.date).toISOString().slice(0, 10)
  const start = fromZonedTime(`${day}T${appointment.startTime}:00`, timeZone).getTime()
  const end = fromZonedTime(`${day}T${appointment.endTime}:00`, timeZone).getTime()
  return { start: start - 15 * 60 * 1000, end: end + 30 * 60 * 1000 }
}

export function ConsultationLobby() {
  const { id } = useParams()
  const query = useQuery({ queryKey: ['appointment', id], queryFn: () => api.appointments.detail(id) })
  const appointment = query.data?.data
  const [now, setNow] = useState(() => Date.now())
  const [deviceStatus, setDeviceStatus] = useState('not-checked')
  const [deviceError, setDeviceError] = useState('')
  const [audioOnly, setAudioOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const window = appointmentWindow(appointment)
  const allowed = window && now >= window.start && now <= window.end
  const secondsUntil = window && now < window.start ? Math.ceil((window.start - now) / 1000) : 0
  const hours = Math.floor(secondsUntil / 3600).toString().padStart(2, '0')
  const minutes = Math.floor((secondsUntil % 3600) / 60).toString().padStart(2, '0')
  const seconds = (secondsUntil % 60).toString().padStart(2, '0')

  useEffect(() => { const timer = globalThis.window.setInterval(() => setNow(Date.now()), 1000); return () => globalThis.window.clearInterval(timer) }, [])

  const checkDevices = async (audio = false) => {
    setDeviceError('')
    if (!navigator.mediaDevices?.getUserMedia) { setDeviceError('Camera and microphone access requires HTTPS or localhost in a supported browser.'); setDeviceStatus('unavailable'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !audio })
      stream.getTracks().forEach((track) => track.stop())
      setAudioOnly(audio)
      setDeviceStatus('ready')
      return true
    } catch (error) {
      setDeviceStatus('denied')
      setDeviceError(error.name === 'NotAllowedError' ? 'Camera or microphone permission was denied. Allow access in your browser settings, or continue with audio only.' : error.message)
      return false
    }
  }

  const join = async (audio = audioOnly) => {
    if (!allowed) return
    setBusy(true)
    const ready = deviceStatus === 'ready' && audioOnly === audio ? true : await checkDevices(audio)
    if (!ready) { setBusy(false); return }
    navigate(`/consultation/${id}`, { state: { audioOnly: audio } })
  }

  return <main className="consultation-page"><Link to="/app/appointments" className="back-link"><ArrowLeft size={15} /> Back to appointments</Link><AsyncView query={query} empty={!query.isLoading && !query.isError && !appointment}><div /></AsyncView>{appointment && <><div className="consult-lobby-head"><span className="consult-icon"><Volume2 size={22} /></span><span className="eyebrow">Private video consultation</span><h1>Join your appointment.</h1><p>Dr. {appointment.dentist?.user?.name || 'your dentist'} · {fmtDate(appointment.date)} at {appointment.startTime}</p></div>{appointment.mode !== 'video' && <div className="notice notice-error"><ShieldAlert size={17} />This appointment is not scheduled as a video consultation.</div>}{appointment.status !== 'confirmed' && <div className="notice notice-warn">This appointment is {appointment.status}. Video access requires a confirmed visit and verified payment.</div>}{window && !allowed && appointment.status === 'confirmed' && appointment.paymentStatus === 'paid' && <div className="consult-countdown"><Clock3 size={19} /><span>{now < window.start ? `Join opens in ${hours}:${minutes}:${seconds}` : 'The video consultation access window has ended.'}</span><small>Join access follows the clinic’s 15-minute early and 30-minute late window.</small></div>}<section className="device-check"><div><span className={`device-indicator ${deviceStatus}`} /><strong>{deviceStatus === 'ready' ? 'Devices are ready' : deviceStatus === 'denied' ? 'Permission needed' : 'Check your camera and microphone'}</strong><p>{deviceError || (deviceStatus === 'ready' ? `Ready to join${audioOnly ? ' with audio only' : ' with video and audio'}.` : 'Your browser will ask for permission to use these devices.')}</p></div><div className="device-actions"><button className="button button-outline" onClick={() => checkDevices(false)}><Camera size={15} /> Test camera & microphone</button><button className="button button-quiet" onClick={() => { setAudioOnly(true); checkDevices(true) }}><Mic size={15} /> Test audio only</button></div></section><div className="consult-disclaimer">Your appointment token is requested securely when you join. Calls are not recorded and there is no in-call chat.</div><button className="button button-primary button-wide" disabled={!allowed || appointment.status !== 'confirmed' || appointment.paymentStatus !== 'paid' || appointment.mode !== 'video' || busy} onClick={() => join()}>{busy ? 'Checking devices…' : audioOnly ? 'Join with audio' : 'Join video consultation'} <ArrowLeft className="arrow-right" size={16} /></button></>}</main>
}

export function ConsultationCall() {
  const { id } = useParams()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const notify = useToast()
  const query = useQuery({ queryKey: ['appointment', id], queryFn: () => api.appointments.detail(id) })
  const appointment = query.data?.data
  const clientRef = useRef(null)
  const tracksRef = useRef([])
  const [connection, setConnection] = useState('Connecting…')
  const [remotePresent, setRemotePresent] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [audioOnly] = useState(Boolean(window.history.state?.usr?.audioOnly))
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(true)
  const [left, setLeft] = useState(false)
  const [network, setNetwork] = useState('Checking connection')
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    let client
    const start = async () => {
      if (!appointment) return
      try {
        if (!AgoraRTC.checkSystemRequirements()) throw new Error('This browser does not meet Agora’s system requirements. Try a current version of Chrome or Edge.')
        setConnection('Requesting secure room access…')
        const grant = await api.appointments.joinVideo(id)
        const { appId, channelName, token, uid } = grant.data
        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        clientRef.current = client
        client.on('connection-state-change', (current, previous, reason) => {
          if (!active) return
          setConnection(current === 'CONNECTED' ? 'Connected' : current === 'RECONNECTING' ? 'Reconnecting…' : current === 'DISCONNECTED' ? `Disconnected${reason ? `: ${reason}` : ''}` : 'Connecting…')
        })
        client.on('user-published', async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType)
          if (mediaType === 'video') remoteUser.videoTrack?.play('remote-player')
          if (mediaType === 'audio') remoteUser.audioTrack?.play()
          if (active) setRemotePresent(true)
        })
        client.on('user-unpublished', () => { if (active) setRemotePresent(false) })
        client.on('user-left', () => { if (active) { setRemotePresent(false); setConnection('The other participant left the call.') } })
        client.on('network-quality', ({ uplinkNetworkQuality, downlinkNetworkQuality }) => {
          const worst = Math.max(uplinkNetworkQuality || 0, downlinkNetworkQuality || 0)
          setNetwork(worst <= 2 ? 'Good connection' : worst <= 4 ? 'Unstable connection' : 'Poor connection')
        })
        client.on('token-privilege-will-expire', async () => {
          try { const renewed = await api.appointments.joinVideo(id); await client.renewToken(renewed.data.token) }
          catch (renewError) { setError(`Could not renew secure room access: ${renewError.message}`) }
        })
        await client.join(appId, channelName, token, uid)
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
        tracksRef.current = [audioTrack]
        if (!audioOnly) {
          const videoTrack = await AgoraRTC.createCameraVideoTrack()
          tracksRef.current.push(videoTrack)
          videoTrack.play('local-player')
        }
        await client.publish(tracksRef.current)
        if (active) { setConnection('Connected'); setJoining(false) }
      } catch (cause) {
        if (active) { setError(cause.message); setJoining(false); setConnection('Unable to join') }
        tracksRef.current.forEach((track) => track.close())
        tracksRef.current = []
        try { await client?.leave() } catch { /* Leave is best-effort after a failed join. */ }
      }
    }
    if (appointment) start()
    return () => {
      active = false
      tracksRef.current.forEach((track) => { track.stop(); track.close() })
      tracksRef.current = []
      client?.leave().catch(() => {})
      clientRef.current = null
    }
  }, [appointment, audioOnly, id])

  const leave = async () => {
    try { await clientRef.current?.unpublish(tracksRef.current) } catch { /* Continue teardown even if transport is already down. */ }
    tracksRef.current.forEach((track) => { track.stop(); track.close() })
    tracksRef.current = []
    try { await clientRef.current?.leave() } catch { /* The room may already be disconnected. */ }
    setLeft(true); setConnection('Call ended')
  }
  const complete = async () => {
    try { const result = await api.appointments.complete(id); notify(result.message); queryClient.invalidateQueries(); navigate('/dentist/appointments') }
    catch (cause) { notify(cause.message, 'error') }
  }
  const toggleMute = async () => { const next = !muted; await tracksRef.current[0]?.setEnabled(!next); setMuted(next) }
  const toggleCamera = async () => { const track = tracksRef.current.find((item) => item.trackMediaType === 'video'); const next = !cameraOff; await track?.setEnabled(!next); setCameraOff(next) }

  return <main className="call-page"><header className="call-topbar"><Link to={user?.role === 'dentist' ? '/dentist/appointments' : '/app/appointments'} className="brand-lockup"><span className="brand-mark"><img src="/favicon.svg" alt="Nutrident logo" className="brand-logo-img" /></span><span>Nutrident<span className="brand-sub">Private consultation</span></span></Link><span className={`connection-indicator ${connection === 'Connected' ? 'connected' : ''}`}><i />{connection}</span></header><AsyncView query={query} empty={false}><section className="video-stage">{error && <div className="call-error" role="alert"><strong>Call issue</strong><p>{error}</p><button className="button button-outline" onClick={() => window.location.reload()}><RefreshCw size={14} /> Retry</button></div>}<div className="remote-video" id="remote-player">{!remotePresent && <div className="remote-wait"><span className="remote-wait-mark"><Clock3 size={21} /></span><h1>Waiting for the other participant</h1><p>Keep this room open. The call begins when they join.</p></div>}</div>{!audioOnly && <div className="local-video" id="local-player"><span>You</span></div>}<div className="call-identity"><span><strong>{user?.name}</strong><small>{user?.role}</small></span><span>{appointment?.startTime} · {network}</span></div></section><div className="call-controls"><button className={`control-button ${muted ? 'control-off' : ''}`} onClick={toggleMute} disabled={joining || left} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={19} /> : <Mic size={19} />}<span>{muted ? 'Unmute' : 'Mute'}</span></button>{!audioOnly && <button className={`control-button ${cameraOff ? 'control-off' : ''}`} onClick={toggleCamera} disabled={joining || left} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <CameraOff size={19} /> : <Camera size={19} />}<span>{cameraOff ? 'Camera on' : 'Camera off'}</span></button>}<button className="control-button control-leave" onClick={leave} disabled={left}><PhoneOff size={19} /><span>{left ? 'Call ended' : 'Leave call'}</span></button>{left && user?.role === 'dentist' && <button className="button button-primary" onClick={complete}>Complete appointment <Check size={15} /></button>}</div>{joining && <div className="call-joining"><LoaderCircle className="spin" size={17} /> Establishing secure connection…</div>}</AsyncView></main>
}