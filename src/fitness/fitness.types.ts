export type WorkoutExerciseDto = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSec: number;
};

export type WorkoutTemplateDto = {
  id: string;
  builtIn: boolean;
  name: string;
  goal: string;
  daysPerWeek: number;
  exercises: WorkoutExerciseDto[];
};

export type DietMealDto = {
  id: string;
  mealType: string;
  details: string;
  calories: number;
  proteinG: number;
};

export type DietTemplateDto = {
  id: string;
  builtIn: boolean;
  name: string;
  goal: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: DietMealDto[];
};

export type WeeklyWorkoutPlanDto = {
  id: string;
  name: string;
  goal: string;
  days: {
    dayId: string;
    restDay: boolean;
    title: string;
    exercises: WorkoutExerciseDto[];
  }[];
  updatedAt: string;
  source: 'member' | 'trainer' | 'default';
  trainerName?: string;
};

export type MemberWorkoutPlanResponse = {
  plan: WeeklyWorkoutPlanDto;
  kind: 'trainer' | 'member' | 'default';
};

export type WorkoutSetLogDto = {
  exerciseId: string;
  setNumber: number;
  weightKg?: number;
};

export type MemberWorkoutStatusDto = {
  memberEmail: string;
  dayId: string;
  dayLabel: string;
  planName: string;
  restDay: boolean;
  exercises: {
    id: string;
    name: string;
    targetReps: string;
    restSec: number;
    setsTotal: number;
    setsDone: number;
    setDone: Record<number, boolean>;
    setWeight: Record<number, number | undefined>;
  }[];
  completed: number;
  total: number;
  percent: number;
};

export type MemberDietStatusDto = {
  memberEmail: string;
  planName: string;
  mealsTotal: number;
  mealsDone: number;
  percent: number;
  meals: { id: string; label: string; done: boolean }[];
};