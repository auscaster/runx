from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence

from . import RunxClient


@dataclass(frozen=True)
class SurfaceBoundaryContext:
    request: Mapping[str, Any]
    events: tuple[Mapping[str, Any], ...] = ()


SurfaceBoundaryResolver = Callable[[SurfaceBoundaryContext], Any | None]


@dataclass(frozen=True)
class SurfacePausedResult:
    status: str
    skill_name: str
    run_id: str
    requests: tuple[Mapping[str, Any], ...]
    step_ids: tuple[str, ...] = ()
    step_labels: tuple[str, ...] = ()
    events: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class SurfaceCompletedResult:
    status: str
    skill_name: str
    receipt_id: str
    output: str
    events: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class SurfaceFailedResult:
    status: str
    skill_name: str
    error: str
    receipt_id: str | None = None
    events: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class SurfaceDeniedResult:
    status: str
    skill_name: str
    reasons: tuple[str, ...]
    receipt_id: str | None = None
    events: tuple[Mapping[str, Any], ...] = ()


SurfaceRunResult = (
    SurfacePausedResult
    | SurfaceCompletedResult
    | SurfaceFailedResult
    | SurfaceDeniedResult
)


@dataclass(frozen=True)
class SurfacePausedState:
    status: str
    skill_name: str
    run_id: str
    requested_path: str | None = None
    resolved_path: str | None = None
    selected_runner: str | None = None
    requests: tuple[Mapping[str, Any], ...] = ()
    step_ids: tuple[str, ...] = ()
    step_labels: tuple[str, ...] = ()
    lineage: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class SurfaceTerminalState:
    status: str
    kind: str
    skill_name: str
    run_id: str
    receipt_id: str
    verification: Mapping[str, Any]
    source_type: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    disposition: str | None = None
    outcome_state: str | None = None
    actors: tuple[str, ...] = ()
    artifact_types: tuple[str, ...] = ()
    runner_provider: str | None = None
    approval: Mapping[str, Any] | None = None
    lineage: Mapping[str, Any] | None = None


SurfaceRunState = SurfacePausedState | SurfaceTerminalState


class SurfaceBridge:
    def __init__(self, client: RunxClient) -> None:
        self.client = client

    def run(
        self,
        skill_path: str,
        inputs: Mapping[str, Any] | None = None,
        resolver: SurfaceBoundaryResolver | None = None,
    ) -> SurfaceRunResult:
        initial = self.client.surface_run(skill_path, inputs=inputs)
        return self._drive(initial, resolver=resolver)

    def resume(
        self,
        run_id: str,
        resolver: SurfaceBoundaryResolver | None = None,
    ) -> SurfaceRunResult:
        initial = self.client.surface_resume(run_id)
        return self._drive(initial, resolver=resolver)

    def inspect(self, reference_id: str) -> SurfaceRunState:
        return normalize_surface_state(self.client.surface_inspect(reference_id))

    def _drive(
        self,
        payload: Mapping[str, Any],
        resolver: SurfaceBoundaryResolver | None,
    ) -> SurfaceRunResult:
        current = dict(payload)
        while True:
            result = normalize_surface_result(current)
            if not isinstance(result, SurfacePausedResult):
                return result
            if resolver is None:
                return result

            responses: list[dict[str, Any]] = []
            for request in result.requests:
                reply = resolver(SurfaceBoundaryContext(request=request, events=result.events))
                normalized = _normalize_resolution_reply(request, reply)
                if normalized is None:
                    continue
                responses.append(
                    {
                        "requestId": str(request.get("id") or ""),
                        "actor": normalized["actor"],
                        "payload": normalized["payload"],
                    }
                )

            if not responses:
                return result

            current = self.client.surface_resume(result.run_id, responses=responses)


class ProviderSurfaceAdapter:
    def __init__(self, bridge: SurfaceBridge, formatter: Callable[[SurfaceRunResult], Mapping[str, Any]]) -> None:
        self.bridge = bridge
        self.formatter = formatter

    def run(
        self,
        skill_path: str,
        inputs: Mapping[str, Any] | None = None,
        resolver: SurfaceBoundaryResolver | None = None,
    ) -> Mapping[str, Any]:
        return self.formatter(self.bridge.run(skill_path, inputs=inputs, resolver=resolver))

    def resume(
        self,
        run_id: str,
        resolver: SurfaceBoundaryResolver | None = None,
    ) -> Mapping[str, Any]:
        return self.formatter(self.bridge.resume(run_id, resolver=resolver))


def create_surface_bridge(client: RunxClient) -> SurfaceBridge:
    return SurfaceBridge(client)


def create_openai_surface_adapter(bridge: SurfaceBridge) -> ProviderSurfaceAdapter:
    return ProviderSurfaceAdapter(bridge, _to_openai_response)


def create_anthropic_surface_adapter(bridge: SurfaceBridge) -> ProviderSurfaceAdapter:
    return ProviderSurfaceAdapter(bridge, _to_anthropic_response)


def create_vercel_ai_surface_adapter(bridge: SurfaceBridge) -> ProviderSurfaceAdapter:
    return ProviderSurfaceAdapter(bridge, _to_vercel_response)


def create_langchain_surface_adapter(bridge: SurfaceBridge) -> ProviderSurfaceAdapter:
    return ProviderSurfaceAdapter(bridge, _to_langchain_response)


def create_crewai_surface_adapter(bridge: SurfaceBridge) -> ProviderSurfaceAdapter:
    return ProviderSurfaceAdapter(bridge, _to_crewai_response)


def normalize_surface_result(payload: Mapping[str, Any]) -> SurfaceRunResult:
    if _is_canonical_surface_result(payload):
        return _normalize_canonical_surface_result(payload)

    status = str(payload.get("status") or "")
    skill = payload.get("skill")
    skill_name = str(skill.get("name")) if isinstance(skill, Mapping) else str(skill or "")
    if status == "needs_resolution":
        return SurfacePausedResult(
            status="paused",
            skill_name=skill_name,
            run_id=str(payload.get("run_id") or ""),
            requests=tuple(payload.get("requests") or ()),
            step_ids=tuple(str(item) for item in payload.get("step_ids") or ()),
            step_labels=tuple(str(item) for item in payload.get("step_labels") or ()),
        )
    if status == "policy_denied":
        reasons = payload.get("reasons") or ()
        receipt = payload.get("receipt") or {}
        return SurfaceDeniedResult(
            status="denied",
            skill_name=skill_name,
            reasons=tuple(str(item) for item in reasons),
            receipt_id=_nested_str(receipt, "id"),
        )
    if status == "success":
        execution = payload.get("execution") or {}
        receipt = payload.get("receipt") or {}
        return SurfaceCompletedResult(
            status="completed",
            skill_name=skill_name,
            receipt_id=str(receipt.get("id") or ""),
            output=str(execution.get("stdout") or ""),
        )
    execution = payload.get("execution") or {}
    receipt = payload.get("receipt") or {}
    error = str(execution.get("errorMessage") or execution.get("stderr") or execution.get("stdout") or "")
    return SurfaceFailedResult(
        status="failed",
        skill_name=skill_name,
        error=error,
        receipt_id=_nested_str(receipt, "id"),
    )


def normalize_surface_state(payload: Mapping[str, Any]) -> SurfaceRunState:
    status = str(payload.get("status") or "")
    if status == "paused":
        return SurfacePausedState(
            status="paused",
            skill_name=str(payload.get("skillName") or ""),
            run_id=str(payload.get("runId") or ""),
            requested_path=_optional_str(payload.get("requestedPath")),
            resolved_path=_optional_str(payload.get("resolvedPath")),
            selected_runner=_optional_str(payload.get("selectedRunner")),
            requests=tuple(payload.get("requests") or ()),
            step_ids=tuple(str(item) for item in payload.get("stepIds") or ()),
            step_labels=tuple(str(item) for item in payload.get("stepLabels") or ()),
            lineage=payload.get("lineage") if isinstance(payload.get("lineage"), Mapping) else None,
        )
    return SurfaceTerminalState(
        status=status,
        kind=str(payload.get("kind") or ""),
        skill_name=str(payload.get("skillName") or ""),
        run_id=str(payload.get("runId") or ""),
        receipt_id=str(payload.get("receiptId") or ""),
        verification=dict(payload.get("verification") or {}),
        source_type=_optional_str(payload.get("sourceType")),
        started_at=_optional_str(payload.get("startedAt")),
        completed_at=_optional_str(payload.get("completedAt")),
        disposition=_optional_str(payload.get("disposition")),
        outcome_state=_optional_str(payload.get("outcomeState")),
        actors=tuple(str(item) for item in payload.get("actors") or ()),
        artifact_types=tuple(str(item) for item in payload.get("artifactTypes") or ()),
        runner_provider=_optional_str(payload.get("runnerProvider")),
        approval=payload.get("approval") if isinstance(payload.get("approval"), Mapping) else None,
        lineage=payload.get("lineage") if isinstance(payload.get("lineage"), Mapping) else None,
    )


def _normalize_resolution_reply(
    request: Mapping[str, Any],
    reply: Any | None,
) -> Mapping[str, Any] | None:
    if reply is None:
        return None
    if isinstance(reply, Mapping) and "actor" in reply and "payload" in reply:
        return {
            "actor": str(reply.get("actor") or _default_actor_for_request(request)),
            "payload": reply.get("payload"),
        }
    if isinstance(reply, Mapping) and "payload" in reply:
        return {
            "actor": str(reply.get("actor") or _default_actor_for_request(request)),
            "payload": reply.get("payload"),
        }
    if isinstance(reply, bool) and request.get("kind") == "approval":
        return {"actor": "human", "payload": reply}
    return {
        "actor": _default_actor_for_request(request),
        "payload": reply,
    }


def _default_actor_for_request(request: Mapping[str, Any]) -> str:
    return "agent" if request.get("kind") == "cognitive_work" else "human"


def _summary(result: SurfaceRunResult) -> str:
    if isinstance(result, SurfaceCompletedResult):
        return f"{result.skill_name} completed. Inspect receipt {result.receipt_id}."
    if isinstance(result, SurfacePausedResult):
        return f"{result.skill_name} paused at {result.run_id}. Resume after resolving {len(result.requests)} request(s)."
    if isinstance(result, SurfaceDeniedResult):
        return f"{result.skill_name} was denied by policy."
    return f"{result.skill_name} failed. Inspect receipt {result.receipt_id or 'n/a'}."


def _is_canonical_surface_result(payload: Mapping[str, Any]) -> bool:
    return isinstance(payload.get("skillName"), str) and str(payload.get("status") or "") in {
        "paused",
        "completed",
        "failed",
        "denied",
    }


def _normalize_canonical_surface_result(payload: Mapping[str, Any]) -> SurfaceRunResult:
    status = str(payload.get("status") or "")
    if status == "paused":
        return SurfacePausedResult(
            status="paused",
            skill_name=str(payload.get("skillName") or ""),
            run_id=str(payload.get("runId") or ""),
            requests=tuple(payload.get("requests") or ()),
            step_ids=tuple(str(item) for item in payload.get("stepIds") or ()),
            step_labels=tuple(str(item) for item in payload.get("stepLabels") or ()),
            events=tuple(payload.get("events") or ()),
        )
    if status == "completed":
        return SurfaceCompletedResult(
            status="completed",
            skill_name=str(payload.get("skillName") or ""),
            receipt_id=str(payload.get("receiptId") or ""),
            output=str(payload.get("output") or ""),
            events=tuple(payload.get("events") or ()),
        )
    if status == "denied":
        return SurfaceDeniedResult(
            status="denied",
            skill_name=str(payload.get("skillName") or ""),
            reasons=tuple(str(item) for item in payload.get("reasons") or ()),
            receipt_id=_optional_str(payload.get("receiptId")),
            events=tuple(payload.get("events") or ()),
        )
    return SurfaceFailedResult(
        status="failed",
        skill_name=str(payload.get("skillName") or ""),
        error=str(payload.get("error") or ""),
        receipt_id=_optional_str(payload.get("receiptId")),
        events=tuple(payload.get("events") or ()),
    )


def _to_openai_response(result: SurfaceRunResult) -> Mapping[str, Any]:
    return {
        "role": "tool",
        "content": [{"type": "text", "text": _summary(result)}],
        "structuredContent": {"runx": _result_to_dict(result)},
    }


def _to_anthropic_response(result: SurfaceRunResult) -> Mapping[str, Any]:
    return {
        "content": [{"type": "text", "text": _summary(result)}],
        "metadata": {"runx": _result_to_dict(result)},
    }


def _to_vercel_response(result: SurfaceRunResult) -> Mapping[str, Any]:
    return {
        "messages": [{"role": "assistant", "content": _summary(result)}],
        "data": {"runx": _result_to_dict(result)},
    }


def _to_langchain_response(result: SurfaceRunResult) -> Mapping[str, Any]:
    return {
        "content": _summary(result),
        "additional_kwargs": {"runx": _result_to_dict(result)},
    }


def _to_crewai_response(result: SurfaceRunResult) -> Mapping[str, Any]:
    return {
        "raw": _summary(result),
        "json_dict": {"runx": _result_to_dict(result)},
    }


def _result_to_dict(result: SurfaceRunResult) -> Mapping[str, Any]:
    if isinstance(result, SurfacePausedResult):
        return {
            "status": result.status,
            "skillName": result.skill_name,
            "runId": result.run_id,
            "requests": list(result.requests),
            "stepIds": list(result.step_ids),
            "stepLabels": list(result.step_labels),
            "events": list(result.events),
        }
    if isinstance(result, SurfaceCompletedResult):
        return {
            "status": result.status,
            "skillName": result.skill_name,
            "receiptId": result.receipt_id,
            "output": result.output,
            "events": list(result.events),
        }
    if isinstance(result, SurfaceDeniedResult):
        return {
            "status": result.status,
            "skillName": result.skill_name,
            "reasons": list(result.reasons),
            "receiptId": result.receipt_id,
            "events": list(result.events),
        }
    return {
        "status": result.status,
        "skillName": result.skill_name,
        "error": result.error,
        "receiptId": result.receipt_id,
        "events": list(result.events),
    }


def _nested_str(payload: Mapping[str, Any], key: str) -> str | None:
    value = payload.get(key)
    return None if value is None else str(value)


def _optional_str(value: Any) -> str | None:
    return None if value is None else str(value)
