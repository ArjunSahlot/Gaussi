from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable

from .pipeline import ConversionPipeline
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
        for job in self.storage.jobs_with_status(["running"]):
            self.storage.update_job(
                job["id"],
                status="queued",
                progress_label="Requeued after API restart",
            )
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
            self.storage.update_job(job_id, status="running", progress_label="Starting conversion")
            self.pipeline.run(job_id)
        except Exception as exc:  # noqa: BLE001 - errors are surfaced as job state.
            self.storage.update_job(
                job_id,
                status="failed",
                error=str(exc),
                progress_label="Conversion failed",
            )


QueueFactory = Callable[[], Awaitable[JobQueue]]
