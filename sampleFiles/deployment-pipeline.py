from enum import Enum
from dataclasses import dataclass
from typing import Optional
from datetime import datetime, timedelta


class DeploymentState(Enum):
    PENDING = "pending"
    VALIDATING = "validating"
    VALIDATION_FAILED = "validation_failed"
    BUILDING = "building"
    BUILD_FAILED = "build_failed"
    TESTING = "testing"
    TEST_FAILED = "test_failed"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEPLOYING_CANARY = "deploying_canary"
    CANARY_MONITORING = "canary_monitoring"
    CANARY_FAILED = "canary_failed"
    ROLLING_OUT = "rolling_out"
    ROLLOUT_PAUSED = "rollout_paused"
    DEPLOYED = "deployed"
    ROLLING_BACK = "rolling_back"
    ROLLED_BACK = "rolled_back"
    CANCELLED = "cancelled"


@dataclass
class DeploymentContext:
    deployment_id: str
    service_name: str
    version: str
    environment: str  # staging, production
    commit_sha: str
    author: str
    is_hotfix: bool
    requires_migration: bool
    test_coverage: float
    canary_error_rate: float
    canary_latency_p99: float
    approval_count: int
    max_retries: int
    retry_count: int
    rollout_percentage: float
    previous_version: Optional[str]
    started_at: Optional[datetime] = None


class DeploymentPipeline:
    def __init__(self, ctx: DeploymentContext):
        self.ctx = ctx
        self.state = DeploymentState.PENDING
        self.history: list[tuple[DeploymentState, DeploymentState, str]] = []

    def advance(self) -> DeploymentState:
        prev = self.state

        if self.state == DeploymentState.PENDING:
            self.state = DeploymentState.VALIDATING

        elif self.state == DeploymentState.VALIDATING:
            self.state = self._validate()

        elif self.state == DeploymentState.VALIDATION_FAILED:
            if self.ctx.retry_count < self.ctx.max_retries:
                self.ctx.retry_count += 1
                self.state = DeploymentState.VALIDATING
            else:
                self.state = DeploymentState.CANCELLED

        elif self.state == DeploymentState.BUILDING:
            self.state = self._build()

        elif self.state == DeploymentState.BUILD_FAILED:
            if self.ctx.retry_count < self.ctx.max_retries:
                self.ctx.retry_count += 1
                self.state = DeploymentState.BUILDING
            else:
                self.state = DeploymentState.CANCELLED

        elif self.state == DeploymentState.TESTING:
            self.state = self._run_tests()

        elif self.state == DeploymentState.TEST_FAILED:
            self.state = DeploymentState.CANCELLED

        elif self.state == DeploymentState.AWAITING_APPROVAL:
            self.state = self._check_approval()

        elif self.state == DeploymentState.APPROVED:
            self.state = self._decide_deployment_strategy()

        elif self.state == DeploymentState.REJECTED:
            self.state = DeploymentState.CANCELLED

        elif self.state == DeploymentState.DEPLOYING_CANARY:
            self.state = DeploymentState.CANARY_MONITORING

        elif self.state == DeploymentState.CANARY_MONITORING:
            self.state = self._evaluate_canary()

        elif self.state == DeploymentState.CANARY_FAILED:
            self.state = DeploymentState.ROLLING_BACK

        elif self.state == DeploymentState.ROLLING_OUT:
            self.state = self._check_rollout_progress()

        elif self.state == DeploymentState.ROLLOUT_PAUSED:
            # Manual intervention needed
            pass

        elif self.state == DeploymentState.DEPLOYED:
            # Terminal success state
            pass

        elif self.state == DeploymentState.ROLLING_BACK:
            self.state = DeploymentState.ROLLED_BACK

        elif self.state in (
            DeploymentState.ROLLED_BACK,
            DeploymentState.CANCELLED,
        ):
            # Terminal states
            pass

        if self.state != prev:
            self.history.append((prev, self.state, datetime.utcnow().isoformat()))

        return self.state

    def _validate(self) -> DeploymentState:
        # Check if the service is deployable
        if self.ctx.environment == "production":
            if self.ctx.requires_migration and not self.ctx.is_hotfix:
                # Production migrations need extra validation
                if self.ctx.test_coverage < 0.8:
                    return DeploymentState.VALIDATION_FAILED
            if self.ctx.test_coverage < 0.6:
                return DeploymentState.VALIDATION_FAILED
        elif self.ctx.environment == "staging":
            if self.ctx.test_coverage < 0.4:
                return DeploymentState.VALIDATION_FAILED

        return DeploymentState.BUILDING

    def _build(self) -> DeploymentState:
        # Simulate build — in practice this would be async
        if not self.ctx.commit_sha:
            return DeploymentState.BUILD_FAILED
        return DeploymentState.TESTING

    def _run_tests(self) -> DeploymentState:
        if self.ctx.test_coverage < 0.5 and self.ctx.environment == "production":
            return DeploymentState.TEST_FAILED

        # Hotfixes skip approval for staging
        if self.ctx.is_hotfix and self.ctx.environment == "staging":
            return DeploymentState.APPROVED

        return DeploymentState.AWAITING_APPROVAL

    def _check_approval(self) -> DeploymentState:
        required_approvals = 1
        if self.ctx.environment == "production":
            required_approvals = 2
            if self.ctx.requires_migration:
                required_approvals = 3

        if self.ctx.approval_count >= required_approvals:
            return DeploymentState.APPROVED

        # Auto-reject if waiting more than 24 hours
        if self.ctx.started_at:
            elapsed = datetime.utcnow() - self.ctx.started_at
            if elapsed > timedelta(hours=24):
                return DeploymentState.REJECTED

        return DeploymentState.AWAITING_APPROVAL

    def _decide_deployment_strategy(self) -> DeploymentState:
        if self.ctx.environment == "staging":
            # Staging always does direct rollout
            return DeploymentState.ROLLING_OUT

        if self.ctx.is_hotfix:
            # Hotfixes go straight to rolling out (skip canary)
            return DeploymentState.ROLLING_OUT

        if self.ctx.requires_migration:
            # Services with migrations use canary to verify
            return DeploymentState.DEPLOYING_CANARY

        # Default production: canary first
        return DeploymentState.DEPLOYING_CANARY

    def _evaluate_canary(self) -> DeploymentState:
        error_threshold = 0.01  # 1% error rate
        latency_threshold = 500  # 500ms p99

        if self.ctx.canary_error_rate > error_threshold:
            return DeploymentState.CANARY_FAILED

        if self.ctx.canary_latency_p99 > latency_threshold:
            # High latency but not failing — pause for investigation
            if self.ctx.canary_latency_p99 > latency_threshold * 2:
                return DeploymentState.CANARY_FAILED
            return DeploymentState.ROLLOUT_PAUSED

        return DeploymentState.ROLLING_OUT

    def _check_rollout_progress(self) -> DeploymentState:
        if self.ctx.rollout_percentage >= 100:
            return DeploymentState.DEPLOYED

        # Monitor during rollout
        if self.ctx.canary_error_rate > 0.05:  # 5% during rollout = rollback
            return DeploymentState.ROLLING_BACK

        # Increment rollout
        if self.ctx.rollout_percentage < 25:
            self.ctx.rollout_percentage = 25
        elif self.ctx.rollout_percentage < 50:
            self.ctx.rollout_percentage = 50
        elif self.ctx.rollout_percentage < 100:
            self.ctx.rollout_percentage = 100

        return DeploymentState.ROLLING_OUT

    def cancel(self) -> None:
        cancellable = {
            DeploymentState.PENDING,
            DeploymentState.VALIDATING,
            DeploymentState.VALIDATION_FAILED,
            DeploymentState.BUILDING,
            DeploymentState.BUILD_FAILED,
            DeploymentState.TESTING,
            DeploymentState.AWAITING_APPROVAL,
            DeploymentState.ROLLOUT_PAUSED,
        }
        if self.state not in cancellable:
            raise ValueError(f"Cannot cancel deployment in state: {self.state.value}")

        prev = self.state
        self.state = DeploymentState.CANCELLED
        self.history.append((prev, self.state, datetime.utcnow().isoformat()))

    def force_rollback(self) -> None:
        if self.state in (DeploymentState.CANCELLED, DeploymentState.ROLLED_BACK, DeploymentState.PENDING):
            raise ValueError(f"Cannot rollback from state: {self.state.value}")

        prev = self.state
        self.state = DeploymentState.ROLLING_BACK
        self.history.append((prev, self.state, datetime.utcnow().isoformat()))
