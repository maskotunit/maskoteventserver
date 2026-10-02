// Shapes shared by the cloud API and the offline gate device

export type Ticket = {
  ticketHash: string
  holderName: string
  status: 'unused' | 'used'
  scannedAt: string
}

export type Team = { teamId: string; teamName: string }

export type Role = 'Player' | 'Artist' | 'Staff'

export type Person = {
  userId: string
  fullName: string
  role: Role
  teamId: string | null
  faceVector: number[]
  photo: string | null
}

export type Performance = {
  perfId: string
  userId: string
  stageName: string
  startTime: string
  endTime: string
}

export type SyncPackage = {
  generatedAt: string
  tickets: Ticket[]
  teams: Team[]
  users: Person[]
  performances: Performance[]
}

export type ScanKind = 'ticket' | 'team' | 'face'

export type ScanOutcome =
  | 'granted'
  | 'duplicate'
  | 'fraud'
  | 'team_valid'
  | 'team_unknown'
  | 'face_match'
  | 'face_unknown'

export type ScanEvent = {
  clientId: string
  deviceId: string
  kind: ScanKind
  input: string
  outcome: ScanOutcome
  detail: string
  scannedAt: string
}

export type SyncUpPayload = {
  scannedTickets: { ticketHash: string; scannedAt: string }[]
  events: ScanEvent[]
}

export type SyncUpResult = {
  success: true
  ticketsMarkedUsed: number
  ticketConflicts: string[]
  eventsStored: number
}

// Guest page

export type GuestPhoto = {
  photoId: string
  caption: string
  url: string
  createdAt: string
  likes: number
  ratingCount: number
  ratingAvg: number | null
  // The requesting guest's own reaction
  mine: { liked: boolean; stars: number | null }
}

export type ScheduleSlot = {
  perfId: string
  artistName: string
  stageName: string
  startTime: string
  endTime: string
}

export type DeleteKind = 'ticket' | 'team' | 'person' | 'performance' | 'scan' | 'all_scans' | 'photo'
