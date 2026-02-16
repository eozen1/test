import { EventEmitter } from 'events'

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired'
type Priority = 'low' | 'medium' | 'high' | 'critical'

interface ApprovalRequest {
  id: string
  requesterId: string
  amount: number
  priority: Priority
  department: string
  description: string
  status: ApprovalStatus
  createdAt: Date
  expiresAt: Date
  approvalChain: string[]
  currentApproverIndex: number
}

interface ApprovalPolicy {
  maxAutoApproveAmount: number
  escalationThreshold: number
  expirationHours: number
  requiresDualApproval: boolean
  requiredApprovers: number
}

const DEPARTMENT_POLICIES: Record<string, ApprovalPolicy> = {
  engineering: {
    maxAutoApproveAmount: 5000,
    escalationThreshold: 50000,
    expirationHours: 72,
    requiresDualApproval: false,
    requiredApprovers: 1,
  },
  finance: {
    maxAutoApproveAmount: 1000,
    escalationThreshold: 25000,
    expirationHours: 48,
    requiresDualApproval: true,
    requiredApprovers: 2,
  },
  marketing: {
    maxAutoApproveAmount: 2000,
    escalationThreshold: 30000,
    expirationHours: 72,
    requiresDualApproval: false,
    requiredApprovers: 1,
  },
}

export class ApprovalWorkflowEngine extends EventEmitter {
  private requests: Map<string, ApprovalRequest> = new Map()
  private approvalLog: Array<{ requestId: string; action: string; by: string; at: Date }> = []

  async submitRequest(
    requesterId: string,
    amount: number,
    department: string,
    description: string,
    priority: Priority
  ): Promise<ApprovalRequest> {
    const policy = this.getPolicy(department)

    // Step 1: Check if auto-approval is possible
    if (amount <= policy.maxAutoApproveAmount && priority !== 'critical') {
      const request = this.createRequest(requesterId, amount, department, description, priority)
      request.status = 'approved'
      this.requests.set(request.id, request)
      this.logAction(request.id, 'auto_approved', 'system')
      this.emit('approved', request)
      return request
    }

    // Step 2: Determine approval chain based on amount and priority
    const approvalChain = this.buildApprovalChain(amount, department, priority, policy)

    const request = this.createRequest(requesterId, amount, department, description, priority)
    request.approvalChain = approvalChain
    request.status = 'pending'
    this.requests.set(request.id, request)

    // Step 3: Check if immediate escalation is needed
    if (amount >= policy.escalationThreshold || priority === 'critical') {
      await this.escalateRequest(request)
      return request
    }

    // Step 4: Route to first approver
    this.emit('pending_approval', {
      request,
      approver: approvalChain[0],
    })

    return request
  }

  async processApproval(requestId: string, approverId: string, approved: boolean, reason?: string): Promise<void> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Request ${requestId} not found`)
    }

    if (request.status !== 'pending' && request.status !== 'escalated') {
      throw new Error(`Request ${requestId} is not in an approvable state: ${request.status}`)
    }

    // Check expiration
    if (new Date() > request.expiresAt) {
      request.status = 'expired'
      this.logAction(requestId, 'expired', 'system')
      this.emit('expired', request)
      return
    }

    // Verify approver is the current expected approver
    const expectedApprover = request.approvalChain[request.currentApproverIndex]
    if (approverId !== expectedApprover) {
      throw new Error(`Approver ${approverId} is not the current expected approver`)
    }

    if (!approved) {
      // Rejection path
      request.status = 'rejected'
      this.logAction(requestId, `rejected: ${reason ?? 'no reason'}`, approverId)
      this.emit('rejected', { request, reason })
      return
    }

    // Approval path - check if more approvers needed
    this.logAction(requestId, 'approved_step', approverId)
    request.currentApproverIndex++

    const policy = this.getPolicy(request.department)

    if (request.currentApproverIndex < request.approvalChain.length) {
      // More approvals needed in chain
      if (policy.requiresDualApproval && request.currentApproverIndex < policy.requiredApprovers) {
        this.emit('pending_approval', {
          request,
          approver: request.approvalChain[request.currentApproverIndex],
        })
        return
      }

      // Check if we have enough approvals even if chain isn't complete
      if (request.currentApproverIndex >= policy.requiredApprovers) {
        request.status = 'approved'
        this.logAction(requestId, 'fully_approved', approverId)
        this.emit('approved', request)
        return
      }

      // Continue chain
      this.emit('pending_approval', {
        request,
        approver: request.approvalChain[request.currentApproverIndex],
      })
    } else {
      // All approvers in chain have approved
      request.status = 'approved'
      this.logAction(requestId, 'fully_approved', approverId)
      this.emit('approved', request)
    }
  }

  private async escalateRequest(request: ApprovalRequest): Promise<void> {
    request.status = 'escalated'
    this.logAction(request.id, 'escalated', 'system')

    // Escalated requests go directly to VP + CFO
    const escalationChain = ['vp_' + request.department, 'cfo']
    request.approvalChain = escalationChain
    request.currentApproverIndex = 0

    this.emit('escalated', {
      request,
      approver: escalationChain[0],
    })
  }

  private buildApprovalChain(
    amount: number,
    department: string,
    priority: Priority,
    policy: ApprovalPolicy
  ): string[] {
    const chain: string[] = []

    // Manager is always first
    chain.push(`manager_${department}`)

    // Director for amounts above half the escalation threshold
    if (amount > policy.escalationThreshold / 2) {
      chain.push(`director_${department}`)
    }

    // VP for high priority or large amounts
    if (priority === 'high' || amount > policy.escalationThreshold * 0.75) {
      chain.push(`vp_${department}`)
    }

    // Dual approval: add finance reviewer for cross-department visibility
    if (policy.requiresDualApproval) {
      chain.push('finance_reviewer')
    }

    return chain
  }

  private getPolicy(department: string): ApprovalPolicy {
    return DEPARTMENT_POLICIES[department] ?? DEPARTMENT_POLICIES.engineering!
  }

  private createRequest(
    requesterId: string,
    amount: number,
    department: string,
    description: string,
    priority: Priority
  ): ApprovalRequest {
    const policy = this.getPolicy(department)
    return {
      id: crypto.randomUUID(),
      requesterId,
      amount,
      priority,
      department,
      description,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + policy.expirationHours * 60 * 60 * 1000),
      approvalChain: [],
      currentApproverIndex: 0,
    }
  }

  private logAction(requestId: string, action: string, by: string): void {
    this.approvalLog.push({ requestId, action, by, at: new Date() })
  }

  getRequestStatus(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId)
  }

  getAuditTrail(requestId: string) {
    return this.approvalLog.filter(entry => entry.requestId === requestId)
  }
}
