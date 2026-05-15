from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable

from .pipeline import ConversionPipeline, PipelineCanceled
from .storage import Storage


class JobQueue:
    def __init__(self, storage: Storage, pipeline: ConversionPipeline, workers: int = 1) -> None:
        self.storage = storage
        self.pipeline = pipeline
        self.workers = max(1, workers)
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._tasks: list[asyncio.Task[None]] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for job in self.storage.jobs_with_status(["running", "canceling"]):
            self.storage.update_job(
                job["id"],
                status="queued",
                cancel_requested=0,
                active_process_pid=None,
                progress_label="Requeued after API restart",
            )
            self.storage.record_event(job["id"], "warning", "Job requeued after API restart")
        for job in self.storage.jobs_with_status(["queued"]):
            await self.enqueue(job["id"])
        self._tasks = [asyncio.create_task(self._worker(index)) for index in range(self.workers)]

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def enqueue(self, job_id: str) -> None:
        await self._queue.put(job_id)

    def cancel(self, job_id: str) -> dict:
        return self.pipeline.request_cancel(job_id)

    async def retry(self, job_id: str) -> dict:
        job = self.storage.reset_job_for_retry(job_id)
        await self.enqueue(job_id)
        return job

    async def _worker(self, index: int) -> None:
        del index
        while self._running:
            job_id = await self._queue.get()
            try:
                await asyncio.to_thread(self._run_job, job_id)
            finally:
                self._queue.task_done()

    def _run_job(self, job_id: str) -> None:
        try:
            job = self.storage.get_job(job_id)
            if job is None or job["status"] == "canceled" or job["cancel_requested"]:
                return
            self.storage.update_job(job_id, status="running", progress_label="Starting conversion")
            self.pipeline.run(job_id)
        except PipelineCanceled as exc:
            self.storage.record_event(job_id, "warning", str(exc))
            self.storage.update_job(
                job_id,
                status="canceled",
                error=None,
                active_process_pid=None,
                progress_label="Canceled",
                finished_at=self.pipeline.storage_now(),
                last_heartbeat_at=self.pipeline.storage_now(),
            )
        except Exception as exc:  # noqa: BLE001 - errors are surfaced as job state.
            job = self.storage.get_job(job_id)
            if job and job["cancel_requested"]:
                self.storage.record_event(job_id, "warning", "Canceled while process was stopping")
                self.storage.update_job(
                    job_id,
                    status="canceled",
                    error=None,
                    active_process_pid=None,
                    progress_label="Canceled",
                    finished_at=self.pipeline.storage_now(),
                    last_heartbeat_at=self.pipeline.storage_now(),
                )
                return
            self.storage.record_event(job_id, "error", str(exc))
            self.storage.update_job(
                job_id,
                status="failed",
                error=str(exc),
                active_process_pid=None,
                progress_label="Conversion failed",
                finished_at=self.pipeline.storage_now(),
                last_heartbeat_at=self.pipeline.storage_now(),
            )


QueueFactory = Callable[[], Awaitable[JobQueue]]
