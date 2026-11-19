from datetime import date

from app.models import Recipe
from app.services.naming_service import build_name, sanitize, unique_name


def R(**kw):
    return Recipe(**{"format": "webp", **kw})


def test_spec_example():
    r = R(prefix="campaign_summer", pattern="{prefix}_{index}", padding=3)
    assert build_name("IMG_1.jpg", 0, 100, 100, r) == "campaign_summer_001.webp"


def test_tokens():
    r = R(prefix="p", pattern="{name}_opt_{w}x{h}_{date}_{index}", padding=2, startIndex=7)
    assert build_name("hero shot.png", 2, 1920, 1080, r, today=date(2026, 11, 18)) == "hero_shot_opt_1920x1080_20261118_09.webp"


def test_path_traversal_and_separators_are_neutralised():
    assert sanitize("../../etc/passwd.jpg") == "etc_passwd.jpg"
    assert "/" not in sanitize("a/b\\c") and "\\" not in sanitize("a/b\\c")
    assert not sanitize("...hidden").startswith(".")
    assert sanitize("a\x00b\nc") == "a_b_c"


def test_unicode_is_reduced_to_safe_ascii():
    assert sanitize("café ảnh") == "cafe_anh"


def test_windows_reserved_names_are_avoided():
    assert build_name("x.jpg", 0, 1, 1, R(pattern="CON")) == "_CON.webp"


def test_empty_result_falls_back():
    assert build_name("x.jpg", 0, 1, 1, R(pattern="///")) == "image.webp"


def test_collisions_get_suffixes_case_insensitively():
    used: set[str] = set()
    assert unique_name("a.webp", used) == "a.webp"
    assert unique_name("A.webp", used) == "A_2.webp"
    assert unique_name("a.webp", used) == "a_3.webp"
