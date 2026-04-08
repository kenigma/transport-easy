'use client'

import { useState, useEffect } from 'react'

interface Coords {
  lat: number
  lng: number
  accuracy: number
}

type GeolocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; coords: Coords }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string }

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' })

  const request = () => {
    if (!navigator.geolocation) {
      setState({ status: 'error', message: 'Geolocation is not supported by your browser.' })
      return
    }
    setState({ status: 'requesting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'granted',
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied', message: 'Location access was denied. Please enable it in your browser settings.' })
        } else {
          setState({ status: 'error', message: `Could not get location: ${err.message}` })
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    )
  }

  // Auto-request on mount
  useEffect(() => {
    request()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, retry: request }
}
