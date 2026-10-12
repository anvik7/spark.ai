"""Unit and integration tests for canonical Question Paper Extraction Schema."""

import io
import json
import os
import sys
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark.content_understanding import (
    PaperMeta,
    QuestionItem,
    QuestionPaperExtraction,
    QuestionType,
    extract_question_paper,
    normalize_question_paper_extraction,
    parse_questions_deterministic,
)
from spark.main import app
from spark.models import User, get_session, init_db
from spark.auth import make_token

client = TestClient(app)


@pytest.fixture
def auth_header():
    init_db()
    with get_session() as session:
        from sqlmodel import select
        user = session.exec(select(User).where(User.email == "paper_student@example.com")).first()
        if not user:
            user = User(
                channel="web",
                external_id="paper_student@example.com",
                email="paper_student@example.com",
                name="Paper Student",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        token = make_token(user)
    return {"Authorization": f"Bearer {token}"}


def test_canonical_schema_direct_validation():
    raw_payload = {
        "paper_meta": {
            "subject": "Physics",
            "exam": "CBSE Class 12 Board Exam 2024",
            "total_questions_detected": 999,  # Should auto-correct to 2
            "pages": 2,
            "quality_notes": "blurry scan on page 1",
        },
        "questions": [
            {
                "number": "1(a)",
                "type": "numerical",
                "full_text": "Calculate the wavelength lambda = h / p for an electron with speed 10^6 m/s.",
                "has_diagram": False,
                "diagram_description": "invented text should be wiped",
                "marks": "3 marks",
                "confidence": 1.45,  # Clamps to 1.0
            },
            {
                "number": "1(b)",
                "type": "mixed",
                "full_text": "In the circuit diagram below, find the total resistance and current I.",
                "has_diagram": True,
                "diagram_description": "Circuit with 12V battery and parallel resistors",
                "marks": 5.0,
                "confidence": 0.88,
            },
        ],
    }

    extraction = QuestionPaperExtraction.model_validate(raw_payload)
    dumped = extraction.model_dump()

    # Exact top-level keys
    assert set(dumped.keys()) == {"paper_meta", "questions"}

    # Exact paper_meta keys
    assert set(dumped["paper_meta"].keys()) == {
        "subject",
        "exam",
        "total_questions_detected",
        "pages",
        "quality_notes",
    }
    assert dumped["paper_meta"]["total_questions_detected"] == 2
    assert dumped["paper_meta"]["pages"] == 2
    assert dumped["paper_meta"]["subject"] == "Physics"

    # Exact question item keys
    for q in dumped["questions"]:
        assert set(q.keys()) == {
            "number",
            "type",
            "full_text",
            "has_diagram",
            "diagram_description",
            "marks",
            "confidence",
        }

    # Field validations
    q1 = dumped["questions"][0]
    assert q1["number"] == "1(a)"
    assert q1["type"] == "numerical"
    assert q1["marks"] == 3
    assert q1["confidence"] == 1.0
    assert q1["has_diagram"] is False
    assert q1["diagram_description"] is None

    q2 = dumped["questions"][1]
    assert q2["number"] == "1(b)"
    assert q2["type"] == "mixed"
    assert q2["marks"] == 5
    assert q2["has_diagram"] is True
    assert q2["diagram_description"] == "Circuit with 12V battery and parallel resistors"


def test_schema_type_and_marks_normalization():
    q = QuestionItem(
        number="2",
        type="mcq question",
        full_text="Sample MCQ",
        marks="2.5 pts",
        confidence=-0.5,
    )
    assert q.type == "mcq"
    assert q.marks == 2.5
    assert q.confidence == 0.0

    q_none = QuestionItem(
        number="3",
        type="unknown",
        full_text="Sample text",
        marks="none",
    )
    assert q_none.type == "text"
    assert q_none.marks is None


def test_deterministic_extraction_all_five_question_types():
    raw_paper = """
CBSE Board Examination 2024
Subject: Physics

1(a) State Gauss's Law in electrostatics. [2 marks]

1(b) An electric dipole with dipole moment 4 x 10^-9 C m is aligned at 30 degrees with the direction of a uniform electric field of magnitude 5 x 10^4 N/C. Calculate the magnitude of the torque acting on the dipole. [3 marks]

2. Which of the following electromagnetic waves has the highest frequency?
(A) Infrared waves
(B) Ultraviolet waves
(C) Gamma rays
(D) Microwaves
[1 mark]

3. Refer to the circuit diagram below.
[Figure 1: Wheatstone bridge circuit with four resistors P=10, Q=20, R=15, S=30 connected to a 6V battery]
Determine if the bridge is balanced and find the current through the galvanometer. [4 marks]

4. Observe the ray diagram of a compound microscope shown in Figure 2.
[Figure 2: Ray optics diagram for microscope with objective and eyepiece lenses]
Identify the focal points and describe the nature of the final image. [3 marks]
"""
    result = parse_questions_deterministic(raw_paper, pages=2, quality_notes=None)
    dumped = result.model_dump()

    assert dumped["paper_meta"]["total_questions_detected"] == 5
    assert dumped["paper_meta"]["pages"] == 2
    assert dumped["paper_meta"]["subject"] == "Physics"
    assert "CBSE Board Examination" in dumped["paper_meta"]["exam"]

    # Q1(a): text
    assert dumped["questions"][0]["number"] == "1(a)"
    assert dumped["questions"][0]["type"] == "text"
    assert dumped["questions"][0]["marks"] == 2

    # Q1(b): numerical
    assert dumped["questions"][1]["number"] == "1(b)"
    assert dumped["questions"][1]["type"] == "numerical"
    assert dumped["questions"][1]["marks"] == 3
    assert "4 x 10^-9 C m" in dumped["questions"][1]["full_text"]

    # Q2: mcq with all choices preserved
    q2 = dumped["questions"][2]
    assert q2["number"] == "2"
    assert q2["type"] == "mcq"
    assert q2["marks"] == 1
    assert "(A) Infrared waves" in q2["full_text"]
    assert "(B) Ultraviolet waves" in q2["full_text"]
    assert "(C) Gamma rays" in q2["full_text"]
    assert "(D) Microwaves" in q2["full_text"]

    # Q3: mixed (diagram + calculation)
    q3 = dumped["questions"][3]
    assert q3["number"] == "3"
    assert q3["type"] == "mixed"
    assert q3["has_diagram"] is True
    assert "Wheatstone bridge" in q3["diagram_description"]
    assert q3["marks"] == 4

    # Q4: diagram (conceptual diagram analysis)
    q4 = dumped["questions"][4]
    assert q4["number"] == "4"
    assert q4["type"] == "diagram"
    assert q4["has_diagram"] is True
    assert "microscope" in q4["diagram_description"]


def test_multi_part_numbering_preservation():
    paper = """
1(a) Define electric flux. [1 mark]
1(b) State Ampere's circuital law. [1 mark]
2.1 What is Lenz's law? [2 marks]
2.2 Give its sign convention. [1 mark]
"""
    result = parse_questions_deterministic(paper)
    numbers = [q.number for q in result.questions]
    assert numbers == ["1(a)", "1(b)", "2.1", "2.2"]


def test_multi_page_continuation_handling():
    paper_multipage = """
--- Page 1 ---
1. A uniform cylindrical conductor of radius R carries a current I.
The current density varies with radial distance r as J(r) = J_0 (r / R)^2.
Calculate:
--- Page 2 ---
(Continued) The total current enclosed within a cylinder of radius r < R,
and derive an expression for the magnetic field B at r = R/2. [5 marks]

2. Explain the principle of a transformer. [3 marks]
"""
    result = parse_questions_deterministic(paper_multipage, pages=2)
    assert result.paper_meta.total_questions_detected == 2
    assert result.paper_meta.pages == 2

    q1 = result.questions[0]
    assert q1.number == "1"
    # Full text combines both page contents
    assert "cylindrical conductor" in q1.full_text
    assert "magnetic field B" in q1.full_text
    assert q1.marks == 5

    q2 = result.questions[1]
    assert q2.number == "2"
    assert "transformer" in q2.full_text
    assert q2.marks == 3


def test_formulas_and_math_preservation():
    paper_math = r"""
1. Evaluate the definite integral:
\int_{0}^{\pi/2} \frac{\sin^n(x)}{\sin^n(x) + \cos^n(x)} dx
[4 marks]

2. Balance the following chemical redox reaction:
MnO_4^- + C_2O_4^{2-} + H^+ -> Mn^{2+} + CO_2 + H_2O
[3 marks]
"""
    result = parse_questions_deterministic(paper_math)
    assert result.paper_meta.total_questions_detected == 2
    assert "\\int_{0}^{\\pi/2}" in result.questions[0].full_text
    assert "MnO_4^-" in result.questions[1].full_text


def test_quality_notes_adjusts_confidence():
    text = "1. What is velocity? [1 mark]"
    clean_res = parse_questions_deterministic(text, quality_notes=None)
    blurry_res = parse_questions_deterministic(text, quality_notes="blurry, skewed, low contrast handwritten scan")

    assert clean_res.questions[0].confidence >= 0.90
    assert blurry_res.questions[0].confidence <= 0.70
    assert blurry_res.paper_meta.quality_notes == "blurry, skewed, low contrast handwritten scan"


def test_no_solving_or_summarizing():
    paper = "1. Solve the quadratic equation 2x^2 - 7x + 3 = 0. [3 marks]"
    res = parse_questions_deterministic(paper)
    q = res.questions[0]
    # Verify the question statement is extracted verbatim without solutions
    assert q.full_text == "Solve the quadratic equation 2x^2 - 7x + 3 = 0. [3 marks]"
    assert "x = 3" not in q.full_text
    assert "x = 1/2" not in q.full_text


def test_api_endpoint_extract_paper_raw_text(auth_header):
    data = {
        "raw_text": """
CBSE Class 10 Board Examination 2024
Subject: Mathematics

1. Find the roots of the quadratic equation x^2 - 5x + 6 = 0. [2 marks]
2. Which term of the AP: 3, 8, 13, 18, ... is 78? [3 marks]
""",
        "subject_hint": "Mathematics",
        "exam_hint": "CBSE Class 10",
    }
    response = client.post("/api/tasks/extract-paper", headers=auth_header, data=data)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["paper_meta"]["subject"] == "Mathematics"
    assert body["paper_meta"]["total_questions_detected"] == 2
    assert len(body["questions"]) == 2
    assert body["questions"][0]["number"] == "1"
    assert body["questions"][0]["marks"] == 2
    assert body["questions"][1]["number"] == "2"
    assert body["questions"][1]["marks"] == 3


def test_api_endpoint_extract_paper_file_upload(auth_header):
    content = b"""
1(a) Define electric potential. [1 mark]
1(b) Derive the expression for electric field at an axial point of a dipole. [3 marks]
"""
    files = {"file": ("physics_unit_test.txt", content, "text/plain")}
    data = {"subject_hint": "Physics"}

    response = client.post("/api/tasks/extract-paper", headers=auth_header, files=files, data=data)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["paper_meta"]["subject"] == "Physics"
    assert body["paper_meta"]["total_questions_detected"] == 2
    assert body["questions"][0]["number"] == "1(a)"
    assert body["questions"][1]["number"] == "1(b)"


def test_api_endpoint_extract_paper_unauthenticated():
    data = {"raw_text": "1. What is momentum? [2 marks]"}
    response = client.post("/api/tasks/extract-paper", data=data)
    assert response.status_code in (401, 403)


def test_extract_question_paper_with_mocked_llm_vision():
    from spark.content_understanding import extract_question_paper
    from spark import llm

    mock_structured = {
        "paper_meta": {
            "subject": "Chemistry",
            "exam": "JEE Advanced 2024",
            "total_questions_detected": 1,
            "pages": 1,
            "quality_notes": None,
        },
        "questions": [
            {
                "number": "1",
                "type": "mcq",
                "full_text": "The major product formed in the reaction is:\n(A) Phenol\n(B) Benzene",
                "has_diagram": True,
                "diagram_description": "Benzene ring with alkyl halide in presence of anhydrous AlCl3",
                "marks": 4,
                "confidence": 0.96,
            }
        ],
    }

    mock_router = MagicMock()
    mock_router.has_configured_real_providers.return_value = True
    mock_router.generate_structured.return_value = mock_structured

    with patch.object(llm, "get_model_router", return_value=mock_router):
        png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        res = extract_question_paper(png_bytes, "chem.png", "image/png")
        assert res.paper_meta.subject == "Chemistry"
        assert res.paper_meta.total_questions_detected == 1
        assert res.questions[0].type == "mcq"
        assert res.questions[0].has_diagram is True
        assert "Benzene" in res.questions[0].diagram_description
        assert mock_router.generate_structured.called
