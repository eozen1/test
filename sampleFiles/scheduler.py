import heapq
import time
import threading
from dataclasses import dataclass, field
from typing import Callable, Any, Optional


@dataclass(order=True)
class ScheduledTask:
    run_at: float
    task_id: str = field(compare=False)
    callback: Callable[[], Any] = field(compare=False)
    interval: Optional[float] = field(default=None, compare=False)
    cancelled: bool = field(default=False, compare=False)


class TaskScheduler:
    """Priority queue-based task scheduler with recurring task support."""

    def __init__(self):
        self._queue: list[ScheduledTask] = []
        self._tasks: dict[str, ScheduledTask] = {}
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._task_counter = 0

    def schedule(self, callback, delay_seconds, task_id=None):
        with self._lock:
            if task_id is None:
                self._task_counter += 1
                task_id = f"task_{self._task_counter}"

            task = ScheduledTask(
                run_at=time.time() + delay_seconds,
                task_id=task_id,
                callback=callback,
            )
            heapq.heappush(self._queue, task)
            self._tasks[task_id] = task
            return task_id

    def schedule_recurring(self, callback, interval_seconds, task_id=None):
        with self._lock:
            if task_id is None:
                self._task_counter += 1
                task_id = f"recurring_{self._task_counter}"

            task = ScheduledTask(
                run_at=time.time() + interval_seconds,
                task_id=task_id,
                callback=callback,
                interval=interval_seconds,
            )
            heapq.heappush(self._queue, task)
            self._tasks[task_id] = task
            return task_id

    def cancel(self, task_id):
        with self._lock:
            if task_id in self._tasks:
                self._tasks[task_id].cancelled = True
                del self._tasks[task_id]
                return True
            return False

    def _run_loop(self):
        while self._running:
            with self._lock:
                now = time.time()
                while self._queue and self._queue[0].run_at <= now:
                    task = heapq.heappop(self._queue)
                    if task.cancelled:
                        continue

                    try:
                        task.callback()
                    except Exception as e:
                        print(f"Task {task.task_id} failed: {e}")

                    if task.interval and not task.cancelled:
                        task.run_at = now + task.interval
                        heapq.heappush(self._queue, task)

            time.sleep(0.01)

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    @property
    def pending_count(self):
        return sum(1 for t in self._queue if not t.cancelled)

    def clear(self):
        with self._lock:
            for task in self._tasks.values():
                task.cancelled = True
            self._tasks.clear()
            self._queue.clear()

    def reschedule(self, task_id, new_delay):
        with self._lock:
            if task_id not in self._tasks:
                return False
            old_task = self._tasks[task_id]
            old_task.cancelled = True

            new_task = ScheduledTask(
                run_at=time.time() + new_delay,
                task_id=task_id,
                callback=old_task.callback,
                interval=old_task.interval,
            )
            heapq.heappush(self._queue, new_task)
            self._tasks[task_id] = new_task
            return True

    def get_next_run_time(self):
        with self._lock:
            for task in sorted(self._queue):
                if not task.cancelled:
                    return task.run_at - time.time()
            return None
