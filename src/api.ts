// Typed client for the MeddSlot API (slot-api).
//
// Every endpoint requires an `X-API-Key` header, and POST /bookings
// supports an `Idempotency-Key` header so retried submissions never
// double-book a slot.

const BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface Slot {
  id: string
  provider: string
  start: string
  end: string
  available: boolean
}

export interface Booking {
  id: string
  slot_id: string
  name: string
  email: string
  status: 'confirmed' | 'cancelled' | (string & {})
  created_at: string
}

export interface BookingPage {
  bookings: Booking[]
  next_cursor: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function messageFor(status: number, retryAfter?: number): string {
  switch (status) {
    case 0:
      return `Cannot reach the API at ${BASE_URL} — is slot-api running?`
    case 400:
      return 'This slot has already started.'
    case 401:
      return 'Invalid or missing API key.'
    case 404:
      return 'Not found — it may have been removed.'
    case 409:
      return 'This slot was just booked by someone else.'
    case 422:
      return 'The request was invalid. Check the fields and try again.'
    case 429:
      return `Too many attempts — try again in ${retryAfter ?? 'a few'} second${retryAfter === 1 ? '' : 's'}.`
    default:
      return `Request failed with status ${status}.`
  }
}

async function request<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'X-API-Key': apiKey,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, messageFor(0))
  }

  if (!response.ok) {
    const retryHeader = response.headers.get('Retry-After')
    const retryAfter = retryHeader === null ? undefined : Number(retryHeader)
    throw new ApiError(response.status, messageFor(response.status, retryAfter), retryAfter)
  }

  return (await response.json()) as T
}

export function listSlots(apiKey: string, provider?: string): Promise<Slot[]> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : ''
  return request<{ slots: Slot[] }>(apiKey, `/slots${query}`).then((r) => r.slots)
}

export interface CreateBookingInput {
  slotId: string
  name: string
  email: string
}

export function createBooking(
  apiKey: string,
  { slotId, name, email }: CreateBookingInput,
): Promise<Booking> {
  return request<Booking>(apiKey, '/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ slot_id: slotId, name, email }),
  })
}

export function listBookings(
  apiKey: string,
  email: string,
  cursor?: string,
  limit = 10,
): Promise<BookingPage> {
  const params = new URLSearchParams({ email, limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request<BookingPage>(apiKey, `/bookings?${params.toString()}`)
}

export function cancelBooking(apiKey: string, bookingId: string): Promise<Booking> {
  return request<Booking>(apiKey, `/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'DELETE',
  })
}

export function getBooking(apiKey: string, bookingId: string): Promise<Booking> {
  return request<Booking>(apiKey, `/bookings/${encodeURIComponent(bookingId)}`)
}
