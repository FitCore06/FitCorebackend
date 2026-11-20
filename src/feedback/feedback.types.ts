export type TrainerFeedbackDto = {
  id: string;
  memberEmail: string;
  memberName: string;
  trainerId: string;
  trainerName: string;
  rating: number;
  feedback: string;
  createdAt: string;
};

export type TrainerRatingAverageDto = {
  trainerId: string;
  trainerEmail: string;
  average: number;
  count: number;
};

export type MemberIssueCategory = 'gym' | 'equipment' | 'staff' | 'other';
export type MemberIssueStatus = 'open' | 'in-progress' | 'resolved';

export type MemberIssueDto = {
  id: string;
  memberEmail: string;
  memberName: string;
  category: MemberIssueCategory;
  subject: string;
  description: string;
  equipmentName?: string;
  status: MemberIssueStatus;
  createdAt: string;
};