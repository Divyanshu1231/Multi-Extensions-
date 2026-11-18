from app.security import hash_password, verify_password, token_hash
def test_password_hash_is_not_plaintext():
    h=hash_password("A-long-test-password-2026!")
    assert h != "A-long-test-password-2026!"
    assert verify_password("A-long-test-password-2026!",h)
    assert not verify_password("wrong",h)
def test_refresh_hash():
    assert token_hash("abc") != "abc"
