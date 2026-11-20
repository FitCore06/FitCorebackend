export type CheckInSessionDto = {
  id: string;
  token: string;
  /** HMAC-signed payload for QR scanners */
  qrPayload: string;
  branchName: string;
  checkInAt: string;
  checkOutAt: string | null;
};

export type AttendanceRowDto = {
  id: string;
  memberName: string;
  memberEmail: string;
  checkInAt: string;
  checkOutAt: string | null;
  branch: string;
};

export type MemberAttendanceHistoryDto = {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string;
  branch: string;
};

export type MemberAttendanceStatsDto = {
  streakDays: number;
  visitsThisMonth: number;
  streakBroken?: boolean;
  breakMessage?: string | null;
  missedTrainingDays?: number;
};

export type GymStreakLeaderboardRowDto = {
  rank: number;
  userId: string;
  name: string;
  streakDays: number;
  hasProfilePhoto: boolean;
  isYou: boolean;
};

export type GymStreakLeaderboardDto = {
  rows: GymStreakLeaderboardRowDto[];
  you: {
    rank: number | null;
    userId: string;
    name: string;
    streakDays: number;
    hasProfilePhoto: boolean;
    streakBroken: boolean;
    breakMessage: string | null;
    missedTrainingDays: number;
  };
};