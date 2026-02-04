export type Subtopic = { title: string; count?: number };
export type TopicGroup = { title: string; count?: number; subtopics?: Subtopic[] };

export const verbalGroups: TopicGroup[] = [
  {
    title: "Craft and Structure",
    count: 0,
    subtopics: [
      { title: "Cross-Text Connections", count: 0 },
      { title: "Text Structure and Purpose", count: 0 },
      { title: "Words in Context", count: 0 },
    ],
  },
  {
    title: "Expression of Ideas",
    count: 0,
    subtopics: [
      { title: "Rhetorical Synthesis", count: 0 },
      { title: "Transitions", count: 0 },
    ],
  },
  {
    title: "Information and Ideas",
    count: 0,
    subtopics: [
      { title: "Central Ideas and Details", count: 0 },
      { title: "Command of Evidence", count: 0 },
      { title: "Inferences", count: 0 },
    ],
  },
  {
    title: "Standard English Conventions",
    count: 0,
    subtopics: [
      { title: "Boundaries", count: 0 },
      { title: "Form, Structure, and Sense", count: 0 },
    ],
  },
];

export const mathGroups: TopicGroup[] = [
  {
    title: "Algebra",
    count: 0,
    subtopics: [
      { title: "Linear equations in one variable", count: 0 },
      { title: "Linear functions", count: 0 },
      { title: "Linear equations in two variables", count: 0 },
      { title: "Systems of two linear equations in two variables", count: 0 },
      { title: "Linear inequalities in one or two variables", count: 0 },
    ],
  },
  {
    title: "Advanced Math",
    count: 0,
    subtopics: [
      { title: "Equivalent expressions", count: 0 },
      { title: "Nonlinear equations in one variable and systems of equations in two variables", count: 0 },
      { title: "Nonlinear functions", count: 0 },
    ],
  },
  {
    title: "Problem Solving & Data Analysis",
    count: 0,
    subtopics: [
      { title: "Ratios, rates, proportional relationships, and units", count: 0 },
      { title: "Percentages", count: 0 },
      { title: "One-variable data", count: 0 },
      { title: "Two-variable data & scatterplots", count: 0 },
      { title: "Probability & conditional probability", count: 0 },
      { title: "Inference & margin of error", count: 0 },
      { title: "Evaluating statistical claims", count: 0 },
    ],
  },
  {
    title: "Geometry & Trigonometry",
    count: 0,
    subtopics: [
      { title: "Area and volume", count: 0 },
      { title: "Lines, angles, and triangles", count: 0 },
      { title: "Right triangles and trigonometry", count: 0 },
      { title: "Circles", count: 0 },
      { title: "Geometry and trigonometry (mixed)", count: 0 },
    ],
  },
];

export const subjects = {
  verbal: verbalGroups,
  math: mathGroups,
};
