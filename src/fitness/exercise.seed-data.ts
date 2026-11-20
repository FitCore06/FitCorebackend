export type ExerciseSeedItem = {
  name: string;
  slug: string;
  description: string;
  category: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  instructions: string[];
};

/**
 * Standard Global Exercise Catalog (~40 core compound and isolation exercises across all muscle groups)
 * License / Attribution: CC0 / Public Domain clean-room compilation.
 * No copyrighted media or proprietary progression code used.
 */
export const GLOBAL_EXERCISE_SEEDS: ExerciseSeedItem[] = [
  // CHEST
  {
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    description: 'A classic horizontal pressing movement targeting the pectoral muscles, anterior deltoids, and triceps.',
    category: 'strength',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'barbell',
    instructions: [
      'Lie back on a flat bench with eyes under the barbell.',
      'Grip the bar slightly wider than shoulder-width with wrists straight.',
      'Unrack the bar and stabilize it over your chest with arms fully extended.',
      'Lower the bar with control to your mid-chest while tucking elbows slightly.',
      'Press the bar upward explosively until arms are extended, keeping feet flat on the floor.',
    ],
  },
  {
    name: 'Incline Dumbbell Press',
    slug: 'incline-dumbbell-press',
    description: 'Upper chest focused pressing movement utilizing an incline bench angle.',
    category: 'strength',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
    instructions: [
      'Set an incline bench to approximately 30 to 45 degrees.',
      'Sit back with dumbbells resting on thighs, then kick them up to shoulder level.',
      'Press dumbbells upward until arms are straight without clanking them together.',
      'Lower dumbbells slowly until you feel a comfortable stretch across the upper chest.',
    ],
  },
  {
    name: 'Cable Chest Fly',
    slug: 'cable-chest-fly',
    description: 'Isolation exercise providing continuous tension across the pectoral muscles through adduction.',
    category: 'hypertrophy',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'cable',
    instructions: [
      'Set cable pulleys at chest height with single handles attached.',
      'Step forward into a staggered stance with a slight forward torso lean.',
      'Keep a slight bend in your elbows and bring hands together in a wide hugging motion.',
      'Squeeze chest at peak contraction, then slowly return to the starting stretch.',
    ],
  },
  {
    name: 'Push-Up',
    slug: 'push-up',
    description: 'Fundamental bodyweight upper body pushing exercise.',
    category: 'endurance',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders', 'core'],
    equipment: 'bodyweight',
    instructions: [
      'Place hands on the floor slightly wider than shoulder-width with body in a straight plank.',
      'Brace core and lower chest until it nearly touches the floor.',
      'Push firmly through palms to return to full lockout.',
    ],
  },

  // BACK
  {
    name: 'Barbell Deadlift',
    slug: 'barbell-deadlift',
    description: 'Essential posterior chain compound movement building overall pulling strength and spinal stability.',
    category: 'strength',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes', 'hamstrings', 'forearms'],
    equipment: 'barbell',
    instructions: [
      'Stand with feet hip-width apart and mid-foot directly under the bar.',
      'Hinge at hips, bend knees slightly, and grip the bar just outside your legs.',
      'Flatten back, engage lats, and pull slack out of the barbell.',
      'Drive through your heels and stand tall by extending hips and knees simultaneously.',
    ],
  },
  {
    name: 'Bent-Over Barbell Row',
    slug: 'bent-over-barbell-row',
    description: 'Horizontal pulling exercise strengthening the latissimus dorsi, rhomboids, and rear deltoids.',
    category: 'strength',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'barbell',
    instructions: [
      'Hinge forward at hips until torso is roughly 45 degrees to the floor.',
      'Grip barbell overhand slightly wider than shoulder-width.',
      'Pull barbell toward lower ribcage by driving elbows toward the ceiling.',
      'Lower bar with control while maintaining a rigid spine.',
    ],
  },
  {
    name: 'Lat Pulldown',
    slug: 'lat-pulldown',
    description: 'Vertical pulling machine exercise developing back width and lat muscle activation.',
    category: 'strength',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'cable',
    instructions: [
      'Sit comfortably with thighs secured under roller pads.',
      'Grip wide bar with an overhand grip slightly outside shoulder width.',
      'Pull bar down to upper chest while driving elbows down and back.',
      'Control the ascent until arms and lats are fully stretched.',
    ],
  },
  {
    name: 'Pull-Up',
    slug: 'pull-up',
    description: 'Classic vertical bodyweight pull developing back and arm strength.',
    category: 'strength',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'core'],
    equipment: 'bodyweight',
    instructions: [
      'Grip pull-up bar with overhand grip slightly wider than shoulders.',
      'Hang with arms fully extended and engage shoulder blades.',
      'Pull chest up toward bar until chin clears the bar height.',
      'Lower slowly under control to full hang.',
    ],
  },
  {
    name: 'Seated Cable Row',
    slug: 'seated-cable-row',
    description: 'Mid-back horizontal row providing steady cable resistance.',
    category: 'strength',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'cable',
    instructions: [
      'Sit at row station with feet braced and knees slightly bent.',
      'Hold V-bar attachment, keep chest upright, and pull handle toward navel.',
      'Squeeze shoulder blades together, then return handle under control.',
    ],
  },

  // SHOULDERS
  {
    name: 'Overhead Barbell Press',
    slug: 'overhead-barbell-press',
    description: 'Strict standing barbell press developing overhead strength and shoulder stability.',
    category: 'strength',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps', 'core'],
    equipment: 'barbell',
    instructions: [
      'Stand tall with bar racked at clavicle height and hands just outside shoulders.',
      'Brace glutes and core, then press bar straight up overhead.',
      'Lock out arms with head nudging slightly forward at the peak.',
      'Lower bar with control back to starting collarbone position.',
    ],
  },
  {
    name: 'Dumbbell Lateral Raise',
    slug: 'dumbbell-lateral-raise',
    description: 'Isolation exercise targeting lateral deltoid heads for shoulder width.',
    category: 'hypertrophy',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['traps'],
    equipment: 'dumbbell',
    instructions: [
      'Hold dumbbells at sides with a slight elbow bend.',
      'Raise dumbbells out to sides until parallel to the floor, leading with elbows.',
      'Pause briefly at the top, then lower smoothly.',
    ],
  },
  {
    name: 'Face Pull',
    slug: 'face-pull',
    description: 'Cable exercise targeting rear deltoids, external rotators, and postural stabilizers.',
    category: 'mobility',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back', 'traps'],
    equipment: 'cable',
    instructions: [
      'Attach rope to cable pulley set at eye height.',
      'Pull rope towards nose, separating hands and rotating wrists back.',
      'Squeeze rear deltoids at peak contraction, then return under tension.',
    ],
  },

  // LEGS - QUADS & HAMSTRINGS & GLUTES
  {
    name: 'Barbell Back Squat',
    slug: 'barbell-back-squat',
    description: 'Foundational lower body compound movement for quadriceps, glutes, and core development.',
    category: 'strength',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    equipment: 'barbell',
    instructions: [
      'Rest barbell securely across upper trapezius muscles.',
      'Set feet shoulder-width apart with toes pointed slightly outward.',
      'Hinge hips and bend knees, lowering until thighs reach at least parallel with floor.',
      'Drive up through whole foot while keeping chest elevated.',
    ],
  },
  {
    name: 'Leg Press',
    slug: 'leg-press',
    description: 'Guided lower body pressing machine allowing heavy quadriceps loading with back support.',
    category: 'hypertrophy',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'machine',
    instructions: [
      'Place feet shoulder-width on platform with lower back flat against backrest.',
      'Release safety handles and lower platform until knees reach 90 degrees.',
      'Press through feet to return to starting position without locking knees.',
    ],
  },
  {
    name: 'Romanian Deadlift',
    slug: 'romanian-deadlift',
    description: 'Hip-hinge variation placing intense eccentric loading on hamstrings and glutes.',
    category: 'hypertrophy',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'barbell',
    instructions: [
      'Hold barbell in front of thighs with slight bend in knees.',
      'Push hips backward while keeping barbell gliding close along shins.',
      'Descend until feeling deep hamstring stretch, maintaining flat spine.',
      'Contract glutes and thrust hips forward to stand tall.',
    ],
  },
  {
    name: 'Leg Curl',
    slug: 'leg-curl',
    description: 'Direct hamstring knee flexion isolation using machine resistance.',
    category: 'hypertrophy',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['calves'],
    equipment: 'machine',
    instructions: [
      'Lie or sit in leg curl machine with ankle pad resting just below calves.',
      'Flex knees to pull pad toward glutes.',
      'Pause momentarily at full flexion, then slowly extend knees.',
    ],
  },
  {
    name: 'Barbell Hip Thrust',
    slug: 'barbell-hip-thrust',
    description: 'Premier glute extension movement with barbell placed over pelvis.',
    category: 'strength',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings'],
    equipment: 'barbell',
    instructions: [
      'Sit on floor with upper back against horizontal bench and padded barbell over hips.',
      'Place feet flat on floor shoulder-width apart.',
      'Drive through heels and extend hips upward until thighs and torso align horizontally.',
      'Squeeze glutes at top before lowering hips back to floor.',
    ],
  },
  {
    name: 'Standing Calf Raise',
    slug: 'standing-calf-raise',
    description: 'Ankle plantarflexion exercise isolating gastrocnemius.',
    category: 'hypertrophy',
    primaryMuscle: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    instructions: [
      'Position balls of feet on step with shoulder pads resting comfortably.',
      'Lower heels as far as possible for deep calf stretch.',
      'Push through balls of feet to raise onto tiptoes as high as possible.',
    ],
  },

  // ARMS - BICEPS, TRICEPS & FOREARMS
  {
    name: 'Barbell Biceps Curl',
    slug: 'barbell-biceps-curl',
    description: 'Fundamental standing bicep flexion movement with straight or EZ bar.',
    category: 'hypertrophy',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    instructions: [
      'Stand tall holding barbell with underhand grip at shoulder width.',
      'Pin elbows to sides and curl bar toward shoulders.',
      'Squeeze biceps at the top, then lower bar slowly with control.',
    ],
  },
  {
    name: 'Incline Dumbbell Curl',
    slug: 'incline-dumbbell-curl',
    description: 'Biceps curl performed on incline bench for extended long-head muscle stretch.',
    category: 'hypertrophy',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    instructions: [
      'Sit on incline bench set to 45 degrees with dumbbells hanging straight down.',
      'Keep upper arms stationary and curl weights upward while supinating wrists.',
      'Lower slowly until arms reach full extension stretch.',
    ],
  },
  {
    name: 'Triceps Rope Pushdown',
    slug: 'triceps-rope-pushdown',
    description: 'Cable isolation exercise targeting the lateral and medial heads of the triceps.',
    category: 'hypertrophy',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    equipment: 'cable',
    instructions: [
      'Attach rope to high pulley and hold handles with neutral grip.',
      'Tuck elbows at sides and push rope down until arms are fully locked out.',
      'Spread rope ends outward at bottom for extra contraction, then return smoothly.',
    ],
  },
  {
    name: 'Skull Crusher',
    slug: 'skull-crusher',
    description: 'Lying triceps extension providing deep stretch to the triceps long head.',
    category: 'hypertrophy',
    primaryMuscle: 'triceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    instructions: [
      'Lie back on flat bench holding EZ bar with arms extended over chest.',
      'Keeping elbows pinned in place, bend elbows to lower bar toward forehead.',
      'Extend elbows to press bar back up to starting lockout.',
    ],
  },

  // CORE
  {
    name: 'Hanging Leg Raise',
    slug: 'hanging-leg-raise',
    description: 'Advanced abdominal exercise emphasizing lower abs and hip flexor control.',
    category: 'strength',
    primaryMuscle: 'core',
    secondaryMuscles: ['forearms'],
    equipment: 'bodyweight',
    instructions: [
      'Hang from pull-up bar with overhand grip and legs straight.',
      'Contract abdominals to raise legs upward toward horizontal or higher without swinging.',
      'Lower legs slowly to return to dead hang.',
    ],
  },
  {
    name: 'Plank',
    slug: 'plank',
    description: 'Isometric core stability hold engaging the entire anterior core.',
    category: 'endurance',
    primaryMuscle: 'core',
    secondaryMuscles: ['shoulders', 'glutes'],
    equipment: 'bodyweight',
    instructions: [
      'Support body weight on forearms and toes with elbows directly beneath shoulders.',
      'Maintain a rigid straight line from head to heels by squeezing glutes and abs.',
      'Hold position while breathing steadily.',
    ],
  },
];

