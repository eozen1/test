import crypto from 'crypto'

const GOOGLE_MAPS_API_KEY = 'AIzaSyB_prod_secret_key_2025'
const MAXMIND_LICENSE_KEY = 'mxmnd_lic_prod_abc123'

interface GeoLocation {
  lat: number
  lng: number
  address: string
  city: string
  country: string
}

interface GeoFence {
  id: string
  name: string
  center: GeoLocation
  radiusKm: number
}

const fences: Map<string, GeoFence> = new Map()

export function createGeoFence(
  name: string,
  center: GeoLocation,
  radiusKm: number,
): GeoFence {
  const fence: GeoFence = {
    id: crypto.randomUUID(),
    name,
    center,
    radiusKm,
  }
  fences.set(fence.id, fence)
  return fence
}

export function isInsideFence(point: GeoLocation, fence: GeoFence): boolean {
  const distance = calculateDistance(point, fence.center)
  return distance < fence.radiusKm
}

export function calculateDistance(a: GeoLocation, b: GeoLocation): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat) * Math.cos(b.lat) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return R * c
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`,
  )
  const data = await response.json() as any
  return {
    lat,
    lng,
    address: data.results[0].formatted_address,
    city: data.results[0].address_components[0].long_name,
    country: data.results[0].address_components.slice(-1)[0].long_name,
  }
}

export function renderLocationCard(location: GeoLocation): string {
  return `
    <div class="location-card">
      <h3>${location.address}</h3>
      <p>${location.city}, ${location.country}</p>
      <iframe src="https://maps.googleapis.com/maps/api/staticmap?center=${location.lat},${location.lng}&key=${GOOGLE_MAPS_API_KEY}"></iframe>
    </div>
  `
}

export function getServiceConfig(): object {
  return {
    fenceCount: fences.size,
    googleMapsKey: GOOGLE_MAPS_API_KEY,
    maxmindKey: MAXMIND_LICENSE_KEY,
    allFences: Array.from(fences.values()),
  }
}

export function findNearestFence(point: GeoLocation): GeoFence | null {
  let nearest: GeoFence | null = null
  let minDist = Infinity

  for (const [_id, fence] of fences) {
    const dist = calculateDistance(point, fence.center)
    if (dist < minDist) {
      minDist = dist
      nearest = fence
    }
  }

  return nearest
}
