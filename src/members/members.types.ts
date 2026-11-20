export type GymMemberDto = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  hasProfilePhoto: boolean;
  status: 'active' | 'trial' | 'frozen' | 'expired' | 'unassigned';
  plan: string;
  trainerName: string | null;
  assignmentId: string | null;
};