import { useEffect, useRef } from 'react'

export function OtpInput({ value = '', onChange, disabled = false, autoFocus = true, id = 'otp-input' }) {
  const inputRefs = useRef([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '')

  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus()
    }
  }, [autoFocus, disabled])

  const handleDigitChange = (index, char) => {
    const clean = char.replace(/\D/g, '')
    if (!clean) {
      // Clear this digit
      const nextArr = [...digits]
      nextArr[index] = ''
      onChange(nextArr.join(''))
      return
    }

    // Single digit entered
    const digit = clean.slice(-1)
    const nextArr = [...digits]
    nextArr[index] = digit
    const nextVal = nextArr.join('')
    onChange(nextVal)

    // Auto-advance to next box
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus()
      inputRefs.current[index + 1].select?.()
    }
  }

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      if (!digits[index] && index > 0 && inputRefs.current[index - 1]) {
        event.preventDefault()
        const nextArr = [...digits]
        nextArr[index - 1] = ''
        onChange(nextArr.join(''))
        inputRefs.current[index - 1].focus()
      } else {
        const nextArr = [...digits]
        nextArr[index] = ''
        onChange(nextArr.join(''))
      }
    } else if (event.key === 'ArrowLeft' && index > 0 && inputRefs.current[index - 1]) {
      event.preventDefault()
      inputRefs.current[index - 1].focus()
      inputRefs.current[index - 1].select?.()
    } else if (event.key === 'ArrowRight' && index < 5 && inputRefs.current[index + 1]) {
      event.preventDefault()
      inputRefs.current[index + 1].focus()
      inputRefs.current[index + 1].select?.()
    }
  }

  const handlePaste = (event) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    onChange(pasted)
    const targetIndex = Math.min(pasted.length, 5)
    if (inputRefs.current[targetIndex]) {
      inputRefs.current[targetIndex].focus()
    }
  }

  return (
    <div
      className="otp-boxes-grid"
      role="group"
      aria-label="6-digit verification code"
      id={id}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '0.5rem',
        maxWidth: '360px',
        margin: '0 auto',
      }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          disabled={disabled}
          value={digits[index]}
          onChange={(e) => handleDigitChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select?.()}
          className="otp-digit-box"
          style={{
            height: '3.25rem',
            textAlign: 'center',
            fontSize: '1.5rem',
            fontWeight: 700,
            borderRadius: '0.625rem',
            border: '2px solid var(--border, #e2e8f0)',
            background: 'var(--surface, #ffffff)',
            color: 'var(--text, #0f172a)',
            outline: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      ))}
    </div>
  )
}
