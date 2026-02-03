interface Expense {
  id: string;
  amount: number;
  category: string;
  submitterId: string;
  description: string;
  receipts: string[];
}

interface ApprovalResult {
  approved: boolean;
  approver?: string;
  reason?: string;
  nextStep?: string;
}

export async function processExpenseApproval(expense: Expense): Promise<ApprovalResult> {
  // Step 1: Validate expense data
  if (!expense.description || expense.description.length < 10) {
    return { approved: false, reason: 'Description must be at least 10 characters' };
  }

  if (expense.receipts.length === 0 && expense.amount > 25) {
    return { approved: false, reason: 'Receipt required for expenses over $25' };
  }

  // Step 2: Check expense category rules
  const categoryLimit = getCategoryLimit(expense.category);
  if (expense.amount > categoryLimit.maxAmount) {
    return { 
      approved: false, 
      reason: `Amount exceeds ${expense.category} limit of $${categoryLimit.maxAmount}`,
      nextStep: 'Request exception approval from finance director'
    };
  }

  // Step 3: Determine approval path based on amount
  if (expense.amount <= 100) {
    // Auto-approve small expenses
    await recordApproval(expense.id, 'SYSTEM', 'Auto-approved: under $100');
    return { approved: true, approver: 'SYSTEM' };
  }

  if (expense.amount <= 500) {
    // Manager approval required
    const manager = await getManagerForEmployee(expense.submitterId);
    if (!manager) {
      return { approved: false, reason: 'No manager found for submitter' };
    }
    
    const managerDecision = await requestApproval(expense, manager.id);
    if (managerDecision.approved) {
      await recordApproval(expense.id, manager.id, 'Manager approved');
      return { approved: true, approver: manager.name };
    }
    return { approved: false, reason: managerDecision.reason };
  }

  if (expense.amount <= 5000) {
    // Manager + Director approval required
    const manager = await getManagerForEmployee(expense.submitterId);
    const director = await getDirectorForDepartment(expense.submitterId);
    
    const managerDecision = await requestApproval(expense, manager.id);
    if (!managerDecision.approved) {
      return { approved: false, reason: `Manager denied: ${managerDecision.reason}` };
    }

    const directorDecision = await requestApproval(expense, director.id);
    if (!directorDecision.approved) {
      return { approved: false, reason: `Director denied: ${directorDecision.reason}` };
    }

    await recordApproval(expense.id, director.id, 'Director approved after manager approval');
    return { approved: true, approver: director.name };
  }

  // Over $5000: Requires VP and CFO approval
  const vp = await getVPForDepartment(expense.submitterId);
  const cfo = await getCFO();

  const vpDecision = await requestApproval(expense, vp.id);
  if (!vpDecision.approved) {
    return { approved: false, reason: `VP denied: ${vpDecision.reason}` };
  }

  const cfoDecision = await requestApproval(expense, cfo.id);
  if (!cfoDecision.approved) {
    return { approved: false, reason: `CFO denied: ${cfoDecision.reason}` };
  }

  await recordApproval(expense.id, cfo.id, 'CFO approved after VP approval');
  return { approved: true, approver: cfo.name };
}

// Helper functions (implementations omitted for brevity)
function getCategoryLimit(category: string) { return { maxAmount: 10000 }; }
async function getManagerForEmployee(id: string) { return { id: 'm1', name: 'Manager' }; }
async function getDirectorForDepartment(id: string) { return { id: 'd1', name: 'Director' }; }
async function getVPForDepartment(id: string) { return { id: 'vp1', name: 'VP' }; }
async function getCFO() { return { id: 'cfo1', name: 'CFO' }; }
async function requestApproval(expense: Expense, approverId: string) { return { approved: true }; }
async function recordApproval(expenseId: string, approverId: string, note: string) {}
