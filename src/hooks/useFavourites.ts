'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'transport-easy:favourites'

export function useFavourites() {
  const [favourites, setFavourites] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setFavourites(JSON.parse(raw))
    } catch {
      // localStorage not available
    }
  }, [])

  const save = (ids: string[]) => {
    setFavourites(ids)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }

  const add = (stopId: string) => {
    if (!favourites.includes(stopId)) save([...favourites, stopId])
  }

  const remove = (stopId: string) => {
    save(favourites.filter((id) => id !== stopId))
  }

  const toggle = (stopId: string) => {
    if (favourites.includes(stopId)) remove(stopId)
    else add(stopId)
  }

  return { favourites, add, remove, toggle, isFavourite: (id: string) => favourites.includes(id) }
}
