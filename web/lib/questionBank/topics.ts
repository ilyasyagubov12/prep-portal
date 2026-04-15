export type Subtopic = { title: string; count?: number };
export type TopicGroup = { title: string; count?: number; subtopics?: Subtopic[] };

export const verbalGroups: TopicGroup[] = [
  {
    title: "Standard English Conventions",
    count: 0,
    subtopics: [
      { title: "Boundaries", count: 0 },
      { title: "Form, Structure, and Sense", count: 0 },
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
    title: "Craft and Structure",
    count: 0,
    subtopics: [
      { title: "Cross-Text Connections", count: 0 },
      { title: "Text Structure and Purpose", count: 0 },
      { title: "Words in Context", count: 0 },
    ],
  },
];

export const mathGroups: TopicGroup[] = [
  {
    title: "Algebra",
    count: 0,
    subtopics: [
      { title: "Expressions", count: 0 },
      { title: "Linear Equations", count: 0 },
      { title: "Linear System of Equations", count: 0 },
      { title: "Linear Functions", count: 0 },
      { title: "Linear Inequalities", count: 0 },
    ],
  },
  {
    title: "Advanced Math",
    count: 0,
    subtopics: [
      { title: "Polynomials", count: 0 },
      { title: "Exponents & Radicals", count: 0 },
      { title: "Functions & Function Notation", count: 0 },
      { title: "Exponential Functions", count: 0 },
      { title: "Quadratics", count: 0 },
    ],
  },
  {
    title: "Problem Solving",
    count: 0,
    subtopics: [
      { title: "Percent; Ratio; Proportion", count: 0 },
      { title: "Unit Conversion", count: 0 },
      { title: "Probability", count: 0 },
      { title: "Mean, Median, Mode, Range", count: 0 },
      { title: "Scatterplots", count: 0 },
      { title: "Research Organizing (Margin of Error; Outliers)", count: 0 },
    ],
  },
  {
    title: "Geometry and Trigonometry",
    count: 0,
    subtopics: [
      { title: "Lines & Angles", count: 0 },
      { title: "Triangles", count: 0 },
      { title: "Trigonometry", count: 0 },
      { title: "Circles", count: 0 },
      { title: "Areas & Volumes", count: 0 },
    ],
  },
];

export const subjects = {
  verbal: verbalGroups,
  math: mathGroups,
};
