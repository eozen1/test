/**
 * Travel booking saga orchestrator.
 *
 * Coordinates between 6 services to complete a booking:
 *   1. AvailabilityService - checks flight/hotel availability
 *   2. PricingService - calculates total with taxes/fees
 *   3. PaymentGateway - processes payment authorization
 *   4. ReservationService - creates confirmed reservations
 *   5. LoyaltyService - awards/redeems loyalty points
 *   6. NotificationService - sends confirmations via email/SMS
 *
 * Supports concurrent operations where possible:
 *   - Flight + hotel availability checked in parallel
 *   - Loyalty + notification run concurrently after confirmation
 *   - Compensating transactions on failure (refund, cancel reservation)
 */

export interface BookingRequest {
  customerId: string
  flightId: string
  hotelId: string
  checkIn: string
  checkOut: string
  passengers: number
  rooms: number
  loyaltyNumber?: string
  promoCode?: string
  paymentToken: string
  notifyEmail: string
  notifySms?: string
}

export interface BookingResult {
  bookingId: string
  status: 'confirmed' | 'failed' | 'partially_confirmed'
  flightReservationId?: string
  hotelReservationId?: string
  paymentId?: string
  totalCharged: number
  loyaltyPointsEarned?: number
  errors: string[]
}

interface AvailabilityResult {
  available: boolean
  remainingCapacity: number
  price: number
  currency: string
}

interface PricingBreakdown {
  basePrice: number
  taxes: number
  fees: number
  discount: number
  total: number
  currency: string
}

interface PaymentAuth {
  authId: string
  status: 'authorized' | 'declined' | 'error'
  amount: number
}

// ─── Service Clients ─────────────────────────────────────

class AvailabilityService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async checkFlightAvailability(
    flightId: string,
    passengers: number,
    date: string
  ): Promise<AvailabilityResult> {
    const res = await fetch(`${this.baseUrl}/flights/${flightId}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passengers, date }),
    })
    if (!res.ok) throw new Error(`Flight availability check failed: ${res.status}`)
    return res.json() as Promise<AvailabilityResult>
  }

  async checkHotelAvailability(
    hotelId: string,
    rooms: number,
    checkIn: string,
    checkOut: string
  ): Promise<AvailabilityResult> {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms, checkIn, checkOut }),
    })
    if (!res.ok) throw new Error(`Hotel availability check failed: ${res.status}`)
    return res.json() as Promise<AvailabilityResult>
  }
}

class PricingService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async calculateTotal(
    flightPrice: number,
    hotelPrice: number,
    promoCode?: string
  ): Promise<PricingBreakdown> {
    const res = await fetch(`${this.baseUrl}/pricing/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightPrice, hotelPrice, promoCode }),
    })
    if (!res.ok) throw new Error(`Pricing calculation failed: ${res.status}`)
    return res.json() as Promise<PricingBreakdown>
  }
}

class PaymentGateway {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async authorize(token: string, amount: number, currency: string): Promise<PaymentAuth> {
    const res = await fetch(`${this.baseUrl}/payments/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, amount, currency }),
    })
    if (!res.ok) throw new Error(`Payment authorization failed: ${res.status}`)
    return res.json() as Promise<PaymentAuth>
  }

  async capture(authId: string): Promise<{ paymentId: string }> {
    const res = await fetch(`${this.baseUrl}/payments/${authId}/capture`, { method: 'POST' })
    if (!res.ok) throw new Error(`Payment capture failed: ${res.status}`)
    return res.json() as Promise<{ paymentId: string }>
  }

  async refund(paymentId: string, amount: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    if (!res.ok) throw new Error(`Refund failed: ${res.status}`)
  }
}

class ReservationService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async createFlightReservation(
    flightId: string,
    customerId: string,
    passengers: number,
    paymentId: string
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/reservations/flights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightId, customerId, passengers, paymentId }),
    })
    if (!res.ok) throw new Error(`Flight reservation failed: ${res.status}`)
    const data = (await res.json()) as { reservationId: string }
    return data.reservationId
  }

  async createHotelReservation(
    hotelId: string,
    customerId: string,
    rooms: number,
    checkIn: string,
    checkOut: string,
    paymentId: string
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/reservations/hotels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotelId, customerId, rooms, checkIn, checkOut, paymentId }),
    })
    if (!res.ok) throw new Error(`Hotel reservation failed: ${res.status}`)
    const data = (await res.json()) as { reservationId: string }
    return data.reservationId
  }

  async cancelReservation(reservationId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/reservations/${reservationId}/cancel`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(`Cancellation failed: ${res.status}`)
  }
}

class LoyaltyService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async awardPoints(
    loyaltyNumber: string,
    amount: number,
    bookingId: string
  ): Promise<number> {
    const res = await fetch(`${this.baseUrl}/loyalty/${loyaltyNumber}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, bookingId }),
    })
    if (!res.ok) throw new Error(`Loyalty points award failed: ${res.status}`)
    const data = (await res.json()) as { pointsEarned: number }
    return data.pointsEarned
  }

  async redeemPoints(loyaltyNumber: string, points: number): Promise<number> {
    const res = await fetch(`${this.baseUrl}/loyalty/${loyaltyNumber}/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    })
    if (!res.ok) throw new Error(`Loyalty points redemption failed: ${res.status}`)
    const data = (await res.json()) as { discountAmount: number }
    return data.discountAmount
  }
}

class NotificationService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async sendConfirmationEmail(
    email: string,
    bookingId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await fetch(`${this.baseUrl}/notifications/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, template: 'booking-confirmation', data: { bookingId, ...details } }),
    })
  }

  async sendConfirmationSms(
    phone: string,
    bookingId: string
  ): Promise<void> {
    await fetch(`${this.baseUrl}/notifications/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message: `Booking ${bookingId} confirmed!` }),
    })
  }
}

// ─── Saga Orchestrator ───────────────────────────────────

export class BookingSaga {
  private availability: AvailabilityService
  private pricing: PricingService
  private payment: PaymentGateway
  private reservation: ReservationService
  private loyalty: LoyaltyService
  private notification: NotificationService

  constructor(serviceUrls: {
    availability: string
    pricing: string
    payment: string
    reservation: string
    loyalty: string
    notification: string
  }) {
    this.availability = new AvailabilityService(serviceUrls.availability)
    this.pricing = new PricingService(serviceUrls.pricing)
    this.payment = new PaymentGateway(serviceUrls.payment)
    this.reservation = new ReservationService(serviceUrls.reservation)
    this.loyalty = new LoyaltyService(serviceUrls.loyalty)
    this.notification = new NotificationService(serviceUrls.notification)
  }

  async execute(request: BookingRequest): Promise<BookingResult> {
    const errors: string[] = []
    const bookingId = crypto.randomUUID()

    // ── Step 1: Check availability (flight + hotel in parallel) ──
    const [flightAvail, hotelAvail] = await Promise.all([
      this.availability.checkFlightAvailability(
        request.flightId,
        request.passengers,
        request.checkIn
      ),
      this.availability.checkHotelAvailability(
        request.hotelId,
        request.rooms,
        request.checkIn,
        request.checkOut
      ),
    ])

    if (!flightAvail.available) {
      return { bookingId, status: 'failed', totalCharged: 0, errors: ['Flight not available'] }
    }
    if (!hotelAvail.available) {
      return { bookingId, status: 'failed', totalCharged: 0, errors: ['Hotel not available'] }
    }

    // ── Step 2: Calculate pricing ──
    const pricing = await this.pricing.calculateTotal(
      flightAvail.price,
      hotelAvail.price,
      request.promoCode
    )

    // ── Step 3: Authorize payment ──
    const auth = await this.payment.authorize(
      request.paymentToken,
      pricing.total,
      pricing.currency
    )

    if (auth.status !== 'authorized') {
      return {
        bookingId,
        status: 'failed',
        totalCharged: 0,
        errors: [`Payment ${auth.status}: authorization failed`],
      }
    }

    // ── Step 4: Capture payment ──
    const { paymentId } = await this.payment.capture(auth.authId)

    // ── Step 5: Create reservations (flight + hotel in parallel) ──
    let flightReservationId: string | undefined
    let hotelReservationId: string | undefined

    try {
      ;[flightReservationId, hotelReservationId] = await Promise.all([
        this.reservation.createFlightReservation(
          request.flightId,
          request.customerId,
          request.passengers,
          paymentId
        ),
        this.reservation.createHotelReservation(
          request.hotelId,
          request.customerId,
          request.rooms,
          request.checkIn,
          request.checkOut,
          paymentId
        ),
      ])
    } catch (err) {
      // Compensating transaction: refund payment
      errors.push(`Reservation failed: ${(err as Error).message}`)
      await this.payment.refund(paymentId, pricing.total)

      // Cancel any reservation that succeeded
      if (flightReservationId) {
        await this.reservation.cancelReservation(flightReservationId).catch(() => {})
      }
      if (hotelReservationId) {
        await this.reservation.cancelReservation(hotelReservationId).catch(() => {})
      }

      return { bookingId, status: 'failed', totalCharged: 0, errors }
    }

    // ── Step 6: Post-confirmation (loyalty + notifications in parallel) ──
    let loyaltyPointsEarned: number | undefined

    const postConfirmTasks: Promise<void>[] = []

    if (request.loyaltyNumber) {
      postConfirmTasks.push(
        this.loyalty
          .awardPoints(request.loyaltyNumber, pricing.total, bookingId)
          .then((points) => {
            loyaltyPointsEarned = points
          })
          .catch((err) => {
            errors.push(`Loyalty points failed: ${(err as Error).message}`)
          })
      )
    }

    postConfirmTasks.push(
      this.notification
        .sendConfirmationEmail(request.notifyEmail, bookingId, {
          flightId: request.flightId,
          hotelId: request.hotelId,
          total: pricing.total,
          checkIn: request.checkIn,
          checkOut: request.checkOut,
        })
        .catch((err) => {
          errors.push(`Email notification failed: ${(err as Error).message}`)
        })
    )

    if (request.notifySms) {
      postConfirmTasks.push(
        this.notification
          .sendConfirmationSms(request.notifySms, bookingId)
          .catch((err) => {
            errors.push(`SMS notification failed: ${(err as Error).message}`)
          })
      )
    }

    await Promise.allSettled(postConfirmTasks)

    return {
      bookingId,
      status: errors.length > 0 ? 'partially_confirmed' : 'confirmed',
      flightReservationId,
      hotelReservationId,
      paymentId,
      totalCharged: pricing.total,
      loyaltyPointsEarned,
      errors,
    }
  }
}
