# Bundled common/breached password list

`common-passwords.json` holds the passwords of **12 or more characters** (NFKC-normalized, lower-cased, deduplicated) from these SecLists files:

- `Passwords/Common-Credentials/Pwdb_top-1000000.txt`
- `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt`

Source: <https://github.com/danielmiessler/SecLists>, MIT License, Copyright (c) 2018 Daniel Miessler. Retrieved 2026-09-27.

Shorter entries are omitted because the password policy already requires at least 12 characters. To rebuild, download both files, keep entries of 12–128 characters after NFKC normalization and lower-casing, deduplicate, sort, and write them as a JSON array.
