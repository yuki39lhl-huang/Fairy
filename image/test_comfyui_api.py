"""Minimal, dependency-free connection test for the local ComfyUI API."""

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


API_URL = "http://127.0.0.1:8188/system_stats"


def main() -> int:
    try:
        with urlopen(API_URL, timeout=5) as response:
            status = response.status
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        print(f"ComfyUI API responded with HTTP {error.code}: {API_URL}", file=sys.stderr)
        return 1
    except URLError as error:
        print(f"Could not reach the ComfyUI API at {API_URL}: {error.reason}", file=sys.stderr)
        return 1

    try:
        json.loads(payload)
    except json.JSONDecodeError:
        print(f"ComfyUI API returned HTTP {status}, but not JSON: {API_URL}", file=sys.stderr)
        return 1

    print(f"ComfyUI API is reachable and returned JSON (HTTP {status}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
