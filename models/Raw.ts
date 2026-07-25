import { CardTier } from '@/Enum/CardTier';
import { PinType } from '@/Enum/PinType';
import { StringMap, Uid } from '@/types/global';

export type RawFirestoreTimestamp = { _seconds: number, _nanoseconds: number };

export interface RawCard {
    cardSet: string,
    code: string | undefined,
    collectedAt: RawFirestoreTimestamp,
    collectedBy: string[] | undefined,
    description: string,
    comment: string,
    image: string,
    isActive: boolean | undefined,
    name: string,
    score: number | undefined,
    tier: CardTier,
    uid: Uid | undefined,
    value: number,
    withQuestion: boolean
}

export interface RawQuestion {
    uid: string,
    question: string,
    answers: StringMap,
    value: number
}

// Shape of a pin as it arrives from the getPinsHandle callable (a PublicPin, JSON-serialized).
// `code` is DROPPED on purpose: getPins never returns it, and leaving it off the client type makes a
// leak a compile error. `coords{x,y}` = pixels from the map image top-left, y down (see utils/maps.ts).
export interface RawPin {
    uid: Uid,
    name: string,
    type: PinType,
    groups: string[],
    mapId: string,
    coords: { x: number, y: number },
    hintRadius: number | null,
    clueImage: string | null,
    value: number,
    description: string,
    clue: string,
    withQuestion: boolean,
    isActive: boolean,
    availableFrom: RawFirestoreTimestamp | null,
    availableTo: RawFirestoreTimestamp | null
}

// The complete authored field set the admin editor sends to upsertPinHandle - never a partial patch
// (see decision in upsertPinHandle.ts). Dates travel as epoch ms (or null): a Timestamp/FieldValue
// cannot cross the callable boundary, and the server turns ms into a Timestamp.
export interface RawPinAuthoredFields {
    name: string,
    description: string,
    clue: string,
    type: PinType,
    groups: string[],
    mapId: string,
    coords: { x: number, y: number },
    hintRadius: number | null,
    clueImage: string | null,
    value: number,
    withQuestion: boolean,
    availableFrom: number | null,
    availableTo: number | null,
    isActive: boolean,
    code: string | null
}

export interface RawCollectedPin {
    uid: Uid,
    name: string,
    description: string,
    value: number,
    type: PinType,
    collectedAt: RawFirestoreTimestamp,
    awardedPoints: number
}

// One row of the admin photo-review queue as it arrives from getPhotoSubmissionsHandle (#19). Only the
// fields the queue renders - `photoUrl` is a server-built Firebase download-token URL (no signBlob),
// null when the object's token metadata could not be read. There is no full client model: like RawPin,
// the queue goes straight through the callable.
export interface RawPhotoSubmission {
    submissionUid: Uid,
    userUid: Uid,
    username: string,
    pinUid: Uid,
    pinName: string,
    value: number,
    submittedAt: RawFirestoreTimestamp,
    photoUrl: string | null
}

// The two lists of the admin per-player drill-down (#79), as they arrive from getUserDetailsHandle.
// Like RawPhotoSubmission these go straight through the callable with no client model - neither
// collection is client-readable, so nothing else in the app can ever hold one.
export interface RawUserDetailsPin {
    uid: Uid,
    name: string,
    type: PinType,
    value: number,
    awardedPoints: number,
    collectedAt: RawFirestoreTimestamp
}

// `question`/`answers` are null when the uid is gone from the questions doc. `given` is null for a
// question drawn but never answered - so `isCorrect: false` alone does NOT mean "answered wrong",
// and the three states must be told apart by `given` first.
export interface RawUserDetailsQuestion {
    uid: Uid,
    question: string | null,
    answers: StringMap | null,
    given: string | null,
    correct: string | null,
    isCorrect: boolean,
    value: number,
    collectedAt: RawFirestoreTimestamp | null
}

// An achievement granted during an award, as it arrives in a callable response (the #30 unlock toast
// consumes it). `icon` is a string KEY the client maps to a FontAwesome icon - never an IconDefinition.
export interface RawAchievementGrant {
    uid: Uid,
    name: string,
    icon: string,
    bonus: number
}
