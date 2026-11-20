export const SEED_WORKOUT_TEMPLATES = [
  {
    builtInKey: 'wkt-upper',
    name: 'Upper body strength',
    goal: 'Hypertrophy · push/pull',
    daysPerWeek: 3,
    exercises: [
      { id: 'e1', name: 'Barbell squat', sets: 4, reps: '10', restSec: 90 },
      { id: 'e2', name: 'Bench press', sets: 4, reps: '8', restSec: 120 },
      { id: 'e3', name: 'Lat pulldown', sets: 3, reps: '12', restSec: 60 },
    ],
  },
  {
    builtInKey: 'wkt-lower',
    name: 'Lower + core',
    goal: 'Leg day',
    daysPerWeek: 2,
    exercises: [
      { id: 'e4', name: 'Romanian deadlift', sets: 3, reps: '12', restSec: 90 },
      { id: 'e5', name: 'Leg press', sets: 4, reps: '12', restSec: 60 },
    ],
  },
  {
    builtInKey: 'wkt-intro',
    name: 'Trial intro circuit',
    goal: 'New member onboarding',
    daysPerWeek: 2,
    exercises: [
      { id: 'e6', name: 'Treadmill warm-up', sets: 1, reps: '8 min', restSec: 0 },
      { id: 'e7', name: 'Machine circuit', sets: 3, reps: 'guided', restSec: 60 },
    ],
  },
] as const;

export const SEED_DIET_TEMPLATES = [
  {
    builtInKey: 'diet-lean',
    name: 'Lean muscle 2200',
    goal: 'Lean bulk · strength phase',
    dailyCalories: 2200,
    proteinG: 150,
    carbsG: 220,
    fatG: 65,
    meals: [
      {
        id: 'm1',
        mealType: 'breakfast',
        details: 'Oats + whey + banana + peanuts',
        calories: 520,
        proteinG: 35,
      },
      {
        id: 'm2',
        mealType: 'mid_morning',
        details: 'Greek yogurt + almonds',
        calories: 280,
        proteinG: 18,
      },
      {
        id: 'm3',
        mealType: 'lunch',
        details: 'Roti (2) + dal + grilled chicken + salad',
        calories: 620,
        proteinG: 42,
      },
      {
        id: 'm4',
        mealType: 'dinner',
        details: 'Fish curry + rice + veggies',
        calories: 580,
        proteinG: 40,
      },
    ],
  },
  {
    builtInKey: 'diet-cut',
    name: 'Cut 1800',
    goal: 'Fat loss · high protein',
    dailyCalories: 1800,
    proteinG: 140,
    carbsG: 150,
    fatG: 55,
    meals: [
      {
        id: 'm5',
        mealType: 'breakfast',
        details: 'Egg whites + toast + fruit',
        calories: 380,
        proteinG: 28,
      },
      {
        id: 'm6',
        mealType: 'lunch',
        details: 'Chicken salad + olive oil dressing',
        calories: 450,
        proteinG: 40,
      },
      {
        id: 'm7',
        mealType: 'dinner',
        details: 'Paneer tikka + sautéed vegetables',
        calories: 520,
        proteinG: 32,
      },
    ],
  },
] as const;