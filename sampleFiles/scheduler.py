import time
import threading
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class ScheduledTask:
    name: str
    callback: Callable
    interval_seconds: float
    next_run: float
    enabled: bool = True
    last_result: Optional[str] = None
    run_count: int = 0
    max_retries: int = 3


class TaskScheduler:
    def __init__(self):
        self.tasks: Dict[str, ScheduledTask] = {}
        self.running = False
        self._lock = threading.Lock()
        self._thread = None

    def add_task(self, name: str, callback: Callable, interval: float, retries: int = 3):
        task = ScheduledTask(
            name=name,
            callback=callback,
            interval_seconds=interval,
            next_run=time.time(),
            max_retries=retries,
        )
        self.tasks[name] = task
        return task

    def remove_task(self, name: str):
        if name in self.tasks:
            del self.tasks[name]

    def pause_task(self, name: str):
        if name in self.tasks:
            self.tasks[name].enabled = False

    def resume_task(self, name: str):
        if name in self.tasks:
            self.tasks[name].enabled = True

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _run_loop(self):
        while self.running:
            now = time.time()
            with self._lock:
                for task in self.tasks.values():
                    if not task.enabled:
                        continue
                    if now >= task.next_run:
                        self._execute_task(task)
                        task.next_run = now + task.interval_seconds
            time.sleep(0.1)

    def _execute_task(self, task: ScheduledTask):
        retries = 0
        while retries <= task.max_retries:
            try:
                result = task.callback()
                task.last_result = str(result)
                task.run_count += 1
                return
            except Exception as e:
                retries += 1
                if retries > task.max_retries:
                    task.last_result = f"FAILED: {e}"
                    task.enabled = False
                time.sleep(0.5)

    def get_stats(self) -> Dict:
        stats = {}
        for name, task in self.tasks.items():
            stats[name] = {
                "run_count": task.run_count,
                "enabled": task.enabled,
                "last_result": task.last_result,
                "next_run": datetime.fromtimestamp(task.next_run).isoformat(),
            }
        return stats


class CronScheduler(TaskScheduler):
    """Extended scheduler with cron-like expressions"""

    def add_cron_task(self, name: str, callback: Callable, cron_expr: str):
        # Simple cron: parse "*/5 * * * *" style
        parts = cron_expr.split()
        if len(parts) != 5:
            raise ValueError("Invalid cron expression")

        minute_part = parts[0]
        if minute_part.startswith("*/"):
            interval = int(minute_part[2:]) * 60
        elif minute_part == "*":
            interval = 60
        else:
            interval = 3600  # default hourly

        return self.add_task(name, callback, interval)

    def bulk_add(self, tasks: List[dict]):
        for t in tasks:
            self.add_cron_task(t["name"], t["callback"], t.get("cron", "*/5 * * * *"))


def run_once(callback: Callable, delay: float = 0):
    def wrapper():
        time.sleep(delay)
        callback()
    t = threading.Thread(target=wrapper)
    t.start()
    return t
