import { getStore } from '@netlify/blobs'

// Server-only: event photo bytes live in Netlify Blobs, metadata in the event_photos table
export const photoStore = () => getStore('event-photos')
