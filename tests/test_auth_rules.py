"""Domain allowlist + admin allowlist (pure functions in app/auth.py)."""
from app.auth import is_admin_email, is_allowed_email
from tests.conftest import ADMIN_EMAIL


def test_only_allowed_domain_can_sign_in():
    assert is_allowed_email("someone@arcitech.ai")
    assert is_allowed_email("SomeOne@Arcitech.AI")
    assert not is_allowed_email("someone@gmail.com")
    assert not is_allowed_email("someone@notarcitech.ai")
    # suffix-match trap: a domain that merely *ends with* the allowed one
    assert not is_allowed_email("attacker@evil-arcitech.ai")


def test_admin_allowlist():
    assert is_admin_email(ADMIN_EMAIL)
    assert is_admin_email(ADMIN_EMAIL.upper())
    assert not is_admin_email("alice@arcitech.ai")
