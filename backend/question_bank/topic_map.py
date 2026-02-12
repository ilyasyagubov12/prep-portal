MATH_GROUPS = [
    {
        "title": "Algebra",
        "subtopics": [
            "Linear equations in one variable",
            "Linear functions",
            "Linear equations in two variables",
            "Systems of two linear equations in two variables",
            "Linear inequalities in one or two variables",
        ],
    },
    {
        "title": "Advanced Math",
        "subtopics": [
            "Equivalent expressions",
            "Nonlinear equations in one variable and systems of equations in two variables",
            "Nonlinear functions",
        ],
    },
    {
        "title": "Problem Solving & Data Analysis",
        "subtopics": [
            "Ratios, rates, proportional relationships, and units",
            "Percentages",
            "One-variable data",
            "Two-variable data & scatterplots",
            "Probability & conditional probability",
            "Inference & margin of error",
            "Evaluating statistical claims",
        ],
    },
    {
        "title": "Geometry & Trigonometry",
        "subtopics": [
            "Area and volume",
            "Lines, angles, and triangles",
            "Right triangles and trigonometry",
            "Circles",
            "Geometry and trigonometry (mixed)",
        ],
    },
]

VERBAL_GROUPS = [
    {
        "title": "Craft and Structure",
        "subtopics": [
            "Cross-Text Connections",
            "Text Structure and Purpose",
            "Words in Context",
        ],
    },
    {
        "title": "Expression of Ideas",
        "subtopics": [
            "Rhetorical Synthesis",
            "Transitions",
        ],
    },
    {
        "title": "Information and Ideas",
        "subtopics": [
            "Central Ideas and Details",
            "Command of Evidence",
            "Inferences",
        ],
    },
    {
        "title": "Standard English Conventions",
        "subtopics": [
            "Boundaries",
            "Form, Structure, and Sense",
        ],
    },
]


def get_groups(subject: str):
    if subject == "math":
        return MATH_GROUPS
    return VERBAL_GROUPS


def subtopic_order(subject: str):
    order = []
    for g in get_groups(subject):
        for s in g["subtopics"]:
            order.append((g["title"], s))
    return order


def topic_order(subject: str):
    return [g["title"] for g in get_groups(subject)]
