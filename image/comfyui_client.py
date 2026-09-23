"""A small, dependency-free client for ComfyUI's HTTP API.

This module only communicates with a running ComfyUI server.  It does not
modify workflow files or require an MCP server.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


JSON = dict[str, Any]


class ComfyUIError(RuntimeError):
    """Base exception raised when communication with ComfyUI fails."""


class ComfyUIAPIError(ComfyUIError):
    """A non-success response returned by the ComfyUI API."""

    def __init__(self, status_code: int, endpoint: str, body: str) -> None:
        self.status_code = status_code
        self.endpoint = endpoint
        self.body = body
        super().__init__(f"ComfyUI API returned HTTP {status_code} for {endpoint}: {body}")


class ResultNotReadyError(ComfyUIError):
    """The prompt has not produced a history entry yet."""


@dataclass(frozen=True)
class PromptSubmission:
    """The identifiers returned after a workflow has been accepted."""

    prompt_id: str
    number: int | None
    node_errors: Mapping[str, Any]


@dataclass(frozen=True)
class QueueStatus:
    """Current queues, preserved in ComfyUI's native queue-item format."""

    running: tuple[Any, ...]
    pending: tuple[Any, ...]


@dataclass(frozen=True)
class PromptStatus:
    """A prompt's current state and the API data from which it was derived."""

    prompt_id: str
    state: str
    details: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class GeneratedFile:
    """A generated file advertised by a ComfyUI history output."""

    node_id: str
    output_name: str
    filename: str
    subfolder: str
    file_type: str


@dataclass(frozen=True)
class PromptResult:
    """Completed prompt data plus any file references found in its outputs."""

    prompt_id: str
    outputs: Mapping[str, Any]
    files: tuple[GeneratedFile, ...]
    status: Mapping[str, Any]
    raw: Mapping[str, Any]


class ComfyUIClient:
    """Client for ComfyUI's built-in HTTP API.

    Parameters
    ----------
    base_url:
        URL of the running ComfyUI server.
    timeout:
        Per-request timeout in seconds.
    """

    def __init__(self, base_url: str = "http://127.0.0.1:8188", timeout: float = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_system_stats(self) -> JSON:
        """Return ComfyUI's system information; useful as a connectivity check."""
        return self._get_json("/system_stats")

    def submit_workflow(
        self,
        workflow: Mapping[str, Any],
        *,
        client_id: str | None = None,
        extra_data: Mapping[str, Any] | None = None,
    ) -> PromptSubmission:
        """Submit API-format workflow JSON and return its ``prompt_id``.

        ``workflow`` must be ComfyUI's API prompt format, not a UI workflow
        document.  Export it from ComfyUI with "Save (API Format)".
        """
        payload: JSON = {
            "prompt": dict(workflow),
            "client_id": client_id or str(uuid.uuid4()),
        }
        if extra_data is not None:
            payload["extra_data"] = dict(extra_data)

        response = self._post_json("/prompt", payload)
        prompt_id = response.get("prompt_id")
        if not isinstance(prompt_id, str) or not prompt_id:
            raise ComfyUIError(f"ComfyUI accepted an invalid prompt response: {response}")

        number = response.get("number")
        if not isinstance(number, int):
            number = None
        node_errors = response.get("node_errors")
        if not isinstance(node_errors, Mapping):
            node_errors = {}
        return PromptSubmission(prompt_id, number, node_errors)

    def get_queue_status(self) -> QueueStatus:
        """Return the running and pending prompt queues."""
        response = self._get_json("/queue")
        running = response.get("queue_running", [])
        pending = response.get("queue_pending", [])
        if not isinstance(running, list) or not isinstance(pending, list):
            raise ComfyUIError(f"Unexpected /queue response: {response}")
        return QueueStatus(tuple(running), tuple(pending))

    def get_history(self, prompt_id: str) -> Mapping[str, Any] | None:
        """Return a prompt's history record, or ``None`` while it has none."""
        response = self._get_json(f"/history/{quote(prompt_id, safe='')}")
        record = response.get(prompt_id)
        if record is None:
            return None
        if not isinstance(record, Mapping):
            raise ComfyUIError(f"Unexpected history record for {prompt_id}: {record}")
        return record

    def get_prompt_status(self, prompt_id: str) -> PromptStatus:
        """Determine whether a prompt is pending, running, complete, failed, or unknown."""
        record = self.get_history(prompt_id)
        if record is not None:
            status = record.get("status", {})
            if not isinstance(status, Mapping):
                status = {}
            status_text = str(status.get("status_str", "completed")).lower()
            if status_text in {"success", "completed"}:
                state = "completed"
            elif status_text in {"error", "failed"}:
                state = "failed"
            else:
                state = status_text
            return PromptStatus(prompt_id, state, status)

        queue = self.get_queue_status()
        if self._queue_contains(queue.running, prompt_id):
            return PromptStatus(prompt_id, "running")
        if self._queue_contains(queue.pending, prompt_id):
            return PromptStatus(prompt_id, "pending")
        return PromptStatus(prompt_id, "unknown")

    def get_results(self, prompt_id: str) -> PromptResult:
        """Return a completed prompt's outputs and generated-file references.

        Raises
        ------
        ResultNotReadyError
            If ComfyUI has not added the prompt to history yet.
        """
        record = self.get_history(prompt_id)
        if record is None:
            raise ResultNotReadyError(f"Prompt {prompt_id} has no history result yet.")

        outputs = record.get("outputs", {})
        status = record.get("status", {})
        if not isinstance(outputs, Mapping) or not isinstance(status, Mapping):
            raise ComfyUIError(f"Unexpected history response for {prompt_id}: {record}")
        files = self._extract_files(outputs)
        return PromptResult(prompt_id, outputs, files, status, record)

    def get_file_bytes(self, file: GeneratedFile) -> bytes:
        """Download a file referenced by :meth:`get_results` from ``/view``."""
        query = urlencode(
            {
                "filename": file.filename,
                "subfolder": file.subfolder,
                "type": file.file_type,
            }
        )
        return self._request_bytes(f"/view?{query}")

    def _get_json(self, endpoint: str) -> JSON:
        return self._request_json(endpoint, method="GET")

    def _post_json(self, endpoint: str, payload: Mapping[str, Any]) -> JSON:
        return self._request_json(endpoint, method="POST", payload=payload)

    def _request_json(
        self, endpoint: str, *, method: str, payload: Mapping[str, Any] | None = None
    ) -> JSON:
        body = self._request_bytes(endpoint, method=method, payload=payload)
        try:
            value = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ComfyUIError(f"ComfyUI returned invalid JSON for {endpoint}") from error
        if not isinstance(value, dict):
            raise ComfyUIError(f"ComfyUI returned a JSON value other than an object for {endpoint}")
        return value

    def _request_bytes(
        self, endpoint: str, *, method: str = "GET", payload: Mapping[str, Any] | None = None
    ) -> bytes:
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(f"{self.base_url}{endpoint}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            raise ComfyUIAPIError(error.code, endpoint, error_body) from error
        except URLError as error:
            raise ComfyUIError(f"Could not reach ComfyUI at {self.base_url}: {error.reason}") from error

    @staticmethod
    def _queue_contains(queue: tuple[Any, ...], prompt_id: str) -> bool:
        # Each ComfyUI item is normally [number, prompt_id, prompt, extra_data, ...].
        return any(isinstance(item, (list, tuple)) and len(item) > 1 and item[1] == prompt_id for item in queue)

    @staticmethod
    def _extract_files(outputs: Mapping[str, Any]) -> tuple[GeneratedFile, ...]:
        files: list[GeneratedFile] = []
        for node_id, node_output in outputs.items():
            if not isinstance(node_id, str) or not isinstance(node_output, Mapping):
                continue
            for output_name, value in node_output.items():
                if not isinstance(output_name, str) or not isinstance(value, list):
                    continue
                for item in value:
                    if not isinstance(item, Mapping) or not isinstance(item.get("filename"), str):
                        continue
                    files.append(
                        GeneratedFile(
                            node_id=node_id,
                            output_name=output_name,
                            filename=item["filename"],
                            subfolder=str(item.get("subfolder", "")),
                            file_type=str(item.get("type", "output")),
                        )
                    )
        return tuple(files)
