export type SessionTaskRow = {
  name: string;
  points: number;
  maxPoints: number;
  edited: boolean;
};

export type SessionStudentGrade = {
  studentNumber: string;
  studentName: string;
  finalGrade: string | null;
  finalPoints: number | null;
  percentage: number | null;
  aiResponseFeedback: string;
  teacherResponse?: string | null;
  tasks: SessionTaskRow[];
  verified: boolean;
  confidenceScore: number;
  gradeId?: string;
  groupName?: string | null;
  variantName?: string | null;
  variantMissing?: boolean;
  maxPoints?: number;
};

export type SessionSummaryData = {
  sessionName: string;
  className: string;
  sessionDate: string;
  maxPoints: number;
  thresholdName?: string | null;
  groupNames?: string[];
  variantDetection?: boolean;
  variantNames?: string[];
  grades: SessionStudentGrade[];
};
