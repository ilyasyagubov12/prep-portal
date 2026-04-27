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


def _normalize(value: str | None) -> str:
    return " ".join((value or "").strip().split()).casefold()


_TOPIC_ALIASES = {
    "math": {
        "Advanced math": "Advanced Math",
        "Geometry": "Geometry and Trigonometry",
        "Percent; Ratio & Proportion": "Problem Solving",
        "Statistics": "Problem Solving",
    },
    "verbal": {
        "expression of ideas": "Expression of Ideas",
    },
}


_SUBTOPIC_ALIASES = {
    "math": {
        "Algebra": {
            "Linear equations in one variable": "Linear Equations",
            "Linear equations in two variables": "Linear Equations",
            "Linear functions": "Linear Functions",
            "Linear inequalities in one or two variables": "Linear Inequalities",
            "Systems of two linear equations in two variables": "Linear System of Equations",
        },
        "Advanced Math": {
            "Equivalent expressions": "Polynomials",
            "Nonlinear equations in one variable and systems of equations in two variables": "Quadratics",
        },
        "Problem Solving": {
            "Percent; Ratio & Proportion": "Percent; Ratio; Proportion",
            "Research organizing (Margin of Error; Outliers)": "Research Organizing (Margin of Error; Outliers)",
        },
        "Geometry and Trigonometry": {
            "Trigonometry": "Trigonometry",
        },
    },
    "verbal": {
        "Expression of Ideas": {
            "Rhetorical Synthesis": "Rhetorical Synthesis",
            "Transitions": "Transitions",
        },
    },
}


def canonicalize_topic(subject: str, topic: str | None) -> str:
    normalized_subject = _normalize(subject)
    groups = get_groups(normalized_subject)
    by_name = {_normalize(group["title"]): group["title"] for group in groups}
    key = _normalize(topic)
    if not key:
        return (topic or "").strip()
    if key in by_name:
        return by_name[key]
    alias_lookup = {
        _normalize(raw): canonical
        for raw, canonical in _TOPIC_ALIASES.get(normalized_subject, {}).items()
    }
    return alias_lookup.get(key, (topic or "").strip())


def canonicalize_subtopic(subject: str, topic: str | None, subtopic: str | None) -> str:
    canonical_topic = canonicalize_topic(subject, topic)
    raw = (subtopic or "").strip()
    if not raw:
        return raw

    subtopics = []
    for group in get_groups(_normalize(subject)):
        if group["title"] == canonical_topic:
            subtopics = group["subtopics"]
            break

    by_name = {_normalize(name): name for name in subtopics}
    key = _normalize(raw)
    if key in by_name:
        return by_name[key]
    alias_lookup = {
        _normalize(alias): canonical
        for alias, canonical in _SUBTOPIC_ALIASES.get(_normalize(subject), {}).get(canonical_topic, {}).items()
    }
    return alias_lookup.get(key, raw)


def canonicalize_labels(subject: str, topic: str | None, subtopic: str | None = None):
    normalized_subject = _normalize(subject)
    canonical_topic = canonicalize_topic(normalized_subject, topic)
    canonical_subtopic = canonicalize_subtopic(normalized_subject, canonical_topic, subtopic)
    return normalized_subject, canonical_topic, canonical_subtopic


def topic_aliases(subject: str, topic: str | None) -> list[str]:
    normalized_subject, canonical_topic, _ = canonicalize_labels(subject, topic)
    aliases = {canonical_topic}
    for raw, canonical in _TOPIC_ALIASES.get(normalized_subject, {}).items():
        if canonical == canonical_topic:
            aliases.add(raw)
    return sorted(alias for alias in aliases if alias)


def subtopic_aliases(subject: str, topic: str | None, subtopic: str | None) -> list[str]:
    normalized_subject, canonical_topic, canonical_subtopic = canonicalize_labels(subject, topic, subtopic)
    aliases = {canonical_subtopic}
    for raw, canonical in _SUBTOPIC_ALIASES.get(normalized_subject, {}).get(canonical_topic, {}).items():
        if canonical == canonical_subtopic:
            aliases.add(raw)
    return sorted(alias for alias in aliases if alias)
