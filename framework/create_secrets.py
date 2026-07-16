"""Generate random secret files for the VSF docker-compose stack.

Creates `secrets/vnc_password.txt` and `secrets/db_password.txt` with
cryptographically random values on first run. Existing files are left
untouched so re-running the script never rotates a live password.
"""

import os
import secrets

SECRETS_DIR = "secrets"
FILES = {
    "vnc_password.txt": 16,
    "db_password.txt": 32,
}


def write_if_missing(path: str, nbytes: int) -> None:
    if os.path.exists(path):
        print(f"skip {path} (already exists)")
        return
    with open(path, "w") as f:
        f.write(secrets.token_urlsafe(nbytes))
    os.chmod(path, 0o600)
    print(f"wrote {path}")


def main() -> None:
    os.makedirs(SECRETS_DIR, exist_ok=True)
    for name, nbytes in FILES.items():
        write_if_missing(os.path.join(SECRETS_DIR, name), nbytes)


if __name__ == "__main__":
    main()
