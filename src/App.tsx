import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  cancelBooking,
  createBooking,
  listBookings,
  listSlots,
  type Booking,
  type Slot,
} from './api'

const API_KEY_STORAGE = 'slot-web.api-key'
const EMAIL_STORAGE = 'slot-web.email'

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

type Notice = { kind: 'success' | 'error'; text: string } | null

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${new Date(endIso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (notice === null) return null
  return (
    <p className={`notice ${notice.kind === 'success' ? 'notice--ok' : 'notice--err'}`} role="status">
      {notice.text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// API key panel
// ---------------------------------------------------------------------------

function ApiKeyPanel({
  apiKey,
  onChange,
}: {
  apiKey: string
  onChange: (key: string) => void
}) {
  const [draft, setDraft] = useState(apiKey)
  const [revealed, setRevealed] = useState(false)

  const connected = apiKey.trim().length > 0

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Connection</h2>
        <span className={`pill ${connected ? 'pill--ok' : 'pill--warn'}`}>
          {connected ? 'ready' : 'no API key'}
        </span>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          onChange(draft.trim())
        }}
      >
        <input
          type={revealed ? 'text' : 'password'}
          value={draft}
          placeholder="Paste the slot-api X-API-Key value"
          aria-label="API key"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" className="btn btn--ghost" onClick={() => setRevealed((r) => !r)}>
          {revealed ? 'Hide' : 'Show'}
        </button>
        <button type="submit" className="btn" disabled={draft.trim() === apiKey}>
          Save
        </button>
      </form>
      <p className="hint">
        The key stays in this browser (localStorage) and is sent as the{' '}
        <code>X-API-Key</code> header on every request. Start the API with{' '}
        <code>make api</code> or <code>uv run uvicorn slot_api.main:app</code> in{' '}
        <code>~/Projects/slot-api</code>.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Booking form (shown for the selected slot)
// ---------------------------------------------------------------------------

function BookingForm({
  slot,
  defaultEmail,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  slot: Slot
  defaultEmail: string
  onSubmit: (name: string, email: string) => void
  onCancel: () => void
  submitting: boolean
  error: Notice
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(defaultEmail)

  return (
    <form
      className="booking-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(name, email)
      }}
    >
      <div className="fields">
        <label>
          Full name
          <input
            value={name}
            required
            placeholder="Ada Obi"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            required
            placeholder="ada@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      <NoticeBar notice={error} />
      <div className="row row--end">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Booking…' : `Book ${slot.provider}`}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Slots panel
// ---------------------------------------------------------------------------

function SlotsPanel({
  apiKey,
  onBooked,
}: {
  apiKey: string
  onBooked: (email: string) => void
}) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [providerFilter, setProviderFilter] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<Notice>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const loadSlots = useCallback(
    async (key: string, provider: string) => {
      if (key === '') return
      setLoading(true)
      setLoadError(null)
      try {
        setSlots(await listSlots(key, provider || undefined))
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Unexpected error.')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadSlots(apiKey, providerFilter)
  }, [apiKey, providerFilter, loadSlots])

  async function submitBooking(name: string, email: string) {
    if (selectedSlot === null) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const booking = await createBooking(apiKey, {
        slotId: selectedSlot.id,
        name,
        email,
      })
      localStorage.setItem(EMAIL_STORAGE, email)
      setSelectedSlot(null)
      setSubmitError(null)
      setNotice({
        kind: 'success',
        text: `Booked ${selectedSlot.provider} — confirmation sent to ${booking.email}.`,
      })
      onBooked(email)
      await loadSlots(apiKey, providerFilter)
    } catch (err) {
      setSubmitError({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Unexpected error.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const providers = [...new Set(slots.map((s) => s.provider))]

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Available slots</h2>
        <input
          className="filter"
          value={providerFilter}
          placeholder="Filter by provider…"
          onChange={(e) => setProviderFilter(e.target.value)}
        />
      </div>

      <NoticeBar notice={notice} />

      {apiKey === '' ? (
        <p className="empty">Save an API key above to load slots.</p>
      ) : loading ? (
        <p className="empty">Loading…</p>
      ) : loadError ? (
        <p className="empty empty--err">{loadError}</p>
      ) : slots.length === 0 ? (
        <p className="empty">No slots match. Seed the API or clear the provider filter.</p>
      ) : (
        <ul className="slot-list">
          {slots.map((slot) => (
            <li key={slot.id} className={slot.available ? '' : 'slot--taken'}>
              <div>
                <strong>{slot.provider}</strong>
                <span className="slot-time">{formatRange(slot.start, slot.end)}</span>
              </div>
              {slot.available ? (
                selectedSlot?.id === slot.id ? (
                  <BookingForm
                    slot={slot}
                    defaultEmail={localStorage.getItem(EMAIL_STORAGE) ?? ''}
                    submitting={submitting}
                    error={submitError}
                    onSubmit={(name, email) => void submitBooking(name, email)}
                    onCancel={() => {
                      setSelectedSlot(null)
                      setSubmitError(null)
                    }}
                  />
                ) : (
                  <button
                    className="btn btn--sm"
                    onClick={() => {
                      setSubmitError(null)
                      setSelectedSlot(slot)
                    }}
                  >
                    Book
                  </button>
                )
              ) : (
                <span className="pill pill--muted">booked</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {providers.length > 0 && (
        <p className="hint">Providers on this page: {providers.join(', ')}</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// My bookings panel
// ---------------------------------------------------------------------------

function BookingsPanel({ apiKey, lookupEmail }: { apiKey: string; lookupEmail: string | null }) {
  const [emailInput, setEmailInput] = useState(lookupEmail ?? '')
  const [activeEmail, setActiveEmail] = useState<string | null>(lookupEmail)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<Notice>(null)

  const fetchPage = useCallback(
    async (key: string, email: string, pageCursor: string | null, append: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listBookings(key, email, pageCursor ?? undefined)
        setBookings((prev) => (append ? [...prev, ...page.bookings] : page.bookings))
        setCursor(page.next_cursor)
        setHasMore(page.next_cursor !== null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unexpected error.')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (activeEmail !== null && apiKey !== '') {
      void fetchPage(apiKey, activeEmail, null, false)
    }
  }, [activeEmail, apiKey, fetchPage])

  async function cancel(id: string) {
    setCancellingId(id)
    setCancelError(null)
    try {
      const updated = await cancelBooking(apiKey, id)
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)))
    } catch (err) {
      setCancelError({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Unexpected error.',
      })
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>My bookings</h2>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          setActiveEmail(emailInput.trim().toLowerCase())
        }}
      >
        <input
          type="email"
          value={emailInput}
          required
          placeholder="ada@example.com"
          aria-label="Email to look up"
          onChange={(e) => setEmailInput(e.target.value)}
        />
        <button type="submit" className="btn" disabled={apiKey === ''}>
          Look up
        </button>
      </form>

      <NoticeBar notice={cancelError} />

      {activeEmail === null ? (
        <p className="empty">Enter an email to see its bookings.</p>
      ) : loading && bookings.length === 0 ? (
        <p className="empty">Loading…</p>
      ) : error ? (
        <p className="empty empty--err">{error}</p>
      ) : bookings.length === 0 ? (
        <p className="empty">No bookings for {activeEmail}.</p>
      ) : (
        <ul className="booking-list">
          {bookings.map((b) => (
            <li key={b.id} className={b.status === 'cancelled' ? 'booking--cancelled' : ''}>
              <div>
                <strong>{b.name}</strong>
                <span className="slot-time">
                  {b.status === 'cancelled' ? 'cancelled' : 'confirmed'} · booked{' '}
                  {formatTime(b.created_at)} · ref {b.id.slice(0, 8)}
                </span>
              </div>
              {b.status !== 'cancelled' && (
                <button
                  className="btn btn--sm btn--danger"
                  disabled={cancellingId !== null}
                  onClick={() => void cancel(b.id)}
                >
                  {cancellingId === b.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="row row--end">
          <button
            className="btn btn--ghost"
            disabled={loading}
            onClick={() => activeEmail && void fetchPage(apiKey, activeEmail, cursor, true)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '')

  function saveApiKey(key: string) {
    if (key === '') {
      localStorage.removeItem(API_KEY_STORAGE)
    } else {
      localStorage.setItem(API_KEY_STORAGE, key)
    }
    setApiKey(key)
  }

  const [bookingsEmail, setBookingsEmail] = useState<string | null>(() =>
    localStorage.getItem(EMAIL_STORAGE),
  )

  return (
    <main className="page">
      <header className="page-head">
        <h1>MeddSlot</h1>
        <p>Book and manage clinic appointments.</p>
      </header>

      <ApiKeyPanel apiKey={apiKey} onChange={saveApiKey} />
      <SlotsPanel
        apiKey={apiKey}
        onBooked={(email) => {
          localStorage.setItem(EMAIL_STORAGE, email)
          setBookingsEmail(email)
        }}
      />
      <BookingsPanel apiKey={apiKey} lookupEmail={bookingsEmail} />

      <footer className="page-foot">
        Powered by the MeddSlot API · slot-web
      </footer>
    </main>
  )
}
