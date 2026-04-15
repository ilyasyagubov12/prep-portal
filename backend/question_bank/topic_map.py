MATH_GROUPS = [
    {
        "title": "Algebra",
        "subtopics": [
            "Expressions",
            "Linear Equations",
            "Linear System of Equations",
            "Linear Functions",
            "Linear Inequalities",
        ],
    },
    {
        "title": "Advanced Math",
        "subtopics": [
            "Polynomials",
            "Exponents & Radicals",
            "Functions & Function Notation",
            "Exponential Functions",
            "Quadratics",
        ],
    },
    {
        "title": "Problem Solving",
        "subtopics": [
            "Percent; Ratio; Proportion",
            "Unit Conversion",
            "Probability",
            "Mean, Median, Mode, Range",
            "Scatterplots",
            "Research Organizing (Margin of Error; Outliers)",
        ],
    },
    {
        "title": "Geometry and Trigonometry",
        "subtopics": [
            "Lines & Angles",
            "Triangles",
            "Trigonometry",
            "Circles",
            "Areas & Volumes",
        ],
    },
]

VERBAL_GROUPS = [
    {
        "title": "Standard English Conventions",
        "subtopics": [
            "Boundaries",
            "Form, Structure, and Sense",
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
        "title": "Craft and Structure",
        "subtopics": [
            "Cross-Text Connections",
            "Text Structure and Purpose",
            "Words in Context",
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
