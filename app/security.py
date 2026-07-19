"""Password hashing and OTP helpers — stdlib only (no bcrypt/passlib dependency).

Passwords use PBKDF2-HMAC-SHA256 with a per-password random salt, stored as a
self-describing string. OTP codes are never stored in the clear: only a salted
SHA-256 hash is persisted, so a database read cannot reveal a live code.
"""
import hashlib
import hmac
import secrets

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iters)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def generate_otp(length: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(code: str, secret: str) -> str:
    """Salted hash so the stored value can't be used to log in as anyone."""
    return hashlib.sha256(f"{secret}:{code}".encode()).hexdigest()


def otp_matches(code: str, stored_hash: str, secret: str) -> bool:
    return hmac.compare_digest(hash_otp(code, secret), stored_hash)
