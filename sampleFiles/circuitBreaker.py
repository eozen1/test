import time
from enum import Enum
from typing import Callable, Optional, TypeVar
from dataclasses import dataclass, field

T = TypeVar('T')


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitStats:
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    consecutive_failures: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._half_open_calls = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if self._stats.last_failure_time and \
               time.time() - self._stats.last_failure_time >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
        return self._state

    def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        current_state = self.state

        if current_state == CircuitState.OPEN:
            raise CircuitOpenError(
                f"Circuit is open. Last failure: {self._stats.last_failure_time}"
            )

        if current_state == CircuitState.HALF_OPEN:
            if self._half_open_calls >= self.half_open_max_calls:
                raise CircuitOpenError("Half-open circuit: max probe calls reached")
            self._half_open_calls += 1

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        self._stats.total_calls += 1
        self._stats.successful_calls += 1
        self._stats.consecutive_failures = 0
        self._stats.last_success_time = time.time()

        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.CLOSED

    def _on_failure(self):
        self._stats.total_calls += 1
        self._stats.failed_calls += 1
        self._stats.consecutive_failures += 1
        self._stats.last_failure_time = time.time()

        if self._stats.consecutive_failures >= self.failure_threshold:
            self._state = CircuitState.OPEN

    def reset(self):
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._half_open_calls = 0

    @property
    def stats(self) -> dict:
        return {
            "state": self.state.value,
            "total": self._stats.total_calls,
            "success": self._stats.successful_calls,
            "failure": self._stats.failed_calls,
            "consecutive_failures": self._stats.consecutive_failures,
        }


class CircuitOpenError(Exception):
    pass


class RetryWithBackoff:
    def __init__(self, max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 60.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay

    def execute(self, func: Callable[..., T], *args, **kwargs) -> T:
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries:
                    delay = min(self.base_delay * (2 ** attempt), self.max_delay)
                    time.sleep(delay)
        raise last_exception


class BulkheadPattern:
    """Limits concurrent access to a resource."""

    def __init__(self, max_concurrent: int = 10, max_queue: int = 50):
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self._active = 0
        self._queued = 0

    def acquire(self) -> bool:
        if self._active < self.max_concurrent:
            self._active += 1
            return True
        if self._queued < self.max_queue:
            self._queued += 1
            return True
        return False

    def release(self):
        if self._queued > 0:
            self._queued -= 1
        else:
            self._active = max(0, self._active - 1)

    @property
    def stats(self) -> dict:
        return {
            "active": self._active,
            "queued": self._queued,
            "available": self.max_concurrent - self._active,
        }
